/**
 * 分镜类型定义（情感原型策略产出）
 *
 * 对应 Skills 提示词输出的标准 JSON 结构：
 * { video_info, video_analysis, shot_breakdown, editing_analysis }
 */

import type { ShotBreakdownItem } from "./shot-breakdown-contract.js";

// ===== video_info =====

/** 视频基本信息 */
export interface StoryboardVideoInfo {
  /** 脚本标题，8-15字，概括故事核心 */
  title: string;
  /** 总时长（秒），15-30秒范围内 */
  duration_seconds: number;
  /** 备选标题数组，3个最优标题，用于 Step5 交付发布展示 */
  title_candidates?: string[];
  source?: string;
  time_of_day?: string;
  weather?: string;
  main_scene?: string;
}

// ===== video_analysis =====

/** 情绪信息 */
export interface StoryboardEmotionInfo {
  primary?: string;
  secondary?: string[];
  emotion_arc?: string;
}

/** 人物出镜详情 */
export interface StoryboardPersonDetail {
  person_id: number;
  description?: string;
  age?: number;
  gender?: string;
  screen_time_ratio?: number;
  appearance_notes?: string;
}

/** 人物出镜信息 */
export interface StoryboardOnScreenPresence {
  has_real_person?: boolean;
  person_count?: number;
  person_details?: StoryboardPersonDetail[];
  exposure_level?: string;
  exposure_description?: string;
}

/** 服饰植入信息 */
export interface StoryboardFashionPlacement {
  suitable?: boolean;
  reason?: string;
  recommended_styles?: string[];
  placement_notes?: string;
}

/** 视频分析 */
export interface StoryboardVideoAnalysis {
  title?: string;
  theme?: string;
  summary?: string;
  emotion?: StoryboardEmotionInfo;
  video_type?: string;
  video_style?: string;
  target_audience?: string;
  key_elements?: string[];
  on_screen_presence?: StoryboardOnScreenPresence;
  fashion_placement?: StoryboardFashionPlacement;
  /** 整体氛围 */
  atmosphere?: string;
  [key: string]: unknown;
}

// ===== shot_breakdown =====

/** 时间码 */
export interface StoryboardTimecode {
  start: string;
  end: string;
  duration_seconds: number;
}

/** 转场信息 */
export interface StoryboardTransition {
  type: string;
  duration_seconds: number;
}

/** 场景信息 */
export interface StoryboardScene {
  location_type?: string;
  specific_location?: string;
  environment?: string;
  [key: string]: unknown;
}

/** 光线信息 */
export interface StoryboardLighting {
  type?: string;
  direction?: string;
  mood?: string;
  [key: string]: unknown;
}

/** 色彩信息 */
export interface StoryboardColor {
  dominant_colors?: string[];
  color_mood?: string;
  color_grade?: string;
  [key: string]: unknown;
}

/** 视觉信息 */
export interface StoryboardVisual {
  scene?: StoryboardScene;
  lighting?: StoryboardLighting;
  color?: StoryboardColor;
  [key: string]: unknown;
}

/** 服饰信息 */
export interface StoryboardClothing {
  /** 服饰锚点标识，对应参考图中的搭配（如"搭配1"） */
  ref?: string;
  overall_style?: string;
  /** 服饰视觉变化描述（由 validateClothingShowcase 校验） */
  visual_change?: string;
  // 以下字段已废弃，保留以兼容旧数据
  top?: string;
  bottom?: string;
  accessories?: string;
  [key: string]: unknown;
}

/** 主体信息 */
export interface StoryboardSubject {
  subject_id?: number;
  type?: string;
  person_id?: number;
  description?: string;
  position?: string;
  body_angle?: string;
  eye_line?: string;
  action?: string;
  movement?: string;
  movement_speed?: string;
  expression?: string;
  clothing?: StoryboardClothing;
  props?: string[];
  [key: string]: unknown;
}

/** 音频信息 */
export interface StoryboardAudio {
  dialogue?: {
    speaker?: string;
    content?: string;
    tone?: string;
  } | null;
  narration?: {
    content?: string;
    text?: string;
    tone?: string;
  } | null;
  music?: {
    presence?: boolean;
    mood?: string;
    tempo?: string;
    style?: string;
  };
  sound_effects?: Array<{
    type?: string;
    description?: string;
    sync_point?: string;
  }>;
  [key: string]: unknown;
}

/** 单个镜头（分镜条目，基于统一 ShotBreakdownItem 扩展） */
export interface StoryboardShot extends ShotBreakdownItem {
  /** 时长秒数（convertToSnapshot 使用） */
  duration_sec?: number;
}

// ===== editing_analysis =====

/** 剪辑分析 */
export interface StoryboardEditingAnalysis {
  total_shots: number;
  average_shot_duration: number;
  longest_shot_seconds: number;
  shortest_shot_seconds: number;
  editing_rhythm?: string;
  pacing?: string;
  cut_style?: string;
  [key: string]: unknown;
}

// ===== 顶层分镜结构 =====

/** 完整分镜（LLM 产出的标准 JSON 结构） */
export interface Storyboard {
  video_info: StoryboardVideoInfo;
  video_analysis: StoryboardVideoAnalysis;
  shot_breakdown: StoryboardShot[];
  editing_analysis: StoryboardEditingAnalysis;
}
