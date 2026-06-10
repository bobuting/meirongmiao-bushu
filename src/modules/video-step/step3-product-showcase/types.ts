/**
 * Step3 产品展示脚本生成 - 类型定义
 * 面向单模特多角度多场景多动作的产品导向带货策略
 */

/** 拍摄场景 */
export const PRODUCT_SCENES = [
  "室内试穿",
  "街拍展示",
  "咖啡馆场景",
  "办公室通勤",
  "户外自然",
  "家居休闲",
  "商场购物",
  "运动健身",
  "约会场景",
  "旅行出行",
] as const;

export type ProductScene = typeof PRODUCT_SCENES[number];

/** 展示风格 */
export const PRODUCT_SHOWCASE_STYLES = [
  "快节奏混剪",
  "沉浸式体验",
  "对比展示",
  "故事线引导",
  "细节放大",
  "场景轮播",
] as const;

export type ProductShowcaseStyle = typeof PRODUCT_SHOWCASE_STYLES[number];

/** 镜头运动 */
export const PRODUCT_CAMERA_MOVEMENTS = [
  "快速切换",
  "环绕展示",
  "推拉特写",
  "跟随运动",
  "固定机位",
  "升降镜头",
] as const;

export type ProductCameraMovement = typeof PRODUCT_CAMERA_MOVEMENTS[number];

/** 氛围情绪 */
export const PRODUCT_MOODS = [
  "明亮温馨",
  "清新自然",
  "高级冷淡",
  "活力动感",
  "柔和浪漫",
  "简约利落",
] as const;

export type ProductMood = typeof PRODUCT_MOODS[number];

/** 开场方式 */
export const PRODUCT_OPENINGS = [
  "全身亮相",
  "产品特写",
  "场景先入",
  "动作切入",
  "背面转身",
  "近景拉开",
] as const;

export type ProductOpening = typeof PRODUCT_OPENINGS[number];

/** 收尾方式 */
export const PRODUCT_ENDINGS = [
  "多角度混剪",
  "全景定格",
  "购买引导",
  "细节回顾",
  "多色展示",
  "穿搭总结",
] as const;

export type ProductEnding = typeof PRODUCT_ENDINGS[number];

/** 音乐节奏 */
export const PRODUCT_MUSIC_RHYTHMS = [
  "明快节奏",
  "电子节拍",
  "轻柔背景",
  "潮流音乐",
  "自然白噪音",
] as const;

export type ProductMusicRhythm = typeof PRODUCT_MUSIC_RHYTHMS[number];

/** 产品展示多样性组合 */
export interface ProductDiversityCombination {
  scene: ProductScene;
  showcaseStyle: ProductShowcaseStyle;
  cameraMovement: ProductCameraMovement;
  mood: ProductMood;
  openingStyle: ProductOpening;
  endingStyle: ProductEnding;
  musicRhythm: ProductMusicRhythm;
}

/** 产品展示导演人格 */
export interface ProductDirectorPersona {
  name: string;
  specialty: string;
  styleSignature: string;
  cameraPreference: string;
  editingRhythm: string;
}

/** 产品展示导演人格池 */
export const PRODUCT_DIRECTOR_PERSONAS: ProductDirectorPersona[] = [
  { name: "林夏", specialty: "快节奏电商混剪", styleSignature: "用密集镜头变化和快切营造产品诱惑力", cameraPreference: "快速切换+多角度拍摄", editingRhythm: "每 3 秒切换一个角度或场景，节奏紧凑" },
  { name: "陈悦", specialty: "沉浸式产品体验", styleSignature: "用第一视角和慢动作让观众感受面料和版型", cameraPreference: "缓慢推拉+特写放大", editingRhythm: "节奏舒缓，给每个细节足够的展示时间" },
  { name: "赵铭", specialty: "场景化产品叙事", styleSignature: "把产品融入生活场景，让观众想象自己的使用画面", cameraPreference: "跟随拍摄+场景切换", editingRhythm: "按场景分段，每段有完整的展示弧线" },
  { name: "周晴", specialty: "细节质感展示", styleSignature: "用极端特写和光影变化传递产品的高级质感", cameraPreference: "微距拍摄+光效变化", editingRhythm: "从全貌到细节的渐进式展示" },
];

/** 视觉概念（阶段1输出） */
export interface ProductVisualConcept {
  /** 概念标题 */
  title: string;
  /** 核心卖点 */
  productFocus: string[];
  /** 色调方向 */
  colorTone: string;
  /** 场景规划 */
  scenePlan: Array<{
    scene: string;
    purpose: string;
    keyShots: string[];
  }>;
  /** 模特动作 */
  modelActions: string[];
  /** 核心画面 */
  keyVisual: string;
  /** 结尾画面 */
  endingVisual: string;
}
