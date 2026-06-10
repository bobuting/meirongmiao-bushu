/**
 * 主题构思生成器（第一段）
 * 将热点日报与情感原型碰撞，生成故事主题
 */

import type { AppContext } from "../../../core/app-context.js";
import type { EmotionArchetype } from "../step3-emotion-archetype/types.js";
import type { StoryTheme } from "./types.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { skillLoader, buildPromptVariables } from "../../../services/skills/index.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("story-theme-concept");

const SKILL_CODE = "story_theme_concept";

/** 主题构思参数 */
export interface ConceptGenerationParams {
  userId: string;
  archetype: EmotionArchetype;
  characterDescription: string;
  outfitDescription: string;
  clothingStyles?: string[];
  mustNotUseScenes: string[];
  mustNotUseEmotions: string[];
  mustNotUsePhrases: string[];
}

/** 热点日报数据 */
export interface DailyReportData {
  coreTrends: string[];
  emotionAtmosphere: string[];
  creativeSuggestions: string[];
  rawReportText: string;
  reportDate: string;
}

/**
 * 从数据库获取最近的热点日报（通过 repo）
 */
export async function fetchLatestDailyReport(repos: { hotTrendDailyReports: import("../../../repositories/pg/hot-trend-daily-report-pg-repository.js").PgHotTrendDailyReportRepository }): Promise<DailyReportData | null> {
  try {
    const row = await repos.hotTrendDailyReports.findLatest();
    if (!row) {
      log.warn("无可用热点日报");
      return null;
    }

    return {
      coreTrends: row.core_trends ?? [],
      emotionAtmosphere: row.emotion_atmosphere ?? [],
      creativeSuggestions: row.creative_suggestions ?? [],
      rawReportText: row.raw_report_text ?? "",
      reportDate: row.report_date,
    };
  } catch (error) {
    log.error({ err: error }, "获取热点日报失败");
    return null;
  }
}

/**
 * 生成故事主题（第一段）
 */
export async function generateConcept(
  ctx: AppContext,
  params: ConceptGenerationParams,
  dailyReport: DailyReportData,
  projectId?: string,
): Promise<StoryTheme | null> {
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_STORY_THEME_CONCEPT);
  if (!provider) {
    log.error({ routeKey: ProviderRouteKeys.STEP3_STORY_THEME_CONCEPT }, "未配置 LLM provider");
    return null;
  }

  try {
    const variables = buildPromptVariables({
      coreTrends: dailyReport.coreTrends,
      emotionAtmosphere: dailyReport.emotionAtmosphere,
      creativeSuggestions: dailyReport.creativeSuggestions,
      rawReportText: dailyReport.rawReportText.slice(0, 3000),
      archetypeId: params.archetype.id,
      archetypeName: params.archetype.name,
      archetypeEmotionCore: params.archetype.emotionCore,
      archetypeConflict: params.archetype.conflict,
      characterDescription: params.characterDescription,
      outfitDescription: params.outfitDescription,
      clothingStyles: params.clothingStyles,
      duration: "20-60秒",
      shotCount: 8,
      mustNotUseScenes: params.mustNotUseScenes.length > 0 ? params.mustNotUseScenes.join("、") : undefined,
      mustNotUseEmotions: params.mustNotUseEmotions.length > 0 ? params.mustNotUseEmotions.join("、") : undefined,
      mustNotUsePhrases: params.mustNotUsePhrases.length > 0 ? params.mustNotUsePhrases.map(p => `"${p}"`).join("、") : undefined,
    });

    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(SKILL_CODE, { variables });

    const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, 0.85, {
      ctx,
      userId: params.userId,
      routeKey: ProviderRouteKeys.STEP3_STORY_THEME_CONCEPT,
      businessContext: "Step3 主题叙事-主题构思（阶段1）",
      projectId: projectId ?? "",
    });

    return parseConceptJson(response);
  } catch (error) {
    log.error({ err: error, routeKey: ProviderRouteKeys.STEP3_STORY_THEME_CONCEPT }, "主题构思 LLM 调用失败");
    return null;
  }
}

/**
 * 解析主题构思 JSON
 */
function parseConceptJson(jsonText: string): StoryTheme | null {
  const parsed = extractJsonObject(jsonText);
  if (!parsed) {
    const snippet = jsonText.trim().slice(0, 500);
    log.error({ routeKey: ProviderRouteKeys.STEP3_STORY_THEME_CONCEPT }, `解析主题 JSON 失败. Raw: ${snippet}`);
    return null;
  }
  return parsed as unknown as StoryTheme;
}
