/**
 * video-url-resolver.ts
 *
 * 从 app.ts 提取的视频 URL 处理逻辑：
 * 抖音视频探测、URL 候选构建、视频反推管道执行。
 *
 * 原始代码位于 buildApp() 闭包内，外部依赖通过 deps 接口注入。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ReverseFetchOrchestrator } from "./orchestrator.js";
import type { VideoReverseAnalysisServicePort } from "../contracts/video-reverse-analysis-service.js";
import { isDouyinReverseHost } from "../utils/url.js";
import { pickPreferredResolvedVideoUrl } from "../services/media/video-reverse.js";
import { runSharedVideoUrlReversePipeline } from "./video-reverse-analysis-service.js";
import { buildReverseVideoUrlPayload, REVERSE_PARSE_V2_VIDEO_URL_GOAL } from "./video-reverse-url-entry.js";
import { buildReverseStoryboardPanelViewModel } from "./reverse-storyboard-report-mapper.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 视频 URL 解析器依赖 */
export interface VideoUrlResolverDeps {
  app: FastifyInstance;
  ctx: AppContext;
  buildSquareTrendVideoResolveOrchestrator: () => ReverseFetchOrchestrator;
  resolveTikHubTokenForUserBound: (userId: string) => Promise<string | null>;
  resolveTikHubTokenForHotTrendsBound: () => Promise<string | null>;
  videoReverseAnalysisService: VideoReverseAnalysisServicePort;
  videoDownloadTimeoutMs?: number;
}

/** 视频 URL 解析器 */
export interface VideoUrlResolver {
  probeDouyinPlayableVideoUrl: (inputUrl: string) => Promise<{ resolvedVideoUrl: string; mimeType: string | null }>;
  resolveReverseParseV2OrchestratorVideoUrl: (normalizedVideoUrl: string, options: { userId: string; projectId?: string | null }) => Promise<string | null>;
  buildReverseParseV2VideoUrlCandidates: (normalizedVideoUrl: string, options: { userId: string; projectId?: string | null }) => Promise<{ candidates: string[]; mimeType: string | null }>;
  runSharedVideoUrlReversePipelineForUser: (normalizedVideoUrl: string, options: { userId: string; projectId?: string | null }) => Promise<{
    resolvedVideoUrl: string;
    multimodalResult: Awaited<ReturnType<VideoReverseAnalysisServicePort["run"]>>;
    llmPayload: ReturnType<typeof buildReverseVideoUrlPayload>;
    storyboardPanel: ReturnType<typeof buildReverseStoryboardPanelViewModel>;
  }>;
}

// ---------------------------------------------------------------------------
// 实现
// ---------------------------------------------------------------------------

/** 创建视频 URL 解析器 */
export function createVideoUrlResolver(deps: VideoUrlResolverDeps): VideoUrlResolver {
  const {
    buildSquareTrendVideoResolveOrchestrator,
    resolveTikHubTokenForUserBound,
    resolveTikHubTokenForHotTrendsBound,
    videoReverseAnalysisService,
    videoDownloadTimeoutMs,
  } = deps;

  /** 探测抖音视频 URL 是否可播放 */
  const probeDouyinPlayableVideoUrl = async (
    inputUrl: string,
  ): Promise<{ resolvedVideoUrl: string; mimeType: string | null }> => {
    try {
      const parsed = new URL(inputUrl);
      if (!isDouyinReverseHost(parsed.hostname)) {
        return { resolvedVideoUrl: inputUrl, mimeType: null };
      }
    } catch {
      return { resolvedVideoUrl: inputUrl, mimeType: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), videoDownloadTimeoutMs ?? 300_000);
    try {
      const response = await fetch(inputUrl, {
        method: "GET",
        headers: {
          Range: "bytes=0-2047",
          "User-Agent": "Mozilla/5.0 (compatible; DiyShortVidGen/1.0)",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      const resolvedVideoUrl = String(response.url ?? "").trim() || inputUrl;
      const mimeTypeRaw = String(response.headers.get("content-type") ?? "")
        .trim()
        .toLowerCase();
      const mimeType = mimeTypeRaw.split(";")[0]?.trim() || null;
      if (response.body) {
        try {
          await response.body.cancel();
        } catch {
          // ignore cancellation errors
        }
      }
      if (response.status < 200 || response.status >= 400) {
        return { resolvedVideoUrl: inputUrl, mimeType: null };
      }
      if (mimeType?.startsWith("video/") || mimeType === "application/octet-stream") {
        return { resolvedVideoUrl, mimeType };
      }
      if (resolvedVideoUrl !== inputUrl) {
        return { resolvedVideoUrl, mimeType: null };
      }
      return { resolvedVideoUrl: inputUrl, mimeType: null };
    } catch {
      return { resolvedVideoUrl: inputUrl, mimeType: null };
    } finally {
      clearTimeout(timeout);
    }
  };

  /** 通过 orchestrator 解析抖音视频 URL */
  const resolveReverseParseV2OrchestratorVideoUrl = async (
    normalizedVideoUrl: string,
    options: {
      userId: string;
      projectId?: string | null;
    },
  ): Promise<string | null> => {
    try {
      const parsed = new URL(normalizedVideoUrl);
      if (!isDouyinReverseHost(parsed.hostname)) {
        return null;
      }
    } catch {
      return null;
    }

    const hasExternalToken =
      ((await resolveTikHubTokenForUserBound(options.userId))?.trim().length ?? 0) > 0 ||
      ((await resolveTikHubTokenForHotTrendsBound())?.trim().length ?? 0) > 0;
    if (!hasExternalToken) {
      return null;
    }

    try {
      const trace = await buildSquareTrendVideoResolveOrchestrator().execute({
        userId: options.userId,
        projectId: options.projectId?.trim() || `reverse-parse-v2:${options.userId}`,
        url: normalizedVideoUrl,
      });
      if (!trace.success || !trace.resolvedVideoUrl) {
        return null;
      }
      const preferred = pickPreferredResolvedVideoUrl(normalizedVideoUrl, trace).trim();
      return /^https?:\/\//i.test(preferred) ? preferred : null;
    } catch {
      return null;
    }
  };

  /** 构建视频 URL 候选列表 */
  const buildReverseParseV2VideoUrlCandidates = async (
    normalizedVideoUrl: string,
    options: {
      userId: string;
      projectId?: string | null;
    },
  ): Promise<{ candidates: string[]; mimeType: string | null }> => {
    const orchestratorResolvedVideoUrl = await resolveReverseParseV2OrchestratorVideoUrl(normalizedVideoUrl, options);
    const probe = await probeDouyinPlayableVideoUrl(normalizedVideoUrl);
    const candidates = [orchestratorResolvedVideoUrl, probe.resolvedVideoUrl, normalizedVideoUrl]
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    const deduped = [...new Set(candidates)];
    return {
      candidates: deduped,
      mimeType: probe.mimeType,
    };
  };

  /** 为用户执行视频 URL 反推管道 */
  const runSharedVideoUrlReversePipelineForUser = async (
    normalizedVideoUrl: string,
    options: {
      userId: string;
      projectId?: string | null;
    },
  ): Promise<{
    resolvedVideoUrl: string;
    multimodalResult: Awaited<ReturnType<VideoReverseAnalysisServicePort["run"]>>;
    llmPayload: ReturnType<typeof buildReverseVideoUrlPayload>;
    storyboardPanel: ReturnType<typeof buildReverseStoryboardPanelViewModel>;
  }> => {
    const { candidates: videoUrlCandidates, mimeType: probedMimeType } =
      await buildReverseParseV2VideoUrlCandidates(normalizedVideoUrl, options);
    const pipeline = await runSharedVideoUrlReversePipeline({
      analysisService: videoReverseAnalysisService,
      userGoal: REVERSE_PARSE_V2_VIDEO_URL_GOAL,
      candidateVideoUrls: videoUrlCandidates,
      mimeType: probedMimeType,
    });
    const multimodalResult = pipeline.output;
    const llmPayload = buildReverseVideoUrlPayload(multimodalResult.result);
    const storyboardPanel = buildReverseStoryboardPanelViewModel({
      sourceType: "video_url",
      videoUrl: pipeline.resolvedVideoUrl,
      mimeType: multimodalResult.videoMeta.mimeType,
      duration: null,
      rawMarkdown: multimodalResult.result,
      diagnostics: multimodalResult.diagnostics,
      raw: multimodalResult.raw,
    });
    return {
      resolvedVideoUrl: pipeline.resolvedVideoUrl,
      multimodalResult,
      llmPayload,
      storyboardPanel,
    };
  };

  return {
    probeDouyinPlayableVideoUrl,
    resolveReverseParseV2OrchestratorVideoUrl,
    buildReverseParseV2VideoUrlCandidates,
    runSharedVideoUrlReversePipelineForUser,
  };
}