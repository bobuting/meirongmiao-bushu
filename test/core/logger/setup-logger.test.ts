/**
 * Fastify 日志集成测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setupLoggerSystem,
  createTraceIdHook,
} from "../../../src/core/logger/setup-logger.js";

describe("setup-logger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("setupLoggerSystem", () => {
    it("返回正确对象", () => {
      const result = setupLoggerSystem();

      expect(result).toBeDefined();
      expect(result.fastifyLogger).toBeDefined();
      expect(result.appLogger).toBeDefined();
    });

    it("fastifyLogger 有正确的日志级别", () => {
      const { fastifyLogger } = setupLoggerSystem();

      expect(typeof fastifyLogger.info).toBe("function");
      expect(typeof fastifyLogger.error).toBe("function");
      expect(typeof fastifyLogger.warn).toBe("function");
      expect(typeof fastifyLogger.debug).toBe("function");
      expect(typeof fastifyLogger.trace).toBe("function");
      expect(typeof fastifyLogger.fatal).toBe("function");
    });

    it("appLogger 是 AppLogger 实例", () => {
      const { appLogger } = setupLoggerSystem();

      expect(typeof appLogger.info).toBe("function");
      expect(typeof appLogger.error).toBe("function");
      expect(typeof appLogger.child).toBe("function");
    });

    it("接受自定义配置", () => {
      const result = setupLoggerSystem({
        level: "debug",
        console: true,
        file: { enabled: false, dir: "logs/", prefix: "test", rotation: { maxSizeBytes: 1024, maxAgeDays: 1, compress: false }, format: "json" },
      });

      expect(result).toBeDefined();
    });
  });

  describe("createTraceIdHook", () => {
    it("返回中间件函数", () => {
      const hook = createTraceIdHook();
      expect(typeof hook).toBe("function");
    });

    it("生成 traceId 和 requestId", () => {
      const hook = createTraceIdHook();

      // 模拟 Fastify 请求对象
      const mockRequest = {
        id: "req-123",
        headers: {},
        log: {
          info: vi.fn(),
          child: vi.fn(() => ({ info: vi.fn() })),
        },
      };

      const mockReply = {
        header: vi.fn(),
      };

      const mockDone = vi.fn();

      // 调用 hook
      hook(mockRequest as unknown as any, mockReply as unknown as any, mockDone);

      // 验证 header 被设置
      expect(mockReply.header).toHaveBeenCalledWith("x-trace-id", expect.any(String));
      expect(mockDone).toHaveBeenCalled();
    });

    it("从请求头获取已存在的 traceId", () => {
      const hook = createTraceIdHook();

      // 模拟已有 traceId 的请求
      const mockRequest = {
        id: "req-456",
        headers: {
          "x-trace-id": "existing-trace-id",
        },
        log: {
          info: vi.fn(),
          child: vi.fn(() => ({ info: vi.fn() })),
        },
      };

      const mockReply = {
        header: vi.fn(),
      };

      const mockDone = vi.fn();

      hook(mockRequest as unknown as any, mockReply as unknown as any, mockDone);

      // 验证使用已有的 traceId
      expect(mockReply.header).toHaveBeenCalledWith("x-trace-id", "existing-trace-id");
      expect(mockDone).toHaveBeenCalled();
    });

    it("注入 traceId 到 request.log", () => {
      const hook = createTraceIdHook();

      const childFn = vi.fn(() => ({ info: vi.fn() }));
      const mockRequest = {
        id: "req-789",
        headers: {},
        log: {
          info: vi.fn(),
          child: childFn,
        },
      };

      const mockReply = {
        header: vi.fn(),
      };

      const mockDone = vi.fn();

      hook(mockRequest as unknown as any, mockReply as unknown as any, mockDone);

      // 验证 child log 被创建（带有 traceId 和 requestId）
      expect(childFn).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: expect.any(String),
          requestId: "req-789",
        })
      );
      expect(mockDone).toHaveBeenCalled();
    });
  });
});
