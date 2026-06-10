/**
 * 阶段1：故事概念生成器
 * 轻量 LLM 调用，生成故事概念（title, theme, 叙事节拍等）
 * 概念作为阶段2完整脚本扩写的输入
 */

import type { AppContext } from "../../../core/app-context.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import type {
  CustomScriptScenario,
  DiversityCombination,
  FiveDimensionHotTrends,
  StoryConcept,
} from "./types.js";
import { skillLoader } from "../../../services/skills/index.js";
import { buildHotTrendDescription } from "./prompt.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("concept-generator");

/** 阶段1提示词模板 code */
const PROMPT_CODE_CONCEPT = "custom_scenario_script_concept";

/** 阶段1 LLM 返回的结构 */
interface ConceptPayload {
  title?: string;
  theme?: string;
  emotion_arc?: string;
  narrative_beats?: string[];
  character_interaction?: string;
  hook?: string;
  ending_hint?: string;
}

/** 解析 LLM 返回的 JSON，使用 extractJsonObject 提供更好的容错能力 */
function parseConceptResponse(text: string): ConceptPayload | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.title && !parsed.theme) {
    logger.warn({ routeKey: ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT }, "ConceptGenerator LLM response missing title and theme");
    return null;
  }
  return parsed as unknown as ConceptPayload;
}

/**
 * 阶段1：生成故事概念
 * @returns 故事概念，失败返回 null
 */
export async function generateStoryConcept(
  ctx: AppContext,
  userId: string,
  scenario: CustomScriptScenario,
  diversity: DiversityCombination,
  hotTrends: FiveDimensionHotTrends,
  outfitDescription?: string,
  characterDescription?: string,
  matchingReference?: string,
  clothingStyles?: string[],
  selectedRoleDirection?: CharacterDirectionInfo | null,
  projectId?: string,
): Promise<StoryConcept | null> {
  let activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT);
  if (!activeProvider) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT },
      "未配置 STEP3_CUSTOM_SCRIPT_CONCEPT provider，尝试回退到 STEP3_CUSTOM_SCRIPT_GENERATION"
    );
    activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_GENERATION);
  }
  if (!activeProvider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT },
      "无可用 provider"
    );
    return null;
  }

  const hotTrendText = buildHotTrendDescription(hotTrends);

  const characterHint = characterDescription ? `\n【角色信息】\n${characterDescription}` : "";
  const outfitHint = outfitDescription ? `\n【服饰描述】\n${outfitDescription}` : "";
  const matchingHint = matchingReference ? `\n【搭配描述】\n${matchingReference}` : "";
  const styleHint = clothingStyles?.length ? `\n【服饰风格】\n${clothingStyles.join("、")}` : "";
  // 角色方向（不含 styleSummary）
  const roleDirectionHint = selectedRoleDirection
    ? `\n【角色方向】${selectedRoleDirection.styleWords.length > 0 ? `\n关键词：${selectedRoleDirection.styleWords.join("、")}` : ""}`
    : "";

  const userPrompt = `## 故事命题
${hotTrendText}

## 创作素材
${characterHint}${roleDirectionHint}${outfitHint}${matchingHint}${styleHint}

## 创作方向（必须遵循）
- 场景类型：${scenario}
- 叙事手法：${diversity.narrativeStructure}
- 人物关系：${diversity.characterRelationship}
- 情感方向：${diversity.coreEmotion}
- 场景策略：${diversity.sceneStrategy}
- 开场方式：${diversity.openingStyle}
- 结尾方式：${diversity.endingStyle}

如果人物关系是"亲子互动"/"闺蜜互动"/"情侣互动"等双人类型，概念中必须包含两个角色的互动设计。`;

  const { system: sysPrompt, user: usrPrompt } = await skillLoader.render(PROMPT_CODE_CONCEPT, { userPrompt });

  try {
    const response = await requestLlmPlainText(activeProvider, sysPrompt, usrPrompt, 0.9, {
      ctx,
      userId,
      routeKey: ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT,
      businessContext: "Step3 场景化脚本概念生成（阶段1）",
      projectId: projectId ?? "",
    });

    const payload = parseConceptResponse(response);
    if (!payload) return null;

    return {
      title: payload.title ?? "未命名故事",
      theme: payload.theme ?? "",
      emotionArc: payload.emotion_arc ?? "",
      narrativeBeats: payload.narrative_beats ?? [],
      characterInteraction: payload.character_interaction ?? "",
      hook: payload.hook ?? "",
      endingHint: payload.ending_hint ?? "",
    };
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_CUSTOM_SCRIPT_CONCEPT },
      "LLM 调用失败"
    );
    return null;
  }
}
