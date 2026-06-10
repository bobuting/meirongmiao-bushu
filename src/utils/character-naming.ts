/**
 * 角色命名统一工具
 * 格式：{服饰描述}-{搭配方案标题}-{性别中文}-{年龄}-槽位{N}
 */

const GENDER_ZH: Record<string, string> = { male: "男", female: "女", unknown: "未知" };

export interface CharacterNameParams {
  outfitDescription?: string | null;
  outfitPlanTitle?: string | null;
  gender?: string | null;
  age?: number | string | null;
  slot?: number;
}

export function buildCharacterName(params: CharacterNameParams): string {
  const parts: string[] = [];
  if (params.outfitDescription) parts.push(params.outfitDescription);
  if (params.outfitPlanTitle) parts.push(params.outfitPlanTitle);
  if (params.gender) parts.push(GENDER_ZH[params.gender] ?? params.gender);
  if (params.age != null) parts.push(String(params.age));
  if (params.slot) parts.push(`槽位${params.slot}`);
  if (parts.length === 0) return "角色";
  return parts.join('-');
}
