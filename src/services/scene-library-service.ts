// src/services/scene-library-service.ts
/**
 * 场景库核心服务
 * 提供场景特征提取、upsert、用户反馈分析等业务逻辑
 */

import type { PgSceneLibraryRepository } from "../repositories/pg/scene-library-pg-repository.js";
import { randomUUID } from "crypto";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SceneLibraryService");

/** 场景特征数据 */
export interface SceneFeature {
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
  trendPeriod: string;
  source: string;
  sourceMetadata: Record<string, unknown>;
  sourceImageUrl?: string;
  ossImageUrl?: string;
}

/** 场景特征提取结果（供分镜使用） */
export interface SceneFeaturesResult {
  recommendedScenes: Array<{
    sceneName: string;
    sceneDescription: string;
    sceneCategory: string;
    lightingType: string;
  }>;
}

/**
 * 场景库核心服务
 */
export class SceneLibraryService {
  constructor(private repo: PgSceneLibraryRepository) {}

  /**
   * 提取高热度场景特征（供 Step3 分镜使用）
   * 按适用类型和热度筛选，返回推荐场景列表
   */
  async extractSceneFeatures(
    suitability: string[] = ["clothing", "beauty"],
    trendPeriod: string = "current",
  ): Promise<SceneFeaturesResult> {
    const currentPeriod = trendPeriod === "current" ? this.getCurrentQuarter() : trendPeriod;

    const rows = await this.repo.extractFeatures(suitability, currentPeriod);

    if (rows.length === 0) {
      log.warn({ suitability, trendPeriod: currentPeriod }, "未找到匹配的高热度场景，返回空结果");
      return { recommendedScenes: [] };
    }

    // 每个场景类型最多取 2 个，保证多样性
    const categoryCount: Record<string, number> = {};
    const scenes: SceneFeaturesResult["recommendedScenes"] = [];

    for (const row of rows) {
      const cat = row.sceneCategory;
      if ((categoryCount[cat] || 0) >= 2) continue;
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;

      scenes.push({
        sceneName: row.sceneNameCn || row.sceneName,
        sceneDescription: row.sceneDescriptionCn || row.sceneDescription,
        sceneCategory: row.sceneCategoryCn || row.sceneCategory,
        lightingType: row.lightingType || "natural",
      });
    }

    log.info({ suitability, scenesFound: scenes.length }, "场景特征提取完成");
    return { recommendedScenes: scenes };
  }

  /**
   * upsert 场景特征（爬取/手动添加共用）
   * 按 scene_name 去重，存在则更新热度/元数据
   */
  async upsertSceneFeature(feature: SceneFeature): Promise<void> {
    const now = Date.now();

    await this.repo.upsertFeature({
      id: randomUUID(),
      sceneCategory: feature.sceneCategory,
      sceneCategoryCn: feature.sceneCategoryCn ?? null,
      sceneName: feature.sceneName,
      sceneNameCn: feature.sceneNameCn ?? null,
      sceneDescription: feature.sceneDescription,
      sceneDescriptionCn: feature.sceneDescriptionCn ?? null,
      sceneTags: feature.sceneTags,
      lightingType: feature.lightingType ?? null,
      suitability: feature.suitability,
      popularityScore: feature.popularityScore,
      trendPeriod: feature.trendPeriod,
      source: feature.source,
      sourceMetadata: feature.sourceMetadata,
      sourceImageUrl: feature.sourceImageUrl ?? null,
      ossImageUrl: feature.ossImageUrl ?? null,
      now,
    });
  }

  /**
   * 分析用户反馈，动态调整场景热度评分
   */
  async analyzeUserFeedback(
    generatedScenes: string[],
    userRating: number,
  ): Promise<void> {
    const now = Date.now();

    // 高分（>=4 星）：增加热度
    if (userRating >= 4) {
      for (const sceneDesc of generatedScenes) {
        await this.repo.adjustPopularityByFeedback(sceneDesc, 0.05, now);
      }
    }

    // 低分（<=2 星）：降低热度
    if (userRating <= 2) {
      for (const sceneDesc of generatedScenes) {
        await this.repo.adjustPopularityByFeedback(sceneDesc, -0.1, now);
      }

      // 自动淘汰低热度场景
      await this.repo.deactivateLowPopularity(now);
    }
  }

  /** 获取当前季度 */
  private getCurrentQuarter(): string {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `${year}-q${quarter}`;
  }
}
