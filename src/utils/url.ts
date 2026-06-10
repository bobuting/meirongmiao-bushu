/**
 * URL 处理工具函数
 */

import { basename } from "node:path";
import { createHash } from "node:crypto";

/**
 * 提取文本中的第一个 HTTP URL
 */
export function extractFirstHttpUrl(text: string): string | null {
  const matched = text.match(/https?:\/\/[^\s"'<>]+/i);
  return matched ? matched[0] : null;
}

/**
 * 清理提取的 URL 字符串，去除前后特殊字符
 */
export function trimExtractedUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^[<>"'"'''（）()\[\]{}【】]+/u, "")
    .replace(/[<>"'"'''（）()\[\]{}【】,，。！？!?;；:：]+$/u, "");
}

/**
 * 判断是否是抖音相关域名
 */
export function isDouyinReverseHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "douyin.com" ||
    normalized.endsWith(".douyin.com") ||
    normalized === "iesdouyin.com" ||
    normalized.endsWith(".iesdouyin.com")
  );
}

/**
 * 从文本中收集所有 HTTP URL 候选项
 */
export function collectHttpUrlCandidates(input: string): string[] {
  const matches = input.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return matches
    .map((item) => trimExtractedUrl(item))
    .filter((item) => item.length > 0);
}

/**
 * 从文本中收集抖音 URL 候选项（包括不带协议的）
 */
export function collectBareDouyinCandidates(input: string): string[] {
  const out: string[] = [];
  const pattern = /(?:^|[^a-z0-9._-])((?:[a-z0-9-]+\.)*(?:douyin\.com|iesdouyin\.com)(?:\/[^\s"'<>]*)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    const candidate = trimExtractedUrl(match[1] ?? "");
    if (candidate.length > 0) {
      out.push(`https://${candidate}`);
    }
  }
  const direct = trimExtractedUrl(input);
  if (/^(?:[a-z0-9-]+\.)*(?:douyin\.com|iesdouyin\.com)(?:\/[^\s"'<>]*)?$/i.test(direct)) {
    out.push(`https://${direct}`);
  }
  return out;
}

/**
 * 判断是否是 data:image 格式的 URL
 */
export function isDataImageUrl(value: string): boolean {
  return /^data:image\/[^;]+;base64,/i.test(value.trim());
}

/**
 * 判断是否是 data:video 格式的 URL
 */
export function isDataVideoUrl(value: string): boolean {
  return /^data:video\/[^;]+;base64,/i.test(value.trim());
}

/**
 * 判断是否是 HTTP URL
 */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * 根据源 URL 解析视频存储文件名
 */
export function resolveVideoStorageFileName(sourceUrl: string, fallbackExt: string): string {
  const stripped = sourceUrl.split("?")[0] ?? "";
  const baseNameRaw = basename(stripped).trim();
  const safeBaseName = baseNameRaw
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (safeBaseName.length > 0) {
    return safeBaseName.includes(".") ? safeBaseName : `${safeBaseName}${fallbackExt}`;
  }
  return `clip${fallbackExt}`;
}

/**
 * 构建源 URL 的 SHA256 摘要标识
 */
export function buildSourceUrlDigestIdentity(url: string): string | null {
  const value = String(url ?? "").trim();
  if (!value) {
    return null;
  }
  return `src:${createHash("sha256").update(value).digest("hex")}`;
}