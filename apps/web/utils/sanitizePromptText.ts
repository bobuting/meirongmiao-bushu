/**
 * Step1 携带文本清洗工具
 *
 * 从 step1-optimized-prompt-builder.ts 提取的纯前端工具函数，
 * 无后端依赖，供前端页面直接引用。
 */

const STEP1_PROMPT_RUNTIME_NOISE_PATTERNS = [
  /\blatency-check-\d+\b/giu,
] as const;

export function sanitizeStep1CarryoverPromptText(value: string): string {
  let output = value;
  for (const pattern of STEP1_PROMPT_RUNTIME_NOISE_PATTERNS) {
    output = output.replace(pattern, " ");
  }
  return output
    .replace(/["'`]+\s*["'`]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ", ")
    .replace(/([,.;:!?])([,.;:!?]+)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
