import type { CapabilityDiagnostics } from "../services/llm/provider-resolver.js";
import { AppError } from "../core/errors.js";
import {
  buildVideoReverseVideoMeta,
  type VideoReverseAnalysisOutput,
  type VideoReverseAnalysisServiceDependencies,
  type VideoReverseAnalysisServicePort,
} from "../contracts/video-reverse-analysis-service.js";
import type { VideoReverseAnalysisInput } from "../contracts/video-reverse-analysis.js";
import { skillLoader } from "../services/skills/index.js";

const VIDEO_REVERSE_PROMPT_CODE = "video_storyboard_analysis";

export class VideoReverseAnalysisServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly diagnostics: CapabilityDiagnostics;

  constructor(statusCode: number, code: string, message: string, diagnostics: CapabilityDiagnostics) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

/**
 * 构建视频反推分析提示词（从提示词管理系统获取）
 */
async function buildVideoReverseAnalysisPrompt(
  input: Pick<VideoReverseAnalysisInput, "locale" | "userGoal">
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const locale = input.locale?.trim() || "zh-CN";
  const userGoal = input.userGoal?.trim() || "分析视频内容并提供可复刻的脚本建议";

  const { system, user } = await skillLoader.render(VIDEO_REVERSE_PROMPT_CODE, { variables: { locale, userGoal } });
  return { systemPrompt: system, userPrompt: user };
}

function resolveModelFromDiagnostics(defaultModel: string, diagnostics: CapabilityDiagnostics): string {
  for (let index = diagnostics.attempts.length - 1; index >= 0; index -= 1) {
    const attempt = diagnostics.attempts[index];
    if (attempt?.status === "success" && attempt.model.trim().length > 0) {
      return attempt.model.trim();
    }
  }
  return defaultModel;
}

function estimateUploadBytes(input: VideoReverseAnalysisInput): number | null {
  if (input.sourceType !== "upload_file") {
    return null;
  }
  return Buffer.from(input.videoBase64, "base64").byteLength;
}

export function createVideoReverseAnalysisService(
  deps: VideoReverseAnalysisServiceDependencies,
): VideoReverseAnalysisServicePort {
  return {
    async run(input: VideoReverseAnalysisInput): Promise<VideoReverseAnalysisOutput> {
      const { systemPrompt, userPrompt } = await buildVideoReverseAnalysisPrompt(input);
      const gatewayResult =
        input.sourceType === "video_url"
          ? await deps.urlGateway.analyzeVideoByUrl({
              model: deps.defaultModel,
              systemPrompt,
              prompt: userPrompt,
              videoUrl: input.videoUrl,
              mimeType: input.mimeType,
              runtime: input.runtime,
            })
          : await deps.uploadGateway.analyzeUploadedVideo({
              model: deps.defaultModel,
              systemPrompt,
              prompt: userPrompt,
              videoBase64: input.videoBase64,
              mimeType: input.mimeType,
              filename: input.filename,
              runtime: input.runtime,
            });

      return {
        result: gatewayResult.text.trim(),
        model: resolveModelFromDiagnostics(deps.defaultModel, gatewayResult.diagnostics),
        raw: gatewayResult.raw,
        diagnostics: gatewayResult.diagnostics,
        videoMeta: buildVideoReverseVideoMeta(input, {
          bytes: estimateUploadBytes(input),
        }),
      };
    },
  };
}

export interface SharedVideoUrlReversePipelineInput {
  readonly analysisService: VideoReverseAnalysisServicePort;
  readonly userGoal: string;
  readonly candidateVideoUrls: readonly string[];
  readonly mimeType?: string | null;
  readonly runtime?: VideoReverseAnalysisInput["runtime"];
}

export interface SharedVideoUrlReversePipelineResult {
  readonly resolvedVideoUrl: string;
  readonly output: VideoReverseAnalysisOutput;
}

export async function runSharedVideoUrlReversePipeline(
  input: SharedVideoUrlReversePipelineInput,
): Promise<SharedVideoUrlReversePipelineResult> {
  let lastVideoUrlError: unknown = null;

  for (let candidateIndex = 0; candidateIndex < input.candidateVideoUrls.length; candidateIndex += 1) {
    const candidateVideoUrl = input.candidateVideoUrls[candidateIndex];
    try {
      const output = await input.analysisService.run({
        sourceType: "video_url",
        userGoal: input.userGoal,
        videoUrl: candidateVideoUrl,
        mimeType: input.mimeType ?? undefined,
        runtime: input.runtime,
      });
      return {
        resolvedVideoUrl: candidateVideoUrl,
        output,
      };
    } catch (error) {
      lastVideoUrlError = error;
      const candidateCode =
        error instanceof VideoReverseAnalysisServiceError
          ? error.code
          : error instanceof AppError
            ? error.code
            : "";
      const isProviderConfigurationError =
        candidateCode === "PROVIDER_POLICY_MISSING" ||
        candidateCode === "ROUTE_PROVIDER_MISSING" ||
        candidateCode === "PROVIDER_POLICY_DISABLED";
      if (isProviderConfigurationError || candidateIndex >= input.candidateVideoUrls.length - 1) {
        throw error;
      }
    }
  }

  throw (lastVideoUrlError instanceof Error ? lastVideoUrlError : new Error("VIDEO_REVERSE_FAILED"));
}