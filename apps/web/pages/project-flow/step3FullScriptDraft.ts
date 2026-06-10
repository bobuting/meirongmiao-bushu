export interface Step3DraftSegmentLike {
  content?: string | null;
}

export function buildFullScriptDraftFromSegments(segments: Step3DraftSegmentLike[]): string {
  return segments.map((segment) => segment.content ?? "").join("\n");
}

export function resolveSharedFullScriptDraft(
  draftText: string | null | undefined,
  segments: Step3DraftSegmentLike[],
): string {
  if (typeof draftText === "string") {
    return draftText;
  }
  return buildFullScriptDraftFromSegments(segments);
}
