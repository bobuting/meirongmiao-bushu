/**
 * Section 版本 PG 仓库
 *
 * 表名: nrm_section_versions
 * 用途: 管理 Section 图片生成历史版本，支持版本回溯
 *
 * 建表 SQL（已在 Phase 1 创建）:
 * CREATE TABLE nrm_section_versions (
 *   id TEXT PRIMARY KEY,
 *   section_id TEXT NOT NULL,
 *   project_id TEXT NOT NULL,
 *   version_number INT NOT NULL,
 *   prompt_snapshot JSONB,
 *   copy_snapshot JSONB,
 *   image_asset_id TEXT,
 *   is_active BOOLEAN DEFAULT false,
 *   created_at BIGINT NOT NULL
 * );
 */

import type { Pool, PoolClient } from "pg";
import { nrm } from "./base-pg-repository.js";
import type { SectionVersion } from "../../contracts/types.js";

export class PgSectionVersionRepository {
  private readonly table = nrm("section_versions");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 将数据库行映射为 SectionVersion 对象 */
  private mapRow(row: Record<string, unknown>): SectionVersion {
    return {
      id: row.id as string,
      sectionId: row.section_id as string,
      projectId: row.project_id as string,
      versionNumber: row.version_number as number,
      promptSnapshot: (row.prompt_snapshot as Record<string, unknown>) ?? null,
      copySnapshot: (row.copy_snapshot as Record<string, unknown>) ?? null,
      imageAssetId: (row.image_asset_id as string) ?? null,
      isActive: (row.is_active as boolean) ?? false,
      createdAt: row.created_at as number,
    };
  }

  /** 按 ID 查找单个版本 */
  async findById(id: string): Promise<SectionVersion | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** 按 Section ID 查找所有版本，按 version_number 升序 */
  async findBySectionId(sectionId: string): Promise<SectionVersion[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE section_id = $1 ORDER BY version_number ASC`,
      [sectionId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查找 Section 当前激活的版本 */
  async findActiveBySectionId(sectionId: string): Promise<SectionVersion | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE section_id = $1 AND is_active = true`,
      [sectionId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** 按项目 ID 查找所有激活版本 */
  async findActiveByProjectId(projectId: string): Promise<SectionVersion[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE project_id = $1 AND is_active = true ORDER BY section_id ASC`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 创建新版本 */
  async create(version: SectionVersion): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (
        id, section_id, project_id, version_number,
        prompt_snapshot, copy_snapshot, image_asset_id, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        version.id,
        version.sectionId,
        version.projectId,
        version.versionNumber,
        version.promptSnapshot !== null ? JSON.stringify(version.promptSnapshot) : null,
        version.copySnapshot !== null ? JSON.stringify(version.copySnapshot) : null,
        version.imageAssetId,
        version.isActive,
        version.createdAt,
      ],
    );
  }

  /** 更新版本 */
  async update(version: SectionVersion): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table} SET
        prompt_snapshot = $1, copy_snapshot = $2, image_asset_id = $3,
        is_active = $4, created_at = $5
      WHERE id = $6`,
      [
        version.promptSnapshot !== null ? JSON.stringify(version.promptSnapshot) : null,
        version.copySnapshot !== null ? JSON.stringify(version.copySnapshot) : null,
        version.imageAssetId,
        version.isActive,
        version.createdAt,
        version.id,
      ],
    );
  }

  /** 删除版本 */
  async delete(id: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.table} WHERE id = $1`,
      [id],
    );
  }

  /** 切换激活版本：取消旧版本激活，激活新版本 */
  async activate(versionId: string): Promise<void> {
    // 先查找该版本所属的 section_id
    const findResult = await this.queryClient.query(
      `SELECT section_id FROM ${this.table} WHERE id = $1`,
      [versionId],
    );

    if (findResult.rows.length === 0) {
      throw new Error("Version not found");
    }

    const sectionId = findResult.rows[0].section_id as string;

    // 取消该 section 所有版本的激活状态
    await this.queryClient.query(
      `UPDATE ${this.table} SET is_active = false WHERE section_id = $1`,
      [sectionId],
    );

    // 激活指定版本
    await this.queryClient.query(
      `UPDATE ${this.table} SET is_active = true WHERE id = $1`,
      [versionId],
    );
  }

  /** 获取 Section 的下一个版本号 */
  async nextVersionNumber(sectionId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_version FROM ${this.table} WHERE section_id = $1`,
      [sectionId],
    );
    return ((result.rows[0]?.max_version as number) ?? 0) + 1;
  }
}
