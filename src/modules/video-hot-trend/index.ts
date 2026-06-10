/**
 * 视频热榜模块入口
 * 导出所有视频热榜相关的类型和函数
 */

// 类型定义
export * from "./types.js";

// 工具函数
export * from "./utils.js";

// 同步处理
export * from "./sync-handler.js";

// 依赖注入
export * from "./deps.js";

// 同步服务
export { createVideoHotTrendSyncService } from "./sync-service.js";
export type { VideoHotTrendSyncService } from "./sync-service.js";

// 提示词构建
export { buildVideoStoryboardPrompt } from "./prompt.js";

// 重新导出共享类型
export type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
  SquareTrendTopic,
  HotTrendInsight,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
} from "../../contracts/hot-trend-base.js";

// 重新导出契约类型
export type {
  VideoHotTrendSyncDeps,
  VideoHotTrendSyncInput,
  VideoHotTrendSyncResult,
  VideoHotTrendSyncStats,
  VideoHotTrendResolvedProvider,
} from "../../contracts/video-hot-trend-sync-contract.js";