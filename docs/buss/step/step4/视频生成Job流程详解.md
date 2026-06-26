# Step4 视频生成 — Job 流程详解

## 概述

Step4 视频生成采用 **三层 Job 树** 架构，使用 Submit-Query 分离模式：

```
step4_video (父任务，1个)
  ├── step4_clip_submit (场景0)  ← 提交视频生成
  │     └── step4_clip_query     ← 轮询视频状态
  ├── step4_clip_submit (场景1)
  │     └── step4_clip_query
  ├── ...
  └── step4_clip_submit (场景N-1)
        └── step4_clip_query
```

| Job 类型 | 数量 | executionMode | 职责 |
|----------|------|---------------|------|
| `step4_video` | 1 | once | 父任务：协调子任务，聚合进度 |
| `step4_clip_submit` | 每个分镜 1 个 | once | 提交视频生成到外部 API |
| `step4_clip_query` | 每个分镜 1 个 | poll | 轮询外部 API 的视频生成状态 |

---

## 核心代码索引

| 组件 | 文件 |
|------|------|
| 路由注册 | `src/routes/step4-video/index.ts` |
| 视频任务服务 | `src/modules/video-job-service.ts` |
| 队列调度器 | `src/modules/queue-dispatcher.ts` |
| 执行器注册 | `src/app-setup/setup-executors.ts` (`wrapStep4VideoExecutor` 等) |
| Submit 执行器 | `src/routes/step4-video/step4-clip-submit-executor.ts` |
| Query 执行器 | `src/routes/step4-video/step4-clip-query-executor.ts` |
| Job 适配层 | `src/service/step4-video-job-adapter.ts` |
| 子任务 CRUD | `src/routes/step4-video/advance-video-job.ts` |
| 父任务结算 | `src/service/async-job-service.ts` (`checkAndFinalizeParent`) |
| 卡住清理 | `src/scheduler/stuck-job-cleanup-scheduler.ts` |
| 场景状态表 | `nrm_step4_video_scenes`（`src/repositories/pg/step4-video-scene-pg-repository.ts`）|
| 前端 API | `apps/web/services/realApi/video.ts` |
| 前端 Hook | `apps/web/pages/project-flow/step4-video-workspace/useStep4VideoJobs.ts` |
| 前端编排 | `apps/web/pages/project-flow/step4-video-workspace/step4VideoJobOrchestrator.ts` |

---

## 完整时序流程

### 阶段一：前端发起

```
用户点击 "批量生成视频"
  ↓
POST /projects/:projectId/video-jobs
Body: { source: "manual" }            // 批量
Body: { source: "manual", targetSceneIndex: N }  // 单个重试
```

路由 handler (`src/routes/step4-video/index.ts:94-157`)：

1. 解析 `source` 和 `targetSceneIndex`
2. 调用 `ctx.videoJobService.create(user, projectId, { source, targetSceneIndex })`
3. 单片段重试时：更新 `nrm_step4_video_scenes`（`clipStatus="generating"`, `clipGeneration++`）
4. 调用 `ctx.queueDispatcher.tryPromote()`

### 阶段二：Job 创建 — `VideoJobService.create()`

`src/modules/video-job-service.ts:49-206`

```
① 验证项目所有权
② 重复检查：项目已有 running 任务 → 返回 409
③ 并发检查：用户/全局 running 数超限 → 排队
④ 查询 nrm_step3_frame_images → 确定 totalClipCount（如 8）
⑤ createAsyncJob(initialStatus="pending") → INSERT
⑥ updateAsyncJobStage("queued", initialResult) → UPDATE stage+result
⑦ 返回 VideoJob 对象
```

**步骤⑤的 INSERT (通过 `createJobWithConcurrencyCheck`):**
```sql
INSERT INTO nrm_async_jobs (id, user_id, job_type, project_id, input, status, ...)
VALUES (..., 'step4_video', ..., '{"source":"manual"}', 'pending', ...)
-- 注意：result 列未写入，为 NULL
```

**步骤⑥的 UPDATE:**
```sql
UPDATE nrm_async_jobs
SET stage = 'queued',
    result = '{"totalClipCount":8, "completedClipCount":0, "videoUrls":[], ...}',
    updated_at = ...
WHERE id = ...
```

> ⚠️ **竞态窗口（见下文）**：步骤⑤和⑥之间，job 处于 `pending + result 为空` 状态。

### 阶段三：QueueDispatcher 调度提升

`src/modules/queue-dispatcher.ts`

**触发时机：**
- POST /video-jobs 返回后即时调用（路由 handler 中）
- 任何 job finalize 时（释放槽位，提升排队任务）
- 周期扫描（每 10 秒兜底）

**`tryPromote()` 流程：**

```
① 获取 pg_advisory_xact_lock(12345) — 事务级锁
② 统计 running 任务数 → 计算可用全局槽位
③ 清理 orphaned 子任务（父批量任务已结束但子帧仍 pending）
④ 失败传播（依赖 failed job 的 pending job → failed）
⑤ 查询可提升的 pending 任务（FIFO, 依赖满足, LIMIT 200）
⑥ 按用户统计 running 数 → 逐项检查用户并发上限
⑦ batchPromoteToRunning(ids): UPDATE status='running', stage=NULL
⑧ COMMIT
⑨ invokeExecutors(promotedJobs) — 异步调用执行器（fire-and-forget）
⑩ 推送 SSE 信号
```

**`pollRunningAsyncTasks()` — Query 任务轮询：**
- 在每次周期扫描时附加执行
- 查询 `status='running' AND execution_mode='poll' AND updated_at < now-10s`
- 限流 20 个/次
- 先批量更新 `updated_at`（防止重复选取），再异步调用执行器

### 阶段四：父执行器 `wrapStep4VideoExecutor`

`src/app-setup/setup-executors.ts:559-673`

```
① getAsyncJob → 重读 job，检查 status==="running"
② 解析 input（targetSceneIndex, source）
③ 检查 result.totalClipCount
   ├── ≤ 0 → warn 日志 + 静默 return  ← ⚠️ 竞态触发点
   └── > 0 → 继续
④ 幂等检查：已有 step4_clip_submit 子任务 → 跳过
⑤ 获取 shot_prompts → 构建 enhanced video prompt
   （注入服饰保留锚点：Maintain wearing X: Y from first frame throughout）
⑥ 批量任务：初始化 nrm_step4_video_scenes
   8 个场景 → clipStatus="pending", clipPrompt 预填
⑦ 单片段重试：只预填 targetSceneIndex 的 clipPrompt
⑧ 为每个场景调用 createStep4ClipSubmitJob()
   → 创建 step4_clip_submit 子任务（status="pending"）
⑨ dispatcher.tryPromote() → 启动子任务调度
```

**子任务创建（`advance-video-job.ts:94-132`）：**
```sql
INSERT INTO nrm_async_jobs (
  id: "step4-submit-{parentJobId}-s{sceneIndex}",
  job_type: 'step4_clip_submit',
  status: 'pending',
  parent_job_id: {parentJobId},
  input: {"videoJobId","parentJobId","sceneIndex","projectId","userId"}
)
```

### 阶段五：Submit 执行器 `executeStep4ClipSubmitJob`

`src/routes/step4-video/step4-clip-submit-executor.ts:50-341`

```
① 从 DB 查询业务数据：
   - project → 角色年龄（选择成人/儿童 Provider）
   - nrm_step4_video_scenes → clipPrompt（预填的）
   - nrm_step3_frame_images → 分镜图（clipImageUrl）
   - shot_breakdown → 时长（clipDurationSeconds）
   - 角色五视图 + 服饰平铺图 → 参考图
② 根据年龄选择 RouteKey
   child: STEP4_CLIP_VIDEO_GENERATION_CHILD
   adult: STEP4_CLIP_VIDEO_GENERATION_ADULT
③ 冻结积分（如果配置了价格）
④ createVideoTask(provider, prompt, {imageUrl, referenceImages, duration})
   → 提交到外部视频 API
⑤ 结果处理：
   ├── 同步返回 videoUrl（罕见）：
   │     转存 OSS → 更新 scene(clipStatus="completed", clipUrl)
   │     推进项目状态 → finalizeSubmit(completed)
   │
   └── 异步返回 taskId（常见）：
         更新 scene(clipStatus="generating", externalTaskId)
         创建 step4_clip_query 子任务
         保持 submit running（stage="生成中"）
         tryPromote() → 启动 query
```

### 阶段六：Query 执行器 `executeStep4ClipQueryJob`

`src/routes/step4-video/step4-clip-query-executor.ts:47-233`

```
① 从父 submit 获取 routeKey + pairId → 复用同一 Provider
② 超时检查：createdAt > 10 分钟 → 标记失败
③ 创建审计记录 → queryVideoTask(provider, taskId)
④ 三种结果：
   ├── pending（还在生成）：
   │     更新 heartbeat(updated_at) → 返回不 finalize
   │     → 由 pollRunningAsyncTasks 每 10s 重新调用
   │
   ├── succeeded：
   │     转存视频到 OSS
   │     更新 scene(clipStatus="completed", clipUrl, variantUrls)
   │     所有分镜都有视频 → 项目状态推进到 CLIPS_READY
   │     finalize query → checkAndFinalizeParent(submit)
   │
   └── failed：
         更新 scene(clipStatus="failed", errorMessage)
         finalize query(failed) → checkAndFinalizeParent(submit)
```

### 阶段七：父任务结算 `checkAndFinalizeParent`

`src/service/async-job-service.ts:410-553`

递归链式结算：

```
step4_clip_query finalize
  → checkAndFinalizeParent(submitJobId)
    ↓ 统计 submit 的所有子任务
    ↓ 更新 submit 进度（completedChildCount/totalChildCount）
    ↓ 全部子任务 terminal？
      ↓ Yes → finalize submit（completed 或 failed）
        → checkAndFinalizeParent(step4_video_job_id)
          ↓ 统计 parent 的所有 submit 子任务
          ↓ 更新 parent 进度（completedChildCount/totalClipCount）
          ↓ 全部 submit terminal → 聚合结果 → finalize parent
          ↓ 递归检查祖父（如有）
      ↓ No → 仅更新进度，等待其他子任务完成
```

**附加机制：**
- 失败传播：子任务 failed → 依赖它的 pending 兄弟也标记 failed
- SSE 推送：每次进度更新推 `job_updated` / `job_failed` 给前端

### 阶段八：前端轮询与展示

**两路数据来源：**

| 路径 | 数据 | 用途 |
|------|------|------|
| SSE (globalTaskQueue) | 子任务状态 | 实时推送每个 clip 的生成进度 |
| 轮询 GET /video-jobs/:jobId | 父任务 (step4_video) | 整体进度 + videoUrls |

**前端展现（`step4VideoJobOrchestrator.ts`）：**

`buildStep4VideoClipStatusesFromJob` → 将 job 数据映射为 N 个 clip 状态：

| 条件 | clip 状态 |
|------|----------|
| `status==="succeeded"` 或 `index < completedClipCount` | completed (100%) |
| `status==="running"` 且 `index === completedClipCount` | generating (进度递增) |
| 其余 | pending (0%) |

**结束条件：**
- 父 job `status === "succeeded"` → 所有片段完成 → 显示视频 + 可导出
- 父 job `status === "failed"` → 部分失败 → 显示失败状态 + 可单独重试

---

## 超时清理机制

`src/scheduler/stuck-job-cleanup-scheduler.ts`

| 配置项 | 默认值 |
|--------|--------|
| 扫描间隔 | 5 分钟 |
| 超时阈值 | 60 分钟 |

超过 60 分钟仍为 `running` 的 `step4_video` 任务会被标记为 `failed`，同时：
- 重置对应 `nrm_step4_video_scenes` 状态
- 推送 SSE 通知用户

---

## 已知问题：竞态条件卡死

### 根因

`VideoJobService.create()` 中，`createAsyncJob`（INSERT）和 `updateAsyncJobStage`（UPDATE result）是两个独立 SQL。在两个操作之间，job 处于 `pending + result 为空` 的状态。

QueueDispatcher 的周期扫描或并发 `tryPromote` 可在此期间将 pending 提升为 running 并调用执行器。执行器读取 `totalClipCount = 0`，静默 `return`，不创建子任务。随后 `updateAsyncJobStage` 将 result 写入，但执行器已不会再次被调度。

### 产物

- `status = "running"`，`stage = "queued"`
- 无任何子任务
- 需等 60 分钟超时清理

### 日志特征

```
Step4Video totalClipCount 为 0，跳过
```

### 修复方案（待实施）

1. 将 `totalClipCount` 写入 `input` JSON（INSERT 时即写入），执行器从 `input` 读取
2. 执行器 `totalClipCount ≤ 0` 时改为 `finalizeAsyncJob(failed)` 而非静默返回
