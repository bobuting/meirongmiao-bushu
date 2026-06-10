// test/fixtures/mock-repositories.ts
/**
 * Repository Mock 工具
 * 使用 vi.fn() 创建类型安全的 mock Repository
 */

import { vi } from 'vitest';
import type {
  User,
  Session,
  Project,
  ProjectWorkflowStateRecord,
  TrendEntry,
  TrendSyncJob,
} from '@/contracts/types.js';
import type {
  IUserRepository,
  ISessionRepository,
} from '@/contracts/repository-ports/user-repository.js';
import type { IProjectRepository, IWorkflowStateRepository } from '@/contracts/repository-ports/project-repository.js';
import type { ITrendEntryRepository, ITrendSyncJobRepository } from '@/contracts/repository-ports/trend-repository.js';

// =====================================================
// Mock Options 类型
// =====================================================

/** Mock Repository 初始化选项 */
export interface MockRepositoryOptions<T> {
  /** 初始数据 */
  initialData?: T[];
}

// =====================================================
// User Repository Mock
// =====================================================

/** 创建 Mock 用户仓库 */
export function createMockUserRepository(
  options: MockRepositoryOptions<User> = {},
): IUserRepository {
  const store = new Map<string, User>();
  const emailIndex = new Map<string, string>();

  // 初始化数据
  if (options.initialData) {
    for (const user of options.initialData) {
      store.set(user.id, user);
      emailIndex.set(user.email, user.id);
    }
  }

  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    findByEmail: vi.fn(async (email: string) => {
      const id = emailIndex.get(email);
      return id ? store.get(id) ?? null : null;
    }),
    list: vi.fn(async () => Array.from(store.values())),
    upsert: vi.fn(async (user: User) => {
      // 删除旧的 email 索引
      const existing = store.get(user.id);
      if (existing) {
        emailIndex.delete(existing.email);
      }
      store.set(user.id, user);
      emailIndex.set(user.email, user.id);
    }),
    delete: vi.fn(async (id: string) => {
      const user = store.get(id);
      if (user) {
        emailIndex.delete(user.email);
      }
      store.delete(id);
    }),
  };
}

// =====================================================
// Session Repository Mock
// =====================================================

/** 创建 Mock 会话仓库 */
export function createMockSessionRepository(
  options: MockRepositoryOptions<Session> = {},
): ISessionRepository {
  const store = new Map<string, Session>();
  const userIdIndex = new Map<string, Set<string>>();

  // 初始化数据
  if (options.initialData) {
    for (const session of options.initialData) {
      store.set(session.token, session);
      if (!userIdIndex.has(session.userId)) {
        userIdIndex.set(session.userId, new Set());
      }
      userIdIndex.get(session.userId)!.add(session.token);
    }
  }

  return {
    findByToken: vi.fn(async (token: string) => store.get(token) ?? null),
    upsert: vi.fn(async (session: Session) => {
      // 删除旧的 userId 索引
      const existing = store.get(session.token);
      if (existing) {
        const tokens = userIdIndex.get(existing.userId);
        if (tokens) {
          tokens.delete(session.token);
        }
      }
      store.set(session.token, session);
      if (!userIdIndex.has(session.userId)) {
        userIdIndex.set(session.userId, new Set());
      }
      userIdIndex.get(session.userId)!.add(session.token);
    }),
    delete: vi.fn(async (token: string) => {
      const session = store.get(token);
      if (session) {
        const tokens = userIdIndex.get(session.userId);
        if (tokens) {
          tokens.delete(token);
        }
      }
      store.delete(token);
    }),
    deleteByUserId: vi.fn(async (userId: string) => {
      const tokens = userIdIndex.get(userId);
      if (tokens) {
        for (const token of tokens) {
          store.delete(token);
        }
        userIdIndex.delete(userId);
      }
    }),
  };
}

// =====================================================
// Project Repository Mock
// =====================================================

/** 创建 Mock 项目仓库 */
export function createMockProjectRepository(
  options: MockRepositoryOptions<Project> = {},
): IProjectRepository {
  const store = new Map<string, Project>();
  const userIdIndex = new Map<string, Set<string>>();

  // 初始化数据
  if (options.initialData) {
    for (const project of options.initialData) {
      store.set(project.id, project);
      if (!userIdIndex.has(project.userId)) {
        userIdIndex.set(project.userId, new Set());
      }
      userIdIndex.get(project.userId)!.add(project.id);
    }
  }

  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    findByUserId: vi.fn(async (userId: string) => {
      const ids = userIdIndex.get(userId);
      if (!ids) return [];
      return Array.from(ids)
        .map((id) => store.get(id))
        .filter((p): p is Project => p !== undefined);
    }),
    upsert: vi.fn(async (project: Project) => {
      // 删除旧的 userId 索引
      const existing = store.get(project.id);
      if (existing) {
        const ids = userIdIndex.get(existing.userId);
        if (ids) {
          ids.delete(project.id);
        }
      }
      store.set(project.id, project);
      if (!userIdIndex.has(project.userId)) {
        userIdIndex.set(project.userId, new Set());
      }
      userIdIndex.get(project.userId)!.add(project.id);
    }),
    delete: vi.fn(async (id: string) => {
      const project = store.get(id);
      if (project) {
        const ids = userIdIndex.get(project.userId);
        if (ids) {
          ids.delete(id);
        }
      }
      store.delete(id);
    }),
  };
}

// =====================================================
// Workflow State Repository Mock
// =====================================================

/** 创建 Mock 工作流状态仓库 */
export function createMockWorkflowStateRepository(
  options: MockRepositoryOptions<ProjectWorkflowStateRecord> = {},
): IWorkflowStateRepository {
  const store = new Map<string, ProjectWorkflowStateRecord>();
  const projectIdIndex = new Map<string, string>();

  // 初始化数据
  if (options.initialData) {
    for (const record of options.initialData) {
      store.set(record.id, record);
      projectIdIndex.set(record.projectId, record.id);
    }
  }

  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    findByProjectId: vi.fn(async (projectId: string) => {
      const id = projectIdIndex.get(projectId);
      return id ? store.get(id) ?? null : null;
    }),
    upsert: vi.fn(async (record: ProjectWorkflowStateRecord) => {
      // 删除旧的 projectId 索引
      const existing = store.get(record.id);
      if (existing) {
        projectIdIndex.delete(existing.projectId);
      }
      store.set(record.id, record);
      projectIdIndex.set(record.projectId, record.id);
    }),
    deleteByProjectId: vi.fn(async (projectId: string) => {
      const id = projectIdIndex.get(projectId);
      if (id) {
        store.delete(id);
        projectIdIndex.delete(projectId);
      }
    }),
    list: vi.fn(async () => Array.from(store.values())),
  };
}

// =====================================================
// Trend Entry Repository Mock
// =====================================================

/** 创建 Mock 热点条目仓库 */
export function createMockTrendEntryRepository(
  options: MockRepositoryOptions<TrendEntry> = {},
): ITrendEntryRepository {
  const store = new Map<string, TrendEntry>();

  // 初始化数据
  if (options.initialData) {
    for (const entry of options.initialData) {
      store.set(entry.id, entry);
    }
  }

  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    list: vi.fn(async () => Array.from(store.values())),
    upsert: vi.fn(async (entry: TrendEntry) => {
      store.set(entry.id, entry);
    }),
    delete: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  };
}

// =====================================================
// Trend Sync Job Repository Mock
// =====================================================

/** 创建 Mock 热点同步任务仓库 */
export function createMockTrendSyncJobRepository(
  options: MockRepositoryOptions<TrendSyncJob> = {},
): ITrendSyncJobRepository {
  const store = new Map<string, TrendSyncJob>();

  // 初始化数据
  if (options.initialData) {
    for (const job of options.initialData) {
      store.set(job.id, job);
    }
  }

  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    list: vi.fn(async () => Array.from(store.values())),
    upsert: vi.fn(async (job: TrendSyncJob) => {
      store.set(job.id, job);
    }),
    delete: vi.fn(async (id: string) => {
      store.delete(id);
    }),
  };
}

// =====================================================
// 批量创建 Mock Repositories
// =====================================================

/** 创建所有 Mock Repositories */
export interface MockRepositories {
  user: IUserRepository;
  session: ISessionRepository;
  project: IProjectRepository;
  workflowState: IWorkflowStateRepository;
  trendEntry: ITrendEntryRepository;
  trendSyncJob: ITrendSyncJobRepository;
}

/** Mock Repositories 初始化选项 */
export interface MockRepositoriesOptions {
  users?: User[];
  sessions?: Session[];
  projects?: Project[];
  workflowStates?: ProjectWorkflowStateRecord[];
  trendEntries?: TrendEntry[];
  trendSyncJobs?: TrendSyncJob[];
}

/** 创建所有 Mock Repositories */
export function createMockRepositories(
  options: MockRepositoriesOptions = {},
): MockRepositories {
  return {
    user: createMockUserRepository({ initialData: options.users }),
    session: createMockSessionRepository({ initialData: options.sessions }),
    project: createMockProjectRepository({ initialData: options.projects }),
    workflowState: createMockWorkflowStateRepository({ initialData: options.workflowStates }),
    trendEntry: createMockTrendEntryRepository({ initialData: options.trendEntries }),
    trendSyncJob: createMockTrendSyncJobRepository({ initialData: options.trendSyncJobs }),
  };
}