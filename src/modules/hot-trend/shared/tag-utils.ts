/**
 * 热榜标签工具函数
 * 从 app.ts 迁移，包含标签处理相关函数
 *
 * 迁移源: app.ts 行 7475-7515
 */

import type { HotTrendEvidenceType, HotTrendInsight } from "../types.js";
import {
  HOT_TREND_REASON_PREFIX,
  HOT_TREND_SUITABILITY_PREFIX,
  HOT_TREND_LABEL_PREFIX,
  HOT_TREND_TEXT_REASON_PREFIX,
  HOT_TREND_TEXT_SUITABILITY_PREFIX,
  HOT_TREND_TEXT_LABEL_PREFIX,
  HOT_TREND_MULTIMODAL_REASON_PREFIX,
  HOT_TREND_MULTIMODAL_VERDICT_PREFIX,
  HOT_TREND_MULTIMODAL_HUMAN_PRESENCE_PREFIX,
  HOT_TREND_MULTIMODAL_HUMAN_EXPOSURE_PREFIX,
  HOT_TREND_RECOMMENDED_PREFIX,
  HOT_TREND_HUMAN_PRESENCE_PREFIX,
  HOT_TREND_RELABELED_AT_PREFIX,
  HOT_TREND_RELABEL_BATCH_PREFIX,
} from "../constants.js";
import { isHotTrendCautiousOrRejectedInsight } from "./infer.js";

// ============================================================================
// 标签过滤
// ============================================================================

/**
 * 移除热榜分类标签
 * 保留非热榜相关的标签
 */
export function stripHotTrendClassificationTags(tags: string[]): string[] {
  return tags.filter((tag) => {
    return !(
      tag.startsWith(HOT_TREND_REASON_PREFIX) ||
      tag.startsWith(HOT_TREND_SUITABILITY_PREFIX) ||
      tag.startsWith(HOT_TREND_LABEL_PREFIX) ||
      tag.startsWith(HOT_TREND_TEXT_REASON_PREFIX) ||
      tag.startsWith(HOT_TREND_TEXT_SUITABILITY_PREFIX) ||
      tag.startsWith(HOT_TREND_TEXT_LABEL_PREFIX) ||
      tag.startsWith(HOT_TREND_MULTIMODAL_REASON_PREFIX) ||
      tag.startsWith(HOT_TREND_MULTIMODAL_VERDICT_PREFIX) ||
      tag.startsWith(HOT_TREND_MULTIMODAL_HUMAN_PRESENCE_PREFIX) ||
      tag.startsWith(HOT_TREND_MULTIMODAL_HUMAN_EXPOSURE_PREFIX) ||
      tag.startsWith(HOT_TREND_RECOMMENDED_PREFIX) ||
      tag.startsWith(HOT_TREND_HUMAN_PRESENCE_PREFIX) ||
      tag.startsWith(HOT_TREND_RELABELED_AT_PREFIX) ||
      tag.startsWith(HOT_TREND_RELABEL_BATCH_PREFIX) ||
      tag === "#推荐入选" ||
      tag === "#仅资产入库" ||
      tag === "#真人出镜" ||
      tag === "#无真人出镜" ||
      tag === "#真人待确认" ||
      tag === "#重打标"
    );
  });
}

// ============================================================================
// 视频洞察验证
// ============================================================================

/**
 * 检查视频多模态结果是否适合生成
 */
export function isVideoHotTrendMultimodalEligibleForGeneration(
  input: {
    verdict: string;
    humanPresence: string;
    humanExposure: string;
    suitability: string;
    reason: string;
  } | null | undefined,
): boolean {
  if (!input) {
    return false;
  }
  if (input.verdict !== "pass") {
    return false;
  }
  if (input.humanPresence !== "yes") {
    return false;
  }
  if (input.humanExposure !== "large") {
    return false;
  }
  if (input.suitability !== "high") {
    return false;
  }
  if (isHotTrendCautiousOrRejectedInsight({ labels: [], reason: input.reason })) {
    return false;
  }
  return true;
}

// ============================================================================
// 证据类型处理
// ============================================================================

/**
 * 解析证据类型显示标签
 */
export function resolveHotTrendEvidenceDisplayLabel(value: HotTrendEvidenceType): string {
  return value === "reverse_verified" ? "反推实证" : "创作推断";
}

/**
 * 解析证据类型提示
 */
export function resolveHotTrendEvidenceNotice(value: HotTrendEvidenceType): string {
  if (value === "reverse_verified") {
    return "该资产包含有效视频反推/多模态分析结果。";
  }
  return "该资产未命中有效反推 transcript 或多模态证据，内容属于创作推断。";
}