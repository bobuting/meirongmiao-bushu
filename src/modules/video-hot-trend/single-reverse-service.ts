/**
 * 单视频热榜 LLM 反推服务（使用统一核心管道）
 * 调用方职责：下载视频、上传 OSS、传入 base64 和 ossUrl
 * 核心管道处理：LLM → JSON 解析 → 输出标准化
 * 用户入口错误语义：失败时抛出 AppError（per RESEARCH.md Pattern 3）
 */

import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import type { VideoHotTrendResolvedProvider } from "../../contracts/video-hot-trend-sync-contract.js";
import type { LlmPlainTextResult } from "../../services/llm/gemini-utils.js";
import type { LlmReverseOutput } from "../video-reverse-core/normalize-output.js";
import type { CoreReverseInput, CoreReverseAuditContext } from "../video-reverse-core/types.js";

import { AppError } from "../../core/errors.js";
// 核心反推管道（Phase 1-3）
import {
  runCoreReversePipeline,
  createCloneAdapter,
  mapToCloneResult,
  CORE_REVERSE_ERROR_CODES,
} from "../video-reverse-core/index.js";

// ============================================================================
// 依赖接口
// ============================================================================

/** 单视频反推服务的外部依赖（由路由层注入） */
export interface SingleVideoReverseDeps {
  /** 下载视频到内存（base64） */
  downloadVideoForLlm: (sourceUrl: string) => Promise<{ base64: string; mimeType: string } | null>;
  /** 上传视频到 OSS */
  uploadVideoToOss: (videoBase64: string, mimeType: string, keyPrefix: string) => Promise<string | null>;
  /** 探测并解析视频真实地址（跟随 redirect，处理抖音短链等） */
  resolveVideoUrl: (inputUrl: string) => Promise<string>;
  /** 解析 LLM provider（带 fallback） */
  resolveRouteProviderWithFallback: (
    routeKeys: ProviderRouteKey[],
  ) => Promise<{ provider: ResolvedRouteProvider; routeKey: ProviderRouteKey } | null>;
  /** Gemini 视频请求 */
  requestGeminiPlainTextWithVideoPart: (
    provider: ResolvedRouteProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    videoPart: Record<string, unknown>,
    options?: { timeoutMsOverride?: number },
  ) => Promise<LlmPlainTextResult>;
  /** 构建 Gemini 内联视频 part */
  buildGeminiInlineVideoPart: (base64: string, mimeType: string) => Record<string, unknown>;
  /** 构建 Gemini 远程视频 part */
  buildGeminiRemoteVideoPart: (videoUrl: string, mimeType: string) => Record<string, unknown>;
  /** 生成 ID */
  generateId: () => string;
  /** 当前时间戳 */
  now: () => number;
  /** 日志 */
  log: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  /** 审计记录（旧函数，保持向后兼容） */
  recordRouteAudit: (
    routeKey: string,
    startedAt: number,
    status: "success" | "error" | "timeout",
    cost: number,
    errorCode: string | null,
    errorMessage: string | null,
    requestSummary: string | null,
    responseSummary: string | null,
  ) => void;
  /** 创建 LLM 调试记录（调用前） */
  createLlmDebugRecord: (input: {
    routeKey: ProviderRouteKey;
    businessContext: string;
    projectId?: string;
    userId?: string;
    messages: Array<{ role: string; content: string }>;
    modelParams: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    };
    provider: VideoHotTrendResolvedProvider;
    hasMedia?: "image" | "video";
    /** 实际调用的 API 地址（预构建） */
    actualEndpoint?: string;
    /** 请求头 JSON（预构建） */
    requestHeadersJson?: string;
    /** 请求体摘要 JSON（预构建） */
    requestBodyJson?: string;
  }) => { auditId: string; startedAt: number };
  /** 完成 LLM 调试记录（成功） */
  finalizeLlmDebugRecordSuccess: (input: {
    auditId: string;
    startedAt: number;
    actualModel: string;
    responseText: string;
    /** 实际调用的 API 地址 */
    actualEndpoint?: string | null;
    /** 请求头 JSON */
    requestHeadersJson?: string | null;
    /** 请求体摘要 JSON */
    requestBodyJson?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    ttftMs?: number;
  }) => void;
  /** 完成 LLM 调试记录（失败） */
  finalizeLlmDebugRecordError: (input: {
    auditId: string;
    startedAt: number;
    errorCode: string;
    errorMessage: string;
    actualEndpoint?: string | null;
    requestHeadersJson?: string | null;
    requestBodyJson?: string | null;
  }) => void;
}

// ============================================================================
// 返回类型（兼容前端 ReverseParseV2ResultDto）
// ============================================================================

/**
 * 单视频反推结果
 * 兼容前端 ReverseParseV2ResultDto 的子集，供 applyReverseParseResultToDeck 使用
 */
export interface SingleVideoReverseResult {
  id: string;
  projectId: string | null;
  input: string;
  status: string;
  scriptVersionId: string | null;
  libraryScriptId: string | null;
  reverseStoryboardLibraryId: string | null;
  /** 原始 LLM 反推输出（用于持久化到 nrm_script_data，失败时为 null） */
  rawLlmOutput: LlmReverseOutput | null;
  storyboardPanel: {
    source: {
      sourceType: "video_url";
      videoUrl: string;
      filename: string | null;
      mimeType: string | null;
      duration: number | null;
    };
    report: {
      intro: string | null;
      sections: SingleVideoReverseResultSection[];
      frames: SingleVideoReverseResultFrame[];
      rawMarkdown: string;
      hasStructuredSections: boolean;
    };
    diagnostics: unknown;
    raw: unknown;
  } | null;
  libraryScript: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    date: number;
  } | null;
  resolvedVideoUrl: string;
  ossUrl: string | null;
  fallback: boolean;
  code: string | undefined;
  message: string | undefined;
  inputMode: "video_url";
  scriptHints: {
    source: string;
    overviews: string[];
    itemCount: number;
    primaryItem: {
      url: string;
      title: string;
      videoUrl: string;
      audioUrl: string | null;
      createTime: number | null;
      playCount: number | null;
      commentCount: number | null;
      diggCount: number | null;
      shareCount: number | null;
      collectCount: number | null;
      recommendCount: number | null;
      nickname: string | null;
      duration: number | null;
      scriptText: string;
    };
  } | null;
}

/** 结果 section 类型 */
interface SingleVideoReverseResultSection {
  id: string;
  order: number;
  title: string;
  content: string;
}

/** 结果 frame 类型 */
interface SingleVideoReverseResultFrame {
  index: number;
  time: string | null;
  title: string;
  narration: string;
  visualCue: string;
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 单视频热榜 LLM 反推（使用统一核心管道）
 * 新流程：下载视频 → 上传 OSS → 调用核心管道（传入 base64 和 ossUrl）
 * 用户入口错误语义：失败时抛出 AppError（per RESEARCH.md Pattern 3）
 */
export async function runSingleVideoLlmReverse(
  deps: SingleVideoReverseDeps,
  videoUrl: string,
): Promise<SingleVideoReverseResult> {
  // ---- 阶段 A: 解析视频 URL ----
  const resolvedVideoUrl = await deps.resolveVideoUrl(videoUrl);

  // ---- 阶段 B: 下载视频 ----
  deps.log.info({ resolvedVideoUrl }, "single video reverse: downloading video");
  const downloadResult = await deps.downloadVideoForLlm(resolvedVideoUrl);
  if (!downloadResult) {
    throw new AppError(502, "VIDEO_DOWNLOAD_FAILED", "视频下载失败，请稍后重试");
  }

  // ---- 阶段 C: 上传到 OSS ----
  deps.log.info({ resolvedVideoUrl }, "single video reverse: uploading to oss");
  const ossUrl = await deps.uploadVideoToOss(
    downloadResult.base64,
    downloadResult.mimeType,
    `single-reverse/${deps.generateId()}`
  ).catch((err) => {
    deps.log.warn({ err, resolvedVideoUrl }, "single video reverse: oss upload failed");
    return null;
  });

  // ---- 阶段 D: 调用核心管道 ----
  const adapter = createCloneAdapter(deps);
  const coreInput: CoreReverseInput = {
    videoUrl: resolvedVideoUrl,
    videoBase64: downloadResult.base64,
    videoMimeType: downloadResult.mimeType,
    ossUrl,
    routeKeys: [ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE],
    auditContext: {
      routeKey: ProviderRouteKeys.HOT_TREND_VIDEO_REVERSE,
      businessContext: "视频热榜单视频反推",
    },
  };

  const coreOutput = await runCoreReversePipeline(adapter, coreInput);

  // ---- 用户入口错误处理：失败时抛异常 ----
  // 批量入口（sync-service）返回 failed result，用户入口（single-reverse）抛 AppError
  // per RESEARCH.md Pattern 3: Error Handling Strategy
  if (!coreOutput.success) {
    throw new AppError(
      502,
      coreOutput.errorCode ?? "UNKNOWN",
      coreOutput.errorMessage ?? "反推失败，请稍后重试",
    );
  }

  // ---- 映射输出 ----
  return mapToCloneResult({
    coreOutput,
    videoUrl: coreOutput.resolvedVideoUrl,
    ossUrl,
    generateId: deps.generateId,
    now: deps.now,
  });
}