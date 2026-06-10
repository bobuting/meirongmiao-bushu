export const STEP2_COPY_CLEANUP_CONTRACT_VERSION = "AT35-22.v1";

export const STEP2_COPY_BLACKLIST = [
  "后续定妆整体提示词",
  "已替代旧三变体输入",
  "Step1 已确认服装",
  "Step1 服装参考（已确认）",
  "Step2 新模式已启用",
  "Step2 旧模式",
  "隐藏 Prompt",
  "最终整合提示词",
] as const;

export const STEP2_USER_FACING_TITLE_CONTRACT = {
  pageTitle: "角色定妆",
  leftPanelInputTitle: "角色定妆提示词",
  leftPanelReferenceTitle: "已确认服装参考",
  generatedSectionTitle: "AI 生成结果",
  librarySectionTitle: "角色库推荐",
} as const;

export const STEP2_COPY_CLEANUP_INVARIANTS = [
  "User-facing Step2 copy must not expose Step1/Step2 internal workflow markers, debug jargon, or legacy prompt migration hints.",
  "The left input area must be framed as outfit styling input, not hidden prompt carryover.",
  "Generated and library sections keep product-facing titles while admin/debug prompt text stays footer-only and admin-only.",
] as const;

export function assertStep2CopyCleanupContract(): {
  version: string;
  blacklistSize: number;
  titleKeys: number;
} {
  return {
    version: STEP2_COPY_CLEANUP_CONTRACT_VERSION,
    blacklistSize: STEP2_COPY_BLACKLIST.length,
    titleKeys: Object.keys(STEP2_USER_FACING_TITLE_CONTRACT).length,
  };
}
