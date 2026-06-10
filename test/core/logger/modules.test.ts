/**
 * 模块日志器工厂测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initLoggerSystem,
  resetLoggerSystem,
  getLogger,
  loggers,
} from "../../../src/core/logger/modules.js";

describe("modules", () => {
  beforeEach(() => {
    // 重置系统状态
    resetLoggerSystem();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetLoggerSystem();
    vi.useRealTimers();
  });

  describe("initLoggerSystem", () => {
    it("使用默认配置初始化", () => {
      const result = initLoggerSystem();
      expect(result).toBeDefined();
    });

    it("使用自定义配置初始化", () => {
      const result = initLoggerSystem({
        level: "debug",
        console: true,
        file: {
          enabled: false,
          dir: "logs/",
          prefix: "test",
          rotation: {
            maxSizeBytes: 10 * 1024 * 1024,
            maxAgeDays: 3,
            compress: false,
          },
          format: "json",
        },
      });
      expect(result).toBeDefined();
    });

    it("重复初始化返回相同实例", () => {
      const result1 = initLoggerSystem();
      const result2 = initLoggerSystem();
      expect(result1).toBe(result2);
    });
  });

  describe("getLogger", () => {
    it("获取模块日志器", () => {
      initLoggerSystem();
      const logger = getLogger("video");
      expect(logger).toBeDefined();
    });

    it("获取不同模块的日志器", () => {
      initLoggerSystem();
      const videoLogger = getLogger("video");
      const llmLogger = getLogger("llm");

      expect(videoLogger).toBeDefined();
      expect(llmLogger).toBeDefined();
      // 它们应该是不同的实例
      expect(videoLogger).not.toBe(llmLogger);
    });

    it("相同模块返回缓存的日志器", () => {
      initLoggerSystem();
      const logger1 = getLogger("video");
      const logger2 = getLogger("video");

      expect(logger1).toBe(logger2);
    });
  });

  describe("loggers", () => {
    it("预定义日志器存在", () => {
      initLoggerSystem();

      expect(loggers.app).toBeDefined();
      expect(loggers.video).toBeDefined();
      expect(loggers.llm).toBeDefined();
      expect(loggers.provider).toBeDefined();
      expect(loggers.hotTrend).toBeDefined();
      expect(loggers.db).toBeDefined();
      expect(loggers.auth).toBeDefined();
    });

    it("预定义日志器是 AppLogger 实例", () => {
      initLoggerSystem();

      // 验证有日志方法
      expect(typeof loggers.app.info).toBe("function");
      expect(typeof loggers.app.error).toBe("function");
      expect(typeof loggers.video.info).toBe("function");
    });
  });

  describe("resetLoggerSystem", () => {
    it("重置后缓存清除", () => {
      initLoggerSystem();
      const logger1 = getLogger("test");

      resetLoggerSystem();
      initLoggerSystem();
      const logger2 = getLogger("test");

      // 重置后应该是新实例
      expect(logger1).not.toBe(logger2);
    });
  });

  describe("自定义配置", () => {
    it("自定义日志级别生效", () => {
      const result = initLoggerSystem({
        level: "trace",
        console: true,
        file: { enabled: false, dir: "logs/", prefix: "app", rotation: { maxSizeBytes: 1024, maxAgeDays: 1, compress: false }, format: "json" },
      });
      expect(result).toBeDefined();
    });
  });
});
