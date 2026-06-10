# Phase 4: Entry Point Integration - Research

**Researched:** 2026-04-06
**Domain:** Entry point unification - Three entry points delegate to unified core pipeline
**Confidence:** HIGH

## Summary

Phase 4 completes the unification by integrating the core pipeline (Phase 1), adapters (Phase 2), and mappers (Phase 3) into the three entry points. ENTR-01 and ENTR-02 rewrite the entry functions to delegate to the unified pipeline, removing duplicate code. ENTR-03 is marked as NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH, symmetric to Phase 2/3's SquareRoute status.

**Primary recommendation:** Use the integration pattern from CONTEXT.md code_context section — create adapter, call core pipeline, apply mapper, preserve entry-specific logic. The adapters and mappers are already implemented (Phase 2 and 3 complete), enabling direct integration.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** ENTR-03 (广场入口) 标记为 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
- **D-02:** Phase 4 只整合两个入口：sync-service.ts 和 single-reverse-service.ts
- **D-03:** 与 Phase 2 SquareRouteAdapter 和 Phase 3 mapToSquareResult 的 NOT_IMPLEMENTED 状态保持对称
- **D-04:** 完全重写入口函数，直接暴露核心管道 API
- **D-05:** sync-service.ts 的 `processVideo` 函数重写为调用 `runCoreReversePipeline` + `BatchSyncAdapter` + `mapToBatchResult`
- **D-06:** single-reverse-service.ts 的 `runSingleVideoLlmReverse` 函数重写为调用 `runCoreReversePipeline` + `CloneAdapter` + `mapToCloneResult`
- **D-07:** 删除 processVideo 和 runSingleVideoLlmReverse 中的重复代码：
  - 视频下载逻辑
  - base64 编码逻辑
  - LLM 调用逻辑（Gemini/OpenAI dispatch）
  - JSON 解析逻辑
  - 输出标准化逻辑
- **D-08:** 保留入口特有逻辑（如 sync-service.ts 的 OSS 上传）
- **D-09:** 仅编译验证：TypeScript 类型检查通过 + 确认核心管道被调用
- **D-10:** Phase 0 特征测试已跳过，不编写新测试

### Claude's Discretion

- 具体的函数签名调整细节
- 入口特有逻辑的保留边界
- 错误处理的映射细节

### Deferred Ideas (OUT OF SCOPE)

- ENTR-03 (广场入口) — 标记为 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH，Phase 2 SquareRouteAdapter 已标记不兼容，Phase 3 mapToSquareResult 已标记为占位，未来重构时需将 ReverseParseRouteDeps 改为函数式接口

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENTR-01 | sync-service.ts 使用 BatchSyncAdapter + 核心管道，移除重复代码 | Phase 2 BatchSyncAdapter exists (batch-reverse-adapter.ts); Phase 3 mapToBatchResult exists (mapper.ts); processVideo function at line 234 identified for rewrite; OSS upload logic (entry-specific) must be preserved per D-08 |
| ENTR-02 | single-reverse-service.ts 使用 CloneAdapter + 核心管道，移除重复代码 | Phase 2 CloneAdapter exists (clone-adapter.ts); Phase 3 mapToCloneResult exists (mapper.ts); runSingleVideoLlmReverse function at line 217 identified for rewrite; No entry-specific async operations (simpler integration) |
| ENTR-03 | reverse-parse-routes.ts 使用 SquareRouteAdapter + 核心管道（如适用） | NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH per D-01; Phase 2 SquareRouteAdapter marked NOT_IMPLEMENTED; Phase 3 mapToSquareResult placeholder exists; Document NOT_IMPLEMENTED status only |

</phase_requirements>

## Standard Stack

### Core Components (Phase 1 Completed)

| Component | Source File | Purpose | Status |
|-----------|-------------|---------|--------|
| runCoreReversePipeline | `unified-reverse-core.ts` | Core LLM reverse pipeline | VERIFIED: Phase 1 complete |
| CoreReverseInput | `types.ts` | Pipeline input type | VERIFIED: Phase 1 complete |
| CoreReverseOutput | `types.ts` | Pipeline output type | VERIFIED: Phase 1 complete |
| UnifiedReverseDeps | `unified-reverse-deps.ts` | Dependency interface | VERIFIED: Phase 1 complete |

### Adapters (Phase 2 Completed)

| Adapter | Source File | Wraps | Purpose |
|---------|-------------|-------|---------|
| createBatchReverseAdapter | `batch-reverse-adapter.ts` | VideoHotTrendSyncDeps → UnifiedReverseDeps | Batch sync entry point adapter |
| createCloneAdapter | `clone-adapter.ts` | SingleVideoReverseDeps → UnifiedReverseDeps | Clone button entry point adapter |
| SquareRouteAdapter | `square-route-adapter.ts` | NOT_IMPLEMENTED | Placeholder per architectural mismatch |

### Mappers (Phase 3 Completed)

| Mapper | Source File | Transform | Purpose |
|--------|-------------|-----------|---------|
| mapToBatchResult | `mapper.ts` | CoreReverseOutput → LlmReverseResult | Batch storage format |
| mapToCloneResult | `mapper.ts` | CoreReverseOutput → SingleVideoReverseResult | Clone button result |
| mapToSquareResult | `mapper.ts` | NOT_IMPLEMENTED | Placeholder |

### Entry Points to Modify

| Entry Point | File | Function | Lines | Action |
|-------------|------|----------|-------|--------|
| Batch sync | `sync-service.ts` | processVideo | 234-397 | Rewrite to use core pipeline |
| Clone button | `single-reverse-service.ts` | runSingleVideoLlmReverse | 217-332 | Rewrite to use core pipeline |
| Square route | reverse-parse-routes.ts | — | — | Document NOT_IMPLEMENTED |

**No additional installation required:** All components exist after Phase 1-3 completion.

## Architecture Patterns

### Recommended Integration Pattern

```typescript
// Pattern: Adapter → Core Pipeline → Mapper → Entry-Specific Logic

async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
  // 1. Create adapter from existing deps
  const adapter = createBatchReverseAdapter(deps);

  // 2. Call core pipeline
  const coreOutput = await runCoreReversePipeline(adapter, {
    videoUrl: sourceUrl,
    topicLabel: rankedVideo.video.label,
    topicId: String(rankedVideo.video.id ?? rankedVideo.rank),
    routeKeys: [ROUTE_KEY_HOT_TREND_LABELING],
    auditContext: { routeKey: ROUTE_KEY_HOT_TREND_LABELING, businessContext: "批量反推" },
  });

  // 3. Entry-specific logic (per D-08): OSS upload (async)
  const ossUrl = await deps.uploadVideoToOss(...);

  // 4. Apply mapper
  return mapToBatchResult({
    coreOutput,
    videoKey: normalizeHotTrendKey("video", rankedVideo.video.label),
    videoTitle: rankedVideo.video.label,
    rank: rankedVideo.rank,
    sourceUrl,
    ossUrl,
  });
}
```

### Pattern 1: Preserve Entry-Specific Logic

**What:** Each entry point has unique post-processing that must remain outside core pipeline

**When to use:** All entry points (per D-08)

**Entry-specific logic to preserve:**

| Entry Point | Preserved Logic | Location | Reason |
|-------------|-----------------|----------|--------|
| sync-service.ts | OSS upload (async, parallel to LLM) | Lines 275-282 | Batch-specific: persist video for future access |
| sync-service.ts | Batch statistics | Lines 408-411 | Aggregation across multiple videos |
| single-reverse-service.ts | Script library save | Lines 309-311 | User-specific: save to library |
| single-reverse-service.ts | storyboardPanel building | Lines 339-502 | Frontend-compatible format |

### Pattern 2: OSS Upload Timing (sync-service.ts Only)

**What:** OSS upload runs async, parallel to LLM call, result awaited after core pipeline completes

**Why:** OSS upload is I/O-bound; LLM call is compute-bound; parallel execution saves time

**Example (from existing code):**

```typescript
// Existing pattern in sync-service.ts (lines 275-282)
const ossUploadPromise = deps.uploadVideoToOss(
  downloadResult.base64,
  downloadResult.mimeType,
  ossKeyPrefix
).catch((err) => {
  deps.log.warn({ err, sourceUrl }, "video hot trend: async oss upload failed");
  return null;
});

// OSS upload starts before LLM call
// Result awaited after LLM call completes
const ossUrl = await ossUploadPromise;
```

**Integration approach:**
- Core pipeline handles video download internally
- Entry point needs video base64 for OSS upload
- **Challenge:** Core pipeline doesn't expose downloaded video
- **Solution:** Entry point downloads video separately for OSS, or core pipeline exposes download result

**Recommendation:** Preserve OSS upload by having entry point call `deps.downloadVideoForLlm()` before core pipeline, pass result to OSS upload promise, core pipeline will re-download (acceptable for batch processing).

### Pattern 3: Error Handling Strategy

**What:** Core pipeline returns structured result (no exceptions), entry point handles error semantics

**When to use:** All entry points (per Phase 1 D-04)

**Error behavior differences:**

| Entry Point | Error Behavior | Core Pipeline Mapping |
|-------------|----------------|----------------------|
| sync-service.ts | Silent failure, return failed result | `coreOutput.success === false` → LlmReverseResult.status = "failed" |
| single-reverse-service.ts | Throw AppError to user | `coreOutput.success === false` → throw AppError(502, errorCode, errorMessage) |

**Example (single-reverse-service.ts error handling):**

```typescript
// After core pipeline
if (!coreOutput.success) {
  throw new AppError(
    502,
    coreOutput.errorCode ?? "UNKNOWN",
    coreOutput.errorMessage ?? "未知错误"
  );
}

// Mapper only called on success
return mapToCloneResult({ coreOutput, videoUrl, ... });
```

### Anti-Patterns to Avoid

- **Anti-pattern 1: Forcing OSS upload into core pipeline** — OSS is entry-specific, violates separation of concerns (per D-08)
- **Anti-pattern 2: Removing error handling differences** — Batch silent vs user-facing throw is intentional, must preserve (per STATE.md pitfalls)
- **Anti-pattern 3: Reusing video download for both OSS and core** — Core pipeline owns download logic; entry-specific OSS upload requires separate download call
- **Anti-pattern 4: Breaking adapter creation pattern** — Adapter must be created inside function, not cached, to maintain isolation

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video download | Custom fetch logic | Core pipeline `deps.downloadVideoForLlm()` via adapter | Phase 1 handles download, base64 encoding, mimeType detection |
| LLM dispatch | Gemini/OpenAI branch logic | Core pipeline `deps.callLlm()` via adapter | Phase 1 handles provider resolution, Gemini/OpenAI dispatch, timeout |
| JSON parsing | Manual JSON extraction | Core pipeline `deps.extractJsonValue()` via adapter | Phase 1 handles JSON extraction from LLM text |
| Output normalization | Custom field mapping | `normalizeLlmReverseOutput()` in core | Phase 1 moved from sync-service.ts, single maintenance point |
| Adapter creation | Manual interface wrapping | `createBatchReverseAdapter()`, `createCloneAdapter()` | Phase 2 factories handle all method mapping |

**Key insight:** Phase 4 is pure integration — no new logic, only delegation and cleanup. Duplicate code removal is the primary value.

## Existing Code Analysis

### Code to Remove (sync-service.ts processVideo)

| Lines | Code | Replacement |
|-------|------|-------------|
| 254-272 | Video download + base64 | Core pipeline handles via adapter |
| 291-296 | Prompt building | Core pipeline handles via adapter |
| 303-331 | LLM call (Gemini/OpenAI dispatch) | Core pipeline handles via adapter |
| 334-341 | JSON parsing | Core pipeline handles via adapter |
| 344 | normalizeLlmReverseOutput call | Core pipeline handles internally |
| 350-355 | Audit record finalize | Core pipeline handles via adapter |

**Preserve (per D-08):**
- Lines 275-282: OSS upload promise (entry-specific)
- Lines 347: OSS await (entry-specific)
- Lines 357-367: Result construction → replace with mapper call

### Code to Remove (single-reverse-service.ts runSingleVideoLlmReverse)

| Lines | Code | Replacement |
|-------|------|-------------|
| 225-228 | Video download check | Core pipeline handles via adapter |
| 236-240 | Provider resolution | Core pipeline handles via adapter |
| 244-251 | Prompt building | Core pipeline handles via adapter |
| 255-281 | LLM call (Gemini/OpenAI dispatch) | Core pipeline handles via adapter |
| 298-305 | JSON parsing | Core pipeline handles via adapter |
| 308 | normalizeLlmReverseOutput call | Core pipeline handles internally |
| 311 | mapLlmReverseToResult call | Replace with mapToCloneResult |

**Preserve (per D-08):**
- Lines 284-295: Audit record finalize (handled by core, but entry-specific audit may remain)
- Error throwing behavior (user-facing errors must throw)

### Integration Points

| Component | Import Location | Usage |
|-----------|-----------------|-------|
| runCoreReversePipeline | `video-reverse-core/unified-reverse-core.js` | Core function call |
| createBatchReverseAdapter | `video-reverse-core/batch-reverse-adapter.js` | Adapter factory |
| createCloneAdapter | `video-reverse-core/clone-adapter.js` | Adapter factory |
| mapToBatchResult | `video-reverse-core/mapper.js` | Output transformation |
| mapToCloneResult | `video-reverse-core/mapper.js` | Output transformation |

### Reusable Assets

| Asset | From Phase | Purpose |
|-------|------------|---------|
| UnifiedReverseDeps interface | Phase 1 | Adapter contract (12 methods) |
| CORE_REVERSE_ERROR_CODES | Phase 1 | Error code constants |
| BatchSyncAdapter | Phase 2 | VideoHotTrendSyncDeps wrapper |
| CloneAdapter | Phase 2 | SingleVideoReverseDeps wrapper |
| mapToBatchResult | Phase 3 | LlmReverseResult transformation |
| mapToCloneResult | Phase 3 | SingleVideoReverseResult transformation |

## Common Pitfalls

### Pitfall 1: OSS Upload Integration Conflict

**What goes wrong:** OSS upload requires video base64, but core pipeline handles download internally

**Why it happens:** Attempting to reuse core pipeline's download result for OSS upload

**How to avoid:**
- Option A: Entry point downloads video separately for OSS, core pipeline re-downloads (acceptable for batch)
- Option B: Core pipeline exposes download result in CoreReverseOutput (requires Phase 1 modification — out of scope)

**Warning signs:** Trying to access `coreOutput.downloadResult` or passing video to OSS without separate download

**Recommendation:** Option A — separate download for OSS upload (per D-08 preservation). Batch processing tolerates duplicate download cost.

### Pitfall 2: Error Handling Semantics Breakage

**What goes wrong:** Changing batch silent failure to throw, or user-facing throw to silent

**Why it happens:** Assuming unified error handling means same error behavior

**How to avoid:** Preserve entry-specific error semantics:
- sync-service.ts: Return failed LlmReverseResult (no throw)
- single-reverse-service.ts: Throw AppError on coreOutput.success === false

**Warning signs:** Adding `throw` in sync-service.ts processVideo or removing `throw` in single-reverse-service.ts

### Pitfall 3: Removing Entry-Specific Logic

**What goes wrong:** Deleting OSS upload, script library save, or batch statistics

**Why it happens:** Misunderstanding D-07 "删除重复代码" scope

**How to avoid:** D-07 only removes: download, base64, LLM, JSON, normalization. D-08 preserves entry-specific logic.

**Warning signs:** Deleting lines 275-282 (OSS upload) in sync-service.ts

### Pitfall 4: Adapter Creation Outside Function

**What goes wrong:** Creating adapter at module level or caching adapter between calls

**Why it happens:** Attempting to optimize adapter creation overhead

**How to avoid:** Create adapter inside function call, pass existing deps. Adapter wraps deps, not replaces.

**Warning signs:** `const adapter = createBatchReverseAdapter(deps)` at module scope

### Pitfall 5: Core Pipeline Exception Handling

**What goes wrong:** Adding try-catch around core pipeline in entry point

**Why it happens:** Assuming core pipeline throws exceptions

**How to avoid:** Core pipeline returns structured CoreReverseOutput (per Phase 1 D-04). No exceptions to catch.

**Warning signs:** `try { await runCoreReversePipeline(...) } catch (e) { ... }`

## Code Examples

### Example 1: sync-service.ts processVideo Rewrite

```typescript
// Source: Proposed implementation based on CONTEXT.md integration pattern
import { runCoreReversePipeline } from "../video-reverse-core/unified-reverse-core.js";
import { createBatchReverseAdapter } from "../video-reverse-core/batch-reverse-adapter.js";
import { mapToBatchResult } from "../video-reverse-core/mapper.js";
import type { CoreReverseInput } from "../video-reverse-core/types.js";

const ROUTE_KEY_HOT_TREND_LABELING = "hot_trend_labeling" as const;

/**
 * 执行 LLM 分镜反推（使用统一核心管道）
 */
async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
  const videoKey = normalizeHotTrendKey("video", rankedVideo.video.label);
  const sourceUrl = resolveVideoSourceUrl(rankedVideo.video);

  // 必须有视频 URL
  if (!sourceUrl) {
    return {
      videoKey,
      videoTitle: rankedVideo.video.label,
      rank: rankedVideo.rank,
      sourceUrl: "",
      ossUrl: null,
      status: "failed",
      output: null,
      errorCode: "NO_VIDEO_URL",
      errorMessage: "video has no source url",
    };
  }

  // ---- Entry-specific: OSS upload (per D-08) ----
  // 下载视频用于 OSS 上传（核心管道会单独下载用于 LLM）
  const ossDownloadResult = await deps.downloadVideoForLlm(sourceUrl);
  const ossUploadPromise = ossDownloadResult
    ? deps.uploadVideoToOss(
        ossDownloadResult.base64,
        ossDownloadResult.mimeType,
        `hot-trend-video/${String(rankedVideo.video.id ?? rankedVideo.rank)}`
      ).catch((err) => {
        deps.log.warn({ err, sourceUrl }, "video hot trend: async oss upload failed");
        return null;
      })
    : Promise.resolve(null);

  // ---- 核心管道调用 ----
  const adapter = createBatchReverseAdapter(deps);
  const coreInput: CoreReverseInput = {
    videoUrl: sourceUrl,
    topicLabel: rankedVideo.video.label,
    topicId: String(rankedVideo.video.id ?? rankedVideo.rank),
    routeKeys: [ROUTE_KEY_HOT_TREND_LABELING],
    auditContext: {
      routeKey: ROUTE_KEY_HOT_TREND_LABELING,
      businessContext: "视频热榜 LLM 反推",
    },
  };

  const coreOutput = await runCoreReversePipeline(adapter, coreInput);

  // ---- 等待 OSS 上传完成 ----
  const ossUrl = await ossUploadPromise;

  // ---- 映射输出 ----
  return mapToBatchResult({
    coreOutput,
    videoKey,
    videoTitle: rankedVideo.video.label,
    rank: rankedVideo.rank,
    sourceUrl,
    ossUrl,
  });
}
```

### Example 2: single-reverse-service.ts runSingleVideoLlmReverse Rewrite

```typescript
// Source: Proposed implementation based on CONTEXT.md integration pattern
import { runCoreReversePipeline } from "../video-reverse-core/unified-reverse-core.js";
import { createCloneAdapter } from "../video-reverse-core/clone-adapter.js";
import { mapToCloneResult } from "../video-reverse-core/mapper.js";
import type { CoreReverseInput } from "../video-reverse-core/types.js";
import { AppError } from "../../core/errors.js";

/**
 * 单视频热榜 LLM 反推（使用统一核心管道）
 */
export async function runSingleVideoLlmReverse(
  deps: SingleVideoReverseDeps,
  videoUrl: string,
): Promise<SingleVideoReverseResult> {
  // ---- 核心管道调用 ----
  const adapter = createCloneAdapter(deps);
  const coreInput: CoreReverseInput = {
    videoUrl,
    routeKeys: ["hot_trend_labeling", "script_generation"],
    auditContext: {
      routeKey: "reverse_parse",
      businessContext: "视频热榜单视频反推",
    },
  };

  const coreOutput = await runCoreReversePipeline(adapter, coreInput);

  // ---- 用户入口错误处理：失败时抛异常 ----
  if (!coreOutput.success) {
    throw new AppError(
      502,
      coreOutput.errorCode ?? "UNKNOWN",
      coreOutput.errorMessage ?? "反推失败，请稍后重试"
    );
  }

  // ---- 映射输出 ----
  return mapToCloneResult({
    coreOutput,
    videoUrl: coreOutput.resolvedVideoUrl,
    generateId: deps.generateId,
    now: deps.now,
  });
}
```

### Example 3: ENTR-03 NOT_IMPLEMENTED Documentation

```typescript
// No implementation required — document NOT_IMPLEMENTED status only
// Per D-01: ENTR-03 (广场入口) 标记为 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
// Symmetric to:
// - Phase 2: SquareRouteAdapter NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
// - Phase 3: mapToSquareResult NOT_IMPLEMENTED placeholder

// Future integration requires:
// 1. ReverseParseRouteDeps converted to function-style interface (per Deferred Ideas)
// 2. SquareRouteAdapter implemented
// 3. mapToSquareResult implemented
// 4. reverse-parse-routes.ts updated to use core pipeline
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| processVideo contains full LLM logic | processVideo delegates to core pipeline | Phase 4 (planned) | Duplicate code removed, single maintenance point |
| runSingleVideoLlmReverse contains full LLM logic | runSingleVideoLlmReverse delegates to core pipeline | Phase 4 (planned) | Duplicate code removed, single maintenance point |
| Three separate implementations | Two use core pipeline, one deferred | Phase 4 (planned) | ENTR-01/02 unified, ENTR-03 documented |

**Deprecated/outdated:**
- sync-service.ts processVideo lines 254-344 (download, LLM, JSON, normalization) — removed per D-07
- single-reverse-service.ts runSingleVideoLlmReverse lines 225-308 (download, LLM, JSON, normalization) — removed per D-07
- mapLlmReverseToResult function in single-reverse-service.ts — replaced by mapToCloneResult from mapper.ts

## Assumptions Log

> All claims in this research were verified through codebase inspection or derived from locked decisions in CONTEXT.md. No `[ASSUMED]` claims requiring user confirmation.

## Open Questions

1. **OSS upload timing optimization**
   - What we know: Core pipeline downloads video internally; OSS upload also needs video
   - What's unclear: Should OSS upload use core pipeline's download result, or download separately?
   - Recommendation: Download separately (per D-08 preservation). Core pipeline is encapsulated, OSS is entry-specific. Duplicate download cost acceptable for batch processing.

2. **Single-reverse-service audit backward compatibility**
   - What we know: Core pipeline creates audit via adapter; single-reverse-service has recordRouteAudit backward compat
   - What's unclear: Should recordRouteAudit be preserved alongside core pipeline audit?
   - Recommendation: Remove recordRouteAudit call — core pipeline handles all audit via createCloneAdapter. Adapter wraps createLlmDebugRecord/finalize methods.

3. **Error code mapping for user-facing errors**
   - What we know: Core pipeline returns CORE_REVERSE_ERROR_CODES; AppError uses different codes
   - What's unclear: Should errorCode be transformed for user-facing errors?
   - Recommendation: Direct mapping (per D-05). Core pipeline error codes (VIDEO_DOWNLOAD_FAILED, NO_PROVIDER, etc.) are descriptive enough for user messages.

**All questions resolved:** Each question has clear recommendation based on locked decisions or existing patterns.

## Environment Availability

**Step 2.6: SKIPPED** — Phase 4 has no external dependencies. All required components (core pipeline, adapters, mappers) exist after Phase 1-3 completion.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript compiler | Build | ✓ | 5.9 | — |
| Core pipeline | runCoreReversePipeline | ✓ | Phase 1 | — |
| Adapters | createBatchReverseAdapter, createCloneAdapter | ✓ | Phase 2 | — |
| Mappers | mapToBatchResult, mapToCloneResult | ✓ | Phase 3 | — |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Validation Architecture

> Omitted per D-09 — compile-only verification (TypeScript type check + core pipeline call confirmation).

**Testing strategy:**
- Phase 0 characterization tests skipped per D-10
- No new tests in Phase 4
- Verification: TypeScript compilation + manual code review confirming core pipeline delegation

**Validation approach:**
- `npm run build` — TypeScript type check passes
- Manual review: Confirm `runCoreReversePipeline` call present in both entry functions
- Manual review: Confirm adapter creation (`createBatchReverseAdapter`, `createCloneAdapter`)
- Manual review: Confirm mapper call (`mapToBatchResult`, `mapToCloneResult`)

## Security Domain

> Omitted — no security concerns in entry point integration. Integration delegates to existing components (Phase 1-3) which handle authentication, input validation, and audit.

**Security considerations:**
- Entry points call core pipeline via adapters (Phase 2)
- Core pipeline handles video URL resolution, download, LLM call (Phase 1)
- No new security-sensitive operations introduced
- Existing audit preserved via adapter methods

## Sources

### Primary (HIGH confidence)

- `src/modules/video-reverse-core/unified-reverse-core.ts` — runCoreReversePipeline implementation [VERIFIED: Phase 1 complete]
- `src/modules/video-reverse-core/batch-reverse-adapter.ts` — createBatchReverseAdapter factory [VERIFIED: Phase 2 complete]
- `src/modules/video-reverse-core/clone-adapter.ts` — createCloneAdapter factory [VERIFIED: Phase 2 complete]
- `src/modules/video-reverse-core/mapper.ts` — mapToBatchResult, mapToCloneResult functions [VERIFIED: Phase 3 complete]
- `src/modules/video-hot-trend/sync-service.ts` (lines 234-397) — processVideo function [VERIFIED: codebase inspection]
- `src/modules/video-hot-trend/single-reverse-service.ts` (lines 217-332) — runSingleVideoLlmReverse function [VERIFIED: codebase inspection]

### Secondary (MEDIUM confidence)

- `src/modules/video-reverse-core/types.ts` — CoreReverseInput, CoreReverseOutput types [CITED: Phase 1 complete]
- `src/modules/video-reverse-core/unified-reverse-deps.ts` — UnifiedReverseDeps interface [CITED: Phase 1 complete]
- `src/contracts/video-hot-trend-sync-contract.ts` — VideoHotTrendSyncDeps interface [CITED: existing contract]
- `src/modules/video-hot-trend/single-reverse-service.ts` (lines 32-119) — SingleVideoReverseDeps interface [CITED: existing interface]

### Tertiary (LOW confidence)

None — All research based on verified codebase inspection or locked decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All components verified in codebase, Phase 1-3 completed
- Architecture patterns: HIGH — Integration pattern documented in CONTEXT.md, adapters/mappers exist
- Pitfalls: HIGH — Based on locked decisions (D-01 to D-10) and existing code analysis
- Integration points: HIGH — Import locations verified, entry functions identified

**Research date:** 2026-04-06
**Valid until:** 30 days — stable architecture after Phase 1-3 completion

**Phase dependencies:**
- Phase 1 (Core Pipeline Extraction): ✓ Completed — Core pipeline ready
- Phase 2 (Adapter Layer): ✓ Completed — Adapters ready
- Phase 3 (Mapper Layer): ✓ Completed — Mappers ready
- Phase 4 (Entry Point Integration): Research complete, ready for planning

---

*Phase 4 research complete. Planner can now create PLAN.md files.*