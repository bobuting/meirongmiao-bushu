/**
 * 主题叙事策略主入口
 *
 * 三段串行生成流程：
 * 1. 第一段：热点×原型碰撞 → 故事主题
 * 2. 第二段：故事主题 → 完整大纲
 * 3. 第三段：大纲 → 详细分镜
 */

import { randomUUID } from "node:crypto";
import type { AppContext } from "../../../core/app-context.js";
import type { Project, User } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { Storyboard } from "../../../contracts/storyboard-contract.js";
import type { StoryThemeGenerationParams, StoryThemeGenerationResult } from "./types.js";

import { selectEmotionArchetypeFromDb, type UsedArchetypes } from "../step3-emotion-archetype/archetype-selector.js";
import { buildCharacterPromptFromProject, type CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { generateConcept, fetchLatestDailyReport } from "./concept-generator.js";
import { generateOutline } from "./outline-generator.js";
import { generateStoryboard } from "./storyboard-generator.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("story-theme-generator");

/**
 * 主题叙事策略生成（主函数）
 */
export async function generateStoryThemeScript(
  ctx: AppContext,
  params: StoryThemeGenerationParams,
  characterDirection?: CharacterDirectionInfo,
  projectId?: string,
): Promise<StoryThemeGenerationResult> {
  const startTime = Date.now();

  try {
    // ========== 第一段：主题构思 ==========

    // 1. 获取热点日报
    const dailyReport = await fetchLatestDailyReport(ctx.repos);
    if (!dailyReport) {
      throw new Error("无法获取热点日报，主题叙事策略依赖热点数据。请确认热点日报调度任务已运行。");
    }

    // 2. 选择情感原型（从数据库动态选择）
    const archetype = await selectEmotionArchetypeFromDb(
      { emotionArchetypeRepo: ctx.repos.emotionArchetypes },
      { usedArchetypeIds: [], usedScenes: params.mustNotUseScenes, usedEmotions: params.mustNotUseEmotions, usedPhrases: params.mustNotUsePhrases },
      { gender: characterDirection?.gender === "male" || characterDirection?.gender === "female" ? characterDirection.gender : undefined },
      { style: params.clothingStyles?.[0] }
    );

    // 3. 生成主题（热点 × 原型碰撞）
    const theme = await generateConcept(ctx, {
      userId: params.userId,
      archetype,
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      clothingStyles: params.clothingStyles,
      mustNotUseScenes: params.mustNotUseScenes,
      mustNotUseEmotions: params.mustNotUseEmotions,
      mustNotUsePhrases: params.mustNotUsePhrases,
    }, dailyReport, projectId);

    if (!theme) {
      return { success: false, error: "主题构思生成失败" };
    }

    log.info({ themeTitle: theme.theme_title, archetype: archetype.name }, "主题构思完成");

    // ========== 第二段：故事大纲 ==========

    const outline = await generateOutline(ctx, {
      userId: params.userId,
      theme,
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      mustNotUseScenes: params.mustNotUseScenes,
      mustNotUseEmotions: params.mustNotUseEmotions,
      mustNotUsePhrases: params.mustNotUsePhrases,
    }, projectId);

    if (!outline) {
      return { success: false, error: "故事大纲生成失败" };
    }

    log.info({ outlineId: outline.outline_id, shotCount: outline.shots_outline.length }, "故事大纲完成");

    // ========== 第三段：分镜展开 ==========

    const storyboard = await generateStoryboard(ctx, {
      userId: params.userId,
      theme,
      outline,
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      mustNotUseScenes: params.mustNotUseScenes,
      mustNotUseEmotions: params.mustNotUseEmotions,
      mustNotUsePhrases: params.mustNotUsePhrases,
    }, projectId);

    if (!storyboard) {
      return { success: false, error: "分镜展开生成失败" };
    }

    const totalTime = Date.now() - startTime;
    log.info({
      themeTitle: theme.theme_title,
      archetypeUsed: archetype.name,
      hotspotDate: dailyReport.reportDate,
      totalTimeMs: totalTime,
    }, "主题叙事策略生成完成");

    return {
      success: true,
      theme,
      outline,
      storyboardJson: storyboard as unknown as Record<string, unknown>,
      metadata: {
        total_time_ms: totalTime,
        archetype_used: archetype.name,
        hotspot_date: dailyReport.reportDate,
      },
    };
  } catch (error) {
    log.error({ err: error }, "主题叙事策略生成失败");
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 生成主题叙事脚本快照（与其他策略一致的接口）
 */
export async function generateStoryThemeScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  _user: User,
): Promise<Step3ScriptCandidateSnapshot> {
  // 获取项目上下文
  const projectContext = await ctx.projectContextService.getProjectContext(project.id);
  const characterDescription = projectContext.characterDescription || undefined;
  const outfitDescription = projectContext.outfitDescription || undefined;
  const matchingReference = projectContext.matchingReference || undefined;
  const clothingStyles = projectContext.clothingStyles;
  const { characterDirection } = buildCharacterPromptFromProject(project);

  // 校验必要数据
  if (!outfitDescription || outfitDescription.trim().length === 0) {
    throw new Error("服饰描述为空，无法生成 story_theme 脚本。请先完成服饰上传。");
  }
  if (!matchingReference || matchingReference.trim().length === 0) {
    throw new Error("搭配描述为空，无法生成 story_theme 脚本。请先完成穿搭方案选择。");
  }
  if (!characterDescription || characterDescription.trim().length === 0) {
    throw new Error("角色描述为空，无法生成 story_theme 脚本。请先完成角色设置。");
  }

  // 角色方向补充到角色描述
  const enrichedCharacter = characterDirection
    ? characterDescription + `\n角色方向：${characterDirection.styleWords.join("、")}`
    : characterDescription;

  // 风格补充到服饰描述
  const enrichedOutfit = clothingStyles?.length
    ? outfitDescription + `\n服饰风格：${clothingStyles.join("、")}`
    : outfitDescription;

  const sessionMemory: UsedArchetypes = {
    usedArchetypeIds: [],
    usedScenes: [],
    usedEmotions: [],
    usedPhrases: [],
  };

  const result = await generateStoryThemeScript(ctx, {
    userId: _user.id,
    characterDescription: enrichedCharacter,
    outfitDescription: enrichedOutfit,
    matchingReference,
    clothingStyles,
    mustNotUseScenes: sessionMemory.usedScenes,
    mustNotUseEmotions: sessionMemory.usedEmotions,
    mustNotUsePhrases: sessionMemory.usedPhrases,
  }, characterDirection ?? undefined, project.id);

  if (!result.success || !result.theme || !result.outline) {
    throw new Error(result.error || "生成失败");
  }

  return buildSnapshotFromResult(result, project.id);
}

/**
 * 从生成结果构建快照
 */
function buildSnapshotFromResult(
  result: StoryThemeGenerationResult,
  projectId: string,
): Step3ScriptCandidateSnapshot {
  const theme = result.theme;
  const outline = result.outline;
  if (!theme || !outline) {
    throw new Error("生成结果不完整：缺少主题或大纲数据");
  }
  const candidateId = randomUUID();
  const totalDuration = outline.shots_outline?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) ?? 0;

  const storyboardJson = result.storyboardJson as Record<string, unknown> | undefined;
  const item = {
    candidateId,
    sourceScriptId: `story-theme-${randomUUID()}`,
    rank: 1,
    strategyType: "story_theme" as const,
    title: theme.theme_title || "主题叙事脚本",
    preview: outline.story_summary?.slice(0, 100) || "",
    content: outline.story_summary || "",
    durationSec: totalDuration,
    suitability: null,
    labels: [],
    storyboardSegments: [],
    mainScene: outline.shots_outline?.[0]?.scene || "",
    atmosphere: theme.emotional_anchor?.target_emotion || "",
    videoStyle: "叙事",
    primaryEmotion: theme.emotional_anchor?.target_emotion || "",
    emotionArc: theme.emotional_anchor?.emotional_arc || "",
    scriptType: "主题叙事",
    scriptStyle: "故事驱动",
    // 分镜完整数据
    video_info: storyboardJson?.video_info,
    video_analysis: storyboardJson?.video_analysis,
    editing_analysis: storyboardJson?.editing_analysis,
    shot_breakdown: storyboardJson?.shot_breakdown,
  };

  return {
    snapshotId: `story-theme-${projectId}-${Date.now()}`,
    projectId,
    promptVersion: "story-theme-v1",
    topNAtCreation: 1,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode: "story_theme",
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items: [item] as unknown as Step3ScriptCandidateSnapshot["items"],
  };
}
