/**
 * 管理员操作日志 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 管理员操作日志记录 */
export interface AdminOperationLogRecord {
  id: string;
  adminUserId: string;
  projectId: string;
  operationType: string;
  reason: string | null;
  createdAt: number;
}

export class PgAdminOperationLogRepository extends PgBaseRepository<AdminOperationLogRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("admin_operation_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): AdminOperationLogRecord {
    return {
      id: row.id as string,
      adminUserId: row.admin_user_id as string,
      projectId: row.project_id as string,
      operationType: row.operation_type as string,
      reason: row.reason as string | null,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(entity: AdminOperationLogRecord): Record<string, unknown> {
    return {
      id: entity.id,
      admin_user_id: entity.adminUserId,
      project_id: entity.projectId,
      operation_type: entity.operationType,
      reason: entity.reason ?? null,
      created_at: entity.createdAt,
    };
  }

  /** 创建操作日志 */
  async create(data: {
    adminUserId: string;
    projectId: string;
    operationType: string;
    reason: string;
    createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, admin_user_id, project_id, operation_type, reason, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [data.adminUserId, data.projectId, data.operationType, data.reason, data.createdAt],
    );
  }
}
