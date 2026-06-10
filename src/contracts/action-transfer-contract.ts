/**
 * AnimateAnyone 动作迁移数据契约
 *
 * 定义动作模板库和动作迁移任务的类型接口
 */

// ---------------------------------------------------------------------------
// 动作模板库类型
// ---------------------------------------------------------------------------

/** 动作模板分类 */
export type ActionTemplateCategory = "dance" | "sport" | "expression" | "daily" | "special";

/** 模板来源 */
export type ActionTemplateSource = "official" | "user_created" | "system";

/** 内置动作模板 */
export interface ActionTemplate {
  id: string;
  name: string;
  category: ActionTemplateCategory;
  aliTemplateId?: string;
  durationSec: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  popularity: number;
  isActive: boolean;
  source: ActionTemplateSource;
  createdAt: number;
  updatedAt: number;
}

/** 创建模板输入 */
export interface CreateActionTemplateInput {
  name: string;
  category: ActionTemplateCategory;
  aliTemplateId?: string;
  durationSec: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  source: ActionTemplateSource;
}

/** 更新模板输入 */
export interface UpdateActionTemplateInput {
  name?: string;
  category?: ActionTemplateCategory;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  popularity?: number;
  isActive?: boolean;
}

/** 查询模板列表参数 */
export interface QueryActionTemplatesParams {
  category?: ActionTemplateCategory;
  isActive?: boolean;
  source?: ActionTemplateSource;
  sortBy?: "popularity" | "duration_sec" | "created_at";
  sortOrder?: "ASC" | "DESC";
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// 动作迁移任务类型
// ---------------------------------------------------------------------------

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

/** 创建动作迁移任务输入 */
export interface CreateActionTransferTaskInput {
  projectId: string;
  userId: string;
  actionSourceType: ActionSourceType;
  sourceVideoUrl?: string;
  builtinTemplateId?: string;
  targetImageUrl: string;
  prompt?: string;
  durationSec?: number;
  backgroundMode?: "image" | "video";
}

/** 更新任务输入 */
export interface UpdateActionTransferTaskInput {
  status?: ActionTransferStatus;
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
  asyncJobId?: string;
}

/** 动作迁移任务记录 */
export interface ActionTransferTaskRecord {
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

/** 查询任务列表参数 */
export interface QueryActionTransferTasksParams {
  userId?: string;
  projectId?: string;
  status?: ActionTransferStatus;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// API 响应类型
// ---------------------------------------------------------------------------

/** 创建任务响应 */
export interface CreateActionTransferTaskResponse {
  taskId: string;
  asyncJobId: string;
  status: ActionTransferStatus;
}

/** 任务详情响应 */
export interface ActionTransferTaskDetailResponse {
  taskId: string;
  projectId: string;
  status: ActionTransferStatus;
  actionSourceType: ActionSourceType;

  // 进度信息
  progress?: {
    stage: string;
    message: string;
    percentage?: number;
  };

  // 结果信息
  result?: {
    videoUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
  };

  // 错误信息
  error?: {
    code: string;
    message: string;
    stage?: ErrorStage;
  };

  createdAt: number;
  updatedAt: number;
}

/** 模板列表响应 */
export interface ActionTemplateListResponse {
  items: ActionTemplate[];
  total: number;
  hasMore: boolean;
}