/**
 * 阶段1：视觉概念生成器
 * 轻量 LLM 调用，生成视觉概念（视觉命题、创意张力、色调、镜头语言、氛围方向、核心画面）
 * 概念作为阶段2完整脚本扩写的输入
 */

import type { AppContext } from "../../../core/app-context.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { getLogger } from "../../../core/logger/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import type {
  FashionDiversityCombination,
  FiveDimensionHotTrends,
  VisualConcept,
} from "./types.js";
import { skillLoader } from "../../../services/skills/index.js";
import { buildFashionHotTrendDescription } from "./prompt.js";

const logger = getLogger("llm-transport");

/** 阶段1提示词模板 code */
const PROMPT_CODE_CONCEPT = "fashion_visual_concept";

/** 阶段1 LLM 返回的结构 */
interface ConceptPayload {
  title?: string;
  visual_thesis?: string;
  visual_reference?: string;
  creative_tension?: string;
  visual_symbols?: string[];
  color_palette?: string;
  camera_language?: string;
  atmosphere_anchor?: string;
  visual_beats?: string[];
  key_visual?: string;
  ending_visual?: string;
}

/** 解析 LLM 返回的 JSON，使用 extractJsonObject 提供更好的容错能力 */
function parseConceptResponse(text: string): ConceptPayload | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    // 记录原始响应内容（截取前500字符），便于排查问题
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.title && !parsed.color_palette) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT },
      "LLM response missing title and color_palette"
    );
    return null;
  }
  return parsed as unknown as ConceptPayload;
}

/**
 * 阶段1：生成视觉概念
 * @returns 视觉概念，失败返回 null
 */
export async function generateFashionVisualConcept(
  ctx: AppContext,
  userId: string,
  diversity: FashionDiversityCombination,
  hotTrends: FiveDimensionHotTrends,
  outfitDescription?: string,
  characterDescription?: string,
  matchingReference?: string,
  clothingStyles?: string[],
  selectedRoleDirection?: CharacterDirectionInfo | null,
  projectId?: string,
): Promise<VisualConcept | null> {
  let activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT);
  if (!activeProvider) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT },
      "No provider for STEP3_FASHION_SCRIPT_CONCEPT, falling back to STEP3_FASHION_SCRIPT_GENERATION"
    );
    activeProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION);
  }
  if (!activeProvider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT },
      "No provider available for concept generation"
    );
    return null;
  }

  const hotTrendText = buildFashionHotTrendDescription(hotTrends);

  const characterHint = characterDescription ? `\n【角色信息】\n${characterDescription}` : "";
  const outfitHint = outfitDescription ? `\n【服饰描述】\n${outfitDescription}` : "";
  const matchingHint = matchingReference ? `\n【搭配描述】\n${matchingReference}` : "";
  const styleHint = clothingStyles?.length ? `\n【服饰风格】\n${clothingStyles.join("、")}` : "";
  // 角色方向（不含 styleSummary）
  const roleDirectionHint = selectedRoleDirection
    ? `\n【角色方向】${selectedRoleDirection.styleWords.length > 0 ? `\n关键词：${selectedRoleDirection.styleWords.join("、")}` : ""}`
    : "";

  const userPrompt = `## 视觉命题
${hotTrendText}

## 创作素材
${characterHint}${roleDirectionHint}${outfitHint}${matchingHint}${styleHint}

## 视觉方向（必须遵循）
- 拍摄场景：${diversity.scene}
- 视觉风格：${diversity.visualStyle}
- 镜头运动：${diversity.cameraMovement}
- 氛围情绪：${diversity.mood}
- 开场方式：${diversity.openingStyle}
- 收尾方式：${diversity.endingStyle}
- 音乐节奏：${diversity.musicRhythm}
- 创意张力：${diversity.creativeTension}
- 视觉符号：${diversity.visualSymbol}

请基于以上方向构思一个高端时尚短片的视觉概念，重点定义视觉命题、创意张力、色调和核心画面。`;

  const { system: sysPrompt, user: usrPrompt } = await skillLoader.render(PROMPT_CODE_CONCEPT, { userPrompt });

  try {
    const response = await requestLlmPlainText(activeProvider, sysPrompt, usrPrompt, 0.9, {
      ctx,
      userId,
      routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT,
      businessContext: "Step3 时尚大片视觉概念生成（阶段1）",
      projectId: projectId ?? "",
    });

    const payload = parseConceptResponse(response);
    if (!payload) return null;

    return {
      title: payload.title ?? "未命名视觉概念",
      visualThesis: payload.visual_thesis ?? "",
      visualReference: payload.visual_reference ?? "",
      creativeTension: payload.creative_tension ?? "",
      visualSymbols: payload.visual_symbols ?? [],
      colorPalette: payload.color_palette ?? "",
      cameraLanguage: payload.camera_language ?? "",
      atmosphereAnchor: payload.atmosphere_anchor ?? "",
      visualBeats: payload.visual_beats ?? [],
      keyVisual: payload.key_visual ?? "",
      endingVisual: payload.ending_visual ?? "",
    };
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_CONCEPT },
      "LLM call failed"
    );
    return null;
  }
}
