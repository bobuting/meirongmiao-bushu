/**
 * 错误日志服务
 * 统一错误日志记录入口，协调 Queue 和 Repository
 */

import type { ErrorLogQueue } from "./error-log-queue.js";
import type {
  ErrorLog,
  ErrorLogContext,
  LlmErrorContext,
  ErrorSeverity,
} from "../../contracts/error-log-contract.js";
import { AppError } from "../../core/errors.js";
import { randomUUID } from "crypto";

export class ErrorLogService {
  private readonly queue: ErrorLogQueue;

  constructor(queue: ErrorLogQueue) {
    this.queue = queue;
  }

  /** 记录错误（统一入口） */
  log(error: Error, context: ErrorLogContext = {}): void {
    const log: ErrorLog = {
      id: randomUUID(),
      errorCode: this.extractErrorCode(error),
      errorMessage: error.message,
      errorStack: error.stack,
      severity: this.determineSeverity(error),
      createdAt: Date.now(),
      userId: context.userId ?? null,
      requestId: context.requestId ?? null,
      apiPath: context.apiPath ?? null,
      sourceModule: context.sourceModule ?? null,
      projectId: context.projectId ?? null,
      inputParams: context.inputParams ?? null,
    };

    this.queue.enqueue(log);
  }

  /** 记录 LLM 错误（扩展入口） */
  logLlmError(error: Error, context: LlmErrorContext): void {
    const log: ErrorLog = {
      id: randomUUID(),
      errorCode: "LLM_ERROR",
      errorMessage: error.message,
      errorStack: error.stack,
      severity: "error",
      createdAt: Date.now(),
      userId: context.userId ?? null,
      requestId: context.requestId ?? null,
      apiPath: context.apiPath ?? null,
      sourceModule: context.sourceModule ?? null,
      llmModel: context.llmModel,
      llmInput: context.llmInput,
      llmOutput: context.llmOutput ?? null,
      projectId: context.projectId ?? null,
    };

    this.queue.enqueue(log);
  }

  /** 手动 flush（供进程退出 hook 调用） */
  async flush(): Promise<void> {
    await this.queue.flush();
  }

  /** 提取错误码 */
  private extractErrorCode(error: Error): string {
    if (error instanceof AppError) {
      return error.code;
    }
    return "INTERNAL_ERROR";
  }

  /** 判断错误级别 */
  private determineSeverity(error: Error): ErrorSeverity {
    if (error instanceof AppError) {
      // 5xx 错误视为 critical
      if (error.statusCode >= 500) {
        return "critical";
      }
      // 4xx 错误视为 error
      return "error";
    }

    // 未捕获的异常视为 critical
    return "critical";
  }
}