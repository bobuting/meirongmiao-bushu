# 日志系统重构设计

## 概述

重构现有日志系统，实现文件持久化、模块化、等级化，支持错误日志分级存储和链路追踪。

## 目标

1. **文件持久化**：日志写入文件，支持按时间和大小轮转
2. **模块化**：每个业务模块独立日志器，便于排查
3. **等级化**：info/error 分离存储，error 文件仅存储 warn 及以上级别
4. **链路追踪**：基于 traceId/requestId 的请求链路追踪
5. **错误标准化**：结构化错误日志，支持错误码体系
6. **资源优化**：禁用 PM2 日志轮转，统一使用新日志系统

## 目录结构

```
src/core/logger/
├── index.ts              # 统一导出
├── types.ts              # 类型定义
├── config.ts             # 配置解析（环境变量）
├── logger.ts             # 核心日志器类
├── transport.ts          # 传输层（控制台+文件）
├── rotation.ts           # 文件轮转管理
├── redact.ts             # 敏感信息脱敏
├── modules.ts            # 模块日志器工厂
└── setup-logger.ts       # Fastify 集成
```

## 核心设计

### 一、类型定义

```typescript
// 日志级别
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// 文件轮转配置
interface FileRotationConfig {
  maxSizeBytes: number;      // 单文件最大字节（默认 20MB）
  maxAgeDays: number;        // 保留天数（默认 7 天）
  compress: boolean;         // 是否压缩旧文件（默认 true）
}

// 文件传输配置
interface FileTransportConfig {
  enabled: boolean;          // 是否启用文件日志
  dir: string;               // 日志目录（默认 'logs/'）
  prefix: string;            // 文件名前缀（默认 'app'）
  rotation: FileRotationConfig;
  format: 'json' | 'pretty'; // 输出格式
}

// 日志器配置
interface LoggerConfig {
  level: LogLevel;           // 全局日志级别
  module?: string;           // 模块名称
  console: boolean;          // 是否输出到控制台
  file: FileTransportConfig;
}

// 日志上下文（附加到每条日志）
interface LogContext {
  module: string;            // 模块标识
  requestId?: string;        // 请求 ID
  traceId?: string;          // 跨服务追踪 ID
  spanId?: string;           // 当前操作 ID
  projectId?: string;        // 项目 ID
  userId?: string;           // 用户 ID
  [key: string]: unknown;    // 自定义字段
}

// 错误日志结构
interface ErrorLogPayload {
  code: string;              // 错误码：MODULE_ERROR_TYPE
  message: string;           // 用户友好消息
  stack?: string;            // 堆栈信息
  context?: { [key: string]: unknown };  // 上下文数据
  cause?: Error;             // 原始错误
}
```

### 二、配置解析

**环境变量支持**：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LOG_LEVEL` | info/debug（按环境） | 全局日志级别 |
| `LOG_FILE_ENABLED` | true（生产）| 是否启用文件日志 |
| `LOG_FILE_DIR` | logs/ | 日志目录 |
| `LOG_FILE_PREFIX` | app | 文件名前缀 |
| `LOG_FILE_MAX_SIZE_MB` | 20 | 单文件最大 MB |
| `LOG_FILE_MAX_AGE_DAYS` | 7 | 保留天数 |
| `LOG_FILE_COMPRESS` | true | 是否压缩旧文件 |

**环境自适应**：

| 环境 | 控制台 | 文件格式 |
|------|--------|---------|
| development | pretty | pretty |
| production | 关闭 | json |

### 三、传输层设计

**文件输出策略**：

```
logs/
├── app-info-2026-04-20.log      # 全部日志（trace~fatal）
├── app-error-2026-04-20.log     # 仅 warn/error/fatal
├── app-info-2026-04-19.log.gz   # 昨天日志（已压缩）
└── app-error-2026-04-19.log.gz
```

**Pino 多传输配置**：

```typescript
function createTransports(config: LoggerConfig) {
  const transports = [];

  // 1. 控制台传输（开发环境启用）
  if (config.console) {
    transports.push({
      level: config.level,
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    });
  }

  // 2. Info 文件 - 存储所有级别日志
  if (config.file.enabled) {
    transports.push({
      level: 'trace',
      target: 'pino/file',
      options: {
        destination: `${config.file.dir}${config.file.prefix}-info-${date}.log`,
        mkdir: true,
      },
    });

    // 3. Error 文件 - 只存储 warn/error/fatal
    transports.push({
      level: 'warn',
      target: 'pino/file',
      options: {
        destination: `${config.file.dir}${config.file.prefix}-error-${date}.log`,
        mkdir: true,
      },
    });
  }

  return pino.transport({ targets: transports });
}
```

### 四、文件轮转管理

**轮转策略**：

| 触发条件 | 动作 |
|---------|------|
| 文件 > 20MB | 立即轮转，重命名加时间戳 |
| 文件 > 7 天 | 自动删除 |
| 轮转后 | 可选 gzip 压缩 |

### 五、核心日志器类

```typescript
class AppLogger {
  private readonly pino: pino.Logger;
  private readonly module: string;
  private readonly rotationManager: LogRotationManager;

  constructor(config: LoggerConfig);
  info(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  debug(obj: object | string, msg?: string): void;
  trace(obj: object | string, msg?: string): void;
  fatal(obj: object | string, msg?: string): void;
  child(context: LogContext): AppLogger;
}
```

**关键特性**：
1. 脱敏自动应用：所有日志经过 `redactObject`
2. 子日志器：`child()` 方法附加上下文，用于请求链路追踪
3. 错误标准化：支持结构化错误日志

### 六、模块日志器工厂

```typescript
// 初始化全局日志配置
export function initLoggerSystem(config?: Partial<LoggerConfig>): void;

// 获取模块日志器
export function getLogger(module: string): AppLogger;

// 预定义模块日志器
export const loggers = {
  app: () => getLogger('app'),
  video: () => getLogger('video-generation'),
  llm: () => getLogger('llm-transport'),
  provider: () => getLogger('provider'),
  hotTrend: () => getLogger('hot-trend'),
  db: () => getLogger('database'),
  auth: () => getLogger('auth'),
};
```

### 七、TraceId 链路追踪

**生成与传递**：

```typescript
// 1. HTTP 入口 - Fastify 中间件
app.addHook('onRequest', async (request, reply) => {
  request.traceId = request.headers['x-trace-id'] ?? crypto.randomUUID();
  request.requestId = crypto.randomUUID();

  request.log = request.log.child({
    traceId: request.traceId,
    requestId: request.requestId,
  });

  reply.header('x-trace-id', request.traceId);
});

// 2. 模块间调用 - 子日志器传递
const logger = getLogger('video').child({
  traceId: ctx.traceId,
  requestId: ctx.requestId,
});
```

### 八、与 Fastify 集成

```typescript
// src/app-setup/setup-logger.ts
export function setupLoggerSystem(): {
  fastifyLogger: pino.Logger;
  appLogger: AppLogger;
};

// 在 setup-core.ts 中使用
const { fastifyLogger, appLogger } = setupLoggerSystem();
const app = Fastify({ logger: fastifyLogger });
```

### 九、错误日志标准化

**错误码命名规范**：`MODULE_ERROR_TYPE`

```typescript
const ErrorCodes = {
  // 视频模块
  VIDEO_ENCODE_FAILED: 'VIDEO_ENCODE_FAILED',
  VIDEO_TIMEOUT: 'VIDEO_TIMEOUT',

  // LLM 模块
  LLM_REQUEST_FAILED: 'LLM_REQUEST_FAILED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',

  // 数据库模块
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
} as const;
```

**使用示例**：

```typescript
// 旧方式
logger.error('Video encoding failed');

// 新方式
logger.error({
  code: 'VIDEO_ENCODE_FAILED',
  message: '视频编码失败',
  context: {
    projectId: 'xxx',
    videoId: 'yyy',
  },
  cause: originalError,
}, 'Video encoding failed');
```

## 迁移策略

### 现有系统迁移

| 现有内容 | 迁移策略 |
|---------|---------|
| `src/core/logger.ts` | 替换 - 新系统覆盖 |
| Fastify logger 配置 | 替换 - `setup-core.ts` 改用 `setupLoggerSystem()` |
| `videoGenerationLogger` 等预定义导出 | 兼容 - 新系统提供同名导出 |
| `createConsoleCompatibleLogger` | 兼容 - 提供适配器函数 |

### 兼容性保证

```typescript
// 新系统 index.ts 中提供兼容导出
export const videoGenerationLogger = getLogger('video-generation');
export const llmTransportLogger = getLogger('llm-transport');
export const providerLogger = getLogger('provider');
export const videoJobLogger = getLogger('video-job');
export const hotTrendLogger = getLogger('hot-trend');

export function createConsoleCompatibleLogger(module: string) {
  return adaptToConsoleInterface(getLogger(module));
}
```

### PM2 日志配置调整

**移除 `pm2-logrotate`**，生产环境禁用控制台输出：

```typescript
// 生产环境配置
{
  console: false,  // 关闭控制台输出 → PM2 无内容可捕获
  file: { enabled: true }
}
```

**修改 `.deploy/restart.sh`**：移除 `pm2 install pm2-logrotate` 相关代码。

## 日志格式示例

**开发环境（pretty 格式）**：

```
10:30:01 INFO  [video-generation] Encoding started {"videoId":"xxx","traceId":"abc-123"}
10:30:02 ERROR [llm-transport] Request failed {"code":"LLM_TIMEOUT","message":"LLM请求超时"}
```

**生产环境（JSON 格式）**：

```json
{"level":"info","time":"2026-04-20T10:30:01Z","module":"video-generation","msg":"Encoding started","videoId":"xxx","traceId":"abc-123"}
{"level":"error","time":"2026-04-20T10:30:02Z","module":"llm-transport","msg":"Request failed","code":"LLM_TIMEOUT","message":"LLM请求超时"}
```

## 资源消耗优化

| 对比项 | PM2 日志 | 新日志系统 |
|--------|---------|-----------|
| 捕获范围 | stdout/stderr（非结构化） | 应用内部结构化日志 |
| 文件位置 | `logs/server.log` | `logs/app-info-*.log`, `logs/app-error-*.log` |
| 分级存储 | ❌ 单文件 | ✅ info/error 分离 |
| TraceId | ❌ 无 | ✅ 支持 |
| 脱敏 | ❌ 无 | ✅ 自动脱敏 |
| 轮转 | PM2 管理 | 应用内管理 |
| 资源消耗 | 双份日志 | 单份日志 |

**最终方案**：禁用控制台输出 + 新日志系统，资源消耗最优。

## 验收标准

1. 日志文件按预期创建（info/error 分离）
2. 文件轮转正常（超过 20MB 或 7 天自动清理）
3. traceId/requestId 正确传递
4. 敏感信息自动脱敏
5. 现有代码无需修改即可运行
6. PM2 日志轮转已移除
