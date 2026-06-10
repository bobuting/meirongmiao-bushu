export const STEP1_REMOVE_BG_CONTRACT_VERSION = "AT48-05.v1";

export type Step1RemoveBgImageTarget = "main" | "other";
export type Step1RemoveBgResultStatus = "succeeded" | "failed";
export type Step1RemoveBgMode = "provider" | "fallback";

export interface Step1RemoveBgRequestDto {
  imageUrl: string;
  imageId?: string | null;
  fileName?: string | null;
  moduleId?: string | null;
  target?: Step1RemoveBgImageTarget;
  viewIndex?: number | null;
  retry?: boolean;
}

export interface Step1RemoveBgRequest {
  imageUrl: string;
  imageId: string | null;
  fileName: string | null;
  moduleId: string | null;
  target: Step1RemoveBgImageTarget;
  viewIndex: number | null;
  retry: boolean;
}

export interface Step1RemoveBgResultDto {
  taskId: string;
  status: Step1RemoveBgResultStatus;
  mode: Step1RemoveBgMode;
  sourceImageUrl: string;
  outputImageUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

function toTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeViewIndex(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const integer = Math.floor(parsed);
  if (integer < 0 || integer > 2) {
    return null;
  }
  return integer;
}

export function normalizeStep1RemoveBgRequest(raw: unknown):
  | { ok: true; value: Step1RemoveBgRequest }
  | { ok: false; code: string; message: string } {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const imageUrl = toTrimmedString(source.imageUrl);
  if (!imageUrl) {
    return {
      ok: false,
      code: "STEP1_REMOVE_BG_IMAGE_URL_REQUIRED",
      message: "imageUrl is required",
    };
  }
  const target: Step1RemoveBgImageTarget = source.target === "other" ? "other" : "main";
  const viewIndex = normalizeViewIndex(source.viewIndex);
  if (target === "main" && viewIndex !== null) {
    return {
      ok: false,
      code: "STEP1_REMOVE_BG_VIEW_INDEX_INVALID",
      message: "viewIndex must be null when target=main",
    };
  }
  if (target === "other" && viewIndex === null) {
    return {
      ok: false,
      code: "STEP1_REMOVE_BG_VIEW_INDEX_REQUIRED",
      message: "viewIndex is required when target=other",
    };
  }
  return {
    ok: true,
    value: {
      imageUrl,
      imageId: toNullableString(source.imageId),
      fileName: toNullableString(source.fileName)?.slice(0, 120) ?? null,
      moduleId: toNullableString(source.moduleId),
      target,
      viewIndex,
      retry: source.retry === true,
    },
  };
}

export function buildStep1RemoveBgFallbackUrl(sourceImageUrl: string, seed: string): string {
  const token = `step1_white_bg=${encodeURIComponent(seed)}`;
  if (/^data:image\//i.test(sourceImageUrl)) {
    return sourceImageUrl.includes("#") ? `${sourceImageUrl}&${token}` : `${sourceImageUrl}#${token}`;
  }
  try {
    const parsed = new URL(sourceImageUrl);
    parsed.searchParams.set("step1_white_bg", seed);
    return parsed.toString();
  } catch {
    const joiner = sourceImageUrl.includes("?") ? "&" : "?";
    return `${sourceImageUrl}${joiner}${token}`;
  }
}
