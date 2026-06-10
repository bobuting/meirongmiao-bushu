/**
 * 模块日志器工厂
 *
 * 提供全局日志系统初始化和模块日志器获取
 */

import pino from "pino";
import { createRequire } from "module";
import type { Writable } from "stream";
import type { LoggerConfig } from "./types.js";
import { AppLogger } from "./logger.js";
import { resolveLoggerConfig } from "./config.js";
import { LogRotationManager } from "./rotation.js";
import { DailyRotatingStream, MultiStream } from "./daily-rotating-stream.js";

// ES Module 中获取 require（用于动态加载 pino-pretty）
const require = createRequire(import.meta.url);

/** 模块日志器缓存 */
const loggerCache = new Map<string, AppLogger>();

/** 全局配置 */
let globalConfig: LoggerConfig | null = null;

/** 全局 Pino 实例 */
let globalPino: pino.Logger | null = null;

/** 全局输出流（供 Fastify logger 复用，避免重复创建文件流） */
let globalStream: Writable | undefined = undefined;

/** 轮转管理器 */
let rotationManager: LogRotationManager | null = null;

/**
 * 创建日志输出流（主线程模式）
 *
 * 替代 Pino worker-thread transport，使用主线程 Writable 流：
 * - 控制台：pino-pretty（动态加载，不可用时回退到 stdout）
 * - 文件：DailyRotatingStream（按日期自动切换文件）
 */
function createLoggerStream(config: LoggerConfig): Writable | undefined {
  const streams: Writable[] = [];
  const isDevelopment = (process.env.NODE_ENV ?? "development") !== "production";

  // 控制台流
  if (config.console) {
    try {
      const pretty = require("pino-pretty");
      streams.push(
        pretty({
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        }),
      );
    } catch {
      streams.push(process.stdout);
    }
  }

  // 文件流（DailyRotatingStream 在每次写入时检查日期，跨日自动切换）
  if (config.file.enabled) {
    const { dir, prefix } = config.file;

    if (isDevelopment) {
      // 开发环境：文本 + JSON 双输出
      streams.push(new DailyRotatingStream({ dir, prefix, type: "info", ext: "log", pretty: true }));
      streams.push(new DailyRotatingStream({ dir, prefix, type: "info", ext: "json" }));
      streams.push(
        new DailyRotatingStream({ dir, prefix, type: "error", ext: "log", pretty: true, minLevel: "warn" }),
      );
      streams.push(new DailyRotatingStream({ dir, prefix, type: "error", ext: "json", minLevel: "warn" }));
    } else {
      // 生产环境：仅 JSON
      streams.push(new DailyRotatingStream({ dir, prefix, type: "info", ext: "json" }));
      streams.push(new DailyRotatingStream({ dir, prefix, type: "error", ext: "json", minLevel: "warn" }));
    }
  }

  if (streams.length === 0) return undefined;
  if (streams.length === 1) return streams[0];
  return new MultiStream(streams);
}

/**
 * 初始化日志系统
 *
 * 首次调用初始化全局配置和根日志器，
 * 后续调用返回已初始化的实例
 *
 * @param config - 可选的自定义配置，未提供时从环境变量解析
 * @returns 根日志器
 */
export function initLoggerSystem(config?: LoggerConfig): AppLogger {
  // 已初始化则返回缓存
  if (globalPino && globalConfig) {
    return getLogger("app");
  }

  // 使用自定义配置或解析环境变量
  globalConfig = config ?? resolveLoggerConfig();

  // 创建 Pino 选项
  const pinoOptions: pino.LoggerOptions = {
    level: globalConfig.level,
  };

  // 创建主线程日志输出流（支持按天滚动）
  const stream = createLoggerStream(globalConfig);
  globalStream = stream;

  // 创建 Pino 实例
  if (stream) {
    globalPino = pino(pinoOptions, stream);
  } else {
    globalPino = pino(pinoOptions);
  }

  // 启动文件轮转管理（如果文件日志启用）
  if (globalConfig.file.enabled) {
    rotationManager = new LogRotationManager(
      globalConfig.file.dir,
      globalConfig.file.rotation
    );
    rotationManager.start();
  }

  // 返回根日志器
  return getLogger("app");
}

/**
 * 重置日志系统
 *
 * 清除所有缓存和全局状态，仅用于测试
 */
export function resetLoggerSystem(): void {
  // 停止轮转管理器
  if (rotationManager) {
    rotationManager.stop();
    rotationManager = null;
  }

  // 关闭全局输出流（释放底层文件描述符）
  if (globalStream) {
    globalStream.end();
  }

  // 清除缓存
  loggerCache.clear();
  globalConfig = null;
  globalPino = null;
  globalStream = undefined;
}

/**
 * 获取全局输出流（供 Fastify logger 复用）
 *
 * Fastify logger 通过此方法获取与 app logger 相同的流，
 * 避免创建重复的 DailyRotatingStream 写同一组文件。
 */
export function getGlobalStream(): Writable | undefined {
  return globalStream;
}

/**
 * 获取模块日志器
 *
 * 相同模块名返回缓存的日志器实例
 *
 * @param module - 模块名称
 * @returns 模块日志器
 */
export function getLogger(module: string): AppLogger {
  // 确保系统已初始化
  if (!globalPino || !globalConfig) {
    initLoggerSystem();
  }

  // 检查缓存
  const cached = loggerCache.get(module);
  if (cached) {
    return cached;
  }

  // 创建新的模块日志器
  const moduleConfig: LoggerConfig = {
    ...globalConfig!,
    module,
  };

  // 创建子 Pino 实例（带模块名）
  const modulePino = globalPino!.child({ module });
  const logger = new AppLogger(modulePino, moduleConfig);

  // 设置轮转管理器
  if (rotationManager) {
    logger.setRotationManager(rotationManager);
  }

  // 缓存并返回
  loggerCache.set(module, logger);
  return logger;
}

/**
 * 预定义日志器
 *
 * 常用模块的日志器实例，按需初始化
 */
export const loggers = {
  /** 应用主日志器 */
  get app(): AppLogger {
    return getLogger("app");
  },

  /** 视频生成模块 */
  get video(): AppLogger {
    return getLogger("video");
  },

  /** LLM 调用模块 */
  get llm(): AppLogger {
    return getLogger("llm");
  },

  /** Provider 模块 */
  get provider(): AppLogger {
    return getLogger("provider");
  },

  /** 热门趋势模块 */
  get hotTrend(): AppLogger {
    return getLogger("hotTrend");
  },

  /** 数据库模块 */
  get db(): AppLogger {
    return getLogger("db");
  },

  /** 认证模块 */
  get auth(): AppLogger {
    return getLogger("auth");
  },
};
