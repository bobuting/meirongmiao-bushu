/**
 * 错误日志服务初始化模块
 */

import type { PgErrorLogRepository } from "../repositories/pg/error-log-pg-repository.js";
import { ErrorLogQueue } from "../services/error-log/error-log-queue.js";
import { ErrorLogService } from "../services/error-log/error-log-service.js";

/** 错误日志初始化结果 */
export interface ErrorLogSetupResult {
  errorLogService: ErrorLogService;
  errorLogQueue: ErrorLogQueue;
}

/** 初始化错误日志服务 */
export function setupErrorLog(errorLogRepo: PgErrorLogRepository): ErrorLogSetupResult {
  const queue = new ErrorLogQueue(errorLogRepo, {
    maxBatchSize: 100,
    flushIntervalMs: 5000,
  });

  const service = new ErrorLogService(queue);

  return {
    errorLogService: service,
    errorLogQueue: queue,
  };
}