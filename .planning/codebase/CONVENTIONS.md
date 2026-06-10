# Coding Conventions

**Analysis Date:** 2026-04-06

## Naming Patterns

**Files:**
- TypeScript files: `kebab-case.ts` (e.g., `video-music-service.ts`, `app-shell-handlers.ts`)
- Contract files: `kebab-case-contract.ts` (e.g., `step3-frame-parameter-contract.ts`)
- React components: `PascalCase.tsx` (e.g., `Button.tsx`, `ProjectLayout.tsx`)
- Test files: `*.test.ts` or `*.unit.test.ts` or `*.integration.test.ts`

**Functions:**
- camelCase (e.g., `ensureDefaultVideoMusicLibrary`, `matchVideoMusicByScript`)
- Factory functions: `createXxx` prefix (e.g., `createAdapterFactory`, `createMockUserRepository`)
- Handler registration: `registerXxxRoutes` prefix (e.g., `registerVideoMusicRoutes`)
- Async operations: descriptive verbs (e.g., `listVideoMusics`, `deleteVideoMusicEntry`)

**Variables:**
- camelCase for local variables
- UPPER_SNAKE_CASE for constants (e.g., `DEFAULT_VIDEO_MUSIC_SEEDS`, `ALLOWED_ATMOSPHERES`, `MAX_TASK_NOTIFICATIONS`)
- UPPER_SNAKE_CASE for environment-related keys (e.g., `TOKEN_KEY`, `ADMIN_TOKEN_KEY`)

**Types/Interfaces:**
- PascalCase (e.g., `VideoMusic`, `AppState`, `MatchVideoMusicResult`)
- Dependency interfaces: `XxxDeps` suffix (e.g., `VideoMusicDeps`, `AdapterFactoryDeps`)
- Repository interfaces: `IXxxRepository` prefix (e.g., `IVideoMusicRepository`)
- Props interfaces for React: `XxxProps` suffix (e.g., `ButtonProps`)
- Result interfaces: `XxxResult` suffix (e.g., `VideoMusicSyncResult`, `MatchVideoMusicResult`)

**Classes:**
- PascalCase (e.g., `AppError`, `PgSoftDeletableRepository`, `InMemoryStore`)
- Error classes extend `Error` (e.g., `AppError`)

## Code Style

**Formatting:**
- No explicit formatting tool configured (no .prettierrc)
- TypeScript strict mode: `strict: true` in `tsconfig.json`
- ES2022 target, ESNext modules
- .js extension required in imports for ESM compatibility

**Linting:**
- No ESLint configuration detected
- Relies on TypeScript compiler for type safety

**Indentation & Spacing:**
- 2-space indentation (observed across files)
- Consistent spacing around operators and braces

## Import Organization

**Order:**
1. Node.js built-in modules with `node:` prefix
   ```typescript
   import { existsSync } from "node:fs";
   import { readFile } from "node:fs/promises";
   import { extname, join, resolve } from "node:path";
   ```
2. External package imports
   ```typescript
   import type { FastifyInstance, FastifyRequest } from "fastify";
   import { create } from "zustand";
   ```
3. Internal imports (with `.js` extension)
   ```typescript
   import type { AppContext } from "../core/app-context.js";
   import { AppError } from "../core/errors.js";
   import { resolveVideoMusicConfig } from "../modules/video-music/video-music-config.js";
   ```

**Path Aliases:**
- `@/*` maps to `src/*` (backend)
- `@/*` maps to `.` (frontend)

**Type Imports:**
- Use `import type { ... }` for type-only imports
- Separates runtime dependencies from type dependencies

## Error Handling

**Custom Error Class:**
```typescript
// src/core/errors.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
```

**Assertion Helper:**
```typescript
// src/core/errors.ts
export function assertCondition(
  condition: boolean,
  statusCode: number,
  code: string,
  message: string,
): void {
  if (!condition) {
    throw new AppError(statusCode, code, message);
  }
}
```

**Usage Pattern:**
```typescript
// src/routes/video-music-routes.ts
if (!config.enabled) {
  throw new AppError(503, "VIDEO_MUSIC_DISABLED", "音乐功能未启用");
}
throw new AppError(404, "VIDEO_MUSIC_NOT_FOUND", "音乐不存在");
throw new AppError(400, "VIDEO_MUSIC_SCRIPT_REQUIRED", "请先提供脚本文本");
```

**Error Codes:**
- UPPER_SNAKE_CASE format (e.g., `VIDEO_MUSIC_NOT_FOUND`, `VIDEO_MUSIC_DISABLED`)
- Chinese error messages for user-facing errors

**Try-Catch Pattern:**
```typescript
// apps/web/pages/project-flow/ProjectLayout.tsx
try {
  const snapshot = await backendApi.projectResumeSnapshot(token, activeSession.projectId);
  // ... success handling
} catch {
  // ... error handling (keep best-effort without interrupting user flow)
  clearProjectFlowActiveSession();
  restoreAttemptKeyRef.current = null;
}
```

## TypeScript Usage

**Type Safety:**
- Strict mode enabled
- No `any` usage - explicit types everywhere
- Type-only imports separated
- Interface/type definitions in `src/contracts/`

**Interface Patterns:**
```typescript
// Dependency injection pattern
interface VideoMusicDeps {
  videoMusics: IVideoMusicRepository;
  clock: IRepositoryClock;
  config: Pick<AppConfig, "videoMusicEnabled" | "videoMusicAllowedAtmospheres" | ...>;
}

// Result type pattern
export interface MatchVideoMusicResult {
  success: boolean;
  music: VideoMusic | null;
  candidates: VideoMusic[];
  matchedAtmosphere: string | null;
  candidateAtmospheres: string[];
  usedDefault: boolean;
  error?: string;
}
```

**Generic Patterns:**
```typescript
// Repository base class with generics
class TestRepository extends PgSoftDeletableRepository<TestEntity> {
  protected mapRow(row: Record<string, unknown>): TestEntity { ... }
  protected mapEntity(entity: TestEntity): Record<string, unknown> { ... }
}
```

**Union Types:**
```typescript
export type Role = "user" | "admin";
export type ProjectStatus = "DRAFT" | "OUTFIT_CONFIRMED" | "CHARACTER_CONFIRMED" | ...;
```

## Comments & Documentation

**When to Comment:**
- Chinese comments throughout codebase
- JSDoc-style documentation for exported functions
- Section separators using comment blocks
- Complex logic explanations

**JSDoc Pattern:**
```typescript
/**
 * 确保默认音乐库已初始化
 * 如果配置了 OSS 存储，则上传到 OSS；否则保存到本地磁盘
 * @param deps 模块依赖（videoMusics 仓库、clock、config）
 * @param storage OSS 存储适配器（可选）
 * @param publicBaseUrl OSS 公开访问基础 URL（可选）
 * @returns 新创建的音乐数量
 */
export async function ensureDefaultVideoMusicLibrary(...)
```

**Section Separators:**
```typescript
// ---------------------------------------------------------------------------
// 导出（通过 app-exports.ts 集中管理，此处保留兼容性导出）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// buildApp 主函数
// ---------------------------------------------------------------------------
```

**Inline Comments:**
```typescript
// 优先使用 OSS 存储
if (storage) {
  // ...
} else {
  // 降级到本地磁盘
  // ...
}
```

## Function Design

**Size Guidelines:**
- Single functions under 50 lines preferred
- Complex operations split into helper functions
- Long functions acceptable when cohesive (e.g., `matchVideoMusicByScript` ~100 lines)

**Parameter Pattern:**
```typescript
// Dependency injection pattern
export async function listVideoMusics(
  videoMusics: IVideoMusicRepository,
  query: ListVideoMusicQuery = {}
): Promise<VideoMusic[]>

// Multi-parameter pattern with deps object
export async function createVideoMusicEntry(
  deps: VideoMusicDeps,
  input: { title: string; musicUrl: string; atmospheres?: string[]; ... }
): Promise<VideoMusic>
```

**Return Values:**
- Typed result objects (not just data)
- `success` boolean for operation results
- `error` optional field for failure details
- Null for not-found scenarios

```typescript
export interface VideoMusicSyncResult {
  added: VideoMusic[];
  skipped: number;
  failed: Array<{ title: string; reason: string }>;
}
```

## Module Design

**Exports:**
- Named exports preferred
- No default exports observed
- Barrel files (`index.ts`) for module aggregation

**Export Pattern:**
```typescript
export * from "./app-exports.js";
export { ensureDefaultVideoMusicLibrary, listVideoMusics, ... };
```

**Barrel Files:**
- `src/modules/hot-trend/index.ts`
- Module entry points for cleaner imports

**Dependency Injection:**
- Services receive dependencies as objects
- Context object pattern (`AppContext`)
- Factory functions for creating configured instances

```typescript
const videoMusicDeps = () => ({
  videoMusics: ctx.repos.videoMusics,
  clock: ctx.clock,
  config: ctx.configService.get(),
});
```

## React Component Conventions

**Component Structure:**
```typescript
// apps/web/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  className = '', 
  ...props 
}) => {
  // ...
};
```

**Hooks Usage:**
- Zustand for global state (`useAppStore`)
- TanStack Query for server state
- Custom hooks extracted for reusable logic

**Tailwind CSS:**
- Utility classes for styling
- Variants pattern with object maps
- Size variants with object maps

```typescript
const variants = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20",
  secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
};
const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base"
};
```

---

*Mapped: 2026-04-06*