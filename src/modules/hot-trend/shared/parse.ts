/**
 * 热榜解析函数
 * 从 app.ts 迁移，包含所有标签解析相关函数
 *
 * 迁移源: app.ts 行 6952-7013, 7024-7473
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
  HotTrendVideoScreenVerdict,
  HotTrendSmartStoryboardClass,
  HotTrendEvidenceType,
} from "../types.js";
import {
  HOT_TREND_KEY_PREFIX,
  HOT_TREND_TYPE_PREFIX,
  HOT_TREND_TYPE_LEGACY_VIDEO_TAG,
  HOT_TREND_TYPE_LEGACY_REALTIME_TAG,
  HOT_TREND_REASON_PREFIX,
  HOT_TREND_SUITABILITY_PREFIX,
  HOT_TREND_UPDATED_AT_PREFIX,
  HOT_TREND_SYNCED_AT_PREFIX,
  HOT_TREND_LABEL_PREFIX,
  HOT_TREND_TOP_RANK_PREFIX,
  HOT_TREND_PROMPT_VERSION_PREFIX,
  HOT_TREND_TOPN_PREFIX,
  HOT_TREND_GENERATION_MODE_PREFIX,
  HOT_TREND_STORY_POLISH_MODE_PREFIX,
  HOT_TREND_RECOMMENDED_PREFIX,
  HOT_TREND_EVIDENCE_PREFIX,
  HOT_TREND_TEXT_REASON_PREFIX,
  HOT_TREND_TEXT_SUITABILITY_PREFIX,
  HOT_TREND_TEXT_LABEL_PREFIX,
  HOT_TREND_MULTIMODAL_REASON_PREFIX,
  HOT_TREND_MULTIMODAL_VERDICT_PREFIX,
  HOT_TREND_MULTIMODAL_HUMAN_PRESENCE_PREFIX,
  HOT_TREND_MULTIMODAL_HUMAN_EXPOSURE_PREFIX,
  HOT_TREND_SMART_STORYBOARD_CLASS_PREFIX,
} from "../constants.js";

// ============================================================================
// 智能故事板类型解析
// ============================================================================

/**
 * 解析智能故事板类型标签
 */
export function parseHotTrendSmartStoryboardClass(tags: readonly string[]): HotTrendSmartStoryboardClass | null {
  const rawTag = tags.find((tag) => {
    const normalized = String(tag).trim().replace(/^#/, "").toLowerCase();
    return normalized.startsWith(HOT_TREND_SMART_STORYBOARD_CLASS_PREFIX);
  });
  if (!rawTag) {
    return null;
  }
  const normalized = String(rawTag).trim().replace(/^#/, "").toLowerCase();
  const value = normalized.slice(HOT_TREND_SMART_STORYBOARD_CLASS_PREFIX.length).trim();
  if (value === "realtime" || value === "video_copy" || value === "video_shot") {
    return value;
  }
  return null;
}

// ============================================================================
// 热榜类型解析
// ============================================================================

/**
 * 从标签解析热榜类型
 */
export function resolveHotTrendTypeFromTags(tags: string[]): HotTrendType {
  const normalizedTags = Array.isArray(tags) ? tags : [];
  if (
    normalizedTags.includes(`${HOT_TREND_TYPE_PREFIX}video`) ||
    normalizedTags.includes(HOT_TREND_TYPE_LEGACY_VIDEO_TAG) ||
    normalizedTags.includes("#视频热榜") ||
    normalizedTags.includes("视频热榜")
  ) {
    return "video";
  }
  if (
    normalizedTags.includes(`${HOT_TREND_TYPE_PREFIX}realtime`) ||
    normalizedTags.includes(HOT_TREND_TYPE_LEGACY_REALTIME_TAG) ||
    normalizedTags.includes("#实时热榜") ||
    normalizedTags.includes("实时热榜")
  ) {
    return "realtime";
  }
  return "realtime";
}

/**
 * 检查标签是否匹配热榜类型
 */
export function matchesHotTrendTypeTag(tags: string[], type: HotTrendType): boolean {
  if (type === "video") {
    return (
      tags.includes(`${HOT_TREND_TYPE_PREFIX}video`) ||
      tags.includes(HOT_TREND_TYPE_LEGACY_VIDEO_TAG) ||
      resolveHotTrendTypeFromTags(tags) === "video"
    );
  }
  return (
    tags.includes(`${HOT_TREND_TYPE_PREFIX}realtime`) ||
    tags.includes(HOT_TREND_TYPE_LEGACY_REALTIME_TAG) ||
    resolveHotTrendTypeFromTags(tags) === "realtime"
  );
}

// ============================================================================
// 热榜键解析
// ============================================================================

/**
 * 解析热榜键标签
 */
export function parseHotTrendKeyTag(tags: readonly string[]): string | null {
  const rawTag = tags.find((tag) => {
    const normalized = String(tag).trim().replace(/^#/, "").toLowerCase();
    return normalized.startsWith(HOT_TREND_KEY_PREFIX);
  });
  if (!rawTag) {
    return null;
  }
  const normalized = String(rawTag).trim().replace(/^#/, "").toLowerCase();
  const value = normalized.slice(HOT_TREND_KEY_PREFIX.length).trim();
  if (value.length < 1) {
    return null;
  }
  return `${HOT_TREND_KEY_PREFIX}${value}`;
}

// ============================================================================
// 基础标签解析
// ============================================================================

/**
 * 解析热榜原因标签
 */
export function parseHotTrendReason(tags: string[]): string {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_REASON_PREFIX));
  if (!tag) {
    return "暂无评估数据，等待模型分析。";
  }
  const reason = tag.slice(HOT_TREND_REASON_PREFIX.length).replace(/_/g, " ").trim();
  return reason || "暂无评估数据，等待模型分析。";
}

/**
 * 解析更新时间标签
 */
export function parseHotTrendUpdatedAtTag(tags: string[]): string | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_UPDATED_AT_PREFIX));
  if (!tag) {
    return null;
  }
  const value = tag.slice(HOT_TREND_UPDATED_AT_PREFIX.length).trim().toLowerCase();
  return value.length > 0 ? value : null;
}

/**
 * 解析同步时间标签
 */
export function parseHotTrendSyncedAtTag(tags: string[]): number | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_SYNCED_AT_PREFIX));
  if (!tag) {
    return null;
  }
  const raw = Number(tag.slice(HOT_TREND_SYNCED_AT_PREFIX.length).trim());
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return Math.floor(raw);
}

/**
 * 解析适合度标签
 */
export function parseHotTrendSuitability(tags: string[]): HotTrendSuitability | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_SUITABILITY_PREFIX));
  const value = tag?.slice(HOT_TREND_SUITABILITY_PREFIX.length).trim().toLowerCase();
  if (value === "high" || value === "low") {
    return value;
  }
  if (value === "medium") {
    return "medium";
  }
  return null;
}

/**
 * 解析标签数组
 */
export function parseHotTrendLabels(tags: string[]): string[] {
  return tags
    .filter((item) => item.startsWith(HOT_TREND_LABEL_PREFIX))
    .map((item) => item.slice(HOT_TREND_LABEL_PREFIX.length).replace(/_/g, " ").trim())
    .filter((item) => item.length > 0);
}

// ============================================================================
// 文本分析标签解析
// ============================================================================

/**
 * 解析文本原因标签
 */
export function parseHotTrendTextReason(tags: string[]): string | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_TEXT_REASON_PREFIX));
  if (!tag) {
    return null;
  }
  const reason = tag.slice(HOT_TREND_TEXT_REASON_PREFIX.length).replace(/_/g, " ").trim();
  return reason || null;
}

/**
 * 解析文本适合度标签
 */
export function parseHotTrendTextSuitability(tags: string[]): HotTrendSuitability | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_TEXT_SUITABILITY_PREFIX));
  const value = tag?.slice(HOT_TREND_TEXT_SUITABILITY_PREFIX.length).trim().toLowerCase();
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return null;
}

/**
 * 解析文本标签数组
 */
export function parseHotTrendTextLabels(tags: string[]): string[] {
  return tags
    .filter((item) => item.startsWith(HOT_TREND_TEXT_LABEL_PREFIX))
    .map((item) => item.slice(HOT_TREND_TEXT_LABEL_PREFIX.length).replace(/_/g, " ").trim())
    .filter((item) => item.length > 0);
}

// ============================================================================
// 多模态分析标签解析
// ============================================================================

/**
 * 解析多模态原因标签
 */
export function parseHotTrendMultimodalReason(tags: string[]): string | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_MULTIMODAL_REASON_PREFIX));
  if (!tag) {
    return null;
  }
  const reason = tag.slice(HOT_TREND_MULTIMODAL_REASON_PREFIX.length).replace(/_/g, " ").trim();
  return reason || null;
}

/**
 * 解析多模态判决标签
 */
export function parseHotTrendMultimodalVerdict(tags: string[]): HotTrendVideoScreenVerdict | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_MULTIMODAL_VERDICT_PREFIX));
  const value = tag?.slice(HOT_TREND_MULTIMODAL_VERDICT_PREFIX.length).trim().toLowerCase();
  if (value === "pass" || value === "caution" || value === "reject") {
    return value;
  }
  return null;
}

/**
 * 解析多模态真人出镜标签
 */
export function parseHotTrendMultimodalHumanPresence(tags: string[]): HotTrendHumanPresence | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_MULTIMODAL_HUMAN_PRESENCE_PREFIX));
  const value = tag?.slice(HOT_TREND_MULTIMODAL_HUMAN_PRESENCE_PREFIX.length).trim().toLowerCase();
  if (value === "yes" || value === "no" || value === "uncertain") {
    return value;
  }
  return null;
}

/**
 * 解析多模态真人露出标签
 */
export function parseHotTrendMultimodalHumanExposure(tags: string[]): HotTrendHumanExposure | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_MULTIMODAL_HUMAN_EXPOSURE_PREFIX));
  const value = tag?.slice(HOT_TREND_MULTIMODAL_HUMAN_EXPOSURE_PREFIX.length).trim().toLowerCase();
  if (value === "large" || value === "partial" || value === "none" || value === "uncertain") {
    return value;
  }
  return null;
}

// ============================================================================
// 元数据标签解析
// ============================================================================

/**
 * 从内容解析来源URL
 */
export function parseHotTrendSourceUrl(content: string): string | null {
  const match = content.match(/(?:^|\n)\s*-\s*链接:\s*(https?:\/\/\S+)/i);
  if (match?.[1]) {
    return match[1].trim().replace(/[，。；、]$/u, "");
  }
  const fallback = content.match(/https?:\/\/[^\s"'<>]+/i);
  if (!fallback?.[0]) {
    return null;
  }
  return fallback[0].trim().replace(/[，。；、]$/u, "");
}

/**
 * 解析排名标签
 */
export function parseHotTrendTopRankTag(tags: string[]): number | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_TOP_RANK_PREFIX));
  if (!tag) {
    return null;
  }
  const raw = Number(tag.slice(HOT_TREND_TOP_RANK_PREFIX.length).trim());
  if (!Number.isFinite(raw) || raw < 1) {
    return null;
  }
  return Math.floor(raw);
}

/**
 * 解析提示词版本标签
 */
export function parseHotTrendPromptVersionTag(tags: string[]): string | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_PROMPT_VERSION_PREFIX));
  if (!tag) {
    return null;
  }
  const version = tag.slice(HOT_TREND_PROMPT_VERSION_PREFIX.length).replace(/_/g, " ").trim();
  return version.length > 0 ? version : null;
}

/**
 * 解析TopN标签
 */
export function parseHotTrendTopNTag(tags: string[]): number | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_TOPN_PREFIX));
  if (!tag) {
    return null;
  }
  const raw = Number(tag.slice(HOT_TREND_TOPN_PREFIX.length).trim());
  if (!Number.isFinite(raw) || raw < 1) {
    return null;
  }
  return Math.floor(raw);
}

/**
 * 解析生成模式标签
 */
export function parseHotTrendGenerationModeTag(tags: string[]): "real" | "degraded" | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_GENERATION_MODE_PREFIX));
  if (!tag) {
    return null;
  }
  const mode = tag.slice(HOT_TREND_GENERATION_MODE_PREFIX.length).trim().toLowerCase();
  if (mode === "real" || mode === "degraded") {
    return mode;
  }
  return null;
}

/**
 * 解析故事打磨模式标签
 */
export function parseHotTrendStoryPolishModeTag(tags: string[]): "llm_polished" | "fallback" | "llm_batch_polished" | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_STORY_POLISH_MODE_PREFIX));
  if (!tag) {
    return null;
  }
  const mode = tag.slice(HOT_TREND_STORY_POLISH_MODE_PREFIX.length).trim().toLowerCase();
  if (mode === "llm_polished" || mode === "fallback" || mode === "llm_batch_polished") {
    return mode;
  }
  return null;
}

/**
 * 解析推荐标签
 */
export function parseHotTrendRecommendedTag(tags: string[]): boolean | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_RECOMMENDED_PREFIX));
  if (!tag) {
    return null;
  }
  const value = tag.slice(HOT_TREND_RECOMMENDED_PREFIX.length).trim().toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

/**
 * 解析证据类型标签
 */
export function parseHotTrendEvidenceTypeTag(tags: string[]): HotTrendEvidenceType | null {
  const tag = tags.find((item) => item.startsWith(HOT_TREND_EVIDENCE_PREFIX));
  if (!tag) {
    return null;
  }
  const value = tag.slice(HOT_TREND_EVIDENCE_PREFIX.length).trim().toLowerCase();
  if (value === "reverse_verified" || value === "creative_inference") {
    return value;
  }
  return null;
}

// ============================================================================
// URL 解析函数
// ============================================================================

/**
 * 解析资产来源URL
 * 优先使用显式 sourceUrl，否则从内容中提取
 */
export function resolveHotTrendAssetSourceUrl(input: {
  sourceUrl?: string | null;
  content: string;
}): string | null {
  // 导入 normalizeHotTrendDouyinSourceUrl 会造成循环依赖，所以内联实现
  const normalizeUrl = (url: string | null | undefined): string | null => {
    if (!url || typeof url !== "string") {
      return null;
    }
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) {
      return null;
    }
    return trimmed.replace(/[，。；、]$/u, "");
  };

  return (
    normalizeUrl(input.sourceUrl) ??
    normalizeUrl(parseHotTrendSourceUrl(input.content))
  );
}

// ============================================================================
// 抖音热榜 Markdown 解析函数
// ============================================================================

/**
 * 解析热榜更新时间
 */
export function parseHotHubUpdatedAt(markdown: string): string | null {
  const patterns = [/最后更新时间[:：]\s*([^\r\n`]+)/, /更新时间[:：]\s*([^\r\n`]+)/];
  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

/**
 * 解析热榜区块标题
 */
export function resolveHotHubSectionHeader(
  lines: string[],
  type: "realtime" | "video",
): { title: string; startIndex: number } | null {
  const candidates = type === "video" ? ["音乐榜", "视频热榜"] : ["抖音热榜", "实时热榜"];
  for (const title of candidates) {
    const sectionHeader = `## ${title}`;
    const startIndex = lines.findIndex((line) => line.trim() === sectionHeader);
    if (startIndex >= 0) {
      return { title, startIndex };
    }
  }
  return null;
}

/**
 * 解析热榜区块
 */
export function parseHotHubSection(
  markdown: string,
  type: "realtime" | "video",
  limit: number,
): {
  id: number;
  label: string;
  url: string;
  trend: "up" | "down" | "flat";
  rawPayload?: Record<string, unknown>;
}[] {
  const lines = markdown.split(/\r?\n/);
  const section = resolveHotHubSectionHeader(lines, type);
  if (!section) {
    return [];
  }
  const endIndex = lines.findIndex(
    (line, index) => index > section.startIndex && line.trim().startsWith("## "),
  );
  const sectionLines = lines.slice(section.startIndex + 1, endIndex > -1 ? endIndex : undefined);
  const trendLoop: ("up" | "down" | "flat")[] = ["up", "up", "flat", "up", "down"];
  const topics: { id: number; label: string; url: string; trend: "up" | "down" | "flat"; rawPayload?: Record<string, unknown> }[] = [];
  for (const line of sectionLines) {
    const match = line.match(/^\s*\d+\.\s+\[(.+?)\]\((https?:\/\/[^)]+)\)(?:\s*-\s*(.+))?\s*$/);
    if (!match) {
      continue;
    }
    const title = match[1]?.trim() ?? "";
    const url = match[2]?.trim() ?? "";
    const suffix = type === "video" && match[3]?.trim() ? ` - ${match[3].trim()}` : "";
    if (!title || !url) {
      continue;
    }
    const id = topics.length + 1;
    topics.push({
      id,
      label: `${title}${suffix}`,
      url,
      trend: trendLoop[(id - 1) % trendLoop.length],
      rawPayload: {
        source: "douyin-hot-hub",
        section: section.title,
        row: line.trim(),
        title,
        url,
        suffix: suffix || null,
      },
    });
    if (topics.length >= limit) {
      break;
    }
  }
  return topics;
}