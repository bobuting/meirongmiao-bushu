/**
 * BatchSyncAdapter — 批量热榜反推入口依赖适配器
 * 将 VideoHotTrendSyncDeps 包装为 UnifiedReverseDeps 接口
 *
 * 注意：视频下载和 OSS 上传已移至调用方（sync-service.ts），适配器不再处理
 */

import type { UnifiedReverseDeps } from "./unified-reverse-deps.js";
import type { VideoHotTrendSyncDeps, VideoHotTrendResolvedProvider, VideoHotTrendLlmPlainTextResult } from "../../contracts/video-hot-trend-sync-contract.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import { resolveCallMode, requestOpenAiPlainText } from "../../services/llm/llm-transport.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";

const logger = getLogger("video-reverse-core");

// ============================================================================
// 适配器工厂函数
// ============================================================================

/**
 * 创建批量热榜反推适配器
 * 将 VideoHotTrendSyncDeps 适配为 UnifiedReverseDeps
 */
export function createBatchReverseAdapter(existingDeps: VideoHotTrendSyncDeps): UnifiedReverseDeps {
  return {
    // ---- LLM ----

    /** 解析 Provider — unwrap { provider, routeKey } 返回 provider */
    resolveProvider: async (routeKeys: ProviderRouteKey[]): Promise<VideoHotTrendResolvedProvider | null> => {
      const resolved = await existingDeps.resolveRouteProviderWithFallback(routeKeys);
      return resolved?.provider ?? null;
    },

    /** 调用 LLM — 根据 provider 协议自动选择传输层，优先使用远程 URL */
    callLlm: async (
      provider: VideoHotTrendResolvedProvider,
      systemPrompt: string,
      userPrompt: string,
      video: { base64: string; mimeType: string; ossUrl?: string | null },
      timeoutMs: number
    ): Promise<VideoHotTrendLlmPlainTextResult> => {
      const adaptedProvider = provider as unknown as ResolvedRouteProvider;

      const callMode = resolveCallMode(adaptedProvider);

      try {
        if (callMode === "openai" || callMode === "dashscope") {
          // OpenAI 兼容协议（阿里云百炼等）— 优先传远程 URL
          return requestOpenAiPlainText(
            adaptedProvider,
            systemPrompt,
            userPrompt,
            0.3,
            { timeoutMsOverride: timeoutMs, videoInput: { base64: video.base64, mimeType: video.mimeType, videoUrl: video.ossUrl ?? undefined } }
          ) as unknown as VideoHotTrendLlmPlainTextResult;
        }

        // Gemini 协议（云雾等）— 优先使用远程视频引用，避免 base64 超限
        const videoPart = video.ossUrl
          ? existingDeps.buildGeminiRemoteVideoPart(video.ossUrl, video.mimeType)
          : existingDeps.buildGeminiInlineVideoPart(video.base64, video.mimeType);
        return existingDeps.requestGeminiPlainTextWithVideoPart(
          provider,
          systemPrompt,
          userPrompt,
          0.3,
          videoPart,
          { timeoutMsOverride: timeoutMs }
        ) as unknown as VideoHotTrendLlmPlainTextResult;
      } catch (error) {
        logger.error(
          { err: error, routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE },
          "LLM 调用失败"
        );
        throw error;
      }
    },

    // ---- 审计 ----

    /** 创建审计记录 — 方法名映射：createLlmDebugRecord */
    createAuditRecord: (input: {
      routeKey: ProviderRouteKey;
      businessContext: string;
      projectId?: string;
      userId?: string;
      messages: Array<{ role: string; content: string }>;
      modelParams: { temperature?: number; max_tokens?: number; top_p?: number };
      provider: VideoHotTrendResolvedProvider;
      hasMedia?: "image" | "video";
      actualEndpoint?: string;
      requestHeadersJson?: string;
      requestBodyJson?: string;
    }) => {
      return existingDeps.createLlmDebugRecord(input);
    },

    /** 完成审计记录（成功）— 方法名映射：finalizeLlmDebugRecordSuccess */
    finalizeAuditSuccess: (input: {
      auditId: string;
      startedAt: number;
      actualModel: string;
      responseText: string;
      actualEndpoint?: string | null;
      requestHeadersJson?: string | null;
      requestBodyJson?: string | null;
      inputTokens?: number;
      outputTokens?: number;
      ttftMs?: number;
    }) => existingDeps.finalizeLlmDebugRecordSuccess(input),

    /** 完成审计记录（失败）— 方法名映射：finalizeLlmDebugRecordError */
    finalizeAuditError: (input: {
      auditId: string;
      startedAt: number;
      errorCode: string;
      errorMessage: string;
      actualEndpoint?: string | null;
      requestHeadersJson?: string | null;
      requestBodyJson?: string | null;
    }) => existingDeps.finalizeLlmDebugRecordError(input),

    // ---- 工具方法 ----

    /** 提取 JSON — 直接委托 */
    extractJsonValue: (text: string) => existingDeps.extractJsonValue(text),

    /** 日志 — 包装以匹配接口签名（隐藏 error 方法，调整参数类型） */
    log: {
      info: (obj: unknown, msg?: string) => existingDeps.log.info(obj as Record<string, unknown>, msg ?? ""),
      warn: (obj: unknown, msg?: string) => existingDeps.log.warn(obj as Record<string, unknown>, msg ?? ""),
    },

    /** 生成唯一 ID — SyncDeps 缺少此方法，使用 now() + 随机字符串 */
    generateId: () => `batch-${existingDeps.now()}-${Math.random().toString(36).slice(2, 11)}`,

    /** 获取当前时间戳 — 直接委托 */
    now: () => existingDeps.now(),
  };
}