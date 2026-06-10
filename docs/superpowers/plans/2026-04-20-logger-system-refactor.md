# 日志系统重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 重构日志系统，实现文件持久化、模块化、等级化，支持错误日志分级存储和链路追踪。

**架构：** 基于 Pino 多传输架构，控制台 + 文件双输出，info/error 文件分离存储，应用内轮转管理。

**技术栈：** TypeScript 5.9, Pino 10.3, pino-pretty 13.1, Node.js ES2022

---

## 文件结构

```
src/core/logger/
├── index.ts              # 统一导出 + 兼容层
├── types.ts              # 类型定义
├── config.ts             # 配置解析
├── redact.ts             # 敏感信息脱敏
├── transport.ts          # 传输层配置
├── rotation.ts           # 文件轮转管理
├── logger.ts             # 核心日志器类
├── modules.ts            # 模块日志器工厂
└── setup-logger.ts       # Fastify 集成

test/core/logger/
├── types.test.ts
├── config.test.ts
├── redact.test.ts
├── transport.test.ts
├── rotation.test.ts
├── logger.test.ts
├── modules.test.ts
└── setup-logger.test.ts
```

---

## 任务 1：创建目录结构和类型定义

**文件：**
- 创建：`src/core/logger/types.ts`
- 创建：`test/core/logger/types.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/types.test.ts
import { describe, it, expect } from "vitest";
import type { LogLevel, FileRotationConfig, FileTransportConfig, LoggerConfig, LogContext, ErrorLogPayload } from "@/core/logger/types.js";

describe("Logger Types", () => {
  it("LogLevel should be valid string union", () => {
    const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
    expect(levels.length).toBe(6);
  });

  it("FileRotationConfig should have required fields", () => {
    const config: FileRotationConfig = {
      maxSizeBytes: 20 * 1024 * 1024,
      maxAgeDays: 7,
      compress: true,
    };
    expect(config.maxSizeBytes).toBe(20 * 1024 * 1024);
    expect(config.maxAgeDays).toBe(7);
    expect(config.compress).toBe(true);
  });

  it("LoggerConfig should have all required fields", () => {
    const config: LoggerConfig = {
      level: "info",
      module: "test",
      console: true,
      file: {
        enabled: true,
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
    expect(config.level).toBe("info");
    expect(config.file.enabled).toBe(true);
  });

  it("LogContext should support optional fields", () => {
    const ctx: LogContext = {
      module: "video",
      requestId: "req-123",
      traceId: "trace-456",
      customField: "value",
    };
    expect(ctx.module).toBe("video");
    expect(ctx.requestId).toBe("req-123");
    expect(ctx.customField).toBe("value");
  });

  it("ErrorLogPayload should have required fields", () => {
    const payload: ErrorLogPayload = {
      code: "VIDEO_ENCODE_FAILED",
      message: "视频编码失败",
      context: { videoId: "xxx" },
    };
    expect(payload.code).toBe("VIDEO_ENCODE_FAILED");
    expect(payload.message).toBe("视频编码失败");
  });
});
```

- [ ] **步骤 2：创建类型定义文件**

```typescript
// src/core/logger/types.ts
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

/** 错误日志结构 */
export interface ErrorLogPayload {
  /** 错误码：MODULE_ERROR_TYPE */
  code: string;
  /** 用户友好消息 */
  message: string;
  /** 堆栈信息 */
  stack?: string;
  /** 上下文数据 */
  context?: { [key: string]: unknown };
  /** 原始错误 */
  cause?: Error;
}

/** 错误码常量 */
export const ErrorCodes = {
  // 视频模块
  VIDEO_ENCODE_FAILED: "VIDEO_ENCODE_FAILED",
  VIDEO_TIMEOUT: "VIDEO_TIMEOUT",

  // LLM 模块
  LLM_REQUEST_FAILED: "LLM_REQUEST_FAILED",
  LLM_TIMEOUT: "LLM_TIMEOUT",

  // 数据库模块
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  DB_QUERY_ERROR: "DB_QUERY_ERROR",

  // 认证模块
  AUTH_INVALID_TOKEN: "AUTH_INVALID_TOKEN",
  AUTH_EXPIRED_TOKEN: "AUTH_EXPIRED_TOKEN",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/types.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/types.ts test/core/logger/types.test.ts
git commit -m "feat(logger): add type definitions"
```

---

## 任务 2：实现配置解析

**文件：**
- 创建：`src/core/logger/config.ts`
- 创建：`test/core/logger/config.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveLoggerConfig, parseEnvBool, parseEnvInt, resolveLogLevel } from "@/core/logger/config.js";

describe("Logger Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("parseEnvBool", () => {
    it("should return default value when env not set", () => {
      delete process.env.TEST_BOOL;
      expect(parseEnvBool("TEST_BOOL", false)).toBe(false);
      expect(parseEnvBool("TEST_BOOL", true)).toBe(true);
    });

    it("should parse 'true' and '1' as true", () => {
      process.env.TEST_BOOL = "true";
      expect(parseEnvBool("TEST_BOOL", false)).toBe(true);

      process.env.TEST_BOOL = "1";
      expect(parseEnvBool("TEST_BOOL", false)).toBe(true);
    });

    it("should parse 'false' and '0' as false", () => {
      process.env.TEST_BOOL = "false";
      expect(parseEnvBool("TEST_BOOL", true)).toBe(false);

      process.env.TEST_BOOL = "0";
      expect(parseEnvBool("TEST_BOOL", true)).toBe(false);
    });
  });

  describe("parseEnvInt", () => {
    it("should return default value when env not set", () => {
      delete process.env.TEST_INT;
      expect(parseEnvInt("TEST_INT", 42)).toBe(42);
    });

    it("should parse valid integer", () => {
      process.env.TEST_INT = "100";
      expect(parseEnvInt("TEST_INT", 0)).toBe(100);
    });

    it("should return default for invalid integer", () => {
      process.env.TEST_INT = "invalid";
      expect(parseEnvInt("TEST_INT", 42)).toBe(42);
    });
  });

  describe("resolveLogLevel", () => {
    it("should return debug for development", () => {
      process.env.NODE_ENV = "development";
      expect(resolveLogLevel()).toBe("debug");
    });

    it("should return warn for test", () => {
      process.env.NODE_ENV = "test";
      expect(resolveLogLevel()).toBe("warn");
    });

    it("should return info for production", () => {
      process.env.NODE_ENV = "production";
      expect(resolveLogLevel()).toBe("info");
    });

    it("should respect LOG_LEVEL env", () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_LEVEL = "trace";
      expect(resolveLogLevel()).toBe("trace");
    });
  });

  describe("resolveLoggerConfig", () => {
    it("should return default config for development", () => {
      process.env.NODE_ENV = "development";
      const config = resolveLoggerConfig();

      expect(config.level).toBe("debug");
      expect(config.console).toBe(true);
      expect(config.file.enabled).toBe(false); // 开发环境默认关闭
      expect(config.file.format).toBe("pretty");
    });

    it("should return production config", () => {
      process.env.NODE_ENV = "production";
      const config = resolveLoggerConfig();

      expect(config.level).toBe("info");
      expect(config.console).toBe(false); // 生产环境关闭控制台
      expect(config.file.enabled).toBe(true);
      expect(config.file.format).toBe("json");
    });

    it("should respect LOG_FILE_DIR", () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_FILE_DIR = "/var/log/app";
      const config = resolveLoggerConfig();

      expect(config.file.dir).toBe("/var/log/app");
    });

    it("should respect LOG_FILE_MAX_SIZE_MB", () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_FILE_MAX_SIZE_MB = "50";
      const config = resolveLoggerConfig();

      expect(config.file.rotation.maxSizeBytes).toBe(50 * 1024 * 1024);
    });
  });
});
```

- [ ] **步骤 2：创建配置解析文件**

```typescript
// src/core/logger/config.ts
/**
 * 日志配置解析
 *
 * 从环境变量解析日志配置，支持环境自适应
 */

import type { LogLevel, LoggerConfig } from "./types.js";

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
    console: !isProduction, // 生产环境关闭控制台
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
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/config.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/config.ts test/core/logger/config.test.ts
git commit -m "feat(logger): add config resolver"
```

---

## 任务 3：实现敏感信息脱敏

**文件：**
- 创建：`src/core/logger/redact.ts`
- 创建：`test/core/logger/redact.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/redact.test.ts
import { describe, it, expect } from "vitest";
import { maskSensitiveValue, redactObject } from "@/core/logger/redact.js";

describe("Logger Redact", () => {
  describe("maskSensitiveValue", () => {
    it("should not mask non-sensitive keys", () => {
      expect(maskSensitiveValue("name", "test")).toBe("test");
      expect(maskSensitiveValue("email", "user@example.com")).toBe("user@example.com");
    });

    it("should mask 'password' field", () => {
      expect(maskSensitiveValue("password", "secret123")).toBe("****");
    });

    it("should mask 'token' field", () => {
      expect(maskSensitiveValue("token", "abc123xyz789")).toBe("abc1****789");
    });

    it("should mask 'apiKey' field", () => {
      expect(maskSensitiveValue("apiKey", "sk-1234567890abcdef")).toBe("sk-1****cdef");
    });

    it("should mask 'Authorization' field", () => {
      expect(maskSensitiveValue("Authorization", "Bearer token123")).toBe("Bear****123");
    });

    it("should mask short values as ****", () => {
      expect(maskSensitiveValue("secret", "abc")).toBe("****");
    });
  });

  describe("redactObject", () => {
    it("should pass through null and undefined", () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });

    it("should pass through primitives", () => {
      expect(redactObject(123)).toBe(123);
      expect(redactObject("hello")).toBe("hello");
      expect(redactObject(true)).toBe(true);
    });

    it("should redact sensitive fields in object", () => {
      const obj = {
        name: "test",
        password: "secret123",
        token: "abc123xyz",
      };
      const redacted = redactObject(obj) as Record<string, unknown>;

      expect(redacted.name).toBe("test");
      expect(redacted.password).toBe("****");
      expect(redacted.token).toBe("abc1****3xyz");
    });

    it("should redact nested sensitive fields", () => {
      const obj = {
        user: {
          name: "test",
          apiKey: "sk-1234567890",
        },
      };
      const redacted = redactObject(obj) as Record<string, unknown>;
      const user = redacted.user as Record<string, unknown>;

      expect(user.name).toBe("test");
      expect(user.apiKey).toBe("sk-1****7890");
    });

    it("should redact sensitive fields in arrays", () => {
      const obj = {
        items: [
          { name: "a", password: "secret1" },
          { name: "b", password: "secret2" },
        ],
      };
      const redacted = redactObject(obj) as Record<string, unknown>;
      const items = redacted.items as Record<string, unknown>[];

      expect(items[0].password).toBe("****");
      expect(items[1].password).toBe("****");
    });

    it("should handle max depth", () => {
      const deep: Record<string, unknown> = { level: 0 };
      let current = deep;
      for (let i = 1; i <= 15; i++) {
        current.nested = { level: i };
        current = current.nested as Record<string, unknown>;
      }

      const redacted = redactObject(deep);
      expect(redacted).toBeDefined();
    });
  });
});
```

- [ ] **步骤 2：创建脱敏文件**

```typescript
// src/core/logger/redact.ts
/**
 * 敏感信息脱敏
 *
 * 自动脱敏日志中的敏感字段
 */

/** 需要脱敏的字段名模式（不区分大小写） */
const SENSITIVE_FIELD_PATTERNS = [
  /^secret$/i,
  /^api[-_]?key$/i,
  /^auth(orization)?$/i,
  /^token$/i,
  /^password$/i,
  /^passwd$/i,
  /^credential$/i,
  /^private[-_]?key$/i,
  /^access[-_]?key$/i,
];

/**
 * 脱敏敏感值
 */
export function maskSensitiveValue(key: string, value: unknown): unknown {
  // 检查是否为敏感字段
  const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));

  if (!isSensitive) {
    return value;
  }

  if (typeof value === "string") {
    // 保留前4位和后4位，中间用 * 替换
    if (value.length <= 8) {
      return "****";
    }
    const start = value.slice(0, 4);
    const end = value.slice(-4);
    const middle = "*".repeat(Math.min(value.length - 8, 20));
    return `${start}${middle}${end}`;
  }

  return "[REDACTED]";
}

/**
 * 递归脱敏对象
 */
export function redactObject(obj: unknown, depth: number = 0): unknown {
  // 防止无限递归
  if (depth > 10) {
    return "[MAX_DEPTH]";
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object") {
      result[key] = redactObject(value, depth + 1);
    } else {
      result[key] = maskSensitiveValue(key, value);
    }
  }

  return result;
}
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/redact.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/redact.ts test/core/logger/redact.test.ts
git commit -m "feat(logger): add sensitive data redaction"
```

---

## 任务 4：实现传输层配置

**文件：**
- 创建：`src/core/logger/transport.ts`
- 创建：`test/core/logger/transport.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/transport.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTransports, getLogFilePath } from "@/core/logger/transport.js";
import type { LoggerConfig } from "@/core/logger/types.js";
import path from "path";

describe("Logger Transport", () => {
  describe("getLogFilePath", () => {
    it("should generate info log path", () => {
      const filePath = getLogFilePath("logs/", "app", "info");
      expect(filePath).toMatch(/^logs\/app-info-\d{4}-\d{2}-\d{2}\.log$/);
    });

    it("should generate error log path", () => {
      const filePath = getLogFilePath("logs/", "app", "error");
      expect(filePath).toMatch(/^logs\/app-error-\d{4}-\d{2}-\d{2}\.log$/);
    });

    it("should use custom prefix", () => {
      const filePath = getLogFilePath("/var/log/", "myapp", "info");
      expect(filePath).toMatch(/^\/var\/log\/myapp-info-\d{4}-\d{2}-\d{2}\.log$/);
    });
  });

  describe("createTransports", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return undefined when no transports configured", () => {
      const config: LoggerConfig = {
        level: "info",
        console: false,
        file: {
          enabled: false,
          dir: "logs/",
          prefix: "app",
          rotation: { maxSizeBytes: 20 * 1024 * 1024, maxAgeDays: 7, compress: true },
          format: "json",
        },
      };

      const transport = createTransports(config);
      expect(transport).toBeUndefined();
    });

    it("should create console transport only", () => {
      process.env.NODE_ENV = "development";
      const config: LoggerConfig = {
        level: "debug",
        console: true,
        file: {
          enabled: false,
          dir: "logs/",
          prefix: "app",
          rotation: { maxSizeBytes: 20 * 1024 * 1024, maxAgeDays: 7, compress: true },
          format: "pretty",
        },
      };

      const transport = createTransports(config);
      expect(transport).toBeDefined();
    });

    it("should create file transports when enabled", () => {
      process.env.NODE_ENV = "production";
      const config: LoggerConfig = {
        level: "info",
        console: false,
        file: {
          enabled: true,
          dir: "logs/",
          prefix: "app",
          rotation: { maxSizeBytes: 20 * 1024 * 1024, maxAgeDays: 7, compress: true },
          format: "json",
        },
      };

      const transport = createTransports(config);
      expect(transport).toBeDefined();
    });

    it("should create both console and file transports", () => {
      process.env.NODE_ENV = "development";
      const config: LoggerConfig = {
        level: "debug",
        console: true,
        file: {
          enabled: true,
          dir: "logs/",
          prefix: "app",
          rotation: { maxSizeBytes: 20 * 1024 * 1024, maxAgeDays: 7, compress: true },
          format: "pretty",
        },
      };

      const transport = createTransports(config);
      expect(transport).toBeDefined();
    });
  });
});
```

- [ ] **步骤 2：创建传输层文件**

```typescript
// src/core/logger/transport.ts
/**
 * 日志传输层配置
 *
 * 配置 Pino 多传输：控制台 + 文件
 */

import pino from "pino";
import type { LoggerConfig } from "./types.js";

/**
 * 获取当前日期字符串（YYYY-MM-DD）
 */
function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * 获取日志文件路径
 */
export function getLogFilePath(dir: string, prefix: string, type: "info" | "error"): string {
  const date = getDateString();
  return `${dir}${prefix}-${type}-${date}.log`;
}

/**
 * 创建传输层
 */
export function createTransports(config: LoggerConfig): pino.Transport | undefined {
  const transports: pino.TransportSingleOptions[] = [];

  // 1. 控制台传输
  if (config.console) {
    transports.push({
      level: config.level,
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    });
  }

  // 2. 文件传输
  if (config.file.enabled) {
    const infoFilePath = getLogFilePath(config.file.dir, config.file.prefix, "info");
    const errorFilePath = getLogFilePath(config.file.dir, config.file.prefix, "error");

    // Info 文件 - 存储所有级别日志
    transports.push({
      level: "trace",
      target: "pino/file",
      options: {
        destination: infoFilePath,
        mkdir: true,
      },
    });

    // Error 文件 - 只存储 warn/error/fatal
    transports.push({
      level: "warn",
      target: "pino/file",
      options: {
        destination: errorFilePath,
        mkdir: true,
      },
    });
  }

  if (transports.length === 0) {
    return undefined;
  }

  return pino.transport({ targets: transports });
}
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/transport.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/transport.ts test/core/logger/transport.test.ts
git commit -m "feat(logger): add transport configuration"
```

---

## 任务 5：实现文件轮转管理

**文件：**
- 创建：`src/core/logger/rotation.ts`
- 创建：`test/core/logger/rotation.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/rotation.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LogRotationManager } from "@/core/logger/rotation.js";
import type { FileRotationConfig } from "@/core/logger/types.js";
import fs from "fs/promises";
import path from "path";

describe("LogRotationManager", () => {
  const testLogDir = path.join(process.cwd(), "test-logs-rotation");
  const config: FileRotationConfig = {
    maxSizeBytes: 100, // 小文件便于测试
    maxAgeDays: 1,
    compress: false,
  };

  beforeEach(async () => {
    await fs.mkdir(testLogDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testLogDir, { recursive: true, force: true });
  });

  it("should create manager with config", () => {
    const manager = new LogRotationManager(config, testLogDir);
    expect(manager).toBeDefined();
  });

  it("should cleanup old files", async () => {
    // 创建一个过期文件（修改时间为 2 天前）
    const oldFile = path.join(testLogDir, "old.log");
    await fs.writeFile(oldFile, "old content");

    // 修改文件时间为 2 天前
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await fs.utimes(oldFile, new Date(twoDaysAgo), new Date(twoDaysAgo));

    const manager = new LogRotationManager(config, testLogDir);
    await manager.cleanupOldFiles();

    // 检查文件是否被删除
    await expect(fs.access(oldFile)).rejects.toThrow();
  });

  it("should keep recent files", async () => {
    // 创建一个新文件
    const newFile = path.join(testLogDir, "new.log");
    await fs.writeFile(newFile, "new content");

    const manager = new LogRotationManager(config, testLogDir);
    await manager.cleanupOldFiles();

    // 检查文件是否仍然存在
    const content = await fs.readFile(newFile, "utf-8");
    expect(content).toBe("new content");
  });

  it("should rotate file when exceeds max size", async () => {
    const currentFile = path.join(testLogDir, "app-info.log");

    // 创建一个大文件
    await fs.writeFile(currentFile, "x".repeat(150)); // 超过 100 字节

    const manager = new LogRotationManager(config, testLogDir);
    const result = await manager.rotateIfNeeded(currentFile);

    // 检查原始文件是否被重命名
    const files = await fs.readdir(testLogDir);
    expect(files.some(f => f.startsWith("app-info-") && f.endsWith(".log"))).toBe(true);
    expect(result).toBe(currentFile);
  });

  it("should not rotate small file", async () => {
    const currentFile = path.join(testLogDir, "app-info.log");

    // 创建一个小文件
    await fs.writeFile(currentFile, "small content");

    const manager = new LogRotationManager(config, testLogDir);
    const result = await manager.rotateIfNeeded(currentFile);

    expect(result).toBe(currentFile);
  });

  it("should start and stop cleanup timer", () => {
    const manager = new LogRotationManager(config, testLogDir);

    manager.start();
    // 无法直接测试定时器，但确保不抛错
    expect(() => manager.start()).not.toThrow();

    manager.stop();
    expect(() => manager.stop()).not.toThrow();
  });
});
```

- [ ] **步骤 2：创建轮转管理文件**

```typescript
// src/core/logger/rotation.ts
/**
 * 日志文件轮转管理
 *
 * 支持按大小轮转和按时间清理
 */

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import type { FileRotationConfig } from "./types.js";

/**
 * 日志轮转管理器
 */
export class LogRotationManager {
  private readonly config: FileRotationConfig;
  private readonly logDir: string;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: FileRotationConfig, logDir: string) {
    this.config = config;
    this.logDir = logDir;
  }

  /**
   * 启动定时清理（每天凌晨执行）
   */
  start(): void {
    // 立即执行一次清理
    this.cleanupOldFiles().catch(console.error);

    // 每 24 小时执行一次
    this.cleanupTimer = setInterval(
      () => this.cleanupOldFiles().catch(console.error),
      24 * 60 * 60 * 1000
    );
  }

  /**
   * 停止定时清理
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 清理过期日志
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const now = Date.now();
      const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stat = await fs.stat(filePath);

        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          console.log(`[LogRotation] Deleted expired: ${file}`);
        }
      }
    } catch (error) {
      // 目录不存在或其他错误，忽略
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[LogRotation] Cleanup error:", error);
      }
    }
  }

  /**
   * 检查并轮转大文件
   */
  async rotateIfNeeded(currentFile: string): Promise<string> {
    try {
      const stat = await fs.stat(currentFile);

      if (stat.size >= this.config.maxSizeBytes) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const ext = path.extname(currentFile);
        const base = path.basename(currentFile, ext);
        const dir = path.dirname(currentFile);
        const rotatedFile = path.join(dir, `${base}-${timestamp}${ext}`);

        await fs.rename(currentFile, rotatedFile);

        if (this.config.compress) {
          await this.compressFile(rotatedFile);
        }

        console.log(`[LogRotation] Rotated: ${path.basename(rotatedFile)}`);
        return currentFile;
      }
    } catch (error) {
      // 文件不存在，不需要轮转
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[LogRotation] Rotation error:", error);
      }
    }

    return currentFile;
  }

  /**
   * 压缩文件
   */
  private async compressFile(filePath: string): Promise<void> {
    const gzPath = `${filePath}.gz`;

    return new Promise((resolve, reject) => {
      const gzip = spawn("gzip", [filePath]);

      gzip.on("close", (code) => {
        if (code === 0) {
          console.log(`[LogRotation] Compressed: ${path.basename(gzPath)}`);
          resolve();
        } else {
          reject(new Error(`gzip exited with code ${code}`));
        }
      });

      gzip.on("error", reject);
    });
  }
}
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/rotation.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/rotation.ts test/core/logger/rotation.test.ts
git commit -m "feat(logger): add file rotation manager"
```

---

## 任务 6：实现核心日志器类

**文件：**
- 创建：`src/core/logger/logger.ts`
- 创建：`test/core/logger/logger.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AppLogger } from "@/core/logger/logger.js";
import type { LoggerConfig, LogContext } from "@/core/logger/types.js";
import fs from "fs/promises";
import path from "path";

describe("AppLogger", () => {
  const testLogDir = path.join(process.cwd(), "test-logs-logger");
  const config: LoggerConfig = {
    level: "debug",
    console: false,
    file: {
      enabled: true,
      dir: testLogDir + "/",
      prefix: "test",
      rotation: {
        maxSizeBytes: 20 * 1024 * 1024,
        maxAgeDays: 7,
        compress: false,
      },
      format: "json",
    },
  };

  beforeEach(async () => {
    await fs.mkdir(testLogDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testLogDir, { recursive: true, force: true });
  });

  it("should create logger with config", () => {
    const logger = new AppLogger(config);
    expect(logger).toBeDefined();
  });

  it("should log info message", async () => {
    const logger = new AppLogger(config);
    logger.info("test info message");

    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = await fs.readdir(testLogDir);
    expect(files.some(f => f.includes("info"))).toBe(true);
  });

  it("should log error message", async () => {
    const logger = new AppLogger(config);
    logger.error("test error message");

    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = await fs.readdir(testLogDir);
    expect(files.some(f => f.includes("error"))).toBe(true);
  });

  it("should log structured object", async () => {
    const logger = new AppLogger(config);
    logger.info({ userId: "123", action: "login" }, "user logged in");

    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = await fs.readdir(testLogDir);
    const infoFile = files.find(f => f.includes("info"));
    expect(infoFile).toBeDefined();
  });

  it("should create child logger with context", () => {
    const logger = new AppLogger(config);
    const child = logger.child({ requestId: "req-123", traceId: "trace-456" });

    expect(child).toBeDefined();
    expect(child).toBeInstanceOf(AppLogger);
  });

  it("should redact sensitive fields", async () => {
    const logger = new AppLogger(config);
    logger.info({ password: "secret123", token: "abc123" }, "sensitive data");

    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = await fs.readdir(testLogDir);
    const infoFile = files.find(f => f.includes("info"));

    if (infoFile) {
      const content = await fs.readFile(path.join(testLogDir, infoFile), "utf-8");
      expect(content).toContain("****");
      expect(content).not.toContain("secret123");
    }
  });

  it("should support all log levels", () => {
    const logger = new AppLogger(config);

    expect(() => logger.trace("trace")).not.toThrow();
    expect(() => logger.debug("debug")).not.toThrow();
    expect(() => logger.info("info")).not.toThrow();
    expect(() => logger.warn("warn")).not.toThrow();
    expect(() => logger.error("error")).not.toThrow();
    expect(() => logger.fatal("fatal")).not.toThrow();
  });

  it("should include module name in logs", async () => {
    const moduleConfig: LoggerConfig = { ...config, module: "test-module" };
    const logger = new AppLogger(moduleConfig);
    logger.info("module test");

    // 等待日志写入
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = await fs.readdir(testLogDir);
    const infoFile = files.find(f => f.includes("info"));

    if (infoFile) {
      const content = await fs.readFile(path.join(testLogDir, infoFile), "utf-8");
      expect(content).toContain("test-module");
    }
  });
});
```

- [ ] **步骤 2：创建核心日志器文件**

```typescript
// src/core/logger/logger.ts
/**
 * 核心日志器类
 *
 * 封装 Pino，提供结构化日志、脱敏、子日志器功能
 */

import pino from "pino";
import type { LogLevel, LoggerConfig, LogContext, ErrorLogPayload } from "./types.js";
import { createTransports } from "./transport.js";
import { redactObject } from "./redact.js";
import { LogRotationManager } from "./rotation.js";

/**
 * 应用日志器
 */
export class AppLogger {
  private readonly pino: pino.Logger;
  private readonly module: string;
  private rotationManager?: LogRotationManager;

  constructor(config: LoggerConfig) {
    this.module = config.module ?? "app";

    // 创建传输层
    const transport = createTransports(config);

    // 创建 Pino 实例
    if (transport) {
      this.pino = pino({
        level: config.level,
        base: { module: this.module },
        transport,
      });
    } else {
      // 无传输层时使用静默日志器
      this.pino = pino({
        level: "silent",
        base: { module: this.module },
      });
    }

    // 启动轮转管理（仅文件日志启用时）
    if (config.file.enabled) {
      this.rotationManager = new LogRotationManager(
        config.file.rotation,
        config.file.dir
      );
      this.rotationManager.start();
    }
  }

  /**
   * 从现有 Pino 实例创建（用于 child）
   */
  static fromPino(pinoLogger: pino.Logger, module: string): AppLogger {
    const logger = Object.create(AppLogger.prototype);
    logger.pino = pinoLogger;
    logger.module = module;
    return logger;
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, arg1: object | string, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino[level]({}, arg1);
    } else {
      const redacted = redactObject(arg1) as object;
      this.pino[level](redacted, arg2 ?? "");
    }
  }

  /**
   * Trace 级别日志
   */
  trace(arg1: object | string, arg2?: string): void {
    this.log("trace", arg1, arg2);
  }

  /**
   * Debug 级别日志
   */
  debug(arg1: object | string, arg2?: string): void {
    this.log("debug", arg1, arg2);
  }

  /**
   * Info 级别日志
   */
  info(arg1: object | string, arg2?: string): void {
    this.log("info", arg1, arg2);
  }

  /**
   * Warn 级别日志
   */
  warn(arg1: object | string, arg2?: string): void {
    this.log("warn", arg1, arg2);
  }

  /**
   * Error 级别日志
   */
  error(arg1: object | string, arg2?: string): void {
    this.log("error", arg1, arg2);
  }

  /**
   * Fatal 级别日志
   */
  fatal(arg1: object | string, arg2?: string): void {
    this.log("fatal", arg1, arg2);
  }

  /**
   * 创建子日志器（附加上下文）
   */
  child(context: LogContext): AppLogger {
    const redactedContext = redactObject(context) as Record<string, unknown>;
    const childPino = this.pino.child(redactedContext);
    return AppLogger.fromPino(childPino, context.module ?? this.module);
  }

  /**
   * 记录结构化错误日志
   */
  errorWithCode(payload: ErrorLogPayload, msg?: string): void {
    const errorPayload: Record<string, unknown> = {
      code: payload.code,
      message: payload.message,
    };

    if (payload.context) {
      errorPayload.context = payload.context;
    }

    if (payload.cause) {
      errorPayload.stack = payload.cause.stack;
      errorPayload.causeMessage = payload.cause.message;
    }

    this.error(errorPayload, msg ?? payload.message);
  }

  /**
   * 停止轮转管理
   */
  stopRotation(): void {
    if (this.rotationManager) {
      this.rotationManager.stop();
    }
  }
}
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/logger.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/logger.ts test/core/logger/logger.test.ts
git commit -m "feat(logger): add core AppLogger class"
```

---

## 任务 7：实现模块日志器工厂

**文件：**
- 创建：`src/core/logger/modules.ts`
- 创建：`test/core/logger/modules.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/modules.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { initLoggerSystem, getLogger, loggers, resetLoggerSystem } from "@/core/logger/modules.js";
import { AppLogger } from "@/core/logger/logger.js";

describe("Logger Modules", () => {
  beforeEach(() => {
    resetLoggerSystem();
  });

  it("should initialize logger system", () => {
    initLoggerSystem();
    // 不应抛错
    expect(true).toBe(true);
  });

  it("should get module logger", () => {
    initLoggerSystem();
    const logger = getLogger("test-module");

    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(AppLogger);
  });

  it("should cache module logger", () => {
    initLoggerSystem();
    const logger1 = getLogger("test-module");
    const logger2 = getLogger("test-module");

    expect(logger1).toBe(logger2);
  });

  it("should return different loggers for different modules", () => {
    initLoggerSystem();
    const logger1 = getLogger("module-1");
    const logger2 = getLogger("module-2");

    expect(logger1).not.toBe(logger2);
  });

  it("should auto initialize if not called", () => {
    // 不调用 initLoggerSystem
    const logger = getLogger("auto-init");

    expect(logger).toBeDefined();
  });

  it("should provide predefined loggers", () => {
    initLoggerSystem();

    expect(loggers.app()).toBeInstanceOf(AppLogger);
    expect(loggers.video()).toBeInstanceOf(AppLogger);
    expect(loggers.llm()).toBeInstanceOf(AppLogger);
    expect(loggers.provider()).toBeInstanceOf(AppLogger);
    expect(loggers.hotTrend()).toBeInstanceOf(AppLogger);
    expect(loggers.db()).toBeInstanceOf(AppLogger);
    expect(loggers.auth()).toBeInstanceOf(AppLogger);
  });

  it("should cache predefined loggers", () => {
    initLoggerSystem();

    const logger1 = loggers.app();
    const logger2 = loggers.app();

    expect(logger1).toBe(logger2);
  });

  it("should accept custom config", () => {
    initLoggerSystem({
      level: "trace",
      console: true,
    });

    const logger = getLogger("custom");
    expect(logger).toBeDefined();
  });
});
```

- [ ] **步骤 2：创建模块工厂文件**

```typescript
// src/core/logger/modules.ts
/**
 * 模块日志器工厂
 *
 * 提供模块日志器获取和预定义日志器
 */

import type { LoggerConfig } from "./types.js";
import { resolveLoggerConfig } from "./config.js";
import { AppLogger } from "./logger.js";

/** 模块日志器缓存 */
const moduleLoggers = new Map<string, AppLogger>();

/** 全局配置 */
let globalConfig: LoggerConfig | null = null;

/**
 * 初始化全局日志配置（应用启动时调用）
 */
export function initLoggerSystem(config?: Partial<LoggerConfig>): void {
  const defaultConfig = resolveLoggerConfig();
  globalConfig = {
    ...defaultConfig,
    ...config,
    file: {
      ...defaultConfig.file,
      ...config?.file,
      rotation: {
        ...defaultConfig.file.rotation,
        ...config?.file?.rotation,
      },
    },
  };
}

/**
 * 重置日志系统（仅用于测试）
 */
export function resetLoggerSystem(): void {
  globalConfig = null;
  moduleLoggers.clear();
}

/**
 * 获取模块日志器
 */
export function getLogger(module: string): AppLogger {
  // 延迟初始化
  if (!globalConfig) {
    initLoggerSystem();
  }

  // 缓存命中
  const cached = moduleLoggers.get(module);
  if (cached) {
    return cached;
  }

  // 创建新日志器
  const logger = new AppLogger({
    ...globalConfig!,
    module,
  });

  moduleLoggers.set(module, logger);
  return logger;
}

/**
 * 预定义模块日志器快捷访问
 */
export const loggers = {
  app: () => getLogger("app"),
  video: () => getLogger("video-generation"),
  llm: () => getLogger("llm-transport"),
  provider: () => getLogger("provider"),
  hotTrend: () => getLogger("hot-trend"),
  db: () => getLogger("database"),
  auth: () => getLogger("auth"),
};
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/modules.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/modules.ts test/core/logger/modules.test.ts
git commit -m "feat(logger): add module logger factory"
```

---

## 任务 8：实现 Fastify 集成

**文件：**
- 创建：`src/core/logger/setup-logger.ts`
- 创建：`test/core/logger/setup-logger.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/setup-logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupLoggerSystem, createTraceIdHook } from "@/core/logger/setup-logger.js";
import { resetLoggerSystem } from "@/core/logger/modules.js";
import type { FastifyRequest, FastifyReply } from "fastify";

describe("Setup Logger", () => {
  beforeEach(() => {
    resetLoggerSystem();
  });

  afterEach(() => {
    resetLoggerSystem();
  });

  it("should setup logger system", () => {
    const result = setupLoggerSystem();

    expect(result.fastifyLogger).toBeDefined();
    expect(result.appLogger).toBeDefined();
  });

  it("should accept custom config", () => {
    const result = setupLoggerSystem({
      level: "debug",
      console: true,
    });

    expect(result).toBeDefined();
  });

  describe("createTraceIdHook", () => {
    it("should create hook function", () => {
      const hook = createTraceIdHook();
      expect(typeof hook).toBe("function");
    });

    it("should generate traceId and requestId", async () => {
      const hook = createTraceIdHook();

      const request = {
        headers: {},
        log: {
          child: () => ({ info: () => {} }),
        },
      } as unknown as FastifyRequest;

      const reply = {
        header: () => {},
      } as unknown as FastifyReply;

      await hook(request, reply);

      expect((request as any).traceId).toBeDefined();
      expect((request as any).requestId).toBeDefined();
    });

    it("should use existing traceId from header", async () => {
      const hook = createTraceIdHook();

      const request = {
        headers: {
          "x-trace-id": "existing-trace-123",
        },
        log: {
          child: () => ({ info: () => {} }),
        },
      } as unknown as FastifyRequest;

      const reply = {
        header: () => {},
      } as unknown as FastifyReply;

      await hook(request, reply);

      expect((request as any).traceId).toBe("existing-trace-123");
    });
  });
});
```

- [ ] **步骤 2：创建 Fastify 集成文件**

```typescript
// src/core/logger/setup-logger.ts
/**
 * Fastify 日志集成
 *
 * 提供 Fastify 日志器创建和 TraceId 中间件
 */

import pino from "pino";
import crypto from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { LoggerConfig } from "./types.js";
import { resolveLoggerConfig } from "./config.js";
import { createTransports } from "./transport.js";
import { initLoggerSystem, getLogger } from "./modules.js";

/**
 * 创建 Fastify 专用 Pino 日志器
 */
export function createFastifyLogger(config: LoggerConfig): pino.Logger {
  const transport = createTransports(config);

  return pino({
    level: config.level,
    transport: transport ?? undefined,
    base: { module: "http" },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

/**
 * Fastify 启动时初始化日志系统
 */
export function setupLoggerSystem(config?: Partial<LoggerConfig>): {
  fastifyLogger: pino.Logger;
  appLogger: ReturnType<typeof getLogger>;
} {
  const resolvedConfig = resolveLoggerConfig();
  const finalConfig: LoggerConfig = {
    ...resolvedConfig,
    ...config,
    file: {
      ...resolvedConfig.file,
      ...config?.file,
      rotation: {
        ...resolvedConfig.file.rotation,
        ...config?.file?.rotation,
      },
    },
  };

  // 初始化全局日志系统
  initLoggerSystem(finalConfig);

  // 创建 Fastify 专用日志器
  const fastifyLogger = createFastifyLogger(finalConfig);

  // 创建应用日志器
  const appLogger = getLogger("app");

  return { fastifyLogger, appLogger };
}

/**
 * 创建 TraceId 中间件
 */
export function createTraceIdHook() {
  return async function traceIdHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // 从请求头获取或生成 traceId
    const traceId = (request.headers["x-trace-id"] as string) ?? crypto.randomUUID();
    const requestId = crypto.randomUUID();

    // 挂载到 request 对象
    (request as any).traceId = traceId;
    (request as any).requestId = requestId;

    // 注入到 Fastify logger
    if (request.log) {
      request.log = request.log.child({
        traceId,
        requestId,
      });
    }

    // 响应头返回
    reply.header("x-trace-id", traceId);
  };
}
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/setup-logger.test.ts
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/core/logger/setup-logger.ts test/core/logger/setup-logger.test.ts
git commit -m "feat(logger): add Fastify integration"
```

---

## 任务 9：创建统一导出和兼容层

**文件：**
- 创建：`src/core/logger/index.ts`
- 创建：`test/core/logger/index.test.ts`

- [ ] **步骤 1：创建测试文件**

```typescript
// test/core/logger/index.test.ts
import { describe, it, expect } from "vitest";
import {
  getLogger,
  loggers,
  initLoggerSystem,
  videoGenerationLogger,
  llmTransportLogger,
  providerLogger,
  videoJobLogger,
  hotTrendLogger,
  createConsoleCompatibleLogger,
} from "@/core/logger/index.js";
import { AppLogger } from "@/core/logger/logger.js";

describe("Logger Index", () => {
  it("should export getLogger", () => {
    expect(getLogger).toBeDefined();
    expect(typeof getLogger).toBe("function");
  });

  it("should export loggers", () => {
    expect(loggers).toBeDefined();
    expect(loggers.app).toBeDefined();
  });

  it("should export initLoggerSystem", () => {
    expect(initLoggerSystem).toBeDefined();
    expect(typeof initLoggerSystem).toBe("function");
  });

  it("should export compatible loggers", () => {
    initLoggerSystem({ console: false, file: { enabled: false, dir: "", prefix: "", rotation: { maxSizeBytes: 0, maxAgeDays: 0, compress: false }, format: "json" } });

    expect(videoGenerationLogger).toBeInstanceOf(AppLogger);
    expect(llmTransportLogger).toBeInstanceOf(AppLogger);
    expect(providerLogger).toBeInstanceOf(AppLogger);
    expect(videoJobLogger).toBeInstanceOf(AppLogger);
    expect(hotTrendLogger).toBeInstanceOf(AppLogger);
  });

  it("should export createConsoleCompatibleLogger", () => {
    expect(createConsoleCompatibleLogger).toBeDefined();
    expect(typeof createConsoleCompatibleLogger).toBe("function");
  });

  it("createConsoleCompatibleLogger should return console-like interface", () => {
    initLoggerSystem({ console: false, file: { enabled: false, dir: "", prefix: "", rotation: { maxSizeBytes: 0, maxAgeDays: 0, compress: false }, format: "json" } });

    const consoleLogger = createConsoleCompatibleLogger("test");

    expect(consoleLogger.log).toBeDefined();
    expect(consoleLogger.info).toBeDefined();
    expect(consoleLogger.warn).toBeDefined();
    expect(consoleLogger.error).toBeDefined();
    expect(consoleLogger.debug).toBeDefined();
  });

  it("createConsoleCompatibleLogger should not throw on log", () => {
    initLoggerSystem({ console: false, file: { enabled: false, dir: "", prefix: "", rotation: { maxSizeBytes: 0, maxAgeDays: 0, compress: false }, format: "json" } });

    const consoleLogger = createConsoleCompatibleLogger("test");

    expect(() => consoleLogger.log("test")).not.toThrow();
    expect(() => consoleLogger.info("test")).not.toThrow();
    expect(() => consoleLogger.warn("test")).not.toThrow();
    expect(() => consoleLogger.error("test")).not.toThrow();
    expect(() => consoleLogger.debug("test")).not.toThrow();
  });
});
```

- [ ] **步骤 2：创建统一导出文件**

```typescript
// src/core/logger/index.ts
/**
 * 日志系统统一导出
 *
 * 提供公共 API 和兼容层
 */

// 核心导出
export { getLogger, loggers, initLoggerSystem, resetLoggerSystem } from "./modules.js";
export { AppLogger } from "./logger.js";
export { setupLoggerSystem, createTraceIdHook } from "./setup-logger.js";

// 类型导出
export type {
  LogLevel,
  FileRotationConfig,
  FileTransportConfig,
  LoggerConfig,
  LogContext,
  ErrorLogPayload,
} from "./types.js";

export { ErrorCodes } from "./types.js";
export type { ErrorCode } from "./types.js";

// 兼容旧 API - 预定义模块日志器
import { getLogger } from "./modules.js";

export const videoGenerationLogger = getLogger("video-generation");
export const llmTransportLogger = getLogger("llm-transport");
export const providerLogger = getLogger("provider");
export const videoJobLogger = getLogger("video-job");
export const hotTrendLogger = getLogger("hot-trend");

// 兼容旧 API - console 接口适配器
import type { AppLogger } from "./logger.js";

/**
 * 创建兼容 console 的日志接口
 */
export function createConsoleCompatibleLogger(module: string): {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
} {
  const logger = getLogger(module);

  const formatArgs = (args: unknown[]): { obj: object; msg: string } => {
    if (args.length === 0) {
      return { obj: {}, msg: "" };
    }
    if (args.length === 1) {
      if (typeof args[0] === "string") {
        return { obj: {}, msg: args[0] };
      }
      return { obj: args[0] as object, msg: "" };
    }
    const obj = args.find((a) => a && typeof a === "object") ?? {};
    const msg = args.find((a) => typeof a === "string") ?? "";
    return { obj: obj as object, msg: String(msg) };
  };

  return {
    log: (...args) => {
      const { obj, msg } = formatArgs(args);
      logger.info(obj, msg);
    },
    info: (...args) => {
      const { obj, msg } = formatArgs(args);
      logger.info(obj, msg);
    },
    warn: (...args) => {
      const { obj, msg } = formatArgs(args);
      logger.warn(obj, msg);
    },
    error: (...args) => {
      const { obj, msg } = formatArgs(args);
      logger.error(obj, msg);
    },
    debug: (...args) => {
      const { obj, msg } = formatArgs(args);
      logger.debug(obj, msg);
    },
  };
}
```

- [ ] **步骤 3：运行测试验证通过**

```bash
npm test -- test/core/logger/index.test.ts
```

预期：PASS

- [ ] **步骤 4：运行所有日志测试**

```bash
npm test -- test/core/logger/
```

预期：全部 PASS

- [ ] **步骤 5：Commit**

```bash
git add src/core/logger/index.ts test/core/logger/index.test.ts
git commit -m "feat(logger): add unified exports and compatibility layer"
```

---

## 任务 10：更新 setup-core.ts 集成新日志系统

**文件：**
- 修改：`src/app-setup/setup-core.ts`
- 备份并删除：`src/core/logger.ts`（旧文件）

- [ ] **步骤 1：读取现有 setup-core.ts**

```bash
head -100 src/app-setup/setup-core.ts
```

- [ ] **步骤 2：更新 setup-core.ts 导入和初始化**

在 `src/app-setup/setup-core.ts` 中修改：

```typescript
// 添加导入
import { setupLoggerSystem, createTraceIdHook } from "../core/logger/setup-logger.js";

// 在 Fastify 创建之前，初始化日志系统
export async function setupCore(): Promise<CoreSetupResult> {
  const runtimeConfig = resolveRuntimeConfig(process.env);

  // 初始化日志系统（新增）
  const { fastifyLogger, appLogger } = setupLoggerSystem({
    level: runtimeConfig.server.nodeEnv === "development" ? "debug" : "info",
    console: runtimeConfig.server.nodeEnv !== "production",
    file: {
      enabled: runtimeConfig.server.nodeEnv === "production",
      dir: "logs/",
      prefix: "app",
      rotation: {
        maxSizeBytes: 20 * 1024 * 1024,
        maxAgeDays: 7,
        compress: true,
      },
      format: runtimeConfig.server.nodeEnv === "production" ? "json" : "pretty",
    },
  });

  // 创建 Fastify 实例（修改：使用新的日志器）
  const app = Fastify({
    bodyLimit: runtimeConfig.server.apiBodyLimitBytes,
    logger: fastifyLogger,  // 使用新日志器
    pluginTimeout: 120_000,
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // 注册 TraceId 中间件（新增）
  app.addHook("onRequest", createTraceIdHook());

  // ... 其余代码保持不变
}
```

- [ ] **步骤 3：备份并删除旧的 logger.ts**

```bash
# 备份
cp src/core/logger.ts src/core/logger.ts.bak

# 删除
rm src/core/logger.ts
```

- [ ] **步骤 4：运行编译验证**

```bash
npm run build
```

预期：无编译错误

- [ ] **步骤 5：运行测试验证**

```bash
npm test
```

预期：全部 PASS

- [ ] **步骤 6：Commit**

```bash
git add src/app-setup/setup-core.ts
git rm src/core/logger.ts
git commit -m "refactor: integrate new logger system into setup-core"
```

---

## 任务 11：更新部署脚本移除 PM2 日志轮转

**文件：**
- 修改：`.deploy/restart.sh`

- [ ] **步骤 1：读取现有 restart.sh**

```bash
cat .deploy/restart.sh
```

- [ ] **步骤 2：移除 pm2-logrotate 相关代码**

修改 `.deploy/restart.sh`，删除以下部分：

```bash
# 删除这些行
if ! pm2 list | grep -q "pm2-logrotate"; then
    echo "Installing pm2-logrotate for log rotation..."
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 14
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:dateFormat YYYY-MM-DD-HH-mm-ss
    pm2 set pm2-logrotate:rotateServerLogs true
fi
```

修改后的 `restart.sh` 核心部分：

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# PM2 生产环境重启脚本（零停机 reload）
# 日志轮转已由应用内新日志系统处理
# ============================================================

PATH=/home/appuser/local/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

cd "${DEPLOY_DIR:-.}" || exit 1

if [ -f .env.server ]; then
  set -a
  source ./.env.server
  set +a
fi

mkdir -p .run logs

if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Please install PM2 globally: npm install -g pm2"
    exit 1
fi

if [ ! -d "dist" ]; then
    echo "Error: dist/ directory not found. Please run 'npm run build' first."
    exit 1
fi

APP_NAME="neirongmiao"

# ============================================================
# 智能重启策略
# ============================================================
if pm2 list | grep -q "$APP_NAME"; then
    echo "Performing zero-downtime reload for: $APP_NAME"
    pm2 reload "$APP_NAME" --update-env
else
    echo "Starting new server with PM2..."
    pm2 start ecosystem.config.cjs --env production
fi

sleep 3

if pm2 show "$APP_NAME" | grep -q "online"; then
    echo "=========================================="
    echo "Server started successfully!"
    echo "=========================================="
    pm2 show "$APP_NAME" | grep -E "^(status|uptime|restarts|memory|cpu)" || true
else
    echo "=========================================="
    echo "Failed to start server!"
    echo "=========================================="
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
fi

pm2 save
echo ""
echo "PM2 process list saved."
```

- [ ] **步骤 3：Commit**

```bash
git add .deploy/restart.sh
git commit -m "chore: remove pm2-logrotate, use new logger system"
```

---

## 任务 12：验证和文档更新

**文件：**
- 更新：`CLAUDE.md`（可选，记录新日志系统使用方式）

- [ ] **步骤 1：本地启动验证**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

预期：
- 控制台输出 pretty 格式日志
- `logs/` 目录下创建 `app-info-*.log` 和 `app-error-*.log` 文件

- [ ] **步骤 2：验证日志文件**

```bash
# 查看日志文件
ls -la logs/

# 查看日志内容
cat logs/app-info-*.log | head -5
cat logs/app-error-*.log | head -5
```

预期：
- info 文件包含所有级别日志
- error 文件仅包含 warn 及以上级别

- [ ] **步骤 3：验证 TraceId**

发送 HTTP 请求，检查响应头：

```bash
curl -I http://localhost:3020/neirongmiao/api/health
```

预期：响应头包含 `x-trace-id`

- [ ] **步骤 4：运行完整测试**

```bash
npm run build:all
npm test
```

预期：全部 PASS

- [ ] **步骤 5：最终 Commit**

```bash
git add .
git commit -m "feat: complete logger system refactor

- Add file persistence with info/error separation
- Add log rotation (20MB size, 7 days retention)
- Add traceId/requestId support for request tracing
- Add sensitive data redaction
- Add compatibility layer for existing code
- Remove pm2-logrotate dependency"
```

---

## 验收清单

- [ ] 日志文件按预期创建（info/error 分离）
- [ ] 文件轮转正常（超过 20MB 或 7 天自动清理）
- [ ] traceId/requestId 正确传递
- [ ] 敏感信息自动脱敏
- [ ] 现有代码无需修改即可运行
- [ ] PM2 日志轮转已移除
- [ ] 所有测试通过
- [ ] 编译无错误
