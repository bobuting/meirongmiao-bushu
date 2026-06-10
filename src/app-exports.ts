/**
 * 应用导出模块
 *
 * 集中管理 app.ts 中所有导出，简化导入部分。
 */

// ---------------------------------------------------------------------------
// 媒体 Provider 导出
// ---------------------------------------------------------------------------

export {
  requestLlmImageGenerationUrls,
  requestLlmImageGenerationUrl,
  requestThirdPartyConnectivityProbe,
} from "./services/media/image-generation-providers.js";

export {
  requestJimengVideoUrl,
  requestVideoUrl,
  resolveVideoProviderOverloadRetryDelayMs,
  resolveVideoProviderPendingRetryDelayMs,
  normalizeJimengImageRatio,
  normalizeJimengImageResolution,
  normalizeVideoReferenceImageUrl,
} from "./service/llm/llm-video.js";

// ---------------------------------------------------------------------------
// Step1 图像分类导出
// ---------------------------------------------------------------------------

export type {
  Step1ImageClassificationCategory,
  Step1ImageClassificationViewLabel,
} from "./modules/step1-image-classification.js";

export type {
  Step1ImageClassificationResult,
  Step1ImageClassificationPayload,
  Step1ImageClassificationFeedback,
} from "./modules/step1-image-classification.js";

export type { FiveViewDefinition } from "./modules/character-view-session.js";

// ---------------------------------------------------------------------------
// Content Type 导出
// ---------------------------------------------------------------------------

export {
  contentTypeByExtension,
  sniffContentTypeFromBytes,
  resolveBinaryContentType,
  resolveImageContentType,
  readBooleanEnv,
} from "./services/utils/content-type.js";

// ---------------------------------------------------------------------------
// Auth Route Guards 导出
// ---------------------------------------------------------------------------

export {
  getBearerToken,
  requireUser,
  requireAdmin,
} from "./services/auth/route-guards.js";

// ---------------------------------------------------------------------------
// Image Utils 导出
// ---------------------------------------------------------------------------

export {
  parseImageDataUrl,
  guessImageMimeType,
  resolveServerRelativeImageUrl,
  normalizeProviderTransportImageUrls,
  resolveLocalImageFilePath,
  isSupportedLlmImageUrl,
  readLocalImageInlineData,
  fetchImageInlineData,
} from "./services/media/image-utils.js";

// ---------------------------------------------------------------------------
// Video Reverse 导出
// ---------------------------------------------------------------------------

export {
  pickReverseUrlCandidate,
  normalizeDouyinReverseInputUrl,
  isLikelyDirectPlayableVideoUrl,
  pickPreferredResolvedVideoUrl,
  summarizeReverseAttempts,
  isVideoReverseMissingSourceSignal,
} from "./services/media/video-reverse.js";

// ---------------------------------------------------------------------------
// Storage Persist 导出
// ---------------------------------------------------------------------------

export {
  normalizeObjectStoragePublicBase,
  guessImageExtension,
  guessVideoExtension,
  resolveVideoContentType,
  isObjectStoragePublicUrl,
  readImageBytesFromSource,
  persistImageSourceToStorage,
  persistVideoSourceToStorage,
} from "./services/media/storage-persist.js";

// ---------------------------------------------------------------------------
// LLM Provider Resolver 导出
// ---------------------------------------------------------------------------

export {
  isYunwuProviderSource,
  resolveProviderTimeoutMs,
  resolveRouteProviderId,
  resolveRouteRetryCount,
  recordRouteAudit,
  createPendingRouteAudit,
  finalizeRouteAudit,
  resolveRouteProvider,
  resolveRouteProviderWithFallback,
  dedupeModelCandidates,
  isLikelyGeminiImageModelCandidate,
  resolveGeminiModelCandidates,
  resolveOrderedProviderChain,
  resolveModelFallbackOrder,
  normalizeRuntimeOverrideList,
  buildSideErrorPayload,
  mapReverseAttemptsToFallbackAttempts,
  resolveRouteProviderChain,
} from "./services/llm/provider-resolver.js";

export type { ResolvedRouteProvider } from "./services/llm/provider-resolver.js";

// ---------------------------------------------------------------------------
// LLM Debug Recorder 导出
// ---------------------------------------------------------------------------

export {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
  finalizeLlmDebugRecordTimeout,
  appendLlmDebugRecordAttempt,
  finalizeLlmDebugRecordChainExhausted,
} from "./services/llm/llm-debug-recorder.js";

export type { LlmDebugAttempt } from "./services/llm/llm-debug-recorder.js";

// ---------------------------------------------------------------------------
// LLM Transport 导出（Provider Chain 重试）
// ---------------------------------------------------------------------------

export {
  isRetryableLlmError,
  requestLlmPlainTextWithChainRetry,
} from "./services/llm/llm-transport.js";

// ---------------------------------------------------------------------------
// JSON Utils 导出
// ---------------------------------------------------------------------------

export {
  extractJsonObject,
  unwrapQuotedText,
  isPlaceholderScriptContent,
} from "./services/utils/json-utils.js";

// ---------------------------------------------------------------------------
// Reverse Script Parser 导出
// ---------------------------------------------------------------------------

export {
  normalizeScriptPayload,
  normalizeReverseOverviews,
  buildReverseScriptPrompt,
  buildReverseScriptSeed,
  buildReverseScriptBasicInfo,
  buildReverseScriptFallbackPayload,
  assertRealScriptContent,
} from "./services/reverse/script-parser.js";

// ---------------------------------------------------------------------------
// Storyboard Parser 导出
// ---------------------------------------------------------------------------

export {
  splitNarrationBlocks,
} from "./services/reverse/storyboard-parser.js";