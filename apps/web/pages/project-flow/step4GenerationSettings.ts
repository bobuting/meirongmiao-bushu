import type React from "react";

export type Step4PreviewRatio = "1:1" | "3:4" | "9:16" | "16:9";
export type Step4PreviewResolution = "1k" | "2k" | "4k";

export interface Step4PreviewSettings {
  ratio: Step4PreviewRatio;
  resolution: Step4PreviewResolution;
  sharpness: number;
}

export const STEP4_DEFAULT_PREVIEW_SETTINGS: Step4PreviewSettings = {
  ratio: "9:16",
  resolution: "2k",
  sharpness: 70,
};

export const STEP4_PREVIEW_RATIO_OPTIONS: Array<{ value: Step4PreviewRatio; label: string }> = [
  { value: "9:16", label: "9:16" },
  { value: "3:4", label: "3:4" },
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
];

export const STEP4_PREVIEW_RESOLUTION_OPTIONS: Array<{ value: Step4PreviewResolution; label: string }> = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

export const STEP4_PREVIEW_RATIO_CLASS_NAME: Record<Step4PreviewRatio, string> = {
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

export function normalizeStep4PreviewRatio(value: unknown): Step4PreviewRatio {
  return value === "1:1" || value === "3:4" || value === "9:16" || value === "16:9"
    ? value
    : STEP4_DEFAULT_PREVIEW_SETTINGS.ratio;
}

export function normalizeStep4PreviewResolution(value: unknown): Step4PreviewResolution {
  return value === "1k" || value === "2k" || value === "4k"
    ? value
    : STEP4_DEFAULT_PREVIEW_SETTINGS.resolution;
}

export function normalizeStep4PreviewSharpness(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return STEP4_DEFAULT_PREVIEW_SETTINGS.sharpness;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function buildStep4PreviewImageFilter(sharpness: number): string {
  const normalized = normalizeStep4PreviewSharpness(sharpness);
  const contrast = 1 + normalized / 200;
  const saturate = 0.95 + normalized / 200;
  return `contrast(${contrast.toFixed(2)}) saturate(${saturate.toFixed(2)})`;
}

export function resolveStep4MainPreviewAspectClassName(ratio: Step4PreviewRatio): string {
  return STEP4_PREVIEW_RATIO_CLASS_NAME[normalizeStep4PreviewRatio(ratio)];
}

export function toStep4BackendRatio(ratio: Step4PreviewRatio): "1:1" | "3:4" | "9:16" | "16:9" {
  return normalizeStep4PreviewRatio(ratio);
}

export function buildStep4PreviewImageStyle(sharpness: number): React.CSSProperties {
  return {
    filter: buildStep4PreviewImageFilter(sharpness),
  };
}
