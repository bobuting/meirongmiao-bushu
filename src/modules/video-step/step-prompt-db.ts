/**
 * 步骤提示词数据库操作
 * 用于存储各步骤的分析提示词和返回内容
 *
 * 注意：所有 SQL 已迁移到 PgStepPromptRepository，
 * 此文件作为兼容层委托到 repo
 */

import type { PgStepPromptRepository } from "../../repositories/pg/step-prompt-pg-repository.js";
import { STEP_PROMPT_TYPE, type StepPromptType } from "../../contant-config/shared_dict.js";

/**
 * 步骤提示词记录结构
 */
export interface StepPromptRecord {
  /** 主键ID */
  id: string;
  /** 项目ID */
  projectId: string;
  /** 类型：热点提取/热点分析/角色分析/脚本创作 */
  type: StepPromptType;
  /** 提示词内容（长文本） */
  prompt: string;
  /** 返回内容（长文本） */
  response: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 存储步骤提示词记录
 * @param repo 步骤提示词仓库
 * @param projectId 项目ID
 * @param type 类型
 * @param prompt 提示词内容
 * @param response 返回内容
 * @returns 新创建的记录
 */
export async function saveStepPrompt(
  repo: PgStepPromptRepository,
  projectId: string,
  type: StepPromptType,
  prompt: string,
  response: string,
): Promise<StepPromptRecord> {
  return repo.save(projectId, type, prompt, response, Date.now());
}

/**
 * 根据项目ID和类型获取最新的提示词记录
 * @param repo 步骤提示词仓库
 * @param projectId 项目ID
 * @param type 类型
 * @returns 最新的记录，如果没有则返回 null
 */
export async function getLatestStepPrompt(
  repo: PgStepPromptRepository,
  projectId: string,
  type: StepPromptType,
): Promise<StepPromptRecord | null> {
  return repo.findLatestByProjectIdAndType(projectId, type);
}

/**
 * 根据项目ID获取所有提示词记录
 * @param repo 步骤提示词仓库
 * @param projectId 项目ID
 * @returns 该项目的所有提示词记录
 */
export async function getStepPromptsByProject(
  repo: PgStepPromptRepository,
  projectId: string,
): Promise<StepPromptRecord[]> {
  return repo.findByProjectId(projectId);
}

/**
 * 验证类型是否有效
 * @param type 类型值
 * @returns 是否为有效的步骤提示词类型
 */
export function isValidStepPromptType(type: string): boolean {
  return Object.values(STEP_PROMPT_TYPE).includes(type as StepPromptType);
}
