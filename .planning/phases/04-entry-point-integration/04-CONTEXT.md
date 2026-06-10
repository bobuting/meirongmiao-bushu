# Phase 4: Entry Point Integration - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

三个入口点均委托给统一核心管道，重复代码移除。核心反推逻辑维护点唯一（video-reverse-core 模块）。

**Requirements:** ENTR-01, ENTR-02, ENTR-03

**Note:** ENTR-03 (广场入口) 标记为 NOT_IMPLEMENTED，与 Phase 2/3 的 SquareRouteAdapter/mapToSquareResult 对称。

</domain>

<decisions>
## Implementation Decisions

### Entry Point Scope
- **D-01:** ENTR-03 (广场入口) 标记为 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
- **D-02:** Phase 4 只整合两个入口：sync-service.ts 和 single-reverse-service.ts
- **D-03:** 与 Phase 2 SquareRouteAdapter 和 Phase 3 mapToSquareResult 的 NOT_IMPLEMENTED 状态保持对称

### Integration Strategy
- **D-04:** 完全重写入口函数，直接暴露核心管道 API
- **D-05:** sync-service.ts 的 `processVideo` 函数重写为调用 `runCoreReversePipeline` + `BatchSyncAdapter` + `mapToBatchResult`
- **D-06:** single-reverse-service.ts 的 `runSingleVideoLlmReverse` 函数重写为调用 `runCoreReversePipeline` + `CloneAdapter` + `mapToCloneResult`

### Code Removal
- **D-07:** 删除 processVideo 和 runSingleVideoLlmReverse 中的重复代码：
  - 视频下载逻辑
  - base64 编码逻辑
  - LLM 调用逻辑（Gemini/OpenAI dispatch）
  - JSON 解析逻辑
  - 输出标准化逻辑
- **D-08:** 保留入口特有逻辑（如 sync-service.ts 的 OSS 上传）

### Verification
- **D-09:** 仅编译验证：TypeScript 类型检查通过 + 确认核心管道被调用
- **D-10:** Phase 0 特征测试已跳过，不编写新测试

### Claude's Discretion
- 具体的函数签名调整细节
- 入口特有逻辑的保留边界
- 错误处理的映射细节

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Module (Phase 1)
- `src/modules/video-reverse-core/types.ts` — CoreReverseInput, CoreReverseOutput, CoreReverseErrorCode
- `src/modules/video-reverse-core/unified-reverse-core.ts` — runCoreReversePipeline 函数
- `src/modules/video-reverse-core/unified-reverse-deps.ts` — UnifiedReverseDeps 接口

### Adapters (Phase 2)
- `src/modules/video-reverse-core/batch-reverse-adapter.ts` — createBatchReverseAdapter 工厂函数
- `src/modules/video-reverse-core/clone-adapter.ts` — createCloneAdapter 工厂函数
- `src/modules/video-reverse-core/square-route-adapter.ts` — NOT_IMPLEMENTED 状态

### Mappers (Phase 3)
- `src/modules/video-reverse-core/mapper.ts` — mapToBatchResult, mapToCloneResult 函数

### Entry Points to Modify
- `src/modules/video-hot-trend/sync-service.ts` — processVideo 函数（line 234）
- `src/modules/video-hot-trend/single-reverse-service.ts` — runSingleVideoLlmReverse 函数（line 217）

### Dependency Interfaces
- `src/contracts/video-hot-trend-sync-contract.ts` — VideoHotTrendSyncDeps 接口
- `src/modules/video-hot-trend/single-reverse-service.ts` — SingleVideoReverseDeps 接口

</canonical_refs>

<code_context>
## Existing Code Insights

### Current Entry Point Structure

**sync-service.ts processVideo (line 234):**
```typescript
async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
  // 1. URL 解析
  // 2. 视频下载 → base64
  // 3. Provider 解析
  // 4. LLM 调用（Gemini/OpenAI dispatch）
  // 5. JSON 解析
  // 6. 输出标准化
  // 7. OSS 上传（入口特有）
  // 8. 返回 LlmReverseResult
}
```

**single-reverse-service.ts runSingleVideoLlmReverse (line 217):**
```typescript
export async function runSingleVideoLlmReverse(
  deps: SingleVideoReverseDeps,
  input: SingleVideoReverseInput
): Promise<SingleVideoReverseResult> {
  // 1. URL 解析
  // 2. 视频下载 → base64
  // 3. Provider 解析
  // 4. LLM 调用（Gemini/OpenAI dispatch）
  // 5. JSON 解析
  // 6. 输出标准化
  // 7. 脚本库保存（入口特有）
  // 8. 返回 SingleVideoReverseResult
}
```

### Reusable Assets from Prior Phases

| Phase | Asset | Purpose |
|-------|-------|---------|
| Phase 1 | `runCoreReversePipeline` | 核心 LLM 反推管道 |
| Phase 2 | `createBatchReverseAdapter` | VideoHotTrendSyncDeps → UnifiedReverseDeps |
| Phase 2 | `createCloneAdapter` | SingleVideoReverseDeps → UnifiedReverseDeps |
| Phase 3 | `mapToBatchResult` | CoreReverseOutput → LlmReverseResult |
| Phase 3 | `mapToCloneResult` | CoreReverseOutput → SingleVideoReverseResult |

### Integration Pattern

```typescript
// New processVideo implementation
async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
  const adapter = createBatchReverseAdapter(deps);
  const coreOutput = await runCoreReversePipeline(adapter, {
    videoUrl: sourceUrl,
    routeKeys: [ROUTE_KEY_HOT_TREND_LABELING],
    auditContext: { ... }
  });
  
  // Entry-specific: OSS upload (keep)
  const ossUrl = await uploadToOss(...);
  
  return mapToBatchResult({
    coreOutput,
    videoKey,
    videoTitle,
    rank,
    sourceUrl,
    ossUrl
  });
}
```

### Entry-Specific Logic to Preserve

**sync-service.ts:**
- OSS 上传逻辑（异步，批量入口特有）
- 批量处理统计
- 热榜数据保存

**single-reverse-service.ts:**
- 脚本库保存逻辑
- storyboardPanel 构建
- 用户关联

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow established patterns from prior phases.

</specifics>

<deferred>
## Deferred Ideas

### ENTR-03 (广场入口)
- 标记为 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
- Phase 2 SquareRouteAdapter 已标记不兼容
- Phase 3 mapToSquareResult 已标记为占位
- 未来重构时需将 ReverseParseRouteDeps 改为函数式接口

</deferred>

---

*Phase: 04-entry-point-integration*
*Context gathered: 2026-04-06*