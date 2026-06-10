/**
 * 金标脚本样本匹配服务
 * 从 nrm_golden_script_examples 表中按 Story DNA 维度匹配高质量样本
 * 用于在脚本生成时作为质量锚点注入提示词
 */

import type { AppContext } from "../core/app-context.js";
import { getLogger } from "../core/logger/index.js";
import type { DiversityCombination } from "./video-step/step3-custom-script/types.js";

const log = getLogger("golden-example-service");

/** 金标脚本样本（数据库行映射） */
export interface GoldenScriptExample {
  id: string;
  title: string;
  storyConcept: string;
  narrativeTechnique: string;
  characterDynamic: string;
  coreEmotion: string;
  sceneType: string | null;
  tags: string[];
  qualityScore: number;
}

/** 格式化金标样本为提示词文本 */
function formatGoldenExample(example: GoldenScriptExample): string {
  return `### ${example.title}
- 叙事手法：${example.narrativeTechnique}
- 人物关系：${example.characterDynamic}
- 情感方向：${example.coreEmotion}
- 故事梗概：${example.storyConcept}`;
}

/**
 * 匹配金标样本
 * 按 narrativeTechnique 和 characterDynamic 优先匹配
 * @param diversity 当前 Story DNA 组合
 * @param limit 返回数量上限
 * @returns 匹配的金标样本列表
 */
export async function matchGoldenExamples(
  ctx: AppContext,
  diversity: DiversityCombination,
  limit: number,
): Promise<GoldenScriptExample[]> {
  try {
    // 精确匹配 narrativeTechnique + characterDynamic
    const exact = await ctx.repos.scriptData.findGoldenExamplesExactMatch(
      diversity.narrativeStructure, diversity.characterRelationship, limit,
    );

    if (exact.length >= limit) {
      return exact.map(mapRow);
    }

    // 放宽匹配：只匹配 narrativeTechnique
    const relaxed = await ctx.repos.scriptData.findGoldenExamplesRelaxedMatch(
      diversity.narrativeStructure,
      exact.map((r: Record<string, unknown>) => r.id as string),
      limit - exact.length,
    );

    const combined = [...exact, ...relaxed];
    if (combined.length >= limit) {
      return combined.slice(0, limit).map(mapRow);
    }

    // 兜底：随机取高质量样本
    const fallback = await ctx.repos.scriptData.findGoldenExamplesFallback(
      combined.map((r: Record<string, unknown>) => r.id as string),
      limit - combined.length,
    );

    return [...combined, ...fallback].map(mapRow);
  } catch (error) {
    log.warn({ error }, "[GoldenExampleService] Failed to match golden examples");
    return [];
  }
}

/** 格式化金标样本列表为提示词锚定段 */
export function formatGoldenExamplesForPrompt(examples: GoldenScriptExample[]): string {
  if (examples.length === 0) return "";
  return examples.map(formatGoldenExample).join("\n\n");
}

/** 数据库行映射 */
function mapRow(row: Record<string, unknown>): GoldenScriptExample {
  return {
    id: row.id as string,
    title: row.title as string,
    storyConcept: row.story_concept as string,
    narrativeTechnique: row.narrative_technique as string,
    characterDynamic: row.character_dynamic as string,
    coreEmotion: row.core_emotion as string,
    sceneType: (row.scene_type as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    qualityScore: (row.quality_score as number) ?? 5,
  };
}
