/**
 * 视频反推工具函数 —— 从 app.ts 提取的视频反推 URL 解析/判断逻辑
 */
import { AppError } from "../../core/errors.js";
import {
  extractFirstHttpUrl,
  trimExtractedUrl,
  isDouyinReverseHost,
  collectHttpUrlCandidates,
  collectBareDouyinCandidates,
} from "../../utils/url.js";

// ---------------------------------------------------------------------------
// pickReverseUrlCandidate — 从输入中选取反推 URL 候选
// ---------------------------------------------------------------------------
export function pickReverseUrlCandidate(input: string): string | null {
  const direct = trimExtractedUrl(input);
  const candidates = [
    /^https?:\/\//i.test(direct) ? direct : null,
    extractFirstHttpUrl(input),
    ...collectHttpUrlCandidates(input),
    ...collectBareDouyinCandidates(input),
  ].filter((item): item is string => Boolean(item && item.trim().length > 0));
  const deduped = [...new Set(candidates.map((item) => trimExtractedUrl(item)))];
  if (deduped.length < 1) {
    return null;
  }
  for (const candidate of deduped) {
    try {
      const parsed = new URL(candidate);
      if (isDouyinReverseHost(parsed.hostname)) {
        return candidate;
      }
    } catch {
      // ignore parse error and keep trying
    }
  }
  return deduped[0];
}

// ---------------------------------------------------------------------------
// normalizeDouyinReverseInputUrl — 标准化抖音反推输入 URL
// ---------------------------------------------------------------------------
export function normalizeDouyinReverseInputUrl(raw: string): string {
  const input = raw.trim();
  if (!input) {
    throw new AppError(400, "REVERSE_URL_INVALID", "reverse url is empty");
  }
  const candidate = pickReverseUrlCandidate(input);
  if (!candidate) {
    throw new AppError(400, "REVERSE_URL_INVALID", "reverse url must contain douyin link");
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new AppError(400, "REVERSE_URL_INVALID", "reverse url format invalid");
  }
  const host = parsed.hostname.trim().toLowerCase();
  if (!isDouyinReverseHost(host)) {
    throw new AppError(400, "REVERSE_URL_INVALID", `unsupported reverse host: ${host}`);
  }
  if ((host === "douyin.com" || host === "www.douyin.com") && (parsed.pathname ?? "/").trim() === "/") {
    throw new AppError(400, "REVERSE_URL_INVALID", "reverse url path is missing");
  }
  parsed.hash = "";
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// isLikelyDirectPlayableVideoUrl — 判断是否为可直接播放的视频 URL
// ---------------------------------------------------------------------------
export function isLikelyDirectPlayableVideoUrl(url: string): boolean {
  const input = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(input)) {
    return false;
  }
  if (/\/aweme\/v1\/play\//i.test(input)) {
    return true;
  }
  if (/\.mp4(?:[?#]|$)/i.test(input)) {
    return true;
  }
  return /(?:^|[?&])(video_id|vid)=/i.test(input);
}

// ---------------------------------------------------------------------------
// pickPreferredResolvedVideoUrl — 选取首选解析视频 URL
// ---------------------------------------------------------------------------
export function pickPreferredResolvedVideoUrl(
  inputUrl: string,
  trace:
    | {
        resolvedVideoUrl: string | null;
        scriptHints?:
          | {
              primaryItem?:
                | {
                    videoUrl?: string | null;
                    url?: string | null;
                  }
                | null;
            }
          | null;
      }
    | null
    | undefined,
): string {
  const candidates = [
    trace?.scriptHints?.primaryItem?.videoUrl,
    trace?.scriptHints?.primaryItem?.url,
    trace?.resolvedVideoUrl,
    inputUrl,
  ]
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
  const deduped = [...new Set(candidates)];
  const direct = deduped.find((item) => isLikelyDirectPlayableVideoUrl(item));
  if (direct) {
    return direct;
  }
  return deduped[0] ?? inputUrl;
}

// ---------------------------------------------------------------------------
// summarizeReverseAttempts — 汇总反推尝试结果
// ---------------------------------------------------------------------------
export function summarizeReverseAttempts(
  attempts: Array<{
    stage: string;
    provider: string;
    reasonCode: string;
    nextAction: string;
    detail: string | null;
    status: "success" | "failed";
  }>,
): string {
  return attempts
    .map((item, index) => {
      const detail = item.detail?.trim();
      const detailPart = detail ? ` detail=${detail.slice(0, 180)}` : "";
      return `#${index + 1} ${item.stage}/${item.provider}/${item.status} reason=${item.reasonCode} next=${item.nextAction}${detailPart}`;
    })
    .join(" | ");
}

// ---------------------------------------------------------------------------
// isVideoReverseMissingSourceSignal — 判断是否为缺失源信号
// ---------------------------------------------------------------------------
export function isVideoReverseMissingSourceSignal(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const patterns = [
    /尚未提供(?:具体)?的视频(?:内容)?(?:或)?链接/u,
    /未提供(?:具体)?视频(?:内容)?(?:或)?链接/u,
    /请(?:先)?提供(?:具体)?视频(?:内容|链接|文件)/u,
    /please provide (?:a )?(?:specific )?video(?: content| link| file)?/i,
    /you (?:have not|haven't|did not|didn't) provide (?:a )?(?:specific )?video/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}
