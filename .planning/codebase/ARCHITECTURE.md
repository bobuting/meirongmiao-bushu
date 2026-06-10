# Architecture

**Analysis Date:** 2026-04-06

## Pattern Overview

**Overall:** Modular Monolith with Layered Architecture

**Key Characteristics:**
- Backend and frontend in monorepo structure (backend at root, frontend in `apps/web/`)
- Backend serves as API server and hosts frontend static resources
- Repository pattern for data access with PostgreSQL
- Service-oriented modules for business logic
- Contract-based type definitions shared across layers

## Layers

### Backend Layers

| Layer | Purpose | Location | Key Files |
|-------|---------|----------|-----------|
| Routes | HTTP endpoints, request handling | `src/routes/` | `project-flow-routes.ts`, `auth-routes.ts`, `square-routes.ts` |
| Modules | Business logic, domain services | `src/modules/` | `project-service.ts`, `auth-service.ts`, `square-service.ts` |
| Services | Infrastructure services (LLM, media) | `src/services/` | `llm/llm-transport.ts`, `media/image-generation-providers.ts` |
| Repositories | Data access, CRUD operations | `src/repositories/pg/` | `project-pg-repository.ts`, `user-pg-repository.ts` |
| Contracts | Type definitions, interfaces | `src/contracts/` | `types.ts`, `services.ts` |
| Core | App context, config, errors | `src/core/` | `app-context.ts`, `runtime-config.ts`, `errors.ts` |
| App Setup | Application initialization pipeline | `src/app-setup/` | `setup-core.ts`, `setup-routes.ts` |
| Storage | Object storage adapters | `src/storage/` | `adapters.ts`, `runtime.ts` |
| Persistence | Data persistence utilities | `src/persistence/` | `audit-store.ts`, `prompt-persistence.ts` |
| Queue | Background job runtime | `src/queue/` | `video-job-runtime.ts` |
| Scheduler | Periodic cleanup jobs | `src/scheduler/` | `deleted-data-cleanup-scheduler.ts` |

### Frontend Layers

| Layer | Purpose | Location | Key Files |
|-------|---------|----------|-----------|
| Pages | Route-level page components | `apps/web/pages/` | `project-flow/ProjectLayout.tsx`, `square/Square.tsx` |
| Components | Reusable UI components | `apps/web/components/` | `ui/Button.tsx`, `layout/LayoutWorkflowStepper.tsx` |
| Services | API client modules | `apps/web/services/` | `realApi/*.ts`, `api-modules/*.ts` |
| Hooks | Custom React hooks | `apps/web/hooks/` | (stateless utilities) |
| Contexts | React contexts (theme, etc.) | `apps/web/contexts/` | `ThemeContext.tsx` |
| Store | Global state (Zustand) | `apps/web/store/` | `useAppStore.ts` |

## Data Flow

### Request Flow

```
Client Request
    ↓
Fastify Route Handler (`src/routes/*.ts`)
    ↓
AppContext (`app.ctx`) - Provides services and repos
    ↓
Service Layer (`src/modules/*.ts`) - Business logic
    ↓
Repository Layer (`src/repositories/pg/*.ts`) - Data access
    ↓
PostgreSQL Database
```

### Application Initialization Flow

1. `server.ts` loads environment and calls `buildApp()`
2. `buildApp()` in `app.ts` orchestrates setup phases:
   - Phase 1: `setupCore()` - Create Fastify instance, PG pool, AppContext
   - Phase 2: `setupVideoReverse()` - Video reverse analysis services
   - Phase 3: `setupOutfit()` - Outfit recommendation services
   - Phase 4: `setupHotTrend()` - Hot trend sync configuration
   - Phase 5: `setupRoutes()` - Register all API routes
3. `registerGracefulShutdownHandlers()` attach cleanup hooks

### Project Workflow Flow

The 6-step video generation workflow:

```
DRAFT → Step1(服装上传/搭配推荐) → Step2(定妆) → Step3(脚本生成) → Step4(分镜) → Step5(成片) → Step6(裂变/发布)
```

Each step has dedicated route modules:
- Step 1: `src/routes/step1-outfit/index.ts`
- Step 2: `src/routes/step2-character/index.ts`
- Step 3: `src/routes/step3-candidate/index.ts`, `src/routes/video-step/step3.ts`
- Step 4: `src/routes/step4-storyboard/index.ts`
- Step 5: `src/routes/step5-video/index.ts`

## Entry Points

| Type | Location | Handler | Purpose |
|------|----------|---------|---------|
| HTTP Server | `src/server.ts` | `main()` | Application bootstrap, port binding |
| App Builder | `src/app.ts` | `buildApp()` | Service initialization, route registration |
| Frontend Entry | `apps/web/index.html` | Vite dev server | SPA entry point |
| Frontend App | `apps/web/App.tsx` | React Router | Route definitions, authentication guard |

## Key Abstractions

### AppContext

- **Purpose:** Central dependency container holding all services, repositories, and runtime state
- **Location:** `src/core/app-context.ts`
- **Pattern:** Dependency Injection Container
- **Contains:** 
  - `repos: RepositoryCollection` - All PG repositories
  - `authService`, `projectService`, `squareService`, etc. - Domain services
  - `pool: Pool` - PostgreSQL connection pool
  - `storage: IObjectStorageAdapter` - Object storage adapter

### RepositoryCollection

- **Purpose:** Collection of all data repositories with transaction support
- **Location:** `src/repositories/pg/index.ts`
- **Pattern:** Repository Pattern with Unit of Work (transaction)
- **Key Method:** `withTransaction(fn)` for atomic operations

### RouteRegistrar

- **Purpose:** Modular route registration with contract enforcement
- **Location:** `src/routes/index.ts`
- **Pattern:** Registry Pattern
- **Contract:** `APP_ROUTE_REGISTRATION_SHELL_CONTRACT_VERSION` ensures all registrars are covered

### Object Storage Adapter

- **Purpose:** Abstract storage interface supporting S3, local, and memory modes
- **Location:** `src/storage/adapters.ts`
- **Pattern:** Strategy Pattern
- **Drivers:** S3, Supabase, Local filesystem, In-memory

## Error Handling

**Strategy:** Centralized error types with HTTP status mapping

**Pattern:**
- `AppError` class in `src/core/errors.ts` for business errors
- Global `uncaughtException` handler in `server.ts` for connection errors
- Route guards throw `AppError` for auth failures (401/403)

## Cross-Cutting Concerns

**Authentication:** 
- Route guards: `requireUser()`, `requireAdmin()` in `src/services/auth/route-guards.ts`
- Bearer token validation via `getBearerToken()`

**Validation:**
- Zod schemas in contracts
- Fastify schema validation

**Logging:**
- Pino logger via Fastify (`app.log`)
- Pretty printing in development

**Swagger/API Docs:**
- `@fastify/swagger` and `@fastify/swagger-ui`
- Setup in `src/swagger/setup-swagger.ts`

## Backend-Frontend Integration

**Static Hosting:** Backend serves frontend build from `apps/web/dist/`

**API Prefix:** All API routes under `/neirongmiao/api/`

**Proxy:** Vite dev server proxies `/neirongmiao/api` to backend port 3020

---
*Architecture analysis: 2026-04-06*