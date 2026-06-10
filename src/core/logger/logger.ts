/**
 * 核心日志器
 *
 * AppLogger 封装 Pino，提供：
 * - 敏感信息自动脱敏
 * - 模块名注入
 * - 子日志器
 * - 结构化错误日志
 */

import type pino from "pino";
import type { LoggerConfig, LogContext } from "./types.js";
import { redactObject } from "./redact.js";
import type { LogRotationManager } from "./rotation.js";

/**
 * 应用日志器
 *
 * 封装 Pino 日志器，提供敏感信息脱敏和模块名注入
 */
export class AppLogger {
  private readonly pino: pino.Logger;
  private readonly config: LoggerConfig;
  private rotationManager: LogRotationManager | null = null;

  /**
   * 创建日志器
   *
   * @param pinoLogger - Pino 日志器实例
   * @param config - 日志器配置
   */
  constructor(pinoLogger: pino.Logger, config: LoggerConfig) {
    this.pino = pinoLogger;
    this.config = config;
  }

  /**
   * 从 Pino 实例创建
   *
   * @param pinoLogger - Pino 日志器实例
   * @param module - 模块名称
   * @returns AppLogger 实例
   */
  static fromPino(pinoLogger: pino.Logger, module: string): AppLogger {
    const config: LoggerConfig = {
      level: pinoLogger.level as LoggerConfig["level"],
      module,
      console: true,
      file: {
        enabled: false,
        dir: "logs/",
        prefix: "app",
        rotation: {
          maxSizeBytes: 20 * 1024 * 1024,
          maxAgeDays: 7,
          compress: true,
        },
        format: "json",
      },
    };
    return new AppLogger(pinoLogger, config);
  }

  /**
   * 设置轮转管理器
   *
   * @param manager - 轮转管理器实例
   */
  setRotationManager(manager: LogRotationManager): void {
    this.rotationManager = manager;
  }

  /**
   * 停止轮转管理
   */
  stopRotation(): void {
    if (this.rotationManager) {
      this.rotationManager.stop();
    }
  }

  /**
   * 脱敏日志对象
   *
   * @param obj - 原始对象
   * @returns 脱敏后的对象副本
   */
  private redact<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (typeof obj !== "object") {
      return obj;
    }
    return redactObject(obj);
  }

  /**
   * 合并模块上下文
   *
   * @param obj - 用户传入的对象
   * @returns 合并了模块名的对象
   */
  private mergeModuleContext(obj?: Record<string, unknown>): Record<string, unknown> {
    const context: Record<string, unknown> = obj ? this.redact(obj) : {};

    // 自动处理 err 字段：如果不是 Error 对象，包装成 Error
    if (context.err !== undefined && !(context.err instanceof Error)) {
      context.err = context.err instanceof Error ? context.err : new Error(String(context.err));
    }

    if (this.config.module) {
      context.module = this.config.module;
    }
    return context;
  }

  // ==================== 日志方法 ====================

  /**
   * Trace 级别日志
   */
  trace(message: string): void;
  trace(obj: Record<string, unknown>, message?: string): void;
  trace(error: Error, message?: string): void;
  trace(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
    if (arg1 instanceof Error) {
      const errorObj = { err: arg1, message: arg1.message, stack: arg1.stack };
      this.pino.trace(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
    } else if (typeof arg1 === "string") {
      this.pino.trace(arg1);
    } else {
      this.pino.trace(this.mergeModuleContext(arg1), arg2 ?? "");
    }
  }

  /**
   * Debug 级别日志
   */
  debug(message: string): void;
  debug(obj: Record<string, unknown>, message?: string): void;
  debug(error: Error, message?: string): void;
  debug(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
    if (arg1 instanceof Error) {
      const errorObj = { err: arg1, message: arg1.message, stack: arg1.stack };
      this.pino.debug(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
    } else if (typeof arg1 === "string") {
      this.pino.debug(arg1);
    } else {
      this.pino.debug(this.mergeModuleContext(arg1), arg2 ?? "");
    }
  }

  /**
   * Info 级别日志
   */
  info(message: string): void;
  info(obj: Record<string, unknown>, message?: string): void;
  info(error: Error, message?: string): void;
  info(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
    if (arg1 instanceof Error) {
      const errorObj = { err: arg1, message: arg1.message, stack: arg1.stack };
      this.pino.info(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
    } else if (typeof arg1 === "string") {
      this.pino.info(arg1);
    } else {
      this.pino.info(this.mergeModuleContext(arg1), arg2 ?? "");
    }
  }

  /**
   * Warn 级别日志
   */
  warn(message: string): void;
  warn(obj: Record<string, unknown>, message?: string): void;
  warn(error: Error, message?: string): void;
  warn(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
    if (arg1 instanceof Error) {
      const errorObj = { err: arg1, message: arg1.message, stack: arg1.stack };
      this.pino.warn(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
    } else if (typeof arg1 === "string") {
      this.pino.warn(arg1);
    } else {
      this.pino.warn(this.mergeModuleContext(arg1), arg2 ?? "");
    }
  }

  /**
   * Error 级别日志
   */
  error(message: string): void;
  error(obj: Record<string, unknown>, message?: string): void;
  error(error: Error, message?: string): void;
  error(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
    if (arg1 instanceof Error) {
      const errorObj = { err: arg1, message: arg1.message, stack: arg1.stack };
      this.pino.error(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
    } else if (typeof arg1 === "string") {
      this.pino.error(arg1);
    } else {
      this.pino.error(this.mergeModuleContext(arg1), arg2 ?? "");
    }
  }

  /**
   * Fatal 级别日志
   */
  fatal(message: string): void;
  fatal(obj: Record<string, unknown>, message?: string): void;
  fatal(error: Error, message?: string): void;
  fatal(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
    if (arg1 instanceof Error) {
      const errorObj = { err: arg1, message: arg1.message, stack: arg1.stack };
      this.pino.fatal(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
    } else if (typeof arg1 === "string") {
      this.pino.fatal(arg1);
    } else {
      this.pino.fatal(this.mergeModuleContext(arg1), arg2 ?? "");
    }
  }

  // ==================== 高级功能 ====================

  /**
   * 创建子日志器
   *
   * 子日志器继承父日志器的配置，并附加额外上下文
   *
   * @param context - 子日志器上下文
   * @returns 子日志器实例
   */
  child(context: LogContext): AppLogger {
    const childPino = this.pino.child(this.redact(context));
    const childConfig: LoggerConfig = {
      ...this.config,
      module: context.module ?? this.config.module,
    };
    const childLogger = new AppLogger(childPino, childConfig);
    if (this.rotationManager) {
      childLogger.setRotationManager(this.rotationManager);
    }
    return childLogger;
  }
}
