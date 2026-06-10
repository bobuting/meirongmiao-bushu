# 裂变流程优化：剩余任务异步执行 + 前端任务管理界面 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现裂变剩余任务（裂变新镜像图片/视频、新故事图片/视频）的异步执行，并提供类似 Step4 的任务管理界面

**架构：** 后端采用异步任务编排 + taskId 轮询恢复方案，前端采用任务卡片网格展示状态 + 轮询更新

**技术栈：** TypeScript, React, Fastify, PostgreSQL, Tailwind CSS

---

## 文件结构

### 后端文件

| 文件 | 职责 |
|------|------|
| `src/persistence/fission-task-items-repository.ts` | 数据库访问层，需要重构 task_type 结构 |
| `src/modules/fission-video/fission-task-items-service.ts` | 任务项服务，需要重构适配新类型 |
| `src/modules/fission-video/fission-task-orchestrator.ts` | **新建**：任务编排服务，处理依赖、超时、推进逻辑 |
| `src/routes/fission-video-routes.ts` | 路由层，新增任务创建、推进、查询、重试接口 |
| `src/service/services-sub.ts` | 导出服务 |

### 前端文件

| 文件 | 职责 |
|------|------|
| `apps/web/pages/fission/types.ts` | 类型定义扩展 |
| `apps/web/pages/fission/components/AsyncTaskStatusCard.tsx` | **新建**：前置任务状态卡片（异步任务状态展示） |
| `apps/web/pages/fission/components/FissionProgressOverview.tsx` | **新建**：进度概览卡片 |
| `apps/web/pages/fission/components/FissionTaskGrid.tsx` | **新建**：任务卡片网格 |
| `apps/web/pages/fission/components/FissionTaskCard.tsx` | **新建**：单个任务卡片 |
| `apps/web/pages/fission/components/FailedTasksSummary.tsx` | **新建**：失败项汇总 |
| `apps/web/pages/fission/hooks/useFissionTaskManager.ts` | **新建**：任务管理 Hook |
| `apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx` | 改造裂变页面，集成新组件 |
| `apps/web/services/realApi/projects.ts` | 新增前端 API 调用 |

---

## 任务 1：数据库结构重构

**文件：**
- 修改：`src/persistence/fission-task-items-repository.ts`
- 修改：`src/modules/fission-video/fission-video-config.ts`

**背景：** 现有的 `task_type` 只有 `image_video` 和 `new_story`，需要改为细分的 4 种类型：`new_mirror_image`、`new_mirror_video`、`new_story_image`、`new_story_video`

- [ ] **步骤 1：执行数据库 DDL**

```sql
-- 1. 修改 task_type 约束（删除旧约束，添加新约束）
ALTER TABLE nrm_fission_task_items DROP CONSTRAINT IF EXISTS nrm_fission_task_items_task_type_check;

ALTER TABLE nrm_fission_task_items 
ADD CONSTRAINT nrm_fission_task_items_task_type_check 
CHECK (task_type IN ('new_mirror_image', 'new_mirror_video', 'new_story_image', 'new_story_video'));

-- 2. 新增字段
ALTER TABLE nrm_fission_task_items 
ADD COLUMN IF NOT EXISTS parent_task_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS external_task_id TEXT,
ADD COLUMN IF NOT EXISTS prompt TEXT;

-- 3. 添加注释
COMMENT ON COLUMN nrm_fission_task_items.parent_task_id IS '父任务ID，视频任务依赖图片任务';
COMMENT ON COLUMN nrm_fission_task_items.external_task_id IS '提供商任务ID，用于异步轮询恢复';
COMMENT ON COLUMN nrm_fission_task_items.prompt IS '使用的提示词';

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_fission_task_items_parent ON nrm_fission_task_items(parent_task_id);
```

- [ ] **步骤 2：更新类型定义**

在 `src/persistence/fission-task-items-repository.ts` 中修改：

```typescript
/** 任务类型（重构为 4 种细分类型） */
export type FissionTaskType = 
  | 'new_mirror_image'   // 裂变新镜像图片
  | 'new_mirror_video'   // 裂变新镜像视频
  | 'new_story_image'    // 新故事图片
  | 'new_story_video';   // 新故事视频

/** 分镜任务项记录（扩展字段） */
export interface FissionTaskItemRecord {
  id: string;
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
  // 图片相关
  imageUrl: string | null;
  imagePath: string | null;
  imageStatus: FissionItemStatus;
  imageErrorMessage: string | null;
  // 视频相关
  videoUrl: string | null;
  videoPath: string | null;
  videoStatus: FissionItemStatus;
  videoErrorMessage: string | null;
  // 新增字段
  parentTaskId: string | null;       // 父任务ID（视频依赖图片）
  externalTaskId: string | null;     // 提供商taskId（用于轮询恢复）
  prompt: string | null;             // 使用的提示词
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 3：更新 Repository 方法**

添加 `parentTaskId`、`externalTaskId`、`prompt` 字段的读写支持：

```typescript
// 在 rowToRecord 函数中添加字段映射
private rowToRecord(row: FissionTaskItemRow): FissionTaskItemRecord {
  return {
    // ...existing fields
    parentTaskId: row.parent_task_id,
    externalTaskId: row.external_task_id,
    prompt: row.prompt,
  };
}

// 新增方法：更新外部任务ID
async updateExternalTaskId(id: string, externalTaskId: string): Promise<FissionTaskItemRecord> {
  const result = await this.pool.query(
    `UPDATE nrm_fission_task_items 
     SET external_task_id = $1, updated_at = NOW() 
     WHERE id = $2 
     RETURNING *`,
    [externalTaskId, id]
  );
  return this.rowToRecord(result.rows[0]);
}

// 新增方法：根据父任务ID获取子任务
async getByParentId(parentTaskId: string): Promise<FissionTaskItemRecord | null> {
  const result = await this.pool.query(
    `SELECT * FROM nrm_fission_task_items WHERE parent_task_id = $1`,
    [parentTaskId]
  );
  return result.rows[0] ? this.rowToRecord(result.rows[0]) : null;
}
```

- [ ] **步骤 4：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 5：Commit**

```bash
git add src/persistence/fission-task-items-repository.ts src/modules/fission-video/fission-video-config.ts
git commit -m "refactor: 重构 fission_task_items 表结构，支持细分的任务类型"
```

---

## 任务 2：任务编排服务

**文件：**
- 创建：`src/modules/fission-video/fission-task-orchestrator.ts`

- [ ] **步骤 1：创建任务编排服务框架**

```typescript
/**
 * 裂变任务编排服务
 * 处理任务创建、依赖检查、超时检测、任务推进
 */

import type { Pool } from "pg";
import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import { createFissionTaskItemsRepository, type FissionTaskItemRecord, type FissionTaskType } from "../../persistence/fission-task-items-repository.js";
import { FissionVideoStatusService } from "../../service/services-sub.js";

/** 任务项状态 */
export type TaskItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 创建任务项输入 */
export interface CreateTaskItemsInput {
  fissionVideoStatusId: string;
  newMirrorCount: number;  // 裂变新镜像数量（奇数分镜）
  newStoryCount: number;   // 新故事数量（固定2）
  creatorId: string;
}

/** 任务进度 */
export interface TaskProgress {
  newMirrorImage: { total: number; completed: number; failed: number; processing: number };
  newMirrorVideo: { total: number; completed: number; failed: number; processing: number };
  newStoryImage: { total: number; completed: number; failed: number; processing: number };
  newStoryVideo: { total: number; completed: number; failed: number; processing: number };
}

/** 合并条件 */
export interface MergeCondition {
  originalMirrorCount: number;
  newMirrorSuccessCount: number;
  newStorySuccessCount: number;
  canMerge: boolean;
  reason?: string;
}

/** 超时配置 */
const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟
const MAX_RETRY_COUNT = 2;

export class FissionTaskOrchestrator {
  private repository: ReturnType<typeof createFissionTaskItemsRepository>;
  private statusService: FissionVideoStatusService;
  private pool: Pool;

  constructor(pool: Pool, statusService: FissionVideoStatusService) {
    this.pool = pool;
    this.repository = createFissionTaskItemsRepository(pool);
    this.statusService = statusService;
  }

  // ... 方法实现
}
```

- [ ] **步骤 2：实现创建任务项方法**

```typescript
/**
 * 创建所有任务项（图片+视频，含依赖关系）
 */
async createTaskItems(input: CreateTaskItemsInput): Promise<FissionTaskItemRecord[]> {
  const { fissionVideoStatusId, newMirrorCount, newStoryCount, creatorId } = input;
  const items: FissionTaskItemRecord[] = [];
  const now = Date.now();

  // 创建裂变新镜像任务
  for (let i = 0; i < newMirrorCount; i++) {
    // 图片任务
    const imageItem = await this.createSingleTask({
      fissionVideoStatusId,
      taskType: 'new_mirror_image',
      itemIndex: i,
      creatorId,
    });
    items.push(imageItem);

    // 视频任务（依赖图片）
    const videoItem = await this.createSingleTask({
      fissionVideoStatusId,
      taskType: 'new_mirror_video',
      itemIndex: i,
      parentTaskId: imageItem.id,
      creatorId,
    });
    items.push(videoItem);
  }

  // 创建新故事任务
  for (let i = 0; i < newStoryCount; i++) {
    // 图片任务
    const imageItem = await this.createSingleTask({
      fissionVideoStatusId,
      taskType: 'new_story_image',
      itemIndex: i,
      creatorId,
    });
    items.push(imageItem);

    // 视频任务（依赖图片）
    const videoItem = await this.createSingleTask({
      fissionVideoStatusId,
      taskType: 'new_story_video',
      itemIndex: i,
      parentTaskId: imageItem.id,
      creatorId,
    });
    items.push(videoItem);
  }

  return items;
}

private async createSingleTask(input: {
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
  parentTaskId?: string;
  creatorId: string;
}): Promise<FissionTaskItemRecord> {
  const id = randomUUID();
  const now = Date.now();
  
  const result = await this.pool.query(
    `INSERT INTO nrm_fission_task_items 
     (id, fission_video_status_id, task_type, item_index, parent_task_id, 
      image_status, video_status, retry_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, input.fissionVideoStatusId, input.taskType, input.itemIndex, input.parentTaskId || null,
     'pending', 'pending', 0, now, now]
  );
  
  return result.rows[0];
}
```

- [ ] **步骤 3：实现超时检查方法**

```typescript
/**
 * 检查任务超时
 * 超时的 processing 状态任务标记为 failed
 */
async checkTaskTimeout(fissionVideoStatusId: string): Promise<number> {
  const items = await this.repository.listByFissionStatusId(fissionVideoStatusId);
  const now = Date.now();
  let timeoutCount = 0;

  for (const item of items) {
    // 检查图片任务超时
    if (item.imageStatus === 'processing') {
      const elapsed = now - item.createdAt;
      if (elapsed > TASK_TIMEOUT_MS) {
        await this.repository.updateImageStatus(item.id, {
          imageStatus: 'failed',
          imageErrorMessage: '任务超时（超过 10 分钟），请重试',
        });
        timeoutCount++;
      }
    }

    // 检查视频任务超时
    if (item.videoStatus === 'processing') {
      const elapsed = now - item.createdAt;
      if (elapsed > TASK_TIMEOUT_MS) {
        await this.repository.updateVideoStatus(item.id, {
          videoStatus: 'failed',
          videoErrorMessage: '任务超时（超过 10 分钟），请重试',
        });
        timeoutCount++;
      }
    }
  }

  return timeoutCount;
}
```

- [ ] **步骤 4：实现依赖检查方法**

```typescript
/**
 * 检查图片任务是否可重试
 * 视频任务启动后，图片任务不可重试
 */
canRetryImageTask(imageItem: FissionTaskItemRecord, videoItem: FissionTaskItemRecord | null): boolean {
  // 基本条件：图片状态为 failed
  if (imageItem.imageStatus !== 'failed') return false;
  
  // 重试次数限制
  if (imageItem.retryCount >= MAX_RETRY_COUNT) return false;
  
  // 关键约束：视频任务已启动，图片不可重试
  if (videoItem && videoItem.videoStatus !== 'pending') {
    return false;
  }
  
  return true;
}

/**
 * 检查视频任务是否可重试
 */
canRetryVideoTask(videoItem: FissionTaskItemRecord): boolean {
  if (videoItem.videoStatus !== 'failed') return false;
  if (videoItem.retryCount >= MAX_RETRY_COUNT) return false;
  return true;
}

/**
 * 检查视频任务是否可以启动
 * 依赖的图片任务必须完成
 */
canStartVideoTask(videoItem: FissionTaskItemRecord, imageItem: FissionTaskItemRecord | null): boolean {
  if (videoItem.videoStatus !== 'pending') return false;
  if (!imageItem) return false;
  return imageItem.imageStatus === 'completed' && imageItem.imageUrl !== null;
}
```

- [ ] **步骤 5：实现进度计算方法**

```typescript
/**
 * 获取任务进度
 */
async getTaskProgress(fissionVideoStatusId: string): Promise<TaskProgress> {
  const items = await this.repository.listByFissionStatusId(fissionVideoStatusId);
  
  const countByType = (taskType: FissionTaskType, statusField: 'image' | 'video') => {
    const filtered = items.filter(i => i.taskType === taskType);
    const statusKey = statusField === 'image' ? 'imageStatus' : 'videoStatus';
    return {
      total: filtered.length,
      completed: filtered.filter(i => i[statusKey] === 'completed').length,
      failed: filtered.filter(i => i[statusKey] === 'failed').length,
      processing: filtered.filter(i => i[statusKey] === 'processing').length,
    };
  };

  return {
    newMirrorImage: countByType('new_mirror_image', 'image'),
    newMirrorVideo: countByType('new_mirror_video', 'video'),
    newStoryImage: countByType('new_story_image', 'image'),
    newStoryVideo: countByType('new_story_video', 'video'),
  };
}

/**
 * 检查合并条件
 */
async checkMergeCondition(fissionVideoStatusId: string): Promise<MergeCondition> {
  const progress = await this.getTaskProgress(fissionVideoStatusId);
  
  // 从 fission_storyboard_sub 获取原始镜像数量
  const originalMirrorResult = await this.pool.query(
    `SELECT COUNT(*) FROM nrm_fission_storyboard_sub 
     WHERE fission_id = $1 AND storyboard_source = 'mirror'`,
    [fissionVideoStatusId]
  );
  const originalMirrorCount = parseInt(originalMirrorResult.rows[0].count, 10);
  
  // 裂变新镜像成功数（图片+视频都成功）
  const newMirrorSuccessCount = Math.min(
    progress.newMirrorImage.completed,
    progress.newMirrorVideo.completed
  );
  
  // 新故事成功数
  const newStorySuccessCount = Math.min(
    progress.newStoryImage.completed,
    progress.newStoryVideo.completed
  );
  
  // 检查条件
  const canMerge = 
    originalMirrorCount >= 1 &&
    newMirrorSuccessCount >= 1 &&
    newStorySuccessCount >= 1;
  
  // 构建原因
  let reason: string | undefined;
  if (!canMerge) {
    const reasons: string[] = [];
    if (originalMirrorCount < 1) reasons.push('缺少原始镜像视频');
    if (newMirrorSuccessCount < 1) reasons.push('裂变新镜像至少需要1个成功');
    if (newStorySuccessCount < 1) reasons.push('新故事至少需要1个成功');
    reason = reasons.join('，');
  }
  
  return {
    originalMirrorCount,
    newMirrorSuccessCount,
    newStorySuccessCount,
    canMerge,
    reason,
  };
}
```

- [ ] **步骤 6：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 7：Commit**

```bash
git add src/modules/fission-video/fission-task-orchestrator.ts
git commit -m "feat: 新增裂变任务编排服务"
```

---

## 任务 3：后端 API 接口

**文件：**
- 修改：`src/routes/fission-video-routes.ts`
- 修改：`apps/web/services/realApi/projects.ts`

- [ ] **步骤 1：新增创建任务项接口**

在 `src/routes/fission-video-routes.ts` 中添加：

```typescript
/**
 * 创建裂变任务项
 * POST /fission/tasks/create
 */
createTaskItems: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const body = request.body as {
    projectId: string;
    fissionVideoStatusId: string;
    newMirrorCount: number;
    newStoryCount: number;
  };

  const orchestrator = new FissionTaskOrchestrator(ctx.pool, fissionVideoStatusService);
  
  const items = await orchestrator.createTaskItems({
    fissionVideoStatusId: body.fissionVideoStatusId,
    newMirrorCount: body.newMirrorCount,
    newStoryCount: body.newStoryCount,
    creatorId: user.id,
  });

  // 更新主状态
  await fissionVideoStatusService.update(body.fissionVideoStatusId, {
    status: FissionStatus.PARALLEL_RUNNING,
  });

  return reply.send({
    success: true,
    taskItems: items.map(item => ({
      id: item.id,
      taskType: item.taskType,
      itemIndex: item.itemIndex,
      parentTaskId: item.parentTaskId,
      status: 'pending',
    })),
  });
},
```

- [ ] **步骤 2：新增推进任务接口**

```typescript
/**
 * 推进裂变任务
 * POST /fission/tasks/advance
 */
advanceTaskItems: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const body = request.body as {
    fissionVideoStatusId: string;
  };

  const orchestrator = new FissionTaskOrchestrator(ctx.pool, fissionVideoStatusService);
  
  // 1. 检查超时
  await orchestrator.checkTaskTimeout(body.fissionVideoStatusId);
  
  // 2. 推进任务（实际执行图片/视频生成）
  // TODO: 实现具体的任务推进逻辑
  
  // 3. 获取最新状态
  const progress = await orchestrator.getTaskProgress(body.fissionVideoStatusId);
  const items = await createFissionTaskItemsRepository(ctx.pool).listByFissionStatusId(body.fissionVideoStatusId);

  return reply.send({
    success: true,
    progress,
    taskItems: items,
  });
},
```

- [ ] **步骤 3：新增获取任务状态接口**

```typescript
/**
 * 获取裂变任务状态
 * GET /fission/tasks/status/:fissionId
 */
getTaskItemsStatus: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const { fissionId } = request.params as { fissionId: string };

  const orchestrator = new FissionTaskOrchestrator(ctx.pool, fissionVideoStatusService);
  
  const progress = await orchestrator.getTaskProgress(fissionId);
  const mergeCondition = await orchestrator.checkMergeCondition(fissionId);
  const items = await createFissionTaskItemsRepository(ctx.pool).listByFissionStatusId(fissionId);

  // 判断整体状态
  const allCompleted = Object.values(progress).every(p => 
    p.completed + p.failed === p.total
  );
  const hasFailed = Object.values(progress).some(p => p.failed > 0);
  
  let status: 'running' | 'completed' | 'partial_complete' | 'failed';
  if (allCompleted) {
    status = hasFailed ? 'partial_complete' : 'completed';
  } else {
    status = 'running';
  }

  return reply.send({
    success: true,
    status,
    progress,
    mergeCondition,
    taskItems: items,
  });
},
```

- [ ] **步骤 4：新增重试失败项接口**

```typescript
/**
 * 重试失败任务项
 * POST /fission/tasks/retry
 */
retryTaskItems: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const body = request.body as {
    fissionVideoStatusId: string;
    taskIds?: string[];
  };

  const repository = createFissionTaskItemsRepository(ctx.pool);
  const orchestrator = new FissionTaskOrchestrator(ctx.pool, fissionVideoStatusService);
  
  // 获取失败项
  const items = await repository.listByFissionStatusId(body.fissionVideoStatusId);
  const failedItems = items.filter(item => 
    (item.imageStatus === 'failed' || item.videoStatus === 'failed') &&
    (!body.taskIds || body.taskIds.includes(item.id))
  );

  let retryCount = 0;
  for (const item of failedItems) {
    // 检查是否可重试
    if (item.imageStatus === 'failed') {
      // 查找对应的视频任务
      const videoItem = await repository.getByParentId(item.id);
      if (orchestrator.canRetryImageTask(item, videoItem)) {
        await repository.updateImageStatus(item.id, {
          imageStatus: 'pending',
          imageErrorMessage: null,
        });
        await repository.incrementRetryCount(item.id);
        retryCount++;
      }
    }
    
    if (item.videoStatus === 'failed' && orchestrator.canRetryVideoTask(item)) {
      await repository.updateVideoStatus(item.id, {
        videoStatus: 'pending',
        videoErrorMessage: null,
      });
      await repository.incrementRetryCount(item.id);
      retryCount++;
    }
  }

  return reply.send({
    success: true,
    retryCount,
    message: `已重试 ${retryCount} 个任务`,
  });
},
```

- [ ] **步骤 5：注册路由**

```typescript
// 在路由注册部分添加
app.post("/fission/tasks/create", handlers.createTaskItems);
app.post("/fission/tasks/advance", handlers.advanceTaskItems);
app.get("/fission/tasks/status/:fissionId", handlers.getTaskItemsStatus);
app.post("/fission/tasks/retry", handlers.retryTaskItems);
```

- [ ] **步骤 6：新增前端 API 调用**

在 `apps/web/services/realApi/projects.ts` 中添加：

```typescript
// 创建裂变任务项
createFissionTaskItems(
  token: string,
  params: {
    projectId: string;
    fissionVideoStatusId: string;
    newMirrorCount: number;
    newStoryCount: number;
  }
): Promise<{
  success: boolean;
  taskItems: Array<{
    id: string;
    taskType: string;
    itemIndex: number;
    parentTaskId: string | null;
    status: string;
  }>;
}> {
  return this.request(token, '/fission/tasks/create', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// 推进裂变任务
advanceFissionTasks(
  token: string,
  params: { fissionVideoStatusId: string }
): Promise<{
  success: boolean;
  progress: TaskProgress;
  taskItems: FissionTaskItemRecord[];
}> {
  return this.request(token, '/fission/tasks/advance', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// 获取裂变任务状态
getFissionTasksStatus(
  token: string,
  fissionId: string
): Promise<{
  success: boolean;
  status: 'running' | 'completed' | 'partial_complete' | 'failed';
  progress: TaskProgress;
  mergeCondition: MergeCondition;
  taskItems: FissionTaskItemRecord[];
}> {
  return this.request(token, `/fission/tasks/status/${fissionId}`, {
    method: 'GET',
  });
}

// 重试失败任务项
retryFissionTaskItems(
  token: string,
  params: {
    fissionVideoStatusId: string;
    taskIds?: string[];
  }
): Promise<{
  success: boolean;
  retryCount: number;
  message: string;
}> {
  return this.request(token, '/fission/tasks/retry', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// 获取异步任务状态（前置任务：新故事、专业提示词）
getFissionAsyncStatus(
  token: string,
  fissionId: string
): Promise<AsyncTaskStatusResponse> {
  return this.request(token, `/fission/async/status/${fissionId}`, {
    method: 'GET',
  });
}

// 重试异步任务（前置任务失败时）
retryFissionAsyncTask(
  token: string,
  fissionId: string
): Promise<{ success: boolean; message: string }> {
  return this.request(token, `/fission/async/retry/${fissionId}`, {
    method: 'POST',
  });
}
```

- [ ] **步骤 9：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 10：Commit**

```bash
git add src/routes/fission-video-routes.ts apps/web/services/realApi/projects.ts
git commit -m "feat: 新增裂变任务管理 API 接口"
```

---

## 任务 4：前端类型定义

**文件：**
- 修改：`apps/web/pages/fission/types.ts`

- [ ] **步骤 1：添加类型定义**

```typescript
/**
 * 异步任务状态
 * 用于前置任务（新故事、专业提示词）的状态检查
 */
export type AsyncTaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 异步任务失败阶段
 */
export type AsyncTaskFailedStage = 'new_story' | 'shot_prompts' | null;

/**
 * 异步任务状态响应
 */
export interface AsyncTaskStatusResponse {
  success: boolean;
  newStoryAsyncStatus: AsyncTaskStatus;
  shotPromptsAsyncStatus: AsyncTaskStatus;
  asyncFailedStage: AsyncTaskFailedStage;
}

/**
 * 裂变任务类型
 */
export type FissionTaskType =
  | 'new_mirror_image'
  | 'new_mirror_video'
  | 'new_story_image'
  | 'new_story_video';

/**
 * 任务项状态
 */
export type TaskItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 任务项记录
 */
export interface FissionTaskItemRecord {
  id: string;
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
  imageUrl: string | null;
  imagePath: string | null;
  imageStatus: TaskItemStatus;
  imageErrorMessage: string | null;
  videoUrl: string | null;
  videoPath: string | null;
  videoStatus: TaskItemStatus;
  videoErrorMessage: string | null;
  parentTaskId: string | null;
  externalTaskId: string | null;
  prompt: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 任务进度
 */
export interface TaskProgress {
  newMirrorImage: { total: number; completed: number; failed: number; processing: number };
  newMirrorVideo: { total: number; completed: number; failed: number; processing: number };
  newStoryImage: { total: number; completed: number; failed: number; processing: number };
  newStoryVideo: { total: number; completed: number; failed: number; processing: number };
}

/**
 * 合并条件
 */
export interface MergeCondition {
  originalMirrorCount: number;
  newMirrorSuccessCount: number;
  newStorySuccessCount: number;
  canMerge: boolean;
  reason?: string;
}
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/types.ts
git commit -m "feat: 新增裂变任务管理类型定义（含异步任务状态）"
```

---

## 任务 5：前置任务状态组件

**文件：**
- 创建：`apps/web/pages/fission/components/AsyncTaskStatusCard.tsx`

**功能：** 展示异步任务（新故事、专业提示词）的状态，支持重试失败项。

- [ ] **步骤 1：创建前置任务状态组件**

```tsx
/**
 * 前置任务状态卡片组件
 * 展示异步任务（新故事、专业提示词）的状态
 * 原则：任何失败都不能继续，不支持降级或跳过
 */

import React from 'react';

interface AsyncTaskStatus {
  name: string;           // 任务名称
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;  // 失败时的错误信息
}

interface AsyncTaskStatusCardProps {
  tasks: AsyncTaskStatus[];
  onRetry?: () => void;
  retryLoading?: boolean;
}

export const AsyncTaskStatusCard: React.FC<AsyncTaskStatusCardProps> = ({
  tasks,
  onRetry,
  retryLoading,
}) => {
  // 判断整体状态
  const hasFailed = tasks.some(t => t.status === 'failed');
  const isProcessing = tasks.some(t => t.status === 'processing');
  const isCompleted = tasks.every(t => t.status === 'completed');

  // 渲染单个任务状态
  const renderTaskStatus = (task: AsyncTaskStatus) => {
    const statusConfig = {
      pending: { icon: 'schedule', color: 'text-gray-400', label: '等待中' },
      processing: { icon: 'autorenew', color: 'text-amber-500', label: '生成中...', animate: true },
      completed: { icon: 'check_circle', color: 'text-emerald-500', label: '已完成' },
      failed: { icon: 'error', color: 'text-red-500', label: '失败' },
    };
    const config = statusConfig[task.status];

    return (
      <div className="flex items-center gap-3 py-2">
        <span className={`material-icons-round ${config.color} ${config.animate ? 'animate-spin' : ''}`}>
          {config.icon}
        </span>
        <div className="flex-1">
          <span className="text-sm text-gray-700">{task.name}</span>
          <span className={`text-xs ml-2 ${config.color}`}>{config.label}</span>
        </div>
        {task.status === 'failed' && task.errorMessage && (
          <span className="text-xs text-red-400 truncate max-w-[200px]">{task.errorMessage}</span>
        )}
      </div>
    );
  };

  // 全部完成：不显示此组件
  if (isCompleted) return null;

  return (
    <div className={`rounded-2xl border p-6 ${
      hasFailed 
        ? 'bg-red-50 border-red-200' 
        : 'bg-amber-50 border-amber-200'
    }`}>
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`material-icons-round ${hasFailed ? 'text-red-500' : 'text-amber-500'}`}>
          {hasFailed ? 'error' : 'sync'}
        </span>
        <h3 className={`font-bold ${hasFailed ? 'text-red-700' : 'text-amber-700'}`}>
          {hasFailed ? '数据准备失败，无法继续' : '正在准备数据...'}
        </h3>
      </div>

      {/* 任务列表 */}
      <div className="space-y-1 mb-4">
        {tasks.map((task, index) => (
          <div key={index} className="border-t border-gray-200/50 first:border-0">
            {renderTaskStatus(task)}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      {hasFailed && onRetry && (
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            disabled={retryLoading}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {retryLoading ? '重试中...' : '重试'}
          </button>
          <a
            href="https://yunwu.apifox.cn/doc-5459026.md"
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-4 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            联系管理员
          </a>
        </div>
      )}

      {/* 等待提示 */}
      {isProcessing && !hasFailed && (
        <p className="text-xs text-amber-600 text-center">
          请稍候，正在为您准备数据...
        </p>
      )}
    </div>
  );
};
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/components/AsyncTaskStatusCard.tsx
git commit -m "feat: 新增前置任务状态卡片组件"
```

---

## 任务 6：前端任务管理 Hook

**文件：**
- 创建：`apps/web/pages/fission/hooks/useFissionTaskManager.ts`

- [ ] **步骤 1：创建 Hook 文件**

```typescript
/**
 * 裂变任务管理 Hook
 * 处理任务状态获取、轮询、重试逻辑
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { realProjectsApi } from '../../../services/realApi';
import type { FissionTaskItemRecord, TaskProgress, MergeCondition } from '../types';

interface UseFissionTaskManagerOptions {
  fissionId: string | null;
  token: string | null;
  autoPoll?: boolean;
  pollInterval?: number;
}

interface UseFissionTaskManagerReturn {
  // 状态
  taskItems: FissionTaskItemRecord[];
  progress: TaskProgress | null;
  mergeCondition: MergeCondition | null;
  status: 'idle' | 'running' | 'completed' | 'partial_complete' | 'failed';
  loading: boolean;
  error: string | null;
  
  // 方法
  fetchStatus: () => Promise<void>;
  advanceTasks: () => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  
  // 计算属性
  canMerge: boolean;
  failedItems: FissionTaskItemRecord[];
  processingItems: FissionTaskItemRecord[];
}

export function useFissionTaskManager(
  options: UseFissionTaskManagerOptions
): UseFissionTaskManagerReturn {
  const { fissionId, token, autoPoll = false, pollInterval = 3000 } = options;
  
  const [taskItems, setTaskItems] = useState<FissionTaskItemRecord[]>([]);
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [mergeCondition, setMergeCondition] = useState<MergeCondition | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'partial_complete' | 'failed'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(autoPoll);

  // 获取任务状态
  const fetchStatus = useCallback(async () => {
    if (!fissionId || !token) return;
    
    try {
      const result = await realProjectsApi.getFissionTasksStatus(token, fissionId);
      if (result.success) {
        setTaskItems(result.taskItems);
        setProgress(result.progress);
        setMergeCondition(result.mergeCondition);
        setStatus(result.status);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取状态失败');
    }
  }, [fissionId, token]);

  // 推进任务
  const advanceTasks = useCallback(async () => {
    if (!fissionId || !token) return;
    
    setLoading(true);
    try {
      await realProjectsApi.advanceFissionTasks(token, { fissionVideoStatusId: fissionId });
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '推进任务失败');
    } finally {
      setLoading(false);
    }
  }, [fissionId, token, fetchStatus]);

  // 重试单个任务
  const retryTask = useCallback(async (taskId: string) => {
    if (!fissionId || !token) return;
    
    setLoading(true);
    try {
      await realProjectsApi.retryFissionTaskItems(token, {
        fissionVideoStatusId: fissionId,
        taskIds: [taskId],
      });
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重试失败');
    } finally {
      setLoading(false);
    }
  }, [fissionId, token, fetchStatus]);

  // 重试所有失败项
  const retryAllFailed = useCallback(async () => {
    if (!fissionId || !token) return;
    
    setLoading(true);
    try {
      await realProjectsApi.retryFissionTaskItems(token, {
        fissionVideoStatusId: fissionId,
      });
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量重试失败');
    } finally {
      setLoading(false);
    }
  }, [fissionId, token, fetchStatus]);

  // 轮询控制
  const startPolling = useCallback(() => setIsPolling(true), []);
  const stopPolling = useCallback(() => setIsPolling(false), []);

  // 轮询效果
  useEffect(() => {
    if (!isPolling || !fissionId || !token) return;
    
    const poll = async () => {
      await advanceTasks();
    };
    
    // 立即执行一次
    poll();
    
    // 设置定时轮询
    const interval = setInterval(poll, pollInterval);
    
    return () => clearInterval(interval);
  }, [isPolling, fissionId, token, advanceTasks, pollInterval]);

  // 计算属性
  const canMerge = useMemo(() => mergeCondition?.canMerge ?? false, [mergeCondition]);
  
  const failedItems = useMemo(() => 
    taskItems.filter(item => 
      item.imageStatus === 'failed' || item.videoStatus === 'failed'
    ),
    [taskItems]
  );
  
  const processingItems = useMemo(() =>
    taskItems.filter(item =>
      item.imageStatus === 'processing' || item.videoStatus === 'processing'
    ),
    [taskItems]
  );

  return {
    taskItems,
    progress,
    mergeCondition,
    status,
    loading,
    error,
    fetchStatus,
    advanceTasks,
    retryTask,
    retryAllFailed,
    startPolling,
    stopPolling,
    canMerge,
    failedItems,
    processingItems,
  };
}
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/hooks/useFissionTaskManager.ts
git commit -m "feat: 新增裂变任务管理 Hook"
```

---

## 任务 7：前端任务卡片组件

**文件：**
- 创建：`apps/web/pages/fission/components/FissionTaskCard.tsx`

- [ ] **步骤 1：创建任务卡片组件**

```tsx
/**
 * 裂变任务卡片组件
 * 显示单个任务的状态、内容、重试按钮
 */

import React from 'react';
import type { FissionTaskItemRecord } from '../types';

interface FissionTaskCardProps {
  item: FissionTaskItemRecord;
  relatedItem?: FissionTaskItemRecord | null; // 关联的任务（视频任务对应的图片任务）
  isProcessing: boolean;
  onRetry: () => void;
  onPreview: (type: 'image' | 'video') => void;
}

const MAX_RETRY_COUNT = 2;

const statusConfig = {
  pending: {
    icon: 'schedule',
    label: '等待中',
    borderColor: 'border-slate-200',
    bgColor: 'bg-slate-50',
    textColor: 'text-slate-500',
  },
  processing: {
    icon: 'autorenew',
    label: '生成中',
    borderColor: 'border-amber-300 animate-pulse',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
  },
  completed: {
    icon: 'check_circle',
    label: '已完成',
    borderColor: 'border-emerald-300',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
  },
  failed: {
    icon: 'error',
    label: '失败',
    borderColor: 'border-red-300',
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
  },
};

export const FissionTaskCard: React.FC<FissionTaskCardProps> = ({
  item,
  relatedItem,
  isProcessing,
  onRetry,
  onPreview,
}) => {
  const isImageTask = item.taskType.includes('image');
  const currentStatus = isImageTask ? item.imageStatus : item.videoStatus;
  const config = statusConfig[currentStatus];
  
  // 检查图片任务是否可重试
  const canRetryImage = isImageTask && 
    item.imageStatus === 'failed' && 
    item.retryCount < MAX_RETRY_COUNT &&
    (!relatedItem || relatedItem.videoStatus === 'pending');
  
  // 检查视频任务是否可重试
  const canRetryVideo = !isImageTask && 
    item.videoStatus === 'failed' && 
    item.retryCount < MAX_RETRY_COUNT;
  
  const canRetry = isImageTask ? canRetryImage : canRetryVideo;
  const isLocked = isImageTask && 
    item.imageStatus === 'failed' && 
    relatedItem && 
    relatedItem.videoStatus !== 'pending';

  const taskTypeLabel = item.taskType.includes('mirror') ? '新镜像' : '新故事';
  const mediaTypeLabel = isImageTask ? '图片' : '视频';

  return (
    <div
      className={`
        relative rounded-2xl border-2 transition-all duration-300
        ${config.borderColor} ${config.bgColor}
        ${currentStatus === 'processing' ? 'shadow-lg shadow-amber-200/50' : ''}
      `}
    >
      {/* 任务类型标签 */}
      <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border shadow-sm">
        {taskTypeLabel}{mediaTypeLabel}#{item.itemIndex + 1}
      </div>

      {/* 内容区 */}
      <div className="p-4 pt-6">
        {/* 已完成：显示缩略图 */}
        {currentStatus === 'completed' && (
          <div className="aspect-[9/16] rounded-xl overflow-hidden bg-gray-100">
            {isImageTask && item.imageUrl ? (
              <img 
                src={item.imageUrl} 
                className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                onClick={() => onPreview('image')}
                alt=""
              />
            ) : !isImageTask && item.videoUrl ? (
              <video 
                src={item.videoUrl} 
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => onPreview('video')}
                muted
                playsInline
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-icons-round text-4xl text-gray-300">broken_image</span>
              </div>
            )}
          </div>
        )}

        {/* 生成中 */}
        {currentStatus === 'processing' && (
          <div className="aspect-[9/16] rounded-xl bg-gradient-to-br from-amber-100 to-orange-50 flex items-center justify-center">
            <div className="text-center">
              <span className="material-icons-round text-4xl text-amber-500 animate-spin">
                autorenew
              </span>
              <p className="text-sm text-amber-600 mt-2">生成中...</p>
            </div>
          </div>
        )}

        {/* 等待中 */}
        {currentStatus === 'pending' && (
          <div className="aspect-[9/16] rounded-xl bg-slate-100 flex items-center justify-center">
            <div className="text-center">
              <span className="material-icons-round text-4xl text-slate-300">
                schedule
              </span>
              <p className="text-sm text-slate-400 mt-2">等待中</p>
              {!isImageTask && item.parentTaskId && (
                <p className="text-xs text-slate-300 mt-1">等待图片完成</p>
              )}
            </div>
          </div>
        )}

        {/* 失败 */}
        {currentStatus === 'failed' && (
          <div className="aspect-[9/16] rounded-xl bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center">
            <div className="text-center px-4">
              <span className="material-icons-round text-4xl text-red-400">
                {isLocked ? 'lock' : 'error'}
              </span>
              <p className="text-sm text-red-500 mt-2 font-medium">
                {isLocked ? '已锁定' : '生成失败'}
              </p>
              {!isLocked && item.imageErrorMessage && (
                <p className="text-xs text-red-400 mt-1 line-clamp-2">
                  {isImageTask ? item.imageErrorMessage : item.videoErrorMessage}
                </p>
              )}
              {isLocked && (
                <p className="text-xs text-gray-400 mt-1">视频已生成，图片不可重试</p>
              )}
              {canRetry && (
                <button
                  onClick={onRetry}
                  disabled={isProcessing}
                  className="mt-3 px-4 py-1.5 bg-red-500 text-white text-xs rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  重试 ({MAX_RETRY_COUNT - item.retryCount}次)
                </button>
              )}
              {!canRetry && !isLocked && (
                <p className="text-xs text-red-400 mt-2">已达重试上限</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className={`px-4 py-2 border-t ${config.borderColor} flex items-center justify-between`}>
        <span className={`text-xs font-medium ${config.textColor}`}>
          {config.label}
        </span>
        {currentStatus === 'completed' && (
          <button
            onClick={() => onPreview(isImageTask ? 'image' : 'video')}
            className="text-xs text-primary hover:underline"
          >
            预览
          </button>
        )}
        {item.retryCount > 0 && (
          <span className="text-xs text-gray-400">
            重试 {item.retryCount} 次
          </span>
        )}
      </div>
    </div>
  );
};
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/components/FissionTaskCard.tsx
git commit -m "feat: 新增裂变任务卡片组件"
```

---

## 任务 8：前端任务网格组件

**文件：**
- 创建：`apps/web/pages/fission/components/FissionTaskGrid.tsx`

- [ ] **步骤 1：创建任务网格组件**

```tsx
/**
 * 裂变任务网格组件
 * 展示所有任务卡片，支持按类型分组
 */

import React, { useMemo } from 'react';
import { FissionTaskCard } from './FissionTaskCard';
import type { FissionTaskItemRecord } from '../types';

interface FissionTaskGridProps {
  taskItems: FissionTaskItemRecord[];
  isProcessing: boolean;
  onRetry: (taskId: string) => void;
  onPreview: (item: FissionTaskItemRecord, type: 'image' | 'video') => void;
}

export const FissionTaskGrid: React.FC<FissionTaskGridProps> = ({
  taskItems,
  isProcessing,
  onRetry,
  onPreview,
}) => {
  // 按类型分组
  const groupedItems = useMemo(() => {
    const newMirrorImages = taskItems.filter(i => i.taskType === 'new_mirror_image');
    const newMirrorVideos = taskItems.filter(i => i.taskType === 'new_mirror_video');
    const newStoryImages = taskItems.filter(i => i.taskType === 'new_story_image');
    const newStoryVideos = taskItems.filter(i => i.taskType === 'new_story_video');

    return { newMirrorImages, newMirrorVideos, newStoryImages, newStoryVideos };
  }, [taskItems]);

  // 构建父子关系映射
  const parentMap = useMemo(() => {
    const map = new Map<string, FissionTaskItemRecord>();
    for (const item of taskItems) {
      if (item.parentTaskId) {
        const parent = taskItems.find(i => i.id === item.parentTaskId);
        if (parent) {
          map.set(item.id, parent);
        }
      }
    }
    return map;
  }, [taskItems]);

  // 渲染单个分组
  const renderGroup = (
    title: string,
    items: FissionTaskItemRecord[],
    relatedItems?: FissionTaskItemRecord[]
  ) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="material-icons-round text-primary text-base">
            {title.includes('镜像') ? 'flip' : 'auto_stories'}
          </span>
          {title}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item, index) => {
            // 对于视频任务，找到对应的图片任务
            const relatedItem = item.parentTaskId 
              ? parentMap.get(item.id) 
              : relatedItems?.[index];

            return (
              <FissionTaskCard
                key={item.id}
                item={item}
                relatedItem={relatedItem}
                isProcessing={isProcessing}
                onRetry={() => onRetry(item.id)}
                onPreview={(type) => onPreview(item, type)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* 裂变新镜像组 */}
      {renderGroup(
        '裂变新镜像',
        [...groupedItems.newMirrorImages, ...groupedItems.newMirrorVideos]
          .sort((a, b) => {
            if (a.taskType === b.taskType) return a.itemIndex - b.itemIndex;
            return a.taskType.includes('image') ? -1 : 1;
          })
      )}

      {/* 新故事组 */}
      {renderGroup(
        '新故事',
        [...groupedItems.newStoryImages, ...groupedItems.newStoryVideos]
          .sort((a, b) => {
            if (a.taskType === b.taskType) return a.itemIndex - b.itemIndex;
            return a.taskType.includes('image') ? -1 : 1;
          })
      )}
    </div>
  );
};
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/components/FissionTaskGrid.tsx
git commit -m "feat: 新增裂变任务网格组件"
```

---

## 任务 9：前端进度概览组件

**文件：**
- 创建：`apps/web/pages/fission/components/FissionProgressOverview.tsx`

- [ ] **步骤 1：创建进度概览组件**

```tsx
/**
 * 裂变进度概览组件
 * 显示新镜像和新故事的进度统计
 */

import React from 'react';
import type { TaskProgress, MergeCondition } from '../types';

interface FissionProgressOverviewProps {
  progress: TaskProgress | null;
  mergeCondition: MergeCondition | null;
  onMerge?: () => void;
  onRetryAll?: () => void;
  retryLoading: boolean;
}

export const FissionProgressOverview: React.FC<FissionProgressOverviewProps> = ({
  progress,
  mergeCondition,
  onMerge,
  onRetryAll,
  retryLoading,
}) => {
  if (!progress) return null;

  // 计算总体进度
  const calculatePercent = (p: typeof progress.newMirrorImage) => {
    if (p.total === 0) return 0;
    return Math.round((p.completed / p.total) * 100);
  };

  const newMirrorImagePercent = calculatePercent(progress.newMirrorImage);
  const newMirrorVideoPercent = calculatePercent(progress.newMirrorVideo);
  const newStoryImagePercent = calculatePercent(progress.newStoryImage);
  const newStoryVideoPercent = calculatePercent(progress.newStoryVideo);

  // 渲染单个进度卡片
  const renderProgressCard = (
    title: string,
    imageProgress: typeof progress.newMirrorImage,
    videoProgress: typeof progress.newMirrorVideo
  ) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h4 className="text-sm font-bold text-gray-700 mb-3">{title}</h4>
      
      {/* 图片进度 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>图片</span>
          <span>{imageProgress.completed}/{imageProgress.total}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${calculatePercent(imageProgress)}%` }}
          />
        </div>
        {imageProgress.failed > 0 && (
          <span className="text-xs text-red-500 mt-1 block">
            {imageProgress.failed} 个失败
          </span>
        )}
      </div>

      {/* 视频进度 */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>视频</span>
          <span>{videoProgress.completed}/{videoProgress.total}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${calculatePercent(videoProgress)}%` }}
          />
        </div>
        {videoProgress.failed > 0 && (
          <span className="text-xs text-red-500 mt-1 block">
            {videoProgress.failed} 个失败
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">任务进度</h3>
        {mergeCondition && (
          <div className={`text-xs px-2 py-1 rounded-full ${
            mergeCondition.canMerge 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
          }`}>
            {mergeCondition.canMerge ? '可合并' : '待完成'}
          </div>
        )}
      </div>

      {/* 进度卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {renderProgressCard('裂变新镜像', progress.newMirrorImage, progress.newMirrorVideo)}
        {renderProgressCard('新故事', progress.newStoryImage, progress.newStoryVideo)}
      </div>

      {/* 合并条件提示 */}
      {mergeCondition && !mergeCondition.canMerge && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 text-amber-700">
            <span className="material-icons-round text-sm">info</span>
            <span className="font-medium text-sm">暂不能合并视频</span>
          </div>
          <p className="text-xs text-amber-600 mt-1">{mergeCondition.reason}</p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3">
        {mergeCondition?.canMerge && onMerge && (
          <button
            onClick={onMerge}
            className="flex-1 py-2.5 bg-gradient-to-r from-primary to-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl transition-shadow"
          >
            <span className="material-icons-round text-base">merge</span>
            开始合并
          </button>
        )}
        
        {!mergeCondition?.canMerge && onRetryAll && (
          <button
            onClick={onRetryAll}
            disabled={retryLoading}
            className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <span className="material-icons-round text-base">refresh</span>
            {retryLoading ? '重试中...' : '重试失败项'}
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/components/FissionProgressOverview.tsx
git commit -m "feat: 新增裂变进度概览组件"
```

---

## 任务 10：前端失败项汇总组件

**文件：**
- 创建：`apps/web/pages/fission/components/FailedTasksSummary.tsx`

- [ ] **步骤 1：创建失败项汇总组件**

```tsx
/**
 * 失败任务汇总组件
 * 显示所有失败项，支持单项重试和批量重试
 */

import React from 'react';
import type { FissionTaskItemRecord } from '../types';

interface FailedTasksSummaryProps {
  failedItems: FissionTaskItemRecord[];
  allItems: FissionTaskItemRecord[]; // 用于检查锁定状态
  onRetry: (taskId: string) => void;
  onRetryAll: () => void;
  retryLoading: boolean;
}

const MAX_RETRY_COUNT = 2;

export const FailedTasksSummary: React.FC<FailedTasksSummaryProps> = ({
  failedItems,
  allItems,
  onRetry,
  onRetryAll,
  retryLoading,
}) => {
  if (failedItems.length === 0) return null;

  // 检查是否可重试
  const canRetryItem = (item: FissionTaskItemRecord): boolean => {
    const isImageTask = item.taskType.includes('image');
    
    if (isImageTask) {
      // 图片任务：检查重试次数和锁定状态
      if (item.retryCount >= MAX_RETRY_COUNT) return false;
      
      // 检查对应的视频任务是否已启动
      const videoTask = allItems.find(i => i.parentTaskId === item.id);
      if (videoTask && videoTask.videoStatus !== 'pending') return false;
      
      return true;
    } else {
      // 视频任务：只检查重试次数
      return item.retryCount < MAX_RETRY_COUNT;
    }
  };

  const retryableItems = failedItems.filter(canRetryItem);
  const taskTypeLabel = (type: string) => {
    if (type.includes('mirror')) return type.includes('image') ? '新镜像图片' : '新镜像视频';
    return type.includes('image') ? '新故事图片' : '新故事视频';
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-red-500">warning</span>
          <h3 className="text-lg font-bold text-red-700">失败项</h3>
          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
            {failedItems.length} 项
          </span>
        </div>
        
        {retryableItems.length > 0 && (
          <button
            onClick={onRetryAll}
            disabled={retryLoading}
            className="px-4 py-1.5 bg-red-500 text-white text-xs rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {retryLoading ? '重试中...' : '重试全部'}
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {failedItems.map(item => {
          const isImageTask = item.taskType.includes('image');
          const errorMessage = isImageTask ? item.imageErrorMessage : item.videoErrorMessage;
          const canRetry = canRetryItem(item);
          const isLocked = !canRetry && isImageTask && item.retryCount < MAX_RETRY_COUNT;

          return (
            <div
              key={item.id}
              className="bg-white rounded-xl p-3 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {taskTypeLabel(item.taskType)} #{item.itemIndex + 1}
                  </span>
                  {isLocked && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <span className="material-icons-round text-xs">lock</span>
                      已锁定
                    </span>
                  )}
                  {item.retryCount > 0 && (
                    <span className="text-xs text-gray-400">
                      重试 {item.retryCount} 次
                    </span>
                  )}
                </div>
                {errorMessage && (
                  <p className="text-xs text-red-500 mt-1 line-clamp-1">{errorMessage}</p>
                )}
              </div>
              
              {canRetry && (
                <button
                  onClick={() => onRetry(item.id)}
                  disabled={retryLoading}
                  className="ml-3 px-3 py-1 bg-red-100 text-red-600 text-xs rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  重试
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/fission/components/FailedTasksSummary.tsx
git commit -m "feat: 新增失败项汇总组件"
```

---

## 任务 11：集成到裂变页面

**文件：**
- 修改：`apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx`

**集成策略：**
- 新增前置任务状态检查（异步任务：新故事、专业提示词）
- 替换现有的 `ParallelFissionProgress` 组件为新的任务管理界面
- 保持现有的弹窗选择数量流程不变
- 新增"开始合并"按钮，手动触发合并操作

- [ ] **步骤 1：导入新组件**

```tsx
import { AsyncTaskStatusCard } from '../../fission/components/AsyncTaskStatusCard';
import { FissionProgressOverview } from '../../fission/components/FissionProgressOverview';
import { FissionTaskGrid } from '../../fission/components/FissionTaskGrid';
import { FailedTasksSummary } from '../../fission/components/FailedTasksSummary';
import { useFissionTaskManager } from '../../fission/hooks/useFissionTaskManager';
```

- [ ] **步骤 2：添加异步任务状态检查**

```tsx
// 获取异步任务状态
const [asyncTaskStatus, setAsyncTaskStatus] = useState<{
  newStoryAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  shotPromptsAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  asyncFailedStage: 'new_story' | 'shot_prompts' | null;
} | null>(null);

const [asyncTaskLoading, setAsyncTaskLoading] = useState(false);

// 检查异步任务状态
const checkAsyncTaskStatus = useCallback(async () => {
  if (!token || !fissionVideoStatus?.id) return;

  try {
    const result = await realProjectsApi.getFissionAsyncStatus(token, fissionVideoStatus.id);
    setAsyncTaskStatus(result);

    // 如果还在处理中，继续轮询
    if (result.newStoryAsyncStatus === 'processing' || result.shotPromptsAsyncStatus === 'processing') {
      setTimeout(checkAsyncTaskStatus, 3000);
    }
  } catch (error) {
    console.error('获取异步任务状态失败:', error);
  }
}, [token, fissionVideoStatus?.id]);

// 重试异步任务
const retryAsyncTask = useCallback(async () => {
  if (!token || !fissionVideoStatus?.id) return;

  setAsyncTaskLoading(true);
  try {
    await realProjectsApi.retryFissionAsyncTask(token, fissionVideoStatus.id);
    // 重新检查状态
    await checkAsyncTaskStatus();
  } catch (error) {
    showMessage({ type: 'error', text: '重试失败，请稍后再试' });
  } finally {
    setAsyncTaskLoading(false);
  }
}, [token, fissionVideoStatus?.id, checkAsyncTaskStatus, showMessage]);

// 初始化时检查异步任务状态
useEffect(() => {
  if (fissionVideoStatus?.id) {
    checkAsyncTaskStatus();
  }
}, [fissionVideoStatus?.id, checkAsyncTaskStatus]);

// 计算前置任务是否完成
const asyncTaskCompleted = asyncTaskStatus?.newStoryAsyncStatus === 'completed' &&
                           asyncTaskStatus?.shotPromptsAsyncStatus === 'completed';
const asyncTaskFailed = asyncTaskStatus?.newStoryAsyncStatus === 'failed' ||
                        asyncTaskStatus?.shotPromptsAsyncStatus === 'failed';
```

- [ ] **步骤 3：添加任务管理 Hook**

```tsx
// 在组件内部，从 useFissionVideo 解构出 token 和 fissionVideoStatus
const token = useAppStore((s) => s.token);

// 使用任务管理 Hook（只有前置任务完成后才启动）
const {
  taskItems,
  progress,
  mergeCondition,
  status: taskStatus,
  loading: taskLoading,
  failedItems,
  canMerge,
  advanceTasks,
  retryTask,
  retryAllFailed,
  startPolling,
  stopPolling,
} = useFissionTaskManager({
  fissionId: asyncTaskCompleted ? (fissionVideoStatus?.id || null) : null,
  token,
  autoPoll: fissionVideoStatus?.status === 'parallel_running' && asyncTaskCompleted,
});
```

- [ ] **步骤 4：添加合并处理函数**

```tsx
// 手动合并处理
const handleMergeVideos = useCallback(async () => {
  if (!canMerge || !fissionVideoStatus?.id) return;

  try {
    // 调用合并 API
    await realProjectsApi.mergeFissionVideos(token!, {
      fissionVideoStatusId: fissionVideoStatus.id,
    });
    showMessage({ type: 'success', text: '合并成功' });
    // 刷新数据
    refetchProgress();
  } catch (error) {
    showMessage({ type: 'error', text: '合并失败，请重试' });
  }
}, [canMerge, fissionVideoStatus?.id, token, showMessage, refetchProgress]);
```

- [ ] **步骤 5：添加前置任务状态展示区域**

在原始视频卡片下方、任务管理界面上方添加：

```tsx
{/* 前置任务状态卡片（异步任务未完成或失败时显示） */}
{fissionVideoStatus?.id && !asyncTaskCompleted && (
  <AsyncTaskStatusCard
    tasks={[
      {
        name: '新故事生成',
        status: asyncTaskStatus?.newStoryAsyncStatus || 'pending',
      },
      {
        name: '专业提示词',
        status: asyncTaskStatus?.shotPromptsAsyncStatus || 'pending',
      },
    ]}
    onRetry={retryAsyncTask}
    retryLoading={asyncTaskLoading}
  />
)}
```

- [ ] **步骤 6：替换 ParallelFissionProgress 组件**

找到现有的 `ParallelFissionProgress` 组件调用位置（约 297-311 行），替换为：

```tsx
{/* 任务管理界面（前置任务完成后显示） */}
{asyncTaskCompleted && fissionVideoStatus?.status === 'parallel_running' && taskItems.length > 0 && (
  <div className="space-y-6">
    {/* 进度概览 + 合并按钮 */}
    <FissionProgressOverview
      progress={progress}
      mergeCondition={mergeCondition}
      onMerge={handleMergeVideos}
      onRetryAll={retryAllFailed}
      retryLoading={taskLoading}
    />

    {/* 任务卡片网格 */}
    <FissionTaskGrid
      taskItems={taskItems}
      isProcessing={taskLoading}
      onRetry={retryTask}
      onPreview={(item, type) => {
        // 处理预览
        if (type === 'image' && item.imageUrl) {
          // 使用现有的图片预览机制
          setImagePreview({
            frames: [{ index: 0, title: `图片 ${item.itemIndex + 1}`, imageUrl: item.imageUrl }],
            currentIndex: 0,
          });
        } else if (type === 'video' && item.videoUrl) {
          // 使用现有的视频预览机制
          setVideoPreview({
            clips: [{ index: 0, title: `视频 ${item.itemIndex + 1}`, thumbnailUrl: item.videoUrl }],
            currentIndex: 0,
          });
        }
      }}
    />
    
    {/* 失败项汇总 */}
    {failedItems.length > 0 && (
      <FailedTasksSummary
        failedItems={failedItems}
        allItems={taskItems}
        onRetry={retryTask}
        onRetryAll={retryAllFailed}
        retryLoading={taskLoading}
      />
    )}
  </div>
)}
```

- [ ] **步骤 7：删除旧的 ParallelFissionProgress 组件定义**

删除文件末尾的 `ParallelFissionProgress` 组件定义（约 964-1079 行），已被新组件替代。

- [ ] **步骤 8：更新弹窗确认逻辑**

确保弹窗确认后正确创建任务项：

```tsx
// 在弹窗确认按钮的 onClick 中
onClick={async () => {
  if (generateVideoLoading) return;
  setFissionModalOpen(false);
  
  // 根据当前状态选择执行逻辑
  if (fissionButtonState.action === 'continue') {
    // 再次裂变：仅执行组合+合并
    handleContinueFissionNew();
  } else {
    // 新裂变：创建任务项并启动
    const result = await realProjectsApi.createFissionTaskItems(token!, {
      projectId: projectId!,
      fissionVideoStatusId: fissionVideoStatus!.id,
      newMirrorCount: Math.ceil(clipVideos.length / 2), // 奇数分镜数量
      newStoryCount: 2, // 固定2个新故事
    });
    
    if (result.success) {
      // 启动轮询
      startPolling();
    }
  }
  
  // 滚动到结果区域
  requestAnimationFrame(() => {
    fissionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}}
```

- [ ] **步骤 9：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 10：Commit**

```bash
git add apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx
git commit -m "feat: 集成裂变任务管理界面到裂变页面"
```

---

## 任务 12：端到端测试

- [ ] **步骤 1：编译项目**

运行：`npm run build && npm run build:ui`

- [ ] **步骤 2：测试数据库迁移**

验证数据库字段已正确添加：
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'nrm_fission_task_items';
```

- [ ] **步骤 3：测试创建任务项 API**

```bash
curl -X POST http://localhost:3020/fission/tasks/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-id",
    "fissionVideoStatusId": "test-fission-id",
    "newMirrorCount": 3,
    "newStoryCount": 2
  }'
```

- [ ] **步骤 4：测试获取状态 API**

```bash
curl http://localhost:3020/fission/tasks/status/<fissionId> \
  -H "Authorization: Bearer <token>"
```

- [ ] **步骤 5：测试重试 API**

```bash
curl -X POST http://localhost:3020/fission/tasks/retry \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fissionVideoStatusId": "<fissionId>",
    "taskIds": ["<taskId>"]
  }'
```

- [ ] **步骤 6：测试前端页面**

1. 启动前端开发服务：`npm --prefix apps/web run dev`
2. 访问裂变页面
3. 点击"一键裂变"
4. 验证任务卡片网格显示
5. 验证进度更新
6. 验证重试功能

---

## 验收标准

| 功能 | 验证方式 |
|------|----------|
| 数据库字段添加 | SQL 查询 |
| 创建任务项 API | curl 测试 |
| 获取任务状态 API | curl 测试 |
| 重试失败项 API | curl 测试 |
| 任务卡片网格渲染 | 前端页面检查 |
| 进度概览显示 | 前端页面检查 |
| 失败项汇总 | 前端页面检查 |
| 图片锁定逻辑 | 视频启动后重试图片 |
| 合并条件检查 | 不满足条件时显示提示 |
| 超时机制 | 等待 10 分钟 |

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有数据迁移 | 高 | 新增字段允许 NULL，不影响现有数据 |
| 任务推进逻辑复杂 | 中 | 分步实现，先框架后细节 |
| 前端轮询性能 | 低 | 3秒间隔，数据量小 |
| 组件状态管理 | 中 | 使用 Hook 集中管理状态 |
