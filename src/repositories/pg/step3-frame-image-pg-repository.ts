/**
 * Step3 分镜图片 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 批次数据结构 */
export interface Step3FrameImageBatch {
  batch_id: string;
  ratio?: string;
  resolution?: string;
  job_id?: string;
  status: "pending" | "running" | "succeeded" | "failed";
  created_at: number;
  images: Array<{
    image_url: string;
    image_index: number;
  }>;
}

/** 分镜图片完整记录 */
export interface Step3FrameImageRecord {
  id: string;
  project_id: string;
  user_id: string;
  shot_breakdown_id: string | null;
  frame_index: number;
  script_data_id: string | null;
  image_prompt: string | null;
  batches: Step3FrameImageBatch[];
  selected_batch_id: string | null;
  selected_image_url: string | null;
  selected_image_index: number;
  /** 帧状态: pending/running/succeeded/failed */
  status: "pending" | "running" | "succeeded" | "failed";
  created_at: number;
  updated_at: number;
}

/** 追加批次参数 */
export interface AppendBatchParams {
  project_id: string;
  user_id: string;
  frame_index: number;
  image_prompt?: string | null;
  batch: Step3FrameImageBatch;
  select_first?: boolean;
}

/** 选择图片参数 */
export interface SelectImageParams {
  project_id: string;
  frame_index: number;
  selected_batch_id: string;
  selected_image_url: string;
  selected_image_index: number;
}

export class PgStep3FrameImageRepository extends PgBaseRepository<Step3FrameImageRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("step3_frame_images"), client);
  }

  protected mapRow(row: Record<string, unknown>): Step3FrameImageRecord {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      user_id: row.user_id as string,
      shot_breakdown_id: row.shot_breakdown_id as string | null,
      frame_index: row.frame_index as number,
      script_data_id: row.script_data_id as string | null,
      image_prompt: row.image_prompt as string | null,
      batches: (row.batches as Step3FrameImageBatch[]) ?? [],
      selected_batch_id: row.selected_batch_id as string | null,
      selected_image_url: row.selected_image_url as string | null,
      selected_image_index: (row.selected_image_index as number) ?? 0,
      status: (row.status as Step3FrameImageRecord["status"]) ?? "pending",
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    };
  }

  protected mapEntity(entity: Step3FrameImageRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.project_id,
      user_id: entity.user_id,
      shot_breakdown_id: entity.shot_breakdown_id,
      frame_index: entity.frame_index,
      script_data_id: entity.script_data_id,
      image_prompt: entity.image_prompt,
      batches: entity.batches,
      selected_batch_id: entity.selected_batch_id,
      selected_image_url: entity.selected_image_url,
      selected_image_index: entity.selected_image_index,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  /** 按项目+帧序号查询 */
  async findByProjectAndFrame(projectId: string, frameIndex: number): Promise<Step3FrameImageRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1 AND frame_index = $2`,
      [projectId, frameIndex],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 按分镜ID查询 */
  async findByShotBreakdownId(shotBreakdownId: string): Promise<Step3FrameImageRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE shot_breakdown_id = $1`,
      [shotBreakdownId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 按 jobId 查询（扫描 batches JSONB 数组中的 job_id 字段） */
  async findByJobId(
    projectId: string,
    jobId: string,
  ): Promise<{ record: Step3FrameImageRecord; batch: Step3FrameImageBatch } | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1
         AND batches @> $2::jsonb
       ORDER BY frame_index ASC
       LIMIT 1`,
      [projectId, JSON.stringify([{ job_id: jobId }])],
    );

    if (!result.rows[0]) {
      return null;
    }

    const record = this.mapRow(result.rows[0]);
    const matchedBatch = record.batches.find((b) => b.job_id === jobId) ?? null;
    if (!matchedBatch) {
      return null;
    }

    return { record, batch: matchedBatch };
  }

  /** 按项目查询所有镜头图片 */
  async findByProjectId(projectId: string): Promise<Step3FrameImageRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY frame_index ASC`,
      [projectId],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /**
   * 追加批次（如果记录不存在则创建）
   * 按 project_id + frame_index 定位和更新
   */
  async appendBatch(params: AppendBatchParams): Promise<Step3FrameImageRecord> {
    const now = Date.now();
    const selectFirst = params.select_first ?? true;

    const existing = await this.findByProjectAndFrame(params.project_id, params.frame_index);

    if (existing) {
      // 追加批次到已有记录
      const updatedBatches = [...existing.batches, params.batch];
      const selectedBatchId = selectFirst ? params.batch.batch_id : existing.selected_batch_id;
      const selectedImageUrl = selectFirst
        ? (params.batch.images[0]?.image_url ?? existing.selected_image_url)
        : existing.selected_image_url;
      const selectedIndex = selectFirst ? 0 : existing.selected_image_index;

      const result = await this.queryClient.query(
        `UPDATE ${this.tableName}
         SET batches = $1,
             selected_batch_id = $2,
             selected_image_url = $3,
             selected_image_index = $4,
             image_prompt = COALESCE($5, image_prompt),
             updated_at = $6
         WHERE project_id = $7 AND frame_index = $8
         RETURNING *`,
        [
          JSON.stringify(updatedBatches),
          selectedBatchId,
          selectedImageUrl,
          selectedIndex,
          params.image_prompt ?? null,
          now,
          params.project_id,
          params.frame_index,
        ],
      );
      return this.mapRow(result.rows[0]);
    }

    // 创建新记录
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        project_id, user_id, shot_breakdown_id, frame_index,
        script_data_id, image_prompt,
        batches, selected_batch_id, selected_image_url, selected_image_index,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        params.project_id,
        params.user_id,
        null,
        params.frame_index,
        null,
        params.image_prompt ?? null,
        JSON.stringify([params.batch]),
        selectFirst ? params.batch.batch_id : null,
        selectFirst ? (params.batch.images[0]?.image_url ?? null) : null,
        selectFirst ? 0 : 0,
        params.batch.status ?? "pending",
        now,
        now,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  /** 选择图片（更新选中状态） */
  async selectImage(params: SelectImageParams): Promise<Step3FrameImageRecord | null> {
    const now = Date.now();
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET selected_batch_id = $1,
           selected_image_url = $2,
           selected_image_index = $3,
           updated_at = $4
       WHERE project_id = $5 AND frame_index = $6
       RETURNING *`,
      [
        params.selected_batch_id,
        params.selected_image_url,
        params.selected_image_index,
        now,
        params.project_id,
        params.frame_index,
      ],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据图片 URL 选择图片（按 project_id + frame_index 查找） */
  async selectImageByProjectAndFrame(
    projectId: string,
    frameIndex: number,
    imageUrl: string,
  ): Promise<Step3FrameImageRecord | null> {
    const record = await this.findByProjectAndFrame(projectId, frameIndex);
    if (!record) {
      return null;
    }

    // 在所有批次中查找该图片
    for (const batch of record.batches) {
      const imageIndex = batch.images.findIndex(
        (img) => img.image_url === imageUrl,
      );
      if (imageIndex >= 0) {
        const now = Date.now();
        const result = await this.queryClient.query(
          `UPDATE ${this.tableName}
           SET selected_batch_id = $1,
               selected_image_url = $2,
               selected_image_index = $3,
               updated_at = $4
           WHERE project_id = $5 AND frame_index = $6
           RETURNING *`,
          [
            batch.batch_id,
            imageUrl,
            imageIndex,
            now,
            projectId,
            frameIndex,
          ],
        );
        return result.rows[0] ? this.mapRow(result.rows[0]) : null;
      }
    }

    // 图片不在任何批次中，直接更新 selected_image_url（兼容外部图片）
    const now = Date.now();
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET selected_image_url = $1,
           updated_at = $2
       WHERE project_id = $3 AND frame_index = $4
       RETURNING *`,
      [imageUrl, now, projectId, frameIndex],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据图片 URL 选择图片（按 shot_breakdown_id 查找） */
  async selectImageByUrl(
    shotBreakdownId: string,
    imageUrl: string,
  ): Promise<Step3FrameImageRecord | null> {
    const record = await this.findByShotBreakdownId(shotBreakdownId);
    if (!record) {
      return null;
    }

    // 在所有批次中查找该图片
    for (const batch of record.batches) {
      const imageIndex = batch.images.findIndex(
        (img) => img.image_url === imageUrl,
      );
      if (imageIndex >= 0) {
        const now = Date.now();
        const result = await this.queryClient.query(
          `UPDATE ${this.tableName}
           SET selected_batch_id = $1,
               selected_image_url = $2,
               selected_image_index = $3,
               updated_at = $4
           WHERE shot_breakdown_id = $5
           RETURNING *`,
          [
            batch.batch_id,
            imageUrl,
            imageIndex,
            now,
            shotBreakdownId,
          ],
        );
        return result.rows[0] ? this.mapRow(result.rows[0]) : null;
      }
    }

    // 图片不在任何批次中，直接更新 selected_image_url
    const now = Date.now();
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET selected_image_url = $1,
           updated_at = $2
       WHERE shot_breakdown_id = $3
       RETURNING *`,
      [imageUrl, now, shotBreakdownId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 按项目删除所有镜头图片 */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }

  /** 按项目查询分镜图片（按帧序排列） */
  async findByProject(projectId: string): Promise<Step3FrameImageRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY frame_index`,
      [projectId],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 按项目查询分镜图片原始行（仅 id, project_id, frame_index, selected_image_url） */
  async findRawStoryboardRows(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, frame_index, selected_image_url FROM ${this.tableName} WHERE project_id = $1 ORDER BY frame_index`,
      [projectId],
    );
    return result.rows;
  }

  /** 按项目+帧序号查询选中图片 URL */
  async findSelectedImageUrlByFrameIndex(projectId: string, frameIndex: number): Promise<string | null> {
    const result = await this.queryClient.query(
      `SELECT selected_image_url FROM ${this.tableName} WHERE project_id = $1 AND frame_index = $2 LIMIT 1`,
      [projectId, frameIndex],
    );
    return (result.rows[0]?.selected_image_url as string) ?? null;
  }

  /** 更新帧排序索引 */
  async updateFrameIndex(frameId: string, frameIndex: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET frame_index = $1 WHERE id = $2`,
      [frameIndex, frameId],
    );
  }

  /** 统计有成功预览图的帧数量（JSONB batches 条件查询） */
  async countFramesWithSucceededImages(projectId: string): Promise<number> {
    const result = await this.queryClient.query<{ count: string }>(
      `SELECT COUNT(DISTINCT frame_index) as count
       FROM ${this.tableName}
       WHERE project_id = $1
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(batches) as batch
           WHERE batch->>'status' = 'succeeded'
             AND jsonb_array_length(batch->'images') > 0
         )`,
      [projectId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** 更新批次数据、选中图片URL和状态 */
  async updateBatchesSelectionAndStatus(
    frameImageId: string,
    batchesJson: unknown,
    selectedImageUrl: string | null,
    status: string,
    updatedAt: number,
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET batches = $1, selected_image_url = $2, status = $3, updated_at = $4
       WHERE id = $5`,
      [JSON.stringify(batchesJson), selectedImageUrl, status, updatedAt, frameImageId],
    );
  }

  /** 更新批次数据和状态 */
  async updateBatchesAndStatus(
    frameImageId: string,
    batchesJson: unknown,
    status: string,
    updatedAt: number,
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET batches = $1, status = $2, updated_at = $3 WHERE id = $4`,
      [JSON.stringify(batchesJson), status, updatedAt, frameImageId],
    );
  }

  /** 更新批次数据和选中信息 */
  async updateBatchesAndSelection(
    frameImageId: string,
    batchesJson: unknown,
    selectedBatchId: string,
    selectedImageUrl: string | null,
    selectedImageIndex: number,
    updatedAt: number,
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET batches = $1, selected_batch_id = $2, selected_image_url = $3, selected_image_index = $4, updated_at = $5
       WHERE id = $6`,
      [JSON.stringify(batchesJson), selectedBatchId, selectedImageUrl, selectedImageIndex, updatedAt, frameImageId],
    );
  }

  /** 插入分镜帧 */
  async insertFrame(params: {
    id: string;
    projectId: string;
    frameIndex: number;
    selectedImageUrl: string;
    createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, project_id, frame_index, selected_image_url, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.id, params.projectId, params.frameIndex, params.selectedImageUrl, params.createdAt],
    );
  }

  /** 按 ID 查询分镜帧 */
  async findById(id: string): Promise<Step3FrameImageRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 更新选中图片 URL */
  async updateSelectedImageUrl(id: string, imageUrl: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET selected_image_url = $1 WHERE id = $2`,
      [imageUrl, id],
    );
  }

  /** 统计项目分镜数量（用于 VideoJobService 计算 totalClipCount） */
  async countByProjectId(projectId: string): Promise<number> {
    const result = await this.queryClient.query<{ cnt: number }>(
      "SELECT COUNT(*)::int AS cnt FROM nrm_step3_frame_images WHERE project_id = $1",
      [projectId],
    );
    return result.rows[0]?.cnt ?? 0;
  }
}
