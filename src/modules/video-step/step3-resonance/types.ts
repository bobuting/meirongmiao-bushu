/**
 * Step3 共鸣故事脚本生成 - 类型定义
 * 真人故事+服饰自然融入的两阶段生成策略（概念→分镜）
 */

import type { FiveDimensionHotTrends } from "../step3-custom-script/types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";

/** 讲述者人格 — 每个脚本轮转使用不同人格 */
export const STORYTELLER_PERSONAS = [
  {
    name: "陈野",
    specialty: "街头纪实",
    styleSignature: "用粗糙的真实感打动人，不修饰不美化",
    cameraPreference: "手持跟拍，抓拍自然瞬间",
    editingRhythm: "节奏松弛，让生活自己说话",
  },
  {
    name: "赵锐",
    specialty: "冷峻反转",
    styleSignature: "表面平静下暗流涌动，用反转揭示真相",
    cameraPreference: "固定机位+突然切换，制造意外感",
    editingRhythm: "前半段克制铺垫，后半段突然加速",
  },
  {
    name: "苏暖",
    specialty: "生活治愈",
    styleSignature: "在平凡日常里找到温暖的诗意",
    cameraPreference: "中景为主，柔光自然光",
    editingRhythm: "舒缓均匀，像呼吸一样自然",
  },
  {
    name: "周白",
    specialty: "极简叙事",
    styleSignature: "用最少的镜头讲最大的故事，留白即力量",
    cameraPreference: "大远景+特写交替，去掉中间景别",
    editingRhythm: "慢节奏，每个镜头都值得停留",
  },
] as const;

export type StorytellerPersona = typeof STORYTELLER_PERSONAS[number];

/** 故事概念（阶段1输出） */
export interface ResonanceStoryConcept {
  /** 故事标题 */
  title: string;
  /** 主角描述（一句话） */
  protagonist: string;
  /** 处境/场景 */
  situation: string;
  /** 情绪弧线 */
  emotionArc: string;
  /** 关键时刻（冲突或转折） */
  keyMoment: string;
  /** 开场钩子设计 */
  hookDesign: string;
  /** 结尾暗示 */
  endingHint: string;
  /** 观众收获 */
  viewerTakeaway: string;
  /** 讲述者人格名称 */
  personaName: string;
}

/** 阶段1 LLM 返回结构 */
export interface ConceptPayload {
  title?: string;
  protagonist?: string;
  situation?: string;
  emotion_arc?: string;
  key_moment?: string;
  hook_design?: string;
  ending_hint?: string;
  viewer_takeaway?: string;
}

/** 共鸣故事生成参数 */
export interface ResonanceGenerationParams {
  ctx: import("../../../core/app-context.js").AppContext;
  userId: string;
  persona: StorytellerPersona;
  hotTrends: FiveDimensionHotTrends;
  outfitDescription?: string;
  characterDescription?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo | null;
  recommendedScenes?: string;
  projectId?: string;
}

/** 扩写阶段参数 */
export interface ExpandParams {
  ctx: import("../../../core/app-context.js").AppContext;
  userId: string;
  concept: ResonanceStoryConcept;
  persona: StorytellerPersona;
  outfitDescription?: string;
  characterDescription?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo | null;
  recommendedScenes?: string;
  goldenExamplesText?: string;
  projectId?: string;
}
