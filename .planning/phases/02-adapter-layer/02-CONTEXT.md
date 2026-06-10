# Phase 2: Adapter Layer - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

三个适配器将现有依赖接口包装为统一接口 UnifiedReverseDeps，实现零破坏性变更。适配器负责方法签名转换和 LLM dispatch 逻辑封装。

**Requirements:** ADPT-01, ADPT-02, ADPT-03

</domain>

<decisions>
## Implementation Decisions

### File Organization
- **D-01:** 适配器文件位于 `src/modules/video-reverse-core/` 目录下，与核心模块保持内聚
- **D-02:** 文件命名规范：`{功能名}-adapter.ts`，例如 `batch-reverse-adapter.ts`、`square-route-adapter.ts`、`clone-adapter.ts`

### Adapter Granularity
- **D-03:** 每个入口点一个适配器，实现 UnifiedReverseDeps 接口
- **D-04:** 适配器委托给现有 deps 接口，不修改现有实现

### Square Route Special Handling
- **D-05:** ReverseParseRouteDeps 使用服务端口模式（videoReverseAnalysisService），与其他两个入口点架构不同
- **D-06:** SquareRouteAdapter 需要特殊处理：可能需要创建内部桥接逻辑或标记为暂不实现

### Claude's Discretion
- 具体的方法映射实现细节
- 错误处理在适配器层的包装方式
- 类型转换的边界条件处理

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Module (Phase 1)
- `src/modules/video-reverse-core/unified-reverse-deps.ts` — UnifiedReverseDeps 接口定义（目标接口）
- `src/modules/video-reverse-core/types.ts` — CoreReverseInput, CoreReverseOutput 类型
- `src/modules/video-reverse-core/unified-reverse-core.ts` — runCoreReversePipeline 函数

### Existing Deps Interfaces
- `src/contracts/video-hot-trend-sync-contract.ts` — VideoHotTrendSyncDeps 接口（批量入口）
- `src/modules/video-hot-trend/single-reverse-service.ts` — SingleVideoReverseDeps 接口（复刻入口）
- `src/routes/reverse-parse-routes.ts` — ReverseParseRouteDeps 接口（广场入口）

### Provider Types
- `src/contracts/provider-route-policy-contract.ts` — ProviderRouteKey 类型
- `src/contracts/video-hot-trend-sync-contract.ts` — VideoHotTrendResolvedProvider, VideoHotTrendLlmPlainTextResult 类型

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VideoHotTrendSyncDeps` — 完整的 LLM 调用链（Gemini/OpenAI dispatch）
- `SingleVideoReverseDeps` — 简化的 LLM 调用链，与 SyncDeps 高度相似
- `shouldUseGeminiVideoReverseTransport()` — Gemini/OpenAI 切换逻辑
- `buildGeminiInlineVideoPart()`, `buildOpenAiInlineVideoContentVariants()` — 视频格式构建

### Established Patterns
- Factory + Deps Interface 模式广泛使用
- 适配器模式：委托而非修改现有实现
- LLM dispatch 模式：根据 provider.vendor 决定调用路径

### Integration Points
- BatchSyncAdapter 委托给 VideoHotTrendSyncDeps
- CloneAdapter 委托给 SingleVideoReverseDeps
- SquareRouteAdapter 委托给 ReverseParseRouteDeps（架构差异需特殊处理）

### Key Method Mappings

| UnifiedReverseDeps 方法 | VideoHotTrendSyncDeps | SingleVideoReverseDeps |
|------------------------|----------------------|------------------------|
| resolveVideoUrl | (直接传递) | resolveVideoUrl |
| downloadVideoForLlm | downloadVideoForLlm | downloadVideoForLlm |
| resolveProvider | resolveRouteProviderWithFallback | resolveRouteProviderWithFallback |
| callLlm | requestGeminiPlainTextWithVideoPart / requestOpenAiPlainTextWithVideoVariants | requestGeminiPlainTextWithVideoPart / requestOpenAiPlainTextWithVideoVariants |
| createAuditRecord | createLlmDebugRecord | createLlmDebugRecord |
| finalizeAuditSuccess | finalizeLlmDebugRecordSuccess | finalizeLlmDebugRecordSuccess |
| finalizeAuditError | finalizeLlmDebugRecordError | finalizeLlmDebugRecordError |
| extractJsonValue | extractJsonValue | (需导入 from utils/json) |
| log | log | log |
| generateId | (需提供) | generateId |
| now | now | now |

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches based on research recommendations.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---
*Phase: 02-adapter-layer*
*Context gathered: 2026-04-06*