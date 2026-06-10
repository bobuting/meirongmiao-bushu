/**
 * LLM 请求相关类型定义
 */

/**
 * LLM 图像输入
 */
export interface LlmImageInput {
  url: string;
  label?: string;
}

/**
 * LLM 请求选项
 */
export interface LlmRequestOptions {
  imageInputs?: LlmImageInput[];
  forceGeminiGrounding?: boolean;
  forceGeminiTransport?: boolean;
  forceOpenAiTransport?: boolean;
  timeoutMsOverride?: number;
}

/**
 * LLM 请求调试追踪信息
 */
export interface LlmRequestDebugTrace {
  endpoint: string;
  model: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  response: string;
}

/**
 * LLM Grounding 来源
 */
export interface LlmGroundingSource {
  title: string;
  url: string;
}

/**
 * LLM 纯文本结果
 */
export interface LlmPlainTextResult {
  text: string;
  groundingSources: LlmGroundingSource[];
  debugTrace?: LlmRequestDebugTrace;
}

/**
 * OpenAI 视频内容变体
 */
export type OpenAiVideoContentVariant = {
  label: string;
  content: Array<Record<string, unknown>> | string;
};