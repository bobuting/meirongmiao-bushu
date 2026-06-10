export const VIDEO_REVERSE_ANALYSIS_CONTRACT_VERSION = "AT29-02.v1";

export const VIDEO_REVERSE_ANALYSIS_SOURCE_TYPES = ["video_url", "upload_file"] as const;

export type VideoReverseAnalysisSourceType = (typeof VIDEO_REVERSE_ANALYSIS_SOURCE_TYPES)[number];

export const VIDEO_REVERSE_ANALYSIS_INVARIANTS = [
  "All video reverse requests must provide a trimmed non-empty userGoal.",
  "video_url requests carry a real downloadable videoUrl and must not include videoBase64 payloads.",
  "upload_file requests carry videoBase64 plus mimeType and must not include videoUrl payloads.",
  "filename metadata is reserved for upload_file requests and must stay unset for video_url requests.",
] as const;

export interface VideoReverseRuntimeOptions {
  readonly apiFallbackOrder?: readonly string[];
  readonly modelFallbackOrder?: readonly string[];
  readonly timeoutMs?: number;
  readonly withGrounding?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
}

interface VideoReverseAnalysisBaseInput {
  readonly userGoal: string;
  readonly locale?: string;
  readonly runtime?: VideoReverseRuntimeOptions;
}

export interface VideoReverseUrlAnalysisInput extends VideoReverseAnalysisBaseInput {
  readonly sourceType: "video_url";
  readonly videoUrl: string;
  readonly mimeType?: string;
  readonly filename?: never;
  readonly videoBase64?: never;
}

export interface VideoReverseUploadAnalysisInput extends VideoReverseAnalysisBaseInput {
  readonly sourceType: "upload_file";
  readonly videoBase64: string;
  readonly mimeType: string;
  readonly filename?: string;
  readonly videoUrl?: never;
}

export type VideoReverseAnalysisInput = VideoReverseUrlAnalysisInput | VideoReverseUploadAnalysisInput;

export type VideoReverseAnalysisValidationIssueCode =
  | "input_object_required"
  | "user_goal_required"
  | "invalid_source_type"
  | "source_payload_conflict"
  | "video_url_required"
  | "video_base64_required"
  | "mime_type_required"
  | "filename_only_for_upload";

export interface VideoReverseAnalysisValidationIssue {
  readonly code: VideoReverseAnalysisValidationIssueCode;
  readonly field: "sourceType" | "userGoal" | "videoUrl" | "videoBase64" | "mimeType" | "filename" | null;
  readonly message: string;
}

export interface VideoReverseAnalysisValidationResult {
  readonly ok: boolean;
  readonly issues: readonly VideoReverseAnalysisValidationIssue[];
  readonly normalizedInput?: VideoReverseAnalysisInput;
}

export function isVideoReverseAnalysisSourceType(value: unknown): value is VideoReverseAnalysisSourceType {
  return value === "video_url" || value === "upload_file";
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
  return entries.length > 0 ? entries : undefined;
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function normalizeVideoReverseRuntimeOptions(value: unknown): VideoReverseRuntimeOptions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const apiFallbackOrder = normalizeStringList(record.apiFallbackOrder);
  const modelFallbackOrder = normalizeStringList(record.modelFallbackOrder);
  const timeoutMs = normalizeFiniteNumber(record.timeoutMs);
  const withGrounding = normalizeBoolean(record.withGrounding);
  const temperature = normalizeFiniteNumber(record.temperature);
  const topP = normalizeFiniteNumber(record.topP);
  if (
    apiFallbackOrder === undefined &&
    modelFallbackOrder === undefined &&
    timeoutMs === undefined &&
    withGrounding === undefined &&
    temperature === undefined &&
    topP === undefined
  ) {
    return undefined;
  }
  return {
    ...(apiFallbackOrder ? { apiFallbackOrder } : {}),
    ...(modelFallbackOrder ? { modelFallbackOrder } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(withGrounding !== undefined ? { withGrounding } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
  };
}

export function validateVideoReverseAnalysisInput(value: unknown): VideoReverseAnalysisValidationResult {
  if (!value || typeof value !== "object") {
    return {
      ok: false,
      issues: [
        {
          code: "input_object_required",
          field: null,
          message: "video reverse analysis input must be an object",
        },
      ],
    };
  }

  const record = value as Record<string, unknown>;
  const sourceType = normalizeString(record.sourceType);
  const userGoal = normalizeString(record.userGoal);
  const locale = normalizeString(record.locale);
  const videoUrl = normalizeString(record.videoUrl);
  const videoBase64 = normalizeString(record.videoBase64);
  const mimeType = normalizeString(record.mimeType);
  const filename = normalizeString(record.filename);
  const runtime = normalizeVideoReverseRuntimeOptions(record.runtime);
  const issues: VideoReverseAnalysisValidationIssue[] = [];

  if (!userGoal) {
    issues.push({
      code: "user_goal_required",
      field: "userGoal",
      message: "userGoal is required",
    });
  }

  if (!isVideoReverseAnalysisSourceType(sourceType)) {
    issues.push({
      code: "invalid_source_type",
      field: "sourceType",
      message: "sourceType must be video_url or upload_file",
    });
  }

  if (videoUrl && videoBase64) {
    issues.push({
      code: "source_payload_conflict",
      field: null,
      message: "videoUrl and videoBase64 must never coexist in the same request",
    });
  }

  if (sourceType === "video_url") {
    if (!videoUrl) {
      issues.push({
        code: "video_url_required",
        field: "videoUrl",
        message: "videoUrl is required when sourceType=video_url",
      });
    }
    if (videoBase64) {
      issues.push({
        code: "source_payload_conflict",
        field: "videoBase64",
        message: "video_url requests must not include videoBase64",
      });
    }
    if (filename) {
      issues.push({
        code: "filename_only_for_upload",
        field: "filename",
        message: "filename is only supported for upload_file requests",
      });
    }
  }

  if (sourceType === "upload_file") {
    if (!videoBase64) {
      issues.push({
        code: "video_base64_required",
        field: "videoBase64",
        message: "videoBase64 is required when sourceType=upload_file",
      });
    }
    if (!mimeType) {
      issues.push({
        code: "mime_type_required",
        field: "mimeType",
        message: "mimeType is required when sourceType=upload_file",
      });
    }
    if (videoUrl) {
      issues.push({
        code: "source_payload_conflict",
        field: "videoUrl",
        message: "upload_file requests must not include videoUrl",
      });
    }
  }

  if (issues.length > 0 || !isVideoReverseAnalysisSourceType(sourceType) || !userGoal) {
    return {
      ok: false,
      issues,
    };
  }

  if (sourceType === "video_url") {
    return {
      ok: true,
      issues,
      normalizedInput: {
        sourceType,
        userGoal,
        ...(locale ? { locale } : {}),
        videoUrl: videoUrl as string,
        ...(mimeType ? { mimeType } : {}),
        ...(runtime ? { runtime } : {}),
      },
    };
  }

  return {
    ok: true,
    issues,
    normalizedInput: {
      sourceType,
      userGoal,
      ...(locale ? { locale } : {}),
      videoBase64: videoBase64 as string,
      mimeType: mimeType as string,
      ...(filename ? { filename } : {}),
      ...(runtime ? { runtime } : {}),
    },
  };
}
