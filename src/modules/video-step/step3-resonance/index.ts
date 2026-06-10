/**
 * Step3 共鸣故事脚本生成管线
 *
 * 核心设计理念：
 * 1. 拍人不拍衣服：讲述真实人物的故事，服装自然呈现在角色造型中
 * 2. 两段式生成：先构思故事概念，再展开完整分镜
 * 3. 讲述者人格轮转：每条脚本由不同风格的讲述者创作
 * 4. 热点情绪驱动：利用已有热点数据的情绪而非话题
 * 5. 吸引力优先：反转可选，核心目标是让观众想看完
 */

import { randomUUID } from "node:crypto";
import { safeParseAtmosphere } from "../../../utils/dict-converters.js";

import type { AppContext } from "../../../core/app-context.js";
import type { Project, User } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot, ScriptCandidateEntity } from "../../../contracts/step3-candidate-snapshot-contract.js";
import { STORYTELLER_PERSONAS } from "./types.js";
import type { FiveDimensionHotTrends } from "../step3-custom-script/types.js";
import { generateResonanceConcept } from "./story-concept-generator.js";
import { expandConceptToScript } from "./storyboard-generator.js";
import { matchGoldenExamples, formatGoldenExamplesForPrompt } from "../../golden-example-service.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getMergedSceneRecommendation } from "../shared/scene-recommender.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("resonance-pipeline");

// ===========================================================================
// 辅助函数
// ===========================================================================

/** 生成预览文本 */
function generatePreview(summary: string | undefined): string {
  if (!summary) return "暂无预览";
  return summary.length > 50 ? summary.substring(0, 50) + "..." : summary;
}

/** 生成内容文本（用于存储） */
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

/**
 * 获取热点数据（从热点资产表查询，复用 custom 策略逻辑）
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
  } catch {
    // 无热点数据，使用空对象
  }

  return trends;
}

// ===========================================================================
// 核心管线
// ===========================================================================

/**
 * 生成共鸣故事脚本快照
 */
export async function generateResonanceScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {

  const count = 1; // 默认生成 1 个脚本
  const items: ScriptCandidateEntity[] = [];

  // 并行获取项目上下文、热点数据、场景推荐
  const [projectContext, hotTrends, sceneRecommendation] = await Promise.all([
    ctx.projectContextService.getProjectContext(project.id, {
      includeGarmentImages: true,
      includeCharacterFiveView: true,
    }),
    fetchHotTrends(ctx),
    getMergedSceneRecommendation(ctx.repos.sceneLibrary, {
      suitability: ["clothing", "lifestyle"],
      fallbackScenes: ["户外公园", "咖啡馆场景", "居家空间", "城市街头", "办公空间", "花艺工作室"],
    }),
  ]);

  const outfitDesc = projectContext.outfitDescription || undefined;
  const characterDesc = projectContext.characterDescription || undefined;
  const clothingStyles = projectContext.clothingStyles;
  const { characterDirection } = buildCharacterPromptFromProject(project);

  // 校验穿搭数据
  if (!outfitDesc || outfitDesc.trim().length === 0) {
    throw new Error("服饰描述为空，无法生成 resonance 脚本。请先完成服饰上传。");
  }
  if (!clothingStyles || clothingStyles.length === 0) {
    throw new Error("服饰风格为空，无法生成 resonance 脚本。请先完成穿搭方案选择。");
  }

  for (let i = 0; i < count; i++) {
    // 随机选择讲述者人格
    const personaIndex = i % STORYTELLER_PERSONAS.length;
    const persona = STORYTELLER_PERSONAS[personaIndex];

    // 阶段1：生成故事概念
    const concept = await generateResonanceConcept(
      ctx, user.id, persona, hotTrends,
      outfitDesc, characterDesc, clothingStyles, characterDirection,
      project.id,
    );

    if (!concept) {
      logger.warn({ scriptIndex: i + 1 }, "ResonancePipeline concept generation failed, skipping");
      continue;
    }

    // 匹配金标样本（用情绪弧线和人格专长构建近似 diversity 组合）
    const goldenExamples = await matchGoldenExamples(ctx, {
      narrativeStructure: "悬念递进",
      characterRelationship: "单人",
      coreEmotion: concept.emotionArc as any,
      visualStyle: "纪实抓拍",
      sceneStrategy: "多场景叙事",
      openingStyle: "动作冲击",
      endingStyle: "情绪升华",
    }, 2);
    const goldenExamplesText = formatGoldenExamplesForPrompt(goldenExamples);

    // 阶段2：基于概念展开完整脚本
    const payload = await expandConceptToScript(
      ctx, user.id, concept, persona,
      outfitDesc, characterDesc, clothingStyles, characterDirection,
      sceneRecommendation.sceneText || undefined,
      goldenExamplesText,
      project.id,
    );

    if (!payload) {
      logger.warn({ scriptIndex: i + 1 }, "ResonancePipeline script generation failed, skipping");
      continue;
    }

    const candidateId = randomUUID();
    const title = payload.video_info?.title ?? payload.video_analysis?.title ?? "共鸣故事脚本";
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
      strategyType: "resonance",
      title,
      preview,
      content,
      durationSec: payload.video_info?.duration_seconds ?? 25,
      suitability: "high",
      labels: [
        persona.specialty,
        concept.emotionArc,
        concept.personaName,
      ],
      storyboardSegments,
      mainScene: payload.video_info?.main_scene ?? extractMainSceneFromSegments(storyboardSegments),
      atmosphere: safeParseAtmosphere(payload.video_analysis?.atmosphere) ?? undefined,
      primaryEmotion: concept.emotionArc,
      videoStyle: persona.specialty,
      emotionArc: payload.video_analysis?.emotion?.emotion_arc,
      video_info: payload.video_info as Record<string, unknown> | undefined,
      video_analysis: payload.video_analysis as Record<string, unknown> | undefined,
      editing_analysis: payload.editing_analysis as Record<string, unknown> | undefined,
      shot_breakdown: payload.shot_breakdown as Array<Record<string, unknown>> | undefined,
    });
  }

  const snapshot: Step3ScriptCandidateSnapshot = {
    snapshotId: `resonance-${Date.now()}`,
    projectId: project.id,
    promptVersion: "resonance-v1",
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
