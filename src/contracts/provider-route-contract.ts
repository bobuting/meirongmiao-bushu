/**
 * Provider 路由契约
 *
 * 统一导出 Provider 相关的类型定义。
 */

// 从 provider-resolver.ts 重新导出
export type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";

// Provider 路由键
export type { ProviderRouteKey } from "./types.js";

// Provider 解析函数
export {
  resolveRouteProvider,
  resolveRouteProviderChain,
  resolveModelFallbackOrder,
} from "../services/llm/provider-resolver.js";