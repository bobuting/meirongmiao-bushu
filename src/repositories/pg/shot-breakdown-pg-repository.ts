/**
 * 镜头分镜数据 PG 仓库
 * 操作 nrm_shot_breakdown 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type { ShotBreakdownItem } from "../../contracts/shot-breakdown-contract.js";

/** 镜头数据实体 */
export interface ShotBreakdown {
  id: string;
  scriptDataId: string;
  shotIndex: number;
  shotType: string | null;
  cameraMovement: string | null;
  shotDescription: string | null;
  timecodeStart: string | null;
  timecodeEnd: string | null;
  durationSeconds: number | null;
  transitionJson: Record<string, unknown> | null;
  cameraDetailsJson: Record<string, unknown> | null;
  visualJson: Record<string, unknown> | null;
  subjectsJson: unknown[] | null;
  audioJson: Record<string, unknown> | null;
  textElementsJson: unknown[] | null;
  speedEffectsJson: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

/** 镜头原始数据（来自 VideoScriptPayload.shot_breakdown，统一使用 ShotBreakdownItem） */
export type ShotBreakdownRaw = ShotBreakdownItem;

/** 批量插入参数 */
export interface BatchInsertParams {
  scriptDataId: string;
  shots: ShotBreakdownRaw[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 镜头分镜 Repository
 */
export class PgShotBreakdownRepository extends PgBaseRepository<ShotBreakdown> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("shot_breakdown"), client);
  }

  protected mapRow(row: Record<string, unknown>): ShotBreakdown {
    return {
      id: row.id as string,
      scriptDataId: row.script_data_id as string,
      shotIndex: row.shot_index as number,
      shotType: row.shot_type as string | null,
      cameraMovement: row.camera_movement as string | null,
      shotDescription: row.shot_description as string | null,
      timecodeStart: row.timecode_start as string | null,
      timecodeEnd: row.timecode_end as string | null,
      durationSeconds: row.duration_seconds as number | null,
      transitionJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.transition_json),
      cameraDetailsJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.camera_details_json),
      visualJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.visual_json),
      subjectsJson: PgBaseRepository.fromJsonb<unknown[]>(row.subjects_json),
      audioJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.audio_json),
      textElementsJson: PgBaseRepository.fromJsonb<unknown[]>(row.text_elements_json),
      speedEffectsJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.speed_effects_json),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: ShotBreakdown): Record<string, unknown> {
    return {
      id: entity.id,
      script_data_id: entity.scriptDataId,
      shot_index: entity.shotIndex,
      shot_type: entity.shotType,
      camera_movement: entity.cameraMovement,
      shot_description: entity.shotDescription,
      timecode_start: entity.timecodeStart,
      timecode_end: entity.timecodeEnd,
      duration_seconds: entity.durationSeconds,
      transition_json: PgBaseRepository.toJsonb(entity.transitionJson),
      camera_details_json: PgBaseRepository.toJsonb(entity.cameraDetailsJson),
      visual_json: PgBaseRepository.toJsonb(entity.visualJson),
      subjects_json: PgBaseRepository.toJsonb(entity.subjectsJson),
      audio_json: PgBaseRepository.toJsonb(entity.audioJson),
      text_elements_json: PgBaseRepository.toJsonb(entity.textElementsJson),
      speed_effects_json: PgBaseRepository.toJsonb(entity.speedEffectsJson),
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 根据脚本 ID 查询所有镜头 */
  async findByScriptDataId(scriptDataId: string): Promise<ShotBreakdown[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE script_data_id = $1 ORDER BY shot_index`,
      [scriptDataId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据脚本 ID 查询镜头列表（摘要字段） */
  async findSummaryByScriptDataId(scriptDataId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, shot_index, shot_type, shot_description, duration_seconds,
              visual_json, subjects_json, text_elements_json
       FROM ${this.tableName}
       WHERE script_data_id = $1
       ORDER BY shot_index`,
      [scriptDataId],
    );
    return result.rows;
  }

  /** 根据脚本 ID 查询镜头列表（完整字段，返回原始行） */
  async findByScriptDataIdFull(scriptDataId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT shot_index, shot_type, camera_movement, shot_description,
              timecode_start, timecode_end, duration_seconds, transition_json,
              camera_details_json, visual_json, subjects_json, audio_json,
              text_elements_json, speed_effects_json
       FROM ${this.tableName}
       WHERE script_data_id = $1
       ORDER BY shot_index`,
      [scriptDataId],
    );
    return result.rows;
  }

  /** 根据脚本 ID 前缀模糊查询所有镜头（用于 library-video-{id}-{ts} 格式匹配） */
  async findByScriptDataIdPrefix(scriptDataId: string): Promise<ShotBreakdown[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE script_data_id LIKE $1 ORDER BY shot_index`,
      [`%-${scriptDataId}-%`],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 批量插入镜头数据 */
  async batchInsert(params: BatchInsertParams): Promise<number> {
    if (params.shots.length === 0) return 0;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (let i = 0; i < params.shots.length; i++) {
      const shot = params.shots[i];
      // shot_id 缺失时使用数组索引作为默认值（从1开始）
      const shotId = shot.shot_id ?? (i + 1);
      const id = `${params.scriptDataId}-shot-${shotId}`;
      const transitionJson = shot.transition_in || shot.transition_out
        ? { in: shot.transition_in, out: shot.transition_out }
        : null;

      // 数据类型归一化：确保存储正确的类型
      // 1. duration_seconds 必须为数字类型（数据库列：numeric(6)）
      let normalizedDurationSeconds: number | null = null;
      if (shot.timecode?.duration_seconds != null) {
        const rawDuration = shot.timecode.duration_seconds;
        if (typeof rawDuration === 'number') {
          normalizedDurationSeconds = rawDuration;
        } else if (typeof rawDuration === 'string') {
          const parsed = parseFloat(rawDuration);
          normalizedDurationSeconds = Number.isFinite(parsed) ? parsed : null;
        }
      }

      // 2. audio JSON 中 sound_effects 必须为数组（Zod Schema 要求）
      let normalizedAudio: Record<string, unknown> | null = null;
      if (shot.audio) {
        normalizedAudio = {
          ...shot.audio,
          sound_effects: shot.audio.sound_effects ?? [],
        };
      }

      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}::jsonb, $${paramIndex + 10}::jsonb, $${paramIndex + 11}::jsonb, $${paramIndex + 12}::jsonb, $${paramIndex + 13}::jsonb, $${paramIndex + 14}::jsonb, $${paramIndex + 15}::jsonb, $${paramIndex + 16}, $${paramIndex + 17})`
      );

      values.push(
        id,
        params.scriptDataId,
        shotId,
        shot.shot_type ?? null,
        shot.camera_movement ?? null,
        shot.shot_description ?? null,
        shot.timecode?.start ?? null,
        shot.timecode?.end ?? null,
        normalizedDurationSeconds,
        transitionJson ? JSON.stringify(transitionJson) : null,
        shot.camera_details ? JSON.stringify(shot.camera_details) : null,
        shot.visual ? JSON.stringify(shot.visual) : null,
        shot.subjects ? JSON.stringify(shot.subjects) : null,
        normalizedAudio ? JSON.stringify(normalizedAudio) : null,
        shot.text_elements ? JSON.stringify(shot.text_elements) : null,
        shot.speed_effects ? JSON.stringify(shot.speed_effects) : null,
        params.createdAt,
        params.updatedAt,
      );

      paramIndex += 18;
    }

    const query = `
      INSERT INTO ${this.tableName} (
        id, script_data_id, shot_index, shot_type, camera_movement, shot_description,
        timecode_start, timecode_end, duration_seconds,
        transition_json, camera_details_json, visual_json, subjects_json, audio_json,
        text_elements_json, speed_effects_json, created_at, updated_at
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (id) DO NOTHING
    `;

    const result = await this.queryClient.query(query, values);
    return result.rowCount ?? 0;
  }

  /** 删除脚本的所有镜头 */
  async deleteByScriptDataId(scriptDataId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE script_data_id = $1`,
      [scriptDataId],
    );
  }

  /** 根据多个脚本 ID 批量查询镜头（用于 N+1 优化） */
  async findByScriptDataIds(scriptDataIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
    if (scriptDataIds.length === 0) return new Map();
    const result = await this.queryClient.query(
      `SELECT
        script_data_id,
        shot_index, shot_type, camera_movement, shot_description,
        timecode_start, timecode_end, duration_seconds,
        transition_json, camera_details_json, visual_json,
        subjects_json, audio_json, text_elements_json, speed_effects_json
       FROM ${this.tableName}
       WHERE script_data_id = ANY($1)
       ORDER BY script_data_id, shot_index ASC`,
      [scriptDataIds],
    );
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const row of result.rows) {
      const scriptId = row.script_data_id as string;
      if (!grouped.has(scriptId)) {
        grouped.set(scriptId, []);
      }
      grouped.get(scriptId)!.push(row);
    }
    return grouped;
  }

  /** 统计脚本的镜头数量 */
  async countByScriptDataId(scriptDataId: string): Promise<number> {
    const result = await this.queryClient.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE script_data_id = $1`,
      [scriptDataId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}