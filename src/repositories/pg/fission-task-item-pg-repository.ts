/**
 * 裂变任务条目 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ========== 类型定义 ==========

/** 任务类型 */
export type FissionTaskType = "image_video" | "new_story";

/** 分镜项状态 */
export type FissionItemStatus = "pending" | "processing" | "completed" | "failed";

/** 裂变任务条目记录 */
export interface FissionTaskItemRecord {
  id: string;
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
  imageUrl: string | null;
  imagePath: string | null;
  imageStatus: FissionItemStatus;
  imageErrorMessage: string | null;
  videoUrl: string | null;
  videoPath: string | null;
  videoStatus: FissionItemStatus;
  videoErrorMessage: string | null;
  videoTaskId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 创建分镜任务项输入 */
export interface CreateFissionTaskItemInput {
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
}

/** 更新图片状态输入 */
export interface UpdateImageStatusInput {
  imageUrl?: string;
  imagePath?: string;
  imageStatus: FissionItemStatus;
  imageErrorMessage?: string;
}

/** 更新视频状态输入 */
export interface UpdateVideoStatusInput {
  videoUrl?: string;
  videoPath?: string;
  videoStatus: FissionItemStatus;
  videoErrorMessage?: string;
  videoTaskId?: string | null;
}

/** 批量创建结果 */
export interface BatchCreateResult {
  created: number;
  skipped: number;
}

// ========== 数据库行类型 ==========

interface FissionTaskItemRow {
  id: string;
  fission_video_status_id: string;
  task_type: FissionTaskType;
  item_index: number;
  image_url: string | null;
  image_path: string | null;
  image_status: FissionItemStatus;
  image_error_message: string | null;
  video_url: string | null;
  video_path: string | null;
  video_status: FissionItemStatus;
  video_error_message: string | null;
  video_task_id: string | null;
  created_at: string;
  updated_at: string;
}

// ========== Repository ==========

export class PgFissionTaskItemRepository extends PgBaseRepository<FissionTaskItemRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("fission_task_items"), client);
  }

  protected mapRow(row: Record<string, unknown>): FissionTaskItemRecord {
    return {
      id: row.id as string,
      fissionVideoStatusId: row.fission_video_status_id as string,
      taskType: row.task_type as FissionTaskType,
      itemIndex: row.item_index as number,
      imageUrl: row.image_url as string | null,
      imagePath: row.image_path as string | null,
      imageStatus: row.image_status as FissionItemStatus,
      imageErrorMessage: row.image_error_message as string | null,
      videoUrl: row.video_url as string | null,
      videoPath: row.video_path as string | null,
      videoStatus: row.video_status as FissionItemStatus,
      videoErrorMessage: row.video_error_message as string | null,
      videoTaskId: row.video_task_id as string | null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: FissionTaskItemRecord): Record<string, unknown> {
    return {
      id: entity.id,
      fission_video_status_id: entity.fissionVideoStatusId,
      task_type: entity.taskType,
      item_index: entity.itemIndex,
      image_url: entity.imageUrl,
      image_path: entity.imagePath,
      image_status: entity.imageStatus,
      image_error_message: entity.imageErrorMessage,
      video_url: entity.videoUrl,
      video_path: entity.videoPath,
      video_status: entity.videoStatus,
      video_error_message: entity.videoErrorMessage,
      video_task_id: entity.videoTaskId,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  // ========== 基本查询 ==========

  /** 根据ID获取 */
  async getById(id: string): Promise<FissionTaskItemRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 按裂变视频状态 ID 查询任务条目 */
  async findByFissionStatusId(fissionStatusId: string): Promise<FissionTaskItemRecord[]> {
    return this.listByFissionStatusId(fissionStatusId);
  }

  /** 按裂变视频状态 ID 查询全部任务项（不分类型） */
  async listByFissionStatusId(fissionVideoStatusId: string): Promise<FissionTaskItemRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE fission_video_status_id = $1
       ORDER BY task_type, item_index`,
      [fissionVideoStatusId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 按裂变视频状态 ID 和任务类型查询 */
  async listByFissionStatusIdAndType(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
  ): Promise<FissionTaskItemRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE fission_video_status_id = $1 AND task_type = $2
       ORDER BY item_index`,
      [fissionVideoStatusId, taskType],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 获取待处理的分镜任务项（用于增量生成） */
  async listPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
  ): Promise<FissionTaskItemRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE fission_video_status_id = $1
         AND task_type = $2
         AND image_status != 'failed'
         AND (
           video_status = 'pending'
           OR (video_status = 'processing' AND video_task_id IS NOT NULL)
         )
       ORDER BY item_index`,
      [fissionVideoStatusId, taskType],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 获取失败的分镜任务项（用于重试） */
  async listFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
  ): Promise<FissionTaskItemRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE fission_video_status_id = $1
         AND task_type = $2
         AND (image_status = 'failed' OR video_status = 'failed')
       ORDER BY item_index`,
      [fissionVideoStatusId, taskType],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // ========== 创建 ==========

  /** 创建单个分镜任务项 */
  async create(input: CreateFissionTaskItemInput): Promise<FissionTaskItemRecord> {
    const id = randomUUID();
    const now = Date.now();
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, fission_video_status_id, task_type, item_index, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [id, input.fissionVideoStatusId, input.taskType, input.itemIndex, now],
    );
    return this.mapRow(result.rows[0]);
  }

  /** 批量创建分镜任务项（幂等，已存在则跳过） */
  async batchCreate(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    totalCount: number,
  ): Promise<BatchCreateResult> {
    let created = 0;
    let skipped = 0;
    for (let i = 1; i <= totalCount; i++) {
      try {
        await this.create({ fissionVideoStatusId, taskType, itemIndex: i });
        created++;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          skipped++;
        } else {
          throw error;
        }
      }
    }
    return { created, skipped };
  }

  /** 批量创建分镜任务项（指定 itemIndex 列表） */
  async batchCreateWithIndexes(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    indexes: number[],
  ): Promise<BatchCreateResult> {
    let created = 0;
    let skipped = 0;
    for (const itemIndex of indexes) {
      try {
        await this.create({ fissionVideoStatusId, taskType, itemIndex });
        created++;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          skipped++;
        } else {
          throw error;
        }
      }
    }
    return { created, skipped };
  }

  // ========== 更新 ==========

  /** 更新图片状态 */
  async updateImageStatus(id: string, input: UpdateImageStatusInput): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const updates: string[] = ["image_status = $2", "updated_at = $3"];
    const values: (string | number | null)[] = [id, input.imageStatus, now];
    let paramIndex = 4;

    if (input.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      values.push(input.imageUrl);
      paramIndex++;
    }
    if (input.imagePath !== undefined) {
      updates.push(`image_path = $${paramIndex}`);
      values.push(input.imagePath);
      paramIndex++;
    }
    if (input.imageErrorMessage !== undefined) {
      updates.push(`image_error_message = $${paramIndex}`);
      values.push(input.imageErrorMessage);
      paramIndex++;
    }

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  /** 更新视频状态 */
  async updateVideoStatus(id: string, input: UpdateVideoStatusInput): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const updates: string[] = ["video_status = $2", "updated_at = $3"];
    const values: (string | number | null)[] = [id, input.videoStatus, now];
    let paramIndex = 4;

    if (input.videoUrl !== undefined) {
      updates.push(`video_url = $${paramIndex}`);
      values.push(input.videoUrl);
      paramIndex++;
    }
    if (input.videoPath !== undefined) {
      updates.push(`video_path = $${paramIndex}`);
      values.push(input.videoPath);
      paramIndex++;
    }
    if (input.videoErrorMessage !== undefined) {
      updates.push(`video_error_message = $${paramIndex}`);
      values.push(input.videoErrorMessage);
      paramIndex++;
    }
    if (input.videoTaskId !== undefined) {
      updates.push(`video_task_id = $${paramIndex}`);
      values.push(input.videoTaskId);
      paramIndex++;
    }

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  /** 重置指定任务项的状态字段（用于恢复不一致数据） */
  async resetItemStatusFields(id: string, setClauses: string[]): Promise<void> {
    if (setClauses.length === 0) return;
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClauses.join(", ")}, updated_at = $1 WHERE id = $2`,
      [Date.now(), id],
    );
  }

  // ========== 删除 ==========

  /** 删除指定裂变状态的所有分镜任务项 */
  async deleteByFissionStatusId(fissionVideoStatusId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE fission_video_status_id = $1`,
      [fissionVideoStatusId],
    );
    return result.rowCount ?? 0;
  }

  // ========== 统计 ==========

  /** 统计指定裂变状态下已完成的任务项数量 */
  async countCompletedByStatusId(fissionStatusId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE fission_video_status_id = $1 AND status = 'completed'`,
      [fissionStatusId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** 按裂变视频状态 ID 和任务类型查询已完成且有视频URL的任务条目 */
  async findCompletedVideoUrls(
    fissionStatusId: string,
    taskType: string,
  ): Promise<Array<{ itemIndex: number; videoUrl: string }>> {
    const result = await this.queryClient.query(
      `SELECT item_index, video_url FROM ${this.tableName}
       WHERE fission_video_status_id = $1 AND task_type = $2 AND video_status = 'completed' AND video_url IS NOT NULL
       ORDER BY item_index`,
      [fissionStatusId, taskType],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      itemIndex: r.item_index as number,
      videoUrl: r.video_url as string,
    }));
  }
}
