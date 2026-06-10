export function resolveStep3SceneSidebarEmptyState(hasSceneCandidates: boolean): string {
  return hasSceneCandidates ? "该镜头已生成场景候选图，请先在右侧候选区选择一张" : "尚未生成场景参考图";
}

export function resolveStep3CharacterSidebarEmptyState(): string {
  return "未选择人物参考图";
}
