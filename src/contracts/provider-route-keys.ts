/**
 * Provider 路由键枚举
 * 按业务功能定义，每个功能点独立一个 routeKey
 *
 * 设计原则：
 * 1. 一个业务功能对应一个 routeKey
 * 2. 命名格式：{模块}_{功能}，如 step3_script_generation
 * 3. 删除 fallback 链概念，每个 routeKey 直接对应 Provider 配置
 */

import type { TargetAgeRange } from "./types.js";
import {
  isChildAgeGroup,
  isChildAge,
  getAgeGroupByRange,
  type AgeGroupRange
} from "../constants/age-groups.js";

/** 重新导出统一年龄段判断函数 */
export { isChildAge } from "../constants/age-groups.js";

/** Provider 路由键枚举 */
export const ProviderRouteKeys = {
  // === Step1 服饰上传 ===
    /** 服饰分析 */
  STEP1_FASHION_ANALYSIS: "step1_fashion_analysis",
  
  /** 服饰搜索 LLM 增强 */
  STEP1_FASHION_SEARCH: "step1_fashion_search",

  /** 角色预设生成 */
  STEP1_ROLE_PRESET: "step1_role_preset",

  /** 卖点提取（图片项目 Step1，从服饰分析结果提取电商卖点） */
  IMAGE_PROJECT_STEP1_SELLING_POINTS: "image_project_step1_selling_points",

  // === Step2 定妆 ===
  /** 五视图生成 - 儿童（≤17岁） */
  STEP2_FIVE_VIEW_GENERATION_CHILD: "step2_five_view_generation_child",
  /** 五视图生成 - 成人（≥18岁） */
  STEP2_FIVE_VIEW_GENERATION_ADULT: "step2_five_view_generation_adult",

  // === Step3 脚本生成 ===
  /** 实时热点脚本生成（Realtime 策略专用） */
  STEP3_REALTIME_SCRIPT_GENERATION: "step3_realtime_script_generation",
  /** 热点深度分析 */
  STEP3_HOT_DEEP_ANALYSIS: "step3_hot_deep_analysis",
  /** 分镜图生成 */
  STEP3_STORYBOARD_IMAGE: "step3_storyboard_image",
  /** 分镜图生成 - 儿童（≤17岁） */
  STEP3_STORYBOARD_IMAGE_CHILD: "step3_storyboard_image_child",
  /** 分镜图生成 - 成人（≥18岁） */
  STEP3_STORYBOARD_IMAGE_ADULT: "step3_storyboard_image_adult",

  /** 分镜提示词工程（Step3 视频项目，生成视频专业提示词） */
  STEP3_STORYBOARD_PROMPT: "step3_storyboard_prompt",

  /** 场景化种草脚本生成（Step3 Custom，基于场景故事+多样性组合） */
  STEP3_CUSTOM_SCRIPT_GENERATION: "step3_custom_script_generation",
  /** 场景化脚本概念生成（Step3 Custom 阶段1，轻量概念构思） */
  STEP3_CUSTOM_SCRIPT_CONCEPT: "step3_custom_script_concept",

  /** 时尚大片脚本生成（Step3 Fashion，基于视觉概念+镜头语言） */
  STEP3_FASHION_SCRIPT_GENERATION: "step3_fashion_script_generation",
  /** 时尚大片视觉概念生成（Step3 Fashion 阶段1，色调/镜头/氛围） */
  STEP3_FASHION_SCRIPT_CONCEPT: "step3_fashion_script_concept",

  /** 情感原型脚本生成（Step3 Emotion Archetype，两段式：大纲+分镜） */
  STEP3_EMOTION_ARCHETYPE_GENERATION: "step3_emotion_archetype_generation",
  /** 情感原型大纲生成（Step3 Emotion Archetype 阶段1，生成3个候选大纲） */
  STEP3_EMOTION_ARCHETYPE_OUTLINE: "step3_emotion_archetype_outline",

  /** 种草脚本生成（Step3 Effectiveness，基于热点匹配+服饰资产） */
  SCRIPT_EFFECTIVENESS_GENERATION: "script_effectiveness_generation",

  /** 生活美学脚本生成（Step3 Aesthetic，情感叙事与视觉展示） */
  STEP3_AESTHETIC_SCRIPT_GENERATION: "step3_aesthetic_script_generation",
  /** 产品展示脚本生成（Step3 Product Showcase，基于视觉概念+镜头语言） */
  STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION: "step3_product_showcase_script_generation",
  /** 产品展示视觉概念生成（Step3 Product Showcase 阶段1，色调/镜头/氛围） */
  STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT: "step3_product_showcase_script_concept",
  /** 主题叙事-主题构思（Step3 Story Theme 阶段1，热点×原型碰撞） */
  STEP3_STORY_THEME_CONCEPT: "step3_story_theme_concept",
  /** 主题叙事-故事大纲（Step3 Story Theme 阶段2，主题→大纲） */
  STEP3_STORY_THEME_OUTLINE: "step3_story_theme_outline",
  /** 主题叙事-分镜展开（Step3 Story Theme 阶段3，大纲→分镜） */
  STEP3_STORY_THEME_GENERATION: "step3_story_theme_generation",
  /** 共鸣故事概念生成（Step3 Resonance 阶段1，故事概念构思） */
  STEP3_RESONANCE_STORY_CONCEPT: "step3_resonance_story_concept",
  /** 共鸣故事分镜展开（Step3 Resonance 阶段2，概念→分镜） */
  STEP3_RESONANCE_STORY_GENERATION: "step3_resonance_story_generation",
  /** 视频热榜脚本改写（Step3 Video，热榜视频脚本适配改写） */
  STEP3_VIDEO_SCRIPT_REWRITE: "step3_video_script_rewrite",
  /** 库脚本改写（Step3 Library，资产库脚本角色适配改写） */
  STEP3_LIBRARY_SCRIPT_REWRITE: "step3_library_script_rewrite",
  /** 产品展示脚本改写（Step3 Product Showcase，产品展示脚本角色+产品适配改写） */
  STEP3_PRODUCT_SHOWCASE_SCRIPT_REWRITE: "step3_product_showcase_script_rewrite",

  // === 脚本质量与 Prompt 进化 ===
  /** 脚本质量评分（异步评分守护进程） */
  SCRIPT_QUALITY_SCORING: "script_quality_scoring",
  /** Prompt 进化提案生成（进化守护进程） */
  PROMPT_EVOLUTION_GENERATION: "prompt_evolution_generation",

  /** 模特图生成（图片项目 Step3，生成专业模特图） */
  IMAGE_PROJECT_STEP3_MODEL_PHOTO: "image_project_step3_model_photo",
  /** 模特图规划 - 成人（图片项目 Step3，LLM 规划模特图姿势和背景） */
  IMAGE_PROJECT_STEP3_MODEL_PLAN_ADULT: "image_project_step3_model_plan",
  /** 模特图规划 - 儿童（图片项目 Step3，LLM 规划模特图姿势和背景） */
  IMAGE_PROJECT_STEP3_MODEL_PLAN_CHILD: "image_project_step3_model_plan_child",
  /** 多人模特图规划（图片项目 Step3，LLM 规划多人站位、互动姿势和颜色分配） */
  IMAGE_PROJECT_STEP3_MULTI_PERSON_PLAN: "image_project_step3_multi_person_plan",
  /** 多人模特图生成（图片项目 Step3，生成多人模特图） */
  IMAGE_PROJECT_STEP3_MULTI_PERSON_PHOTO: "image_project_step3_multi_person_photo",

  // === Step4 电商详情页（图片项目） ===
  /** 一键长图生成（图片项目 Step4，万相营造商详长图 API） */
  IMAGE_PROJECT_STEP4_LONG_IMAGE: "image_project_step4_long_image",

  // === Step4 分镜视频 ===
  /** 分镜视频生成 - 儿童（≤17岁） */
  STEP4_CLIP_VIDEO_GENERATION_CHILD: "step4_clip_video_generation_child",
  /** 分镜视频生成 - 成人（≥18岁） */
  STEP4_CLIP_VIDEO_GENERATION_ADULT: "step4_clip_video_generation_adult",
  /** 分镜视频提示词优化（重试时分析失败原因并优化提示词） */
  STEP4_PROMPT_REFINER: "step4_prompt_refiner",
  /** 视频导出（拼接+导出成片） */
  STEP4_VIDEO_EXPORT: "step4_video_export",

  // === 裂变 ===
  /** 裂变视频生成 - 儿童（≤17岁） */
  FISSION_VIDEO_GENERATION_CHILD: "fission_video_generation_child",
  /** 裂变视频生成 - 成人（≥18岁） */
  FISSION_VIDEO_GENERATION_ADULT: "fission_video_generation_adult",
  /** 裂变故事生成（LLM 生成裂变故事脚本） */
  FISSION_STORY_GENERATION: "fission_story_generation",
  /** 裂变分镜提示词工程（生成裂变专业提示词） */
  FISSION_STORYBOARD_PROMPT: "fission_storyboard_prompt",
  /** 裂变分镜图片生成 - 儿童（≤17岁） */
  FISSION_STORYBOARD_IMAGE_CHILD: "fission_storyboard_image_child",
  /** 裂变分镜图片生成 - 成人（≥18岁） */
  FISSION_STORYBOARD_IMAGE_ADULT: "fission_storyboard_image_adult",

  // === 广场 ===
  /** 广场反推 */
  SQUARE_VIDEO_REVERSE: "square_video_reverse",
  /** 广场达人评估 */
  SQUARE_CREATOR_EVALUATION: "square_creator_evaluation",

  // === 热榜 ===
  /** 热榜反推 */
  HOT_TREND_VIDEO_REVERSE: "hot_trend_video_reverse",

  // === 审美特征库 ===
  /** 审美特征提取（AI 分析社交媒体图片提取审美特征） */
  AESTHETIC_FEATURE_EXTRACTION: "aesthetic_feature_extraction",

  // === 场景库 ===
  /** 场景特征提取（AI 分析社交媒体图片提取拍摄场景特征） */
  SCENE_FEATURE_EXTRACTION: "scene_feature_extraction",

  // === 情感原型库 ===
  /** 情感原型提取（从视频热点/实时热点/日报中提取可复用情感原型） */
  EMOTION_ARCHETYPE_EXTRACTION: "emotion_archetype_extraction",

  // === 库管理 ===
  /** 人像检测 */
  LIBRARY_PORTRAIT_DETECT: "library_portrait_detect",
  /** 服饰平铺图生成 */
  GARMENT_FLAT_LAY_GENERATION: "garment_flat_lay_generation",

  // === 换装 ===
  /** 换装图片生成（Stage 2，image_to_image 生成适配角色图） */
  OUTFIT_CHANGE_IMAGE_GENERATION: "outfit_change_image_generation",
  /** 换装视频编辑（Stage 3 视频编辑模式，可灵视频编辑 API） */
  OUTFIT_CHANGE_VIDEO_EDIT: "outfit_change_video_edit",
  /** 万相视频换人（wan2.2-animate-mix，视频角色替换） */
  WANXIANG_VIDEO_MIX: "wanxiang_video_mix",

  // === 动作迁移（AnimateAnyone） ===
  /** AnimateAnyone 图片检测（Step 1，人物图片合规检测） */
  ANIMATE_ANYONE_DETECT: "animate_anyone_detect",
  /** AnimateAnyone 模板生成（Step 2，从视频提取动作模板） */
  ANIMATE_ANYONE_TEMPLATE: "animate_anyone_template",
  /** AnimateAnyone 视频生成（Step 3，图片+模板生成动作视频） */
  ANIMATE_ANYONE_VIDEO_GENERATION: "animate_anyone_video_generation",

  // === 音乐 ===
  /** 音乐氛围分析 */
  MUSIC_ATMOSPHERE_ANALYSIS: "music_atmosphere_analysis",

  // === 能力实验室 ===
  /** 文本生成测试 */
  TEXT_GENERATION: "text_generation",
  /** 图片生成测试 */
  IMAGE_GENERATION: "image_generation",
  /** 视频生成测试 */
  VIDEO_GENERATION: "video_generation",
} as const;

/** Provider 路由键类型 */
export type ProviderRouteKey = typeof ProviderRouteKeys[keyof typeof ProviderRouteKeys];

/** 所有 Provider 路由键列表 */
export const ALL_PROVIDER_ROUTE_KEYS: ProviderRouteKey[] = Object.values(ProviderRouteKeys);

/** 校验是否为有效的 Provider 路由键 */
export function isProviderRouteKey(value: unknown): value is ProviderRouteKey {
  return typeof value === "string" && ALL_PROVIDER_ROUTE_KEYS.includes(value as ProviderRouteKey);
}

/** 解析 Provider 路由键，接受任意非空字符串（允许扩展不在枚举中的 routeKey） */
export function parseProviderRouteKey(value: unknown): ProviderRouteKey {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ProviderRouteKey: ${String(value)}. Must be a non-empty string`);
  }
  return value.trim() as ProviderRouteKey;
}

/**
 * 判断年龄范围是否为儿童组（支持 "all" 特殊值）
 * @param ageRange 年龄段字符串，如 "2-3"、"4-6"、"7-12"、"all" 等
 * @returns 是否为儿童年龄段
 */
export function isChildAgeRange(ageRange: TargetAgeRange): boolean {
  if (ageRange === "all") return true; // 全年龄段包含儿童
  const ageGroup = getAgeGroupByRange(ageRange as AgeGroupRange);
  return isChildAgeGroup(ageGroup);
}

/**
 * 根据年龄选择对应的 RouteKey
 *
 * @param age - 角色年龄（0-30岁）
 * @param childKey - 儿童场景的 RouteKey（≤17岁）
 * @param adultKey - 成人场景的 RouteKey（≥18岁）
 * @returns 对应的 RouteKey
 */
export function selectRouteKeyByAge(
  age: number | null | undefined,
  childKey: ProviderRouteKey,
  adultKey: ProviderRouteKey,
): ProviderRouteKey {
  return isChildAge(age) ? childKey : adultKey;
}