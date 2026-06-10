import type { CapabilityDiagnostics } from "../services/llm/provider-resolver";
import type { VideoReverseAnalysisInput, VideoReverseRuntimeOptions } from "./video-reverse-analysis";

export const VIDEO_REVERSE_ANALYSIS_SERVICE_CONTRACT_VERSION = "AT49-04.v1";
export const DEFAULT_VIDEO_REVERSE_MIME_TYPE = "video/mp4";
export const VIDEO_REVERSE_GATEWAY_KINDS = ["url_gateway", "upload_gateway"] as const;
export const VIDEO_REVERSE_SHARED_PIPELINE_SOURCE_TYPE = "video_url" as const;
export const VIDEO_REVERSE_SHARED_PIPELINE_ENTRY_POINTS = [
  "reverse_parse_v2_video_url",
  "hot_trend_video_batch",
] as const;

export type VideoReverseGatewayKind = (typeof VIDEO_REVERSE_GATEWAY_KINDS)[number];
export type VideoReverseSharedPipelineEntryPoint = (typeof VIDEO_REVERSE_SHARED_PIPELINE_ENTRY_POINTS)[number];

export const VIDEO_REVERSE_ANALYSIS_SERVICE_INVARIANTS = [
  "Route handlers must depend on VideoReverseAnalysisServicePort instead of provider-specific SDK calls.",
  "video_url inputs dispatch through the URL gateway while upload_file inputs dispatch through the upload gateway.",
  "Both gateway ports return the same text/raw/diagnostics envelope so the service can normalize output once.",
  "The shared service output must preserve sourceType and source metadata without rewriting a URL request into upload mode.",
  "reverse/parse-v2(video_url) and hot-trend batch reverse must enter the same shared video_url service pipeline.",
  "Shared video_url pipeline responses must keep storyboard-ready markdown payloads for downstream panel/report mapping.",
] as const;

export interface VideoReverseGatewayResponse {
  readonly text: string;
  readonly raw: unknown;
  readonly diagnostics: CapabilityDiagnostics;
}

export interface VideoReverseUrlGatewayRequest {
  readonly model: string;
  readonly systemPrompt?: string;
  readonly prompt: string;
  readonly videoUrl: string;
  readonly mimeType?: string;
  readonly runtime?: VideoReverseRuntimeOptions;
}

export interface VideoReverseUploadGatewayRequest {
  readonly model: string;
  readonly systemPrompt?: string;
  readonly prompt: string;
  readonly videoBase64: string;
  readonly mimeType: string;
  readonly filename?: string;
  readonly runtime?: VideoReverseRuntimeOptions;
}

export interface VideoReverseUrlGatewayPort {
  analyzeVideoByUrl(input: VideoReverseUrlGatewayRequest): Promise<VideoReverseGatewayResponse>;
}

export interface VideoReverseUploadGatewayPort {
  analyzeUploadedVideo(input: VideoReverseUploadGatewayRequest): Promise<VideoReverseGatewayResponse>;
}

export interface VideoReverseAnalysisOutput {
  readonly result: string;
  readonly model: string;
  readonly raw: unknown;
  readonly diagnostics: CapabilityDiagnostics;
  readonly videoMeta: {
    readonly sourceType: VideoReverseAnalysisInput["sourceType"];
    readonly videoUrl?: string;
    readonly filename?: string;
    readonly mimeType: string;
    readonly bytes: number | null;
  };
}

export interface VideoReverseAnalysisServiceDependencies {
  readonly urlGateway: VideoReverseUrlGatewayPort;
  readonly uploadGateway: VideoReverseUploadGatewayPort;
  readonly defaultModel: string;
}

export interface VideoReverseAnalysisServicePort {
  run(input: VideoReverseAnalysisInput): Promise<VideoReverseAnalysisOutput>;
}

export function isVideoReverseSharedPipelineEntryPoint(value: string): value is VideoReverseSharedPipelineEntryPoint {
  return (VIDEO_REVERSE_SHARED_PIPELINE_ENTRY_POINTS as readonly string[]).includes(value);
}

export function resolveVideoReverseGatewayKind(input: VideoReverseAnalysisInput): VideoReverseGatewayKind {
  return input.sourceType === "video_url" ? "url_gateway" : "upload_gateway";
}

export function buildVideoReverseVideoMeta(
  input: VideoReverseAnalysisInput,
  options?: {
    readonly bytes?: number | null;
  },
): VideoReverseAnalysisOutput["videoMeta"] {
  const bytes = options?.bytes ?? null;
  if (input.sourceType === "video_url") {
    return {
      sourceType: "video_url",
      videoUrl: input.videoUrl,
      mimeType: input.mimeType ?? DEFAULT_VIDEO_REVERSE_MIME_TYPE,
      bytes,
    };
  }

  return {
    sourceType: "upload_file",
    filename: input.filename,
    mimeType: input.mimeType,
    bytes,
  };
}
