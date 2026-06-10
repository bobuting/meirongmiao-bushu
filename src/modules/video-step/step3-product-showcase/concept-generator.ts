/**
 * 阶段1：产品展示视觉概念生成器
 * 轻量 LLM 调用，生成视觉概念（卖点、场景规划、模特动作）
 * 概念作为阶段2完整脚本扩写的输入
 */

import type { AppContext } from "../../../core/app-context.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { getLogger } from "../../../core/logger/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import type {
  ProductDiversityCombination,
  ProductVisualConcept,
} from "./types.js";
import { skillLoader } from "../../../services/skills/index.js";

const logger = getLogger("product-showcase-concept");

/** 阶段1提示词模板 code */
const PROMPT_CODE_CONCEPT = "product_showcase_concept";

/** 阶段1 LLM 返回的结构 */
interface ConceptPayload {
  title?: string;
  product_focus?: string[];
  color_tone?: string;
  scene_plan?: Array<{
    scene: string;
    purpose: string;
    key_shots: string[];
  }>;
  model_actions?: string[];
  key_visual?: string;
  ending_visual?: string;
}

/** 解析 LLM 返回的 JSON */
function parseConceptResponse(text: string): ConceptPayload | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.title && !parsed.product_focus) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT },
      "LLM response missing title and product_focus"
    );
    return null;
  }
  return parsed as unknown as ConceptPayload;
}

/**
 * 阶段1：生成产品展示视觉概念
 * @returns 视觉概念，失败返回 null
 */
export async function generateProductShowcaseVisualConcept(
  ctx: AppContext,
  userId: string,
  diversity: ProductDiversityCombination,
  outfitDescription?: string,
  characterDescription?: string,
  matchingReference?: string,
  clothingStyles?: string[],
  selectedRoleDirection?: CharacterDirectionInfo | null,
  projectId?: string,
): Promise<ProductVisualConcept | null> {
  let activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT);
  if (!activeProvider) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT },
      "No provider for STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT, falling back to STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION"
    );
    activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION);
  }
  if (!activeProvider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT },
      "No provider available for concept generation"
    );
    return null;
  }

  const characterHint = characterDescription ? `\n【角色信息】\n${characterDescription}` : "";
  const outfitHint = outfitDescription ? `\n【服饰描述】（需要展示的核心产品）\n${outfitDescription}` : "";
  const matchingHint = matchingReference ? `\n【搭配描述】\n${matchingReference}` : "";
  const styleHint = clothingStyles?.length ? `\n【服饰风格】\n${clothingStyles.join("、")}` : "";
  const roleDirectionHint = selectedRoleDirection
    ? `\n【角色方向】${selectedRoleDirection.styleWords.length > 0 ? `\n关键词：${selectedRoleDirection.styleWords.join("、")}` : ""}`
    : "";

  const userPrompt = `## 创作素材
${characterHint}${roleDirectionHint}${outfitHint}${matchingHint}${styleHint}

## 视觉方向（必须遵循）
- 拍摄场景：${diversity.scene}
- 展示风格：${diversity.showcaseStyle}
- 镜头运动：${diversity.cameraMovement}
- 氛围情绪：${diversity.mood}
- 开场方式：${diversity.openingStyle}
- 收尾方式：${diversity.endingStyle}
- 音乐节奏：${diversity.musicRhythm}

请基于以上方向构思一条产品展示短视频的视觉概念，重点定义核心卖点、场景规划和模特动作。`;

  const { system: sysPrompt, user: usrPrompt } = await skillLoader.render(PROMPT_CODE_CONCEPT, { userPrompt });

  try {
    const response = await requestLlmPlainText(activeProvider, sysPrompt, usrPrompt, 0.9, {
      ctx,
      userId,
      routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT,
      businessContext: "Step3 产品展示视觉概念生成（阶段1）",
      projectId: projectId ?? "",
    });

    const payload = parseConceptResponse(response);
    if (!payload) return null;

    return {
      title: payload.title ?? "未命名产品展示概念",
      productFocus: payload.product_focus ?? [],
      colorTone: payload.color_tone ?? "",
      scenePlan: (payload.scene_plan ?? []).map((s) => ({
        scene: s.scene,
        purpose: s.purpose,
        keyShots: s.key_shots ?? [],
      })),
      modelActions: payload.model_actions ?? [],
      keyVisual: payload.key_visual ?? "",
      endingVisual: payload.ending_visual ?? "",
    };
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT },
      "LLM call failed"
    );
    return null;
  }
}
