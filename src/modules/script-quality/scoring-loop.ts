/**
 * 评分闭环服务
 *
 * 负责三件事：
 * 1. 库存脚本评分过滤（library 策略按评分排序/过滤低分）
 * 2. 低分脚本淘汰（标记 quality_status = deprecated）
 * 3. 弱项反馈注入（从 metrics 获取 commonWeaknesses 供脚本生成使用）
 *
 * 所有功能由 ScoringLoopConfig.enabled 总开关控制。
 * 配置通过 businessConfigService 动态读取，支持管理后台实时调整。
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { ScoringLoopConfig } from "../../contracts/business-config-contract.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("scoring-loop");

/** 脚本质量状态 */
export type ScriptQualityStatus = "active" | "deprecated" | "unrated";

// ==================== 库存脚本评分过滤 ====================

/**
 * 查询库存脚本评分数据，返回脚本ID → 评分的映射
 * 只查询非 deprecated 状态的脚本
 */
export async function getLibraryScriptScores(
  repos: PgRepositoryCollection,
  scriptIds: string[],
  config: ScoringLoopConfig,
): Promise<Map<string, number>> {
  if (!config.enabled || scriptIds.length === 0) {
    return new Map();
  }

  const recordMap = await repos.scriptQualityScores.findLatestByScriptIds(scriptIds);
  const scoreMap = new Map<string, number>();
  for (const [id, record] of recordMap) {
    scoreMap.set(id, record.score);
  }
  return scoreMap;
}

/**
 * 过滤低分库存脚本：只保留评分 >= minScoreForLibrary 的脚本
 * 未评分的脚本不受影响（保留原样）
 */
export function filterByScore(
  scriptIds: string[],
  scoreMap: Map<string, number>,
  minScore: number,
): string[] {
  return scriptIds.filter((id) => {
    const score = scoreMap.get(id);
    // 未评分的脚本保留（可能还没被评分守护进程处理）
    if (score === undefined) return true;
    return score >= minScore;
  });
}

/**
 * 查询已标记为 deprecated 的脚本 ID，供 library 筛选排除
 */
export async function getDeprecatedScriptIds(
  repos: PgRepositoryCollection,
  config: ScoringLoopConfig,
): Promise<Set<string>> {
  if (!config.enabled) {
    return new Set();
  }

  return repos.scriptData.findDeprecatedIds();
}

// ==================== 低分脚本淘汰 ====================

/**
 * 评分完成后，根据分数标记脚本质量状态
 * - score >= minScoreForLibrary → active（进入 library 推荐池）
 * - score < deprecationThreshold → deprecated（淘汰，不进入推荐池）
 * - 介于两者之间 → active（标记为有效，但被 library filterByScore 过滤，不进入推荐池）
 */
export async function markScriptQualityStatus(
  repos: PgRepositoryCollection,
  scriptDataId: string,
  score: number,
  config: ScoringLoopConfig,
): Promise<void> {
  if (!config.enabled) return;

  let status: ScriptQualityStatus;
  if (score < config.deprecationThreshold) {
    status = "deprecated";
    log.info({ scriptDataId, score, threshold: config.deprecationThreshold }, "脚本标记为 deprecated");
  } else {
    status = "active";
  }

  await repos.scriptData.updateQualityStatus(scriptDataId, status);
}

// ==================== 弱项反馈注入 ====================

/**
 * 查询指定策略的 commonWeaknesses 和 commonSuggestions
 * 用于注入脚本生成 Skill 的 user prompt
 *
 * 查询逻辑：优先从 nrm_prompt_version_metrics 按 promptCode 查询；
 * 若 promptCode 为 null（如 library 策略），则直接从 nrm_script_quality_scores 按 strategy 聚合。
 */
export async function getWeaknessFeedbackForStrategy(
  repos: PgRepositoryCollection,
  promptCode: string | null,
  config: ScoringLoopConfig,
  strategy?: string,
): Promise<{ weaknesses: string[]; suggestions: string[] } | null> {
  // weaknessFeedbackEnabled 独立控制弱项反馈注入，不依赖 scoring_loop.enabled
  // 因为弱项反馈来源于历史评分数据，即使评分闭环未启用也可能有历史数据
  if (!config.weaknessFeedbackEnabled) {
    return null;
  }

  // 有 promptCode 时，从 nrm_prompt_version_metrics 查询
  if (promptCode) {
    const metrics = await repos.promptVersionMetrics.findLatestByPromptCode(promptCode);

    if (metrics && (metrics.commonWeaknesses.length > 0 || metrics.commonSuggestions.length > 0)) {
      return {
        weaknesses: metrics.commonWeaknesses,
        suggestions: metrics.commonSuggestions,
      };
    }
  }

  // promptCode 为 null 或 metrics 表无数据时，从 nrm_script_quality_scores 按 strategy 直接聚合
  if (strategy) {
    const weaknesses = await repos.scriptQualityScores.aggregateWeaknessesByStrategy(strategy);
    const suggestions = await repos.scriptQualityScores.aggregateSuggestionsByStrategy(strategy);

    if (weaknesses.length > 0 || suggestions.length > 0) {
      return { weaknesses, suggestions };
    }
  }

  return null;
}

/**
 * 构建弱项反馈提示词片段，注入到脚本生成 Skill 的 user prompt 中
 */
export function buildWeaknessFeedbackPrompt(
  feedback: { weaknesses: string[]; suggestions: string[] },
): string {
  const parts: string[] = [];

  if (feedback.weaknesses.length > 0) {
    parts.push(
      `【历史评分弱项（请避免以下问题）】\n` +
      feedback.weaknesses.map((w, i) => `${i + 1}. ${w}`).join("\n"),
    );
  }

  if (feedback.suggestions.length > 0) {
    parts.push(
      `【历史改进建议（请参考以下方向）】\n` +
      feedback.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    );
  }

  return parts.join("\n\n");
}