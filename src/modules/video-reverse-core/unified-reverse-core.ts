/**
 * 核心反推管道实现
 * 视频下载和 OSS 上传由调用方负责，本管道只处理 LLM 调用
 *
 * 输入：videoBase64 + ossUrl（由调用方提供）
 * 流程：构建 Prompt → LLM 调用 → JSON 解析 → 输出标准化
 */

import { CoreReverseInput, CoreReverseOutput, CORE_REVERSE_ERROR_CODES } from "./types.js";
import { UnifiedReverseDeps } from "./unified-reverse-deps.js";
import { normalizeLlmReverseOutput } from "./normalize-output.js";
import { skillLoader } from "../../services/skills/index.js";
import { buildGeminiEndpointCandidates } from "../gemini-provider-endpoints.js";
import { parseGeminiApiKey, GEMINI_DEFAULT_SAFETY_SETTINGS } from "../../services/llm/gemini-utils.js";
import { resolveGeminiModelCandidates } from "../../services/llm/provider-resolver.js";
import { buildOpenAiVisionUserContent, summarizeOpenAiRequestBody } from "../../services/llm/openai-utils.js";
import { resolveCallMode } from "../../services/llm/llm-transport.js";
import { AppError } from "../../core/errors.js";

// 提示词模板代码
const PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS = "video_storyboard_analysis";

// ============================================================================
// 核心管道函数
// ============================================================================

/**
 * 运行核心反推管道
 * 返回结构化结果，不抛异常（per D-04）
 *
 * 调用方职责：
 * - 下载视频到 base64
 * - 上传 OSS 获取公开链接
 * - 传入 videoBase64、ossUrl、videoMimeType
 */
export async function runCoreReversePipeline(
  deps: UnifiedReverseDeps,
  input: CoreReverseInput,
): Promise<CoreReverseOutput> {
  // 阶段A: 解析 LLM provider（使用调用方传入的 routeKeys）
  const provider = await deps.resolveProvider(input.routeKeys);
  if (!provider) {
    return {
      rawLlmOutput: null,
      resolvedVideoUrl: input.videoUrl,
      success: false,
      errorCode: CORE_REVERSE_ERROR_CODES.NO_PROVIDER,
      errorMessage: "无可用的 LLM 提供者",
    };
  }

  // 阶段B: 构建 prompt
  const { system: systemPrompt, user: baseUserPrompt } = await skillLoader.render(PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS, {
    variables: {
      topicId: input.topicId ?? deps.generateId(),
      topicLabel: input.topicLabel ?? "视频",
      videoUrl: input.videoUrl,
    },
  });

  // ossUrl 作为额外的用户提示词内容（不在模板中定义）
  const finalUserPrompt = input.ossUrl
    ? baseUserPrompt + `\n\n视频公开链接（OSS）: ${input.ossUrl}`
    : baseUserPrompt;

  // 阶段C: 构建真实请求体（在调用 callLlm 之前，此处即会被实际发送的内容）
  const adaptedProvider = provider as unknown as import("../../services/llm/provider-resolver.js").ResolvedRouteProvider;
  const callMode = resolveCallMode(adaptedProvider);
  if (!finalUserPrompt.trim()) {
    throw new AppError(500, "REVERSE_CORE_EMPTY_PROMPT", "逆向解析用户提示词为空，Skill 渲染结果异常");
  }
  const actualUserPrompt = finalUserPrompt.trim();
  const temperature = 0.3;
  let requestBodyJson: string;

  if (callMode === "openai" || callMode === "dashscope") {
    // OpenAI 兼容协议：构建消息体
    const visionContent = buildOpenAiVisionUserContent(actualUserPrompt, undefined);
    const userMessageContent = visionContent ?? actualUserPrompt;
    let finalUserContent: string | Array<Record<string, unknown>> = userMessageContent;
    if (input.ossUrl) {
      if (Array.isArray(userMessageContent)) {
        finalUserContent = [...userMessageContent, { type: "video_url", video_url: { url: input.ossUrl } }];
      } else {
        finalUserContent = [
          { type: "text", text: userMessageContent },
          { type: "video_url", video_url: { url: input.ossUrl } },
        ];
      }
    } else if (input.videoBase64 && input.videoMimeType) {
      const dataUrl = `data:${input.videoMimeType};base64,${input.videoBase64}`;
      if (Array.isArray(userMessageContent)) {
        finalUserContent = [...userMessageContent, { type: "video_url", video_url: { url: dataUrl } }];
      } else {
        finalUserContent = [
          { type: "text", text: userMessageContent },
          { type: "video_url", video_url: { url: dataUrl } },
        ];
      }
    }
    requestBodyJson = summarizeOpenAiRequestBody({
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalUserContent },
      ],
      temperature,
    });
  } else {
    // Gemini 协议：视频 part 由下游 clone-adapter 构建，此处结构一致
    requestBodyJson = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: actualUserPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature },
      safetySettings: GEMINI_DEFAULT_SAFETY_SETTINGS,
    });
  }

  // 阶段D: 预构建请求信息
  const geminiModelCandidates = resolveGeminiModelCandidates(adaptedProvider);
  const geminiModel = geminiModelCandidates[0] ?? provider.model;
  const geminiApiKey = parseGeminiApiKey(provider.secret);
  const endpointCandidates = buildGeminiEndpointCandidates(provider, geminiModel, geminiApiKey);
  const prebuiltEndpoint = endpointCandidates[0];

  // 预构建请求头
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 阶段E: 创建审计记录（含真实 API 地址 + 真实请求体）
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: finalUserPrompt },
  ];
  if (input.ossUrl) {
    messages.push({ role: "video", content: input.ossUrl });
  }
  const auditRecord = deps.createAuditRecord({
    routeKey: input.auditContext.routeKey,
    businessContext: input.auditContext.businessContext,
    projectId: input.auditContext.projectId,
    userId: input.auditContext.userId,
    messages,
    modelParams: { temperature: 0.3 },
    provider,
    hasMedia: "video",
    actualEndpoint: prebuiltEndpoint?.url ?? undefined,
    requestHeadersJson: prebuiltEndpoint?.headers ? JSON.stringify(prebuiltEndpoint.headers) : undefined,
    requestBodyJson,
  });

  try {
    // 阶段F: 调用 LLM
    const timeoutMs = Math.max(provider.timeoutMs, 180_000);
    const llmResult = await deps.callLlm(
      provider,
      systemPrompt,
      finalUserPrompt,
      { base64: input.videoBase64, mimeType: input.videoMimeType, ossUrl: input.ossUrl },
      timeoutMs,
    );

    // 阶段G: 解析 JSON
    const parsed = deps.extractJsonValue(llmResult.text);
    if (!parsed || typeof parsed !== "object") {
      deps.finalizeAuditError({
        auditId: auditRecord.auditId,
        startedAt: auditRecord.startedAt,
        errorCode: CORE_REVERSE_ERROR_CODES.LLM_RESPONSE_INVALID,
        errorMessage: "LLM 响应无效，无法解析为 JSON",
        requestHeadersJson: JSON.stringify(requestHeaders),
        requestBodyJson,
      });
      return {
        rawLlmOutput: null,
        resolvedVideoUrl: input.videoUrl,
        success: false,
        errorCode: CORE_REVERSE_ERROR_CODES.LLM_RESPONSE_INVALID,
        errorMessage: "LLM 响应无效，无法解析为 JSON",
      };
    }

    // 阶段H: 标准化输出
    const output = normalizeLlmReverseOutput(parsed);

    // 提取 debugTrace 信息
    const debugTrace = llmResult.debugTrace;
    const traceEndpoint = debugTrace?.endpoint ?? null;
    const traceRequestHeadersJson = debugTrace?.requestHeaders
      ? JSON.stringify(debugTrace.requestHeaders)
      : JSON.stringify(requestHeaders);

    // 完成审计记录（成功）
    deps.finalizeAuditSuccess({
      auditId: auditRecord.auditId,
      startedAt: auditRecord.startedAt,
      actualModel: provider.model,
      responseText: llmResult.text,
      ...(traceEndpoint ? { actualEndpoint: traceEndpoint } : {}),
      ...(traceRequestHeadersJson ? { requestHeadersJson: traceRequestHeadersJson } : {}),
      ...(requestBodyJson ? { requestBodyJson } : {}),
    });

    return {
      rawLlmOutput: output,
      resolvedVideoUrl: input.videoUrl,
      success: true,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    const errorCode = CORE_REVERSE_ERROR_CODES.LLM_CALL_FAILED;
    const errorMessage = error instanceof Error ? error.message : String(error);

    deps.finalizeAuditError({
      auditId: auditRecord.auditId,
      startedAt: auditRecord.startedAt,
      errorCode,
      errorMessage,
      requestHeadersJson: JSON.stringify(requestHeaders),
      requestBodyJson,
    });

    return {
      rawLlmOutput: null,
      resolvedVideoUrl: input.videoUrl,
      success: false,
      errorCode,
      errorMessage,
    };
  }
}
