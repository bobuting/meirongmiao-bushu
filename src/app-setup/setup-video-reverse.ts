/**
 * Video Reverse 服务初始化模块
 *
 * 阶段 2: 创建视频反推分析服务和相关 helper 函数。
 */
import type { AppContext } from "../core/app-context.js";
import type { ResolvedRouteProvider } from "../contracts/provider-route-contract.js";
import type { ProviderRouteKey } from "../contracts/types.js";
import type { VideoReverseSetupResult } from "./app-services.js";
import type { LlmPlainTextResult } from "../contracts/llm-types.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";

import {
  createVideoReverseAnalysisService,
  VideoReverseAnalysisServiceError,
} from "../modules/video-reverse-analysis-service.js";
import {
  resolveRouteProviderChain,
  resolveModelFallbackOrder,
  resolveOrderedProviderChain,
} from "../services/llm/provider-resolver.js";
import {
  requestGeminiPlainTextWithVideoPart,
} from "../services/llm/llm-transport.js";
import {
  buildGeminiRemoteVideoPart,
  buildGeminiInlineVideoPart,
} from "../services/llm/gemini-utils.js";
import { createCapabilityDiagnostics, type CapabilityDiagnostics } from "../services/llm/provider-resolver.js";
import { skillLoader } from "../services/skills/index.js";

const PROMPT_CODE_VIDEO_REVERSE_ANALYSIS = "video_storyboard_analysis";

/**
 * 检测视频反推缺失源信号
 */
function isVideoReverseMissingSourceSignal(text: string): boolean {
  const signals = [
    "无法读取视频",
    "video not accessible",
    "unable to access video",
    "video source unavailable",
    "无法访问视频",
    "视频不可用",
  ];
  const lower = text.toLowerCase();
  return signals.some((signal) => lower.includes(signal.toLowerCase()));
}

/**
 * 解析路由 Provider Chain（带 fallback）
 */
async function resolveRouteProviderChainWithFallback(
  ctx: AppContext,
  routeKeys: readonly ProviderRouteKey[],
): Promise<ResolvedRouteProvider[]> {
  const output: ResolvedRouteProvider[] = [];
  const seen = new Set<string>();
  for (const routeKey of routeKeys) {
    for (const provider of await resolveRouteProviderChain(ctx, routeKey)) {
      const key = provider.id.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(provider);
    }
  }
  return output;
}

/**
 * 阶段 2: Video Reverse 服务初始化
 */
export function setupVideoReverse(ctx: AppContext): VideoReverseSetupResult {
  // 解析视频反推 provider chain
  const resolveVideoReverseProviderChain = async (
    _sourceType: "video_url" | "upload_file",
    apiFallbackOrder?: readonly string[],
  ): Promise<{ providers: ResolvedRouteProvider[]; hasUnsupportedProviders: boolean }> => {
    const reverseProviders = resolveOrderedProviderChain(
      await resolveRouteProviderChainWithFallback(ctx, [ProviderRouteKeys.SQUARE_VIDEO_REVERSE]),
      Array.isArray(apiFallbackOrder) ? [...apiFallbackOrder] : undefined,
    );
    return {
      providers: reverseProviders,
      hasUnsupportedProviders: false,
    };
  };

  // 创建错误
  const resolveVideoReverseGatewayError = (
    statusCode: number,
    code: string,
    message: string,
    diagnostics: CapabilityDiagnostics,
  ): VideoReverseAnalysisServiceError => {
    return new VideoReverseAnalysisServiceError(statusCode, code, message, diagnostics);
  };

  // 创建原始结果
  const createVideoReverseGatewayRaw = (result: LlmPlainTextResult): { trace: unknown; groundingSources: unknown } => {
    const trace = result.debugTrace ?? null;
    return {
      trace,
      groundingSources: result.groundingSources ?? [],
    };
  };

  // 创建视频反推分析服务
  const videoReverseAnalysisService = createVideoReverseAnalysisService({
    defaultModel: "video-reverse-default",
    urlGateway: {
      analyzeVideoByUrl: async (input) => {
        const { providers: providerChain } = await resolveVideoReverseProviderChain(
          "video_url",
          input.runtime?.apiFallbackOrder,
        );
        if (providerChain.length < 1) {
          throw resolveVideoReverseGatewayError(
            503,
            "PROVIDER_POLICY_MISSING",
            "video reverse provider chain is not configured",
            createCapabilityDiagnostics("video_reverse", []),
          );
        }
        const modelFallbackOrder = Array.isArray(input.runtime?.modelFallbackOrder)
          ? [...input.runtime.modelFallbackOrder]
          : undefined;
        let systemPromptForCall: string;
        let userPromptForCall: string;
        if (input.systemPrompt) {
          systemPromptForCall = input.systemPrompt;
          userPromptForCall = "";
        } else {
          const { system, user } = await skillLoader.render(PROMPT_CODE_VIDEO_REVERSE_ANALYSIS, {});
          systemPromptForCall = system;
          userPromptForCall = user;
        }
        // 直接调用第一个 provider/model，失败时直接报错
        const provider = providerChain[0];
        const models = resolveModelFallbackOrder(provider, modelFallbackOrder);
        if (models.length < 1) {
          throw resolveVideoReverseGatewayError(
            503,
            "PROVIDER_MODEL_MISSING",
            "video reverse provider has no configured models",
            createCapabilityDiagnostics("video_reverse", []),
          );
        }
        const model = models[0];
        const providerForCall: ResolvedRouteProvider = {
          ...provider,
          model,
          timeoutMs: Number.isFinite(Number(input.runtime?.timeoutMs))
            ? Math.max(6_000, Math.min(240_000, Math.floor(Number(input.runtime?.timeoutMs))))
            : provider.timeoutMs,
        };

        let result: LlmPlainTextResult;
        try {
          result = await requestGeminiPlainTextWithVideoPart(
            providerForCall,
            systemPromptForCall,
            userPromptForCall,
            Math.max(0, Math.min(1, Number(input.runtime?.temperature ?? 0.3))),
            buildGeminiRemoteVideoPart(input.videoUrl, input.mimeType ?? "video/mp4"),
            { forceGeminiGrounding: input.runtime?.withGrounding !== false },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw resolveVideoReverseGatewayError(
            502,
            "VIDEO_REVERSE_FAILED",
            `视频反推分析失败: ${message}`,
            createCapabilityDiagnostics("video_reverse", [{
              capability: "video_reverse",
              apiId: provider.id,
              model,
              stage: "model_chain",
              status: "error",
              latencyMs: 0,
              errorCode: "UPSTREAM_ERROR",
              errorMessage: message,
              endpoint: null,
            }]),
          );
        }

        const output = result.text.trim();
        if (!output) {
          throw resolveVideoReverseGatewayError(
            502,
            "VIDEO_REVERSE_EMPTY_RESULT",
            "视频反推分析返回空结果",
            createCapabilityDiagnostics("video_reverse", [{
              capability: "video_reverse",
              apiId: provider.id,
              model,
              stage: "model_chain",
              status: "error",
              latencyMs: 0,
              errorCode: "VIDEO_REVERSE_EMPTY_RESULT",
              errorMessage: "视频反推分析返回空结果",
              endpoint: result.debugTrace?.endpoint ?? null,
            }]),
          );
        }
        if (isVideoReverseMissingSourceSignal(output)) {
          throw resolveVideoReverseGatewayError(
            502,
            "VIDEO_SOURCE_UNREADABLE",
            "未读取到有效视频内容，请提供可公网访问的视频直链后重试。",
            createCapabilityDiagnostics("video_reverse", [{
              capability: "video_reverse",
              apiId: provider.id,
              model,
              stage: "model_chain",
              status: "error",
              latencyMs: 0,
              errorCode: "VIDEO_SOURCE_UNREADABLE",
              errorMessage: "provider response indicates missing video input",
              endpoint: result.debugTrace?.endpoint ?? null,
            }]),
          );
        }

        return {
          text: output,
          raw: createVideoReverseGatewayRaw(result),
          diagnostics: createCapabilityDiagnostics("video_reverse", [{
            capability: "video_reverse",
            apiId: provider.id,
            model,
            stage: "model_chain",
            status: "success",
            latencyMs: 0,
            errorCode: null,
            errorMessage: null,
            endpoint: result.debugTrace?.endpoint ?? null,
          }]),
        };
      },
    },
    uploadGateway: {
      analyzeUploadedVideo: async (input) => {
        const { providers: providerChain } = await resolveVideoReverseProviderChain(
          "upload_file",
          input.runtime?.apiFallbackOrder,
        );
        if (providerChain.length < 1) {
          throw resolveVideoReverseGatewayError(
            503,
            "PROVIDER_POLICY_MISSING",
            "video reverse provider chain is not configured",
            createCapabilityDiagnostics("video_reverse", []),
          );
        }
        const modelFallbackOrder = Array.isArray(input.runtime?.modelFallbackOrder)
          ? [...input.runtime.modelFallbackOrder]
          : undefined;
        let systemPromptForCall: string;
        let userPromptForCall: string;
        if (input.systemPrompt) {
          systemPromptForCall = input.systemPrompt;
          userPromptForCall = "";
        } else {
          const { system, user } = await skillLoader.render(PROMPT_CODE_VIDEO_REVERSE_ANALYSIS, {});
          systemPromptForCall = system;
          userPromptForCall = user;
        }
        // 直接调用第一个 provider/model，失败时直接报错
        const provider = providerChain[0];
        const models = resolveModelFallbackOrder(provider, modelFallbackOrder);
        if (models.length < 1) {
          throw resolveVideoReverseGatewayError(
            503,
            "PROVIDER_MODEL_MISSING",
            "video reverse provider has no configured models",
            createCapabilityDiagnostics("video_reverse", []),
          );
        }
        const model = models[0];
        const providerForCall: ResolvedRouteProvider = {
          ...provider,
          model,
          timeoutMs: Number.isFinite(Number(input.runtime?.timeoutMs))
            ? Math.max(6_000, Math.min(240_000, Math.floor(Number(input.runtime?.timeoutMs))))
            : provider.timeoutMs,
        };

        let result: LlmPlainTextResult;
        try {
          result = await requestGeminiPlainTextWithVideoPart(
            providerForCall,
            systemPromptForCall,
            userPromptForCall,
            Math.max(0, Math.min(1, Number(input.runtime?.temperature ?? 0.3))),
            buildGeminiInlineVideoPart(input.videoBase64, input.mimeType),
            { forceGeminiGrounding: input.runtime?.withGrounding !== false },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw resolveVideoReverseGatewayError(
            502,
            "VIDEO_REVERSE_FAILED",
            `视频反推分析失败: ${message}`,
            createCapabilityDiagnostics("video_reverse", [{
              capability: "video_reverse",
              apiId: provider.id,
              model,
              stage: "model_chain",
              status: "error",
              latencyMs: 0,
              errorCode: "UPSTREAM_ERROR",
              errorMessage: message,
              endpoint: null,
            }]),
          );
        }

        const output = result.text.trim();
        if (!output) {
          throw resolveVideoReverseGatewayError(
            502,
            "VIDEO_REVERSE_EMPTY_RESULT",
            "视频反推分析返回空结果",
            createCapabilityDiagnostics("video_reverse", [{
              capability: "video_reverse",
              apiId: provider.id,
              model,
              stage: "model_chain",
              status: "error",
              latencyMs: 0,
              errorCode: "VIDEO_REVERSE_EMPTY_RESULT",
              errorMessage: "视频反推分析返回空结果",
              endpoint: result.debugTrace?.endpoint ?? null,
            }]),
          );
        }
        if (isVideoReverseMissingSourceSignal(output)) {
          throw resolveVideoReverseGatewayError(
            502,
            "VIDEO_SOURCE_UNREADABLE",
            "未读取到有效视频内容，请检查上传视频是否可解析后重试。",
            createCapabilityDiagnostics("video_reverse", [{
              capability: "video_reverse",
              apiId: provider.id,
              model,
              stage: "model_chain",
              status: "error",
              latencyMs: 0,
              errorCode: "VIDEO_SOURCE_UNREADABLE",
              errorMessage: "provider response indicates missing video input",
              endpoint: result.debugTrace?.endpoint ?? null,
            }]),
          );
        }

        return {
          text: output,
          raw: createVideoReverseGatewayRaw(result),
          diagnostics: createCapabilityDiagnostics("video_reverse", [{
            capability: "video_reverse",
            apiId: provider.id,
            model,
            stage: "model_chain",
            status: "success",
            latencyMs: 0,
            errorCode: null,
            errorMessage: null,
            endpoint: result.debugTrace?.endpoint ?? null,
          }]),
        };
      },
    },
  });

  return {
    videoReverseAnalysisService,
    resolveVideoReverseProviderChain,
  };
}