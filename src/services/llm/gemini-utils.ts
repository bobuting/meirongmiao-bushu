/**
 * gemini-utils.ts
 *
 * Gemini 专用辅助函数集合。
 * 从 app.ts 提取，负责 Gemini 响应解析、请求摘要、图片/视频 parts 构建等逻辑。
 */

import type { ProviderRouteKey } from "../../contracts/types.js";
import type { LlmRequestDebugTrace } from "../../contracts/llm-types.js";
import {
  parseImageDataUrl,
  fetchImageInlineData,
  readLocalImageInlineData,
  resolveLocalImageFilePath,
  resolveServerRelativeImageUrl,
} from "../media/image-utils.js";
import { compactUnknownText } from "../../utils/text.js";
import type { ResolvedRouteProvider } from "./provider-resolver.js";

/** Gemini 默认安全阈值设置（放宽默认严格策略，防止人物/服装类内容被误杀） */
export const GEMINI_DEFAULT_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
];

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** LLM grounding 来源信息 */
export interface LlmGroundingSource {
  title: string;
  url: string;
}

/** LLM 纯文本请求结果 */
export interface LlmPlainTextResult {
  text: string;
  groundingSources: LlmGroundingSource[];
  debugTrace?: LlmRequestDebugTrace;
}

/** LLM 图片输入 */
export interface LlmImageInput {
  url: string;
  label?: string;
}

/** LLM 视频输入 */
export interface LlmVideoInput {
  base64: string;
  mimeType: string;
  /** 远程视频 URL（优先于 base64，避免大文件 inline 传输导致超限） */
  videoUrl?: string;
}

/** LLM 请求选项 */
export interface LlmRequestOptions {
  imageInputs?: LlmImageInput[];
  /** 视频输入（base64 + mimeType），OpenAI 兼容 provider 会自动转为 video_url data URL */
  videoInput?: LlmVideoInput;
  forceGeminiGrounding?: boolean;
  forceGeminiTransport?: boolean;
  forceOpenAiTransport?: boolean;
  timeoutMsOverride?: number;
  /** 最大输出 token 数，不设置则使用模型默认值 */
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// 函数实现
// ---------------------------------------------------------------------------

/** 提取 Gemini 响应中的文本内容 */
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

/** 提取 Gemini grounding 来源 */
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

/** 判断是否为 Gemini Provider */
export function isGeminiProvider(provider: ResolvedRouteProvider): boolean {
  const vendor = provider.vendor.trim().toLowerCase();
  const base = provider.baseUrl.trim().toLowerCase();
  return (
    vendor.includes("gemini") ||
    vendor.includes("google") ||
    vendor.includes("vertex") ||
    base.includes("generativelanguage.googleapis.com")
  );
}

/** 判断是否应使用 Gemini 视频反推传输 */
export function shouldUseGeminiVideoReverseTransport(provider: ResolvedRouteProvider): boolean {
  if (isGeminiProvider(provider)) {
    return true;
  }
  const vendor = provider.vendor.trim().toLowerCase();
  const base = provider.baseUrl.trim().toLowerCase();
  const model = provider.model.trim().toLowerCase();
  return (vendor.includes("yunwu") || base.includes("yunwu.ai")) && model.includes("gemini");
}

/** 解析 Gemini API Key（去除 Bearer 前缀） */
export function parseGeminiApiKey(secret: string): string {
  return secret.replace(/^Bearer\s+/i, "").trim();
}

/** 解析 Gemini 图片内联数据（支持 data URL / http / 本地路径 / 服务器相对路径） */
export async function resolveGeminiImageInlineData(
  input: LlmImageInput,
  timeoutMs: number,
): Promise<{ mimeType: string; data: string }> {
  const sourceUrl = input.url.trim();
  if (!sourceUrl) {
    throw new Error("image url is empty");
  }
  const dataUrl = parseImageDataUrl(sourceUrl);
  if (dataUrl) {
    return dataUrl;
  }
  if (/^https?:\/\//i.test(sourceUrl)) {
    return fetchImageInlineData(sourceUrl, timeoutMs);
  }
  const localFilePath = resolveLocalImageFilePath(sourceUrl);
  if (localFilePath) {
    return readLocalImageInlineData(localFilePath);
  }
  const serverRelativeUrl = resolveServerRelativeImageUrl(sourceUrl);
  if (serverRelativeUrl) {
    return fetchImageInlineData(serverRelativeUrl, timeoutMs);
  }
  throw new Error("unsupported image url format (expect data url or http/https url)");
}

/** 推断图片 MIME 类型（基于 URL 后缀） */
function inferMimeTypeFromUrl(url: string): string {
  const lower = url.toLowerCase().split("?")[0].split("#")[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

/** 判断是否为公开 HTTP/HTTPS URL */
function isPublicHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** 构建 Gemini 远程图片 part（使用 file_uri，无需下载） */
function buildGeminiRemoteImagePart(imageUrl: string): Record<string, unknown> {
  return {
    file_data: {
      mime_type: inferMimeTypeFromUrl(imageUrl),
      file_uri: imageUrl,
    },
  };
}

/** 构建 Gemini 图片 parts（支持两种传输方式，最多 2 张） */
export async function buildGeminiImageParts(
  imageInputs: LlmImageInput[] | undefined,
  timeoutMs: number,
  options?: { imageTransport?: "file_url" | "base64" },
): Promise<Array<Record<string, unknown>>> {
  const inputs = (imageInputs ?? [])
    .filter((item) => Boolean(item?.url?.trim()))
    .slice(0, 2);
  if (inputs.length < 1) {
    return [];
  }
  const parts: Array<Record<string, unknown>> = [];
  for (const input of inputs) {
    const sourceUrl = input.url.trim();
    // data URL 已是 base64，必须走 inline_data
    const dataUrl = parseImageDataUrl(sourceUrl);
    if (dataUrl) {
      parts.push({
        inline_data: {
          mime_type: dataUrl.mimeType,
          data: dataUrl.data,
        },
      });
      continue;
    }
    // HTTP/HTTPS URL → 根据 imageTransport 决定传输方式
    if (isPublicHttpUrl(sourceUrl)) {
      // 默认 file_url（向后兼容），仅显式指定 "base64" 时才下载转 inline_data
      if (options?.imageTransport !== "base64") {
        parts.push(buildGeminiRemoteImagePart(sourceUrl));
      } else {
        const payload = await resolveGeminiImageInlineData(input, timeoutMs);
        parts.push({
          inline_data: {
            mime_type: payload.mimeType,
            data: payload.data,
          },
        });
      }
      continue;
    }
    // 本地路径或服务器相对路径 → 下载后 inline_data
    const payload = await resolveGeminiImageInlineData(input, timeoutMs);
    parts.push({
      inline_data: {
        mime_type: payload.mimeType,
        data: payload.data,
      },
    });
  }
  return parts;
}

/** 摘要 Gemini 请求体（将 base64 图片数据替换为占位符） */
export function summarizeGeminiRequestBody(body: Record<string, unknown>): string {
  try {
    const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    const contents = Array.isArray(cloned.contents) ? cloned.contents : [];
    for (const content of contents) {
      if (!content || typeof content !== "object") {
        continue;
      }
      const record = content as Record<string, unknown>;
      const parts = Array.isArray(record.parts) ? record.parts : [];
      for (const part of parts) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const partRecord = part as Record<string, unknown>;
        const inlineData =
          (partRecord.inline_data as Record<string, unknown> | undefined) ??
          (partRecord.inlineData as Record<string, unknown> | undefined);
        if (!inlineData) {
          continue;
        }
        const raw = inlineData.data;
        if (typeof raw === "string") {
          inlineData.data = `[base64:${raw.length}]`;
        }
      }
    }
    return compactUnknownText(cloned, 100000);
  } catch {
    return compactUnknownText(body, 100000);
  }
}

/** 构建 Gemini 远程视频 part */
export function buildGeminiRemoteVideoPart(videoUrl: string, mimeType: string): Record<string, unknown> {
  // 云雾 API 使用蛇形命名
  return {
    file_data: {
      mime_type: mimeType,
      file_uri: videoUrl,
    },
  };
}

/** 构建 Gemini 内联视频 part */
export function buildGeminiInlineVideoPart(videoBase64: string, mimeType: string): Record<string, unknown> {
  // 云雾 API 使用蛇形命名
  return {
    inline_data: {
      mime_type: mimeType,
      data: videoBase64,
    },
  };
}
