/**
 * 视频热榜类型定义
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
} from "../../contracts/hot-trend-base.js";
import type { ShotBreakdownItem, EditingAnalysis as EditingAnalysisUnified } from "../../contracts/shot-breakdown-contract.js";

// ============================================================================
// 视频分析输出结构（新版，匹配提示词）
// ============================================================================

/**
 * 时间段类型
 */
export type TimeOfDay = "早晨" | "上午" | "中午" | "下午" | "傍晚" | "夜晚" | "深夜";

/**
 * 天气状况类型
 */
export type WeatherCondition = "晴天" | "阴天" | "雨天" | "雪天" | "雾天" | "多云" | "不确定";

/**
 * 视频基础信息
 */
export interface VideoInfo {
  title: string;
  duration_seconds: number;
  source: string;
  time_of_day: TimeOfDay;
  weather: WeatherCondition;
}

/**
 * 情绪分析
 */
export interface EmotionAnalysis {
  primary: string;
  secondary: string[];
  emotion_arc: string;
}

/**
 * 人物出镜详情
 */
export interface PersonDetail {
  person_id: number;
  description: string;
  age?: number;
  gender?: string;
  screen_time_ratio: number;
  appearance_notes: string;
}

/**
 * 真人出镜信息
 */
export interface OnScreenPresence {
  has_real_person: boolean;
  person_count: number;
  person_details: PersonDetail[];
  exposure_level: "高" | "中" | "低";
  exposure_description: string;
}

/**
 * 服饰风格推荐
 */
export interface FashionStyleRecommendation {
  style: string;
  fit_score: number;
  reason: string;
  recommended_items: string[];
}

/**
 * 服饰植入推荐
 */
export interface FashionPlacement {
  suitable: boolean;
  reason: string;
  recommended_styles: FashionStyleRecommendation[];
  placement_notes: string;
}

/**
 * 视频分析（新版完整结构）
 */
export interface VideoAnalysisFull {
  title: string;
  theme: string;
  summary: string;
  emotion: EmotionAnalysis;
  video_type: string;
  video_style: string;
  target_audience: string;
  key_elements: string[];
  on_screen_presence: OnScreenPresence;
  fashion_placement: FashionPlacement | null;
}

// ============================================================================
// 统一分镜类型（从 contracts 导入）
// ============================================================================

/**
 * 镜头拆解（统一使用 ShotBreakdownItem）
 * 原 ShotBreakdownFull 已废弃，所有脚本策略统一使用 contracts/shot-breakdown-contract.ts
 */
export type ShotBreakdownFull = ShotBreakdownItem;

/**
 * 剪辑分析（统一使用 EditingAnalysis）
 * 原 EditingAnalysisFull 已废弃
 */
export type EditingAnalysisFull = EditingAnalysisUnified;

/**
 * 情感原型（LLM 提取）
 */
export interface EmotionArchetype {
  category: string;
  emotion_core: string;
  moment: string;
  conflict: string;
  clothing_role: string;
}

/**
 * 视频热榜分析完整输出（新版）
 */
export interface VideoHotTrendAnalysisOutputFull {
  video_info: VideoInfo;
  video_analysis: VideoAnalysisFull;
  shot_breakdown: ShotBreakdownFull[];
  editing_analysis: EditingAnalysisFull;
  emotion_archetype?: EmotionArchetype;
}

// ============================================================================
// 视频热榜配置
// ============================================================================

/**
 * 视频热榜同步配置
 */
export interface VideoHotTrendConfig {
  concurrency: number;
  timeoutMs: number;
  promptVersion: string;
  maxDurationSec: number;
  maxStoryboardSegments: number;
}

/**
 * 视频热榜分析输入
 * ossUrl: OSS 公开链接，供 LLM 参考（可选）
 */
export interface VideoHotTrendAnalysisInput {
  videoUrl: string;
  ossUrl: string | null;
  topicLabel: string;
  topicId: string;
}