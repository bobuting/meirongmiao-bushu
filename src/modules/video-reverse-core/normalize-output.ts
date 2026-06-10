/**
 * LLM 输出标准化函数
 * 从 sync-service.ts 移动到核心模块，实现单点维护
 */

import type { VideoHotTrendAnalysisOutputFull } from "../video-hot-trend/types.js";
import type {
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
} from "../../contracts/hot-trend-base.js";

// ============================================================================
// LlmReverseOutput 类型定义
// ============================================================================

/**
 * LLM 反推输出类型
 * 直接透传 LLM 原始嵌套格式，附加从新字段推导的 hot_trend_labels
 */
export type LlmReverseOutput = VideoHotTrendAnalysisOutputFull & {
  hot_trend_labels: {
    suitability: HotTrendSuitability;
    humanPresence: HotTrendHumanPresence;
    humanExposure: HotTrendHumanExposure;
    labels: string[];
    reason: string;
  };
};

// ============================================================================
// 标准化函数
// ============================================================================

/**
 * 标准化 LLM 反推输出
 * 直接透传 LLM 原始嵌套 JSON，仅提取 hot_trend_labels 用于打标
 */
export function normalizeLlmReverseOutput(raw: unknown): LlmReverseOutput {
  const record = (raw ?? {}) as Record<string, unknown>;

  // 透传原始 LLM 嵌套结构（通过 unknown 中转避免 TS2352）
  const videoAnalysis = record.video_analysis as unknown | undefined;
  const editingAnalysis = record.editing_analysis as unknown | undefined;
  const shotBreakdown = Array.isArray(record.shot_breakdown) ? record.shot_breakdown : [];
  const videoInfo = record.video_info as unknown | undefined;

  // ---- hot_trend_labels 推导 ----
  const va = (videoAnalysis ?? {}) as Record<string, unknown>;
  const onScreenPresence = (va.on_screen_presence ?? {}) as Record<string, unknown>;
  const fashionPlacement = (va.fashion_placement ?? {}) as Record<string, unknown>;

  const hasRealPerson = onScreenPresence.has_real_person;
  const exposureLevel = onScreenPresence.exposure_level;
  const isFashionSuitable = fashionPlacement.suitable;

  const suitability: HotTrendSuitability =
    isFashionSuitable === true ? "high"
      : isFashionSuitable === false ? "low"
      : "medium";

  const humanPresence: HotTrendHumanPresence =
    hasRealPerson === true ? "yes"
      : hasRealPerson === false ? "no"
      : "uncertain";

  const humanExposure: HotTrendHumanExposure =
    typeof exposureLevel === "string"
      ? exposureLevel.includes("高") ? "large"
        : exposureLevel.includes("低") ? "none"
        : "partial"
      : "uncertain";

  const labels = [
    ...([va.video_type, va.video_style].filter(Boolean) as string[]),
    ...(Array.isArray(fashionPlacement.recommended_styles)
      ? (fashionPlacement.recommended_styles as Record<string, unknown>[]).map((s) =>
          typeof s.style === "string" ? s.style.trim() : ""
        )
      : []),
  ].filter((l) => l.length > 0);

  const reason =
    typeof fashionPlacement.reason === "string" ? fashionPlacement.reason.trim()
      : typeof fashionPlacement.placement_notes === "string" ? fashionPlacement.placement_notes.trim()
      : "";

  return {
    ...(record as unknown as LlmReverseOutput),
    video_info: videoInfo as unknown as LlmReverseOutput["video_info"],
    video_analysis: videoAnalysis as unknown as LlmReverseOutput["video_analysis"],
    shot_breakdown: shotBreakdown as unknown as LlmReverseOutput["shot_breakdown"],
    editing_analysis: editingAnalysis as unknown as LlmReverseOutput["editing_analysis"],
    hot_trend_labels: {
      suitability,
      humanPresence,
      humanExposure,
      labels,
      reason,
    },
  };
}