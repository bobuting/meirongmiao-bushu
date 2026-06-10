/**
 * 传输层配置
 *
 * 创建 Pino 多传输配置，支持控制台和文件输出
 */

import type { LoggerConfig } from "./types.js";

/**
 * 获取当前日期字符串（YYYY-MM-DD）
 */
function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * 生成日志文件路径
 *
 * @param dir - 日志目录
 * @param prefix - 文件名前缀
 * @param type - 日志类型（info/error）
 * @returns 日志文件路径
 */
export function getLogFilePath(dir: string, prefix: string, type: "info" | "error"): string {
  const date = getDateString();
  return `${dir}${prefix}-${type}-${date}.log`;
}

/**
 * Pino 传输配置
 */
interface PinoTransport {
  target: string;
  level?: string;
  options?: Record<string, unknown>;
}

/**
 * 创建 Pino 多传输配置
 *
 * - 控制台传输：pino-pretty（config.console = true 时）
 * - Info 文件：存储所有级别（level: "trace"）
 * - Error 文件：仅存储 warn 及以上（level: "warn"）
 *
 * @param config - 日志器配置
 * @returns 传输配置数组，无传输时返回 undefined
 */
export function createTransports(config: LoggerConfig): PinoTransport[] | undefined {
  const transports: PinoTransport[] = [];

  // 控制台传输
  if (config.console) {
    transports.push({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    });
  }

  // 文件传输
  if (config.file.enabled) {
    const { dir, prefix } = config.file;

    // Info 文件：记录所有级别
    transports.push({
      target: "pino/file",
      level: "trace",
      options: {
        destination: getLogFilePath(dir, prefix, "info"),
      },
    });

    // Error 文件：仅记录 warn 及以上
    transports.push({
      target: "pino/file",
      level: "warn",
      options: {
        destination: getLogFilePath(dir, prefix, "error"),
      },
    });
  }

  return transports.length > 0 ? transports : undefined;
}
