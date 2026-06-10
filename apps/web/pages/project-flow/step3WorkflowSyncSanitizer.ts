import {
  stripDataUrlsFromScriptSegments,
  sanitizeUrlField,
  type ScriptSegmentRef,
} from "../../../../src/contracts/media-url-safety";

export interface Step3WorkflowProjectData extends Record<string, unknown> {
  script?: readonly ScriptSegmentRef[];
  step3SceneReferences?: unknown;
  step3PreviewCandidatesByFrame?: unknown;
  step3PreviewJobsByFrame?: unknown;
}

export function sanitizeStep3SegmentsForWorkflowTransition<T extends ScriptSegmentRef>(segments: readonly T[]): T[] {
  return stripDataUrlsFromScriptSegments(segments);
}

export function sanitizeProjectDataForWorkflowStateSync<T extends Step3WorkflowProjectData>(
  projectData: T,
): T {
  let nextProjectData: Step3WorkflowProjectData = projectData;
  let changed = false;

  if (Array.isArray(projectData.script)) {
    const sanitizedScript = sanitizeStep3SegmentsForWorkflowTransition(projectData.script);
    nextProjectData = {
      ...nextProjectData,
      script: sanitizedScript,
    };
    changed = true;
  }

  if (Array.isArray(projectData.step3SceneReferences)) {
    const sanitizedSceneReferences = projectData.step3SceneReferences
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const selectedImageUrl = sanitizeUrlField(record.selectedImageUrl);
        const candidates = Array.isArray(record.candidates)
          ? [
              ...new Set(
                record.candidates
                  .map((candidate) => sanitizeUrlField(candidate))
                  .filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0),
              ),
            ]
          : [];
        return {
          ...record,
          selectedImageUrl,
          candidates,
        };
      })
      .filter((item) => Boolean(item)) as Record<string, unknown>[];
    nextProjectData = {
      ...nextProjectData,
      step3SceneReferences: sanitizedSceneReferences,
    };
    changed = true;
  }

  if (
    projectData.step3PreviewCandidatesByFrame &&
    typeof projectData.step3PreviewCandidatesByFrame === "object" &&
    !Array.isArray(projectData.step3PreviewCandidatesByFrame)
  ) {
    const sanitizedByFrame: Record<string, string[]> = {};
    for (const [rawFrameIndex, rawCandidates] of Object.entries(projectData.step3PreviewCandidatesByFrame)) {
      const frameIndex = Number(rawFrameIndex);
      if (!Number.isInteger(frameIndex) || frameIndex < 1 || !Array.isArray(rawCandidates)) {
        continue;
      }
      const candidates = [
        ...new Set(
          rawCandidates
            .map((candidate) => sanitizeUrlField(candidate))
            .filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0),
        ),
      ];
      if (candidates.length > 0) {
        sanitizedByFrame[String(frameIndex)] = candidates;
      }
    }
    nextProjectData = {
      ...nextProjectData,
      step3PreviewCandidatesByFrame: sanitizedByFrame,
    };
    changed = true;
  }

  if (
    projectData.step3PreviewJobsByFrame &&
    typeof projectData.step3PreviewJobsByFrame === "object" &&
    !Array.isArray(projectData.step3PreviewJobsByFrame)
  ) {
    const sanitizedByFrame: Record<
      string,
      {
        jobId: string;
        status: "running" | "succeeded" | "failed";
        updatedAt: number;
        errorMessage?: string | null;
      }
    > = {};
    for (const [rawFrameIndex, rawValue] of Object.entries(projectData.step3PreviewJobsByFrame)) {
      const frameIndex = Number(rawFrameIndex);
      if (!Number.isInteger(frameIndex) || frameIndex < 1) {
        continue;
      }
      if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        continue;
      }
      const record = rawValue as Record<string, unknown>;
      const jobId = String(record.jobId ?? "").trim();
      if (!jobId) {
        continue;
      }
      const statusRaw = String(record.status ?? "").trim();
      const status =
        statusRaw === "succeeded" || statusRaw === "failed"
          ? statusRaw
          : "running";
      const updatedAtRaw = Number(record.updatedAt);
      const updatedAt = Number.isFinite(updatedAtRaw) ? Math.max(0, Math.floor(updatedAtRaw)) : 0;
      const errorMessageRaw = record.errorMessage;
      const errorMessage =
        typeof errorMessageRaw === "string" ? errorMessageRaw.trim() || null : null;
      sanitizedByFrame[String(frameIndex)] = {
        jobId,
        status,
        updatedAt,
        ...(errorMessage !== null ? { errorMessage } : {}),
      };
    }
    nextProjectData = {
      ...nextProjectData,
      step3PreviewJobsByFrame: sanitizedByFrame,
    };
    changed = true;
  }

  if (!changed) {
    return projectData;
  }
  return nextProjectData as T;
}
