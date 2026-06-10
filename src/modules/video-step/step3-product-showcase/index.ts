/**
 * Step3 产品展示脚本生成管线
 *
 * 核心设计理念：
 * 1. 两段式生成：先构思视觉概念（卖点/场景/动作），再扩写完整分镜脚本
 * 2. 导演人格轮转：每条脚本由不同风格的电商导演创作
 * 3. 产品导向：以服装产品的多角度展示为核心目标
 * 4. 单模特多维度：通过角度、场景、动作的变化展示产品的全面魅力
 */

import { randomUUID } from "node:crypto";
import { safeParseAtmosphere } from "../../../utils/dict-converters.js";

import type { AppContext } from "../../../core/app-context.js";
import type { Project, User } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot, ScriptCandidateEntity } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { getLogger } from "../../../core/logger/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import {
  loadProductShowcaseScriptPrompt,
  generateRandomProductDiversity,
} from "./prompt.js";
import { generateProductShowcaseVisualConcept } from "./concept-generator.js";
import { matchGoldenExamples, formatGoldenExamplesForPrompt } from "../../golden-example-service.js";
import type {
  ProductDiversityCombination,
  ProductVisualConcept,
} from "./types.js";
import type { DiversityCombination } from "../step3-custom-script/types.js";
import { PRODUCT_DIRECTOR_PERSONAS, PRODUCT_SCENES } from "./types.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getMergedSceneRecommendation } from "../shared/scene-recommender.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";

const logger = getLogger("product-showcase");

// ===========================================================================
// 辅助函数
// ===========================================================================

/** 解析 LLM 返回的 JSON 文本 */
function parseLlmResponse(text: string): VideoScriptContent | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.video_info && !parsed.video_analysis) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION },
      "LLM response missing required fields (video_info/video_analysis)"
    );
    return null;
  }
  return parsed as unknown as VideoScriptContent;
}

/** 生成预览文本 */
function generatePreview(summary: string | undefined): string {
  if (!summary) return "暂无预览";
  return summary.length > 50 ? summary.substring(0, 50) + "..." : summary;
}

/** 生成内容文本 */
function generateContent(payload: VideoScriptContent): string {
  return JSON.stringify({
    title: payload.video_info?.title ?? payload.video_analysis?.title,
    theme: payload.video_analysis?.theme,
    summary: payload.video_analysis?.summary,
    emotion: payload.video_analysis?.emotion,
    video_type: payload.video_analysis?.video_type,
    video_style: payload.video_analysis?.video_style,
    shot_count: payload.shot_breakdown?.length ?? 0,
  }, null, 2);
}

/** 从 scene 对象或字符串中提取显示文本 */
function extractSceneText(scene: unknown): string {
  if (!scene) return "";
  if (typeof scene === "string") return scene;
  if (typeof scene === "object") {
    const obj = scene as Record<string, unknown>;
    if (obj.specific_location) return String(obj.specific_location);
    if (obj.environment) return String(obj.environment);
    if (obj.location_type) return String(obj.location_type);
  }
  return "";
}

/** 从分镜段中提取主场景 */
function extractMainSceneFromSegments(
  segments: Array<{ visualCue: string }>,
): string | undefined {
  const first = segments[0]?.visualCue;
  return first || undefined;
}

// ===========================================================================
// 核心管线
// ===========================================================================

/**
 * 阶段2：基于视觉概念扩写完整脚本
 */
async function expandConceptToScript(
  ctx: AppContext,
  userId: string,
  concept: ProductVisualConcept,
  diversity: ProductDiversityCombination,
  directorPersonaIndex: number,
  goldenExamplesText: string,
  outfitDescription?: string,
  characterDescription?: string,
  matchingReference?: string,
  clothingStyles?: string[],
  selectedRoleDirection?: CharacterDirectionInfo | null,
  recommendedScenes?: string,
  projectId?: string,
): Promise<VideoScriptContent | null> {
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION);
  if (!provider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION },
      "No LLM provider configured for STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION"
    );
    return null;
  }

  const directorPersona = PRODUCT_DIRECTOR_PERSONAS[directorPersonaIndex % PRODUCT_DIRECTOR_PERSONAS.length];

  // 直接使用角色性别，禁止推断
  if (!selectedRoleDirection?.gender || selectedRoleDirection.gender === "unknown") {
    throw new Error("角色性别未设置，无法生成产品展示脚本。请先在定妆步骤设置角色性别。");
  }
  const characterGender = selectedRoleDirection.gender as "male" | "female";

  const { systemPrompt, userPrompt } = await loadProductShowcaseScriptPrompt({
    diversity,
    outfitDescription,
    characterDescription,
    matchingReference,
    clothingStyles,
    selectedRoleDirection,
    concept,
    directorPersona,
    goldenExamplesText: goldenExamplesText || null,
    characterGender,
    recommendedScenes,
  });

  try {
    const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, 0.8, {
      ctx,
      userId,
      routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION,
      businessContext: "Step3 产品展示脚本扩写（阶段2）",
      projectId: projectId ?? "",
    });

    return parseLlmResponse(response);
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION },
      "Stage 2 LLM call failed"
    );
    return null;
  }
}

/**
 * 生成产品展示脚本快照
 */
export async function generateProductShowcaseScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {

  const count = 1;
  const items: ScriptCandidateEntity[] = [];

  // 获取项目上下文 + 场景推荐
  const [projectContext, sceneRecommendation] = await Promise.all([
    ctx.projectContextService.getProjectContext(project.id, {
      includeGarmentImages: true,
      includeCharacterFiveView: true,
    }),
    getMergedSceneRecommendation(ctx.repos.sceneLibrary, {
      suitability: ["clothing"],
      fallbackScenes: PRODUCT_SCENES,
    }),
  ]);

  const outfitDesc = projectContext.outfitDescription || undefined;
  const characterDesc = projectContext.characterDescription || undefined;
  const matchingRef = projectContext.matchingReference || undefined;
  const clothingStyles = projectContext.clothingStyles;
  const { characterDirection } = buildCharacterPromptFromProject(project);

  // 校验穿搭数据
  if (!outfitDesc || outfitDesc.trim().length === 0) {
    throw new Error("服饰描述为空，无法生成产品展示脚本。请先完成服饰上传。");
  }
  if (!matchingRef || matchingRef.trim().length === 0) {
    throw new Error("搭配描述为空，无法生成产品展示脚本。请先完成穿搭方案选择。");
  }
  if (!clothingStyles || clothingStyles.length === 0) {
    throw new Error("服饰风格为空，无法生成产品展示脚本。请先完成穿搭方案选择。");
  }

  // 逐个生成脚本
  for (let i = 0; i < count; i++) {
    const diversity = generateRandomProductDiversity();
    const directorPersonaIndex = i;

    // 阶段1：生成视觉概念
    const concept = await generateProductShowcaseVisualConcept(
      ctx, user.id, diversity,
      outfitDesc, characterDesc, matchingRef, clothingStyles, characterDirection,
      project.id
    );

    if (!concept) {
      logger.warn("Script concept generation failed, skipping");
      continue;
    }

    // 匹配金标样本
    const goldenExamples = await matchGoldenExamples(ctx, {
      narrativeStructure: diversity.showcaseStyle,
      characterRelationship: diversity.scene,
      coreEmotion: diversity.mood,
      visualStyle: diversity.showcaseStyle,
      sceneStrategy: diversity.scene,
      openingStyle: diversity.openingStyle,
      endingStyle: diversity.endingStyle,
    } as unknown as DiversityCombination, 2);
    const goldenExamplesText = formatGoldenExamplesForPrompt(goldenExamples);

    // 阶段2：基于概念扩写完整脚本
    const payload = await expandConceptToScript(
      ctx, user.id, concept, diversity,
      directorPersonaIndex, goldenExamplesText,
      outfitDesc, characterDesc, matchingRef, clothingStyles, characterDirection,
      sceneRecommendation.sceneText || undefined,
      project.id,
    );

    if (!payload) {
      logger.warn("Script generation failed, skipping");
      continue;
    }

    const candidateId = randomUUID();
    const title = payload.video_info?.title ?? payload.video_analysis?.title ?? "产品展示脚本";
    const summary = payload.video_analysis?.summary ?? "";
    const preview = generatePreview(summary);
    const content = generateContent(payload);

    // 构建 snapshot item
    const storyboardSegments = (payload.shot_breakdown ?? []).map((shot, idx) => ({
      title: `分镜 ${idx + 1}`,
      content: shot.shot_description ?? "",
      visualCue: extractSceneText(shot.visual?.scene),
      shotSize: shot.shot_type,
      ambientSound: shot.audio?.ambient_sound ?? "",
      action: shot.subjects?.[0]?.action,
      durationSec: shot.timecode?.duration_seconds ?? 0,
      emotionNote: payload.video_analysis?.emotion?.primary,
    }));

    items.push({
      candidateId,
      sourceScriptId: candidateId,
      sourceUrl: null,
      rank: i + 1,
      strategyType: "product_showcase",
      title,
      preview,
      content,
      durationSec: payload.video_info?.duration_seconds ?? 20,
      suitability: "high",
      labels: [
        diversity.scene,
        diversity.showcaseStyle,
        diversity.mood,
        diversity.cameraMovement,
      ],
      storyboardSegments,
      mainScene: payload.video_info?.main_scene ?? extractMainSceneFromSegments(storyboardSegments),
      atmosphere: safeParseAtmosphere(payload.video_analysis?.atmosphere) ?? undefined,
      primaryEmotion: diversity.mood,
      videoStyle: diversity.showcaseStyle,
      emotionArc: payload.video_analysis?.emotion?.emotion_arc,
      video_info: payload.video_info as Record<string, unknown> | undefined,
      video_analysis: payload.video_analysis as Record<string, unknown> | undefined,
      editing_analysis: payload.editing_analysis as Record<string, unknown> | undefined,
      shot_breakdown: payload.shot_breakdown as Array<Record<string, unknown>> | undefined,
    });
  }

  const snapshot: Step3ScriptCandidateSnapshot = {
    snapshotId: `product-showcase-${Date.now()}`,
    projectId: project.id,
    promptVersion: "product-showcase-v1",
    topNAtCreation: items.length,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode: "real",
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items,
  };

  return snapshot;
}
