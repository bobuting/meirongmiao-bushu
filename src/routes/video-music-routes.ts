import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import type { User } from "../contracts/types.js";
import { resolveVideoMusicConfig } from "../modules/video-music/video-music-config.js";
import {
  analyzeVideoMusicAtmospheres,
  createVideoMusicEntry,
  deleteVideoMusicEntry,
  getVideoMusicById,
  listVideoMusics,
  matchVideoMusicByScript,
  saveUploadedVideoMusic,
  syncVideoMusicLibrary,
  updateVideoMusicEntry,
} from "../modules/video-music/video-music-service.js";

interface VideoMusicRouteDependencies {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
  requireAdmin: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

export interface VideoMusicRouteHandlers extends VideoMusicRouteDependencies {}

function readMultipartFieldValue(field: unknown): string | null {
  if (!field) {
    return null;
  }
  if (Array.isArray(field)) {
    return readMultipartFieldValue(field[0]);
  }
  if (typeof field === "object" && "value" in field) {
    const value = (field as { value?: unknown }).value;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function resolveContentType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".flac") return "audio/flac";
  return "application/octet-stream";
}

export function registerVideoMusicRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  dependencies: VideoMusicRouteDependencies,
): void {
  /** 构造视频音乐模块公共依赖 */
  const videoMusicDeps = () => ({
    videoMusics: ctx.repos.videoMusics,
    clock: ctx.clock,
    config: ctx.configService.get(),
  });

  app.get("/video-music", async (request) => {
    await dependencies.requireUser(ctx, request);
    const config = resolveVideoMusicConfig(ctx.configService.get());
    if (!config.enabled) {
      return { enabled: false, items: [] };
    }
    const query = request.query as { search?: string; atmosphere?: string } | undefined;
    return {
      enabled: true,
      items: await listVideoMusics(ctx.repos.videoMusics, {
        search: query?.search ?? null,
        atmosphere: query?.atmosphere ?? null,
      }),
    };
  });

  app.get("/video-music/:musicId", async (request) => {
    await dependencies.requireUser(ctx, request);
    const config = resolveVideoMusicConfig(ctx.configService.get());
    if (!config.enabled) {
      throw new AppError(503, "VIDEO_MUSIC_DISABLED", "音乐功能未启用");
    }
    const params = request.params as { musicId: string };
    const music = await getVideoMusicById(ctx.repos.videoMusics, params.musicId);
    if (!music) {
      throw new AppError(404, "VIDEO_MUSIC_NOT_FOUND", "音乐不存在");
    }
    return music;
  });

  app.post("/video-music/match-by-script", async (request) => {
    await dependencies.requireUser(ctx, request);
    const config = resolveVideoMusicConfig(ctx.configService.get());
    if (!config.enabled) {
      throw new AppError(503, "VIDEO_MUSIC_DISABLED", "音乐功能未启用");
    }
    const body = (request.body as { projectId?: string } | undefined) ?? {};
    const projectId = String(body.projectId ?? "").trim();
    if (!projectId) {
      throw new AppError(400, "VIDEO_MUSIC_PROJECT_REQUIRED", "请先提供项目 ID");
    }

    // 从 DB 读取 shot_prompts 提取风格信息
    const { getShotPromptsService } = await import("../services/shot-prompts-service.js");
    const { SHOT_PROMPTS_TYPE } = await import("../contracts/shot-prompts-contract.js");
    const { parseEmotionToneFromText } = await import("../contant-config/style-atmosphere-dict.js");
    type EmotionToneCategory = import("../contant-config/style-atmosphere-dict.js").EmotionToneCategory;
    const shotPromptsService = getShotPromptsService(ctx);
    const shotPrompts = await shotPromptsService.getActive(projectId, SHOT_PROMPTS_TYPE.ORIGIN);

    // 从 emotional_arc 提取情绪基调并转换为统一字典类型
    const emotions: EmotionToneCategory[] = [];
    if (shotPrompts?.emotionalArc) {
      if (shotPrompts.emotionalArc.description?.trim()) {
        const parsed = parseEmotionToneFromText(shotPrompts.emotionalArc.description.trim());
        if (parsed) emotions.push(parsed);
      }
      if (shotPrompts.emotionalArc.shot_mapping) {
        for (const mapping of shotPrompts.emotionalArc.shot_mapping) {
          if (mapping.emotion?.trim()) {
            const parsed = parseEmotionToneFromText(mapping.emotion.trim());
            if (parsed) emotions.push(parsed);
          }
        }
      }
    }

    // 从 shots 提取脚本文本作为辅助
    const scriptText = shotPrompts?.shots
      ? shotPrompts.shots
          .flatMap((s) => [
            s.keyframe_prompt?.prompt?.trim() ?? "",
            s.video_prompt?.prompt?.trim() ?? "",
          ])
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("\n")
      : "";

    return matchVideoMusicByScript(videoMusicDeps(), scriptText, emotions.length > 0 ? [...new Set(emotions)] : undefined, ctx.storage, ctx.configService.get().ossPublicBaseUrl);
  });

  app.post("/video-music/sync", async (request) => {
    await dependencies.requireAdmin(ctx, request);
    const result = await syncVideoMusicLibrary(videoMusicDeps(), ctx.storage, ctx.configService.get().ossPublicBaseUrl);
    return {
      success: true,
      added: result.added.length,
      skipped: result.skipped,
      failed: result.failed,
      items: await listVideoMusics(ctx.repos.videoMusics),
    };
  });

  app.post("/video-music/upload", async (request) => {
    const user = await dependencies.requireUser(ctx, request);
    const config = resolveVideoMusicConfig(ctx.configService.get());
    if (!config.enabled) {
      throw new AppError(503, "VIDEO_MUSIC_DISABLED", "音乐功能未启用");
    }
    const file = await request.file();
    if (!file) {
      throw new AppError(400, "VIDEO_MUSIC_FILE_REQUIRED", "请先上传音频文件");
    }
    const bytes = new Uint8Array(await file.toBuffer());
    const music = await saveUploadedVideoMusic(
      videoMusicDeps(),
      {
        fileName: file.filename,
        bytes,
        title: readMultipartFieldValue(file.fields.title)?.trim() || null,
        artist: readMultipartFieldValue(file.fields.artist)?.trim() || null,
        album: readMultipartFieldValue(file.fields.album)?.trim() || null,
        creatorId: user.id,
      },
      ctx.storage,
      ctx.configService.get().ossPublicBaseUrl,
    );
    return music;
  });

  app.post("/video-music/analyze-atmosphere", async (request) => {
    await dependencies.requireUser(ctx, request);
    const body = (request.body as { musicIds?: string[] } | undefined) ?? {};
    const result = await analyzeVideoMusicAtmospheres(videoMusicDeps(), Array.isArray(body.musicIds) ? body.musicIds : undefined);
    return result;
  });

  app.post("/video-music", async (request) => {
    const user = await dependencies.requireUser(ctx, request);
    const config = resolveVideoMusicConfig(ctx.configService.get());
    if (!config.enabled) {
      throw new AppError(503, "VIDEO_MUSIC_DISABLED", "音乐功能未启用");
    }
    const body =
      (request.body as {
        title?: string;
        musicUrl?: string;
        atmospheres?: string[];
        localPath?: string | null;
        sourceUrl?: string | null;
        artist?: string | null;
        album?: string | null;
        coverUrl?: string | null;
      } | undefined) ?? {};
    const created = await createVideoMusicEntry(videoMusicDeps(), {
      title: String(body.title ?? ""),
      musicUrl: String(body.musicUrl ?? ""),
      atmospheres: Array.isArray(body.atmospheres) ? body.atmospheres : [],
      localPath: body.localPath ?? null,
      sourceUrl: body.sourceUrl ?? null,
      artist: body.artist ?? null,
      album: body.album ?? null,
      coverUrl: body.coverUrl ?? null,
      creatorId: user.id,
    });
    return created;
  });

  app.patch("/video-music/:musicId", async (request) => {
    await dependencies.requireUser(ctx, request);
    const params = request.params as { musicId: string };
    const body =
      (request.body as {
        title?: string;
        musicUrl?: string;
        atmospheres?: string[];
        sourceUrl?: string | null;
        artist?: string | null;
        album?: string | null;
        coverUrl?: string | null;
        durationSec?: number | null;
      } | undefined) ?? {};
    const updated = await updateVideoMusicEntry(videoMusicDeps(), params.musicId, {
      title: body.title,
      musicUrl: body.musicUrl,
      atmospheres: body.atmospheres,
      sourceUrl: body.sourceUrl ?? undefined,
      artist: body.artist ?? undefined,
      album: body.album ?? undefined,
      coverUrl: body.coverUrl ?? undefined,
      durationSec: body.durationSec ?? undefined,
    });
    return updated;
  });

  app.delete("/video-music/:musicId", async (request) => {
    await dependencies.requireUser(ctx, request);
    const params = request.params as { musicId: string };
    const removed = await deleteVideoMusicEntry(ctx.repos.videoMusics, params.musicId);
    return {
      success: true,
      removedId: removed.id,
    };
  });
}

/**
 * 注册视频音乐静态文件访问路由（不放在 API prefix 下）
 * 路由路径：${publicBaseUrl}/:fileName（默认 /video-music/:fileName）
 */
export function registerVideoMusicFileRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const publicBaseUrl = resolveVideoMusicConfig(ctx.configService.get()).publicBaseUrl;
  app.get(`${publicBaseUrl}/:fileName`, async (request, reply) => {
    const params = request.params as { fileName: string };
    const config = resolveVideoMusicConfig(ctx.configService.get());
    const absoluteDir = resolve(config.storageDir);
    const filePath = resolve(join(absoluteDir, params.fileName));
    if (!filePath.startsWith(absoluteDir) || !existsSync(filePath)) {
      return reply.code(404).send({ message: "Music file not found" });
    }
    const bytes = await readFile(filePath);
    reply.header("Content-Type", resolveContentType(filePath));
    reply.header("Cache-Control", "public, max-age=31536000");
    return reply.send(bytes);
  });
}
