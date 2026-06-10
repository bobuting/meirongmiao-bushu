/**
 * 项目角色关联 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ProjectCharacter } from "../../contracts/types.js";
import type { IProjectCharacterRepository } from "../../contracts/repository-ports/library-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { nrm } from "./base-pg-repository.js";

export class PgProjectCharacterRepository
  extends PgSoftDeletableRepository<ProjectCharacter>
  implements IProjectCharacterRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_characters"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectCharacter {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      libraryCharacterId: row.library_character_id as string,
      role: row.role as "main" | "secondary",
      sourceType: row.source_type as "generated" | "library",
      isSelected: row.is_selected as boolean,
      generationSlot: (row.generation_slot as number | null) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(pc: ProjectCharacter): Record<string, unknown> {
    return {
      id: pc.id,
      project_id: pc.projectId,
      library_character_id: pc.libraryCharacterId,
      role: pc.role,
      source_type: pc.sourceType,
      is_selected: pc.isSelected,
      generation_slot: pc.generationSlot,
      created_at: pc.createdAt,
      updated_at: pc.updatedAt,
      deleted_at: pc.deletedAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ProjectCharacter[]> {
    return this.findWhere({ project_id: projectId });
  }

  async findByProjectAndLibraryCharacterId(
    projectId: string,
    libraryCharacterId: string,
  ): Promise<ProjectCharacter | null> {
    return this.findOneWhere({ project_id: projectId, library_character_id: libraryCharacterId });
  }

  /** 将指定角色设为项目当前选中角色，同时清除其他角色的选中状态 */
  async setSelected(projectId: string, libraryCharacterId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = false, updated_at = $1 WHERE project_id = $2 AND deleted_at IS NULL`,
      [Date.now(), projectId],
    );
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = true, updated_at = $1 WHERE project_id = $2 AND library_character_id = $3 AND deleted_at IS NULL`,
      [Date.now(), projectId, libraryCharacterId],
    );
  }

  /** 清除项目的所有选中状态 */
  async clearSelected(projectId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = false, updated_at = $1 WHERE project_id = $2 AND deleted_at IS NULL`,
      [Date.now(), projectId],
    );
  }

  async create(record: ProjectCharacter): Promise<void> {
    const data = this.mapEntity(record);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  }

  async update(record: ProjectCharacter): Promise<void> {
    const data = this.mapEntity(record);
    const keys = Object.keys(data).filter((k) => k !== "id");
    const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => data[k]);
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates} WHERE id = $${keys.length + 1}`,
      [...values, record.id],
    );
  }

  /** 检查角色是否被项目使用（未删除的关联） */
  async findByLibraryCharacterId(libraryCharacterId: string): Promise<ProjectCharacter[]> {
    return this.findWhere({ library_character_id: libraryCharacterId });
  }

  /** 软删除指定 slot 上的角色关联 */
  async softDeleteBySlot(projectId: string, generationSlot: number, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET deleted_at = $1, updated_at = $1 WHERE project_id = $2 AND generation_slot = $3 AND deleted_at IS NULL`,
      [now, projectId, generationSlot],
    );
  }

  /** 查找项目与角色是否已存在未删除关联 */
  async findActiveByProjectAndCharacter(projectId: string, libraryCharacterId: string): Promise<{ id: string } | null> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE project_id = $1 AND library_character_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [projectId, libraryCharacterId],
    );
    return result.rows[0] ?? null;
  }

  /** 更新关联的 generation_slot */
  async updateGenerationSlot(projectId: string, libraryCharacterId: string, generationSlot: number | null, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET generation_slot = $1, updated_at = $2 WHERE project_id = $3 AND library_character_id = $4 AND deleted_at IS NULL`,
      [generationSlot, now, projectId, libraryCharacterId],
    );
  }

  /** 按项目ID查询角色列表（JOIN 库角色表，返回原始行） */
  async findByProjectWithLibrary(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT pc.id, pc.library_character_id, lc.name, lc.thumbnail_url,
              lc.five_view_oss_image_url, pc.is_selected, pc.source_type, pc.role
       FROM ${this.tableName} pc
       JOIN nrm_library_characters lc ON pc.library_character_id = lc.id
       WHERE pc.project_id = $1 AND pc.deleted_at IS NULL
       ORDER BY pc.is_selected DESC, pc.created_at`,
      [projectId],
    );
    return result.rows;
  }

  /** 更新关联的 updated_at（按项目 + 角色ID） */
  async updateTimestampByProjectAndCharacter(
    projectId: string,
    libraryCharacterId: string,
    updatedAt: number,
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET updated_at = $1
       WHERE project_id = $2 AND library_character_id = $3 AND deleted_at IS NULL`,
      [updatedAt, projectId, libraryCharacterId],
    );
  }
}
