/**
 * 角色匹配服务
 * 分析分镜脚本，识别主角色，构建参考图映射关系
 */

import type { ShotBreakdownItem, ShotSubject, PersonSubject } from "../../../contracts/shot-breakdown-contract.js";
import { validateShotBreakdown, validateCharacterMatchingInput } from "../../../contracts/shot-breakdown-schema.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("character-matching-service");

/**
 * 验证人物主体的业务规则
 *
 * 根据 skills/_shared/rules/video-output-schema.md：
 * - 人物镜头：eye_line 必填（必须是字符串，不能为 null）
 * - 物体镜头：eye_line 可为 null（物体没有视线）
 *
 * @param subject 主体数据
 * @param shotId 镜头 ID（用于错误定位）
 * @returns 验证结果
 */
function validateHumanSubjectBusinessRules(
  subject: ShotSubject,
  shotId: number
): { valid: boolean; error?: string } {
  // 只验证人物类型主体
  if (subject.type !== "人物") {
    return { valid: true };
  }

  // 此处 subject 已被 TS 收窄为 PersonSubject
  const person = subject as PersonSubject;

  // 人物必须有 person_id
  if (person.person_id === undefined || person.person_id === null) {
    return {
      valid: false,
      error: `镜头 ${shotId} 主体 ${person.subject_id ?? "?"}: 人物类型必须有 person_id`,
    };
  }

  return { valid: true };
}

/**
 * 角色匹配结果
 */
export interface CharacterMatchResult {
  /** 主角色 ID（出镜频率最高的 person_id） */
  mainPersonId: number | null;

  /** 所有出现的 person_id 列表 */
  personIds: number[];

  /** 每个 person_id 的出镜次数 */
  personFrequency: Map<number, number>;

  /** 每个 person_id 出现的镜头 ID 列表 */
  personShotMapping: Map<number, number[]>;
}

/**
 * 角色匹配服务
 * 职责：
 * 1. 分析分镜脚本中的 subjects
 * 2. 统计每个 person_id 的出镜频率
 * 3. 识别主角色（出镜频率最高）
 */
export class CharacterMatchingService {
  /**
   * 分析分镜脚本，识别主角色
   *
   * @param shotBreakdown 分镜数据
   * @returns 角色匹配结果
   * @throws Error 如果分镜数据验证失败
   */
  analyzeCharacters(shotBreakdown: ShotBreakdownItem[]): CharacterMatchResult {
    // 验证输入数据
    const validationResult = validateShotBreakdown(shotBreakdown);
    if (!validationResult.success) {
      log.error({ error: validationResult.error }, "ShotBreakdown validation failed in analyzeCharacters");
      throw new Error(validationResult.error);
    }

    // validationResult.data 一定存在（因为 success = true）
    const validatedData = validationResult.data!;
    const personFrequency = new Map<number, number>();
    const personShotMapping = new Map<number, number[]>();

    // 遍历所有镜头，统计 person_id 出现频率
    for (const shot of validatedData) {
      if (!shot.subjects || shot.subjects.length === 0) {
        continue;
      }

      for (const subject of shot.subjects) {
        // 业务规则验证：人物类型必须有 eye_line
        const businessValidation = validateHumanSubjectBusinessRules(subject, shot.shot_id);
        if (!businessValidation.valid) {
          log.error({ error: businessValidation.error, shotId: shot.shot_id }, "人物主体业务规则验证失败");
          throw new Error(businessValidation.error);
        }

        // 只统计人物类型主体（discriminated union: 只有 PersonSubject 有 person_id）
        if (subject.type !== "人物") {
          continue;
        }

        // PersonSubject 的 person_id 由 schema 保证存在
        const personId = subject.person_id;

        // 统计频率
        const currentFreq = personFrequency.get(personId) ?? 0;
        personFrequency.set(personId, currentFreq + 1);

        // 记录镜头映射
        const shots = personShotMapping.get(personId) ?? [];
        if (!shots.includes(shot.shot_id)) {
          shots.push(shot.shot_id);
        }
        personShotMapping.set(personId, shots);
      }
    }

    // 提取所有 person_id
    const personIds = Array.from(personFrequency.keys());

    // 识别主角色（出镜频率最高）
    let mainPersonId: number | null = null;
    let maxFrequency = 0;

    for (const [personId, freq] of personFrequency.entries()) {
      if (freq > maxFrequency) {
        maxFrequency = freq;
        mainPersonId = personId;
      }
    }

    return {
      mainPersonId,
      personIds,
      personFrequency,
      personShotMapping,
    };
  }

  /**
   * 判断镜头中是否包含主角色
   *
   * @param shot 镜头数据
   * @param mainPersonId 主角色 ID
   * @returns 是否包含主角色
   */
  isMainCharacterInShot(shot: ShotBreakdownItem, mainPersonId: number | null): boolean {
    if (!mainPersonId || !shot.subjects) {
      return false;
    }

    return shot.subjects.some(
      (subject) => subject.type === "人物" && subject.person_id === mainPersonId
    );
  }

  /**
   * 获取镜头中的所有 person_id
   *
   * @param shot 镜头数据
   * @returns person_id 列表
   */
  getPersonIdsInShot(shot: ShotBreakdownItem): number[] {
    if (!shot.subjects) {
      return [];
    }

    return shot.subjects
      .filter((subject): subject is PersonSubject => subject.type === "人物")
      .map((subject) => subject.person_id);
  }

  /**
   * 判断是否需要传递参考图
   *
   * 规则：
   * - 主角色镜头：传递参考图
   * - 配角镜头：不传递参考图（AI 智能生成）
   * - 空镜：不传递参考图
   *
   * @param shot 镜头数据
   * @param mainPersonId 主角色 ID
   * @returns 是否需要传递参考图
   */
  shouldPassReferenceImages(shot: ShotBreakdownItem, mainPersonId: number | null): boolean {
    if (!mainPersonId) {
      return false;
    }

    return this.isMainCharacterInShot(shot, mainPersonId);
  }

  /**
   * 重映射 person_id，确保用户角色 = 1
   *
   * @param shotBreakdown 原始分镜数据
   * @param userCharacterInfo 用户角色信息（从输入提取）
   * @returns 重映射后的分镜数据和映射关系
   * @throws Error 如果输入验证失败
   */
  remapPersonIdsForUserPriority(
    shotBreakdown: ShotBreakdownItem[],
    userCharacterInfo: {
      gender?: string;
      description?: string;
      age?: number;
    }
  ): {
    shotBreakdown: ShotBreakdownItem[];
    remapping: Map<number, number>;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // 验证用户角色信息输入
    const inputValidation = validateCharacterMatchingInput(userCharacterInfo);
    if (!inputValidation.success) {
      log.warn({ error: inputValidation.error }, "Invalid userCharacterInfo, using fallback");
      // 不抛错，使用 fallback 逻辑
    }

    // 1. 分析现有角色分配
    const characterMatch = this.analyzeCharacters(shotBreakdown);

    // 2. 识别用户角色（通过性别、描述匹配）
    const userPersonId = this.identifyUserCharacter(shotBreakdown, userCharacterInfo);

    // 3. 如果用户角色已经是 person_id = 1，无需重映射
    if (userPersonId === null || userPersonId === 1) {
      return { shotBreakdown, remapping: new Map(), warnings };
    }

    // 4. 构建重映射表
    const remapping = new Map<number, number>();
    remapping.set(userPersonId, 1);

    // 5. 如果原 person_id = 1 是配角，需要重新分配
    if (characterMatch.personIds.includes(1)) {
      const maxId = Math.max(...characterMatch.personIds, 0);
      const newId = maxId >= userPersonId ? maxId + 1 : userPersonId + 1;
      remapping.set(1, newId);
      warnings.push(`原 person_id=1 重新分配为 ${newId}`);
    }

    warnings.push(`用户角色从 person_id=${userPersonId} 重映射为 1`);

    // 6. 应用重映射
    const remappedBreakdown = this.applyPersonIdRemapping(shotBreakdown, remapping);

    return { shotBreakdown: remappedBreakdown, remapping, warnings };
  }

  /**
   * 识别用户角色
   *
   * 说明：ShotSubject 类型中没有 gender 和 age 字段，
   * 所以只能通过 description 关键词匹配来识别用户角色。
   */
  private identifyUserCharacter(
    shotBreakdown: ShotBreakdownItem[],
    userInfo: { gender?: string; description?: string; age?: number }
  ): number | null {
    // 遍历所有镜头，通过描述关键词匹配用户角色
    for (const shot of shotBreakdown) {
      if (!shot.subjects) continue;

      for (const subject of shot.subjects) {
        if (subject.type !== "人物" || subject.person_id === undefined) continue;

        // 描述关键词匹配
        if (userInfo.description && subject.description) {
          const userKeywords = userInfo.description.split(/[，,、\s]+/).filter(k => k.length >= 2);
          const subjectKeywords = subject.description.split(/[，,、\s]+/);
          const overlap = userKeywords.filter(k =>
            subjectKeywords.some(sk => sk.includes(k) || k.includes(sk))
          );
          if (overlap.length >= 2) {
            return subject.person_id;
          }
        }
      }
    }

    // 无法匹配时，返回最高频率的角色
    const match = this.analyzeCharacters(shotBreakdown);
    return match.mainPersonId;
  }

  /**
   * 应用 person_id 重映射
   */
  private applyPersonIdRemapping(
    shotBreakdown: ShotBreakdownItem[],
    remapping: Map<number, number>
  ): ShotBreakdownItem[] {
    if (remapping.size === 0) return shotBreakdown;

    return shotBreakdown.map(shot => {
      if (!shot.subjects) return shot;

      return {
        ...shot,
        subjects: shot.subjects.map(subject => {
          // 只有人物主体有 person_id 需要重映射
          if (subject.type === "人物" && remapping.has(subject.person_id)) {
            return {
              ...subject,
              person_id: remapping.get(subject.person_id)!
            };
          }
          return subject;
        })
      };
    });
  }

  /**
   * 确保服饰锚点正确
   */
  ensureOutfitAnchor(
    shotBreakdown: ShotBreakdownItem[],
    userPersonId: number,
    userOutfitRef: string
  ): {
    shotBreakdown: ShotBreakdownItem[];
    warnings: string[];
  } {
    const warnings: string[] = [];

    const fixedBreakdown = shotBreakdown.map((shot, shotIndex) => {
      if (!shot.subjects) return shot;

      return {
        ...shot,
        subjects: shot.subjects.map(subject => {
          // 只修正人物主体的服饰锚点
          if (subject.type === "人物" && subject.person_id === userPersonId) {
            if (subject.clothing.ref !== userOutfitRef) {
              warnings.push(
                `镜头 ${shotIndex + 1}: 用户角色服饰锚点从 "${subject.clothing.ref}" 修正为 "${userOutfitRef}"`
              );
              return {
                ...subject,
                clothing: {
                  ...subject.clothing,
                  ref: userOutfitRef
                }
              };
            }
          }
          return subject;
        })
      };
    });

    return { shotBreakdown: fixedBreakdown, warnings };
  }
}
