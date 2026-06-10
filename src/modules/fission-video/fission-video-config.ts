/**
 * 裂变视频配置和类型定义
 * 包含裂变状态枚举、状态映射和工具函数
 */

/**
 * 裂变最大数量限制
 * 用户最多可裂变生成的视频数量
 */
export const FISSION_MAX_COUNT = 12;

/**
 * 裂变可用选项
 * 用户可选的裂变数量
 */
export const FISSION_AVAILABLE_OPTIONS = [3, 6, 9, 12] as const;

/**
 * 裂变状态枚举
 */
export enum FissionStatus {
  /** 新建中 */
  CREATING = "creating",
  /** 整理镜像 */
  ORGANIZING_MIRROR = "organizing_mirror",
  /** 并行执行中（图生视频和新故事并行） */
  PARALLEL_RUNNING = "parallel_running",
  /** 部分完成（部分分镜生成失败） */
  PARTIAL_COMPLETE = "partial_complete",
  /** 等待步骤4 */
  READY_FOR_STEP4 = "ready_for_step4",
  /** 新镜像 */
  NEW_MIRROR = "new_mirror",
  /** 新故事 */
  NEW_STORY = "new_story",
  NEW_STORY_FINISH = "new_story_finish",
  /** 已完成 */
  COMPLETED = "completed",
  /** 组合方案生成中 */
  COMBINING = "combining",
  /** 组合完成，等待前端合并视频 */
  READY_FOR_MERGE = "ready_for_merge",
}

/**
 * 裂变状态中文名称映射
 */
export const FISSION_STATUS_LABELS: Record<FissionStatus, string> = {
  [FissionStatus.CREATING]: "新建中",
  [FissionStatus.ORGANIZING_MIRROR]: "整理镜像",
  [FissionStatus.PARALLEL_RUNNING]: "并行执行中",
  [FissionStatus.PARTIAL_COMPLETE]: "部分完成",
  [FissionStatus.READY_FOR_STEP4]: "等待步骤4",
  [FissionStatus.NEW_MIRROR]: "新镜像",
  [FissionStatus.NEW_STORY]: "新故事",
  [FissionStatus.NEW_STORY_FINISH]: "新故事完成",
  [FissionStatus.COMPLETED]: "已完成",
  [FissionStatus.COMBINING]: "组合方案生成中",
  [FissionStatus.READY_FOR_MERGE]: "等待合并视频",
};

/**
 * 状态顺序数组（用于进度计算）
 */
export const FISSION_STATUS_ORDER: FissionStatus[] = [
  FissionStatus.CREATING,
  FissionStatus.ORGANIZING_MIRROR,
  FissionStatus.NEW_MIRROR,
  FissionStatus.NEW_STORY,
    FissionStatus.NEW_STORY_FINISH,
  FissionStatus.COMPLETED,
];

/**
 * 计算裂变进度百分比
 * @param status 当前状态
 * @returns 进度百分比 (0-100)
 */
export function calculateProgress(status: FissionStatus): number {
  const index = FISSION_STATUS_ORDER.indexOf(status);
  if (index === -1) return 0;
  // 每个状态占 20%，最后一个状态 100%
  return index < FISSION_STATUS_ORDER.length - 1
    ? Math.round(((index + 1) / FISSION_STATUS_ORDER.length) * 100)
    : 100;
}

import type { VideoScriptPayload } from "../../service/scripts-data-db-service.js";

/**
 * 新故事JSON数据结构
 * 包含新故事裂变生成的完整 VideoScriptPayload 脚本
 */
export interface NewStoryJson {
  /** 完整的 VideoScriptPayload 结构化脚本 */
  payloadJson: VideoScriptPayload;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 裂变视频状态记录类型（数据库行类型）
 */
export interface FissionVideoStatusRecord {
  id: string;
  projectId: string;
  fissionCount: number;
  completedCount: number;
  status: FissionStatus;
  consumedCredits: number;
  creatorId: string;
  atmospheres?: string[];  // 背景音乐氛围列表，最多3个
  /** 新故事JSON数据（旧数据兼容，新数据使用 newStoryScriptId） */
  newStoryJson?: NewStoryJson;
  /** 新故事脚本ID（存储在 nrm_script_data 表，type=6） */
  newStoryScriptId?: string;
  /** 错误信息（追加模式，不替换） */
  errorMsg?: string;
  /** 图生视频总分镜数 */
  imageVideoTotal: number;
  /** 图生视频已完成数 */
  imageVideoCompleted: number;
  /** 图生视频失败数 */
  imageVideoFailed: number;
  /** 新故事总分镜数 */
  newStoryTotal: number;
  /** 新故事已完成数 */
  newStoryCompleted: number;
  /** 新故事失败数 */
  newStoryFailed: number;
  /** 新故事异步状态: pending/processing/completed/failed */
  newStoryAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  /** 专业提示词异步状态: pending/processing/completed/failed */
  shotPromptsAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  /** 异步失败阶段: new_story/shot_prompts */
  asyncFailedStage?: 'new_story' | 'shot_prompts';
  /** 异步任务错误信息 */
  asyncErrorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 创建裂变视频状态记录所需的输入类型
 */
export interface CreateFissionVideoStatusInput {
  projectId: string;
  fissionCount?: number;
  completedCount?: number;
  status?: FissionStatus;
  consumedCredits?: number;
  imageVideoTotal?: number;
  imageVideoCompleted?: number;
  imageVideoFailed?: number;
  newStoryTotal?: number;
  newStoryCompleted?: number;
  newStoryFailed?: number;
}

/**
 * 更新裂变视频状态记录所需的输入类型
 */
export interface UpdateFissionVideoStatusInput {
  fissionCount?: number;
  completedCount?: number;
  status?: FissionStatus;
  consumedCredits?: number;
  imageVideoTotal?: number;
  imageVideoCompleted?: number;
  imageVideoFailed?: number;
  newStoryTotal?: number;
  newStoryCompleted?: number;
  newStoryFailed?: number;
}

/**
 * 更新进度的输入类型（原子操作）
 */
export interface UpdateProgressInput {
  completedCountDelta?: number;
  consumedCreditsDelta?: number;
  status?: FissionStatus;
}

/**
 * 分镜来源枚举
 */
export enum FissionStoryboardSourceType {
  /** 分镜处理 */
  STORYBOARD_PROCESSING = "分镜处理",
  /** 原始分镜 */
  ORIGINAL_STORYBOARD = "原始分镜",
  /** 新故事分镜（旧数据兼容） */
  NEW_STORY_STORYBOARD = "新故事分镜",
  /** 图生视频（旧数据兼容） */
  IMAGE_TO_VIDEO = "图生视频",
  /** 裂变重制分镜（B 组：原始位置用裂变提示词重新生成） */
  FISSION_REIMAGINED = "裂变重制分镜",
  /** 裂变新故事分镜（C 组：新故事片段的分镜） */
  FISSION_NEW_STORY = "裂变新故事分镜",
  /** 裂变新镜像 */
  NEW_MIRROR = "裂变新镜像",
}

/**
 * 分镜来源中文名称映射
 */
export const FISSION_STORYBOARD_SOURCE_LABELS: Record<FissionStoryboardSourceType, string> = {
  [FissionStoryboardSourceType.STORYBOARD_PROCESSING]: "分镜处理",
  [FissionStoryboardSourceType.ORIGINAL_STORYBOARD]: "原始分镜",
  [FissionStoryboardSourceType.NEW_STORY_STORYBOARD]: "新故事分镜",
  [FissionStoryboardSourceType.IMAGE_TO_VIDEO]: "图生视频",
  [FissionStoryboardSourceType.FISSION_REIMAGINED]: "裂变重制分镜",
  [FissionStoryboardSourceType.FISSION_NEW_STORY]: "裂变新故事分镜",
  [FissionStoryboardSourceType.NEW_MIRROR]: "裂变新镜像",
};

/**
 * 分镜子表记录类型（数据库行类型）
 */
export interface FissionStoryboardSubRecord {
  id: string;
  storyboardUrl: string;
  storyboardPath: string;
  storyboardFlag: string | null;
  storyboardSource: FissionStoryboardSourceType;
  projectId: string;
  fissionId: string | null;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
  /** 背景音乐ID（组合级别匹配） */
  musicId?: string;
  /** 背景音乐URL（组合级别匹配） */
  musicUrl?: string;
}

/**
 * 创建分镜子表记录所需的输入类型
 */
export interface CreateFissionStoryboardSubInput {
  storyboardUrl: string;
  storyboardPath: string;
  storyboardFlag?: string;
  storyboardSource: FissionStoryboardSourceType;
  projectId: string;
  fissionId?: string;
}

/**
 * 更新分镜子表记录所需的输入类型
 */
export interface UpdateFissionStoryboardSubInput {
  storyboardUrl?: string;
  storyboardPath?: string;
  storyboardFlag?: string;
  storyboardSource?: FissionStoryboardSourceType;
}
