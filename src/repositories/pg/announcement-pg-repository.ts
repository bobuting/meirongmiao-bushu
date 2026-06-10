/**
 * 公告 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type { Announcement, AnnouncementStatus } from "../../contracts/announcement-contract.js";

export class PgAnnouncementRepository extends PgBaseRepository<Announcement> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("announcements"), client);
  }

  protected mapRow(row: Record<string, unknown>): Announcement {
    return {
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      status: row.status as AnnouncementStatus,
      publishedAt: (row.published_at as number) ?? null,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: Announcement): Record<string, unknown> {
    return {
      id: entity.id,
      title: entity.title,
      content: entity.content,
      status: entity.status,
      published_at: entity.publishedAt ?? null,
      sort_order: entity.sortOrder,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 查询已发布公告 */
  async listPublished(): Promise<Announcement[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE status = 'published' ORDER BY sort_order DESC, created_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 更新公告状态 */
  async updateStatus(id: string, status: AnnouncementStatus): Promise<void> {
    const now = Date.now();
    const updates: Record<string, unknown> = { status, updated_at: now };
    if (status === 'published') {
      updates.published_at = now;
    }
    await this.updateFields(id, updates);
  }
}
