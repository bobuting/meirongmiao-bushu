/**
 * Step3 视频脚本生成 - LLM 改写器
 * 调用提示词管理系统进行脚本改写
 */

import type { AppContext } from "../../../core/app-context.js";
import type { Project } from "../../../contracts/types.js";
import type { ProjectContext } from "../../project-context/types.js";
import type {
  VideoScriptData,
  ScriptRewriterOutput,
  VideoScriptContent,
} from "./types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { resolveRouteProvider, requestLlmPlainText, type ResolvedRouteProvider } from "../../../services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { skillLoader } from "../../../services/skills/index.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("script-rewriter");

/** LLM Provider 路由键 */
const LLM_ROUTE_KEY = ProviderRouteKeys.STEP3_VIDEO_SCRIPT_REWRITE;

/** 提示词模板代码 */
const PROMPT_CODE_VIDEO_REWRITER = "video_script_rewriter";

/**
 * 批量改写脚本
 *
 * @param ctx 应用上下文
 * @param scripts 待改写的脚本数组
 * @param project 项目对象（用于获取角色信息）
 * @param projectContext 项目上下文（用于获取服饰信息）
 * @returns 改写结果数组
 */
export async function rewriteScriptsWithLLM(
  ctx: AppContext,
  scripts: VideoScriptData[],
  project: Project,
  projectContext: ProjectContext,
): Promise<ScriptRewriterOutput[]> {

  // 获取 LLM Provider
  const provider = await resolveRouteProvider(ctx, LLM_ROUTE_KEY);
  if (!provider) {
    log.warn({ routeKey: LLM_ROUTE_KEY }, "VideoScriptRewriter no LLM provider found");
    // 返回原始脚本（不做改写）
    return scripts.map((script) => ({
      success: false,
      originalScriptId: script.id,
      error: "No LLM provider available",
    }));
  }


  // 统一从项目获取角色信息（不使用 projectContext.characterDescription）
  const { characterDescription, characterDirection } = buildCharacterPromptFromProject(project);

  // 并行处理每个脚本（限制并发数）
  const maxConcurrent = 3;
  const results: ScriptRewriterOutput[] = [];

  for (let i = 0; i < scripts.length; i += maxConcurrent) {
    const batch = scripts.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map((script) =>
        rewriteSingleScript(
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

  return results;
}

/**
 * 改写单个脚本
 */
async function rewriteSingleScript(
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
  const stage = "video-rewrite";

  // 构建用户输入（传递完整的服饰信息）
  const userPromptText = buildUserInput(
    script.parsed,
    characterDescription,
    characterDirection,
    matchingReference,
    outfitDescription,
    clothingStyles,
  );

  // 从提示词管理系统获取提示词
  const { system: systemPrompt, user: userPrompt } = await skillLoader.render(PROMPT_CODE_VIDEO_REWRITER, { userPrompt: userPromptText });

  try {
    // ===== 调用前日志 =====

    // 调用 LLM
    const responseText = await requestLlmPlainText(
      provider,
      systemPrompt,
      userPrompt,
      temperature,
      {
        ctx,
        userId,
        routeKey: ProviderRouteKeys.STEP3_VIDEO_SCRIPT_REWRITE,
        businessContext: "视频脚本改写",
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
    log.error({ err: error, scriptId: script.id }, "VideoScriptRewriter error rewriting script");

    return {
      success: false,
      originalScriptId: script.id,
      error: errorMessage,
      sourceOssUrl: script.sourceOssUrl,
    };
  }
}

/**
 * 构建用户输入
 * 顺序：分镜脚本 JSON + 新角色描述
 * 传入完整的脚本内容，包含 video_info、video_analysis、shot_breakdown、editing_analysis
 * 如果 video_info 缺失，自动从其他字段补全
 *
 * 输出格式：
 * 【角色描述】                    ← 标签必须单独一行
 * ${characterDescription}         ← if 判断，有内容才显示
 * 【角色方向】                    ← 角色方向信息（不含 styleSummary）
 * 【服饰描述】                    ← 标签必须单独一行
 * ${outfitDescription}            ← if 判断，有内容才显示
 * 服饰搭配：${matchingReference}   ← 可选
 * 服饰风格：${clothingStyles}      ← 可选
 */
function buildUserInput(
  content: VideoScriptContent,
  characterDescription: string,
  characterDirection: CharacterDirectionInfo | null,
  matchingReference?: string,
  outfitDescription?: string,
  clothingStyles?: string[],
): string {
  // 确保 video_info 存在
  const completeContent = ensureVideoInfo(content);

  // 标签必须打印，内容 if 判断
  let characterInfo = `【角色描述】`;
  if (characterDescription) {
    characterInfo += `\n${characterDescription}`;
  }

  // 角色方向（不使用 styleSummary，它是 Step1→Step2 的过渡提示，不是风格描述）
  if (characterDirection) {
    const parts: string[] = [];
    // 性别信息
    if (characterDirection.gender && characterDirection.gender !== "unknown") {
      parts.push(`性别：${characterDirection.gender === "male" ? "男" : "女"}`);
    }
    if (characterDirection.styleWords.length > 0) {
      parts.push(`关键词：${characterDirection.styleWords.join("、")}`);
    }
    if (parts.length > 0) {
      characterInfo += `\n【角色方向】\n${parts.join("，")}`;
    }
  }

  characterInfo += `\n【服饰描述】`;
  if (outfitDescription) {
    characterInfo += `\n${outfitDescription}`;
  }

  // 可选字段
  if (matchingReference) {
    characterInfo += `\n服饰搭配：${matchingReference}`;
  }
  if (clothingStyles && clothingStyles.length > 0) {
    characterInfo += `\n服饰风格：${clothingStyles.join("、")}`;
  }

  return `【分镜脚本 JSON】
${JSON.stringify(completeContent, null, 2)}

${characterInfo}`;
}

/**
 * 确保 video_info 存在，缺失时从其他字段推导
 */
function ensureVideoInfo(content: VideoScriptContent): VideoScriptContent {
  if (content.video_info) {
    return content;
  }

  const title = content.video_analysis?.title || "未命名脚本";
  const durationSeconds = estimateTotalDuration(content.shot_breakdown);

  const videoInfo = {
    title,
    duration_seconds: durationSeconds,
    source: "视频热榜",
    time_of_day: "不确定",
    weather: "不确定",
    main_scene: "未标注",
  };


  return { ...content, video_info: videoInfo };
}

/**
 * 从 shot_breakdown 的 timecode 累计估算总时长
 */
function estimateTotalDuration(
  shotBreakdown?: VideoScriptContent["shot_breakdown"],
): number {
  if (!shotBreakdown || shotBreakdown.length === 0) return 20;
  let total = 0;
  for (const shot of shotBreakdown) {
    if (shot.timecode?.duration_seconds) {
      total += shot.timecode.duration_seconds;
    }
  }
  return total > 0 ? total : shotBreakdown.length * 4;
}

/**
 * 解析 LLM 响应
 * 保持原始 JSON 结构，不增减字段
 * 自动回填原始输入中 LLM 可能遗漏的字段（如 video_info、editing_analysis）
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

  // 先尝试直接解析——格式化 JSON 的空白字符（换行/缩进）本身就是合法 JSON
  try {
    const parsed = JSON.parse(jsonStr);
    const merged = mergeWithOriginal(parsed, originalContent);
    return merged as VideoScriptContent;
  } catch {
    // 直接解析失败时，清理字符串值中可能存在的未转义控制字符后重试
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
        log.error({ parsedType: typeof parsed, isArray: Array.isArray(parsed) }, "VideoScriptRewriter parsed result is not an object");
        return null;
      }

      // 检查 shot_breakdown 是否存在
      if (!parsed.shot_breakdown) {
        log.error({ keys: Object.keys(parsed) }, "VideoScriptRewriter missing shot_breakdown in LLM response");
      }

      // 回填 LLM 可能遗漏的顶层字段
      const merged = mergeWithOriginal(parsed, originalContent);
      return merged as VideoScriptContent;
    } catch (error) {
      log.error({ err: error, responsePreview: jsonStr.slice(0, 500) }, "VideoScriptRewriter JSON parse error (after sanitization)");
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

/**
 * 从角色描述中提取风格标签
 * 使用正则或简单规则提取
 */
export function extractStylesFromDescription(description: string): string[] {
  if (!description || typeof description !== "string") {
    return [];
  }

  // 常见风格关键词
  const styleKeywords = [
    "街头潮流",
    "日系清新",
    "韩系精致",
    "运动休闲",
    "慵懒风",
    "酷飒",
    "温柔",
    "文艺",
    "知性",
    "阳光",
    "活泼",
    "简约",
    "复古",
    "甜美",
    "优雅",
    "通勤",
    "居家",
    "商务",
    "休闲",
    "时尚",
  ];

  const foundStyles: string[] = [];

  for (const keyword of styleKeywords) {
    if (description.includes(keyword)) {
      foundStyles.push(keyword);
    }
  }

  // 如果没有找到明确风格，尝试从"穿搭"、"风格"等词后面提取
  const stylePatterns = [
    /穿搭[^，。,]*?([^\s，。,]{2,4})/g,
    /风格[^，。,]*?([^\s，。,]{2,4})/g,
    /穿着[^，。,]*?([^\s，。,]{2,4})/g,
  ];

  for (const pattern of stylePatterns) {
    const matches = description.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && !foundStyles.includes(match[1])) {
        foundStyles.push(match[1]);
      }
    }
  }


  return foundStyles;
}