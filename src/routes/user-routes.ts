/**
 * 用户个人相关路由 /me/*
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { toPlainRecord } from "../services/utils/json-utils.js";
import type { Project } from "../contracts/types.js";
import type { ScriptData } from "../contracts/types.js";
import { getFinalVideosDbService, type FinalVideoType } from "../service/final-videos-db-service.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("user-routes");

export interface UserRouteDeps {
  readonly findReverseMirrorByScriptVersion: (userId: string, scriptVersionId: string) => Promise<ScriptData | null>;
}

export function registerUserRoutes(app: FastifyInstance, ctx: AppContext, deps: UserRouteDeps): void {
  const { findReverseMirrorByScriptVersion } = deps;

  app.get("/me/credits/mock", async (request) => {
    const user = await requireUser(ctx, request);
    return await ctx.creditService.ensureAccount(user.id);
  });

  app.get("/me/credits/pricing", async (request) => {
    const user = await requireUser(ctx, request);
    const pricingMap = await ctx.creditPricingService.getPricingMap();
    return {
      // 儿童/成人分档定价（新增字段）
      step2FiveViewChildCost: pricingMap["step2_five_view_generation_child"] ?? 0,
      step2FiveViewAdultCost: pricingMap["step2_five_view_generation_adult"] ?? 0,
      step3StoryboardChildCost: pricingMap["step3_storyboard_image_child"] ?? 0,
      step3StoryboardAdultCost: pricingMap["step3_storyboard_image_adult"] ?? 0,
      step4ClipChildCost: pricingMap["step4_clip_video_generation_child"] ?? 0,
      step4ClipAdultCost: pricingMap["step4_clip_video_generation_adult"] ?? 0,
      videoExportCost: pricingMap["step4_video_export"] ?? 0,
      fissionChildCost: pricingMap["fission_video_generation_child"] ?? 0,
      fissionAdultCost: pricingMap["fission_video_generation_adult"] ?? 0,
      fissionStoryboardImageChildCost: pricingMap["fission_storyboard_image_child"] ?? 0,
      fissionStoryboardImageAdultCost: pricingMap["fission_storyboard_image_adult"] ?? 0,
      // 历史字段（保持兼容，映射到成人价格）
      singleImageCreditCost: pricingMap["step2_five_view_generation_adult"] ?? 0,
      singleVideoCreditCost: pricingMap["step4_clip_video_generation_adult"] ?? 0,
      videoExportCreditCost: pricingMap["step4_video_export"] ?? 0,
      fissionPerVideoCreditCost: pricingMap["fission_video_generation_adult"] ?? 0,
      // 用户侧定价展示：所有 routeKey → credit_cost 映射
      allRouteKeyCosts: pricingMap,
    };
  });

  app.post("/me/credits/spend", {
    schema: {
      tags: ["积分"],
      summary: "积分消费",
      description: "消费用户积分，必须传递 routeKey 以使用 RouteKey 定价体系",
      body: {
        type: "object",
        required: ["routeKey"],
        properties: {
          routeKey: {
            type: "string",
            minLength: 1,
            description: "Provider Route Key，决定积分定价",
            example: "step4_video_export",
          },
          operation: {
            type: "string",
            description: "操作类型（可选，用于审计日志）",
            example: "single_video",
          },
          count: {
            type: "number",
            minimum: 1,
            description: "消费次数（可选，默认1）",
            example: 1,
          },
          reason: {
            type: "string",
            description: "消费原因（可选，用于审计日志）",
            example: "step4_auto_batch_video_generate",
          },
        },
      },
    },
  }, async (request) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as {
      routeKey: string;
      operation?: string;
      count?: number;
      reason?: string;
      projectId?: string;
    });

    const routeKey = body.routeKey.trim();
    const operation = typeof body.operation === "string" ? body.operation.trim() : routeKey;
    const count = typeof body.count === "number" && Number.isFinite(body.count) ? Math.max(1, Math.floor(body.count)) : 1;
    const reason = typeof body.reason === "string" ? body.reason.trim() : operation;

    // 定价逻辑：从积分定价服务获取成本（未配置时免费 cost=0）
    const routeKeyCost = await ctx.creditPricingService.getCost(routeKey);
    const cost = routeKeyCost * count;

    const spent = await ctx.creditService.spend(user.id, cost, "720p", {
      routeKey,
      operation,
      reason,
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : undefined,
    });

    const account = await ctx.creditService.ensureAccount(user.id);
    return {
      balance: account.balance,
      expiresAt: account.expiresAt,
      spent,
    };
  });

  app.get("/me/credits/history", async (request) => {
    const user = await requireUser(ctx, request);
    const query = (request.query as { limit?: string } | undefined) ?? {};
    const rawLimit = Number(query.limit ?? 100);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, Math.floor(rawLimit))) : 100;
    const allLogs = await ctx.auditStore.queryAuditLogs({ targetId: user.id });
    const items = allLogs
      .filter((log) => log.action === "credit_spent_by_user" || log.action === "credit_adjusted_by_admin")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((log) => {
        const isSpend = log.action === "credit_spent_by_user";
        const amountRaw = Number(log.meta?.amount ?? 0);
        const deltaRaw = Number(log.meta?.delta ?? 0);
        const spentByUser = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
        const adminAdjustedDelta = Number.isFinite(deltaRaw) ? Math.floor(deltaRaw) : 0;
        const chargeAmount = isSpend ? spentByUser : Math.max(0, -adminAdjustedDelta);
        const routeKey = typeof log.meta?.routeKey === "string" && log.meta.routeKey.trim().length > 0
          ? log.meta.routeKey.trim()
          : null;
        const reason =
          typeof log.meta?.reason === "string" && log.meta.reason.trim().length > 0
            ? log.meta.reason.trim()
            : "project_flow_action";
        const activity = isSpend ? (routeKey ?? reason) : reason;
        return {
          id: log.id,
          userId: user.id,
          createdAt: log.createdAt,
          activity,
          success: true,
          chargeAmount,
          label: isSpend ? "用户消费" : "管理员调账",
          delta: isSpend ? -chargeAmount : adminAdjustedDelta,
        };
      });
    return { items };
  });

  app.get("/me/private/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    return { scriptIds: await ctx.squareService.listMyPrivate(user) };
  });

  app.get("/me/projects", async (request) => {
    const user = await requireUser(ctx, request);

    // 解析分页参数（默认每页 15 条）
    const query = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
      projectKind?: 'image' | 'video' | 'reverse' | 'outfit_change';
      search?: string;
      garmentCategory?: string;
    };

    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 15;
    const status = query.status ?? undefined;
    const projectKind = query.projectKind ?? undefined;
    const search = query.search ?? undefined;
    const garmentCategory = query.garmentCategory ?? undefined;

    // 分页查询
    const result = await ctx.repos.projects.findByUserIdPaginated(
      user.id,
      {
        page,
        pageSize,
        status,
        projectKind,
        search,
        garmentCategory,
      }
    );

    // 构建返回数据（直接使用数据库字段，删除复杂解析逻辑）
    const projects = result.projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      thumbnailUrl: p.thumbnailUrl || "https://placehold.co/450x800/1a1a1a/FFF?text=Project+Preview",
      formatLabel: p.formatLabel,
      durationSec: p.durationSec,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      views: p.views,
      lastVisitedStep: p.lastVisitedStep,
      lastReverseTaskId: p.lastReverseTaskId,
      lastReverseScriptVersionId: p.lastReverseScriptVersionId,
      lastReverseLibraryScriptId: null,  // 删除查询逻辑，直接返回 null
      projectKind: p.projectKind,
      exportUrl: p.exportUrl,
      reverseScriptId: p.reverseScriptId ?? null,
      coverImageUrl: p.coverImageUrl,
      garmentImageUrl: p.garmentImageUrl,
    }));

    return {
      projects,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
    };
  });

  // PUT /projects/:projectId/export-url — 更新项目导出视频 URL
  app.put("/projects/:projectId/export-url", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as {
      exportUrl?: string;
      durationSec?: number;
    } | undefined) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 解析参数
    const exportUrl = typeof body.exportUrl === "string" ? body.exportUrl.trim() : null;
    const durationSec = typeof body.durationSec === "number" && Number.isFinite(body.durationSec)
      ? body.durationSec
      : null;

    // 更新 projects 表
    await ctx.projectService.updateExportUrl(project.id, exportUrl, { durationSec });

    return { success: true };
  });

  // PUT /projects/:projectId/complete-video — 完成 Step4 视频合成
  // 原子更新：status、exportUrl、durationSec、formatLabel、lastVisitedStep
  // 同时保存成片记录到 nrm_final_videos 表
  app.put("/projects/:projectId/complete-video", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as {
      exportUrl?: string;
      durationSec?: number;
      lastVisitedStep?: number;
      videoCoverImageUrl?: string;
      backgroundMusicUrl?: string;
      backgroundMusicTitle?: string;
      transitionType?: string;
    } | undefined) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 解析参数
    const exportUrl = typeof body.exportUrl === "string" ? body.exportUrl.trim() : "";
    if (!exportUrl) {
      throw new AppError(400, "EXPORT_URL_REQUIRED", "exportUrl is required");
    }

    const durationSec = typeof body.durationSec === "number" && Number.isFinite(body.durationSec)
      ? body.durationSec
      : undefined;

    const lastVisitedStep = typeof body.lastVisitedStep === "number" && Number.isFinite(body.lastVisitedStep)
      ? body.lastVisitedStep
      : undefined;

    // 解析成片相关参数
    const videoCoverImageUrl = typeof body.videoCoverImageUrl === "string" ? body.videoCoverImageUrl.trim() : null;
    const backgroundMusicUrl = typeof body.backgroundMusicUrl === "string" ? body.backgroundMusicUrl.trim() : null;
    const backgroundMusicTitle = typeof body.backgroundMusicTitle === "string" ? body.backgroundMusicTitle.trim() : null;
    const transitionType = typeof body.transitionType === "string" ? body.transitionType.trim() : "random";

    // 原子更新项目状态
    await ctx.projectService.completeProjectVideo(project.id, {
      exportUrl,
      durationSec,
      lastVisitedStep,
      videoCoverImageUrl,
    });

    // 保存成片记录到 nrm_final_videos 表
    try {
      const finalVideosService = getFinalVideosDbService(ctx.repos);
      await finalVideosService.create({
        projectId: project.id,
        videoType: "step4",
        videoUrl: exportUrl,
        durationSec: durationSec ?? null,
        coverImageUrl: videoCoverImageUrl,
        backgroundMusicUrl: backgroundMusicUrl,
        backgroundMusicTitle: backgroundMusicTitle,
        transitionType: transitionType,
        creatorId: user.id,
      });
    } catch (error) {
      // 保存成片记录失败不影响主流程，只记录日志
      log.error({ err: error }, "FinalVideo 保存 Step4 成片记录失败");
    }

    return { success: true };
  });

  // PUT /projects/:projectId/thumbnail-url — 更新项目缩略图 URL
  app.put("/projects/:projectId/thumbnail-url", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as { thumbnailUrl?: string } | undefined) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 解析参数
    const thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim() : null;
    if (!thumbnailUrl) {
      throw new AppError(400, "THUMBNAIL_URL_REQUIRED", "thumbnailUrl is required");
    }

    // 更新 projects 表
    project.thumbnailUrl = thumbnailUrl;
    project.updatedAt = ctx.clock.now();
    await ctx.repos.projects.upsert(project);

    return { success: true };
  });

  // PUT /projects/:projectId/cover-image-url — 更新项目封面图片 URL
  app.put("/projects/:projectId/cover-image-url", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as { coverImageUrl?: string } | undefined) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 解析参数
    const coverImageUrl = typeof body.coverImageUrl === "string" ? body.coverImageUrl.trim() : null;

    // 更新 projects 表
    project.coverImageUrl = coverImageUrl;
    project.updatedAt = ctx.clock.now();
    await ctx.repos.projects.upsert(project);

    return { success: true };
  });

  // PUT /projects/:projectId/video-cover-image-url — 更新项目视频封面图片 URL
  app.put("/projects/:projectId/video-cover-image-url", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as { videoCoverImageUrl?: string } | undefined) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 解析参数
    const videoCoverImageUrl = typeof body.videoCoverImageUrl === "string" ? body.videoCoverImageUrl.trim() : null;

    // 更新 projects 表
    project.videoCoverImageUrl = videoCoverImageUrl;
    project.updatedAt = ctx.clock.now();
    await ctx.repos.projects.upsert(project);

    return { success: true };
  });

  // GET /projects/:projectId/final-videos — 获取项目成片列表
  app.get("/projects/:projectId/final-videos", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const query = request.query as { limit?: string } | undefined;

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 解析 limit 参数
    const limit = query?.limit ? parseInt(query.limit, 10) : undefined;

    // 查询成片列表
    const finalVideosService = getFinalVideosDbService(ctx.repos);
    const records = await finalVideosService.findByProjectId(project.id, limit);

    // 返回简化数据
    const videos = records.map((r) => ({
      id: r.id,
      videoType: r.videoType,
      videoUrl: r.videoUrl,
      durationSec: r.durationSec,
      createdAt: r.createdAt,
    }));

    return { success: true, videos };
  });
}
