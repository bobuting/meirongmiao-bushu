/**
 * LLM Content Builder 模块
 */

export {
  parseGeminiApiKey,
  parseImageDataUrl,
  buildGeminiRemoteVideoPart,
  buildGeminiInlineVideoPart,
  buildOpenAiVisionUserContent,
  buildOpenAiRemoteVideoContentVariants,
  buildOpenAiInlineVideoContentVariants,
} from "./builder.js";

export {
  summarizeGeminiRequestBody,
  summarizeOpenAiRequestBody,
} from "./summarize.js";

export {
  extractOpenAiTextContent,
  extractUpstreamErrorMessage,
  extractGeminiTextContent,
  extractGeminiGroundingSources,
} from "./extractor.js";