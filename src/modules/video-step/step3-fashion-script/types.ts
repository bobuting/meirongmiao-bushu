/**
 * Step3 时尚大片脚本生成 - 类型定义
 * 面向高端穿搭展示、LOOK、走秀、大片感的视觉优先策略
 */

/** 拍摄场景 */
export const FASHION_SCENES = [
  "街拍LOOK",
  "影棚大片",
  "户外自然",
  "建筑空间",
  "艺术装置",
  "地下车库",
  "天台露台",
  "咖啡馆空间",
  "酒店走廊",
  "花房温室",
  "老街巷弄",
  "工业废墟",
  "美术馆画廊",
  "泳池水畔",
  "T台走秀",
] as const;

export type FashionScene = typeof FASHION_SCENES[number];

/** 视觉风格 */
export const FASHION_VISUAL_STYLES = [
  "高级时装",
  "极简主义",
  "胶片质感",
  "梦幻柔焦",
  "赛博未来",
  "复古经典",
  "街头潮流",
  "浪漫唯美",
] as const;

export type FashionVisualStyle = typeof FASHION_VISUAL_STYLES[number];

/** 镜头运动 */
export const CAMERA_MOVEMENTS = [
  "慢推特写",
  "环绕运镜",
  "跟随运动",
  "升降镜头",
  "一镜到底",
  "多角度切换",
] as const;

export type CameraMovement = typeof CAMERA_MOVEMENTS[number];

/** 氛围情绪 */
export const FASHION_MOODS = [
  "冷峻高级",
  "慵懒随性",
  "力量感",
  "神秘深邃",
  "清新自然",
  "戏剧张力",
] as const;

export type FashionMood = typeof FASHION_MOODS[number];

/** 开场方式 */
export const FASHION_OPENINGS = [
  "特写入场",
  "背影转身",
  "环境先入",
  "剪影开场",
  "光影过渡",
  "声音先入",
] as const;

export type FashionOpening = typeof FASHION_OPENINGS[number];

/** 收尾方式 */
export const FASHION_ENDINGS = [
  "定格大片",
  "渐隐留白",
  "回眸结尾",
  "慢动作收束",
  "多造型混剪",
  "品牌落幅",
] as const;

export type FashionEnding = typeof FASHION_ENDINGS[number];

/** 音乐节奏 */
export const MUSIC_RHYTHMS = [
  "慢节奏氛围",
  "电子节拍",
  "古典弦乐",
  "爵士慵懒",
  "沉浸环境音",
] as const;

export type MusicRhythm = typeof MUSIC_RHYTHMS[number];

/** 创意张力 */
export const CREATIVE_TENSIONS = [
  "柔与刚",
  "古典与未来",
  "自然与人造",
  "静止与运动",
  "光与暗",
  "秩序与混乱",
  "东方与西方",
  "奢华与克制",
] as const;

export type CreativeTension = typeof CREATIVE_TENSIONS[number];

/** 视觉符号 */
export const VISUAL_SYMBOLS = [
  "水/镜面（映射与真实）",
  "植物/藤蔓（生命力与束缚）",
  "几何结构（秩序与理性）",
  "飞鸟/羽毛（自由与轻盈）",
  "金属/链条（力量与禁锢）",
  "烟雾/纱帘（神秘与遮蔽）",
  "建筑废墟（时间与重生）",
  "光线/棱镜（折射与多维）",
] as const;

export type VisualSymbol = typeof VISUAL_SYMBOLS[number];

/** 五维热点库 */
export interface FiveDimensionHotTrends {
  festival?: string[];
  entertainment?: string[];
  socialEmotion?: string[];
  challenge?: string[];
  crossover?: string[];
}

/** 时尚脚本多样性组合 */
export interface FashionDiversityCombination {
  scene: FashionScene;
  visualStyle: FashionVisualStyle;
  cameraMovement: CameraMovement;
  mood: FashionMood;
  openingStyle: FashionOpening;
  endingStyle: FashionEnding;
  musicRhythm: MusicRhythm;
  creativeTension: CreativeTension;
  visualSymbol: VisualSymbol;
}

/** 时尚脚本生成请求 */
export interface FashionScriptGenerationRequest {
  projectId: string;
  userId: string;
  diversity?: FashionDiversityCombination;
  count?: number;
}

/** 时尚脚本生成结果 */
export interface FashionScriptGenerationResult {
  diversity: FashionDiversityCombination;
  title: string;
  content: string;
  preview: string;
  shotBreakdown: Array<Record<string, unknown>>;
  videoAnalysis: Record<string, unknown>;
  editingAnalysis: Record<string, unknown>;
  durationSec: number;
}

/** 时尚导演人格 */
export interface FashionDirectorPersona {
  name: string;
  specialty: string;
  styleSignature: string;
  cameraPreference: string;
  editingRhythm: string;
}

/** 时尚导演人格池 */
export const FASHION_DIRECTOR_PERSONAS: FashionDirectorPersona[] = [
  { name: "沈光", specialty: "极简奢侈美学", styleSignature: "用留白和单一视觉元素制造压迫感的高级，每帧都是硬广级别的画面", cameraPreference: "中长焦固定机位，大量负空间构图，极少运镜", editingRhythm: "每个画面停留 3 秒以上，用静默制造奢侈感" },
  { name: "叶岚", specialty: "街头纪实时装", styleSignature: "真实场景中捕捉时尚张力，让街头、地铁、菜市场成为秀场", cameraPreference: "手持跟拍+自然光，偏爱低角度和过肩镜头", editingRhythm: "生活节奏感，穿插偷窥视角和路人反应" },
  { name: "温如", specialty: "浪漫诗性影像", styleSignature: "用光影和水元素创造梦幻感，画面如同一首流动的视觉诗", cameraPreference: "柔焦+逆光+水面反射，慢动作占比超过 50%", editingRhythm: "如同呼吸，缓慢起伏，用叠化连接每个镜头" },
  { name: "韩铮", specialty: "概念装置艺术", styleSignature: "用几何装置、雕塑、建筑空间构建超现实时尚世界", cameraPreference: "广角+极低/极高机位，利用建筑线条引导视线", editingRhythm: "冷峻克制，每个镜头独立如同一件装置作品" },
  { name: "程野", specialty: "实验视觉冲击", styleSignature: "打破观片习惯——非常规剪辑、失焦、过曝、故障美学。时尚不需要讨好", cameraPreference: "鱼眼/变形宽银幕镜头+手持晃动+突然推拉", editingRhythm: "不可预测——突然加速、突然定格、跳切破坏连续性" },
  { name: "陆白", specialty: "古典电影质感", styleSignature: "致敬黄金时代好莱坞和法国新浪潮，用经典布光和胶片质感讲述时尚故事", cameraPreference: "中焦定焦+伦勃朗光+轨道车平移", editingRhythm: "沉稳如老电影，每个转场都有经典电影的仪式感" },
];

/** 视觉概念（阶段1输出） */
export interface VisualConcept {
  /** 概念标题 */
  title: string;
  /** 视觉命题：美学立场声明 */
  visualThesis: string;
  /** 视觉参照：致敬的艺术流派/摄影师/电影 */
  visualReference: string;
  /** 创意张力：本片的视觉冲突 */
  creativeTension: string;
  /** 视觉符号及含义 */
  visualSymbols: string[];
  /** 色调方向 */
  colorPalette: string;
  /** 镜头语言 */
  cameraLanguage: string;
  /** 氛围锚点 */
  atmosphereAnchor: string;
  /** 视觉节拍 */
  visualBeats: string[];
  /** 核心画面 */
  keyVisual: string;
  /** 结尾画面 */
  endingVisual: string;
}
