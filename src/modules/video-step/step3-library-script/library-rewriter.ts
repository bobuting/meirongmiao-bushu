/**
 * Step3 库存脚本 - LLM 角色改写（精准模式）
 * 传完整脚本 JSON + 角色信息给 LLM，要求 LLM 按原格式返回
 * 不再使用 SKILL-library-rewrite.md 文件
 */

import type { AppContext } from "../../../core/app-context.js";
import type { Project } from "../../../contracts/types.js";
import type { ProjectContext } from "../../project-context/types.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";
import type { LibraryRewriterOutput } from "./types.js";
import type { ScoringLoopConfig } from "../../../contracts/business-config-contract.js";
import { DEFAULT_SCORING_LOOP_CONFIG } from "../../../contracts/business-config-contract.js";
import { getLogger } from "../../../core/logger/index.js";
import { resolveRouteProvider, requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { skillLoader } from "../../../services/skills/index.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getWeaknessFeedbackForStrategy, buildWeaknessFeedbackPrompt } from "../../script-quality/scoring-loop.js";

const log = getLogger("library-rewriter");

/** LLM Provider 路由键 */
const LLM_ROUTE_KEY = ProviderRouteKeys.STEP3_LIBRARY_SCRIPT_REWRITE;

/** 提示词模板代码 */
const PROMPT_CODE_LIBRARY_SCRIPT_REWRITER = "library_script_rewriter";

/**
 * 对单个脚本进行 LLM 角色改写（精准模式）
 *
 * @param project 项目对象（用于获取角色信息）
 * @param projectContext 项目上下文（用于获取服饰信息）
 */
export async function rewriteLibraryScriptWithLLM(
  ctx: AppContext,
  scriptContent: VideoScriptContent,
  project: Project,
  projectContext: ProjectContext,
): Promise<LibraryRewriterOutput> {
  // 获取 LLM Provider
  const provider = await resolveRouteProvider(ctx, LLM_ROUTE_KEY);
  if (!provider) {
    log.warn(`[LibraryRewriter] No LLM provider found for key: ${LLM_ROUTE_KEY}`);
    return {
      success: false,
      originalScriptId: "",
      error: "No LLM provider available",
    };
  }


  const temperature = 0.3;
  const stage = "library-rewrite";

  // 统一从项目获取角色信息（不使用 projectContext.characterDescription）
  const { characterDescription, characterDirection } = buildCharacterPromptFromProject(project);

  // 提取角色性别
  const characterGender = project.selectedRoleDirection?.gender === "male" ? "male" as const
    : project.selectedRoleDirection?.gender === "female" ? "female" as const
    : "uncertain" as const;

  // 获取提示词模板
  const { system: systemPrompt, user: rawUserPrompt } = await skillLoader.render(PROMPT_CODE_LIBRARY_SCRIPT_REWRITER, {
    variables: {
      characterGender,
      characterDescription,
      scriptJson: JSON.stringify(scriptContent, null, 2),
      outfitDescription: projectContext.outfitDescription,
      matchingReference: projectContext.matchingReference,
      clothingStyles: projectContext.clothingStyles,
      characterDirection: characterDirection ? {
        styleWords: characterDirection.styleWords,
      } : undefined,
    },
  });

  // 评分闭环：弱项反馈注入
  const scoringLoopConfig: ScoringLoopConfig = ctx.businessConfigService.get("scoring_loop", DEFAULT_SCORING_LOOP_CONFIG);
  const feedback = await getWeaknessFeedbackForStrategy(ctx.repos, PROMPT_CODE_LIBRARY_SCRIPT_REWRITER, scoringLoopConfig, "library");
  const weaknessPromptSuffix = feedback ? buildWeaknessFeedbackPrompt(feedback) : "";
  const userPrompt = weaknessPromptSuffix ? rawUserPrompt + "\n\n" + weaknessPromptSuffix : rawUserPrompt;

  try {

    // 调用 LLM
    const responseText = await requestLlmPlainText(
      provider,
      systemPrompt,
      userPrompt,
      temperature,
      {
        ctx,
        routeKey: ProviderRouteKeys.STEP3_LIBRARY_SCRIPT_REWRITE,
        businessContext: "资产库脚本改写",
        userId: project.userId,
        projectId: project.id,
      }
    );

    // 解析 LLM 返回的完整 JSON
    const rewrittenContent = parseLLMResponse(responseText);

    if (!rewrittenContent) {
      // 解析失败，用原文兜底
      log.warn("[LibraryRewriter] Failed to parse LLM response, using original content");
      return {
        success: true,
        originalScriptId: "",
        rewrittenContent: scriptContent,
      };
    }

    return {
      success: true,
      originalScriptId: "",
      rewrittenContent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error }, "[LibraryRewriter] LLM call failed");

    // LLM 调用失败，用原文兜底
    return {
      success: true,
      originalScriptId: "",
      rewrittenContent: scriptContent,
    };
  }
}

/**
 * 解析 LLM 返回的完整 JSON
 * LLM 直接返回完整脚本 JSON，无需 merge
 */
function parseLLMResponse(
  responseText: string,
): VideoScriptContent | null {
  if (!responseText || typeof responseText !== "string") {
    return null;
  }

  let jsonStr = responseText.trim();

  // 移除 markdown 代码块标记
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== "object" || parsed === null) {
      log.warn("[LibraryRewriter] LLM returned non-object response");
      return null;
    }

    // 基本结构校验：至少要有 shot_breakdown
    if (!Array.isArray(parsed.shot_breakdown)) {
      log.warn("[LibraryRewriter] LLM response missing shot_breakdown");
      return null;
    }

    return parsed as VideoScriptContent;
  } catch {
    log.error("[LibraryRewriter] JSON parse failed");
    return null;
  }
}