/**
 * 热榜 LLM 请求函数
 * 注意: requestLlmHotTrendInsights 已复用 requestHotTrendStageInsights，无需迁移
 */

import type { ResolvedRouteProvider, LlmPlainTextResult } from "../../../services/llm/llm-transport.js";
import type { ProviderRouteKey } from "../../../contracts/provider-route-policy-contract.js";
import type { HotTrendInsight, HotTrendSceneSetting, HotTrendShotBreakdown } from "../types.js";
import type { LlmRequestDebugTrace } from "../../../contracts/llm-types.js";
import type { AppContext } from "../../../core/app-context.js";
import type { LlmRequestOptions, LlmDebugOptions } from "../../../services/llm/llm-transport.js";

import { AppError } from "../../../core/errors.js";
import { extractJsonValue } from "../../../utils/json.js";
import { formatLlmDebugTrace } from "../../../utils/text.js";
import {
  normalizeHotTrendVideoMultimodalScreenPayload,
} from "./payload.js";
import { buildHotTrendVideoMultimodalScreenPromptContext } from "./prompt-context.js";
import { encodeHotTrendPromptAuditMeta } from "../../../contracts/hot-trend-prompt-audit.js";
import type { HotTrendVideoMultimodalScreenResult } from "../types.js";
import { skillLoader } from "../../../services/skills/index.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 热榜视频多模态筛选函数的 LLM 依赖
 * 仅包含必须从 app.ts 注入的函数
 */
export interface HotTrendVideoMultimodalScreenLlmDeps {
  defaultLabelingCriteria: string;
  requestGeminiPlainTextWithVideoPart: (
    provider: ResolvedRouteProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    videoPart: Record<string, unknown>,
    requestOptions?: LlmRequestOptions & LlmDebugOptions
  ) => Promise<LlmPlainTextResult>;
  buildGeminiRemoteVideoPart: (videoUrl: string, mimeType: string) => Record<string, unknown>;
}

/**
 * 热榜 LLM 请求函数的依赖
 */
export interface HotTrendLlmRequestDeps {
  requestLlmPlainTextWithMetadata: (
    provider: ResolvedRouteProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    requestOptions?: { timeoutMsOverride?: number }
  ) => Promise<LlmPlainTextResult>;
}

// ============================================================================
// 函数实现
// ============================================================================

/**
 * 请求 LLM 视频多模态筛选
 */
export async function requestLlmHotTrendVideoMultimodalScreen(
  provider: ResolvedRouteProvider,
  input: {
    topicLabel: string;
    sourceUrl: string;
    promptVersion: string;
    providerRoute: ProviderRouteKey;
    labelingCriteria: string;
    textInsight: HotTrendInsight;
    topN: number;
    ctx: AppContext;
    userId: string;
  },
  llmDeps: HotTrendVideoMultimodalScreenLlmDeps,
): Promise<{
  screen: HotTrendVideoMultimodalScreenResult;
  requestSummary: string;
  responseSummary: string;
}> {
  const promptContext = await buildHotTrendVideoMultimodalScreenPromptContext(
    {
      topicLabel: input.topicLabel,
      sourceUrl: input.sourceUrl,
      promptVersion: input.promptVersion,
      labelingCriteria: input.labelingCriteria,
      topN: input.topN,
    },
    {
      encodeAuditMeta: encodeHotTrendPromptAuditMeta,
      defaultLabelingCriteria: llmDeps.defaultLabelingCriteria,
    },
    input.providerRoute,
  );
  const requestTimeoutMs = Math.max(provider.timeoutMs, 180_000);
  const firstResult = await llmDeps.requestGeminiPlainTextWithVideoPart(
    provider,
    promptContext.systemPrompt,
    promptContext.userPrompt,
    0,
    llmDeps.buildGeminiRemoteVideoPart(input.sourceUrl, "video/mp4"),
    { timeoutMsOverride: requestTimeoutMs, ctx: input.ctx, routeKey: input.providerRoute, businessContext: "热榜视频多模态筛选", userId: input.userId },
  );
  const text = firstResult.text;
  const parsed = extractJsonValue(text);
  if (!parsed) {
    throw new AppError(
      502,
      "LLM_RESPONSE_INVALID",
      `video hot trend multimodal screen response is not json; trace=${formatLlmDebugTrace(firstResult.debugTrace as LlmRequestDebugTrace | undefined)}; text=${text}`,
    );
  }
  return {
    screen: normalizeHotTrendVideoMultimodalScreenPayload(parsed, {
      topicLabel: input.topicLabel,
      sourceUrl: input.sourceUrl,
      textInsight: input.textInsight,
    }),
    requestSummary: promptContext.requestSummary,
    responseSummary: `trace=${formatLlmDebugTrace(firstResult.debugTrace as LlmRequestDebugTrace | undefined)}; text=${text}`,
  };
}

