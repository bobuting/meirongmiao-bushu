# Codebase Concerns

**Analysis Date:** 2026-04-06

## Tech Debt

| Area | Issue | Impact | Priority |
|------|-------|--------|----------|
| Fission Video | `TEST_MODE = true` hardcoded in production code | Only generates 1 video/image instead of full count, feature incomplete | High |
| Theme System | Infinite refresh bug workaround - useEffect commented out | Theme not auto-initialized on mount, manual intervention needed | High |
| Type Safety | `as any` escapes in 15+ locations | Runtime type errors possible, IDE support degraded | Medium |
| Large Files | `douyin-integration-service.ts` 2113 lines, `library-routes.ts` 1649 lines, `fission-video-routes.ts` 1624 lines | Maintenance burden, slow compilation, hard to navigate | Medium |
| Hot Trend | `hotValue` extraction TODO in `video-hot-trend-sync-deps.ts` and `sync-service.ts` | Trend hotness value not captured from raw data | Low |
| Hot Trend Routes | Route registration TODO in `src/modules/hot-trend/routes/index.ts` | Module routes not integrated | Low |
| Video Merge | Volume control, fade in/out effects TODO in `video-merge.ts` | Background audio features incomplete | Low |

**Files with TEST_MODE flags:**
- `src/modules/fission-video/fission-storyboard-video-generator.ts:258` - TEST_MODE = true
- `src/modules/fission-video/fission-storyboard-image-generator.ts:1297` - TEST_MODE = true
- `src/modules/fission-video/fission-newstory-orchestrator.ts:220` - TEST_MODE = true

**Files with `as any` escapes:**
- `src/routes/api-registration.ts:158` - deps as any
- `src/swagger/setup-swagger.ts:85,90` - SHARED_SCHEMAS as any
- `src/routes/fission-video-routes.ts:1187,1237,1324,1416` - status/body as any
- `src/routes/project-flow-handlers.ts:105` - analysisCards: any[]
- `src/routes/reverse-square-routes.ts:194` - payloadJson as any
- `src/routes/scripts-routes.ts:100` - script as any
- `src/contracts/step2-final-prompt-integration-contract.ts:26` - rec as any

## Known Issues

| Issue | Location | Status | Notes |
|-------|----------|--------|-------|
| Infinite theme refresh | `apps/web/hooks/useTheme.ts:287-291`, `apps/web/contexts/ThemeContext.tsx:208` | Workaround (commented out) | useEffect disabled, needs root cause fix |
| Database startup hang | `src/app-setup/startup-pg-pool.ts` | Workaround | Requires `PERSISTENCE_REQUIRE_READY=false` when cloud DB has stuck queries (DDL locks) |
| Hot trend route not registered | `src/modules/hot-trend/routes/index.ts:24` | TODO | "实现路由注册" placeholder |
| Square aggregate user works | `src/service/square-aggregate-service.ts:221` | TODO | "实现用户作品查询" placeholder |
| eslint-disable suppressions | 8 locations | Active | Suppressing @typescript-eslint/no-explicit-any, no-await-in-loop, no-require-imports |

## Security Concerns

| Concern | Location | Risk | Recommendation |
|---------|----------|------|----------------|
| Bearer token in header | `src/services/auth/route-guards.ts:12-18` | Medium | Token extracted without validation of format/length |
| APP_SECRET_KEY requirement | `src/core/security.ts:21`, `src/core/runtime-config.ts:335` | Low | Correctly enforced in production, test mode exempt |
| Admin bootstrap credentials | `src/core/runtime-config.ts:348` | Medium | DEV_BOOTSTRAP_ADMIN_* forbidden in production, but allowed in dev |
| External API tokens in DB | `src/app-setup/credential-resolvers.ts` | Low | Encrypted with AES-256-GCM, properly decrypted at runtime |
| .env file loading | `src/server.ts:1-5` | Low | .env.local priority, .env fallback - standard pattern |

**Current mitigations:**
- All API routes require `Authorization: Bearer {token}` via `requireUser()` guard
- Admin routes require role check via `requireAdmin()` guard
- Secrets encrypted before DB storage using `encryptSecret()` from `src/core/security.ts`
- Production mode enforces APP_SECRET_KEY presence

## Performance Concerns

| Area | Concern | Impact | Optimization |
|------|---------|--------|--------------|
| Large Service Files | `douyin-integration-service.ts` 2113 lines | Slow TypeScript compilation, IDE lag | Split into provider-specific modules |
| Serial Video Generation | `fission-storyboard-video-generator.ts:263-284` | Sequential API calls, no parallelism | Implement controlled parallelism with rate limiting |
| Console Logging | 30+ console.log/warn/error calls in production code | Noise in logs, performance overhead in hot paths | Replace with pino logger (already available) |
| DB Query Patterns | Multiple `.query()` calls in same transaction | Connection pool pressure | Use transaction client for batch operations |
| In-Memory Maps | `sideVideoTasks` Map in `src/app.ts:117-130` | Memory growth without cleanup | Add TTL-based cleanup or max size limit |

**Large files exceeding 1000 lines:**
1. `src/modules/douyin-integration-service.ts` - 2113 lines
2. `src/routes/step3-candidate-helpers.ts` - 1769 lines
3. `src/routes/library-routes.ts` - 1649 lines
4. `src/routes/fission-video-routes.ts` - 1624 lines
5. `src/service/llm/llm-image-video.ts` - 1462 lines
6. `src/routes/reverse-parse-routes.ts` - 1372 lines
7. `src/modules/fission-video/fission-storyboard-image-generator.ts` - 1340 lines
8. `src/routes/admin/scripts-hot-trends-routes.ts` - 1062 lines

## Fragile Areas

| Area | Why Fragile | Risk | Stabilization |
|------|-------------|------|---------------|
| `douyin-integration-service.ts` | 2113 lines, 3 external providers (apify, tikhub, anytocopy), complex fallback logic | Provider changes break sync, hard to test | Split into provider adapters, add integration tests |
| `library-routes.ts` | 1649 lines, 30+ dependency functions passed via deps object | Missing dependency = runtime error, hard to refactor | Reduce closure dependencies, use explicit service injection |
| `api-registration.ts` | `deps as any` bypasses type checking, 20+ dependency fields | Type mismatches silent until runtime | Define proper Deps interface, remove as any |
| Database startup | Cloud DB stuck queries (DDL locks) cause `initialize()` to hang indefinitely | Server won't start, confusing error messages | Add connection timeout, implement stuck query cleanup script |
| Fission video module | TEST_MODE flags prevent full feature testing, placeholder fallbacks | Production users get incomplete output | Remove TEST_MODE, implement proper feature flags |

**Type safety escape locations:**
```typescript
// src/routes/api-registration.ts:158
} = deps as any; // 使用 as any 绕过类型检查

// src/routes/project-flow-handlers.ts:104-105
// eslint-disable-next-line @typescript-eslint/no-explicit-any
analysisCards: any[];
```

## Scaling Limits

| Resource/System | Current Capacity | Limit | Scaling Path |
|------------------|------------------|-------|--------------|
| Hot Trend Topics | Top N configurable via env | No pagination, single batch | Implement pagination for large topic sets |
| Video Tasks Map | In-memory Map, no cleanup | Memory leak over time | Add TTL cleanup or move to Redis |
| LLM Provider Calls | Rate limiter configurable | Per-provider limits | Add queue-based processing for high volume |
| Library Assets | No pagination limit mentioned | Potential large result sets | Add default pagination limits |

## Dependencies at Risk

| Package | Risk | Impact | Migration Plan |
|---------|------|--------|----------------|
| `pg` 8.18.0 | Low - stable driver | Connection pooling, repos | None needed |
| `fastify` 5.6.0 | Low - actively maintained | All routes | None needed |
| `sharp` 0.32.6 | Medium - image processing dependency | Image resize/crop | Monitor for Node.js compatibility |
| `zod` 4.1.1 | Low - schema validation | Request/response validation | None needed |

## Missing Critical Features

| Feature Gap | Problem | Blocks |
|-------------|---------|--------|
| Full fission video generation | TEST_MODE limits to 1 video/image | Production video creation workflow |
| Theme auto-init | useEffect commented out | First-time user experience |
| Hot trend user works query | TODO placeholder | User content dashboard |
| Video volume control | TODO in video-merge.ts | Audio mixing features |

## Test Coverage Gaps

| Untested Area | What's Not Tested | Files | Risk | Priority |
|---------------|-------------------|-------|------|----------|
| Fission Video Module | Video/image generation, storyboard assembly | `src/modules/fission-video/*` | High - core feature untested | High |
| Hot Trend Module | Sync engine, realtime pipeline | `src/modules/hot-trend/*` | Medium - data sync untested | Medium |
| Library Routes | Asset CRUD, view session management | `src/routes/library-routes.ts` | Medium - user library operations | Medium |
| Douyin Integration | Provider fallbacks, token resolution | `src/modules/douyin-integration-service.ts` | High - external API handling | High |
| Authentication | Token validation, admin guards | `src/services/auth/route-guards.ts` | High - security critical | High |
| Admin Routes | Config management, model presets | `src/routes/admin-routes.ts` | Low - admin-only | Low |

**Existing tests (7 files in `test/` directory):**
- `app_shell_handlers.unit.test.ts`
- `app_shell_thin_entry.unit.test.ts`
- `fission_export_music_mix.unit.test.ts`
- `step5_music_recommendation_controller.unit.test.ts`
- `video_export_backend_api.unit.test.ts`
- `video_music_backend_api.unit.test.ts`
- `video_music_service.unit.test.ts`
- `step3_video_script.unit.test.ts`
- Integration tests: `video_music_routes.integration.test.ts`

---

*Mapped: 2026-04-06*