/**
 * 分镜提示词工程师 - 类型定义
 * 用于 shot-prompt-engineer-service.ts
 */

import type { ShotBreakdownItem } from "./shot-breakdown-contract.js";

// =====================================================
// 角色锚点类型
// =====================================================

/** 角色锚点 */
export interface CharacterAnchor {
  /** 角色ID */
  person_id: number;
  /** 英文角色锚点（≤250字符） */
  description: string;
  /** 中文角色锚点 */
  description_cn: string;
  /** 英文服饰锚点标识（≤50字符），对应参考图搭配编号，如 outfit 1 */
  clothing_anchor?: string;
  /** 中文服饰锚点标识，如 搭配1 */
  clothing_anchor_cn?: string;
  /** 来源：用户上传的角色参考图 / 角色文字描述 */
  source: string;
  /** 关键特征：面部/发型/体型/气质/肤色 */
  key_features?: string[];
  /** 服饰特征：上装/下装/配饰/鞋履 */
  clothing_features?: string[];
  /** 参考强度建议 */
  reference_strength?: string;
}

// =====================================================
// 镜头提示词类型
// =====================================================

/** 关键帧提示词（图生图） */
export interface KeyframePrompt {
  /** 英文提示词（≤2000字符） */
  prompt: string;
  /** 反向提示词（≤300字符） */
  negative_prompt: string;
  /** 参数 */
  parameters?: {
    aspect_ratio: string;
    quality_tags: string;
    style: string;
  };
  /** 生成注意事项 */
  notes?: string;
}

/** 视频提示词（图生视频） */
export interface VideoPrompt {
  /** 英文提示词（≤1200字符） */
  prompt: string;
  /** 反向提示词 */
  negative_prompt: string;
  /** 镜头运动类型 */
  camera_motion: string;
  /** 镜头运动详细描述 */
  camera_motion_detail?: string;
  /** 运动强度 */
  motion_intensity: string;
  /** 时长（秒） */
  duration_seconds: number;
  /** 参数 */
  parameters?: {
    transition_in?: string;
    transition_out?: string;
    focus_pull?: string;
  };
  /** 生成注意事项 */
  notes?: string;
}

/** 单个镜头的专业提示词 */
export interface ShotPromptItem {
  /** 镜头ID */
  shot_id: number;
  /** 对应输入 JSON 中该镜头的编号 */
  source_shot_reference?: string;
  /** 镜头类型：人物镜头 | 空镜 | 物体特写 */
  shot_type?: string;
  /** 关键帧提示词（图生图） */
  keyframe_prompt: KeyframePrompt;
  /** 视频提示词（图生视频） */
  video_prompt: VideoPrompt;
}

// =====================================================
// 完整输出结构
// =====================================================

/** 项目信息 */
export interface ShotPromptsProjectInfo {
  /** 项目标题 */
  title: string;
  /** 镜头总数 */
  total_shots: number;
  /** 画面比例 */
  aspect_ratio: string;
  /** 角色参考说明 */
  reference_image_notes?: string;
}

/** 情绪弧线 */
export interface EmotionalArc {
  /** 情绪弧线概述 */
  description: string;
  /** 色调配合情绪的策略 */
  color_strategy?: string;
  /** 镜头情绪映射 */
  shot_mapping?: Array<{
    shot_id: number;
    emotion: string;
    color_note?: string;
  }>;
}

/** 一致性说明 */
export interface ConsistencyNotes {
  /** 跨镜头人物一致性保障策略 */
  character_consistency: string;
  /** 跨镜头风格一致性保障策略 */
  style_consistency: string;
  /** 可能出现的生成问题及应对建议 */
  potential_issues?: string[];
}

/** 带视角信息的角色参考图 */
export interface CharacterReferenceImageEntry {
  url: string;
  viewKey?: "front" | "left" | "right" | "back" | "closeup";
}

/** 生成输入快照 */
export interface ShotPromptsInputSnapshot {
  /** 角色描述 */
  character_description?: string;
  /** 角色参考图URL列表（兼容旧格式：纯字符串数组；新格式：带viewKey的条目） */
  character_reference_images?: Array<string | CharacterReferenceImageEntry>;
  /** 画面比例 */
  aspect_ratio: string;
  /** 项目标题 */
  project_title?: string;
  /** 服饰描述 */
  outfit_description?: string;
  /** 服饰风格 */
  clothing_styles?: string[];
  /** 服装参考图URL */
  outfit_reference_images?: string[];
}

// =====================================================
// 数据库存储结构
// =====================================================

/**
 * 专业提示词数据（存储在 nrm_scripts_data.shot_prompts_json 字段）
 */
export interface ShotPromptsJson {
  /** 生成时间 */
  generated_at: number;

  /** 生成参数快照 */
  input_snapshot: ShotPromptsInputSnapshot;

  /** 项目信息 */
  project_info?: ShotPromptsProjectInfo;

  /** 角色锚点 */
  character_anchors: CharacterAnchor[];

  /** 每个镜头的专业提示词 */
  shots: ShotPromptItem[];

  /** 情绪弧线（可选） */
  emotional_arc?: EmotionalArc;

  /** 一致性说明（可选） */
  consistency_notes?: ConsistencyNotes;

  /** 角色匹配元数据（可观测性） */
  character_matching_meta?: {
    /** 主角色 ID */
    main_person_id: number | null;
    /** 总角色数 */
    total_persons: number;
    /** 每个角色出镜频率 */
    person_frequency: Record<number, number>;
    /** 是否应用了重映射 */
    remapping_applied: boolean;
    /** 重映射详情 */
    remapping_details: Record<number, number>;
    /** 服饰修正数量 */
    outfit_corrections: number;
    /** 服饰修正警告 */
    outfit_warnings: string[];
  };
}

// =====================================================
// API 请求/响应类型
// =====================================================

/**
 * 分镜段落数据（用于生成专业提示词）
 * 来自前端 projectData.script
 */
export interface ShotPromptSegment {
  /** 镜头标题 */
  title?: string;
  /** 镜头内容/描述 */
  content?: string;
  /** 视觉提示词 */
  visualCue?: string;
  /** 视频提示词 */
  videoCue?: string;
}

/** 生成分镜提示词请求 */
export interface GenerateShotPromptsRequest {
  /** 项目ID */
  projectId?: string;

  /** 脚本数据ID（nrm_scripts_data.id，仅记录用，裂变场景可为空） */
  scriptDataId?: string;

  /** 角色参考图URL列表（兼容旧格式：纯字符串数组；新格式：带viewKey的条目） */
  characterReferenceImages?: Array<string | CharacterReferenceImageEntry>;

  /** 角色文字描述 */
  characterDescription?: string;

  /** 画面比例，默认 9:16 */
  aspectRatio?: "9:16" | "16:9" | "1:1";

  /** 项目标题 */
  projectTitle?: string;

  /** 服饰描述 */
  outfitDescription?: string;

  /** 服饰风格 */
  clothingStyles?: string[];

  /** 服装参考图URL */
  outfitReferenceImages?: string[];

  /** 服饰参考图（平铺图），用于锚定服饰细节 */
  garmentReferenceImages?: string[];

  /**
   * 分镜段落数据（用户编辑的分镜列表）
   * 优先使用此数据生成提示词，确保 shot_id 与前端 segments 索引一致
   * 如果不传，则从 shot_breakdown 表获取（兼容旧逻辑）
   */
  segments?: ShotPromptSegment[];

  /**
   * 完整分镜 breakdown JSON（含 shot_type、camera_movement、subjects、audio 等）
   * 如果传入，优先使用此数据作为 shotBreakdownJson，而非从 segments 转换
   * 裂变场景下由 generateNewStory() 返回的 VideoScriptPayload.shot_breakdown 传入
   */
  shotBreakdownJson?: ShotBreakdownItem[];

  /**
   * LLM 生成温度参数（可选）
   * 裂变场景建议使用较高温度（如 0.9）以保证丰富性和多样性
   * 默认值：0.3（确定性强）
   */
  temperature?: number;
}

/** 生成分镜提示词响应 */
export interface GenerateShotPromptsResponse {
  /** 是否成功 */
  success: boolean;

  /** 成功时的数据 */
  data?: ShotPromptsJson;

  /** 失败时的错误信息 */
  error?: string;

  /** 调试用：发送给LLM的完整prompt */
  debugPrompt?: string;
}
