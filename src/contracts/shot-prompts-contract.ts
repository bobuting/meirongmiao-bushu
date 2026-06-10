/**
 * 分镜专业提示词契约定义
 * 用于 nrm_shot_prompts 表
 */

import type { ShotPromptItem, CharacterAnchor, EmotionalArc, ConsistencyNotes, ShotPromptsInputSnapshot } from "./shot-prompt-engineer-contract.js";

/**
 * 提示词类型常量枚举
 */
export const SHOT_PROMPTS_TYPE = {
  /** Step3 原始流程 */
  ORIGIN: "origin",
  /** 裂变新故事流程 */
  FISSION: "fission",
} as const;

/**
 * 提示词类型
 * - origin: Step3 原始流程
 * - fission: 裂变新故事流程
 */
export type ShotPromptsType = typeof SHOT_PROMPTS_TYPE[keyof typeof SHOT_PROMPTS_TYPE];

/**
 * 分镜专业提示词记录（数据库表 nrm_shot_prompts）
 */
export interface ShotPromptsRecord {
  /** 主键 UUID */
  id: string;
  /** 关联项目 ID */
  projectId: string;
  /** 来源脚本 ID（仅记录，不做关联查询） */
  scriptDataId: string | null;
  /** 类型：origin | fission */
  type: ShotPromptsType;
  /** 版本号 */
  version: number;
  /** 是否激活版本 */
  isActive: boolean;
  /** 镜头提示词数组 */
  shots: ShotPromptItem[];
  /** 角色锚点数组 */
  characterAnchors: CharacterAnchor[] | null;
  /** 情绪弧线 */
  emotionalArc: EmotionalArc | null;
  /** 一致性说明 */
  consistencyNotes: ConsistencyNotes | null;
  /** 生成参数快照 */
  inputSnapshot: ShotPromptsInputSnapshot | null;
  /** LLM 生成时间戳 */
  generatedAt: number;
  /** 记录创建时间 */
  createdAt: number;
  /** 记录更新时间 */
  updatedAt: number;
  /** 创建用户 ID */
  createdBy: string | null;
  /** 软删除时间戳 */
  deletedAt: number | null;
  /** 删除用户 ID */
  deletedBy: string | null;
}

/**
 * 创建分镜专业提示词参数
 */
export interface CreateShotPromptsParams {
  /** 项目 ID */
  projectId: string;
  /** 来源脚本 ID */
  scriptDataId?: string | null;
  /** 类型 */
  type: ShotPromptsType;
  /** 镜头提示词数组 */
  shots: ShotPromptItem[];
  /** 角色锚点数组 */
  characterAnchors?: CharacterAnchor[] | null;
  /** 情绪弧线 */
  emotionalArc?: EmotionalArc | null;
  /** 一致性说明 */
  consistencyNotes?: ConsistencyNotes | null;
  /** 生成参数快照 */
  inputSnapshot?: ShotPromptsInputSnapshot | null;
  /** LLM 生成时间戳 */
  generatedAt: number;
  /** 创建用户 ID */
  createdBy?: string | null;
}

/**
 * 查询激活版本参数
 */
export interface GetActiveShotPromptsParams {
  /** 项目 ID */
  projectId: string;
  /** 类型 */
  type: ShotPromptsType;
}

/**
 * 查询历史版本参数
 */
export interface ListShotPromptsHistoryParams {
  /** 项目 ID */
  projectId: string;
  /** 类型 */
  type: ShotPromptsType;
  /** 最大数量 */
  limit?: number;
}

/**
 * 分镜专业提示词 Repository 接口
 */
export interface IShotPromptsRepository {
  /** 创建新记录（自动处理版本和激活状态） */
  create(params: CreateShotPromptsParams): Promise<ShotPromptsRecord>;
  /** 获取激活版本 */
  getActive(params: GetActiveShotPromptsParams): Promise<ShotPromptsRecord | null>;
  /** 获取指定 ID 的记录 */
  getById(id: string): Promise<ShotPromptsRecord | null>;
  /** 获取历史版本列表 */
  listHistory(params: ListShotPromptsHistoryParams): Promise<ShotPromptsRecord[]>;
  /** 软删除指定项目的所有记录（可按 type 过滤） */
  softDeleteByProjectId(projectId: string, deletedBy: string, type?: ShotPromptsType): Promise<number>;
  /** 硬删除指定项目的所有记录（清理用） */
  hardDeleteByProjectId(projectId: string): Promise<number>;
}