/**
 * image-callmodes/openai-image-caixiang.ts
 *
 * CallMode: OPENAI_IMAGE_CAIXIANG
 * 协议: 才翔AI /v1/media/generate（gpt-image-2）
 * 特点：支持同步返回和异步轮询两种模式
 */

import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";
import { normalizeProviderTransportImageUrls, parseSecretCandidates } from "./shared.js";

// ---------------------------------------------------------------------------
// 尺寸映射
// ---------------------------------------------------------------------------

/** 分辨率归一化 */
type CaixiangResolution = "1k" | "2k" | "4k";

const CAIXIANG_IMAGE_SIZES = [
  "1024x1024", "1024x1536", "1536x1024", "960x1280", "1280x960",
  "1088x1920", "1920x1088", "2048x2048", "2048x3072", "3072x2048",
  "1920x2560", "2560x1920", "1440x2560", "2560x1440", "2880x2880",
  "2304x3456", "3456x2304", "2400x3200", "3200x2400", "2160x3840", "3840x2160"
] as const;

/**
 * 每种比例在不同分辨率下的尺寸映射
 * 未指定分辨率时默认使用 2k
 */
const RATIO_SIZE_MAP: Record<string, Record<CaixiangResolution, string>> = {
  "1:1":    { "1k": "1024x1024", "2k": "2048x2048", "4k": "2880x2880" },
  "9:16":   { "1k": "960x1280",  "2k": "1088x1920", "4k": "2160x3840" },
  "16:9":   { "1k": "1280x960",  "2k": "1920x1088", "4k": "3840x2160" },
  "3:4":    { "1k": "1024x1536", "2k": "1920x2560", "4k": "2304x3456" },
  "4:3":    { "1k": "1536x1024", "2k": "2560x1920", "4k": "3456x2304" },
};

/** 默认比例（当未传入 ratio 时使用） */
const DEFAULT_RATIO = "9:16";

/**
 * 将业务 ratio + resolution 映射为才翔AI size 参数
 * @param ratio - 图片比例，如 "9:16"、"1:1" 等，默认 "9:16"
 * @param resolution - 分辨率等级 "1k" / "2k" / "4k"，默认 "2k"
 */
function mapCaixiangImageSize(ratio?: string, resolution?: string): string {
  const normalizedRatio = (ratio ?? DEFAULT_RATIO).replace(/\s/g, "");
  const normalizedRes: CaixiangResolution =
    resolution === "1k" || resolution === "2k" || resolution === "4k"
      ? resolution
      : "2k";

  // 别名映射
  let mappedRatio = normalizedRatio;
  if (normalizedRatio === "square") mappedRatio = "1:1";
  if (normalizedRatio === "landscape") mappedRatio = "16:9";
  if (normalizedRatio === "portrait") mappedRatio = "9:16";

  // 按比例 + 分辨率查表
  const sizeMap = RATIO_SIZE_MAP[mappedRatio];
  if (sizeMap) {
    return sizeMap[normalizedRes];
  }

  // 直接传入预设尺寸（如 "1088x1920"），不区分分辨率
  if (CAIXIANG_IMAGE_SIZES.includes(normalizedRatio as typeof CAIXIANG_IMAGE_SIZES[number])) {
    return normalizedRatio;
  }

  // fallback：默认比例 + 默认分辨率
  return RATIO_SIZE_MAP[DEFAULT_RATIO]!["2k"];
}

// ---------------------------------------------------------------------------
// 请求构建
// ---------------------------------------------------------------------------

function buildRequest(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: ImageCallModeOptions,
): ImageCallModeRequest {
  try {
    const url = new URL(provider.baseUrl);
    var endpoint = `${url.origin}/v1/media/generate`;
  } catch {
    var endpoint = `${provider.baseUrl.replace(/\/+$/, "")}/v1/media/generate`;
  }

  const size = mapCaixiangImageSize(options?.ratio, options?.resolution);
  const n = Math.max(1, Math.min(4, Number(options?.count) || 1));
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);

  const body: Record<string, unknown> = {
    model: provider.model || "gpt-image-2",
    prompt,
    params: {
      size,
      n,
      quality: "auto",
      response_format: "url",
    },
  };

  // image_to_image 模式：传入参考图
  if (options?.mode === "image_to_image" && normalizedImages.length > 0) {
    (body.params as Record<string, unknown>).images = normalizedImages.slice(0, 10);
  }

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKey = (secretCandidates.length > 0 ? secretCandidates[0] : provider.secret).replace(/^Bearer\s+/i, "").trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return { endpoint, headers, body };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/**
 * 从才翔AI响应中提取图片 URL
 *
 * 格式1（同步返回）: { data: [{ url }] }
 * 格式2（异步任务）: { code: 200, data: { task_id } }
 * 格式3（查询结果）: { task_id, state: "success", result_url: "..." }
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];
  if (!data || typeof data !== "object") return output;

  const root = data as Record<string, unknown>;

  // 格式1：同步返回 { data: [{ url }] }
  if (Array.isArray(root.data)) {
    for (const item of root.data) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const url = String(record.url ?? "").trim();
      if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
        output.push(url);
      }
      // Base64
      const b64 = String(record.b64_json ?? "").trim();
      if (b64 && !output.some((u) => u.includes(b64.substring(0, 32)))) {
        output.push(`data:image/png;base64,${b64}`);
      }
    }
    return output;
  }

  // 格式3：查询结果 { result_url }
  if (typeof root.result_url === "string" && root.result_url) {
    output.push(root.result_url);
  }

  return output;
}

/**
 * 从才翔AI响应中提取任务 ID（用于异步轮询）
 *
 * 格式: { code: 200, data: { task_id } } 或 { data: { task_id } }
 */
function extractTaskId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;

  // { data: { task_id } }
  if (root.data && typeof root.data === "object") {
    const dataObj = root.data as Record<string, unknown>;
    if (dataObj.task_id !== undefined && dataObj.task_id !== null) {
      return String(dataObj.task_id);
    }
  }

  // { task_id }
  if (root.task_id !== undefined && root.task_id !== null) {
    return String(root.task_id);
  }

  return null;
}

/**
 * 判断响应是否为异步任务（需要轮询）
 */
function isAsyncTask(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const root = data as Record<string, unknown>;

  // 如果有 task_id 但没有图片 URL，说明是异步任务
  const taskId = extractTaskId(data);
  const urls = extractImageUrls(data);

  return taskId !== null && urls.length === 0;
}

/**
 * 从响应中提取错误信息
 */
function extractError(data: unknown): { code: string; message: string } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;

  // { code: xxx, msg: "...", data: { "失败原因": [...] } }
  if (typeof root.code === "number" && root.code !== 200) {
    const dataObj = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : null;
    const failReasons = dataObj?.["失败原因"];
    let detailMsg = String(root.msg ?? "请求失败");
    if (Array.isArray(failReasons) && failReasons.length > 0) {
      detailMsg = `${detailMsg}: ${failReasons.join(", ")}`;
    }
    return {
      code: String(root.code),
      message: detailMsg,
    };
  }

  // { state: "failed" }
  if (root.state === "failed") {
    return {
      code: "TASK_FAILED",
      message: String(root.message ?? root.status ?? "图片生成失败"),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 导出 Handler
// ---------------------------------------------------------------------------

export const openaiImageCaixiangHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};

// 额外导出异步任务相关函数，供主流程使用
export const openaiImageCaixiangUtils = {
  extractTaskId,
  isAsyncTask,
  extractError,
};
