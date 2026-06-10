/**
 * project-routes.ts
 * 从 app.ts 提取的 /projects/* 路由
 * 现已重构为调用各 stepX 模块化路由函数
 */
import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { requireUser } from "../services/auth/route-guards.js";
import type { AppContext } from "../core/app-context.js";
// import type {
//   CharacterViewKey,
//   OutfitPlan,
//   Project,
//   ProviderRouteKey,
//   ScriptSourceType,
//   StoryboardFrame,
//   User,
//   ProjectWorkflowStateRecord,
//   ProviderCallAudit,
// } from "../contracts/types.js";
// import type { Step3ScriptCandidateSnapshot } from "../contracts/step3-candidate-snapshot-contract.js";
// import type { Step1RoleDirectionCard } from "../contracts/step1-joint-reverse-contract.js";
// import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
// import type { LlmDebugOptions } from "../services/llm/llm-transport.js";
// import type { LlmRequestDebugTrace } from "../contracts/llm-types.js";

import { compactTextLine } from "../utils/text.js";
import {
  VIDEO_PROJECT_STATUS_ORDER,
  IMAGE_PROJECT_STATUS_ORDER,
  isVideoStatusBeyond,
  isImageStatusBeyond,
  type VideoProjectStatus,
  type ImageProjectStatus,
} from "../contracts/types.js";

/**
 * 判断项目状态转换是否为前进方向（允许前进和同级跳转，禁止回退）
 * 视频项目和图片项目使用不同的状态序列
 */
function isStatusForwardTransition(currentStatus: string, targetStatus: string): boolean {
  // 视频项目状态序列
  const videoIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf(currentStatus as VideoProjectStatus);
  const videoTargetIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf(targetStatus as VideoProjectStatus);
  if (videoIndex >= 0 && videoTargetIndex >= 0) {
    return videoTargetIndex >= videoIndex;
  }

  // 图片项目状态序列
  const imageIndex = IMAGE_PROJECT_STATUS_ORDER.indexOf(currentStatus as ImageProjectStatus);
  const imageTargetIndex = IMAGE_PROJECT_STATUS_ORDER.indexOf(targetStatus as ImageProjectStatus);
  if (imageIndex >= 0 && imageTargetIndex >= 0) {
    return imageTargetIndex >= imageIndex;
  }

  // 不在已知序列中的状态：无法判断方向，不允许转换
  return false;
}
// ---------------------------------------------------------------------------
import { registerStep1OutfitRoutes } from "./step1-outfit/index.js";
import { registerStep2CharacterRoutes } from "./step2-character/index.js";
import { registerStep3StoryboardRoutes } from "./step3-storyboard/index.js";
import { registerStep4FramePreviewRoutes } from "./step4-frame-preview/index.js";
import { registerStep5VideoRoutes } from "./step4-video/index.js";
import { createStep3Helpers, type Step3Helpers } from "./step3-candidate-helpers.js";
import type { ProjectRouteDeps } from "./project-route-shared.js";

/**
 * 构建 video generation audit request summary（供 app.ts 和 project-routes 共用）
 */
export function _buildVideoGenerationAuditRequestSummary(input: {
  clipPrompt: string;
  clipImageUrl: string | null;
  clipIndex: number;
  totalClipCount: number;
  context: "step4_workspace" | "step6_fission" | "admin_capability";
}): string {
  return `context=${input.context}; clip=${input.clipIndex + 1}/${input.totalClipCount}; prompt=${compactTextLine(input.clipPrompt, 900)}; imageUrl=${compactTextLine(input.clipImageUrl ?? "-", 260)}`;
}

/**
 * 注册所有 /projects/* 路由
 * 通过调用各 stepX 模块化路由函数实现
 */
export function registerProjectRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
): void {
  // =========================================================================
  // Step1 Outfit 路由：搭配推荐、图片分类、背景去除、角色方向生成
  // =========================================================================
  // GET /projects/:projectId — 获取项目基本信息
  app.get("/projects/:projectId", async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt,
      selectedRoleDirection: project.selectedRoleDirection,
      projectKind: project.projectKind,
      reverseScriptId: project.reverseScriptId,
      activeScriptId: project.activeScriptId,
      exportUrl: project.exportUrl,
      lastVisitedStep: project.lastVisitedStep,
      coverImageUrl: project.coverImageUrl,
      videoCoverImageUrl: project.videoCoverImageUrl,
      publishTitle: project.publishTitle,
    };
  });

  // PATCH /projects/:projectId/status — 更新项目状态
  // PATCH /projects/:projectId/status — 更新项目状态（禁止回退）
  app.patch("/projects/:projectId/status", async (request: FastifyRequest, reply) => {
    try {
      const user = await requireUser(ctx, request);
      const params = request.params as { projectId: string };
      const body = request.body as { status?: string } | undefined;
      const newStatus = body?.status;

      if (!newStatus) {
        return reply.status(400).send({ success: false, error: "status is required" });
      }

      // 禁止状态回退：新状态的优先级必须 >= 当前状态
      const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
      const currentStatus = project.status as string;
      if (currentStatus && !isStatusForwardTransition(currentStatus, newStatus)) {
        return reply.status(409).send({
          success: false,
          error: `项目状态不可回退：当前 ${currentStatus}，目标 ${newStatus}`,
          currentStatus,
          targetStatus: newStatus,
        });
      }

      await ctx.repos.projects.updateStatus(params.projectId, newStatus);

      return { success: true, projectId: params.projectId, status: newStatus, updatedAt: ctx.clock.now() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      app.log.error(`[PATCH /projects/:projectId/status] Error: ${errorMessage}`);
      return reply.status(500).send({ success: false, error: errorMessage });
    }
  });

  // PATCH /projects/:projectId/publish-title — 更新发布标题
  app.patch("/projects/:projectId/publish-title", async (request: FastifyRequest, reply) => {
    try {
      const user = await requireUser(ctx, request);
      const params = request.params as { projectId: string };
      const body = request.body as { publishTitle?: string } | undefined;
      const publishTitle = body?.publishTitle?.trim() ?? null;

      await ctx.projectService.requireOwnerProject(user, params.projectId);
      const updatedAt = ctx.clock.now();
      await ctx.repos.projects.updatePublishTitle(params.projectId, publishTitle, updatedAt);

      return { success: true, projectId: params.projectId, publishTitle, updatedAt };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      app.log.error(`[PATCH /projects/:projectId/publish-title] Error: ${errorMessage}`);
      return reply.status(500).send({ success: false, error: errorMessage });
    }
  });

  registerStep1OutfitRoutes(app, ctx, deps);

  // =========================================================================
  // Step2 Character 路由：提示词参数变体生成（角色定妆已迁移到五视图系统）
  // =========================================================================
  registerStep2CharacterRoutes(app, ctx);

  // =========================================================================
  // Step4 Storyboard 路由：分镜提示词生成、场景参考生成、提示词优化/翻译/视频生成
  // =========================================================================
  registerStep3StoryboardRoutes(app, ctx, deps);

  // =========================================================================
  // Step4 Frame Preview 路由：帧预览任务创建/查询、分镜资源持久化
  // 需要 Step3Helpers，在此创建并传递
  // =========================================================================
  const step3Helpers: Step3Helpers = createStep3Helpers(app, ctx, deps);
  registerStep4FramePreviewRoutes(app, ctx, deps, step3Helpers);

  // =========================================================================
  // Step5 Video 路由：视频任务创建、状态查询、完成确认 + 导出
  // =========================================================================
  registerStep5VideoRoutes(app, ctx, deps);
}