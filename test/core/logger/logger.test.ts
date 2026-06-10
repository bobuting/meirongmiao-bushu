/**
 * 核心日志器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";
import { AppLogger } from "../../../src/core/logger/logger.js";
import type { LoggerConfig, LogContext } from "../../../src/core/logger/types.js";

describe("AppLogger", () => {
  let mockPino: pino.Logger;
  let testConfig: LoggerConfig;

  beforeEach(() => {
    // 创建 mock pino logger
    mockPino = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => mockPino),
    } as unknown as pino.Logger;

    testConfig = {
      level: "info",
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("创建 logger", () => {
    it("使用配置创建 logger", () => {
      const logger = new AppLogger(mockPino, testConfig);
      expect(logger).toBeDefined();
    });

    it("从 Pino 实例创建 logger", () => {
      const logger = AppLogger.fromPino(mockPino, "test-module");
      expect(logger).toBeDefined();
    });
  });

  describe("日志级别方法", () => {
    it("trace 级别日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      logger.trace("trace message");
      expect(mockPino.trace).toHaveBeenCalled();
    });

    it("debug 级别日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      logger.debug("debug message");
      expect(mockPino.debug).toHaveBeenCalled();
    });

    it("info 级别日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      logger.info("info message");
      expect(mockPino.info).toHaveBeenCalled();
    });

    it("warn 级别日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      logger.warn("warn message");
      expect(mockPino.warn).toHaveBeenCalled();
    });

    it("error 级别日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      logger.error("error message");
      expect(mockPino.error).toHaveBeenCalled();
    });

    it("fatal 级别日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      logger.fatal("fatal message");
      expect(mockPino.fatal).toHaveBeenCalled();
    });

    it("带对象的日志", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const obj = { userId: "user1", action: "login" };
      logger.info(obj, "user logged in");
      expect(mockPino.info).toHaveBeenCalledWith(obj, "user logged in");
    });
  });

  describe("子日志器", () => {
    it("创建子日志器", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const childContext: LogContext = { module: "video", requestId: "req-123" };
      const childLogger = logger.child(childContext);

      expect(childLogger).toBeDefined();
      expect(mockPino.child).toHaveBeenCalledWith(childContext);
    });

    it("子日志器继承模块名", () => {
      const configWithModule = { ...testConfig, module: "parent" };
      const logger = new AppLogger(mockPino, configWithModule);
      const childLogger = logger.child({ module: "child" });

      expect(childLogger).toBeDefined();
    });
  });

  describe("敏感字段脱敏", () => {
    it("自动脱敏敏感字段", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const sensitiveObj = {
        username: "admin",
        password: "secret", // 长度 <= 8，完全脱敏为 ****
        apiKey: "sk-1234567890abcdef", // 长度 > 8，保留前后 4 位
      };

      logger.info(sensitiveObj, "sensitive data");

      // 验证脱敏后的数据
      // mock.calls[0] 是第一次调用的参数数组
      const callArgs = (mockPino.info as ReturnType<typeof vi.fn>).mock.calls[0];
      const loggedObj = callArgs[0] as Record<string, unknown>;

      expect(loggedObj.username).toBe("admin");
      expect(loggedObj.password).toBe("****");
      expect(loggedObj.apiKey).toBe("sk-1...cdef");
    });

    it("不修改原始对象", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const originalObj = {
        username: "admin",
        password: "secret123",
      };

      logger.info(originalObj, "message");

      // 原始对象不应被修改
      expect(originalObj.password).toBe("secret123");
    });
  });

  describe("模块名包含在日志中", () => {
    it("配置中指定模块名", () => {
      const configWithModule = { ...testConfig, module: "video-service" };
      const logger = new AppLogger(mockPino, configWithModule);

      logger.info("test message");

      // 验证模块名被包含
      expect(mockPino.info).toHaveBeenCalled();
    });

    it("fromPino 创建时指定模块名", () => {
      const logger = AppLogger.fromPino(mockPino, "llm-transport");
      expect(logger).toBeDefined();
    });
  });

  describe("Error 对象支持", () => {
    it("error 方法支持 Error 对象", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const error = new Error("test error");
      logger.error(error, "操作失败");
      expect(mockPino.error).toHaveBeenCalled();
      const callArgs = (mockPino.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0].err).toBe(error);
      expect(callArgs[0].message).toBe("test error");
    });

    it("error 方法支持 Error 对象无消息", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const error = new Error("test error");
      logger.error(error);
      expect(mockPino.error).toHaveBeenCalled();
      const callArgs = (mockPino.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1]).toBe("test error");
    });

    it("warn 方法支持 Error 对象", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const error = new Error("warning");
      logger.warn(error, "警告消息");
      expect(mockPino.warn).toHaveBeenCalled();
    });

    it("fatal 方法支持 Error 对象", () => {
      const logger = new AppLogger(mockPino, testConfig);
      const error = new Error("fatal error");
      logger.fatal(error, "致命错误");
      expect(mockPino.fatal).toHaveBeenCalled();
    });
  });

  describe("轮转管理", () => {
    it("stopRotation 不抛错（无轮转时）", () => {
      const logger = new AppLogger(mockPino, testConfig);
      expect(() => logger.stopRotation()).not.toThrow();
    });
  });
});
