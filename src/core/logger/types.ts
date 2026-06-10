/**
 * 日志系统类型定义
 */

/** 日志级别 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** 文件轮转配置 */
export interface FileRotationConfig {
  /** 单文件最大字节（默认 20MB） */
  maxSizeBytes: number;
  /** 保留天数（默认 7 天） */
  maxAgeDays: number;
  /** 是否压缩旧文件（默认 true） */
  compress: boolean;
}

/** 文件传输配置 */
export interface FileTransportConfig {
  /** 是否启用文件日志 */
  enabled: boolean;
  /** 日志目录（默认 'logs/'） */
  dir: string;
  /** 文件名前缀（默认 'app'） */
  prefix: string;
  /** 轮转配置 */
  rotation: FileRotationConfig;
  /** 输出格式 */
  format: "json" | "pretty";
}

/** 日志器配置 */
export interface LoggerConfig {
  /** 全局日志级别 */
  level: LogLevel;
  /** 模块名称 */
  module?: string;
  /** 是否输出到控制台 */
  console: boolean;
  /** 文件传输配置 */
  file: FileTransportConfig;
}

/** 日志上下文（附加到每条日志） */
export interface LogContext {
  /** 模块标识 */
  module: string;
  /** 请求 ID */
  requestId?: string;
  /** 跨服务追踪 ID */
  traceId?: string;
  /** 当前操作 ID */
  spanId?: string;
  /** 项目 ID */
  projectId?: string;
  /** 用户 ID */
  userId?: string;
  /** 自定义字段 */
  [key: string]: unknown;
}
