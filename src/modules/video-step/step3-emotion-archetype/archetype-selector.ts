/**
 * 情感原型选择器
 * 根据角色、服饰、已用原型，智能选择最合适的情感原型
 *
 * 改进：优先从数据库动态加载原型，fallback 到硬编码库
 */

import type { PgEmotionArchetypeLibraryRepository } from "../../../repositories/pg/emotion-archetype-pg-repository.js";
import type { EmotionArchetype } from "./types.js";
import { EMOTION_ARCHETYPE_LIBRARY } from "./archetype-library.js";
import { EmotionArchetypeLibraryService, type EmotionArchetypeEntity } from "../../../services/emotion-archetype-library-service.js";

/** 已使用的原型记录 */
export interface UsedArchetypes {
  usedArchetypeIds: string[];
  usedScenes: string[];
  usedEmotions: string[];
  usedPhrases: string[];
}

/** 角色信息（简化） */
export interface CharacterInfo {
  age?: number;
  gender?: "male" | "female";
  style?: string;
}

/** 服饰信息（简化） */
export interface OutfitInfo {
  style?: string;
  category?: string;
}

/** 选择器依赖 */
export interface ArchetypeSelectorDeps {
  emotionArchetypeRepo: PgEmotionArchetypeLibraryRepository;
}

/**
 * 从数据库动态选择情感原型（优先）
 * 如果数据库无可用原型，fallback 到硬编码库
 */
export async function selectEmotionArchetypeFromDb(
  deps: ArchetypeSelectorDeps,
  usedArchetypes: UsedArchetypes,
  character: CharacterInfo,
  outfit: OutfitInfo
): Promise<EmotionArchetype> {
  const service = new EmotionArchetypeLibraryService(deps.emotionArchetypeRepo);

  // 从数据库提取高流行度原型（排除已使用的）
  const dbArchetypes = await service.extractHighPopularityArchetypes(
    character.age,
    character.gender,
    outfit.style,
    usedArchetypes.usedArchetypeIds
  );

  if (dbArchetypes.length > 0) {
    // 转换为 EmotionArchetype 格式
    const selected = dbArchetypes[0];
    return mapEntityToArchetype(selected);
  }

  // Fallback: 从硬编码库选择
  return selectEmotionArchetypeFromHardcoded(usedArchetypes, character, outfit);
}

/**
 * 从硬编码库选择原型（fallback）
 */
export function selectEmotionArchetypeFromHardcoded(
  usedArchetypes: UsedArchetypes,
  character: CharacterInfo,
  outfit: OutfitInfo
): EmotionArchetype {
  // 1. 过滤已使用的原型
  let available = EMOTION_ARCHETYPE_LIBRARY.filter(
    a => !usedArchetypes.usedArchetypeIds.includes(a.id)
  );

  // 如果所有原型都用过了，重置
  if (available.length === 0) {
    available = [...EMOTION_ARCHETYPE_LIBRARY];
  }

  // 2. 根据角色年龄过滤
  if (character.age) {
    const ageMatched = available.filter(a => {
      return a.suitableAge.some(range => {
        const [min, max] = range.split("-").map(Number);
        return character.age! >= min && character.age! <= max;
      });
    });
    if (ageMatched.length > 0) {
      available = ageMatched;
    }
  }

  // 3. 根据角色性别过滤
  if (character.gender) {
    const genderMatched = available.filter(a =>
      a.suitableGender.includes(character.gender!)
    );
    if (genderMatched.length > 0) {
      available = genderMatched;
    }
  }

  // 4. 根据服饰风格过滤（如果有明确风格）
  if (outfit.style && outfit.style !== "所有风格") {
    const styleMatched = available.filter(a =>
      a.suitableStyles.includes("所有风格") ||
      a.suitableStyles.includes(outfit.style!)
    );
    if (styleMatched.length > 0) {
      available = styleMatched;
    }
  }

  // 5. 随机选择（确保多样性）
  const randomIndex = Math.floor(Math.random() * available.length);
  const selected = available[randomIndex];


  return selected;
}

/**
 * 旧版同步选择函数（保持向后兼容）
 * @deprecated 使用 selectEmotionArchetypeFromDb 替代
 */
export function selectEmotionArchetype(
  usedArchetypes: UsedArchetypes,
  character: CharacterInfo,
  outfit: OutfitInfo
): EmotionArchetype {
  return selectEmotionArchetypeFromHardcoded(usedArchetypes, character, outfit);
}

/**
 * 批量选择多个原型（确保不重复）
 */
export async function selectMultipleArchetypes(
  deps: ArchetypeSelectorDeps,
  count: number,
  usedArchetypes: UsedArchetypes,
  character: CharacterInfo,
  outfit: OutfitInfo
): Promise<EmotionArchetype[]> {
  const selected: EmotionArchetype[] = [];
  const tempUsed = { ...usedArchetypes, usedArchetypeIds: [...usedArchetypes.usedArchetypeIds] };

  for (let i = 0; i < count; i++) {
    const archetype = await selectEmotionArchetypeFromDb(deps, tempUsed, character, outfit);
    selected.push(archetype);
    tempUsed.usedArchetypeIds.push(archetype.id);
  }

  return selected;
}

/**
 * 数据库实体转换为原型格式
 */
function mapEntityToArchetype(entity: EmotionArchetypeEntity): EmotionArchetype {
  return {
    id: entity.id,
    name: entity.name,
    category: entity.category,
    emotionCore: entity.emotionCore,
    moment: entity.moment,
    conflict: entity.conflict,
    clothingRole: entity.clothingRole,
    visualCues: entity.visualCues,
    duration: entity.duration,
    shotCount: entity.shotCount,
    syncMode: entity.syncMode,
    suitableStyles: entity.suitableStyles,
    suitableAge: entity.suitableAge,
    suitableGender: entity.suitableGender,
  };
}
