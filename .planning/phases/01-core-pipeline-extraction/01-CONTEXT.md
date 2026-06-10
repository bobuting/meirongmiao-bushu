# Phase 1: Core Pipeline Extraction - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

提取核心反推管道（视频下载 → base64 → LLM → JSON 解析 → 输出标准化）为独立可复用模块。三个入口点共享此核心管道，通过适配器适配各自依赖。

**Requirements:** CORE-01, CORE-02, CORE-03

</domain>

<decisions>
## Implementation Decisions

### Module Location
- **D-01:** 核心模块位于 `src/modules/video-reverse-core/`，独立目录，清晰边界

### Interface Design
- **D-02:** `UnifiedReverseDeps` 接口定义约 12 个核心方法（研究建议）
- **D-03:** 接口应包含：resolveVideoUrl, downloadVideoForLlm, resolveProvider, callLlm, createAuditRecord, finalizeAuditSuccess, finalizeAuditError, log, generateId, now

### Error Handling
- **D-04:** 核心管道返回结构化结果（包含 success, errorCode, errorMessage），不直接抛异常
- **D-05:** 调用方（入口点）决定如何处理错误（批量入口静默跳过，用户入口抛异常）

### Code Organization
- **D-06:** 核心模块文件结构：
  - `types.ts` — CoreReverseInput, CoreReverseOutput
  - `normalize-output.ts` — 从 sync-service 移入 normalizeLlmReverseOutput()
  - `unified-reverse-deps.ts` — 统一 DI 接口
  - `unified-reverse-core.ts` — runCoreReversePipeline()
  - `index.ts` — 公共导出

### Claude's Discretion
- 具体的接口方法签名细节
- 错误码命名规范
- 日志格式
- TypeScript 类型命名细节

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture Design
- `.planning/research/ARCHITECTURE.md` — 完整架构设计，包含组件职责、数据流、依赖图
- `.planning/research/STACK.md` — 推荐模式和技术栈约束

### Existing Code Reference
- `src/modules/video-hot-trend/sync-service.ts` — 现有批量反推实现，包含 normalizeLlmReverseOutput
- `src/modules/video-hot-trend/single-reverse-service.ts` — 现有单视频反推实现
- `src/contracts/video-hot-trend-sync-contract.ts` — 现有 VideoHotTrendSyncDeps 接口定义

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalizeLlmReverseOutput()` — 已在 sync-service 和 single-reverse-service 间共享，移至核心模块
- `buildVideoStoryboardPrompt()` — 提示词构建函数，已在 `prompt.ts` 中，可直接复用
- `extractJsonValue()` — JSON 解析工具，在 `src/utils/json.ts`

### Established Patterns
- Gateway/Port 模式已建立（`VideoReverseAnalysisServicePort`），但核心管道不需要此模式
- DI 模式广泛使用，核心管道应遵循
- 错误处理使用 `AppError` 类（`src/core/errors.ts`）

### Integration Points
- 核心模块被三个入口点调用：sync-service.ts, single-reverse-service.ts, reverse-parse-routes.ts
- 核心模块依赖外部注入的 deps，不直接导入外部服务

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

*Phase: 01-core-pipeline-extraction*
*Context gathered: 2026-04-06*