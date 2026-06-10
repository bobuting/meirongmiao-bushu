/**
 * 视频热榜同步服务的依赖注入接口
 * 重新导出共享合约类型，保持向后兼容
 */

// 从共享合约导出所有类型
export type {
  VideoHotTrendSyncDeps,
  VideoHotTrendSyncInput,
  VideoHotTrendSyncResult,
  VideoHotTrendSyncStats,
  VideoHotTrendResolvedProvider,
  VideoHotTrendLlmPlainTextResult,
  VideoHotTrendBatchReverseWithRetryResult,
  VideoHotTrendFetchGuardState,
  VideoHotTrendTikHubAdapter,
  VideoHotTrendDouhotAdapter,
  VideoHotTrendScriptServicePort,
  VideoHotTrendSmartStoryboardServicePort,
} from "../../contracts/video-hot-trend-sync-contract.js";

export {
  VIDEO_HOT_TREND_SYNC_CONTRACT_VERSION,
  VIDEO_HOT_TREND_SYNC_CONTRACT_INVARIANTS,
} from "../../contracts/video-hot-trend-sync-contract.js";

// 导入共享类型供内部使用
import type {
  VideoHotTrendSyncDeps,
  VideoHotTrendSyncInput,
  VideoHotTrendSyncResult,
  VideoHotTrendResolvedProvider,
} from "../../contracts/video-hot-trend-sync-contract.js";

// 重新导出必要的依赖类型
export type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";

// 类型别名，保持内部代码兼容
export type ResolvedRouteProvider = VideoHotTrendResolvedProvider;

// 导出用于 sync-service.ts 的类型
export type { VideoHotTrendSyncDeps as Deps, VideoHotTrendSyncInput as Input, VideoHotTrendSyncResult as Result };