# step3_scripts_generation 父任务在无子任务时永久卡死

**日期**: 2026-06-25  
**严重程度**: 🔴 高（项目卡死，用户无法恢复）  
**影响项目**: `95f4ec84`、`74444416`  
**状态**: 数据库已手动修复，代码未修复

---

## 症状

- `step3_scripts_generation` 父任务状态为 `running`，stage 为 `"等待策略完成"`
- `result` 显示 `{totalStrategies: 11, completedStrategies: 0, failedStrategies: 0}`
- 子任务（`step3_library`、`step3_video` 等）不存在
- 用户刷新页面重试无效，项目永远卡在 Step3

---

## 触发条件

1. 用户触发 Step3 脚本生成
2. `maxPerUserQueued = 5` 限制导致子任务批量创建被拒绝（`USER_QUEUE_FULL`）
3. 父任务自身占用一个队列槽位，加上其他项目的并发操作，队列快速耗尽

---

## 根因分析

### 死锁链条

```
startScriptsGenerationParent
  ├── 创建父任务 (pending)  ✓
  ├── 循环创建 11 个子任务
  │     ├── 子任务1~N: USER_QUEUE_FULL → 跳过 (warn, 不报错)
  │     └── 结果: childJobIds = []
  ├── 返回 { parentJobId, childJobIds: [] }
  │
  ├── QueueDispatcher 提升父任务为 running
  ├── wrapStep3StrategyOrchestratorExecutor 执行
  │     └── 仅更新 stage → "等待策略完成", return
  │         （不检查子任务是否存在）
  │
  ├── checkAndFinalizeParent 永远无法终结父任务
  │     └── children.length === 0 → return (啥也不做)
  │
  └── 用户重试: forceRefresh=false 时
        └── 发现已有 running 父任务 → 直接返回 childJobIds: []
            （不创建新子任务）
```

### 3 个代码缺陷

| 位置 | 问题 |
|------|------|
| `step3-script-orchestrator.ts` L443-461 | 子任务创建被拒绝时只 `warn`，不检查是否全部失败 |
| `async-job-service.ts` L419 | `checkAndFinalizeParent` 遇 `children.length === 0` 直接 return，不处理超时 |
| `step3-script-orchestrator.ts` L407-414 | 非 forceRefresh 路径拿到已有父任务后，不检查子任务是否为空 |

---

## 修复建议

1. **`startScriptsGenerationParent`**: 子任务全部创建失败时，调用 `finalizeAsyncJob` 将父任务标记为 `failed`
2. **`checkAndFinalizeParent`**: `children.length === 0` 时检查父任务创建时间，超过阈值（如 5 分钟）标记 `failed`
3. **非 forceRefresh 路径**: 获取已有父任务后，若子任务为空且父任务 running 超过阈值，自动触发 forceRefresh 或标记 failed
4. **`wrapStep3StrategyOrchestratorExecutor`**: 执行前验证子任务是否存在，不存在则 fail 父任务

---

## 临时恢复（数据库操作）

```sql
UPDATE nrm_async_jobs
SET status = 'failed',
    error = '{"code":"STUCK_NO_CHILDREN","message":"子任务全部创建失败，父任务自动终止。请重试。"}',
    updated_at = <当前毫秒时间戳>
WHERE id = '<父任务ID>'
  AND status = 'running'
  AND NOT EXISTS (
    SELECT 1 FROM nrm_async_jobs children
    WHERE children.parent_job_id = nrm_async_jobs.id
  );
```

修改后用户刷新页面即可重新触发脚本生成。

---

## 相关代码

- [step3-script-orchestrator.ts](src/modules/step3-script-orchestrator.ts#L381-L467) — `startScriptsGenerationParent`
- [async-job-service.ts](src/service/async-job-service.ts#L410-L419) — `checkAndFinalizeParent`
- [setup-executors.ts](src/app-setup/setup-executors.ts#L545-L557) — `wrapStep3StrategyOrchestratorExecutor`
- [global-task-concurrency-service.ts](src/modules/global-task-concurrency-service.ts#L76-L166) — 队列限制检查
- [business-config-contract.ts](src/contracts/business-config-contract.ts#L121-L127) — `maxPerUserQueued: 5`
