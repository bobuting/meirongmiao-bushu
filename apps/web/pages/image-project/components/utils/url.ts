/**
 * url.ts — URL 安全验证工具函数
 * 防止 SSRF（Server-Side Request Forgery）攻击
 */

/**
 * URL 安全验证：防止 SSRF（私有 IP/本地地址）
 * 只允许 https/http/data 协议，禁止私有 IP 范围
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  // 允许 data: URL（base64 编码的图片）
  if (url.startsWith("data:image/")) return true;

  try {
    const parsed = new URL(url);
    // 只允许 https 和 http
    if (!["https:", "http:"].includes(parsed.protocol)) return false;
    // 禁止私有 IP 和本地地址
    const hostname = parsed.hostname;
    const forbiddenPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^0\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];
    if (forbiddenPatterns.some(p => p.test(hostname))) return false;
    return true;
  } catch {
    return false;
  }
}