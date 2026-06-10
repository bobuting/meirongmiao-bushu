# Phase 3: Mapper Layer - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

输出映射器将核心管道输出 CoreReverseOutput 转换为各入口点特定格式，包括：
1. BatchSyncMapper: CoreReverseOutput → LlmReverseResult（批量入库格式）
2. CloneMapper: CoreReverseOutput → SingleVideoReverseResult（脚本库格式）
3. SquareRouteMapper: CoreReverseOutput → ReverseParseV2ResultDto（前端格式）

**Requirements:** MAPR-01, MAPR-02, MAPR-03

</domain>

<decisions>
## Implementation Decisions

### File Organization
- **D-01:** 单文件 `mapper.ts` 包含三个映射函数，位于 `src/modules/video-reverse-core/` 目录
- **D-02:** 函数命名：`mapToBatchResult()`, `mapToCloneResult()`, `mapToSquareResult()`

### Mapper Design
- **D-03:** 所有映射器为纯函数，无副作用
- **D-04:** 映射器输入采用最小参数设计：CoreReverseOutput + 少量必要参数
- **D-05:** 错误码直接映射，不做额外转换逻辑

### SquareRouteMapper Special Handling
- **D-06:** SquareRouteMapper 创建占位函数，返回错误结果并标记 NOT_IMPLEMENTED
- **D-07:** 与 Phase 2 SquareRouteAdapter 的 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH 状态保持对称

### Error Mapping
- **D-08:** CoreReverseOutput.errorCode 直接映射到各入口点的错误格式
- **D-09:** 映射关系：
  - BatchSyncMapper: `CoreReverseOutput.errorCode` → `LlmReverseResult.errorCode`
  - CloneMapper: `CoreReverseOutput.errorCode` → `SingleVideoReverseResult` 中的错误状态
  - SquareRouteMapper: 占位，返回固定错误

### Testing
- **D-10:** 映射器单元测试推迟到 Phase 4 整合时编写

### Claude's Discretion
- 具体的映射函数签名细节
- 各入口点输出格式的字段映射细节
- 占位映射器的具体返回值结构

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Module (Phase 1)
- `src/modules/video-reverse-core/types.ts` — CoreReverseInput, CoreReverseOutput, CoreReverseErrorCode 类型
- `src/modules/video-reverse-core/normalize-output.ts` — LlmReverseOutput 类型定义
- `src/modules/video-reverse-core/index.ts` — 公共导出

### Target Output Types
- `src/modules/video-hot-trend/sync-service.ts` — LlmReverseResult 接口定义（批量入库格式）
- `src/modules/video-hot-trend/single-reverse-service.ts` — SingleVideoReverseResult 接口定义（脚本库格式）
- `apps/web/services/backendApi.types.ts` — ReverseParseV2ResultDto 接口定义（前端格式）

### Phase 2 Adapters
- `src/modules/video-reverse-core/batch-reverse-adapter.ts` — BatchSyncAdapter 实现
- `src/modules/video-reverse-core/clone-adapter.ts` — CloneAdapter 实现
- `src/modules/video-reverse-core/square-route-adapter.ts` — SquareRouteAdapter NOT_IMPLEMENTED 状态

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CoreReverseOutput` — 核心管道输出结构，包含 rawLlmOutput, resolvedVideoUrl, success, errorCode, errorMessage
- `LlmReverseOutput` — 标准化 LLM 输出类型，已在 normalize-output.ts 定义

### Target Output Structures

**LlmReverseResult (Batch):**
```typescript
interface LlmReverseResult {
  videoKey: string;       // 去重键
  videoTitle: string;     // 视频标题
  rank: number;
  sourceUrl: string;      // 视频URL
  ossUrl: string | null;  // OSS 公开 URL
  status: "success" | "failed";
  output: LlmReverseOutput | null;
  errorCode: string | null;
  errorMessage: string | null;
}
```

**SingleVideoReverseResult (Clone):**
```typescript
interface SingleVideoReverseResult {
  id: string;
  projectId: string | null;
  input: string;
  status: string;
  scriptVersionId: string | null;
  libraryScriptId: string | null;
  reverseStoryboardLibraryId: string | null;
  rawLlmOutput: LlmReverseOutput;
  storyboardPanel: {...};
}
```

**ReverseParseV2ResultDto (Square):**
```typescript
interface ReverseParseV2ResultDto {
  id?: string;
  projectId?: string | null;
  input?: string;
  status?: string;
  scriptVersionId?: string | null;
  libraryScriptId?: string | null;
  storyboardPanel?: ReverseStoryboardPanelViewModel | null;
  resolvedVideoUrl?: string | null;
  fallback?: boolean;
  code?: string;
  message?: string;
  traceId?: string;
}
```

### Established Patterns
- 纯函数映射器模式：输入 → 转换 → 输出，无副作用
- 错误结构化返回：success/errorCode/errorMessage 三元组

### Integration Points
- BatchSyncMapper 被 sync-service.ts 调用
- CloneMapper 被 single-reverse-service.ts 调用
- SquareRouteMapper 被 reverse-parse-routes.ts 调用（Phase 4 整合时处理）

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-mapper-layer*
*Context gathered: 2026-04-06*