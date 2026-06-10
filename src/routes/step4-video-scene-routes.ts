/**
 * step4-video-scene-routes.ts
 *
 * Step4 分镜视频场景 API
 * - GET  /projects/:projectId/video-scenes        (获取所有分镜)
 * - POST /projects/:projectId/video-scenes/batch   (批量保存)
 * - PATCH /projects/:projectId/video-scenes/:sceneIndex (更新单个分镜)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "../services/auth/route-guards.js";
import type { AppContext } from "../core/app-context.js";

interface ProjectIdParams {
  projectId: string;
}

interface SceneIndexParams {
  projectId: string;
  sceneIndex: string;
}

/**
 * 校验 URL 是否为视频格式
 * 只允许: mp4, webm, mov, m4v
 */
function isValidVideoUrl(url: string): boolean {
  const plain = url.split("?")[0] ?? "";
  return /\.(mp4|webm|mov|m4v)$/i.test(plain);
}

/**
 * 校验 URL 数组是否全部为视频格式
 */
function validateVideoUrlArray(urls: string[], fieldName: string): string | null {
  for (let i = 0; i < urls.length; i++) {
    if (!isValidVideoUrl(urls[i])) {
      return `${fieldName}[${i}] 必须是视频格式 (mp4/webm/mov/m4v)，当前值: ${urls[i]}`;
    }
  }
  return null;
}

export function registerStep4VideoSceneRoutes(app: FastifyInstance, ctx: AppContext): void {
  /** 获取项目所有分镜 */
  app.get<{ Params: ProjectIdParams }>(
    "/projects/:projectId/video-scenes",
    { schema: { tags: ["step4-video-scene"] } },
    async (request: FastifyRequest<{ Params: ProjectIdParams }>, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      const { projectId } = request.params;

      const project = await ctx.repos.projects.findById(projectId);
      if (!project || project.userId !== user.id) {
        return reply.code(404).send({ error: "项目不存在或无权限" });
      }

      const scenes = await ctx.repos.step4VideoScenes.findByProjectId(projectId);
      return reply.send({ scenes });
    },
  );

  /** 批量保存分镜 */
  app.post<{ Params: ProjectIdParams; Body: { scenes: Array<{
    sceneIndex: number;
    variantUrls: string[];
    selectedIndex: number;
    clipStatus: string;
    clipUrl: string | null;
    clipPrompt: string | null;
    clipProgress: number;
  }> } }>(
    "/projects/:projectId/video-scenes/batch",
    { schema: { tags: ["step4-video-scene"] } },
    async (request: FastifyRequest<{ Params: ProjectIdParams; Body: { scenes: Array<{
      sceneIndex: number;
      variantUrls: string[];
      selectedIndex: number;
      clipStatus: string;
      clipUrl: string | null;
      clipPrompt: string | null;
      clipProgress: number;
    }> } }>, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      const { projectId } = request.params;

      const project = await ctx.repos.projects.findById(projectId);
      if (!project || project.userId !== user.id) {
        return reply.code(404).send({ error: "项目不存在或无权限" });
      }

      const scenes = request.body.scenes;
      if (!Array.isArray(scenes)) {
        return reply.code(400).send({ error: "scenes 必须是数组" });
      }

      // 校验 variantUrls 和 clipUrl 必须是视频格式
      for (const scene of scenes) {
        if (Array.isArray(scene.variantUrls)) {
          const variantError = validateVideoUrlArray(scene.variantUrls, "variantUrls");
          if (variantError) {
            return reply.code(400).send({ error: variantError });
          }
        }
        if (scene.clipUrl && typeof scene.clipUrl === "string" && !isValidVideoUrl(scene.clipUrl)) {
          return reply.code(400).send({ error: `clipUrl 必须是视频格式 (mp4/webm/mov/m4v)，当前值: ${scene.clipUrl}` });
        }
      }

      await ctx.repos.step4VideoScenes.batchUpsert(projectId, user.id, scenes);
      const updated = await ctx.repos.step4VideoScenes.findByProjectId(projectId);
      return reply.send({ scenes: updated });
    },
  );

  /** 更新单个分镜 */
  app.patch<{ Params: SceneIndexParams; Body: Record<string, unknown> }>(
    "/projects/:projectId/video-scenes/:sceneIndex",
    { schema: { tags: ["step4-video-scene"] } },
    async (request: FastifyRequest<{ Params: SceneIndexParams; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      const { projectId, sceneIndex } = request.params;

      const project = await ctx.repos.projects.findById(projectId);
      if (!project || project.userId !== user.id) {
        return reply.code(404).send({ error: "项目不存在或无权限" });
      }

      const fields: Record<string, unknown> = {};
      const allowedFields = ["variantUrls", "selectedIndex", "clipStatus", "clipUrl", "clipPrompt", "clipProgress"];
      for (const key of allowedFields) {
        if (key in request.body) {
          fields[key] = request.body[key];
        }
      }

      if (Object.keys(fields).length === 0) {
        return reply.code(400).send({ error: "没有可更新的字段" });
      }

      // 校验 variantUrls 必须是视频格式数组
      if (Array.isArray(fields.variantUrls)) {
        const variantError = validateVideoUrlArray(fields.variantUrls, "variantUrls");
        if (variantError) {
          return reply.code(400).send({ error: variantError });
        }
      }

      // 校验 clipUrl 必须是视频格式
      if (fields.clipUrl && typeof fields.clipUrl === "string" && !isValidVideoUrl(fields.clipUrl as string)) {
        return reply.code(400).send({ error: `clipUrl 必须是视频格式 (mp4/webm/mov/m4v)，当前值: ${fields.clipUrl}` });
      }

      const updated = await ctx.repos.step4VideoScenes.updateScene(projectId, Number(sceneIndex), fields, user.id);
      return reply.send({ scene: updated });
    },
  );

  /**
   * 删除单个视频变体（软删除）
   * 从 variantUrls 移除，添加到 deletedVariantUrls
   */
  app.delete<{ Params: SceneIndexParams; Body: { variantUrl: string } }>(
    "/projects/:projectId/video-scenes/:sceneIndex/variant",
    { schema: { tags: ["step4-video-scene"] } },
    async (request: FastifyRequest<{ Params: SceneIndexParams; Body: { variantUrl: string } }>, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      const { projectId, sceneIndex } = request.params;
      const { variantUrl } = request.body;

      const project = await ctx.repos.projects.findById(projectId);
      if (!project || project.userId !== user.id) {
        return reply.code(404).send({ error: "项目不存在或无权限" });
      }

      if (!variantUrl || typeof variantUrl !== "string") {
        return reply.code(400).send({ error: "variantUrl 必须是有效的URL" });
      }

      const updated = await ctx.repos.step4VideoScenes.deleteVariantUrl(projectId, Number(sceneIndex), variantUrl);
      if (!updated) {
        return reply.code(404).send({ error: "分镜场景不存在" });
      }

      return reply.send({ scene: updated });
    },
  );
}
