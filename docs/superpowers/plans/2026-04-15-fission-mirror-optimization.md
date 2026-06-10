# 裂变流程优化：镜像处理前移至主流程 Step4 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将裂变流程的"整理镜像"、"生成新故事"、"生成专业提示词"前移至主流程 Step4 异步处理

**架构：** 
- 主流程 Step4：前端处理镜像分镜，后端异步生成新故事和专业提示词
- 裂变流程：复用已准备好的数据，跳过 LLM 调用

**技术栈：** TypeScript, React, Fastify, PostgreSQL, WebCodecs

---

## 文件结构

### 修改文件
| 文件 | 职责 |
|------|------|
| `src/service/services-sub.ts` | 新增异步状态字段读写 |
| `src/routes/fission-video-routes.ts` | 新增异步任务启动和状态查询接口 |
| `apps/web/services/realApi/projects.ts` | 新增异步任务相关 API |
| `apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx` | 主流程 Step4 处理镜像并触发异步任务 |
| `apps/web/pages/fission/useFissionVideo.ts` | 裂变流程检查异步状态，等待或使用数据 |

---

## 任务 1：数据库新增异步状态字段

**文件：**
- 修改：`src/service/services-sub.ts`
- 修改：`src/modules/fission-video/fission-video-config.ts`

- [ ] **步骤 1：新增数据库字段**

执行 SQL：
```sql
ALTER TABLE nrm_fission_video_status 
ADD COLUMN new_story_async_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN shot_prompts_async_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN async_failed_stage VARCHAR(20);
```

- [ ] **步骤 2：更新 FissionVideoStatusRecord 类型**

在 `src/modules/fission-video/fission-video-config.ts` 中添加：
```typescript
export interface FissionVideoStatusRecord {
  // ... 现有字段
  newStoryAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  shotPromptsAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  asyncFailedStage?: 'new_story' | 'shot_prompts';
}
```

- [ ] **步骤 3：更新数据库读写**

在 `src/service/services-sub.ts` 的 `rowToRecord` 和 `create` 方法中添加字段处理。

- [ ] **步骤 4：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 5：Commit**

```bash
git add src/service/services-sub.ts src/modules/fission-video/fission-video-config.ts
git commit -m "feat: 新增裂变异步任务状态字段"
```

---

## 任务 2：后端新增异步任务启动接口（串行执行）

**文件：**
- 修改：`src/routes/fission-video-routes.ts`
- 修改：`apps/web/services/realApi/projects.ts`

- [ ] **步骤 1：新增后端路由**

```typescript
// 启动异步任务（生成新故事 + 专业提示词）
app.post("/fission/async/start", handlers.startFissionAsyncTasks);

// 查询异步任务状态
app.get("/fission/async/status/:fissionId", handlers.getFissionAsyncStatus);
```

- [ ] **步骤 2：实现 startFissionAsyncTasks handler（串行执行）**

```typescript
startFissionAsyncTasks: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const body = request.body as {
    projectId: string;
    fissionId: string;
    oldStory: string;
    characterInfo: Record<string, unknown>;
    characterReferences: Array<{ imageUrl: string; viewKey: string }>;
    storyboardCount: number;
  };

  const statusService = fissionVideoStatusService;
  const statusRecord = await statusService.getById(body.fissionId);

  if (!statusRecord) {
    return reply.code(404).send({ success: false, message: "裂变状态记录不存在" });
  }

  // 检查是否需要启动任务（pending 状态才启动）
  if (statusRecord.newStoryAsyncStatus !== 'pending') {
    return reply.send({ success: true, message: "任务已执行或正在执行" });
  }

  // 异步执行串行任务（不阻塞响应）
  executeAsyncTasksSerial(ctx, body, statusService).catch(err => {
    console.error("[AsyncTask] 串行任务执行异常:", err);
  });

  return reply.send({ success: true, message: "异步任务已启动" });
},

// 串行执行异步任务
async function executeAsyncTasksSerial(
  ctx: AppContext,
  body: { projectId: string; fissionId: string; oldStory: string; characterInfo: Record<string, unknown>; characterReferences: Array<{ imageUrl: string; viewKey: string }>; storyboardCount: number },
  statusService: FissionVideoStatusService
) {
  // ===== 步骤1：生成新故事 =====
  await statusService.update(body.fissionId, { newStoryAsyncStatus: 'processing' });
  console.log(`[AsyncTask] 开始生成新故事, fissionId: ${body.fissionId}`);

  try {
    const storyResult = await generateNewStory({
      ctx,
      oldStory: body.oldStory,
      characterInfo: body.characterInfo as any,
      characterReferences: body.characterReferences,
      storyboardCount: body.storyboardCount,
      // ...其他参数
    });

    // 保存新故事
    await statusService.update(body.fissionId, {
      newStoryAsyncStatus: 'completed',
      newStoryJson: {
        newStory: storyResult.newStory,
        storyboardDescriptions: storyResult.storyboardDescriptions,
      },
    });
    console.log(`[AsyncTask] 新故事生成完成`);

  } catch (error) {
    console.error("[AsyncTask] 生成新故事失败:", error);
    await statusService.update(body.fissionId, {
      newStoryAsyncStatus: 'failed',
      asyncFailedStage: 'new_story',
    });
    return; // 停止，不执行后续任务
  }

  // ===== 步骤2：生成专业提示词（依赖步骤1） =====
  await statusService.update(body.fissionId, { shotPromptsAsyncStatus: 'processing' });
  console.log(`[AsyncTask] 开始生成专业提示词`);

  try {
    // 获取新故事数据
    const statusRecord = await statusService.getById(body.fissionId);
    const newStoryJson = statusRecord?.newStoryJson;

    // 构建分镜数据（从新故事生成分镜描述）
    const segments = newStoryJson?.storyboardDescriptions?.map((desc: string, idx: number) => ({
      shot_id: idx + 1,
      content: desc,
    })) || [];

    // 调用专业提示词生成服务
    const shotPromptsService = getShotPromptsService(ctx);
    const shotPromptsResult = await shotPromptsService.generateAndSave({
      projectId: body.projectId,
      segments,
      characterReferenceImages: body.characterReferences?.map(r => r.imageUrl),
      // ...其他参数
    });

    if (shotPromptsResult.success) {
      await statusService.update(body.fissionId, { shotPromptsAsyncStatus: 'completed' });
      console.log(`[AsyncTask] 专业提示词生成完成`);
    } else {
      throw new Error(shotPromptsResult.error || '生成失败');
    }

  } catch (error) {
    console.error("[AsyncTask] 生成专业提示词失败:", error);
    await statusService.update(body.fissionId, {
      shotPromptsAsyncStatus: 'failed',
      asyncFailedStage: 'shot_prompts',
    });
  }
}
```

- [ ] **步骤 3：实现 getFissionAsyncStatus handler**

```typescript
getFissionAsyncStatus: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const { fissionId } = request.params as { fissionId: string };

  const statusRecord = await fissionVideoStatusService.getById(fissionId);
  if (!statusRecord) {
    return reply.code(404).send({ success: false, message: "记录不存在" });
  }

  return reply.send({
    success: true,
    newStoryAsyncStatus: statusRecord.newStoryAsyncStatus || 'pending',
    shotPromptsAsyncStatus: statusRecord.shotPromptsAsyncStatus || 'pending',
    asyncFailedStage: statusRecord.asyncFailedStage || null,
  });
},
```

- [ ] **步骤 4：新增前端 API**

```typescript
// apps/web/services/realApi/projects.ts

startFissionAsyncTasks(
  token: string,
  params: {
    projectId: string;
    fissionId: string;
    oldStory: string;
    characterInfo: Record<string, unknown>;
    characterReferences: Array<{ imageUrl: string; viewKey: string }>;
    storyboardCount: number;
  },
): Promise<{ success: boolean; message: string }>;

getFissionAsyncStatus(
  token: string,
  fissionId: string,
): Promise<{
  success: boolean;
  newStoryAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  shotPromptsAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  asyncFailedStage: 'new_story' | 'shot_prompts' | null;
}>;
```

- [ ] **步骤 5：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 6：Commit**

```bash
git add src/routes/fission-video-routes.ts apps/web/services/realApi/projects.ts
git commit -m "feat: 新增裂变异步任务启动和状态查询接口"
```

---

## 任务 3：主流程 Step4 - 处理镜像并触发异步任务

**文件：**
- 修改：`apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx`

- [ ] **步骤 1：前端检查镜像分镜是否已整理**

在 `handleFinalMerge` 函数中，合并视频之前添加：

```typescript
// ===== 为裂变准备数据 =====
let fissionId: string | undefined;

// 1. 检查镜像分镜是否已整理
const existingStoryboards = await backendApi.projects.getFissionStoryboards(token!, workflow.projectId);
const needProcessMirror = !existingStoryboards.success || 
                          !existingStoryboards.storyboards || 
                          existingStoryboards.storyboards.length === 0;

if (needProcessMirror) {
  // 创建或获取 fission_video_status
  const fissionStatus = await backendApi.projects.getOrCreateFissionVideoStatus(token!, workflow.projectId);
  if (fissionStatus.success && fissionStatus.record) {
    fissionId = fissionStatus.record.id;
    
    // 执行镜像处理（异步，不阻塞）
    handleMirrorStoryboards(selectedVideoVariantUrls, fissionId).catch(err => {
      console.error("[Step4] 镜像处理失败:", err);
    });
  }
} else {
  console.log("[Step4] 镜像分镜已存在，跳过处理");
  // 获取已有的 fissionId
  fissionId = existingStoryboards.storyboards[0]?.fissionId;
}
```

- [ ] **步骤 2：触发后端异步任务**

```typescript
// 2. 触发后端异步任务（生成新故事 + 专业提示词）
if (fissionId) {
  // 获取项目数据
  const scriptText = segments.map(s => s.content).filter(Boolean).join('\n');
  const characterInfo = projectData.characterInfo || {};
  const characterReferences = projectData.confirmedCharacterReferences || [];
  
  backendApi.projects.startFissionAsyncTasks(token!, {
    projectId: workflow.projectId,
    fissionId,
    oldStory: scriptText,
    characterInfo,
    characterReferences,
    storyboardCount: segments.length,
  }).catch(err => {
    console.error("[Step4] 启动异步任务失败:", err);
  });
}
```

- [ ] **步骤 3：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx
git commit -m "feat: 主流程 Step4 处理镜像并触发异步任务"
```

---

## 任务 4：裂变流程 - 检查异步状态并等待

**文件：**
- 修改：`apps/web/pages/fission/useFissionVideo.ts`

- [ ] **步骤 1：新增检查异步状态的函数**

```typescript
/**
 * 检查异步任务状态，等待完成或抛错
 */
const checkAndWaitAsyncTasks = useCallback(async (fissionId: string): Promise<void> => {
  const maxRetries = 60; // 最多等待 2 分钟
  const intervalMs = 2000;

  for (let i = 0; i < maxRetries; i++) {
    const status = await realProjectsApi.getFissionAsyncStatus(token!, fissionId);

    // 检查失败状态（根据失败阶段给出具体提示）
    if (status.newStoryAsyncStatus === 'failed' || status.shotPromptsAsyncStatus === 'failed') {
      if (status.asyncFailedStage === 'new_story') {
        throw new Error('生成新脚本失败，请联系管理员');
      } else if (status.asyncFailedStage === 'shot_prompts') {
        throw new Error('生成新的镜像提示词失败，请联系管理员');
      }
      throw new Error('异步任务失败，请联系管理员');
    }

    // 检查处理中状态
    if (status.newStoryAsyncStatus === 'processing') {
      setFissionProgress({ percent: 5 + i, message: '正在准备新脚本...', stage: 'preparing' });
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      continue;
    }
    if (status.shotPromptsAsyncStatus === 'processing') {
      setFissionProgress({ percent: 5 + i, message: '正在准备提示词...', stage: 'preparing' });
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      continue;
    }

    // 两个都是 completed，退出循环
    if (status.newStoryAsyncStatus === 'completed' && status.shotPromptsAsyncStatus === 'completed') {
      console.log('[Fission] 异步任务已完成');
      return;
    }

    // pending 状态说明主流程还没触发，继续等待
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('异步任务等待超时，请稍后重试');
}, [token]);
```

- [ ] **步骤 2：修改 handleParallelFission 函数**

移除整理镜像步骤，添加异步状态检查：

```typescript
// ===== 步骤1：检查镜像数据是否已准备好 =====
setGenerateVideoProgress(2);
showMessage({ type: 'info', text: '检查裂变数据...' });

const storyboardData = await realProjectsApi.getFissionStoryboards(token!, projectId);
if (!storyboardData.success || !storyboardData.storyboards || storyboardData.storyboards.length === 0) {
  showMessage({ type: 'error', text: '裂变数据未准备好，请先完成主流程 Step4' });
  setGenerateVideoLoading(false);
  return;
}

const fissionId = storyboardData.storyboards[0]?.fissionId;
console.log(`[SyncFission] 已有 ${storyboardData.storyboards.length} 个分镜数据, fissionId: ${fissionId}`);

// ===== 步骤2：检查异步任务状态 =====
if (fissionId) {
  try {
    await checkAndWaitAsyncTasks(fissionId);
  } catch (error) {
    showMessage({ type: 'error', text: String(error) });
    setGenerateVideoLoading(false);
    return;
  }
}
```

- [ ] **步骤 3：删除 executeProcessStoryboard 函数**

标记为废弃或直接删除。

- [ ] **步骤 4：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/fission/useFissionVideo.ts
git commit -m "refactor: 裂变流程检查异步状态并等待"
```

---

## 任务 5：端到端测试

- [ ] **步骤 1：编译项目**

运行：`npm run build && npm run build:ui`

- [ ] **步骤 2：测试主流程 Step4**

1. 创建项目并完成 Step1-Step3
2. 进入 Step4，点击合并视频
3. 验证：
   - 合并成功
   - 镜像分镜保存到数据库
   - 异步任务启动

- [ ] **步骤 3：测试裂变流程**

1. 主流程完成后，进入裂变页面
2. 点击开始裂变
3. 验证：
   - 检测到已有分镜数据
   - 异步任务状态正确
   - 等待/使用已有数据

- [ ] **步骤 4：Commit 最终版本**

```bash
git add .
git commit -m "feat: 裂变流程优化 - 镜像和新故事前移至主流程 Step4"
```

---

## 验收标准

| 功能 | 验证方式 |
|------|----------|
| 主流程 Step4 创建 fission_video_status | 控制台日志 |
| 主流程 Step4 处理镜像并保存 | 数据库查询 |
| 主流程 Step4 触发异步任务 | 控制台日志 |
| 裂变流程检查异步状态 | 控制台日志 |
| 裂变流程等待异步完成 | 进度显示 |
| 裂变流程失败抛错 | 错误提示 |
