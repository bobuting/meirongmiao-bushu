/**
 * 动作迁移任务 API 模块
 * AnimateAnyone 图生视频任务管理
 */

import { request } from "../backendApi.request";

/** 动作迁移任务状态 */
export type ActionTransferStatus =
  | "pending"           // 待处理
  | "detecting"         // 图片检测中
  | "detected"          // 图片检测完成
  | "template_generating" // 动作模板生成中
  | "template_generated"  // 动作模板生成完成
  | "generating"        // 视频生成中
  | "succeeded"         // 成功
  | "failed"            // 失败
  | "cancelled";        // 已取消

/** 动作来源类型 */
export type ActionSourceType = "upload_video" | "builtin_template";

/** 失败阶段 */
export type ErrorStage = "detecting" | "template_generating" | "generating" | "config";

/** 图片检测结果 */
export interface ImageDetectResult {
  valid: boolean;
  reason?: string;
  suggestions?: string[];
}

/** 动作迁移任务记录 */
export interface ActionTransferTaskDto {
  taskId: string;
  projectId: string;
  userId: string;
  status: ActionTransferStatus;

  actionSourceType: ActionSourceType;
  sourceVideoUrl?: string;
  builtinTemplateId?: string;
  targetImageUrl: string;

  prompt?: string;
  durationSec: number;
  backgroundMode: "image" | "video";

  imageValid?: boolean;
  imageCheckResult?: ImageDetectResult;
  templateId?: string;
  templateDurationSec?: number;

  resultVideoUrl?: string;
  resultDurationSec?: number;
  resultWidth?: number;
  resultHeight?: number;

  errorMessage?: string;
  errorStage?: ErrorStage;

  createdAt: number;
  updatedAt: number;
  asyncJobId?: string;
}

/** 创建任务输入 */
export interface CreateActionTransferTaskInput {
  projectId: string;
  actionSourceType: ActionSourceType;
  sourceVideoUrl?: string;
  builtinTemplateId?: string;
  targetImageUrl: string;
  prompt?: string;
  durationSec?: number;
  backgroundMode?: "image" | "video";
}

/** 任务进度信息 */
export interface TaskProgress {
  stage: string;
  message: string;
  percentage?: number;
}

/** 任务详情响应 */
export interface ActionTransferTaskDetailResponse {
  taskId: string;
  projectId: string;
  status: ActionTransferStatus;
  actionSourceType: ActionSourceType;

  progress?: TaskProgress;

  result?: {
    videoUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
  };

  error?: {
    code: string;
    message: string;
    stage?: ErrorStage;
  };

  createdAt: number;
  updatedAt: number;
}

/** 动作迁移 API 接口 */
export interface RealActionTransferApi {
  /** 创建动作迁移任务 */
  createTask(
    token: string,
    input: CreateActionTransferTaskInput
  ): Promise<{
    success: boolean;
    data: { taskId: string; asyncJobId: string; status: ActionTransferStatus };
  }>;

  /** 查询任务详情 */
  getTask(
    token: string,
    taskId: string
  ): Promise<{ success: boolean; data: ActionTransferTaskDetailResponse }>;

  /** 查询任务列表 */
  listTasks(
    token: string,
    params?: { projectId?: string; status?: ActionTransferStatus; limit?: number; offset?: number }
  ): Promise<{ success: boolean; data: { items: ActionTransferTaskDto[]; total: number; hasMore: boolean } }>;

  /** 取消任务 */
  cancelTask(
    token: string,
    taskId: string
  ): Promise<{ success: boolean; data: { taskId: string; status: ActionTransferStatus } }>;
}

/** 动作迁移 API 实现 */
export const realActionTransferApi: RealActionTransferApi = {
  /** 创建动作迁移任务 */
  createTask: async (token, input) => {
    return request("POST", "/action-transfer/tasks", {
      token,
      body: input,
    });
  },

  /** 查询任务详情 */
  getTask: async (token, taskId) => {
    return request("GET", `/action-transfer/tasks/${taskId}`, {
      token,
    });
  },

  /** 查询任务列表 */
  listTasks: async (token, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.projectId) queryParams.set("projectId", params.projectId);
    if (params.status) queryParams.set("status", params.status);
    if (params.limit) queryParams.set("limit", String(params.limit));
    if (params.offset) queryParams.set("offset", String(params.offset));

    const query = queryParams.toString();
    const path = query ? `/action-transfer/tasks?${query}` : "/action-transfer/tasks";

    return request("GET", path, {
      token,
    });
  },

  /** 取消任务 */
  cancelTask: async (token, taskId) => {
    return request("POST", `/action-transfer/tasks/${taskId}/cancel`, {
      token,
    });
  },
};