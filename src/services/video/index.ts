/**
 * 视频服务模块
 * 统一的视频响应提取器架构
 */

export type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "./types.js";

export {
  getExtractor,
  isSupportedCallMode,
  getSupportedCallModes,
} from "./extractor-registry.js";
