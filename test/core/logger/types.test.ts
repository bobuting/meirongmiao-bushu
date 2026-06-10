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
