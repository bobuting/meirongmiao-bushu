# Phase 3: Mapper Layer - Research

**Researched:** 2026-04-06
**Domain:** Output transformation layer - CoreReverseOutput to entry-specific formats
**Confidence:** HIGH

## Summary

Phase 3 implements three pure-function mappers that transform the unified core pipeline output (CoreReverseOutput) into entry-specific formats. The mappers bridge the gap between the standardized core pipeline (Phase 1) and the existing entry point interfaces (sync-service, single-reverse-service, reverse-parse-routes).

**Primary recommendation:** Use the existing `mapLlmReverseToResult()` pattern from single-reverse-service.ts as a reference for CloneMapper and adapt it for BatchSyncMapper. SquareRouteMapper remains a placeholder with NOT_IMPLEMENTED status, symmetric to Phase 2's SquareRouteAdapter.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 单文件 `mapper.ts` 包含三个映射函数，位于 `src/modules/video-reverse-core/` 目录
- **D-02:** 函数命名：`mapToBatchResult()`, `mapToCloneResult()`, `mapToSquareResult()`
- **D-03:** 所有映射器为纯函数，无副作用
- **D-04:** 映射器输入采用最小参数设计：CoreReverseOutput + 少量必要参数
- **D-05:** 错误码直接映射，不做额外转换逻辑
- **D-06:** SquareRouteMapper 创建占位函数，返回错误结果并标记 NOT_IMPLEMENTED
- **D-07:** 与 Phase 2 SquareRouteAdapter 的 NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH 状态保持对称
- **D-08:** CoreReverseOutput.errorCode 直接映射到各入口点的错误格式
- **D-09:** 映射关系：
  - BatchSyncMapper: `CoreReverseOutput.errorCode` → `LlmReverseResult.errorCode`
  - CloneMapper: `CoreReverseOutput.errorCode` → `SingleVideoReverseResult` 中的错误状态
  - SquareRouteMapper: 占位，返回固定错误
- **D-10:** 映射器单元测试推迟到 Phase 4 整合时编写

### Claude's Discretion

- 具体的映射函数签名细节
- 各入口点输出格式的字段映射细节
- 占位映射器的具体返回值结构

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAPR-01 | BatchSyncMapper 将 CoreReverseOutput 转换为 LlmReverseResult（批量入库格式） | Existing LlmReverseResult type definition found in sync-service.ts (lines 83-93); CoreReverseOutput provides success/errorCode/errorMessage structure; Additional context (videoKey, videoTitle, rank, ossUrl) required from caller |
| MAPR-02 | SquareRouteMapper 将 CoreReverseOutput 转换为 ReverseParseV2ResultDto（前端格式） | ReverseParseV2ResultDto type found in backendApi.types.ts (lines 310-340); NOT_IMPLEMENTED placeholder required per D-06; Symmetric to Phase 2 SquareRouteAdapter status |
| MAPR-03 | CloneMapper 将 CoreReverseOutput 转换为 SingleVideoReverseResult（脚本库格式） | Existing mapping pattern found in single-reverse-service.ts mapLlmReverseToResult() (lines 339-502); SingleVideoReverseResult type defined (lines 129-190); LlmReverseOutput transformation logic documented |

</phase_requirements>

## Standard Stack

### Core Types (Phase 1 Completed)

| Type | Source File | Purpose | Why Standard |
|------|-------------|---------|--------------|
| CoreReverseOutput | `src/modules/video-reverse-core/types.ts` | Unified core pipeline output | Phase 1 completed; contains rawLlmOutput, resolvedVideoUrl, success, errorCode, errorMessage |
| LlmReverseOutput | `src/modules/video-reverse-core/normalize-output.ts` | Standardized LLM response structure | Phase 1 moved from sync-service.ts; VideoHotTrendAnalysisOutputFull + hot_trend_labels |

### Target Output Types

| Type | Source File | Purpose | Fields Count |
|------|-------------|---------|--------------|
| LlmReverseResult | `src/modules/video-hot-trend/sync-service.ts` (lines 83-93) | Batch storage format | 10 fields (videoKey, videoTitle, rank, sourceUrl, ossUrl, status, output, errorCode, errorMessage) |
| SingleVideoReverseResult | `src/modules/video-hot-trend/single-reverse-service.ts` (lines 129-190) | Clone button result | 17 fields including storyboardPanel, libraryScript, scriptHints |
| ReverseParseV2ResultDto | `apps/web/services/backendApi.types.ts` (lines 310-340) | Frontend DTO format | All optional fields; compatible with SingleVideoReverseResult structure |

### Supporting Utilities

| Utility | Location | Purpose | When to Use |
|---------|----------|---------|-------------|
| normalizeLlmReverseOutput | `src/modules/video-reverse-core/normalize-output.ts` | Parse raw LLM response into LlmReverseOutput | Called by core pipeline (Phase 1), mappers receive normalized output |
| buildReverseStoryboardPanelViewModel | `src/modules/reverse-storyboard-report-mapper.ts` (lines 381-403) | Build storyboard panel from raw Markdown | CloneMapper may use this for storyboardPanel transformation |
| extractJsonValue | `src/utils/json.ts` | JSON parsing utility | Not needed in mappers (core pipeline already parsed) |

**No additional installation required:** All types and utilities exist in codebase after Phase 1 completion.

## Architecture Patterns

### Recommended File Structure

```
src/modules/video-reverse-core/
├── types.ts                 # CoreReverseInput, CoreReverseOutput (Phase 1)
├── unified-reverse-deps.ts  # UnifiedReverseDeps interface (Phase 1)
├── normalize-output.ts      # normalizeLlmReverseOutput (Phase 1)
├── unified-reverse-core.ts  # runCoreReversePipeline (Phase 1)
├── batch-reverse-adapter.ts # BatchSyncAdapter (Phase 2)
├── clone-adapter.ts         # CloneAdapter (Phase 2)
├── square-route-adapter.ts  # NOT_IMPLEMENTED marker (Phase 2)
├── mapper.ts                # Three mappers (Phase 3 - NEW)
└── index.ts                 # Public exports (update in Phase 3)
```

### Pattern 1: Pure Function Mapper

**What:** Input → transformation → output, zero side effects, zero external dependencies

**When to use:** All three mappers (per D-03)

**Example (from existing code):**

```typescript
// Source: src/modules/video-hot-trend/single-reverse-service.ts (lines 339-502)
function mapLlmReverseToResult(
  output: LlmReverseOutput,
  videoUrl: string,
  deps: SingleVideoReverseDeps,
): SingleVideoReverseResult {
  // 1. Extract nested structures from LlmReverseOutput
  const videoInfo = (output.video_info ?? {}) as unknown as Record<string, unknown>;
  const editingAnalysis = (output.editing_analysis ?? {}) as unknown as Record<string, unknown>;
  const shotBreakdown = Array.isArray(output.shot_breakdown) ? output.shot_breakdown : [];

  // 2. Transform shot_breakdown → frames
  const frames: SingleVideoReverseResultFrame[] = shotBreakdown.map(
    (shot: unknown, idx: number) => {
      const s = (shot ?? {}) as Record<string, unknown>;
      const basicInfo = (s.basic_info ?? {}) as Record<string, unknown>;
      const visualAnalysis = (s.visual_analysis ?? {}) as Record<string, unknown>;
      
      return {
        index: idx + 1,
        time: typeof basicInfo.timestamp === "string" ? String(basicInfo.timestamp) : null,
        title: String(s.description ?? "").trim() || `镜头 ${idx + 1}`,
        narration: String(s.description ?? "").trim(),
        visualCue: [
          typeof visualAnalysis.scene === "string" ? visualAnalysis.scene : null,
          String(basicInfo.shot_size ?? ""),
        ].filter((v): v is string => typeof v === "string" && v.length > 0).join("；"),
      };
    },
  );

  // 3. Build result structure
  return {
    id: deps.generateId(),
    projectId: null,
    input: videoUrl,
    status: "success",
    // ... remaining fields
    rawLlmOutput: output,
    storyboardPanel: { source, report, diagnostics, raw },
    // ... etc
  };
}
```

### Pattern 2: Minimal Parameter Design

**What:** Mapper receives CoreReverseOutput + only essential additional context

**When to use:** All mappers (per D-04)

**Rationale:** CoreReverseOutput already contains standardized output; additional fields (videoKey, rank, ossUrl) are entry-specific metadata that caller must provide

**Proposed signatures:**

```typescript
// BatchSyncMapper
interface BatchSyncMapperInput {
  coreOutput: CoreReverseOutput;
  videoKey: string;      // Entry-specific: normalized hot trend key
  videoTitle: string;    // Entry-specific: video title
  rank: number;          // Entry-specific: ranking position
  sourceUrl: string;     // Entry-specific: original URL
  ossUrl: string | null; // Entry-specific: OSS upload result
}
export function mapToBatchResult(input: BatchSyncMapperInput): LlmReverseResult;

// CloneMapper
interface CloneMapperInput {
  coreOutput: CoreReverseOutput;
  videoUrl: string;      // Entry-specific: resolved video URL
  generateId: () => string; // Entry-specific: ID generation
  now: () => number;     // Entry-specific: timestamp
}
export function mapToCloneResult(input: CloneMapperInput): SingleVideoReverseResult;

// SquareRouteMapper (placeholder)
export function mapToSquareResult(_coreOutput: CoreReverseOutput): ReverseParseV2ResultDto {
  return {
    status: "error",
    code: "NOT_IMPLEMENTED",
    message: "SquareRouteMapper not implemented - Phase 4 integration required",
  };
}
```

### Pattern 3: Direct Error Mapping

**What:** CoreReverseOutput.errorCode directly maps to target format errorCode field

**When to use:** All mappers (per D-05, D-08)

**Example:**

```typescript
// BatchSyncMapper error mapping
function mapToBatchResult(input: BatchSyncMapperInput): LlmReverseResult {
  if (!input.coreOutput.success) {
    return {
      videoKey: input.videoKey,
      videoTitle: input.videoTitle,
      rank: input.rank,
      sourceUrl: input.sourceUrl,
      ossUrl: input.ossUrl,
      status: "failed",
      output: null,
      errorCode: input.coreOutput.errorCode, // Direct mapping per D-08
      errorMessage: input.coreOutput.errorMessage,
    };
  }
  
  // Success case: cast rawLlmOutput to LlmReverseOutput
  const output = input.coreOutput.rawLlmOutput as LlmReverseOutput;
  return {
    videoKey: input.videoKey,
    videoTitle: input.videoTitle,
    rank: input.rank,
    sourceUrl: input.sourceUrl,
    ossUrl: input.ossUrl,
    status: "success",
    output: output,
    errorCode: null,
    errorMessage: null,
  };
}
```

### Anti-Patterns to Avoid

- **Anti-pattern 1: Mapper throwing exceptions** — Mappers must return structured results, never throw (per D-03, D-05). Core pipeline already handles errors and returns success=false.
- **Anti-pattern 2: Mapper calling external services** — Pure functions cannot call databases, LLM, or external APIs. All dependencies must be caller-provided (per D-04).
- **Anti-pattern 3: Mapper mutating input** — CoreReverseOutput must remain immutable. Mappers create new objects.
- **Anti-pattern 4: Complex error transformation logic** — Direct mapping without additional transformation (per D-05).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LlmReverseOutput transformation | Custom parsing logic | Existing `mapLlmReverseToResult()` pattern in single-reverse-service.ts | Pattern proven, handles nested structures correctly, extracts frames/sections |
| Storyboard panel construction | Manual section/frame assembly | `buildReverseStoryboardPanelViewModel()` from reverse-storyboard-report-mapper.ts | Existing utility handles Markdown parsing, section splitting, frame extraction |
| Error code mapping | Error code conversion table | Direct assignment: `errorCode: coreOutput.errorCode` | Simpler per D-05; error semantics already standardized in Phase 1 |

**Key insight:** CloneMapper can reuse ~80% of existing `mapLlmReverseToResult()` logic. BatchSyncMapper is simpler (10 fields, mostly direct mapping). SquareRouteMapper is placeholder only.

## Existing Code Analysis

### Reusable Patterns Found

1. **mapLlmReverseToResult() in single-reverse-service.ts (lines 339-502):**
   - Complete transformation from LlmReverseOutput to SingleVideoReverseResult
   - Handles nested structures: video_info, editing_analysis, shot_breakdown
   - Builds frames from shot_breakdown array
   - Constructs 5 standard sections from video_info + editing_analysis
   - Creates libraryScript with tags derived from hot_trend_labels
   - **Action:** CloneMapper adapts this pattern, removing deps dependency and using minimal input structure

2. **buildReverseStoryboardPanelViewModel() in reverse-storyboard-report-mapper.ts (lines 381-403):**
   - Builds ReverseStoryboardPanelViewModel from raw Markdown
   - Handles source metadata (videoUrl, filename, mimeType, duration)
   - Calls mapRawReverseStoryboardReport() for section/frame parsing
   - **Action:** CloneMapper may call this if storyboardPanel construction needed

3. **LlmReverseResult construction in sync-service.ts (lines 234-397):**
   - Error case handling (NO_VIDEO_URL, VIDEO_DOWNLOAD_FAILED, LLM errors)
   - Success case with normalized output
   - OSS URL integration (async upload result)
   - **Action:** BatchSyncMapper mirrors this pattern with minimal input parameters

### Integration Points Identified

| Entry Point | Current Code | Mapper Usage | Integration Location |
|-------------|--------------|--------------|----------------------|
| sync-service.ts | `processVideo()` returns LlmReverseResult (lines 234-397) | `mapToBatchResult()` replaces manual construction | Phase 4: ENTR-01 — sync-service.ts uses core pipeline + mapper |
| single-reverse-service.ts | `runSingleVideoLlmReverse()` calls `mapLlmReverseToResult()` (lines 217-332) | `mapToCloneResult()` replaces existing mapLlmReverseToResult() | Phase 4: ENTR-02 — single-reverse-service.ts uses core pipeline + mapper |
| reverse-parse-routes.ts | `/reverse/parse-v2/jobs` endpoint | `mapToSquareResult()` placeholder | Phase 4: ENTR-03 — reverse-parse-routes.ts uses core pipeline (if applicable) |

**Phase 4 integration pattern:**

```typescript
// sync-service.ts (Phase 4)
async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
  // Use BatchSyncAdapter + core pipeline
  const adapter = createBatchReverseAdapter(deps);
  const coreOutput = await runCoreReversePipeline(adapter, {
    videoUrl: sourceUrl,
    topicLabel: rankedVideo.video.label,
    topicId: String(rankedVideo.video.id ?? rankedVideo.rank),
    routeKeys: [ROUTE_KEY_HOT_TREND_LABELING, "script_generation"],
    auditContext: { routeKey: ROUTE_KEY_HOT_TREND_LABELING, businessContext: "批量反推" },
  });
  
  // Use BatchSyncMapper to transform
  return mapToBatchResult({
    coreOutput,
    videoKey: normalizeHotTrendKey("video", rankedVideo.video.label),
    videoTitle: rankedVideo.video.label,
    rank: rankedVideo.rank,
    sourceUrl: sourceUrl,
    ossUrl: ossUploadResult, // From async upload
  });
}
```

### Type Safety Analysis

- **CoreReverseOutput.rawLlmOutput: unknown | null** — Must cast to LlmReverseOutput in success case
- **LlmReverseOutput fields: unknown types** — Existing code uses safe casting pattern: `as unknown as Record<string, unknown>`
- **ReverseParseV2ResultDto: all optional fields** — Compatible with SingleVideoReverseResult structure but more flexible

**Casting pattern (from existing code):**

```typescript
// Safe casting from LlmReverseOutput fields (from single-reverse-service.ts)
const videoInfo = (output.video_info ?? {}) as unknown as Record<string, unknown>;
const editingAnalysis = (output.editing_analysis ?? {}) as unknown as Record<string, unknown>;
const shotBreakdown = Array.isArray(output.shot_breakdown) ? output.shot_breakdown : [];

// No new `as any` needed — use existing safe casting patterns
```

## Common Pitfalls

### Pitfall 1: Mapper Requiring Excessive Additional Parameters

**What goes wrong:** Mapper input grows to 10+ parameters, violating minimal parameter design (D-04)

**Why it happens:** Attempting to handle all entry-specific metadata in mapper instead of caller

**How to avoid:** Limit mapper input to CoreReverseOutput + 5 essential fields (videoKey, videoTitle, rank, sourceUrl, ossUrl for Batch; videoUrl, generateId, now for Clone)

**Warning signs:** Mapper input interface exceeds 8 parameters

### Pitfall 2: Mapper Mutating CoreReverseOutput

**What goes wrong:** Mapper modifies CoreReverseOutput fields, violating pure function design (D-03)

**Why it happens:** Attempting to fix or transform core output data in mapper

**How to avoid:** Always create new output objects; never assign to input fields

**Warning signs:** Code contains `input.coreOutput.rawLlmOutput = ...`

### Pitfall 3: CloneMapper Over-Complexity

**What goes wrong:** CloneMapper becomes 100+ lines, repeating mapLlmReverseToResult() logic

**Why it happens:** Not recognizing existing pattern as reusable baseline

**How to avoid:** CloneMapper should be ~60 lines: extract existing mapLlmReverseToResult() logic, adapt to minimal input structure, remove deps dependency

**Warning signs:** CloneMapper exceeds 80 lines or duplicates single-reverse-service.ts logic

### Pitfall 4: SquareRouteMapper Implementing Logic

**What goes wrong:** SquareRouteMapper contains transformation logic instead of placeholder (violates D-06)

**Why it happens:** Misunderstanding Phase 3 scope — SquareRoute integration deferred to Phase 4

**How to avoid:** SquareRouteMapper returns fixed error result: `{ status: "error", code: "NOT_IMPLEMENTED", message: "..." }`

**Warning signs:** SquareRouteMapper contains frame/section construction logic

### Pitfall 5: Mapper Calling External Services

**What goes wrong:** Mapper calls generateId(), now(), or database methods directly

**Why it happens:** Forgetting pure function constraint (D-03) and minimal parameter design (D-04)

**How to avoid:** All utilities (generateId, now) must be caller-provided in input interface

**Warning signs:** Mapper contains `await ...` or calls `deps.generateId()` inside mapper body

## Code Examples

### Example 1: BatchSyncMapper (Simple Transformation)

```typescript
// Source: Proposed implementation based on sync-service.ts LlmReverseResult pattern
import type { CoreReverseOutput } from "./types.js";
import type { LlmReverseOutput } from "./normalize-output.js";

interface LlmReverseResult {
  videoKey: string;
  videoTitle: string;
  rank: number;
  sourceUrl: string;
  ossUrl: string | null;
  status: "success" | "failed";
  output: LlmReverseOutput | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface BatchSyncMapperInput {
  coreOutput: CoreReverseOutput;
  videoKey: string;
  videoTitle: string;
  rank: number;
  sourceUrl: string;
  ossUrl: string | null;
}

/**
 * 将核心管道输出映射为批量入库格式
 * 纯函数，无副作用
 */
export function mapToBatchResult(input: BatchSyncMapperInput): LlmReverseResult {
  if (!input.coreOutput.success) {
    // 错误情况：直接映射 errorCode 和 errorMessage (per D-08)
    return {
      videoKey: input.videoKey,
      videoTitle: input.videoTitle,
      rank: input.rank,
      sourceUrl: input.sourceUrl,
      ossUrl: input.ossUrl,
      status: "failed",
      output: null,
      errorCode: input.coreOutput.errorCode,
      errorMessage: input.coreOutput.errorMessage,
    };
  }

  // 成功情况：标准化输出类型转换
  const output = input.coreOutput.rawLlmOutput as LlmReverseOutput;
  return {
    videoKey: input.videoKey,
    videoTitle: input.videoTitle,
    rank: input.rank,
    sourceUrl: input.sourceUrl,
    ossUrl: input.ossUrl,
    status: "success",
    output: output,
    errorCode: null,
    errorMessage: null,
  };
}
```

### Example 2: CloneMapper (Complex Transformation)

```typescript
// Source: Adapted from single-reverse-service.ts mapLlmReverseToResult() (lines 339-502)
import type { CoreReverseOutput } from "./types.js";
import type { LlmReverseOutput } from "./normalize-output.js";

interface CloneMapperInput {
  coreOutput: CoreReverseOutput;
  videoUrl: string;
  generateId: () => string;
  now: () => number;
}

/**
 * 将核心管道输出映射为复刻按钮结果格式
 * 复用 mapLlmReverseToResult 的转换逻辑，但使用最小参数设计
 */
export function mapToCloneResult(input: CloneMapperInput): SingleVideoReverseResult {
  if (!input.coreOutput.success) {
    // 错误情况：构建错误结果结构
    return {
      id: input.generateId(),
      projectId: null,
      input: input.videoUrl,
      status: "failed",
      scriptVersionId: null,
      libraryScriptId: null,
      reverseStoryboardLibraryId: null,
      rawLlmOutput: null,
      storyboardPanel: null,
      libraryScript: null,
      resolvedVideoUrl: input.coreOutput.resolvedVideoUrl,
      fallback: false,
      code: input.coreOutput.errorCode ?? "UNKNOWN",
      message: input.coreOutput.errorMessage ?? "未知错误",
      inputMode: "video_url",
      scriptHints: null,
    };
  }

  // 成功情况：复用 existing transformation logic
  const output = input.coreOutput.rawLlmOutput as LlmReverseOutput;
  
  // 提取嵌套结构 (from single-reverse-service.ts pattern)
  const videoInfo = (output.video_info ?? {}) as unknown as Record<string, unknown>;
  const editingAnalysis = (output.editing_analysis ?? {}) as unknown as Record<string, unknown>;
  const shotBreakdown = Array.isArray(output.shot_breakdown) ? output.shot_breakdown : [];

  // 构建 frames (复用 existing logic)
  const frames = shotBreakdown.map((shot: unknown, idx: number) => {
    const s = (shot ?? {}) as unknown as Record<string, unknown>;
    const basicInfo = (s.basic_info ?? {}) as unknown as Record<string, unknown>;
    const visualAnalysis = (s.visual_analysis ?? {}) as unknown as Record<string, unknown>;
    const subjectAnalysis = (s.subject_analysis ?? {}) as unknown as Record<string, unknown>;

    return {
      index: idx + 1,
      time: typeof basicInfo.timestamp === "string" ? String(basicInfo.timestamp) : null,
      title: String(s.description ?? "").trim() || `镜头 ${idx + 1}`,
      narration: String(s.description ?? "").trim(),
      visualCue: [
        typeof visualAnalysis.scene === "string" ? visualAnalysis.scene : null,
        String(basicInfo.shot_size ?? ""),
        typeof subjectAnalysis.clothing === "string" ? subjectAnalysis.clothing : null,
      ].filter((v): v is string => typeof v === "string" && v.length > 0).join("；"),
    };
  });

  // 构建 5 个标准 sections (复用 existing logic)
  const sections = [
    {
      id: "positioning",
      order: 1,
      title: "内容主题与人设定位",
      content: [
        videoInfo.theme,
        videoInfo.video_type,
        videoInfo.video_style,
        videoInfo.target_audience,
      ].filter((v): v is string => typeof v === "string" && v.length > 0).join("；"),
    },
    // ... remaining 4 sections (same pattern)
  ];

  // 构建最终结果
  return {
    id: input.generateId(),
    projectId: null,
    input: input.videoUrl,
    status: "success",
    scriptVersionId: null,
    libraryScriptId: null,
    reverseStoryboardLibraryId: null,
    rawLlmOutput: output,
    storyboardPanel: {
      source: {
        sourceType: "video_url",
        videoUrl: input.videoUrl,
        filename: null,
        mimeType: null,
        duration: typeof videoInfo.duration_seconds === "number" ? videoInfo.duration_seconds : null,
      },
      report: {
        intro: typeof videoInfo.summary === "string" ? videoInfo.summary : null,
        sections,
        frames,
        rawMarkdown: JSON.stringify(output),
        hasStructuredSections: true,
      },
      diagnostics: null,
      raw: output,
    },
    libraryScript: {
      id: input.generateId(),
      title: String(videoInfo.theme || videoInfo.summary || "视频反推").trim(),
      content: shotBreakdown.map((shot: unknown, idx: number) => {
        const s = (shot ?? {}) as unknown as Record<string, unknown>;
        return `[镜头${idx + 1}] ${String(s.description ?? "")}`;
      }).join("\n"),
      tags: (output.hot_trend_labels?.labels ?? [])
        .map((label: string) => `#${String(label).trim().replace(/^#/, "")}`)
        .concat(["#热榜反推"]),
      date: input.now(),
    },
    resolvedVideoUrl: input.coreOutput.resolvedVideoUrl,
    fallback: false,
    code: undefined,
    message: undefined,
    inputMode: "video_url",
    scriptHints: {
      source: "llm_reverse",
      overviews: typeof videoInfo.summary === "string" ? [videoInfo.summary] : [],
      itemCount: shotBreakdown.length,
      primaryItem: {
        url: input.videoUrl,
        title: String(videoInfo.theme || videoInfo.summary || "视频反推").trim(),
        videoUrl: input.videoUrl,
        audioUrl: null,
        createTime: null,
        playCount: null,
        commentCount: null,
        diggCount: null,
        shareCount: null,
        collectCount: null,
        recommendCount: null,
        nickname: null,
        duration: typeof videoInfo.duration_seconds === "number" ? videoInfo.duration_seconds : null,
        scriptText: shotBreakdown.map((shot: unknown, idx: number) => {
          const s = (shot ?? {}) as unknown as Record<string, unknown>;
          return `[镜头${idx + 1}] ${String(s.description ?? "")}`;
        }).join("\n"),
      },
    },
  };
}
```

### Example 3: SquareRouteMapper (Placeholder)

```typescript
// Source: Per D-06, D-07 — placeholder symmetric to Phase 2 SquareRouteAdapter
import type { CoreReverseOutput } from "./types.js";
import type { ReverseParseV2ResultDto } from "../../../apps/web/services/backendApi.types.js";

/**
 * 广场路由输出映射器 — 占位实现
 * STATUS: NOT_IMPLEMENTED
 * 原因：与 Phase 2 SquareRouteAdapter NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH 状态对称
 * Phase 4 整合时处理
 */
export function mapToSquareResult(_coreOutput: CoreReverseOutput): ReverseParseV2ResultDto {
  return {
    status: "error",
    code: "NOT_IMPLEMENTED",
    message: "SquareRouteMapper not implemented - Phase 4 integration required",
    resolvedVideoUrl: _coreOutput.resolvedVideoUrl,
    fallback: false,
  };
}

/**
 * 标记常量（用于类型检查和文档追踪）
 */
export const SQUARE_ROUTE_MAPPER_STATUS = "NOT_IMPLEMENTED";
export const SQUARE_ROUTE_MAPPER_REASON =
  "SquareRouteAdapter is NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH (Phase 2); " +
  "mapper deferred to Phase 4 integration";
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual LlmReverseResult construction in processVideo() | BatchSyncMapper transformation | Phase 3 (planned) | Centralized mapping logic, easier maintenance |
| mapLlmReverseToResult() in single-reverse-service.ts | CloneMapper in mapper.ts | Phase 3 (planned) | Reusable transformation logic, no deps dependency |
| No SquareRoute mapper | SquareRouteMapper placeholder | Phase 3 (planned) | Symmetric to Phase 2 adapter status, Phase 4 integration marker |

**Deprecated/outdated:**
- None — Phase 1 and Phase 2 completed successfully, Phase 3 builds on completed foundation

## Assumptions Log

> All claims in this research were verified through codebase inspection or derived from locked decisions in CONTEXT.md. No `[ASSUMED]` claims requiring user confirmation.

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **CloneMapper error result structure detail**
   - What we know: CoreReverseOutput contains errorCode, errorMessage
   - What's unclear: Exact field names in SingleVideoReverseResult error case (status: "failed", code vs errorCode)
   - Recommendation: Follow existing pattern in single-reverse-service.ts error handling (lines 312-330) — use `code` and `message` fields

2. **StoryboardPanel construction in CloneMapper**
   - What we know: buildReverseStoryboardPanelViewModel() exists in reverse-storyboard-report-mapper.ts
   - What's unclear: Should CloneMapper call this utility or inline construction?
   - Recommendation: Inline construction for simplicity (mapper is pure function, utility expects rawMarkdown input which mapper already has as JSON.stringify(output))

3. **BatchSyncMapper OSS URL handling**
   - What we know: OSS upload is async in sync-service.ts, result passed to LlmReverseResult
   - What's unclear: Mapper receives ossUrl as input parameter, no OSS logic in mapper
   - Recommendation: Confirm with D-04 minimal parameter design — ossUrl is caller-provided, mapper only transforms

**All questions resolved:** Each question has clear recommendation based on existing patterns or locked decisions.

## Environment Availability

**Step 2.6: SKIPPED** — Phase 3 has no external dependencies. All required types and utilities exist in codebase after Phase 1 and Phase 2 completion.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript compiler | Build | ✓ | 5.9 | — |
| CoreReverseOutput type | Mapper input | ✓ | Phase 1 | — |
| LlmReverseOutput type | Mapper output | ✓ | Phase 1 | — |
| Existing mappers pattern | Reference | ✓ | single-reverse-service.ts | — |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Validation Architecture

> Omitted per D-10 — mapper unit tests deferred to Phase 4 integration.

**Testing strategy:**
- Phase 4 integration tests will cover mapper transformations
- Pure functions are easy to test — single input → single output
- No Wave 0 gaps for mappers specifically (Phase 4 will create integration tests)

**Validation approach:**
- Manual verification during Phase 4 integration
- Type safety enforced by TypeScript strict mode
- Existing single-reverse-service.ts pattern serves as reference implementation

## Security Domain

> Omitted — no security concerns in mapper layer. Mappers are pure functions processing already-sanitized data from core pipeline (Phase 1).

**Security considerations:**
- Input CoreReverseOutput comes from trusted core pipeline (Phase 1 completed)
- No external API calls, database access, or user input processing
- Output formats are internal structures (LlmReverseResult, SingleVideoReverseResult, ReverseParseV2ResultDto)

## Sources

### Primary (HIGH confidence)

- `src/modules/video-reverse-core/types.ts` — CoreReverseOutput type definition [VERIFIED: Phase 1 completed]
- `src/modules/video-reverse-core/normalize-output.ts` — LlmReverseOutput type definition [VERIFIED: Phase 1 completed]
- `src/modules/video-hot-trend/sync-service.ts` (lines 83-93) — LlmReverseResult interface definition [VERIFIED: codebase inspection]
- `src/modules/video-hot-trend/single-reverse-service.ts` (lines 129-190) — SingleVideoReverseResult interface definition [VERIFIED: codebase inspection]
- `src/modules/video-hot-trend/single-reverse-service.ts` (lines 339-502) — mapLlmReverseToResult() implementation [VERIFIED: codebase inspection]
- `apps/web/services/backendApi.types.ts` (lines 310-340) — ReverseParseV2ResultDto interface definition [VERIFIED: codebase inspection]

### Secondary (MEDIUM confidence)

- `src/modules/reverse-storyboard-report-mapper.ts` — buildReverseStoryboardPanelViewModel() utility [CITED: existing pattern reference]
- `src/modules/video-reverse-core/batch-reverse-adapter.ts` — BatchSyncAdapter implementation [CITED: Phase 2 completed]
- `src/modules/video-reverse-core/clone-adapter.ts` — CloneAdapter implementation [CITED: Phase 2 completed]
- `src/modules/video-reverse-core/square-route-adapter.ts` — NOT_IMPLEMENTED marker [CITED: Phase 2 completed]

### Tertiary (LOW confidence)

None — All research based on verified codebase inspection or locked decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All types verified in codebase, Phase 1 and Phase 2 completed
- Architecture patterns: HIGH — Existing mapper pattern found in single-reverse-service.ts, pure function design confirmed
- Pitfalls: HIGH — Based on locked decisions (D-03 to D-10) and existing code analysis
- Integration points: HIGH — Phase 1, 2 completed; Phase 4 integration locations documented

**Research date:** 2026-04-06
**Valid until:** 30 days — stable architecture after Phase 1 and 2 completion

**Phase dependencies:**
- Phase 1 (Core Pipeline Extraction): ✓ Completed — CoreReverseOutput, LlmReverseOutput types ready
- Phase 2 (Adapter Layer): ✓ Completed — Adapters ready for Phase 4 integration
- Phase 3 (Mapper Layer): Research complete, ready for planning
- Phase 4 (Entry Point Integration): Blocked until Phase 3 complete

---

*Phase 3 research complete. Planner can now create PLAN.md files.*