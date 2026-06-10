/**
 * admin-routes.ts
 * /admin/* 路由注册入口，委托各子模块处理
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ReverseAttempt, ReverseTrace, TrendEntry, TrendSyncJob, AppConfig } from "../contracts/types.js";

import { requireAdmin } from "../services/auth/route-guards.js";
import type { AdminRouteDeps } from "./admin/types.js";
import type { AppShellThinEntryHandlers } from "./app-shell-thin-entry.js";
import { sseManager } from "../modules/sse-manager.js";

import { registerAdminUsersRoutes } from "./admin/users-routes.js";
import { registerAdminScriptsRoutes } from "./admin/scripts-routes.js";
import { registerAdminCreditAuditsRoute } from "./admin/credit-audits-route.js";
import { registerAdminProviderRoutes } from "./admin/provider-routes.js";
import { registerAdminScriptsHotTrendsRoutes } from "./admin/scripts-hot-trends-routes.js";
import { registerAdminCapabilityLabRoutes } from "./admin/capability-lab-routes.js";
import { registerLogsRoutes } from "./admin/logs-routes.js";
import { registerAdminFileRegistryRoutes } from "./admin/file-registry-routes.js";

// 复导 AdminRouteDeps 保持向后兼容
export type { AdminRouteDeps } from "./admin/types.js";

/**
 * 注册所有 /admin/* 路由（委托各子模块）
 */
export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext, deps: AdminRouteDeps): { adminProviderRouteHandlers: AppShellThinEntryHandlers["adminProviders"] } {
  // ---- 反向解析：Attempts & Traces ----

  app.get("/admin/reverse/attempts", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { limit?: string };
    const rawLimit = query.limit ? Number(query.limit) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
    const items: ReverseAttempt[] = [...await ctx.repos.reverseAttempts.list()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return { items };
  });

  app.get("/admin/reverse/traces", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { limit?: string };
    const rawLimit = query.limit ? Number(query.limit) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
    const traces: ReverseTrace[] = [...await ctx.repos.reverseTraces.list()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
    return { traces };
  });

  // ---- 热榜趋势 ----

  app.get("/admin/trends/entries", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { type?: "realtime" | "video"; limit?: string };
    const rawLimit = query.limit ? Number(query.limit) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
    const items: TrendEntry[] = [...await ctx.repos.trendEntries.list()]
      .filter((item) => (query.type ? item.trendType === query.type : true))
      .sort((a, b) => b.syncedAt - a.syncedAt)
      .slice(0, limit);
    return { items };
  });

  app.get("/admin/trends/sync-jobs", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { limit?: string };
    const rawLimit = query.limit ? Number(query.limit) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
    const items: TrendSyncJob[] = [...await ctx.repos.trendSyncJobs.list()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
    return { items };
  });

  app.get("/admin/trends/douhot/health", async (request) => {
    await requireAdmin(ctx, request);
    const adapter = deps.buildDouhotAdapter();
    return await adapter.health();
  });

  app.get("/admin/trends/douhot/auth-status", async (request) => {
    await requireAdmin(ctx, request);
    const adapter = deps.buildDouhotAdapter();
    return await adapter.authStatus();
  });

  app.post("/admin/trends/douhot/refresh-session", async (request) => {
    await requireAdmin(ctx, request);
    const adapter = deps.buildDouhotAdapter();
    return await adapter.refreshSession();
  });

  // ---- 配置 ----

  // 敏感字段列表（仅 admin 可见，普通用户返回脱敏值）
  const SENSITIVE_CONFIG_KEYS: (keyof AppConfig)[] = [
    "apifyReverseApiToken",
    "tikhubApiToken",
    "anytocopyReverseApiToken",
    "ossSecretAccessKey",
  ];

  app.get("/admin/config", async (request) => {
    const config = ctx.configService.get();
    try {
      await requireAdmin(ctx, request);
      // admin 返回完整配置
      return { config };
    } catch {
      // 非 admin 返回脱敏配置
      const sanitized = { ...config };
      for (const key of SENSITIVE_CONFIG_KEYS) {
        (sanitized as Record<string, unknown>)[key] = "***";
      }
      return { config: sanitized };
    }
  });

  app.patch("/admin/config", async (request) => {
    const actor = await requireAdmin(ctx, request);
    const body = request.body as Partial<AppConfig>;
    const result = await ctx.adminConfigService.update(actor, body);
    return { config: result };
  });

  // ---- RouteKey 积分成本配置 ----

  /**
   * 获取所有 RouteKey 积分成本配置
   * GET /admin/config/route-key-credit-costs
   *
   * 返回格式：
   * - allKeys: 所有 RouteKey（包括未配置的，cost 为 null）
   * - configuredKeys: 已配置的 RouteKey
   */
  app.get("/admin/config/route-key-credit-costs", async (request) => {
    await requireAdmin(ctx, request);

    // 获取所有 RouteKey 定义
    const { ALL_PROVIDER_ROUTE_KEYS } = await import("../contracts/provider-route-keys.js");

    // 获取已配置的定价
    const records = await ctx.creditPricingService.getAllPricingDetails();
    const configuredMap = new Map(records.map((r) => [r.routeKey, r]));

    // RouteKey 描述映射（与前端 ROUTE_KEY_DESCRIPTIONS 保持一致）
    const descriptions: Record<string, string> = {
      step1_fashion_analysis: "服饰分析",
      step1_fashion_search: "服饰搜索 LLM 增强",
      step1_role_preset: "角色预设生成",
      image_project_step1_selling_points: "卖点提取（图片项目）",
      step2_five_view_generation_child: "五视图生成 - 儿童（≤17岁）",
      step2_five_view_generation_adult: "五视图生成 - 成人（≥18岁）",
      step3_realtime_script_generation: "实时热点脚本生成",
      step3_hot_deep_analysis: "热点深度分析",
      step3_storyboard_image: "分镜图生成",
      step3_storyboard_image_child: "分镜图生成 - 儿童（≤17岁）",
      step3_storyboard_image_adult: "分镜图生成 - 成人（≥18岁）",
      step3_storyboard_prompt: "分镜提示词工程",
      step3_custom_script_generation: "场景化种草脚本生成",
      step3_custom_script_concept: "场景化脚本概念生成",
      step3_fashion_script_generation: "时尚大片脚本生成",
      step3_fashion_script_concept: "时尚大片视觉概念生成",
      step3_emotion_archetype_generation: "情感原型脚本生成",
      step3_emotion_archetype_outline: "情感原型大纲生成",
      script_effectiveness_generation: "种草脚本生成",
      step3_aesthetic_script_generation: "生活美学脚本生成",
      step3_product_showcase_script_generation: "产品展示脚本生成",
      step3_product_showcase_script_concept: "产品展示视觉概念生成",
      step3_story_theme_concept: "主题叙事-主题构思",
      step3_story_theme_outline: "主题叙事-故事大纲",
      step3_story_theme_generation: "主题叙事-分镜展开",
      step3_resonance_story_concept: "共鸣故事-概念生成",
      step3_resonance_story_generation: "共鸣故事-分镜展开",
      step3_video_script_rewrite: "视频热榜脚本改写",
      step3_library_script_rewrite: "库脚本改写",
      step3_product_showcase_script_rewrite: "产品展示脚本改写",
      script_quality_scoring: "脚本质量评分",
      prompt_evolution_generation: "Prompt 进化提案生成",
      image_project_step3_model_photo: "模特图生成",
      image_project_step3_model_plan: "模特图规划 - 成人",
      image_project_step3_model_plan_child: "模特图规划 - 儿童",
      image_project_step3_multi_person_plan: "多人模特图规划",
      image_project_step3_multi_person_photo: "多人模特图生成",
      step4_clip_video_generation_child: "分镜视频生成 - 儿童（≤17岁）",
      step4_clip_video_generation_adult: "分镜视频生成 - 成人（≥18岁）",
      step4_video_export: "视频导出",
      fission_video_generation_child: "裂变视频生成 - 儿童（≤17岁）",
      fission_video_generation_adult: "裂变视频生成 - 成人（≥18岁）",
      fission_story_generation: "裂变故事生成",
      fission_storyboard_prompt: "裂变分镜提示词工程",
      fission_storyboard_image_child: "裂变分镜图片生成 - 儿童（≤17岁）",
      fission_storyboard_image_adult: "裂变分镜图片生成 - 成人（≥18岁）",
      square_video_reverse: "广场反推",
      square_creator_evaluation: "广场达人评估",
      hot_trend_video_reverse: "热榜反推",
      library_portrait_detect: "人像检测",
      garment_flat_lay_generation: "服饰平铺图生成",
      outfit_change_image_generation: "换装图片生成",
      outfit_change_video_edit: "换装视频编辑",
      music_atmosphere_analysis: "音乐氛围分析",
      aesthetic_feature_extraction: "审美特征提取",
      scene_feature_extraction: "场景特征提取",
      emotion_archetype_extraction: "情感原型提取",
      text_generation: "文本生成测试",
      image_generation: "图片生成测试",
      video_generation: "视频生成测试",
    };

    // 构建所有 RouteKey 列表（已配置的有 cost，未配置的 cost 为 null）
    const allKeys = ALL_PROVIDER_ROUTE_KEYS.map((key) => {
      const configured = configuredMap.get(key);
      return {
        key,
        cost: configured?.creditCost ?? null,
        description: descriptions[key] ?? key,
      };
    });

    return {
      success: true,
      data: { allKeys },
    };
  });

  /**
   * 更新单个 RouteKey 积分成本
   * PUT /admin/config/route-key-credit-costs/:key
   */
  app.put("/admin/config/route-key-credit-costs/:key", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { key: string };
    const body = (request.body as { cost?: number }) ?? {};

    const routeKey = params.key;
    const creditCost = body.cost;

    if (creditCost === undefined || !Number.isInteger(creditCost) || creditCost < 0) {
      return { success: false, error: "积分成本必须为非负整数" };
    }

    const result = await ctx.creditPricingService.setPricing(
      routeKey,
      creditCost,
      undefined,
      undefined,
      admin.id,
      "管理员更新积分成本",
    );

    return {
      success: true,
      data: {
        key: result.routeKey,
        cost: result.creditCost,
      },
    };
  });

  /**
   * 删除单个 RouteKey 积分成本（失效）
   * DELETE /admin/config/route-key-credit-costs/:key
   */
  app.delete("/admin/config/route-key-credit-costs/:key", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { key: string };

    await ctx.creditPricingService.deactivatePricing(
      params.key,
      admin.id,
      "管理员删除积分成本配置",
    );

    return {
      success: true,
      message: `已删除 ${params.key} 的积分成本配置`,
    };
  });

  // ---- 业务配置 ----

  app.get("/admin/business-configs", async (request) => {
    await requireAdmin(ctx, request);
    const items = await ctx.businessConfigService.listAll();
    return { items };
  });

  app.get("/admin/business-configs/:module", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { module: string };
    const config = ctx.businessConfigService.getRaw(params.module as any);
    if (!config) {
      return { module: params.module, config: null, description: null };
    }
    return { module: params.module, config };
  });

  app.patch("/admin/business-configs/:module", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { module: string };
    const body = request.body as { config: Record<string, unknown>; description?: string };
    const user = await requireAdmin(ctx, request);
    await ctx.businessConfigService.update(params.module, body.config, body.description, user.id);
    return { module: params.module, config: ctx.businessConfigService.getRaw(params.module as any), description: body.description ?? null };
  });

  // ---- 任务队列状态 ----

  app.get("/admin/task-queue-status", async (request) => {
    await requireAdmin(ctx, request);
    const repos = ctx.repos;
    const [globalActive, pendingCount, runningCount, byType] = await Promise.all([
      repos.asyncJobs.countActive(),
      repos.asyncJobs.countByStatus("pending"),
      repos.asyncJobs.countByStatus("running"),
      repos.asyncJobs.countByTypeAndStatus(),
    ]);
    return {
      globalActiveCount: globalActive,
      pendingCount,
      runningCount,
      byType: byType.map((r) => ({ jobType: r.job_type, status: r.status, count: r.count })),
    };
  });

  // ---- 审核队列 ----

  app.get("/admin/reviews", async (request) => {
    await requireAdmin(ctx, request);
    const reviews = await Promise.all([...await ctx.repos.reviewRequests.list()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(async (item) => {
        const user = await ctx.repos.users.findById(item.userId);
        return {
          ...item,
          userEmail: user?.email ?? "unknown",
        };
      }));
    return { reviews };
  });

  // ---- 任务清理（管理员专属）----

  app.post("/admin/tasks/clear", async (request) => {
    const user = await requireAdmin(ctx, request);
    const now = Date.now();
    const repos = ctx.repos;

    const jobsToClear = await repos.asyncJobs.findActiveByUserId(user.id);
    const stoppedCount = await repos.asyncJobs.failActiveByUserId(user.id, now);

    for (const row of jobsToClear) {
      sseManager.pushToUser(user.id, {
        type: "job_failed", jobId: row.id, jobType: row.job_type,
        status: "failed", error: { code: "ADMIN_CLEAR", message: "管理员清理任务" }, timestamp: now,
      });
    }

    const deletedCount = await repos.asyncJobs.deleteByUserId(user.id);

    return { ok: true, stoppedCount, deletedCount };
  });

  // ---- 任务管理面板（Admin Task Management）----

  app.get("/admin/tasks/stats", async (request) => {
    await requireAdmin(ctx, request);
    const statusMap = await ctx.repos.asyncJobs.countGroupByStatus();
    const stats = { pending: 0, running: 0, completed: 0, failed: 0, expired: 0 };
    for (const [status, count] of Object.entries(statusMap)) {
      if (status in stats) stats[status as keyof typeof stats] = count;
    }
    const sseStats = ctx.sseManager?.getStats() ?? { connections: 0, users: 0 };
    return { tasks: stats, sse: sseStats };
  });

  app.get("/admin/tasks/list", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { status?: string; jobType?: string; userId?: string; limit?: string };
    const rawLimit = query.limit ? Number(query.limit) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;

    const rows = await ctx.repos.asyncJobs.findListWithFilters({ ...query, limit });

    const userIds = [...new Set(rows.map((r) => r.user_id as string))];
    const userEmailMap = await ctx.repos.users.findEmailsByIds(userIds);

    return {
      tasks: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: userEmailMap.get(row.user_id as string) ?? "unknown",
        jobType: row.job_type,
        projectId: row.project_id,
        status: row.status,
        stage: row.stage,
        error: row.error,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        parentJobId: row.parent_job_id,
      })),
    };
  });

  app.get("/admin/tasks/:jobId/provider-calls", async (request) => {
    await requireAdmin(ctx, request);
    const { jobId } = request.params as { jobId: string };
    const rows = await ctx.repos.providerCallAudits.findByAsyncJobId(jobId);
    return {
      calls: rows.map((row) => ({
        id: row.id,
        providerId: row.provider_id,
        routeKey: row.route_key,
        status: row.status,
        latencyMs: row.latency_ms,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        requestSummary: row.request_summary,
        responseSummary: row.response_summary,
        createdAt: Number(row.created_at),
        actualModel: row.actual_model,
        providerVendor: row.provider_vendor,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        ttftMs: row.ttft_ms,
        callMode: row.call_mode,
        messagesJson: row.messages_json,
        queryParamsJson: row.query_params_json,
      })),
    };
  });

  // ---- 委托子模块 ----

  registerAdminUsersRoutes(app, ctx, deps);
  registerAdminScriptsHotTrendsRoutes(app, ctx, deps);
  registerAdminScriptsRoutes(app, ctx, deps);
  registerAdminCreditAuditsRoute(app, ctx, deps);

  const { adminProviderRouteHandlers } = registerAdminProviderRoutes(app, ctx, deps);
  registerAdminCapabilityLabRoutes(app, ctx, deps);
  registerLogsRoutes(app, ctx);
  registerAdminFileRegistryRoutes(app, ctx);

  return { adminProviderRouteHandlers };
}
