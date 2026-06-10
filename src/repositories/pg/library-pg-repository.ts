/**
 * 资产库 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type {
  LibraryCharacter,
  LibraryScript,
  LibraryScriptVersion,
} from "../../contracts/types.js";
import type { ReverseStoryboardLibraryItem } from "../../contracts/reverse-storyboard-report.js";
import type { ReverseStoryboardLibraryVersionRecord } from "../../contracts/reverse-storyboard-library-api.js";
import type {
  SmartStoryboardLibraryItem,
  SmartStoryboardLibraryVersionRecord,
  SmartStoryboardLibraryCategory,
  SmartStoryboardLibrarySourceRef,
  SmartStoryboardLibraryRelationRef,
} from "../../contracts/smart-storyboard-library-api.js";
import type {
  ILibraryCharacterRepository,
  ILibraryScriptRepository,
  ILibraryScriptVersionRepository,
  IReverseStoryboardLibraryRepository,
  IReverseStoryboardLibraryVersionRepository,
  ISmartStoryboardLibraryRepository,
  ISmartStoryboardLibraryVersionRepository,
} from "../../contracts/repository-ports/library-repository.js";
import type { ReverseStoryboardReport } from "../../contracts/reverse-storyboard-report.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";

// ============================================================================
// 库角色（JSONB-heavy: views, viewSession）
// ============================================================================

export class PgLibraryCharacterRepository
  extends PgSoftDeletableRepository<LibraryCharacter>
  implements ILibraryCharacterRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("library_characters"), client);
  }

  protected mapRow(row: Record<string, unknown>): LibraryCharacter {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      kind: row.kind as LibraryCharacter["kind"],
      status: row.status as LibraryCharacter["status"],
      thumbnailUrl: row.thumbnail_url as string,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      views: PgBaseRepository.fromJsonb<string[]>(row.views) ?? [],
      viewSession: PgBaseRepository.fromJsonb(row.view_session) ?? null,
      videoPreview: (row.video_preview as string | null) ?? null,
      fiveViewOssImageUrl: (row.five_view_oss_image_url as string | null) ?? null,
      activeFiveViewId: (row.active_five_view_id as string | null) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      // 角色分析字段（age 从 DB text 列读取后转为 number）
      ethnicity: row.ethnicity as string | null,
      age: (() => { const n = Number(row.age); return row.age != null && Number.isFinite(n) ? n : null; })(),
      gender: (row.gender === "male" || row.gender === "female") ? row.gender : null,
      style: row.style as string | null,
      bodyType: row.body_type as string | null,
      faceShape: row.face_shape as string | null,
      facialFeatures: row.facial_features as string | null,
      eyebrows: row.eyebrows as string | null,
      eyes: row.eyes as string | null,
      eyeExpression: row.eye_expression as string | null,
      nose: row.nose as string | null,
      lips: row.lips as string | null,
      chin: row.chin as string | null,
      skinTone: row.skin_tone as string | null,
      hairStyle: row.hair_style as string | null,
      uniqueFeatures: row.unique_features as string | null,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(c: LibraryCharacter): Record<string, unknown> {
    return {
      id: c.id,
      user_id: c.userId,
      name: c.name,
      kind: c.kind,
      status: c.status,
      thumbnail_url: c.thumbnailUrl,
      tags: PgBaseRepository.toJsonb(c.tags),
      views: PgBaseRepository.toJsonb(c.views),
      view_session: PgBaseRepository.toJsonb(c.viewSession),
      video_preview: c.videoPreview ?? null,
      five_view_oss_image_url: c.fiveViewOssImageUrl ?? null,
      active_five_view_id: c.activeFiveViewId ?? null,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      // 角色分析字段（age 写入 DB 时转为 text）
      ethnicity: c.ethnicity ?? null,
      age: c.age != null ? String(c.age) : null,
      gender: (c.gender === "male" || c.gender === "female") ? c.gender : null,
      style: c.style ?? null,
      body_type: c.bodyType ?? null,
      face_shape: c.faceShape ?? null,
      facial_features: c.facialFeatures ?? null,
      eyebrows: c.eyebrows ?? null,
      eyes: c.eyes ?? null,
      eye_expression: c.eyeExpression ?? null,
      nose: c.nose ?? null,
      lips: c.lips ?? null,
      chin: c.chin ?? null,
      skin_tone: c.skinTone ?? null,
      hair_style: c.hairStyle ?? null,
      unique_features: c.uniqueFeatures ?? null,
      deleted_at: c.deletedAt ?? null,
      deleted_by: c.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<LibraryCharacter[]> {
    return this.findWhere({ user_id: userId });
  }

  async findByUserIdPaged(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      gender?: string;
      tags?: string[];
      keyword?: string;
      hasFiveView?: boolean;
    },
  ): Promise<{
    items: LibraryCharacter[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["user_id = $1", "deleted_at IS NULL"];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    // 只返回有五视图的角色
    if (options?.hasFiveView) {
      conditions.push(`five_view_oss_image_url IS NOT NULL`);
    }

    // 性别筛选（tags JSONB 数组包含）
    if (options?.gender) {
      conditions.push(`tags @> $${paramIndex}`);
      params.push(JSON.stringify([options.gender]));
      paramIndex++;
    }

    // 标签筛选（tags JSONB 数组包含任一）
    if (options?.tags && options.tags.length > 0) {
      conditions.push(`tags ?| $${paramIndex}`);
      params.push(options.tags);
      paramIndex++;
    }

    // 关键词搜索
    if (options?.keyword) {
      conditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${options.keyword}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    const tableName = this.tableName;

    // 查询总数
    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${tableName} WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询分页数据
    const dataResult = await this.queryClient.query(
      `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset],
    );

    const items = dataResult.rows.map((row) => this.mapRow(row as Record<string, unknown>));
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    return { items, total, page, pageSize, totalPages, hasMore };
  }

  /** 查询角色缩略图 URL（thumbnail_url, five_view_oss_image_url） */
  async findThumbnailUrlsById(id: string): Promise<{ thumbnail_url: string | null; five_view_oss_image_url: string | null } | null> {
    const result = await this.queryClient.query<{ thumbnail_url: string | null; five_view_oss_image_url: string | null }>(
      "SELECT thumbnail_url, five_view_oss_image_url FROM " + this.tableName + " WHERE id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 更新角色状态 */
  async updateStatus(characterId: string, status: string, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, now, characterId],
    );
  }
}

// ============================================================================
// 库脚本（传统字段模式）
// ============================================================================

export class PgLibraryScriptRepository
  extends PgSoftDeletableRepository<LibraryScript>
  implements ILibraryScriptRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("library_scripts"), client);
  }

  protected mapRow(row: Record<string, unknown>): LibraryScript {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      content: row.content as string,
      type: row.type as LibraryScript["type"],
      reverseContext: PgBaseRepository.fromJsonb(row.reverse_context) ?? null,
      currentVersion: row.current_version as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(s: LibraryScript): Record<string, unknown> {
    return {
      id: s.id,
      user_id: s.userId,
      title: s.title,
      tags: PgBaseRepository.toJsonb(s.tags),
      content: s.content,
      type: s.type ?? null,
      reverse_context: PgBaseRepository.toJsonb(s.reverseContext),
      current_version: s.currentVersion,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      deleted_at: s.deletedAt ?? null,
      deleted_by: s.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<LibraryScript[]> {
    return this.findWhere({ user_id: userId });
  }
}

// ============================================================================
// 库脚本版本
// ============================================================================

export class PgLibraryScriptVersionRepository
  extends PgBaseRepository<LibraryScriptVersion>
  implements ILibraryScriptVersionRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("library_script_versions"), client);
  }

  protected mapRow(row: Record<string, unknown>): LibraryScriptVersion {
    return {
      id: row.id as string,
      scriptId: row.script_id as string,
      userId: row.user_id as string,
      version: row.version as number,
      title: row.title as string,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      content: row.content as string,
      type: row.type as LibraryScriptVersion["type"],
      reverseContext: PgBaseRepository.fromJsonb(row.reverse_context) ?? null,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(v: LibraryScriptVersion): Record<string, unknown> {
    return {
      id: v.id,
      script_id: v.scriptId,
      user_id: v.userId,
      version: v.version,
      title: v.title,
      tags: PgBaseRepository.toJsonb(v.tags),
      content: v.content,
      type: v.type ?? null,
      reverse_context: PgBaseRepository.toJsonb(v.reverseContext),
      created_at: v.createdAt,
    };
  }

  async findByScriptId(scriptId: string): Promise<LibraryScriptVersion[]> {
    return this.findWhere({ script_id: scriptId });
  }

  async deleteByScriptId(scriptId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE script_id = $1`,
      [scriptId],
    );
  }
}

// ============================================================================
// 反向分镜库（传统字段模式）
// ============================================================================

export class PgReverseStoryboardLibraryRepository
  extends PgBaseRepository<ReverseStoryboardLibraryItem>
  implements IReverseStoryboardLibraryRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("reverse_storyboard_library"), client);
  }

  protected mapRow(row: Record<string, unknown>): ReverseStoryboardLibraryItem {
    return {
      id: row.id as string,
      userId: "", // DDL 中无 user_id 列，反向分镜库为公共资源
      title: row.title as string,
      summary: row.summary as string,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      sourceType: row.source_type as ReverseStoryboardLibraryItem["sourceType"],
      sourceMeta: PgBaseRepository.fromJsonb<ReverseStoryboardLibraryItem["sourceMeta"]>(row.source_meta) ?? {},
      report: PgBaseRepository.fromJsonb<ReverseStoryboardLibraryItem["report"]>(row.report) ?? { intro: null, sections: [], frames: [], rawMarkdown: "", hasStructuredSections: false },
      content: row.content as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(item: ReverseStoryboardLibraryItem): Record<string, unknown> {
    return {
      id: item.id,
      title: item.title,
      summary: item.summary,
      tags: PgBaseRepository.toJsonb(item.tags),
      source_type: item.sourceType,
      source_meta: PgBaseRepository.toJsonb(item.sourceMeta),
      report: PgBaseRepository.toJsonb(item.report),
      content: item.content,
      current_version: 1,
      created_at: item.createdAt ?? Date.now(),
      updated_at: Date.now(),
    };
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `SELECT 1 FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows.length > 0;
  }
}

export class PgReverseStoryboardLibraryVersionRepository
  extends PgBaseRepository<ReverseStoryboardLibraryVersionRecord>
  implements IReverseStoryboardLibraryVersionRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("reverse_storyboard_library_versions"), client);
  }

  protected mapRow(row: Record<string, unknown>): ReverseStoryboardLibraryVersionRecord {
    // DDL 中无 source_type 和 user_id 列，sourceType 从父记录继承
    return {
      id: row.id as string,
      itemId: row.item_id as string,
      userId: "", // DDL 中无 user_id 列
      version: row.version as number,
      title: row.title as string,
      summary: row.summary as string,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      sourceType: "video" as ReverseStoryboardLibraryVersionRecord["sourceType"],
      sourceMeta: PgBaseRepository.fromJsonb<ReverseStoryboardLibraryVersionRecord["sourceMeta"]>(row.source_meta) ?? {},
      report: PgBaseRepository.fromJsonb<ReverseStoryboardLibraryVersionRecord["report"]>(row.report) ?? { intro: null, sections: [], frames: [], rawMarkdown: "", hasStructuredSections: false },
      content: row.content as string,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(v: ReverseStoryboardLibraryVersionRecord): Record<string, unknown> {
    // DDL 列: id, item_id, version, title, summary, tags, source_meta, report, content, created_at
    return {
      id: v.id,
      item_id: v.itemId,
      version: v.version,
      title: v.title,
      summary: v.summary,
      tags: PgBaseRepository.toJsonb(v.tags),
      source_meta: PgBaseRepository.toJsonb(v.sourceMeta),
      report: PgBaseRepository.toJsonb(v.report),
      content: v.content,
      created_at: v.createdAt,
    };
  }

  async findByItemId(itemId: string): Promise<ReverseStoryboardLibraryVersionRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE item_id = $1`,
      [itemId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async deleteByItemId(itemId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE item_id = $1`,
      [itemId],
    );
  }
}

// ============================================================================
// 智能分镜库（传统字段模式）
// ============================================================================

export class PgSmartStoryboardLibraryRepository
  extends PgBaseRepository<SmartStoryboardLibraryItem>
  implements ISmartStoryboardLibraryRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("smart_storyboard_library"), client);
  }

  protected mapRow(row: Record<string, unknown>): SmartStoryboardLibraryItem {
    return {
      id: row.id as string,
      ownerUserId: row.owner_user_id as string,
      title: row.title as string,
      summary: row.summary as string,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      category: row.category as SmartStoryboardLibraryCategory,
      sourceRef: PgBaseRepository.fromJsonb<SmartStoryboardLibrarySourceRef>(row.source_ref) ?? {} as SmartStoryboardLibrarySourceRef,
      relationRef: PgBaseRepository.fromJsonb<SmartStoryboardLibraryRelationRef>(row.relation_ref) ?? {} as SmartStoryboardLibraryRelationRef,
      reverseSourceScriptText: row.reverse_source_script_text as string | null,
      report: PgBaseRepository.fromJsonb<ReverseStoryboardReport>(row.report) ?? { intro: null, sections: [], frames: [], rawMarkdown: "", hasStructuredSections: false },
      content: row.content as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(item: SmartStoryboardLibraryItem): Record<string, unknown> {
    return {
      id: item.id,
      owner_user_id: item.ownerUserId,
      title: item.title,
      summary: item.summary,
      tags: PgBaseRepository.toJsonb(item.tags),
      category: item.category,
      source_ref: PgBaseRepository.toJsonb(item.sourceRef),
      relation_ref: PgBaseRepository.toJsonb(item.relationRef),
      reverse_source_script_text: item.reverseSourceScriptText,
      report: PgBaseRepository.toJsonb(item.report),
      content: item.content,
      current_version: 1,
      created_at: item.createdAt,
      updated_at: Date.now(),
    };
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `SELECT 1 FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows.length > 0;
  }
}

export class PgSmartStoryboardLibraryVersionRepository
  extends PgBaseRepository<SmartStoryboardLibraryVersionRecord>
  implements ISmartStoryboardLibraryVersionRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("smart_storyboard_library_versions"), client);
  }

  protected mapRow(row: Record<string, unknown>): SmartStoryboardLibraryVersionRecord {
    // 版本表 DDL: id, parent_id, version, content(JSONB), created_at, updated_at
    // content JSONB 存储完整版本快照
    const content = PgBaseRepository.fromJsonb<SmartStoryboardLibraryVersionRecord>(row.content) ?? {} as SmartStoryboardLibraryVersionRecord;
    return {
      id: row.id as string,
      itemId: row.parent_id as string,
      ownerUserId: content.ownerUserId ?? "",
      version: (row.version ?? content.version) as number,
      title: content.title ?? "",
      summary: content.summary ?? "",
      tags: content.tags ?? [],
      category: content.category ?? "other",
      sourceRef: content.sourceRef ?? {} as SmartStoryboardLibrarySourceRef,
      relationRef: content.relationRef ?? {} as SmartStoryboardLibraryRelationRef,
      reverseSourceScriptText: content.reverseSourceScriptText ?? null,
      report: content.report ?? { intro: null, sections: [], frames: [], rawMarkdown: "", hasStructuredSections: false },
      content: typeof content.content === "string" ? content.content : "",
      createdAt: (row.created_at ?? content.createdAt) as number,
    };
  }

  protected mapEntity(v: SmartStoryboardLibraryVersionRecord): Record<string, unknown> {
    // 版本数据全部存入 content JSONB 列
    const content = {
      ownerUserId: v.ownerUserId,
      title: v.title,
      summary: v.summary,
      tags: v.tags,
      category: v.category,
      sourceRef: v.sourceRef,
      relationRef: v.relationRef,
      reverseSourceScriptText: v.reverseSourceScriptText,
      report: v.report,
      content: v.content,
      createdAt: v.createdAt,
    };
    return {
      id: v.id,
      parent_id: v.itemId,
      version: v.version,
      content: PgBaseRepository.toJsonb(content),
      created_at: v.createdAt,
      updated_at: Date.now(),
    };
  }

  async findByItemId(itemId: string): Promise<SmartStoryboardLibraryVersionRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE parent_id = $1`,
      [itemId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async deleteByItemId(itemId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE parent_id = $1`,
      [itemId],
    );
  }
}
