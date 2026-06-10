/**
 * Step3 脚本生成类型定义
 * 根据计划文档定义热点分析报告、角色分析报告、脚本生成结果等接口
 */

import type { TrendEntry, CharacterViewKey } from "../../../contracts/types.js";
import type { OutfitModuleSummary } from "../../../contant-config/shared_dict.js";

/** 角色参考项（来自 step3CharacterReferencePool） */
export interface Step3CharacterReferenceItem {
  id: string;
  label?: string;
  imageUrl: string;
  /** 角色性别，直接传入，不靠推断 */
  gender?: "male" | "female" | "uncertain";
  viewKey?: CharacterViewKey;
}

/** 阶段1角色信息（来自 STAGE1_RESULT.characterReference） */
export interface Stage1CharacterInfo {
  id: string;
  projectId: string;
  userId: string;
  imageUrl: string;
  label?: string;
  viewKey?: CharacterViewKey;
}

// =====================================================
// 阶段1：热点分析评估报告类型
// =====================================================

/** 热点质量评级 */
export type HotspotRating = "excellent" | "good" | "fair" | "poor" | "excluded";

/** 敏感度等级 */
export type SensitivityLevel = "safe" | "caution" | "danger";

/** 商业适配度等级 */
export type CommercialFitLevel = "high" | "medium" | "low";

/** 情绪健康度等级 */
export type EmotionHealthLevel = "positive" | "neutral" | "negative";

/** 受众匹配度等级 */
export type AudienceMatchLevel = "matched" | "partial" | "mismatched";

/** 热度等级 */
export type HeatLevel = "high" | "medium" | "low";

/** 情绪趋势方向 */
export type EmotionTrendDirection = "anxiety_spreading" | "emotion_divided" | "healing_needed";

/** 热点质量分布 */
export interface QualityDistribution {
  excellent: number;  // ⭐⭐⭐⭐⭐
  good: number;       // ⭐⭐⭐⭐
  fair: number;       // ⭐⭐⭐
  poor: number;       // ⭐⭐
  excluded: number;   // ❌不适用
}

/** 热点概览 */
export interface HotspotOverview {
  totalCount: number;
  emotionTypes: string[];  // ["焦虑", "治愈", "共鸣", "反思"]
  qualityDistribution: QualityDistribution;
}

/** 情绪分类 */
export interface EmotionCategory {
  type: string;        // "焦虑/不安类"
  count: number;
  percentage: number;
  hotspotIds: string[];
}

/** 情绪分布 */
export interface EmotionDistribution {
  categories: EmotionCategory[];
}

/** 核心议题 */
export interface CoreIssue {
  issue: string;           // "职场安全感危机"
  relatedHotspots: Array<{
    id: string;
    title: string;
  }>;
  heatLevel: HeatLevel;
  deepNeed: string;        // "在不确定的时代找到确定感"
}

/** 情绪趋势判断 */
export interface EmotionTrend {
  direction: EmotionTrendDirection;
  userDeepNeed: string;    // "被理解、获得力量、找到坚持的理由"
}

/** 热点维度评估 */
export interface HotspotDimensions {
  sensitivity: {
    level: SensitivityLevel;
    detail: string;
  };
  commercialFit: {
    level: CommercialFitLevel;
    detail: string;
  };
  emotionHealth: {
    level: EmotionHealthLevel;
    detail: string;
  };
  audienceMatch: {
    level: AudienceMatchLevel;
    detail: string;
  };
}

/** 单个热点评估 */
export interface HotspotEvaluation {
  id: string;
  title: string;

  // 质量评级
  rating: HotspotRating;
  score: number;  // 0-100

  // 四维度评估
  dimensions: HotspotDimensions;

  // 情绪标签
  emotionLabels: string[];

  // 处理建议
  suggestion: string;

  // 适合的服饰风格
  suitableStyles: string[];
}

/** 适合服饰种草的热点类型分布 */
export interface SuitableHotspotTypes {
  lifestyle: string[];      // 生活方式类
  emotional: string[];      // 情感话题类
  seasonal: string[];       // 季节话题类
  healing: string[];        // 治愈系内容类
  workplace: string[];      // 职场共鸣类
  festival: string[];       // 节日热点类
}

// =====================================================
// 热点深度分析扩展类型（SKILL-0328 规范）
// =====================================================

/** 热点情绪深度分析 */
export interface HotspotEmotionAnalysis {
  surfaceEmotions: string[];     // 表层情绪：["焦虑", "恐惧", "迷茫"]
  deepEmotions: string[];        // 深层情绪：["对未来的不安全感", "自我价值的怀疑"]
  emotionConflict: string;       // 情绪矛盾：["想逃离现状 vs 不敢失去稳定"]
  emotionOutlet: string;         // 情绪出口：["希望被理解、渴望找到坚持的理由"]
  finalEmotionPositioning: string; // 最终情绪定位：["疲惫中带坚韧、焦虑中藏倔强"]
}

/** 热点主题深度挖掘 */
export interface HotspotThemeAnalysis {
  topicPhenomenon: string;       // 话题现象：["年轻人不敢辞职"]
  underlyingIssue: string;       // 背后议题：["职场安全感、代际压力、选择权"]
  corePainPoint: string;         // 核心痛点：["想要掌控人生却身不由己"]
  resonanceGroup: string;        // 共鸣人群：["25-35岁职场人、背负房贷车贷者"]
  valueProposition: string;      // 价值主张：["坚守不是认输，是另一种勇气"]
  finalThemePositioning: string; // 最终主题定位
}

/** 热点推演结果 */
export interface HotspotDeductionResult {
  scene: string;                 // 推演场景：["深夜办公室/地铁"]
  style: string;                 // 推演风格：["冷色调+微暖光"]
  storyLine: string;             // 推演故事线：["困境→坚持→微光"]
  emotionArc: string;            // 情绪弧线：["焦虑→发呆→释然"]
  characterState: string;        // 推演人物状态
}

/** 热点标签提炼 */
export interface HotspotAnalysisTags {
  emotionTags: string[];         // 情绪标签：["#治愈", "#温暖", "#平静"]
  themeTags: string[];           // 主题标签：["#独居生活", "#自我相处"]
  sceneTags: string[];           // 场景标签：["#居家日常", "#窗边时光"]
  styleTags: string[];           // 风格标签：["#日系清新", "#温暖治愈"]
  audienceTags: string[];        // 受众标签：["#独居女生", "#20代女性"]
}

/** 热点关键词提炼 */
export interface HotspotAnalysisKeywords {
  coreKeywords: string[];        // 核心关键词：["独居", "治愈", "阳光", "窗边"]
  emotionKeywords: string[];     // 情绪关键词：["温暖", "满足", "平静"]
  sceneKeywords: string[];       // 场景关键词：["居家", "窗边", "阳光洒落"]
  actionKeywords: string[];      // 行为关键词：["阅读", "发呆", "享受独处"]
  visualKeywords: string[];      // 视觉关键词：["暖光", "柔和", "生活感"]
}

/** 热点议题分析 */
export interface HotspotIssueAnalysis {
  coreIssue: string;             // 核心议题：["独居生活方式与自我相处能力"]
  issueBackground: string;       // 议题背景：["独居人口增长、年轻人生活选择多元化"]
  issueHeat: "high" | "medium" | "low";  // 议题热度
  deepDemand: string;            // 深层诉求：["渴望被理解、寻找独居生活的意义"]
  issueConnections: string[];    // 议题关联
  transformationDirection: string; // 转化方向：["从'独居不是孤独'视角切入"]
}

/** 适合脚本类型预测 */
export interface SuitableScriptTypePrediction {
  type: string;                  // 脚本类型：["氛围感", "日常Vlog", "OOTD"]
  score: number;                 // 适配分数：0-100
}

/** 受众反应预测 */
export interface AudienceReactionPrediction {
  primaryAction: "like" | "collect" | "share" | "comment"; // 主要互动行为
  commentTrend: string;          // 评论趋势：["用户可能的评论倾向"]
}

/** 热点题材预测 */
export interface HotspotGenrePrediction {
  suitableScriptTypes: SuitableScriptTypePrediction[]; // 适合脚本类型
  spreadPotential: "high" | "medium" | "low";     // 传播潜力
  audienceReaction: AudienceReactionPrediction;   // 受众反应预测
  viralPossibility: "high" | "medium" | "low";    // 爆款可能性
  contentLifecycle: "short_burst" | "medium_sustained" | "long_tail"; // 内容生命周期
  competitionRisk: "high" | "medium" | "low";     // 竞品风险
}

/** 热点创作建议 */
export interface HotspotCreationSuggestions {
  recommendedScriptType: string; // 推荐脚本类型
  recommendedHookType: string;   // 推荐钩子类型
  keyPoints: string[];           // 创作要点
}

/** 热点分析评估报告（阶段1输出）- 扩展版本 */
export interface HotspotAnalysisReport {
  // ===== 原始文本报告（直接返回给下一步使用）=====
  rawText?: string;

  // ===== 热点概览 =====
  overview: HotspotOverview;

  // ===== 情绪分布 =====
  emotionDistribution: EmotionDistribution;

  // ===== 核心议题提炼 =====
  coreIssues: CoreIssue[];

  // ===== 情绪趋势判断 =====
  emotionTrend: EmotionTrend;

  // ===== 热点详细评估表 =====
  hotspotEvaluations: HotspotEvaluation[];

  // ===== 适合服饰种草的热点类型分布 =====
  suitableHotspotTypes: SuitableHotspotTypes;

  // ===== 【新增】情绪深度分析 =====
  emotionAnalysis?: HotspotEmotionAnalysis;

  // ===== 【新增】主题深度挖掘 =====
  themeAnalysis?: HotspotThemeAnalysis;

  // ===== 【新增】推演结果 =====
  deductionResult?: HotspotDeductionResult;

  // ===== 【新增】标签提炼 =====
  tags?: HotspotAnalysisTags;

  // ===== 【新增】关键词提炼 =====
  keywords?: HotspotAnalysisKeywords;

  // ===== 【新增】议题分析 =====
  issueAnalysis?: HotspotIssueAnalysis;

  // ===== 【新增】题材预测 =====
  genrePrediction?: HotspotGenrePrediction;

  // ===== 【新增】创作建议 =====
  creationSuggestions?: HotspotCreationSuggestions;
}

// =====================================================
// 阶段2：角色分析报告类型
// =====================================================

/** 性别类型 */
export type GenderType = "male" | "female" | "uncertain";

/** 年龄段类型 — 与统一年龄段定义对齐 */
export type AgeRangeType = "child" | "teen" | "youth" | "young_adult" | "adult" | "middle_age";

/** 季节类型 */
export type SeasonType = "spring" | "summer" | "autumn" | "winter" | "all";

/** 季节匹配结果 */
export type SeasonMatchResult = "full" | "partial" | "mismatch";

/** 人物特征 */
export interface CharacterFeatures {
  gender: GenderType;
  ageRange: AgeRangeType;
  temperament: string[];  // ["温柔", "干练", "文艺", "休闲"]
  personalityTraits: string[];  // ["内敛", "独立", "温暖"]
}

/** 服饰风格分析 */
export interface ClothingStyle {
  style: string;              // "米色慵懒风卫衣"
  styleKeywords: string[];    // ["慵懒", "温柔", "家居", "文艺"]
  color: string;              // "米色暖调"
  material: string;           // "中等厚度针织"
  fit: string;                // "宽松舒适"
  suitableScenes: string[];   // ["居家", "咖啡馆", "书店", "周末休闲"]
}

/** 服饰受众画像 */
export interface AudienceProfile {
  targetGroup: string;        // "20-30岁女性"
  occupation: string[];       // ["职场新人", "自由职业者", "学生"]
  lifeScenes: string[];       // ["慵懒家居", "周末休闲", "约会出行"]
  stylePositioning: string;   // "舒适、温柔、自在"
  consumptionLevel: string;   // "中端消费"
}

/** 季节适配分析 */
export interface SeasonAnalysis {
  suitableSeason: SeasonType;
  currentSeason: string;
  matchResult: SeasonMatchResult;
  fabricAnalysis: string;     // "中等厚度 → 适合春秋"
  styleAnalysis: string;      // "长袖宽松 → 春秋/初冬"
  colorAnalysis: string;      // "米色暖调 → 秋季最佳"
  suggestion?: string;
}

/** 角色画像 */
export interface CharacterPersona {
  // 性格特征
  personality: string[];      // ["内向", "温和", "独立", "有主见"]

  // 价值观
  values: string[];           // ["生活品质", "自我舒适", "简约主义"]

  // 生活方式
  lifestyle: string;          // "享受独处时光，追求生活仪式感"

  // 人设标签
  personaTags: string[];      // ["独居青年", "文艺女生", "治愈系"]
}

/** 需求与痛点 */
export interface NeedsAndPainPoints {
  // 核心需求
  coreNeeds: string[];        // ["舒适自在", "被理解", "生活仪式感"]

  // 痛点
  painPoints: string[];       // ["不想随波逐流", "渴望独处质量"]

  // 情感诉求
  emotionalNeeds: string[];   // ["治愈", "安全感", "自我认同"]

  // 消费动机
  consumptionMotivation: string[];  // ["追求品质", "表达自我", "情绪价值"]
}

/** 行为特征 */
export interface BehaviorPatterns {
  // 日常作息
  dailyRoutine: string;       // "喜欢睡到自然醒"

  // 休闲偏好
  leisurePreference: string[];  // ["阅读", "咖啡", "宅家"]

  // 社交特征
  socialPattern: string;      // "小圈子深度社交"

  // 消费习惯
  consumptionHabit: string;   // "注重品质而非数量"
}

/** 场景分析 */
export interface SceneAnalysis {
  // 高频场景
  frequentScenes: string[];   // ["家中", "咖啡馆", "书店"]

  // 理想场景
  idealScenes: string[];      // ["阳光窗边", "温馨卧室", "文艺小店"]

  // 场景氛围偏好
  atmospherePreference: string[];  // ["安静", "温暖", "私密"]

  // 避免场景
  avoidedScenes: string[];    // ["嘈杂人群", "正式场合"]
}

/** 内容偏好 */
export interface ContentPreference {
  // 喜欢的内容类型
  likedContent: string[];     // ["治愈系", "生活美学", "独居日常"]

  // 喜欢的风格
  likedStyle: string[];       // ["日系清新", "居家温馨", "文艺感"]

  // 共鸣话题
  resonatingTopics: string[]; // ["独居生活", "自我成长", "生活仪式感"]

  // 内容调性
  contentTone: string[];      // ["温柔", "治愈", "内敛"]
}

/** 情绪契合 */
export interface EmotionFit {
  primaryEmotion: string;     // "治愈"
  secondaryEmotions: string[];  // ["温暖", "宁静"]
  emotionKeywords: string[];  // ["舒适", "安心", "自在"]
}

/** 角色分析报告（阶段2输出） */
export interface CharacterAnalysisReport {
  // ===== 基础人物特征 =====
  characterFeatures: CharacterFeatures;

  // ===== 服饰风格分析 =====
  clothingStyle: ClothingStyle;

  // ===== 服饰受众画像 =====
  audienceProfile: AudienceProfile;

  // ===== 季节适配 =====
  seasonAnalysis: SeasonAnalysis;

  // ===== 角色画像（扩展） =====
  characterPersona: CharacterPersona;

  // ===== 需求与痛点（扩展） =====
  needsAndPainPoints: NeedsAndPainPoints;

  // ===== 行为特征（扩展） =====
  behaviorPatterns: BehaviorPatterns;

  // ===== 场景分析（扩展） =====
  sceneAnalysis: SceneAnalysis;

  // ===== 内容偏好（扩展） =====
  contentPreference: ContentPreference;

  // ===== 情绪契合 =====
  emotionFit: EmotionFit;

  // ===== 原始数据 =====
  raw: {
    imageUrl: string;
    label?: string;
    viewKey?: string;
  };
}

// =====================================================
// 阶段3：脚本生成结果类型
// =====================================================

/** 脚本类型 */
export type ScriptType = "drama" | "vlog" | "ootd" | "relationship" | "seasonal" | "travel";

/** 开场钩子类型 */
export type HookType = "visual_impact" | "emotion_impact" | "suspense" | "conflict" | "unexpected" | "contrast";

/** 叙事结构类型 */
export type NarrativeStructure = "linear" | "flashback" | "interleaved" | "montage" | "circular";

/** 情绪基调类型 */
export type EmotionToneType = "healing" | "inspiring" | "melancholic" | "humorous" | "quiet" | "reversal";

/** 视觉风格类型 */
export type VisualStyleType = "japanese" | "korean" | "western" | "chinese" | "homey" | "urban_night";

/** 台词风格类型 */
export type DialogueStyleType = "inner_monologue" | "dialogue" | "no_dialogue" | "narration" | "phone_content" | "internet_slang";

/** 节奏类型 */
export type PacingType = "slow" | "fast" | "gradient" | "balanced";

/** 标题类型 */
export type TitleType = "narrative" | "golden" | "question";

/** 情绪深度分析 */
export interface EmotionAnalysis {
  surfaceEmotion: string[];    // ["治愈", "温暖", "平静"]
  deepEmotion: string[];       // ["独处时的自我满足", "内心的宁静"]
  emotionConflict: string;     // "外界对独居的孤独刻板印象 vs 自己享受独处的真实体验"
  emotionOutlet: string;       // "发现独居的美好，将'一个人'转化为'与自己相处'的治愈时光"
}

/** 主题深度挖掘 */
export interface ThemeAnalysis {
  phenomenon: string;          // "独居生活中的治愈瞬间分享"
  underlyingIssue: string;     // "独居文化、自我相处能力、生活仪式感"
  corePainPoint: string;       // "独居不是孤独，而是与自己对话的珍贵时光"
  valueProposition: string;    // "学会享受独处是成年人的必修课"
  resonanceGroup: string;      // "独居青年、文艺青年"
}

/** 推演结果 */
export interface DeductionResult {
  scene: string;               // "阳光洒落的窗边角落"
  style: string;               // "温暖治愈+生活美学"
  storyLine: string;           // "沉浸阅读→阳光洒落→抬头感受→内心满足"
  characterState: string;      // "慵懒自在、内心柔软、享受当下"
}

/** 多样化维度项（含来源和亲和度）- SKILL-script.md 规范 */
export interface DiversificationItem {
  /** 选择的内容 */
  choice: string;
  /** 来源：热点推荐/核心层推荐/表达层推荐/突破层推荐/离域 */
  source: string;
  /** 亲和度：1-5星 */
  affinity: number;
}

/** 镜头语言类型 */
export type CameraLanguageType = "handheld" | "fixed" | "aerial" | "pov" | "tracking" | "slow_motion";

/** 完播钩子类型 */
export type RetentionHookType = "suspense" | "question" | "preview" | "contrast";

/** 创意适配度等级 */
export type CreativityLevelType = "conservative" | "moderate" | "bold";

/** 多样化维度标注（扩展版，兼容 SKILL-script.md） */
export interface Diversification {
  hookType: HookType;
  narrativeStructure: NarrativeStructure;
  emotionTone: EmotionToneType;
  visualStyle: VisualStyleType;
  dialogueStyle: DialogueStyleType;
  pacing: PacingType;
  innovationElements: string[];

  // ===== 新增字段（SKILL-script.md 规范） =====
  /** 镜头语言 */
  cameraLanguage?: CameraLanguageType;
  /** 完播钩子类型 */
  retentionHook?: RetentionHookType;
  /** 完播钩子位置（秒） */
  retentionHookPosition?: number;

  // ===== 新增：详细维度信息（含来源和亲和度） =====
  detailedDimensions?: {
    scriptType?: DiversificationItem;
    hookType?: DiversificationItem;
    narrativeStructure?: DiversificationItem;
    emotionTone?: DiversificationItem;
    visualStyle?: DiversificationItem;
    cameraLanguage?: DiversificationItem;
    dialogueStyle?: DiversificationItem;
    pacing?: DiversificationItem;
    retentionHook?: DiversificationItem;
    innovationElements?: DiversificationItem[];
  };

  // ===== 新增：创意适配度等级 =====
  creativityLevel?: CreativityLevelType;
  /** 判定依据 */
  creativityReason?: string;

  // ===== 新增：离域情况 =====
  /** 表达层离域次数 */
  expressionLayerDeviations?: number;
  /** 突破层离域次数 */
  breakthroughLayerDeviations?: number;
}

/** 分镜脚本片段 */
export interface StoryboardSegment {
  index: number;
  shotSize: string;          // "中景", "近景", "全景", "特写"
  description: string;       // 画面描述
  clothingNote: string;      // 服饰融入方式
  dialogue?: string;         // 台词
  duration?: number;         // 镜头时长（秒）
}

/** 分镜脚本片段（新格式，与 ori_script.json 一致，扩展版） */
export interface StoryboardSegmentNew {
  title: string;             // "镜头 1 · 场景建立"
  content: string;           // "旁白：...\n画面：..."
  visualCue: string;         // "画面：..."
  visualPrompt: string;      // 完整提示词
  /** 【新增】高潮功能标注 */
  climaxFunction?: "hook" | "climax" | "buildup" | "closing";
  /** 【新增】情绪标注 */
  emotionNote?: string;
  /** 【新增】镜头时长（秒） */
  durationSec?: number;

  // ===== 新增字段（SKILL-script.md 规范） =====
  /** 景别：远景/全景/中景/近景/特写 */
  shotSize?: string;
  /** 镜头语言：固定镜头/手持感/慢动作/主观视角等 */
  cameraLanguage?: string;
  /** 服饰融入方式 */
  clothingIntegration?: string;
  /** 动作描述 */
  action?: string;
  /** 台词内容 */
  dialogue?: string;
  /** 高潮强度：Lv1-Lv5 */
  climaxIntensity?: 1 | 2 | 3 | 4 | 5;
  /** 是否为高潮镜头 */
  isClimax?: boolean;
  /** 是否为钩子镜头 */
  isHook?: boolean;
}

/** BGM建议 */
export interface BgmSuggestion {
  style: string;             // "轻音乐/钢琴曲"
  emotionMatch: string;      // "治愈、温暖"
  bpm: string;               // "慢速（70-80bpm）"
  referenceTracks: string[]; // ["River Flows in You 风格"]
  soundEffects: string[];    // ["窗外的鸟鸣声", "书页翻动声"]
}

/** 标题建议 */
export interface TitleSuggestion {
  type: TitleType;
  title: string;
  recommended?: boolean;
}

/** 关联热点 */
export interface RelatedHotspot {
  id: string;
  title: string;
}

/** 发布建议 */
export interface PublishSuggestion {
  bestTime: string;          // "周五晚20:00"
  targetUser: string;        // "20-30岁上班族"
  coverSuggestion: string;   // "镜头2（阳光洒落的画面）"
  captionSuggestion?: string;
}

/** 铁律检查结果 */
export interface IronLawsCheck {
  passed: boolean;
  details: {
    noClothingCloseup: boolean;    // 无服装特写
    consistency: boolean;          // 全片一致
    strongHook: boolean;           // 前3秒强钩子
    properDuration: boolean;       // 15-30秒时长
    properShotCount: boolean;      // 4-8个镜头
    aestheticCompliance: boolean;  // 审美合规
    genderConsistency?: boolean;   // 【新增】性别一致性
  };
  violations: string[];
}

// =====================================================
// 高潮设计与六维度自检类型（SKILL-0328 规范）
// =====================================================

/** 高潮类型 */
export type ClimaxType = "visual" | "emotion" | "reversal" | "closing";

/** 高潮设计项 */
export interface ClimaxDesignItem {
  timeRange: string;          // 时间范围："3-8秒"
  type: ClimaxType;           // 高潮类型
  description: string;        // 设计内容描述
}

/** 高潮设计 */
export interface ClimaxDesign {
  /** 节奏结构：双高潮/三高潮 */
  structure: "dual" | "triple";
  /** 情绪曲线类型 */
  emotionCurve: "progressive" | "fluctuating" | "contrast" | "crescendo";
  /** 高潮点列表 */
  climaxPoints: ClimaxDesignItem[];
}

/** 单维度检查结果 */
export interface QualityDimensionCheck {
  score: number;              // 分数：0-20（部分维度为0-15）
  passed: boolean;            // 是否通过
  details: string;            // 详细说明
}

/** 六维度质量检查报告 */
export interface QualityCheckReport {
  /** 钩子强度（权重20%） */
  hookStrength: QualityDimensionCheck;
  /** 情绪弧线（权重20%） */
  emotionArc: QualityDimensionCheck;
  /** 记忆点（权重15%） */
  memorability: QualityDimensionCheck;
  /** 创新性（权重15%） */
  innovation: QualityDimensionCheck;
  /** 服饰自然度（权重15%） */
  fashionNaturalness: QualityDimensionCheck;
  /** 节奏合理（权重15%） */
  pacing: QualityDimensionCheck;
  /** 总分：0-100 */
  totalScore: number;
  /** 等级 */
  rating: "excellent" | "good" | "pass" | "needs_work";
  /** 优化建议 */
  optimizationSuggestions?: string[];
}

/** 脚本生成结果 */
export interface Step3ScriptResult {
  // ===== 基本信息 =====
  id: string;
  title: string;
  subtitle: string;
  durationSec: number;  // 15-30秒

  // ===== 关联热点（可选） =====
  relatedHotspot?: RelatedHotspot;

  // ===== 预览与内容（新格式，与 ori_script.json 一致） =====
  preview: string;           // "旁白：...\n画面：..." 格式的预览
  content: string;           // 完整内容描述（含主题、场景、分镜等）

  // ===== 情绪深度分析 =====
  emotionAnalysis: EmotionAnalysis;

  // ===== 主题深度挖掘 =====
  themeAnalysis: ThemeAnalysis;

  // ===== 推演结果 =====
  deductionResult: DeductionResult;

  // ===== 脚本类型与受众 =====
  scriptType: ScriptType;
  audienceProfile: string;
  emotionTone: string;
  theme: string;
  scene: string;
  storyLine: string;

  // ===== 【新增】情绪弧线 =====
  emotionArc?: string;       // 情绪变化轨迹："平静→沉浸→满足"

  // ===== 多样化维度标注 =====
  diversification: Diversification;

  // ===== 【新增】高潮设计 =====
  climaxDesign?: ClimaxDesign;

  // ===== 分镜脚本（4-8个镜头）- 新格式 =====
  storyboardSegments: StoryboardSegmentNew[];

  // ===== BGM建议 =====
  bgmSuggestion: BgmSuggestion;

  // ===== 标题建议（3选1） =====
  titleSuggestions: TitleSuggestion[];

  // ===== 话题标签 =====
  hashtags: string[];  // ["#独居生活", "#治愈日常", "#慵懒风穿搭"]

  // ===== 发布建议 =====
  publishSuggestion: PublishSuggestion;

  // ===== 铁律检查结果 =====
  ironLawsCheck: IronLawsCheck;

  // ===== 【新增】六维度质量检查报告 =====
  qualityCheckReport?: QualityCheckReport;

  // ===== 【新增】多样化维度详细信息（SKILL-script.md 规范） =====
  /** 多样化维度表（完整版，含来源和亲和度） */
  diversificationDetail?: {
    dimensions: {
      name: string;
      choice: string;
      source: string;
      affinity: number;
    }[];
    creativityLevel: CreativityLevelType;
    creativityReason: string;
    expressionLayerDeviations: number;
    breakthroughLayerDeviations: number;
  };

  // ===== 【新增】镜头数（显式字段） =====
  /** 镜头数量（与 storyboardSegments.length 一致） */
  shotCount?: number;

  /** 【新增】脚本概要（一句话概括脚本核心卖点） */
  summary?: string;

  // ===== 【新增】独立字段（用于前端分镜编辑） =====
  /** 主场景（独立字段，如"阳光洒落的窗边角落"） */
  mainScene?: string;
  /** 时间（如 07:00-08:00） */
  timeOfDay?: string;
  /** 天气描述（如"晴天，自然柔光"） */
  weather?: string;
  /** 氛围描述（如"温暖治愈、安静惬意"） */
  atmosphere?: string;
  /** 脚本风格（如"日系清新、慢节奏"） */
  scriptStyle?: string;

  // ===== 【新增】LLM 原始结构化输出（demo_json 格式，原样透传，避免拆散后重新组装丢失数据） =====
  /** 大模型原始 video_info 对象 */
  rawVideoInfo?: Record<string, unknown>;
  /** 大模型原始 video_analysis 对象 */
  rawVideoAnalysis?: Record<string, unknown>;
  /** 大模型原始 shot_breakdown 数组 */
  rawShotBreakdown?: Record<string, unknown>[];
  /** 大模型原始 editing_analysis 对象 */
  rawEditingAnalysis?: Record<string, unknown>;
}

// =====================================================
// API 请求/响应类型
// =====================================================

/** 脚本生成请求 */
export interface Step3ScriptGenerationRequest {
  hotspotLimit?: number;  // 热点数量，默认50
}

/** 分析报告 */
export interface AnalysisReport {
  hotspotAnalysis: HotspotAnalysisReport;   // 阶段1输出
  characterAnalysis: CharacterAnalysisReport; // 阶段2输出
}

/** 脚本生成结果 */
export interface Step3ScriptGenerationResult {
  // 2个脚本
  scripts: Step3ScriptResult[];

  // 分析报告
  analysisReport: AnalysisReport;
}

// =====================================================
// 脚本生成快照返回格式（与 candidate/snapshot 接口一致）
// =====================================================

/** 从 step3-candidate-snapshot-contract.ts 导入并复用的类型 */
import type {
  Step3CandidateLockState as ImportedStep3CandidateLockState,
  Step3CandidateGenerationMode as ImportedStep3CandidateGenerationMode,
  ShotBreakdownEntity as ImportedShotBreakdownEntity,
  ScriptCandidateEntity as ImportedScriptCandidateEntity,
} from "../../../contracts/step3-candidate-snapshot-contract.js";

/** 重新导出类型供外部使用 */
export type Step3CandidateLockState = ImportedStep3CandidateLockState;
export type Step3CandidateGenerationMode = ImportedStep3CandidateGenerationMode;
export type ShotBreakdownEntity = ImportedShotBreakdownEntity;
export type ScriptCandidateEntity = ImportedScriptCandidateEntity;

/** 脚本生成快照（完整格式，与 Step3ScriptCandidateSnapshot 兼容） */
export interface Step3ScriptGenerationSnapshot {
  snapshotId: string;
  projectId: string;
  promptVersion: string;
  topNAtCreation: number;
  lockState: "snapshot_ready";
  lockVersion: number;
  generationMode: "real" | "degraded";
  selectedCandidateId: null;
  confirmedCandidateId: null;
  createdAt: number;
  items: ScriptCandidateEntity[];
}

/** 脚本生成快照结果（新返回格式） */
export interface Step3ScriptGenerationSnapshotResult {
  snapshot: Step3ScriptGenerationSnapshot;
}

// =====================================================
// 内部处理类型
// =====================================================

/** 阶段1输入 */
export interface Stage1Input {
  hotspots: TrendEntry[];
}

/** 阶段2输入 */
export interface Stage2Input {
  /** 角色定妆参考图 */
  characterReference: Step3CharacterReferenceItem;
  /** 服饰模块信息（可选，用于服饰约束） */
  outfitModules?: OutfitModuleSummary[];
}

/** 阶段3输入 */
export interface Stage3Input {
  hotspotReport: HotspotAnalysisReport;
  characterReport: CharacterAnalysisReport;
  /** 原始角色信息（作为强制参考，确保性别、年龄等基本信息一致） */
  characterReference: Step3CharacterReferenceItem;
  scriptCount: number;
  /** 服饰风格列表 */
  clothingStyles?: string[];
  /** 服饰描述 */
  outfitDescription?: string;
  /** 搭配描述 */
  matchingReference?: string;
  /** 角色方向（不含 styleSummary，由 buildCharacterPromptFromProject 统一构建） */
  selectedRoleDirection?: import("../shared/character-prompt-builder.js").CharacterDirectionInfo | null;
}