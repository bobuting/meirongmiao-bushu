/**
 * 实时热榜同步处理器
 * 处理同步流程的编排和错误处理
 *
 * 迁移源: app.ts syncHotTrendAssets 函数
 */

import type { HotTrendInsight, SquareTrendTopic, HotTrendType } from "../types.js";
import type { RealtimeSyncInput, RealtimeSyncResult, RealtimeHotTrendConfig } from "./types.js";
import { buildHeuristicHotTrendInsights } from "../shared/normalize.js";
import { scoreRealtimeTopics, selectRealtimeTopN } from "./pipeline.js";
import { buildRealtimeHotTrendAssets } from "./asset-builder.js";

// ============================================================================
// 同步结果构建
// ============================================================================

/**
 * 构建同步结果
 */
export function buildRealtimeSyncResult(input: {
  topics: SquareTrendTopic[];
  insights: HotTrendInsight[];
  type: HotTrendType;
  syncedAt: number;
  promptVersion: string;
  topN: number;
  analysisSource: "llm" | "heuristic";
  updatedAt: string | null;
}): RealtimeSyncResult {
  const assets = buildRealtimeHotTrendAssets({
    topics: input.topics,
    insights: input.insights,
    type: input.type,
    syncedAt: input.syncedAt,
    promptVersion: input.promptVersion,
    topN: input.topN,
    analysisSource: input.analysisSource,
    updatedAt: input.updatedAt,
  });

  return {
    syncedAt: input.syncedAt,
    topicCount: input.topics.length,
    generatedCount: assets.length,
    analysisSource: input.analysisSource,
    assets: assets as any[], // 类型转换，实际使用时需要完整的LibraryScript
  };
}

// ============================================================================
// 同步流程辅助函数
// ============================================================================

/**
 * 构建回退洞察（当LLM失败时使用）
 */
export function buildFallbackInsights(
  topics: SquareTrendTopic[],
  type: HotTrendType,
): HotTrendInsight[] {
  return buildHeuristicHotTrendInsights(topics, type);
}

/**
 * 验证同步输入
 */
export function validateRealtimeSyncInput(input: RealtimeSyncInput): boolean {
  return (
    Array.isArray(input.topics) &&
    input.topics.length > 0 &&
    (input.type === "realtime" || input.type === "video")
  );
}

/**
 * 计算下次同步时间
 */
export function calculateNextSyncAt(syncedAt: number, intervalMs: number): number {
  return syncedAt + intervalMs;
}

// 注意: 完整的同步流程仍在 app.ts 中，这里只提供辅助函数
// 后续重构可以逐步将流程迁移到这里