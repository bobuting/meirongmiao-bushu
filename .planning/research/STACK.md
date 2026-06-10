# Technology Stack: Unified Video Reverse Layer

**Project:** 统一视频反推层
**Researched:** 2026-04-06
**Confidence:** HIGH (based on existing codebase patterns analysis)

## Recommended Stack Patterns

### Core Pattern: Gateway/Port Architecture (Already in Use)

The codebase already uses a **Gateway/Port pattern** in `VideoReverseAnalysisService`. This pattern should be extended for unified video reverse layer.

| Pattern | Location | Purpose | Why Recommended |
|---------|----------|---------|-----------------|
| Gateway Port Pattern | `contracts/video-reverse-analysis-service.ts` | Abstract LLM video analysis | Already established, minimal dependencies, clean separation |
| Factory with Deps Interface | `modules/video-hot-trend/sync-service.ts` | Dependency injection | Consistent with existing service creation pattern |
| Shared Pipeline | `modules/video-reverse-analysis-service.ts` | Unified entry point | Already handles multiple video URL candidates |

**Why Gateway Pattern over alternatives:**
- Clean separation: Each gateway handles ONE mode (URL vs upload)
- Minimal deps: `VideoReverseAnalysisServiceDependencies` has only 3 fields
- Contract versioning: Explicit `VIDEO_REVERSE_ANALYSIS_SERVICE_CONTRACT_VERSION`
- Already proven: Entry point 3 (`reverse-parse-routes.ts`) uses this pattern successfully

### Recommended: Extend Existing Gateway Pattern

```typescript
// New unified gateway interface for video reverse core flow
interface VideoReverseCoreGatewayPort {
  /** Core LLM video analysis: download → base64 → LLM → parse → normalize */
  executeVideoReverseCore(input: VideoReverseCoreInput): Promise<VideoReverseCoreOutput>;
}

interface VideoReverseCoreInput {
  videoUrl: string;
  promptCode: string;  // Uses prompt management system
  userGoal?: string;
  timeoutMs?: number;
}

interface VideoReverseCoreOutput {
  rawLlmOutput: LlmReverseOutput;  // Already shared: normalizeLlmReverseOutput
  resolvedVideoUrl: string;
  diagnostics: CapabilityDiagnostics;
}
```

**Confidence: HIGH** — Pattern exists and is used successfully in `VideoReverseAnalysisService`.

### Dependency Injection: Minimal Interface Pattern

**Current Problem:**
- `VideoHotTrendSyncDeps`: ~50+ methods (too large)
- `SingleVideoReverseDeps`: ~20 methods (overlap with above)
- Different interfaces cause code duplication

**Recommended: Extract Core Dependencies Interface**

```typescript
// Core deps shared by all three entry points
interface VideoReverseCoreDeps {
  // LLM Provider
  resolveProvider: (routeKeys: ProviderRouteKey[]) => Promise<ResolvedProvider | null>;
  shouldUseGemini: (provider: ResolvedProvider) => boolean;
  
  // LLM Request
  requestGeminiWithVideo: (...) => Promise<LlmResult>;
  requestOpenAiWithVideo: (...) => Promise<LlmResult>;
  buildGeminiVideoPart: (base64: string, mime: string) => object;
  buildOpenAiVideoVariants: (prompt: string, base64: string, mime: string) => Variant[];
  
  // Video Processing
  downloadVideoForLlm: (url: string) => Promise<{base64: string; mimeType: string} | null>;
  resolveVideoUrl: (inputUrl: string) => Promise<string>;
  
  // Utilities (already shared)
  extractJsonValue: (text: string) => unknown | null;
  normalizeLlmReverseOutput: (raw: unknown) => LlmReverseOutput;
  
  // Audit
  createLlmDebugRecord: (...) => {auditId: string; startedAt: number};
  finalizeLlmDebugRecordSuccess: (...) => void;
  finalizeLlmDebugRecordError: (...) => void;
  
  // Clock
  generateId: () => string;
  now: () => number;
  log: LoggerLike;
}
```

**Entry point adapters add only entry-specific deps:**

```typescript
// Entry 1: Batch sync adds batch-specific deps
interface VideoHotTrendBatchDeps extends VideoReverseCoreDeps {
  uploadVideoToOss: (...) => Promise<string | null>;
  insertScriptData: (...) => Promise<string>;
  updateHotTrendAssetScriptId: (...) => Promise<void>;
  // ... batch-specific only
}

// Entry 2: Single reverse adds single-specific deps  
interface SingleVideoReverseDeps extends VideoReverseCoreDeps {
  recordRouteAudit: (...) => void;  // Legacy audit for single entry
  // ... single-specific only
}

// Entry 3: Reverse parse uses existing VideoReverseAnalysisService
// Already aligned with Gateway pattern
```

**Confidence: HIGH** — Pattern matches existing `VideoReverseAnalysisServiceDependencies` design.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| DI Pattern | Minimal interface + adapter | Keep current large interfaces | Duplication, maintenance burden |
| Service Creation | Factory function | Class-based singleton | Factory is existing pattern, explicit deps |
| Abstraction | Gateway Port | Direct LLM SDK calls | Locks to specific provider, harder to swap |
| Unification | Core service + adapters | Merge all into one service | Entry-specific logic varies, forced coupling |

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Service Class

**What:** Creating a single class that handles all three entry points with conditional logic.

```typescript
// BAD: Entry-specific branching inside service
class VideoReverseService {
  run(entryPoint: 'batch' | 'single' | 'parse', input: any) {
    if (entryPoint === 'batch') {
      // batch-specific logic...
    } else if (entryPoint === 'single') {
      // single-specific logic...
    }
    // ... shared logic buried in conditionals
  }
}
```

**Why bad:** 
- Entry-specific requirements leak into shared code
- Testing requires covering all branches
- Adding new entry point modifies shared service

**Instead:** Use **Core Service + Entry Adapters** pattern.

### Anti-Pattern 2: Large Dependency Interface

**What:** Interface with 50+ methods covering all possible needs.

**Example:** Current `VideoHotTrendSyncDeps` has:
- Provider resolution (5 methods)
- LLM requests (10 methods)
- Data operations (10 methods)
- Utility functions (5 methods)
- Config object (10 fields)
- Logging (3 methods)

**Why bad:**
- Mocking is painful for tests
- Consumer must implement irrelevant methods
- Interface changes cascade to all consumers

**Instead:** Use **Minimal Core Interface + Extension** pattern.

### Anti-Pattern 3: Adapter Layer Overload

**What:** Creating adapter layers to "bridge" different interfaces without fixing the root cause.

```typescript
// BAD: Adapter that just reshapes one interface to another
const syncDepsAdapter: VideoHotTrendSyncDeps = {
  // ... 50 methods mostly just delegating to singleDeps
  resolveRouteProviderWithFallback: (keys) => singleDeps.resolveProvider(keys),
  requestGeminiPlainTextWithVideoPart: (p, s, u, t, v, o) => singleDeps.requestGeminiWithVideo(...),
  // ... boilerplate delegation
};
```

**Why bad:**
- Adds maintenance cost
- Hides interface mismatch problem
- Debugging requires tracing through adapter

**Instead:** Fix the root cause — define shared core interface.

## Existing Patterns to Follow

### Pattern 1: Factory Function with Deps

**Location:** `modules/video-hot-trend/sync-service.ts`, `modules/video-reverse-analysis-service.ts`

**What:** Service created by factory function receiving deps object.

```typescript
export function createVideoHotTrendSyncService(deps: VideoHotTrendSyncDeps) {
  // ... return { sync, fetchList, runPhase }
}

export function createVideoReverseAnalysisService(deps: VideoReverseAnalysisServiceDependencies) {
  // ... return { run }
}
```

**When:** All service creation in this project.

**Confidence:** HIGH — Existing pattern, proven stable.

### Pattern 2: Gateway Port Abstraction

**Location:** `contracts/video-reverse-analysis-service.ts`

**What:** Define port interface, implement with specific gateway, inject via deps.

```typescript
interface VideoReverseUrlGatewayPort {
  analyzeVideoByUrl(input): Promise<GatewayResponse>;
}

interface VideoReverseAnalysisServiceDependencies {
  readonly urlGateway: VideoReverseUrlGatewayPort;
  readonly uploadGateway: VideoReverseUploadGatewayPort;
  readonly defaultModel: string;
}
```

**When:** When abstracting external capability (LLM, storage, etc).

**Confidence:** HIGH — Already used, aligns with project constraints.

### Pattern 3: Shared Pipeline

**Location:** `modules/video-reverse-analysis-service.ts` — `runSharedVideoUrlReversePipeline`

**What:** Single function that multiple entry points call.

```typescript
export async function runSharedVideoUrlReversePipeline(
  input: SharedVideoUrlReversePipelineInput,
): Promise<SharedVideoUrlReversePipelineResult> {
  // Iterate through candidate URLs
  // Call analysisService.run()
  // Return unified result
}
```

**When:** Multiple callers share same flow with variations in input preparation.

**Confidence:** HIGH — Already handles entry points 1 and 3 partially.

## Implementation Recommendations

### Phase 1: Extract Core Interface

1. Define `VideoReverseCoreDeps` interface with shared LLM/video/utility methods
2. Extract existing shared functions (`normalizeLlmReverseOutput`, etc.)
3. Both `VideoHotTrendSyncDeps` and `SingleVideoReverseDeps` extend core interface

### Phase 2: Create Core Service

1. `createVideoReverseCoreService(coreDeps)` returns `executeVideoReverseCore()`
2. Core service handles: download → base64 → LLM → parse → normalize
3. No entry-specific logic in core service

### Phase 3: Adapt Entry Points

1. Entry 1: `sync-service.ts` calls core service + handles batch storage
2. Entry 2: `single-reverse-service.ts` calls core service + maps to frontend format
3. Entry 3: Already aligned via `VideoReverseAnalysisService` — minor adjustment

### Phase 4: Remove Duplication

1. Delete duplicate LLM call logic from `sync-service.ts` processVideo
2. Delete duplicate LLM call logic from `single-reverse-service.ts`
3. Both delegate to core service

## Sources

| Source | Confidence | Notes |
|--------|------------|-------|
| Existing codebase analysis | HIGH | Patterns already in use, proven stable |
| `contracts/video-reverse-analysis-service.ts` | HIGH | Gateway pattern definition |
| `modules/video-reverse-analysis-service.ts` | HIGH | Shared pipeline implementation |
| `modules/video-hot-trend/sync-service.ts` | HIGH | Factory pattern with deps |
| `modules/video-hot-trend/single-reverse-service.ts` | HIGH | Duplicate code to remove |
| Fastify 5 docs (fastify.dev) | MEDIUM | Plugin/decorator patterns available but not needed |
| Node.js best practices (github.com/goldbergyoni/nodebestpractices) | MEDIUM | DI patterns validation |

---

*Stack research for unified video reverse layer: 2026-04-06*