/**
 * 按日期自动切换的日志写入流
 *
 * 替代 Pino worker-thread transport 的静态文件路径方案。
 * 每次写入时检查日期，跨日自动关闭旧文件、打开新文件，
 * 无需重启进程即可实现日志按天滚动。
 */

import { Writable } from "stream";
import { createWriteStream, mkdirSync, type WriteStream } from "fs";

/** Pino 日志级别 → 数值映射 */
const PINO_LEVEL_VALUES: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/** 数值 → 级别名称（pretty 格式化用） */
const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

interface DailyRotatingStreamOptions {
  /** 日志目录 */
  dir: string;
  /** 文件名前缀 */
  prefix: string;
  /** 日志类型 */
  type: "info" | "error";
  /** 文件扩展名 */
  ext: "log" | "json";
  /** 最低日志级别，低于此级别的日志将被丢弃 */
  minLevel?: string;
  /** 是否格式化为可读文本（仅 dev 文本日志） */
  pretty?: boolean;
}

function getDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function makePath(opts: DailyRotatingStreamOptions, date: string): string {
  return `${opts.dir}${opts.prefix}-${opts.type}-${date}.${opts.ext}`;
}

/** 简单的 pretty 格式化（dev 文本日志用，不依赖 pino-pretty） */
function formatPretty(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    const time = obj.time ? new Date(obj.time).toISOString() : "";
    const levelStr = LEVEL_NAMES[obj.level] ?? String(obj.level);
    const mod = obj.module ? ` [${obj.module}]` : "";
    return `${time} ${levelStr.padEnd(5)}${mod} ${obj.msg ?? ""}\n`;
  } catch {
    return raw;
  }
}

/**
 * 按日期自动切换文件的日志写入流
 *
 * 每次 _write 检查当前日期，跨日时关闭旧文件并打开新文件。
 * 支持 minLevel 过滤和 pretty 文本格式化。
 */
export class DailyRotatingStream extends Writable {
  private readonly opts: DailyRotatingStreamOptions;
  private readonly minLevelValue: number;
  private currentDate: string;
  private fileStream: WriteStream;

  constructor(opts: DailyRotatingStreamOptions) {
    super({ autoDestroy: true });
    this.opts = opts;
    this.minLevelValue = PINO_LEVEL_VALUES[opts.minLevel ?? "trace"] ?? 10;
    this.currentDate = getDateStr();
    mkdirSync(opts.dir, { recursive: true });
    this.fileStream = this.createFileWriter(this.currentDate);
  }

  /** 创建文件写入流并绑定 error handler（防止未捕获异常 crash） */
  private createFileWriter(date: string): WriteStream {
    const ws = createWriteStream(makePath(this.opts, date), { flags: "a" });
    ws.on("error", () => {
      // 静默吞掉写入错误（磁盘满/权限等），避免 crash 进程
      // 日志丢失优于进程崩溃
    });
    return ws;
  }

  _write(chunk: Buffer | string, _encoding: string, callback: (error?: Error | null) => void): void {
    const raw = typeof chunk === "string" ? chunk : chunk.toString();

    // 级别过滤
    if (this.minLevelValue > 10) {
      try {
        const obj = JSON.parse(raw);
        if ((obj.level ?? 0) < this.minLevelValue) {
          callback();
          return;
        }
      } catch {
        // 解析失败则放行
      }
    }

    this.maybeRotate();

    if (this.opts.pretty) {
      this.fileStream.write(formatPretty(raw), callback);
    } else {
      this.fileStream.write(raw, callback);
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    this.fileStream.end(callback);
  }

  private maybeRotate(): void {
    const today = getDateStr();
    if (today === this.currentDate) return;
    this.fileStream.end();
    this.currentDate = today;
    this.fileStream = this.createFileWriter(this.currentDate);
  }
}

/**
 * 多路输出流 — 将日志分发到多个 Writable 目标
 *
 * 用于同时写入控制台 + 多个文件流，替代 Pino 的 transport targets。
 */
export class MultiStream extends Writable {
  private readonly streams: Writable[];

  constructor(streams: Writable[]) {
    super({ autoDestroy: true });
    this.streams = streams;
    // 子流 error handler：防止任一下游错误 crash 进程
    for (const stream of streams) {
      stream.on("error", () => {});
    }
  }

  _write(chunk: Buffer | string, _encoding: string, callback: (error?: Error | null) => void): void {
    for (const stream of this.streams) {
      stream.write(chunk);
    }
    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    let pending = this.streams.length;
    if (pending === 0) {
      callback();
      return;
    }
    for (const stream of this.streams) {
      stream.end(() => {
        if (--pending === 0) callback();
      });
    }
  }
}
