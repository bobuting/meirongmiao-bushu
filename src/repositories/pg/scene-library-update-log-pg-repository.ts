/**
 * 场景库更新日志 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgSceneLibraryUpdateLogRepository extends PgBaseRepository<Record<string, unknown>> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("scene_library_update_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): Record<string, unknown> {
    return row;
  }

  protected mapEntity(entity: Record<string, unknown>): Record<string, unknown> {
    return entity;
  }

  /** 清理超时僵尸任务（running 状态超过 30 分钟） */
  async cleanupZombieTasks(): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', error_message = '服务中断，任务未完成（超时清理）', finished_at = NOW() WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'`,
    );
  }

  /** 检查是否有正在运行的任务 */
  async hasRunningTask(): Promise<boolean> {
    const result = await this.queryClient.query(
      `SELECT id FROM ${this.tableName} WHERE status = 'running' LIMIT 1`,
    );
    return result.rows.length > 0;
  }

  /** 插入运行记录（running 状态） */
  async insertLog(params: { triggerType: string; sceneCategory: string }): Promise<string> {
    const result = await this.queryClient.query<{ id: string }>(
      `INSERT INTO ${this.tableName} (trigger_type, status, scene_category) VALUES ($1, 'running', $2) RETURNING id`,
      [params.triggerType, params.sceneCategory],
    );
    return result.rows[0].id;
  }

  /** 更新运行记录为完成状态 */
  async finishLog(
    logId: string,
    status: "success" | "failed",
    data: {
      xiaohongshuCount: number;
      instagramCount: number;
      weiboCount: number;
      douyinCount: number;
      scenesUpdated: number;
      durationMs: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = $1, xiaohongshu_count = $2, instagram_count = $3, weibo_count = $4,
           douyin_count = $5, scenes_updated = $6, duration_ms = $7, error_message = $8, finished_at = NOW()
       WHERE id = $9`,
      [status, data.xiaohongshuCount, data.instagramCount, data.weiboCount, data.douyinCount, data.scenesUpdated, data.durationMs, data.errorMessage || null, logId],
    );
  }

  /** 查询运行记录列表（分页） */
  async findPaginatedLogs(params: {
    page: number;
    limit: number;
    triggerType?: string;
    status?: string;
  }): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const conditions: string[] = [];
    const queryParams: (string | number)[] = [];

    if (params.triggerType) {
      queryParams.push(params.triggerType);
      conditions.push(`trigger_type = $${queryParams.length}`);
    }
    if (params.status) {
      queryParams.push(params.status);
      conditions.push(`status = $${queryParams.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await this.queryClient.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      queryParams,
    );

    const listResult = await this.queryClient.query(
      `SELECT id, trigger_type, status, scene_category,
              xiaohongshu_count, instagram_count, weibo_count, douyin_count, scenes_updated,
              duration_ms, error_message, started_at, finished_at, created_at
       FROM ${this.tableName} ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, params.limit, offset],
    );

    return {
      items: listResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  }
}
