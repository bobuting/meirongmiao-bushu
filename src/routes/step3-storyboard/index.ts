/**
 * Step3 Storyboard 路由注册
 *
 * 分镜提示词生成、场景参考生成、分镜生成/重生成/变体选择
 * 以及分镜专业提示词（shot-prompts）生成和查询
 *
 * 从 project-routes-handlers.ts Block 1 (L705-1047) + Block 2 (L2908-3281) 提取
 * 注：frame-preview-jobs / assets/persist 依赖 step3 闭包辅助函数，暂留在 project-routes.ts
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ProjectRouteDeps, JimengImageRatio, JimengImageResolution } from "../project-route-shared.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import type { StoryboardFrame } from "../../contracts/types.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../../contracts/provider-route-keys.js";

import { AppError } from "../../core/errors.js";
import { requireUser } from "../../services/auth/route-guards.js";
import {
  resolveRouteProviderWithFallback,
} from "../../services/llm/provider-resolver.js";
import { persistImageSourceToStorage } from "../../services/media/storage-persist.js";
import { buildSceneReferencePrompt } from "../../storyboard-scene-prompt-policy.js";
import {
  normalizeStep3StoryboardFrameGenerationInput,
  buildStep3StoryboardFrameGenerationRequest,
} from "../../modules/step3-storyboard-frame-generation-contract.js";
// // import { normalizeStoryboardFrameMediaUrls as normalizeStoryboardFrameRecordMediaUrls } from "../../modules/storyboard-frame-media-normalizer.js";
import { sanitizeUrlField } from "../../contracts/media-url-safety.js";
import {
  getShotPrompts,
  getLatestShotPromptsByProjectId,
} from "../../modules/video-step/step3/shot-prompt-engineer-service.js";

/**
 * 注册 Step4 Storyboard 相关路由
 *
 * 路由列表:
 * - POST /projects/:projectId/storyboards/:frameId/select-variant
 * - GET /projects/:projectId/storyboards/shot-prompts/latest
 * - GET /projects/:projectId/storyboards/shot-prompts/:scriptDataId
 *
 * 注：POST /projects/:projectId/storyboards/shot-prompts/generate 已删除
 *     专业提示词生成现在作为批量预览的子任务（step3_shot_prompt）
 *
 * 注：POST /projects/:projectId/storyboards/prompts/optimize 和 translate 已删除
 *     prompt_rewrite_image skill 未接入前端，相关代码已清理
 *
 * 注：POST /projects/:projectId/storyboards/prompts/video-generate 已删除
 *     该功能已由 shot_prompt_engineer skill 完全覆盖
 */
export function registerStep3StoryboardRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
): void {
  const {
    requestLlmImageGenerationUrls,
    normalizeJimengImageRatio,
    normalizeJimengImageResolution,
    normalizeProviderTransportImageUrls,
    normalizeStoryboardFrameRecordMediaUrls,
  } = deps;

  // =========================================================================
  // POST /projects/:projectId/storyboards/:frameId/select-variant
  // 变体选择（切换帧的当前展示变体图片）
  // =========================================================================
  app.post("/projects/:projectId/storyboards/:frameId/select-variant", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; frameId: string };
    const body = (request.body as { variantIndex?: number } | undefined) ?? {};
    const variantIndex = Number.isInteger(body.variantIndex) ? Number(body.variantIndex) : -1;
    const frame = await ctx.storyboardService.selectVariant(user, params.projectId, params.frameId, variantIndex);
    return frame;
  });

  // =========================================================================
  // GET /projects/:projectId/storyboards/shot-prompts/latest
  // 获取项目最新的分镜专业提示词
  // =========================================================================
  app.get("/projects/:projectId/storyboards/shot-prompts/latest", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 验证项目权限
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 获取最新脚本的提示词
    const data = await getLatestShotPromptsByProjectId(ctx, params.projectId);

    return {
      success: true,
      data,
    };
  });

  // =========================================================================
  // GET /projects/:projectId/storyboards/shot-prompts/:scriptDataId
  // 根据脚本ID获取分镜专业提示词
  // =========================================================================
  app.get("/projects/:projectId/storyboards/shot-prompts/:scriptDataId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; scriptDataId: string };

    // 验证项目权限
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 获取指定脚本的提示词
    const data = await getShotPrompts(ctx, params.scriptDataId);

    return {
      success: true,
      data,
    };
  });

  // =========================================================================
  // GET /projects/:projectId/step3-frame-images
  // 获取 Step3 分镜图片（从 nrm_step3_frame_images 表，按 frame_index 唯一化）
  // =========================================================================
  app.get("/projects/:projectId/step3-frame-images", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const { getStep3FrameImagesDbService } = await import("../../service/step3-frame-images-db-service.js");
    const service = getStep3FrameImagesDbService(ctx.repos);
    const records = await service.findByProjectId(project.id);

    // 按 frame_index 唯一化：每个 frame_index 只保留 updated_at 最大的一条记录
    // 避免多条相同 frame_index 的记录导致前端数据覆盖问题
    const uniqueByFrameIndex: Map<number, typeof records[0]> = new Map();
    for (const record of records) {
      const existing = uniqueByFrameIndex.get(record.frame_index);
      if (!existing || record.updated_at > existing.updated_at) {
        uniqueByFrameIndex.set(record.frame_index, record);
      }
    }

    // 转换为前端需要的格式
    const frames: Array<{
      frameIndex: number;
      imageUrl: string;
      prompt?: string;
      candidates?: string[];
      status: "pending" | "running" | "succeeded" | "failed";
    }> = Array.from(uniqueByFrameIndex.values()).map((r) => {
      // 从 batches 中提取所有候选图片 URL
      const allCandidates: string[] = [];
      for (const batch of r.batches || []) {
        for (const img of batch.images || []) {
          if (img.image_url && !allCandidates.includes(img.image_url)) {
            allCandidates.push(img.image_url);
          }
        }
      }
      // 使用独立的 status 字段
      const status = r.status || "pending";
      return {
        frameIndex: r.frame_index,
        imageUrl: r.selected_image_url?.trim() || "",
        prompt: r.image_prompt || undefined,
        candidates: allCandidates,
        status,
      };
    // 保留失败的帧，即使没有图片数据也要返回，前端用于显示错误状态和重试按钮
    }).filter((f) => f.imageUrl || (f.candidates && f.candidates.length > 0) || f.status === "failed");

    return { frames };
  });

  // =========================================================================
  // PUT /projects/:projectId/step3-frame-images/:frameIndex/select
  // 选择分镜图片（更新选中状态）
  // =========================================================================
  app.put("/projects/:projectId/step3-frame-images/:frameIndex/select", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; frameIndex: string };
    const body = (request.body as { imageUrl: string } | undefined) ?? { imageUrl: "" };

    const frameIndex = Math.max(1, Math.floor(Number(params.frameIndex) || 1));
    const imageUrl = body.imageUrl?.trim() ?? "";

    if (!imageUrl) {
      throw new AppError(400, "IMAGE_URL_REQUIRED", "imageUrl is required");
    }

    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const { getStep3FrameImagesDbService } = await import("../../service/step3-frame-images-db-service.js");
    const service = getStep3FrameImagesDbService(ctx.repos);
    const updated = await service.selectImageByProjectAndFrame(project.id, frameIndex, imageUrl);

    if (!updated) {
      // 记录不存在，返回成功但提示无更新（兼容首次选择外部图片的场景）
      app.log.warn(
        { projectId: project.id, frameIndex, imageUrl },
        "[Step3FrameImages] selectImageByProjectAndFrame: record not found, skipping",
      );
    }

    return {
      success: true,
      frameIndex,
      imageUrl,
    };
  });

  // =========================================================================
  // 远程加载分镜脚本内容（供 Step4 前端调用）
  // 从 nrm_script_data (confirmed/selected) + nrm_shot_breakdown 获取结构化段落
  // =========================================================================
  app.get("/projects/:projectId/step4/script-segments", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const { getScriptsDataDbService } = await import("../../service/scripts-data-db-service.js");
    const scriptsService = getScriptsDataDbService(ctx.repos);

    // 优先取已确认脚本，其次取已选中脚本
    let scriptRecord = await scriptsService.getConfirmedScript(project.id);
    if (!scriptRecord) {
      scriptRecord = await scriptsService.getSelectedScript(project.id);
    }

    if (!scriptRecord) {
      return { segments: [] };
    }

    const { parseVideoScriptsContentsWithShots } = await import("../../modules/video-step/step3-video-script/content-parser.js");
    const parsed = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [scriptRecord]);
    const shotBreakdown = parsed[0]?.parsed?.shot_breakdown;

    if (!shotBreakdown || shotBreakdown.length === 0) {
      return { segments: [] };
    }

    // audio 结构已改为只有 ambient_sound，从环境音提取内容
    const segments = shotBreakdown.map((shot, index) => {
      const ambientSound = shot.audio?.ambient_sound || "";

      return {
        title: `镜头 ${index + 1}`,
        content: ambientSound ? `环境音：${ambientSound}` : "",
        visualCue: shot.shot_description || "",
        visualPrompt: shot.shot_description || "",
        shotSize: shot.shot_type,
        durationSec: shot.timecode?.duration_seconds,
      };
    });

    return { segments };
  });

  // =========================================================================
  // GET /projects/:projectId/script-summary
  // 获取已确认/已选中脚本的概要（video_analysis.summary）
  // =========================================================================
  app.get("/projects/:projectId/script-summary", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const { getScriptsDataDbService } = await import("../../service/scripts-data-db-service.js");
    const scriptsService = getScriptsDataDbService(ctx.repos);

    let scriptRecord = await scriptsService.getConfirmedScript(project.id);
    if (!scriptRecord) {
      scriptRecord = await scriptsService.getSelectedScript(project.id);
    }

    return { summary: scriptRecord?.summary || null, title: scriptRecord?.title || null, titleCandidates: scriptRecord?.titleCandidates || null };
  });
}
