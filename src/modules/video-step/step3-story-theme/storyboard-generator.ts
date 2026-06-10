/**
 * 分镜展开生成器（第三段）
 * 基于故事大纲生成完整分镜脚本
 */

import type { AppContext } from "../../../core/app-context.js";
import type { StoryTheme, StoryThemeOutline } from "./types.js";
import type { Storyboard } from "../../../contracts/storyboard-contract.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { skillLoader, buildPromptVariables } from "../../../services/skills/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("story-theme-storyboard");

const SKILL_CODE = "story_theme_generation";

/** 分镜生成参数 */
export interface StoryboardGenerationParams {
  userId: string;
  theme: StoryTheme;
  outline: StoryThemeOutline;
  characterDescription: string;
  outfitDescription: string;
  mustNotUseScenes: string[];
  mustNotUseEmotions: string[];
  mustNotUsePhrases: string[];
}

/**
 * 生成详细分镜（第三段）
 */
export async function generateStoryboard(
  ctx: AppContext,
  params: StoryboardGenerationParams,
  projectId?: string,
): Promise<Storyboard | null> {
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_STORY_THEME_GENERATION);
  if (!provider) {
    log.error({ routeKey: ProviderRouteKeys.STEP3_STORY_THEME_GENERATION }, "未配置 LLM provider");
    return null;
  }

  try {
    const { theme, outline } = params;
    const variables = buildPromptVariables({
      outlineJson: JSON.stringify(outline),
      themeTitle: theme.theme_title ?? "",
      conflictCore: theme.conflict?.core ?? "",
      emotionArc: theme.emotional_anchor?.emotional_arc ?? "",
      eventChain: outline.event_chain ?? [],
      clothingStylingRole: theme.clothing_styling?.role ?? "",
      clothingStylingBefore: theme.clothing_styling?.before ?? "",
      clothingStylingAfter: theme.clothing_styling?.after ?? "",
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      shotsOutline: outline.shots_outline ?? [],
      mustNotUseScenes: params.mustNotUseScenes.length > 0 ? params.mustNotUseScenes.join("、") : undefined,
      mustNotUseEmotions: params.mustNotUseEmotions.length > 0 ? params.mustNotUseEmotions.join("、") : undefined,
      mustNotUsePhrases: params.mustNotUsePhrases.length > 0 ? params.mustNotUsePhrases.map(p => `"${p}"`).join("、") : undefined,
    });

    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(SKILL_CODE, { variables });

    const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, 0.7, {
      ctx,
      userId: params.userId,
      routeKey: ProviderRouteKeys.STEP3_STORY_THEME_GENERATION,
      businessContext: "Step3 主题叙事-分镜展开（阶段3）",
      projectId: projectId ?? "",
    });

    return parseStoryboardJson(response);
  } catch (error) {
    log.error({ err: error, routeKey: ProviderRouteKeys.STEP3_STORY_THEME_GENERATION }, "分镜展开 LLM 调用失败");
    return null;
  }
}

/**
 * 解析分镜 JSON
 */
function parseStoryboardJson(jsonText: string): Storyboard | null {
  const parsed = extractJsonObject(jsonText);
  if (!parsed) {
    const snippet = jsonText.trim().slice(0, 500);
    log.error({ routeKey: ProviderRouteKeys.STEP3_STORY_THEME_GENERATION }, `解析分镜 JSON 失败. Raw: ${snippet}`);
    return null;
  }
  return parsed as unknown as Storyboard;
}
