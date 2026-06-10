export interface Step3WorkspacePreviewParameterSnapshot {
  ratio: string | null;
  resolution: string | null;
  sharpness: string | null;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildStep3WorkspacePreviewParameterSnapshot(
  projectData: Record<string, unknown> | null | undefined,
): Step3WorkspacePreviewParameterSnapshot {
  const source = projectData && typeof projectData === "object" && !Array.isArray(projectData) ? projectData : {};
  return {
    ratio: toOptionalString(source.step4PreviewRatio),
    resolution: toOptionalString(source.step4PreviewResolution),
    sharpness: toOptionalString(source.step4PreviewSharpness),
  };
}
