/**
 * 情感原型库迁移脚本
 * 将硬编码的65个情感原型迁移到数据库
 */

import type { PgEmotionArchetypeLibraryRepository } from "../repositories/pg/emotion-archetype-pg-repository.js";
import { EMOTION_ARCHETYPE_LIBRARY } from "../modules/video-step/step3-emotion-archetype/archetype-library.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("EmotionArchetypeMigration");

/**
 * 迁移硬编码原型到数据库
 */
export async function migrateHardcodedArchetypesToDatabase(repo: PgEmotionArchetypeLibraryRepository): Promise<{
  success: boolean;
  migratedCount: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    log.info(`开始迁移 ${EMOTION_ARCHETYPE_LIBRARY.length} 个情感原型到数据库`);

    const now = Date.now();
    let migratedCount = 0;

    // 批量插入（每个原型单独插入，避免SQL过长）
    for (const archetype of EMOTION_ARCHETYPE_LIBRARY) {
      await repo.upsertFromMigration({
        id: archetype.id,
        name: archetype.name,
        category: archetype.category,
        emotionCore: archetype.emotionCore,
        moment: archetype.moment,
        conflict: archetype.conflict,
        clothingRole: archetype.clothingRole,
        visualCues: archetype.visualCues,
        duration: archetype.duration,
        shotCount: archetype.shotCount,
        syncMode: archetype.syncMode,
        suitableStyles: archetype.suitableStyles,
        suitableAge: archetype.suitableAge,
        suitableGender: archetype.suitableGender,
        popularityScore: 0.7,
        useCount: 0,
        isActive: true,
        source: 'manual',
        now,
      });

      migratedCount++;
      log.info(`迁移原型 ${archetype.id}: ${archetype.name}`);
    }

    const durationMs = Date.now() - startTime;
    log.info(`迁移完成：${migratedCount} 个原型，耗时 ${Math.round(durationMs / 1000)} 秒`);

    return {
      success: true,
      migratedCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMessage }, "迁移失败");

    return {
      success: false,
      migratedCount: 0,
      error: errorMessage,
    };
  }
}

/**
 * 验证迁移结果
 */
export async function verifyMigration(repo: PgEmotionArchetypeLibraryRepository): Promise<{
  totalCount: number;
  categoryCount: Record<string, number>;
  activeCount: number;
}> {
  return repo.findMigrationVerification();
}