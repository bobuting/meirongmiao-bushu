# Step6 裂变视频确认功能设计

**创建日期**: 2026-05-19
**状态**: 设计完成，待实现
**关联文档**: `2026-05-09-fission-retry-variant-design.md`（变体重试方案）

---

## 一、背景与需求

### 1.1 当前问题

现有裂变流程中，图片和视频任务是流水线式自动执行的：

1. `shot_prompts` executor 创建 `image` job + `video_submit` job（dependsOn image）
2. image 完成后自动 promote video_submit
3. 全部 video 完成后进入 combination

用户无法在图片生成完成后进行确认，如果对图片不满意，只能等整个流程结束后重试。

### 1.2 用户需求

用户希望：

1. **图片生成完成后暂停**：等待用户确认图片是否满意
2. **不满意可重试**：对不满意的图片可重新生成（复用变体功能）
3. **确认后继续生成视频**：用户点击确认后，批量启动所有视频生成任务

---

## 二、设计方案概览

### 2.1 核心设计原则

- **新增中间状态**：`PENDING_VIDEO_CONFIRMATION` 表示等待用户确认
- **拆分任务创建**：图片任务先创建，视频任务延迟到用户确认后创建
- **复用变体功能**：重试图片时追加变体，用户可选择保留版本
- **自动状态转换**：所有图片完成后自动进入确认状态

### 2.2 新流程状态机

```
CREATING → ORGANIZING_MIRROR → PARALLEL_RUNNING → PENDING_VIDEO_CONFIRMATION → VIDEO_GENERATING → COMBINING → READY_FOR_MERGE → COMPLETED
```

新增状态：

| 状态 | 说明 | 触发条件 |
|------|------|---------|
| `PENDING_VIDEO_CONFIRMATION` | 等待用户确认后生成视频 | 所有图片成功完成 |
| `VIDEO_GENERATING` | 视频生成中 | 用户点击确认后 |

---

## 三、状态机变更

### 3.1 状态枚举新增

**文件**: `src/modules/fission-video/fission-video-config.ts`

```typescript
export enum FissionStatus {
  // ... 现有状态
  /** 等待用户确认后生成视频（所有图片已完成） */
  PENDING_VIDEO_CONFIRMATION = "pending_video_confirmation",
  /** 视频生成中 */
  VIDEO_GENERATING = "video_generating",
}
```

### 3.2 状态标签映射

```typescript
export const FISSION_STATUS_LABELS: Record<FissionStatus, string> = {
  // ... 现有映射
  [FissionStatus.PENDING_VIDEO_CONFIRMATION]: "等待确认视频",
  [FissionStatus.VIDEO_GENERATING]: "视频生成中",
};
```

### 3.3 状态转换逻辑

| 当前状态 | 条件 | 目标状态 |
|---------|------|---------|
| `PARALLEL_RUNNING` | 所有 image job **成功完成** | `PENDING_VIDEO_CONFIRMATION` |
| `PARALLEL_RUNNING` | 有 image job 失败/进行中 | 保持 `PARALLEL_RUNNING` |
| `PENDING_VIDEO_CONFIRMATION` | 用户点击"确认并生成视频" | `VIDEO_GENERATING` |
| `VIDEO_GENERATING` | 所有 video job 完成 | `COMBINING`（现有逻辑） |

---

## 四、API 设计

### 4.1 新增接口：确认生成视频

**接口路径**: `POST /fission/confirm-video`

**触发条件**: 状态为 `PENDING_VIDEO_CONFIRMATION` 时可用

**请求参数**:

```typescript
interface ConfirmVideoRequest {
  projectId: string;
}
```

**响应**:

```typescript
interface ConfirmVideoResponse {
  success: boolean;
  videoJobCount: number;  // 创建的视频任务数量
  message: string;
}
```

**后端逻辑**:

1. 验证当前状态为 `PENDING_VIDEO_CONFIRMATION`
2. 获取所有 `task_items`（image_video + new_story）
3. 获取提示词（从 `shot_prompts` 服务）
4. 批量创建 `video_submit` job（每个分镜一个）
5. 创建 `combination` job（dependsOn 所有 video_submit）
6. 更新状态为 `VIDEO_GENERATING`
7. 触发 `tryPromote()` 启动视频任务

### 4.2 扩展现有接口：状态查询

**接口路径**: `GET /fission/status/:id`

**响应增强**:

```typescript
interface FissionVideoStatusResponse {
  // ... 现有字段
  status: FissionStatus;

  // 新增字段
  /** 是否可以确认生成视频 */
  canConfirmVideo: boolean;
  /** 图片完成数量 */
  imageCompletedCount: number;
  /** 图片总数量 */
  imageTotalCount: number;
  /** 图片失败数量 */
  imageFailedCount: number;
}
```

### 4.3 重试图片（复用变体设计）

**接口路径**: `POST /fission/items/retry`

复用 `2026-05-09-fission-retry-variant-design.md` 中的重试接口，`retryType: "image"`

重试成功后，后端需检查是否所有图片完成，满足条件则自动转换状态。

---

## 五、后端执行器改造

### 5.1 变更：`shot_prompts` executor

**文件**: `src/modules/fission-video/fission-shot-prompts-executor.ts`

**改造前**：

```
createDownstreamTasks() → image job + video_submit job + combination job
```

**改造后**：

```
createDownstreamTasks() → 仅 image job
```

**具体变更**：

1. `createItemJobs` 方法只创建 image job，不再创建 video_submit job
2. 移除 `videoSubmitJobIds` 收集逻辑
3. 移除 `createCombinationJob` 调用

### 5.2 变更：`image` executor

**文件**: `src/modules/fission-video/fission-item-image-executor.ts`

在 `advanceOnce` 方法中，图片完成时增加状态检查：

```typescript
// 图片完成后的逻辑（新增）
if (item) {
  await this.taskItemsService.updateImageStatus(item.id, ...);

  // 检查是否所有图片已完成
  const allImageCompleted = await this.checkAllImagesCompleted(input.fissionVideoStatusId);
  if (allImageCompleted) {
    // 所有图片完成 → 转为 PENDING_VIDEO_CONFIRMATION
    await this.statusService.update(input.fissionVideoStatusId, {
      status: FissionStatus.PENDING_VIDEO_CONFIRMATION,
    });
  }
}
```

**`checkAllImagesCompleted` 逻辑**：

1. 查询所有 `task_items`（image_video + new_story）
2. 检查每个 item 的 `imageStatus === "completed"` 且 `imageUrl` 不为空
3. 全部满足则返回 `true`

### 5.3 新增：确认视频路由处理

**文件**: `src/routes/fission-video-routes.ts`

```typescript
// 核心逻辑
async function confirmVideo(request, reply) {
  const { projectId } = request.body;

  // 1. 获取状态记录，验证状态
  const status = await statusService.getByProject(projectId);
  if (status.status !== FissionStatus.PENDING_VIDEO_CONFIRMATION) {
    throw new AppError(400, "INVALID_STATUS", "当前状态不允许确认");
  }

  // 2. 获取所有 task_items 和提示词
  const items = [...imageVideoItems, ...newStoryItems];
  const prompts = await resolveShotPrompts(projectId);

  // 3. 批量创建 video_submit job
  const videoSubmitJobIds = [];
  for (const item of items) {
    const jobId = await createVideoSubmitJob(item, prompts, ...);
    videoSubmitJobIds.push(jobId);
  }

  // 4. 创建 combination job（dependsOn 所有 video_submit）
  await createCombinationJob(videoSubmitJobIds, ...);

  // 5. 更新状态为 VIDEO_GENERATING
  await statusService.update(status.id, {
    status: FissionStatus.VIDEO_GENERATING,
  });

  // 6. 启动任务调度
  await dispatcher.tryPromote();

  return { success: true, videoJobCount: videoSubmitJobIds.length };
}
```

### 5.4 重试图片后自动检查状态

重试图片成功后，同样调用 `checkAllImagesCompleted` 检查是否所有图片完成，满足条件则转换状态。

---

## 六、前端交互设计

### 6.1 页面状态对应 UI

| 状态 | UI 显示 |
|------|---------|
| `PARALLEL_RUNNING` | 显示图片生成进度，视频区域显示"等待图片完成" |
| `PENDING_VIDEO_CONFIRMATION` | 图片全部完成，显示确认按钮 + 重试按钮 |
| `VIDEO_GENERATING` | 视频生成进度，显示进度条 |
| `COMBINING` → `READY_FOR_MERGE` | 现有合并流程 |

### 6.2 `PENDING_VIDEO_CONFIRMATION` 状态界面布局

```
┌─────────────────────────────────────────────────────────┐
│  Step 6 视频裂变                              [历史侧边栏] │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  📸 分镜图片已生成完成                               ││
│  │                                                      ││
│  │  [分镜卡片网格 - 显示所有图片缩略图]                  ││
│  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐               ││
│  │  │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │ │ 6 │  ...          ││
│  │  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘               ││
│  │                                                      ││
│  │  点击图片可预览大图，不满意可重试                      ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  💡 请确认图片无误后开始生成视频                       ││
│  │                                                      ││
│  │  [🔄 重试失败图片]  [✅ 确认并生成视频]               ││
│  │                                                      ││
│  │  预计消耗 XXX 积分（视频生成）                       ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ─────────────────────────────────────────────────────── │
│  视频预览区域（置灰，显示"等待图片确认"）                   │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                   │
│  │ ? │ │ ? │ │ ? │ │ ? │ │ ? │ │ ? │  ...              │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 6.3 分镜卡片组件增强

在 `PENDING_VIDEO_CONFIRMATION` 状态下，每个分镜卡片支持：

```
┌───────────────────┐
│ V1/2        [#1] │  ← 变体徽章（如有变体）
│                   │
│   [图片预览]      │
│                   │
│   [🔄] [👁️]       │  ← 重试按钮 + 预览按钮
└───────────────────┘
```

点击图片 → 弹出大图预览 + 变体选择器（复用变体设计）

### 6.4 底部操作栏

| 状态 | 底部按钮 |
|------|---------|
| `PARALLEL_RUNNING` | 显示图片生成进度，禁用状态 |
| `PENDING_VIDEO_CONFIRMATION` | `[重试失败]` + `[确认并生成视频]`（主按钮，高亮） |
| `VIDEO_GENERATING` | 显示视频生成进度 |

### 6.5 点击"确认并生成视频"流程

1. 按钮旁显示预计消耗积分（隐式显示，不弹窗）
2. 用户点击 → 调用 `POST /fission/confirm-video`
3. 成功后状态变为 `VIDEO_GENERATING`
4. 页面自动刷新，显示视频生成进度

---

## 七、影响范围总结

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `fission-video-config.ts` | 新增枚举 | `PENDING_VIDEO_CONFIRMATION`、`VIDEO_GENERATING`、更新 `FISSION_STATUS_ORDER` |
| `fission-shot-prompts-executor.ts` | 修改 | 只创建 image job，不创建 video/combination |
| `fission-item-image-executor.ts` | 修改 | 完成后检查状态转换（含并发安全处理） |
| `fission-video-routes.ts` | 新增路由 | `POST /fission/confirm-video` |
| `fission-task-items-service.ts` | 新增方法 | `checkAllImagesCompleted`、图片进度计数改造 |
| `combination-executor.ts` | 无变更 | 状态保持为 `COMBINING`（由 dependsOn 保证时机） |
| 前端 `Step6FissionScreen.tsx` | 修改 | 新增确认界面状态、状态徽章映射 |
| 前端 `useFissionVideo.ts` | 修改 | 新增确认视频 API 调用 |

---

## 八、与变体设计的关联

本功能与 `2026-05-09-fission-retry-variant-design.md` 变体设计是互补关系：

| 功能 | 说明 |
|------|------|
| 变体重试 | 重试图片时追加变体，用户可选择保留版本 |
| 视频确认 | 图片完成后暂停，用户确认后生成视频 |

**交互流程**：

1. 图片生成完成 → 进入 `PENDING_VIDEO_CONFIRMATION`
2. 用户对某张图片不满意 → 点击重试 → 追加变体
3. 用户在变体选择器中选择满意版本
4. 所有图片满意后 → 点击"确认并生成视频"
5. 批量创建视频任务 → 进入 `VIDEO_GENERATING`

---

## 九、补充设计细节

### 9.1 裂变上下文与提示词获取

`confirm-video` 路由创建 `video_submit` job 时，需要以下信息（这些信息在 `FissionItemVideoJobInput` 中是必需的）：

| 字段 | 来源 | 说明 |
|------|------|------|
| `videoPrompt` | `shot_prompts` 服务 | 每个 item 的视频生成提示词 |
| `characterImageUrl` | 项目上下文 | 角色参考图 URL |
| `outfitImageUrl` | 项目上下文 | 服饰参考图 URL |
| `fissionVideoStatusId` | 状态记录 | 裂变状态 ID |
| `parentJobId` | 活跃任务查询 | 裂变父任务 job ID |

**现状问题**：`buildFissionContext` 和 `resolveShotPrompts` 是 `FissionShotPromptsExecutor` 的 `private` 方法，路由层无法直接调用。

**解决方案**：将这两个方法提取为独立的服务函数：

```typescript
// src/modules/fission-video/fission-context.ts（新文件）
export async function buildFissionContext(ctx: AppContext, projectId: string) { ... }
export async function resolveShotPrompts(ctx: AppContext, projectId: string) { ... }
```

`shot_prompts` executor 和 `confirm-video` 路由都通过这个共享模块获取上下文，避免重复实现。

### 9.2 进度计数改造

现有 `syncProgressCounters` 基于 `videoStatus` 计数，图片阶段无法正确反映进度。新增图片进度字段：

**数据库变更**：`nrm_fission_video_status` 表新增字段

```sql
ALTER TABLE nrm_fission_video_status
ADD COLUMN image_video_image_completed INTEGER DEFAULT 0,
ADD COLUMN image_video_image_failed INTEGER DEFAULT 0,
ADD COLUMN new_story_image_completed INTEGER DEFAULT 0,
ADD COLUMN new_story_image_failed INTEGER DEFAULT 0;
```

**Service 变更**：`syncProgressCounters` 同时更新图片进度和视频进度

### 9.3 状态转换并发安全

`checkAllImagesCompleted` + 状态更新需要原子操作，使用 CAS（Compare-And-Swap）模式：

```typescript
// 原子状态转换（只有当前状态为 PARALLEL_RUNNING 时才更新）
const result = await this.pool.query(
  `UPDATE nrm_fission_video_status
   SET status = 'pending_video_confirmation', updated_at = $2
   WHERE id = $1 AND status = 'parallel_running'
   RETURNING id`,
  [fissionVideoStatusId, Date.now()]
);
// result.rowCount === 1 表示转换成功
```

### 9.4 状态顺序数组更新

`FISSION_STATUS_ORDER` 需要包含新状态，用于进度计算：

```typescript
export const FISSION_STATUS_ORDER: FissionStatus[] = [
  FissionStatus.CREATING,
  FissionStatus.ORGANIZING_MIRROR,
  FissionStatus.NEW_MIRROR,
  FissionStatus.NEW_STORY,
  FissionStatus.NEW_STORY_FINISH,
  FissionStatus.PARALLEL_RUNNING,
  FissionStatus.PENDING_VIDEO_CONFIRMATION,  // 新增
  FissionStatus.VIDEO_GENERATING,            // 新增
  FissionStatus.COMBINING,
  FissionStatus.READY_FOR_MERGE,
  FissionStatus.COMPLETED,
];
```

### 9.5 前端状态徽章映射

在 `Step6FissionScreen.tsx` 中新增状态徽章：

```typescript
// 状态徽章映射（第 356-393 行附近）
{fissionVideoStatus.status === 'pending_video_confirmation' ? (
  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 border border-teal-200">
    等待确认视频
  </span>
) : fissionVideoStatus.status === 'video_generating' ? (
  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
    视频生成中
  </span>
) : (
  // ... 现有状态徽章
)}
```

---

## 十、风险与缓解措施

### 10.1 状态机复杂度增加

**风险**：新增状态可能导致状态转换逻辑复杂化

**缓解措施**：

1. 状态转换条件明确，只在 image 完成时检查
2. 抽取 `checkAllImagesCompleted` 为公共方法，避免重复逻辑
3. 使用 CAS 模式保证并发安全

### 10.2 任务图结构变更

**风险**：`shot_prompts` 不再创建 video 任务，可能影响现有数据兼容性

**缓解措施**：

1. 通过状态判断流程版本：有 `PENDING_VIDEO_CONFIRMATION` 状态的走新流程
2. 现有数据（已创建 video job）继续走原有流程，不受影响
3. 新建的裂变任务自动走新流程

### 10.3 进度计数不一致

**风险**：图片阶段无法通过现有字段正确反映进度

**缓解措施**：

1. 新增图片进度字段，与视频进度分离
2. 向后兼容：新字段默认值为 0，旧数据自动适配

---

## 十一、总结

本设计通过新增 `PENDING_VIDEO_CONFIRMATION` 状态，实现了图片生成完成后的暂停确认功能：

1. ✅ 图片生成完成后暂停，等待用户确认
2. ✅ 不满意可重试（复用变体功能）
3. ✅ 确认后批量生成视频
4. ✅ 状态机清晰，易于维护

**下一步**：调用 `writing-plans` 技能创建详细的实现计划。
