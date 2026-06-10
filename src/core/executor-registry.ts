/**
 * ExecutorRegistry
 * 任务执行器统一注册表
 *
 * 核心职责：
 * 1. 集中管理所有任务类型的 executor
 * 2. 避免分散注册，便于调试和维护
 * 3. 提供统一的 executor 签名
 *
 * 使用方式：
 * - 在 setup-executors.ts 中集中注册所有 executor
 * - QueueDispatcher 在任务提升后调用 executor 执行业务逻辑
 */

import type { Pool } from "pg";
import type { AppContext } from "./app-context.js";
import type { QueueDispatcher } from "../modules/queue-dispatcher.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";

/**
 * Executor 函数签名
 * 所有 executor 必须符合此签名，便于统一调用
 *
 * @param pool - 数据库连接池
 * @param repos - PG 仓库集合（async-job-service 迁移后优先使用 repos）
 * @param jobId - 任务 ID
 * @param ctx - 应用上下文（包含服务、配置等）
 * @param dispatcher - 任务调度器（用于创建子任务、检查父任务等）
 */
export type ExecutorFn = (params: {
  pool: Pool;
  repos: PgRepositoryCollection;
  jobId: string;
  ctx: AppContext;
  dispatcher: QueueDispatcher;
}) => Promise<void>;

/**
 * Executor 注册表
 * 单例模式，在 app-setup 中创建并注入到 AppContext
 */
export class ExecutorRegistry {
  /** executor 存储 Map<jobType, ExecutorFn> */
  private executors = new Map<string, ExecutorFn>();

  /**
   * 注册 executor
   * @param jobType - 任务类型（如 "step3_shot_prompt"）
   * @param executor - 执行器函数
   * @throws Error - 如果 jobType 已注册（防止重复注册）
   */
  register(jobType: string, executor: ExecutorFn): void {
    if (this.executors.has(jobType)) {
      throw new Error(`Executor already registered for jobType: ${jobType}`);
    }
    this.executors.set(jobType, executor);
  }

  /**
   * 获取 executor
   * @param jobType - 任务类型
   * @returns ExecutorFn | null - 存在时返回 executor，否则返回 null
   */
  get(jobType: string): ExecutorFn | null {
    return this.executors.get(jobType) || null;
  }

  /**
   * 检查是否已注册
   * @param jobType - 任务类型
   * @returns boolean
   */
  has(jobType: string): boolean {
    return this.executors.has(jobType);
  }

  /**
   * 获取所有已注册的 jobType（用于调试）
   * @returns string[]
   */
  getAllJobTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  /**
   * 获取已注册数量（用于调试）
   * @returns number
   */
  size(): number {
    return this.executors.size;
  }
}