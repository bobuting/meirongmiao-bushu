/**
 * 前端日志器
 */

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

const DEFAULT_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'info';

class FrontendLogger {
  private module: string;
  private level: LogLevel;

  constructor(module: string, level: LogLevel = DEFAULT_LEVEL) {
    this.module = module;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.module}] ${message}`;
  }

  private formatObject(obj: Record<string, unknown>): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return '[Object]';
    }
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const fn = level === 'fatal' ? console.error : console[level] ?? console.log;

    if (args.length >= 2 && typeof args[0] === 'object' && args[0] !== null) {
      fn(this.formatMessage(level, typeof args[1] === 'string' ? args[1] : ''), this.formatObject(args[0] as Record<string, unknown>));
    } else {
      fn(this.formatMessage(level, typeof args[0] === 'string' ? args[0] : ''));
    }
  }

  trace(...args: unknown[]): void { this.log('trace', ...args); }
  debug(...args: unknown[]): void { this.log('debug', ...args); }
  info(...args: unknown[]): void { this.log('info', ...args); }
  warn(...args: unknown[]): void { this.log('warn', ...args); }
  error(...args: unknown[]): void { this.log('error', ...args); }
  fatal(...args: unknown[]): void { this.log('fatal', ...args); }
}

export function getLogger(module: string): FrontendLogger {
  return new FrontendLogger(module);
}