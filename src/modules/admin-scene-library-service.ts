// src/modules/admin-scene-library-service.ts
/**
 * 场景库后台管理服务
 * 提供统计数据、场景 CRUD、热度排行等业务逻辑
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";

const log = getLogger("AdminSceneLibraryService");

/** 场景分类类型 */
export type SceneCategory = "indoor" | "outdoor" | "e_commerce" | "studio" | "lifestyle" | "commercial";

/** 统计数据结果 */
export interface SceneStatisticsResult {
  totalCount: number;
  categoryDistribution: Record<string, number>;
  recentUpdates: number;
}

/** 场景列表项 */
export interface SceneListItem {
  id: string;
  sceneCategory: string;
  sceneCategoryCn?: string;
  sceneName: string;
  sceneNameCn?: string;
  sceneDescription: string;
  sceneDescriptionCn?: string;
  sceneTags: string[];
  lightingType?: string;
  suitability: string[];
  popularityScore: number;
  source: string;
  sourceImageUrl?: string;
  ossImageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

/** 场景列表结果（分页） */
export interface SceneListResult {
  items: SceneListItem[];
  total: number;
  page: number;
  limit: number;
}

/** 添加场景输入 */
export interface AddSceneInput {
  sceneCategory: SceneCategory;
  sceneCategoryCn?: string;
  sceneName: string;
  sceneNameCn?: string;
  sceneDescription: string;
  sceneDescriptionCn?: string;
  sceneTags?: string[];
  lightingType?: string;
  suitability?: string[];
}

/** 编辑场景输入 */
export interface EditSceneInput {
  sceneName?: string;
  sceneDescription?: string;
  sceneTags?: string[];
  lightingType?: string;
  suitability?: string[];
  popularityScore?: number;
}

/** 热度排行项 */
export interface SceneRankingItem {
  id: string;
  sceneName: string;
  sceneNameCn?: string;
  popularityScore: number;
  trendPeriod: string;
}

/** 场景分类中文名映射 */
export const SCENE_CATEGORY_LABELS: Record<SceneCategory, string> = {
  indoor: "室内场景",
  outdoor: "室外场景",
  e_commerce: "电商场景",
  studio: "影棚/直播间",
  lifestyle: "生活场景",
  commercial: "商业场景",
};

/**
 * 场景库后台管理服务
 */
export class AdminSceneLibraryService {
  constructor(private repos: PgRepositoryCollection) {}

  /**
   * 获取统计数据
   */
  async getStatistics(): Promise<SceneStatisticsResult> {
    return this.repos.sceneLibrary.getStatistics();
  }

  /**
   * 获取场景列表（分页）
   */
  async listScenes(params: {
    sceneCategory?: SceneCategory;
    page: number;
    limit: number;
  }): Promise<SceneListResult> {
    const { items, total } = await this.repos.sceneLibrary.findPaginated(params);

    log.info({ page: params.page, total }, "场景列表查询完成");

    return {
      items: items.map((row) => ({
        id: row.id as string,
        sceneCategory: row.scene_category as string,
        sceneCategoryCn: (row.scene_category_cn as string) || undefined,
        sceneName: row.scene_name as string,
        sceneNameCn: (row.scene_name_cn as string) || undefined,
        sceneDescription: row.scene_description as string,
        sceneDescriptionCn: (row.scene_description_cn as string) || undefined,
        sceneTags: (row.scene_tags as string[]) || [],
        lightingType: (row.lighting_type as string) || undefined,
        suitability: (row.suitability as string[]) || [],
        popularityScore: parseFloat(String(row.popularity_score)),
        source: row.source as string,
        sourceImageUrl: (row.source_image_url as string) || undefined,
        ossImageUrl: (row.oss_image_url as string) || undefined,
        createdAt: row.created_at as number,
        updatedAt: row.updated_at as number,
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * 添加新场景
   */
  async addScene(data: AddSceneInput): Promise<{ id: string }> {
    const now = Date.now();
    const id = crypto.randomUUID();

    await this.repos.sceneLibrary.createScene({
      id,
      sceneCategory: data.sceneCategory,
      sceneCategoryCn: data.sceneCategoryCn || SCENE_CATEGORY_LABELS[data.sceneCategory],
      sceneName: data.sceneName,
      sceneNameCn: data.sceneNameCn ?? null,
      sceneDescription: data.sceneDescription,
      sceneDescriptionCn: data.sceneDescriptionCn ?? null,
      sceneTags: data.sceneTags || [],
      lightingType: data.lightingType ?? null,
      suitability: data.suitability || ["clothing"],
      popularityScore: 0,
      trendPeriod: this.getCurrentQuarter(),
      source: "manual",
      sourceMetadata: {},
      now,
    });

    log.info({ id, sceneCategory: data.sceneCategory, sceneName: data.sceneName }, "新场景添加完成");
    return { id };
  }

  /**
   * 编辑场景
   */
  async editScene(id: string, data: EditSceneInput): Promise<{ success: boolean }> {
    const success = await this.repos.sceneLibrary.updateScene(id, data, Date.now());
    if (!success) {
      throw new AppError(400, "NO_UPDATE_FIELDS", "编辑请求无有效更新字段或场景不存在");
    }
    return { success };
  }

  /**
   * 删除场景（软删除）
   */
  async deleteScene(id: string): Promise<{ success: boolean }> {
    const success = await this.repos.sceneLibrary.softDelete(id, Date.now());
    return { success };
  }

  /**
   * 获取热度排行
   */
  async getPopularityRanking(params: {
    sceneCategory?: SceneCategory;
    limit: number;
  }): Promise<SceneRankingItem[]> {
    const rows = await this.repos.sceneLibrary.findPopularityRanking(params);
    return rows.map((row) => ({
      id: row.id as string,
      sceneName: row.scene_name as string,
      sceneNameCn: (row.scene_name_cn as string) || undefined,
      popularityScore: parseFloat(String(row.popularity_score)),
      trendPeriod: row.trend_period as string,
    }));
  }

  private getCurrentQuarter(): string {
    const now = new Date();
    return `${now.getFullYear()}-q${Math.ceil((now.getMonth() + 1) / 3)}`;
  }
}