export const VIDEO_REVERSE_MULTIPART_CONTRACT_VERSION = "AT29-04.v1";
export const VIDEO_REVERSE_MULTIPART_FILE_FIELD = "video";
export const MAX_VIDEO_REVERSE_MULTIPART_BYTES = 50 * 1024 * 1024;

export const VIDEO_REVERSE_MULTIPART_TEXT_FIELDS = ["userGoal", "locale", "runtime"] as const;
export type VideoReverseMultipartTextField = (typeof VIDEO_REVERSE_MULTIPART_TEXT_FIELDS)[number];

export const VIDEO_REVERSE_MULTIPART_ACCEPTED_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".webm",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
] as const;

export const VIDEO_REVERSE_MULTIPART_ACCEPTED_MIME_PREFIXES = ["video/", "audio/"] as const;

export const VIDEO_REVERSE_MULTIPART_INVARIANTS = [
  "The multipart upload path accepts exactly one file field named video.",
  "Multipart text fields are limited to userGoal, locale, and runtime; videoUrl must stay out of this path.",
  "runtime is an optional JSON string field and must parse before the upload request reaches the shared service.",
  "Upload-file reverse accepts the current video/audio extension set and rejects files above the frozen 50 MiB budget.",
] as const;

export type VideoReverseMultipartIssueCode =
  | "file_field_required"
  | "invalid_file_field"
  | "file_name_required"
  | "unsupported_file_extension"
  | "mime_type_required"
  | "unsupported_mime_type"
  | "file_size_required"
  | "file_size_exceeded"
  | "unexpected_text_field"
  | "runtime_json_invalid";

export interface VideoReverseMultipartIssue {
  readonly code: VideoReverseMultipartIssueCode;
  readonly field: string;
  readonly message: string;
}

export interface VideoReverseMultipartEnvelope {
  readonly fileFieldName?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly textFields?: readonly string[];
  readonly runtimeRaw?: string;
}

export function isVideoReverseMultipartTextField(value: unknown): value is VideoReverseMultipartTextField {
  return value === "userGoal" || value === "locale" || value === "runtime";
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseVideoReverseMultipartRuntime(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(trimmed),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid runtime JSON",
    };
  }
}

export function isSupportedVideoReverseMultipartFileName(fileName: unknown): fileName is string {
  const normalized = normalizeString(fileName);
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();
  return VIDEO_REVERSE_MULTIPART_ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isSupportedVideoReverseMultipartMimeType(mimeType: unknown): mimeType is string {
  const normalized = normalizeString(mimeType);
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();
  return VIDEO_REVERSE_MULTIPART_ACCEPTED_MIME_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function validateVideoReverseMultipartEnvelope(
  envelope: VideoReverseMultipartEnvelope,
): readonly VideoReverseMultipartIssue[] {
  const issues: VideoReverseMultipartIssue[] = [];
  const fileFieldName = normalizeString(envelope.fileFieldName);
  const fileName = normalizeString(envelope.fileName);
  const mimeType = normalizeString(envelope.mimeType);
  const sizeBytes = typeof envelope.sizeBytes === "number" && Number.isFinite(envelope.sizeBytes) ? envelope.sizeBytes : undefined;
  const textFields = envelope.textFields ?? [];

  if (!fileFieldName) {
    issues.push({
      code: "file_field_required",
      field: VIDEO_REVERSE_MULTIPART_FILE_FIELD,
      message: "multipart upload requires a file field named video",
    });
  } else if (fileFieldName !== VIDEO_REVERSE_MULTIPART_FILE_FIELD) {
    issues.push({
      code: "invalid_file_field",
      field: fileFieldName,
      message: "multipart upload must use the video field name",
    });
  }

  if (!fileName) {
    issues.push({
      code: "file_name_required",
      field: "fileName",
      message: "multipart upload requires a non-empty file name",
    });
  } else if (!isSupportedVideoReverseMultipartFileName(fileName)) {
    issues.push({
      code: "unsupported_file_extension",
      field: "fileName",
      message: "multipart upload only supports the frozen video/audio extension allowlist",
    });
  }

  if (!mimeType) {
    issues.push({
      code: "mime_type_required",
      field: "mimeType",
      message: "multipart upload requires a mimeType",
    });
  } else if (!isSupportedVideoReverseMultipartMimeType(mimeType)) {
    issues.push({
      code: "unsupported_mime_type",
      field: "mimeType",
      message: "multipart upload only supports video/* or audio/* mime types",
    });
  }

  if (sizeBytes === undefined || sizeBytes <= 0) {
    issues.push({
      code: "file_size_required",
      field: "sizeBytes",
      message: "multipart upload requires a positive sizeBytes value",
    });
  } else if (sizeBytes > MAX_VIDEO_REVERSE_MULTIPART_BYTES) {
    issues.push({
      code: "file_size_exceeded",
      field: "sizeBytes",
      message: "multipart upload exceeds the frozen 50 MiB contract limit",
    });
  }

  for (const fieldName of textFields) {
    if (!isVideoReverseMultipartTextField(fieldName)) {
      issues.push({
        code: "unexpected_text_field",
        field: fieldName,
        message: "multipart upload only accepts userGoal, locale, and runtime text fields",
      });
    }
  }

  const runtimeRaw = normalizeString(envelope.runtimeRaw) ?? "";
  const runtimeResult = parseVideoReverseMultipartRuntime(runtimeRaw);
  if (!runtimeResult.ok) {
    issues.push({
      code: "runtime_json_invalid",
      field: "runtime",
      message: runtimeResult.error,
    });
  }

  return issues;
}
