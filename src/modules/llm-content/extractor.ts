/**
 * LLM Response Extractor 函数
 * 用于从 LLM 响应中提取文本、错误信息、grounding 来源等
 */

import type { LlmGroundingSource } from "../../contracts/llm-types.js";

/**
 * 从 OpenAI 响应中提取文本内容
 */
export function extractOpenAiTextContent(data: unknown): string {
  const content = ((data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message
    ?.content ?? "") as unknown;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : (item as { text?: string }).text ?? ""))
      .join("\n");
  }
  return "";
}

/**
 * 从响应中提取上游错误信息
 */
export function extractUpstreamErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const root = data as Record<string, unknown>;
  const error = root.error;
  if (!error) {
    return null;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = String(record.code ?? "").trim();
    const message = String(record.message ?? "").trim();
    if (code && message) {
      return `${code}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (code) {
      return code;
    }
  }
  return null;
}

/**
 * 从 Gemini 响应中提取文本内容
 */
export function extractGeminiTextContent(data: unknown): string {
  const root = (data ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = (candidates[0] ?? {}) as Record<string, unknown>;
  const content = (first.content ?? root.content ?? {}) as Record<string, unknown>;
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const partTexts = parts
    .map((part) => (part && typeof part === "object" ? (part as Record<string, unknown>).text : ""))
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  if (partTexts.length > 0) {
    return partTexts.join("\n");
  }
  const outputText = first.output_text ?? root.output_text ?? root.text;
  if (typeof outputText === "string") {
    return outputText.trim();
  }
  return "";
}

/**
 * 从 Gemini 响应中提取 grounding 来源
 */
export function extractGeminiGroundingSources(data: unknown): LlmGroundingSource[] {
  const root = (data ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = (candidates[0] ?? {}) as Record<string, unknown>;
  const groundingMetadata =
    (first.groundingMetadata as Record<string, unknown> | undefined) ??
    (first.grounding_metadata as Record<string, unknown> | undefined) ??
    (root.groundingMetadata as Record<string, unknown> | undefined) ??
    (root.grounding_metadata as Record<string, unknown> | undefined) ??
    {};
  const chunks =
    (Array.isArray(groundingMetadata.groundingChunks) ? groundingMetadata.groundingChunks : null) ??
    (Array.isArray(groundingMetadata.grounding_chunks) ? groundingMetadata.grounding_chunks : null) ??
    [];

  const output: LlmGroundingSource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") {
      continue;
    }
    const record = chunk as Record<string, unknown>;
    const web = (record.web as Record<string, unknown> | undefined) ?? {};
    const url = String(web.uri ?? web.url ?? "").trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    output.push({
      title: String(web.title ?? "Google Search Source").trim() || "Google Search Source",
      url,
    });
  }
  return output;
}