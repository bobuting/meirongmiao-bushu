# Directory Structure

**Analysis Date:** 2026-04-06

## Root Layout

```
neirongmiao/
├── apps/web/                    # Frontend React application (monorepo)
├── src/                         # Backend source code
│   ├── app-setup/               # Application initialization modules
│   ├── contracts/               # Type definitions and interfaces
│   ├── core/                    # App context, config, errors
│   ├── modules/                 # Business logic services
│   ├── persistence/             # Data persistence utilities
│   ├── queue/                   # Background job runtime
│   ├── repositories/            # Data repository layer
│   ├── routes/                  # HTTP route handlers
│   ├── scheduler/               # Periodic cleanup schedulers
│   ├── services/                # Infrastructure services (LLM, media)
│   ├── storage/                 # Object storage adapters
│   ├── contant-config/          # Static configuration constants
│   ├── app.ts                   # Main application builder
│   └── server.ts                # HTTP server entry point
├── test/                        # Unit and integration tests
├── e2e/                         # End-to-end tests
├── scripts/                     # Utility scripts (build, migration)
├── public/                      # Static assets (fallback frontend)
├── dist/                        # Compiled backend output
├── package.json                 # Backend dependencies
├── tsconfig.json                # TypeScript configuration
└── .env / .env.local            # Environment configuration
```

## Backend Directory Purposes

### `src/routes/` - HTTP Route Handlers

**Purpose:** Define API endpoints and request handling

**Organization:** Organized by feature domain

**Key Files:**
| File | Purpose |
|------|---------|
| `project-flow-routes.ts` | Project CRUD, workflow state |
| `auth-routes.ts` | Login, registration, session |
| `square-routes.ts` | Square (public content) endpoints |
| `library-routes.ts` | Library assets, characters, scripts |
| `reverse-parse-routes.ts` | Video reverse analysis |
| `admin-routes.ts` | Admin dashboard endpoints |
| `video-api-routes.ts` | Video generation API |
| `prompt-routes.ts` | Prompt management |
| `step1-outfit/index.ts` | Step 1 outfit routes |
| `step2-character/index.ts` | Step 2 character routes |
| `step3-candidate/index.ts` | Step 3 candidate routes |
| `step4-storyboard/index.ts` | Step 4 storyboard routes |
| `step5-video/index.ts` | Step 5 video routes |

**Pattern:** Route registration functions return handlers, injected into `setupRoutes()`

### `src/modules/` - Business Logic Services

**Purpose:** Domain services and business logic

**Organization:** One service per file, feature subdirectories

**Key Files:**
| File | Purpose |
|------|---------|
| `project-service.ts` | Project management |
| `auth-service.ts` | Authentication, sessions |
| `square-service.ts` | Square content management |
| `outfit-service.ts` | Outfit recommendations |
| `script-service.ts` | Script generation |
| `storyboard-service.ts` | Storyboard frames |
| `video-job-service.ts` | Video job management |
| `character-service.ts` | Character management |
| `douyin-publish-service.ts` | Douyin publishing |
| `hot-trend/index.ts` | Hot trend sync |
| `video-step/step3/` | Step 3 video generation |
| `fission-video/` | Fission video generation |

### `src/repositories/pg/` - PostgreSQL Data Access

**Purpose:** CRUD operations for each entity type

**Organization:** One repository per entity

**Key Files:**
| File | Entity |
|------|--------|
| `user-pg-repository.ts` | Users, Sessions |
| `project-pg-repository.ts` | Projects, WorkflowStates |
| `asset-pg-repository.ts` | Assets, OutfitPlans |
| `character-pg-repository.ts` | CharacterPreviews |
| `script-storyboard-pg-repository.ts` | Scripts, StoryboardFrames |
| `video-job-pg-repository.ts` | VideoJobs, FissionResults |
| `library-pg-repository.ts` | LibraryAssets, LibraryCharacters, LibraryScripts |
| `reverse-pg-repository.ts` | ReverseTasks, ReverseAttempts |
| `trend-pg-repository.ts` | TrendEntries, TrendSyncJobs |
| `provider-pg-repository.ts` | Providers, ProviderSecrets, ProviderPolicies |

**Pattern:** Each repository extends base class, accepts Pool or PoolClient for transactions

### `src/contracts/` - Type Definitions

**Purpose:** Shared interfaces, types, contracts

**Organization:** Contract files for each feature domain

**Key Files:**
| File | Purpose |
|------|---------|
| `types.ts` | Core types (Project, User, Asset, etc.) |
| `services.ts` | Service interfaces (IAuthService, IProjectService) |
| `repository-ports/common.ts` | Repository port interfaces |
| `object-storage.ts` | Storage adapter interface |
| `step1-*.ts` | Step 1 contracts |
| `step2-*.ts` | Step 2 contracts |
| `step3-*.ts` | Step 3 contracts |
| `step4-*.ts` | Step 4 contracts |
| `hot-trend-*.ts` | Hot trend contracts |
| `llm-types.ts` | LLM request/response types |

### `src/services/` - Infrastructure Services

**Purpose:** External service integrations (LLM, media)

**Organization:** Subdirectories by service type

**Key Files:**
| File | Purpose |
|------|---------|
| `llm/llm-transport.ts` | LLM API calls (OpenAI, Gemini) |
| `llm/provider-resolver.ts` | LLM provider selection |
| `media/image-generation-providers.ts` | Image generation APIs |
| `media/video-reverse.ts` | Video reverse analysis |
| `auth/route-guards.ts` | Authentication guards |
| `config/app-config-service.ts` | Runtime config |

### `src/app-setup/` - Initialization Modules

**Purpose:** Application startup phases

**Key Files:**
| File | Purpose |
|------|---------|
| `setup-core.ts` | Phase 1: Fastify, PG pool, AppContext |
| `setup-video-reverse.ts` | Phase 2: Video reverse services |
| `setup-outfit.ts` | Phase 3: Outfit services |
| `setup-hot-trend.ts` | Phase 4: Hot trend config |
| `setup-routes.ts` | Phase 5: Route registration |
| `app-hooks.ts` | Runtime hooks |
| `startup-hooks.ts` | Lifecycle hooks |

### `src/core/` - Core Infrastructure

**Purpose:** App context, runtime config, error types

**Key Files:**
| File | Purpose |
|------|---------|
| `app-context.ts` | AppContext dependency container |
| `runtime-config.ts` | Environment config resolution |
| `errors.ts` | AppError error classes |
| `security.ts` | Security utilities |

### `src/storage/` - Object Storage

**Purpose:** Abstract storage for assets, images, videos

**Key Files:**
| File | Purpose |
|------|---------|
| `adapters.ts` | S3, Local, Memory adapters |
| `runtime.ts` | Adapter factory based on config |

## Frontend Directory Purposes

### `apps/web/pages/` - Page Components

**Purpose:** Route-level page components

**Organization:** Feature subdirectories matching backend routes

**Key Subdirectories:**
| Directory | Purpose |
|-----------|---------|
| `project-flow/` | 6-step workflow pages (Step1-Step5) |
| `project-flow/step3-workspace/` | Step 3 workspace components |
| `project-flow/step4-video-workspace/` | Step 4 video workspace |
| `project-flow/step5-delivery-shell/` | Step 5 delivery shell |
| `square/` | Square (public content) page |
| `reverse-script/` | Reverse script analysis |
| `admin/` | Admin dashboard pages |
| `auth/` | Login page |
| `projects/` | Project list |
| `characters/` | Character management |
| `music/` | Music library |
| `fission/` | Fission video generation |

### `apps/web/components/` - Reusable UI

**Purpose:** Shared UI components

**Key Subdirectories:**
| Directory | Purpose |
|-----------|---------|
| `ui/` | Basic UI elements (Button, etc.) |
| `layout/` | Layout components |
| `theme/` | Theme customization components |
| `project-flow/` | Project flow specific components |
| `square/` | Square specific components |

### `apps/web/services/` - API Clients

**Purpose:** Backend API client modules

**Organization:** `realApi/` for actual calls, `api-modules/` for domain APIs

**Key Files:**
| File | Purpose |
|------|---------|
| `realApi/index.ts` | API client factory |
| `realApi/projects.ts` | Project API |
| `realApi/step1.ts` | Step 1 API |
| `realApi/step2.ts` | Step 2 API |
| `realApi/step3.ts` | Step 3 API |
| `realApi/square.ts` | Square API |
| `api-modules/` | Domain-specific API modules |

### `apps/web/store/` - State Management

**Purpose:** Global state via Zustand

**Key Files:**
| File | Purpose |
|------|---------|
| `useAppStore.ts` | App-wide state (auth, user) |

## Naming Conventions

### Backend Files

| Category | Convention | Examples |
|----------|------------|----------|
| Services | `*-service.ts` | `project-service.ts`, `auth-service.ts` |
| Repositories | `*-pg-repository.ts` | `user-pg-repository.ts`, `project-pg-repository.ts` |
| Routes | `*-routes.ts` | `project-routes.ts`, `square-routes.ts` |
| Contracts | `*-contract.ts` or descriptive | `step1-role-preset-contract.ts`, `types.ts` |
| Modules | Feature-based naming | `outfit-analysis-selection.ts`, `video-reverse-url-entry.ts` |
| Setup | `setup-*.ts` | `setup-core.ts`, `setup-routes.ts` |

### Frontend Files

| Category | Convention | Examples |
|----------|------------|----------|
| Pages | PascalCase component | `Square.tsx`, `Login.tsx`, `ProjectLayout.tsx` |
| Components | PascalCase | `Button.tsx`, `LayoutWorkflowStepper.tsx` |
| Services | camelCase | `realApi.ts`, `backendApi.ts` |
| Stores | camelCase with "use" prefix | `useAppStore.ts` |

### TypeScript Naming

| Category | Convention | Examples |
|----------|------------|----------|
| Interfaces | `I*Service`, `I*Repository` | `IAuthService`, `IProjectService` |
| Types | Descriptive | `ProjectStatus`, `UploadSlot` |
| Repository Collection | `*RepositoryCollection` | `PgRepositoryCollection` |

## Where to Add New Code

### New Backend Feature

**Service:** `src/modules/[feature]-service.ts`

**Repository:** `src/repositories/pg/[entity]-pg-repository.ts`

**Routes:** `src/routes/[feature]-routes.ts`

**Contract:** `src/contracts/[feature]-contract.ts`

**Registration:** Add to `setupRoutes()` in `src/app-setup/setup-routes.ts`

### New Project Workflow Step

**Routes:** `src/routes/step[N]-[name]/index.ts`

**Modules:** `src/modules/video-step/step[N]/`

**Frontend Pages:** `apps/web/pages/project-flow/step[N]-[name]/`

### New Frontend Page

**Page Component:** `apps/web/pages/[feature]/[PageName].tsx`

**API Service:** `apps/web/services/realApi/[feature].ts` or `apps/web/services/api-modules/[feature].ts`

**Route Registration:** Add route in `apps/web/App.tsx`

### New Entity/Database Table

**Repository:** `src/repositories/pg/[entity]-pg-repository.ts`

**Add to Collection:** Register in `createPgRepositories()` in `src/repositories/pg/index.ts`

**Service:** Add service in `src/modules/` if needed

**AppContext:** Add to `AppContext` interface and `createAppContext()` in `src/core/app-context.ts`

## Special Directories

### `test/` - Tests

- Purpose: Unit and integration tests
- Organization: Mirror `src/` structure
- Naming: `*.unit.test.ts`, `*.integration.test.ts`
- Fixtures: `test/fixtures/`

### `e2e/` - End-to-End Tests

- Purpose: Playwright E2E tests
- Naming: `*.spec.ts`

### `scripts/` - Utility Scripts

- Purpose: Build scripts, migrations, audits
- Examples: `export-swagger.ts`, `check_db_persistence.ts`

### `public/` - Static Assets

- Purpose: Fallback frontend hosting
- Used: When `apps/web/dist/` doesn't exist

### `.planning/` - Project Planning

- Purpose: GSD planning documents
- Subdirectories: `codebase/`, `plans/`, `specs/`

---
*Structure analysis: 2026-04-06*