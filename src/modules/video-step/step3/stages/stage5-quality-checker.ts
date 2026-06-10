/**
 * 阶段5：质量检查
 * 铁律检查 + 性别一致性验证
 * 【重点】验证性别是否与原始角色描述一致
 */

import type { Step3ScriptResult, IronLawsCheck } from "../types.js";
import type { STAGE1_RESULT, GENDER_VALIDATION_REPORT, IRON_LAWS_VALIDATION_REPORT } from "../../../../contant-config/shared_dict.js";
import { getLogger } from "../../../../core/logger/index.js";
import {
  validateIronLaws,
  validateGenderConsistency,
  fixGenderInconsistency,
  parseGenderFromLabel,
} from "../script-generation-prompt.js";

const log = getLogger("stage5-quality-checker");

/**
 * 阶段5结果类型（本地定义，避免循环依赖）
 */
export interface Stage5Result {
  validatedScripts: Step3ScriptResult[];
  genderValidationReports: GENDER_VALIDATION_REPORT[];
  ironLawsValidationReports: IRON_LAWS_VALIDATION_REPORT[];
  overallPassed: boolean;
}

/**
 * 阶段5：质量检查
 * @param scripts 待验证的脚本列表
 * @param characterReference 原始角色信息（用于性别验证）
 * @returns 验证结果
 */
export function stage5_validateScripts(
  scripts: Step3ScriptResult[],
  characterReference: STAGE1_RESULT["characterReference"],
): Stage5Result {

  // 直接使用角色性别，禁止推断
  const expectedGender = characterReference?.gender;
  if (!expectedGender || expectedGender === "uncertain") {
    throw new Error(`角色性别未设置（gender=${expectedGender ?? "undefined"}），无法进行质量检查。`);
  }

  const validatedScripts: Step3ScriptResult[] = [];
  const genderValidationReports: GENDER_VALIDATION_REPORT[] = [];
  const ironLawsValidationReports: IRON_LAWS_VALIDATION_REPORT[] = [];

  let allPassed = true;

  for (let i = 0; i < scripts.length; i++) {
    let script = scripts[i];


    // Step 5.1: 铁律检查
    const ironLawsResult = validateIronLaws(script);
    const ironLawsReport: IRON_LAWS_VALIDATION_REPORT = {
      scriptId: script.id,
      passed: ironLawsResult.passed,
      details: ironLawsResult.details,
      violations: ironLawsResult.violations,
    };
    ironLawsValidationReports.push(ironLawsReport);

    if (!ironLawsResult.passed) {
      log.warn({ scriptId: script.id, violations: ironLawsResult.violations }, "[Stage5] Script iron laws check failed");
      allPassed = false;
    }

    // Step 5.2: 性别一致性验证
    const genderResult = validateGenderConsistency(script, expectedGender);
    const genderReport: GENDER_VALIDATION_REPORT = {
      scriptId: script.id,
      passed: genderResult.passed,
      expectedGender: genderResult.expectedGender,
      foundMalePronouns: genderResult.foundPronouns.male,
      foundFemalePronouns: genderResult.foundPronouns.female,
      violations: genderResult.violations,
    };
    genderValidationReports.push(genderReport);

    // Step 5.3: 尝试自动修正性别问题
    if (!genderResult.passed) {
      log.warn({ scriptId: script.id }, "[Stage5] Script gender check failed, attempting fix");
      script = fixGenderInconsistency(script, expectedGender);

      // 重新验证修正后的脚本
      const fixedResult = validateGenderConsistency(script, expectedGender);
      if (fixedResult.passed) {
      } else {
        log.warn({ scriptId: script.id }, "[Stage5] Script gender fix failed, violations remain");
        allPassed = false;
      }
    }

    validatedScripts.push(script);
  }


  return {
    validatedScripts,
    genderValidationReports,
    ironLawsValidationReports,
    overallPassed: allPassed,
  };
}

/**
 * 验证单个脚本的铁律
 * @param script 脚本
 * @returns 验证结果
 */
export function validateScriptIronLaws(script: Step3ScriptResult): IronLawsCheck {
  return validateIronLaws(script);
}

/**
 * 验证单个脚本的性别一致性
 * @param script 脚本
 * @param expectedGender 期望性别
 * @returns 验证结果
 */
export function validateScriptGender(
  script: Step3ScriptResult,
  expectedGender: "male" | "female" | "uncertain",
): GENDER_VALIDATION_REPORT {
  const result = validateGenderConsistency(script, expectedGender);
  return {
    scriptId: script.id,
    passed: result.passed,
    expectedGender: result.expectedGender,
    foundMalePronouns: result.foundPronouns.male,
    foundFemalePronouns: result.foundPronouns.female,
    violations: result.violations,
  };
}
