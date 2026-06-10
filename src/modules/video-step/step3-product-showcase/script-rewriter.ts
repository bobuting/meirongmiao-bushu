/**
 * Step3 产品展示脚本改写器
 * 根据新角色和新产品信息改写产品展示分镜脚本
 * 兼容有模特/局部出镜/无模特三种镜头类型
 */

import type { AppContext } from "../../../core/app-context.js";
import type { Project } from "../../../contracts/types.js";
import type { ProjectContext } from "../../project-context/types.js";
import type {
  VideoScriptData,
  ScriptRewriterOutput,
  VideoScriptContent,
} from "../step3-video-script/types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import type { ShotBreakdownItem } from "../../../contracts/shot-breakdown-contract.js";
import { resolveRouteProvider, requestLlmPlainText, type ResolvedRouteProvider } from "../../../services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { skillLoader } from "../../../services/skills/index.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("product-showcase-rewriter");

/** LLM Provider 路由键 */
const LLM_ROUTE_KEY = ProviderRouteKeys.STEP3_PRODUCT_SHOWCASE_SCRIPT_REWRITE;

/** 提示词模板代码 */
const PROMPT_CODE_PRODUCT_REWRITER = "product_showcase_rewriter";

/**
 * 镜头分类结果
 */
type ShotClassificationResult = {
  shotId: number;
  classification: "full_model" | "partial_model" | "no_model";
  reason: string;
};

/**
 * 预分类镜头类型
 * 根据 subjects 和 shot_type 判断镜头类型
 */
function classifyShotType(shot: ShotBreakdownItem): ShotClassificationResult {
  const subjects = shot.subjects ?? [];
  const hasPerson = subjects.some(s => s.type === "人物");
  const shotType = shot.shot_type ?? "";
  const shotId = shot.shot_id;

  // 无模特镜头：subjects 中无人物
  if (!hasPerson) {
    return {
      shotId,
      classification: "no_model",
      reason: "subjects 只有物体或为空，无人物",
    };
  }

  // 局部出镜判断：景别为特写/近景 且 人物描述只涉及局部
  const personSubject = subjects.find(s => s.type === "人物");
  const isCloseUp = /特写|近景|细节|微距/.test(shotType);
  const description = personSubject?.description ?? "";
  const action = personSubject?.action ?? "";
  const isPartialBody = /手|手臂|肩|颈部|脚|腕|指尖/.test(description + action);

  if (isCloseUp && isPartialBody) {
    return {
      shotId,
      classification: "partial_model",
      reason: `景别为 ${shotType}，人物描述涉及局部（${description.slice(0, 30)}${action.slice(0, 30)}）`,
    };
  }

  // 有模特镜头：景别为全身/半身，或人物描述涉及完整身体
  return {
    shotId,
    classification: "full_model",
    reason: `subjects 有人物，景别为 ${shotType}`,
  };
}

/**
 * 批量预分类脚本中的所有镜头
 */
function classifyAllShots(content: VideoScriptContent): ShotClassificationResult[] {
  const shotBreakdown = content.shot_breakdown ?? [];
  return shotBreakdown.map(shot => classifyShotType(shot));
}

/**
 * 批量改写产品展示脚本
 *
 * @param ctx 应用上下文
 * @param scripts 待改写的脚本数组
 * @param project 项目对象（用于获取角色信息）
 * @param projectContext 项目上下文（用于获取服饰信息）
 * @returns 改写结果数组
 */
export async function rewriteProductShowcaseScriptsWithLLM(
  ctx: AppContext,
  scripts: VideoScriptData[],
  project: Project,
  projectContext: ProjectContext,
): Promise<ScriptRewriterOutput[]> {

  // 获取 LLM Provider
  const provider = await resolveRouteProvider(ctx, LLM_ROUTE_KEY);
  if (!provider) {
    log.warn({ routeKey: LLM_ROUTE_KEY }, "ProductShowcaseRewriter no LLM provider found");
    // 返回原始脚本（不做改写）
    return scripts.map((script) => ({
      success: false,
      originalScriptId: script.id,
      error: "No LLM provider available",
    }));
  }

  // 统一从项目获取角色信息
  const { characterDescription, characterDirection } = buildCharacterPromptFromProject(project);

  // 并行处理每个脚本（限制并发数）
  const maxConcurrent = 3;
  const results: ScriptRewriterOutput[] = [];

  for (let i = 0; i < scripts.length; i += maxConcurrent) {
    const batch = scripts.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map((script) =>
        rewriteSingleProductShowcaseScript(
          ctx,
          provider,
          script,
          project.id,
          project.userId,
          characterDescription,
          characterDirection,
          projectContext.matchingReference,
          projectContext.outfitDescription,
          projectContext.clothingStyles,
        )
      )
    );
    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;
  log.info({ successCount, total: scripts.length }, "ProductShowcaseRewriter batch completed");

  return results;
}

/**
 * 改写单个产品展示脚本
 */
async function rewriteSingleProductShowcaseScript(
  ctx: AppContext,
  provider: ResolvedRouteProvider,
  script: VideoScriptData,
  projectId: string,
  userId: string,
  characterDescription: string,
  characterDirection: CharacterDirectionInfo | null,
  matchingReference?: string,
  outfitDescription?: string,
  clothingStyles?: string[],
): Promise<ScriptRewriterOutput> {
  if (!script.parsed) {
    return {
      success: false,
      originalScriptId: script.id,
      error: "Script not parsed",
      sourceOssUrl: script.sourceOssUrl,
    };
  }

  const temperature = 0.7;
  const stage = "product-showcase-rewrite";

  // 预分类所有镜头
  const shotClassifications = classifyAllShots(script.parsed);

  // 提取角色性别（schema 要求必须是 male 或 female）
  const characterGender = characterDirection?.gender === "male" ? "male" as const
    : characterDirection?.gender === "female" ? "female" as const
    : null;

  // 如果性别未指定，使用默认值（避免 schema 校验失败）
  const finalCharacterGender = characterGender || "female" as const;

  // 从提示词管理系统获取提示词（使用结构化变量）
  const { system: systemPrompt, user: userPrompt } = await skillLoader.render(
    PROMPT_CODE_PRODUCT_REWRITER,
    {
      variables: {
        scriptJson: JSON.stringify(script.parsed, null, 2),
        shotClassifications,
        characterGender: finalCharacterGender,
        characterDescription,
        selectedRoleDirection: characterDirection ? {
          styleWords: characterDirection.styleWords,
        } : undefined,
        outfitDescription: outfitDescription || "",
        matchingReference,
        clothingStyles,
      },
    }
  );

  try {
    // 调用 LLM
    const responseText = await requestLlmPlainText(
      provider,
      systemPrompt,
      userPrompt,
      temperature,
      {
        ctx,
        userId,
        routeKey: LLM_ROUTE_KEY,
        businessContext: "产品展示脚本改写",
        projectId,
      }
    );

    // 解析 LLM 响应
    const rewrittenContent = parseLLMResponse(responseText, script.parsed);

    if (!rewrittenContent) {
      return {
        success: false,
        originalScriptId: script.id,
        error: "Failed to parse LLM response",
        sourceOssUrl: script.sourceOssUrl,
      };
    }

    return {
      success: true,
      originalScriptId: script.id,
      rewrittenContent,
      sourceOssUrl: script.sourceOssUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ err: error, scriptId: script.id }, "ProductShowcaseRewriter error rewriting script");

    return {
      success: false,
      originalScriptId: script.id,
      error: errorMessage,
      sourceOssUrl: script.sourceOssUrl,
    };
  }
}

/**
 * 解析 LLM 响应
 * 保持原始 JSON 结构，不增减字段
 */
function parseLLMResponse(
  responseText: string,
  originalContent: VideoScriptContent,
): VideoScriptContent | null {
  if (!responseText || typeof responseText !== "string") {
    return null;
  }

  // 尝试提取 JSON
  let jsonStr = responseText.trim();

  // 移除可能的 markdown 代码块标记
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  // 尝试解析
  try {
    const parsed = JSON.parse(jsonStr);
    const merged = mergeWithOriginal(parsed, originalContent);
    return merged as VideoScriptContent;
  } catch {
    // 清理字符串值中可能存在的未转义控制字符后重试
    const sanitized = jsonStr.replace(/[\x00-\x1f]/g, (ch) => {
      switch (ch) {
        case "\n": return "\\n";
        case "\r": return "\\r";
        case "\t": return "\\t";
        default: return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      }
    });
    try {
      const parsed = JSON.parse(sanitized);

      // 验证基本结构
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        log.error({ parsedType: typeof parsed }, "Parsed result is not an object");
        return null;
      }

      // 检查 shot_breakdown 是否存在
      if (!parsed.shot_breakdown) {
        log.error({ keys: Object.keys(parsed) }, "Missing shot_breakdown in LLM response");
      }

      // 回填 LLM 可能遗漏的顶层字段
      const merged = mergeWithOriginal(parsed, originalContent);
      return merged as VideoScriptContent;
    } catch (error) {
      log.error({ err: error, responsePreview: jsonStr.slice(0, 500) }, "JSON parse error");
      return null;
    }
  }
}

/**
 * 将 LLM 输出与原始输入合并，回填缺失的顶层字段
 */
function mergeWithOriginal(
  llmOutput: Record<string, unknown>,
  original: VideoScriptContent,
): Record<string, unknown> {
  const result = { ...llmOutput };

  if (!result.video_info && original.video_info) {
    result.video_info = original.video_info;
  }

  if (!result.editing_analysis && original.editing_analysis) {
    result.editing_analysis = original.editing_analysis;
  }

  return result;
}