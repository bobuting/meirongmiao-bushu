/**
 * 主题叙事策略类型定义
 */

/** 剧情事件 */
export interface PlotEvent {
  /** 事件描述（具体、可视） */
  event: string;
  /** 触发原因 */
  cause: string;
  /** 产生的结果（推动下一个事件） */
  effect: string;
  /** 事件发生时角色的状态 */
  character_state: string;
}

/** 角色变化弧线 */
export interface CharacterArc {
  /** 故事开始时的状态 */
  before: string;
  /** 触发变化的关键事件 */
  trigger: string;
  /** 变化后的状态 */
  after: string;
}

/** 事件因果链节点 */
export interface EventChainLink {
  /** 对应 plot_events 中的索引 */
  event_index: number;
  /** 服务于本事件的镜头编号 */
  shots: number[];
  /** 如何推动下一个事件 */
  causes_next: string;
}

/** 故事主题（第一段输出） */
export interface StoryTheme {
  theme_id: string;
  theme_title: string;
  hotspot_source: string;
  archetype_source: string;
  conflict: {
    core: string;
    two_sides: [string, string];
    resolution: string;
  };
  emotional_anchor: {
    target_emotion: string;
    empathy_point: string;
    emotional_arc: string;
  };
  character_setup: {
    identity: string;
    internal_state: string;
    growth_direction: string;
  };
  /** 剧情事件链（3-5个有因果关系的事件） */
  plot_events: PlotEvent[];
  /** 角色变化弧线 */
  character_arc: CharacterArc;
  /** 服装作为角色造型的一部分 */
  clothing_styling: {
    role: string;
    before: string;
    after: string;
    transition_moment: string;
  };
  scene_suggestions: string[];
  duration: string;
  shot_count: number;
}

/** 故事大纲（第二段输出） */
export interface StoryThemeOutline {
  outline_id: string;
  theme_title: string;
  conflict: string;
  emotion_arc: string;
  story_summary: string;
  /** 事件驱动的叙事结构 */
  story_structure: {
    setup: string;
    turning_point: string;
    climax: string;
    resolution: string;
  };
  /** 事件因果链 */
  event_chain: EventChainLink[];
  /** 角色造型弧线 */
  character_styling_arc: {
    before_state: string;
    transition_shot: number;
    after_state: string;
    visual_change: string;
  };
  shots_outline: ThemeOutlineShot[];
}

/** 大纲镜头 */
export interface ThemeOutlineShot {
  shot_number: number;
  duration_seconds: number;
  scene: string;
  emotion: string;
  action: string;
  clothing_role: string;
  narrative_purpose: string;
  dialogue_or_narration: string;
  /** 本镜头服务的剧情事件 */
  serves_event: string;
}

/** 生成参数 */
export interface StoryThemeGenerationParams {
  userId: string;
  characterDescription: string;
  outfitDescription: string;
  matchingReference?: string;
  clothingStyles?: string[];
  mustNotUseScenes: string[];
  mustNotUseEmotions: string[];
  mustNotUsePhrases: string[];
}

/** 生成结果 */
export interface StoryThemeGenerationResult {
  success: boolean;
  theme?: StoryTheme;
  outline?: StoryThemeOutline;
  /** 完整分镜数据（第三段 LLM 原始输出解析后的 JSON） */
  storyboardJson?: Record<string, unknown>;
  error?: string;
  metadata?: {
    total_time_ms: number;
    archetype_used: string;
    hotspot_date: string;
  };
}
