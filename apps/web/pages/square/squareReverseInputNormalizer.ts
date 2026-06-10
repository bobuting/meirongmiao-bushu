export type SquareReverseInputMode = "douyin_url" | "video_url";
export type SquareReverseRequestInputMode = SquareReverseInputMode | "upload_file";

interface NormalizeSquareReverseInputResult {
  normalized: string;
  fromDirtyText: boolean;
}

const trimExtractedUrl = (raw: string): string =>
  raw
    .trim()
    .replace(/^[<>"'“”‘’（）()\[\]{}【】]+/u, "")
    .replace(/[<>"'“”‘’（）()\[\]{}【】,，。！？!?;；:：]+$/u, "");

const extractFirstHttpUrl = (text: string): string | null => {
  const matched = text.match(/https?:\/\/[^\s"'<>]+/i);
  return matched ? trimExtractedUrl(matched[0]) : null;
};

const collectHttpUrlCandidates = (input: string): string[] => {
  const matches = input.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return matches
    .map((item) => trimExtractedUrl(item))
    .filter((item) => item.length > 0);
};

const collectBareDouyinCandidates = (input: string): string[] => {
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
};

const isLikelyDouyinHost = (hostRaw: string): boolean => {
  const host = hostRaw.trim().toLowerCase();
  return host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com");
};

const toHttpsIfDomainLike = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
};

export function normalizeSquareReverseUrlInput(raw: string): NormalizeSquareReverseInputResult {
  const input = String(raw ?? "").trim();
  if (!input) {
    return { normalized: "", fromDirtyText: false };
  }
  const direct = trimExtractedUrl(input);
  const candidates = [
    /^https?:\/\//i.test(direct) ? direct : null,
    extractFirstHttpUrl(input),
    ...collectHttpUrlCandidates(input),
    ...collectBareDouyinCandidates(input),
  ].filter((item): item is string => Boolean(item && item.trim().length > 0));
  const deduped = [...new Set(candidates.map((item) => trimExtractedUrl(item)).filter((item) => item.length > 0))];

  let picked: string | null = null;
  for (const candidate of deduped) {
    try {
      const parsed = new URL(candidate);
      if (isLikelyDouyinHost(parsed.hostname)) {
        picked = candidate;
        break;
      }
    } catch {
      // ignore malformed candidate
    }
  }
  if (!picked) {
    picked = deduped[0] ?? direct;
  }
  const normalized = toHttpsIfDomainLike(picked);
  return {
    normalized,
    fromDirtyText: normalized !== input,
  };
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isLikelyDouyinShareUrl(value: string): boolean {
  return /(^https?:\/\/)?(?:v\.douyin\.com|(?:www\.)?douyin\.com|iesdouyin\.com)\//i.test(value.trim());
}

export function isLikelyDirectPlayableVideoUrl(raw: string): boolean {
  const input = raw.trim();
  if (!/^https?:\/\//i.test(input)) {
    return false;
  }
  try {
    const host = new URL(input).hostname.toLowerCase();
    if (host.includes("douyinvod.com")) {
      return true;
    }
  } catch {
    // ignore parse error and continue rule checks
  }
  if (/\/aweme\/v1\/play\//i.test(input)) {
    return true;
  }
  if (/\.mp4(?:[?#]|$)/i.test(input)) {
    return true;
  }
  if (/[?&]mime_type=video_mp4(?:[&#]|$)/i.test(input)) {
    return true;
  }
  if (/\/video\/tos\//i.test(input)) {
    return true;
  }
  return /(?:^|[?&])(video_id|vid)=/i.test(input);
}
