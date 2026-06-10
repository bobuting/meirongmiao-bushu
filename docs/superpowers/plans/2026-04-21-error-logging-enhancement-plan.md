# 错误日志简化与完善实施计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 简化 Logger API 并为所有 LLM 调用和 Job 失败添加错误日志

**架构：** 三阶段实施 - 先简化 API，再修复 LLM 调用点，最后修复 Job 失败点

**技术栈：** TypeScript, Pino Logger

---

## 阶段 1：Logger API 简化

### 任务 1.1：增加 Error 对象支持

**文件：**
- 修改：`src/core/logger/logger.ts`
- 测试：`test/core/logger/logger.test.ts`

- [ ] **步骤 1：增加 error 方法重载签名**

在 `src/core/logger/logger.ts` 中，为 `error`、`warn`、`fatal` 方法增加 Error 对象支持：

```typescript
// 在现有重载签名后添加
error(error: Error, message?: string): void;
warn(error: Error, message?: string): void;
fatal(error: Error, message?: string): void;
```

- [ ] **步骤 2：修改 error 方法实现**

```typescript
error(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
  if (arg1 instanceof Error) {
    // Error 对象处理
    const errorObj = {
      err: arg1,
      message: arg1.message,
      stack: arg1.stack,
    };
    this.pino.error(this.mergeModuleContext(errorObj), arg2 ?? arg1.message);
  } else if (typeof arg1 === "string") {
    this.pino.error(arg1);
  } else {
    this.pino.error(this.mergeModuleContext(arg1), arg2 ?? "");
  }
}
```

- [ ] **步骤 3：同样修改 warn 和 fatal 方法**

参照 error 方法，修改 warn 和 fatal 的实现。

- [ ] **步骤 4：编写测试验证**

在 `test/core/logger/logger.test.ts` 中添加测试：

```typescript
it("error 方法支持 Error 对象", () => {
  const logger = new AppLogger(mockPino, testConfig);
  const error = new Error("test error");
  logger.error(error, "操作失败");
  expect(mockPino.error).toHaveBeenCalled();
  const callArgs = (mockPino.error as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(callArgs[0].err).toBe(error);
  expect(callArgs[0].message).toBe("test error");
});
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npm run test -- --grep "AppLogger"`
预期：所有测试通过

---

### 任务 1.2：删除死代码

**文件：**
- 修改：`src/core/logger/logger.ts`
- 修改：`src/core/logger/types.ts`
- 修改：`src/core/logger/index.ts`

- [ ] **步骤 1：删除 errorWithCode 方法**

在 `src/core/logger/logger.ts` 中删除 `errorWithCode` 方法（第 223-247 行）。

- [ ] **步骤 2：删除 ErrorLogPayload 和 ErrorCodes**

在 `src/core/logger/types.ts` 中删除：
- `ErrorLogPayload` 接口（第 62-74 行）
- `ErrorCodes` 常量（第 76-93 行）
- `ErrorCode` 类型（第 95 行）

- [ ] **步骤 3：更新 index.ts 导出**

在 `src/core/logger/index.ts` 中删除相关导出：
- `ErrorLogPayload` 类型导出
- `ErrorCodes` 常量导出
- `ErrorCode` 类型导出

- [ ] **步骤 4：删除相关测试**

删除 `test/core/logger/logger.test.ts` 中 `errorWithCode` 相关测试。

- [ ] **步骤 5：运行编译和测试**

运行：`npm run build && npm run test`
预期：编译通过，测试通过

---

## 阶段 2：LLM 调用点修复

### 任务 2.1：P0 级别 - Step1/Step2 核心流程

**文件：**
- `src/modules/step1-role-direction-task.ts`
- `src/modules/single-image-outfit-analysis.ts`
- `src/modules/portrait-check.ts`

- [ ] **步骤 1：修复 step1-role-direction-task.ts**

行 133，添加 try-catch 和错误日志：

```typescript
try {
  const result = await requestLlmPlainTextWithMetadata(...);
  return result;
} catch (error) {
  const logger = getLogger("llm-transport");
  logger.error({ err: error, routeKey: ProviderRouteKeys.STEP1_ROLE_PRESET }, "角色预设生成失败");
  throw error;
}
```

- [ ] **步骤 2：修复 single-image-outfit-analysis.ts**

行 187 和 295，添加 try-catch 和错误日志。

- [ ] **步骤 3：修复 portrait-check.ts**

行 142，添加 try-catch 和错误日志。

---

### 任务 2.2：P1 级别 - 视频反推与裂变

**文件：**
- `src/modules/video-reverse-core/batch-reverse-adapter.ts`
- `src/modules/video-reverse-core/clone-adapter.ts`
- `src/modules/fission-video/fission-story-generator.ts`

- [ ] **步骤 1：修复 batch-reverse-adapter.ts**

行 46 和 59，添加 try-catch 和错误日志。

- [ ] **步骤 2：修复 clone-adapter.ts**

行 60 和 73，添加 try-catch 和错误日志。

- [ ] **步骤 3：修复 fission-story-generator.ts**

行 292，添加 try-catch 和错误日志。

---

### 任务 2.3：P1 级别 - Step3 脚本生成

**文件：**
- `src/modules/video-step/step3/**/*.ts`（8 个文件）
- `src/modules/script-effectiveness/generator.ts`

- [ ] **步骤 1：替换 console.error 为 logger.error**

在每个文件中：
1. 导入 `getLogger`
2. 将 `console.error` 替换为 `logger.error`
3. 添加 `routeKey` 上下文

- [ ] **步骤 2：验证所有 Step3 脚本生成错误日志**

---

## 阶段 3：Job 失败点修复

### 任务 3.1：修复 async-job-service.ts

**文件：** `src/service/async-job-service.ts`

- [ ] **步骤 1：任务过期设置添加日志**

行 99-105，在设置 `status = 'expired'` 时添加日志：

```typescript
if (job.status !== "expired") {
  await pool.query('UPDATE nrm_async_jobs SET status = $1, updated_at = $2 WHERE id = $3', ['expired', now(), jobId]);
  const logger = getLogger("async-job");
  logger.info({ jobType: job.jobType, jobId }, "任务已过期");
}
```

- [ ] **步骤 2：批量取消任务添加日志**

行 258-264，添加日志记录被取消的任务。

---

### 任务 3.2：修复 step3-script-orchestrator.ts

**文件：** `src/modules/step3-script-orchestrator.ts`

- [ ] **步骤 1：项目不存在时添加日志**

行 188-194，添加错误日志。

- [ ] **步骤 2：用户不存在时添加日志**

行 198-204，添加错误日志。

---

### 任务 3.3：修复其他 Job 失败点

**文件：**
- `src/modules/step3-batch-preview-orchestrator.ts`
- `src/routes/async-job-routes.ts`
- `src/modules/video-job-service.ts`

- [ ] **步骤 1：修复 step3-batch-preview-orchestrator.ts**

行 185-188，执行异常时添加日志。

- [ ] **步骤 2：修复 async-job-routes.ts**

行 32-43，orphaned 清理时添加日志。

- [ ] **步骤 3：修复 video-job-service.ts**

行 236-247，任务失败完成时添加日志。

---

## 验收标准

1. ✅ `logger.error(err, "message")` 语法可用
2. ✅ 所有 LLM 调用失败时有错误日志，包含 routeKey
3. ✅ 所有 Job 失败时有错误日志，包含 jobType 和 jobId
4. ✅ 错误日志写入 `logs/app-error-*.log` 文件
5. ✅ 测试通过：`npm run test`
6. ✅ 编译通过：`npm run build`
