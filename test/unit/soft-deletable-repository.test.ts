/**
 * PgSoftDeletableRepository 单元测试
 * 测试伪删除仓库基类的所有功能
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { PgSoftDeletableRepository } from '../../src/repositories/pg/soft-deletable-repository.js';
import type { SoftDeletable } from '../../src/contracts/types.js';

// =====================================================
// 测试实体和 Repository 定义
// =====================================================

/** 测试实体类型 */
interface TestEntity extends SoftDeletable {
  id: string;
  name: string;
  createdAt: number;
}

/** 测试 Repository 实现 */
class TestRepository extends PgSoftDeletableRepository<TestEntity> {
  protected mapRow(row: Record<string, unknown>): TestEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      createdAt: row.created_at as number,
      deletedAt: row.deleted_at as number | null | undefined,
      deletedBy: row.deleted_by as string | null | undefined,
    };
  }

  protected mapEntity(entity: TestEntity): Record<string, unknown> {
    return {
      id: entity.id,
      name: entity.name,
      created_at: entity.createdAt,
      deleted_at: entity.deletedAt ?? null,
      deleted_by: entity.deletedBy ?? null,
    };
  }

  // 暴露 protected 方法用于测试
  async testFindWhere(conditions: Record<string, unknown>, options?: { includeDeleted?: boolean }) {
    return this.findWhere(conditions, options);
  }

  async testFindOneWhere(conditions: Record<string, unknown>, options?: { includeDeleted?: boolean }) {
    return this.findOneWhere(conditions, options);
  }
}

// =====================================================
// Mock 工具
// =====================================================

/** 创建模拟的 Pool */
function createMockPool(): Pool {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;
}

/** 创建模拟的 PoolClient */
function createMockClient(): PoolClient {
  return {
    query: vi.fn(),
    release: vi.fn(),
  } as unknown as PoolClient;
}

/** 创建查询结果 */
function createQueryResult<T>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as QueryResult<T>;
}

// =====================================================
// 测试套件
// =====================================================

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

  // =====================================================
  // softDelete() 测试
  // =====================================================
  describe('softDelete()', () => {
    test('应该设置 deleted_at 和 deleted_by', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const id = 'test-id-123';
      const deletedBy = 'user-456';

      await repository.softDelete(id, deletedBy);

      // 验证查询被调用
      expect(mockQuery).toHaveBeenCalledTimes(1);

      // 验证 SQL 语句
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('UPDATE test_table SET deleted_at = $2, deleted_by = $3 WHERE id = $1');

      // 验证参数
      expect(callArgs[1][0]).toBe(id);
      expect(callArgs[1][1]).toBeTypeOf('number'); // deleted_at 是时间戳
      expect(callArgs[1][2]).toBe(deletedBy);
    });

    test('使用 client 而非 pool 进行事务操作', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      const repoWithClient = new TestRepository(mockPool, tableName, mockClient);
      (mockClient as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      await repoWithClient.softDelete('id', 'user');

      // 应该使用 client.query 而不是 pool.query
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  // =====================================================
  // restore() 测试
  // =====================================================
  describe('restore()', () => {
    test('应该清除 deleted_at 和 deleted_by', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const id = 'test-id-123';

      await repository.restore(id);

      // 验证 SQL 语句
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('UPDATE test_table SET deleted_at = NULL, deleted_by = NULL WHERE id = $1');
      expect(callArgs[1][0]).toBe(id);
    });
  });

  // =====================================================
  // findById() 测试
  // =====================================================
  describe('findById()', () => {
    test('默认应该过滤已删除记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      await repository.findById('test-id');

      // 验证 SQL 包含 deleted_at IS NULL 过滤
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('deleted_at IS NULL');
    });

    test('includeDeleted=true 应该返回已删除记录', async () => {
      const deletedRow = {
        id: 'deleted-id',
        name: 'Deleted Entity',
        created_at: Date.now(),
        deleted_at: Date.now() - 1000,
        deleted_by: 'user-123',
      };

      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([deletedRow]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.findById('deleted-id', { includeDeleted: true });

      // 验证 SQL 不包含 deleted_at IS NULL 过滤
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).not.toContain('deleted_at IS NULL');
      expect(callArgs[0]).toBe('SELECT * FROM test_table WHERE id = $1 LIMIT 1');

      // 验证返回结果
      expect(result).not.toBeNull();
      expect(result?.id).toBe('deleted-id');
      expect(result?.deletedAt).toBe(deletedRow.deleted_at);
      expect(result?.deletedBy).toBe('user-123');
    });

    test('未找到记录时返回 null', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    test('应该正确映射实体字段', async () => {
      const row = {
        id: 'test-id',
        name: 'Test Entity',
        created_at: 1700000000000,
        deleted_at: null,
        deleted_by: null,
      };

      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([row]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.findById('test-id');

      expect(result).toEqual({
        id: 'test-id',
        name: 'Test Entity',
        createdAt: 1700000000000,
        deletedAt: null,
        deletedBy: null,
      });
    });
  });

  // =====================================================
  // list() 测试
  // =====================================================
  describe('list()', () => {
    test('默认只返回未删除记录', async () => {
      const rows = [
        { id: '1', name: 'Active 1', created_at: 1, deleted_at: null, deleted_by: null },
        { id: '2', name: 'Active 2', created_at: 2, deleted_at: null, deleted_by: null },
      ];

      const mockQuery = vi.fn().mockResolvedValue(createQueryResult(rows));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.list();

      // 验证 SQL 包含 deleted_at IS NULL 过滤
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('deleted_at IS NULL');
      expect(result).toHaveLength(2);
    });

    test('includeDeleted=true 返回所有记录', async () => {
      const rows = [
        { id: '1', name: 'Active', created_at: 1, deleted_at: null, deleted_by: null },
        { id: '2', name: 'Deleted', created_at: 2, deleted_at: 123, deleted_by: 'user' },
      ];

      const mockQuery = vi.fn().mockResolvedValue(createQueryResult(rows));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.list({ includeDeleted: true });

      // 验证 SQL 不包含 deleted_at IS NULL 过滤
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).not.toContain('deleted_at IS NULL');
      expect(callArgs[0]).toBe('SELECT * FROM test_table');
      expect(result).toHaveLength(2);
    });

    test('返回空数组当没有记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.list();

      expect(result).toEqual([]);
    });
  });

  // =====================================================
  // listDeleted() 测试
  // =====================================================
  describe('listDeleted()', () => {
    test('只返回已删除记录', async () => {
      const rows = [
        { id: '1', name: 'Deleted 1', created_at: 1, deleted_at: 100, deleted_by: 'user1' },
        { id: '2', name: 'Deleted 2', created_at: 2, deleted_at: 200, deleted_by: 'user2' },
      ];

      const mockQuery = vi.fn().mockResolvedValue(createQueryResult(rows));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.listDeleted();

      // 验证 SQL
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('deleted_at IS NOT NULL');
      expect(result).toHaveLength(2);
    });

    test('retentionDays 参数只返回超期记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const retentionDays = 30;
      const result = await repository.listDeleted(retentionDays);

      // 验证 SQL 包含时间阈值条件
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('deleted_at IS NOT NULL AND deleted_at < $1');

      // 验证阈值计算（大约是 30 天前的时间戳）
      const threshold = callArgs[1][0] as number;
      const expectedThreshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      // 允许 1 秒误差
      expect(Math.abs(threshold - expectedThreshold)).toBeLessThan(1000);
    });
  });

  // =====================================================
  // hardDelete() 测试
  // =====================================================
  describe('hardDelete()', () => {
    test('应该物理删除数据', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const id = 'to-delete-id';
      await repository.hardDelete(id);

      // 验证 SQL 是 DELETE 而不是 UPDATE
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('DELETE FROM test_table WHERE id = $1');
      expect(callArgs[1][0]).toBe(id);
    });
  });

  // =====================================================
  // countDeleted() 测试
  // =====================================================
  describe('countDeleted()', () => {
    test('统计已删除记录数量', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([{ count: 5 }]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const count = await repository.countDeleted();

      // 验证 SQL
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('SELECT COUNT(*) as count FROM test_table WHERE deleted_at IS NOT NULL');
      expect(count).toBe(5);
    });

    test('retentionDays 参数只统计超期记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([{ count: 3 }]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const retentionDays = 7;
      const count = await repository.countDeleted(retentionDays);

      // 验证 SQL 包含时间阈值条件
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('deleted_at IS NOT NULL AND deleted_at < $1');

      // 验证阈值计算
      const threshold = callArgs[1][0] as number;
      const expectedThreshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      expect(Math.abs(threshold - expectedThreshold)).toBeLessThan(1000);

      expect(count).toBe(3);
    });

    test('返回 0 当没有已删除记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([{ count: 0 }]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const count = await repository.countDeleted();

      expect(count).toBe(0);
    });

    test('处理 null 结果返回 0', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([{ count: null }]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const count = await repository.countDeleted();

      expect(count).toBe(0);
    });
  });

  // =====================================================
  // findWhere() 测试
  // =====================================================
  describe('findWhere()', () => {
    test('默认过滤已删除记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      await repository.testFindWhere({ name: 'test' });

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('deleted_at IS NULL');
    });

    test('includeDeleted=true 返回所有匹配记录', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      await repository.testFindWhere({ name: 'test' }, { includeDeleted: true });

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).not.toContain('deleted_at IS NULL');
    });
  });

  // =====================================================
  // findOneWhere() 测试
  // =====================================================
  describe('findOneWhere()', () => {
    test('返回第一个匹配记录', async () => {
      const rows = [
        { id: '1', name: 'test', created_at: 1, deleted_at: null, deleted_by: null },
      ];

      const mockQuery = vi.fn().mockResolvedValue(createQueryResult(rows));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.testFindOneWhere({ name: 'test' });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('1');
    });

    test('没有匹配记录时返回 null', async () => {
      const mockQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockQuery;

      const result = await repository.testFindOneWhere({ name: 'non-existent' });

      expect(result).toBeNull();
    });
  });

  // =====================================================
  // queryClient 选择测试
  // =====================================================
  describe('queryClient 选择', () => {
    test('无 client 时使用 pool', async () => {
      const mockPoolQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockPool as unknown as { query: ReturnType<typeof vi.fn> }).query = mockPoolQuery;

      await repository.list();

      expect(mockPoolQuery).toHaveBeenCalled();
    });

    test('有 client 时使用 client（事务场景）', async () => {
      const mockClientQuery = vi.fn().mockResolvedValue(createQueryResult([]));
      (mockClient as unknown as { query: ReturnType<typeof vi.fn> }).query = mockClientQuery;

      const repoWithClient = new TestRepository(mockPool, tableName, mockClient);
      await repoWithClient.list();

      expect(mockClientQuery).toHaveBeenCalled();
    });
  });
});