/**
 * 镜像视频 PG 仓库
 * 处理 nrm_mirror_videos 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 镜像视频记录（最小字段） */
export interface MirrorVideoRecord {
  id: string;
  projectId: string;
  status: string;
}

export class PgMirrorVideoRepository extends PgBaseRepository<MirrorVideoRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("mirror_videos"), client);
  }

  protected mapRow(row: Record<string, unknown>): MirrorVideoRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      status: (row.status as string) ?? "pending",
    };
  }

  protected mapEntity(entity: MirrorVideoRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.projectId,
      status: entity.status,
    };
  }

  /** 统计项目的镜像视频数量 */
  async countByProjectId(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
