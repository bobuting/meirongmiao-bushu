# Testing Patterns

**Analysis Date:** 2026-04-06

## Test Framework

**Runner:**
- Vitest 3.2.4
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`)

**Coverage:**
- Provider: v8 (`@vitest/coverage-v8`)
- Thresholds enforced: lines 50%, functions 50%, branches 40%, statements 50%

**Run Commands:**
```bash
npm test                              # Run all unit tests
npm run test:watch                    # Watch mode
npm run test:coverage                 # Coverage report
npm run test:coverage:check           # Coverage with threshold check
npm run test:integration              # Integration tests only
npm run test:e2e                      # E2E tests (Playwright)
npm run test:full-regression          # Full regression suite
```

## Test Configuration

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    exclude: ['node_modules', 'apps/web/node_modules'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/contracts/types.ts',
        'src/**/index.ts',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

## Test File Organization

**Location:**
- Separate `test/` directory (not co-located)
- Integration tests: `test/modules/**/*.integration.test.ts`
- Unit tests: `test/**/*.unit.test.ts`
- E2E tests: `e2e/` directory

**Naming:**
- Pattern: `{module-name}.{type}.test.ts`
- Examples:
  - `app_shell_handlers.unit.test.ts`
  - `video_music_service.unit.test.ts`
  - `video_music_routes.integration.test.ts`
  - `soft-deletable-repository.test.ts`

**Structure:**
```
test/
├── fixtures/
│   ├── mock-repositories.test.ts    # Mock repository factories
│   └── test-data.js                 # Test data generators
├── unit/
│   └── soft-deletable-repository.test.ts
├── app_shell_handlers.unit.test.ts
├── video_music_service.unit.test.ts
├── video_music_routes.integration.test.ts
└── ... (other test files)
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("video music service", () => {
  it("seeds default music entries and matches by script atmosphere", async () => {
    const store = new InMemoryStore();
    const seeded = await ensureDefaultVideoMusicLibrary(store);
    expect(seeded).toBeGreaterThan(0);
    expect(store.videoMusics.size).toBeGreaterThanOrEqual(4);
    
    const result = await matchVideoMusicByScript(
      store,
      "这是一条阳光通勤穿搭视频，画面节奏轻松，适合城市日常出街。",
    );
    
    expect(result.success).toBe(true);
    expect(result.music?.id).toBeTruthy();
    expect(result.candidateAtmospheres.length).toBeGreaterThan(0);
  });
});
```

**Nested Describe Pattern:**
```typescript
describe('PgSoftDeletableRepository', () => {
  let mockPool: Pool;
  let mockClient: PoolClient;
  let repository: TestRepository;
  const tableName = 'test_table';

  beforeEach(() => {
    mockPool = createMockPool();
    mockClient = createMockClient();
    repository = new TestRepository(mockPool, tableName);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('softDelete()', () => {
    test('应该设置 deleted_at 和 deleted_by', async () => {
      // ... test implementation
    });
  });

  describe('findById()', () => {
    test('默认应该过滤已删除记录', async () => {
      // ... test implementation
    });
  });
});
```

**Setup/Teardown:**
- `beforeEach` for common setup
- `afterEach` for cleanup (`vi.clearAllMocks()`)
- In-memory implementations for isolation

## Mocking

**Framework:**
- Vitest `vi` module

**Mock Functions:**
```typescript
import { vi } from "vitest";

const themeHandler = { 
  listThemes: vi.fn(), 
  getCurrentUserTheme: vi.fn(), 
  setCurrentUserTheme: vi.fn() 
};
```

**Module Mocking:**
```typescript
vi.mock("../src/routes/theme-routes.js", () => ({
  createThemeRouteHandlersWithContext: () => themeHandler,
  createThemeAdminRouteHandlersWithContext: () => themeAdminHandler,
}));
```

**Mock Verification:**
```typescript
// Check mock was called
expect(mockQuery).toHaveBeenCalledTimes(1);

// Check mock function type
expect(vi.isMockFunction(repo.findById)).toBe(true);

// Access mock call arguments
const callArgs = mockQuery.mock.calls[0];
expect(callArgs[0]).toContain('UPDATE test_table SET deleted_at = $2');
```

**Mock Pool/Client Pattern:**
```typescript
function createMockPool(): Pool {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;
}

function createMockClient(): PoolClient {
  return {
    query: vi.fn(),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function createQueryResult<T>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as QueryResult<T>;
}
```

**What to Mock:**
- External dependencies (database, storage)
- Route handlers (for shell tests)
- Repository interfaces
- Third-party services

**What NOT to Mock:**
- Pure functions (test directly)
- In-memory implementations (use real implementation)
- Business logic (test the actual implementation)

## Fixtures and Factories

**Test Data:**
```typescript
// Factory functions for test data
import { createMockUser, createMockProject, createMockWorkflowState } from './test-data.js';

const user1 = createMockUser({ id: 'user-1', email: 'user1@example.com' });
const project = createMockProject({ id: 'proj-1', userId: 'user-1' });
```

**Mock Repository Pattern:**
```typescript
// test/fixtures/mock-repositories.test.ts
export function createMockUserRepository(options?: { 
  initialData?: User[] 
}): IUserRepository {
  const data = new Map<string, User>();
  const emailIndex = new Map<string, string>();

  // Initialize with data
  if (options?.initialData) {
    for (const user of options.initialData) {
      data.set(user.id, user);
      emailIndex.set(user.email, user.id);
    }
  }

  return {
    findById: vi.fn(async (id: string) => data.get(id) ?? null),
    findByEmail: vi.fn(async (email: string) => {
      const id = emailIndex.get(email);
      return id ? data.get(id) ?? null : null;
    }),
    list: vi.fn(async () => Array.from(data.values())),
    upsert: vi.fn(async (user: User) => {
      data.set(user.id, user);
      emailIndex.set(user.email, user.id);
    }),
    delete: vi.fn(async (id: string) => {
      const user = data.get(id);
      if (user) {
        data.delete(id);
        emailIndex.delete(user.email);
      }
    }),
  };
}
```

**Combined Mock Repositories:**
```typescript
export function createMockRepositories(options?: {
  users?: User[];
  sessions?: Session[];
  projects?: Project[];
  workflowStates?: WorkflowState[];
}): {
  user: IUserRepository;
  session: ISessionRepository;
  project: IProjectRepository;
  workflowState: IWorkflowStateRepository;
} {
  return {
    user: createMockUserRepository({ initialData: options?.users }),
    session: createMockSessionRepository({ initialData: options?.sessions }),
    project: createMockProjectRepository({ initialData: options?.projects }),
    workflowState: createMockWorkflowStateRepository({ initialData: options?.workflowStates }),
  };
}
```

**Location:**
- `test/fixtures/mock-repositories.test.ts`
- `test/fixtures/test-data.js` (expected location)

## Coverage

**Requirements:**
- Minimum thresholds enforced
- Lines: 50%
- Functions: 50%
- Branches: 40%
- Statements: 50%

**Exclusions:**
- Type definition files (`src/contracts/types.ts`)
- Barrel files (`src/**/index.ts`)

**View Coverage:**
```bash
npm run test:coverage          # Run with coverage
# Output in:
# - Terminal (text)
# - coverage/coverage-final.json
# - coverage/index.html (HTML report)
```

**Coverage Gate:**
```bash
npm run test:coverage:check    # Run with threshold enforcement
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, classes, modules
- Approach: Mock external dependencies, test logic in isolation
- Location: `test/**/*.unit.test.ts`, `test/unit/*.test.ts`
- Examples:
  - `video_music_service.unit.test.ts` - Service logic testing
  - `soft-deletable-repository.test.ts` - Repository behavior testing
  - `app_shell_handlers.unit.test.ts` - Handler bundle testing

**Integration Tests:**
- Scope: Multiple modules working together
- Approach: Test route registration, API endpoints with mocked dependencies
- Location: `test/modules/**/*.integration.test.ts`
- Example: `video_music_routes.integration.test.ts`

**E2E Tests:**
- Framework: Playwright
- Location: `e2e/` directory
- Command: `npm run test:e2e`
- Regression: `npm run test:full-regression`

**Smoke Tests:**
- Command: `npm run smoke`
- Purpose: Quick validation of critical paths

## Common Patterns

**Async Testing:**
```typescript
it("seeds default music entries and matches by script atmosphere", async () => {
  const store = new InMemoryStore();
  const seeded = await ensureDefaultVideoMusicLibrary(store);
  expect(seeded).toBeGreaterThan(0);
});
```

**Error Testing:**
```typescript
test('未找到记录时返回 null', async () => {
  const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
  (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

  const result = await repository.findById('non-existent-id');

  expect(result).toBeNull();
});

test('应该正确抛出错误', async () => {
  // Error scenario test
  await expect(async () => {
    await someFunctionThatThrows();
  }).rejects.toThrow('Expected error message');
});
```

**Database Mock Testing:**
```typescript
test('应该设置 deleted_at 和 deleted_by', async () => {
  const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
  (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

  await repository.softDelete('test-id', 'user-456');

  // Verify SQL statement
  const callArgs = mockQuery.mock.calls[0];
  expect(callArgs[0]).toContain('UPDATE test_table SET deleted_at = $2');
  
  // Verify parameters
  expect(callArgs[1][0]).toBe('test-id');
  expect(callArgs[1][2]).toBe('user-456');
});
```

**State Testing:**
```typescript
describe('Mock Repositories', () => {
  it('should support upsert', async () => {
    const repo = createMockUserRepository();
    const user = createMockUser({ id: 'user-1', email: 'test@example.com' });

    await repo.upsert(user);
    expect(await repo.findById('user-1')).toEqual(user);

    // Update user
    const updatedUser = { ...user, role: 'admin' as const };
    await repo.upsert(updatedUser);
    expect(await repo.findById('user-1')).toEqual(updatedUser);
  });
});
```

## Test Descriptions

**Language:**
- Chinese descriptions in some files (e.g., "应该设置 deleted_at 和 deleted_by")
- English descriptions in others (e.g., "should create empty repository")
- Both conventions acceptable

**Pattern:**
```typescript
// Chinese
test('应该设置 deleted_at 和 deleted_by', async () => { ... });
test('未找到记录时返回 null', async () => { ... });

// English
test('should create empty repository', async () => { ... });
test('should initialize with data', async () => { ... });
```

## Test Scripts Overview

| Script | Purpose |
|--------|---------|
| `npm test` | Run all unit tests |
| `npm run test:watch` | Watch mode for development |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:coverage:check` | Coverage with threshold enforcement |
| `npm run test:integration` | Integration tests only |
| `npm run test:e2e` | E2E tests with Playwright |
| `npm run gate:e2e:p0` | P0 regression E2E tests |
| `npm run test:full-regression` | Build + unit tests + E2E |
| `npm run smoke` | Quick smoke validation |

---

*Mapped: 2026-04-06*