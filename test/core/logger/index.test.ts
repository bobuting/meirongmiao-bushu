/**
 * 统一导出和兼容层测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLogger,
  loggers,
  initLoggerSystem,
  AppLogger,
  setupLoggerSystem,
  createTraceIdHook,
  ErrorCodes,
} from "../../../src/core/logger/index.js";
import type {
  LogLevel,
  FileRotationConfig,
  FileTransportConfig,
  LoggerConfig,
  LogContext,
  ErrorLogPayload,
  ErrorCode,
} from "../../../src/core/logger/index.js";

describe("index", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("导出函数存在", () => {
    it("getLogger 函数存在", () => {
      expect(typeof getLogger).toBe("function");
    });

    it("initLoggerSystem 函数存在", () => {
      expect(typeof initLoggerSystem).toBe("function");
    });

    it("setupLoggerSystem 函数存在", () => {
      expect(typeof setupLoggerSystem).toBe("function");
    });

    it("createTraceIdHook 函数存在", () => {
      expect(typeof createTraceIdHook).toBe("function");
    });

    it("AppLogger 类存在", () => {
      expect(AppLogger).toBeDefined();
    });
  });

  describe("预定义日志器", () => {
    it("loggers 对象存在", () => {
      expect(loggers).toBeDefined();
    });

    it("loggers.app 是 AppLogger 实例", () => {
      initLoggerSystem();
      expect(typeof loggers.app.info).toBe("function");
      expect(typeof loggers.app.error).toBe("function");
    });

    it("loggers.video 是 AppLogger 实例", () => {
      initLoggerSystem();
      expect(typeof loggers.video.info).toBe("function");
    });
  });

  describe("类型导出", () => {
    it("LogLevel 类型可用", () => {
      const level: LogLevel = "info";
      expect(level).toBe("info");
    });

    it("LoggerConfig 类型可用", () => {
      const config: LoggerConfig = {
        level: "info",
        console: true,
        file: {
          enabled: false,
          dir: "logs/",
          prefix: "app",
          rotation: {
            maxSizeBytes: 1024,
            maxAgeDays: 7,
            compress: true,
          },
          format: "json",
        },
      };
      expect(config).toBeDefined();
    });

    it("ErrorCodes 常量存在", () => {
      expect(ErrorCodes.VIDEO_ENCODE_FAILED).toBe("VIDEO_ENCODE_FAILED");
      expect(ErrorCodes.LLM_REQUEST_FAILED).toBe("LLM_REQUEST_FAILED");
      expect(ErrorCodes.DB_CONNECTION_FAILED).toBe("DB_CONNECTION_FAILED");
    });
  });

  describe("createConsoleCompatibleLogger", () => {
    it("返回正确接口", async () => {
      const { createConsoleCompatibleLogger } = await import("../../../src/core/logger/index.js");
      const logger = createConsoleCompatibleLogger("test-module");

      expect(logger).toBeDefined();
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });

    it("console 接口方法不抛错", async () => {
      const { createConsoleCompatibleLogger } = await import("../../../src/core/logger/index.js");
      const logger = createConsoleCompatibleLogger("test-module");

      // 这些方法不应该抛错
      expect(() => logger.log("test")).not.toThrow();
      expect(() => logger.info("test")).not.toThrow();
      expect(() => logger.warn("test")).not.toThrow();
      expect(() => logger.error("test")).not.toThrow();
    });
  });

  describe("兼容旧 API", () => {
    it("videoGenerationLogger 存在", async () => {
      const { videoGenerationLogger } = await import("../../../src/core/logger/index.js");
      expect(videoGenerationLogger).toBeDefined();
      expect(typeof videoGenerationLogger.info).toBe("function");
    });

    it("llmTransportLogger 存在", async () => {
      const { llmTransportLogger } = await import("../../../src/core/logger/index.js");
      expect(llmTransportLogger).toBeDefined();
      expect(typeof llmTransportLogger.info).toBe("function");
    });

    it("providerLogger 存在", async () => {
      const { providerLogger } = await import("../../../src/core/logger/index.js");
      expect(providerLogger).toBeDefined();
      expect(typeof providerLogger.info).toBe("function");
    });
  });
});
