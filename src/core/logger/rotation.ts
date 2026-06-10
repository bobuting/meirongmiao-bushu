/**
 * 文件轮转管理
 *
 * 管理日志文件的轮转、压缩和清理
 */

import { existsSync, statSync, renameSync, readdirSync, unlinkSync } from "fs";
import { join, basename, dirname } from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
import type { FileRotationConfig } from "./types.js";
import type { AppLogger } from "./logger.js";

const require = createRequire(import.meta.url);

// 延迟获取日志器，避免模块导入时的循环依赖（rotation ← modules ← index ← rotation）
let _log: AppLogger | null = null;
function getLog(): AppLogger {
  if (!_log) {
    const { getLogger } = require("./index.js") as typeof import("./index.js");
    _log = getLogger("logger-rotation");
  }
  return _log;
}

/** 清理间隔（24 小时） */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 日志轮转管理器
 */
export class LogRotationManager {
  private readonly dir: string;
  private readonly config: FileRotationConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(dir: string, config: FileRotationConfig) {
    this.dir = dir;
    this.config = config;
  }

  /**
   * 启动定时清理
   *
   * 每 24 小时执行一次过期文件清理
   */
  start(): void {
    if (this.cleanupTimer) {
      return; // 已启动
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldFiles().catch((err) => {
        getLog().error({ err }, "日志清理失败");
      });
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * 停止定时清理
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 检查是否正在运行
   */
  isRunning(): boolean {
    return this.cleanupTimer !== null;
  }

  /**
   * 清理过期日志文件
   *
   * 删除超过 maxAgeDays 天的日志文件
   */
  async cleanupOldFiles(): Promise<void> {
    if (!existsSync(this.dir)) {
      return;
    }

    const now = Date.now();
    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(this.dir);

    for (const file of files) {
      // 只处理日志文件（.log / .json / .log.gz）
      if (
        !file.endsWith(".log") &&
        !file.endsWith(".log.gz") &&
        !file.endsWith(".json") &&
        !file.endsWith(".json.gz")
      ) {
        continue;
      }

      const filePath = join(this.dir, file);
      try {
        const stats = statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          unlinkSync(filePath);
        }
      } catch (err) {
        // 文件可能已被删除，忽略错误
      }
    }
  }

  /**
   * 检查并轮转日志文件
   *
   * 当文件大小超过 maxSizeBytes 时，重命名文件并可选压缩
   *
   * @param currentFile - 当前日志文件路径
   */
  async rotateIfNeeded(currentFile: string): Promise<void> {
    if (!existsSync(currentFile)) {
      return;
    }

    const stats = statSync(currentFile);
    if (stats.size <= this.config.maxSizeBytes) {
      return; // 不需要轮转
    }

    // 生成轮转文件名（带时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = dirname(currentFile);
    const base = basename(currentFile, ".log");
    const rotatedFile = join(dir, `${base}-${timestamp}.log`);

    // 重命名原文件
    renameSync(currentFile, rotatedFile);

    // 可选压缩
    if (this.config.compress) {
      await this.compressFile(rotatedFile);
    }
  }

  /**
   * 压缩文件（gzip）
   *
   * @param filePath - 要压缩的文件路径
   */
  async compressFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const gzipPath = `${filePath}.gz`;

      // 使用 spawn 调用 gzip
      const gzip = spawn("gzip", [filePath]);

      // 超时保护：30 秒后强制终止
      const timer = setTimeout(() => {
        gzip.kill("SIGKILL");
        reject(new Error(`gzip 超时: ${filePath}`));
      }, 30_000);

      gzip.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`gzip 退出码: ${code}`));
        }
      });

      gzip.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
