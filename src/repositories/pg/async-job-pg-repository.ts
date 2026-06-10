/**
 * 异步任务 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 异步任务记录 */
export interface AsyncJobRecord {
  id: string;
  jobType: string;
  status: string;
  error: string | null;
  createdAt: number;
  updatedAt: number | null;
  projectId: string;
  result: string | null;
}

export class PgAsyncJobRepository extends PgBaseRepository<AsyncJobRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("async_jobs"), client);
  }

  /**
   * 确保 nrm_async_jobs 表结构存在（DDL）
   * 在应用启动阶段调用，替代路由中内联的 CREATE TABLE / ALTER TABLE / CREATE INDEX
   */
  static async ensureSchema(pool: Pool): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nrm_async_jobs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        job_type VARCHAR(40) NOT NULL DEFAULT 'llm_reverse',
        project_id VARCHAR(64),
        input TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        stage VARCHAR(20),
        result JSONB,
        error JSONB,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    // 旧表兼容：添加 job_type 列
    await pool.query(`
      ALTER TABLE nrm_async_jobs
      ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) NOT NULL DEFAULT 'llm_reverse'
    `).catch(() => { /* column may already exist */ });

    // 旧表兼容：添加 project_id 列
    await pool.query(`
      ALTER TABLE nrm_async_jobs
      ADD COLUMN IF NOT EXISTS project_id VARCHAR(64)
    `).catch(() => { /* column may already exist */ });

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_async_jobs_user_status
        ON nrm_async_jobs(user_id, status)
    `);
  }

  protected mapRow(row: Record<string, unknown>): AsyncJobRecord {
    return {
      id: row.id as string,
      jobType: row.job_type as string,
      status: row.status as string,
      error: row.error as string | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number | null,
      projectId: row.project_id as string,
      result: row.result as string | null,
    };
  }

  protected mapEntity(entity: AsyncJobRecord): Record<string, unknown> {
    return {
      id: entity.id,
      job_type: entity.jobType,
      status: entity.status,
      error: entity.error ?? null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt ?? null,
      project_id: entity.projectId,
      result: entity.result ?? null,
    };
  }

  /** 按项目 ID 查询异步任务 */
  async findByProjectId(projectId: string, limit = 50): Promise<AsyncJobRecord[]> {
    const result = await this.queryClient.query(
      `SELECT id, job_type, status, error, created_at, updated_at
       FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 更新异步任务的 updated_at（心跳） */
  async updateHeartbeat(jobId: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET updated_at = $1 WHERE id = $2`,
      [updatedAt, jobId],
    );
  }

  /** 更新异步任务的 updated_at + result（心跳 + 轮询计数） */
  async updateHeartbeatWithResult(jobId: string, updatedAt: number, result: Record<string, unknown>): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET updated_at = $1, result = $2 WHERE id = $3`,
      [updatedAt, JSON.stringify(result), jobId],
    );
  }

  /** 按项目+任务类型查询最新的异步任务 */
  async findLatestByProjectAndType(projectId: string, jobType: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT id, status, stage, error FROM ${this.tableName}
       WHERE project_id = $1 AND job_type = $2
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, jobType],
    );
    return result.rows[0] ?? null;
  }

  /** 查询项目是否有指定类型模式的活跃任务 */
  async hasActiveByProjectAndTypePattern(projectId: string, typePattern: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `SELECT id FROM ${this.tableName} WHERE project_id = $1 AND status IN ('pending', 'running') AND job_type LIKE $2 LIMIT 1`,
      [projectId, typePattern],
    );
    return result.rows.length > 0;
  }

  /** 按状态统计任务数量 */
  async countByStatus(status: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE status = $1`,
      [status],
    );
    return Number(result.rows[0]?.cnt ?? 0);
  }

  /** 按 taskId（input JSONB 字段）查找 pending/running 的异步任务 */
  async findByTaskIdAndPending(taskId: string): Promise<{ id: string; user_id: string; job_type: string } | null> {
    const result = await this.queryClient.query<{ id: string; user_id: string; job_type: string }>(
      `SELECT id, user_id, job_type FROM ${this.tableName}
       WHERE input::jsonb->>'taskId' = $1 AND status IN ('pending', 'running')
       LIMIT 1`,
      [taskId],
    );
    return result.rows[0] ?? null;
  }

  /** 按 taskId 合并更新 result（JSONB || 操作） */
  async updateResultByTaskId(taskId: string, resultJson: string, updatedAt: number, jobType: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET result = COALESCE(result, '{}')::jsonb || $1::jsonb, updated_at = $2 WHERE input::jsonb->>'taskId' = $3 AND job_type = $4`,
      [resultJson, updatedAt, taskId, jobType],
    );
  }

  /** 统计活跃任务数（pending + running） */
  async countActive(): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE status IN ('pending', 'running')`,
    );
    return Number(result.rows[0]?.cnt ?? 0);
  }

  /** 按 job_type + status 分组统计（仅活跃任务） */
  async countByTypeAndStatus(): Promise<{ job_type: string; status: string; count: number }[]> {
    const result = await this.queryClient.query(
      `SELECT job_type, status, COUNT(*) as count FROM ${this.tableName} WHERE status IN ('pending', 'running') GROUP BY job_type, status ORDER BY job_type, status`,
    );
    return result.rows.map((r) => ({ job_type: r.job_type as string, status: r.status as string, count: Number(r.count) }));
  }

  /** 按用户查找活跃任务（id, job_type） */
  async findActiveByUserId(userId: string): Promise<{ id: string; job_type: string }[]> {
    const result = await this.queryClient.query<{ id: string; job_type: string }>(
      `SELECT id, job_type FROM ${this.tableName} WHERE user_id = $1 AND status IN ('pending', 'running')`,
      [userId],
    );
    return result.rows;
  }

  /** 将用户的活跃任务标记为 failed */
  async failActiveByUserId(userId: string, updatedAt: number): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', error = '{"code":"ADMIN_CLEAR","message":"管理员清理任务"}', updated_at = $1 WHERE user_id = $2 AND status IN ('pending', 'running')`,
      [updatedAt, userId],
    );
    return result.rowCount ?? 0;
  }

  /** 删除用户的所有任务 */
  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  /** 按用户和任务类型删除 */
  async deleteByUserIdAndType(userId: string, jobType: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1 AND job_type = $2`,
      [userId, jobType],
    );
    return result.rowCount ?? 0;
  }

  /** 按状态分组统计所有任务 */
  async countGroupByStatus(): Promise<Record<string, number>> {
    const result = await this.queryClient.query(
      `SELECT status, COUNT(*) as count FROM ${this.tableName} GROUP BY status ORDER BY status`,
    );
    const map: Record<string, number> = {};
    for (const row of result.rows) {
      map[row.status as string] = Number(row.count);
    }
    return map;
  }

  /** 管理员任务列表（动态过滤 + 分页） */
  async findListWithFilters(options: { status?: string; jobType?: string; userId?: string; limit: number }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options.status) {
      conditions.push(`status = $${idx++}`);
      params.push(options.status);
    }
    if (options.jobType) {
      conditions.push(`job_type = $${idx++}`);
      params.push(options.jobType);
    }
    if (options.userId) {
      conditions.push(`user_id = $${idx++}`);
      params.push(options.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.queryClient.query(
      `SELECT id, user_id, job_type, project_id, status, stage, error, created_at, updated_at, parent_job_id
       FROM ${this.tableName}
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, options.limit],
    );
    return result.rows;
  }

  /** 查询 visible_to_user 的用户任务（动态过滤 + 分页 + 统计） */
  async findVisibleToUserWithFilters(options: {
    jobType?: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: Record<string, unknown>[]; total: number; stats: Record<string, number> }> {
    const conditions: string[] = ["visible_to_user = true"];
    const params: unknown[] = [];
    let idx = 1;

    if (options.jobType) {
      conditions.push(`job_type = $${idx++}`);
      params.push(options.jobType);
    }
    if (options.status) {
      conditions.push(`status = $${idx++}`);
      params.push(options.status);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const dataResult = await this.queryClient.query(
      `SELECT id, user_id, project_id, job_type, status, stage, input, result, error,
              visible_to_user, created_at, updated_at
       FROM ${this.tableName}
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, options.limit, options.offset],
    );

    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${where}`,
      params,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const statsResult = await this.queryClient.query(
      `SELECT status, COUNT(*) as count FROM ${this.tableName} ${where} GROUP BY status`,
      params,
    );
    const stats: Record<string, number> = {};
    for (const row of statsResult.rows) {
      stats[row.status as string] = Number(row.count);
    }

    return { rows: dataResult.rows, total, stats };
  }

  /** 按项目 ID + job_type 删除任务（forceRefresh 模式） */
  async deleteByProjectIdAndJobType(projectId: string, jobType: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1 AND job_type = $2`,
      [projectId, jobType],
    );
  }

  /** 按项目 ID + job_type 模式删除任务（排除特定类型） */
  async deleteByProjectIdAndJobTypePattern(
    projectId: string,
    pattern: string,
    excludeTypes: string[],
  ): Promise<void> {
    const excludeClause =
      excludeTypes.length > 0
        ? `AND job_type NOT IN (${excludeTypes.map((_, i) => `$${i + 3}`).join(", ")})`
        : "";
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1 AND job_type LIKE $2 ${excludeClause}`,
      [projectId, pattern, ...excludeTypes],
    );
  }

  /** 查找项目指定 slot 的进行中五视图任务（slot 从 input JSONB 提取） */
  async findActiveByProjectTypeAndSlot(
    projectId: string,
    jobType: string,
    slot: number | null,
  ): Promise<{
    id: string;
    user_id: string;
    job_type: string;
    project_id: string | null;
    input: string;
    status: string;
    stage: string | null;
    result: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
    created_at: number;
    updated_at: number;
    execution_mode: "once" | "poll";
  } | null> {
    const result = await this.queryClient.query(
      `SELECT id, user_id, job_type, project_id, input, status, stage, result, error, created_at, updated_at, execution_mode
       FROM ${this.tableName}
       WHERE project_id = $1
         AND job_type = $2
         AND status IN ('pending', 'running')
         AND (input::jsonb->>'slot')::int = $3
       LIMIT 1`,
      [projectId, jobType, slot ?? null],
    );
    return result.rows[0] ?? null;
  }

  /** 查找指定 job_type 的 pending 任务（用于 advanceFiveViewJobs） */
  async findPendingByJobType(jobType: string, limit: number = 10): Promise<{
    id: string;
    user_id: string;
    job_type: string;
    project_id: string | null;
    input: string;
    status: string;
    stage: string | null;
    result: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
    created_at: number;
    updated_at: number;
    execution_mode: "once" | "poll";
  }[]> {
    const result = await this.queryClient.query(
      `SELECT id, user_id, job_type, project_id, input, status, stage, result, error, created_at, updated_at, execution_mode
       FROM ${this.tableName}
       WHERE job_type = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2`,
      [jobType, limit],
    );
    return result.rows;
  }

  /** 查询父任务的所有子任务（用于 checkAndFinalizeParentJob） */
  async findChildrenByParentId(parentJobId: string): Promise<{
    id: string;
    status: string;
    result: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  }[]> {
    const result = await this.queryClient.query(
      `SELECT id, status, result, error
       FROM ${this.tableName}
       WHERE parent_job_id = $1`,
      [parentJobId],
    );
    return result.rows;
  }

  /** 查询父任务的所有子任务状态（用于 checkAndFinalizeBatchParent） */
  async findChildrenStatusByParentId(
    parentJobId: string,
    jobType: string,
  ): Promise<{ status: string }[]> {
    const result = await this.queryClient.query<{ status: string }>(
      `SELECT status FROM ${this.tableName} WHERE parent_job_id = $1 AND job_type = $2`,
      [parentJobId, jobType],
    );
    return result.rows;
  }

  /** 将父任务的所有 pending 子任务标记为 failed（用户停止批量生成时调用） */
  async failPendingChildrenByParentJobId(
    projectId: string,
    parentJobId: string,
    jobType: string,
    errorJson: Record<string, unknown>,
    updatedAt: number,
  ): Promise<{ id: string; user_id: string; job_type: string }[]> {
    const result = await this.queryClient.query<{ id: string; user_id: string; job_type: string }>(
      `UPDATE ${this.tableName}
       SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE project_id = $3
         AND job_type = $4
         AND status = 'pending'
         AND input::jsonb->>'parentJobId' = $5
       RETURNING id, user_id, job_type`,
      [JSON.stringify(errorJson), updatedAt, projectId, jobType, parentJobId],
    );
    return result.rows;
  }

  /** 更新任务的 input JSON 字段 */
  async updateInput(jobId: string, inputJson: Record<string, unknown>): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET input = $1 WHERE id = $2`,
      [JSON.stringify(inputJson), jobId],
    );
  }

  /** 获取任务的 parent_job_id */
  async getParentJobId(jobId: string): Promise<string | null> {
    const result = await this.queryClient.query<{ parent_job_id: string | null }>(
      `SELECT parent_job_id FROM ${this.tableName} WHERE id = $1`,
      [jobId],
    );
    return result.rows[0]?.parent_job_id ?? null;
  }

  /** 统计 running 状态的任务数量 */
  async countRunning(): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = 'running'`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** 清理 orphaned 帧任务：父批量任务已结束但子帧仍卡在 pending */
  async cleanupOrphanedFrameJobs(errorJson: string, updatedAt: number): Promise<Array<{ id: string; job_type: string; user_id: string }>> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} child
       SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE child.job_type = 'step3_frame_preview'
         AND child.status = 'pending'
         AND EXISTS (
           SELECT 1 FROM ${this.tableName} parent
           WHERE parent.id::text = (child.input::json->>'parentJobId')
             AND parent.job_type = 'step3_batch_preview'
             AND parent.status NOT IN ('pending', 'running')
         )
       RETURNING id, job_type, user_id`,
      [errorJson, updatedAt],
    );
    return result.rows;
  }

  /** 失败传播：将依赖 failed job 的 pending job 标记为 failed */
  async propagateDependencyFailures(errorJson: string, updatedAt: number): Promise<Array<{ id: string; job_type: string; parent_job_id: string | null; user_id: string }>> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} child
       SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE child.status = 'pending'
         AND child.depends_on IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM unnest(child.depends_on) AS dep_id
           WHERE EXISTS (
             SELECT 1 FROM ${this.tableName} dep
             WHERE dep.id = dep_id AND dep.status = 'failed'
           )
         )
       RETURNING id, job_type, parent_job_id, user_id`,
      [errorJson, updatedAt],
    );
    return result.rows;
  }

  /** 取消父任务下所有 running/pending 子任务 */
  async cancelSiblingsByParentIds(
    parentJobIds: string[],
    excludeIds: string[],
    errorJson: string,
    updatedAt: number,
  ): Promise<Array<{ id: string; job_type: string; user_id: string }>> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE parent_job_id = ANY($3)
         AND status IN ('running', 'pending')
         AND NOT (id = ANY($4))
       RETURNING id, job_type, user_id`,
      [errorJson, updatedAt, parentJobIds, excludeIds],
    );
    return result.rows;
  }

  /** 标记父任务为 failed */
  async failParentJobs(
    parentJobIds: string[],
    errorJson: string,
    updatedAt: number,
  ): Promise<Array<{ id: string; job_type: string; user_id: string }>> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE id = ANY($3) AND status = 'running'
       RETURNING id, job_type, user_id`,
      [errorJson, updatedAt, parentJobIds],
    );
    return result.rows;
  }

  /** 获取可提升的 pending 任务（排除依赖未满足的），按 FIFO 排序 */
  async findPromotablePending(limit: number): Promise<Array<{ id: string; user_id: string; job_type: string; project_id: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, user_id, job_type, project_id FROM ${this.tableName}
       WHERE status = 'pending'
         AND (
           depends_on IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM unnest(depends_on) AS dep_id
             WHERE NOT EXISTS (
               SELECT 1 FROM ${this.tableName} dep
               WHERE dep.id = dep_id AND dep.status = 'completed'
             )
           )
         )
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** 统计每个用户的 running 任务数量 */
  async countRunningByUser(): Promise<Map<string, number>> {
    const result = await this.queryClient.query(
      `SELECT user_id, COUNT(*) as count FROM ${this.tableName}
       WHERE status = 'running' GROUP BY user_id`,
    );
    const map = new Map<string, number>();
    for (const row of result.rows) {
      map.set(row.user_id as string, Number(row.count));
    }
    return map;
  }

  /** 批量提升任务为 running */
  async batchPromoteToRunning(jobIds: string[], updatedAt: number): Promise<void> {
    if (jobIds.length === 0) return;
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'running', stage = NULL, updated_at = $1 WHERE id = ANY($2)`,
      [updatedAt, jobIds],
    );
  }

  /** 将任务标记为 failed（用于未注册 executor） */
  async markAsFailed(jobId: string, errorJson: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', stage = NULL, error = $1, updated_at = $2 WHERE id = $3`,
      [errorJson, updatedAt, jobId],
    );
  }

  /** 将 running 状态的任务标记为 failed（仅当 status = running 时） */
  async markAsFailedIfRunning(jobId: string, errorJson: string, updatedAt: number): Promise<{ parent_job_id: string | null } | null> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE id = $3 AND status = 'running'
       RETURNING parent_job_id`,
      [errorJson, updatedAt, jobId],
    );
    if (result.rows.length === 0) return null;
    return { parent_job_id: result.rows[0].parent_job_id as string | null };
  }

  /** 查询需要轮询的 poll 模式任务 */
  async findPollableRunning(minUpdatedAt: number, limit: number = 20): Promise<Array<{ id: string; job_type: string; user_id: string; project_id: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, job_type, user_id, project_id
       FROM ${this.tableName}
       WHERE execution_mode = 'poll'
         AND status = 'running'
         AND updated_at < $1
       ORDER BY updated_at ASC
       LIMIT $2`,
      [minUpdatedAt, limit],
    );
    return result.rows;
  }

  /** 批量更新任务的 updated_at（轮询心跳） */
  async batchUpdateHeartbeat(jobIds: string[], updatedAt: number): Promise<void> {
    if (jobIds.length === 0) return;
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET updated_at = $1 WHERE id = ANY($2)`,
      [updatedAt, jobIds],
    );
  }

  // ===== async-job-service 迁移所需方法 =====

  /** 完整列 SELECT 片段（与 async-job-service.parseAsyncJobRow 对齐） */
  private static readonly FULL_COLUMNS = [
    "id", "user_id", "job_type", "project_id", "input", "status", "stage",
    "result", "error", "created_at", "updated_at", "parent_job_id",
    "depends_on", "execution_mode",
  ] as const;

  /** 完整列 SELECT 表达式 */
  private get fullColumnsExpr(): string {
    return PgAsyncJobRepository.FULL_COLUMNS.join(", ");
  }

  /** 插入新任务 */
  async insertJob(params: {
    id: string;
    userId: string;
    jobType: string;
    projectId: string | null;
    input: string;
    status: string;
    now: number;
    visibleToUser: boolean;
    parentJobId: string | null;
    dependsOn: string[] | null;
    executionMode: string;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, user_id, job_type, project_id, input, status, stage, result, error, created_at, updated_at, visible_to_user, parent_job_id, depends_on, execution_mode)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, $7, $8, $9, $10, $11, $12)`,
      [params.id, params.userId, params.jobType, params.projectId, params.input, params.status, params.now, params.now, params.visibleToUser, params.parentJobId, params.dependsOn, params.executionMode],
    );
  }

  /** 清理过期任务 */
  async purgeExpired(cutoff: number): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE updated_at < $1 AND status IN ('completed', 'failed', 'expired')`,
      [cutoff],
    );
  }

  /** 查询单个任务完整行 */
  async findByIdFullRow(jobId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE id = $1`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  /** 标记为过期 */
  async markExpired(jobId: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'expired', updated_at = $1 WHERE id = $2`,
      [updatedAt, jobId],
    );
  }

  /** 查询用户可见任务 */
  async findVisibleByUserId(userId: string, limit: number): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE user_id = $1 AND visible_to_user = true ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return result.rows;
  }

  /** 更新阶段 + 结果 */
  async updateStageAndResult(jobId: string, stage: string, result: Record<string, unknown> | null, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET stage = $1, result = $2, updated_at = $3 WHERE id = $4`,
      [stage, result ? JSON.stringify(result) : null, updatedAt, jobId],
    );
  }

  /** 仅更新阶段 */
  async updateStage(jobId: string, stage: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET stage = $1, updated_at = $2 WHERE id = $3`,
      [stage, updatedAt, jobId],
    );
  }

  /** 查询任务的 user_id + job_type（SSE 用） */
  async findUserInfoById(jobId: string): Promise<{ user_id: string; job_type: string } | null> {
    const result = await this.queryClient.query<{ user_id: string; job_type: string }>(
      `SELECT user_id, job_type FROM ${this.tableName} WHERE id = $1`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  /** 终结任务（status='running' 时才更新，返回影响行数） */
  async finalizeJob(
    jobId: string,
    status: string,
    result: string | null,
    error: string | null,
    updatedAt: number,
  ): Promise<number> {
    const updateResult = await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, stage = NULL, result = $2, error = $3, updated_at = $4 WHERE id = $5 AND status = 'running'`,
      [status, result, error, updatedAt, jobId],
    );
    return updateResult.rowCount ?? 0;
  }

  /** 查询项目可见任务（完整行） */
  async findVisibleByProjectId(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE project_id = $1 AND visible_to_user = true ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  /** 查找项目活跃任务（完整行） */
  async findActiveByProjectAndType(projectId: string, jobType: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE project_id = $1 AND job_type = $2 AND status IN ('pending', 'running') LIMIT 1`,
      [projectId, jobType],
    );
    return result.rows[0] ?? null;
  }

  /** 查找项目最新任务（完整行） */
  async findLatestByProjectAndTypeFull(projectId: string, jobType: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE project_id = $1 AND job_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [projectId, jobType],
    );
    return result.rows[0] ?? null;
  }

  /** 合并更新 result JSONB */
  async mergeResult(jobId: string, partial: Record<string, unknown>, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET result = COALESCE(result, '{}')::jsonb || $1::jsonb, updated_at = $2 WHERE id = $3`,
      [JSON.stringify(partial), updatedAt, jobId],
    );
  }

  /** 仅更新 updated_at */
  async updateUpdatedAt(jobId: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET updated_at = $1 WHERE id = $2`,
      [updatedAt, jobId],
    );
  }

  /** 更新 result 中指定 key（带白名单校验） */
  async updateResultKeys(jobId: string, keys: Record<string, unknown>, updatedAt: number): Promise<void> {
    const entries = Object.entries(keys);
    if (entries.length === 0) {
      await this.updateUpdatedAt(jobId, updatedAt);
      return;
    }

    const allowedKeys = new Set([
      "retryNotBefore", "enqueuedAt", "externalTaskIds",
      "completedClipCount", "totalClipCount", "clipGeneration",
      "durationMinutes", "providerId", "model",
      "isAdvancing", "advancingStartedAt",
      "videoTaskId", "videoQueryUrl", "videoCallMode", "videoProviderId", "sessionId",
    ]);
    for (const [key] of entries) {
      if (!allowedKeys.has(key)) {
        throw new Error(`updateResultKeys: 不允许的 key "${key}"`);
      }
    }

    let resultExpr = "COALESCE(result, '{}')";
    const params: unknown[] = [updatedAt, jobId];
    let paramIdx = 3;

    for (const [key, value] of entries) {
      if (value === null) {
        resultExpr = `${resultExpr} #- '{${key}}'`;
      } else {
        resultExpr = `jsonb_set(${resultExpr}, '{${key}}', $${paramIdx}::jsonb)`;
        params.push(JSON.stringify(value));
        paramIdx++;
      }
    }

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET result = ${resultExpr}, updated_at = $1 WHERE id = $2`,
      params,
    );
  }

  /** 更新状态 */
  async updateStatus(jobId: string, status: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, updatedAt, jobId],
    );
  }

  /** 查询活跃的 step4_video 任务 */
  async findActiveStep4VideoJobs(): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE job_type = 'step4_video' AND status IN ('pending', 'running')`,
    );
    return result.rows;
  }

  /** 按项目查询 step4_video 任务 */
  async findStep4VideoJobsByProjectId(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE project_id = $1 AND job_type = 'step4_video' ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  /** 取消项目指定前缀的进行中任务，返回取消的任务信息 */
  async cancelActiveByTypePrefix(
    projectId: string,
    jobTypePrefix: string,
    errorJson: string,
    updatedAt: number,
  ): Promise<Array<{ id: string; user_id: string; job_type: string }>> {
    const result = await this.queryClient.query<{ id: string; user_id: string; job_type: string }>(
      `UPDATE ${this.tableName}
       SET status = 'failed', stage = NULL, error = $1, updated_at = $2
       WHERE project_id = $3 AND job_type LIKE $4 AND status IN ('pending', 'running')
       RETURNING id, user_id, job_type`,
      [errorJson, updatedAt, projectId, `${jobTypePrefix}%`],
    );
    return result.rows;
  }

  /** 查询父任务的所有子任务（完整行） */
  async findChildrenByParentIdFull(parentJobId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT ${this.fullColumnsExpr} FROM ${this.tableName} WHERE parent_job_id = $1`,
      [parentJobId],
    );
    return result.rows;
  }

  /** 查询任务的 parent_job_id + user_id + job_type（用于 checkAndFinalizeParent） */
  async findParentInfoById(jobId: string): Promise<{ user_id: string; job_type: string; parent_job_id: string | null } | null> {
    const result = await this.queryClient.query<{ user_id: string; job_type: string; parent_job_id: string | null }>(
      `SELECT user_id, job_type, parent_job_id FROM ${this.tableName} WHERE id = $1`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  /** 将子任务标记为 failed（失败传播） */
  async markChildFailed(jobId: string, errorJson: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', stage = NULL, error = $1, updated_at = $2 WHERE id = $3`,
      [errorJson, updatedAt, jobId],
    );
  }

  /** 查询任务的 job_type + project_id */
  async findJobTypeAndProjectId(jobId: string): Promise<{ job_type: string; project_id: string | null } | null> {
    const result = await this.queryClient.query<{ job_type: string; project_id: string | null }>(
      `SELECT job_type, project_id FROM ${this.tableName} WHERE id = $1`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  /** 查找孤立的运行中父任务（用于启动恢复） */
  async findOrphanedRunningParentJobs(cutoff: number): Promise<Array<{ id: string; job_type: string }>> {
    const result = await this.queryClient.query<{ id: string; job_type: string }>(
      `SELECT id, job_type FROM ${this.tableName} WHERE status = 'running' AND parent_job_id IS NULL AND updated_at < $1`,
      [cutoff],
    );
    return result.rows;
  }

  // ===== stuck-job-cleanup-scheduler 所需方法 =====

  /** 查询超时的 running step4_video 任务 */
  async findStuckStep4VideoJobs(cutoff: number): Promise<Array<{ id: string; project_id: string; user_id: string; input: string; parent_job_id: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, input, parent_job_id
       FROM ${this.tableName}
       WHERE job_type = 'step4_video' AND status = 'running' AND created_at < $1`,
      [cutoff],
    );
    return result.rows;
  }

  /** 查询超时的 running 裂变任务 */
  async findStuckFissionJobs(cutoff: number, jobType: string): Promise<Array<{ id: string; project_id: string; user_id: string; result: string; parent_job_id: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, result, parent_job_id
       FROM ${this.tableName}
       WHERE job_type = $1 AND status = 'running' AND created_at < $2`,
      [jobType, cutoff],
    );
    return result.rows;
  }

  /** 查询超时的 running fire-and-forget 任务 */
  async findStuckFireAndForgetJobs(cutoff: number, jobTypes: readonly string[]): Promise<Array<{ id: string; project_id: string; user_id: string; job_type: string; parent_job_id: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, job_type, parent_job_id
       FROM ${this.tableName}
       WHERE job_type = ANY($1) AND status = 'running' AND created_at < $2`,
      [jobTypes as readonly string[], cutoff],
    );
    return result.rows;
  }

  /** 兜底查询：所有超时的 running 任务（排除已处理的 ID） */
  async findStuckCatchAllJobs(cutoff: number, excludeIds: string[]): Promise<Array<{ id: string; job_type: string; user_id: string; parent_job_id: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, job_type, user_id, parent_job_id
       FROM ${this.tableName}
       WHERE status = 'running' AND created_at < $1
         AND NOT (id = ANY($2))
       ORDER BY created_at ASC
       LIMIT 50`,
      [cutoff, excludeIds.length > 0 ? excludeIds : ["__none__"]],
    );
    return result.rows;
  }
}
