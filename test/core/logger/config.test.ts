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
      delete process.env.LOG_LEVEL;
      expect(resolveLogLevel()).toBe("debug");
    });

    it("should return warn for test", () => {
      process.env.NODE_ENV = "test";
      delete process.env.LOG_LEVEL;
      expect(resolveLogLevel()).toBe("warn");
    });

    it("should return info for production", () => {
      process.env.NODE_ENV = "production";
      delete process.env.LOG_LEVEL;
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
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_FILE_ENABLED;
      delete process.env.LOG_FILE_DIR;
      delete process.env.LOG_FILE_PREFIX;
      delete process.env.LOG_FILE_MAX_SIZE_MB;
      delete process.env.LOG_FILE_MAX_AGE_DAYS;
      delete process.env.LOG_FILE_COMPRESS;
      const config = resolveLoggerConfig();

      expect(config.level).toBe("debug");
      expect(config.console).toBe(true);
      expect(config.file.enabled).toBe(false); // 开发环境默认关闭
      expect(config.file.format).toBe("pretty");
    });

    it("should return production config", () => {
      process.env.NODE_ENV = "production";
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_FILE_ENABLED;
      delete process.env.LOG_FILE_DIR;
      delete process.env.LOG_FILE_PREFIX;
      delete process.env.LOG_FILE_MAX_SIZE_MB;
      delete process.env.LOG_FILE_MAX_AGE_DAYS;
      delete process.env.LOG_FILE_COMPRESS;
      const config = resolveLoggerConfig();

      expect(config.level).toBe("info");
      expect(config.console).toBe(false); // 生产环境关闭控制台
      expect(config.file.enabled).toBe(true);
      expect(config.file.format).toBe("json");
    });

    it("should respect LOG_FILE_DIR", () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_FILE_DIR = "/var/log/app";
      delete process.env.LOG_FILE_ENABLED;
      delete process.env.LOG_FILE_PREFIX;
      delete process.env.LOG_FILE_MAX_SIZE_MB;
      delete process.env.LOG_FILE_MAX_AGE_DAYS;
      delete process.env.LOG_FILE_COMPRESS;
      const config = resolveLoggerConfig();

      expect(config.file.dir).toBe("/var/log/app");
    });

    it("should respect LOG_FILE_MAX_SIZE_MB", () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_FILE_MAX_SIZE_MB = "50";
      delete process.env.LOG_FILE_ENABLED;
      delete process.env.LOG_FILE_DIR;
      delete process.env.LOG_FILE_PREFIX;
      delete process.env.LOG_FILE_MAX_AGE_DAYS;
      delete process.env.LOG_FILE_COMPRESS;
      const config = resolveLoggerConfig();

      expect(config.file.rotation.maxSizeBytes).toBe(50 * 1024 * 1024);
    });
  });
});
