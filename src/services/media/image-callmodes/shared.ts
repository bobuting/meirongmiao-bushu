/**
 * image-callmodes/shared.ts
 *
 * 多个 CallMode 共用的工具函数。
 */

export { normalizeProviderTransportImageUrls } from "../image-utils.js";
export { parseSecretCandidates } from "../../../utils/http-request.js";

// ---------------------------------------------------------------------------
// OpenAI gpt-image-2 统一尺寸映射（/v1/images/generations 与 /v1/images/edits 共用）
// 来源：云雾 API 文档 https://yunwu.apifox.cn/
// ---------------------------------------------------------------------------

/** gpt-image-2 支持的固定尺寸列表（两个端点完全一致） */
export const OPENAI_IMAGE_SIZES = [
  "1024x1024", "1536x1024", "1024x1536",
  "2048x2048", "2048x1152", "3840x2160", "2160x3840",
] as const;

/**
 * resolution × ratio → size 二维映射表
 *
 * 根据分辨率等级（1k/2k/4k）和比例（16:9/9:16/1:1）选择对应的 gpt-image-2 尺寸。
 * gpt-image-2 只支持 7 种固定尺寸，部分组合无完美匹配，取最接近的可用尺寸。
 */
export const OPENAI_RESOLUTION_SIZE_MAP: Record<string, Record<string, string>> = {
  "1k": {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
  },
  "2k": {
    "1:1":  "2048x2048",
    "16:9": "2048x1152",
    "9:16": "1024x1536",   // gpt-image-2 无 2k 竖版（1152x2048），取最接近的 1024x1536
  },
  "4k": {
    "1:1":  "2048x2048",   // gpt-image-2 无 4k 方形（4096x4096），fallback 到 2048x2048
    "16:9": "3840x2160",
    "9:16": "2160x3840",
  },
};

/** 比例别名 → 标准比例映射 */
const RATIO_ALIASES: Record<string, string> = {
  landscape: "16:9",
  portrait: "9:16",
  square: "1:1",
  "4:3": "16:9",            // gpt-image-2 无 4:3 尺寸，映射到最接近的 16:9
  "3:4": "9:16",            // gpt-image-2 无 3:4 尺寸，映射到最接近的 9:16
};

/**
 * 根据 resolution + ratio 解析 gpt-image-2 的 size 参数
 *
 * 两个端点（generations / edits）统一使用此函数，确保尺寸映射一致。
 *
 * @param resolution - 分辨率等级 "1k" / "2k" / "4k"，默认 "4k"
 * @param ratio - 图片比例，支持 "16:9" / "9:16" / "1:1" 或别名 landscape/portrait/square/4:3/3:4
 * @returns size 字符串，如 "3840x2160"；无法匹配时返回 "auto"
 */
export function resolveOpenaiImageSize(resolution?: string, ratio?: string): string {
  // ratio 缺失时降级到 4k 竖版 9:16（平台主流竖屏场景）
  if (!ratio) return "2160x3840";

  const res = (resolution ?? "4k").replace(/\s/g, "");
  const rat = ratio.replace(/\s/g, "");

  // 别名标准化
  const normalizedRatio = RATIO_ALIASES[rat] ?? rat;

  // 二维查表
  const sizeMap = OPENAI_RESOLUTION_SIZE_MAP[res];
  if (sizeMap) {
    const size = sizeMap[normalizedRatio];
    if (size) return size;
  }

  // 兼容直接传入精确尺寸（如 "1024x1024"）
  if ((OPENAI_IMAGE_SIZES as readonly string[]).includes(normalizedRatio)) {
    return normalizedRatio;
  }

  return "auto";
}

/**
 * 根据分辨率等级映射 gpt-image-2 的 quality 参数
 *
 * gpt-image-2 合法值：low / medium / high / auto
 * 2k/4k → "high"，1k → "medium"，其余 → undefined（不传，使用 API 默认 auto）
 */
export function resolveOpenaiImageQuality(resolution?: string): string | undefined {
  const res = (resolution ?? "").replace(/\s/g, "");
  if (res === "2k" || res === "4k") return "high";
  if (res === "1k") return "medium";
  return undefined;
}
