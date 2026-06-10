# Phase 1: Core Pipeline Extraction - Research

**Researched:** 2026-04-06
**Domain:** TypeScript Dependency Injection + Pipeline Abstraction
**Confidence:** HIGH (based on existing codebase analysis)

## Summary

核心反推管道存在于三个入口点（sync-service.ts、single-reverse-service.ts、reverse-parse-routes.ts），存在代码重复。研究确认 `normalizeLlmReverseOutput` 函数已在两个入口点间共享（export/import），可直接移至核心模块。现有 DI 模式（Factory + Deps Interface）成熟稳定，核心管道提取应遵循此模式。关键挑战在于统一约 12-15 个核心依赖方法，同时保留各入口点差异化的错误处理语义。

**Primary recommendation:** 使用 Factory + Minimal DI Interface 模式，核心管道返回结构化结果（包含 success/errorCode/errorMessage），由调用方决定错误处理策略。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 核心模块位于 `src/modules/video-reverse-core/`，独立目录，清晰边界
- **D-02:** `UnifiedReverseDeps` 接口定义约 12 个核心方法（研究建议）
- **D-03:** 接口应包含：resolveVideoUrl, downloadVideoForLlm, resolveProvider, callLlm, createAuditRecord, finalizeAuditSuccess, finalizeAuditError, log, generateId, now
- **D-04:** 核心管道返回结构化结果（包含 success, errorCode, errorMessage），不直接抛异常
- **D-05:** 调用方（入口点）决定如何处理错误（批量入口静默跳过，用户入口抛异常）
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | 提取核心反推流程（视频下载 → base64 → LLM → JSON 解析 → 输出标准化）到独立模块 | 现有 sync-service.ts processVideo() 包含完整流程（L254-398），single-reverse-service.ts runSingleVideoLlmReverse() 有相同流程（L217-331） |
| CORE-02 | 定义统一依赖接口 `VideoReverseCoreDeps`（~15 个核心方法） | 现有 VideoHotTrendSyncDeps 约 50+ 方法，SingleVideoReverseDeps 约 20 方法，核心重叠约 12-15 方法已识别 |
| CORE-03 | 共享 `normalizeLlmReverseOutput` 函数（从 sync-service 移到核心模块） | 函数已导出（sync-service.ts L103-166）并被 single-reverse-service.ts 导入（L22），可直接移动 |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript 5 | 5.x (project constraint) | Type safety | Project constraint CLAUDE.md L103 |
| Vitest | [VERIFIED: vitest.config.ts exists] | Test framework | Existing test infrastructure |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AppError | Existing (`src/core/errors.ts`) | Error handling | Core pipeline should use structured result, not throw |
| extractJsonValue | Existing (`src/utils/json.ts`) | JSON parsing | Already used by all entry points |
| getPromptContent | Existing (`src/modules/prompt/prompt-helper.ts`) | Prompt management | Required by prompt system |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Minimal DI Interface | Large unified interface | Large interface burdens mocking, violates Interface Segregation |
| Factory function | Class-based singleton | Factory is existing pattern, explicit deps injection |
| Structured result return | Throwing exceptions | Exceptions force batch entry to catch; structured result allows caller flexibility |

**Installation:**
No new dependencies required. Phase is pure code extraction and organization.

## Architecture Patterns

### Recommended Project Structure

```
src/modules/video-reverse-core/
├── index.ts                 # Public exports
├── types.ts                 # CoreReverseInput, CoreReverseOutput, LlmReverseErrorPolicy
├── normalize-output.ts      # normalizeLlmReverseOutput() (move from sync-service)
├── unified-reverse-deps.ts  # UnifiedReverseDeps interface (~12 methods)
├── unified-reverse-core.ts  # runCoreReversePipeline()
```

**Rationale:**
- 独立目录隔离核心逻辑，单一职责
- 文件拆分便于测试和复用
- 与现有模块结构一致（video-hot-trend/, video-reverse-analysis-service.ts）

### Pattern 1: Factory with Minimal DI Interface

**What:** 服务通过工厂函数创建，接收最小依赖接口

**When to use:** 所有需要外部依赖的服务（LLM、DB、存储）

**Example:**

```typescript
// unified-reverse-deps.ts
export interface UnifiedReverseDeps {
  // Video processing
  resolveVideoUrl: (inputUrl: string) => Promise<string>;
  downloadVideoForLlm: (url: string) => Promise<{ base64: string; mimeType: string } | null>;
  
  // LLM
  resolveProvider: () => Promise<ResolvedProvider | null>;
  callLlm: (provider: ResolvedProvider, prompt: string, video: VideoPayload) => Promise<LlmResult>;
  
  // Audit
  createAuditRecord: (context: AuditContext) => { auditId: string; startedAt: number };
  finalizeAuditSuccess: (record: AuditRecord, result: LlmResult) => void;
  finalizeAuditError: (record: AuditRecord, error: Error) => void;
  
  // Utilities
  extractJsonValue: (text: string) => unknown | null;
  log: LoggerLike;
  generateId: () => string;
  now: () => number;
}

// unified-reverse-core.ts
export async function runCoreReversePipeline(
  deps: UnifiedReverseDeps,
  input: CoreReverseInput,
): Promise<CoreReverseOutput> {
  // Pipeline implementation
}
```

**Source:** Existing pattern in sync-service.ts L175, video-reverse-analysis-service.ts L64

### Pattern 2: Structured Result Return (No Exceptions)

**What:** 核心管道返回包含 success/errorCode/errorMessage 的结构化结果，不抛异常

**When to use:** 批量处理场景，允许部分失败

**Example:**

```typescript
// types.ts
export interface CoreReverseOutput {
  rawLlmOutput: LlmReverseOutput | null;
  resolvedVideoUrl: string;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

// Error codes
export const CORE_REVERSE_ERROR_CODES = {
  VIDEO_DOWNLOAD_FAILED: "VIDEO_DOWNLOAD_FAILED",
  NO_PROVIDER: "NO_PROVIDER",
  LLM_RESPONSE_INVALID: "LLM_RESPONSE_INVALID",
  LLM_CALL_FAILED: "LLM_CALL_FAILED",
} as const;
```

**Source:** CONTEXT.md D-04, D-05

### Pattern 3: Error Policy Interface

**What:** 定义错误处理语义接口，由调用方实现

**When to use:** 不同入口点有不同错误处理需求

**Example:**

```typescript
// types.ts
export interface LlmReverseErrorPolicy {
  /** 批量入口：静默跳过，返回失败结果 */
  onBatchError(output: CoreReverseOutput): void;
  /** 用户入口：抛出异常给前端 */
  onUserError(output: CoreReverseOutput): void;
}
```

### Anti-Patterns to Avoid

- **抛异常给批量入口:** 批量入口需要静默处理失败视频，不能强制 catch
- **大接口:** `VideoHotTrendSyncDeps` 已有 50+ 方法，核心接口应精简至 12-15
- **共享输出类型:** 各入口点下游消费者不同（DB、前端、脚本库），应使用 Mapper 转换

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM provider fallback chain | Custom retry logic | 现有 `resolveRouteProviderWithFallback` | 已实现多路由 fallback |
| JSON 解析 | 正则匹配 | `extractJsonValue` from `src/utils/json.ts` | 处理 markdown code block 等边缘情况 |
| Prompt 构建 | 硬编码提示词 | `buildVideoStoryboardPrompt` from `prompt.ts` + prompt management system | 提示词必须通过管理系统 |
| 视频下载 | fetch wrapper | `downloadVideoForLlm` (现有) | 处理 base64 编码、mime type 探测 |

**Key insight:** 所有核心能力已存在于现有 DI 接口，提取只需整合而非重建。

## Common Pitfalls

### Pitfall 1: 隐式错误语义差异

**What goes wrong:** 核心管道抛异常，批量入口被迫 catch，静默逻辑被隐藏

**Why it happens:** 开发者习惯 "失败就抛异常" 模式，但批量处理需要静默跳过

**How to avoid:** 核心管道返回结构化结果，错误处理由调用方决定

**Warning signs:** 核心函数 signature 包含 `Promise<T>` 而非 `Promise<{ success: boolean; ... }>`

### Pitfall 2: 接口膨胀

**What goes wrong:** 统一接口包含所有入口点的方法，导致 mock 困难

**Why it happens:** 试图 "一次性统一所有依赖"

**How to avoid:** 核心接口只包含共享方法（约 12 个），入口点特有方法通过扩展接口或适配器注入

**Warning signs:** 接口超过 20 个方法

### Pitfall 3: 忽略审计差异

**What goes wrong:** 三个入口点审计记录方式不同（createLlmDebugRecord vs recordRouteAudit）

**Why it happens:** 审计函数演进，旧入口点保持向后兼容

**How to avoid:** 核心接口提供 createAuditRecord/finalizeAuditSuccess/finalizeAuditError 三个方法，适配器桥接旧函数

**Warning signs:** 核心管道直接调用 `recordRouteAudit`

### Pitfall 4: Provider Fallback Chain 语义丢失

**What goes wrong:** 不同入口点 provider fallback chain 不同（sync: ["hot_trend_labeling", "script_generation"], single: ["hot_trend_labeling", "script_generation"], routes: ["reverse_parse", "script_generation"])

**Why it happens:** 各入口点配置不同路由优先级

**How to avoid:** `resolveProvider` 方法接收 routeKeys 参数，由调用方传入

**Warning signs:** 核心管道硬编码 routeKeys

## Code Examples

Verified patterns from existing codebase:

### 现有 normalizeLlmReverseOutput 函数

```typescript
// sync-service.ts L103-166
export function normalizeLlmReverseOutput(raw: unknown): LlmReverseOutput {
  const record = (raw ?? {}) as Record<string, unknown>;
  // 透传原始 LLM 嵌套结构
  const videoAnalysis = record.video_analysis as unknown | undefined;
  const editingAnalysis = record.editing_analysis as unknown | undefined;
  const shotBreakdown = Array.isArray(record.shot_breakdown) ? record.shot_breakdown : [];
  const videoInfo = record.video_info as unknown | undefined;
  
  // hot_trend_labels 推导逻辑...
  return {
    ...(record as unknown as LlmReverseOutput),
    video_info: videoInfo as unknown as LlmReverseOutput["video_info"],
    video_analysis: videoAnalysis as unknown as LlmReverseOutput["video_analysis"],
    shot_breakdown: shotBreakdown as unknown as LlmReverseOutput["shot_breakdown"],
    editing_analysis: editingAnalysis as unknown as LlmReverseOutput["editing_analysis"],
    hot_trend_labels: { suitability, humanPresence, humanExposure, labels, reason },
  };
}
```

### 现有核心流程（sync-service.ts processVideo）

```typescript
// sync-service.ts L254-398 (核心流程摘要)
async function processVideo(rankedVideo: RankedVideo): Promise<LlmReverseResult> {
  // 阶段A: 下载视频
  const downloadResult = await deps.downloadVideoForLlm(sourceUrl);
  if (!downloadResult) {
    return { status: "failed", errorCode: "VIDEO_DOWNLOAD_FAILED", ... };
  }
  
  // 阶段B: 异步 OSS 上传（并行）
  const ossUploadPromise = deps.uploadVideoToOss(...);
  
  // 阶段C: 构建 prompt
  const prompt = buildVideoStoryboardPrompt({ videoUrl, topicLabel, topicId });
  const promptContent = await getPromptContent(PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS, { userPrompt: prompt });
  
  // 创建审计记录
  const debugRecord = deps.createLlmDebugRecord({ routeKey, businessContext, messages, modelParams, provider });
  
  try {
    // 阶段D: 调用 LLM (Gemini/OpenAI dispatch)
    const llmResult = deps.shouldUseGeminiVideoReverseTransport(provider)
      ? await deps.requestGeminiPlainTextWithVideoPart(...)
      : await deps.requestOpenAiPlainTextWithVideoVariants(...);
    
    // 阶段E: 解析 JSON
    const parsed = deps.extractJsonValue(llmResult.text);
    if (!parsed) throw new AppError(502, "LLM_RESPONSE_INVALID", ...);
    
    // 阶段F: 标准化输出
    const output = normalizeLlmReverseOutput(parsed);
    
    // 完成审计
    deps.finalizeLlmDebugRecordSuccess({ auditId, startedAt, actualModel, responseText });
    
    return { status: "success", output, ... };
  } catch (error) {
    deps.finalizeLlmDebugRecordError({ auditId, startedAt, errorCode, errorMessage });
    return { status: "failed", errorCode, errorMessage, ... };
  }
}
```

**Key observation:** 流程已在 sync-service 中实现完整，提取只需重构为独立函数 + DI 接口。

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 独立实现 | 共享 normalizeLlmReverseOutput (export/import) | 已实现 | 单点维护 |
| 抛异常处理错误 | 返回结构化结果（sync-service 已采用） | 已采用 | 批量入口可静默处理 |

**Deprecated/outdated:**
- 直接抛异常给批量入口：应改为结构化结果
- 硬编码 routeKeys：应改为参数传入

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OSS 上传不在核心流程内（仅批量入口需要） | Architecture | 如果 OSS 上传属于核心流程，需要添加到 UnifiedReverseDeps |
| A2 | prompt 构建逻辑不变（buildVideoStoryboardPrompt + getPromptContent） | Architecture | 如果提示词系统有变更，核心流程需调整 |
| A3 | Gemini/OpenAI dispatch 逻辑封装在 callLlm 方法内 | Architecture | 如果 dispatch 逻辑需要暴露给核心管道，接口需扩展 |

**If this table is empty:** All claims in this research were verified or cited.

## Open Questions

1. **LLM Provider Fallback Chain 行为差异**
   - What we know: sync-service 用 ["hot_trend_labeling", "script_generation"], reverse-parse-routes 用 ["reverse_parse", "script_generation"]
   - What's unclear: 核心管道应接收 routeKeys 参数还是使用默认值
   - Recommendation: 核心管道接收 routeKeys 参数，由调用方传入

2. **OSS 上传是否属于核心流程**
   - What we know: 仅批量入口需要 OSS 上传（sync-service L276-283）
   - What's unclear: 是否应在核心管道内处理
   - Recommendation: OSS 上传不属于核心流程，批量入口在调用核心管道后单独处理

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified beyond existing codebase)

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript 5 | All code | ✓ | Project constraint | — |
| Vitest | Testing | ✓ | vitest.config.ts exists | — |
| Node.js | Runtime | ✓ | — | — |

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
| Quick run command | `vitest run test/video-reverse-core.test.ts` |
| Full suite command | `vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | runCoreReversePipeline 完整流程 | unit | `vitest run test/video-reverse-core.test.ts -t "runCoreReversePipeline"` | Wave 0 |
| CORE-02 | UnifiedReverseDeps 接口方法覆盖 | unit | `vitest run test/video-reverse-core.test.ts -t "UnifiedReverseDeps"` | Wave 0 |
| CORE-03 | normalizeLlmReverseOutput 输出标准化 | unit | `vitest run test/video-reverse-core.test.ts -t "normalizeLlmReverseOutput"` | Wave 0 |

### Sampling Rate

- **Per task commit:** `vitest run test/video-reverse-core.test.ts`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/video-reverse-core.test.ts` — covers CORE-01, CORE-02, CORE-03
- [ ] `test/mocks/unified-reverse-deps.mock.ts` — mock for UnifiedReverseDeps

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

Step SKIPPED: This phase is pure code extraction with no security-relevant changes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | TypeScript strict types + zod (if needed) |
| V6 Cryptography | no | No crypto operations in core pipeline |

### Known Threat Patterns for TypeScript/LLM

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM response injection | Tampering | JSON schema validation + extractJsonValue sanitize |
| Provider credential exposure | Information Disclosure | Credentials in DI interface, not hardcoded |

## Sources

### Primary (HIGH confidence)

- Existing codebase: `src/modules/video-hot-trend/sync-service.ts` — processVideo implementation
- Existing codebase: `src/modules/video-hot-trend/single-reverse-service.ts` — runSingleVideoLlmReverse implementation
- Existing codebase: `src/routes/reverse-parse-routes.ts` — ReverseParseRouteDeps interface
- Existing codebase: `src/contracts/video-hot-trend-sync-contract.ts` — VideoHotTrendSyncDeps interface definition
- Existing codebase: `src/utils/json.ts` — extractJsonValue utility
- Architecture research: `.planning/research/ARCHITECTURE.md` — Complete architecture design
- Stack research: `.planning/research/STACK.md` — Pattern recommendations

### Secondary (MEDIUM confidence)

- Context decisions: `.planning/phases/01-core-pipeline-extraction/01-CONTEXT.md` — User locked decisions

### Tertiary (LOW confidence)

None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Existing patterns, no new dependencies
- Architecture: HIGH — Existing codebase analysis, patterns proven
- Pitfalls: HIGH — Identified from existing code diff analysis

**Research date:** 2026-04-06
**Valid until:** 30 days (stable architecture, TypeScript patterns)