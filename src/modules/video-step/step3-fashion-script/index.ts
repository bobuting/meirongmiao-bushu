/**
 * Step3 时尚大片脚本生成管线
 *
 * 核心设计理念：
 * 1. 两段式生成：先构思视觉概念（色调/镜头/氛围），再扩写完整分镜脚本
 * 2. 时尚导演人格轮转：每条脚本由不同风格的时尚导演创作
 * 3. 金标样本锚定：高质量样本作为质量基准
 * 4. 视觉优先：概念驱动镜头，构建美学宇宙让服饰在其中拥有叙事意义
 */

import { randomUUID } from "node:crypto";
import type { AtmosphereSceneCategory } from '../../../contant-config/style-atmosphere-dict.js';
import { safeParseAtmosphere } from '../../../utils/dict-converters.js';

import type { AppContext } from "../../../core/app-context.js";
import type { Project, User } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot, ScriptCandidateEntity } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { getLogger } from "../../../core/logger/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import {
  loadFashionScriptPrompt,
  generateRandomFashionDiversity,
} from "./prompt.js";
import { generateFashionVisualConcept } from "./concept-generator.js";
import { matchGoldenExamples, formatGoldenExamplesForPrompt } from "../../golden-example-service.js";
import type {
  FashionDiversityCombination,
  FiveDimensionHotTrends,
  VisualConcept,
} from "./types.js";
import type { DiversityCombination } from "../step3-custom-script/types.js";
import { FASHION_DIRECTOR_PERSONAS, FASHION_SCENES } from "./types.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getMergedSceneRecommendation } from "../shared/scene-recommender.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";

const logger = getLogger("fashion-script-pipeline");

// ===========================================================================
// 辅助函数
// ===========================================================================

/** 解析 LLM 返回的 JSON 文本，使用 extractJsonObject 提供更好的容错能力 */
function parseLlmResponse(text: string): VideoScriptContent | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    // 记录原始响应内容（截取前500字符），便于排查问题
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }
  if (!parsed.video_info && !parsed.video_analysis) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION },
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
  concept: VisualConcept,
  diversity: FashionDiversityCombination,
  hotTrends: FiveDimensionHotTrends,
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
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION);
  if (!provider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION },
      "No LLM provider configured for STEP3_FASHION_SCRIPT_GENERATION"
    );
    return null;
  }

  const directorPersona = FASHION_DIRECTOR_PERSONAS[directorPersonaIndex % FASHION_DIRECTOR_PERSONAS.length];

  // 直接使用角色性别，禁止推断
  if (!selectedRoleDirection?.gender || selectedRoleDirection.gender === "unknown") {
    throw new Error("角色性别未设置，无法生成 fashion 脚本。请先在定妆步骤设置角色性别。");
  }
  const characterGender = selectedRoleDirection.gender as "male" | "female";

  const { systemPrompt, userPrompt } = await loadFashionScriptPrompt({
    diversity,
    hotTrends,
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
      routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION,
      businessContext: "Step3 时尚大片脚本扩写（阶段2）",
      projectId: projectId ?? "",
    });

    return parseLlmResponse(response);
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION },
      "Stage 2 LLM call failed"
    );
    return null;
  }
}

/**
 * 获取热点数据
 */
async function fetchHotTrends(ctx: AppContext): Promise<FiveDimensionHotTrends> {
  const trends: FiveDimensionHotTrends = {};

  try {
    const rows = await ctx.repos.hotTrendAssets.findTopTrends(10);

    for (const row of rows) {
      const trendType = row.trend_type as string | undefined;
      const topic = row.topic as string;
      if (!topic) continue;

      if (trendType?.includes("节日") || trendType?.includes("节气")) {
        trends.festival = trends.festival || [];
        trends.festival.push(topic);
      } else if (trendType?.includes("影视") || trendType?.includes("音乐")) {
        trends.entertainment = trends.entertainment || [];
        trends.entertainment.push(topic);
      } else if (trendType?.includes("情绪") || trendType?.includes("社会")) {
        trends.socialEmotion = trends.socialEmotion || [];
        trends.socialEmotion.push(topic);
      } else if (trendType?.includes("挑战")) {
        trends.challenge = trends.challenge || [];
        trends.challenge.push(topic);
      } else {
        trends.crossover = trends.crossover || [];
        trends.crossover.push(topic);
      }
    }
  } catch (error) {
    logger.warn(
      { err: error, routeKey: ProviderRouteKeys.STEP3_FASHION_SCRIPT_GENERATION },
      "Failed to fetch hot trends"
    );
  }

  return trends;
}

/**
 * 生成时尚大片脚本快照
 */
export async function generateFashionScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {

  const count = 1;
  const items: ScriptCandidateEntity[] = [];

  // 获取项目上下文
  const [projectContext, hotTrends, sceneRecommendation] = await Promise.all([
    ctx.projectContextService.getProjectContext(project.id, {
      includeGarmentImages: true,
      includeCharacterFiveView: true,
    }),
    fetchHotTrends(ctx),
    getMergedSceneRecommendation(ctx.repos.sceneLibrary, {
      suitability: ["clothing"],
      fallbackScenes: FASHION_SCENES,
    }),
  ]);

  const outfitDesc = projectContext.outfitDescription || undefined;
  const characterDesc = projectContext.characterDescription || undefined;
  const matchingRef = projectContext.matchingReference || undefined;
  const clothingStyles = projectContext.clothingStyles;
  const { characterDirection } = buildCharacterPromptFromProject(project);

  // 校验穿搭数据
  if (!outfitDesc || outfitDesc.trim().length === 0) {
    throw new Error("服饰描述为空，无法生成 fashion 脚本。请先完成服饰上传。");
  }
  if (!matchingRef || matchingRef.trim().length === 0) {
    throw new Error("搭配描述为空，无法生成 fashion 脚本。请先完成穿搭方案选择。");
  }
  if (!clothingStyles || clothingStyles.length === 0) {
    throw new Error("服饰风格为空，无法生成 fashion 脚本。请先完成穿搭方案选择。");
  }


  // 逐个生成脚本，每条使用不同的导演人格和多样性组合
  for (let i = 0; i < count; i++) {
    const diversity = generateRandomFashionDiversity();
    const directorPersonaIndex = i;


    // 阶段1：生成视觉概念
    const concept = await generateFashionVisualConcept(
      ctx, user.id, diversity, hotTrends,
      outfitDesc, characterDesc, matchingRef, clothingStyles, characterDirection,
      project.id
    );

    if (!concept) {
      logger.warn({ scriptIndex: i + 1 }, "FashionScriptPipeline script concept generation failed, skipping");
      continue;
    }


    // 匹配金标样本（将时尚维度映射为 custom 兼容结构用于数据库查询）
    const goldenExamples = await matchGoldenExamples(ctx, {
      narrativeStructure: diversity.cameraMovement,
      characterRelationship: diversity.scene,
      coreEmotion: diversity.mood,
      visualStyle: diversity.visualStyle,
      sceneStrategy: diversity.scene,
      openingStyle: diversity.openingStyle,
      endingStyle: diversity.endingStyle,
    } as unknown as DiversityCombination, 2);
    const goldenExamplesText = formatGoldenExamplesForPrompt(goldenExamples);

    // 阶段2：基于概念扩写完整脚本
    const payload = await expandConceptToScript(
      ctx, user.id, concept, diversity, hotTrends,
      directorPersonaIndex, goldenExamplesText,
      outfitDesc, characterDesc, matchingRef, clothingStyles, characterDirection,
      sceneRecommendation.sceneText || undefined,
      project.id,
    );

    if (!payload) {
      logger.warn({ scriptIndex: i + 1 }, "FashionScriptPipeline script generation failed, skipping");
      continue;
    }

    const candidateId = randomUUID();
    const title = payload.video_info?.title ?? payload.video_analysis?.title ?? "时尚大片脚本";
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
      strategyType: "fashion",
      title,
      preview,
      content,
      durationSec: payload.video_info?.duration_seconds ?? 20,
      suitability: "high",
      labels: [
        diversity.scene,
        diversity.visualStyle,
        diversity.mood,
        diversity.cameraMovement,
      ],
      storyboardSegments,
      mainScene: payload.video_info?.main_scene ?? extractMainSceneFromSegments(storyboardSegments),
      atmosphere: safeParseAtmosphere(payload.video_analysis?.atmosphere) ?? undefined,
      primaryEmotion: diversity.mood,
      videoStyle: diversity.visualStyle,
      emotionArc: payload.video_analysis?.emotion?.emotion_arc,
      video_info: payload.video_info as Record<string, unknown> | undefined,
      video_analysis: payload.video_analysis as Record<string, unknown> | undefined,
      editing_analysis: payload.editing_analysis as Record<string, unknown> | undefined,
      shot_breakdown: payload.shot_breakdown as Array<Record<string, unknown>> | undefined,
    });
  }

  const snapshot: Step3ScriptCandidateSnapshot = {
    snapshotId: `fashion-${Date.now()}`,
    projectId: project.id,
    promptVersion: "fashion-v1",
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
