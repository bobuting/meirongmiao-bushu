/**
 * 情感原型库服务
 * 负责从数据库提取原型、用户反馈分析、流行度计算
 */

import type { PgEmotionArchetypeLibraryRepository } from "../repositories/pg/emotion-archetype-pg-repository.js";
import type { EmotionArchetype } from "../modules/video-step/step3-emotion-archetype/types.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("EmotionArchetypeLibraryService");

// ========== 类型定义 ==========

/** 情感原型数据库实体 */
export interface EmotionArchetypeEntity extends EmotionArchetype {
  popularityScore: number;
  useCount: number;
  avgUserRating: number | null;
  lastUsedAt: number | null;
  isActive: boolean;
  source: string;
  sourceMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** 用户反馈分析参数 */
export interface UserFeedbackParams {
  archetypeId: string;
  userRating: number; // 1-5星
  scriptQualityScore: number; // 0-100
}

/** 流行度更新结果 */
export interface PopularityUpdateResult {
  archetypeId: string;
  oldScore: number;
  newScore: number;
  deactivated: boolean;
}

// ========== 服务类 ==========

export class EmotionArchetypeLibraryService {
  constructor(private readonly repo: PgEmotionArchetypeLibraryRepository) {}

  // ========== 提取原型 ==========

  /**
   * 从数据库提取高流行度原型（popularity_score >= 0.5）
   * 用于 Step3 情感原型策略
   */
  async extractHighPopularityArchetypes(
    characterAge?: number,
    characterGender?: "male" | "female",
    outfitStyle?: string,
    excludeIds?: string[],
  ): Promise<EmotionArchetypeEntity[]> {
    const rows = await this.repo.findHighPopularity({
      excludeIds,
      characterAge,
      characterGender,
      outfitStyle,
    });
    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * 随机选择一个原型（用于多样性）
   */
  async selectRandomArchetype(
    excludeIds?: string[],
    characterAge?: number,
    characterGender?: "male" | "female",
  ): Promise<EmotionArchetypeEntity | null> {
    const archetypes = await this.extractHighPopularityArchetypes(
      characterAge,
      characterGender,
      undefined,
      excludeIds,
    );

    if (archetypes.length === 0) {
      log.info("所有原型已使用，重置选择池");
      const resetArchetypes = await this.extractHighPopularityArchetypes(
        characterAge,
        characterGender,
        undefined,
        [],
      );
      return resetArchetypes.length > 0 ? resetArchetypes[0] : null;
    }

    return archetypes[0];
  }

  // ========== 用户反馈分析 ==========

  /**
   * 分析用户评分，动态调整原型流行度
   * 实时执行（每次情感原型脚本生成完成后）
   */
  async analyzeUserFeedback(params: UserFeedbackParams): Promise<PopularityUpdateResult> {
    const { archetypeId, userRating, scriptQualityScore } = params;

    // 1. 查询当前流行度
    const currentRow = await this.repo.findById(archetypeId);
    if (!currentRow) {
      throw new Error(`原型不存在: ${archetypeId}`);
    }

    const oldScore = currentRow.popularityScore;
    const wasActive = currentRow.isActive;

    // 2. 更新使用次数
    await this.repo.incrementUseCount(archetypeId, Date.now());

    // 3. 更新平均评分（增量计算）
    await this.repo.updateAvgRating(archetypeId, userRating);

    // 4. 高分案例（>=4星）：提升流行度
    let newScore = oldScore;
    const now = Date.now();
    if (userRating >= 4 && scriptQualityScore >= 70) {
      newScore = Math.min(1.0, oldScore + 0.05);
      await this.repo.updatePopularity(archetypeId, newScore, now);
      log.info({ archetypeId, oldScore, newScore }, "高分案例，提升流行度");
    }

    // 5. 低分案例（<=2星）：降低流行度
    if (userRating <= 2 || scriptQualityScore < 50) {
      newScore = Math.max(0.0, oldScore - 0.1);
      await this.repo.updatePopularity(archetypeId, newScore, now);
      log.warn({ archetypeId, oldScore, newScore }, "低分案例，降低流行度");

      // 流行度过低（< 0.3）→ 自动淘汰
      if (newScore < 0.3) {
        await this.repo.deactivateById(archetypeId, now);
        log.warn({ archetypeId }, "流行度过低，自动淘汰");
      }
    }

    return {
      archetypeId,
      oldScore,
      newScore,
      deactivated: newScore < 0.3 && wasActive,
    };
  }

  // ========== 流行度计算 ==========

  /**
   * 重新计算所有原型的综合流行度（每日后置任务调用）
   * 基于使用次数 + 平均评分 + 最后使用时间
   */
  async recalculateAllPopularityScores(): Promise<number> {
    const updatedCount = await this.repo.recalculateAllPopularity();
    log.info(`重新计算流行度完成，更新 ${updatedCount} 个原型`);
    return updatedCount;
  }

  /**
   * 自动淘汰低流行度原型（popularity_score < 0.3 且超过30天未使用）
   */
  async deactivateLowPopularityArchetypes(): Promise<number> {
    const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30天前
    const deactivatedCount = await this.repo.deactivateLowPopularityLongUnused(cutoffTime, Date.now());
    log.info(`淘汰低流行度原型 ${deactivatedCount} 个`);
    return deactivatedCount;
  }

  // ========== 工具方法 ==========

  /**
   * 创建或更新原型（入库）
   */
  async upsertArchetype(archetype: Partial<EmotionArchetypeEntity>): Promise<void> {
    await this.repo.upsertArchetype({
      id: archetype.id!,
      name: archetype.name!,
      category: archetype.category!,
      emotionCore: archetype.emotionCore!,
      moment: archetype.moment!,
      conflict: archetype.conflict!,
      clothingRole: archetype.clothingRole!,
      visualCues: archetype.visualCues || [],
      duration: archetype.duration!,
      shotCount: archetype.shotCount!,
      syncMode: archetype.syncMode!,
      suitableStyles: archetype.suitableStyles || ["所有风格"],
      suitableAge: archetype.suitableAge || ["18-45"],
      suitableGender: archetype.suitableGender || ["male", "female"],
      popularityScore: archetype.popularityScore || 0.6,
      useCount: archetype.useCount || 0,
      isActive: archetype.isActive ?? true,
      source: archetype.source || "manual",
      sourceMetadata: archetype.sourceMetadata || {},
    });
  }

  /**
   * 数据库行转换为实体
   */
  private mapRowToEntity(row: Record<string, unknown>): EmotionArchetypeEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      category: row.category as EmotionArchetype["category"],
      emotionCore: row.emotion_core as string,
      moment: row.moment as string,
      conflict: row.conflict as string,
      clothingRole: row.clothing_role as string,
      visualCues: this.parseJsonbArray(row.visual_cues),
      duration: row.duration as string,
      shotCount: row.shot_count as number,
      syncMode: row.sync_mode as EmotionArchetype["syncMode"],
      suitableStyles: this.parseJsonbArray(row.suitable_styles),
      suitableAge: this.parseJsonbArray(row.suitable_age),
      suitableGender: this.parseJsonbArray(row.suitable_gender),
      popularityScore: Number(row.popularity_score),
      useCount: row.use_count as number,
      avgUserRating: row.avg_user_rating ? Number(row.avg_user_rating) : null,
      lastUsedAt: row.last_used_at as number | null,
      isActive: row.is_active as boolean,
      source: row.source as string,
      sourceMetadata: row.source_metadata as Record<string, unknown>,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  /**
   * 解析 JSONB 数组
   */
  private parseJsonbArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as string[];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
