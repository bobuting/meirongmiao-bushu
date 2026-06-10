# 错误日志存储系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现异步批量写入的错误日志存储系统，支持分级保留策略和进程退出 flush。

**架构：** 内存队列 + 定时批量写入 + 进程退出 hook flush + 分级清理 scheduler。

**技术栈：** TypeScript 5、PostgreSQL、Fastify 5、Repository Pattern

---

## 文件结构

### 创建的文件

| 文件 | 职责 |
|------|------|
| `migrations/create-error-logs-table.sql` | 数据库表创建脚本 |
| `src/contracts/error-log-contract.ts` | 类型定义和接口契约 |
| `src/repositories/pg/error-log-pg-repository.ts` | PG 仓库（CRUD + 清理） |
| `src/services/error-log/error-log-queue.ts` | 内存队列 + 批量写入逻辑 |
| `src/services/error-log/error-log-service.ts` | 错误日志服务（统一入口） |
| `src/scheduler/error-log-cleanup-scheduler.ts` | 定时清理任务 |
| `src/routes/admin/error-log-routes.ts` | 管理后台查询路由 |
| `src/app-setup/setup-error-log.ts` | 错误日志服务初始化 |

### 修改的文件

| 文件 | 变更内容 |
|------|----------|
| `src/repositories/pg/index.ts` | 注册 errorLogs repository |
| `src/server.ts` | 添加进程退出 hooks（flush 队列） |
| `src/app-setup/setup-core.ts` | 初始化错误日志服务 |
| `src/app-setup/setup-routes.ts` | 注册管理后台路由 |
| `src/app.ts` | 添加全局错误处理器 |

### 测试文件

| 文件 | 测试内容 |
|------|----------|
| `tests/repositories/pg/error-log-pg-repository.test.ts` | Repository CRUD 测试 |
| `tests/services/error-log/error-log-queue.test.ts` | 队列批量写入测试 |
| `tests/services/error-log/error-log-service.test.ts` | 服务层集成测试 |

---

## 任务 1：数据库表创建

**文件：**
- 创建：`migrations/create-error-logs-table.sql`

- [ ] **步骤 1：编写数据库迁移脚本**

```sql
-- 创建错误日志表
CREATE TABLE IF NOT EXISTS nrm_error_logs (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 核心字段（所有错误必须有）
  error_code VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('error', 'warn', 'critical')),
  created_at BIGINT NOT NULL,

  -- 上下文信息（部分可为空）
  user_id UUID,
  request_id VARCHAR(100),
  api_path VARCHAR(200),
  source_module VARCHAR(100),

  -- LLM 扩展字段（可为空）
  llm_model VARCHAR(100),
  llm_input TEXT,
  llm_output TEXT,

  -- 可选字段
  project_id UUID,
  input_params JSONB,
  service_version VARCHAR(50)
);

-- 索引设计
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON nrm_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON nrm_error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_code ON nrm_error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON nrm_error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_source_module ON nrm_error_logs(source_module);

-- 表备注
COMMENT ON TABLE nrm_error_logs IS '错误日志表';
COMMENT ON COLUMN nrm_error_logs.error_code IS '错误码，用于分类统计';
COMMENT ON COLUMN nrm_error_logs.severity IS '错误级别：error/warn/critical';
COMMENT ON COLUMN nrm_error_logs.created_at IS '发生时间戳（毫秒）';
```

- [ ] **步骤 2：手动执行迁移脚本**

运行：`psql -d <database_name> -f migrations/create-error-logs-table.sql`
预期：表和索引创建成功

- [ ] **步骤 3：验证表结构**

运行：`psql -d <database_name> -c "\d nrm_error_logs"`
预期：显示表结构和索引

- [ ] **步骤 4：Commit**

```bash
git add migrations/create-error-logs-table.sql
git commit -m "feat: 创建错误日志表迁移脚本"
```

---

## 任务 2：类型定义和接口契约

**文件：**
- 创建：`src/contracts/error-log-contract.ts`

- [ ] **步骤 1：编写类型定义**

```typescript
/**
 * 错误日志类型定义和接口契约
 */

/** 错误级别 */
export type ErrorSeverity = "error" | "warn" | "critical";

/** 错误日志实体 */
export interface ErrorLog {
  id: string;
  errorCode: string;
  errorMessage: string;
  errorStack?: string | null;
  severity: ErrorSeverity;
  createdAt: number;

  userId?: string | null;
  requestId?: string | null;
  apiPath?: string | null;
  sourceModule?: string | null;

  llmModel?: string | null;
  llmInput?: string | null;
  llmOutput?: string | null;

  projectId?: string | null;
  inputParams?: Record<string, unknown> | null;
  serviceVersion?: string | null;
}

/** 错误日志上下文（记录时提供） */
export interface ErrorLogContext {
  userId?: string;
  requestId?: string;
  apiPath?: string;
  sourceModule?: string;
  projectId?: string;
  inputParams?: Record<string, unknown>;
}

/** LLM 错误扩展上下文 */
export interface LlmErrorContext extends ErrorLogContext {
  llmModel: string;
  llmInput: string;
  llmOutput?: string;
}

/** 错误日志查询过滤条件 */
export interface ErrorLogFilters {
  page?: number;
  pageSize?: number;
  severity?: ErrorSeverity;
  errorCode?: string;
  userId?: string;
  sourceModule?: string;
  startDate?: number;
  endDate?: number;
}

/** 按错误码统计结果 */
export interface ErrorCodeCountResult {
  errorCode: string;
  count: number;
}

/** 按日期统计结果 */
export interface DateCountResult {
  date: string;
  count: number;
}

/** 清理统计结果 */
export interface CleanupStats {
  criticalDeleted: number;
  errorDeleted: number;
  warnDeleted: number;
  totalDeleted: number;
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/contracts/error-log-contract.ts
git commit -m "feat: 添加错误日志类型定义和接口契约"
```

---

## 任务 3：PG Repository 实现

**文件：**
- 创建：`src/repositories/pg/error-log-pg-repository.ts`
- 测试：`tests/repositories/pg/error-log-pg-repository.test.ts`
- 修改：`src/repositories/pg/index.ts`（注册 repository）

- [ ] **步骤 1：编写失败的测试**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PgErrorLogRepository } from "../../../src/repositories/pg/error-log-pg-repository.js";
import type { ErrorLog } from "../../../src/contracts/error-log-contract.js";

describe("PgErrorLogRepository", () => {
  let pool: Pool;
  let repo: PgErrorLogRepository;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });
    repo = new PgErrorLogRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should batch insert error logs", async () => {
    const logs: ErrorLog[] = [
      {
        id: "test-1",
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Video not found",
        severity: "error",
        createdAt: Date.now(),
        sourceModule: "test-module",
      },
      {
        id: "test-2",
        errorCode: "LLM_TIMEOUT",
        errorMessage: "LLM request timeout",
        severity: "error",
        createdAt: Date.now(),
        sourceModule: "llm-transport",
      },
    ];

    await repo.batchInsert(logs);

    const result = await repo.findByFilters({ errorCode: "VIDEO_NOT_FOUND" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].errorCode).toBe("VIDEO_NOT_FOUND");
  });

  it("should find logs by filters", async () => {
    const result = await repo.findByFilters({
      severity: "error",
      pageSize: 10,
    });

    expect(result.length).toBeLessThanOrEqual(10);
    if (result.length > 0) {
      expect(result[0].severity).toBe("error");
    }
  });

  it("should count by error code", async () => {
    const result = await repo.countByErrorCode(
      Date.now() - 24 * 60 * 60 * 1000,
      Date.now(),
    );

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].errorCode).toBeDefined();
      expect(result[0].count).toBeGreaterThan(0);
    }
  });

  it("should delete expired logs", async () => {
    const result = await repo.deleteExpiredLogs();

    expect(result.totalDeleted).toBeDefined();
    expect(typeof result.totalDeleted).toBe("number");
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test tests/repositories/pg/error-log-pg-repository.test.ts`
预期：FAIL，报错 "PgErrorLogRepository not defined"

- [ ] **步骤 3：编写 Repository 实现**

```typescript
/**
 * 错误日志 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type {
  ErrorLog,
  ErrorLogFilters,
  ErrorCodeCountResult,
  DateCountResult,
  CleanupStats,
  ErrorSeverity,
} from "../../contracts/error-log-contract.js";

export class PgErrorLogRepository extends PgBaseRepository<ErrorLog> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("error_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): ErrorLog {
    return {
      id: row.id as string,
      errorCode: row.error_code as string,
      errorMessage: row.error_message as string,
      errorStack: row.error_stack as string | null,
      severity: row.severity as ErrorSeverity,
      createdAt: row.created_at as number,
      userId: row.user_id as string | null,
      requestId: row.request_id as string | null,
      apiPath: row.api_path as string | null,
      sourceModule: row.source_module as string | null,
      llmModel: row.llm_model as string | null,
      llmInput: row.llm_input as string | null,
      llmOutput: row.llm_output as string | null,
      projectId: row.project_id as string | null,
      inputParams: row.input_params as Record<string, unknown> | null,
      serviceVersion: row.service_version as string | null,
    };
  }

  protected mapEntity(entity: ErrorLog): Record<string, unknown> {
    return {
      id: entity.id,
      error_code: entity.errorCode,
      error_message: entity.errorMessage,
      error_stack: entity.errorStack ?? null,
      severity: entity.severity,
      created_at: entity.createdAt,
      user_id: entity.userId ?? null,
      request_id: entity.requestId ?? null,
      api_path: entity.apiPath ?? null,
      source_module: entity.sourceModule ?? null,
      llm_model: entity.llmModel ?? null,
      llm_input: entity.llmInput ?? null,
      llm_output: entity.llmOutput ?? null,
      project_id: entity.projectId ?? null,
      input_params: entity.inputParams ?? null,
      service_version: entity.serviceVersion ?? null,
    };
  }

  /** 批量插入错误日志 */
  async batchInsert(logs: ErrorLog[]): Promise<void> {
    if (logs.length === 0) return;

    const fields = [
      "id", "error_code", "error_message", "error_stack", "severity", "created_at",
      "user_id", "request_id", "api_path", "source_module",
      "llm_model", "llm_input", "llm_output",
      "project_id", "input_params", "service_version",
    ];

    const values: (string | number | null | Record<string, unknown>)[] = [];
    const placeholders: string[] = [];

    logs.forEach((log, index) => {
      const base = index * fields.length;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16})`,
      );
      values.push(
        log.id,
        log.errorCode,
        log.errorMessage,
        log.errorStack ?? null,
        log.severity,
        log.createdAt,
        log.userId ?? null,
        log.requestId ?? null,
        log.apiPath ?? null,
        log.sourceModule ?? null,
        log.llmModel ?? null,
        log.llmInput ?? null,
        log.llmOutput ?? null,
        log.projectId ?? null,
        log.inputParams ?? null,
        log.serviceVersion ?? null,
      );
    });

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${fields.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }

  /** 按条件查询错误日志 */
  async findByFilters(filters: ErrorLogFilters): Promise<ErrorLog[]> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(filters.severity);
    }

    if (filters.errorCode) {
      conditions.push(`error_code = $${paramIndex++}`);
      values.push(filters.errorCode);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }

    if (filters.sourceModule) {
      conditions.push(`source_module = $${paramIndex++}`);
      values.push(filters.sourceModule);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, pageSize, offset],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /** 统计错误数量（按错误码分组） */
  async countByErrorCode(startDate: number, endDate: number, severity?: ErrorSeverity): Promise<ErrorCodeCountResult[]> {
    let query = `SELECT error_code, COUNT(*) as count FROM ${this.tableName} WHERE created_at >= $1 AND created_at <= $2`;
    const params: (number | string)[] = [startDate, endDate];

    if (severity) {
      query += ` AND severity = $3`;
      params.push(severity);
    }

    query += ` GROUP BY error_code ORDER BY count DESC`;

    const result = await this.queryClient.query(query, params);
    return result.rows.map((row) => ({
      errorCode: row.error_code as string,
      count: parseInt(row.count as string, 10),
    }));
  }

  /** 统计错误趋势（按日期分组） */
  async countByDate(startDate: number, endDate: number, severity?: ErrorSeverity): Promise<DateCountResult[]> {
    let query = `SELECT DATE(TO_TIMESTAMP(created_at / 1000)) as date, COUNT(*) as count FROM ${this.tableName} WHERE created_at >= $1 AND created_at <= $2`;
    const params: (number | string)[] = [startDate, endDate];

    if (severity) {
      query += ` AND severity = $3`;
      params.push(severity);
    }

    query += ` GROUP BY date ORDER BY date`;

    const result = await this.queryClient.query(query, params);
    return result.rows.map((row) => ({
      date: row.date as string,
      count: parseInt(row.count as string, 10),
    }));
  }

  /** 清理过期日志 */
  async deleteExpiredLogs(): Promise<CleanupStats> {
    const nowMs = Date.now();
    const stats: CleanupStats = {
      criticalDeleted: 0,
      errorDeleted: 0,
      warnDeleted: 0,
      totalDeleted: 0,
    };

    // Critical: 保留 90 天
    const criticalCutoff = nowMs - 90 * 24 * 60 * 60 * 1000;
    const criticalResult = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE severity = 'critical' AND created_at < $1`,
      [criticalCutoff],
    );
    stats.criticalDeleted = criticalResult.rowCount ?? 0;

    // Error: 保留 30 天
    const errorCutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
    const errorResult = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE severity = 'error' AND created_at < $1`,
      [errorCutoff],
    );
    stats.errorDeleted = errorResult.rowCount ?? 0;

    // Warn: 保留 7 天
    const warnCutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
    const warnResult = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE severity = 'warn' AND created_at < $1`,
      [warnCutoff],
    );
    stats.warnDeleted = warnResult.rowCount ?? 0;

    stats.totalDeleted = stats.criticalDeleted + stats.errorDeleted + stats.warnDeleted;
    return stats;
  }
}
```

- [ ] **步骤 4：修改 index.ts 注册 repository**

```typescript
// 在 src/repositories/pg/index.ts 中添加导入
import { PgErrorLogRepository } from "./error-log-pg-repository.js";

// 在 PgRepositoryCollection 接口中添加
export interface PgRepositoryCollection {
  // ... 现有字段
  errorLogs: PgErrorLogRepository;
  withTransaction: <T>(fn: (txRepos: PgRepositoryCollection) => Promise<T>) => Promise<T>;
}

// 在 createPgRepositories 函数中添加
const repos = {
  // ... 现有 repos
  errorLogs: new PgErrorLogRepository(pool),
};

// 在 createPgRepositoriesFromClient 函数中添加
return {
  // ... 现有 repos
  errorLogs: new PgErrorLogRepository(pool, client),
  withTransaction: async <T>(fn: (txRepos: PgRepositoryCollection) => Promise<T>) => fn(createPgRepositoriesFromClient(pool, client)),
};

// 在文件末尾添加导出
export {
  PgErrorLogRepository,
  type ErrorLog,
  type ErrorSeverity,
  type ErrorLogFilters,
  type ErrorCodeCountResult,
  type DateCountResult,
  type CleanupStats,
} from "./error-log-pg-repository.js";
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npm test tests/repositories/pg/error-log-pg-repository.test.ts`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add src/repositories/pg/error-log-pg-repository.ts tests/repositories/pg/error-log-pg-repository.test.ts src/repositories/pg/index.ts
git commit -m "feat: 实现错误日志 PG Repository"
```

---

## 任务 4：内存队列实现

**文件：**
- 创建：`src/services/error-log/error-log-queue.ts`
- 测试：`tests/services/error-log/error-log-queue.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorLogQueue } from "../../../src/services/error-log/error-log-queue.js";
import type { ErrorLog } from "../../../src/contracts/error-log-contract.js";

// Mock repository
const mockRepo = {
  batchInsert: vi.fn(),
};

describe("ErrorLogQueue", () => {
  let queue: ErrorLogQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new ErrorLogQueue(mockRepo as any, {
      maxBatchSize: 100,
      flushIntervalMs: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    queue.stop();
  });

  it("should enqueue error log", () => {
    const log: ErrorLog = {
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    };

    queue.enqueue(log);

    expect(queue.size()).toBe(1);
  });

  it("should flush when reaching max batch size", async () => {
    // 添加 100 条日志触发立即 flush
    for (let i = 0; i < 100; i++) {
      queue.enqueue({
        id: `test-${i}`,
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Test error",
        severity: "error",
        createdAt: Date.now(),
      });
    }

    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
    expect(mockRepo.batchInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ errorCode: "VIDEO_NOT_FOUND" }),
      ]),
    );
  });

  it("should flush on timer", async () => {
    queue.enqueue({
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    });

    // 模拟定时器触发
    vi.advanceTimersByTime(5000);

    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
  });

  it("should flush manually", async () => {
    queue.enqueue({
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    });

    await queue.flush();

    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
    expect(queue.size()).toBe(0);
  });

  it("should prevent concurrent flush", async () => {
    queue.enqueue({
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    });

    // 并发调用 flush
    const promise1 = queue.flush();
    const promise2 = queue.flush();

    await Promise.all([promise1, promise2]);

    // 只应该调用一次
    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test tests/services/error-log/error-log-queue.test.ts`
预期：FAIL，报错 "ErrorLogQueue not defined"

- [ ] **步骤 3：编写队列实现**

```typescript
/**
 * 错误日志内存队列
 * 异步批量写入数据库，支持定时 flush 和进程退出 flush
 */

import type { PgErrorLogRepository } from "../../repositories/pg/error-log-pg-repository.js";
import type { ErrorLog } from "../../contracts/error-log-contract.js";
import { writeFileSync, appendFileSync } from "fs";
import { join } from "path";

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
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Batch insert timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.repo.batchInsert(logs)
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /** 写入 fallback 日志文件 */
  private writeToFallbackLog(logs: ErrorLog[], error: unknown): void {
    try {
      const timestamp = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const logEntries = logs.map((log) => JSON.stringify(log)).join("\n");

      const content = `[${timestamp}] Flush failed: ${errorMessage}\nLogs:\n${logEntries}\n\n`;

      // 尝试追加写入，失败时创建新文件
      try {
        appendFileSync(FALLBACK_LOG_FILE, content);
      } catch {
        writeFileSync(FALLBACK_LOG_FILE, content);
      }
    } catch (fallbackError) {
      // fallback 也失败时，只能输出到控制台
      console.error("[ErrorLogQueue] Fallback log write failed:", fallbackError);
    }
  }

  /** 启动定时 flush */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error("[ErrorLogQueue] Timer flush failed:", error);
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
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test tests/services/error-log/error-log-queue.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/services/error-log/error-log-queue.ts tests/services/error-log/error-log-queue.test.ts
git commit -m "feat: 实现错误日志内存队列"
```

---

## 任务 5：错误日志服务实现

**文件：**
- 创建：`src/services/error-log/error-log-service.ts`
- 测试：`tests/services/error-log/error-log-service.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorLogService } from "../../../src/services/error-log/error-log-service.js";
import type { ErrorLogQueue } from "../../../src/services/error-log/error-log-queue.js";

// Mock queue
const mockQueue = {
  enqueue: vi.fn(),
  flush: vi.fn(),
};

describe("ErrorLogService", () => {
  let service: ErrorLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ErrorLogService(mockQueue as any);
  });

  it("should log error with context", () => {
    const error = new Error("Test error");
    service.log(error, {
      userId: "user-1",
      requestId: "req-1",
      apiPath: "GET /api/test",
      sourceModule: "test-module",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Test error",
        severity: "error",
        userId: "user-1",
        requestId: "req-1",
        apiPath: "GET /api/test",
        sourceModule: "test-module",
      }),
    );
  });

  it("should log AppError with correct error code", () => {
    const appError = new (require("../../../src/core/errors.js").AppError)(404, "VIDEO_NOT_FOUND", "Video not found");
    service.log(appError, {
      userId: "user-1",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Video not found",
      }),
    );
  });

  it("should log LLM error with extended context", () => {
    const error = new Error("LLM timeout");
    service.logLlmError(error, {
      llmModel: "gemini-2.0-flash",
      llmInput: "test prompt",
      userId: "user-1",
      sourceModule: "llm-transport",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "LLM_ERROR",
        errorMessage: "LLM timeout",
        llmModel: "gemini-2.0-flash",
        llmInput: "test prompt",
        sourceModule: "llm-transport",
      }),
    );
  });

  it("should flush queue", async () => {
    await service.flush();

    expect(mockQueue.flush).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test tests/services/error-log/error-log-service.test.ts`
预期：FAIL，报错 "ErrorLogService not defined"

- [ ] **步骤 3：编写服务实现**

```typescript
/**
 * 错误日志服务
 * 统一错误日志记录入口
 */

import type { ErrorLogQueue } from "./error-log-queue.js";
import type { ErrorLogContext, LlmErrorContext, ErrorLog, ErrorSeverity } from "../../contracts/error-log-contract.js";
import { AppError } from "../../core/errors.js";
import { randomUUID } from "crypto";

export class ErrorLogService {
  private readonly queue: ErrorLogQueue;

  constructor(queue: ErrorLogQueue) {
    this.queue = queue;
  }

  /** 记录错误（统一入口） */
  log(error: Error, context: ErrorLogContext = {}): void {
    const log: ErrorLog = {
      id: randomUUID(),
      errorCode: this.extractErrorCode(error),
      errorMessage: error.message,
      errorStack: error.stack,
      severity: this.determineSeverity(error),
      createdAt: Date.now(),
      userId: context.userId ?? null,
      requestId: context.requestId ?? null,
      apiPath: context.apiPath ?? null,
      sourceModule: context.sourceModule ?? null,
      projectId: context.projectId ?? null,
      inputParams: context.inputParams ?? null,
    };

    this.queue.enqueue(log);
  }

  /** 记录 LLM 错误（扩展入口） */
  logLlmError(error: Error, context: LlmErrorContext): void {
    const log: ErrorLog = {
      id: randomUUID(),
      errorCode: "LLM_ERROR",
      errorMessage: error.message,
      errorStack: error.stack,
      severity: "error",
      createdAt: Date.now(),
      userId: context.userId ?? null,
      requestId: context.requestId ?? null,
      apiPath: context.apiPath ?? null,
      sourceModule: context.sourceModule ?? null,
      llmModel: context.llmModel,
      llmInput: context.llmInput,
      llmOutput: context.llmOutput ?? null,
      projectId: context.projectId ?? null,
    };

    this.queue.enqueue(log);
  }

  /** 手动 flush（供进程退出 hook 调用） */
  async flush(): Promise<void> {
    await this.queue.flush();
  }

  /** 提取错误码 */
  private extractErrorCode(error: Error): string {
    if (error instanceof AppError) {
      return error.code;
    }
    return "INTERNAL_ERROR";
  }

  /** 判断错误级别 */
  private determineSeverity(error: Error): ErrorSeverity {
    if (error instanceof AppError) {
      // 5xx 错误视为 critical
      if (error.statusCode >= 500) {
        return "critical";
      }
      // 4xx 错误视为 error
      return "error";
    }

    // 未捕获的异常视为 critical
    return "critical";
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test tests/services/error-log/error-log-service.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/services/error-log/error-log-service.ts tests/services/error-log/error-log-service.test.ts
git commit -m "feat: 实现错误日志服务"
```

---

## 任务 6：初始化模块和进程退出 Hook

**文件：**
- 创建：`src/app-setup/setup-error-log.ts`
- 修改：`src/server.ts`（添加进程退出 hooks）
- 修改：`src/app-setup/setup-core.ts`（初始化错误日志服务）

- [ ] **步骤 1：编写初始化模块**

```typescript
/**
 * 错误日志服务初始化模块
 */

import type { PgErrorLogRepository } from "../repositories/pg/error-log-pg-repository.js";
import { ErrorLogQueue } from "../services/error-log/error-log-queue.js";
import { ErrorLogService } from "../services/error-log/error-log-service.js";

/** 错误日志初始化结果 */
export interface ErrorLogSetupResult {
  errorLogService: ErrorLogService;
  errorLogQueue: ErrorLogQueue;
}

/** 初始化错误日志服务 */
export function setupErrorLog(errorLogRepo: PgErrorLogRepository): ErrorLogSetupResult {
  const queue = new ErrorLogQueue(errorLogRepo, {
    maxBatchSize: 100,
    flushIntervalMs: 5000,
  });

  const service = new ErrorLogService(queue);

  return {
    errorLogService: service,
    errorLogQueue: queue,
  };
}
```

- [ ] **步骤 2：修改 setup-core.ts 初始化错误日志服务**

```typescript
// 在 setup-core.ts 中导入 setupErrorLog
import { setupErrorLog } from "./setup-error-log.js";

// 在 setupCore 函数中，创建 AppContext 之前添加
const errorLogSetup = setupErrorLog(repos.errorLogs);
const { errorLogService, errorLogQueue } = errorLogSetup;

// 在 CoreSetupResult 类型中添加（app-services.ts）
export interface CoreSetupResult {
  // ... 现有字段
  errorLogService: ErrorLogService;
  errorLogQueue: ErrorLogQueue;
}

// 在 return 中添加
return {
  // ... 现有字段
  errorLogService,
  errorLogQueue,
};
```

- [ ] **步骤 3：修改 server.ts 添加进程退出 hooks**

```typescript
// 在 server.ts 中导入 ErrorLogService
import type { ErrorLogService } from "./services/error-log/error-log-service.js";

// 在 main 函数中，buildApp 之后获取 errorLogService
const { errorLogService } = app;  // 需要在 app 中挂载

// 在现有的 uncaughtException 处理之前添加 flush
process.on("uncaughtException", async (err) => {
  // 先 flush 错误日志队列
  if (errorLogService) {
    try {
      await errorLogService.flush();
    } catch (flushError) {
      console.error("[Server] Error log flush failed:", flushError);
    }
  }

  // 原有的错误处理逻辑继续
  if (err.message.includes("Connection terminated") || err.message.includes("ECONNRESET")) {
    console.error("[Server] Database connection error (已捕获，进程继续运行):", err.message);
    return;
  }
  if (err instanceof AppError) {
    console.error("[Server] Uncaught AppError (已降级为日志):", err.message);
    return;
  }
  console.error("[Server] Uncaught exception (进程将退出):", err);
  process.exit(1);
});

// 添加 unhandledRejection hook
process.on("unhandledRejection", async (reason) => {
  console.error("[Server] Unhandled rejection:", reason);

  if (errorLogService) {
    try {
      await errorLogService.flush();
    } catch (flushError) {
      console.error("[Server] Error log flush failed:", flushError);
    }
  }

  process.exit(1);
});

// 在 registerGracefulShutdownHandlers 调用之前添加 SIGTERM/SIGINT hooks
process.on("SIGTERM", async () => {
  console.log("[Server] Received SIGTERM, shutting down...");

  if (errorLogService) {
    try {
      await errorLogService.flush();
    } catch (flushError) {
      console.error("[Server] Error log flush failed:", flushError);
    }
  }

  await app.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Server] Received SIGINT, shutting down...");

  if (errorLogService) {
    try {
      await errorLogService.flush();
    } catch (flushError) {
      console.error("[Server] Error log flush failed:", flushError);
    }
  }

  await app.close();
  process.exit(0);
});
```

- [ ] **步骤 4：验证编译通过**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 5：Commit**

```bash
git add src/app-setup/setup-error-log.ts src/server.ts src/app-setup/setup-core.ts
git commit -m "feat: 初始化错误日志服务并添加进程退出 hooks"
```

---

## 任务 7：定时清理 Scheduler

**文件：**
- 创建：`src/scheduler/error-log-cleanup-scheduler.ts`

- [ ] **步骤 1：编写清理 Scheduler**

```typescript
/**
 * 错误日志清理 Scheduler
 * 每天凌晨执行，按分级策略删除过期日志
 */

import type { PgErrorLogRepository } from "../repositories/pg/error-log-pg-repository.js";
import type { Logger } from "pino";

/** 清理配置 */
export interface CleanupConfig {
  runHour: number;  // 执行时间（小时，默认 2 点）
}

const DEFAULT_CONFIG: CleanupConfig = {
  runHour: 2,
};

export class ErrorLogCleanupScheduler {
  private readonly repo: PgErrorLogRepository;
  private readonly logger: Logger;
  private readonly config: CleanupConfig;
  private timer?: NodeJS.Timeout;

  constructor(repo: PgErrorLogRepository, logger: Logger, config: Partial<CleanupConfig> = {}) {
    this.repo = repo;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动定时清理 */
  start(): void {
    this.logger.info("Error log cleanup scheduler started");

    // 计算下次执行时间
    this.scheduleNextRun();
  }

  /** 停止定时清理 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("Error log cleanup scheduler stopped");
  }

  /** 手动执行清理（测试用） */
  async runCleanup(): Promise<void> {
    this.logger.info("Running error log cleanup");

    try {
      const stats = await this.repo.deleteExpiredLogs();

      this.logger.info({
        criticalDeleted: stats.criticalDeleted,
        errorDeleted: stats.errorDeleted,
        warnDeleted: stats.warnDeleted,
        totalDeleted: stats.totalDeleted,
      }, "Error log cleanup completed");
    } catch (error) {
      this.logger.error(error, "Error log cleanup failed");
    }
  }

  /** 计算下次执行时间并调度 */
  private scheduleNextRun(): void {
    const now = new Date();
    const nextRun = new Date();

    // 设置执行时间为配置的小时
    nextRun.setHours(this.config.runHour, 0, 0, 0);

    // 如果已过今天执行时间，设置为明天
    if (now >= nextRun) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayMs = nextRun.getTime() - now.getTime();

    this.logger.info(`Next cleanup scheduled at ${nextRun.toISOString()}`);

    this.timer = setTimeout(async () => {
      await this.runCleanup();
      this.scheduleNextRun();  // 调度下次执行
    }, delayMs);
  }
}
```

- [ ] **步骤 2：在 setup-core.ts 中启动 Scheduler**

```typescript
// 在 setup-core.ts 中导入
import { ErrorLogCleanupScheduler } from "../scheduler/error-log-cleanup-scheduler.js";

// 在 setupCore 函数中，创建 AppContext 之后添加
const cleanupScheduler = new ErrorLogCleanupScheduler(repos.errorLogs, app.log);
cleanupScheduler.start();

// 在 CoreSetupResult 类型中添加
export interface CoreSetupResult {
  // ... 现有字段
  cleanupScheduler: ErrorLogCleanupScheduler;
}

// 在 return 中添加
return {
  // ... 现有字段
  cleanupScheduler,
};
```

- [ ] **步骤 3：验证编译通过**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 4：Commit**

```bash
git add src/scheduler/error-log-cleanup-scheduler.ts src/app-setup/setup-core.ts
git commit -m "feat: 实现错误日志定时清理 Scheduler"
```

---

## 任务 8：全局错误处理器集成

**文件：**
- 修改：`src/app.ts`（添加全局错误处理器）

- [ ] **步骤 1：在 app.ts 中添加全局错误处理器**

```typescript
// 在 buildApp 函数中，setupCore 之后添加全局错误处理器
app.setErrorHandler(async (error, request, reply) => {
  // 记录错误日志
  ctx.errorLogService.log(error, {
    userId: request.user?.id,
    requestId: request.id,
    apiPath: `${request.method} ${request.url}`,
    sourceModule: "fastify-error-handler",
  });

  // 返回错误响应
  const statusCode = error.statusCode || 500;
  const errorCode = (error as any).code || "INTERNAL_ERROR";

  reply.code(statusCode).send({
    code: errorCode,
    message: error.message,
  });
});
```

- [ ] **步骤 2：验证编译通过**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 3：启动服务验证**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`
预期：服务启动成功，无错误

- [ ] **步骤 4：Commit**

```bash
git add src/app.ts
git commit -m "feat: 添加全局错误处理器集成错误日志服务"
```

---

## 任务 9：管理后台查询路由

**文件：**
- 创建：`src/routes/admin/error-log-routes.ts`
- 修改：`src/app-setup/setup-routes.ts`（注册路由）

- [ ] **步骤 1：编写管理后台路由**

```typescript
/**
 * 错误日志管理后台路由
 * 仅管理员可访问
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PgErrorLogRepository } from "../../repositories/pg/error-log-pg-repository.js";
import type { ErrorLogFilters, ErrorSeverity } from "../../contracts/error-log-contract.js";
import { requireAdmin } from "../../services/auth/route-guards.js";

/** 注册错误日志管理路由 */
export async function registerErrorLogRoutes(
  app: FastifyInstance,
  errorLogRepo: PgErrorLogRepository,
): Promise<void> {
  // 查询错误日志列表（分页）
  app.get("/neirongmiao/api/admin/error-logs", {
    preHandler: [requireAdmin],
    schema: {
      querystring: {
        type: "object",
        properties: {
          page: { type: "number", default: 1 },
          pageSize: { type: "number", default: 20 },
          severity: { type: "string", enum: ["error", "warn", "critical"] },
          errorCode: { type: "string" },
          userId: { type: "string" },
          sourceModule: { type: "string" },
          startDate: { type: "number" },
          endDate: { type: "number" },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: ErrorLogFilters }>, reply) => {
    const filters = request.query;
    const items = await errorLogRepo.findByFilters(filters);

    // 获取总数（通过查询）
    const total = await getTotalCount(errorLogRepo, filters);

    reply.send({
      items,
      total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 20,
    });
  });

  // 统计错误数量（按错误码分组）
  app.get("/neirongmiao/api/admin/error-logs/stats/by-code", {
    preHandler: [requireAdmin],
    schema: {
      querystring: {
        type: "object",
        properties: {
          startDate: { type: "number" },
          endDate: { type: "number" },
          severity: { type: "string", enum: ["error", "warn", "critical"] },
        },
        required: ["startDate", "endDate"],
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { startDate: number; endDate: number; severity?: ErrorSeverity } }>, reply) => {
    const { startDate, endDate, severity } = request.query;
    const result = await errorLogRepo.countByErrorCode(startDate, endDate, severity);
    reply.send(result);
  });

  // 统计错误趋势（按日期分组）
  app.get("/neirongmiao/api/admin/error-logs/stats/by-date", {
    preHandler: [requireAdmin],
    schema: {
      querystring: {
        type: "object",
        properties: {
          startDate: { type: "number" },
          endDate: { type: "number" },
          severity: { type: "string", enum: ["error", "warn", "critical"] },
        },
        required: ["startDate", "endDate"],
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { startDate: number; endDate: number; severity?: ErrorSeverity } }>, reply) => {
    const { startDate, endDate, severity } = request.query;
    const result = await errorLogRepo.countByDate(startDate, endDate, severity);
    reply.send(result);
  });
}

/** 获取总数 */
async function getTotalCount(repo: PgErrorLogRepository, filters: ErrorLogFilters): Promise<number> {
  // 简化：查询所有匹配条件的日志，返回长度
  // 实际项目中应该使用 COUNT(*) 查询优化
  const allItems = await repo.findByFilters({
    ...filters,
    page: 1,
    pageSize: 1000,  // 限制最大查询数量
  });

  return allItems.length;
}
```

- [ ] **步骤 2：在 setup-routes.ts 中注册路由**

```typescript
// 在 setup-routes.ts 中导入
import { registerErrorLogRoutes } from "../routes/admin/error-log-routes.js";

// 在 setupRoutes 函数中添加
await registerErrorLogRoutes(app, ctx.repos.errorLogs);
```

- [ ] **步骤 3：验证编译通过**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 4：启动服务验证**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`
预期：服务启动成功，路由注册成功

- [ ] **步骤 5：测试 API 接口**

使用 curl 或 Postman 测试：
```bash
curl -X GET "http://localhost:3020/neirongmiao/api/admin/error-logs" \
  -H "Authorization: Bearer <admin_token>"
```
预期：返回错误日志列表（需要管理员 token）

- [ ] **步骤 6：Commit**

```bash
git add src/routes/admin/error-log-routes.ts src/app-setup/setup-routes.ts
git commit -m "feat: 添加错误日志管理后台查询路由"
```

---

## 任务 10：LLM 调用层集成（可选）

**文件：**
- 修改：`src/services/llm/llm-transport.ts`（添加 LLM 错误记录）

- [ ] **步骤 1：在 llm-transport.ts 中添加错误记录**

```typescript
// 在 llm-transport.ts 中导入 ErrorLogService
import type { ErrorLogService } from "../error-log/error-log-service.js";

// 在 catch 块中添加错误记录（示例）
export async function requestLlmPlainTextWithMetadata(
  prompt: string,
  model: string,
  errorLogService?: ErrorLogService,
): Promise<LlmResponse> {
  try {
    const response = await actualLlmCall(prompt, model);
    return response;
  } catch (error) {
    // 记录 LLM 错误
    if (errorLogService) {
      errorLogService.logLlmError(error as Error, {
        llmModel: model,
        llmInput: prompt,
        sourceModule: "llm-transport",
      });
    }

    throw error;  // 继续抛出，不吞掉错误
  }
}
```

- [ ] **步骤 2：验证编译通过**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 3：Commit**

```bash
git add src/services/llm/llm-transport.ts
git commit -m "feat: LLM 调用层集成错误日志记录"
```

---

## 验收标准

### 功能验收

- [ ] 错误发生时能正确记录到队列
- [ ] 批量写入能正常工作（100条触发或5秒定时）
- [ ] 进程退出时能 flush 队列
- [ ] 清理任务能按分级策略删除过期日志
- [ ] 管理后台能查询和统计错误日志

### 性能验收

- [ ] 错误记录不影响主流程响应时间（< 1ms）
- [ ] 批量写入不阻塞其他数据库操作
- [ ] 表增长受控（清理策略有效）

### 审计验收

- [ ] critical 级别日志保留 90 天
- [ ] 进程异常退出时关键日志不丢失