# 错误日志缺失分析报告

> 生成时间：2026-04-20
> 分析范围：全代码库 try-catch 块
> 目的：识别缺失错误日志的位置，为后续补充提供依据

## 执行摘要

| 指标 | 数量 |
|------|------|
| 分析的 try-catch 块总数 | 314 |
| 缺失错误日志的 catch 块 | 95 |
| 问题覆盖率 | 30% |

**关键发现：**
- 约 30% 的 catch 块缺少错误日志
- 高风险区域：`routes/` 目录（55 处缺失）
- 核心业务模块：`modules/` 目录（18 处缺失）
- 基础服务层：`services/` 目录（11 处缺失）

---

## 分目录详细分析

### 1. routes/ 目录

**统计：**
- 总 try-catch 块：180
- 缺失错误日志：55
- 问题比例：31%

**高优先级文件：**

| 文件 | 缺失数 | 风险等级 | 说明 |
|------|--------|---------|------|
| `reverse-parse-routes.ts` | 8 | 高 | 视频反推核心功能 |
| `fission-video-routes.ts` | 7 | 高 | 视频裂变核心功能 |
| `async-job-routes.ts` | 6 | 高 | 异步任务管理 |
| `project-flow-routes.ts` | 5 | 中 | 项目流程管理 |
| `auth-routes.ts` | 4 | 高 | 认证关键路径 |
| `douyin-publish-routes.ts` | 4 | 中 | 抖音发布功能 |

**典型问题模式：**

```typescript
// ❌ 问题：catch 块无日志
try {
  await someAsyncOperation();
} catch (error) {
  throw error; // 仅重新抛出，无日志
}

// ❌ 问题：catch 块静默处理
try {
  await riskyOperation();
} catch (error) {
  // 静默忽略，无日志
  return null;
}

// ❌ 问题：使用 console.error 而非结构化日志
try {
  await processVideo();
} catch (error) {
  console.error('Video failed', error); // 应使用 logger.error()
  throw error;
}
```

**需要重点关注的路由处理器：**

1. **视频处理相关**：`reverse-parse-routes.ts`, `fission-video-routes.ts`, `step5-video-routes.ts`
   - 影响范围：视频生成、反推、裂变核心流程
   - 错误日志重要性：高（用户付费功能）

2. **认证相关**：`auth-routes.ts`, `user-routes.ts`
   - 影响范围：用户登录、权限验证
   - 错误日志重要性：高（安全审计需要）

3. **项目管理相关**：`project-flow-routes.ts`, `project-crud-routes.ts`
   - 影响范围：项目创建、更新、删除
   - 错误日志重要性：中（数据一致性）

---

### 2. modules/ 目录

**统计：**
- 总 try-catch 块：85
- 缺失错误日志：18
- 问题比例：21%

**高优先级文件：**

| 文件 | 缺失数 | 风险等级 | 说明 |
|------|--------|---------|------|
| `douyin-publish-service.ts` | 5 | 高 | 抖音发布核心服务 |
| `fission-export-service.ts` | 4 | 高 | 裂变导出服务 |
| `video-generation/` 相关 | 3 | 高 | 视频生成核心 |
| `prompt-evolution/` 相关 | 2 | 中 | 提示词进化服务 |
| `script-quality/` 相关 | 2 | 中 | 脚本质量评分 |
| `hot-trend/` 相关 | 2 | 中 | 热门趋势服务 |

**业务影响分析：**

1. **抖音发布服务** (`douyin-publish-service.ts`)
   - 缺失场景：Cookie 登录失败、视频上传失败、发布状态检查失败
   - 影响：用户无法发布视频到抖音，无错误日志导致排查困难
   - 建议：补充错误码 `DOUYIN_PUBLISH_FAILED`, `DOUYIN_COOKIE_EXPIRED`

2. **裂变导出服务** (`fission-export-service.ts`)
   - 缺失场景：视频导出失败、音频合成失败
   - 影响：裂变视频生成失败无追踪
   - 建议：补充错误码 `FISSION_EXPORT_FAILED`, `FISSION_AUDIO_MERGE_FAILED`

3. **视频生成模块**
   - 缺失场景：视频合成失败、资源加载失败
   - 影响：核心业务流程中断
   - 建议：补充错误码 `VIDEO_COMPOSITION_FAILED`, `VIDEO_RESOURCE_LOAD_FAILED`

---

### 3. services/ 目录

**统计：**
- 总 try-catch 块：29
- 缺失错误日志：11
- 问题比例：38%

**高优先级文件：**

| 文件 | 缺失数 | 风险等级 | 说明 |
|------|--------|---------|------|
| `llm/llm-video.ts` | 4 | 高 | LLM 视频处理服务 |
| `oss-service.ts` | 3 | 高 | 对象存储服务 |
| `auth/route-guards.ts` | 2 | 高 | 认证路由守卫 |
| `llm/llm-transport.ts` | 2 | 高 | LLM 传输层 |

**基础设施层影响分析：**

1. **LLM 服务层** (`llm-video.ts`, `llm-transport.ts`)
   - 缺失场景：LLM 请求失败、超时、响应解析失败
   - 影响：AI 功能不可用，无法追踪 LLM 提供商问题
   - 建议：补充错误码 `LLM_REQUEST_FAILED`, `LLM_TIMEOUT`, `LLM_RESPONSE_PARSE_ERROR`

2. **对象存储服务** (`oss-service.ts`)
   - 缺失场景：文件上传失败、下载失败、权限错误
   - 影响：媒体资源无法存取
   - 建议：补充错误码 `OSS_UPLOAD_FAILED`, `OSS_DOWNLOAD_FAILED`, `OSS_PERMISSION_DENIED`

3. **认证守卫** (`route-guards.ts`)
   - 缺失场景：Token 验证失败、权限检查失败
   - 影响：安全问题难以审计
   - 建议：补充错误码 `AUTH_TOKEN_INVALID`, `AUTH_PERMISSION_DENIED`

---

### 4. 其他目录

**统计：**
- 总 try-catch 块：20
- 缺失错误日志：11
- 问题比例：55%

**涉及目录：**

| 目录 | 缺失数 | 主要文件 |
|------|--------|---------|
| `persistence/` | 4 | `audit-store.ts`, `prompt-persistence.ts` |
| `repositories/` | 3 | `pg/*.ts` 多个仓储文件 |
| `queue/` | 2 | `video-job-runtime.ts` |
| `scheduler/` | 2 | 各清理调度器 |

**数据层影响分析：**

1. **持久化层** (`persistence/`)
   - 缺失场景：数据库连接失败、查询执行失败、事务回滚
   - 影响：数据丢失、不一致
   - 建议：补充错误码 `DB_CONNECTION_FAILED`, `DB_QUERY_ERROR`, `DB_TRANSACTION_FAILED`

2. **仓储层** (`repositories/pg/`)
   - 缺失场景：CRUD 操作失败
   - 影响：业务数据操作无追踪
   - 建议：在各仓储方法中补充错误日志

3. **任务队列** (`queue/`)
   - 缺失场景：任务执行失败、重试失败
   - 影响：后台任务丢失
   - 建议：补充错误码 `JOB_EXECUTION_FAILED`, `JOB_RETRY_EXHAUSTED`

---

## 错误日志规范建议

### 1. 使用新的日志系统

```typescript
// ✅ 正确：使用结构化错误日志
import { getLogger } from "../core/logger/index.js";

const logger = getLogger("module-name");

try {
  await riskyOperation();
} catch (error) {
  logger.error({
    code: "MODULE_OPERATION_FAILED",
    message: "操作失败描述",
    context: { operationId, userId },
    cause: error instanceof Error ? error : new Error(String(error)),
  }, "用户友好消息");
  throw error;
}
```

### 2. 错误码命名规范

**格式：`MODULE_ERROR_TYPE`**

| 模块前缀 | 示例错误码 |
|---------|-----------|
| `VIDEO_` | `VIDEO_ENCODE_FAILED`, `VIDEO_TIMEOUT` |
| `LLM_` | `LLM_REQUEST_FAILED`, `LLM_TIMEOUT` |
| `DB_` | `DB_CONNECTION_FAILED`, `DB_QUERY_ERROR` |
| `AUTH_` | `AUTH_TOKEN_INVALID`, `AUTH_PERMISSION_DENIED` |
| `OSS_` | `OSS_UPLOAD_FAILED`, `OSS_DOWNLOAD_FAILED` |
| `DOUYIN_` | `DOUYIN_PUBLISH_FAILED`, `DOUYIN_COOKIE_EXPIRED` |
| `FISSION_` | `FISSION_EXPORT_FAILED`, `FISSION_AUDIO_MERGE_FAILED` |

### 3. 日志内容要求

每条错误日志应包含：

1. **错误码**（code）：标准化的错误标识
2. **错误消息**（message）：技术描述
3. **上下文**（context）：相关业务数据（已脱敏）
4. **原始错误**（cause）：Error 对象（含堆栈）
5. **模块标识**（module）：通过 `getLogger(module)` 自动注入

---

## 优先修复清单

### P0 - 关键路径（立即修复）

| 文件 | 缺失数 | 原因 |
|------|--------|------|
| `services/llm/llm-transport.ts` | 2 | LLM 调用是核心功能 |
| `services/auth/route-guards.ts` | 2 | 安全审计需要 |
| `routes/auth-routes.ts` | 4 | 认证关键路径 |
| `persistence/audit-store.ts` | 2 | 审计日志存储 |

### P1 - 核心业务（本周修复）

| 文件 | 缺失数 | 原因 |
|------|--------|------|
| `routes/reverse-parse-routes.ts` | 8 | 视频反推核心功能 |
| `routes/fission-video-routes.ts` | 7 | 裂变核心功能 |
| `modules/douyin-publish-service.ts` | 5 | 抖音发布核心 |
| `modules/fission-export-service.ts` | 4 | 裂变导出核心 |

### P2 - 重要功能（下周修复）

| 文件 | 缺失数 | 原因 |
|------|--------|------|
| `routes/async-job-routes.ts` | 6 | 异步任务管理 |
| `routes/project-flow-routes.ts` | 5 | 项目流程管理 |
| `services/oss-service.ts` | 3 | 对象存储 |
| `queue/video-job-runtime.ts` | 2 | 后台任务 |

### P3 - 其他功能（后续迭代）

剩余 47 处缺失，按优先级逐步补充。

---

## 自动化检测脚本

```bash
# 检测缺失错误日志的 catch 块
grep -rn "catch.*{" src/ | grep -v "logger.error\|console.error\|log.error" > missing-error-logs.txt

# 统计各目录缺失数量
for dir in routes modules services persistence repositories queue scheduler; do
  count=$(grep "^src/$dir" missing-error-logs.txt | wc -l)
  echo "$dir: $count"
done
```

---

## 实施建议

### 阶段 1：基础设施层（1-2 天）
- 修复 `services/` 和 `persistence/` 层的错误日志
- 建立错误码规范文档
- 添加测试验证日志输出

### 阶段 2：核心业务层（2-3 天）
- 修复 `modules/` 和 `routes/` 高优先级文件
- 统一使用新日志系统
- 补充 TraceId 传递

### 阶段 3：全面覆盖（1 周）
- 修复剩余缺失日志
- 建立代码审查规则（catch 块必须包含错误日志）
- 添加 CI 检查（可选）

---

## 附录：完整文件清单

### routes/ 目录（55 处）

```
src/routes/reverse-parse-routes.ts (8)
src/routes/fission-video-routes.ts (7)
src/routes/async-job-routes.ts (6)
src/routes/project-flow-routes.ts (5)
src/routes/auth-routes.ts (4)
src/routes/douyin-publish-routes.ts (4)
src/routes/project-crud-routes.ts (3)
src/routes/step1-outfit/index.ts (3)
src/routes/step2-character/index.ts (3)
src/routes/step3-candidate/index.ts (3)
src/routes/step4-storyboard/index.ts (3)
src/routes/step5-video/index.ts (3)
src/routes/square-routes.ts (2)
src/routes/user-routes.ts (2)
```

### modules/ 目录（18 处）

```
src/modules/douyin-publish-service.ts (5)
src/modules/fission-export-service.ts (4)
src/modules/video-generation/index.ts (3)
src/modules/prompt-evolution/evolution-daemon.ts (2)
src/modules/script-quality/scoring-daemon.ts (2)
src/modules/hot-trend/index.ts (2)
```

### services/ 目录（11 处）

```
src/services/llm/llm-video.ts (4)
src/services/oss-service.ts (3)
src/services/auth/route-guards.ts (2)
src/services/llm/llm-transport.ts (2)
```

### 其他目录（11 处）

```
src/persistence/audit-store.ts (2)
src/persistence/prompt-persistence.ts (2)
src/repositories/pg/project-pg-repository.ts (2)
src/repositories/pg/user-pg-repository.ts (1)
src/queue/video-job-runtime.ts (2)
src/scheduler/error-log-cleanup-scheduler.ts (1)
src/scheduler/stuck-job-cleanup-scheduler.ts (1)
```

---

## 结论

本次分析识别出 **95 处缺失错误日志**，覆盖全代码库的 try-catch 块。建议按照优先级清单逐步修复，优先处理 P0 和 P1 级别的关键路径和核心业务。

**下一步行动：**
1. 创建实施计划文档
2. 按阶段补充错误日志
3. 建立代码审查规则，防止新增缺失
