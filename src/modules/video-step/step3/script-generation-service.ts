/**
 * Step3 脚本生成核心服务
 * 五阶段流水线编排器：
 *   阶段1：输入解析
 *   阶段2：热点深度分析
 *   阶段3：[已移除] 角色形象分析（暂不使用，使用空报告替代）
 *   阶段4：脚本创作
 *   阶段5：质量检查（不通过则重试阶段4）
 *   阶段6：输出交付
 *
 * 核心要求：角色信息在生成脚本时是重点部分，不能遗漏或歪曲
 */

import type { AppContext } from "../../../core/app-context.js";
import type {
  Step3ScriptGenerationResult,
  Step3ScriptGenerationRequest,
  Step3ScriptGenerationSnapshotResult,
  Step3ScriptResult,
} from "./types.js";
import { ProviderRouteKeys, type ProviderRouteKey } from "../../../contracts/provider-route-keys.js";
import {
  stage1_parseInput,
  stage2_analyzeHotspots,
  stage4_createScripts,
  stage5_validateScripts,
  stage6_formatOutput,
} from "./stages/index.js";
import type { Stage5Result } from "./stages/index.js";
import type { HotspotAnalysisReport, CharacterAnalysisReport } from "./types.js";
import type { STAGE1_RESULT } from "../../../contant-config/shared_dict.js";
import { resolveRouteProvider, type ResolvedRouteProvider } from "../../../services/llm/llm-transport.js";
import { createEmptyCharacterAnalysisReport } from "./character-report-helper.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("llm-transport");

/**
 * 默认热点数量
 */
const DEFAULT_HOTSPOT_LIMIT = 50;

/**
 * LLM Provider路由键
 */
const LLM_ROUTE_KEY = ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION;

/**
 * 脚本创作最大重试次数（已禁用重试，始终为 0）
 */
const MAX_SCRIPT_RETRY = 0;

/**
 * 创建LLM请求依赖
 */
function createLlmDeps(
  ctx: AppContext,
  provider: ResolvedRouteProvider | null,
  projectId: string,
  userId: string,
  stage: string,
  routeKey: ProviderRouteKey = ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION,
) {
  return {
    requestLlmPlainText: async (systemPrompt: string, userPrompt: string, temperature: number): Promise<string> => {
      if (!provider) {
        logger.warn({ routeKey }, "No LLM provider available");
        throw new Error("No LLM provider available");
      }

      const { requestLlmPlainText } = await import("../../../services/llm/llm-transport.js");
      return requestLlmPlainText(provider, systemPrompt, userPrompt, temperature, {
        ctx,
        routeKey,
        userId,
        businessContext: `Step3 脚本生成 - ${stage}`,
        projectId,
      });
    },
  };
}

/**
 * 执行阶段4和阶段5（无重试）
 */
async function executeStage4And5WithRetry(
  ctx: AppContext,
  hotspotReport: HotspotAnalysisReport,
  characterReport: CharacterAnalysisReport,
  characterReference: STAGE1_RESULT["characterReference"],
  scriptCount: number,
  llmProvider: ResolvedRouteProvider | null,
  projectId: string,
  userId: string,
  characterDescription?: string,
  outfitModules?: STAGE1_RESULT["outfitModules"],
  clothingStyles?: string[],
  outfitDescription?: string,
  matchingReference?: string,
  selectedRoleDirection?: STAGE1_RESULT["selectedRoleDirection"],
  maxRetry: number = MAX_SCRIPT_RETRY,
): Promise<Stage5Result> {
  // 不再重试，只执行一次
  // 阶段4：脚本创作 - 创建带日志功能的 llmDeps
  const stage4LlmDeps = createLlmDeps(ctx, llmProvider, projectId, userId, "stage4");
  const stage4Start = Date.now();
  const currentScripts = await stage4_createScripts(
    {
      hotspotReport,
      characterReport,
      characterReference,
      characterImageUrl: characterReference.imageUrl,
      characterDescription,
      outfitModules,
      clothingStyles,
      outfitDescription,
      matchingReference,
      selectedRoleDirection,
      scriptCount,
    },
    ctx,
    ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION,
    userId,
    stage4LlmDeps,
  );

  // 阶段5：质量检查
  const stage5Start = Date.now();
  const stage5Result = stage5_validateScripts(currentScripts, characterReference);

  // 直接返回结果，不再重试
  if (!stage5Result.overallPassed) {
    logger.warn(
      { routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION },
      "Quality check failed, but retry is disabled"
    );
    stage5Result.genderValidationReports.forEach((report, i) => {
      if (!report.passed) {
        logger.warn(
          { routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION },
          `Script ${i + 1} gender violations: ${report.violations.join(", ")}`
        );
      }
    });
    stage5Result.ironLawsValidationReports.forEach((report, i) => {
      if (!report.passed) {
        logger.warn(
          { routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION },
          `Script ${i + 1} iron law violations: ${report.violations.join(", ")}`
        );
      }
    });
  }

  return stage5Result;
}

// =====================================================
// 六阶段流水线主入口
// =====================================================

/**
 * Step3 脚本生成主入口（六阶段流水线）
 * 返回完整的 Step3ScriptCandidateSnapshot 格式，可直接持久化
 */
export async function generateStep3ScriptsSnapshot(
  ctx: AppContext,
  projectId: string,
  request: Step3ScriptGenerationRequest = {},
): Promise<Step3ScriptGenerationSnapshotResult> {
  const startTime = Date.now();

  // 获取LLM Provider
  const llmProvider = await resolveRouteProvider(ctx, LLM_ROUTE_KEY);
  if (llmProvider) {
  } else {
    logger.warn(
      { routeKey: LLM_ROUTE_KEY },
      `No LLM provider found for route key: ${LLM_ROUTE_KEY}`
    );
  }

  try {
    // ===== 阶段1：输入解析 =====
    const stage1Start = Date.now();
    const project = await ctx.repos.projects.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const userId = project.userId;

    const stage1Result = await stage1_parseInput(
      ctx,
      projectId,
      DEFAULT_HOTSPOT_LIMIT || request.hotspotLimit || 50,
      createLlmDeps(ctx, llmProvider, projectId, userId, "stage1"),
    );

    // ===== 阶段2：热点深度分析（使用独立的 provider） =====
    const stage2Start = Date.now();
    const hotspotProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS);
    const stage2Result = await stage2_analyzeHotspots(
      stage1Result.hotspots,
      ctx,
      userId,
      {
        requestLlmPlainText: createLlmDeps(ctx, hotspotProvider ?? llmProvider, projectId, userId, "stage2", ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS).requestLlmPlainText,
        dailyReportEnabled: ctx.store.config.hotTrendDailyReportEnabled,
      },
    );

    // 使用空角色报告代替 Stage3 结果（Stage3 已移除）
    const stage3Result = createEmptyCharacterAnalysisReport(
      stage1Result.characterReference,
      stage1Result.characterDescription,
    );

    // ===== 阶段4 & 阶段5：脚本创作 + 质量检查（带重试）=====
    const stage45Start = Date.now();
    const stage5Result = await executeStage4And5WithRetry(
      ctx,
      stage2Result,
      stage3Result,
      stage1Result.characterReference,
      1, // scriptCount
      llmProvider,
      projectId,
      userId,
      stage1Result.characterDescription,
      stage1Result.outfitModules,
      stage1Result.clothingStyles,
      stage1Result.outfitDescription,
      stage1Result.matchingReference,
      stage1Result.selectedRoleDirection,
    );

    // ===== 阶段6：输出交付 =====
    const stage6Start = Date.now();
    const snapshot = stage6_formatOutput(stage5Result.validatedScripts, projectId);

    const totalTime = Date.now() - startTime;

    return { snapshot };
  } catch (error) {
    logger.error(
      { err: error, routeKey: LLM_ROUTE_KEY },
      "Pipeline failed"
    );
    throw error;
  }
}

/**
 * Step3 脚本生成（返回详细结果，用于调试）
 */
export async function generateStep3Scripts(
  ctx: AppContext,
  projectId: string,
  request: Step3ScriptGenerationRequest = {},
): Promise<Step3ScriptGenerationResult> {

  const startTime = Date.now();

  // 获取LLM Provider
  const llmProvider = await resolveRouteProvider(ctx, LLM_ROUTE_KEY);

  // 获取项目以获取 userId
  const project = await ctx.repos.projects.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const userId = project.userId;

  // 阶段1：输入解析
  const stage1Result = await stage1_parseInput(
    ctx,
    projectId,
    request.hotspotLimit || DEFAULT_HOTSPOT_LIMIT,
    createLlmDeps(ctx, llmProvider, projectId, userId, "stage1"),
  );

  // 阶段2：热点深度分析（使用独立的 provider）
  const hotspotProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS);
  const hotspotReport = await stage2_analyzeHotspots(
    stage1Result.hotspots,
    ctx,
    userId,
    {
      requestLlmPlainText: createLlmDeps(ctx, hotspotProvider ?? llmProvider, projectId, userId, "stage2", ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS).requestLlmPlainText,
      dailyReportEnabled: ctx.store.config.hotTrendDailyReportEnabled,
    },
  );

  // 使用空角色报告代替 Stage3 结果
  const characterReport = createEmptyCharacterAnalysisReport(
    stage1Result.characterReference,
    stage1Result.characterDescription,
  );

  // 阶段4 & 阶段5：脚本创作 + 质量检查（带重试）
  const stage5Result = await executeStage4And5WithRetry(
    ctx,
    hotspotReport,
    characterReport,
    stage1Result.characterReference,
    1, // scriptCount
    llmProvider,
    projectId,
    userId,
    stage1Result.characterDescription,
    stage1Result.outfitModules,
    stage1Result.clothingStyles,
  );


  return {
    scripts: stage5Result.validatedScripts,
    analysisReport: {
      hotspotAnalysis: hotspotReport,
      characterAnalysis: characterReport,
    },
  };
}

// =====================================================
// 导出类型
// =====================================================

export type { Step3ScriptGenerationResult, Step3ScriptGenerationRequest, Step3ScriptGenerationSnapshotResult };
