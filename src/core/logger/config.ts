/**
 * 日志配置解析
 *
 * 从环境变量解析日志配置，支持环境自适应
 */

import dotenv from "dotenv";
import type { LogLevel, LoggerConfig } from "./types.js";

// 确保环境变量已加载（ES Module import 提升问题）
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

/**
 * 解析布尔类型环境变量
 */
export function parseEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value === "true" || value === "1";
}

/**
 * 解析整数类型环境变量
 */
export function parseEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

/**
 * 解析日志级别
 */
export function resolveLogLevel(): LogLevel {
  // 优先使用环境变量
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

  if (envLevel && validLevels.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }

  // 根据环境默认
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "test") {
    return "warn";
  }
  if (nodeEnv === "development") {
    return "debug";
  }
  return "info";
}

/**
 * 获取当前日期字符串（YYYY-MM-DD）
 */
function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * 解析完整日志配置
 */
export function resolveLoggerConfig(): LoggerConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
  const isProduction = nodeEnv === "production";

  return {
    level: resolveLogLevel(),
    // 支持环境变量覆盖，默认开发模式开启控制台
    console: parseEnvBool("LOG_CONSOLE", !isProduction),
    file: {
      enabled: parseEnvBool("LOG_FILE_ENABLED", isProduction),
      dir: process.env.LOG_FILE_DIR ?? "logs/",
      prefix: process.env.LOG_FILE_PREFIX ?? "app",
      rotation: {
        maxSizeBytes: parseEnvInt("LOG_FILE_MAX_SIZE_MB", 20) * 1024 * 1024,
        maxAgeDays: parseEnvInt("LOG_FILE_MAX_AGE_DAYS", 7),
        compress: parseEnvBool("LOG_FILE_COMPRESS", true),
      },
      format: isProduction ? "json" : "pretty",
    },
  };
}

/**
 * 获取日志文件路径
 */
export function getLogFilePath(dir: string, prefix: string, type: "info" | "error"): string {
  const date = getDateString();
  return `${dir}${prefix}-${type}-${date}.log`;
}
