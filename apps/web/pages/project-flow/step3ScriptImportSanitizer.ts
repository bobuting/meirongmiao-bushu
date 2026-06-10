import { STEP3_IMPORT_SANITIZER_BLOCKED_PREFIXES } from "../../../../src/contracts/step3-scene-workbench-contract";

const EXTRA_BLOCKED_PREFIXES = [
  "# 热榜元数据",
  "- 主题:",
  "- 主题：",
  "主题:",
  "主题：",
  "- 链接：",
  "链接:",
  "- 评估：",
  "评估:",
  "- 原因：",
  "原因:",
  "- 建议时长:",
  "- 建议时长：",
  "建议时长:",
  "建议时长：",
] as const;

const STEP3_IMPORT_SANITIZER_PREFIXES = [
  ...STEP3_IMPORT_SANITIZER_BLOCKED_PREFIXES,
  ...EXTRA_BLOCKED_PREFIXES,
] as const;

function shouldDropStep3ImportLine(line: string): boolean {
  return STEP3_IMPORT_SANITIZER_PREFIXES.some((prefix) => line.startsWith(prefix));
}

export function sanitizeStep3ImportedFullScript(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !shouldDropStep3ImportLine(line))
    .join("\n")
    .trim();
}
