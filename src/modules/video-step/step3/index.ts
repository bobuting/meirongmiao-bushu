/**
 * Step3 脚本生成模块
 * 导出类型、服务和Prompt构建函数
 */

// 导出类型
export type {
  // 阶段1：热点分析
  HotspotRating,
  SensitivityLevel,
  CommercialFitLevel,
  EmotionHealthLevel,
  AudienceMatchLevel,
  HeatLevel,
  EmotionTrendDirection,
  QualityDistribution,
  HotspotOverview,
  EmotionCategory,
  EmotionDistribution,
  CoreIssue,
  EmotionTrend,
  HotspotDimensions,
  HotspotEvaluation,
  SuitableHotspotTypes,
  HotspotAnalysisReport,

  // 阶段2：角色分析
  GenderType,
  AgeRangeType,
  SeasonType,
  SeasonMatchResult,
  CharacterFeatures,
  ClothingStyle,
  AudienceProfile,
  SeasonAnalysis,
  CharacterPersona,
  NeedsAndPainPoints,
  BehaviorPatterns,
  SceneAnalysis,
  ContentPreference,
  EmotionFit,
  CharacterAnalysisReport,

  // 阶段3：脚本生成
  ScriptType,
  HookType,
  NarrativeStructure,
  EmotionToneType,
  VisualStyleType,
  DialogueStyleType,
  PacingType,
  TitleType,
  EmotionAnalysis,
  ThemeAnalysis,
  DeductionResult,
  Diversification,
  StoryboardSegment,
  BgmSuggestion,
  TitleSuggestion,
  RelatedHotspot,
  PublishSuggestion,
  IronLawsCheck,
  Step3ScriptResult,

  // API 请求/响应
  Step3ScriptGenerationRequest,
  AnalysisReport,
  Step3ScriptGenerationResult,

  // 内部处理类型
  Stage1Input,
  Stage2Input,
  Stage3Input,
} from "./types.js";

// 导出服务函数
export { generateStep3Scripts } from "./script-generation-service.js";

// 导出解析和分析函数（供调试或扩展使用）
export { parseHotspotAnalysisResponse, analyzeHotspots } from "./hotspot-analysis-prompt.js";
export { parseCharacterAnalysisResponse, analyzeCharacter } from "./character-analysis-prompt.js";
export {
  parseScriptGenerationResponse,
  generateScripts,
  validateIronLaws,
} from "./script-generation-prompt.js";