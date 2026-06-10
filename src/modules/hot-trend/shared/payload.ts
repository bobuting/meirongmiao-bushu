/**
 * 热榜 Payload 标准化函数
 * 处理 LLM 返回的 JSON 数据
 */

import type {
  HotTrendSuitability,
  // HotTrendHumanPresence,  // UNUSED
  // HotTrendHumanExposure,  // UNUSED
  // HotTrendVideoScreenVerdict,  // UNUSED
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
  HotTrendVideoMultimodalScreenResult,
} from "../types.js";
// import { HOT_TREND_STEP3_MAX_DURATION_SEC, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS } from "../constants.js";  // UNUSED
import {
  sanitizeHotTrendNarrativeText,
  summarizeHotTrendAuditSnippet,
  limitHotTrendShotBreakdowns,
} from "./sanitize.js";
import { buildHotTrendStoryScriptFromSegments } from "./build.js";
import {
  normalizeHotTrendShotBreakdowns,
  normalizeHotTrendSceneSettings,
  toHotTrendSceneSettingsArray,
  clampHotTrendStep3DurationSec,
  normalizeHotTrendHumanPresence,
  normalizeHotTrendHumanExposure,
  normalizeHotTrendVideoScreenVerdict,
} from "./normalize.js";

// ============================================================================
// 反推分镜优化 Payload 标准化
// ============================================================================

// ============================================================================
// 视频多模态筛选 Payload 标准化
// ============================================================================

/**
 * 标准化视频多模态筛选结果
 */
export function normalizeHotTrendVideoMultimodalScreenPayload(
  raw: unknown,
  fallback: {
    topicLabel: string;
    sourceUrl?: string;
    textInsight: {
      suitability: HotTrendSuitability;
      labels: string[];
      reason: string;
    };
  },
): HotTrendVideoMultimodalScreenResult {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const contextText = `${fallback.topicLabel} ${fallback.textInsight.labels.join(" ")} ${fallback.textInsight.reason}`.trim();
  const suitabilityRaw = String(record.suitability ?? record.scoreLevel ?? fallback.textInsight.suitability).trim().toLowerCase();
  const suitability: HotTrendSuitability =
    suitabilityRaw === "high" || suitabilityRaw === "medium" || suitabilityRaw === "low"
      ? suitabilityRaw
      : fallback.textInsight.suitability;
  const humanPresence = normalizeHotTrendHumanPresence(
    record.humanPresence ?? record.human_presence ?? record.presence,
    contextText,
  );
  const humanExposure = normalizeHotTrendHumanExposure(
    record.humanExposure ?? record.human_exposure ?? record.exposure,
    contextText,
  );
  const reason = sanitizeHotTrendNarrativeText(
    String(record.reason ?? record.why ?? fallback.textInsight.reason).trim() || fallback.textInsight.reason,
  );
  return {
    suitability,
    verdict: normalizeHotTrendVideoScreenVerdict(record.verdict ?? record.result, {
      suitability,
      reason,
      humanPresence,
      humanExposure,
    }),
    reason,
    humanPresence,
    humanExposure,
  };
}

