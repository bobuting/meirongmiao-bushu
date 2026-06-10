/**
 * 换装分镜视频 PG 仓库
 *
 * 操作 nrm_outfit_segment_videos 表
 * 支持并发写入、单条状态追踪、重试机制
 */

import type { Pool, PoolClient } from "pg";
import type { SegmentVideoStatus } from "../../contracts/outfit-change-contract.js";
import type { KeyframeThumbnail } from "../../utils/video-split.js";
import { PgBaseRepository } from "./base-pg-repository.js";
import { nrm } from "./base-pg-repository.js";

/** 分镜视频记录 */
export interface SegmentVideoRecord {
  id: string;
  taskId: string;
  segmentIndex: number;
  videoUrl: string | null;
  /** video-edit 模式：切片视频 URL（源视频片段） */
  sourceVideoUrl: string | null;
  /** video-edit 模式：切片视频关键帧截图 URL 数组 */
  sourceVideoThumbnails: KeyframeThumbnail[];
  /** video-edit 模式：参考图 URL */
  referenceImageUrl: string | null;
  duration: number | null;
  status: SegmentVideoStatus;
  errorMessage: string | null;
  retryCount: number;
  processingTimeMs: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 分镜视频仓储接口 */
export interface ISegmentVideoRepository {
  /** 创建分镜视频记录 */
  create(taskId: string, segmentIndex: number, status?: SegmentVideoStatus): Promise<SegmentVideoRecord>;
  /** 根据 ID 查找 */
  findById(id: string): Promise<SegmentVideoRecord | null>;
  /** 根据 taskId 和 segmentIndex 查找 */
  findByTaskAndSegment(taskId: string, segmentIndex: number): Promise<SegmentVideoRecord | null>;
  /** 根据 taskId 查找所有视频 */
  findByTaskId(taskId: string): Promise<SegmentVideoRecord[]>;
  /** 更新状态 */
  updateStatus(id: string, status: SegmentVideoStatus, errorMessage?: string): Promise<void>;
  /** 更新视频 URL 和时长 */
  updateVideo(id: string, videoUrl: string, duration: number, processingTimeMs?: number): Promise<void>;
  /** video-edit 模式：更新切片视频 URL 和参考图 URL */
  updateSourceAndReference(id: string, sourceVideoUrl: string, referenceImageUrl: string): Promise<void>;
  /** video-edit 模式：仅更新切片视频 URL */
  updateSourceVideo(id: string, sourceVideoUrl: string): Promise<void>;
  /** video-edit 模式：更新切片视频 URL 和截图数组 */
  updateSourceVideoWithThumbnails(id: string, sourceVideoUrl: string, thumbnails: KeyframeThumbnail[]): Promise<void>;
  /** video-edit 模式：仅更新参考图 URL */
  updateReferenceImage(id: string, referenceImageUrl: string): Promise<void>;
  /** 增加重试次数 */
  incrementRetryCount(id: string): Promise<void>;
  /** 统计 taskId 下的完成数量 */
  countCompletedByTaskId(taskId: string): Promise<number>;
  /** video-edit 模式：统计 taskId 下已准备好源视频的数量 */
  countSourceReadyByTaskId(taskId: string): Promise<number>;
  /** 统计 taskId 下的总数 */
  countByTaskId(taskId: string): Promise<number>;
  /** 批量创建分镜视频记录（预分配） */
  batchCreate(taskId: string, segmentCount: number): Promise<SegmentVideoRecord[]>;
}

/** 分镜视频 PG 仓储实现 */
export class PgSegmentVideoRepository extends PgBaseRepository<SegmentVideoRecord> implements ISegmentVideoRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("outfit_segment_videos"), client);
  }

  /** 从数据库行映射到实体 */
  protected mapRow(row: Record<string, unknown>): SegmentVideoRecord {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      segmentIndex: row.segment_index as number,
      videoUrl: row.video_url as string | null,
      sourceVideoUrl: row.source_video_url as string | null,
      sourceVideoThumbnails: (row.source_video_thumbnails as KeyframeThumbnail[]) || [],
      referenceImageUrl: row.reference_image_url as string | null,
      duration: row.duration as number | null,
      status: row.status as SegmentVideoStatus,
      errorMessage: row.error_message as string | null,
      retryCount: row.retry_count as number,
      processingTimeMs: row.processing_time_ms as number | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  /** 从实体映射到数据库行 */
  protected mapEntity(record: SegmentVideoRecord): Record<string, unknown> {
    return {
      id: record.id,
      task_id: record.taskId,
      segment_index: record.segmentIndex,
      video_url: record.videoUrl,
      source_video_url: record.sourceVideoUrl,
      source_video_thumbnails: record.sourceVideoThumbnails,
      reference_image_url: record.referenceImageUrl,
      duration: record.duration,
      status: record.status,
      error_message: record.errorMessage,
      retry_count: record.retryCount,
      processing_time_ms: record.processingTimeMs,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  /** 创建分镜视频记录 */
  async create(taskId: string, segmentIndex: number, status: SegmentVideoStatus = "pending"): Promise<SegmentVideoRecord> {
    const now = Date.now();
    const id = `sv_${taskId}_${segmentIndex}`;
    const data = {
      id,
      task_id: taskId,
      segment_index: segmentIndex,
      video_url: null,
      duration: null,
      status,
      error_message: null,
      retry_count: 0,
      processing_time_ms: null,
      created_at: now,
      updated_at: now,
    };

    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);

    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  /** 根据 ID 查找 */
  async findById(id: string): Promise<SegmentVideoRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据 taskId 和 segmentIndex 查找 */
  async findByTaskAndSegment(taskId: string, segmentIndex: number): Promise<SegmentVideoRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE task_id = $1 AND segment_index = $2 LIMIT 1`,
      [taskId, segmentIndex],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据 taskId 查找所有视频 */
  async findByTaskId(taskId: string): Promise<SegmentVideoRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE task_id = $1 ORDER BY segment_index ASC`,
      [taskId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 更新状态 */
  async updateStatus(id: string, status: SegmentVideoStatus, errorMessage?: string): Promise<void> {
    const now = Date.now();
    if (errorMessage) {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET status = $1, error_message = $2, updated_at = $3 WHERE id = $4`,
        [status, errorMessage, now, id],
      );
    } else {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET status = $1, updated_at = $2 WHERE id = $3`,
        [status, now, id],
      );
    }
  }

  /** 更新视频 URL 和时长 */
  async updateVideo(id: string, videoUrl: string, duration: number, processingTimeMs?: number): Promise<void> {
    const now = Date.now();
    if (processingTimeMs) {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET video_url = $1, duration = $2, status = 'completed', processing_time_ms = $3, updated_at = $4 WHERE id = $5`,
        [videoUrl, duration, processingTimeMs, now, id],
      );
    } else {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET video_url = $1, duration = $2, status = 'completed', updated_at = $3 WHERE id = $4`,
        [videoUrl, duration, now, id],
      );
    }
  }

  /** video-edit 模式：更新切片视频 URL 和参考图 URL */
  async updateSourceAndReference(id: string, sourceVideoUrl: string, referenceImageUrl: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET source_video_url = $1, reference_image_url = $2, status = 'ready', updated_at = $3 WHERE id = $4`,
      [sourceVideoUrl, referenceImageUrl, now, id],
    );
  }

  /** video-edit 模式：仅更新切片视频 URL（切片完成后立即存储，前端可显示截图） */
  async updateSourceVideo(id: string, sourceVideoUrl: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET source_video_url = $1, updated_at = $2 WHERE id = $3`,
      [sourceVideoUrl, now, id],
    );
  }

  /** video-edit 模式：更新切片视频 URL 和截图数组 */
  async updateSourceVideoWithThumbnails(id: string, sourceVideoUrl: string, thumbnails: KeyframeThumbnail[]): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET source_video_url = $1, source_video_thumbnails = $2, updated_at = $3 WHERE id = $4`,
      [sourceVideoUrl, JSON.stringify(thumbnails), now, id],
    );
  }

  /** video-edit 模式：仅更新参考图 URL */
  async updateReferenceImage(id: string, referenceImageUrl: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET reference_image_url = $1, status = 'ready', updated_at = $2 WHERE id = $3`,
      [referenceImageUrl, now, id],
    );
  }

  /** 增加重试次数（仅允许从 failed/timeout 状态重试，防止 completed 被回退） */
  async incrementRetryCount(id: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET retry_count = retry_count + 1, status = 'pending', error_message = null, updated_at = $1 WHERE id = $2 AND status IN ('failed', 'timeout', 'pending')`,
      [now, id],
    );
  }

  /** 统计 taskId 下的完成数量 */
  async countCompletedByTaskId(taskId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE task_id = $1 AND status = 'completed'`,
      [taskId],
    );
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  /** video-edit 模式：统计 taskId 下已准备好源视频的数量 */
  async countSourceReadyByTaskId(taskId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE task_id = $1 AND status = 'ready' AND source_video_url IS NOT NULL`,
      [taskId],
    );
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  /** 统计 taskId 下的总数 */
  async countByTaskId(taskId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE task_id = $1`,
      [taskId],
    );
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  /** 批量创建分镜视频记录（预分配） */
  async batchCreate(taskId: string, segmentCount: number): Promise<SegmentVideoRecord[]> {
    const now = Date.now();
    const records: SegmentVideoRecord[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const id = `sv_${taskId}_${i}`;
      records.push({
        id,
        taskId,
        segmentIndex: i,
        videoUrl: null,
        sourceVideoUrl: null,
        sourceVideoThumbnails: [],
        referenceImageUrl: null,
        duration: null,
        status: "pending",
        errorMessage: null,
        retryCount: 0,
        processingTimeMs: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const values = records.map((r) => [
      r.id,
      r.taskId,
      r.segmentIndex,
      r.videoUrl,
      r.sourceVideoUrl,
      JSON.stringify(r.sourceVideoThumbnails),
      r.referenceImageUrl,
      r.duration,
      r.status,
      r.errorMessage,
      r.retryCount,
      r.processingTimeMs,
      r.createdAt,
      r.updatedAt,
    ]);

    const placeholders = values
      .map((_, i) => `($${i * 14 + 1}, $${i * 14 + 2}, $${i * 14 + 3}, $${i * 14 + 4}, $${i * 14 + 5}, $${i * 14 + 6}, $${i * 14 + 7}, $${i * 14 + 8}, $${i * 14 + 9}, $${i * 14 + 10}, $${i * 14 + 11}, $${i * 14 + 12}, $${i * 14 + 13}, $${i * 14 + 14})`)
      .join(", ");

    const flatValues = values.flat();

    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, task_id, segment_index, video_url, source_video_url, source_video_thumbnails, reference_image_url, duration, status, error_message, retry_count, processing_time_ms, created_at, updated_at) VALUES ${placeholders} RETURNING *`,
      flatValues,
    );

    return result.rows.map((row) => this.mapRow(row));
  }
}