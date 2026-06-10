/**
 * Step3 视频脚本生成 - 过滤逻辑
 * 根据规则过滤符合条件的视频脚本
 *
 * 过滤流程：
 * 1. 基础过滤（规则1-7）：硬性条件，不符合直接淘汰
 * 2. 年龄两阶段过滤（规则8）：精确匹配优先，无数据池补充
 * 3. 性别两阶段过滤（规则9）：精确匹配优先，无数据池补充
 *
 * 风格匹配逻辑：
 * 使用统一字典精确匹配（CLOTHING_STYLE_CATEGORY），不再使用启发式判断
 */

import type { VideoScriptData, VideoScriptFilterOptions } from "./types.js";
import { parseAgeRange, isAgeInRange } from "../step3-shared/age-filter.js";
import { isValidClothingStyle, CLOTHING_STYLE_OPTIONS, type ClothingStyleCategory } from "../../../contant-config/style-atmosphere-dict.js";
import { cleanDirtyStyle } from "../../../contant-config/script-style-mapping.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("script-filter");

/**
 * 标准化性别字段
 * 将不同格式的性别值统一为 male/female/unknown
 *
 * @param gender 原始性别值（可能是 "男"、"女"、"male"、"female"、"男性"、"女性" 等）
 * @returns 标准化后的性别值
 */
function normalizeGender(gender: string): "male" | "female" | "unknown" {
  const lower = gender.toLowerCase();
  if (lower.includes("男") || lower === "male") return "male";
  if (lower.includes("女") || lower === "female") return "female";
  return "unknown";
}

/**
 * 检查性别是否匹配
 *
 * @param charGender 角色性别（male/female/uncertain）
 * @param scriptGender 脚本人物性别（原始值）
 * @returns 是否匹配
 */
function checkGenderMatch(
  charGender: "male" | "female" | "uncertain",
  scriptGender: string
): boolean {
  // 角色性别不确定时，不限制性别
  if (charGender === "uncertain") return true;

  const normalizedScript = normalizeGender(scriptGender);

  // 脚本性别无法识别时，允许通过（后续进入无数据池）
  if (normalizedScript === "unknown") return true;

  // 精确匹配
  return charGender === normalizedScript;
}

/**
 * 检查风格是否匹配
 * 规则：统一字典精确匹配（消除启发式判断）
 *
 * @param charStyle 角色/服饰风格（必须是字典值）
 * @param scriptStyle 脚本风格（已清洗为字典值）
 * @returns 是否匹配
 */
function checkStyleMatch(charStyle: string, scriptStyle: string): boolean {
  // 1. 验证角色风格是否是有效字典值
  if (!isValidClothingStyle(charStyle)) {
    // 角色风格不是字典值，记录警告后返回 false
    log.warn({ charStyle }, "VideoScriptFilter invalid character style");
    return false;
  }

  // 2. 验证脚本风格是否是有效字典值（数据库已清洗）
  if (!isValidClothingStyle(scriptStyle)) {
    // 脚本风格仍有脏数据（可能是新增或遗漏），尝试清洗
    const cleanedStyle = cleanDirtyStyle(scriptStyle);
    if (cleanedStyle !== scriptStyle) {
      log.warn({ scriptStyle, cleanedStyle }, "VideoScriptFilter script style should be cleaned");
    }
    // 清洗后再比较
    return charStyle === cleanedStyle;
  }

  // 3. 字典精确匹配
  return charStyle === scriptStyle;
}

/**
 * 过滤视频脚本
 *
 * 过滤规则：
 * 1. 脚本必须已解析成功（parsed 不为 null）
 * 2. 必须有 video_analysis
 * 3. has_real_person 必须为 true（已在数据库层过滤）
 * 4. exposure_level 必须为中或高
 * 5. screen_time_ratio 最大值 > 0.5
 * 6. 必须有 fashion_placement.recommended_styles
 * 7. recommended_styles.style 与角色服饰风格精确匹配（统一字典）
 * 8. 年龄匹配（两阶段：精确匹配 + 无数据池补充）
 *
 * @param scripts 解析后的脚本数组
 * @param options 过滤选项
 * @returns 过滤后的脚本数组
 */
export function filterVideoScripts(
  scripts: VideoScriptData[],
  options: VideoScriptFilterOptions,
): VideoScriptData[] {
  const {
    characterStyles,
    characterAge,
    characterGender,
    minScreenTimeRatio = 0.5,
    allowedExposureLevels = ["高", "中"],
  } = options;


  // ========== 第一阶段：基础过滤（规则1-7）==========
  const baseResults: VideoScriptData[] = [];
  const rejectReasons: Map<string, string[]> = new Map();

  for (const script of scripts) {
    const reasons: string[] = [];

    // 规则 1：必须已解析
    if (!script.parsed) {
      reasons.push("Script not parsed");
      rejectReasons.set(script.id, reasons);
      continue;
    }

    const { video_analysis } = script.parsed;

    // 规则 2：必须有 video_analysis
    if (!video_analysis) {
      reasons.push("Missing video_analysis");
      rejectReasons.set(script.id, reasons);
      continue;
    }

    const presence = video_analysis.on_screen_presence;
    const fashion = video_analysis.fashion_placement;

    // 规则 3：has_real_person 必须为 true（已在数据库层过滤，此处仅注释说明）
    // if (!presence?.has_real_person) { ... }

    // 规则 4：exposure_level 必须存在且为中或高
    const exposureLevel = presence?.exposure_level;
    if (!exposureLevel || !allowedExposureLevels.includes(exposureLevel)) {
      reasons.push(
        exposureLevel
          ? `exposure_level "${exposureLevel}" not in [${allowedExposureLevels.join(", ")}]`
          : "exposure_level is missing"
      );
    }

    // 规则 5：screen_time_ratio 必须存在且最大值 > 0.5
    const personDetails = presence?.person_details;
    if (!personDetails || personDetails.length === 0) {
      reasons.push("person_details is missing or empty");
    } else {
      const maxRatio = Math.max(...personDetails.map((p) => p.screen_time_ratio || 0));
      if (maxRatio <= minScreenTimeRatio) {
        reasons.push(`screen_time_ratio ${maxRatio.toFixed(2)} <= ${minScreenTimeRatio}`);
      }
    }

    // 规则 6-7：服饰风格匹配已移除（第一阶段调整，后续通过数据库侧统一清洗实现）

    // 记录结果
    if (reasons.length === 0) {
      baseResults.push(script);
    } else {
      rejectReasons.set(script.id, reasons);
    }
  }


  // 打印拒绝原因（最多 5 个）
  const rejectedEntries = [...rejectReasons.entries()].slice(0, 5);
  if (rejectedEntries.length > 0) {
    const rejectLog = rejectedEntries
      .map(([id, reasons]) => `${id}: ${reasons.join("; ")}`)
      .join("\n  ");
  }

  // ========== 第二阶段：年龄两阶段过滤（规则8）==========
  const ageExactMatches: VideoScriptData[] = [];
  const ageNoDataMatches: VideoScriptData[] = [];

  for (const script of baseResults) {
    const mainPerson = script.parsed?.video_analysis?.on_screen_presence?.person_details?.[0];
    const scriptAge = mainPerson?.age;

    if (characterAge && scriptAge !== undefined) {
      // 有年龄数据，执行匹配（允许 ±3 岁误差）
      const minAge = Math.max(0, characterAge - 3);
      const maxAge = characterAge + 3;
      if (isAgeInRange(scriptAge, [minAge, maxAge])) {
        ageExactMatches.push(script);
      } else {
        // 不符合范围，淘汰
      }
    } else if (characterAge && scriptAge === undefined) {
      // 项目有年龄要求，但脚本无年龄数据，进入无数据池
      ageNoDataMatches.push(script);
    } else {
      // 项目无年龄要求，全部通过
      ageExactMatches.push(script);
    }
  }

  // 年龄过滤后的合并结果
  const ageFiltered = [...ageExactMatches, ...ageNoDataMatches];

  // ========== 第三阶段：性别两阶段过滤（规则9）==========
  const genderExactMatches: VideoScriptData[] = [];
  const genderNoDataMatches: VideoScriptData[] = [];

  for (const script of ageFiltered) {
    const mainPerson = script.parsed?.video_analysis?.on_screen_presence?.person_details?.[0];
    const scriptGender = mainPerson?.gender;

    // 角色性别不确定时，不限制性别
    if (!characterGender) {
      genderExactMatches.push(script);
      continue;
    }

    if (scriptGender !== undefined && scriptGender !== null) {
      // 有性别数据，执行匹配
      const normalizedScript = normalizeGender(scriptGender);
      if (normalizedScript === "unknown") {
        // 脚本性别无法识别，进入无数据池
        genderNoDataMatches.push(script);
      } else if (characterGender === normalizedScript) {
        // 精确匹配
        genderExactMatches.push(script);
      } else {
        // 不匹配，淘汰
      }
    } else {
      // 脚本无性别数据，进入无数据池
      genderNoDataMatches.push(script);
    }
  }

  // ========== 最终合并返回 ==========
  const final = [...genderExactMatches, ...genderNoDataMatches];


  return final;
}

/**
 * 提取脚本中的服饰风格
 */
export function extractScriptStyles(script: VideoScriptData): string[] {
  const styles = script.parsed?.video_analysis?.fashion_placement?.recommended_styles;
  if (!Array.isArray(styles)) {
    return [];
  }

  return styles
    .map((s) => s.style)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

/**
 * 获取脚本的主要人物出镜比例
 */
export function getMainScreenTimeRatio(script: VideoScriptData): number {
  const personDetails = script.parsed?.video_analysis?.on_screen_presence?.person_details;

  if (!personDetails || personDetails.length === 0) {
    return 0;
  }

  return Math.max(...personDetails.map((p) => p.screen_time_ratio || 0));
}

/**
 * 检查脚本是否符合基本生成条件
 */
export function isValidForGeneration(script: VideoScriptData): boolean {
  if (!script.parsed) {
    return false;
  }

  const { video_analysis, shot_breakdown } = script.parsed;

  // 必须有视频分析或分镜数据
  if (!video_analysis && (!shot_breakdown || shot_breakdown.length === 0)) {
    return false;
  }

  // 检查是否有分镜数据
  if (shot_breakdown && shot_breakdown.length > 0) {
    return true;
  }

  // 有 video_analysis 但没有 shot_breakdown 也可以（后续 LLM 生成）
  return video_analysis !== undefined;
}
