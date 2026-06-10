/**
 * PostgreSQL 连接池初始化模块
 *
 * 负责创建 PG pool 并管理模块级变量，供 repository 层使用。
 */
import { Pool, types } from "pg";
import type { FastifyInstance } from "fastify";

// 配置 PostgreSQL 类型解析
// BIGINT (OID 20) 默认返回字符串，改为返回数字
types.setTypeParser(20, (value) => parseInt(value, 10));

/** 模块级 PG pool 变量 */
let _pgPool: Pool | null = null;

/**
 * 创建 PostgreSQL 连接池
 *
 * @param app Fastify 实例，用于日志记录
 * @returns PG pool 实例
 * @throws 如果 DATABASE_URL 未配置或创建失败
 */
export function createPgPool(app: FastifyInstance): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "[startup] DATABASE_URL is required. Please configure your PostgreSQL connection.",
    );
  }

  try {
    const pool = new Pool({ connectionString: databaseUrl });
    _pgPool = pool;
    return pool;
  } catch (err) {
    app.log.error({ err }, "PG pool creation failed");
    throw new Error(
      "[startup] Failed to create PG pool. Check DATABASE_URL configuration.",
    );
  }
}

/**
 * 关闭 PostgreSQL 连接池
 *
 * 在应用关闭时调用，清理模块级变量。
 */
export async function closePgPool(): Promise<void> {
  if (_pgPool) {
    await _pgPool.end();
    _pgPool = null;
  }
}