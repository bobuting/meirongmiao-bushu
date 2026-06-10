// test/fixtures/test-data.ts
/**
 * 测试数据生成器
 * 提供各类型实体的 mock 数据工厂函数
 */

import type {
  Project,
  User,
  Session,
  ProjectWorkflowStateRecord,
  TrendEntry,
  TrendSyncJob,
  LibraryScript,
  ProjectStatus,
  Role,
} from '@/contracts/types.js';

// =====================================================
// ID 生成器
// =====================================================

/** 生成唯一 ID */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =====================================================
// User 生成器
// =====================================================

interface MockUserOptions {
  id?: string;
  email?: string;
  role?: Role;
  tier?: 'free' | 'pro' | 'enterprise';
}

/**
 * 创建模拟用户
 * 注意：User 类型包含 passwordHash 字段，tier 是非类型字段用于业务逻辑
 */
export function createMockUser(options: MockUserOptions = {}): User {
  return {
    id: options.id ?? generateId('user'),
    email: options.email ?? 'test@example.com',
    passwordHash: 'mock-hash',
    role: options.role ?? 'user',
    createdAt: Date.now(),
    failedAttempts: 0,
    lockUntil: null,
  };
}

// =====================================================
// Session 生成器
// =====================================================

interface MockSessionOptions {
  token?: string;
  userId?: string;
}

/** 创建模拟会话 */
export function createMockSession(options: MockSessionOptions = {}): Session {
  return {
    token: options.token ?? generateId('token'),
    userId: options.userId ?? generateId('user'),
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天后过期
  };
}

// =====================================================
// Project 生成器
// =====================================================

interface MockProjectOptions {
  id?: string;
  userId?: string;
  name?: string;
  status?: ProjectStatus;
}

/** 创建模拟项目 */
export function createMockProject(options: MockProjectOptions = {}): Project {
  const userId = options.userId ?? generateId('user');
  return {
    id: options.id ?? generateId('project'),
    userId,
    name: options.name ?? '测试项目',
    status: options.status ?? 'DRAFT',
    selectedOutfitPlanId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    thumbnailUrl: '',
    formatLabel: '16:9',
    durationSec: 0,
    views: 0,
    lastVisitedStep: 1,
    lastReverseTaskId: null,
    lastReverseScriptVersionId: null,
    projectKind: 'video',
    exportUrl: null,
  };
}

// =====================================================
// WorkflowState 生成器
// =====================================================

interface MockWorkflowStateOptions {
  id?: string;
  projectId?: string;
  userId?: string;
}

/** 创建模拟工作流状态 */
export function createMockWorkflowState(
  options: MockWorkflowStateOptions = {},
): ProjectWorkflowStateRecord {
  const projectId = options.projectId ?? generateId('project');
  const userId = options.userId ?? generateId('user');
  return {
    id: options.id ?? generateId('workflow'),
    projectId,
    userId,
    lastVisitedStep: 1,
    workflow: null,
    projectData: null,
    stepState: {
      step1: {},
      step2: {},
      step3: {},
      step4: {},
      step5: {},
      step6: {},
      step7: {},
    },
    updatedAt: Date.now(),
  };
}

// =====================================================
// TrendEntry 生成器
// =====================================================

interface MockTrendEntryOptions {
  id?: string;
  title?: string;
  source?: string;
  trendType?: 'realtime' | 'video';
  dateWindow?: '24h' | '7d' | '30d';
  rank?: number;
  trend?: 'up' | 'down' | 'flat';
}

/** 创建模拟热点条目 */
export function createMockTrendEntry(options: MockTrendEntryOptions = {}): TrendEntry {
  return {
    id: options.id ?? generateId('trend'),
    title: options.title ?? '测试热点',
    source: options.source ?? 'douyin',
    trendType: options.trendType ?? 'realtime',
    dateWindow: options.dateWindow ?? '24h',
    normalizedKey: 'test-key',
    url: 'https://example.com/test',
    trend: options.trend ?? 'up',
    rank: options.rank ?? 1,
    hash: generateId('hash'),
    syncedAt: Date.now(),
    itemId: null,
    rawPayload: null,
  };
}

// =====================================================
// TrendSyncJob 生成器
// =====================================================

interface MockTrendSyncJobOptions {
  id?: string;
  trendType?: 'realtime' | 'video';
  source?: string;
  status?: 'running' | 'success' | 'failed';
}

/** 创建模拟热点同步任务 */
export function createMockTrendSyncJob(options: MockTrendSyncJobOptions = {}): TrendSyncJob {
  const now = Date.now();
  return {
    id: options.id ?? generateId('sync-job'),
    trendType: options.trendType ?? 'realtime',
    source: options.source ?? 'douyin',
    dateWindow: '24h',
    status: options.status ?? 'success',
    startedAt: now - 1000,
    finishedAt: now,
    elapsedMs: 1000,
    topicCount: 10,
    errorCode: null,
    errorMessage: null,
  };
}

// =====================================================
// LibraryScript 生成器
// =====================================================

interface MockLibraryScriptOptions {
  id?: string;
  userId?: string;
  title?: string;
  tags?: string[];
  content?: object;
}

/** 创建模拟脚本库条目 */
export function createMockLibraryScript(options: MockLibraryScriptOptions = {}): LibraryScript {
  return {
    id: options.id ?? generateId('script'),
    userId: options.userId ?? generateId('user'),
    title: options.title ?? '测试脚本',
    tags: options.tags ?? ['街头潮流', '日系'],
    content: options.content ? JSON.stringify(options.content) : '{}',
    currentVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}