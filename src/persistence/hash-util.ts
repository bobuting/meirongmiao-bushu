import { createHash } from "node:crypto";

/** 对 JSON 字符串计算 SHA-256 摘要 */
export function hashJsonString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}