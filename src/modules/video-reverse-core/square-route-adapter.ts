/**
 * 广场路由适配器决策记录
 *
 * STATUS: NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
 *
 * 原因：ReverseParseRouteDeps 使用服务端口模式（videoReverseAnalysisService），
 * 与 UnifiedReverseDeps 的函数式依赖接口设计不兼容。
 *
 * 架构差异：
 * - ReverseParseRouteDeps: 提供服务实例（videoReverseAnalysisService: VideoReverseAnalysisServicePort）
 * - UnifiedReverseDeps: 提供函数集合（resolveVideoUrl, downloadVideoForLlm 等独立方法）
 *
 * Phase 4 整合建议：
 * - 重构 ReverseParseRouteDeps 为函数式接口
 * - 或在适配器中实现复杂桥接逻辑（不推荐）
 *
 * @see D-05 (ReverseParseRouteDeps 使用服务端口模式)
 * @see D-06 (SquareRouteAdapter 需特殊处理)
 * @see src/routes/reverse-parse-routes.ts (ReverseParseRouteDeps 定义)
 */

// ============================================================================
// 架构不兼容分析
// ============================================================================

/**
 * ReverseParseRouteDeps 接口结构（服务端口模式）
 *
 * 接口提供：
 * - buildReverseFetchOrchestrator: 构建复杂 orchestrator 对象
 * - videoReverseAnalysisService: VideoReverseAnalysisServicePort 服务实例
 * - runSharedVideoUrlReversePipelineForUser: 高层封装管线函数
 *
 * 服务实例特性：
 * - videoReverseAnalysisService 包含多个方法和内部状态
 * - 设计用于复杂编排（douyin fetch + video analysis）
 * - 集成点：deps.videoReverseAnalysisService.execute(...)
 */

/**
 * UnifiedReverseDeps 接口结构（函数式依赖接口）
 *
 * 接口提供 11 个独立函数方法：
 * - resolveVideoUrl: (inputUrl) => Promise<string>
 * - downloadVideoForLlm: (url) => Promise<{base64, mimeType} | null>
 * - resolveProvider: (routeKeys) => Promise<provider | null>
 * - callLlm: (provider, prompt, video, timeoutMs) => Promise<result>
 * - createAuditRecord, finalizeAuditSuccess, finalizeAuditError
 * - extractJsonValue, log, generateId, now
 *
 * 函数式特性：
 * - 每个函数独立，无内部状态
 * - 设计用于简单依赖注入
 * - 集成点：deps.resolveVideoUrl(...) 等
 */

/**
 * 兼容性矩阵分析
 *
 * | UnifiedReverseDeps 方法 | ReverseParseRouteDeps 来源 | 状态 |
 * |-------------------------|---------------------------|------|
 * | resolveVideoUrl         | 不可直接获取              | 需调用 videoReverseAnalysisService 方法 |
 * | downloadVideoForLlm     | 不可直接获取              | 需调用 videoReverseAnalysisService 方法 |
 * | resolveProvider         | 不可直接获取              | 需调用 videoReverseAnalysisService 方法 |
 * | callLlm                 | 不可直接获取              | 需调用 videoReverseAnalysisService 方法 |
 * | createAuditRecord       | 不可直接获取              | videoReverseAnalysisService 内部处理 |
 * | finalizeAuditSuccess    | 不可直接获取              | videoReverseAnalysisService 内部处理 |
 * | finalizeAuditError      | 不可直接获取              | videoReverseAnalysisService 内部处理 |
 * | extractJsonValue        | 不可直接获取              | 需导入 utils/json.ts |
 * | log                     | ctx.app.log               | 可桥接但非直接 |
 * | generateId              | ctx.clock.generateId()    | 可桥接但非直接 |
 * | now                     | ctx.clock.now()           | 可桥接但非直接 |
 *
 * 结论：无法实现适配器，除非编写复杂的桥接逻辑。
 */

// ============================================================================
// 导出常量
// ============================================================================

/**
 * 架构不兼容标记
 * 用于类型检查和文档追踪
 */
export const SQUARE_ROUTE_ADAPTER_STATUS = "NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH";

/**
 * 不兼容原因
 */
export const SQUARE_ROUTE_ADAPTER_INCOMPATIBILITY_REASON =
  "ReverseParseRouteDeps uses service port pattern (videoReverseAnalysisService) " +
  "which is incompatible with UnifiedReverseDeps function-based interface";

/**
 * Phase 4 整合建议
 */
export const SQUARE_ROUTE_ADAPTER_PHASE4_SUGGESTION =
  "Refactor ReverseParseRouteDeps to function-based interface OR implement bridge logic in adapter";

// ============================================================================
// 类型占位符
// ============================================================================

/**
 * 占位类型：未来实现时的适配器函数签名
 * 当前不可用，仅用于文档目的
 */
export type SquareRouteAdapterFactory = (deps: never) => never;