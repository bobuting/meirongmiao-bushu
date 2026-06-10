/**
 * 项目迁移处理模块
 * 负责测试库到正式库的项目数据迁移
 *
 * 功能：
 * 1. 预览：获取数据库配置、检查表结构、查询数据量
 * 2. 执行：查询源库数据、插入到目标库、处理 JSONB 字段
 */

import { Pool, types } from "pg";
import { AppError } from "../../core/errors.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("project-migrate");

// ---------------------------------------------------------------------------
// 迁移涉及的表清单（按插入顺序，先插入被依赖的表）
// ---------------------------------------------------------------------------

/** 迁移表清单（29张表） */
export const MIGRATE_TABLES = [
  "nrm_garment_assets",
  "nrm_library_characters",
  "nrm_character_five_views",
  "nrm_projects",
  "nrm_project_garment_assoc",
  "nrm_outfit_plans",
  "nrm_project_outfit_plans",
  "nrm_role_direction_cards",
  "nrm_project_characters",
  // 换装项目
  "nrm_outfit_change_projects",
  "nrm_outfit_segment_images",
  "nrm_outfit_segment_videos",
  // 视频项目业务数据
  "nrm_video_project_business_data",
  "nrm_model_photos",
  "nrm_image_project_ext",
  "nrm_page_sections",
  "nrm_section_versions",
  "nrm_script_data",
  "nrm_shot_breakdown",
  "nrm_project_script_assoc",
  "nrm_user_script_assoc",
  "nrm_step3_frame_images",
  "nrm_shot_prompts",
  "nrm_step4_video_scenes",
  "nrm_project_video_musics",
  "nrm_final_videos",
  "nrm_fission_video_status",
  "nrm_fission_task_items",
  "nrm_fission_videos",
];

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 数据库配置 */
export interface DatabaseConfig {
  testDbUrl: string;
  prodDbUrl: string;
}

/** 表统计信息 */
export interface TableStats {
  tableName: string;
  count: number;
}

/** 表结构差异 */
export interface TableStructureDiff {
  tableName: string;
  missingColumns: string[];
}

/** 预览结果 */
export interface PreviewResult {
  /** 数据库配置是否有效 */
  configValid: boolean;
  /** 源库连接状态 */
  sourceDbConnected: boolean;
  /** 目标库连接状态 */
  targetDbConnected: boolean;
  /** 表结构差异 */
  structureDiffs: TableStructureDiff[];
  /** 数据统计 */
  tableStats: TableStats[];
  /** 总数据条数 */
  totalCount: number;
}

/** 执行结果 */
export interface ExecuteResult {
  /** 是否成功 */
  success: boolean;
  /** 插入成功条数 */
  insertedCount: number;
  /** 跳过条数（已存在） */
  skippedCount: number;
  /** 总数据条数 */
  totalCount: number;
  /** 失败表信息 */
  failedTables: string[];
  /** 错误信息 */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 获取表的 JSONB 列名列表
 * @param pool 数据库连接池
 * @param tableName 表名
 * @returns JSONB 列名列表
 */
async function getJsonbColumns(pool: Pool, tableName: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND data_type IN ('jsonb', 'json')`,
    [tableName]
  );
  return result.rows.map((r) => r.column_name as string);
}

/**
 * 获取表的列名列表
 * @param pool 数据库连接池
 * @param tableName 表名
 * @returns 列名集合
 */
async function getTableColumns(pool: Pool, tableName: string): Promise<Set<string> | null> {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    return new Set(result.rows.map((r) => r.column_name as string));
  } catch {
    return null;
  }
}

/**
 * 设置 pg 类型解析器（JSONB 保持原始字符串）
 * 用于避免 JSONB 字段的二次序列化
 */
function setupPgTypeParser(): void {
  // JSON 类型 (114)
  types.setTypeParser(114, (val) => val);
  // JSONB 类型 (3802)
  types.setTypeParser(3802, (val) => val);
}

/**
 * 创建数据库连接池
 * @param dbUrl 数据库连接 URL
 * @returns Pool 实例
 */
function createPool(dbUrl: string): Pool {
  return new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 15000,
  });
}

// ---------------------------------------------------------------------------
// 预览功能
// ---------------------------------------------------------------------------

/**
 * 预览迁移数据
 * 获取数据库配置、检查表结构、查询数据量
 *
 * @param config 数据库配置（从 nrm_business_configs 获取）
 * @param projectId 项目 ID
 * @returns 预览结果
 */
export async function migrateProjectPreview(
  config: DatabaseConfig,
  projectId: string
): Promise<PreviewResult> {
  // 验证配置
  if (!config.testDbUrl || !config.prodDbUrl) {
    log.warn("数据库配置缺失");
    return {
      configValid: false,
      sourceDbConnected: false,
      targetDbConnected: false,
      structureDiffs: [],
      tableStats: [],
      totalCount: 0,
    };
  }

  // 设置类型解析器
  setupPgTypeParser();

  // 创建连接池
  const sourcePool = createPool(config.testDbUrl);
  const targetPool = createPool(config.prodDbUrl);

  try {
    // 测试连接
    let sourceDbConnected = false;
    let targetDbConnected = false;

    try {
      await sourcePool.query("SELECT 1");
      sourceDbConnected = true;
    } catch (e) {
      log.error({ error: e }, "源库连接失败");
    }

    try {
      await targetPool.query("SELECT 1");
      targetDbConnected = true;
    } catch (e) {
      log.error({ error: e }, "目标库连接失败");
    }

    if (!sourceDbConnected || !targetDbConnected) {
      return {
        configValid: true,
        sourceDbConnected,
        targetDbConnected,
        structureDiffs: [],
        tableStats: [],
        totalCount: 0,
      };
    }

    // 检查项目是否存在
    const projectResult = await sourcePool.query(
      `SELECT id, name, project_kind, user_id, reverse_script_id, active_script_id FROM nrm_projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new AppError(404, "PROJECT_NOT_FOUND", `项目 ${projectId} 在源库不存在`);
    }

    const project = projectResult.rows[0];
    log.info({ projectId, projectName: project.name }, "找到源项目");

    // 检查表结构差异
    const structureDiffs: TableStructureDiff[] = [];

    for (const tableName of MIGRATE_TABLES) {
      const sourceColumns = await getTableColumns(sourcePool, tableName);
      const targetColumns = await getTableColumns(targetPool, tableName);

      if (!sourceColumns || !targetColumns) {
        continue;
      }

      // 检查目标库是否缺少字段
      const missingColumns: string[] = [];
      for (const col of sourceColumns) {
        if (!targetColumns.has(col)) {
          missingColumns.push(col);
        }
      }

      if (missingColumns.length > 0) {
        structureDiffs.push({
          tableName,
          missingColumns,
        });
      }
    }

    // 查询数据量
    const tableStats: TableStats[] = [];
    let totalCount = 0;

    // 项目主表
    const projectCount = projectResult.rows.length;
    if (projectCount > 0) {
      tableStats.push({ tableName: "nrm_projects", count: projectCount });
      totalCount += projectCount;
    }

    // Step1 服装资产
    const garmentAssoc = await sourcePool.query(
      `SELECT garment_asset_id FROM nrm_project_garment_assoc WHERE project_id = $1`,
      [projectId]
    );
    const garmentIds = garmentAssoc.rows.map((r) => r.garment_asset_id);

    if (garmentIds.length > 0) {
      tableStats.push({ tableName: "nrm_project_garment_assoc", count: garmentAssoc.rows.length });
      totalCount += garmentAssoc.rows.length;

      const garments = await sourcePool.query(
        `SELECT id FROM nrm_garment_assets WHERE id = ANY($1)`,
        [garmentIds]
      );
      tableStats.push({ tableName: "nrm_garment_assets", count: garments.rows.length });
      totalCount += garments.rows.length;
    }

    // 搭配方案
    const outfitPlans = await sourcePool.query(
      `SELECT id FROM nrm_outfit_plans WHERE project_id = $1`,
      [projectId]
    );
    if (outfitPlans.rows.length > 0) {
      tableStats.push({ tableName: "nrm_outfit_plans", count: outfitPlans.rows.length });
      totalCount += outfitPlans.rows.length;
    }

    const projectOutfitPlans = await sourcePool.query(
      `SELECT id FROM nrm_project_outfit_plans WHERE project_id = $1`,
      [projectId]
    );
    if (projectOutfitPlans.rows.length > 0) {
      tableStats.push({ tableName: "nrm_project_outfit_plans", count: projectOutfitPlans.rows.length });
      totalCount += projectOutfitPlans.rows.length;
    }

    // 角色方向卡
    const roleDirectionCards = await sourcePool.query(
      `SELECT id FROM nrm_role_direction_cards WHERE project_id = $1`,
      [projectId]
    );
    if (roleDirectionCards.rows.length > 0) {
      tableStats.push({ tableName: "nrm_role_direction_cards", count: roleDirectionCards.rows.length });
      totalCount += roleDirectionCards.rows.length;
    }

    // Step2 角色库
    const projectCharacters = await sourcePool.query(
      `SELECT library_character_id FROM nrm_project_characters WHERE project_id = $1`,
      [projectId]
    );
    const charIds = projectCharacters.rows.map((r) => r.library_character_id);

    if (projectCharacters.rows.length > 0) {
      tableStats.push({ tableName: "nrm_project_characters", count: projectCharacters.rows.length });
      totalCount += projectCharacters.rows.length;
    }

    if (charIds.length > 0) {
      const characters = await sourcePool.query(
        `SELECT id FROM nrm_library_characters WHERE id = ANY($1)`,
        [charIds]
      );
      tableStats.push({ tableName: "nrm_library_characters", count: characters.rows.length });
      totalCount += characters.rows.length;

      const fiveViews = await sourcePool.query(
        `SELECT id FROM nrm_character_five_views WHERE character_id = ANY($1)`,
        [charIds]
      );
      tableStats.push({ tableName: "nrm_character_five_views", count: fiveViews.rows.length });
      totalCount += fiveViews.rows.length;
    }

    // 视频项目业务数据
    if (project.project_kind === "video") {
      const videoBusinessData = await sourcePool.query(
        `SELECT id FROM nrm_video_project_business_data WHERE project_id = $1`,
        [projectId]
      );
      if (videoBusinessData.rows.length > 0) {
        tableStats.push({ tableName: "nrm_video_project_business_data", count: videoBusinessData.rows.length });
        totalCount += videoBusinessData.rows.length;
      }
    }

    // 换装项目数据
    if (project.project_kind === "outfit_change") {
      const outfitChangeProjects = await sourcePool.query(
        `SELECT task_id FROM nrm_outfit_change_projects WHERE project_id = $1`,
        [projectId]
      );
      const taskIds = outfitChangeProjects.rows.map((r) => r.task_id);

      if (outfitChangeProjects.rows.length > 0) {
        tableStats.push({ tableName: "nrm_outfit_change_projects", count: outfitChangeProjects.rows.length });
        totalCount += outfitChangeProjects.rows.length;
      }

      if (taskIds.length > 0) {
        const segmentImages = await sourcePool.query(
          `SELECT id FROM nrm_outfit_segment_images WHERE task_id = ANY($1)`,
          [taskIds]
        );
        tableStats.push({ tableName: "nrm_outfit_segment_images", count: segmentImages.rows.length });
        totalCount += segmentImages.rows.length;

        const segmentVideos = await sourcePool.query(
          `SELECT id FROM nrm_outfit_segment_videos WHERE task_id = ANY($1)`,
          [taskIds]
        );
        tableStats.push({ tableName: "nrm_outfit_segment_videos", count: segmentVideos.rows.length });
        totalCount += segmentVideos.rows.length;
      }
    }

    // 脚本数据
    const scriptIdsForProject: string[] = [];
    if (project.reverse_script_id) {
      scriptIdsForProject.push(project.reverse_script_id);
    }
    if (project.active_script_id && !scriptIdsForProject.includes(project.active_script_id)) {
      scriptIdsForProject.push(project.active_script_id);
    }

    const scriptAssoc = await sourcePool.query(
      `SELECT script_data_id FROM nrm_project_script_assoc WHERE project_id = $1`,
      [projectId]
    );
    for (const row of scriptAssoc.rows) {
      if (!scriptIdsForProject.includes(row.script_data_id)) {
        scriptIdsForProject.push(row.script_data_id);
      }
    }

    if (scriptAssoc.rows.length > 0) {
      tableStats.push({ tableName: "nrm_project_script_assoc", count: scriptAssoc.rows.length });
      totalCount += scriptAssoc.rows.length;
    }

    if (scriptIdsForProject.length > 0) {
      const scripts = await sourcePool.query(
        `SELECT id FROM nrm_script_data WHERE id = ANY($1)`,
        [scriptIdsForProject]
      );
      tableStats.push({ tableName: "nrm_script_data", count: scripts.rows.length });
      totalCount += scripts.rows.length;

      const breakdowns = await sourcePool.query(
        `SELECT id FROM nrm_shot_breakdown WHERE script_data_id = ANY($1)`,
        [scriptIdsForProject]
      );
      tableStats.push({ tableName: "nrm_shot_breakdown", count: breakdowns.rows.length });
      totalCount += breakdowns.rows.length;

      const userScriptAssoc = await sourcePool.query(
        `SELECT id FROM nrm_user_script_assoc WHERE script_data_id = ANY($1) AND user_id = $2`,
        [scriptIdsForProject, project.user_id]
      );
      tableStats.push({ tableName: "nrm_user_script_assoc", count: userScriptAssoc.rows.length });
      totalCount += userScriptAssoc.rows.length;
    }

    // 图片项目：Step3 模特图
    const modelPhotos = await sourcePool.query(
      `SELECT id FROM nrm_model_photos WHERE project_id = $1`,
      [projectId]
    );
    if (modelPhotos.rows.length > 0) {
      tableStats.push({ tableName: "nrm_model_photos", count: modelPhotos.rows.length });
      totalCount += modelPhotos.rows.length;
    }

    // 图片项目：扩展数据
    const imageExt = await sourcePool.query(
      `SELECT id FROM nrm_image_project_ext WHERE project_id = $1`,
      [projectId]
    );
    if (imageExt.rows.length > 0) {
      tableStats.push({ tableName: "nrm_image_project_ext", count: imageExt.rows.length });
      totalCount += imageExt.rows.length;
    }

    // 图片项目：Step4 电商详情页板块
    const pageSections = await sourcePool.query(
      `SELECT id FROM nrm_page_sections WHERE project_id = $1`,
      [projectId]
    );
    if (pageSections.rows.length > 0) {
      tableStats.push({ tableName: "nrm_page_sections", count: pageSections.rows.length });
      totalCount += pageSections.rows.length;
    }

    // 图片项目：板块版本快照
    const sectionVersions = await sourcePool.query(
      `SELECT id FROM nrm_section_versions WHERE project_id = $1`,
      [projectId]
    );
    if (sectionVersions.rows.length > 0) {
      tableStats.push({ tableName: "nrm_section_versions", count: sectionVersions.rows.length });
      totalCount += sectionVersions.rows.length;
    }

    // Step3 帧图片和镜头提示词
    const frameImages = await sourcePool.query(
      `SELECT id FROM nrm_step3_frame_images WHERE project_id = $1`,
      [projectId]
    );
    if (frameImages.rows.length > 0) {
      tableStats.push({ tableName: "nrm_step3_frame_images", count: frameImages.rows.length });
      totalCount += frameImages.rows.length;
    }

    const shotPrompts = await sourcePool.query(
      `SELECT id FROM nrm_shot_prompts WHERE project_id = $1`,
      [projectId]
    );
    if (shotPrompts.rows.length > 0) {
      tableStats.push({ tableName: "nrm_shot_prompts", count: shotPrompts.rows.length });
      totalCount += shotPrompts.rows.length;
    }

    // Step4 视频相关
    const videoScenes = await sourcePool.query(
      `SELECT id FROM nrm_step4_video_scenes WHERE project_id = $1`,
      [projectId]
    );
    if (videoScenes.rows.length > 0) {
      tableStats.push({ tableName: "nrm_step4_video_scenes", count: videoScenes.rows.length });
      totalCount += videoScenes.rows.length;
    }

    const videoMusics = await sourcePool.query(
      `SELECT id FROM nrm_project_video_musics WHERE project_id = $1`,
      [projectId]
    );
    if (videoMusics.rows.length > 0) {
      tableStats.push({ tableName: "nrm_project_video_musics", count: videoMusics.rows.length });
      totalCount += videoMusics.rows.length;
    }

    const finalVideos = await sourcePool.query(
      `SELECT id FROM nrm_final_videos WHERE project_id = $1`,
      [projectId]
    );
    if (finalVideos.rows.length > 0) {
      tableStats.push({ tableName: "nrm_final_videos", count: finalVideos.rows.length });
      totalCount += finalVideos.rows.length;
    }

    // 裂变相关
    const fissionStatus = await sourcePool.query(
      `SELECT id FROM nrm_fission_video_status WHERE project_id = $1`,
      [projectId]
    );
    const fissionStatusIds = fissionStatus.rows.map((r) => r.id);

    if (fissionStatus.rows.length > 0) {
      tableStats.push({ tableName: "nrm_fission_video_status", count: fissionStatus.rows.length });
      totalCount += fissionStatus.rows.length;
    }

    if (fissionStatusIds.length > 0) {
      const fissionTasks = await sourcePool.query(
        `SELECT id FROM nrm_fission_task_items WHERE fission_video_status_id = ANY($1)`,
        [fissionStatusIds]
      );
      tableStats.push({ tableName: "nrm_fission_task_items", count: fissionTasks.rows.length });
      totalCount += fissionTasks.rows.length;
    }

    const fissionVideos = await sourcePool.query(
      `SELECT id FROM nrm_fission_videos WHERE project_id = $1`,
      [projectId]
    );
    if (fissionVideos.rows.length > 0) {
      tableStats.push({ tableName: "nrm_fission_videos", count: fissionVideos.rows.length });
      totalCount += fissionVideos.rows.length;
    }

    log.info({ projectId, totalCount, tableCount: tableStats.length }, "预览完成");

    return {
      configValid: true,
      sourceDbConnected: true,
      targetDbConnected: true,
      structureDiffs,
      tableStats,
      totalCount,
    };
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

// ---------------------------------------------------------------------------
// 执行功能（框架，任务 7 会完善）
// ---------------------------------------------------------------------------

/**
 * 执行迁移
 * 将源库数据插入到目标库
 *
 * @param config 数据库配置
 * @param projectId 项目 ID
 * @returns 执行结果
 */
export async function migrateProjectExecute(
  config: DatabaseConfig,
  projectId: string
): Promise<ExecuteResult> {
  // 验证配置
  if (!config.testDbUrl || !config.prodDbUrl) {
    throw new AppError(400, "INVALID_CONFIG", "数据库配置缺失");
  }

  log.info({ projectId }, "开始执行迁移");

  // 设置类型解析器
  setupPgTypeParser();

  // 创建连接池
  const sourcePool = createPool(config.testDbUrl);
  const targetPool = createPool(config.prodDbUrl);

  try {
    // 检查源库项目是否存在
    const projectResult = await sourcePool.query(
      `SELECT id, name, project_kind, user_id, reverse_script_id, active_script_id FROM nrm_projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new AppError(404, "PROJECT_NOT_FOUND", `项目 ${projectId} 在源库不存在`);
    }

    const project = projectResult.rows[0];
    log.info({ projectId, projectName: project.name, projectKind: project.project_kind }, "找到源项目");

    // 检查目标库是否已存在项目（仅提示，不阻断）
    const prodProject = await targetPool.query(
      `SELECT id, name FROM nrm_projects WHERE id = $1`,
      [projectId]
    );
    if (prodProject.rows.length > 0) {
      log.info(
        { projectId, prodProjectName: prodProject.rows[0].name },
        "项目已存在于目标库，将跳过已有记录"
      );
    }

    // 收集所有数据（按表名存储）
    const data: Record<string, any[]> = {};
    for (const table of MIGRATE_TABLES) {
      data[table] = [];
    }

    // 用于去重的 Set
    const seenGarmentIds = new Set<string>();
    const seenCharacterIds = new Set<string>();
    const seenScriptIds = new Set<string>();

    // 从源库查询数据
    log.info({ projectId }, "开始从源库查询数据");

    // 项目主表
    data["nrm_projects"].push(...projectResult.rows);

    // Step1 服装资产
    const garmentAssoc = await sourcePool.query(
      `SELECT * FROM nrm_project_garment_assoc WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_project_garment_assoc"].push(...garmentAssoc.rows);

    const garmentIds = garmentAssoc.rows
      .map((r) => r.garment_asset_id as string)
      .filter((id) => !seenGarmentIds.has(id));
    for (const gid of garmentIds) seenGarmentIds.add(gid);

    if (garmentIds.length > 0) {
      const garments = await sourcePool.query(
        `SELECT * FROM nrm_garment_assets WHERE id = ANY($1)`,
        [garmentIds]
      );
      data["nrm_garment_assets"].push(...garments.rows);
    }

    // 搭配方案
    const outfitPlans = await sourcePool.query(
      `SELECT * FROM nrm_outfit_plans WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_outfit_plans"].push(...outfitPlans.rows);

    const projectOutfitPlans = await sourcePool.query(
      `SELECT * FROM nrm_project_outfit_plans WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_project_outfit_plans"].push(...projectOutfitPlans.rows);

    // 角色方向卡
    const roleDirectionCards = await sourcePool.query(
      `SELECT * FROM nrm_role_direction_cards WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_role_direction_cards"].push(...roleDirectionCards.rows);

    // Step2 角色库
    const projectCharacters = await sourcePool.query(
      `SELECT * FROM nrm_project_characters WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_project_characters"].push(...projectCharacters.rows);

    const charIds = projectCharacters.rows
      .map((r) => r.library_character_id as string)
      .filter((id) => !seenCharacterIds.has(id));
    for (const cid of charIds) seenCharacterIds.add(cid);

    if (charIds.length > 0) {
      const characters = await sourcePool.query(
        `SELECT * FROM nrm_library_characters WHERE id = ANY($1)`,
        [charIds]
      );
      data["nrm_library_characters"].push(...characters.rows);

      const fiveViews = await sourcePool.query(
        `SELECT * FROM nrm_character_five_views WHERE character_id = ANY($1)`,
        [charIds]
      );
      data["nrm_character_five_views"].push(...fiveViews.rows);
    }

    // 视频项目业务数据
    if (project.project_kind === "video") {
      const videoBusinessData = await sourcePool.query(
        `SELECT * FROM nrm_video_project_business_data WHERE project_id = $1`,
        [projectId]
      );
      data["nrm_video_project_business_data"].push(...videoBusinessData.rows);
    }

    // 换装项目数据
    if (project.project_kind === "outfit_change") {
      const outfitChangeProjects = await sourcePool.query(
        `SELECT * FROM nrm_outfit_change_projects WHERE project_id = $1`,
        [projectId]
      );
      data["nrm_outfit_change_projects"].push(...outfitChangeProjects.rows);

      const taskIds = outfitChangeProjects.rows.map((r) => r.task_id as string);
      if (taskIds.length > 0) {
        const segmentImages = await sourcePool.query(
          `SELECT * FROM nrm_outfit_segment_images WHERE task_id = ANY($1)`,
          [taskIds]
        );
        data["nrm_outfit_segment_images"].push(...segmentImages.rows);

        const segmentVideos = await sourcePool.query(
          `SELECT * FROM nrm_outfit_segment_videos WHERE task_id = ANY($1)`,
          [taskIds]
        );
        data["nrm_outfit_segment_videos"].push(...segmentVideos.rows);
      }
    }

    // 收集所有脚本 ID（支持 reverse 项目）
    const scriptIdsForProject: string[] = [];
    if (project.reverse_script_id) {
      scriptIdsForProject.push(project.reverse_script_id as string);
    }
    if (project.active_script_id && !scriptIdsForProject.includes(project.active_script_id as string)) {
      scriptIdsForProject.push(project.active_script_id as string);
    }

    // 查询脚本关联表
    const scriptAssoc = await sourcePool.query(
      `SELECT * FROM nrm_project_script_assoc WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_project_script_assoc"].push(...scriptAssoc.rows);

    for (const row of scriptAssoc.rows) {
      const sid = row.script_data_id as string;
      if (!scriptIdsForProject.includes(sid)) {
        scriptIdsForProject.push(sid);
      }
    }

    // 查询脚本数据（去重）
    const newScriptIds = scriptIdsForProject.filter((id) => !seenScriptIds.has(id));
    for (const sid of newScriptIds) seenScriptIds.add(sid);

    if (newScriptIds.length > 0) {
      const scripts = await sourcePool.query(
        `SELECT * FROM nrm_script_data WHERE id = ANY($1)`,
        [newScriptIds]
      );
      data["nrm_script_data"].push(...scripts.rows);

      // 分镜数据
      const breakdowns = await sourcePool.query(
        `SELECT * FROM nrm_shot_breakdown WHERE script_data_id = ANY($1)`,
        [newScriptIds]
      );
      data["nrm_shot_breakdown"].push(...breakdowns.rows);

      // 用户脚本收藏
      const userScriptAssoc = await sourcePool.query(
        `SELECT * FROM nrm_user_script_assoc WHERE script_data_id = ANY($1) AND user_id = $2`,
        [newScriptIds, project.user_id]
      );
      data["nrm_user_script_assoc"].push(...userScriptAssoc.rows);
    }

    // 图片项目：Step3 模特图
    const modelPhotos = await sourcePool.query(
      `SELECT * FROM nrm_model_photos WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_model_photos"].push(...modelPhotos.rows);

    // 图片项目：扩展数据
    const imageExt = await sourcePool.query(
      `SELECT * FROM nrm_image_project_ext WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_image_project_ext"].push(...imageExt.rows);

    // 图片项目：Step4 电商详情页板块
    const pageSections = await sourcePool.query(
      `SELECT * FROM nrm_page_sections WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_page_sections"].push(...pageSections.rows);

    // 图片项目：板块版本快照
    const sectionVersions = await sourcePool.query(
      `SELECT * FROM nrm_section_versions WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_section_versions"].push(...sectionVersions.rows);

    // Step3 帧图片和镜头提示词
    const frameImages = await sourcePool.query(
      `SELECT * FROM nrm_step3_frame_images WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_step3_frame_images"].push(...frameImages.rows);

    const shotPrompts = await sourcePool.query(
      `SELECT * FROM nrm_shot_prompts WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_shot_prompts"].push(...shotPrompts.rows);

    // Step4 视频相关
    const videoScenes = await sourcePool.query(
      `SELECT * FROM nrm_step4_video_scenes WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_step4_video_scenes"].push(...videoScenes.rows);

    const videoMusics = await sourcePool.query(
      `SELECT * FROM nrm_project_video_musics WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_project_video_musics"].push(...videoMusics.rows);

    const finalVideos = await sourcePool.query(
      `SELECT * FROM nrm_final_videos WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_final_videos"].push(...finalVideos.rows);

    // 裂变相关
    const fissionStatus = await sourcePool.query(
      `SELECT * FROM nrm_fission_video_status WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_fission_video_status"].push(...fissionStatus.rows);

    const fissionStatusIds = fissionStatus.rows.map((r) => r.id as string);
    if (fissionStatusIds.length > 0) {
      const fissionTasks = await sourcePool.query(
        `SELECT * FROM nrm_fission_task_items WHERE fission_video_status_id = ANY($1)`,
        [fissionStatusIds]
      );
      data["nrm_fission_task_items"].push(...fissionTasks.rows);
    }

    const fissionVideos = await sourcePool.query(
      `SELECT * FROM nrm_fission_videos WHERE project_id = $1`,
      [projectId]
    );
    data["nrm_fission_videos"].push(...fissionVideos.rows);

    // 统计总数据量
    let totalCount = 0;
    for (const table of MIGRATE_TABLES) {
      totalCount += data[table].length;
    }
    log.info({ projectId, totalCount }, "数据查询完成");

    // 获取目标库的 JSONB 列和实际列名
    const jsonbColumnsMap: Record<string, string[]> = {};
    const tableColumnsMap: Record<string, Set<string> | null> = {};

    for (const table of MIGRATE_TABLES) {
      try {
        jsonbColumnsMap[table] = await getJsonbColumns(targetPool, table);
        const colResult = await targetPool.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [table]
        );
        tableColumnsMap[table] = new Set(colResult.rows.map((r) => r.column_name as string));
      } catch {
        jsonbColumnsMap[table] = [];
        tableColumnsMap[table] = null;
      }
    }

    // 收集需要更新 active_five_view_id 的角色
    const charactersNeedUpdate: Array<{ characterId: string; activeFiveViewId: string }> = [];

    // 逐表插入，每条独立处理
    let insertedCount = 0;
    let skippedCount = 0;
    const failedTables: string[] = [];

    log.info({ projectId }, "开始插入数据到目标库");

    for (const table of MIGRATE_TABLES) {
      if (data[table].length === 0) continue;

      const rows = data[table];
      const jsonbCols = jsonbColumnsMap[table];
      const targetCols = tableColumnsMap[table];
      let tableInserted = 0;
      let tableSkipped = 0;

      for (const row of rows) {
        // 过滤掉目标库不存在的列
        let columns = Object.keys(row).filter((col) => !targetCols || targetCols.has(col));

        // 特殊处理：nrm_library_characters 插入时临时去掉 active_five_view_id
        // 因为五视图还没插入，外键约束会失败
        let originalActiveFiveViewId: string | null = null;
        if (table === "nrm_library_characters" && row.active_five_view_id) {
          originalActiveFiveViewId = row.active_five_view_id as string;
          columns = columns.filter((col) => col !== "active_five_view_id");
        }

        // 构建插入值
        const values = columns.map((col) => {
          const val = row[col];
          // JSONB 列需要转为字符串
          if (jsonbCols.includes(col) && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });

        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const colList = columns.join(", ");

        try {
          await targetPool.query(
            `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
            values
          );
          tableInserted++;

          // 记录需要后续更新 active_five_view_id 的角色
          if (table === "nrm_library_characters" && originalActiveFiveViewId) {
            charactersNeedUpdate.push({
              characterId: row.id as string,
              activeFiveViewId: originalActiveFiveViewId,
            });
          }
        } catch (e: any) {
          // 唯一键冲突：已有数据，跳过
          if (e.code === "23505") {
            tableSkipped++;
            // 已有角色如果有 active_five_view_id，也需要检查是否需要更新
            if (table === "nrm_library_characters" && row.active_five_view_id) {
              charactersNeedUpdate.push({
                characterId: row.id as string,
                activeFiveViewId: row.active_five_view_id as string,
              });
            }
          } else {
            // 其他错误记录失败表
            log.error(
              { table, rowId: row.id, error: e.message, code: e.code },
              "插入数据失败"
            );
            failedTables.push(table);
            // 不继续处理该表的后续数据，避免大量失败
            break;
          }
        }
      }

      insertedCount += tableInserted;
      skippedCount += tableSkipped;

      log.info(
        { table, inserted: tableInserted, skipped: tableSkipped },
        `表 ${table} 完成`
      );

      // 在插入完 nrm_character_five_views 后，更新角色的 active_five_view_id
      if (table === "nrm_character_five_views" && charactersNeedUpdate.length > 0) {
        log.info(
          { count: charactersNeedUpdate.length },
          "开始更新角色 active_five_view_id"
        );
        for (const { characterId, activeFiveViewId } of charactersNeedUpdate) {
          try {
            await targetPool.query(
              `UPDATE nrm_library_characters SET active_five_view_id = $1 WHERE id = $2`,
              [activeFiveViewId, characterId]
            );
          } catch (e: any) {
            // 如果更新失败（如五视图不存在），仅警告不阻断
            log.warn(
              { characterId, activeFiveViewId, error: e.message },
              "更新角色 active_five_view_id 失败"
            );
          }
        }
        log.info("active_five_view_id 更新完成");
      }
    }

    const success = failedTables.length === 0;

    log.info(
      {
        projectId,
        success,
        insertedCount,
        skippedCount,
        totalCount,
        failedTables,
      },
      "迁移执行完成"
    );

    return {
      success,
      insertedCount,
      skippedCount,
      totalCount,
      failedTables,
      errorMessage: success ? undefined : `部分表插入失败: ${failedTables.join(", ")}`,
    };
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}