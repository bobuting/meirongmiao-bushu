/**
 * Reverse Script Payload 构建函数
 * 用于从抖音视频逆向生成脚本内容
 */

/**
 * Script hints 类型定义
 */
export interface ReverseScriptHints {
  source: string;
  overviews: string[];
  itemCount: number;
}

/**
 * 标准化 script hints 中的 overviews
 */
export function normalizeReverseOverviews(
  scriptHints: ReverseScriptHints | null | undefined,
): string[] {
  if (!scriptHints || !Array.isArray(scriptHints.overviews)) {
    return [];
  }
  return scriptHints.overviews
    .map((item) => String(item ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * 构建逆向脚本生成的 prompt
 */
export function buildReverseScriptPrompt(
  resolvedVideoUrl: string,
  scriptHints: ReverseScriptHints | null | undefined,
): string {
  const overviews = normalizeReverseOverviews(scriptHints);
  if (overviews.length < 1) {
    return `Reverse-engineer a short-video script from this Douyin video URL: ${resolvedVideoUrl}.`;
  }
  const lines = overviews.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return [
    `Reverse-engineer a short-video script from this Douyin material.`,
    `Video URL: ${resolvedVideoUrl}`,
    `Use these extracted overviews as primary evidence:`,
    lines,
    `Target style: concise, practical, suitable for e-commerce soft-ad narration.`,
  ].join("\n");
}

/**
 * 构建逆向脚本生成的 seed（用于去重）
 */
export function buildReverseScriptSeed(
  resolvedVideoUrl: string,
  scriptHints: ReverseScriptHints | null | undefined,
): string {
  const overviews = normalizeReverseOverviews(scriptHints);
  if (overviews.length < 1) {
    return `reverse-video-url:${resolvedVideoUrl}`;
  }
  return `reverse-overview:${overviews.join(" | ").slice(0, 1200)}`;
}

/**
 * 构建逆向脚本的基本信息
 */
export function buildReverseScriptBasicInfo(
  resolvedVideoUrl: string,
  scriptHints: ReverseScriptHints | null | undefined,
): string {
  const overviews = normalizeReverseOverviews(scriptHints);
  if (overviews.length < 1) {
    return `基于视频链接提取：${resolvedVideoUrl}`;
  }
  return overviews.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

/**
 * 构建逆向脚本的 fallback payload
 */
export function buildReverseScriptFallbackPayload(
  resolvedVideoUrl: string,
  scriptHints: ReverseScriptHints | null | undefined,
): {
  basicInfo: string;
  roleTable: string;
  outfitTable: string;
  storyboard: string;
  rawText: string;
} {
  return {
    basicInfo: buildReverseScriptBasicInfo(resolvedVideoUrl, scriptHints),
    roleTable: "角色分工：可按原视频人物关系自行补充。",
    outfitTable: "服装建议：延续原视频穿搭风格，突出主视觉对比。",
    storyboard: "分镜建议：按开场钩子-主体信息-行动引导三段式展开。",
    rawText: "fallback",
  };
}