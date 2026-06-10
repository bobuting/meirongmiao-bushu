/**
 * admin-helpers.ts
 *
 * 从 app.ts 提取的管理员辅助函数。
 */

import type { ScriptData } from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";

export async function toAdminScriptItem(
  ctx: AppContext,
  item: ScriptData,
): Promise<{
  id: string;
  title: string;
  tags: string[];
  content: string;
  ownerId: string;
  ownerEmail: string;
  date: number;
  status: string;
}> {
  const owner = await ctx.repos.users.findById(item.userId);
  return {
    id: item.id,
    title: item.title,
    tags: item.tags,
    content: item.content,
    ownerId: item.userId,
    ownerEmail: owner?.email ?? "unknown",
    date: item.updatedAt,
    status: "generated",
  };
}