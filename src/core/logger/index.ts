/**
 * 日志系统统一导出
 *
 * 提供完整的日志 API 和向后兼容层
 */

// ==================== 核心类型 ====================

export type {
  LogLevel,
  FileRotationConfig,
  FileTransportConfig,
  LoggerConfig,
  LogContext,
} from "./types.js";

// ==================== 核心类和函数 ====================

export { AppLogger } from "./logger.js";
export { getLogger, loggers, initLoggerSystem, resetLoggerSystem } from "./modules.js";
export { setupLoggerSystem, createTraceIdHook, createFastifyLoggerConfig } from "./setup-logger.js";

// 导入 getLogger 用于兼容层
import { getLogger } from "./modules.js";

// ==================== 向后兼容层 ====================

/**
 * 控制台兼容日志器接口
 */
interface ConsoleCompatibleLogger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
}

/** 日志器缓存 */
const consoleLoggerCache = new Map<string, ConsoleCompatibleLogger>();

/**
 * 创建延迟初始化的控制台兼容日志器
 *
 * 使用闭包缓存日志器实例，延迟初始化直到第一次访问
 *
 * @param module - 模块名称
 * @returns 控制台兼容的日志器
 */
function createLazyConsoleLogger(module: string): ConsoleCompatibleLogger {
  let cached: ConsoleCompatibleLogger | null = null;

  return {
    get log() { return (cached || (cached = createConsoleCompatibleLogger(module))).log; },
    get info() { return (cached || (cached = createConsoleCompatibleLogger(module))).info; },
    get warn() { return (cached || (cached = createConsoleCompatibleLogger(module))).warn; },
    get error() { return (cached || (cached = createConsoleCompatibleLogger(module))).error; },
    get debug() { return (cached || (cached = createConsoleCompatibleLogger(module))).debug; },
    get trace() { return (cached || (cached = createConsoleCompatibleLogger(module))).trace; },
  };
}

/**
 * 创建控制台兼容日志器
 *
 * 返回符合 console 接口的日志器，用于替代 console.log 等方法
 *
 * @param module - 模块名称
 * @returns 控制台兼容的日志器
 */
export function createConsoleCompatibleLogger(module: string): ConsoleCompatibleLogger {
  // 检查缓存
  const cached = consoleLoggerCache.get(module);
  if (cached) {
    return cached;
  }

  // 获取 AppLogger
  const appLogger = getLogger(module);

  // 创建新日志器
  const logger: ConsoleCompatibleLogger = {
    log: (...args: unknown[]) => {
      const firstArg = args[0];
      // 对象类型需要序列化，不能直接 String()
      if (firstArg && typeof firstArg === "object") {
        appLogger.info(JSON.stringify(firstArg));
      } else {
        appLogger.info(String(firstArg ?? ""));
      }
    },
    info: (...args: unknown[]) => {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === "object") {
        appLogger.info(JSON.stringify(firstArg));
      } else {
        appLogger.info(String(firstArg ?? ""));
      }
    },
    warn: (...args: unknown[]) => {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === "object") {
        appLogger.warn(JSON.stringify(firstArg));
      } else {
        appLogger.warn(String(firstArg ?? ""));
      }
    },
    error: (...args: unknown[]) => {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === "object") {
        appLogger.error(JSON.stringify(firstArg));
      } else {
        appLogger.error(String(firstArg ?? ""));
      }
    },
    debug: (...args: unknown[]) => {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === "object") {
        appLogger.debug(JSON.stringify(firstArg));
      } else {
        appLogger.debug(String(firstArg ?? ""));
      }
    },
    trace: (...args: unknown[]) => {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === "object") {
        appLogger.trace(JSON.stringify(firstArg));
      } else {
        appLogger.trace(String(firstArg ?? ""));
      }
    },
  };

  // 缓存并返回
  consoleLoggerCache.set(module, logger);
  return logger;
}

/**
 * 视频生成模块日志器（兼容旧 API）
 */
export const videoGenerationLogger: ConsoleCompatibleLogger = createLazyConsoleLogger("video-generation");

/**
 * LLM 传输层日志器（兼容旧 API）
 */
export const llmTransportLogger: ConsoleCompatibleLogger = createLazyConsoleLogger("llm-transport");

/**
 * Provider 日志器（兼容旧 API）
 */
export const providerLogger: ConsoleCompatibleLogger = createLazyConsoleLogger("provider");

/**
 * 视频任务日志器（兼容旧 API）
 */
export const videoJobLogger: ConsoleCompatibleLogger = createLazyConsoleLogger("video-job");

/**
 * 热门趋势日志器（兼容旧 API）
 */
export const hotTrendLogger: ConsoleCompatibleLogger = createLazyConsoleLogger("hot-trend");
