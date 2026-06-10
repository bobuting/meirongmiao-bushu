/**
 * 动作迁移任务 PostgreSQL Repository
 *
 * 任务 CRUD 操作
 */

import type { Pool, PoolClient } from "pg";
import type {
  ActionTransferTaskRecord,
  CreateActionTransferTaskInput,
  UpdateActionTransferTaskInput,
  ActionTransferStatus,
  ImageDetectResult,
  ErrorStage,
} from "../../contracts/action-transfer-contract.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("action-transfer-tasks-repository");

// ---------------------------------------------------------------------------
// 创建任务
// ---------------------------------------------------------------------------

/**
 * 创建动作迁移任务
 */
export async function createActionTransferTask(
  pool: Pool | PoolClient,
  input: CreateActionTransferTaskInput,
  now: number
,
  client?: PoolClient,): Promise<ActionTransferTaskRecord> {
  // 生成任务 ID
  const taskId = `at_${require("node:crypto").randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const sql = `
    INSERT INTO nrm_action_transfer_tasks (
      task_id, project_id, user_id, status,
      action_source_type, source_video_url, builtin_template_id,
      target_image_url, prompt, duration_sec, background_mode,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    RETURNING *
  `;

  const values = [
    taskId,
    input.projectId,
    input.userId,
    "pending",
    input.actionSourceType,
    input.sourceVideoUrl ?? null,
    input.builtinTemplateId ?? null,
    input.targetImageUrl,
    input.prompt ?? null,
    input.durationSec ?? 0,
    input.backgroundMode ?? "image",
    now,
    now,
  ];

  const result = await (client ?? pool).query(sql, values);
  const row = result.rows[0];

  log.info({ taskId, projectId: input.projectId, userId: input.userId }, "创建动作迁移任务");

  return mapRowToRecord(row);
}

// ---------------------------------------------------------------------------
// 查询任务详情
// ---------------------------------------------------------------------------

/**
 * 查询任务详情（按 taskId）
 */
export async function findActionTransferTaskById(
  pool: Pool | PoolClient,
  taskId: string
,
  client?: PoolClient,): Promise<ActionTransferTaskRecord | null> {
  const sql = `SELECT * FROM nrm_action_transfer_tasks WHERE task_id = $1`;
  const result = await (client ?? pool).query(sql, [taskId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRecord(result.rows[0]);
}

/**
 * 查询任务详情（按 projectId）
 */
export async function findActionTransferTaskByProjectId(
  pool: Pool | PoolClient,
  projectId: string
,
  client?: PoolClient,): Promise<ActionTransferTaskRecord | null> {
  const sql = `SELECT * FROM nrm_action_transfer_tasks WHERE project_id = $1`;
  const result = await (client ?? pool).query(sql, [projectId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRecord(result.rows[0]);
}

// ---------------------------------------------------------------------------
// 更新任务状态
// ---------------------------------------------------------------------------

/**
 * 更新任务状态
 */
export async function updateActionTransferTaskStatus(
  pool: Pool | PoolClient,
  taskId: string,
  status: ActionTransferStatus,
  now: number
,
  client?: PoolClient,): Promise<void> {
  const sql = `
    UPDATE nrm_action_transfer_tasks
    SET status = $2, updated_at = $3
    WHERE task_id = $1
  `;
  await (client ?? pool).query(sql, [taskId, status, now]);

  log.debug({ taskId, status }, "更新任务状态");
}

// ---------------------------------------------------------------------------
// 更新任务字段（部分更新）
// ---------------------------------------------------------------------------

/**
 * 更新任务字段（部分更新）
 */
export async function updateActionTransferTaskFields(
  pool: Pool | PoolClient,
  taskId: string,
  input: UpdateActionTransferTaskInput,
  now: number
,
  client?: PoolClient,): Promise<void> {
  // 构建 UPDATE 字段
  const updates: string[] = [];
  const values: (string | number | boolean | object | null)[] = [];
  let paramIndex = 1;

  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex}`);
    values.push(input.status);
    paramIndex++;
  }

  if (input.imageValid !== undefined) {
    updates.push(`image_valid = $${paramIndex}`);
    values.push(input.imageValid);
    paramIndex++;
  }

  if (input.imageCheckResult !== undefined) {
    updates.push(`image_check_result = $${paramIndex}`);
    values.push(input.imageCheckResult ?? null);
    paramIndex++;
  }

  if (input.templateId !== undefined) {
    updates.push(`template_id = $${paramIndex}`);
    values.push(input.templateId ?? null);
    paramIndex++;
  }

  if (input.templateDurationSec !== undefined) {
    updates.push(`template_duration_sec = $${paramIndex}`);
    values.push(input.templateDurationSec ?? null);
    paramIndex++;
  }

  if (input.resultVideoUrl !== undefined) {
    updates.push(`result_video_url = $${paramIndex}`);
    values.push(input.resultVideoUrl ?? null);
    paramIndex++;
  }

  if (input.resultDurationSec !== undefined) {
    updates.push(`result_duration_sec = $${paramIndex}`);
    values.push(input.resultDurationSec ?? null);
    paramIndex++;
  }

  if (input.resultWidth !== undefined) {
    updates.push(`result_width = $${paramIndex}`);
    values.push(input.resultWidth ?? null);
    paramIndex++;
  }

  if (input.resultHeight !== undefined) {
    updates.push(`result_height = $${paramIndex}`);
    values.push(input.resultHeight ?? null);
    paramIndex++;
  }

  if (input.errorMessage !== undefined) {
    updates.push(`error_message = $${paramIndex}`);
    values.push(input.errorMessage ?? null);
    paramIndex++;
  }

  if (input.errorStage !== undefined) {
    updates.push(`error_stage = $${paramIndex}`);
    values.push(input.errorStage ?? null);
    paramIndex++;
  }

  if (input.asyncJobId !== undefined) {
    updates.push(`async_job_id = $${paramIndex}`);
    values.push(input.asyncJobId ?? null);
    paramIndex++;
  }

  if (updates.length === 0) {
    return;
  }

  updates.push(`updated_at = $${paramIndex}`);
  values.push(now);
  paramIndex++;

  values.push(taskId);

  const sql = `
    UPDATE nrm_action_transfer_tasks
    SET ${updates.join(", ")}
    WHERE task_id = $${paramIndex}
  `;

  await (client ?? pool).query(sql, values);

  log.debug({ taskId, fields: Object.keys(input) }, "更新任务字段");
}

// ---------------------------------------------------------------------------
// 查询任务列表
// ---------------------------------------------------------------------------

/**
 * 查询任务列表（按用户）
 */
export async function queryActionTransferTasksByUser(
  pool: Pool | PoolClient,
  userId: string,
  params: { limit?: number; offset?: number; status?: ActionTransferStatus } = {}
,
  client?: PoolClient,): Promise<{ items: ActionTransferTaskRecord[]; total: number }> {
  const { limit = 50, offset = 0, status } = params;

  const conditions = [`user_id = $1`];
  const values: (string | number)[] = [userId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // 查询总数
  const countSql = `SELECT COUNT(*) FROM nrm_action_transfer_tasks ${whereClause}`;
  const countResult = await (client ?? pool).query(countSql, values.slice(0, paramIndex - 1));
  const total = parseInt(countResult.rows[0].count, 10);

  // 查询列表
  const listSql = `
    SELECT * FROM nrm_action_transfer_tasks
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  values.push(limit, offset);

  const listResult = await (client ?? pool).query(listSql, values);

  return {
    items: listResult.rows.map(mapRowToRecord),
    total,
  };
}

// ---------------------------------------------------------------------------
// 删除任务
// ---------------------------------------------------------------------------

/**
 * 删除任务（物理删除）
 */
export async function deleteActionTransferTask(
  pool: Pool | PoolClient,
  taskId: string
,
  client?: PoolClient,): Promise<boolean> {
  const sql = `DELETE FROM nrm_action_transfer_tasks WHERE task_id = $1`;
  const result = await (client ?? pool).query(sql, [taskId]);

  const deleted = (result.rowCount ?? 0) > 0;
  log.info({ taskId, deleted }, "删除任务");

  return deleted;
}

// ---------------------------------------------------------------------------
// 行映射函数
// ---------------------------------------------------------------------------

/**
 * 将数据库行映射为 ActionTransferTaskRecord
 */
function mapRowToRecord(row: Record<string, unknown>): ActionTransferTaskRecord {
  return {
    taskId: row.task_id as string,
    projectId: row.project_id as string,
    userId: row.user_id as string,
    status: row.status as ActionTransferStatus,

    actionSourceType: row.action_source_type as "upload_video" | "builtin_template",
    sourceVideoUrl: row.source_video_url as string | undefined,
    builtinTemplateId: row.builtin_template_id as string | undefined,
    targetImageUrl: row.target_image_url as string,

    prompt: row.prompt as string | undefined,
    durationSec: row.duration_sec as number,
    backgroundMode: row.background_mode as "image" | "video",

    imageValid: row.image_valid as boolean | undefined,
    imageCheckResult: row.image_check_result as ImageDetectResult | undefined,
    templateId: row.template_id as string | undefined,
    templateDurationSec: row.template_duration_sec as number | undefined,

    resultVideoUrl: row.result_video_url as string | undefined,
    resultDurationSec: row.result_duration_sec as number | undefined,
    resultWidth: row.result_width as number | undefined,
    resultHeight: row.result_height as number | undefined,

    errorMessage: row.error_message as string | undefined,
    errorStage: row.error_stage as ErrorStage | undefined,

    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    asyncJobId: row.async_job_id as string | undefined,
  };
}