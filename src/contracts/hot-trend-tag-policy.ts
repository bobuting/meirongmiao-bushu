export const HOT_TREND_TAG_POLICY_CONTRACT_VERSION = "AT50-04.v1";

export const HOT_TREND_TAG_DISPLAY_WHITELIST_PREFIXES = [
  "#",
  "来源:",
  "分类:",
  "推荐评级:",
] as const;

export const HOT_TREND_TAG_TECHNICAL_BLACKLIST_PREFIXES = [
  "__hot_trend_asset__",
  "hot_trend_key",
  "hottrend-",
  "trend_hash:",
  "hash:",
  "热榜资产：",
] as const;

export const HOT_TREND_TAG_POLICY_INVARIANTS = [
  "Display tags must hide technical keys and hash-like internals.",
  "Business-facing labels (source/suitability/topic hashtags) remain stable and readable.",
  "Internal ranking/reason/update tags are not exposed directly in UI tag chips.",
  "Sanitization is deterministic and deduplicated for predictable filtering behavior.",
] as const;

const HASH_LIKE_PATTERN = /^[a-f0-9]{16,}$/i;

function normalizeTextTag(input: string): string {
  return input.trim();
}

function mapSourceTag(raw: string): string | null {
  if (!raw.startsWith("hottrend-type:")) {
    return null;
  }
  const value = raw.slice("hottrend-type:".length).trim().toLowerCase();
  if (value === "video") {
    return "来源:视频热榜";
  }
  if (value === "realtime") {
    return "来源:实时热榜";
  }
  return "来源:热榜";
}

function mapSuitabilityTag(raw: string): string | null {
  if (!raw.startsWith("hottrend-suitability:")) {
    return null;
  }
  const value = raw.slice("hottrend-suitability:".length).trim().toLowerCase();
  if (value === "high") {
    return "推荐评级:推荐";
  }
  if (value === "medium") {
    return "推荐评级:可尝试";
  }
  if (value === "low") {
    return "推荐评级:谨慎";
  }
  return "推荐评级:待评估";
}

function mapLabelTag(raw: string): string | null {
  if (!raw.startsWith("hottrend-label:")) {
    return null;
  }
  const value = raw.slice("hottrend-label:".length).trim();
  if (value.length < 1) {
    return null;
  }
  return value.startsWith("#") ? value : `#${value}`;
}

export function isTechnicalHotTrendTag(tag: string): boolean {
  const normalized = normalizeTextTag(tag);
  if (normalized.length < 1) {
    return true;
  }
  const lowered = normalized.toLowerCase();
  if (HASH_LIKE_PATTERN.test(lowered)) {
    return true;
  }
  if (normalized.includes("热榜资产：") && /[a-f0-9]{8,}/i.test(normalized)) {
    return true;
  }
  return HOT_TREND_TAG_TECHNICAL_BLACKLIST_PREFIXES.some((prefix) => lowered.startsWith(prefix.toLowerCase()));
}

export function sanitizeHotTrendTagsForDisplay(tags: readonly string[]): string[] {
  const mapped: string[] = [];
  for (const rawTag of tags) {
    const normalized = normalizeTextTag(String(rawTag ?? ""));
    if (normalized.length < 1) {
      continue;
    }
    const sourceMapped = mapSourceTag(normalized);
    if (sourceMapped) {
      mapped.push(sourceMapped);
      continue;
    }
    const suitabilityMapped = mapSuitabilityTag(normalized);
    if (suitabilityMapped) {
      mapped.push(suitabilityMapped);
      continue;
    }
    const labelMapped = mapLabelTag(normalized);
    if (labelMapped) {
      mapped.push(labelMapped);
      continue;
    }
    if (isTechnicalHotTrendTag(normalized)) {
      continue;
    }
    if (normalized.startsWith("#")) {
      mapped.push(normalized);
      continue;
    }
    if (HOT_TREND_TAG_DISPLAY_WHITELIST_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      mapped.push(normalized);
    }
  }
  return [...new Set(mapped)];
}
