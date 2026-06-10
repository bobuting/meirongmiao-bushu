# Phase 2: Adapter Layer - Research

**Researched:** 2026-04-06
**Domain:** TypeScript Adapter Pattern + Dependency Interface Mapping
**Confidence:** HIGH (based on existing codebase analysis)

## Summary

适配器层将三个现有依赖接口（VideoHotTrendSyncDeps、SingleVideoReverseDeps、ReverseParseRouteDeps）包装为统一的 UnifiedReverseDeps 接口。研究发现 SyncDeps 和 SingleDeps 高度相似，适配器实现简单直接。但 ReverseParseRouteDeps 使用**服务端口模式**而非函数式依赖接口，架构差异显著，需特殊处理（标记为暂不实现或 Phase 4 整合时处理）。核心挑战在于 callLlm 方法需要适配器内部封装 Gemini/OpenAI dispatch 逻辑，以及审计方法的命名映射。

**Primary recommendation:** BatchSyncAdapter 和 CloneAdapter 可直接实现；SquareRouteAdapter 标记为 `NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH`，待 Phase 4 整合时处理。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 适配器文件位于 `src/modules/video-reverse-core/` 目录下，与核心模块保持内聚
- **D-02:** 文件命名规范：`{功能名}-adapter.ts`，例如 `batch-reverse-adapter.ts`、`square-route-adapter.ts`、`clone-adapter.ts`
- **D-03:** 每个入口点一个适配器，实现 UnifiedReverseDeps 接口
- **D-04:** 适配器委托给现有 deps 接口，不修改现有实现
- **D-05:** ReverseParseRouteDeps 使用服务端口模式（videoReverseAnalysisService），与其他两个入口点架构不同
- **D-06:** SquareRouteAdapter 需特殊处理：可能需要创建内部桥接逻辑或标记为暂不实现

### Claude's Discretion
- 具体的方法映射实现细节
- 错误处理在适配器层的包装方式
- 类型转换的边界条件处理

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADPT-01 | 批量同步适配器 — 包装 `VideoHotTrendSyncDeps` 到统一接口 | VideoHotTrendSyncDeps 约 50+ 方法，核心方法映射已分析，适配器需补充 resolveVideoUrl（identity）、generateId、封装 callLlm dispatch |
| ADPT-02 | 广场路由适配器 — 包装 `ReverseParseRouteDeps` 到统一接口 | **架构差异显著**：使用服务端口模式而非函数式依赖，建议标记为暂不实现，待 Phase 4 整合 |
| ADPT-03 | 复刻按钮适配器 — 包装 `SingleVideoReverseDeps` 到统一接口 | SingleVideoReverseDeps 约 20 方法，核心方法映射已分析，适配器需补充 extractJsonValue（import from utils/json.ts）、封装 callLlm dispatch |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript 5 | 5.x (project constraint) | Type safety | Project constraint CLAUDE.md L103 |
| UnifiedReverseDeps | Phase 1 created | Target interface | Core module defines this interface |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| extractJsonValue | `src/utils/json.ts` | JSON parsing | CloneAdapter needs to import this |
| shouldUseGeminiVideoReverseTransport | `src/services/llm/gemini-utils.ts` | Gemini/OpenAI dispatch | Adapter callLlm implementation |
| buildGeminiInlineVideoPart | `src/services/llm/gemini-utils.ts` | Gemini video format | Adapter callLlm implementation |
| buildOpenAiInlineVideoContentVariants | `src/services/llm/openai-utils.ts` | OpenAI video format | Adapter callLlm implementation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adapter Pattern | Direct modification of existing deps | 破坏性变更，违反 D-04 |
| Service Port Pattern for all | Port for SyncDeps/SingleDeps | 过度抽象，现有函数式依赖已足够 |
| Skip SquareRouteAdapter | Create minimal bridge | 桥接逻辑复杂，不如 Phase 4 直接整合 |

**Installation:**
No new dependencies required. Phase is pure code extraction and organization.

## Architecture Patterns

### Recommended Project Structure

```
src/modules/video-reverse-core/
├── index.ts                 # Public exports
├── types.ts                 # CoreReverseInput, CoreReverseOutput
├── normalize-output.ts      # normalizeLlmReverseOutput()
├── unified-reverse-deps.ts  # UnifiedReverseDeps interface
├── unified-reverse-core.ts  # runCoreReversePipeline()
├── batch-reverse-adapter.ts # ADPT-01: VideoHotTrendSyncDeps → UnifiedReverseDeps
├── clone-adapter.ts         # ADPT-03: SingleVideoReverseDeps → UnifiedReverseDeps
└── square-route-adapter.ts  # ADPT-02: ReverseParseRouteDeps → UnifiedReverseDeps (marked NOT_IMPLEMENTED)
```

**Rationale:**
- 适配器与核心模块同目录，内聚性强
- 文件命名遵循 D-02 规范
- 适配器实现统一接口，委托给现有 deps

### Pattern 1: Adapter Delegation Pattern

**What:** 适配器持有现有 deps 实例，委托所有方法调用

**When to use:** 包装现有接口为统一接口，不修改现有实现

**Example:**

```typescript
// batch-reverse-adapter.ts
import type { UnifiedReverseDeps } from "./unified-reverse-deps.js";
import type { VideoHotTrendSyncDeps } from "../../contracts/video-hot-trend-sync-contract.js";
import { shouldUseGeminiVideoReverseTransport, buildGeminiInlineVideoPart } from "../../services/llm/gemini-utils.js";
import { buildOpenAiInlineVideoContentVariants } from "../../services/llm/openai-utils.js";

/** 批量同步适配器：VideoHotTrendSyncDeps → UnifiedReverseDeps */
export function createBatchReverseAdapter(existingDeps: VideoHotTrendSyncDeps): UnifiedReverseDeps {
  return {
    // 直接委托
    resolveVideoUrl: (inputUrl: string) => Promise.resolve(inputUrl), // SyncDeps 没有 resolveVideoUrl，用 identity
    downloadVideoForLlm: existingDeps.downloadVideoForLlm,
    
    // 解析 Provider：unwrap 结果
    resolveProvider: async (routeKeys) => {
      const resolved = await existingDeps.resolveRouteProviderWithFallback(routeKeys);
      return resolved?.provider ?? null;
    },
    
    // callLlm：封装 Gemini/OpenAI dispatch
    callLlm: async (provider, prompt, video, timeoutMs) => {
      if (shouldUseGeminiVideoReverseTransport(provider)) {
        const videoPart = buildGeminiInlineVideoPart(video.base64, video.mimeType);
        return existingDeps.requestGeminiPlainTextWithVideoPart(
          provider, "", prompt, 0.3, videoPart, { timeoutMsOverride: timeoutMs }
        );
      } else {
        const variants = buildOpenAiInlineVideoContentVariants(prompt, video.base64, video.mimeType);
        return existingDeps.requestOpenAiPlainTextWithVideoVariants(
          provider, "", variants, 0.3, { timeoutMsOverride: timeoutMs }
        );
      }
    },
    
    // 审计：方法名映射
    createAuditRecord: existingDeps.createLlmDebugRecord,
    finalizeAuditSuccess: existingDeps.finalizeLlmDebugRecordSuccess,
    finalizeAuditError: existingDeps.finalizeLlmDebugRecordError,
    
    // 工具方法
    extractJsonValue: existingDeps.extractJsonValue,
    log: existingDeps.log,
    generateId: () => `batch-${existingDeps.now()}-${Math.random().toString(36).slice(2)}`,
    now: existingDeps.now,
  };
}
```

**Source:** D-04 (适配器委托给现有 deps 接口)

### Pattern 2: Method Signature Transformation

**What:** 适配器转换方法签名以匹配统一接口

**When to use:** 现有方法签名与统一接口不完全匹配

**Key transformations:**

| UnifiedReverseDeps Method | Source Method | Transformation |
|---------------------------|---------------|----------------|
| resolveVideoUrl | (identity) | SyncDeps 缺少，返回 inputUrl |
| resolveProvider | resolveRouteProviderWithFallback | Unwrap `{ provider, routeKey }` → `provider` |
| callLlm | requestGemini/OpenAi | 封装 dispatch logic |
| createAuditRecord | createLlmDebugRecord | 方法名映射，签名兼容 |
| finalizeAuditSuccess | finalizeLlmDebugRecordSuccess | 方法名映射，签名兼容 |
| finalizeAuditError | finalizeLlmDebugRecordError | 方法名映射，签名兼容 |

**Source:** CONTEXT.md Key Method Mappings L79-92

### Pattern 3: Service Port Pattern (ReverseParseRouteDeps)

**What:** 提供服务实例而非函数集合

**When to use:** 复杂服务需要多种能力组合

**Example (from reverse-parse-routes.ts):**

```typescript
export interface ReverseParseRouteDeps {
  /** 构建 douyin 反推 fetch orchestrator */
  buildReverseFetchOrchestrator: () => { execute: (...) => Promise<...> };
  /** 视频反推分析服务实例 */
  videoReverseAnalysisService: VideoReverseAnalysisServicePort;
  /** 共享视频 URL 反推管线 */
  runSharedVideoUrlReversePipelineForUser: (...) => Promise<...>;
}
```

**Key observation:** ReverseParseRouteDeps 提供的是**服务实例**（videoReverseAnalysisService）而非**函数集合**。这与 UnifiedReverseDeps 的函数式依赖接口设计不兼容。

**Recommendation:** 标记为 `NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH`，待 Phase 4 整合时处理。

**Source:** D-05, D-06

### Anti-Patterns to Avoid

- **直接修改现有 deps:** 违反 D-04，破坏现有实现
- **强制桥接 SquareRouteAdapter:** 架构差异太大，桥接逻辑复杂
- **忽略 Gemini/OpenAI dispatch:** callLlm 必须内部封装 dispatch，不能暴露给核心管道

## Method Mapping Tables

### ADPT-01: VideoHotTrendSyncDeps → UnifiedReverseDeps

| UnifiedReverseDeps Method | VideoHotTrendSyncDeps Source | Transformation Required |
|---------------------------|------------------------------|------------------------|
| resolveVideoUrl | **缺失** | 返回 `inputUrl` (identity function) |
| downloadVideoForLlm | downloadVideoForLlm | 直接委托 |
| resolveProvider | resolveRouteProviderWithFallback | Unwrap `{ provider, routeKey }` → `provider` |
| callLlm | requestGeminiPlainTextWithVideoPart + requestOpenAiPlainTextWithVideoVariants | 封装 dispatch + buildVideoPart |
| createAuditRecord | createLlmDebugRecord | 方法名映射，签名兼容 |
| finalizeAuditSuccess | finalizeLlmDebugRecordSuccess | 方法名映射，签名兼容 |
| finalizeAuditError | finalizeLlmDebugRecordError | 方法名映射，签名兼容 |
| extractJsonValue | extractJsonValue | 直接委托 |
| log | log | 直接委托 |
| generateId | **缺失** | 使用 `deps.now()` + 随机字符串 |
| now | now | 直接委托 |

**Source:** [VERIFIED: src/contracts/video-hot-trend-sync-contract.ts L205-429]

### ADPT-03: SingleVideoReverseDeps → UnifiedReverseDeps

| UnifiedReverseDeps Method | SingleVideoReverseDeps Source | Transformation Required |
|---------------------------|-------------------------------|------------------------|
| resolveVideoUrl | resolveVideoUrl | 直接委托 |
| downloadVideoForLlm | downloadVideoForLlm | 直接委托 |
| resolveProvider | resolveRouteProviderWithFallback | Unwrap `{ provider, routeKey }` → `provider` |
| callLlm | requestGeminiPlainTextWithVideoPart + requestOpenAiPlainTextWithVideoVariants | 封装 dispatch + buildVideoPart |
| createAuditRecord | createLlmDebugRecord | 方法名映射，签名兼容 |
| finalizeAuditSuccess | finalizeLlmDebugRecordSuccess | 方法名映射，签名兼容 |
| finalizeAuditError | finalizeLlmDebugRecordError | 方法名映射，签名兼容 |
| extractJsonValue | **缺失** | Import from `src/utils/json.ts` |
| log | log | 直接委托 |
| generateId | generateId | 直接委托 |
| now | now | 直接委托 |

**Source:** [VERIFIED: src/modules/video-hot-trend/single-reverse-service.ts L32-119]

### ADPT-02: ReverseParseRouteDeps → UnifiedReverseDeps

| UnifiedReverseDeps Method | ReverseParseRouteDeps Source | Status |
|---------------------------|------------------------------|--------|
| resolveVideoUrl | **架构不匹配** | NOT_IMPLEMENTED |
| downloadVideoForLlm | **架构不匹配** | NOT_IMPLEMENTED |
| resolveProvider | **架构不匹配** | NOT_IMPLEMENTED |
| callLlm | **架构不匹配** | NOT_IMPLEMENTED |
| createAuditRecord | createLlmDebugRecord (from llm-debug-recorder.ts) | 可桥接，但架构不匹配 |
| finalizeAuditSuccess | finalizeLlmDebugRecordSuccess | 可桥接，但架构不匹配 |
| finalizeAuditError | finalizeLlmDebugRecordError | 可桥接，但架构不匹配 |
| extractJsonValue | extractJsonValue | 可桥接，但架构不匹配 |
| log | app.log | 可桥接，但架构不匹配 |
| generateId | ctx.clock.generateId() | 可桥接，但架构不匹配 |
| now | ctx.clock.now() | 可桥接，但架构不匹配 |

**Architectural mismatch:** ReverseParseRouteDeps 提供服务实例（videoReverseAnalysisService）而非函数集合。适配器无法直接委托。

**Recommendation:** 标记为 `NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH`，Phase 4 整合时处理。

**Source:** [VERIFIED: src/routes/reverse-parse-routes.ts L96-117]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini/OpenAI dispatch logic | Custom if/else in callLlm | shouldUseGeminiVideoReverseTransport + existing request functions | 已实现完整 dispatch + format building |
| JSON 解析 | 正则匹配 | extractJsonValue from `src/utils/json.ts` | 处理 markdown code block 等边缘情况 |
| 视频格式构建 | Custom video part builder | buildGeminiInlineVideoPart + buildOpenAiInlineVideoContentVariants | 已实现 base64/mimeType 格式 |
| Provider 解析 | Custom fallback chain | resolveRouteProviderWithFallback | 已实现多路由 fallback |

**Key insight:** 适配器是**包装层**而非**实现层**，所有核心能力委托给现有 deps。

## Common Pitfalls

### Pitfall 1: 忽略 resolveProvider 结果类型差异

**What goes wrong:** resolveRouteProviderWithFallback 返回 `{ provider, routeKey }`，UnifiedReverseDeps.resolveProvider 只返回 `provider`

**Why it happens:** 开发者可能直接委托，忽略类型差异

**How to avoid:** 适配器 unwrap 结果：

```typescript
resolveProvider: async (routeKeys) => {
  const resolved = await existingDeps.resolveRouteProviderWithFallback(routeKeys);
  return resolved?.provider ?? null;  // unwrap!
}
```

**Warning signs:** TypeScript 类型检查失败，或核心管道收到 `{ provider, routeKey }` 对象

### Pitfall 2: 忽略 callLlm dispatch 逻辑

**What goes wrong:** 适配器直接暴露 shouldUseGeminiVideoReverseTransport 给核心管道，核心管道被迫处理 dispatch

**Why it happens:** 试图简化适配器实现

**How to avoid:** callLlm 方法内部封装完整 dispatch：

```typescript
callLlm: async (provider, prompt, video, timeoutMs) => {
  // 封装 dispatch logic
  if (shouldUseGeminiVideoReverseTransport(provider)) {
    const videoPart = buildGeminiInlineVideoPart(video.base64, video.mimeType);
    return existingDeps.requestGeminiPlainTextWithVideoPart(...);
  } else {
    const variants = buildOpenAiInlineVideoContentVariants(prompt, video.base64, video.mimeType);
    return existingDeps.requestOpenAiPlainTextWithVideoVariants(...);
  }
}
```

**Warning signs:** 核心管道中出现 Gemini/OpenAI 分支逻辑

### Pitfall 3: 忽略审计方法命名差异

**What goes wrong:** 适配器直接委托 createLlmDebugRecord 而不映射方法名

**Why it happens:** createLlmDebugRecord vs createAuditRecord 方法名相似

**How to avoid:** 明确方法名映射：

```typescript
createAuditRecord: existingDeps.createLlmDebugRecord,  // 方法名映射
finalizeAuditSuccess: existingDeps.finalizeLlmDebugRecordSuccess,  // 方法名映射
finalizeAuditError: existingDeps.finalizeLlmDebugRecordError,  // 方法名映射
```

**Warning signs:** 适配器调用 `deps.createAuditRecord` 而现有 deps 没有此方法

### Pitfall 4: 强制桥接 SquareRouteAdapter

**What goes wrong:** 创建复杂桥接逻辑调用 runSharedVideoUrlReversePipelineForUser

**Why it happens:** 试图完成所有适配器

**How to avoid:** 标记为 `NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH`，Phase 4 整合时处理

**Warning signs:** SquareRouteAdapter 包含大量桥接代码，适配器变成服务 wrapper

### Pitfall 5: 忽略 VideoHotTrendSyncDeps 缺少 generateId

**What goes wrong:** 适配器直接委托 existingDeps.generateId 而现有 deps 没有此方法

**Why it happens:** assume 所有 deps 都有 generateId

**How to avoid:** 为 SyncDeps 提供 generateId 实现：

```typescript
generateId: () => `batch-${existingDeps.now()}-${Math.random().toString(36).slice(2)}`,
```

**Warning signs:** TypeScript 类型检查失败，或运行时 `existingDeps.generateId is not a function`

## Code Examples

Verified patterns from existing codebase:

### shouldUseGeminiVideoReverseTransport 函数

```typescript
// src/services/llm/gemini-utils.ts L127
export function shouldUseGeminiVideoReverseTransport(provider: ResolvedRouteProvider): boolean {
  // 判断是否使用 Gemini 视频传输（基于 provider.vendor 和 model）
}
```

### createLlmDebugRecord 函数签名

```typescript
// src/services/llm/llm-debug-recorder.ts L110-149
export function createLlmDebugRecord(
  ctx: AppContext,
  input: LlmDebugRecordInput,
): LlmDebugRecordResult {
  // 创建 LLM 调试记录
  // input.routeKey, businessContext, projectId, userId, messages, modelParams, provider
  // return { auditId, startedAt }
}
```

### resolveRouteProviderWithFallback 函数签名

```typescript
// src/services/llm/provider-resolver.ts (推断)
async function resolveRouteProviderWithFallback(
  ctx: AppContext,
  routeKeys: ProviderRouteKey[],
): Promise<{ provider: ResolvedRouteProvider; routeKey: ProviderRouteKey } | null>;
```

**Key observation:** 签名与 UnifiedReverseDeps.resolveProvider 不完全匹配，适配器需要 unwrap。

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 独立依赖接口 | 统一依赖接口（Phase 1） | Phase 1 | 核心管道可共享 |
| 直接调用 Gemini/OpenAI | 封装 dispatch in callLlm | Phase 2 (推荐) | 核心管道简化 |

**Deprecated/outdated:**
- 核心管道处理 Gemini/OpenAI dispatch：应在适配器内封装

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | VideoHotTrendSyncDeps 缺少 resolveVideoUrl 方法 | Method Mapping | 如果有此方法，identity function 不必要 |
| A2 | VideoHotTrendSyncDeps 缺少 generateId 方法 | Method Mapping | 如果有此方法，custom implementation 不必要 |
| A3 | SquareRouteAdapter 暂不实现是最佳选择 | Architecture | 如果需要立即实现，桥接逻辑会增加复杂度 |
| A4 | createLlmDebugRecord 签名与 UnifiedReverseDeps.createAuditRecord 兼容 | Method Mapping | 如果签名不兼容，适配器需要参数转换 |

**Claims verification status:**
- A1: [VERIFIED: src/contracts/video-hot-trend-sync-contract.ts — 没有 resolveVideoUrl 方法]
- A2: [VERIFIED: src/contracts/video-hot-trend-sync-contract.ts — 没有 generateId 方法]
- A3: [ASSUMED] — based on architectural analysis, needs user confirmation
- A4: [VERIFIED: 签名格式匹配，参数类型一致]

## Open Questions

1. **SquareRouteAdapter 实现策略**
   - What we know: ReverseParseRouteDeps 使用服务端口模式，与函数式依赖接口不兼容
   - What's unclear: 是否需要立即实现桥接逻辑，还是等待 Phase 4 整合
   - Recommendation: 标记为 `NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH`，Phase 4 整合时处理

2. **generateId 实现方式**
   - What we know: VideoHotTrendSyncDeps 缺少 generateId
   - What's unclear: 最佳实现方式（now() + random vs other）
   - Recommendation: 使用 `deps.now()` + 随机字符串，确保唯一性

3. **callLlm temperature 参数**
   - What we know: 核心管道不传 temperature，适配器默认 0.3
   - What's unclear: 是否需要从核心管道传入 temperature
   - Recommendation: 默认 0.3，保持与现有实现一致

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified beyond existing codebase)

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript 5 | All code | ✓ | Project constraint | — |
| UnifiedReverseDeps | Phase 1 created | ✓ | src/modules/video-reverse-core/unified-reverse-deps.ts | — |
| shouldUseGeminiVideoReverseTransport | callLlm implementation | ✓ | src/services/llm/gemini-utils.ts | — |
| buildGeminiInlineVideoPart | callLlm implementation | ✓ | src/services/llm/gemini-utils.ts | — |
| buildOpenAiInlineVideoContentVariants | callLlm implementation | ✓ | src/services/llm/openai-utils.ts | — |

**Missing dependencies with no fallback:**
None

**Missing dependencies with fallback:**
None

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vitest.config.ts |
| Quick run command | `vitest run test/video-reverse-core/adapters.test.ts` |
| Full suite command | `vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADPT-01 | BatchSyncAdapter 实现完整 | unit | `vitest run test/video-reverse-core/adapters.test.ts -t "BatchSyncAdapter"` | Wave 0 |
| ADPT-02 | SquareRouteAdapter 标记 NOT_IMPLEMENTED | unit | `vitest run test/video-reverse-core/adapters.test.ts -t "SquareRouteAdapter"` | Wave 0 |
| ADPT-03 | CloneAdapter 实现完整 | unit | `vitest run test/video-reverse-core/adapters.test.ts -t "CloneAdapter"` | Wave 0 |

### Sampling Rate

- **Per task commit:** `vitest run test/video-reverse-core/adapters.test.ts`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/video-reverse-core/adapters.test.ts` — covers ADPT-01, ADPT-02, ADPT-03
- [ ] `test/mocks/video-hot-trend-sync-deps.mock.ts` — mock for VideoHotTrendSyncDeps
- [ ] `test/mocks/single-video-reverse-deps.mock.ts` — mock for SingleVideoReverseDeps

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

Step SKIPPED: This phase is pure adapter implementation with no security-relevant changes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | TypeScript strict types + interface contracts |
| V6 Cryptography | no | No crypto operations in adapters |

### Known Threat Patterns for TypeScript/Adapter

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Interface mismatch | Tampering | TypeScript strict type checking |
| Dependency injection spoofing | Spoofing | Interface contracts enforce method signatures |

## Sources

### Primary (HIGH confidence)

- Existing codebase: `src/modules/video-reverse-core/unified-reverse-deps.ts` — UnifiedReverseDeps interface definition
- Existing codebase: `src/contracts/video-hot-trend-sync-contract.ts` — VideoHotTrendSyncDeps interface definition
- Existing codebase: `src/modules/video-hot-trend/single-reverse-service.ts` — SingleVideoReverseDeps interface definition
- Existing codebase: `src/routes/reverse-parse-routes.ts` — ReverseParseRouteDeps interface definition
- Existing codebase: `src/services/llm/gemini-utils.ts` — shouldUseGeminiVideoReverseTransport, buildGeminiInlineVideoPart
- Existing codebase: `src/services/llm/llm-debug-recorder.ts` — createLlmDebugRecord function
- Context decisions: `.planning/phases/02-adapter-layer/02-CONTEXT.md` — User locked decisions

### Secondary (MEDIUM confidence)

- Prior phase research: `.planning/phases/01-core-pipeline-extraction/01-RESEARCH.md` — Core pipeline patterns

### Tertiary (LOW confidence)

None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Existing patterns, no new dependencies
- Architecture: HIGH — Existing codebase analysis, interfaces verified
- Pitfalls: HIGH — Identified from existing code diff analysis
- Method mapping: HIGH — Verified by reading source interfaces

**Research date:** 2026-04-06
**Valid until:** 30 days (stable architecture, TypeScript patterns)