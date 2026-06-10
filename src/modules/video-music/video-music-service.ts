import { basename, extname, join } from "node:path";
import type { IVideoMusicRepository } from "../../contracts/repository-ports/system-repository.js";
import type { IRepositoryClock } from "../../contracts/repository-ports/common.js";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type { AppConfig, VideoMusic } from "../../contracts/types.js";
import { AppError } from "../../core/errors.js";
import type { EmotionToneCategory, MusicAtmosphereCategory } from "../../contant-config/style-atmosphere-dict.js";
import { EMOTION_TO_MUSIC_MAP } from "../../contant-config/style-atmosphere-dict.js";
import {
  downloadAndUploadVideoMusic,
  ensureWaveToneFile,
  uploadVideoMusicToStorage,
  uploadWaveToneToStorage,
  writeVideoMusicFile,
} from "./video-music-downloader.js";
import { resolveVideoMusicConfig } from "./video-music-config.js";
import { analyzeMusicMetadataAtmospheres } from "./video-music-service-atmospheres.js";

/** 视频音乐模块公共依赖 */
interface VideoMusicDeps {
  videoMusics: IVideoMusicRepository;
  clock: IRepositoryClock;
  config: Pick<
    AppConfig,
    | "videoMusicEnabled"
    | "videoMusicAllowedAtmospheres"
    | "videoMusicDefaultAtmospheres"
    | "videoMusicPathPrefix"
    | "videoMusicPublicBaseUrl"
    | "videoMusicVisitUrl"
    | "audioDownloadTimeoutMs"
  >;
}

interface DefaultVideoMusicSeed {
  id: string;
  title: string;
  atmospheres: MusicAtmosphereCategory[];
  frequencyHz: number;
  durationSec: number;
}

const DEFAULT_VIDEO_MUSIC_SEEDS: readonly DefaultVideoMusicSeed[] = [
  { id: "music-sunrise", title: "晨光起片", atmospheres: ["阳光", "轻松"] as MusicAtmosphereCategory[], frequencyHz: 392, durationSec: 24 },
  { id: "music-gentle", title: "温柔叙事", atmospheres: ["抒情"] as MusicAtmosphereCategory[], frequencyHz: 330, durationSec: 20 },
  { id: "music-upbeat", title: "活力节奏", atmospheres: ["动感"] as MusicAtmosphereCategory[], frequencyHz: 440, durationSec: 18 },
];

interface RemoteVideoMusicApiItem {
  id?: string | number;
  title?: string | null;
  album?: string | null;
  artist?: string | null;
  cover?: string | null;
  coverUrl?: string | null;
  url?: string | null;
  music_url?: string | null;
  musicUrl?: string | null;
  duration?: number | null;
}

export interface VideoMusicSyncResult {
  added: VideoMusic[];
  skipped: number;
  failed: Array<{ title: string; reason: string }>;
}

export interface VideoMusicAtmosphereAnalysisResult {
  success: boolean;
  results: Array<{ id: string; atmospheres: string[] }>;
}

export const ALLOWED_ATMOSPHERES = ["欢快", "阳光", "动感", "浪漫", "轻松", "空灵", "抒情", "宁静", "古风", "悲壮"] as const;

export interface ListVideoMusicQuery {
  search?: string | null;
  atmosphere?: string | null;
}

export interface MatchVideoMusicResult {
  success: boolean;
  music: VideoMusic | null;
  candidates: VideoMusic[];
  matchedAtmosphere: string | null;
  candidateAtmospheres: string[];
  usedDefault: boolean;
  error?: string;
}

function normalizeSearch(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function buildMusicPublicUrl(publicBaseUrl: string, fileName: string): string {
  return `${publicBaseUrl}/${encodeURIComponent(fileName)}`;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}

function resolveAudioExtension(fileNameOrUrl: string, fallback = ".mp3"): string {
  const extension = extname(String(fileNameOrUrl ?? "").split("?")[0] ?? "").toLowerCase();
  return [".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(extension) ? extension : fallback;
}

function extractRemoteMusicItems(payload: unknown): RemoteVideoMusicApiItem[] {
  if (Array.isArray(payload)) {
    return payload as RemoteVideoMusicApiItem[];
  }
  if (payload && typeof payload === "object") {
    const record = payload as { data?: unknown };
    if (Array.isArray(record.data)) {
      return record.data as RemoteVideoMusicApiItem[];
    }
  }
  return [];
}

async function findVideoMusicByTitle(videoMusics: IVideoMusicRepository, title: string): Promise<VideoMusic | null> {
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedTitle) {
    return null;
  }
  const all = await videoMusics.list();
  return all.find((item) => item.title.trim().toLowerCase() === normalizedTitle) ?? null;
}

function buildMetadataAtmosphereText(music: Pick<VideoMusic, "title" | "artist" | "album">): string {
  return [music.title, music.artist ?? "", music.album ?? ""].join(" ").trim();
}

/**
 * 确保默认音乐库已初始化
 * 如果配置了 OSS 存储，则上传到 OSS；否则保存到本地磁盘
 * @param deps 模块依赖（videoMusics 仓库、clock、config）
 * @param storage OSS 存储适配器（可选）
 * @param publicBaseUrl OSS 公开访问基础 URL（可选）
 * @returns 新创建的音乐数量
 */
export async function ensureDefaultVideoMusicLibrary(
  deps: VideoMusicDeps,
  storage?: IObjectStorageAdapter | null,
  publicBaseUrl?: string,
): Promise<number> {
  const config = resolveVideoMusicConfig(deps.config);
  if (!config.enabled) {
    return 0;
  }
  let createdCount = 0;
  for (const seed of DEFAULT_VIDEO_MUSIC_SEEDS) {
    const existing = await deps.videoMusics.findById(seed.id);
    if (existing) {
      continue;
    }
    const fileName = `${seed.id}.wav`;
    const ossKey = `video-music/${fileName}`;
    let musicUrl: string;
    let localPath: string | null = null;

    // 优先使用 OSS 存储
    if (storage) {
      const result = await uploadWaveToneToStorage(
        storage,
        ossKey,
        { durationSec: seed.durationSec, frequencyHz: seed.frequencyHz },
        publicBaseUrl,
      );
      musicUrl = result.url;
      // localPath 存储 OSS key，便于后续管理
      localPath = ossKey;
    } else {
      // 降级到本地磁盘
      localPath = join(config.storageDir, fileName);
      await ensureWaveToneFile(localPath, {
        durationSec: seed.durationSec,
        frequencyHz: seed.frequencyHz,
      });
      musicUrl = buildMusicPublicUrl(config.publicBaseUrl, fileName);
    }

    const now = deps.clock.now();
    await deps.videoMusics.upsert({
      id: seed.id,
      title: seed.title,
      musicUrl,
      localPath,
      sourceUrl: null,
      atmospheres: [...seed.atmospheres],
      durationSec: seed.durationSec,
      artist: "内容喵AI",
      album: "系统音乐库",
      coverUrl: null,
      creatorId: null,
      createdAt: now,
      updatedAt: now,
    });
    createdCount += 1;
  }
  return createdCount;
}

export async function listVideoMusics(videoMusics: IVideoMusicRepository, query: ListVideoMusicQuery = {}): Promise<VideoMusic[]> {
  const search = normalizeSearch(query.search);
  const atmosphere = String(query.atmosphere ?? "").trim();
  const all = await videoMusics.list();
  return all
    .filter((item) => {
      if (
        search &&
        !`${item.title} ${item.artist ?? ""} ${item.album ?? ""} ${(item.atmospheres ?? []).join(" ")}`
          .toLowerCase()
          .includes(search)
      ) {
        return false;
      }
      if (atmosphere && !item.atmospheres.includes(atmosphere)) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getVideoMusicById(videoMusics: IVideoMusicRepository, musicId: string): Promise<VideoMusic | null> {
  return videoMusics.findById(musicId);
}

export async function createVideoMusicEntry(
  deps: VideoMusicDeps,
  input: {
    title: string;
    musicUrl: string;
    atmospheres?: string[];
    localPath?: string | null;
    sourceUrl?: string | null;
    durationSec?: number | null;
    artist?: string | null;
    album?: string | null;
    coverUrl?: string | null;
    creatorId?: string | null;
  },
): Promise<VideoMusic> {
  const normalizedTitle = input.title.trim();
  if (!normalizedTitle) {
    throw new AppError(400, "VIDEO_MUSIC_TITLE_REQUIRED", "音乐标题不能为空");
  }
  const normalizedMusicUrl = input.musicUrl.trim();
  if (!normalizedMusicUrl) {
    throw new AppError(400, "VIDEO_MUSIC_URL_REQUIRED", "音乐地址不能为空");
  }
  const duplicate = await findVideoMusicByTitle(deps.videoMusics, normalizedTitle);
  if (duplicate) {
    throw new AppError(409, "VIDEO_MUSIC_DUPLICATE", `音乐已存在：${normalizedTitle}`);
  }
  const now = deps.clock.now();
  const music: VideoMusic = {
    id: deps.clock.generateId(),
    title: normalizedTitle,
    musicUrl: normalizedMusicUrl,
    localPath: input.localPath ?? null,
    sourceUrl: input.sourceUrl ?? null,
    atmospheres: uniqueNonEmpty(input.atmospheres ?? []),
    durationSec: typeof input.durationSec === "number" ? input.durationSec : null,
    artist: input.artist?.trim() || null,
    album: input.album?.trim() || null,
    coverUrl: input.coverUrl?.trim() || null,
    creatorId: input.creatorId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.videoMusics.upsert(music);
  return music;
}

export async function updateVideoMusicEntry(
  deps: VideoMusicDeps,
  musicId: string,
  patch: Partial<Pick<VideoMusic, "title" | "artist" | "album" | "coverUrl" | "sourceUrl" | "musicUrl" | "durationSec">> & {
    atmospheres?: string[];
  },
): Promise<VideoMusic> {
  const existing = await getVideoMusicById(deps.videoMusics, musicId);
  if (!existing) {
    throw new AppError(404, "VIDEO_MUSIC_NOT_FOUND", "音乐不存在");
  }
  const nextTitle = patch.title !== undefined ? patch.title.trim() : existing.title;
  if (!nextTitle) {
    throw new AppError(400, "VIDEO_MUSIC_TITLE_REQUIRED", "音乐标题不能为空");
  }
  const duplicate = await findVideoMusicByTitle(deps.videoMusics, nextTitle);
  if (duplicate && duplicate.id !== existing.id) {
    throw new AppError(409, "VIDEO_MUSIC_DUPLICATE", `音乐已存在：${nextTitle}`);
  }
  const nextMusicUrl = patch.musicUrl !== undefined ? patch.musicUrl.trim() : existing.musicUrl;
  if (!nextMusicUrl) {
    throw new AppError(400, "VIDEO_MUSIC_URL_REQUIRED", "音乐地址不能为空");
  }
  const updated: VideoMusic = {
    ...existing,
    title: nextTitle,
    musicUrl: nextMusicUrl,
    artist: patch.artist !== undefined ? patch.artist?.trim() || null : existing.artist,
    album: patch.album !== undefined ? patch.album?.trim() || null : existing.album,
    coverUrl: patch.coverUrl !== undefined ? patch.coverUrl?.trim() || null : existing.coverUrl,
    sourceUrl: patch.sourceUrl !== undefined ? patch.sourceUrl?.trim() || null : existing.sourceUrl,
    durationSec: patch.durationSec !== undefined ? patch.durationSec ?? null : existing.durationSec,
    atmospheres: patch.atmospheres ? uniqueNonEmpty(patch.atmospheres) : existing.atmospheres,
    updatedAt: deps.clock.now(),
  };
  await deps.videoMusics.upsert(updated);
  return updated;
}

export async function deleteVideoMusicEntry(videoMusics: IVideoMusicRepository, musicId: string): Promise<VideoMusic> {
  const existing = await getVideoMusicById(videoMusics, musicId);
  if (!existing) {
    throw new AppError(404, "VIDEO_MUSIC_NOT_FOUND", "音乐不存在");
  }
  await videoMusics.delete(musicId);
  return existing;
}

/**
 * 保存用户上传的音乐
 * 如果配置了 OSS 存储，则上传到 OSS；否则保存到本地磁盘
 */
export async function saveUploadedVideoMusic(
  deps: VideoMusicDeps,
  input: {
    fileName: string;
    bytes: Uint8Array;
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    creatorId?: string | null;
  },
  storage?: IObjectStorageAdapter | null,
  publicBaseUrl?: string,
): Promise<VideoMusic> {
  const config = resolveVideoMusicConfig(deps.config);
  const originalFileName = input.fileName.trim() || "music-upload.mp3";
  const extension = resolveAudioExtension(originalFileName, ".mp3");
  const safeBaseName = sanitizeFileName(input.title?.trim() || basename(originalFileName, extension) || deps.clock.generateId());
  const fileName = `${safeBaseName}-${Date.now()}${extension}`;
  const ossKey = `video-music/${fileName}`;
  let musicUrl: string;
  let localPath: string | null = null;

  // 优先使用 OSS 存储
  if (storage) {
    const contentType = extension === ".wav" ? "audio/wav" : "audio/mpeg";
    const result = await uploadVideoMusicToStorage(storage, ossKey, input.bytes, contentType, publicBaseUrl);
    musicUrl = result.url;
    localPath = ossKey;
  } else {
    // 降级到本地磁盘
    localPath = join(config.storageDir, fileName);
    await writeVideoMusicFile(localPath, input.bytes);
    musicUrl = buildMusicPublicUrl(config.publicBaseUrl, fileName);
  }

  const draftAtmospheres = analyzeMusicMetadataAtmospheres(
    [input.title ?? safeBaseName, input.artist ?? "", input.album ?? ""].join(" "),
    config.allowedAtmospheres,
    config.defaultAtmospheres,
  );
  return createVideoMusicEntry(deps, {
    title: input.title?.trim() || basename(originalFileName, extension) || safeBaseName,
    artist: input.artist ?? null,
    album: input.album ?? null,
    creatorId: input.creatorId ?? null,
    localPath,
    musicUrl,
    atmospheres: draftAtmospheres,
    sourceUrl: null,
  });
}

/**
 * 从远程 URL 同步音乐库
 * 如果配置了 OSS 存储，则下载后上传到 OSS；否则保存到本地磁盘
 */
export async function syncVideoMusicLibrary(
  deps: VideoMusicDeps,
  storage?: IObjectStorageAdapter | null,
  publicBaseUrl?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VideoMusicSyncResult> {
  const config = resolveVideoMusicConfig(deps.config);
  const visitUrl = config.visitUrl.trim();
  if (!visitUrl) {
    throw new AppError(400, "VIDEO_MUSIC_SYNC_URL_MISSING", "请先在系统参数里配置上游音乐同步地址");
  }
  const response = await fetchImpl(visitUrl);
  if (!response.ok) {
    throw new AppError(502, "VIDEO_MUSIC_SYNC_FETCH_FAILED", `音乐同步失败：HTTP ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const items = extractRemoteMusicItems(payload);
  if (items.length < 1) {
    return { added: [], skipped: 0, failed: [] };
  }
  const added: VideoMusic[] = [];
  let skipped = 0;
  const failed: Array<{ title: string; reason: string }> = [];
  for (const item of items) {
    const title = String(item.title ?? "").trim();
    const sourceUrl = String(item.musicUrl ?? item.music_url ?? item.url ?? "").trim();
    if (!title || !sourceUrl) {
      skipped += 1;
      continue;
    }
    if (await findVideoMusicByTitle(deps.videoMusics, title)) {
      skipped += 1;
      continue;
    }
    try {
      const extension = resolveAudioExtension(sourceUrl, ".mp3");
      const fileName = `${sanitizeFileName(title)}-${Date.now()}${extension}`;
      const ossKey = `video-music/${fileName}`;
      let musicUrl: string;
      let localPath: string | null = null;

      // 必须使用 OSS 存储，否则报错
      if (!storage) {
        throw new AppError(500, "STORAGE_NOT_INITIALIZED", "对象存储未初始化，无法下载音乐文件");
      }
      const result = await downloadAndUploadVideoMusic(sourceUrl, storage, ossKey, publicBaseUrl, fetchImpl, deps.config.audioDownloadTimeoutMs);
      musicUrl = result.url;
      localPath = ossKey;

      const atmospheres = analyzeMusicMetadataAtmospheres(
        [title, item.artist ?? "", item.album ?? ""].join(" "),
        config.allowedAtmospheres,
        config.defaultAtmospheres,
      );
      added.push(
        await createVideoMusicEntry(deps, {
          title,
          artist: String(item.artist ?? "").trim() || null,
          album: String(item.album ?? "").trim() || null,
          coverUrl: String(item.coverUrl ?? item.cover ?? "").trim() || null,
          sourceUrl,
          localPath,
          durationSec: typeof item.duration === "number" ? item.duration : null,
          musicUrl,
          atmospheres,
        }),
      );
    } catch (error) {
      failed.push({
        title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { added, skipped, failed };
}

export async function analyzeVideoMusicAtmospheres(
  deps: VideoMusicDeps,
  musicIds?: string[],
): Promise<VideoMusicAtmosphereAnalysisResult> {
  const config = resolveVideoMusicConfig(deps.config);
  const targetIds = Array.isArray(musicIds) && musicIds.length > 0 ? new Set(musicIds) : null;
  const results: Array<{ id: string; atmospheres: string[] }> = [];
  const allMusics = await deps.videoMusics.list();
  for (const music of allMusics) {
    if (targetIds && !targetIds.has(music.id)) {
      continue;
    }
    const atmospheres = analyzeMusicMetadataAtmospheres(
      buildMetadataAtmosphereText(music),
      config.allowedAtmospheres,
      config.defaultAtmospheres,
    );
    music.atmospheres = atmospheres;
    music.updatedAt = deps.clock.now();
    await deps.videoMusics.upsert(music);
    results.push({
      id: music.id,
      atmospheres,
    });
  }
  return {
    success: true,
    results,
  };
}

const MATCH_CANDIDATE_MAX_COUNT = 3;

/**
 * 将情绪基调直接映射到音乐氛围（使用统一字典 EMOTION_TO_MUSIC_MAP）
 * 消除启发式判断
 *
 * @param emotions 情绪基调列表（统一字典类型）
 * @param allowedAtmospheres 允许的音乐氛围列表
 * @returns 映射后的音乐氛围列表
 */
function mapEmotionToMusicAtmosphereDirect(
  emotions: EmotionToneCategory[],
  allowedAtmospheres: readonly MusicAtmosphereCategory[],
): MusicAtmosphereCategory[] {
  const result: MusicAtmosphereCategory[] = [];
  for (const emotion of emotions) {
    // 使用统一字典映射规则
    const mapped = EMOTION_TO_MUSIC_MAP[emotion];
    if (mapped && allowedAtmospheres.includes(mapped)) {
      result.push(mapped);
    }
  }
  return [...new Set(result)] as MusicAtmosphereCategory[];
}

/**
 * Fisher-Yates 洗牌算法
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 根据脚本情绪基调匹配合适的音乐
 * 使用统一字典映射规则，消除启发式判断
 *
 * @param deps 模块依赖（videoMusics 仓库、clock、config）
 * @param scriptText 脚本文本（用于辅助分析，不使用启发式判断）
 * @param emotions 可选的情绪基调列表（优先匹配，使用统一字典 EmotionToneCategory）
 * @param storage OSS 存储适配器（可选）
 * @param publicBaseUrl OSS 公开访问基础 URL（可选）
 */
export async function matchVideoMusicByScript(
  deps: VideoMusicDeps,
  scriptText: string,
  emotions?: EmotionToneCategory[],
  storage?: IObjectStorageAdapter | null,
  publicBaseUrl?: string,
): Promise<MatchVideoMusicResult> {
  const config = resolveVideoMusicConfig(deps.config);
  if (!config.enabled) {
    return {
      success: false,
      music: null,
      candidates: [],
      matchedAtmosphere: null,
      candidateAtmospheres: [],
      usedDefault: false,
      error: "音乐功能未启用",
    };
  }
  const allMusics = await deps.videoMusics.list();
  if (allMusics.length < 1) {
    return {
      success: false,
      music: null,
      candidates: [],
      matchedAtmosphere: null,
      candidateAtmospheres: [],
      usedDefault: false,
      error: "音乐库为空",
    };
  }

  // 计算候选氛围（使用统一字典映射）
  let candidateAtmospheres: MusicAtmosphereCategory[];
  let usedDefault: boolean;

  // 优先使用 emotions 参数（统一字典类型）
  if (emotions && emotions.length > 0) {
    candidateAtmospheres = mapEmotionToMusicAtmosphereDirect(emotions, config.allowedAtmospheres);
    usedDefault = candidateAtmospheres.length === 0;
  } else {
    // 没有 emotions 参数，使用默认氛围（不使用启发式文本分析）
    candidateAtmospheres = [...config.defaultAtmospheres];
    usedDefault = true;
  }

  // 收集所有匹配氛围的音乐
  const matchedByAtmosphere: VideoMusic[] = [];
  const matchedByDefault: VideoMusic[] = [];
  const remaining: VideoMusic[] = [];

  for (const music of allMusics) {
    if (music.atmospheres.some((atmosphere) => candidateAtmospheres.includes(atmosphere as MusicAtmosphereCategory))) {
      matchedByAtmosphere.push(music);
    } else if (music.atmospheres.some((atmosphere) => config.defaultAtmospheres.includes(atmosphere as MusicAtmosphereCategory))) {
      matchedByDefault.push(music);
    } else {
      remaining.push(music);
    }
  }

  // 随机打乱各组，然后按优先级合并
  const shuffledMatched = shuffleArray(matchedByAtmosphere);
  const shuffledDefault = shuffleArray(matchedByDefault);
  const shuffledRemaining = shuffleArray(remaining);

  // 合并并取前 3 首
  const matchedMusics = [
    ...shuffledMatched,
    ...shuffledDefault,
    ...shuffledRemaining,
  ].slice(0, MATCH_CANDIDATE_MAX_COUNT);

  const primaryMusic = matchedMusics[0] ?? null;
  return {
    success: Boolean(primaryMusic),
    music: primaryMusic,
    candidates: matchedMusics.slice(1),
    matchedAtmosphere:
      primaryMusic?.atmospheres.find((item) => candidateAtmospheres.includes(item as MusicAtmosphereCategory)) ?? primaryMusic?.atmospheres[0] ?? null,
    candidateAtmospheres,
    usedDefault,
    ...(primaryMusic ? {} : { error: "没有可用音乐" }),
  };
}
