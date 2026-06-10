import {
  normalizeStep4Step3HandoffPayload,
  type Step4Step3HandoffPayload,
} from "../../../../../src/contracts/step4-video-workspace-contract";
import {
  resolveStep3FrameParameters,
  type Step3FrameParameterOverride,
} from "../../../../../src/contracts/step3-frame-parameter-contract";
import {
  normalizeStep3FrameOverrideState,
  resolveStep3FrameOverrideKey,
  type Step3FrameOverrideState,
} from "../step3-workspace/step3FrameOverrideController";
import type { Step4PreviewRatio, Step4PreviewResolution } from "../step4GenerationSettings";

export interface Step3Step4HandoffSegmentInput {
  title: string;
  content: string;
  visualCue: string;
  videoCue?: string;
  sceneImageUrl?: string | null;
  selectedCharacterReferenceId?: string | null;
}

export interface Step3Step4HandoffProjectDataPatch extends Record<string, unknown> {
  script: Step3Step4HandoffSegmentInput[];
  step4PreviewRatio: Step4PreviewRatio;
  step4PreviewResolution: Step4PreviewResolution;
  step4PreviewSharpness: number;
  step4FrameOverrideSettings: Step3FrameOverrideState;
  step4Step3HandoffPayload: Step4Step3HandoffPayload;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildStep3Step4HandoffProjectDataPatch(input: {
  projectId: string;
  scriptId: string | null;
  scriptVersion: number | null;
  segments: readonly Step3Step4HandoffSegmentInput[];
  step4PreviewRatio: Step4PreviewRatio;
  step4PreviewResolution: Step4PreviewResolution;
  step4PreviewSharpness: number;
  step4FrameOverrideSettings: unknown;
}): Step3Step4HandoffProjectDataPatch {
  const normalizedFrameOverrideSettings = normalizeStep3FrameOverrideState(input.step4FrameOverrideSettings);
  const handoffPayload = normalizeStep4Step3HandoffPayload({
    projectId: trimText(input.projectId),
    scriptId: trimText(input.scriptId) || null,
    scriptVersion:
      Number.isInteger(input.scriptVersion) && (input.scriptVersion as number) > 0
        ? String(input.scriptVersion)
        : null,
    referenceImageUrls: [],
    frames: input.segments.map((segment, index) => {
      const resolvedParameters = resolveStep3FrameParameters(
        {
          ratio: input.step4PreviewRatio,
          resolution: input.step4PreviewResolution,
        },
        normalizedFrameOverrideSettings[resolveStep3FrameOverrideKey(index + 1)] ?? ({} satisfies Step3FrameParameterOverride),
      );
      const sceneImageUrl = trimText(segment.sceneImageUrl) || null;
      const promptText = trimText(segment.videoCue) || trimText(segment.visualCue) || `镜头 ${index + 1} 画面提示词`;
      return {
        frameId: resolveStep3FrameOverrideKey(index + 1),
        promptText,
        imageUrl: sceneImageUrl,
        ratio: resolvedParameters.ratio,
        resolution: resolvedParameters.resolution,
        source: sceneImageUrl ? "selected-frame" : "text-fallback",
      };
    }),
  });

  return {
    script: [...input.segments],
    step4PreviewRatio: input.step4PreviewRatio,
    step4PreviewResolution: input.step4PreviewResolution,
    step4PreviewSharpness: Number.isFinite(input.step4PreviewSharpness) ? input.step4PreviewSharpness : 70,
    step4FrameOverrideSettings: normalizedFrameOverrideSettings,
    step4Step3HandoffPayload: handoffPayload,
  };
}

export function resolveStep4Step3HandoffPayload(projectData: Record<string, unknown>): Step4Step3HandoffPayload | null {
  const rawPayload = projectData.step4Step3HandoffPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  try {
    return normalizeStep4Step3HandoffPayload(rawPayload);
  } catch {
    return null;
  }
}

export function buildStep4SegmentsFromStep3Handoff(payload: Step4Step3HandoffPayload | null): Step3Step4HandoffSegmentInput[] {
  if (!payload) {
    return [];
  }
  return payload.frames.map((frame, index) => ({
    title: `镜头 ${index + 1}`,
    content: "",
    visualCue: frame.promptText,
    videoCue: frame.promptText,
    sceneImageUrl: frame.imageUrl,
    selectedCharacterReferenceId: null,
  }));
}
