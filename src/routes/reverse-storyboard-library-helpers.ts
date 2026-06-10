/**
 * 反推分镜库辅助函数
 *
 * 从 library-asset-handlers.ts 提取的反推分镜库相关辅助函数，
 * 用于 library-routes.ts 中的反推分镜库路由处理。
 */

import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";
import {
  collectLegacyVideoReverseRecords,
  migrateLegacyVideoReverseRecords,
} from "../modules/reverse-storyboard-legacy-compat.js";

/**
 * 将反推分镜库记录转换为 DTO 格式
 */
export function toReverseStoryboardLibraryRecordDto(
  ctx: AppContext,
  user: User,
  itemId: string,
): Record<string, unknown> {
  const item = ctx.reverseStoryboardLibraryService.get(user, itemId);
  return {
    ...item,
    currentVersion: ctx.reverseStoryboardLibraryService.getCurrentVersion(user, itemId),
  };
}

/**
 * 确保旧版反推分镜记录兼容迁移
 *
 * 将旧版的视频反推记录迁移到新的反推分镜库中。
 */
export async function ensureLegacyReverseStoryboardLibraryCompatibility(
  ctx: AppContext,
  user: User,
): Promise<{ readonly createdItemIds: readonly string[]; readonly skippedScriptIds: readonly string[] }> {
  const migration = await migrateLegacyVideoReverseRecords({
    legacyRecords: collectLegacyVideoReverseRecords(await ctx.scriptLibraryService.list()),
    existingItems: await ctx.reverseStoryboardLibraryService.list(user),
    createItem: (record) =>
      ctx.reverseStoryboardLibraryService.create(user, {
        id: record.itemId,
        title: record.title,
        summary: record.summary,
        tags: record.tags,
        sourceType: record.sourceType,
        sourceMeta: record.sourceMeta,
        report: record.report,
        content: record.content,
      }),
  });
  return migration;
}