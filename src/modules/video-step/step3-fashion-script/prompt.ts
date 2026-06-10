/**
 * Step3 时尚大片脚本生成 - LLM Prompt 构建
 * 提示词内容通过提示词管理系统（DB 模板）统一管理
 * 本文件只负责构建变量数据
 */

import type {
  FashionDiversityCombination,
  FiveDimensionHotTrends,
  FashionDirectorPersona,
  VisualConcept,
} from "./types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import {
  FASHION_SCENES,
  FASHION_VISUAL_STYLES,
  CAMERA_MOVEMENTS,
  FASHION_MOODS,
  FASHION_OPENINGS,
  FASHION_ENDINGS,
  MUSIC_RHYTHMS,
  CREATIVE_TENSIONS,
  VISUAL_SYMBOLS,
} from "./types.js";
import { skillLoader } from "../../../services/skills/index.js";
import { selectNarrativeIdentity } from "../shared/narrative-identity.js";

/** 提示词模板 code */
const PROMPT_CODE_FASHION_SCRIPT = "fashion_script_generation";

/** 随机种子帮助函数 */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 生成随机多样性组合 */
export function generateRandomFashionDiversity(): FashionDiversityCombination {
  return {
    scene: pickRandom(FASHION_SCENES),
    visualStyle: pickRandom(FASHION_VISUAL_STYLES),
    cameraMovement: pickRandom(CAMERA_MOVEMENTS),
    mood: pickRandom(FASHION_MOODS),
    openingStyle: pickRandom(FASHION_OPENINGS),
    endingStyle: pickRandom(FASHION_ENDINGS),
    musicRhythm: pickRandom(MUSIC_RHYTHMS),
    creativeTension: pickRandom(CREATIVE_TENSIONS),
    visualSymbol: pickRandom(VISUAL_SYMBOLS),
  };
}

/** 热点描述 */
export function buildFashionHotTrendDescription(hotTrends: FiveDimensionHotTrends): string {
  const parts: string[] = [];
  if (hotTrends.festival?.length) parts.push(`节日/节气：${hotTrends.festival.join("、")}`);
  if (hotTrends.entertainment?.length) parts.push(`影视/音乐：${hotTrends.entertainment.join("、")}`);
  if (hotTrends.socialEmotion?.length) parts.push(`社会情绪：${hotTrends.socialEmotion.join("、")}`);
  if (hotTrends.challenge?.length) parts.push(`挑战/玩法：${hotTrends.challenge.join("、")}`);
  if (hotTrends.crossover?.length) parts.push(`跨界融合：${hotTrends.crossover.join("、")}`);
  return parts.length > 0 ? parts.join("\n") : "无特定热点，请自由创作高端时尚视觉";
}

/**
 * 从提示词管理系统加载系统/用户提示词（阶段2：完整脚本扩写）
 */
export async function loadFashionScriptPrompt(input: {
  diversity: FashionDiversityCombination;
  hotTrends: FiveDimensionHotTrends;
  outfitDescription?: string;
  characterDescription?: string;
  matchingReference?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo | null;
  concept?: VisualConcept | null;
  directorPersona?: FashionDirectorPersona | null;
  goldenExamplesText?: string | null;
  characterGender?: "male" | "female" | "uncertain";
  /** 场景库+硬编码合并后的推荐场景文本 */
  recommendedScenes?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }> {
  const { diversity, hotTrends, outfitDescription, characterDescription, matchingReference, clothingStyles, selectedRoleDirection, concept, directorPersona, goldenExamplesText, characterGender, recommendedScenes } = input;

  const hotTrendText = buildFashionHotTrendDescription(hotTrends);
  const narrativeIdentity = selectNarrativeIdentity("fashion");

  const { system, user } = await skillLoader.render(PROMPT_CODE_FASHION_SCRIPT, {
    variables: {
      characterGender,
      characterDescription,
      outfitDescription,
      matchingReference,
      clothingStyles,
      selectedRoleDirection,
      hotTrendText,
      concept,
      directorPersona,
      goldenExamplesText,
      diversity,
      recommendedScenes,
      narrativeIdentity,
    },
  });
  return { systemPrompt: system, userPrompt: user };
}
