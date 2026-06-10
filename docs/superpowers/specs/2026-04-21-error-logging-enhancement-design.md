# 错误日志简化与完善设计

> **创建时间**：2026-04-21
> **状态**：设计完成，待实施

## 背景

当前的错误日志系统存在以下问题：
1. `logger.error()` 方法不支持直接传 `Error` 对象，使用繁琐
2. 约 65 个 LLM 调用点中，43 个缺少错误日志
3. Job 失败处理中，7 处缺少错误日志
4. `errorWithCode` / `ErrorLogPayload` / `ErrorCodes` 定义了但从未使用

## 设计目标

1. **简化 API**：`logger.error(err, "message")` 一行搞定
2. **LLM 调用全覆盖**：所有 LLM 调用失败时记录 routeKey + 错误详情
3. **Job 失败全覆盖**：所有 job 失败时记录 jobType + 错误详情
4. **移除死代码**：删除未使用的 errorWithCode 相关定义

---

## 一、Logger API 简化

### 1.1 当前 API

```typescript
// 只支持这两种重载
error(message: string): void;
error(obj: Record<string, unknown>, message: string): void;

// 复杂的 errorWithCode（从未使用）
errorWithCode(payload: ErrorLogPayload, msg: string): void;
```

### 1.2 简化后的 API

```typescript
// 层次 1：传 Error + 消息（覆盖 90% 场景）
error(error: Error, message?: string): void;

// 层次 2：传对象 + 消息（需要额外上下文时）
error(obj: Record<string, unknown>, message?: string): void;

// 层次 3：纯字符串（简单场景）
error(message: string): void;
```

### 1.3 实现改动

**文件**: `src/core/logger/logger.ts`

```typescript
// 增加重载签名
error(message: string): void;
error(obj: Record<string, unknown>, message?: string): void;
error(error: Error, message?: string): void;

// 实现逻辑
error(arg1: string | Record<string, unknown> | Error, arg2?: string): void {
  if (arg1 instanceof Error) {
    // 新增：Error 对象处理
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

同样处理 `warn`、`fatal` 方法。

### 1.4 删除死代码

- 删除 `errorWithCode` 方法
- 删除 `ErrorLogPayload` 接口
- 删除 `ErrorCodes` 常量和 `ErrorCode` 类型

---

## 二、LLM 调用错误日志规范

### 2.1 routeKey 枚举参考

**文件**: `src/contracts/provider-route-keys.ts`

所有 LLM 调用都应关联一个 `routeKey`：

| 分类 | routeKey | 说明 |
|------|----------|------|
| Step1 | `step1_fashion_analysis` | 服饰分析 |
| Step1 | `step1_fashion_search` | 服饰搜索 |
| Step1 | `step1_role_preset` | 角色预设 |
| Step2 | `step2_five_view_generation_child` / `step2_five_view_generation_adult` | 五视图生成（按年龄分流） |
| Step3 | `step3_script_generation` | 脚本生成 |
| Step3 | `step3_hot_deep_analysis` | 热点深度分析 |
| Step3 | `step3_storyboard_image` | 分镜图生成 |
| Step3 | `step3_storyboard_prompt` | 分镜提示词工程 |
| Step3 | `step3_custom_script_generation` | 场景化种草脚本 |
| Step3 | `step3_custom_script_concept` | 场景化脚本概念 |
| Step3 | `step3_fashion_script_generation` | 时尚大片脚本 |
| Step3 | `step3_fashion_script_concept` | 时尚大片概念 |
| Step3 | `step3_emotion_archetype_generation` | 情感原型脚本 |
| Step3 | `step3_emotion_archetype_outline` | 情感原型大纲 |
| 质量 | `script_quality_scoring` | 脚本质量评分 |
| 进化 | `prompt_evolution_generation` | Prompt 进化 |
| 图片 | `image_project_step3_model_photo` | 模特图生成 |
| 图片 | `image_project_step4_section_plan` | Section 规划 |
| 裂变 | `fission_video_generation` | 裂变视频生成 |
| 广场 | `square_video_reverse` | 广场反推 |
| 热榜 | `hot_trend_video_reverse` | 热榜反推 |
| 库 | `library_portrait_detect` | 人像检测 |
| 音乐 | `music_atmosphere_analysis` | 音乐氛围分析 |

### 2.2 LLM 错误日志模板

```typescript
// ✅ 正确示例
import { getLogger } from "../core/logger/index.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";

const logger = getLogger("llm-transport");

try {
  const result = await requestLlmPlainText(provider, system, user);
  return result;
} catch (error) {
  logger.error(
    { err: error, routeKey: ProviderRouteKeys.STEP3_SCRIPT_GENERATION },
    "LLM 调用失败"
  );
  throw error;
}
```

---

## 三、Job 失败错误日志规范

### 3.1 jobType 参考

实际使用的 jobType 值：

| jobType | 说明 | 模块 |
|---------|------|------|
| `step4_video` | 视频生成任务 | video-job-service.ts |
| `step4_clip` | 视频片段任务 | step4-video/advance-video-job.ts |
| `step3_library` | 库脚本生成 | step3-script-orchestrator.ts |
| `step3_video` | 视频脚本生成 | step3-script-orchestrator.ts |
| `step3_realtime` | 实时脚本生成 | step3-script-orchestrator.ts |
| `step3_effectiveness` | 效果脚本生成 | step3-script-orchestrator.ts |
| `step3_custom` | 自定义脚本生成 | step3-script-orchestrator.ts |
| `step3_fashion` | 时尚脚本生成 | step3-script-orchestrator.ts |
| `step3_emotion_archetype` | 情感原型脚本 | step3-script-orchestrator.ts |
| `step3_batch_preview` | 批量预览任务 | step3-batch-preview-orchestrator.ts |
| `step3_frame_preview` | 帧预览任务 | step3-batch-preview-orchestrator.ts |
| `step3_reverse_rewrite` | 反推改写任务 | step3-candidate/index.ts |
| `llm_reverse` | LLM 反推任务 | reverse-square-routes.ts |
| `quality_scoring` | 质量评分任务 | script-quality/scoring-daemon.ts |
| `image_step3_model_photo` | 模特图生成 | image-project/step3-handlers.ts |
| `image_step3_single_photo` | 单张模特图 | image-project/step3-handlers.ts |
| `image_step4_section_plan` | Section 规划 | image-project/step4-handlers.ts |
| `image_step4_generate_all` | 批量生成 | image-project/step4-handlers.ts |

### 3.2 Job 错误日志模板

```typescript
// ✅ 正确示例
import { getLogger } from "../core/logger/index.js";

const logger = getLogger("async-job");

try {
  // job 执行逻辑
  await processJob();
} catch (error) {
  // 标记 job 失败
  await finalizeAsyncJob(pool, {
    jobId,
    status: "failed",
    error: { code: "JOB_FAILED", message: error.message },
  });

  // 记录错误日志
  logger.error(
    { err: error, jobType: "step4_video", jobId },
    "Job 执行失败"
  );
}
```

---

## 四、错误日志格式

### 4.1 LLM 调用错误

```json
{
  "level": "error",
  "time": "2026-04-21T10:30:00Z",
  "module": "llm-transport",
  "routeKey": "step3_script_generation",
  "err": {
    "message": "LLM request timeout",
    "stack": "Error: LLM request timeout\n    at ..."
  },
  "msg": "LLM 调用失败"
}
```

### 4.2 Job 失败错误

```json
{
  "level": "error",
  "time": "2026-04-21T10:30:00Z",
  "module": "async-job",
  "jobType": "step4_video",
  "jobId": "video-xxx-123",
  "err": {
    "message": "Video encoding failed",
    "stack": "Error: Video encoding failed\n    at ..."
  },
  "msg": "Job 执行失败"
}
```

---

## 五、关键文件清单

### 需要修改的文件

| 文件 | 改动类型 |
|------|----------|
| `src/core/logger/logger.ts` | API 简化 |
| `src/core/logger/types.ts` | 删除死代码 |
| `test/core/logger/logger.test.ts` | 更新测试 |

### 需要添加错误日志的文件（LLM）

详见实现计划文档。

### 需要添加错误日志的文件（Job）

详见实现计划文档。
