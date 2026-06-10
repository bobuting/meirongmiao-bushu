/**
 * LLM 服务统一导出
 *
 * 整理 LLM 相关函数的导出，避免循环依赖。
 */

// Gemini 相关
export {
  requestGeminiPlainTextWithVideoPart,
} from "./llm-transport.js";

export {
  shouldUseGeminiVideoReverseTransport,
  buildGeminiRemoteVideoPart,
  buildGeminiInlineVideoPart,
  isGeminiProvider,
} from "./gemini-utils.js";

// OpenAI 相关（从 service/llm 目录）
export {
  requestLlmPlainText,
  requestLlmPlainTextWithMetadata,
} from "./llm-transport.js";

// 诊断类型（从 provider-resolver 导出）
export {
  createCapabilityDiagnostics,
  type CapabilityDiagnostics,
  type FallbackAttempt,
} from "./provider-resolver.js";