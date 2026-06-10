/**
 * 页面 Section PG 仓库
 *
 * 表名: nrm_page_sections
 * 用途: 电商详情页 Section 管理（搭配总览、细节展示、场景应用等区块）
 *
 * 建表 SQL（已在 Phase 1 创建）:
 * CREATE TABLE nrm_page_sections (
 *   id TEXT PRIMARY KEY,
 *   project_id TEXT NOT NULL,
 *   section_key TEXT NOT NULL,
 *   section_type TEXT NOT NULL,
 *   title TEXT,
 *   goal TEXT,
 *   copy TEXT,
 *   visual_prompt TEXT,
 *   sort_order INT DEFAULT 0,
 *   status TEXT DEFAULT 'idle',
 *   current_image_asset_id TEXT,
 *   editable_data JSONB,
 *   display_config JSONB DEFAULT NULL,
 *   created_at BIGINT NOT NULL,
 *   updated_at BIGINT NOT NULL
 * );
 */

import type { Pool, PoolClient } from "pg";
import { nrm } from "./base-pg-repository.js";
import type { PageSection } from "../../contracts/types.js";

export class PgPageSectionRepository {
  private readonly table = nrm("page_sections");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 将数据库行映射为 PageSection 对象 */
  private mapRow(row: Record<string, unknown>): PageSection {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      sectionKey: row.section_key as string,
      sectionType: row.section_type as PageSection["sectionType"],
      title: (row.title as string) ?? null,
      goal: (row.goal as string) ?? null,
      copy: (row.copy as string) ?? null,
      visualPrompt: (row.visual_prompt as string) ?? null,
      sortOrder: (row.sort_order as number) ?? 0,
      status: (row.status as PageSection["status"]) ?? "idle",
      currentImageAssetId: (row.current_image_asset_id as string) ?? null,
      editableData: (row.editable_data as Record<string, unknown>) ?? null,
      displayConfig: row.display_config
        ? (row.display_config as unknown) as import("../../contracts/types.js").TextDisplayConfig
        : null,
      layoutConfig: row.layout_config
        ? (row.layout_config as unknown) as import("../../contracts/types.js").LayoutConfig
        : null,
      deletedAt: (row.deleted_at as number) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  /** 按 ID 查找单个 Section */
  async findById(id: string): Promise<PageSection | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** 按项目 ID 查找所有 Section，按 sort_order 排序 */
  async findByProjectId(projectId: string): Promise<PageSection[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE project_id = $1 ORDER BY sort_order ASC`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 按项目 ID + sectionKey 查找 */
  async findBySectionKey(projectId: string, sectionKey: string): Promise<PageSection | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE project_id = $1 AND section_key = $2`,
      [projectId, sectionKey],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** 创建新 Section */
  async create(section: PageSection): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (
        id, project_id, section_key, section_type, title, goal,
        copy, visual_prompt, sort_order, status, current_image_asset_id,
        editable_data, display_config, layout_config, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        section.id,
        section.projectId,
        section.sectionKey,
        section.sectionType,
        section.title,
        section.goal,
        section.copy,
        section.visualPrompt,
        section.sortOrder,
        section.status,
        section.currentImageAssetId,
        section.editableData !== null ? JSON.stringify(section.editableData) : null,
        section.displayConfig !== null ? JSON.stringify(section.displayConfig) : null,
        section.layoutConfig !== null ? JSON.stringify(section.layoutConfig) : null,
        section.createdAt,
        section.updatedAt,
      ],
    );
  }

  /** 更新 Section */
  async update(section: PageSection): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table} SET
        title = $1, goal = $2, copy = $3, visual_prompt = $4,
        sort_order = $5, status = $6, current_image_asset_id = $7,
        editable_data = $8, display_config = $9, layout_config = $10, updated_at = $11
      WHERE id = $12`,
      [
        section.title,
        section.goal,
        section.copy,
        section.visualPrompt,
        section.sortOrder,
        section.status,
        section.currentImageAssetId,
        section.editableData !== null ? JSON.stringify(section.editableData) : null,
        section.displayConfig !== null ? JSON.stringify(section.displayConfig) : null,
        section.layoutConfig !== null ? JSON.stringify(section.layoutConfig) : null,
        section.updatedAt,
        section.id,
      ],
    );
  }

  /** 删除 Section（硬删除，物理删除） */
  async delete(id: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.table} WHERE id = $1`,
      [id],
    );
  }

  /** 批量更新排序 */
  async updateSortOrder(sectionId: string, sortOrder: number): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.table} SET sort_order = $1, updated_at = $2 WHERE id = $3`,
      [sortOrder, now, sectionId],
    );
  }

  /** 更新当前激活图片 */
  async updateCurrentImage(sectionId: string, imageAssetId: string | null): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.table} SET current_image_asset_id = $1, updated_at = $2 WHERE id = $3`,
      [imageAssetId, now, sectionId],
    );
  }

  /** 按项目ID查询 Section 列表（摘要字段，返回原始行） */
  async findByProject(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, section_key, section_type, title, goal, copy, status,
              current_image_asset_id, sort_order
       FROM ${this.table}
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY sort_order`,
      [projectId],
    );
    return result.rows;
  }
}
