/**
 * 阶段4：脚本创作
 * 复用 script-generation-prompt.ts 中的 generateScripts
 * 【重点】传递原始角色信息，确保性别、年龄一致
 * 【重要】着装必须是衣服上的图片，不能有其他服饰
 */

import type { AppContext } from "../../../../core/app-context.js";
import type { HotspotAnalysisReport, CharacterAnalysisReport, Step3ScriptResult, Step3CharacterReferenceItem } from "../types.js";
import type { CharacterViewKey } from "../../../../contracts/types.js";
import type { STAGE1_RESULT, OutfitModuleSummary } from "../../../../contant-config/shared_dict.js";
import { generateScripts, validateGenderConsistency, parseGenderFromLabel } from "../script-generation-prompt.js";
import { getLogger } from "../../../../core/logger/index.js";

const log = getLogger("stage4-script-creator");

/**
 * 阶段4输入参数
 */
export interface Stage4Input {
  hotspotReport: HotspotAnalysisReport;
  characterReport: CharacterAnalysisReport;
  /** 原始角色信息（核心：用于性别约束） */
  characterReference: STAGE1_RESULT["characterReference"];
  /** 角色图片URL（着装图片，仅衣服） */
  characterImageUrl?: string;
  /** 角色详细描述（来自 step1HiddenRoleSettingPrompt） */
  characterDescription?: string;
  /** 服饰模块信息（来自 step1OutfitModules） */
  outfitModules?: OutfitModuleSummary[];
  /** 服饰风格列表（用于场景匹配约束） */
  clothingStyles?: string[];
  /** 服饰描述（从 projectContext.outfitDescription） */
  outfitDescription?: string;
  /** 搭配描述（从 projectContext.matchingReference） */
  matchingReference?: string;
  /** 角色方向（从 project.selectedRoleDirection） */
  selectedRoleDirection?: STAGE1_RESULT["selectedRoleDirection"];
  /** 脚本数量 */
  scriptCount: number;
}

/**
 * 阶段4：脚本创作
 * @param input 输入参数
 * @param ctx 应用上下文
 * @param routeKey LLM路由键
 * @param userId 用户ID
 * @param llmDeps LLM依赖
 * @returns 生成的脚本列表
 */
export async function stage4_createScripts(
  input: Stage4Input,
  ctx: AppContext,
  routeKey: string,
  userId: string,
  llmDeps: {
    requestLlmPlainText: (systemPrompt: string, userPrompt: string, temperature: number) => Promise<string>;
  },
): Promise<Step3ScriptResult[]> {

  // 构建角色引用对象供 generateScripts 使用
  const characterReferenceInput: Step3CharacterReferenceItem = {
    id: input.characterReference.id,
    imageUrl: input.characterReference.imageUrl,
    label: input.characterDescription || input.characterReference.label || "",
    gender: input.characterReference.gender,
    viewKey: input.characterReference.viewKey as CharacterViewKey | undefined,
  };

  const startTime = Date.now();

  try {
    // 调用 generateScripts（内部已包含提示词获取逻辑）
    const scripts = await generateScripts(
      {
        hotspotReport: input.hotspotReport,
        characterReport: input.characterReport,
        characterReference: characterReferenceInput,
        scriptCount: input.scriptCount,
        clothingStyles: input.clothingStyles,
        outfitDescription: input.outfitDescription,
        matchingReference: input.matchingReference,
        selectedRoleDirection: input.selectedRoleDirection,
      },
      ctx,
      routeKey,
      userId,
      llmDeps,
    );

    const elapsed = Date.now() - startTime;


    // ========== 打印解析后的关键结果 ==========
    const expectedGender = input.characterReference?.gender;
    if (!expectedGender || expectedGender === "uncertain") {
      throw new Error(`角色性别未设置（gender=${expectedGender ?? "undefined"}），无法生成脚本。`);
    }
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const genderResult = validateGenderConsistency(script, expectedGender);
      if (!genderResult.passed) {
      }
    }

    return scripts;
  } catch (error) {
    log.error({ err: error }, "Stage4 script creation failed");
    // 生成失败时抛出错误，不返回默认脚本
    throw error;
  }
}
