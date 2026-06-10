/**
 * 实时热榜模块入口
 * 导出所有公共API
 */

// 类型定义
export * from "./types.js";

// 常量
export * from "./constants.js";

// 工具函数
export * from "./utils.js";

// Pipeline 函数
export * from "./pipeline.js";

// 资产构建
export * from "./asset-builder.js";

// 同步服务
export { createRealtimeHotTrendSyncService } from "./sync-service.js";
export type { RealtimeHotTrendSyncService } from "./sync-service.js";

// 重新导出共享类型
export type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  SquareTrendTopic,
  HotTrendInsight,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
} from "../../contracts/hot-trend-base.js";

// 重新导出契约类型
export type {
  RealtimeHotTrendSyncDeps,
  RealtimeHotTrendSyncInput,
  RealtimeHotTrendSyncResult,
  RealtimeHotTrendSyncEntry,
  RealtimeHotTrendSyncStats,
  RealtimeHotTrendResolvedProvider,
} from "../../contracts/realtime-hot-trend-sync-contract.js";