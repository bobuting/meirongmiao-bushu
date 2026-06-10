# 错误日志存储系统设计

## 概述

将错误日志存入数据库，实现**排查问题、监控健康度、合规审计**三大目标。

### 核心设计决策

- **错误范围**: 应用层错误 + LLM 调用错误 + 数据库错误 + 未捕获异常 + 关键流程失败
- **写入策略**: 异步批量写入（不阻塞主流程），进程退出时 flush 保证关键日志不丢失
- **保留策略**: 分级保留（critical 90天 / error 30天 / warn 7天）

---

## 1. 数据库表设计

### 表结构

```sql
CREATE TABLE nrm_error_logs (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 核心字段（所有错误必须有）
  error_code VARCHAR(100) NOT NULL,           -- 错误码，用于分类统计
  error_message TEXT NOT NULL,                -- 错误消息，用于排查
  error_stack TEXT,                           -- 错误堆栈，定位代码位置
  severity VARCHAR(20) NOT NULL,              -- 错误级别: error/warn/critical
  created_at BIGINT NOT NULL,                 -- 发生时间戳（毫秒）

  -- 上下文信息（部分可为空）
  user_id UUID,                               -- 用户 ID（系统错误可为空）
  request_id VARCHAR(100),                    -- 请求 ID，追踪完整请求链路
  api_path VARCHAR(200),                      -- API 路径
  source_module VARCHAR(100),                 -- 来源模块，如 video-step/step3

  -- LLM 扩展字段（仅 LLM 相关错误填写，可为空）
  llm_model VARCHAR(100),                     -- LLM 模型名称
  llm_input TEXT,                             -- LLM 输入内容
  llm_output TEXT,                            -- LLM 输出内容

  -- 可选字段
  project_id UUID,                            -- 项目 ID
  input_params JSONB,                         -- 输入参数（JSON 格式）
  service_version VARCHAR(50)                 -- 服务版本（从 package.json version 字段获取）
);

-- 索引设计
CREATE INDEX idx_error_logs_created_at ON nrm_error_logs(created_at DESC);
CREATE INDEX idx_error_logs_user_id ON nrm_error_logs(user_id);
CREATE INDEX idx_error_logs_error_code ON nrm_error_logs(error_code);
CREATE INDEX idx_error_logs_severity ON nrm_error_logs(severity);
CREATE INDEX idx_error_logs_source_module ON nrm_error_logs(source_module);

-- 表备注
COMMENT ON TABLE nrm_error_logs IS '错误日志表';
COMMENT ON COLUMN nrm_error_logs.error_code IS '错误码，用于分类统计';
COMMENT ON COLUMN nrm_error_logs.severity IS '错误级别：error/warn/critical';
```

### 字段说明

| 分类 | 字段 | 必填 | 用途 |
|------|------|------|------|
| 核心 | error_code, error_message, error_stack, severity, created_at | 是 | 排查、分类、监控 |
| 上下文 | user_id, request_id, api_path, source_module | 部分 | 追踪链路、维度统计 |

**request_id 获取方式：** Fastify 默认为每个请求生成唯一 ID，可通过 `request.id` 获取。
| LLM | llm_model, llm_input, llm_output | 否 | LLM 错误专项排查 |
| 可选 | project_id, input_params, service_version | 否 | 业务关联、版本分析 |

---

## 2. 日志清理策略

### 分级保留规则

| 级别 | 保留时长 | 原因 |
|------|----------|------|
| `critical` | 90 天 | 审计需要，关键错误需长期追溯 |
| `error` | 30 天 | 排查问题，中等保留周期 |
| `warn` | 7 天 | 监控趋势，短期保留即可 |

### 清理机制

- 使用项目现有的 Scheduler 模块（参考 `deleted-data-cleanup-scheduler.ts`）
- 每天凌晨执行一次清理任务
- 按级别批量删除过期记录

```sql
-- 清理 SQL
DELETE FROM nrm_error_logs
WHERE severity = 'critical' AND created_at < (EXTRACT(EPOCH FROM NOW()) * 1000 - 90 * 24 * 60 * 60 * 1000);

DELETE FROM nrm_error_logs
WHERE severity = 'error' AND created_at < (EXTRACT(EPOCH FROM NOW()) * 1000 - 30 * 24 * 60 * 60 * 1000);

DELETE FROM nrm_error_logs
WHERE severity = 'warn' AND created_at < (EXTRACT(EPOCH FROM NOW()) * 1000 - 7 * 24 * 60 * 60 * 1000);
```

---

## 3. 内存队列与批量写入机制

### 队列结构

```typescript
interface ErrorLogQueue {
  items: ErrorLogEntry[];      // 待写入的日志条目
  maxBatchSize: number;        // 单次批量写入最大条数（默认 100）
  flushIntervalMs: number;     // 定时 flush 间隔（默认 5000ms）
  flushTimer: NodeJS.Timeout;  // 定时器引用
  isFlushing: boolean;         // 防止并发 flush
}
```

### 批量写入流程

```
错误发生 → enqueue(entry) → 队列大小 >= maxBatchSize?
                                    ↓ 是
                              立即 flush()
                                    ↓ 否
                              等待定时器触发（每 5s）
```

### 批量写入优化

- 队列积攒到 100 条时立即 flush（避免队列过大）
- 或每 5 秒定时 flush（保证日志及时入库）
- 使用 PostgreSQL 批量 INSERT（单条 SQL，多条 VALUES）

---

## 4. 进程退出 Hook 与 Flush 机制

### Hook 注册点

在 `server.ts` 中注册以下 hook：

1. **uncaughtException** - 未捕获异常
   ```typescript
   process.on('uncaughtException', async (error) => {
     logger.error('Uncaught exception', error);
     await errorLogQueue.flush();  // 先 flush 日志队列
     process.exit(1);
   });
   ```

2. **unhandledRejection** - Promise 未处理拒绝
   ```typescript
   process.on('unhandledRejection', async (reason) => {
     logger.error('Unhandled rejection', reason);
     await errorLogQueue.flush();
     process.exit(1);
   });
   ```

3. **SIGTERM** - 正常关闭信号（K8s/Docker 停止容器）
   ```typescript
   process.on('SIGTERM', async () => {
     logger.info('Received SIGTERM, shutting down...');
     await errorLogQueue.flush();
     await app.close();
     process.exit(0);
   });
   ```

4. **SIGINT** - Ctrl+C 信号
   ```typescript
   process.on('SIGINT', async () => {
     logger.info('Received SIGINT, shutting down...');
     await errorLogQueue.flush();
     await app.close();
     process.exit(0);
   });
   ```

### Flush 实现要点

- `flush()` 方法返回 Promise，支持异步等待
- 设置 `isFlushing` 标志防止并发 flush
- flush 失败时记录到 fallback 日志文件（`data/object-storage/logs/error-log-fallback.log`），确保不丢失
- flush 超时设置（如 10 秒），避免进程挂死

---

## 5. 代码架构

### 文件结构

```
src/
  services/
    error-log/
      error-log-queue.ts          # 内存队列 + 批量写入逻辑
      error-log-service.ts        # 错误日志服务（统一入口）

  repositories/
    pg/
      error-log-pg-repository.ts  # PG 仓库（CRUD + 清理）

  scheduler/
    error-log-cleanup-scheduler.ts  # 定时清理任务
```

### Repository 职责

```typescript
class PgErrorLogRepository extends PgBaseRepository<ErrorLog> {
  // 批量插入
  async batchInsert(logs: ErrorLog[]): Promise<void>;

  // 按条件查询（管理后台用）
  async findByFilters(filters: ErrorLogFilters): Promise<ErrorLog[]>;

  // 统计错误数量（监控用）
  async countByErrorCode(startDate: number, endDate: number): Promise<CountResult[]>;

  // 清理过期日志（Scheduler 用）
  async deleteExpiredLogs(): Promise<DeletedStats>;
}
```

### Service 职责

```typescript
class ErrorLogService {
  // 记录错误（统一入口）
  log(error: Error, context: ErrorLogContext): void;

  // 记录 LLM 错误（扩展入口）
  logLlmError(error: Error, context: LlmErrorContext): void;

  // 手动 flush（供进程退出 hook 调用）
  flush(): Promise<void>;
}
```

---

## 6. 集成点与调用方式

### 集成点 1：Fastify 全局错误处理器

在 `app.ts` 或 `app-setup` 中注册：

```typescript
app.setErrorHandler(async (error, request, reply) => {
  // 记录错误
  errorLogService.log(error, {
    userId: request.user?.id,
    requestId: request.id,
    apiPath: `${request.method} ${request.url}`,
    sourceModule: 'fastify-error-handler',
  });

  // 返回错误响应
  reply.code(error.statusCode || 500).send({
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
  });
});
```

### 集成点 2：LLM 调用层

在 `llm-transport.ts` 中 catch 块记录错误：

```typescript
try {
  const response = await requestLlmPlainText(prompt, model);
} catch (error) {
  errorLogService.logLlmError(error, {
    model: 'gemini-2.0-flash',
    llmInput: prompt,
    sourceModule: 'llm-transport',
  });
  throw error;  // 继续抛出，不吞掉错误
}
```

### 集成点 3：关键业务流程

在热榜同步、视频生成等关键流程中：

```typescript
catch (error) {
  errorLogService.log(error, {
    sourceModule: 'video-hot-trend-batch-reverse',
    projectId: context.projectId,
  });
  // 原有的错误处理逻辑继续
}
```

### 调用原则

- 错误记录**不吞掉错误**，只是附加日志功能
- 所有 catch 块都应该考虑是否需要记录
- 系统级错误（uncaughtException）由进程 hook 统一处理

---

## 7. 管理后台查询接口

### 新增路由

文件：`src/routes/admin/error-log-routes.ts`

### 接口设计

**1. 查询错误日志列表（分页）**

```
GET /neirongmiao/api/admin/error-logs
```

Query params:
- `page: number`
- `pageSize: number`
- `severity?: 'error' | 'warn' | 'critical'`
- `errorCode?: string`
- `userId?: string`
- `sourceModule?: string`
- `startDate?: number`
- `endDate?: number`

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "errorCode": "VIDEO_NOT_FOUND",
      "errorMessage": "...",
      "severity": "error",
      "createdAt": 1234567890000,
      ...
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

**2. 统计错误数量（按错误码分组）**

```
GET /neirongmiao/api/admin/error-logs/stats/by-code
```

Query params:
- `startDate: number`
- `endDate: number`
- `severity?: string`

Response:
```json
[
  { "errorCode": "VIDEO_NOT_FOUND", "count": 50 },
  { "errorCode": "LLM_TIMEOUT", "count": 30 }
]
```

**3. 统计错误趋势（按日期分组）**

```
GET /neirongmiao/api/admin/error-logs/stats/by-date
```

Query params:
- `startDate: number`
- `endDate: number`
- `severity?: string`

Response:
```json
[
  { "date": "2026-04-01", "count": 10 },
  { "date": "2026-04-02", "count": 15 }
]
```

### 权限控制

- 仅管理员可访问（使用现有的 `requireAdmin()` 路由守卫）
- 支持按用户查询，方便排查特定用户的问题

---

## 8. 实现注意事项

### 不要破坏现有错误处理

- 现有的 `AppError` 和 `assertCondition` 继续使用
- 错误日志服务是附加层，不改变现有错误抛出逻辑

### 遵循项目约束

- 表名使用 `nrm_` 前缀（`nrm_error_logs`）
- Repository 继承 `PgBaseRepository`
- 路由通过 `...otherHandlers` 扩展点注册
- 不向 `app.ts` 写入新代码

### 性能考虑

- 异步写入确保主流程响应时间不受影响
- 批量写入减少数据库连接开销
- 索引覆盖常用查询，避免全表扫描

---

## 9. 验收标准

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