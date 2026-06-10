/**
 * 角色库匹配服务
 *
 * 根据角色预设的性别和年龄匹配角色库角色，
 * 性别精确匹配 + 年龄匹配（±3 岁），从结果集中随机选取。
 * 只返回有五视图的角色（fiveViewOssImageUrl 非空）。
 */

import type { LibraryCharacter } from "../contracts/types.js";

/**
 * 匹配输入
 */
export interface OutfitMatchInput {
  /** 用户的全部角色库 */
  libraryCharacters: LibraryCharacter[];
  /** 已排除的角色 ID 列表（通常是项目中已显示的生成角色） */
  excludeIds?: string[];
  /** 角色预设性别（male/female/unknown），用于过滤 */
  gender?: string;
  /** 角色预设年龄，用于精确匹配 */
  age?: number;
}

/**
 * 匹配结果
 */
export interface OutfitMatchResult {
  /** 匹配到的角色 ID 列表（随机顺序） */
  characterIds: string[];
}

/** 性别精确匹配：直接比对字符串值 */
function isGenderMatched(characterGender: string | null | undefined, targetGender: string): boolean {
  if (!characterGender) return false;
  return characterGender === targetGender;
}

/** 年龄匹配：±3 岁容差，无年龄数据则不匹配 */
function isAgeMatched(characterAge: number | null | undefined, targetAge: number): boolean {
  if (characterAge == null) return false;
  return Math.abs(characterAge - targetAge) <= 3;
}

/** Fisher-Yates 原地随机打乱 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * 执行性别+年龄过滤，从结果集中随机排列
 */
export function matchLibraryCharactersByOutfit(input: OutfitMatchInput): OutfitMatchResult {
  const excludeIdSet = new Set(input.excludeIds ?? []);

  // 第一步：基础过滤（状态、排除ID、五视图校验）
  let candidates = input.libraryCharacters
    .filter((char) => char.status === "ready")
    .filter((char) => char.fiveViewOssImageUrl) // 必须有五视图
    .filter((char) => !excludeIdSet.has(char.id));

  // 第二步：按性别过滤
  if (input.gender && input.gender !== "unknown") {
    candidates = candidates.filter((char) => isGenderMatched(char.gender, input.gender!));
  }

  // 第三步：按年龄过滤（±3 岁容差，无年龄数据则不匹配）
  if (input.age !== undefined) {
    candidates = candidates.filter((char) => isAgeMatched(char.age, input.age!));
  }

  // 第四步：随机打乱
  const ids = shuffle(candidates.map((char) => char.id));

  return { characterIds: ids };
}
