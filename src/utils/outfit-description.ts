/**
 * 根据项目 ID 查询关联的服饰资产，生成简短的服饰描述
 */
import type { AppContext } from "../core/app-context.js";

export interface OutfitDescriptionResult {
  /** 简要描述，如 "运动休闲特步少年运动T恤" 或 "街头工装裤" */
  description: string | null;
}

export async function getOutfitDescription(
  ctx: AppContext,
  projectId: string,
): Promise<OutfitDescriptionResult> {
  const assocs = await ctx.repos.projectGarmentAssocs.findByProjectId(projectId);
  if (assocs.length === 0) return { description: null };

  const garmentIds = assocs.map((a) => a.garmentAssetId);
  const garments = await ctx.repos.garmentAssets.findByIds(garmentIds);
  if (garments.length === 0) return { description: null };

  const parts = garments.slice(0, 2).map((g) => {
    const segments: string[] = [];
    if (g.style) segments.push(g.style);
    if (g.name) segments.push(g.name);
    return segments.length > 0 ? segments.join('') : null;
  }).filter(Boolean);

  return { description: parts.length > 0 ? parts.join('+') : null };
}
