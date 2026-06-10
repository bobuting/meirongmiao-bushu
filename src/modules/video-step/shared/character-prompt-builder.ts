/**
 * 角色提示词构建器
 *
 * 统一从 project.selectedRoleDirection 获取角色信息，供 Step3 各脚本类型复用。
 *
 * 数据源说明：
 * - nrm_library_characters 表的角色属性字段可能为空（Step2 自动生成的角色）
 * - nrm_projects.selected_role_direction 字段包含完整的角色预设信息（来自 Step1）
 * - 本模块统一使用 selected_role_direction 作为数据源，确保一致性
 */

import type { Project } from "../../../contracts/types.js";

/** 角色方向信息（用于 LLM 提示词） */
export interface CharacterDirectionInfo {
  /** 风格关键词 */
  styleWords: string[];
  /** 性别 */
  gender?: "male" | "female" | "unknown";
}

/** 角色提示词信息（用于 LLM 提示词构建） */
export interface CharacterPromptInfo {
  /** 角色描述（格式化后的完整描述） */
  characterDescription: string;
  /** 角色方向（不包含无效的 styleSummary） */
  characterDirection: CharacterDirectionInfo | null;
}

/**
 * 从项目数据构建角色提示词信息
 *
 * 统一数据源：优先使用 selected_role_direction
 *
 * @param project 项目对象
 * @returns 角色提示词信息
 */
export function buildCharacterPromptFromProject(project: Project): CharacterPromptInfo {
  const direction = project.selectedRoleDirection;

  // 无角色方向信息
  if (!direction) {
    return {
      characterDescription: "",
      characterDirection: null,
    };
  }

  // 构建角色描述
  const characterDescription = buildDescriptionFromDirection(direction);

  // 构建角色方向（不包含 styleSummary，因为它是 Step1→Step2 的过渡提示）
  const characterDirection: CharacterDirectionInfo = {
    styleWords: direction.styleWords || [],
    gender: direction.gender ?? undefined,
  };

  return { characterDescription, characterDirection };
}

/**
 * 从角色方向构建描述文本
 *
 * 格式：标题，性别：X，年龄段：X，风格关键词：X、X，种族/地区：X
 */
function buildDescriptionFromDirection(
  direction: NonNullable<Project["selectedRoleDirection"]>
): string {
  const parts: string[] = [];

  // 性别
  if (direction.gender && direction.gender !== "unknown") {
    parts.push(`性别：${direction.gender === "male" ? "男" : "女"}`);
  }

  // 年龄段
  if (typeof direction.age === "number" && direction.age > 0) {
    parts.push(`年龄段：${direction.age}`);
  }

  // 风格关键词
  if (direction.styleWords?.length) {
    parts.push(`风格关键词：${direction.styleWords.join("、")}`);
  }

  // 种族/地区
  if (direction.ethnicityOrRegion) {
    parts.push(`种族/地区：${direction.ethnicityOrRegion}`);
  }

  return parts.join("，");
}
