/**
 * 热榜数据获取函数
 * 从外部源获取热榜数据
 */

import type { SquareTrendTopic } from "../types.js";
import { parseHotHubUpdatedAt, parseHotHubSection } from "./parse.js";

// ============================================================================
// 类型定义
// ============================================================================

export interface HotHubFetchResult {
  source: string;
  section: string;
  updatedAt: string | null;
  topics: SquareTrendTopic[];
}

export interface HotHubFetchDeps {
  makeFetchFailedError: (message: string) => Error;
  makeParseFailedError: (message: string) => Error;
}

// ============================================================================
// 抖音热榜数据获取
// ============================================================================

/**
 * 获取抖音热榜数据
 */
export async function fetchDouyinHotHubTrends(
  type: "realtime" | "video",
  limit: number,
  readmeUrl: string | null | undefined,
  env: { DOUYIN_HOT_HUB_README_URL?: string; DOUYIN_HOT_HUB_TIMEOUT_MS?: string },
  deps: HotHubFetchDeps,
): Promise<HotHubFetchResult> {
  const candidateUrls = Array.from(
    new Set(
      [
        readmeUrl?.trim(),
        env.DOUYIN_HOT_HUB_README_URL?.trim(),
        "https://raw.githubusercontent.com/lonnyzhang423/douyin-hot-hub/main/README.md",
      ].filter((value): value is string => Boolean(value && value.length > 0)),
    ),
  );
  const controller = new AbortController();
  const timeoutMs = Number(env.DOUYIN_HOT_HUB_TIMEOUT_MS ?? 6_000);
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    let lastError: unknown = null;
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, { method: "GET", signal: controller.signal });
        if (!response.ok) {
          throw deps.makeFetchFailedError(
            `Fetch douyin-hot-hub failed: ${response.status} ${response.statusText}`,
          );
        }
        const markdown = await response.text();
        const updatedAt = parseHotHubUpdatedAt(markdown);
        const section = type === "video" ? "音乐榜" : "抖音热榜";
        const topics = parseHotHubSection(markdown, type, limit);
        if (topics.length === 0) {
          throw deps.makeParseFailedError(`No topics parsed from section ${section}`);
        }
        return {
          source: "douyin-hot-hub",
          section,
          updatedAt,
          topics: topics as SquareTrendTopic[],
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? deps.makeFetchFailedError("Fetch douyin-hot-hub failed for all candidate urls");
  } finally {
    clearTimeout(timer);
  }
}