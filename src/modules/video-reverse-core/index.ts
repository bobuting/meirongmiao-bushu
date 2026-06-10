/**
 * 视频反推核心模块
 * 提供统一的视频 LLM 反推管道，供三个入口点共享使用
 */

// 核心管道
export { runCoreReversePipeline } from "./unified-reverse-core.js";

// 输出标准化
export { normalizeLlmReverseOutput } from "./normalize-output.js";
export type { LlmReverseOutput } from "./normalize-output.js";

// 依赖接口
export type { UnifiedReverseDeps } from "./unified-reverse-deps.js";

// 适配器
export { createBatchReverseAdapter } from "./batch-reverse-adapter.js";
export { createCloneAdapter } from "./clone-adapter.js";
export {
  SQUARE_ROUTE_ADAPTER_STATUS,
  SQUARE_ROUTE_ADAPTER_INCOMPATIBILITY_REASON,
  SQUARE_ROUTE_ADAPTER_PHASE4_SUGGESTION,
} from "./square-route-adapter.js";

// 映射器
export {
  mapToBatchResult,
  mapToCloneResult,
  mapToSquareResult,
  SQUARE_ROUTE_MAPPER_STATUS,
  SQUARE_ROUTE_MAPPER_REASON,
} from "./mapper.js";

// 映射器输入接口
export type { BatchSyncMapperInput, CloneMapperInput } from "./mapper.js";

// 类型定义 (type-only exports)
export type {
  CoreReverseInput,
  CoreReverseOutput,
  CoreReverseAuditContext,
  CoreReverseErrorCode,
  LlmReverseErrorPolicy,
} from "./types.js";

// 常量值导出
export { CORE_REVERSE_ERROR_CODES } from "./types.js";