/**
 * 文件轮转管理测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, statSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { LogRotationManager } from "../../../src/core/logger/rotation.js";
import type { FileRotationConfig } from "../../../src/core/logger/types.js";

describe("LogRotationManager", () => {
  const testDir = join(process.cwd(), "test-logs-rotation");
  const defaultConfig: FileRotationConfig = {
    maxSizeBytes: 1000, // 1KB for testing
    maxAgeDays: 7,
    compress: true,
  };

  beforeEach(() => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("创建 manager", () => {
    const manager = new LogRotationManager(testDir, defaultConfig);
    expect(manager).toBeDefined();
    expect(manager.isRunning()).toBe(false);
  });

  it("启动定时清理", () => {
    const manager = new LogRotationManager(testDir, defaultConfig);
    manager.start();
    expect(manager.isRunning()).toBe(true);
    manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it("清理过期文件", async () => {
    // 创建一个过期文件（修改时间为 10 天前）
    const oldFile = join(testDir, "old.log");
    writeFileSync(oldFile, "old content");

    // 设置文件修改时间为 10 天前
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const fs = await import("fs/promises");
    await fs.utimes(oldFile, new Date(oldTime), new Date(oldTime));

    // 创建一个新文件
    const newFile = join(testDir, "new.log");
    writeFileSync(newFile, "new content");

    // 使用真实时间
    vi.useRealTimers();

    const manager = new LogRotationManager(testDir, defaultConfig);
    await manager.cleanupOldFiles();

    // 过期文件应该被删除
    expect(existsSync(oldFile)).toBe(false);
    // 新文件应该保留
    expect(existsSync(newFile)).toBe(true);
  });

  it("保留新文件", async () => {
    // 创建一个新文件
    const newFile = join(testDir, "new.log");
    writeFileSync(newFile, "new content");

    const manager = new LogRotationManager(testDir, defaultConfig);
    await manager.cleanupOldFiles();

    // 新文件应该保留
    expect(existsSync(newFile)).toBe(true);
  });

  it("超过大小限制时轮转", async () => {
    // 使用真实时间（因为 rotateIfNeeded 使用 new Date()）
    vi.useRealTimers();

    // 创建一个大文件
    const currentFile = join(testDir, "app-info.log");
    const largeContent = "x".repeat(1500); // 1.5KB > 1KB
    writeFileSync(currentFile, largeContent);

    // 使用压缩配置
    const configWithCompress = { ...defaultConfig, compress: true };
    const manager = new LogRotationManager(testDir, configWithCompress);
    await manager.rotateIfNeeded(currentFile);

    // 原文件应该被重命名并压缩（带时间戳）
    const files = readdirSync(testDir);
    const rotatedFiles = files.filter((f) => f.startsWith("app-info-") && (f.endsWith(".log") || f.endsWith(".log.gz")));
    expect(rotatedFiles.length).toBeGreaterThan(0);
  });

  it("小文件不轮转", async () => {
    // 创建一个小文件
    const currentFile = join(testDir, "app-info.log");
    const smallContent = "x".repeat(100); // 100B < 1KB
    writeFileSync(currentFile, smallContent);

    const manager = new LogRotationManager(testDir, defaultConfig);
    await manager.rotateIfNeeded(currentFile);

    // 原文件应该保留
    expect(existsSync(currentFile)).toBe(true);
    // 不应该有轮转文件
    const files = readdirSync(testDir);
    const rotatedFiles = files.filter((f) => f !== "app-info.log");
    expect(rotatedFiles.length).toBe(0);
  });

  it("启动/停止定时器", () => {
    const manager = new LogRotationManager(testDir, defaultConfig);

    expect(manager.isRunning()).toBe(false);

    manager.start();
    expect(manager.isRunning()).toBe(true);

    manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it("重复启动/停止不会出错", () => {
    const manager = new LogRotationManager(testDir, defaultConfig);

    manager.start();
    manager.start(); // 重复启动
    expect(manager.isRunning()).toBe(true);

    manager.stop();
    manager.stop(); // 重复停止
    expect(manager.isRunning()).toBe(false);
  });
});
