/**
 * 详细分镜生成器（第二段）
 */

import type { AppContext } from "../../../core/app-context.js";
import type { EmotionArchetype, StoryOutline } from "./types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import type { Storyboard } from "../../../contracts/storyboard-contract.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { skillLoader, buildPromptVariables } from "../../../services/skills/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("storyboard-generator");

/** Skills 提示词代码 */
const SKILL_CODE_EMOTION_ARCHETYPE_STORYBOARD = "emotion_archetype_storyboard";

/** 分镜生成参数 */
export interface StoryboardGenerationParams {
  userId: string;
  archetype: EmotionArchetype;
  outline: StoryOutline;
  characterDescription: string;
  outfitDescription: string;
  mustNotUseScenes: string[];
  mustNotUseEmotions: string[];
  mustNotUsePhrases: string[];
  matchingReference?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo;
}

/**
 * 构建分镜生成提示词变量（供 Skills 系统渲染）
 */
export async function buildStoryboardPromptVariables(params: StoryboardGenerationParams): Promise<Record<string, unknown>> {
  const {
    archetype,
    outline,
    characterDescription,
    outfitDescription,
    mustNotUseScenes,
    mustNotUseEmotions,
    mustNotUsePhrases,
    matchingReference,
    clothingStyles,
    selectedRoleDirection,
  } = params;

  // 角色方向描述
  const roleDirectionHint = selectedRoleDirection
    ? `\n**角色方向**：${selectedRoleDirection.styleWords.length > 0 ? `关键词：${selectedRoleDirection.styleWords.join("、")}` : ""}`
    : "";

  // 搭配描述
  const matchingHint = matchingReference
    ? `\n**搭配描述**：${matchingReference}`
    : "";

  // 服饰风格
  const styleHint = clothingStyles?.length
    ? `\n**服饰风格**：${clothingStyles.join("、")}，场景选择应与服饰风格自然匹配`
    : "";

  return buildPromptVariables({
    outlineJson: JSON.stringify(outline),
    archetypeId: archetype.id,
    archetypeName: archetype.name,
    emotionCore: archetype.emotionCore,
    clothingRole: archetype.clothingRole,
    syncMode: archetype.syncMode,
    characterDescription: characterDescription + roleDirectionHint,
    outfitDescription: outfitDescription + matchingHint + styleHint,
    shotCount: outline.shots_outline.length,
    totalDuration: archetype.duration,
    outlineId: outline.outline_id,
    emotionArc: outline.emotion_arc,
    conflictDescription: outline.conflict_description,
    visualChanges: outline.clothing_showcase_plan.visual_changes,
    shotsOutline: outline.shots_outline,
    mustNotUseScenes: mustNotUseScenes.length > 0 ? mustNotUseScenes.join("、") : undefined,
    mustNotUseEmotions: mustNotUseEmotions.length > 0 ? mustNotUseEmotions.join("、") : undefined,
    mustNotUsePhrases: mustNotUsePhrases.length > 0 ? mustNotUsePhrases.map(p => `"${p}"`).join("、") : undefined,
  });
}

/**
 * 解析LLM返回的分镜JSON，使用 extractJsonObject 提供更好的容错能力
 */
export function parseStoryboardJson(jsonText: string): Storyboard | null {
  const parsed = extractJsonObject(jsonText);
  if (!parsed) {
    const snippet = jsonText.trim().slice(0, 500);
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_GENERATION },
      `解析分镜 JSON 失败. Raw snippet: ${snippet}`
    );
    return null;
  }
  return parsed as unknown as Storyboard;
}

/**
 * 生成分镜脚本（第二段）
 */
export async function generateStoryboard(
  ctx: AppContext,
  params: StoryboardGenerationParams,
  projectId?: string
): Promise<Storyboard | null> {
  // 获取 provider
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_GENERATION);
  if (!provider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_GENERATION },
      "未配置 LLM provider"
    );
    return null;
  }

  try {
    // 使用 Skills 系统构建提示词
    const variables = await buildStoryboardPromptVariables(params);
    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(SKILL_CODE_EMOTION_ARCHETYPE_STORYBOARD, {
      variables,
    });

    const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, 0.7, {
      ctx,
      userId: params.userId,
      routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_GENERATION,
      businessContext: "Step3 情感原型分镜生成（阶段2）",
      projectId: projectId ?? "",
    });

    return parseStoryboardJson(response);
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_GENERATION },
      "LLM 调用失败"
    );
    return null;
  }
}
