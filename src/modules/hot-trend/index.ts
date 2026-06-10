/**
 * 热榜模块入口
 * 导出所有公共API
 *
 * 注意: 视频热榜已迁移到 ../video-hot-trend/ 目录
 * 实时热榜已迁移到 ../realtime-hot-trend/ 目录
 */

// 类型定义
export * from "./types.js";

// 常量
export * from "./constants.js";

// 上下文
export * from "./context.js";

// 共享工具
export * from "./shared/index.js";

// 路由模块
export { registerHotTrendRoutes } from "./routes/index.js";

// 重新导出共享基础类型
export type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  SquareTrendTopic,
  HotTrendInsight,
} from "../../contracts/hot-trend-base.js";