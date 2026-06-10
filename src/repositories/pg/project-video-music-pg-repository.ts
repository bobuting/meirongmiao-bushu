/**
 * 项目-视频音乐关联 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type { ProjectVideoMusic } from "../../contracts/types.js";
import type {
  IProjectVideoMusicRepository,
  BatchSaveProjectVideoMusicInput,
  ProjectVideoMusicUpdatePatch,
} from "../../contracts/repository-ports/project-video-music-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { AppError } from "../../core/errors.js";

export class PgProjectVideoMusicRepository
  extends PgBaseRepository<ProjectVideoMusic>
  implements IProjectVideoMusicRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_video_musics"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectVideoMusic {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      musicId: row.music_id as string,
      musicUrl: row.music_url as string,
      volume: (row.volume ?? 0.5) as number,
      fadeInSec: (row.fade_in_sec ?? 0) as number,
      fadeOutSec: (row.fade_out_sec ?? 0) as number,
      isSelected: (row.is_selected ?? false) as boolean,
      title: (row.title ?? null) as string | null,
      atmospheres: (row.atmospheres ?? []) as string[],
      artist: (row.artist ?? null) as string | null,
      durationSec: (row.duration_sec ?? null) as number | null,
      coverUrl: (row.cover_url ?? null) as string | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(m: ProjectVideoMusic): Record<string, unknown> {
    return {
      id: m.id,
      project_id: m.projectId,
      music_id: m.musicId,
      music_url: m.musicUrl,
      volume: m.volume,
      fade_in_sec: m.fadeInSec,
      fade_out_sec: m.fadeOutSec,
      is_selected: m.isSelected,
      title: m.title,
      atmospheres: JSON.stringify(m.atmospheres ?? []),
      artist: m.artist,
      duration_sec: m.durationSec,
      cover_url: m.coverUrl,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    };
  }

  async listByProject(projectId: string): Promise<ProjectVideoMusic[]> {
    return this.findWhere({ project_id: projectId });
  }

  async getSelected(projectId: string): Promise<ProjectVideoMusic | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND is_selected = TRUE LIMIT 1`,
      [projectId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async batchSave(
    projectId: string,
    musics: BatchSaveProjectVideoMusicInput[],
    selectedMusicId?: string | null,
  ): Promise<ProjectVideoMusic[]> {
    const now = Date.now();

    // 1. 删除旧记录
    await this.deleteByProjectId(projectId);

    // 2. 批量插入新记录（最多 3 条）
    const maxCount = 3;
    const toInsert = musics.slice(0, maxCount);
    const inserted: ProjectVideoMusic[] = [];

    for (const music of toInsert) {
      const id = randomUUID();
      const isSelected = selectedMusicId === music.musicId;
      const record: ProjectVideoMusic = {
        id,
        projectId,
        musicId: music.musicId,
        musicUrl: music.musicUrl,
        volume: music.volume ?? 0.5,
        fadeInSec: music.fadeInSec ?? 0,
        fadeOutSec: music.fadeOutSec ?? 0,
        isSelected,
        title: music.title ?? null,
        atmospheres: music.atmospheres ?? [],
        artist: music.artist ?? null,
        durationSec: music.durationSec ?? null,
        coverUrl: music.coverUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await this.queryClient.query(
        `INSERT INTO ${this.tableName}
         (id, project_id, music_id, music_url, volume, fade_in_sec, fade_out_sec, is_selected,
          title, atmospheres, artist, duration_sec, cover_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          record.id,
          record.projectId,
          record.musicId,
          record.musicUrl,
          record.volume,
          record.fadeInSec,
          record.fadeOutSec,
          record.isSelected,
          record.title,
          JSON.stringify(record.atmospheres),
          record.artist,
          record.durationSec,
          record.coverUrl,
          record.createdAt,
          record.updatedAt,
        ],
      );

      inserted.push(record);
    }

    return inserted;
  }

  async select(projectId: string, id: string): Promise<ProjectVideoMusic> {
    const now = Date.now();

    // 1. 检查记录是否存在
    const record = await this.findById(id);
    if (!record || record.projectId !== projectId) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    // 2. 清除该项目所有 is_selected
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = FALSE, updated_at = $1 WHERE project_id = $2`,
      [now, projectId],
    );

    // 3. 设置目标记录 is_selected = TRUE
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = TRUE, updated_at = $1 WHERE id = $2`,
      [now, id],
    );

    // 4. 返回更新后的记录
    return this.findById(id) as Promise<ProjectVideoMusic>;
  }

  async clearSelection(projectId: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = FALSE, updated_at = $1 WHERE project_id = $2`,
      [now, projectId],
    );
  }

  async update(id: string, patch: ProjectVideoMusicUpdatePatch): Promise<ProjectVideoMusic> {
    const record = await this.findById(id);
    if (!record) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    const now = Date.now();
    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (patch.volume !== undefined) {
      updates.push(`volume = $${paramIndex}`);
      values.push(patch.volume);
      paramIndex++;
    }
    if (patch.fadeInSec !== undefined) {
      updates.push(`fade_in_sec = $${paramIndex}`);
      values.push(patch.fadeInSec);
      paramIndex++;
    }
    if (patch.fadeOutSec !== undefined) {
      updates.push(`fade_out_sec = $${paramIndex}`);
      values.push(patch.fadeOutSec);
      paramIndex++;
    }

    if (updates.length === 0) {
      return record;
    }

    updates.push(`updated_at = $${paramIndex}`);
    values.push(now);
    paramIndex++;

    values.push(id);

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );

    return this.findById(id) as Promise<ProjectVideoMusic>;
  }

  // delete 方法继承基类实现，返回 Promise<void>

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }
}