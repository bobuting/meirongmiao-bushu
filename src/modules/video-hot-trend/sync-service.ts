/**
 * 视频热榜同步服务
 * 主同步流程的实现，使用依赖注入模式
 *
 * 新流程：数据获取 → 立即存原始数据 → 直接返回 → 异步 LLM 反推
 * LLM 反推流程：下载视频 → 上传 OSS → 保存 ossUrl 到资产表 → 调用核心管道
 */

import type { SquareTrendTopic, HotTrendType } from "../../contracts/hot-trend-base.js";
import type {
  VideoHotTrendSyncDeps,
  VideoHotTrendSyncInput,
  VideoHotTrendSyncResult,
  // VideoHotTrendSyncStats,
  VideoHotTrendResolvedProvider,
} from "../../contracts/video-hot-trend-sync-contract.js";
// import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";

import { AppError } from "../../core/errors.js";
import {
  normalizeHotTrendKey,
} from "./utils.js";
import {
  resolveVideoSourceUrl,
} from "./sync-handler.js";

// 核心反推管道（Phase 04）
import {
  runCoreReversePipeline,
  createBatchReverseAdapter,
  mapToBatchResult,
} from "../video-reverse-core/index.js";
import type {
  CoreReverseInput,
  // CoreReverseAuditContext,
} from "../video-reverse-core/types.js";
import type { LlmReverseOutput } from "../video-reverse-core/normalize-output.js";

import { ScriptType } from "../../contracts/types.js";

// SquareTrendTopic 在契约中定义，这里用别名语义化
type HotVideoItem = SquareTrendTopic;

// ============================================================================
// 常量
// ============================================================================

// ============================================================================
// 辅助类型
// ============================================================================

/** 带排名的视频项 */
interface RankedVideo {
  video: HotVideoItem;
  sourceIndex: number;
  rank: number;
}

/** LLM 反推结果 */
interface LlmReverseResult {
  videoKey: string;       // 去重键，如 "video:穿搭教程"
  videoTitle: string;     // 视频标题
  rank: number;
  sourceUrl: string;      // 视频URL
  ossUrl: string | null;  // OSS 公开 URL
  status: "success" | "failed";
  output: LlmReverseOutput | null;
  errorCode: string | null;
  errorMessage: string | null;
}

// ============================================================================
// 服务创建
// ============================================================================

/**
 * 创建视频热榜同步服务
 */
export function createVideoHotTrendSyncService(deps: VideoHotTrendSyncDeps) {
  // ========================================================================
  // 阶段1: 数据获取
  // ========================================================================

  /**
   * 获取视频热榜列表
   */
  async function fetchVideoHotTrendList(
    tokenOverride: string | null,
    dateWindow: "24h" | "7d" | "30d"
  ): Promise<{ videos: HotVideoItem[]; source: string; updatedAt: string | null }> {
    const fetchLimit = deps.config.hotTrendVideoReverseTopN;
    const buildAdapterTimeoutMs = 30_000; // 30秒超时

    // 构建适配器（带超时）
    let tikhubAdapter: Awaited<ReturnType<typeof deps.buildTikHubVideoAdapter>>;
    try {
      tikhubAdapter = await Promise.race([
        deps.buildTikHubVideoAdapter(tokenOverride),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new AppError(504, "ADAPTER_BUILD_TIMEOUT", "TikHub adapter build timeout")), buildAdapterTimeoutMs)
        ),
      ]);
    } catch (buildError) {
      const buildMessage = buildError instanceof Error ? buildError.message : String(buildError);
      throw new AppError(502, "TIKHUB_ADAPTER_BUILD_FAILED", `tikhub adapter build failed: ${buildMessage}`);
    }

    try {
      const result = await tikhubAdapter.fetchVideoHotTrends(fetchLimit, dateWindow);
      return { videos: result.topics, source: result.source, updatedAt: result.updatedAt };
    } catch (error) {
      deps.log.warn({ err: error }, "tikhub video adapter failed, fallback to douhot");
      try {
        const douhotAdapter = deps.buildDouhotAdapter();
        const result = await douhotAdapter.fetchVideoHotTrends(fetchLimit, dateWindow);
        return { videos: result.topics, source: result.source, updatedAt: result.updatedAt };
      } catch (fallbackError) {
        const tikhubMessage = error instanceof Error ? error.message : String(error);
        const douhotMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new AppError(
          502,
          "VIDEO_TREND_SOURCE_FAILED",
          `video trend source failed: tikhub=${tikhubMessage}; douhot=${douhotMessage}`
        );
      }
    }
  }

  // ========================================================================
  // 阶段2: LLM 反推（新流程：先上传 OSS 再反推）
  // ========================================================================

  /**
   * 执行 LLM 分镜反推（使用统一核心管道）
   * 新流程：下载视频 → 上传 OSS → 保存 ossUrl → 调用核心管道
   * 并发限制：最多同时 3 个请求
   */
  async function runLlmReversePhase(input: {
    rankedVideos: RankedVideo[];
    topN: number;
  }): Promise<{
    results: LlmReverseResult[];
    stats: { selected: number; succeeded: number; failed: number };
  }> {
    const CONCURRENCY = 3; // 并发限制

    // 只处理 TopN 视频
    const candidates = input.rankedVideos.slice(0, input.topN);

    /**
     * 执行单个视频的反推
     * 新流程：下载 → 上传 OSS → 保存 ossUrl → 调用核心管道
     */
    async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
      const videoKey = normalizeHotTrendKey("video", rankedVideo.video.label);
      const sourceUrl = resolveVideoSourceUrl(rankedVideo.video);

      // 必须有视频 URL
      if (!sourceUrl) {
        return {
          videoKey,
          videoTitle: rankedVideo.video.label,
          rank: rankedVideo.rank,
          sourceUrl: "",
          ossUrl: null,
          status: "failed",
          output: null,
          errorCode: "NO_VIDEO_URL",
          errorMessage: "video has no source url",
        };
      }

      // ---- 阶段 A: 下载视频 ----
      const downloadResult = await deps.downloadVideoForLlm(sourceUrl);
      if (!downloadResult) {
        return {
          videoKey,
          videoTitle: rankedVideo.video.label,
          rank: rankedVideo.rank,
          sourceUrl,
          ossUrl: null,
          status: "failed",
          output: null,
          errorCode: "VIDEO_DOWNLOAD_FAILED",
          errorMessage: "video download failed",
        };
      }

      // ---- 阶段 B: 上传到 OSS（同步执行）----
      const ossUrl = await deps.uploadVideoToOss(
        downloadResult.base64,
        downloadResult.mimeType,
        `hot-trend-video/${String(rankedVideo.video.id ?? rankedVideo.rank)}`
      ).catch((err) => {
        deps.log.warn({ err, sourceUrl }, "video hot trend: oss upload failed");
        return null;
      });

      // ---- 阶段 C: 调用核心管道（传入 base64 和 ossUrl）----
      const adapter = createBatchReverseAdapter(deps);
      const coreInput: CoreReverseInput = {
        videoUrl: sourceUrl,
        videoBase64: downloadResult.base64,
        videoMimeType: downloadResult.mimeType,
        ossUrl,
        topicLabel: rankedVideo.video.label,
        topicId: String(rankedVideo.video.id ?? rankedVideo.rank),
        routeKeys: [ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE],
        auditContext: {
          routeKey: ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE,
          businessContext: "视频热榜 LLM 反推",
        },
      };

      const coreOutput = await runCoreReversePipeline(adapter, coreInput);

      // ---- 映射输出 ----
      return mapToBatchResult({
        coreOutput,
        videoKey,
        videoTitle: rankedVideo.video.label,
        rank: rankedVideo.rank,
        sourceUrl,
        ossUrl,
      });
    }

    // 并发控制执行
    const results: LlmReverseResult[] = [];
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(processVideo));
      results.push(...batchResults);
    }

    // 统计
    const selected = results.filter((r) => r.status !== "failed" || r.errorCode !== "NO_VIDEO_URL").length;
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return { results, stats: { selected, succeeded, failed } };
  }

  // ========================================================================
  // 阶段3: 存储原始数据
  // ========================================================================

  /** 资产信息（用于跳过逻辑） */
  interface AssetInfo {
    id: string;
    sourceOssUrl: string | null;
    scriptId: string | null;
  }

  /**
   * 存储视频热榜原始数据到 nrm_hot_trend_assets
   * 快速入库，不等待 LLM
   * 返回已有资产信息用于后续跳过逻辑
   */
  async function saveRawVideoData(input: {
    videos: HotVideoItem[];
    now: number;
    source: string;
  }): Promise<{ assetsCreated: number; assetIds: string[]; assetInfos: AssetInfo[] }> {
    let assetsCreated = 0;
    const assetIds: string[] = [];
    const assetInfos: AssetInfo[] = [];

    for (let i = 0; i < input.videos.length; i++) {
      const video = input.videos[i];
      const rank = i + 1;
      const assetId = `hottrend-video-${input.now}-${rank}`;
      const sourceUrl = resolveVideoSourceUrl(video);

      // 查找已有资产
      const existingAsset = await deps.findHotTrendAssetByTopic(video.label, 'video');

      if (!existingAsset) {
        // 插入新的资产记录（原始数据）
        await deps.insertHotTrendAsset({
          id: assetId,
          topic: video.label,
          url: sourceUrl ?? null,
          rank,
          hotValue: null,
          section: null,
          source: input.source,
          trendType: 'video',
          coverUrl: video.coverUrl ?? null,
        });
        assetsCreated++;
        assetIds.push(assetId);
        assetInfos.push({ id: assetId, sourceOssUrl: null, scriptId: null });
      } else {
        assetIds.push(existingAsset.id);
        assetInfos.push({
          id: existingAsset.id,
          sourceOssUrl: existingAsset.sourceOssUrl,
          scriptId: existingAsset.scriptId,
        });
      }
    }

    return { assetsCreated, assetIds, assetInfos };
  }

  /**
   * 处理单个视频的 LLM 反推并更新数据库
   * 新流程：检查已有 → 下载 → 上传 OSS → 调用核心管道 → 存脚本表
   * 跳过逻辑：已有 OSS 链接跳过上传，已有脚本跳过反推
   */
  async function processSingleVideoReverse(
    video: HotVideoItem,
    rank: number,
    assetInfo: AssetInfo,
    _provider: VideoHotTrendResolvedProvider,
  ): Promise<{ success: boolean; scriptId: string | null; skipped: boolean }> {
    // const _videoKey = normalizeHotTrendKey("video", video.label);
    const sourceUrl = resolveVideoSourceUrl(video);

    if (!sourceUrl) {
      return { success: false, scriptId: null, skipped: false };
    }

    // ---- 跳过检查：已有脚本则跳过整个反推流程 ----
    if (assetInfo.scriptId) {
      deps.log.info({ videoTitle: video.label, scriptId: assetInfo.scriptId }, "video hot trend: skipping reverse, script already exists");
      return { success: true, scriptId: assetInfo.scriptId, skipped: true };
    }

    try {
      // ---- 阶段 A0: 解析视频 URL（将抖音网页链接转换为直链）----
      const resolvedUrl = await deps.resolveVideoUrl(sourceUrl);
      deps.log.info({ sourceUrl, resolvedUrl, videoTitle: video.label }, "video hot trend: url resolved");

      // ---- 阶段 A: 下载视频（如果还没有 OSS 链接）----
      let ossUrl = assetInfo.sourceOssUrl;
      let downloadResult: { base64: string; mimeType: string } | null = null;

      if (ossUrl) {
        // 已有 OSS 链接，跳过下载和上传
        deps.log.info({ videoTitle: video.label, ossUrl }, "video hot trend: skipping download, oss url already exists");
        // 但仍需下载视频用于 LLM 分析（使用解析后的 URL）
        deps.log.info({ resolvedUrl, videoTitle: video.label }, "video hot trend: downloading video for llm");
        downloadResult = await deps.downloadVideoForLlm(resolvedUrl);
        if (!downloadResult) {
          deps.log.warn({ resolvedUrl, videoTitle: video.label }, "video hot trend: download failed");
          return { success: false, scriptId: null, skipped: false };
        }
      } else {
        // 没有 OSS 链接，需要下载（使用解析后的 URL）
        deps.log.info({ resolvedUrl, videoTitle: video.label }, "video hot trend: downloading video");
        downloadResult = await deps.downloadVideoForLlm(resolvedUrl);
        if (!downloadResult) {
          deps.log.warn({ resolvedUrl, videoTitle: video.label }, "video hot trend: download failed");
          return { success: false, scriptId: null, skipped: false };
        }

        // ---- 阶段 B: 上传到 OSS（同步执行）----
        deps.log.info({ videoTitle: video.label }, "video hot trend: uploading to oss");
        ossUrl = await deps.uploadVideoToOss(
          downloadResult.base64,
          downloadResult.mimeType,
          `hot-trend-video/${String(video.id ?? rank)}`
        ).catch((err) => {
          deps.log.warn({ err, resolvedUrl, videoTitle: video.label }, "video hot trend: oss upload failed");
          return null;
        });

        // ---- 阶段 C: 保存 ossUrl 到资产表 ----
        if (ossUrl) {
          deps.log.info({ assetId: assetInfo.id, ossUrl }, "video hot trend: saving oss url to asset");
          await deps.updateHotTrendAssetSourceOssUrl(assetInfo.id, ossUrl);
        }
      }

      // ---- 阶段 D: 调用核心管道 ----
      deps.log.info({ videoTitle: video.label, ossUrl }, "video hot trend: calling core pipeline");
      const adapter = createBatchReverseAdapter(deps);
      const coreInput: CoreReverseInput = {
        videoUrl: resolvedUrl,
        videoBase64: downloadResult.base64,
        videoMimeType: downloadResult.mimeType,
        ossUrl,
        topicLabel: video.label,
        topicId: String(video.id ?? rank),
        routeKeys: [ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE],
        auditContext: {
          routeKey: ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE,
          businessContext: "视频热榜 LLM 反推",
        },
      };

      const coreOutput = await runCoreReversePipeline(adapter, coreInput);

      if (!coreOutput.success || !coreOutput.rawLlmOutput) {
        deps.log.warn({ videoTitle: video.label, errorCode: coreOutput.errorCode }, "video hot trend: core pipeline failed");
        return { success: false, scriptId: null, skipped: false };
      }

      // ---- 阶段 E: 使用核心管道已标准化的输出 ----
      const output = coreOutput.rawLlmOutput as LlmReverseOutput;
      const scriptId = `script-video-${deps.now()}-${rank}`;

      // 从 output 提取结构化字段
      const va = output.video_analysis as unknown as Record<string, unknown> | undefined;
      const fp = va?.fashion_placement as Record<string, unknown> | undefined;
      const emotion = va?.emotion as Record<string, unknown> | undefined;
      const onScreen = va?.on_screen_presence as Record<string, unknown> | undefined;

      // ---- 智能判断脚本类型（依据 has_real_person）----
      const inferredScriptType = inferScriptTypeFromContent(onScreen);

      // ---- 阶段 F: 存入 nrm_script_data ----
      await deps.insertScriptData({
        id: scriptId,
        type: inferredScriptType,
        title: video.label,
        durationSeconds: typeof output.video_info?.duration_seconds === 'number'
          ? Math.round(output.video_info.duration_seconds)
          : undefined,
        source: "hot_trend_video",
        theme: va?.theme as string | undefined,
        summary: va?.summary as string | undefined,
        primaryEmotion: emotion?.primary as string | undefined,
        videoType: va?.video_type as string | undefined,
        videoStyle: va?.video_style as string | undefined,
        fashionSuitable: fp?.suitable as boolean | undefined,
        fashionReason: fp?.reason as string | undefined,
        emotionDetail: emotion,
        onScreenPresence: onScreen,
        fashionStyles: Array.isArray(fp?.recommended_styles) ? fp.recommended_styles as Record<string, unknown>[] : undefined,
        editingAnalysis: output.editing_analysis as unknown as Record<string, unknown> | undefined,
        sourceOssUrl: ossUrl,
        timeOfDay: (output.video_info as unknown as Record<string, unknown> | undefined)?.time_of_day as string | undefined,
        weather: (output.video_info as unknown as Record<string, unknown> | undefined)?.weather as string | undefined,
        payloadJson: output as unknown as Record<string, unknown>,
      });

      // ---- 阶段 G: 更新 nrm_hot_trend_assets.script_id ----
      await deps.updateHotTrendAssetScriptId(assetInfo.id, scriptId);

      // ---- 阶段 H: 分镜数据存入 nrm_shot_breakdown ----
      const rawShots = output.shot_breakdown;
      if (Array.isArray(rawShots) && rawShots.length > 0) {
        try {
          const inserted = await deps.insertShotBreakdown(scriptId, rawShots as unknown as Record<string, unknown>[]);
          deps.log.info({ videoTitle: video.label, scriptId, shotCount: inserted }, "video hot trend: shot breakdown inserted");
        } catch (shotErr) {
          deps.log.warn({ err: shotErr, scriptId }, "video hot trend: failed to insert shot breakdown");
        }
      }

      // ---- 阶段 I: 情感原型存入 nrm_emotion_archetype_library（可选）----
      const emotionArchetype = output.emotion_archetype as unknown as Record<string, unknown> | undefined;
      if (emotionArchetype && emotionArchetype.category && emotionArchetype.emotion_core) {
        try {
          const archetypeId = await deps.insertEmotionArchetype({
            category: emotionArchetype.category as string,
            emotionCore: emotionArchetype.emotion_core as string,
            moment: (emotionArchetype.moment as string) ?? "",
            conflict: (emotionArchetype.conflict as string) ?? "",
            clothingRole: (emotionArchetype.clothing_role as string) ?? "",
            source: "hot_trend_llm",
            sourceMetadata: {
              videoTitle: video.label,
              scriptId,
              videoUrl: sourceUrl,
              extractedAt: deps.now(),
            },
          });
          if (archetypeId) {
            deps.log.info({ videoTitle: video.label, archetypeId, category: emotionArchetype.category }, "video hot trend: emotion archetype extracted");
          }
        } catch (archErr) {
          deps.log.warn({ err: archErr, scriptId }, "video hot trend: failed to insert emotion archetype");
        }
      }

      deps.log.info({ videoTitle: video.label, scriptId, ossUrl }, "video hot trend: LLM reverse succeeded");
      return { success: true, scriptId, skipped: false };
    } catch (error) {
      deps.log.warn({ err: error, videoTitle: video.label }, "video hot trend: LLM reverse failed");
      return { success: false, scriptId: null, skipped: false };
    }
  }

  /**
   * 异步批量处理 LLM 反推
   * 不阻塞主流程，成功一个更新一个
   */
  function startAsyncLlmReverse(
    videos: HotVideoItem[],
    assetInfos: AssetInfo[],
    provider: VideoHotTrendResolvedProvider,
    topN: number,
  ): void {
    // 不 await，后台执行
    (async () => {
      const CONCURRENCY = 3;
      const candidates = videos.slice(0, topN);

      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const batch = candidates.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map((video, idx) => {
            const actualIndex = i + idx;
            return processSingleVideoReverse(video, actualIndex + 1, assetInfos[actualIndex]!, provider);
          })
        );
      }

      deps.log.info(
        { processedCount: Math.min(topN, videos.length) },
        "video hot trend: async LLM reverse completed"
      );
    })().catch((error) => {
      deps.log.error({ err: error }, "video hot trend: async LLM reverse error");
    });
  }

  // ========================================================================
  // 主同步函数
  // ========================================================================

  /**
   * 执行视频热榜同步
   * 新流程：数据获取 → 立即存原始数据 → 直接返回 → 异步 LLM 反推
   */
  async function sync(input: VideoHotTrendSyncInput): Promise<VideoHotTrendSyncResult> {
    const now = deps.now();
    const type: HotTrendType = "video";
    const dateWindow: "24h" | "7d" | "30d" = "7d";

    // 检查缓存
    const cached = input.hotTrendCache.get(type);
    if (!input.force && cached && now < cached.nextSyncAt) {
      return {
        entry: cached,
        stats: {
          topicCount: cached.topics.length,
          generatedCount: 0,
          videoBatchReverseSelected: 0,
          videoBatchReverseSucceeded: 0,
          videoBatchReverseFailed: 0,
          videoPromptAAnalyzed: 0,
          videoPromptAFailed: 0,
          videoPromptBAnalyzed: 0,
          videoPromptBFailed: 0,
          videoPromptBUpdatedAssets: 0,
          created: 0,
          updated: 0,
          prunedSmartStoryboardCount: 0,
          analysisSource: cached.analysisSource,
        },
      };
    }

    // 注意：in-flight 检查由父模块 hot-trend-sync.ts 处理，此处不再重复检查
    // 避免与父模块的 in-flight 管理冲突导致死锁

    // 执行同步流程
    const jobPromise = (async (): Promise<VideoHotTrendSyncResult> => {
      // 阶段1: 数据获取
      const fetched = await fetchVideoHotTrendList(input.tokenOverride, dateWindow);
      const effectiveVideos = fetched.videos;

      // 阶段2: 立即存储原始数据到 nrm_hot_trend_assets
      const saveStats = await saveRawVideoData({
        videos: effectiveVideos,
        now,
        source: fetched.source,
      });

      deps.log.info(
        {
          trendType: "video",
          videoCount: effectiveVideos.length,
          assetsCreated: saveStats.assetsCreated,
        },
        "video hot trend: raw data saved to nrm_hot_trend_assets"
      );

      // 阶段3: 解析 LLM provider（用于异步反推）
      const providerResolution = await deps.resolveRouteProviderWithFallback([
        ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE,
      ]);

      // 阶段4: 启动异步 LLM 反推（不阻塞）
      if (providerResolution?.provider) {
        const topN = deps.config.hotTrendVideoReverseTopN;
        startAsyncLlmReverse(effectiveVideos, saveStats.assetInfos, providerResolution.provider, topN);
      } else {
        deps.log.warn(
          { trendType: type },
          "no llm provider available for video hot trend reverse"
        );
      }

      // 构建结果条目（立即返回，LLM 反推在后台进行）
      const entry: import("../../contracts/video-hot-trend-sync-contract.js").VideoHotTrendSyncEntry = {
        type,
        source: fetched.source,
        section: "",
        updatedAt: fetched.updatedAt,
        syncedAt: now,
        nextSyncAt: now + 3600000, // 1小时后
        llmUsed: false, // 异步执行，此时还未完成
        analysisSource: "none",
        topics: effectiveVideos,
        videoFetchGuard: null,
      };

      return {
        entry,
        stats: {
          topicCount: effectiveVideos.length,
          generatedCount: 0, // 异步执行，此时为 0
          videoBatchReverseSelected: 0,
          videoBatchReverseSucceeded: 0,
          videoBatchReverseFailed: 0,
          videoPromptAAnalyzed: 0,
          videoPromptAFailed: 0,
          videoPromptBAnalyzed: 0,
          videoPromptBFailed: 0,
          videoPromptBUpdatedAssets: 0,
          created: saveStats.assetsCreated,
          updated: 0,
          prunedSmartStoryboardCount: 0,
          analysisSource: "none",
        },
      };
    })();

    // 注意：in-flight 管理由父模块 hot-trend-sync.ts 处理
    const result = await jobPromise;
    input.hotTrendCache.set(type, result.entry);
    return result;
  }

  return {
    sync,
    fetchVideoHotTrendList,
    runLlmReversePhase,
  };
}

// ============================================================================
// 导出类型
// ============================================================================

export type VideoHotTrendSyncService = ReturnType<typeof createVideoHotTrendSyncService>;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据镜头内容智能判断脚本类型
 *
 * 判断规则（优先级）：
 * 1. 如果有任何镜头出现真人（type: "人物"） → 反推脚本 (ScriptType.REVERSE = 1)
 * 2. 如果所有镜头都是物体且无真人出镜 → 判断是否产品展示类型
 *    - 有旋转展示/特写展示 → 产品展示 (ScriptType.PRODUCT_SHOWCASE = 11)
 *    - 其他 → 反推脚本 (ScriptType.REVERSE = 1)
 */
function inferScriptTypeFromShots(
  shotBreakdown: unknown
): number {
  if (!Array.isArray(shotBreakdown) || shotBreakdown.length === 0) {
    return ScriptType.REVERSE; // 默认反推类型
  }

  // 提取所有 subjects
  const allSubjects = shotBreakdown.flatMap((shot: any) => shot.subjects || []);

  // 优先判断：是否有真人出镜
  const hasHumanSubject = allSubjects.some((subject: any) => subject.type === "人物");

  // 有真人出镜 → 反推脚本（走 video_script_rewriter）
  if (hasHumanSubject) {
    return ScriptType.REVERSE;
  }

  // 无真人出镜 → 判断是否全是物体且有旋转展示（产品展示类型）
  const hasOnlyObjects = allSubjects.every((subject: any) => subject.type === "物体");
  const hasRotatingDisplay = shotBreakdown.some((shot: any) => {
    const subjects = shot.subjects || [];
    return subjects.some((subject: any) =>
      subject.movement === "旋转" ||
      subject.action?.includes("旋转") ||
      subject.action?.includes("360度") ||
      subject.action?.includes("展示")
    );
  });

  // 全是物体且有旋转/展示 → 产品展示
  if (hasOnlyObjects && hasRotatingDisplay) {
    return ScriptType.PRODUCT_SHOWCASE;
  }

  // 其他情况 → 反推脚本
  return ScriptType.REVERSE;
}

/**
 * 根据脚本内容智能判断脚本类型
 * 简化判断：只依据 has_real_person 字段
 * - true → REVERSE（有人出镜，走 video_script_rewriter）
 * - false → PRODUCT_SHOWCASE（无人出镜，纯商品展示）
 */
function inferScriptTypeFromContent(
  onScreenPresence: Record<string, unknown> | undefined
): number {
  const hasRealPerson = onScreenPresence?.has_real_person === true;
  return hasRealPerson ? ScriptType.REVERSE : ScriptType.PRODUCT_SHOWCASE;
}