/**
 * 错误日志内存队列
 * 异步批量写入数据库，支持定时 flush 和手动 flush
 */

import type { PgErrorLogRepository } from "../../repositories/pg/error-log-pg-repository.js";
import type { ErrorLog } from "../../contracts/error-log-contract.js";
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getLogger } from "../../core/logger/index.js";

const logger = getLogger("error-log-queue");

/** 队列配置 */
export interface ErrorLogQueueConfig {
  maxBatchSize: number;      // 单次批量写入最大条数（默认 100）
  flushIntervalMs: number;   // 定时 flush 间隔（默认 5000ms）
}

const DEFAULT_CONFIG: ErrorLogQueueConfig = {
  maxBatchSize: 100,
  flushIntervalMs: 5000,
};

/** Fallback 日志文件路径 */
const FALLBACK_LOG_FILE = join(process.cwd(), "data/object-storage/logs/error-log-fallback.log");

export class ErrorLogQueue {
  private items: ErrorLog[] = [];
  private readonly config: ErrorLogQueueConfig;
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;
  private readonly repo: PgErrorLogRepository;

  constructor(repo: PgErrorLogRepository, config: Partial<ErrorLogQueueConfig> = {}) {
    this.repo = repo;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushTimer();
  }

  /** 添加日志到队列 */
  enqueue(log: ErrorLog): void {
    this.items.push(log);

    // 达到最大批量大小时立即 flush
    if (this.items.length >= this.config.maxBatchSize) {
      this.flush().catch((error) => {
        this.writeToFallbackLog([log], error);
      });
    }
  }

  /** 获取队列大小 */
  size(): number {
    return this.items.length;
  }

  /** 手动 flush（供进程退出 hook 调用） */
  async flush(): Promise<void> {
    // 防止并发 flush
    if (this.isFlushing) {
      return;
    }

    if (this.items.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      // 取出当前队列中的所有日志
      const logsToFlush = [...this.items];
      this.items = [];

      // 批量写入数据库（设置超时 10 秒）
      await this.batchInsertWithTimeout(logsToFlush, 10000);
    } catch (error) {
      // flush 失败时写入 fallback 文件
      this.writeToFallbackLog(this.items, error);
      this.items = [];
    } finally {
      this.isFlushing = false;
    }
  }

  /** 带超时的批量插入 */
  private async batchInsertWithTimeout(logs: ErrorLog[], timeoutMs: number): Promise<void> {
    // 创建超时 Promise
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Batch insert timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      await Promise.race([
        this.repo.batchInsert(logs),
        timeoutPromise,
      ]);
    } finally {
      // 确保清理超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /** 写入 fallback 日志文件 */
  private writeToFallbackLog(logs: ErrorLog[], error: unknown): void {
    try {
      const timestamp = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const logEntries = logs.map((log) => JSON.stringify(log)).join("\n");

      const content = `[${timestamp}] Flush failed: ${errorMessage}\nLogs:\n${logEntries}\n\n`;

      // 确保目录存在
      const dir = dirname(FALLBACK_LOG_FILE);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 尝试追加写入，失败时创建新文件
      try {
        appendFileSync(FALLBACK_LOG_FILE, content);
      } catch {
        writeFileSync(FALLBACK_LOG_FILE, content);
      }
    } catch (fallbackError) {
      // fallback 也失败时，记录日志
      logger.error(
        fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
        "Fallback 日志写入失败"
      );
    }
  }

  /** 启动定时 flush */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "定时 flush 失败"
        );
      });
    }, this.config.flushIntervalMs);
  }

  /** 停止定时器 */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}