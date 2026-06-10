/**
 * 传输层配置测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLogFilePath, createTransports } from "../../../src/core/logger/transport.js";
import type { LoggerConfig } from "../../../src/core/logger/types.js";

describe("getLogFilePath", () => {
  it("生成正确的日志文件路径", () => {
    const path = getLogFilePath("logs/", "app", "info");
    expect(path).toMatch(/^logs\/app-info-\d{4}-\d{2}-\d{2}\.log$/);
  });

  it("error 类型文件路径", () => {
    const path = getLogFilePath("logs/", "app", "error");
    expect(path).toMatch(/^logs\/app-error-\d{4}-\d{2}-\d{2}\.log$/);
  });

  it("自定义前缀", () => {
    const path = getLogFilePath("logs/", "myapp", "info");
    expect(path).toMatch(/^logs\/myapp-info-\d{4}-\d{2}-\d{2}\.log$/);
  });

  it("自定义目录", () => {
    const path = getLogFilePath("/var/log/app/", "app", "info");
    expect(path).toMatch(/^\/var\/log\/app\/app-info-\d{4}-\d{2}-\d{2}\.log$/);
  });
});

describe("createTransports", () => {
  const mockDate = new Date("2024-01-15T10:30:00.000Z");
  const originalDate = global.Date;

  beforeEach(() => {
    // Mock Date
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.Date = originalDate;
  });

  it("无传输配置时返回 undefined", () => {
    const config: LoggerConfig = {
      level: "info",
      console: false,
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

    const transports = createTransports(config);
    expect(transports).toBeUndefined();
  });

  it("只有控制台传输", () => {
    const config: LoggerConfig = {
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

    const transports = createTransports(config);
    expect(transports).toBeDefined();
    expect(transports!.length).toBe(1);
    // pino-pretty 传输
    expect(transports![0]).toHaveProperty("target");
    expect(transports![0].target).toContain("pino-pretty");
  });

  it("只有文件传输", () => {
    const config: LoggerConfig = {
      level: "info",
      console: false,
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

    const transports = createTransports(config);
    expect(transports).toBeDefined();
    expect(transports!.length).toBe(2); // info 和 error 两个文件
  });

  it("控制台+文件传输", () => {
    const config: LoggerConfig = {
      level: "info",
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

    const transports = createTransports(config);
    expect(transports).toBeDefined();
    expect(transports!.length).toBe(3); // console + info + error
  });

  it("文件传输配置正确", () => {
    const config: LoggerConfig = {
      level: "debug",
      console: false,
      file: {
        enabled: true,
        dir: "logs/",
        prefix: "myapp",
        rotation: {
          maxSizeBytes: 20 * 1024 * 1024,
          maxAgeDays: 7,
          compress: true,
        },
        format: "json",
      },
    };

    const transports = createTransports(config);
    expect(transports).toBeDefined();

    // info 文件
    const infoTransport = transports!.find(
      (t) => typeof t.options?.destination === "string" && t.options.destination.includes("info")
    );
    expect(infoTransport).toBeDefined();
    expect(infoTransport!.level).toBe("trace"); // info 文件记录所有级别
    expect(infoTransport!.options!.destination).toMatch(/logs\/myapp-info-2024-01-15\.log/);

    // error 文件
    const errorTransport = transports!.find(
      (t) => typeof t.options?.destination === "string" && t.options.destination.includes("error")
    );
    expect(errorTransport).toBeDefined();
    expect(errorTransport!.level).toBe("warn"); // error 文件只记录 warn 及以上
    expect(errorTransport!.options!.destination).toMatch(/logs\/myapp-error-2024-01-15\.log/);
  });
});
