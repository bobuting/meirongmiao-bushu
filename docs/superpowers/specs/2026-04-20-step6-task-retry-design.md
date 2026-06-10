---
name: Step6 任务卡片重试与停止功能
description: 为 Step6 裂变任务卡片增加图片/视频重试、停止功能，支持历史版本管理
type: project
---

# Step6 任务卡片重试与停止功能设计规格

## 1. 需求概述

### 1.1 核心功能

| 功能 | 描述 |
|------|------|
| 图片重试 | 允许对已完成的图片重新生成（独立于视频状态） |
| 视频重试约束 | 视频重试需要图片存在（没有图片不能重试视频） |
| 停止功能 | processing 状态的任务可以单个停止 |
| 停止后重试 | 停止后允许重新生成 |
| 历史版本管理 | 保留历史版本，支持选择替换 |

### 1.2 数据同步策略

| 表 | 操作时机 | 操作 |
|---|---------|-----|
| `nrm_fission_task_items` | 单个分镜重试 | 更新状态和 URL，存储生成参数 |
| `nrm_storyboard_sub` | 单个分镜视频重试 | 更新 `storyboard_url`，追加历史记录 |

### 1.3 重试次数管理

- 重新生成计入 `retry_count`
- 受 `maxRetryCount` 限制
- 超过上限不允许重试

---

## 2. 状态机设计

### 2.1 新增状态

```typescript
// 当前状态
type FissionItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 新增 stopped 状态
type FissionItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'stopped';
```

### 2.2 状态转换规则

**图片状态：**
```
pending → processing (开始生成)
processing → completed (生成成功)
processing → failed (生成失败)
processing → stopped (用户停止)
completed → processing (重新生成)
failed → processing (重试)
stopped → processing (重新生成)
```

**视频状态：**
```
pending → processing (开始生成，需要图片存在)
processing → completed (生成成功)
processing → failed (生成失败)
processing → stopped (用户停止)
completed → processing (重新生成，需要图片存在)
failed → processing (重试，需要图片存在)
stopped → processing (重新生成，需要图片存在)
```

### 2.3 关键约束

| 操作 | 图片约束 | 视频约束 |
|------|---------|---------|
| 图片重试 | 无 | - |
| 视频重试 | - | 需要图片存在（`imageUrl` 不为空） |
| 图片停止 | 状态为 `processing` | - |
| 视频停止 | - | 状态为 `processing` |

---

## 3. 数据结构设计

### 3.1 扩展 `nrm_fission_task_items` 表

**新增字段：**

```sql
ALTER TABLE nrm_fission_task_items
ADD COLUMN image_params JSONB,  -- 图片生成参数
ADD COLUMN video_params JSONB;  -- 视频生成参数
```

**字段结构：**

```typescript
interface ImageGenerationParams {
  prompt: string;                      // 分镜描述
  characterReferences: string[];       // 角色参考图URL列表
  outfitReferenceImages: string[];     // 服装参考图URL列表
}

interface VideoGenerationParams {
  prompt: string;                      // 视频提示词
  imageUrl: string;                    // 图片URL
  characterReferences: string[];       // 角色参考图URL列表
  outfitReferenceImages: string[];     // 服装参考图URL列表
}
```

### 3.2 扩展 `nrm_storyboard_sub` 表

**新增字段：**

```sql
ALTER TABLE nrm_storyboard_sub
ADD COLUMN previous_urls JSONB DEFAULT '[]';  -- 历史 URL 列表
```

**字段结构：**

```typescript
interface PreviousUrlRecord {
  url: string;
  updatedAt: number;
  reason: 'retry' | 'regenerate' | 'manual';
}

// 更新逻辑：每次更新 storyboard_url 时，将当前 URL 追加到 previous_urls
```

### 3.3 参数存储时机

| 操作 | 存储内容 |
|------|---------|
| 首次生成图片 | `image_params = { prompt, characterReferences, outfitReferenceImages }` |
| 首次生成视频 | `video_params = { prompt, imageUrl, characterReferences, outfitReferenceImages }` |
| 重新生成 | 从已存储的 `image_params` / `video_params` 读取 |

---

## 4. API 设计

### 4.1 新增 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/fission/stop-item` | 停止单个任务 |
| POST | `/fission/retry-image` | 重新生成图片 |
| POST | `/fission/retry-video` | 重新生成视频 |
| POST | `/fission/select-history` | 选择历史版本替换 |

### 4.2 POST /fission/stop-item

**请求：**
```typescript
{
  projectId: string;
  itemId: string;      // task_item 的 id
  type: 'image' | 'video';
}
```

**响应：**
```typescript
{
  success: boolean;
  message: string;
}
```

**逻辑：**
1. 检查任务状态是否为 `processing`
2. 调用 LLM API 取消任务（如果有 taskId）
3. 更新状态为 `stopped`
4. 清空错误信息

### 4.3 POST /fission/retry-image

**请求：**
```typescript
{
  projectId: string;
  itemId: string;
}
```

**响应：**
```typescript
{
  success: boolean;
  message: string;
  retryCount: number;
  remainingRetries: number;
}
```

**逻辑：**
1. 检查重试次数 `retryCount < maxRetryCount`
2. 状态必须为 `failed` 或 `stopped` 或 `completed`
3. 读取 `image_params`，调用 LLM 图片生成 API
4. 状态更新为 `processing`
5. 生成完成后更新为 `completed` 或 `failed`
6. `retryCount++`
7. 同步更新 `nrm_storyboard_sub` 表（追加历史记录，更新当前 URL）

### 4.4 POST /fission/retry-video

**请求：**
```typescript
{
  projectId: string;
  itemId: string;
}
```

**响应：**
```typescript
{
  success: boolean;
  message: string;
  retryCount: number;
  remainingRetries: number;
}
```

**逻辑：**
1. 检查重试次数 `retryCount < maxRetryCount`
2. 状态必须为 `failed` 或 `stopped` 或 `completed`
3. **检查图片是否存在**（`imageUrl` 不为空）
4. 读取 `video_params`，调用 LLM 视频生成 API
5. 状态更新为 `processing`
6. 生成完成后更新为 `completed` 或 `failed`
7. `retryCount++`
8. 同步更新 `nrm_storyboard_sub` 表的 `storyboard_url`（追加历史记录）

### 4.5 POST /fission/select-history

**请求：**
```typescript
{
  projectId: string;
  itemId: string;
  type: 'image' | 'video';
  selectedUrl: string;  // 选中的历史版本 URL
}
```

**响应：**
```typescript
{
  success: boolean;
  message: string;
}
```

**逻辑：**
1. 查询当前记录，获取当前 URL
2. 将当前 URL 追加到 `previous_urls`
3. 更新当前 URL = selectedUrl
4. 更新 `nrm_fission_task_items.image_url` 或 `video_url`

---

## 5. 前端交互设计

### 5.1 操作按钮规则

| 状态 | 图片操作 | 视频操作 |
|------|---------|---------|
| `pending` | 无 | 无 |
| `processing` | **停止按钮** | **停止按钮** |
| `completed` | **重试按钮** + **历史按钮** | **重试按钮**（需图片）+ **历史按钮** |
| `failed` | **重试按钮** | **重试按钮**（需图片） |
| `stopped` | **重试按钮** | **重试按钮**（需图片） |

### 5.2 历史版本选择器

**复用 Step4 组件：**
- 复用 `Step4VideoVariantSelector` 组件
- 支持图片和视频混合展示
- 当前版本 + 历史版本 = 所有可选版本

**数据映射：**
```typescript
interface Step6HistoryViewModel {
  sceneIndex: number;
  selectedIndex: number;        // 当前版本始终是 index 0
  variants: Array<{
    url: string;
    isVideo: boolean;           // 图片为 false，视频为 true
  }>;
}

// 当前版本 + 历史版本
const viewModel = {
  sceneIndex: item.storyboardIndex,
  selectedIndex: 0,
  variants: [
    { url: currentUrl, isVideo: true },  // 当前版本
    ...previousUrls.map(p => ({ url: p.url, isVideo: true }))
  ]
};
```

### 5.3 重试次数显示

```tsx
{retryCount > 0 && (
  <span className="text-xs text-gray-400">
    重试 {retryCount}/{maxRetryCount}
  </span>
)}
```

---

## 6. 实现要点

### 6.1 数据一致性

**更新 `nrm_storyboard_sub` 时：**
1. 查询已有记录（`project_id` + `storyboard_flag`）
2. 将当前 URL 追加到 `previous_urls`
3. 更新 `storyboard_url` 为新 URL

### 6.2 组合查询兼容

**当前组合查询逻辑不受影响：**
- 组合 ID 基于 `storyboard_flag`
- 更新 `storyboard_url` 不影响组合 ID
- 历史版本存储在 `previous_urls`，不影响当前分镜

### 6.3 前端轮询

**重新生成后需要刷新进度：**
```typescript
await api.post('/fission/retry-video', { projectId, itemId });
refetchProgress();  // 刷新进度数据
```

---

## 7. 后续优化

| 优化点 | 描述 | 优先级 |
|-------|------|--------|
| 版本对比 | 支持并排对比多个历史版本 | P2 |
| 批量重试 | 支持批量选择多个失败任务重试 | P2 |
| 自动清理 | 定期清理超过 N 个版本的历史记录 | P3 |

---

## 8. 测试要点

### 8.1 功能测试

- [ ] 图片重试：completed → processing → completed
- [ ] 视频重试：completed → processing → completed（有图片）
- [ ] 视频重试失败：无图片时提示错误
- [ ] 停止功能：processing → stopped
- [ ] 停止后重试：stopped → processing → completed
- [ ] 重试次数限制：超过 maxRetryCount 不允许重试
- [ ] 历史版本选择：选择历史版本替换当前版本

### 8.2 边界测试

- [ ] 图片生成失败后重试
- [ ] 视频生成失败后重试（有图片）
- [ ] 停止后再重试
- [ ] 历史版本为空时的展示
- [ ] 网络中断时的处理

### 8.3 数据一致性

- [ ] 重试后 `nrm_fission_task_items` 状态正确
- [ ] 重试后 `nrm_storyboard_sub` URL 正确
- [ ] 历史记录正确追加
- [ ] 组合查询不受影响

---

## 9. 相关文档

- Step4 视频变体选择器：`apps/web/pages/project-flow/step4-video-workspace/step4VideoVariantSelector.tsx`
- 任务项 Repository：`src/persistence/fission-task-items-repository.ts`
- 分镜子表 Service：`src/service/services-sub.ts`
