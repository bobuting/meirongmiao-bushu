# Domain Pitfalls

**Domain:** Unified Service Layer Refactoring (Brownfield)
**Project:** 统一视频反推层 (Video Reverse Derivation Unification)
**Researched:** 2026-04-06
**Confidence:** HIGH (based on codebase analysis + established refactoring patterns)

---

## Critical Pitfalls

### Pitfall 1: Premature Abstraction Before Understanding Differences

**What goes wrong:**
Developers extract shared code into a "unified core" before fully understanding the semantic differences between entry points. The abstraction becomes over-parameterized with flags/branches to handle edge cases, making it more complex than the original separate implementations.

**Why it happens:**
DRY principle is interpreted too strictly. Developers see similar code patterns (video download → base64 → LLM → JSON parse) and immediately extract, missing that the **semantics** differ (error handling, audit logging, result format, timeout policies).

**Consequences:**
- Unified function becomes a "God Function" with 10+ parameters
- Branch logic inside the shared core (`if (entryPoint === 'hotTrend') { ... } else if ...`)
- Changes to one entry point accidentally affect others
- Harder to test — need to cover all combination of parameters

**How to avoid:**
1. **Rule of Three with Semantic Analysis**: Only abstract after identifying THREE semantically equivalent patterns, not just syntactically similar ones
2. **Difference Matrix**: Before unifying, create a matrix of what differs:
   ```
   | Aspect          | HotTrend Batch | Square Input | Replicate Button |
   |-----------------|----------------|--------------|------------------|
   | Error handling  | Skip & continue| Throw to user| Throw to user    |
   | Audit pattern   | createDebugRecord | recordRouteAudit | Both |
   | Timeout policy  | 180s override  | Default      | Default          |
   | Result format   | LlmReverseResult | ReverseParseV2ResultDto | SingleVideoReverseResult |
   ```
3. **Abstract at the RIGHT level**: Only unify the truly identical parts (video download, base64 encoding, JSON extraction), not the entire workflow

**Warning signs:**
- Unified function has `if (source === ...)` branches
- Parameters include `options?: { entryPoint?: ... }`
- Tests need mock setups for multiple "modes"

**Phase to address:**
Phase 1 (Core Flow Extraction) — Define what is truly shared before writing any unified code

---

### Pitfall 2: Hidden Differences in Error Handling Semantics

**What goes wrong:**
Each entry point has different error handling expectations that are not explicitly documented during unification. Hot trend batch processing silently skips failed videos, while square input expects errors to propagate to the user.

**Why it happens:**
Error handling is often implicit in the code flow. Developers focus on the "happy path" during extraction and miss the failure semantics that differ per context.

**Consequences:**
- Unified core throws an error that breaks batch processing (should have been logged and skipped)
- Square input user sees cryptic batch-style error messages
- Retry logic inappropriate for the entry point context

**Analysis from codebase:**
```typescript
// sync-service.ts (HotTrend) - returns { status: "failed", errorCode, errorMessage }
// Returns a result object, doesn't throw — batch can continue
return {
  videoKey, videoTitle, rank, sourceUrl, ossUrl: null,
  status: "failed", output: null, errorCode: "VIDEO_DOWNLOAD_FAILED",
  errorMessage: "failed to download video for llm analysis",
};

// single-reverse-service.ts - throws AppError
// User-facing, needs immediate feedback
throw new AppError(502, "VIDEO_DOWNLOAD_FAILED", "视频下载失败，请检查链接是否有效。");

// reverse-parse-routes.ts - different error codes for different input modes
```

**How to avoid:**
1. **Error Policy Contract**: Define explicit error handling interface:
   ```typescript
   interface LlmReverseErrorPolicy {
     onDownloadFailed: 'skip' | 'throw' | 'retry';
     onLlmTimeout: 'skip' | 'throw' | 'fallback';
     onErrorFormat: (code: string, message: string) => AppError | ResultError;
   }
   ```
2. **Inject error behavior**: Pass error policy as dependency, not hardcoded in core
3. **Audit each entry point's current error behavior** before unifying

**Warning signs:**
- Unified code has `throw` but original batch code returned error objects
- Tests only check "success" case
- Error messages are inconsistent across entry points after unification

**Phase to address:**
Phase 1 (Core Flow Extraction) — Document error policies for each entry point as part of interface design

---

### Pitfall 3: Audit/Debugging Divergence

**What goes wrong:**
Each entry point has different audit logging patterns. During unification, one pattern is arbitrarily chosen, breaking audit trails for other entry points.

**Why it happens:**
Audit logging is considered "plumbing" and developers either:
- Pick one pattern and force others to use it
- Add both patterns, creating redundant logs
- Remove audit during unification and forget to restore

**Analysis from codebase:**
```typescript
// sync-service.ts uses:
deps.createLlmDebugRecord({ routeKey, businessContext, messages, modelParams, provider });
deps.finalizeLlmDebugRecordSuccess({ auditId, startedAt, actualModel, responseText });
deps.finalizeLlmDebugRecordError({ auditId, startedAt, errorCode, errorMessage });

// single-reverse-service.ts uses BOTH:
// 1. createLlmDebugRecord/finalizeLlmDebugRecordSuccess/finalizeLlmDebugRecordError (new pattern)
// 2. recordRouteAudit (old pattern for backward compatibility)

// reverse-parse-routes.ts uses:
// Different audit pattern via ReverseParseRouteDeps interface
```

**Consequences:**
- Missing audit records for certain entry points
- Redundant audit records (both patterns firing)
- Dashboard/analytics break due to missing data
- Difficult to trace issues across entry points

**How to avoid:**
1. **Audit as explicit dependency**: Define audit interface in core deps
2. **Adapter pattern**: Each entry point adapts its audit pattern to the unified interface
3. **Phase the migration**: Keep backward-compatible audit during transition
4. **Verify audit completeness**: After unification, check audit tables for each entry point

**Warning signs:**
- Audit-related code commented out during refactoring
- Multiple audit calls in unified function
- Audit dashboard shows gaps after refactoring

**Phase to address:**
Phase 2 (Dependency Interface Unification) — Audit adapters are part of the deps interface design

---

### Pitfall 4: Type Safety Bypass During Interface Unification

**What goes wrong:**
When unifying interfaces with slight differences, developers use `as any` or `as unknown as T` to make TypeScript accept the unified interface, introducing runtime type errors.

**Why it happens:**
TypeScript's strict type checking makes interface unification painful when fields differ slightly. The `as any` escape is the quickest path to "make it compile."

**Analysis from codebase:**
From CONCERNS.md — 15+ locations with `as any` escapes:
```typescript
// src/routes/api-registration.ts:158
} = deps as any; // 使用 as any 绕过类型检查

// Already observed in sync-service.ts:
const videoAnalysis = record.video_analysis as unknown | undefined;
const parsed = (raw ?? {}) as Record<string, unknown>;
```

**Consequences:**
- Runtime crashes from unexpected data shapes
- IDE loses ability to detect errors early
- Future refactoring becomes harder (type errors hidden)
- Debugging becomes guesswork

**How to avoid:**
1. **Define union types explicitly**:
   ```typescript
   type UnifiedResult = HotTrendResult | SquareResult | ReplicateResult;
   // Use discriminated union with `type` field
   ```
2. **Adapter pattern for type conversion**: Each entry point has an adapter that converts its type to unified type
3. **Never use `as any`**: If types don't match, the interface is wrong, not the type checker
4. **Validate at runtime**: Use zod or similar for runtime validation at boundaries

**Warning signs:**
- `as any` or `as unknown as T` in unified code
- Type definitions that mirror existing types instead of unifying them
- IDE shows type errors but code "works" at runtime

**Phase to address:**
Phase 2 (Dependency Interface Unification) — Proper type definitions before implementation

---

### Pitfall 5: Breaking Existing Entry Points During Transition

**What goes wrong:**
Changes to the unified core inadvertently break one or more entry points. Because the codebase lacks comprehensive tests for all entry points, breakage goes undetected until production.

**Why it happens:**
- No end-to-end tests covering all three entry points
- Changes made to shared code without testing all consumers
- Route handlers depend on implicit behavior of services

**Analysis from codebase:**
From CONCERNS.md — Test coverage gaps:
- Hot Trend Module: Sync engine, realtime pipeline — UNTESTED
- Reverse Parse Routes: 1372 lines — UNTESTED
- Single Reverse Service: Extracted from sync-service — UNTESTED

**Consequences:**
- Production incidents from one entry point breaking
- Fear of making changes (regression risk)
- Slow deployment cycles (manual verification needed)

**How to avoid:**
1. **Strangler Fig Pattern**: Don't replace all at once — incrementally route entry points to unified core
2. **Feature flags**: Route each entry point to old or new implementation via flag
3. **Parallel run**: Run both implementations, compare results before switching
4. **Test harness BEFORE refactoring**: Write characterization tests for each entry point

**Warning signs:**
- "I'll test this later" during refactoring
- Changes to shared code without running all entry points manually
- Missing test files for the modules being unified

**Phase to address:**
Phase 0 (Pre-flight) — Establish test harness for all three entry points

---

### Pitfall 6: Large File Fragmentation Without Clear Boundaries

**What goes wrong:**
When extracting from a large file (like reverse-parse-routes.ts at 1372 lines), developers create multiple small files but fail to define clear boundaries. Dependencies become tangled between files.

**Why it happens:**
"Split the file" is seen as the goal, not "define clear module boundaries." Developers cut the file arbitrarily without considering dependency direction.

**Consequences:**
- Circular dependencies between extracted modules
- Implicit imports through barrel files
- Hard to understand which module owns what functionality
- Re-extraction needed later

**How to avoid:**
1. **Define boundaries BEFORE splitting**: Identify cohesive clusters of functionality
2. **Dependency direction**: Higher-level modules depend on lower-level, never reverse
3. **Interface-first**: Define interfaces between modules before extracting code
4. **Single responsibility per module**: Each extracted file has one clear purpose

**Warning signs:**
- Circular import errors after extraction
- Barrel file (`index.ts`) with 20+ exports
- Module names like `helpers.ts` or `utils.ts` (too vague)

**Phase to address:**
Phase 3 (Entry Point Adaptation) — When extracting from reverse-parse-routes.ts

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `as any` to unify interfaces | Faster to compile | Runtime type errors, lost IDE support | Never |
| Skip writing tests before refactor | Faster to start | Regression risk, fear of changes | Never |
| Copy-paste similar code instead of abstracting | Faster initial delivery | Maintenance burden when changes needed | MVP only, extract in Phase 2 |
| Force single error handling pattern | Simpler unified code | Broken error semantics for some entry points | Never — use error policy injection |
| Comment out audit during refactor | Cleaner code during work | Missing audit trails, forgotten uncomment | Never — keep audit as dependency |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gemini video request | Assume all providers support inline video | Check `shouldUseGeminiVideoReverseTransport()` before choosing transport |
| Provider fallback | Hardcode fallback chain | Inject `resolveRouteProviderWithFallback()` with route keys |
| Video download | Assume URL is directly playable | Call `resolveVideoUrl()` for short link resolution (抖音短链) |
| OSS upload | Block LLM call on OSS upload completion | Run OSS upload async, parallel with LLM (pattern in sync-service.ts) |
| Prompt template | Hardcode prompt in service | Use `getPromptContent()` from prompt management module |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Serial LLM calls for batch processing | Batch takes 5+ minutes for 10 videos | Use CONCURRENCY=3 pattern from sync-service.ts | >3 videos in batch |
| In-memory job state (Map) | Memory growth, no cleanup on crash | Use database-backed job queue | >100 concurrent jobs |
| No video download timeout | Downloads hang indefinitely | Add timeout (provider.timeoutMs or 180s) | Large video files |
| Single provider fallback | Provider outage blocks all requests | Multi-provider fallback chain | Any provider outage |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Bypass auth for batch processing | Unauthorized video reverse | Hot trend batch uses internal auth, user-facing routes require `requireUser()` |
| Leak video URLs in logs | Privacy exposure, scraping risk | Log video metadata only, not full URLs |
| Accept arbitrary video URLs | SSRF, malicious video hosting | Validate URL origin, whitelist domains |
| Store raw LLM output without sanitization | XSS if output rendered in frontend | Sanitize JSON before storage, escape in frontend |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Long reverse with no progress indication | User thinks it's broken, retries | Show progress phases (download → analyze → parse) |
| Generic error messages ("LLM failed") | User can't self-correct | Specific error: "视频下载失败，请检查链接是否有效" |
| Different result format per entry point | Confusing UX across features | Normalize to unified result format at route layer |
| Timeout with no feedback | User doesn't know if retry will help | Show estimated time, retry button |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Core extraction:** Often missing error policy differentiation — verify each entry point's error handling preserved
- [ ] **Interface unification:** Often missing audit adapter implementation — verify audit records exist for all entry points
- [ ] **Entry point adaptation:** Often missing type conversion adapter — verify TypeScript compiles without `as any`
- [ ] **Testing:** Often missing end-to-end tests for all three entry points — verify manual test checklist executed
- [ ] **Documentation:** Often missing updated route documentation — verify API docs reflect unified behavior

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Premature abstraction (over-parameterized function) | HIGH | Extract simpler core, move differentiation to adapters |
| Hidden error handling differences | MEDIUM | Add error policy parameter, update each entry point's policy |
| Audit divergence | MEDIUM | Create audit adapter interface, implement per entry point |
| Type safety bypass (`as any`) | HIGH | Define proper union types, add runtime validation |
| Entry point breakage | HIGH (production) | Rollback via feature flag, add characterization tests |
| Large file fragmentation | MEDIUM | Re-analyze boundaries, consolidate related modules |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Premature Abstraction | Phase 1 (Core Flow Extraction) | Review unified function — no `if (entryPoint)` branches |
| Hidden Error Handling Differences | Phase 1 | Error policy interface documented, each entry point has policy |
| Audit Divergence | Phase 2 (Dependency Interface Unification) | Audit adapter interface defined, test audit records per entry |
| Type Safety Bypass | Phase 2 | TypeScript compiles without `as any`, runtime validation at boundaries |
| Breaking Entry Points | Phase 0 (Pre-flight) | Characterization tests for all three entry points |
| Large File Fragmentation | Phase 3 (Entry Point Adaptation) | Module boundaries documented, no circular imports |

---

## Sources

- **Sandi Metz, "The Wrong Abstraction"** — Premature abstraction creates coupling harder to undo than duplication
- **Martin Fowler, Strangler Fig Pattern** — Incremental replacement strategy for legacy systems
- **Codebase Analysis** — sync-service.ts, single-reverse-service.ts, reverse-parse-routes.ts, video-hot-trend-sync-contract.ts
- **CONCERNS.md** — Existing technical debt and type safety issues
- **CONVENTIONS.md** — Dependency injection patterns, error handling conventions

---
*Pitfalls research for: 统一视频反推层 (Unified Video Reverse Derivation Layer)*
*Researched: 2026-04-06*