/**
 * 项目 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { Project } from "../../contracts/types.js";
import type { IProjectRepository } from "../../contracts/repository-ports/project-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { PROCESSING_STATUSES } from "../../contant-config/shared_dict.js";

// ============================================================================
// Admin 项目查询接口
// ============================================================================

/** 管理后台项目列表查询参数 */
export interface AdminProjectListQuery {
  projectKind?: "video" | "image" | "reverse" | "outfit_change";
  status?: string;
  companyName?: string;
  anomalyType?: "stuck" | "failed_task" | "slow_step";
  userId?: string;
  garmentCategory?: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer";
  timeRange?: "today" | "7days" | "30days";
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 管理后台项目列表行 */
export interface AdminProjectListRow {
  id: string;
  name: string;
  project_kind: string;
  status: string;
  created_at: number;
  updated_at: number;
  views: number;
  user_id: string;
  user_email: string | null;
  company_name: string | null;
  thumbnail_url: string | null;
  cover_image_url: string | null;
  garment_image_url: string | null;
  publish_title: string | null;
  export_url: string | null;
}

// ============================================================================
// 项目
// ============================================================================

export class PgProjectRepository extends PgSoftDeletableRepository<Project> implements IProjectRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("projects"), client);
  }

  protected mapRow(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      status: row.status as Project["status"],
      selectedOutfitPlanId: row.selected_outfit_plan_id as string | null,
      activeScriptId: row.active_script_id as string | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      thumbnailUrl: row.thumbnail_url as string,
      formatLabel: row.format_label as string,
      durationSec: row.duration_sec as number,
      views: row.views as number,
      lastVisitedStep: row.last_visited_step as number,
      lastReverseTaskId: row.last_reverse_task_id as string | null,
      lastReverseScriptVersionId: row.last_reverse_script_version_id as string | null,
      projectKind: (row.project_kind as "image" | "video" | "reverse" | "outfit_change") || "video",
      exportUrl: row.export_url as string | null,
      reverseScriptId: row.reverse_script_id as string | null,
      selectedCharacterId: row.selected_character_id as string | null,
      selectedRoleDirection: PgBaseRepository.fromJsonb(row.selected_role_direction) ?? null,
      coverImageUrl: row.cover_image_url as string | null,
      videoCoverImageUrl: row.video_cover_image_url as string | null,
      garmentImageUrl: row.garment_image_url as string | null,
      publishTitle: row.publish_title as string | null,
      deletedAt: row.deleted_at as number | null | undefined,
      deletedBy: row.deleted_by as string | null | undefined,
    };
  }

  protected mapEntity(p: Project): Record<string, unknown> {
    return {
      id: p.id,
      user_id: p.userId,
      name: p.name,
      status: p.status,
      selected_outfit_plan_id: p.selectedOutfitPlanId,
      active_script_id: p.activeScriptId,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      thumbnail_url: p.thumbnailUrl,
      format_label: p.formatLabel,
      duration_sec: p.durationSec,
      views: p.views,
      last_visited_step: p.lastVisitedStep,
      last_reverse_task_id: p.lastReverseTaskId,
      last_reverse_script_version_id: p.lastReverseScriptVersionId,
      project_kind: p.projectKind,
      export_url: p.exportUrl,
      reverse_script_id: p.reverseScriptId,
      selected_character_id: p.selectedCharacterId,
      selected_role_direction: PgBaseRepository.toJsonb(p.selectedRoleDirection),
      cover_image_url: p.coverImageUrl,
      video_cover_image_url: p.videoCoverImageUrl,
      garment_image_url: p.garmentImageUrl,
      publish_title: p.publishTitle,
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<Project[]> {
    return this.findWhere({ user_id: userId });
  }

  /** 分页查询用户项目 */
  async findByUserIdPaginated(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      status?: string;
      projectKind?: 'image' | 'video' | 'reverse' | 'outfit_change';
      search?: string;
      garmentCategory?: string;
    }
  ): Promise<{
    projects: Project[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    // 是否需要关联服饰表
    const needGarmentJoin = !!options?.garmentCategory;

    // 构建 WHERE 条件
    const conditions: string[] = ['p.user_id = $1', 'p.deleted_at IS NULL'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (options?.status) {
      if (options.status === 'PROCESSING') {
        // "生成中"聚合状态：匹配所有中间状态
        conditions.push(`p.status = ANY($${paramIndex})`);
        params.push(PROCESSING_STATUSES);
        paramIndex++;
      } else {
        conditions.push(`p.status = $${paramIndex}`);
        params.push(options.status);
        paramIndex++;
      }
    }

    if (options?.projectKind) {
      conditions.push(`p.project_kind = $${paramIndex}`);
      params.push(options.projectKind);
      paramIndex++;
    }

    if (options?.search) {
      conditions.push(`p.name ILIKE $${paramIndex}`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    // 服饰分类筛选：JOIN nrm_project_garment_assoc
    if (needGarmentJoin) {
      conditions.push(`pga.category = $${paramIndex}`);
      params.push(options.garmentCategory);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    // 有服饰筛选时使用 DISTINCT 避免重复行
    const selectPrefix = needGarmentJoin ? 'SELECT DISTINCT p.*' : 'SELECT p.*';
    const countExpr = needGarmentJoin ? 'COUNT(DISTINCT p.id)' : 'COUNT(*)';
    const fromClause = needGarmentJoin
      ? `${this.tableName} p INNER JOIN nrm_project_garment_assoc pga ON pga.project_id = p.id`
      : `${this.tableName} p`;

    // 查询总数
    const countResult = await this.queryClient.query(
      `SELECT ${countExpr} as total FROM ${fromClause} WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询分页数据
    const dataResult = await this.queryClient.query(
      `${selectPrefix} FROM ${fromClause} WHERE ${whereClause} ORDER BY p.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    const projects = dataResult.rows.map((row) => this.mapRow(row));
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    return {
      projects,
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
    };
  }

  /** 更新项目的当前脚本ID */
  async updateActiveScriptId(projectId: string, scriptId: string | null): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET active_script_id = $1, updated_at = $2 WHERE id = $3`,
      [scriptId, Date.now(), projectId],
    );
  }

  /** 更新项目的选中角色ID */
  async updateSelectedCharacterId(projectId: string, characterId: string | null): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET selected_character_id = $1, updated_at = $2 WHERE id = $3`,
      [characterId, Date.now(), projectId],
    );
  }

  /** 更新项目的选中角色方向（JSONB） */
  async updateSelectedRoleDirection(projectId: string, roleDirection: unknown): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET selected_role_direction = $1::jsonb, updated_at = $2 WHERE id = $3`,
      [PgBaseRepository.toJsonb(roleDirection), Date.now(), projectId],
    );
  }

  /** 更新项目状态 */
  async updateStatus(projectId: string, status: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, Date.now(), projectId],
    );
  }

  /** 查询使用了指定角色的项目（通过 selected_character_id） */
  async findBySelectedCharacterId(characterId: string): Promise<Project[]> {
    return this.findWhere({ selected_character_id: characterId });
  }

  // ============================================================================
  // Admin 管理后台方法
  // ============================================================================

  /** 构建 admin 查询的 WHERE 条件 */
  private buildAdminWhereConditions(
    query: AdminProjectListQuery,
  ): { whereClause: string; params: unknown[]; needGarmentJoin: boolean } {
    const params: unknown[] = [];
    let paramIndex = 1;

    const whereConditions: string[] = ["p.deleted_at IS NULL"];
    const needGarmentJoin = !!query.garmentCategory;

    // 时间范围条件（created_at 是毫秒时间戳）
    if (query.timeRange === "today") {
      whereConditions.push("p.created_at >= EXTRACT(EPOCH FROM CURRENT_DATE) * 1000");
    } else if (query.timeRange === "7days") {
      whereConditions.push("p.created_at >= EXTRACT(EPOCH FROM (CURRENT_DATE - INTERVAL '7 days')) * 1000");
    } else if (query.timeRange === "30days") {
      whereConditions.push("p.created_at >= EXTRACT(EPOCH FROM (CURRENT_DATE - INTERVAL '30 days')) * 1000");
    }

    // 异常筛选条件（updated_at 是毫秒时间戳）
    if (query.anomalyType === "stuck") {
      whereConditions.push(`p.status IN ('STORYBOARDING', 'FILMING', 'FISSIONING')
                          AND p.updated_at < EXTRACT(EPOCH FROM NOW()) * 1000 - 7200000`);
    } else if (query.anomalyType === "failed_task") {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM nrm_async_jobs aj
        WHERE aj.project_id = p.id AND aj.status = 'failed'
      )`);
    } else if (query.anomalyType === "slow_step") {
      // 高耗时：创建超过24小时但仍未完成，且不属于卡住（2小时无更新）
      whereConditions.push(`p.status NOT IN ('DRAFT', 'COMPLETED')
                          AND p.created_at < EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000
                          AND p.updated_at >= EXTRACT(EPOCH FROM NOW()) * 1000 - 7200000`);
    }

    // 项目类型筛选
    if (query.projectKind) {
      whereConditions.push(`p.project_kind = $${paramIndex++}`);
      params.push(query.projectKind);
    }

    // 状态筛选
    if (query.status) {
      whereConditions.push(`p.status = $${paramIndex++}`);
      params.push(query.status);
    }

    // 用户筛选
    if (query.userId) {
      whereConditions.push(`p.user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    // 搜索条件
    if (query.search) {
      whereConditions.push(`(p.name ILIKE $${paramIndex} OR p.id ILIKE $${paramIndex})`);
      params.push(`%${query.search}%`);
      paramIndex++;
    }

    // 公司筛选
    if (query.companyName) {
      whereConditions.push(`u.company_name = $${paramIndex++}`);
      params.push(query.companyName);
    }

    // 服饰分类筛选（需要 JOIN nrm_project_garment_assoc）
    if (query.garmentCategory) {
      whereConditions.push(`pga.category = $${paramIndex++}`);
      params.push(query.garmentCategory);
    }

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

    return { whereClause, params, needGarmentJoin };
  }

  /**
   * 管理后台：项目列表查询（带用户/服饰 JOIN + 动态筛选 + 分页）
   */
  async adminListProjects(
    query: AdminProjectListQuery,
  ): Promise<{ rows: AdminProjectListRow[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const { whereClause, params, needGarmentJoin } = this.buildAdminWhereConditions(query);

    // 根据是否需要服饰分类 JOIN 构建 FROM 子句
    const fromClause = needGarmentJoin
      ? `FROM ${this.tableName} p
         LEFT JOIN nrm_users u ON p.user_id = u.id
         INNER JOIN nrm_project_garment_assoc pga ON pga.project_id = p.id`
      : `FROM ${this.tableName} p
         LEFT JOIN nrm_users u ON p.user_id = u.id`;

    // 查询总数（服饰分类筛选需要 DISTINCT）
    const countExpr = needGarmentJoin ? "COUNT(DISTINCT p.id)" : "COUNT(*)";
    const countResult = await this.queryClient.query<{ total: string }>(
      `SELECT ${countExpr} as total ${fromClause} ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // 查询项目列表（服饰分类筛选需要 DISTINCT）
    const selectPrefix = needGarmentJoin ? "SELECT DISTINCT" : "SELECT";
    const listQuery = `
      ${selectPrefix}
        p.id,
        p.name,
        p.project_kind,
        p.status,
        p.created_at,
        p.updated_at,
        p.views,
        p.user_id,
        u.email as user_email,
        u.company_name,
        COALESCE(p.cover_image_url, p.garment_image_url, p.thumbnail_url) as thumbnail_url,
        p.cover_image_url,
        p.garment_image_url,
        p.publish_title,
        p.export_url
      ${fromClause}
      ${whereClause}
      ORDER BY p.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const listParams = [...params, pageSize, offset];
    const result = await this.queryClient.query<AdminProjectListRow>(listQuery, listParams);

    return { rows: result.rows, total };
  }

  /**
   * 管理后台：项目详情（含用户信息）
   * 返回原始行数据，因为详情页需要许多不在 Project 类型中的字段
   */
  async findDetailWithUser(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT p.*, u.email as user_email, u.company_name
       FROM ${this.tableName} p
       LEFT JOIN nrm_users u ON p.user_id = u.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * 管理后台：条件状态更新（用于解锁操作）
   * 仅当当前状态在允许列表中时才更新，返回是否成功更新
   */
  async updateStatusConditional(
    projectId: string,
    newStatus: string,
    allowedCurrentStatuses: string[],
  ): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, updated_at = $2
       WHERE id = $3 AND status = ANY($4) AND deleted_at IS NULL`,
      [newStatus, Date.now(), projectId, allowedCurrentStatuses],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * 统计卡住的项目数（2小时无更新且处于中间状态）
   */
  async countStuckProjects(): Promise<number> {
    const result = await this.queryClient.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM ${this.tableName}
       WHERE deleted_at IS NULL
         AND status IN ('STORYBOARDING', 'FILMING', 'FISSIONING')
         AND updated_at < EXTRACT(EPOCH FROM NOW()) * 1000 - 7200000`,
    );
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  /**
   * 统计高耗时项目数（创建超过24小时但未完成，且2小时内有更新）
   */
  async countSlowStepProjects(): Promise<number> {
    const result = await this.queryClient.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM ${this.tableName}
       WHERE deleted_at IS NULL
         AND status NOT IN ('DRAFT', 'COMPLETED')
         AND created_at < EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000
         AND updated_at >= EXTRACT(EPOCH FROM NOW()) * 1000 - 7200000`,
    );
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  /**
   * 管理后台：导出项目数据（无分页，仅返回核心字段）
   */
  async adminExportProjects(query: AdminProjectListQuery): Promise<AdminProjectListRow[]> {
    const { whereClause, params, needGarmentJoin } = this.buildAdminWhereConditions(query);

    const fromClause = needGarmentJoin
      ? `FROM ${this.tableName} p
         LEFT JOIN nrm_users u ON p.user_id = u.id
         INNER JOIN nrm_project_garment_assoc pga ON pga.project_id = p.id`
      : `FROM ${this.tableName} p
         LEFT JOIN nrm_users u ON p.user_id = u.id`;

    const selectPrefix = needGarmentJoin ? "SELECT DISTINCT" : "SELECT";
    const listQuery = `
      ${selectPrefix}
        p.id,
        p.name,
        p.project_kind,
        p.status,
        p.created_at,
        p.updated_at,
        u.email as user_email,
        u.company_name
      ${fromClause}
      ${whereClause}
      ORDER BY p.updated_at DESC
    `;
    const result = await this.queryClient.query<AdminProjectListRow>(listQuery, params);
    return result.rows;
  }

  /** 更新 thumbnail_url + cover_image_url */
  async updateThumbnailAndCover(projectId: string, thumbnailUrl: string, coverImageUrl: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET thumbnail_url = $1, cover_image_url = $2, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $3`,
      [thumbnailUrl, coverImageUrl, projectId],
    );
  }

  /** 仅更新 thumbnail_url */
  async updateThumbnail(projectId: string, thumbnailUrl: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET thumbnail_url = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2`,
      [thumbnailUrl, projectId],
    );
  }

  /** 仅更新 cover_image_url */
  async updateCoverImage(projectId: string, coverImageUrl: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET cover_image_url = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2`,
      [coverImageUrl, projectId],
    );
  }

  /** 更新 garment_image_url */
  async updateGarmentImage(projectId: string, garmentImageUrl: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET garment_image_url = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2`,
      [garmentImageUrl, projectId],
    );
  }

  /** 更新状态 + 导出 URL + 封面 + 时长 */
  async updateStatusAndExport(projectId: string, status: string, exportUrl: string, coverImageUrl: string, durationSec: number, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, export_url = $2, cover_image_url = $3, duration_sec = $4, updated_at = $5 WHERE id = $6`,
      [status, exportUrl, coverImageUrl, durationSec, updatedAt, projectId],
    );
  }

  /** 更新发布标题 */
  async updatePublishTitle(projectId: string, publishTitle: string | null, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET publish_title = $1, updated_at = $2 WHERE id = $3`,
      [publishTitle, updatedAt, projectId],
    );
  }

  /** 查询项目发布摘要（发布路由专用） */
  async findPublishSummaryById(projectId: string): Promise<{
    id: string;
    userId: string;
    name: string;
    coverImageUrl: string | null;
    exportUrl: string | null;
    activeScriptId: string | null;
  } | null> {
    const result = await this.queryClient.query<{
      id: string;
      userId: string;
      name: string;
      coverImageUrl: string | null;
      exportUrl: string | null;
      activeScriptId: string | null;
    }>(
      `SELECT
        id,
        user_id AS "userId",
        name,
        cover_image_url AS "coverImageUrl",
        export_url AS "exportUrl",
        active_script_id AS "activeScriptId"
      FROM ${this.tableName} WHERE id = $1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 查询项目状态（仅返回 status 字段） */
  async findStatusById(projectId: string): Promise<string | null> {
    const result = await this.queryClient.query<{ status: string }>(
      `SELECT status FROM ${this.tableName} WHERE id = $1`,
      [projectId],
    );
    return result.rows[0]?.status ?? null;
  }

  /** 更新项目状态为 READY_TO_PUBLISH（用于 action-transfer 完成） */
  async updateStatusToReadyToPublish(projectId: string, exportUrl: string, durationSec: number, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'READY_TO_PUBLISH', export_url = $1, duration_sec = $2, updated_at = $3 WHERE id = $4`,
      [exportUrl, durationSec, updatedAt, projectId],
    );
  }

  /** 查询项目上下文主信息（CTE: 角色 + 穿搭方案） */
  async queryProjectContext(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `WITH selected_character AS (
        SELECT pc.library_character_id
        FROM nrm_project_characters pc
        WHERE pc.project_id = $1
          AND pc.is_selected = true
          AND pc.deleted_at IS NULL
        LIMIT 1
      ),
      selected_outfit AS (
        SELECT op.id, op.title, op.style_name, op.tags, op.analysis,
               op.optimized_prompt, op.suitable_scene
        FROM nrm_project_outfit_plans pop
        JOIN nrm_outfit_plans op ON pop.outfit_plan_id = op.id
        WHERE pop.project_id = $1
          AND pop.selected = true
        LIMIT 1
      )
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.selected_role_direction,
        lc.id AS character_id,
        lc.name AS character_name,
        lc.gender,
        lc.age,
        lc.style AS character_style,
        lc.tags AS character_tags,
        lc.thumbnail_url AS character_thumbnail,
        lc.five_view_oss_image_url,
        so.id AS outfit_plan_id,
        so.title AS outfit_title,
        so.style_name,
        so.tags AS outfit_tags,
        so.analysis,
        so.optimized_prompt,
        so.suitable_scene
      FROM ${this.tableName} p
      LEFT JOIN selected_character sc ON true
      LEFT JOIN nrm_library_characters lc ON lc.id = sc.library_character_id
      LEFT JOIN selected_outfit so ON true
      WHERE p.id = $1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 查询项目服饰列表 */
  async queryProjectGarments(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT
        ga.id AS garment_asset_id,
        ga.name,
        ga.category,
        ga.description,
        ga.style,
        ga.occasion,
        ga.main_image_url,
        ga.flat_lay_image_url
      FROM nrm_project_garment_assoc pga
      JOIN nrm_garment_assets ga ON pga.garment_asset_id = ga.id
      WHERE pga.project_id = $1
      ORDER BY pga.created_at ASC`,
      [projectId],
    );
    return result.rows;
  }

  /** 查询备用穿搭方案（无 selected=true 时） */
  async queryFallbackOutfit(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT
        op.id AS outfit_plan_id,
        op.title,
        op.style_name,
        op.tags,
        op.analysis,
        op.optimized_prompt,
        op.suitable_scene
      FROM nrm_outfit_plans op
      WHERE op.project_id = $1
        AND op.deleted_at IS NULL
      ORDER BY
        CASE WHEN op.style_name IS NOT NULL AND op.style_name != '' THEN 0 ELSE 1 END,
        CASE WHEN op.tags IS NOT NULL AND jsonb_array_length(op.tags) > 0 THEN 0 ELSE 1 END,
        op.index ASC
      LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 增加项目浏览次数 */
  async incrementViews(projectId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET views = views + 1 WHERE id = $1`,
      [projectId],
    );
  }
}
