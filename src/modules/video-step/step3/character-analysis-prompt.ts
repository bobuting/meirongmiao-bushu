/**
 * 阶段2：角色分析报告 - Prompt构建
 * 提示词从数据库获取，代码只准备变量数据
 */

import type { AppContext } from "../../../core/app-context.js";
import type { CharacterViewKey } from "../../../contracts/types.js";
import type { CharacterAnalysisReport, Stage2Input } from "./types.js";
import type { OutfitModuleSummary } from "../../../contant-config/shared_dict.js";
import { skillLoader } from "../../../services/skills/index.js";
import { repairAndParseJson } from "../../../services/utils/json-utils.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("llm-transport");

/** 角色分析输入项 */
interface CharacterAnalysisInput {
  id: string;
  projectId?: string;
  userId?: string;
  imageUrl: string;
  label?: string;
  presetId?: string;
  viewKey?: CharacterViewKey;
  sourceImageUrl?: string;
}

const PROMPT_CODE_CHARACTER_ANALYSIS = "video_step3_character_analysis";

/**
 * 构建角色分析的变量数据
 * 返回提示词模板所需的变量对象
 */
function buildCharacterAnalysisVariables(
  characterReference: CharacterAnalysisInput,
  outfitModules?: OutfitModuleSummary[],
): Record<string, unknown> {
  const characterInfo = {
    imageUrl: characterReference.imageUrl,
    label: characterReference.label || "未提供描述",
    sourceImageUrl: characterReference.sourceImageUrl,
    viewKey: characterReference.viewKey || "front",
  };

  // 提取角色描述中的关键信息提示
  const labelGuidance = characterReference.label
    ? `【重要】角色描述中已包含角色的基本信息，你必须从中解析并保持一致：性别、年龄、外貌特征等。`
    : "";

  // 构建服饰模块提示词区块
  const outfitSection = buildOutfitSection(outfitModules);

  return {
    characterInfo: JSON.stringify(characterInfo, null, 2),
    labelGuidance,
    outfitSection,
  };
}

/**
 * 解析LLM返回的角色分析报告
 */
export function parseCharacterAnalysisResponse(responseText: string): CharacterAnalysisReport {
  // 使用容错解析：自动处理 markdown 代码块 + JSON 结构修复
  const parsed = repairAndParseJson(responseText);
  if (!parsed) {
    const preview = responseText.length > 200 ? responseText.slice(0, 200) + "..." : responseText;
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION, textPreview: preview, textLength: responseText.length },
      "Failed to parse character analysis response (repairAndParseJson returned null)"
    );
    throw new Error("Failed to parse character analysis response as valid JSON");
  }

  // 验证必要字段
  if (!parsed.characterFeatures || !parsed.clothingStyle) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION },
      "Missing required fields in character analysis response"
    );
    throw new Error("Missing required fields in character analysis response");
  }

  return parsed as unknown as CharacterAnalysisReport;
}

/**
 * 角色分析阶段入口函数
 * 从数据库获取提示词模板，传入变量进行渲染
 */
export async function analyzeCharacter(
  input: Stage2Input,
  ctx: AppContext,
  routeKey: string,
  userId: string,
  deps: {
    requestLlmPlainText: (systemPrompt: string, userPrompt: string, temperature: number) => Promise<string>;
  },
): Promise<CharacterAnalysisReport> {
  const { characterReference, outfitModules } = input;

  if (!characterReference) {
    throw new Error("Character reference is required for analysis");
  }

  // 构建变量数据
  const variables = buildCharacterAnalysisVariables(characterReference, outfitModules);

  // 从数据库获取提示词模板
  const { system, user } = await skillLoader.render(PROMPT_CODE_CHARACTER_ANALYSIS, { variables });


  try {
    const responseText = await deps.requestLlmPlainText(
      system,
      user,
      0.3, // 低温度，保证分析稳定性
    );

    const report = parseCharacterAnalysisResponse(responseText);

    return report;
  } catch (error) {
    logger.error(
      { err: error, routeKey },
      "Error during analysis"
    );
    // 返回降级报告
    return createFallbackCharacterAnalysisReport(characterReference);
  }
}

/**
 * 创建降级的角色分析报告（LLM调用失败时使用）
 */
function createFallbackCharacterAnalysisReport(characterReference: CharacterAnalysisInput): CharacterAnalysisReport {
  const label = characterReference.label || "未提供角色描述";

  return {
    characterFeatures: {
      gender: "uncertain",
      ageRange: "young_adult",
      temperament: [],
      personalityTraits: [],
    },
    clothingStyle: {
      style: label,
      styleKeywords: [],
      color: "待分析",
      material: "待分析",
      fit: "待分析",
      suitableScenes: [],
    },
    audienceProfile: {
      targetGroup: "待分析",
      occupation: [],
      lifeScenes: [],
      stylePositioning: "待分析",
      consumptionLevel: "待分析",
    },
    seasonAnalysis: {
      suitableSeason: "all",
      currentSeason: getCurrentSeason(),
      matchResult: "full",
      fabricAnalysis: "分析服务暂时不可用",
      styleAnalysis: "分析服务暂时不可用",
      colorAnalysis: "分析服务暂时不可用",
    },
    characterPersona: {
      personality: [],
      values: [],
      lifestyle: "分析服务暂时不可用",
      personaTags: [],
    },
    needsAndPainPoints: {
      coreNeeds: [],
      painPoints: [],
      emotionalNeeds: [],
      consumptionMotivation: [],
    },
    behaviorPatterns: {
      dailyRoutine: "分析服务暂时不可用",
      leisurePreference: [],
      socialPattern: "分析服务暂时不可用",
      consumptionHabit: "分析服务暂时不可用",
    },
    sceneAnalysis: {
      frequentScenes: [],
      idealScenes: [],
      atmospherePreference: [],
      avoidedScenes: [],
    },
    contentPreference: {
      likedContent: [],
      likedStyle: [],
      resonatingTopics: [],
      contentTone: [],
    },
    emotionFit: {
      primaryEmotion: "待分析",
      secondaryEmotions: [],
      emotionKeywords: [],
    },
    raw: {
      imageUrl: characterReference.imageUrl,
      label: characterReference.label,
      viewKey: characterReference.viewKey,
    },
  };
}

/**
 * 获取当前季节
 */
function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "春季";
  if (month >= 6 && month <= 8) return "夏季";
  if (month >= 9 && month <= 11) return "秋季";
  return "冬季";
}

/**
 * 构建服饰模块提示词区块
 * 强调角色穿着的服饰必须与提供的服饰模块一致
 * @param outfitModules 服饰模块信息数组
 */
function buildOutfitSection(outfitModules?: OutfitModuleSummary[]): string {
  if (!outfitModules || outfitModules.length === 0) {
    return "";
  }

  // 构建服饰模块详情
  const outfitDetails = outfitModules.map((module, index) => {
    return `### 服饰 ${index + 1}
- **名称/外观**: ${module.subjectName}
- **描述/总结**: ${module.subjectDescription}`;
  }).join("\n\n");

  return `## 【服饰信息 - 必须严格遵守】

以下服饰是角色的穿着内容，角色的所有着装必须与这些服饰保持一致：

${outfitDetails}

### ⚠️ 服饰约束规则（必须遵守）
1. **服饰一致性**: 角色穿着的服饰必须是上述提供的服饰，不能有其他服饰介入
2. **风格分析**: 分析服饰风格时，必须基于上述服饰信息进行
3. **颜色描述**: 服饰颜色必须与提供的服饰描述保持一致
4. **材质判断**: 服饰材质分析必须基于提供的服饰信息
5. **禁止引入**: 禁止在分析中引入与提供服饰无关的其他服饰元素`;
}