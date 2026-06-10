/**
 * 阶段2：共鸣故事分镜展开
 * 基于阶段1的故事概念，生成完整分镜脚本
 */

import type { AppContext } from "../../../core/app-context.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import type { StorytellerPersona, ResonanceStoryConcept } from "./types.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { skillLoader } from "../../../services/skills/index.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("resonance-storyboard");

/** 阶段2提示词模板 code */
const PROMPT_CODE_GENERATION = "resonance_story_generation";

/** 解析 LLM 返回的 JSON */
function parseLlmResponse(text: string): VideoScriptContent | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.video_info && !parsed.video_analysis) {
    logger.warn({ routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION }, "Resonance LLM response missing required fields");
    return null;
  }
  return parsed as unknown as VideoScriptContent;
}

/**
 * 阶段2：基于概念展开完整分镜脚本
 */
export async function expandConceptToScript(
  ctx: AppContext,
  userId: string,
  concept: ResonanceStoryConcept,
  persona: StorytellerPersona,
  outfitDescription?: string,
  characterDescription?: string,
  clothingStyles?: string[],
  selectedRoleDirection?: CharacterDirectionInfo | null,
  recommendedScenes?: string,
  goldenExamplesText?: string,
  projectId?: string,
): Promise<VideoScriptContent | null> {
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION);
  if (!provider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION },
      "未配置 LLM provider"
    );
    return null;
  }

  // 角色性别校验
  if (!selectedRoleDirection?.gender || selectedRoleDirection.gender === "unknown") {
    throw new Error("角色性别未设置，无法生成 resonance 脚本。请先在定妆步骤设置角色性别。");
  }
  const characterGender = selectedRoleDirection.gender as "male" | "female";

  const { system, user } = await skillLoader.render(PROMPT_CODE_GENERATION, {
    variables: {
      characterGender,
      characterDescription,
      outfitDescription,
      clothingStyles,
      selectedRoleDirection,
      concept,
      persona,
      goldenExamplesText,
      recommendedScenes,
    },
  });

  try {
    const response = await requestLlmPlainText(provider, system, user, 0.7, {
      ctx,
      routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION,
      businessContext: "Step3 共鸣故事分镜展开（阶段2）",
      projectId: projectId ?? "",
      userId,
    });

    return parseLlmResponse(response);
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION },
      "LLM 调用失败"
    );
    return null;
  }
}
