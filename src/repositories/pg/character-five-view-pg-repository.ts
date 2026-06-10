/**
 * 角色五视图 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { CharacterFiveView } from "../../contracts/types.js";
import type { ICharacterFiveViewRepository } from "../../contracts/repository-ports/library-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgCharacterFiveViewRepository
  extends PgBaseRepository<CharacterFiveView>
  implements ICharacterFiveViewRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("character_five_views"), client);
  }

  protected mapRow(row: Record<string, unknown>): CharacterFiveView {
    return {
      id: row.id as string,
      characterId: row.character_id as string,
      imageUrl: row.image_url as string | null,
      status: row.status as CharacterFiveView["status"],
      isActive: row.is_active as boolean,
      prompt: row.prompt as string | null,
      model: row.model as string | null,
      generationParams: PgBaseRepository.fromJsonb(row.generation_params) ?? null,
      errorMessage: row.error_message as string | null,
      retryCount: row.retry_count as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(v: CharacterFiveView): Record<string, unknown> {
    return {
      id: v.id,
      character_id: v.characterId,
      image_url: v.imageUrl ?? null,
      status: v.status,
      is_active: v.isActive,
      prompt: v.prompt ?? null,
      model: v.model ?? null,
      generation_params: PgBaseRepository.toJsonb(v.generationParams),
      error_message: v.errorMessage ?? null,
      retry_count: v.retryCount,
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    };
  }

  async findByCharacterId(characterId: string): Promise<CharacterFiveView[]> {
    return this.findWhere({ character_id: characterId });
  }

  async findActiveByCharacterId(characterId: string): Promise<CharacterFiveView | null> {
    const results = await this.findWhere({ character_id: characterId, is_active: true });
    return results[0] ?? null;
  }

  async create(view: CharacterFiveView): Promise<void> {
    const data = this.mapEntity(view);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  }

  async update(view: CharacterFiveView): Promise<void> {
    const data = this.mapEntity(view);
    const keys = Object.keys(data).filter((k) => k !== "id");
    const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => data[k]);
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates} WHERE id = $${keys.length + 1}`,
      [...values, view.id],
    );
  }

  async setActive(characterId: string, viewId: string): Promise<void> {
    const now = Date.now();

    // 1. 获取新激活五视图的图片 URL
    const viewResult = await this.queryClient.query(
      `SELECT image_url FROM ${this.tableName} WHERE id = $1 AND character_id = $2 AND status = 'ready'`,
      [viewId, characterId],
    );
    const newImageUrl = viewResult.rows[0]?.image_url as string | null;

    // 2. 更新五视图的 is_active
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = false, updated_at = $1 WHERE character_id = $2`,
      [now, characterId],
    );
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = true, updated_at = $1 WHERE id = $2`,
      [now, viewId],
    );

    // 3. 同时更新角色表的 fiveViewOssImageUrl
    if (newImageUrl) {
      await this.queryClient.query(
        `UPDATE nrm_library_characters SET five_view_oss_image_url = $1, updated_at = $2 WHERE id = $3`,
        [newImageUrl, now, characterId],
      );
    }
  }

  /** 按多个角色ID查询五视图（返回原始行） */
  async findByCharacterIds(characterIds: string[]): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT cfv.character_id, cfv.image_url
       FROM nrm_character_five_views cfv
       WHERE cfv.character_id = ANY($1) AND cfv.status = 'ready'
       ORDER BY cfv.character_id, cfv.is_active DESC, cfv.created_at`,
      [characterIds],
    );
    return result.rows;
  }

  /** 按角色ID查询激活的五视图图片URL（返回原始行） */
  async findActiveByCharacterIdRaw(characterId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT image_url
       FROM nrm_character_five_views
       WHERE character_id = $1 AND is_active = true AND status = 'ready' AND image_url IS NOT NULL
       ORDER BY created_at`,
      [characterId],
    );
    return result.rows;
  }
}