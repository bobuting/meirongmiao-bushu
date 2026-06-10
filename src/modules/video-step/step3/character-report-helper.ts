/**
 * 角色分析报告辅助函数
 * Stage3 已移除，提供空报告生成函数供其他模块使用
 */

import type { CharacterAnalysisReport } from "./types.js";
import type { STAGE1_RESULT } from "../../../contant-config/shared_dict.js";
import { getCurrentSeason } from "../../../utils/date-utils.js";

/**
 * 创建空的角色分析报告（Stage3 移除后的替代方案）
 */
export function createEmptyCharacterAnalysisReport(
  characterReference: STAGE1_RESULT["characterReference"],
  characterDescription?: string,
): CharacterAnalysisReport {
  // 优先使用 characterDescription，否则使用 label
  const label = characterDescription || characterReference.label || "未提供角色描述";

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
      fabricAnalysis: "角色分析已禁用",
      styleAnalysis: "角色分析已禁用",
      colorAnalysis: "角色分析已禁用",
    },
    characterPersona: {
      personality: [],
      values: [],
      lifestyle: "角色分析已禁用",
      personaTags: [],
    },
    needsAndPainPoints: {
      coreNeeds: [],
      painPoints: [],
      emotionalNeeds: [],
      consumptionMotivation: [],
    },
    behaviorPatterns: {
      dailyRoutine: "角色分析已禁用",
      leisurePreference: [],
      socialPattern: "角色分析已禁用",
      consumptionHabit: "角色分析已禁用",
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
    // 保留原始角色描述
    raw: {
      imageUrl: characterReference.imageUrl,
      label: characterReference.label,
      viewKey: characterReference.viewKey,
    },
  };
}