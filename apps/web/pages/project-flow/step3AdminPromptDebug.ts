export interface Step3SceneDebugPromptItem {
  index: number;
  title: string;
  prompt: string;
}

export function buildStep3SceneDebugPromptSummary(items: Step3SceneDebugPromptItem[]): string {
  return items
    .filter((item) => item.prompt.trim().length > 0)
    .map((item) => `#${item.index} ${item.title}\n${item.prompt.trim()}`)
    .join("\n\n");
}

export function normalizeStep3AdminPromptText(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}
