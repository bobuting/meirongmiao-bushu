/**
 * 场景推荐合并工具
 * 场景库（真实热度数据）+ 硬编码场景（可靠覆盖）互为补充
 */

import type { PgSceneLibraryRepository } from "../../../repositories/pg/scene-library-pg-repository.js";
import { SceneLibraryService } from "../../../services/scene-library-service.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("scene-recommender");

/** 场景推荐结果 */
export interface SceneRecommendation {
  /** 格式化的推荐场景文本，直接注入 Skill 模板 */
  sceneText: string;
  /** 场景库命中的场景数量 */
  libraryHitCount: number;
}

/**
 * 合并场景库推荐和硬编码场景，互为补充
 * - 场景库有数据时：库数据在前，硬编码补足
 * - 场景库无数据时：仅硬编码场景
 */
export async function getMergedSceneRecommendation(
  sceneLibraryRepo: PgSceneLibraryRepository,
  options: {
    /** 场景适用类型，如 ["clothing", "fashion"] */
    suitability: string[];
    /** 硬编码场景列表（作为补充） */
    fallbackScenes: readonly string[];
    /** 最多返回多少个场景，默认 6 */
    maxScenes?: number;
  },
): Promise<SceneRecommendation> {
  const { suitability, fallbackScenes, maxScenes = 6 } = options;

  const libraryScenes: string[] = [];

  // 查询场景库
  try {
    const service = new SceneLibraryService(sceneLibraryRepo);
    const result = await service.extractSceneFeatures(suitability, "current");

    for (const scene of result.recommendedScenes) {
      libraryScenes.push(
        `${scene.sceneName}（${scene.sceneCategory}，光线：${scene.lightingType}）：${scene.sceneDescription}`,
      );
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), suitability },
      "场景库查询失败，仅使用硬编码场景",
    );
  }

  // 硬编码场景补足不足部分
  const remaining = maxScenes - libraryScenes.length;
  const fallbackPicked = remaining > 0 ? fallbackScenes.slice(0, remaining) : [];
  const allScenes = [...libraryScenes, ...fallbackPicked];

  return {
    sceneText: allScenes.length > 0
      ? allScenes.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "",
    libraryHitCount: libraryScenes.length,
  };
}
