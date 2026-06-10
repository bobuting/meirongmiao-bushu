/**
 * 故事大纲生成器（第一段）
 */

import type { AppContext } from "../../../core/app-context.js";
import type { EmotionArchetype, StoryOutline, OutlineScore } from "./types.js";
import type { UsedArchetypes } from "./archetype-selector.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { skillLoader, buildPromptVariables } from "../../../services/skills/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("outline-generator");

/** Skills 提示词代码 */
const SKILL_CODE_EMOTION_ARCHETYPE_OUTLINE = "emotion_archetype_outline";

/** 大纲生成参数 */
export interface OutlineGenerationParams {
  userId: string;
  archetype: EmotionArchetype;
  characterDescription: string;
  outfitDescription: string;
  mustNotUseScenes: string[];
  mustNotUseEmotions: string[];
  mustNotUsePhrases: string[];
  temperature: number;
  matchingReference?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo;
}

/**
 * 构建大纲生成提示词变量（供 Skills 系统渲染）
 */
export async function buildOutlinePromptVariables(params: OutlineGenerationParams): Promise<Record<string, unknown>> {
  const {
    archetype,
    characterDescription,
    outfitDescription,
    mustNotUseScenes,
    mustNotUseEmotions,
    mustNotUsePhrases,
    matchingReference,
    clothingStyles,
    selectedRoleDirection,
  } = params;

  // 角色方向描述（不含 styleSummary）
  const roleDirectionHint = selectedRoleDirection
    ? `\n**角色方向**：${selectedRoleDirection.styleWords.length > 0 ? `关键词：${selectedRoleDirection.styleWords.join("、")}` : ""}`
    : "";

  // 搭配描述
  const matchingHint = matchingReference
    ? `\n**搭配描述**：${matchingReference}`
    : "";

  // 服饰风格
  const styleHint = clothingStyles?.length
    ? `\n**服饰风格**：${clothingStyles.join("、")}，场景选择应与服饰风格自然匹配`
    : "";

  return buildPromptVariables({
    archetypeId: archetype.id,
    archetypeName: archetype.name,
    emotionCore: archetype.emotionCore,
    moment: archetype.moment,
    conflict: archetype.conflict,
    clothingRole: archetype.clothingRole,
    visualCues: archetype.visualCues.join("、"),
    duration: archetype.duration,
    shotCount: archetype.shotCount,
    syncMode: archetype.syncMode,
    characterDescription: characterDescription + roleDirectionHint,
    outfitDescription: outfitDescription + matchingHint + styleHint,
    mustNotUseScenes: mustNotUseScenes.length > 0 ? mustNotUseScenes.join("、") : undefined,
    mustNotUseEmotions: mustNotUseEmotions.length > 0 ? mustNotUseEmotions.join("、") : undefined,
    mustNotUsePhrases: mustNotUsePhrases.length > 0 ? mustNotUsePhrases.map(p => `"${p}"`).join("、") : undefined,
  });
}

/**
 * 解析LLM返回的大纲JSON，使用 extractJsonObject 提供更好的容错能力
 */
export function parseOutlineJson(jsonText: string): StoryOutline | null {
  const parsed = extractJsonObject(jsonText);
  if (!parsed) {
    const snippet = jsonText.trim().slice(0, 500);
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_OUTLINE },
      `解析大纲 JSON 失败. Raw snippet: ${snippet}`
    );
    return null;
  }
  return parsed as unknown as StoryOutline;
}

/**
 * 评分大纲质量
 */
export function scoreOutline(
  outline: StoryOutline,
  archetype: EmotionArchetype,
  usedArchetypes: UsedArchetypes
): OutlineScore {
  let score = 100;
  const reasons: string[] = [];

  // 1. 检查情感弧线是否符合（40分）
  if (outline.emotion_arc !== archetype.emotionCore) {
    score -= 40;
    reasons.push(`情感弧线不符：期望「${archetype.emotionCore}」，实际「${outline.emotion_arc}」`);
  }

  // 2. 检查冲突是否明确（30分）
  if (!outline.conflict_description || outline.conflict_description.length < 10) {
    score -= 30;
    reasons.push("冲突描述不明确或过短");
  }

  // 3. 检查服饰角色是否清晰（20分）
  const clothingMentions = outline.shots_outline.filter(
    s => s.clothing_role && s.clothing_role.length > 5
  ).length;
  const clothingRatio = clothingMentions / outline.shots_outline.length;
  if (clothingRatio < 0.6) {
    score -= 20;
    reasons.push(`服饰角色不够清晰（${clothingMentions}/${outline.shots_outline.length}个镜头有描述）`);
  }

  // 4. 检查同步点是否存在（10分）
  const syncPointMissing = outline.shots_outline.filter(
    s => !s.sync_point || s.sync_point.length < 5
  ).length;
  if (syncPointMissing > 0) {
    score -= 10;
    reasons.push(`${syncPointMissing}个镜头缺少同步点`);
  }

  // 5. 检查场景是否重复使用（扣分项）
  const firstScene = outline.shots_outline[0]?.scene;
  if (firstScene && usedArchetypes.usedScenes.includes(firstScene)) {
    score -= 10;
    reasons.push(`场景「${firstScene}」已使用过`);
  }

  return {
    outline,
    score,
    reasons
  };
}

/**
 * 生成多个候选大纲（并发）
 */
export async function generateOutlineCandidates(
  ctx: AppContext,
  params: OutlineGenerationParams,
  projectId?: string
): Promise<OutlineScore[]> {
  // 获取 provider
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_OUTLINE);
  if (!provider) {
    logger.error(
      { routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_OUTLINE },
      "未配置 LLM provider"
    );
    return [];
  }

  const candidateCount = 3;
  const results: OutlineScore[] = [];

  // 并发生成3个候选
  const promises = Array.from({ length: candidateCount }, async (_, i) => {
    try {
      // 使用 Skills 系统构建提示词
      const variables = await buildOutlinePromptVariables(params);
      const { system: systemPrompt, user: userPrompt } = await skillLoader.render(SKILL_CODE_EMOTION_ARCHETYPE_OUTLINE, {
        variables,
      });

      // 使用大纲生成路由键
      const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, params.temperature, {
        ctx,
        userId: params.userId,
        routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_OUTLINE,
        businessContext: `Step3 情感原型大纲生成（候选${i + 1}）`,
        projectId: projectId ?? "",
        maxTokens: 8192,
      });

      const outline = parseOutlineJson(response);
      if (!outline) {
        logger.error(
          { routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_OUTLINE },
          `候选 ${i + 1} JSON 解析失败`
        );
        return null;
      }

      // 评分
      const scored = scoreOutline(outline, params.archetype, {
        usedArchetypeIds: [],
        usedScenes: params.mustNotUseScenes,
        usedEmotions: params.mustNotUseEmotions,
        usedPhrases: params.mustNotUsePhrases
      });

      return scored;
    } catch (error) {
      logger.error(
        { err: error, routeKey: ProviderRouteKeys.STEP3_EMOTION_ARCHETYPE_OUTLINE },
        `候选 ${i + 1} LLM 调用失败`
      );
      return null;
    }
  });

  const settled = await Promise.all(promises);

  // 过滤掉失败的候选
  for (const result of settled) {
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * 选择最佳大纲
 */
export function selectBestOutline(
  scoredOutlines: OutlineScore[],
  archetype: EmotionArchetype,
  usedArchetypes: UsedArchetypes
): OutlineScore {
  // 按分数排序
  const sorted = [...scoredOutlines].sort((a, b) => b.score - a.score);

  const best = sorted[0];
  if (best.reasons.length > 0) {
  }

  return best;
}
