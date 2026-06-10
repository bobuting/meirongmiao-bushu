// test/fixtures/db-test-helper.ts
/**
 * 集成测试数据库辅助工具
 * 提供测试数据库连接、表清理、事务回滚等功能
 */

import { Pool, PoolClient } from 'pg';

// =====================================================
// 测试数据库连接
// =====================================================

/** 创建测试数据库连接池 */
export function createTestDatabasePool(): Pool {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL environment variable is required');
  }
  return new Pool({
    connectionString: url,
    connectionTimeoutMillis: 10000,
    max: 5,
  });
}

// =====================================================
// 测试数据库管理
// =====================================================

/** 清空指定表（用于测试前清理） */
export async function clearTables(pool: Pool, tables: string[]): Promise<void> {
  // 表名合法性校验，防止 SQL 注入
  const validTableName = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  for (const table of tables) {
    if (!validTableName.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
  }
}

/** 清空所有测试相关表 */
export async function clearAllTestTables(pool: Pool): Promise<void> {
  const tables = [
    'nrm_project_workflow_states',
    'nrm_projects',
    'nrm_sessions',
    'nrm_users',
    'nrm_trend_entries',
    'nrm_trend_sync_jobs',
  ];
  await clearTables(pool, tables);
}

// =====================================================
// 事务隔离测试
// =====================================================

/** 在事务中执行测试，结束后回滚（确保测试隔离） */
export async function withTransactionRollback<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =====================================================
// 测试生命周期钩子
// =====================================================

/** 创建测试数据库钩子（用于 beforeEach/afterEach） */
export function createTestDbHooks() {
  let pool: Pool;

  return {
    /** 初始化：创建连接池并清空表 */
    async setup(): Promise<Pool> {
      pool = createTestDatabasePool();
      await clearAllTestTables(pool);
      return pool;
    },

    /** 清理：清空表并关闭连接池 */
    async teardown(): Promise<void> {
      if (pool) {
        await clearAllTestTables(pool);
        await pool.end();
      }
    },

    /** 获取连接池 */
    getPool(): Pool {
      if (!pool) {
        throw new Error('Pool not initialized. Call setup() first.');
      }
      return pool;
    },
  };
}

// =====================================================
// 测试数据插入辅助
// =====================================================

/** 直接插入测试用户 */
export async function insertTestUser(pool: Pool, userId: string, email: string): Promise<void> {
  await pool.query(
    `INSERT INTO nrm_users (id, email, password_hash, role, created_at) VALUES ($1, $2, $3, 'user', $4)`,
    [userId, email, 'test-hash', Date.now()],
  );
}

/** 直接插入测试项目 */
export async function insertTestProject(pool: Pool, projectId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO nrm_projects (id, owner_id, name, status, created_at, updated_at) VALUES ($1, $2, '测试项目', 'draft', $3, $3)`,
    [projectId, userId, Date.now()],
  );
}