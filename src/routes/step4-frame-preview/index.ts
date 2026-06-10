/**
 * Step3/Step4 资源持久化路由
 *
 * 旧的 frame-preview-jobs 创建/查询/重试路由已迁移至全局异步队列：
 * - POST /frame-preview-v2  → startSingleFramePreviewJob (step3-batch-preview-routes.ts)
 * - POST /batch-preview      → startBatchPreviewJobWithDeps (step3-batch-preview-routes.ts)
 *
 * 本文件仅保留 assets/persist 端点
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ProjectRouteDeps } from "../project-route-shared.js";
import type { Step3Helpers } from "../step3-candidate-helpers.js";

import { AppError } from "../../core/errors.js";
import { requireUser } from "../../services/auth/route-guards.js";
import { sanitizeUrlField } from "../../contracts/media-url-safety.js";
import { persistImageSourceToStorage } from "../../services/media/storage-persist.js";

/**
 * 注册分镜资源持久化路由
 *
 * 路由列表:
 * - POST /projects/:projectId/storyboards/assets/persist
 */
export function registerStep4FramePreviewRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  _deps: ProjectRouteDeps,
  _helpers: Step3Helpers,
): void {
  // ===========================================================================
  // POST /projects/:projectId/storyboards/assets/persist
  // 分镜资源持久化（将外部 URL 转存到自有存储）
  // ===========================================================================

  app.post("/projects/:projectId/storyboards/assets/persist", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as
      | {
        urls?: unknown[];
        scope?: "frame_preview" | "scene_reference" | "character_reference";
        frameIndex?: number;
      }
      | undefined) ?? {};
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const scope = body.scope === "scene_reference" || body.scope === "character_reference" ? body.scope : "frame_preview";
    const frameIndexRaw = Number(body.frameIndex);
    const frameIndex = Number.isInteger(frameIndexRaw) && frameIndexRaw > 0 ? frameIndexRaw : 1;
    const rawUrls = Array.isArray(body.urls)
      ? body.urls
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
          .slice(0, 8)
      : [];
    if (rawUrls.length < 1) {
      throw new AppError(400, "IMAGE_URLS_REQUIRED", "urls are required");
    }
    const persistedUrls: Array<string | null> = [];
    for (const [index, sourceUrl] of rawUrls.entries()) {
      let normalized = sanitizeUrlField(sourceUrl);
      try {
        const persisted = await persistImageSourceToStorage(
          ctx,
          sourceUrl,
          `projects/${project.id}/step3/frame-${frameIndex}/${scope}/asset-${index + 1}`,
          { persistRemote: true, dedupeByContent: false },
        );
        normalized = sanitizeUrlField(persisted) ?? normalized;
      } catch (error) {
        app.log.warn(
          {
            err: error,
            projectId: project.id,
            frameIndex,
            scope,
            index: index + 1,
          },
          "step3 storyboard asset persistence failed, keep original url when possible",
        );
      }
      persistedUrls.push(normalized);
    }
    if (!persistedUrls.some((item) => typeof item === "string" && item.length > 0)) {
      throw new AppError(
        502,
        "IMAGE_ASSET_PERSISTENCE_FAILED",
        `step3 storyboard assets are not persistable: projectId=${project.id}; frameIndex=${frameIndex}; scope=${scope}`,
      );
    }
    return {
      urls: persistedUrls,
    };
  });
}
