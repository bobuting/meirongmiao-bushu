/**
 * Outfit Prompt 优化服务
 *
 * 从 app.ts 提取的搭配推荐 prompt 优化功能。
 */

import type { AppContext } from "../core/app-context.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { LlmGroundingSource } from "../services/llm/gemini-utils.js";
import type { Step1OptimizedPromptGuidance } from "../modules/step1-optimized-prompt-builder.js";
import type { LlmDebugOptions } from "../services/llm/llm-transport.js";
import { requestLlmPlainTextWithMetadata } from "../services/llm/llm-transport.js";
import {
  buildStep1OptimizedPromptRewriteRequest,
  finalizeStep1OptimizedPrompt,
} from "../modules/step1-optimized-prompt-builder.js";

/**
 * 请求 LLM 优化搭配推荐 prompt
 */
export async function requestLlmOptimizeOutfitPrompt(
  provider: ResolvedRouteProvider,
  analysis: string,
  guidance?: Partial<Step1OptimizedPromptGuidance> | null,
  debugOptions?: LlmDebugOptions,
): Promise<{ prompt: string; groundingSources: LlmGroundingSource[] }> {
  const rewriteRequest = await buildStep1OptimizedPromptRewriteRequest(analysis);
  const result = await requestLlmPlainTextWithMetadata(
    provider,
    rewriteRequest.system,
    rewriteRequest.user,
    0.2,
    debugOptions,
  );
  const prompt = finalizeStep1OptimizedPrompt({
    analysis,
    candidate: result.text,
    guidance,
  });
  return {
    prompt,
    groundingSources: result.groundingSources,
  };
}