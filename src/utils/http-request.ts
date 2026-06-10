/**
 * HTTP 请求工具函数
 */

import https from "node:https";
import { compactUnknownText } from "./text.js";

/**
 * 判断是否为代理平台（不需要地区前缀）
 * 云雾等代理平台直接透传 token，不需要添加 cn- 等前缀
 * @param vendor 供应商名称
 * @param baseUrl 可选的基础 URL，用于辅助判断
 */
function isProxyPlatform(vendor: string, baseUrl?: string): boolean {
  const normalizedVendor = vendor.trim().toLowerCase();
  const normalizedUrl = (baseUrl ?? "").trim().toLowerCase();

  // 检查 vendor 或 baseUrl 是否包含代理平台标识
  return (
    normalizedVendor.includes("yunwu") ||
    normalizedVendor.includes("云雾") ||
    normalizedVendor.includes("openai-proxy") ||
    normalizedVendor.includes("api-proxy") ||
    normalizedUrl.includes("yunwu.ai") ||
    normalizedUrl.includes("yunwu")
  );
}

/**
 * 将 secret 转换为 Bearer Token 格式
 * @param secret API secret/token
 * @param vendor 可选的供应商名称，用于判断是否需要添加区域前缀（即梦/doubao）
 * @param baseUrl 可选的基础 URL，用于辅助判断是否为代理平台
 */
export function toBearerToken(secret: string, vendor?: string, baseUrl?: string): string {
  const normalized = secret.replace(/^Bearer\s+/i, "").trim();
  const normalizedVendor = (vendor ?? "").trim().toLowerCase();

  // 代理平台不需要地区前缀，直接返回原始 token（同时检查 vendor 和 baseUrl）
  if (isProxyPlatform(normalizedVendor, baseUrl)) {
    return `Bearer ${normalized}`;
  }

  const isJimengVendor =
    normalizedVendor.includes("jimeng") ||
    normalizedVendor.includes("即梦") ||
    normalizedVendor.includes("doubao") ||
    normalizedVendor.includes("seedream");
  // 即梦 vendor 需要添加区域前缀（如果没有的话）
  if (isJimengVendor && !/^(cn|us|hk|jp|sg)-/i.test(normalized)) {
    const regions = resolveJimengRegionCandidates();
    return `Bearer ${regions[0]}-${normalized}`;
  }
  return `Bearer ${normalized}`;
}

/**
 * 解析 secret 字符串中的多个候选项
 */
export function parseSecretCandidates(secretRaw: string): string[] {
  const candidates = secretRaw
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(candidates)];
}

/**
 * 解析 model 字符串中的多个候选项
 */
export function parseModelCandidates(modelRaw: string): string[] {
  const candidates = modelRaw
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(candidates)];
}

/**
 * 获取即梦区域候选项列表
 */
export function resolveJimengRegionCandidates(): string[] {
  const preferred = (process.env.JIMENG_REGION ?? process.env.JIMENG_API_REGION ?? "")
    .trim()
    .toLowerCase();
  const ordered = ["cn", "sg", "us", "hk", "jp"];
  if (preferred && ordered.includes(preferred)) {
    return [preferred, ...ordered.filter((item) => item !== preferred)];
  }
  return ordered;
}

/**
 * 构建认证头候选项列表
 * 对于代理平台（如云雾），不添加地区前缀
 * @param secretRaw 原始密钥字符串
 * @param vendor 供应商名称
 * @param baseUrl 可选的基础 URL，用于辅助判断是否为代理平台
 */
export function buildAuthHeaderCandidates(secretRaw: string, vendor: string, baseUrl?: string): string[] {
  const baseCandidates = parseSecretCandidates(secretRaw);
  const candidates = baseCandidates.length > 0 ? baseCandidates : [secretRaw];
  const headers: string[] = [];
  const normalizedVendor = vendor.trim().toLowerCase();

  // 代理平台不添加地区前缀（同时检查 vendor 和 baseUrl）
  const skipRegionPrefix = isProxyPlatform(normalizedVendor, baseUrl);

  const isJimengVendor =
    normalizedVendor.includes("jimeng") ||
    normalizedVendor.includes("即梦") ||
    normalizedVendor.includes("doubao") ||
    normalizedVendor.includes("seedream");
  const jimengRegions = resolveJimengRegionCandidates();
  for (const candidate of candidates) {
    const normalized = candidate.replace(/^Bearer\s+/i, "").trim();
    if (!normalized) {
      continue;
    }
    headers.push(`Bearer ${normalized}`);
    // 只有非代理平台且是即梦 vendor 时才添加地区前缀
    if (!skipRegionPrefix && isJimengVendor && !/^(cn|us|hk|jp|sg)-/i.test(normalized)) {
      for (const region of jimengRegions) {
        headers.push(`Bearer ${region}-${normalized}`);
      }
    }
  }
  return [...new Set(headers)];
}

/**
 * 发送 JSON POST 请求，带超时控制
 */
export async function postJsonWithTimeout(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  // 阿里云 MAAS 端点的 TLS 证书只覆盖 *.aliyuncs.com（单级通配），
  // 多级子域名（如 ws-xxx.cn-beijing.maas.aliyuncs.com）证书不匹配，
  // 需要使用 https 模块配合 rejectUnauthorized: false 来跳过 TLS 验证
  // 阿里云 DashScope 端点响应较慢，使用 https 模块避免 undici 的 headersTimeout 限制
  const needsHttpsModule =
    url.includes("maas.aliyuncs.com") ||
    url.includes("dashscope.aliyuncs.com") ||
    url.includes("volces.com") || // 火山引擎 Seedream API 响应慢，Node.js fetch 不稳定
    url.includes("yunwu.ai"); // 云雾 API 并发请求时 undici 连接池不稳定，导致 fetch failed

  if (needsHttpsModule) {
    return postJsonViaHttps(url, payload, headers, timeoutMs);
  }

  return postJsonViaFetch(url, payload, headers, timeoutMs);
}

/**
 * 判断是否为 TLS 握手阶段的瞬断错误（可重试）
 */
function isTlsHandshakeError(err: Error): boolean {
  const msg = err.message;
  return (
    msg.includes("Client network socket disconnected before secure TLS connection was established") ||
    msg.includes("read ECONNRESET") ||
    msg.includes("socket hang up") ||
    (msg.includes("ECONNRESET") && msg.includes("TLS")) ||
    msg.includes("unexpected end of file")
  );
}

/**
 * 单次 HTTPS 请求尝试（无重试）
 */
function postJsonViaHttpsSingleAttempt(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(payload);

    // 禁用连接复用，避免复用已断开的连接导致 TLS 握手前断开
    // "Client network socket disconnected before secure TLS connection was established"
    // 阿里云 DashScope 端点响应较慢，使用独立 agent 确保每次都是全新连接
    const agent = new https.Agent({
      rejectUnauthorized: false, // 跳过 TLS 证书验证
      keepAlive: false,           // 禁用 keepAlive，避免复用失效连接
      maxSockets: 1,              // 限制并发连接数
      maxFreeSockets: 0,          // 不保留空闲 socket
      scheduling: "fifo" as const,
    });

    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
        agent,
        timeout: Math.max(1000, timeoutMs),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          agent.destroy(); // 请求完成后清理 agent
          if (res.statusCode && res.statusCode >= 400) {
            const responseHeaders = res.headers;
            reject(
              new Error(
                `HTTP ${res.statusCode} ${res.statusMessage}; responseHeaders=${compactUnknownText(responseHeaders, 400)}; responseBody=${data.slice(0, 1200).trim()}`
              )
            );
            return;
          }
          try {
            resolve(data.trim() ? JSON.parse(data) : {});
          } catch {
            resolve({
              raw: data,
              _responseStatus: res.statusCode,
              _responseHeaders: res.headers,
            });
          }
        });
      }
    );

    req.on("error", (err: Error) => {
      agent.destroy(); // 清理 agent 资源
      reject(err);
    });
    req.on("timeout", () => {
      req.destroy();
      agent.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    req.write(body);
    req.end();
  });
}

/** 使用 Node.js https 模块发送请求（支持跳过 TLS 验证，内置 3 次重试） */
async function postJsonViaHttps(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await postJsonViaHttpsSingleAttempt(url, payload, headers, timeoutMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isTlsHandshakeError(lastError) || attempt === maxAttempts) {
        break; // 非 TLS 瞬断错误或已达最大重试次数，直接抛出
      }
      // 指数退避：第1次重试等待 1s，第2次重试等待 2s
      const delayMs = attempt * 1000;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError!;
}

/** 使用 fetch API 发送请求 */
async function postJsonViaFetch(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let data: unknown = {};
    if (rawText.trim().length > 0) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {
          raw: rawText,
          _responseStatus: response.status,
          _responseHeaders: Object.fromEntries(response.headers.entries()),
        };
      }
    }
    if (!response.ok) {
      const responseHeaders = Object.fromEntries(response.headers.entries());
      throw new Error(
        `HTTP ${response.status} ${response.statusText}; responseHeaders=${compactUnknownText(responseHeaders, 400)}; responseBody=${rawText
          .slice(0, 1200)
          .trim()}`,
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 遮蔽敏感的 header 值（如 Authorization）
 */
export function maskHeaderValue(value: string): string {
  const text = value.trim();
  if (!text) {
    return "";
  }
  if (/^bearer\s+/i.test(text)) {
    const raw = text.replace(/^bearer\s+/i, "").trim();
    if (raw.length <= 8) {
      return "Bearer ****";
    }
    return `Bearer ${raw.slice(0, 4)}***${raw.slice(-4)}`;
  }
  if (text.length <= 8) {
    return "****";
  }
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

/**
 * 发送 GET 请求，带超时控制
 */
export async function httpGetWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const rawText = await response.text();
    let data: unknown = {};
    if (rawText.trim().length > 0) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {
          raw: rawText,
          _responseStatus: response.status,
        };
      }
    }
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}; responseBody=${rawText.slice(0, 1200).trim()}`,
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 清理 headers，遮蔽敏感字段
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization" || key.toLowerCase().includes("api-key")) {
      sanitized[key] = maskHeaderValue(value);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}