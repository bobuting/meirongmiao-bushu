import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";

/**
 * 从数据库查询项目选中角色的五视图 + 服饰平铺图
 * 作为分镜预览的参考图，不再依赖前端传递
 *
 * 返回分离结构：
 * - characterReferenceImages: 角色五视图（用于锚定角色造型）- 必传
 * - garmentReferenceImages: 服饰平铺图（用于锚定服饰细节）- 必传
 *
 * 如果五视图或平铺图缺失，直接报错
 */
export async function resolveProjectReferenceImages(
  ctx: AppContext,
  project: { id: string; selectedCharacterId: string | null },
): Promise<{
  characterReferenceImages: string[];
  garmentReferenceImages: string[];
}> {
  const characterReferenceImages: string[] = [];
  const garmentReferenceImages: string[] = [];

  // 查角色五视图（必传）
  if (!project.selectedCharacterId) {
    throw new AppError(400, "CHARACTER_NOT_SELECTED", "请先在 Step2 选择角色");
  }
  const character = await ctx.repos.libraryCharacters.findById(project.selectedCharacterId);
  if (!character?.fiveViewOssImageUrl?.trim()) {
    throw new AppError(400, "CHARACTER_FIVE_VIEW_MISSING", "所选角色缺少五视图图片，请重新生成角色定妆");
  }
  characterReferenceImages.push(character.fiveViewOssImageUrl.trim());

  // 查服饰平铺图（必传）
  const assocs = await ctx.repos.projectGarmentAssocs.findByProjectId(project.id);
  if (assocs.length === 0) {
    throw new AppError(400, "GARMENT_NOT_SELECTED", "请先在 Step1 选择服饰");
  }
  const garmentIds = assocs.map((a) => a.garmentAssetId);
  const garments = await ctx.repos.garmentAssets.findByIds(garmentIds);

  for (const g of garments) {
    if (!g.flatLayImageUrl?.trim()) {
      throw new AppError(400, "GARMENT_FLAT_LAY_MISSING", `服饰「${g.name || g.id}」缺少平铺图，请重新生成服饰平铺图`);
    }
    garmentReferenceImages.push(g.flatLayImageUrl.trim());
  }

  return {
    characterReferenceImages,
    garmentReferenceImages,
  };
}
