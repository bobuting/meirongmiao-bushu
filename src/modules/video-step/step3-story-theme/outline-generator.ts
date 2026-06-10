/**
 * 故事大纲生成器（第二段）
 * 基于故事主题生成完整大纲
 */

import type { AppContext } from "../../../core/app-context.js";
import type { StoryTheme, StoryThemeOutline } from "./types.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { skillLoader, buildPromptVariables } from "../../../services/skills/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("story-theme-outline");

const SKILL_CODE = "story_theme_outline";

/** 大纲生成参数 */
export interface OutlineGenerationParams {
  userId: string;
  theme: StoryTheme;
  characterDescription: string;
  outfitDescription: string;
  mustNotUseScenes: string[];
  mustNotUseEmotions: string[];
  mustNotUsePhrases: string[];
}

/**
 * 生成故事大纲（第二段）
 */
export async function generateOutline(
  ctx: AppContext,
  params: OutlineGenerationParams,
  projectId?: string,
): Promise<StoryThemeOutline | null> {
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_STORY_THEME_OUTLINE);
  if (!provider) {
    log.error({ routeKey: ProviderRouteKeys.STEP3_STORY_THEME_OUTLINE }, "未配置 LLM provider");
    return null;
  }

  try {
    const { theme } = params;
    const variables = buildPromptVariables({
      themeJson: JSON.stringify(theme),
      themeTitle: theme.theme_title ?? "",
      conflictCore: theme.conflict?.core ?? "",
      targetEmotion: theme.emotional_anchor?.target_emotion ?? "",
      emotionalArc: theme.emotional_anchor?.emotional_arc ?? "",
      plotEvents: theme.plot_events ?? [],
      clothingStylingRole: theme.clothing_styling?.role ?? "",
      clothingStylingBefore: theme.clothing_styling?.before ?? "",
      clothingStylingAfter: theme.clothing_styling?.after ?? "",
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      sceneSuggestions: theme.scene_suggestions ?? [],
      duration: theme.duration ?? "30秒",
      shotCount: theme.shot_count ?? 8,
      mustNotUseScenes: params.mustNotUseScenes.length > 0 ? params.mustNotUseScenes.join("、") : undefined,
      mustNotUseEmotions: params.mustNotUseEmotions.length > 0 ? params.mustNotUseEmotions.join("、") : undefined,
      mustNotUsePhrases: params.mustNotUsePhrases.length > 0 ? params.mustNotUsePhrases.map(p => `"${p}"`).join("、") : undefined,
    });

    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(SKILL_CODE, { variables });

    const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, 0.8, {
      ctx,
      userId: params.userId,
      routeKey: ProviderRouteKeys.STEP3_STORY_THEME_OUTLINE,
      businessContext: "Step3 主题叙事-故事大纲（阶段2）",
      projectId: projectId ?? "",
      maxTokens: 8192,
    });

    return parseOutlineJson(response);
  } catch (error) {
    log.error({ err: error, routeKey: ProviderRouteKeys.STEP3_STORY_THEME_OUTLINE }, "故事大纲 LLM 调用失败");
    return null;
  }
}

/**
 * 解析故事大纲 JSON
 */
function parseOutlineJson(jsonText: string): StoryThemeOutline | null {
  const parsed = extractJsonObject(jsonText);
  if (!parsed) {
    const snippet = jsonText.trim().slice(0, 500);
    log.error({ routeKey: ProviderRouteKeys.STEP3_STORY_THEME_OUTLINE }, `解析大纲 JSON 失败. Raw: ${snippet}`);
    return null;
  }
  return parsed as unknown as StoryThemeOutline;
}
