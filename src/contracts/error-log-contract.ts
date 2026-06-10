/**
 * 错误日志类型定义和接口契约
 */

/** 错误级别 */
export type ErrorSeverity = "error" | "warn" | "critical";

/** 错误日志实体 */
export interface ErrorLog {
  id: string;
  errorCode: string;
  errorMessage: string;
  errorStack?: string | null;
  severity: ErrorSeverity;
  createdAt: number;

  userId?: string | null;
  requestId?: string | null;
  apiPath?: string | null;
  sourceModule?: string | null;

  llmModel?: string | null;
  llmInput?: string | null;
  llmOutput?: string | null;

  projectId?: string | null;
  inputParams?: Record<string, unknown> | null;
  serviceVersion?: string | null;
}

/** 错误日志上下文（记录时提供） */
export interface ErrorLogContext {
  userId?: string;
  requestId?: string;
  apiPath?: string;
  sourceModule?: string;
  projectId?: string;
  inputParams?: Record<string, unknown>;
}

/** LLM 错误扩展上下文 */
export interface LlmErrorContext extends ErrorLogContext {
  llmModel: string;
  llmInput: string;
  llmOutput?: string;
}

/** 错误日志查询过滤条件 */
export interface ErrorLogFilters {
  page?: number;
  pageSize?: number;
  severity?: ErrorSeverity;
  errorCode?: string;
  userId?: string;
  sourceModule?: string;
  startDate?: number;
  endDate?: number;
}

/** 按错误码统计结果 */
export interface ErrorCodeCountResult {
  errorCode: string;
  count: number;
}

/** 按日期统计结果 */
export interface DateCountResult {
  date: string;
  count: number;
}

/** 清理统计结果 */
export interface CleanupStats {
  criticalDeleted: number;
  errorDeleted: number;
  warnDeleted: number;
  totalDeleted: number;
}