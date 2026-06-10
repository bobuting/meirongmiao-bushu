/**
 * Step4 视频提示词优化服务
 *
 * 在分镜视频重试前，调用 LLM 分析提示词问题并优化。
 * 优化记录持久化到 nrm_step4_prompt_refinements，供后续改进 shot_prompt_engineer 参考。
 */

import type { AppContext } from "../core/app-context.js";
import { getLogger } from "../core/logger/index.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../services/llm/provider-resolver.js";
import { requestLlmPlainText } from "../services/llm/llm-transport.js";
import { SkillLoader } from "../services/skills/skill-loader.js";

const log = getLogger("step4-prompt-refiner");

const SKILL_CODE = "video_prompt_refiner";
const MAX_REFINEMENT_RETRIES = 3;

export interface RefinePromptInput {
  originalPrompt: string;
  errorMessage?: string | null;
  projectId: string;
  sceneIndex: number;
  retryCount: number;
}

export interface RefinePromptResult {
  refinedPrompt: string;
  needsRefinement: boolean;
  analysis: string;
  changesSummary: string;
}

/**
 * 分析并优化视频提示词
 *
 * 仅在重试时调用（clipGeneration > 0）。
 * 超过 MAX_REFINEMENT_RETRIES 次后不再优化，直接使用原提示词。
 */
export async function refineStep4Prompt(
  ctx: AppContext,
  input: RefinePromptInput,
): Promise<RefinePromptResult> {
  const { originalPrompt, errorMessage, retryCount } = input;

  // 超过最大优化次数，直接返回原提示词
  if (retryCount > MAX_REFINEMENT_RETRIES) {
    log.info({ sceneIndex: input.sceneIndex, retryCount }, "超过最大优化次数，跳过提示词优化");
    return {
      refinedPrompt: originalPrompt,
      needsRefinement: false,
      analysis: `已优化 ${MAX_REFINEMENT_RETRIES} 次，跳过本次优化`,
      changesSummary: "",
    };
  }

  // 解析 RouteKey 和 Provider
  const routeKey = ProviderRouteKeys.STEP4_PROMPT_REFINER;
  const provider = await resolveRouteProvider(ctx, routeKey);
  if (!provider) {
    throw new Error(`提示词优化 Provider 未配置 (routeKey: ${routeKey})，无法执行重试优化流程`);
  }

  // 渲染 Skill 模板
  const skillLoader = new SkillLoader();
  const { system, user } = await skillLoader.render(SKILL_CODE, {
    originalPrompt,
    errorMessage: errorMessage ?? "",
    sceneDescription: await resolveSceneDescription(ctx, input.projectId, input.sceneIndex),
    retryCount,
  });

  // 调用 LLM
  const response = await requestLlmPlainText(provider, system, user, 0.3, {
    ctx,  // ✅ 传递 ctx，创建调试记录显示在气泡中
    routeKey,
    businessContext: `Step4 分镜${input.sceneIndex + 1}提示词优化`,
    projectId: input.projectId,
  });

  // 解析 JSON 响应
  return parseRefineResponse(response, originalPrompt);
}

/** 解析 LLM 返回的 JSON（解析失败时抛异常阻断，禁止静默降级） */
function parseRefineResponse(response: string, fallbackPrompt: string): RefinePromptResult {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`提示词优化响应无法解析为 JSON，响应内容: ${response.slice(0, 200)}`);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]!);
    return {
      refinedPrompt: (parsed.refined_prompt as string)?.trim() || fallbackPrompt,
      needsRefinement: parsed.needs_refinement === true,
      analysis: (parsed.analysis as string) ?? "",
      changesSummary: (parsed.changes_summary as string) ?? "",
    };
  } catch (error) {
    throw new Error(`提示词优化 JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 获取场景描述（从脚本 shot_breakdown 中读取该镜头的描述） */
async function resolveSceneDescription(
  ctx: AppContext,
  projectId: string,
  sceneIndex: number,
): Promise<string> {
  try {
    const { getScriptsDataDbService } = await import("../service/scripts-data-db-service.js");
    const scriptsService = getScriptsDataDbService(ctx.repos);
    const scriptRecord = await scriptsService.getConfirmedScript(projectId)
      ?? await scriptsService.getSelectedScript(projectId);
    if (!scriptRecord) return "";

    const { parseVideoScriptsContentsWithShots } = await import("./video-step/step3-video-script/content-parser.js");
    const parsed = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [scriptRecord]);
    const shotBreakdown = parsed[0]?.parsed?.shot_breakdown ?? [];
    const shot = shotBreakdown[sceneIndex];
    if (!shot) return "";

    // 拼接场景描述
    const parts: string[] = [];
    if (shot.shot_description) parts.push(shot.shot_description as string);
    const visual = shot.visual as Record<string, unknown> | undefined;
    const scene = visual?.scene as Record<string, unknown> | undefined;
    if (scene?.specific_location) parts.push(`场景: ${scene.specific_location}`);
    if (shot.timecode?.duration_seconds) parts.push(`时长: ${shot.timecode.duration_seconds}秒`);
    return parts.join("；");
  } catch (error) {
    log.warn({ err: error, projectId, sceneIndex }, "获取场景描述失败");
    return "";
  }
}
