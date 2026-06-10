# 任务队列系统架构设计

> **重要**: 每次涉及任务相关的调整和修改时，请先阅读此文档，严格按照规范执行。

## 目录

1. [系统概述](#系统概述)
2. [核心组件](#核心组件)
3. [数据模型](#数据模型)
4. [任务生命周期](#任务生命周期)
5. [并发控制](#并发控制)
6. [依赖与父子关系](#依赖与父子关系)
7. [SSE 实时通知](#sse-实时通知)
8. [任务清理机制](#任务清理机制)
9. [任务类型清单](#任务类型清单)
10. [开发规范](#开发规范)
11. [执行器设计规范](#执行器设计规范)
12. [常见问题与解决方案](#常见问题与解决方案)

---

## 系统概述

### 架构目标

本项目采用**统一任务队列**架构，所有异步任务通过 `nrm_async_jobs` 表管理，实现：

- **并发控制**: 全局 + 用户级双层槽位限制，防止资源过载
- **依赖管理**: 支持 `dependsOn` DAG 依赖，失败自动传播
- **实时通知**: SSE 推送任务状态变更，前端无需轮询
- **自动清理**: 超时、卡住、孤儿任务的自动恢复机制

### 核心原则

| 原则 | 说明 |
|------|------|
| **统一入口** | 所有任务创建必须通过 `createAsyncJob()`，禁止直接插入数据库 |
| **dispatcher 必传** | `finalizeAsyncJob()` 必须传递 `dispatcher` 参数，否则 pending 任务无法自动提升 |
| **注册执行器** | 所有 dispatcher-driven 任务必须在 `setup-executors.ts` 注册执行器 |
| **状态机严格** | 任务状态只允许 `pending → running → completed/failed` 路径 |

---

## 核心组件

### 文件结构

```
src/
├── service/
│   └── async-job-service.ts       # 核心：任务 CRUD、完成、父子关系解析
├── modules/
│   ├── queue-dispatcher.ts        # 调度器：pending → running 提升、失败传播
│   ├── global-task-concurrency-service.ts  # 并发控制：槽位管理、排队超时
│   ├── sse-manager.ts             # SSE：实时通知推送
│   └── business-config-service.ts # 配置：并发限制、超时参数
├── core/
│   └── executor-registry.ts       # 执行器注册表
├── app-setup/
│   └── setup-executors.ts         # 执行器注册入口（启动时调用）
└── scheduler/
    ├── stuck-job-cleanup-scheduler.ts      # 运行任务超时清理（60分钟）
    └── pending-job-timeout-scheduler.ts    # 排队任务超时清理
```

### 关键函数签名

#### async-job-service.ts

```typescript
// 任务创建（必须使用）
async function createAsyncJob(
  pool: Pool,
  params: {
    id: string;
    userId: string;
    jobType: string;
    projectId: string;
    input: string;
    now: number;
    parentJobId?: string;      // 父任务 ID（可选）
    dependsOn?: string[];      // 依赖任务 ID 列表（可选）
    initialStatus?: "pending" | "running";  // 推荐使用 "pending"
  },
  concurrencyService?: GlobalTaskConcurrencyService,  // 推荐传递
): Promise<{ jobId: string; running: boolean; queuePosition: number } | { error: string; errorCode: string }>

// 任务完成（dispatcher 必传！）
async function finalizeAsyncJob(
  pool: Pool,
  jobId: string,
  status: "completed" | "failed",
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
  now: number,
  dispatcher?: QueueDispatcher,  // ⚠️ 必须传递，否则 pending 任务不会自动提升
): Promise<void>

// 子任务完成时检查父任务
async function checkAndFinalizeParent(
  pool: Pool,
  parentJobId: string,
  dispatcher: QueueDispatcher,  // 必传
  now: number,
): Promise<void>

// 更新任务进度
async function updateAsyncJobResult(
  pool: Pool,
  jobId: string,
  partialResult: Record<string, unknown>,
  now: number,
): Promise<void>

// 更新任务阶段（进度提示）
async function updateAsyncJobStage(
  pool: Pool,
  jobId: string,
  stage: string | null,  // 如 "生成中"、"上传中"
  now: number,
  result?: Record<string, unknown>,
): Promise<void>
```

#### queue-dispatcher.ts

```typescript
class QueueDispatcher {
  // 提升 pending 任务为 running（由 finalizeAsyncJob 或定时 tick 触发）
  async tryPromote(): Promise<void>

  // 启动调度循环（10秒间隔）
  start(): void

  // 停止调度循环
  stop(): void
}
```

#### global-task-concurrency-service.ts

```typescript
class GlobalTaskConcurrencyService {
  // 原子并发检查（使用 PostgreSQL advisory lock）
  async createJobWithConcurrencyCheck(
    pool: Pool,
    jobParams: CreateJobParams,
    config: GlobalTaskConfig,
    now: number,
  ): Promise<ConcurrencyResult>

  // 排队超时清理
  async timeoutPendingJobs(pool: Pool, timeoutMinutes: number, now: number): Promise<void>
}
```

---

## 数据模型

### nrm_async_jobs 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 任务唯一 ID |
| `user_id` | uuid | 所属用户 |
| `project_id` | uuid | 所属项目 |
| `job_type` | text | 任务类型（见[任务类型清单](#任务类型清单)） |
| `status` | text | 状态：`pending` / `running` / `completed` / `failed` |
| `stage` | text | 当前阶段（进度提示，如 "生成中"） |
| `input` | jsonb | 输入参数 |
| `result` | jsonb | 输出结果 |
| `error` | jsonb | 错误信息 `{ code, message }` |
| `parent_job_id` | uuid | 父任务 ID（可选） |
| `depends_on` | jsonb | 依赖任务 ID 列表（可选） |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 最后更新时间 |

### 状态机

```
         ┌──────────────┐
         │   pending    │ ← 创建时初始状态（推荐）
         └───────┬──────┘
                 │ tryPromote() 提升
                 ↓
         ┌──────────────┐
         │   running    │ ← 执行器处理
         └──────┬───────┘
                │
       ┌───────┴───────┐
       ↓               ↓
┌───────────┐   ┌───────────┐
│ completed │   │   failed  │
└───────────┘   └───────────┘
```

**状态转换规则**:
- `pending → running`: 仅由 `QueueDispatcher.tryPromote()` 触发
- `running → completed/failed`: 由 `finalizeAsyncJob()` 触发
- **禁止手动修改状态**，必须通过上述函数

---

## 任务生命周期

### 完整流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           任务生命周期                                    │
└─────────────────────────────────────────────────────────────────────────┘

[1. 创建]
    Route Handler
         │
         ↓ createAsyncJob(pool, params, concurrencyService)
    ┌─────────────────────────────────────────────────┐
    │ GlobalTaskConcurrencyService                    │
    │   ┌─ Advisory Lock (ID: 12345)                  │
    │   ├─ 检查全局槽位 (maxGlobalConcurrent=10)      │
    │   ├─ 检查用户槽位 (maxPerUserConcurrent=3)      │
    │   └─ 有槽位? → status='running'                 │
    │      无槽位? → status='pending' + queuePosition │
    └─────────────────────────────────────────────────┘
         │
         ↓ SSE: type="job_created"
    ┌─────────────────┐
    │ nrm_async_jobs  │
    └─────────────────┘

[2. 排队等待] (如果 status='pending')
    ┌─────────────────┐
    │ pending 任务    │ ← 等待槽位或依赖完成
    └─────────────────┘
         │
         │ 触发时机:
         │   ① 定时 tick (10秒)
         │   ② 其他任务 finalizeAsyncJob() 后调用 tryPromote()
         ↓

[3. 提升] QueueDispatcher.tryPromote()
    ┌─────────────────────────────────────────────────┐
    │ Phase 1.5: 失败传播                             │
    │   └─ depends_on 包含 failed ID → 标记为 failed  │
    │                                                  │
    │ Phase 2: 提升选择                               │
    │   ├─ Advisory Lock (12345)                      │
    │   ├─ 统计全局 running 数量                      │
    │   ├─ 计算可用槽位                               │
    │   ├─ 查询 pending 任务（依赖已满足）            │
    │   ├─ FIFO 排序 + 用户槽位检查                   │
    │   └─ 批量更新: pending → running               │
    └─────────────────────────────────────────────────┘
         │
         ↓ SSE: type="job_updated" (每个提升的任务)
         │
         ↓ 调用注册的执行器

[4. 执行] Executor(jobId)
    ┌─────────────────────────────────────────────────┐
    │ 执行器函数 (params: { pool, jobId, ctx, dispatcher })│
    │   ├─ getAsyncJob() 验证 status='running'        │
    │   ├─ 执行业务逻辑 (LLM调用、图片生成等)          │
    │   ├─ updateAsyncJobStage() 更新进度             │
    │   ├─ updateAsyncJobResult() 保存中间结果        │
    │   ├─ 可能创建子任务 (parentJobId + dependsOn)   │
    │   └─ finalizeAsyncJob(..., dispatcher) 完成     │
    │        或 checkAndFinalizeParent() 子任务完成   │
    └─────────────────────────────────────────────────┘
         │
         ↓ finalizeAsyncJob() 内部调用 dispatcher.tryPromote()

[5. 完成] finalizeAsyncJob()
    ┌─────────────────────────────────────────────────┐
    │   ├─ 更新 status='completed'|'failed'           │
    │   ├─ 清除 stage                                 │
    │   ├─ 设置 result 或 error                       │
    │   ├─ SSE: type="job_completed"|"job_failed"     │
    │   └─ dispatcher.tryPromote() ← 触发下一任务提升 │
    └─────────────────────────────────────────────────┘

[6. 父任务结算] checkAndFinalizeParent()
    ┌─────────────────────────────────────────────────┐
    │   ├─ 查询所有子任务                             │
    │   ├─ 失败传播: depends_on 失败 → 标记 pending   │
    │   ├─ 所有子任务已结束?                          │
    │   │     ├─ Yes → 聚合结果，finalizeAsyncJob(parent)│
    │   │     └─ No  → 等待其他子任务                 │
    └─────────────────────────────────────────────────┘
```

### 触发时机总结

| 操作 | 触发时机 |
|------|----------|
| 任务创建 | 用户操作触发（点击按钮、API调用） |
| Pending 提升 | ① 定时 tick（10秒）<br>② 其他任务 `finalizeAsyncJob()` 后调用 `tryPromote()` |
| 执行器调用 | `tryPromote()` 提升后立即异步调用 |
| 父任务结算 | 子任务 `finalizeAsyncJob()` 后调用 `checkAndFinalizeParent()` |

---

## 并发控制

### 槽位配置

配置来源: `businessConfigService.get("global_task")`

```typescript
interface GlobalTaskConfig {
  maxGlobalConcurrent: number;    // 全局最大并发数，默认 10
  maxPerUserConcurrent: number;   // 单用户最大并发数，默认 3
  queueTimeoutMinutes: number;    // 排队超时时间，默认 60 分钟
}
```

### 并发检查流程

```
createAsyncJob(params, concurrencyService)
    │
    ↓ GlobalTaskConcurrencyService.createJobWithConcurrencyCheck()
    │
    ┌─ Advisory Lock (pg_advisory_xact_lock(12345))
    │  └─ 在事务内持有，commit/rollback 时自动释放
    │
    ├─ 查询全局 running 任务数量
    │   └─ SELECT COUNT(*) FROM nrm_async_jobs
    │      WHERE status = 'running'
    │
    ├─ 检查全局槽位
    │   └─ globalRunning < maxGlobalConcurrent ?
    │      ├─ Yes → 继续
    │      └─ No → 检查队列是否有空间
    │
    ├─ 查询用户 running 任务数量
    │   └─ SELECT COUNT(*) FROM nrm_async_jobs
    │      WHERE status = 'running' AND user_id = ?
    │
    ├─ 检查用户槽位
    │   └─ userRunning < maxPerUserConcurrent ?
    │      ├─ Yes → 继续
    │      └─ No → 检查队列是否有空间
    │
    ├─ 结果判定
    │   ├─ 有槽位 → INSERT status='running', return { jobId, running: true }
    │   ├─ 无槽位但队列未满 → INSERT status='pending', return { jobId, running: false, queuePosition }
    │   └─ 队列已满 → return { error, errorCode: "GLOBAL_QUEUE_FULL"|"USER_QUEUE_FULL" }
    │
    ↓ Advisory Lock 释放（事务结束）
```

### Advisory Lock 说明

- **Lock ID**: `12345`（全局固定）
- **类型**: `pg_advisory_xact_lock()` — 事务级锁
- **作用**: 防止并发创建时的竞态条件
- **释放**: 事务 commit/rollback 时自动释放

---

## 依赖与父子关系

### dependsOn 机制

用于表达任务间的依赖关系（DAG）：

```typescript
// 创建依赖任务
await createAsyncJob(pool, {
  id: videoJobId,
  jobType: "step6_fission_item_video",
  dependsOn: [imageJobId],  // 必须等待 imageJobId 完成
  ...
});

// 提升检查（tryPromote 内部）
// 只提升所有依赖都已 completed 的任务
SELECT * FROM nrm_async_jobs
WHERE status = 'pending'
AND NOT EXISTS (
  SELECT 1 FROM unnest(depends_on) AS dep_id
  WHERE (
    SELECT status FROM nrm_async_jobs WHERE id = dep_id
  ) != 'completed'
);
```

### 失败传播

当依赖的任务失败时，自动传播到依赖方：

```
tryPromote() Phase 1.5:
    │
    ├─ 查询 failed 任务 ID 列表
    │
    ├─ 查询 pending 任务 whose depends_on 包含 failed ID
    │
    ├─ 批量更新: pending → failed
    │   └─ error: { code: "DEPENDENCY_FAILED", message: "依赖任务失败" }
    │
    ├─ 如果有父任务:
    │   ├─ 取消所有兄弟任务
    │   └─ 标记父任务为 failed
    │
    ↓ SSE: type="job_failed" (所有被传播的任务)
```

### parentJobId 机制

用于表达父子任务关系（聚合场景）：

```typescript
// 创建父任务
const parentJob = await createAsyncJob(pool, {
  id: parentId,
  jobType: "step6_fission",
  ...
});

// 创建子任务（引用父任务）
await createAsyncJob(pool, {
  id: childId,
  jobType: "step6_fission_item_image",
  parentJobId: parentId,  // 父任务 ID
  ...
});

// 子任务完成时结算父任务
await checkAndFinalizeParent(pool, parentId, dispatcher, now);
```

### checkAndFinalizeParent 流程

```
checkAndFinalizeParent(parentJobId)
    │
    ├─ 查询父任务所有子任务
    │   └─ SELECT * FROM nrm_async_jobs WHERE parent_job_id = ?
    │
    ├─ 统计子任务状态
    │   ├─ pendingCount
    │   ├─ runningCount
    │   ├─ completedCount
    │   └─ failedCount
    │
    ├─ 如果有 pending 子任务 whose depends_on 包含 failed ID
    │   └─ 标记为 failed（失败传播）
    │
    ├─ 所有子任务已结束?
    │   ├─ Yes →
    │   │     ├─ 聚合结果
    │   │     ├─ finalizeAsyncJob(parent, status, result)
    │   │     └─ SSE: type="job_completed"|"job_failed" (父任务)
    │   │
    │   └─ No →
    │         └─ 等待其他子任务完成
    │
    ↓ 返回
```

---

## SSE 实时通知

### SSEManager 单例

```typescript
// 连接管理
sseManager.addConnection(userId, response);
sseManager.removeConnection(userId, response);

// 信号推送
sseManager.pushSignal(userId, {
  type: "job_created" | "job_updated" | "job_completed" | "job_failed" | "job_deleted",
  jobId: string,
  jobType: string,
  status?: string,
  error?: { code: string; message: string },
  timestamp: number,
});
```

### 信号类型与触发点

| 信号类型 | 触发点 | 位置 |
|----------|--------|------|
| `job_created` | `createAsyncJob()` | async-job-service.ts |
| `job_updated` | `updateAsyncJobStage()` | async-job-service.ts |
| `job_updated` | `tryPromote()` 提升 pending → running | queue-dispatcher.ts |
| `job_completed` | `finalizeAsyncJob(status='completed')` | async-job-service.ts |
| `job_failed` | `finalizeAsyncJob(status='failed')` | async-job-service.ts |
| `job_failed` | `tryPromote()` 失败传播 | queue-dispatcher.ts |
| `job_failed` | `StuckJobCleanupScheduler` 超时清理 | stuck-job-cleanup-scheduler.ts |
| `job_failed` | `GlobalTaskConcurrencyService.timeoutPendingJobs()` 排队超时 | global-task-concurrency-service.ts |
| `job_failed` | `cancelActiveJobsByTypePrefix()` 批量取消 | async-job-service.ts |

### 前端接收示例

```typescript
// 前端 SSE 连接
const eventSource = new EventSource('/api/sse/connect');

eventSource.onmessage = (event) => {
  const signal = JSON.parse(event.data);
  switch (signal.type) {
    case 'job_created':
      // 新任务创建，显示 toast 或更新列表
      break;
    case 'job_updated':
      // 任务状态变更，刷新 UI
      break;
    case 'job_completed':
      // 任务完成，显示结果
      break;
    case 'job_failed':
      // 任务失败，显示错误
      break;
  }
};
```

---

## 任务清理机制

### StuckJobCleanupScheduler（运行任务超时）

| 配置 | 默认值 |
|------|--------|
| 检查间隔 | 5 分钟 |
| 超时时间 | 60 分钟 |

**处理逻辑**:
```
每 5 分钟执行:
    │
    ├─ 查询 running 任务 updated_at > 60分钟前
    │   └─ WHERE status = 'running' AND updated_at < NOW() - 60min
    │
    ├─ 批量标记为 failed
    │   └─ error: { code: "STUCK_JOB_TIMEOUT", message: "任务超时（60分钟）" }
    │
    ├─ 清理关联业务表
    │   ├─ step4_video: clip_status = 'failed'
    │   ├─ fission: status = 'partial_complete'
    │   └
    ↓ SSE: type="job_failed"
```

### PendingJobTimeoutScheduler（排队任务超时）

| 配置 | 默认值 |
|------|--------|
| 检查间隔 | 5 分钟 |
| 超时时间 | `global_task.queueTimeoutMinutes`（默认 60 分钟） |

**处理逻辑**:
```
每 5 分钟执行:
    │
    ├─ GlobalTaskConcurrencyService.timeoutPendingJobs()
    │   │
    │   ├─ 查询 pending 任务 created_at > timeoutMinutes前
    │   │
    │   ├─ 批量标记为 failed
    │   │   └─ error: { code: "QUEUE_TIMEOUT", message: "排队超时" }
    │   │
    │   ├─ 级联清理子任务
    │   │   └─ 递归标记 parent_job_id 指向失败任务的 pending 子任务
    │   │
    │   └─ 清理父任务（如果所有子任务已结束）
    │   │
    ↓ SSE: type="job_failed"
```

### recoverOrphanedParentJobs（孤儿父任务恢复）

**启动时执行**:
```
应用启动时:
    │
    ├─ 查询 running 父任务 updated_at > 5秒前
    │   AND 无 active 子任务 (pending/running)
    │
    ├─ 如果所有子任务已结束:
    │   └─ checkAndFinalizeParent()
    │
    ├─ 如果无数据库级子任务:
    │   └─ finalizeAsyncJob(parent, 'failed', error: SERVER_RESTARTED)
    │
    ↓ SSE: type="job_failed"
```

---

## 任务类型清单

### 完整任务类型列表

| 分类 | 任务类型 | 说明 |
|------|----------|------|
| **Step2 (角色定妆)** | `step2_five_view` | 单个五视图生成 |
| | `step2_batch_five_view` | 批量五视图生成 |
| **Step3 (脚本+分镜)** | `step3_shot_prompt` | 镜头提示词生成 |
| | `step3_batch_preview` | 批量分镜预览 |
| | `step3_frame_preview` | 单帧分镜预览 |
| | `step3_scripts_generation` | 脚本生成 |
| | `step3_library` | 库存任务 |
| | `step3_video` | Step3 视频 |
| | `step3_realtime` | 实时任务 |
| | `step3_effectiveness` | 有效性检查 |
| | `step3_custom` | 自定义任务 |
| | `step3_fashion` | 时尚风格 |
| | `step3_emotion_archetype` | 情感原型 |
| | `step3_aesthetic` | 美学分析 |
| | `step3_reverse_rewrite` | 反向重写 |
| **Step4 (视频生成)** | `step4_video` | 视频生成主任务 |
| | `step4_clip_submit` | 视频片段提交（Submit） |
| | `step4_clip_query` | 视频片段查询（Query，系统任务） |
| **Step6 (裂变)** | `step6_fission` | 裂变父任务 |
| | `step6_fission_prep` | 裂变前置准备 |
| | `step6_fission_sgen` | 裂变分镜生成 |
| | `step6_fission_item_image` | 裂变分镜图片 |
| | `step6_fission_item_video` | 裂变分镜视频（旧版） |
| | `step6_fission_item_video_submit` | 裂变分镜视频提交（Submit） |
| | `step6_fission_item_video_query` | 裂变分镜视频查询（Query，系统任务） |
| | `step6_fission_combination` | 裂变组合方案 |
| **换装任务** | `outfit_change` | 换装主任务 |
| | `outfit_change_understand` | 换装理解 |
| | `outfit_change_adapt_frame` | 换装适配帧 |
| | `outfit_change_gen_video` | 换装视频生成（Submit） |
| | `outfit_change_adapt_video_edit` | 换装切片适配 |
| | `outfit_change_gen_video_edit` | 换装视频编辑（Submit） |
| **图片项目** | `image_step3_model_photo` | 模特图生成 |
| | `image_step3_single_photo` | 单张图片生成 |
| | `image_step4_section_plan` | 详情页板块规划 |
| | `image_step4_generate_all` | 详情页全图生成 |
| **其他** | `quality_scoring` | 质量评分 |
| | `llm_reverse` | LLM 反向任务 |

### 系统任务类型（用户不可见）

> 存储在 `nrm_async_jobs` 表，但通过 `SYSTEM_TASK_TYPE_SET`（`taskQueueConfig.ts`）在任务队列面板中隐藏。用于 Submit/Query 分离模式中的 Query 轮询和快速完成的内部任务。

| 任务类型 | 说明 | 关联 Submit 任务 |
|----------|------|------------------|
| `outfit_change_understand` | 换装理解（快速完成，无需展示） | `outfit_change` |
| `outfit_change_gen_video_query` | 换装视频生成查询 | `outfit_change_gen_video` |
| `outfit_change_gen_video_edit_query` | 换装视频编辑查询 | `outfit_change_gen_video_edit` |
| `step4_clip_query` | 视频片段查询 | `step4_clip_submit` |
| `step6_fission_item_video_query` | 裂变分镜视频查询 | `step6_fission_item_video_submit` |

---

## 开发规范

### ⚠️ 强制规范（必须遵守）

#### 1. dispatcher 参数必须传递

**错误示例**:
```typescript
// ❌ 错误：缺少 dispatcher 参数
await finalizeAsyncJob(pool, jobId, "completed", result, null, now);
```

**正确示例**:
```typescript
// ✅ 正确：传递 dispatcher 参数
await finalizeAsyncJob(pool, jobId, "completed", result, null, now, dispatcher);
```

**后果**: 缺少 `dispatcher` 参数会导致：
- pending 任务无法立即提升为 running
- 任务队列阻塞，新任务无法执行
- 用户等待时间过长

#### 2. 所有任务创建必须通过 createAsyncJob

**错误示例**:
```typescript
// ❌ 错误：直接插入数据库
await pool.query(`
  INSERT INTO nrm_async_jobs (id, status, ...)
  VALUES ($1, 'running', ...)
`, [jobId]);
```

**正确示例**:
```typescript
// ✅ 正确：通过 createAsyncJob 创建
const result = await createAsyncJob(pool, {
  id: jobId,
  userId: user.id,
  jobType: "step4_video",
  projectId: project.id,
  input: JSON.stringify(input),
  now,
  initialStatus: "pending",  // 推荐：让 Dispatcher 调度
}, concurrencyService);
```

#### 3. 所有 dispatcher-driven 任务必须注册执行器

**注册位置**: `src/app-setup/setup-executors.ts`

```typescript
// 注册执行器示例
executorRegistry.register("step4_video", async (params) => {
  const { pool, jobId, ctx, dispatcher } = params;
  // ... 执行逻辑
  await finalizeAsyncJob(pool, jobId, "completed", result, null, ctx.clock.now(), dispatcher);
});
```

#### 4. initialStatus 推荐 "pending"

```typescript
// ✅ 推荐：让 Dispatcher 调度
await createAsyncJob(pool, {
  ...
  initialStatus: "pending",  // Dispatcher 会自动提升
}, concurrencyService);

// ⚠️ 特殊情况：立即执行（fire-and-forget）
// 仅用于无需并发控制的简单任务
await createAsyncJob(pool, {
  ...
  initialStatus: "running",
}, undefined);  // 不传 concurrencyService
```

### 推荐实践

#### 1. 子任务完成时检查父任务

```typescript
// 子任务执行器
async function executeChildJob(params: ExecutorParams) {
  const { pool, jobId, ctx, dispatcher } = params;
  const job = await getAsyncJob(pool, jobId, () => ctx.clock.now());
  
  // ... 执行逻辑
  
  // 完成子任务
  await finalizeAsyncJob(pool, jobId, "completed", result, null, ctx.clock.now(), dispatcher);
  
  // ⚠️ 重要：检查父任务是否可以结算
  if (job.parentJobId) {
    await checkAndFinalizeParent(pool, job.parentJobId, dispatcher, ctx.clock.now());
  }
}
```

#### 2. 更新任务进度时使用 updateAsyncJobStage

```typescript
// 更新进度提示
await updateAsyncJobStage(pool, jobId, "生成中", now);
await updateAsyncJobStage(pool, jobId, "上传中", now);

// 完成时清除 stage
await finalizeAsyncJob(pool, jobId, "completed", result, null, now, dispatcher);
// finalizeAsyncJob 内部会自动清除 stage
```

#### 3. 创建依赖任务时使用 dependsOn

```typescript
// 视频任务依赖图片任务
await createAsyncJob(pool, {
  id: videoJobId,
  jobType: "step6_fission_item_video",
  parentJobId: sgenJobId,
  dependsOn: [imageJobId],  // 图片完成后才能提升
  ...
}, concurrencyService);
```

#### 4. 错误信息规范

```typescript
// 错误码格式：UPPER_SNAKE_CASE
await finalizeAsyncJob(pool, jobId, "failed", null, {
  code: "IMAGE_GENERATION_FAILED",
  message: "图片生成失败，请重试",
}, now, dispatcher);
```

### 执行器参数传递模式

#### Wrapper 函数模式（推荐）

```typescript
// setup-executors.ts 中的 wrapper 函数
function wrapStep4VideoExecutor(ctx: AppContext) {
  return async (params: ExecutorParams) => {
    const { pool, jobId, dispatcher } = params;
    
    // 从 jobId 获取业务数据
    const job = await getAsyncJob(pool, jobId, () => ctx.clock.now());
    const input = JSON.parse(job.input);
    
    // 调用实际执行器，传递 dispatcher
    await executeStep4Video(ctx, pool, jobId, input, dispatcher);
  };
}

// 注册
executorRegistry.register("step4_video", wrapStep4VideoExecutor(ctx));
```

#### Class 模式

```typescript
class FissionItemImageExecutor {
  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,  // 构造时传入
  ) {}
  
  async advanceOnce(user: User, projectId: string, jobId: string): Promise<void> {
    // ... 执行逻辑
    await finalizeAsyncJob(this.pool, jobId, "completed", result, null, now, this.dispatcher);
  }
}
```

---

## 执行器设计规范

> **重要**: 所有新增执行器必须遵循本规范。历史遗留的非标准模式需逐步迁移。

### 核心原则：短生命周期 + 无状态

QueueDispatcher 的设计哲学是**每个执行器调用都是短生命周期、无状态的**。

执行器被调用后应快速完成当前步骤（提交 API、查询状态、存储结果），然后通过 `finalizeAsyncJob` 或 `updateAsyncJobResult` 结束调用。**不允许执行器内部自轮询**。

### 两种执行器模式

#### 模式一：即完成型（Fire-and-Complete）

适用场景：LLM 文本生成、图片生成、同步 API 调用等可在单次调用内完成的任务。

```
promote → executor 调用 → API 调用 → 存储结果 → finalizeAsyncJob → 结束
```

**流程图**:
```
[QueueDispatcher.promote] → status='running'
    │
    ↓ 调用 executor（异步，不等待）
[Executor]
    ├─ getAsyncJob() 验证 status='running'
    ├─ 执行业务逻辑（LLM 调用、图片生成等）
    ├─ updateAsyncJobStage() 更新进度（可选）
    └─ finalizeAsyncJob('completed'|'failed') 结束
```

**示例**:
```typescript
// setup-executors.ts
executorRegistry.register("step3_shot_prompt", async (params) => {
  const { pool, jobId, ctx, dispatcher } = params;
  const job = await getAsyncJob(pool, jobId, () => ctx.clock.now());
  if (!job || job.status !== "running") return;

  try {
    // 调用 LLM 生成（同步返回结果）
    const result = await generateShotPrompt(ctx, job);
    await finalizeAsyncJob(pool, jobId, "completed", result, null, ctx.clock.now(), dispatcher);
  } catch (err) {
    await finalizeAsyncJob(pool, jobId, "failed", null, {
      code: "GENERATION_FAILED",
      message: err instanceof Error ? err.message : String(err),
    }, ctx.clock.now(), dispatcher);
  }
});
```

#### 模式二：Submit/Query 分离型（异步外部 API）

适用场景：视频生成等异步 API —— 提交请求后返回 taskId，需要多次查询才能获取结果。

将提交和查询拆分为**两个独立 job type**，每个 executor 只做一件事，职责清晰。

**核心思路**：
- **Submit executor**：提交 API → 拿到 taskId → `updateAsyncJobStage("生成中")`（保持 running）→ 创建 Query 子任务（parentJobId = Submit.id，嵌套）
- **Query executor**：查询 API → 成功则 finalize / 失败则 throw / 未完成则仅更新 `updated_at` 心跳
- **级联结算**：Query finalize 后 `checkAndFinalizeParent` 自动将 Submit 标记为 completed/failed，然后递归向上
- **Dispatcher 轮询**：定期重新调用 running 状态的 Query executor，直到查询返回终态

```
[Submit Executor]
  promote → 提交 API → 获得taskId → updateAsyncJobStage("生成中") → 创建 Query 子任务
                                       ↑ Submit 保持 running，不 finalize

[Query Executor]
  promote → 查询 API ─┬─ 成功 → finalize('completed') → checkAndFinalizeParent
                       │         → 自动 finalize Submit → 递归结算祖父任务
                       ├─ 失败 → throw → finalize('failed') → checkAndFinalizeParent
                       └─ pending → 更新 updated_at → return（保持 running）
                           ↑
                           └─ Dispatcher 30s 后重新调用
```

**完整流程图**:
```
[QueueDispatcher.tryPromote] → Submit job status='running'
    │
    ↓ 调用 Submit Executor
[Submit Executor]
    ├─ getAsyncJob() 验证 status='running'
    ├─ 调用外部 API 提交任务
    ├─ 获得 taskId
    ├─ 存储 taskId 到业务表
    ├─ updateAsyncJobStage("生成中")  ← Submit 保持 running
    └─ createAsyncJob({ jobType: 'xxx_query', parentJobId: job.id, input: { taskId } })
                                          ↑ Query 嵌套在 Submit 下
                                          ↓
                               Query job created (pending)
                                          │
[QueueDispatcher.tryPromote] ──────────────┘
    → Query job status='running'
    │
    ↓ 调用 Query Executor
[Query Executor - 第 1 次]
    ├─ 从 input 读取 taskId
    ├─ 检查 created_at 超时（10 分钟）
    ├─ 调用 queryApi(taskId) 查询状态
    ├─ 如果 succeeded → 存储结果 → handleGenComplete → finalizeAsyncJob('completed')
    │                    → checkAndFinalizeParent(Submit) → Submit finalized → 递归结算祖父
    ├─ 如果 failed → 更新失败状态 → throw
    └─ 如果 pending → 仅 UPDATE updated_at = now → return
                      （任务保持 running，不改变状态）

       ... 30 秒后 Dispatcher 重新调用 ...

[QueueDispatcher.pollRunningAsyncTasks] → updated_at < now - 30s
    │
    ↓ 重新调用 Query Executor
[Query Executor - 第 N 次]
    ├─ 同上逻辑，重复查询
    └─ 直到 succeeded 或 failed 或超时
```

**示例**（换装视频生成 submit/query 标准实现 — 嵌套模式）:
```typescript
// ========== Submit Executor ==========
async function executeOutfitGenJob(ctx, pool, job, dispatcher) {
  const input = JSON.parse(job.input);

  // 提交到外部 API
  const result = await submitSegmentVideo(ctx, genInput);

  if (result.syncResult) {
    // 同步返回（罕见）：直接存储结果并 finalize
    await updateSegmentVideoUrl(pool, input.segmentVideoId, result.videoUrl);
    await handleGenComplete(ctx, pool, taskRecord, stage1Result, taskId, now);
    await finalizeAsyncJob(pool, job.id, "completed", {}, null, now, dispatcher);
  } else {
    // 异步返回：保持 running + 创建 query 子任务（嵌套在 Submit 下）
    await updateAsyncJobStage(pool, job.id, "生成中", now);

    await createAsyncJob(pool, {
      id: crypto.randomUUID(),
      jobType: "outfit_change_gen_video_query",
      userId: job.userId,
      projectId: job.projectId,
      input: JSON.stringify({ videoTaskId: result.taskId, ...input }),
      parentJobId: job.id,  // Query 嵌套在 Submit 下（非祖父）
      now,
    });
  }
}

// ========== Query Executor ==========
const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟超时

async function executeOutfitGenVideoQueryJob(ctx, pool, job, dispatcher) {
  const input = JSON.parse(job.input);

  // 超时检查：created_at 超过 10 分钟 → 自动失败
  if (job.createdAt && Date.now() - job.createdAt > QUERY_TIMEOUT_MS) {
    throw new Error("视频生成查询超时（10 分钟）");
  }

  // 查询外部 API
  const status = await querySegmentVideoStatus(provider, input.videoTaskId);

  if (status.status === "succeeded") {
    // 成功 → 存储结果 → handleGenComplete → finalize
    await updateSegmentVideoUrl(pool, input.segmentVideoId, status.videoUrl);
    await handleGenComplete(ctx, pool, taskRecord, stage1Result, taskId, now);
    await finalizeAsyncJob(pool, job.id, "completed", {}, null, now, dispatcher);
    // checkAndFinalizeParent 级联：Query → Submit → 祖父
  } else if (status.status === "failed") {
    // 失败 → 抛出错误（外层 catch 会 finalize 为 failed → 级联 Submit）
    throw new Error(status.error || "视频生成失败");
  } else {
    // pending → 仅更新 updated_at 心跳，不改变状态
    await pool.query(
      "UPDATE nrm_async_jobs SET updated_at = $1 WHERE id = $2",
      [now, job.id]
    );
  }
}
```

### 模式对比

| 维度 | 即完成型 | Submit/Query 分离型 |
|------|---------|-----------|
| 执行器调用次数 | 1 次 | Submit 1 次 + Query N 次 |
| 执行器单次耗时 | 毫秒到数十秒 | 毫秒到数秒（仅提交或查询） |
| 进程重启恢复 | 不需要 | 自动恢复（pollRunningAsyncTasks 下个周期接管 Query） |
| 需要 retryNotBefore | 否 | **否**（Query 任务保持 running，Dispatcher 定期重入） |
| 需要注册到轮询列表 | 否 | **是**（Query job type 需注册到 pollRunningAsyncTasks） |
| 幂等性要求 | 普通 | **必须**（Query 可能被重复调用） |
| 占用 running 槽位 | 数秒到数十秒 | Submit 秒级 + Query 秒级/次（不阻塞） |
| Submit 生命周期 | — | 提交后保持 running，Query 完成后级联结算 |
| 职责清晰度 | 高 | **极高**（提交和查询完全分离） |

### Submit/Query 分离型执行器必须遵守的规则

#### 1. Submit executor 必须立即 finalize

Submit executor 在提交 API 后，无论同步还是异步结果，都必须 `finalizeAsyncJob('completed')`。不 finalize 意味着任务永远卡在 running。

#### 2. Query executor 必须实现超时

Query executor 必须检查 `created_at`，超过阈值（默认 10 分钟）后自动失败，防止无限轮询：

```typescript
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;
if (job.createdAt && Date.now() - job.createdAt > QUERY_TIMEOUT_MS) {
  throw new Error("查询超时");
}
```

#### 3. Query executor pending 时只更新 updated_at

当外部 API 返回 pending 时，Query executor **不能** finalize、**不能**改变状态、**不能** throw。只更新 `updated_at` 作为心跳，让 Dispatcher 下次重新调用：

```typescript
// ✅ 正确：pending 时仅心跳
await pool.query("UPDATE nrm_async_jobs SET updated_at = $1 WHERE id = $2", [now, job.id]);

// ❌ 错误：pending 时 finalize 或 throw
await finalizeAsyncJob(pool, jobId, "completed", ...);  // 还没完成！
throw new Error("仍在处理中");  // 这会标记为 failed！
```

#### 4. Query job type 必须注册到轮询列表

在 `queue-dispatcher.ts` 的 `pollRunningAsyncTasks()` 方法中，将 Query job type 添加到 SQL 的 `IN` 列表：

```sql
WHERE job_type IN ('outfit_change_gen_video_query',
                   'outfit_change_gen_video_edit_query')
```

#### 5. Query 任务在前端应隐藏

Query 任务属于内部实现细节，不应展示给用户。在 `TaskQueuePanel.tsx` 的 `HIDDEN_CHILD_TYPES` 中添加：

```typescript
const HIDDEN_CHILD_TYPES = new Set([
  'outfit_change_gen_video_query',
  'outfit_change_gen_video_edit_query',
]);
```

#### 6. 完成通知需覆盖 Submit 和 Query 两种类型

用户看到的是 Submit 任务，但实际完成可能来自 Query 任务。前端通知处理必须同时匹配两种类型：

```typescript
} else if (task.type === 'outfit_change_gen_video' || task.type === 'outfit_change_gen_video_query') {
  // 完成通知
}
```

### 当前使用 Submit/Query 分离的任务

| Submit job_type | Query job_type | 外部 API | 超时 |
|---|---|---|---|
| `outfit_change_gen_video` | `outfit_change_gen_video_query` | 图片生成视频 API | 10 分钟 |
| `outfit_change_gen_video_edit` | `outfit_change_gen_video_edit_query` | Omni-Video API | 10 分钟 |
| `step4_clip_submit` | `step4_clip_query` | Kling 视频生成 API | 10 分钟 |
| `step6_fission_item_video_submit` | `step6_fission_item_video_query` | Kling 图生视频 API | 10 分钟 |

### 轮询机制技术细节

QueueDispatcher 定期执行 `pollRunningAsyncTasks()`，**仅轮询 `_query` 类型**的 running 任务：

```sql
SELECT id, job_type, user_id, project_id
FROM nrm_async_jobs
WHERE job_type IN ('outfit_change_gen_video_query',
                   'outfit_change_gen_video_edit_query',
                   'step4_clip_query',
                   'step6_fission_item_video_query')
  AND status = 'running'
  AND updated_at < now - 30000     -- 30 秒节流，防止频繁重入
ORDER BY updated_at ASC
LIMIT 20
```

**安全防护层次**（从内到外）：

1. **Query executor 幂等**：每次调用仅查询，不创建新外部任务
2. **created_at 超时**：10 分钟未完成自动失败，防止无限轮询
3. **updated_at 节流**：30 秒内不重复调用，避免 API 轰炸
4. **Submit/Query 分离**：职责单一，Submit 不关心后续，Query 不关心提交
5. **executor .catch() 兜底**：executor 崩溃时自动 finalizeCrashedJob
6. **stuck-job-cleanup**：60 分钟超时兜底（覆盖所有 job_type）

### 禁止的模式：内部自轮询

**禁止在 executor 内部实现轮询循环**（如 `while` + `sleep`）。

```typescript
// ❌ 禁止：内部自轮询
async function badExecutor(params) {
  const taskId = await createVideoTask(provider, prompt);
  // 内部循环轮询
  for (let i = 0; i < 100; i++) {
    await sleep(5000);
    const result = await queryVideoTask(provider, taskId);
    if (result.status === "succeeded") break;
  }
  await finalizeAsyncJob(...);
}
```

**问题**：
- 进程重启 = 任务丢失，job 永远卡在 `running`
- 长时间占用 running 槽位（视频生成可能 5-10 分钟）
- 无法观测中间进度
- 超时控制散落在各 executor，不统一

---

## 常见问题与解决方案

### Q1: pending 任务不自动提升为 running

**症状**: 任务创建后一直处于 `pending` 状态，不执行

**根本原因**: `finalizeAsyncJob()` 缺少 `dispatcher` 参数

**排查步骤**:
1. 搜索所有 `finalizeAsyncJob` 调用：
   ```bash
   grep -rn "finalizeAsyncJob" src/
   ```
2. 检查每个调用是否传递 `dispatcher` 参数
3. 修复缺失的调用

**解决方案**: 参见本次修复的文件列表

### Q2: 任务创建后立即 running 但没有执行

**症状**: 任务状态为 `running`，但实际未执行

**可能原因**:
1. 任务类型未注册执行器
2. 执行器函数内部错误未捕获

**排查步骤**:
1. 检查执行器注册：
   ```typescript
   // src/app-setup/setup-executors.ts
   executorRegistry.register("job_type_here", ...);
   ```
2. 检查执行器函数是否有 try-catch

### Q3: 父任务一直 running 不结算

**症状**: 所有子任务已完成，父任务仍为 `running`

**根本原因**: 子任务完成时未调用 `checkAndFinalizeParent()`

**解决方案**:
```typescript
// 子任务执行器中添加
if (job.parentJobId) {
  await checkAndFinalizeParent(pool, job.parentJobId, dispatcher, now);
}
```

### Q4: 任务执行中途失败但未推送 SSE

**症状**: 任务失败，前端未收到通知

**可能原因**:
1. 执行器内 try-catch 吞掉错误
2. finalizeAsyncJob 未调用

**解决方案**:
```typescript
// 执行器内完整错误处理
try {
  // ... 业务逻辑
  await finalizeAsyncJob(pool, jobId, "completed", result, null, now, dispatcher);
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  await finalizeAsyncJob(pool, jobId, "failed", null, {
    code: "EXECUTION_ERROR",
    message: errorMsg,
  }, now, dispatcher);
}
```

### Q5: 排队任务超时未清理

**症状**: 长时间 pending 的任务未自动失败

**排查**:
1. 检查 `PendingJobTimeoutScheduler` 是否启动
2. 检查 `global_task.queueTimeoutMinutes` 配置

### Q6: 任务状态不一致

**症状**: `nrm_async_jobs` 状态与业务表状态不一致

**排查**:
1. 检查是否有手动修改状态的代码
2. 检查 `StuckJobCleanupScheduler` 清理逻辑是否更新业务表

---

## 本次修复记录

### 修复的文件列表（第二轮深度核查）

| 文件 | 问题 | 修复内容 |
|------|------|----------|
| `step4-handlers.ts` | `Step4SectionPlanExecutorFn` 类型缺少 dispatcher | 添加 dispatcher 参数到类型定义和函数签名 |
| `step4-handlers.ts` | finalizeAsyncJob 缺少 dispatcher | 添加 dispatcher 到所有 finalizeAsyncJob 调用 |
| `setup-executors.ts` | executor 调用缺少 dispatcher 参数 | 添加 dispatcher: params.dispatcher 到所有 executor 调用 |
| `step3-candidate/index.ts` | `ReverseRewriteExecutorFn` 类型缺少 dispatcher | 添加 dispatcher 参数并传递到 finalizeAsyncJob |
| `reverse-square-routes.ts` | `llm_reverse` 任务使用 fire-and-forget 模式 | 重构为 dispatcher-driven 模式，创建专门的执行器 |
| `reverse-square-routes.ts` | 缺少 logger 导入 | 添加 getLogger 并创建 mockApp 替代 app.log |
| `setup-executors.ts` | `llm_reverse` 使用空 wrapSimpleExecutor | 改为 wrapLlmReverseExecutor 调用专门执行器 |
| `library-routes.ts` | 父任务 createAsyncJob 缺少 concurrencyService | 添加 ctx.globalTaskConcurrencyService 参数 |

### 修复模式对比

**Fire-and-forget（旧）→ Dispatcher-driven（统一）**：

```typescript
// ❌ 旧模式（fire-and-forget）
const jobResult = await createAsyncJob(ctx.pool, {
  ...
  initialStatus: "pending",
}, ctx.globalTaskConcurrencyService);
await updateAsyncJobStage(ctx.pool, jobId, '解析中', now);  // 手动设为 running
runLlmReverseJobInBackground(app, jobId, ctx, deps, userId, url);  // 手动启动
// finalizeAsyncJob 缺少 dispatcher

// ✅ 新模式（dispatcher-driven）
const jobResult = await createAsyncJob(ctx.pool, {
  ...
  initialStatus: "pending",
}, ctx.globalTaskConcurrencyService);
// 不手动调用执行器，由 QueueDispatcher 自动调度
setLlmReverseDeps(deps);  // 设置依赖供执行器使用
// Dispatcher 提升 pending → running 后调用 wrapLlmReverseExecutor
// 执行器内 finalizeAsyncJob 有 dispatcher 参数
```

### 第一轮修复的文件列表

| 文件 | 问题 | 修复内容 |
|------|------|----------|
| `setup-executors.ts` | `executeBatchChildFramePreviewJob` 缺少 `dispatcher` 参数 | 添加参数并传递到所有 `finalizeAsyncJob` 调用 |
| `step2-five-view-job-executor.ts` | 缺少 `dispatcher` 参数 | 已在之前修复 |
| `step3-shot-prompt-executor.ts` | 函数签名缺少 `dispatcher` | 添加参数并传递 |
| `step3-script-orchestrator.ts` | `ScriptGenerationParams` 缺少 `dispatcher` | 添加字段并传递 |
| `step3-batch-preview-orchestrator.ts` | 多个函数缺少 `dispatcher` | 添加参数并传递 |
| `executor-handlers.ts` | 已有参数但未使用 | 使用已有 `dispatcher` 参数 |
| `fission-item-image-executor.ts` | 使用 `params.dispatcher` 改为 `this.dispatcher` | 修复引用 |
| `fission-item-video-executor.ts` | 同上 | 修复引用 |
| `fission-job-executor.ts` | 同上 | 修复引用 |
| `fission-prep-job-executor.ts` | 同上 | 修复引用 |
| `fission-job-service.ts` | `complete/fail` 方法缺少 `dispatcher` 参数 | 添加参数 |
| `video-job-service.ts` | 已正确使用 `this.dispatcher` | 无需修改 |

### 验证方法

```bash
# 编译验证
npm run build

# 运行测试（如果有）
npm test

# 手动测试
# 创建任务，观察 pending → running 状态转换是否立即发生
```

---

## 文档更新历史

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-05-03 | v1.3 | 重构「模式二」为 Submit/Query 分离型：移除 retryNotBefore 模式，新增 submit/query 双 executor 架构、10 分钟超时、30s 节流轮询；任务类型清单添加 4 个换装新类型 |
| 2026-05-01 | v1.2 | 新增「执行器设计规范」章节：统一即完成型/外部轮询型两种模式，明确禁止内部自轮询，补充轮询机制技术细节和安全防护层次 |
| 2026-04-30 | v1.1 | 第二轮深度核查：llm_reverse 重构为 dispatcher-driven，image executor dispatcher 参数修复，library-routes concurrencyService 修复 |
| 2026-04-30 | v1.0 | 初始版本，基于代码探索和第一轮修复记录 |

---

## 附录：关键代码位置索引

| 功能 | 文件 | 行号 |
|------|------|------|
| `createAsyncJob` | `src/service/async-job-service.ts` | ~50 |
| `finalizeAsyncJob` | `src/service/async-job-service.ts` | ~150 |
| `checkAndFinalizeParent` | `src/service/async-job-service.ts` | ~250 |
| `tryPromote` | `src/modules/queue-dispatcher.ts` | ~100 |
| `createJobWithConcurrencyCheck` | `src/modules/global-task-concurrency-service.ts` | ~80 |
| 执行器注册 | `src/app-setup/setup-executors.ts` | 全文件 |
| SSE推送 | `src/modules/sse-manager.ts` | ~50 |
| 超时清理 | `src/scheduler/stuck-job-cleanup-scheduler.ts` | ~40 |