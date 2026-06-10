import {
  resolveStep3FrameParameters,
  type Step3FrameParameterOverride,
  type Step3GlobalFrameParameters,
  type Step3ResolvedFrameParameters,
} from "../../../../../src/contracts/step3-frame-parameter-contract";

export type Step3FrameOverrideState = Record<string, Step3FrameParameterOverride>;

export interface Step3ResolvedFrameOverrideViewModel {
  frameKey: string;
  override: Step3FrameParameterOverride;
  resolved: Step3ResolvedFrameParameters;
  summary: string;
}

function normalizeOptionalRatio(
  value: Step3FrameParameterOverride["ratio"] | "" | undefined,
): Step3FrameParameterOverride["ratio"] {
  return value === "1:1" || value === "3:4" || value === "9:16" || value === "16:9" ? value : null;
}

function normalizeOptionalResolution(
  value: Step3FrameParameterOverride["resolution"] | "" | undefined,
): Step3FrameParameterOverride["resolution"] {
  return value === "1k" || value === "2k" || value === "4k" ? value : null;
}

export function resolveStep3FrameOverrideKey(frameIndex: number): string {
  return `step3-frame-${frameIndex}`;
}

export function normalizeStep3FrameOverrideState(input: unknown): Step3FrameOverrideState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const nextState: Step3FrameOverrideState = {};
  for (const [frameKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (!frameKey.trim() || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      continue;
    }
    const record = rawValue as Record<string, unknown>;
    const ratio = normalizeOptionalRatio(record.ratio as Step3FrameParameterOverride["ratio"] | "");
    const resolution = normalizeOptionalResolution(
      record.resolution as Step3FrameParameterOverride["resolution"] | "",
    );
    if (ratio === null && resolution === null) {
      continue;
    }
    nextState[frameKey] = {
      ratio,
      resolution,
    };
  }
  return nextState;
}

export function patchStep3FrameOverrideState(
  currentState: Step3FrameOverrideState,
  frameKey: string,
  patch: Partial<Step3FrameParameterOverride>,
): Step3FrameOverrideState {
  const current = currentState[frameKey] ?? {};
  const nextEntry: Step3FrameParameterOverride = {
    ratio: patch.ratio === undefined ? normalizeOptionalRatio(current.ratio) : normalizeOptionalRatio(patch.ratio),
    resolution:
      patch.resolution === undefined
        ? normalizeOptionalResolution(current.resolution)
        : normalizeOptionalResolution(patch.resolution),
  };
  if (nextEntry.ratio === null && nextEntry.resolution === null) {
    const { [frameKey]: _, ...rest } = currentState;
    return rest;
  }
  return {
    ...currentState,
    [frameKey]: nextEntry,
  };
}

export function buildStep3FrameOverrideSummary(resolved: Step3ResolvedFrameParameters): string {
  const ratioSuffix = resolved.ratioSource === "frame" ? "(单镜头)" : "";
  const resolutionSuffix = resolved.resolutionSource === "frame" ? "(单镜头)" : "";
  return `比例 ${resolved.ratio}${ratioSuffix} · 画质 ${resolved.resolution.toUpperCase()}${resolutionSuffix}`;
}

export function resolveStep3FrameOverrideViewModel(input: {
  frameIndex: number;
  global: Partial<Step3GlobalFrameParameters> | null | undefined;
  overrideState: Step3FrameOverrideState;
}): Step3ResolvedFrameOverrideViewModel {
  const frameKey = resolveStep3FrameOverrideKey(input.frameIndex);
  const override = input.overrideState[frameKey] ?? {};
  const resolved = resolveStep3FrameParameters(input.global, override);
  return {
    frameKey,
    override,
    resolved,
    summary: buildStep3FrameOverrideSummary(resolved),
  };
}
