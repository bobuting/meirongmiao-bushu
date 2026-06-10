export interface Step3WorkspaceSeedSnapshot {
  scriptSegmentCount: number;
  hasPendingScriptImport: boolean;
  hasPendingStoryboardImport: boolean;
}

function toArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function buildStep3WorkspaceSeedSnapshot(
  projectData: Record<string, unknown> | null | undefined,
): Step3WorkspaceSeedSnapshot {
  const source = projectData && typeof projectData === "object" && !Array.isArray(projectData) ? projectData : {};
  return {
    scriptSegmentCount: toArrayLength(source.script),
    hasPendingScriptImport: Boolean(source.pendingScriptImport),
    hasPendingStoryboardImport: Boolean(source.pendingStoryboardImport),
  };
}
