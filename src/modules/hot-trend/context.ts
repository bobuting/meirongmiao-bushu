/**
 * 热榜模块上下文
 * 聚合模块所需的所有依赖
 */

import type { AppConfig } from "../../contracts/types.js";
import type { Pool } from "pg";

/**
 * 热榜模块上下文
 */
export interface HotTrendModuleContext {
  /** 数据库连接池 */
  db: Pool;
  /** 应用配置 */
  config: AppConfig;
  /** 当前时间戳（毫秒） */
  now: () => number;
  /** 日志记录器 */
  log: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  };
  /** 审计成功回调 */
  onAuditSuccess: (requestSummary: string, responseSummary: string) => void;
  /** 审计错误回调 */
  onAuditError: (requestSummary: string, code: string, message: string) => void;
  /** 警告回调 */
  onWarn: (error: unknown) => void;
}

/**
 * 创建热榜模块上下文
 */
export function createHotTrendModuleContext(input: {
  db: Pool;
  config: AppConfig;
  now?: () => number;
  log?: HotTrendModuleContext["log"];
  onAuditSuccess?: (requestSummary: string, responseSummary: string) => void;
  onAuditError?: (requestSummary: string, code: string, message: string) => void;
  onWarn?: (error: unknown) => void;
}): HotTrendModuleContext {
  return {
    db: input.db,
    config: input.config,
    now: input.now ?? (() => Date.now()),
    log: input.log ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    onAuditSuccess: input.onAuditSuccess ?? (() => {}),
    onAuditError: input.onAuditError ?? (() => {}),
    onWarn: input.onWarn ?? (() => {}),
  };
}

/**
 * 热榜同步调度选项
 */
export interface HotTrendSyncScheduleOptions {
  realtimeIntervalMs: number;
  videoIntervalMs: number;
}

/**
 * 调度热榜同步任务
 * 实际同步逻辑将在 sync-handler 中实现
 */
export function scheduleHotTrendSync(
  ctx: HotTrendModuleContext,
  options: HotTrendSyncScheduleOptions,
): void {
  // 同步调度逻辑将在 sync-handler.ts 中实现
  // 此函数仅作为入口点占位
  ctx.log.info({ options }, "hot trend sync scheduled (placeholder)");
}