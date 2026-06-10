/**
 * 情感原型策略类型定义
 */

/** 情感原型 */
export interface EmotionArchetype {
  id: string;
  name: string;
  category: "自我发现" | "时间流逝" | "人际连接" | "意外时刻" | "日常仪式" | "蜕变逆袭" | "身份切换" | "仪式庆典";
  emotionCore: string;           // 情感核心：如 "不确定 → 接纳"
  moment: string;                // 时刻描述
  conflict: string;              // 核心冲突
  clothingRole: string;          // 服饰角色
  visualCues: string[];          // 视觉线索
  duration: string;              // 时长范围：如 "12-18秒"
  shotCount: number;             // 镜头数：如 3
  syncMode: "情绪同步" | "动作同步" | "环境同步";
  suitableStyles: string[];      // 适用服饰风格
  suitableAge: string[];         // 适用年龄段
  suitableGender: string[];      // 适用性别
}

/** 故事大纲 */
export interface StoryOutline {
  outline_id: string;
  archetype_id: string;
  story_summary: string;
  emotion_arc: string;
  conflict_description: string;
  shots_outline: ShotOutline[];
  clothing_showcase_plan: ClothingShowcasePlan;
}

/** 镜头大纲 */
export interface ShotOutline {
  shot_number: number;
  duration_seconds: number;
  scene: string;
  emotion: string;
  action: string;
  clothing_role: string;
  sync_point: string;
}

/** 服饰展示计划 */
export interface ClothingShowcasePlan {
  primary_moments: string[];
  visual_changes: string[];
  sync_mode: string;
}

/** 大纲评分结果 */
export interface OutlineScore {
  outline: StoryOutline;
  score: number;
  reasons: string[];
}

/** 分镜验证结果 */
export interface StoryboardValidation {
  pass: boolean;
  score: number;
  issues: string[];
}
