/**
 * 情感原型策略主入口
 *
 * 两段式生成流程：
 * 1. 第一段：生成3个故事大纲候选 → 自动评分 → 选最优
 * 2. 第二段：基于最优大纲生成详细分镜
 */

import { randomUUID } from "node:crypto";

import type { AppContext } from "../../../core/app-context.js";
import type { Project, User } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { EmotionArchetype, StoryOutline } from "./types.js";
import type { UsedArchetypes } from "./archetype-selector.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import type { Storyboard, StoryboardShot } from "../../../contracts/storyboard-contract.js";
import { EMOTION_ARCHETYPE_LIBRARY } from "./archetype-library.js";
import { selectEmotionArchetype } from "./archetype-selector.js";
import {
  buildOutlinePromptVariables,
  generateOutlineCandidates,
  selectBestOutline
} from "./outline-generator.js";
import {
  generateStoryboard
} from "./storyboard-generator.js";
import {
  validateStoryboard,
  validateClothingShowcase
} from "./storyboard-validator.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("emotion-archetype-generator");

/** 生成参数 */
export interface EmotionArchetypeGenerationParams {
  userId: string;
  characterDescription: string;
  outfitDescription: string;
  sessionMemory: UsedArchetypes;
  matchingReference?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo;
}

/** 生成结果 */
export interface EmotionArchetypeGenerationResult {
  success: boolean;
  storyboard?: Storyboard;
  archetype?: EmotionArchetype;
  outline?: StoryOutline;
  error?: string;
  metadata?: {
    stage1_candidates: number;
    stage1_best_score: number;
    stage2_validation_score: number;
    total_time_ms: number;
  };
}

/**
 * 情感原型策略生成（主函数）
 */
export async function generateEmotionArchetypeScript(
  ctx: AppContext,
  params: EmotionArchetypeGenerationParams,
  projectId?: string
): Promise<EmotionArchetypeGenerationResult> {
  const startTime = Date.now();

  try {
    // ========== 第一段：生成故事大纲 ==========

    // 1. 选择情感原型
    // 直接使用角色性别，禁止推断
    const characterGender = params.selectedRoleDirection?.gender;
    if (!characterGender || (characterGender !== "male" && characterGender !== "female")) {
      throw new Error("角色性别未设置，无法生成 emotion_archetype 脚本。请先在定妆步骤设置角色性别。");
    }
    const genderForFilter = characterGender;

    const archetype = selectEmotionArchetype(
      params.sessionMemory,
      { age: 25, gender: genderForFilter }, // TODO: age 应从 selectedRoleDirection.age 提取
      { style: "休闲" } // TODO: 从 clothingStyles 提取
    );


    // 2. 生成3个候选大纲（并发）
    const candidates = await generateOutlineCandidates(ctx, {
      userId: params.userId,
      archetype,
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      mustNotUseScenes: params.sessionMemory.usedScenes,
      mustNotUseEmotions: params.sessionMemory.usedEmotions,
      mustNotUsePhrases: params.sessionMemory.usedPhrases,
      temperature: 0.8,
      matchingReference: params.matchingReference,
      clothingStyles: params.clothingStyles,
      selectedRoleDirection: params.selectedRoleDirection,
    }, projectId);

    if (candidates.length === 0) {
      return {
        success: false,
        error: "Failed to generate any valid outline candidates"
      };
    }

    // 3. 选择最优大纲
    const bestResult = selectBestOutline(candidates, archetype, params.sessionMemory);


    // ========== 第二段：生成详细分镜 ==========

    // 4. 生成详细分镜
    const storyboard = await generateStoryboard(ctx, {
      userId: params.userId,
      archetype,
      outline: bestResult.outline,
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      mustNotUseScenes: params.sessionMemory.usedScenes,
      mustNotUseEmotions: params.sessionMemory.usedEmotions,
      mustNotUsePhrases: params.sessionMemory.usedPhrases,
      matchingReference: params.matchingReference,
      clothingStyles: params.clothingStyles,
      selectedRoleDirection: params.selectedRoleDirection,
    }, projectId);

    if (!storyboard) {
      return {
        success: false,
        error: "Failed to generate storyboard"
      };
    }

    // 7. 验证分镜质量
    const validation = validateStoryboard(storyboard, bestResult.outline, archetype);
    const clothingValidation = validateClothingShowcase(storyboard);


    if (!validation.pass) {
      log.warn({ validation, issues: validation.issues }, "EmotionArchetype validation failed");
    }

    // 8. 返回结果
    const totalTime = Date.now() - startTime;

    return {
      success: true,
      storyboard,
      archetype,
      outline: bestResult.outline,
      metadata: {
        stage1_candidates: candidates.length,
        stage1_best_score: bestResult.score,
        stage2_validation_score: validation.score,
        total_time_ms: totalTime
      }
    };
  } catch (error) {
    log.error({ err: error }, "EmotionArchetype generation failed");
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 更新会话记忆
 */
export function updateSessionMemory(
  memory: UsedArchetypes,
  archetype: EmotionArchetype,
  outline: StoryOutline
): UsedArchetypes {
  return {
    usedArchetypeIds: [...memory.usedArchetypeIds, archetype.id],
    usedScenes: [
      ...memory.usedScenes,
      ...outline.shots_outline.map(s => s.scene)
    ],
    usedEmotions: [
      ...memory.usedEmotions,
      ...outline.shots_outline.map(s => s.emotion)
    ],
    usedPhrases: memory.usedPhrases
  };
}

/**
 * 导出所有原型（用于调试/查看）
 */
export function getAllArchetypes(): EmotionArchetype[] {
  return EMOTION_ARCHETYPE_LIBRARY;
}

/**
 * 根据ID获取原型
 */
export function getArchetypeById(id: string): EmotionArchetype | undefined {
  return EMOTION_ARCHETYPE_LIBRARY.find(a => a.id === id);
}

/**
 * 生成情感原型脚本快照（与其他策略一致的接口）
 */
export async function generateEmotionArchetypeScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {

  const startTime = Date.now();

  // 初始化会话记忆（TODO: 从数据库加载）
  const sessionMemory: UsedArchetypes = {
    usedArchetypeIds: [],
    usedScenes: [],
    usedEmotions: [],
    usedPhrases: []
  };

  // 获取项目上下文
  const projectContext = await ctx.projectContextService.getProjectContext(project.id);
  const characterDescription = projectContext.characterDescription || undefined;
  const outfitDescription = projectContext.outfitDescription || undefined;
  const matchingReference = projectContext.matchingReference || undefined;
  const clothingStyles = projectContext.clothingStyles;
  const { characterDirection } = buildCharacterPromptFromProject(project);

  // 校验穿搭数据
  if (!outfitDescription || outfitDescription.trim().length === 0) {
    throw new Error("服饰描述为空，无法生成 emotion_archetype 脚本。请先完成服饰上传。");
  }
  if (!matchingReference || matchingReference.trim().length === 0) {
    throw new Error("搭配描述为空，无法生成 emotion_archetype 脚本。请先完成穿搭方案选择。");
  }
  if (!clothingStyles || clothingStyles.length === 0) {
    throw new Error("服饰风格为空，无法生成 emotion_archetype 脚本。请先完成穿搭方案选择。");
  }
  if (!characterDescription || characterDescription.trim().length === 0) {
    throw new Error("角色描述为空，无法生成 emotion_archetype 脚本。请先完成角色设置。");
  }

  // 调用主生成函数
  const result = await generateEmotionArchetypeScript(ctx, {
    userId: user.id,
    characterDescription,
    outfitDescription,
    sessionMemory,
    matchingReference,
    clothingStyles,
    selectedRoleDirection: characterDirection ?? undefined,
  }, project.id);

  if (!result.success || !result.storyboard) {
    throw new Error(result.error || "生成失败");
  }

  // 记录原型使用到运行日志
  if (result.archetype) {
    recordArchetypeUsage(ctx.repos, {
      archetypeId: result.archetype.id,
      archetypeName: result.archetype.name,
      projectId: project.id,
      success: true,
      durationMs: result.metadata?.total_time_ms,
    }).catch(err => {
      log.error({ err, projectId: project.id }, "EmotionArchetype failed to record usage");
    });
  }

  // 转换为 Snapshot 格式
  const snapshot = convertToSnapshot(result.storyboard, project.id);

  const totalTime = Date.now() - startTime;

  return snapshot;
}

/**
 * 将分镜转换为 Snapshot 格式
 * 修复：返回单个 item（包含完整 shot_breakdown），避免拆分成多条数据库记录
 */
function convertToSnapshot(
  storyboard: Storyboard,
  projectId: string
): Step3ScriptCandidateSnapshot {
  // 生成单个 candidateId，对应单条数据库记录
  const candidateId = randomUUID();

  // 构建单个 snapshot item，包含完整的 shot_breakdown 数组
  const item = {
    candidateId,
    sourceScriptId: `emotion-archetype-${randomUUID()}`,
    rank: 1,
    strategyType: "emotion_archetype" as const,
    title: storyboard.video_info?.title || "情感瞬间",
    preview: storyboard.video_analysis?.summary?.slice(0, 100) || storyboard.video_info?.title || "情感瞬间预览",
    content: storyboard.video_analysis?.summary || "",
    durationSec: storyboard.video_info?.duration_seconds || storyboard.shot_breakdown.reduce((sum, shot) => sum + (shot.duration_sec || 3), 0),
    suitability: null,
    labels: [],
    storyboardSegments: [],
    mainScene: storyboard.video_info?.main_scene || "",
    atmosphere: storyboard.video_analysis?.atmosphere || "",
    videoStyle: storyboard.video_analysis?.video_style || "纪实",
    primaryEmotion: storyboard.video_analysis?.emotion?.primary || "",
    emotionArc: storyboard.video_analysis?.emotion?.emotion_arc || "",
    scriptType: "情感瞬间",
    scriptStyle: storyboard.video_analysis?.video_style || "极简",
    video_info: storyboard.video_info,
    video_analysis: storyboard.video_analysis,
    editing_analysis: storyboard.editing_analysis,
    shot_breakdown: storyboard.shot_breakdown  // ✅ 完整数组，所有镜头
  };

  return {
    snapshotId: `emotion-archetype-${projectId}-${Date.now()}`,
    projectId,
    promptVersion: "emotion-archetype-v1",
    topNAtCreation: 1,  // 单个候选
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode: "emotion_archetype",
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items: [item] as unknown as Step3ScriptCandidateSnapshot["items"],
  };
}

/**
 * 记录原型使用到运行日志（通过 repo）
 */
async function recordArchetypeUsage(
  repos: { emotionArchetypeRunLogs: import("../../../repositories/pg/emotion-archetype-pg-repository.js").PgEmotionArchetypeRunLogRepository },
  params: {
    archetypeId: string;
    archetypeName: string;
    projectId: string;
    success: boolean;
    durationMs?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const now = Date.now();
  await repos.emotionArchetypeRunLogs.insertUsageLog({
    archetypeId: params.archetypeId,
    archetypeName: params.archetypeName,
    projectId: params.projectId,
    success: params.success,
    durationMs: params.durationMs,
    errorMessage: params.errorMessage,
    now,
  });
}
