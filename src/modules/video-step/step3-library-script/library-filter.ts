/**
 * Step3 库存脚本 - 过滤逻辑
 * 根据角色年龄、性别匹配库存脚本
 *
 * 过滤流程：
 * 1. 基础过滤（规则1-6）：硬性条件，不符合直接淘汰
 * 2. 年龄两阶段过滤（规则7）：精确匹配优先，无数据池补充
 * 3. 性别两阶段过滤（规则8）：精确匹配优先，无数据池补充
 */

import type { VideoScriptData } from "../step3-video-script/types.js";
import type { LibraryScriptFilterOptions } from "./types.js";
import { parseAgeRange, isAgeInRange } from "../step3-shared/age-filter.js";

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
 * 过滤库存脚本
 *
 * 过滤规则：
 * 1. 脚本必须已解析成功（parsed 不为 null）
 * 2. 必须有 video_analysis
 * 3. has_real_person 必须为 true（已在数据库层过滤）
 * 4. exposure_level 必须为中或高
 * 5. screen_time_ratio 最大值 > 0.5
 * 6. 必须有 fashion_placement.recommended_styles（仅检查存在性）
 * 7. 年龄匹配（两阶段：精确匹配 + 无数据池补充）
 * 8. 性别匹配（两阶段：精确匹配 + 无数据池补充）
 *
 * @param scripts 解析后的脚本数组
 * @param options 过滤条件
 * @returns 匹配的脚本数组
 */
export function filterLibraryScripts(
  scripts: VideoScriptData[],
  options: LibraryScriptFilterOptions,
): VideoScriptData[] {
  const {
    characterAge,
    characterGender,
    minScreenTimeRatio = 0.5,
    allowedExposureLevels = ["高", "中"],
  } = options;

  // ========== 第一阶段：基础过滤（规则1-6）==========
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

    // 规则 6：必须有 fashion_placement.recommended_styles（仅检查存在性，不匹配风格）
    if (!Array.isArray(fashion?.recommended_styles) || fashion.recommended_styles.length === 0) {
      reasons.push("No recommended_styles in fashion_placement or not array");
    }

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

  // ========== 第二阶段：年龄两阶段过滤（规则7）==========
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

  // ========== 第三阶段：性别两阶段过滤（规则8）==========
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
