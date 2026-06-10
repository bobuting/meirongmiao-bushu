/**
 * Step3 场景化种草脚本生成 - 类型定义
 * 基于场景故事 + 多样性组合的 LLM 实时生成策略
 */

/** 可选脚本场景类型 */
export const CUSTOM_SCRIPT_SCENARIOS = [
  "剧情/短剧",
  "日常Vlog/生活记录",
  "氛围感/OOTD",
  "情侣/闺蜜/亲子",
  "季节/节日/热点",
  "旅行/探店",
] as const;

export type CustomScriptScenario = typeof CUSTOM_SCRIPT_SCENARIOS[number];

/** 叙事结构多样性 */
export const NARRATIVE_STRUCTURES = [
  "倒叙",
  "多线叙事",
  "开放式结局",
  "碎片化蒙太奇",
  "反转式",
  "悬念递进",
  "静默叙事",
  "一镜到底",
  "循环叙事",
  "对比平行",
  "误会递进",
] as const;

export type NarrativeStructure = typeof NARRATIVE_STRUCTURES[number];

/** 角色关系多样性 */
export const CHARACTER_RELATIONSHIPS = [
  "单人",
  "双人互动",
  "与陌生人互动",
  "与动物互动",
  "自我对话",
  "亲子互动",
  "闺蜜互动",
  "情侣互动",
  "群像",
] as const;

export type CharacterRelationship = typeof CHARACTER_RELATIONSHIPS[number];

/** 核心情绪多样性 */
export const CORE_EMOTIONS = [
  "温暖治愈",
  "俏皮轻快",
  "文艺伤感",
  "神秘悬念",
  "励志向上",
  "苦涩甜蜜",
  "荒诞幽默",
  "燃感热血",
  "惬意慵懒",
  "感伤怀旧",
] as const;

export type CoreEmotion = typeof CORE_EMOTIONS[number];

/** 视觉风格多样性 */
export const VISUAL_STYLES = [
  "日系清新",
  "胶片复古",
  "极简现代",
  "梦幻柔焦",
  "纪实抓拍",
  "赛博朋克",
  "暗黑美学",
  "国风雅致",
  "电影感调色",
  "Lo-fi低保真",
] as const;

export type VisualStyle = typeof VISUAL_STYLES[number];

/** 场景策略多样性 */
export const SCENE_STRATEGIES = [
  "单一场景+时间变化",
  "多场景叙事",
  "连续动作跨场景",
  "虚实结合（梦境/回忆）",
  "固定机位+时间压缩",
  "跟随式长镜头",
  "对比场景切换",
  "季节/时段流转",
] as const;

export type SceneStrategy = typeof SCENE_STRATEGIES[number];

/** 开场方式多样性 */
export const OPENING_STYLES = [
  "声音先入",
  "特写细节",
  "全景环境",
  "黑屏字幕",
  "悬念空镜",
  "动作冲击",
  "倒叙高潮",
  "对白切入",
  "字幕独白",
] as const;

export type OpeningStyle = typeof OPENING_STYLES[number];

/** 结尾方式多样性 */
export const ENDING_STYLES = [
  "开放式",
  "反转",
  "定格",
  "诗意留白",
  "首尾呼应",
  "情绪升华",
  "彩蛋揭示",
  "打破第四面墙",
] as const;

export type EndingStyle = typeof ENDING_STYLES[number];

/** 五维热点库 */
export interface FiveDimensionHotTrends {
  /** 节日/节气热点 */
  festival?: string[];
  /** 影视/音乐热点 */
  entertainment?: string[];
  /** 社会情绪热点 */
  socialEmotion?: string[];
  /** 挑战赛/玩法热点 */
  challenge?: string[];
  /** 跨界融合热点 */
  crossover?: string[];
}

/** 多样性组合配置 */
export interface DiversityCombination {
  narrativeStructure: NarrativeStructure;
  characterRelationship: CharacterRelationship;
  coreEmotion: CoreEmotion;
  visualStyle: VisualStyle;
  sceneStrategy: SceneStrategy;
  openingStyle: OpeningStyle;
  endingStyle: EndingStyle;
}

/** 自定义脚本生成请求 */
export interface CustomScriptGenerationRequest {
  /** 项目 ID */
  projectId: string;
  /** 用户 ID */
  userId: string;
  /** 场景类型（可选，不传则随机选择） */
  scenario?: CustomScriptScenario;
  /** 多样性组合（可选，不传则随机生成） */
  diversity?: DiversityCombination;
  /** 用户自定义关键词/提示（可选） */
  userKeywords?: string[];
  /** 生成数量，默认 3 */
  count?: number;
}

/** 自定义脚本生成结果 */
export interface CustomScriptGenerationResult {
  scenario: CustomScriptScenario;
  diversity: DiversityCombination;
  title: string;
  content: string;
  preview: string;
  shotBreakdown: Array<Record<string, unknown>>;
  videoAnalysis: Record<string, unknown>;
  editingAnalysis: Record<string, unknown>;
  durationSec: number;
}

/** 导演人格 */
export interface DirectorPersona {
  name: string;
  specialty: string;
  styleSignature: string;
  cameraPreference: string;
  editingRhythm: string;
}

/** 导演人格池 — 每个脚本轮转使用不同人格 */
export const DIRECTOR_PERSONAS: DirectorPersona[] = [
  { name: "林夕", specialty: "情绪叙事", styleSignature: "用留白制造情绪张力，画面克制但情绪饱满", cameraPreference: "固定长镜头+手持跟拍交替", editingRhythm: "慢节奏，让情绪自然流淌" },
  { name: "陈默", specialty: "悬疑反转", styleSignature: "每个镜头都在暗示什么，让观众自己拼图", cameraPreference: "特写细节+快速切镜", editingRhythm: "前慢后快，结尾突然加速" },
  { name: "苏然", specialty: "日常诗意", styleSignature: "把平凡拍出不平凡的美感，生活即艺术", cameraPreference: "中景为主，缓慢平移", editingRhythm: "均匀节奏，像翻一本画册" },
  { name: "赵越", specialty: "对比冲击", styleSignature: "用强烈的视觉和情绪反差制造记忆点", cameraPreference: "远景切特写，反差大", editingRhythm: "断奏式剪辑，节奏感强" },
  { name: "何暖", specialty: "温暖治愈", styleSignature: "让观众看完觉得世界没那么糟", cameraPreference: "柔焦+自然光为主", editingRhythm: "舒缓流畅，像呼吸一样自然" },
  { name: "周一", specialty: "先锋实验", styleSignature: "打破常规叙事，用非传统手法讲简单故事", cameraPreference: "非常规角度+一镜到底", editingRhythm: "自由节奏，出其不意" },
];

/** 故事概念（阶段1输出） */
export interface StoryConcept {
  title: string;
  theme: string;
  emotionArc: string;
  narrativeBeats: string[];
  characterInteraction: string;
  hook: string;
  endingHint: string;
}
