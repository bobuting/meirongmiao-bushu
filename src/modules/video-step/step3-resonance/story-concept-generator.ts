/**
 * 阶段1：共鸣故事概念生成器
 * 轻量 LLM 调用，生成故事概念（主角、处境、情绪弧线、钩子等）
 */

import type { AppContext } from "../../../core/app-context.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import type { FiveDimensionHotTrends } from "../step3-custom-script/types.js";
import type { StorytellerPersona, ResonanceStoryConcept, ConceptPayload } from "./types.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { skillLoader } from "../../../services/skills/index.js";
import { buildHotTrendDescription } from "../step3-custom-script/prompt.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("resonance-concept");

/** 阶段1提示词模板 code */
const PROMPT_CODE_CONCEPT = "resonance_story_concept";

/** 解析 LLM 返回的 JSON */
function parseConceptResponse(text: string): ConceptPayload | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.title && !parsed.protagonist) {
    logger.warn({ routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT }, "Concept response missing title and protagonist");
    return null;
  }
  return parsed as unknown as ConceptPayload;
}

/**
 * 阶段1：生成共鸣故事概念
 * @returns 故事概念，失败返回 null
 */
export async function generateResonanceConcept(
  ctx: AppContext,
  userId: string,
  persona: StorytellerPersona,
  hotTrends: FiveDimensionHotTrends,
  outfitDescription?: string,
  characterDescription?: string,
  clothingStyles?: string[],
  selectedRoleDirection?: CharacterDirectionInfo | null,
  projectId?: string,
): Promise<ResonanceStoryConcept | null> {
  let activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT);
  if (!activeProvider) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT },
      "未配置 STEP3_RESONANCE_STORY_CONCEPT provider，尝试回退到 STEP3_RESONANCE_STORY_GENERATION"
    );
    activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_RESONANCE_STORY_GENERATION);
  }
  if (!activeProvider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT },
      "无可用 provider"
    );
    return null;
  }

  const hotTrendText = buildHotTrendDescription(hotTrends);

  const characterHint = characterDescription ? `\n【角色信息】\n${characterDescription}` : "";
  const outfitHint = outfitDescription ? `\n【服饰描述】\n${outfitDescription}` : "";
  const styleHint = clothingStyles?.length ? `\n【服饰风格】\n${clothingStyles.join("、")}` : "";
  const roleDirectionHint = selectedRoleDirection
    ? `\n【角色方向】${selectedRoleDirection.styleWords.length > 0 ? `\n关键词：${selectedRoleDirection.styleWords.join("、")}` : ""}`
    : "";

  const userPrompt = `## 讲述者人格
名字：${persona.name}
风格：${persona.specialty} — ${persona.styleSignature}
镜头偏好：${persona.cameraPreference}
剪辑节奏：${persona.editingRhythm}

## 热点情绪素材
${hotTrendText}

## 创作素材
${characterHint}${roleDirectionHint}${outfitHint}${styleHint}

## 创作要求
- 核心目标：让观众想看完，有停留
- 反转是可选的，不要为了反转而反转
- 服装是角色造型的一部分，不是故事主题
- 故事要有一个具体的、让人想看下去的开场`;

  const { system: sysPrompt, user: usrPrompt } = await skillLoader.render(PROMPT_CODE_CONCEPT, { userPrompt });

  try {
    const response = await requestLlmPlainText(activeProvider, sysPrompt, usrPrompt, 0.85, {
      ctx,
      userId,
      routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT,
      businessContext: "Step3 共鸣故事概念生成（阶段1）",
      projectId: projectId ?? "",
    });

    const payload = parseConceptResponse(response);
    if (!payload) return null;

    return {
      title: payload.title ?? "未命名故事",
      protagonist: payload.protagonist ?? "",
      situation: payload.situation ?? "",
      emotionArc: payload.emotion_arc ?? "",
      keyMoment: payload.key_moment ?? "",
      hookDesign: payload.hook_design ?? "",
      endingHint: payload.ending_hint ?? "",
      viewerTakeaway: payload.viewer_takeaway ?? "",
      personaName: persona.name,
    };
  } catch (error) {
    logger.error({ err: error, routeKey: ProviderRouteKeys.STEP3_RESONANCE_STORY_CONCEPT }, "LLM 调用失败");
    return null;
  }
}
