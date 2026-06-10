/**
 * 创作广场自动化执行日志数据库服务
 * 委托 PgSquareExecutionLogRepository 执行数据库操作
 */

import type { PgSquareExecutionLogRepository } from "../repositories/pg/square-execution-log-pg-repository.js";

/** 执行类型（从 repo 重新导出） */
export type ExecutionType = "discovery" | "auto_publish";

/** 执行状态（从 repo 重新导出） */
export type ExecutionStatus = "running" | "success" | "failed";

/** 执行日志信息（与 repo record 兼容） */
export interface ExecutionLog {
  id: string;
  type: ExecutionType;
  status: ExecutionStatus;
  summary: string | null;
  resultData: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * 创作广场执行日志服务
 * 委托 PgSquareExecutionLogRepository 执行所有数据库操作
 */
export class SquareExecutionLogService {
  constructor(private readonly repo: PgSquareExecutionLogRepository) {}

  /** 开始执行时插入一条 running 日志 */
  async start(type: ExecutionType): Promise<string> {
    return this.repo.start(type);
  }

  /** 检查今天是否已有成功执行记录 */
  async hasSucceededToday(type: ExecutionType): Promise<boolean> {
    return this.repo.hasSucceededToday(type);
  }

  /** 执行成功，更新日志 */
  async succeed(id: string, summary: string, resultData: Record<string, unknown>): Promise<void> {
    await this.repo.succeed(id, summary, resultData);
  }

  /** 执行失败，更新日志 */
  async fail(id: string, errorMessage: string): Promise<void> {
    await this.repo.fail(id, errorMessage);
  }

  /** 分页查询执行日志 */
  async list(params: {
    type?: ExecutionType;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: ExecutionLog[]; total: number }> {
    return this.repo.listPaginated(params);
  }
}
