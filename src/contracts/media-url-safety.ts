export const MAX_SAFE_MEDIA_URL_LENGTH = 8_192;
export const MEDIA_URL_SAFETY_CONTRACT_VERSION = "AT28-02.v1";

export const MEDIA_URL_SAFETY_INVARIANTS = [
  "Scene and workflow URL fields must never persist inline data URLs.",
  "HTTP(S) URLs remain valid safe references when they stay under the length ceiling.",
  "Relative object-storage URLs under /storage/objects/ remain valid safe references.",
  "Whitespace-only, overlong, and non-http(s)/non-object-storage values sanitize to null.",
] as const;

export type MediaUrlKind = "empty" | "data_url" | "remote_url" | "object_storage_url" | "unsafe_url" | "too_long";

export interface ScriptSegmentRef {
  readonly sceneImageUrl?: string | null;
}

export interface WorkflowStatePayload {
  readonly step: number;
  readonly workflow: Record<string, unknown>;
  readonly projectData: ({
    readonly script?: readonly ScriptSegmentRef[];
  } & Record<string, unknown>) | null;
}

function normalizeUrlCandidate(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasEmbeddedWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function isRemoteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isObjectStorageUrl(value: string): boolean {
  return /^\/storage\/objects(?:\/[^\s]*)?$/i.test(value);
}

export function isDataUrl(value: unknown): boolean {
  const trimmed = normalizeUrlCandidate(value);
  return /^data:/i.test(trimmed);
}

export function classifyMediaUrl(
  value: unknown,
  options?: {
    readonly maxLength?: number;
  },
): MediaUrlKind {
  const trimmed = normalizeUrlCandidate(value);
  if (trimmed.length === 0) {
    return "empty";
  }

  const maxLength = options?.maxLength ?? MAX_SAFE_MEDIA_URL_LENGTH;
  if (trimmed.length > maxLength) {
    return "too_long";
  }

  if (isDataUrl(trimmed)) {
    return "data_url";
  }

  if (hasEmbeddedWhitespace(trimmed)) {
    return "unsafe_url";
  }

  if (isObjectStorageUrl(trimmed)) {
    return "object_storage_url";
  }

  if (isRemoteUrl(trimmed)) {
    return "remote_url";
  }

  return "unsafe_url";
}

export function sanitizeUrlField(
  value: unknown,
  options?: {
    readonly maxLength?: number;
  },
): string | null {
  const trimmed = normalizeUrlCandidate(value);
  const kind = classifyMediaUrl(trimmed, options);
  if (kind === "remote_url" || kind === "object_storage_url") {
    return trimmed;
  }
  return null;
}

export function stripDataUrlsFromScriptSegments<T extends ScriptSegmentRef>(segments: readonly T[]): T[] {
  return segments.map((segment) => {
    if (!isDataUrl(segment.sceneImageUrl)) {
      return segment;
    }
    return {
      ...segment,
      sceneImageUrl: null,
    };
  });
}
