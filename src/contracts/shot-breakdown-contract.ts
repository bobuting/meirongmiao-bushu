/**
 * 分镜类型定义（统一标准）
 *
 * 所有脚本策略的 LLM 输出分镜结构统一使用此文件中的类型。
 * 包括：video/library/realtime/custom/fashion/aesthetic/effectiveness/emotion_archetype
 *
 * 主体严格分为两类：
 * - 人物（PersonSubject）：必须有 person_id、eye_line、clothing
 * - 物品（ObjectSubject）：不含 clothing、person_id
 * - 空镜：subjects 为空数组 []
 */

// ===== 时间码 =====

/** 时间码（字段可选，兼容 LLM 输出的不完整数据） */
export interface Timecode {
  start?: string;
  end?: string;
  duration_seconds?: number;
  [key: string]: unknown;
}

// ===== 人物主体 =====

/**
 * 人物主体
 *
 * 严格约束：
 * - type 必须为 "人物"
 * - person_id 必填
 * - eye_line 可选（LLM 可能输出 null）
 * - clothing 必填（ref 可选：用户角色锚定参考图，配角由 AI 智能生成）
 * - expression 可选
 */
export interface PersonSubject {
  type: "人物";
  person_id: number;
  subject_id?: number | null;
  description?: string | null;
  position?: string | null;
  body_angle?: string | null;
  /** 视线方向 */
  eye_line?: string | null;
  action?: string | null;
  movement?: string | null;
  movement_speed?: string | null;
  expression?: string | null;
  /** 服饰信息（人物必填，但 ref 可选） */
  clothing: {
    /** 服饰锚点标识，对应参考图中的搭配（如"搭配1"）。用户角色必填，配角可选 */
    ref?: string | null;
    overall_style?: string | null;
  };
  props?: string[] | null;
  [key: string]: unknown;
}

// ===== 物品主体 =====

/**
 * 物品主体
 *
 * 严格约束：
 * - type 必须为 "物体"
 * - 不含 clothing、person_id、expression
 * - eye_line 可为 null（物品没有视线）
 */
export interface ObjectSubject {
  type: "物体";
  subject_id?: number | null;
  description?: string | null;
  position?: string | null;
  body_angle?: string | null;
  /** 视线方向（物品可为 null） */
  eye_line?: string | null;
  action?: string | null;
  movement?: string | null;
  movement_speed?: string | null;
  props?: string[] | null;
  [key: string]: unknown;
}

// ===== 主体联合类型 =====

/**
 * 分镜主体（discriminated union）
 *
 * 根据 type 字段区分人物和物品：
 * - type === "人物" → PersonSubject
 * - type === "物体" → ObjectSubject
 */
export type ShotSubject = PersonSubject | ObjectSubject;

// ===== 单个分镜 =====

/** 单个分镜（统一标准） */
export interface ShotBreakdownItem {
  shot_id: number;
  timecode?: Timecode;
  shot_type?: string;
  camera_movement?: string;
  transition_in?: Record<string, unknown> | string;
  transition_out?: Record<string, unknown> | string;
  visual?: Record<string, unknown>;
  subjects?: ShotSubject[];
  text_elements?: Array<{
    type: string;
    content: string;
    position?: string;
    style?: string;
    animation?: string;
  }>;
  audio?: {
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
    /** 环境音描述（LLM 输出字段） */
    ambient_sound?: string;
    sound_effects?: Array<{
      type: string;
      description?: string;
      sync_point?: string;
    }>;
  };
  /** 相机参数（焦距、焦点、稳定方式、机位高度/角度、镜头特效） */
  camera_details?: Record<string, unknown>;
  /** 变速与特效（播放速度、变速渐变、定格帧、叠加效果） */
  speed_effects?: Record<string, unknown>;
  shot_description?: string;
  [key: string]: unknown;
}

// ===== 剪辑分析 =====

/** 剪辑分析 */
export interface EditingAnalysis {
  total_shots?: number;
  average_shot_duration?: number;
  longest_shot_seconds?: number;
  shortest_shot_seconds?: number;
  editing_rhythm?: string;
  pacing?: "快" | "中" | "慢" | string;
  cut_style?: string;
  [key: string]: unknown;
}
