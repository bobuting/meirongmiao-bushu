/**
 * 脚本 DTO（前后端共用）
 * 统一脚本数据结构，替代：
 * - ScriptDataDto（前端API）
 * - Step3ScriptCandidate（前端控制器）
 */

import type {
  Step3VideoReversePipelineSource,
  Step3VideoStoryPolishMode,
} from "./step3-candidate-snapshot-contract.js";
import type { AtmosphereSceneCategory, EmotionToneCategory } from "../contant-config/style-atmosphere-dict.js";

/** 脚本策略类型 */
export type ScriptStrategyType =
  | "realtime"
  | "video"
  | "library"
  | "effectiveness"
  | "custom"
  | "fashion"
  | "emotion_archetype"
  | "aesthetic"
  | "new_story"
  | "product_showcase"
  | "story_theme"
  | "resonance";

/** 适用性评级 */
export type ScriptSuitability = "high" | "medium" | "low";

/** 分镜镜头 DTO（前后端共用） */
export interface ShotBreakdownDto {
  // === 基础字段 ===
  title: string;
  content: string;
  visualCue: string;
  visualPrompt?: string | null;
  shotSize?: string | null;
  dialogue?: string | null;
  action?: string | null;
  durationSec?: number | null;
  /** 分镜概要（数据库字段，30-60字符画面描述） */
  shot_description?: string | null;

  // === 扩展字段（前后端共用） ===
  emotionNote?: string | null;
  climaxFunction?: string | null;
  climaxIntensity?: number | null;
  isHook?: boolean | null;
  isClimax?: boolean | null;
  audio?: {
    dialogue?: { speaker?: string; content?: string; tone?: string } | null;
    narration?: { content?: string; tone?: string } | null;
    music?: { presence?: boolean; style?: string; mood?: string; tempo?: string } | null;
    sound_effects?: Array<{ type: string; description?: string; sync_point?: string }> | null;
  } | null;
}

/**
 * 脚本 DTO（前后端共用）
 * API 响应、前端展示统一使用此类型
 *
 * 注意：可选字段支持 `null`，与现有代码保持一致
 */
export interface ScriptDto {
  // === 核心标识 ===
  /** 唯一标识（可选别名，等同于 candidateId） */
  id?: string;
  /** 唯一标识（必填，后端代码主要使用此字段） */
  candidateId: string;
  strategyType: ScriptStrategyType;
  sourceScriptId?: string | null;
  sourceUrl?: string | null;

  // === 基本信息 ===
  title: string;
  summary?: string | null;
  content: string;
  preview?: string | null;
  durationSec: number;

  // === 排序与评级 ===
  rank?: number | null;
  suitability?: ScriptSuitability | null;

  // === 标签 ===
  labels?: string[];
  tags?: string[];

  // === 元数据 ===
  theme?: string | null;
  videoStyle?: string | null;
  videoType?: string | null;
  primaryEmotion?: string | null;
  /** 关键元素数组（从 video_analysis.key_elements 提取） */
  keyElements?: string[] | null;
  /** 服饰植入备注（从 video_analysis.fashion_placement.placement_notes 提取） */
  placementNotes?: string | null;

  // === 场景 ===
  mainScene?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  /** 整体氛围（统一字典：16 种氛围场景） */
  atmosphere?: AtmosphereSceneCategory | null;

  // === 分镜 ===
  storyboardSegments?: (ShotBreakdownDto | null)[];
  shotCount?: number | null;

  // === 情绪与风格 ===
  /** 主要情绪基调（统一字典：18 种情绪基调） */
  emotionTone?: EmotionToneCategory | null;
  emotionArc?: string | null;
  scriptStyle?: string | null;
  scriptType?: string | null;

  // === 受众 ===
  targetAudience?: string | null;
  audienceProfile?: string | null;

  // === 匹配信息 ===
  matchScore?: number | null;
  matchReasons?: string[];

  // === 其他业务字段 ===
  subtitle?: string | null;
  scene?: string | null;
  storyLine?: string | null;

  // === 状态 ===
  isSelected?: boolean;
  isConfirmed?: boolean;

  // === LLM 原始数据（可选，供高级场景使用） ===
  video_info?: Record<string, unknown>;
  video_analysis?: Record<string, unknown>;
  shot_breakdown?: Record<string, unknown>[];
  editing_analysis?: Record<string, unknown>;

  // === 后端特有字段（可选） ===
  storyPolishMode?: Step3VideoStoryPolishMode;
  sharedPipelineSource?: Step3VideoReversePipelineSource;
}

/** 脚本快照 DTO（包含快照元信息） */
export interface ScriptSnapshotDto {
  snapshotId: string;
  projectId: string;
  items: ScriptDto[];
  recommendedCount: number;
  totalCount: number;
  createdAt: number;
  generationMode?: "real" | "degraded";
}