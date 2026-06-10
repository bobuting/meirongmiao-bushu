// test/fixtures/mock-repositories.test.ts
/**
 * Mock Repositories 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockUserRepository,
  createMockSessionRepository,
  createMockProjectRepository,
  createMockWorkflowStateRepository,
  createMockTrendEntryRepository,
  createMockTrendSyncJobRepository,
  createMockRepositories,
} from './mock-repositories.js';
import { createMockUser, createMockProject, createMockWorkflowState, createMockTrendEntry, createMockTrendSyncJob, createMockSession } from './test-data.js';

describe('Mock Repositories', () => {
  describe('createMockUserRepository', () => {
    it('should create empty repository', async () => {
      const repo = createMockUserRepository();
      expect(await repo.list()).toEqual([]);
      expect(await repo.findById('nonexistent')).toBeNull();
    });

    it('should initialize with data', async () => {
      const user1 = createMockUser({ id: 'user-1', email: 'user1@example.com' });
      const user2 = createMockUser({ id: 'user-2', email: 'user2@example.com' });
      const repo = createMockUserRepository({ initialData: [user1, user2] });

      const users = await repo.list();
      expect(users).toHaveLength(2);
      expect(await repo.findById('user-1')).toEqual(user1);
      expect(await repo.findByEmail('user2@example.com')).toEqual(user2);
    });

    it('should support upsert', async () => {
      const repo = createMockUserRepository();
      const user = createMockUser({ id: 'user-1', email: 'test@example.com' });

      await repo.upsert(user);
      expect(await repo.findById('user-1')).toEqual(user);

      // 更新用户
      const updatedUser = { ...user, role: 'admin' as const };
      await repo.upsert(updatedUser);
      expect(await repo.findById('user-1')).toEqual(updatedUser);
    });

    it('should update email index on upsert', async () => {
      const user = createMockUser({ id: 'user-1', email: 'old@example.com' });
      const repo = createMockUserRepository({ initialData: [user] });

      // 更新邮箱
      const updatedUser = { ...user, email: 'new@example.com' };
      await repo.upsert(updatedUser);

      expect(await repo.findByEmail('old@example.com')).toBeNull();
      expect(await repo.findByEmail('new@example.com')).toEqual(updatedUser);
    });

    it('should support delete', async () => {
      const user = createMockUser({ id: 'user-1' });
      const repo = createMockUserRepository({ initialData: [user] });

      await repo.delete('user-1');
      expect(await repo.findById('user-1')).toBeNull();
      expect(await repo.list()).toHaveLength(0);
    });

    it('should use vi.fn for all methods', () => {
      const repo = createMockUserRepository();
      expect(vi.isMockFunction(repo.findById)).toBe(true);
      expect(vi.isMockFunction(repo.findByEmail)).toBe(true);
      expect(vi.isMockFunction(repo.list)).toBe(true);
      expect(vi.isMockFunction(repo.upsert)).toBe(true);
      expect(vi.isMockFunction(repo.delete)).toBe(true);
    });
  });

  describe('createMockSessionRepository', () => {
    it('should create and manage sessions', async () => {
      const session = createMockSession({ token: 'token-1', userId: 'user-1' });
      const repo = createMockSessionRepository();

      await repo.upsert(session);
      expect(await repo.findByToken('token-1')).toEqual(session);

      await repo.delete('token-1');
      expect(await repo.findByToken('token-1')).toBeNull();
    });

    it('should delete by user id', async () => {
      const session1 = createMockSession({ token: 'token-1', userId: 'user-1' });
      const session2 = createMockSession({ token: 'token-2', userId: 'user-1' });
      const repo = createMockSessionRepository({ initialData: [session1, session2] });

      await repo.deleteByUserId('user-1');
      expect(await repo.findByToken('token-1')).toBeNull();
      expect(await repo.findByToken('token-2')).toBeNull();
    });
  });

  describe('createMockProjectRepository', () => {
    it('should find by user id', async () => {
      const project1 = createMockProject({ id: 'proj-1', userId: 'user-1' });
      const project2 = createMockProject({ id: 'proj-2', userId: 'user-1' });
      const project3 = createMockProject({ id: 'proj-3', userId: 'user-2' });
      const repo = createMockProjectRepository({ initialData: [project1, project2, project3] });

      const user1Projects = await repo.findByUserId('user-1');
      expect(user1Projects).toHaveLength(2);
      expect(user1Projects.map((p) => p.id).sort()).toEqual(['proj-1', 'proj-2']);

      const user2Projects = await repo.findByUserId('user-2');
      expect(user2Projects).toHaveLength(1);
      expect(user2Projects[0].id).toBe('proj-3');
    });

    it('should update user id index on upsert', async () => {
      const project = createMockProject({ id: 'proj-1', userId: 'user-1' });
      const repo = createMockProjectRepository({ initialData: [project] });

      // 更新 userId
      const updatedProject = { ...project, userId: 'user-2' };
      await repo.upsert(updatedProject);

      expect(await repo.findByUserId('user-1')).toHaveLength(0);
      const user2Projects = await repo.findByUserId('user-2');
      expect(user2Projects).toHaveLength(1);
      expect(user2Projects[0].id).toBe('proj-1');
    });
  });

  describe('createMockWorkflowStateRepository', () => {
    it('should find by project id', async () => {
      const state = createMockWorkflowState({ id: 'ws-1', projectId: 'proj-1' });
      const repo = createMockWorkflowStateRepository({ initialData: [state] });

      expect(await repo.findByProjectId('proj-1')).toEqual(state);
      expect(await repo.findByProjectId('proj-2')).toBeNull();
    });

    it('should delete by project id', async () => {
      const state = createMockWorkflowState({ id: 'ws-1', projectId: 'proj-1' });
      const repo = createMockWorkflowStateRepository({ initialData: [state] });

      await repo.deleteByProjectId('proj-1');
      expect(await repo.findById('ws-1')).toBeNull();
    });

    it('should list all states', async () => {
      const state1 = createMockWorkflowState({ id: 'ws-1' });
      const state2 = createMockWorkflowState({ id: 'ws-2' });
      const repo = createMockWorkflowStateRepository({ initialData: [state1, state2] });

      const list = await repo.list();
      expect(list).toHaveLength(2);
    });
  });

  describe('createMockTrendEntryRepository', () => {
    it('should manage trend entries', async () => {
      const entry = createMockTrendEntry({ id: 'trend-1', title: 'Test Trend' });
      const repo = createMockTrendEntryRepository();

      await repo.upsert(entry);
      expect(await repo.findById('trend-1')).toEqual(entry);

      const list = await repo.list();
      expect(list).toHaveLength(1);

      await repo.delete('trend-1');
      expect(await repo.findById('trend-1')).toBeNull();
    });
  });

  describe('createMockTrendSyncJobRepository', () => {
    it('should manage sync jobs', async () => {
      const job = createMockTrendSyncJob({ id: 'job-1', status: 'success' });
      const repo = createMockTrendSyncJobRepository();

      await repo.upsert(job);
      expect(await repo.findById('job-1')).toEqual(job);

      const list = await repo.list();
      expect(list).toHaveLength(1);
    });
  });

  describe('createMockRepositories', () => {
    it('should create all repositories', () => {
      const repos = createMockRepositories();
      expect(repos.user).toBeDefined();
      expect(repos.session).toBeDefined();
      expect(repos.project).toBeDefined();
      expect(repos.workflowState).toBeDefined();
      expect(repos.trendEntry).toBeDefined();
      expect(repos.trendSyncJob).toBeDefined();
    });

    it('should initialize with data', async () => {
      const user = createMockUser({ id: 'user-1' });
      const project = createMockProject({ id: 'proj-1', userId: 'user-1' });
      const workflowState = createMockWorkflowState({ id: 'ws-1', projectId: 'proj-1' });
      const trendEntry = createMockTrendEntry({ id: 'trend-1' });
      const trendSyncJob = createMockTrendSyncJob({ id: 'job-1' });
      const session = createMockSession({ token: 'token-1', userId: 'user-1' });

      const repos = createMockRepositories({
        users: [user],
        sessions: [session],
        projects: [project],
        workflowStates: [workflowState],
        trendEntries: [trendEntry],
        trendSyncJobs: [trendSyncJob],
      });

      expect(await repos.user.findById('user-1')).toEqual(user);
      expect(await repos.session.findByToken('token-1')).toEqual(session);
      expect(await repos.project.findById('proj-1')).toEqual(project);
      expect(await repos.workflowState.findById('ws-1')).toEqual(workflowState);
      expect(await repos.trendEntry.findById('trend-1')).toEqual(trendEntry);
      expect(await repos.trendSyncJob.findById('job-1')).toEqual(trendSyncJob);
    });
  });
});