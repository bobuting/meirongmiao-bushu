/**
 * 热榜 LLM Pipeline 工具函数
 * 打标/扩展提示词构建已移除，仅保留 JSON 提取工具
 */

export function extractHotTrendPipelineItems(raw: unknown): Array<Record<string, unknown>> {
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (Array.isArray(raw)) {
    return raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }
  const candidates = [
    payload?.items,
    payload?.results,
    payload?.topics,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
  }
  return [];
}
