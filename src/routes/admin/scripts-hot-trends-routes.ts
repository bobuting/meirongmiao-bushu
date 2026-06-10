/**
 * admin/scripts-hot-trends-routes.ts
 * 从 admin-routes.ts 提取的 /admin/scripts/hot-trends/* 路由
 *
 * 数据模型（统一后）：
 * - nrm_hot_trend_assets: 热榜资产基础信息 + 视频元数据
 * - nrm_script_data: LLM 分析结果（脚本内容、标签等）
 * - 两表通过 nrm_hot_trend_assets.script_id 关联
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ScriptTypeValue } from "../../contracts/types.js";
import type { AdminRouteDeps } from "./types.js";

import { AppError } from "../../core/errors.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import type { HotTrendSyncTriggerType, HotTrendSyncLogStatus } from "../../modules/hot-trend-sync.js";
import {
  mapReverseStoryboardReportToSegments,
} from "../../modules/reverse-storyboard-report-mapper.js";
import {
  HOT_TREND_KEY_PREFIX,
  HOT_TREND_TYPE_PREFIX,
  HOT_TREND_REASON_PREFIX,
  HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS,
  HOT_TREND_EVIDENCE_PREFIX,
  parseHotTrendReason,
  parseHotTrendLabels,
  parseHotTrendRecommendedTag,
  resolveHotTrendSmartStoryboardClass,
  normalizeHotTrendKey,
  sanitizeTagValue,
  guessHotTrendLabels,
  sanitizeHotTrendNarrativeText,
  clampHotTrendStep3DurationSec,
  buildHotTrendSceneSettings,
  limitHotTrendShotBreakdowns,
  buildHotTrendStructuredAsset,
  buildHotTrendSmartStoryboardClassTag,
  resolveHotTrendAssetSourceUrl,
  buildHotTrendAssetContent,
  summarizeHotTrendAuditSnippet,
} from "../../modules/hot-trend/index.js";

// ---------------------------------------------------------------------------
// 辅助类型
// ---------------------------------------------------------------------------

/** 热榜资产查询结果（JOIN script_data 原始行） */
interface HotTrendAssetRow {
  id: string;
  topic: string;
  url: string | null;
  rank: number | null;
  hot_value: string | null;
  section: string | null;
  source: string;
  trend_type: string;
  script_id: string | null;
  source_oss_url: string | null;
  updated_at: number;
  created_at: number;
  item_id: string | null;
  status: string | null;
  video_title: string | null;
  video_url: string | null;
  audio_url: string | null;
  create_time: number | null;
  play_count: number | null;
  comment_count: number | null;
  digg_count: number | null;
  share_count: number | null;
  collect_count: number | null;
  recommend_count: number | null;
  nickname: string | null;
  duration: number | null;
  script_text: string | null;
  sd_title: string | null;
  sd_content: string | null;
  sd_duration_seconds: number | null;
  sd_primary_emotion: string | null;
  sd_video_type: string | null;
  sd_video_style: string | null;
  sd_fashion_suitable: boolean | null;
  sd_on_screen_presence: string | null;
  sd_emotion_detail: Record<string, unknown> | null;
  sd_fashion_reason: string | null;
  sd_emotion_arc: string | null;
  sd_fashion_styles: Record<string, unknown> | null;
  sd_editing_analysis: Record<string, unknown> | null;
  sd_shot_prompts: Record<string, unknown> | null;
  sd_basic_info: string | null;
  sd_role_table: string | null;
  sd_outfit_table: string | null;
  sd_storyboard: string | null;
  sd_main_scene: string | null;
  sd_atmosphere: string | null;
}

// ---------------------------------------------------------------------------
// 顶层函数
// ---------------------------------------------------------------------------

/** 将数据库行转为前端响应格式 */
function mapRowToResponse(row: HotTrendAssetRow): Record<string, unknown> {
  const tags: string[] = [];
  const trendType = row.trend_type || "realtime";
  const title = row.sd_title ?? row.video_title ?? row.topic;
  const content = row.sd_content ?? row.script_text ?? "";
  const sourceUrl = row.video_url ?? row.url;

  const hotTrendLabels: Record<string, unknown> = {};
  if (row.sd_primary_emotion) hotTrendLabels.primaryEmotion = row.sd_primary_emotion;
  if (row.sd_video_type) hotTrendLabels.videoType = row.sd_video_type;
  if (row.sd_video_style) hotTrendLabels.videoStyle = row.sd_video_style;
  if (row.sd_fashion_reason) hotTrendLabels.fashionReason = row.sd_fashion_reason;
  if (row.sd_emotion_detail) hotTrendLabels.emotionDetail = row.sd_emotion_detail;
  if (row.sd_emotion_arc) hotTrendLabels.emotionArc = row.sd_emotion_arc;
  if (row.sd_fashion_styles) hotTrendLabels.fashionStyles = row.sd_fashion_styles;
  if (row.sd_editing_analysis) hotTrendLabels.editingAnalysis = row.sd_editing_analysis;
  if (row.sd_shot_prompts) hotTrendLabels.shotPrompts = row.sd_shot_prompts;
  if (row.sd_basic_info) hotTrendLabels.basicInfo = row.sd_basic_info;
  if (row.sd_role_table) hotTrendLabels.roleTable = row.sd_role_table;
  if (row.sd_outfit_table) hotTrendLabels.outfitTable = row.sd_outfit_table;
  if (row.sd_storyboard) hotTrendLabels.storyboard = row.sd_storyboard;
  if (row.sd_main_scene) hotTrendLabels.mainScene = row.sd_main_scene;
  if (row.sd_atmosphere) hotTrendLabels.atmosphere = row.sd_atmosphere;
  if (row.sd_on_screen_presence) hotTrendLabels.onScreenPresence = row.sd_on_screen_presence;

  return {
    id: row.id,
    title,
    tags,
    content,
    ownerId: "",
    ownerEmail: "db",
    date: row.updated_at,
    status: row.script_id ? "generated" : "pending",
    currentVersion: 1,
    trendType,
    reason: "",
    sourceUrl,
    ossUrl: row.source_oss_url,
    rank: row.rank,
    suitability: row.sd_fashion_suitable === true ? "high" : row.sd_fashion_suitable === false ? "low" : "medium",
    humanPresence: row.sd_on_screen_presence ?? "uncertain",
    hotTrendLabels,
    itemId: row.item_id,
    videoTitle: row.video_title,
    videoUrl: row.video_url,
    playCount: row.play_count,
    diggCount: row.digg_count,
    duration: row.duration,
    nickname: row.nickname,
  };
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

export function registerAdminScriptsHotTrendsRoutes(app: FastifyInstance, ctx: AppContext, deps: AdminRouteDeps): void {
  const {
    resolveTikHubTokenForUser,
    syncHotTrendAssets,
    listHotTrendSyncLogs,
    normalizeReverseParseVideoUrl,
    runSharedVideoUrlReversePipelineForUser,
    resolveHotTrendSyncIntervalMs,
  } = deps;

  const repos = ctx.repos;

  // GET /admin/scripts/hot-trends — 获取热榜资产列表（支持分页）
  app.get("/admin/scripts/hot-trends", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { trendType?: string; page?: string; pageSize?: string } | undefined;

    const trendType = query?.trendType === "video" ? "video" : query?.trendType === "realtime" ? "realtime" : undefined;
    const pageSize = Math.max(1, Math.min(200, Number(query?.pageSize ?? 50)));
    const page = Math.max(1, Number(query?.page ?? 1));
    const offset = (page - 1) * pageSize;

    const [result, realtimeTotal, videoTotal] = await Promise.all([
      repos.hotTrendAssets.findWithScriptDataPaginated({ trendType, limit: pageSize, offset }),
      repos.hotTrendAssets.countByTrendType("realtime"),
      repos.hotTrendAssets.countByTrendType("video"),
    ]);
    const scripts = result.rows.map((row) => mapRowToResponse(row as unknown as HotTrendAssetRow));

    return {
      scripts,
      total: result.total,
      page,
      pageSize,
      realtimeTotal,
      videoTotal,
      intervalMs: resolveHotTrendSyncIntervalMs("realtime"),
      intervalMsByType: {
        realtime: resolveHotTrendSyncIntervalMs("realtime"),
        video: resolveHotTrendSyncIntervalMs("video"),
      },
    };
  });

  // POST /admin/scripts/hot-trends/sync — 同步热榜
  app.post("/admin/scripts/hot-trends/sync", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as { force?: boolean; type?: "realtime" | "video" | "all" } | undefined) ?? {};
    const force = body.force === true;
    const type = body.type ?? "all";
    const tokenOverride = await resolveTikHubTokenForUser(admin.id);
    const results =
      type === "all"
        ? await Promise.all([
          syncHotTrendAssets("realtime", force, tokenOverride, "manual"),
          syncHotTrendAssets("video", force, tokenOverride, "manual"),
        ])
        : [await syncHotTrendAssets(type, force, tokenOverride, "manual")];
    return {
      synced: results.map((entry) => ({
        type: entry.type,
        syncedAt: entry.syncedAt,
        nextSyncAt: entry.nextSyncAt,
        topicCount: entry.topics.length,
        topics: entry.topics,
        updatedAt: entry.updatedAt,
        analysisSource: entry.analysisSource,
        videoFetchGuard: entry.type === "video" ? entry.videoFetchGuard ?? null : null,
      })),
    };
  });

  // POST /admin/scripts/hot-trends — 创建热榜资产（管理员手动添加）
  app.post("/admin/scripts/hot-trends", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as
      | {
        title: string;
        content: string;
        tags?: string[];
        ownerEmail?: string;
        trendType?: "realtime" | "video";
        reason?: string;
        videoUrl?: string;
      }
      | undefined) ?? { title: "", content: "" };
    const owner =
      (body.ownerEmail ? await repos.users.findById(body.ownerEmail.trim().toLowerCase()) : null) ?? admin;
    if (!owner) {
      throw new AppError(404, "OWNER_NOT_FOUND", "Owner user not found");
    }
    const trendType = body.trendType === "video" ? "video" : "realtime";
    const title = body.title.trim();
    const content = body.content.trim();
    if (!title || !content) {
      throw new AppError(400, "TITLE_OR_CONTENT_REQUIRED", "Title and content are required");
    }
    const key = normalizeHotTrendKey(trendType, title);
    const reason = body.reason?.trim() || "管理员手动维护的热榜脚本资产。";
    const tags = [
      ...new Set([
        ...(body.tags ?? []),
        "#热榜脚本",
        `${HOT_TREND_TYPE_PREFIX}${trendType}`,
        `${HOT_TREND_REASON_PREFIX}${sanitizeTagValue(reason)}`,
        `${HOT_TREND_KEY_PREFIX}${sanitizeTagValue(key)}`,
      ]),
    ];

    const now = Date.now();
    const id = ctx.clock.generateId();

    // 检查是否已存在（按 topic 查询）
    const existing = await repos.hotTrendAssets.findByTopicAndType(title, trendType);

    if (existing) {
      await repos.hotTrendAssets.updateTopic(existing.id, title, now);
      await ctx.scriptLibraryService.update(owner.id, existing.id, { title, content, tags });
      return { id: existing.id, title, trendType, reason, deduped: true };
    }

    // 创建新记录
    await repos.hotTrendAssets.insertManual({
      id,
      topic: title,
      videoUrl: body.videoUrl ?? null,
      trendType,
      createdAt: now,
    });

    // 创建关联的 script_data
    const scriptType: ScriptTypeValue = trendType === "video" ? 3 : 4;
    const scriptData = await ctx.scriptLibraryService.create(owner.id, {
      title,
      content,
      type: scriptType,
      tags,
    });

    // 更新 hot_trend_assets 的 script_id 关联
    await repos.hotTrendAssets.updateScriptId(id, scriptData.id);

    return { id, title, trendType, reason, deduped: false };
  });

  // PATCH /admin/scripts/hot-trends/:scriptId — 更新热榜资产
  app.patch("/admin/scripts/hot-trends/:scriptId", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { scriptId: string };
    const scriptId = params.scriptId;
    const body = (request.body as Partial<{
      title: string;
      content: string;
      tags: string[];
      trendType: "realtime" | "video";
      reason: string;
    }> | undefined) ?? {};

    const asset = await repos.hotTrendAssets.findByIdBasic(scriptId);
    if (!asset) {
      throw new AppError(404, "NOT_FOUND", "Hot trend asset not found");
    }

    const trendType = (body.trendType ?? asset.trend_type ?? "realtime") as "video" | "realtime";
    const title = body.title?.trim() || asset.topic;
    const reason = body.reason?.trim() || "";
    const _key = normalizeHotTrendKey(trendType, title);
    const tags = body.tags ?? [];

    await repos.hotTrendAssets.updateTopicAndType(scriptId, title, trendType, Date.now());
    await ctx.scriptLibraryService.update("", scriptId, { title, content: body.content, tags });

    return { id: scriptId, title, trendType, reason, deduped: false };
  });

  // DELETE /admin/scripts/hot-trends/:scriptId — 删除热榜资产
  app.delete("/admin/scripts/hot-trends/:scriptId", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { scriptId: string };
    const scriptId = params.scriptId;

    // 查找 asset 并获取其 script_id
    const asset = await repos.hotTrendAssets.findByIdWithScriptId(scriptId);

    // 删除关联的 script_data
    if (asset?.script_id) {
      await repos.scriptData.delete(asset.script_id);
      request.log.info({ scriptId, scriptDataId: asset.script_id }, "deleted linked script_data");
    }

    // 删除 asset 本身
    await repos.hotTrendAssets.delete(scriptId);
    request.log.info({ scriptId }, "deleted hot trend asset from DB");

    return { ok: true };
  });

  // POST /admin/scripts/hot-trends/batch-delete — 批量删除
  app.post("/admin/scripts/hot-trends/batch-delete", async (request) => {
    await requireAdmin(ctx, request);
    const body = (request.body as { scriptIds?: string[] } | undefined) ?? {};
    const scriptIds = [...new Set((body.scriptIds ?? []).map((item) => String(item).trim()).filter((item) => item.length > 0))];

    // 查找所有 assets 及其 script_id
    const assets = await repos.hotTrendAssets.findByIdsWithScriptId(scriptIds);
    const scriptDataIds = assets.map((row) => row.script_id).filter((id): id is string => id !== null);

    if (scriptDataIds.length > 0) {
      await repos.scriptData.deleteByIds(scriptDataIds);
      request.log.info({ count: scriptDataIds.length }, "deleted linked scripts_data");
    }

    const deleted = await repos.hotTrendAssets.deleteByIds(scriptIds);
    return { ok: true, deleted };
  });

  // POST /admin/scripts/hot-trends/:scriptId/reverse-to-smart-storyboard — 反推到智能分镜库
  app.post("/admin/scripts/hot-trends/:scriptId/reverse-to-smart-storyboard", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { scriptId: string };

    // 查询资产（JOIN script_data）
    const assetRow = await repos.hotTrendAssets.findByIdWithScriptData(params.scriptId);
    if (!assetRow) {
      throw new AppError(404, "NOT_FOUND", "Hot trend asset not found");
    }

    const asset = assetRow as unknown as HotTrendAssetRow;

    const sourceUrl = resolveHotTrendAssetSourceUrl({
      sourceUrl: asset.video_url ?? null,
      content: asset.sd_content ?? "",
    });
    if (!sourceUrl) {
      throw new AppError(400, "SOURCE_URL_REQUIRED", "Hot trend asset is missing a source url");
    }

    // 去重：检查是否已有该资产关联的智能分镜
    const keyTag = `${HOT_TREND_KEY_PREFIX}${sanitizeTagValue(normalizeHotTrendKey("video", asset.sd_title ?? asset.topic))}`;
    const existingSmart = (await ctx.smartStoryboardLibraryService
      .listForAdmin(admin, {
        ownerUserId: admin.id,
        category: "video_hot_trend_copy",
        trendType: "video",
      }))
      .find((item) => {
        const smartClass = resolveHotTrendSmartStoryboardClass({
          tags: item.tags,
          trendType: item.sourceRef.trendType,
        });
        if (smartClass !== "video_shot") return false;
        return (
          item.relationRef.sourceAssetScriptId === asset.id ||
          item.tags.includes(`#${keyTag}`)
        );
      });

    if (existingSmart) {
      return { ok: true, sourceAssetId: asset.id, smartStoryboardId: existingSmart.id, deduplicated: true };
    }

    const normalizedVideoUrl = normalizeReverseParseVideoUrl(sourceUrl);
    const sharedPipelineResult = await runSharedVideoUrlReversePipelineForUser(normalizedVideoUrl, {
      userId: admin.id,
      projectId: null,
    });

    const tags: string[] = [];
    const labels = parseHotTrendLabels(tags);
    const normalizedLabels = labels.length > 0 ? labels : guessHotTrendLabels(asset.sd_title ?? asset.topic, "video");
    const reverseSourceScriptText = sanitizeHotTrendNarrativeText(sharedPipelineResult.multimodalResult.result);
    const durationSec = clampHotTrendStep3DurationSec(asset.duration ?? null, 20);
    const sceneSettings = buildHotTrendSceneSettings({
      trendType: "video",
      labels: normalizedLabels,
      topicLabel: asset.sd_title ?? asset.topic,
      scriptBody: reverseSourceScriptText,
    });
    const storyboardSegments = limitHotTrendShotBreakdowns(
      mapReverseStoryboardReportToSegments(sharedPipelineResult.storyboardPanel.report, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS),
    );
    const structuredAsset = buildHotTrendStructuredAsset({
      topicLabel: asset.sd_title ?? asset.topic,
      trendType: "video",
      labels: normalizedLabels,
      scriptContent: reverseSourceScriptText,
      durationSec,
      sceneSettings,
      storyboardSegments,
    });
    const smartTags = [
      "#智能分镜",
      "#视频热榜镜头",
      buildHotTrendSmartStoryboardClassTag("video_shot"),
      `#${keyTag}`,
      ...normalizedLabels.map((label) => `#${sanitizeTagValue(label)}`),
    ];
    const sourceRef = {
      trendType: "video" as const,
      trendEntryId: null,
      trendSyncJobId: null,
      trendRank: asset.rank ?? null,
      sourceUrl: sharedPipelineResult.resolvedVideoUrl,
      sourceTitle: asset.sd_title ?? asset.topic,
      sourceHash: null,
      recommended: parseHotTrendRecommendedTag(tags) ?? false,
      recommendationReason: parseHotTrendReason(tags),
    };
    const relationRef = {
      sourceAssetScriptId: asset.id,
      reverseStoryboardLibraryId: null,
      reverseBatchId: null,
    };

    const smartTitle = `${asset.sd_title ?? asset.topic} - 智能分镜`;
    const smartSummary =
      summarizeHotTrendAuditSnippet(reverseSourceScriptText, 180) || `${asset.sd_title ?? asset.topic} 视频热榜故事分镜`;

    const savedSmart = await ctx.smartStoryboardLibraryService.create(admin, {
      ownerUserId: admin.id,
      title: smartTitle,
      summary: smartSummary,
      tags: smartTags,
      category: "video_hot_trend_copy",
      sourceRef,
      relationRef,
      reverseSourceScriptText,
      report: sharedPipelineResult.storyboardPanel.report,
      content: structuredAsset.storyboardMarkdown,
    });

    // 更新资产标签
    const nextTags = [
      ...new Set(
        tags
          .filter((tag) => tag !== "#创作推断" && !tag.startsWith(HOT_TREND_EVIDENCE_PREFIX))
          .concat([`${HOT_TREND_EVIDENCE_PREFIX}reverse_verified`, "#反推实证", "#共享反推链路"]),
      ),
    ];
    const now = Date.now();
    await repos.hotTrendAssets.updateTopic(asset.id, asset.topic, now);
    if (asset.script_id) {
      await ctx.scriptLibraryService.update(admin.id, asset.script_id, { tags: nextTags });
    }

    return { ok: true, sourceAssetId: asset.id, smartStoryboardId: savedSmart.id };
  });

  // POST /admin/scripts/hot-trends/video-prune-unlinked — 清理无源链接的视频资产
  app.post("/admin/scripts/hot-trends/video-prune-unlinked", async (request) => {
    await requireAdmin(ctx, request);
    const body = (request.body as { rebuildLinked?: boolean } | undefined) ?? {};
    const rebuildLinked = body.rebuildLinked === true;

    // 查询视频热榜资产
    const page = await repos.hotTrendAssets.findWithScriptDataPaginated({ trendType: "video" });
    const rows = page.rows as unknown as HotTrendAssetRow[];

    let deleted = 0;
    let rebuilt = 0;

    for (const asset of rows) {
      const sourceUrl = resolveHotTrendAssetSourceUrl({
        sourceUrl: asset.video_url ?? null,
        content: asset.sd_content ?? "",
      });

      if (!sourceUrl) {
        // 删除无源链接的资产
        await repos.hotTrendAssets.delete(asset.id);
        if (asset.script_id) {
          await repos.scriptData.delete(asset.script_id);
        }
        deleted += 1;
        continue;
      }

      if (!rebuildLinked) continue;

      // 重建链接资产
      const originalTitle = asset.video_title ?? asset.topic;
      const nextContent = buildHotTrendAssetContent({
        topicLabel: originalTitle,
        trendType: "video",
        sourceUrl,
        rank: asset.rank ?? 99,
        labels: [],
      });

      await repos.hotTrendAssets.updateVideoUrl(asset.id, sourceUrl, Date.now());
      if (asset.script_id) {
        await ctx.scriptLibraryService.update("", asset.script_id, { title: originalTitle, content: nextContent });
      }
      rebuilt += 1;
    }

    return { ok: true, deleted, rebuilt };
  });

  // GET /admin/scripts/hot-trends/sync-logs — 查询同步运行记录（分页）
  app.get("/admin/scripts/hot-trends/sync-logs", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      page?: string;
      limit?: string;
      triggerType?: HotTrendSyncTriggerType;
      trendType?: "realtime" | "video";
      status?: HotTrendSyncLogStatus;
    };

    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));

    const result = await listHotTrendSyncLogs({
      page,
      limit,
      triggerType: query.triggerType,
      trendType: query.trendType,
      status: query.status,
    });
    return reply.send(result);
  });

  // GET /admin/hot-trend/daily-reports — 查询每日热点报告（分页）
  app.get("/admin/hot-trend/daily-reports", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as { page?: string; limit?: string };

    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || "15", 10)));
    const offset = (page - 1) * limit;

    const [total, items] = await Promise.all([
      repos.hotTrendDailyReports.count(),
      repos.hotTrendDailyReports.findPaginated(limit, offset),
    ]);

    return reply.send({ items, total, page, limit });
  });

  // GET /admin/hot-trend/daily-reports/:reportDate — 查看单份报告详情
  app.get("/admin/hot-trend/daily-reports/:reportDate", async (request, reply) => {
    await requireAdmin(ctx, request);
    const params = request.params as { reportDate: string };

    const report = await repos.hotTrendDailyReports.findByReportDate(params.reportDate);
    if (!report) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "未找到该日期的报告" });
    }
    return reply.send(report);
  });
}
