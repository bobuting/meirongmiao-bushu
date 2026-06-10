/**
 * 视频服务类型定义
 * 统一的视频任务响应类型和提取器接口
 */

/**
 * 视频任务统一状态
 */
export type VideoTaskStatus =
  | "pending"      // 任务已创建，等待处理
  | "processing"   // 正在生成中
  | "succeeded"    // 生成成功
  | "failed";      // 生成失败

/**
 * 视频任务响应（提取器输出）
 */
export interface VideoTaskResponse {
  /** 任务 ID（异步模式） */
  taskId: string | null;
  /** 任务状态 */
  status: VideoTaskStatus;
  /** 视频URL列表（成功时） */
  videoUrls: string[];
  /** 错误信息（失败时） */
  error?: {
    code: string;
    message: string;
  };
  /** 扩展元数据（各 Provider 可选返回） */
  metadata?: {
    /** 视频时长（秒） */
    videoDuration?: number | null;
    /** 服务模式（如 wan-std → standard, wan-pro → pro） */
    videoRatio?: string | null;
    /** 其他扩展字段 */
    [key: string]: unknown;
  };
}

/**
 * 视频响应提取器接口
 * 每个 Provider 实现此接口，负责解析自己的响应格式
 */
export interface VideoResponseExtractor {
  /**
   * 提取任务 ID
   * 从创建任务响应中提取 taskId
   */
  extractTaskId(response: unknown): string | null;

  /**
   * 提取任务状态
   * 返回统一状态枚举，内部完成映射
   */
  extractTaskStatus(response: unknown): VideoTaskStatus | null;

  /**
   * 提取视频 URL 列表
   * 从查询响应中提取所有视频 URL
   */
  extractVideoUrls(response: unknown): string[];

  /**
   * 提取错误信息
   * 从响应中提取错误码和错误消息
   */
  extractError(response: unknown): { code: string; message: string } | null;

  /**
   * 解析完整响应
   * 组合以上方法，返回统一响应对象
   */
  parse(response: unknown): VideoTaskResponse;
}
