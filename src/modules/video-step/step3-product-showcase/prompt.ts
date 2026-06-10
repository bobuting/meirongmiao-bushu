/**
 * Step3 产品展示脚本生成 - LLM Prompt 构建
 * 提示词内容通过提示词管理系统（Skills）统一管理
 * 本文件只负责构建变量数据
 */

import type {
  ProductDiversityCombination,
  ProductDirectorPersona,
  ProductVisualConcept,
} from "./types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import {
  PRODUCT_SCENES,
  PRODUCT_SHOWCASE_STYLES,
  PRODUCT_CAMERA_MOVEMENTS,
  PRODUCT_MOODS,
  PRODUCT_OPENINGS,
  PRODUCT_ENDINGS,
  PRODUCT_MUSIC_RHYTHMS,
} from "./types.js";
import { skillLoader } from "../../../services/skills/index.js";
import { selectNarrativeIdentity } from "../shared/narrative-identity.js";

/** 提示词模板 code */
const PROMPT_CODE_PRODUCT_SCRIPT = "product_showcase_generation";

/** 随机种子帮助函数 */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 生成随机多样性组合 */
export function generateRandomProductDiversity(): ProductDiversityCombination {
  return {
    scene: pickRandom(PRODUCT_SCENES),
    showcaseStyle: pickRandom(PRODUCT_SHOWCASE_STYLES),
    cameraMovement: pickRandom(PRODUCT_CAMERA_MOVEMENTS),
    mood: pickRandom(PRODUCT_MOODS),
    openingStyle: pickRandom(PRODUCT_OPENINGS),
    endingStyle: pickRandom(PRODUCT_ENDINGS),
    musicRhythm: pickRandom(PRODUCT_MUSIC_RHYTHMS),
  };
}

/**
 * 从提示词管理系统加载系统/用户提示词（阶段2：完整脚本扩写）
 */
export async function loadProductShowcaseScriptPrompt(input: {
  diversity: ProductDiversityCombination;
  outfitDescription?: string;
  characterDescription?: string;
  matchingReference?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo | null;
  concept?: ProductVisualConcept | null;
  directorPersona?: ProductDirectorPersona | null;
  goldenExamplesText?: string | null;
  characterGender?: "male" | "female" | "uncertain";
  /** 场景库+硬编码合并后的推荐场景文本 */
  recommendedScenes?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }> {
  const { diversity, outfitDescription, characterDescription, matchingReference, clothingStyles, selectedRoleDirection, concept, directorPersona, goldenExamplesText, characterGender, recommendedScenes } = input;

  const narrativeIdentity = selectNarrativeIdentity("product_showcase");

  const { system, user } = await skillLoader.render(PROMPT_CODE_PRODUCT_SCRIPT, {
    variables: {
      characterGender,
      characterDescription,
      outfitDescription,
      matchingReference,
      clothingStyles,
      selectedRoleDirection,
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
