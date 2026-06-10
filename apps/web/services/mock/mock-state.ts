// apps/web/services/mock/mock-state.ts
/**
 * Mock 数据存储模块
 * 存储用户、会话、项目等模拟数据
 */

import type { UserRole } from '../backendApi.types';

// ============================================================================
// Mock 数据类型定义
// ============================================================================

export interface MockUserRecord {
  id: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface MockProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  status: "draft" | "active" | "archived";
  createdAt: number;
  updatedAt?: number;
  thumbnailUrl: string;
  formatLabel: string;
  durationSec: number;
  views: number;
  lastVisitedStep: number;
  lastReverseTaskId: string | null;
  lastReverseScriptVersionId: string | null;
  lastReverseLibraryScriptId: string | null;
  projectKind: "image" | "video" | "reverse" | "outfit_change";
  exportUrl: string | null;
  reverseScriptId: string | null;
}

export interface MockSessionRecord {
  token: string;
  userId: string;
  createdAt: number;
}

// ============================================================================
// Mock 状态存储
// ============================================================================

export interface MockState {
  users: Map<string, MockUserRecord>;
  sessions: Map<string, string>; // token -> userId
  projects: MockProjectRecord[];
  seeded: boolean;
}

export const mockState: MockState = {
  users: new Map(),
  sessions: new Map(),
  projects: [],
  seeded: false,
};

// ============================================================================
// Mock 数据初始化
// ============================================================================

/**
 * 预置测试用户和初始数据
 */
export function ensureMockSeeded(): void {
  if (mockState.seeded) return;

  // 预置测试用户
  const adminUser: MockUserRecord = {
    id: "usr-admin-001",
    email: "admin@test.com",
    password: "admin123",
    role: "admin",
  };

  const normalUser: MockUserRecord = {
    id: "usr-test-001",
    email: "test@test.com",
    password: "test123",
    role: "user",
  };

  mockState.users.set(adminUser.email, adminUser);
  mockState.users.set(normalUser.email, normalUser);

  // 预置测试项目
  const testProject: MockProjectRecord = {
    id: "prj-test-001",
    ownerId: normalUser.id,
    name: "Test Project",
    status: "draft",
    createdAt: Date.now() - 3600000,
    thumbnailUrl: "https://placehold.co/450x800/1a1a1a/FFF?text=Test+Project",
    formatLabel: "30秒 • 9:16",
    durationSec: 30,
    views: 0,
    lastVisitedStep: 1,
    lastReverseTaskId: null,
    lastReverseScriptVersionId: null,
    lastReverseLibraryScriptId: null,
    projectKind: "video",
    exportUrl: null,
    reverseScriptId: null,
  };

  mockState.projects.push(testProject);
  mockState.seeded = true;
}