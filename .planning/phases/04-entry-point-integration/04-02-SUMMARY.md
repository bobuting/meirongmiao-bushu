# Summary: Rewrite single-reverse-service to use unified core pipeline

**Plan:** 04-02
**Wave:** 1
**Status:** Completed
**Commit:** 49a2eab

## What was done

Rewrote `runSingleVideoLlmReverse` function to delegate to the unified core pipeline (`runCoreReversePipeline`). The function now uses `createCloneAdapter` to wrap existing dependencies and `mapToCloneResult` to transform the output. Removed all duplicate code including the `mapLlmReverseToResult` function (165 lines deleted).

Key changes:
- Import `runCoreReversePipeline`, `createCloneAdapter`, `mapToCloneResult` from `video-reverse-core`
- Remove old imports: `extractJsonValue`, `buildVideoStoryboardPrompt`, `normalizeLlmReverseOutput`, `getPromptContent`, `PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS`
- Rewrite `runSingleVideoLlmReverse` to call core pipeline (from 116 lines to 31 lines)
- User entry error semantics: throw `AppError` on failure (per RESEARCH.md Pattern 3)
- Delete `mapLlmReverseToResult` function (replaced by `mapToCloneResult` in mapper.ts)
- Update `SingleVideoReverseResult` types: `rawLlmOutput` and `storyboardPanel` allow `null`

## Key decisions

1. **Error handling strategy**: User entry point throws `AppError` on failure, while batch entry returns failed result (per RESEARCH.md Pattern 3)
2. **Adapter pattern**: `createCloneAdapter` wraps `SingleVideoReverseDeps` to `UnifiedReverseDeps` without modifying existing deps interface
3. **Mapper reuse**: `mapToCloneResult` in `mapper.ts` replaces local `mapLlmReverseToResult`, eliminating 165 lines of duplicate mapping logic

## Files modified

- `src/modules/video-hot-trend/single-reverse-service.ts`: 
  - Updated imports to use core pipeline
  - Rewrote `runSingleVideoLlmReverse` function (43 insertions, 295 deletions)
  - Deleted `mapLlmReverseToResult` function
  - Updated `SingleVideoReverseResult` type to allow null values

## Verification

All acceptance criteria verified:
- `grep -n "runCoreReversePipeline"` returns 2 lines (import + call)
- `grep -n "createCloneAdapter"` returns 2 lines (import + call)
- `grep -n "mapToCloneResult"` returns 2 lines (import + call)
- Old imports removed (extractJsonValue, buildVideoStoryboardPrompt, normalizeLlmReverseOutput, getPromptContent)
- No references to `mapLlmReverseToResult` function
- `rawLlmOutput` type allows `null`
- `storyboardPanel` type allows `null`
- `throw new AppError` present for error handling

## Notable deviations

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None - existing threat model covers this integration point (T-04-04, T-04-05, T-04-06).