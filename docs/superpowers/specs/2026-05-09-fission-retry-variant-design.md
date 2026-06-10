# Step6 裂变分镜重试方案设计

**创建日期**: 2026-05-09
**状态**: 设计完成，待实现

---

## 一、背景与需求

### 1.1 当前问题

现有裂变重试逻辑（`POST /fission/retry`）存在以下限制：

1. **只支持重试失败的视频**：图片必须成功才能重试视频
2. **不支持重试图片**：图片失败需要重新执行整个分镜
3. **不支持成功状态重试**：无法对已成功的图片/视频重新生成
4. **无版本管理**：每次重试会覆盖之前的结果，无法保留多个版本

### 1.2 用户需求

用户希望能够：

1. **对单个分镜执行重试**：选择特定分镜重新生成图片和/或视频
2. **图片和视频都支持重试**：即使都成功也能重新生成
3. **保留多个版本**：新生成的结果追加到变体列表，用户可选择保留哪个版本
4. **类似 Step4 的交互体验**：通过徽章按钮 + 弹窗选择变体
5. **可配置功能开关**：管理员可通过配置控制是否启用变体模式
6. **变体数量上限控制**：通过配置控制每个分镜最多保留的变体数量

---

## 二、设计方案概览

### 2.1 核心设计原则

- **变体模式**：新生成的图片/视频追加到变体列表，而非覆盖
- **用户选择**：用户可以从多个版本中选择最终使用的结果
- **复用 Step4 设计**：前端交互参考 Step4 的变体选择器组件
- **向后兼容**：现有数据自动迁移，旧接口保持兼容

### 2.2 关键变更点

| 变更项 | 说明 |
|--------|------|
| 数据模型扩展 | `nrm_fission_task_items` 表新增变体字段 |
| Repository 接口扩展 | 新增变体追加和选择方法 |
| API 新增 | 重试接口、变体选择接口 |
| 执行器改造 | 图片/视频执行器改为追加变体 |
| 前端组件复用 | 参考 Step4 的弹窗选择模式 |
| 配置项新增 | `step6_fission` 模块新增变体相关配置 |

---

## 三、业务配置设计

### 3.1 配置项定义

**配置模块**: `step6_fission`（已存在）

**新增配置字段**:

```typescript
/** Step6 裂变配置（扩展） */
export interface Step6FissionConfig {
  /** 裂变单图重试次数 */
  fissionImageRetryCount: number;
  /** 裂变单视频重试次数 */
  fissionVideoRetryCount: number;
  /** 全局任务重试次数 */
  globalTaskRetryCount: number;
  /** 是否启用变体模式：启用后重试生成的内容追加到变体列表，禁用则覆盖旧结果 */
  enableVariantMode: boolean;
  /** 变体数量上限：每个分镜最多保留的图片/视频变体数量 */
  maxVariantCount: number;
}
```

### 3.2 配置默认值

```typescript
/** Step6 裂变配置默认值（扩展） */
export const DEFAULT_STEP6_FISSION_CONFIG: Step6FissionConfig = {
  fissionImageRetryCount: 3,
  fissionVideoRetryCount: 3,
  globalTaskRetryCount: 2,
  enableVariantMode: true,  // 默认启用变体模式
  maxVariantCount: 5,       // 默认最多保留 5 个变体
};
```

### 3.3 配置存储

**表名**: `nrm_business_configs`

**存储结构**:

```json
{
  "module": "step6_fission",
  "config_json": {
    "fissionImageRetryCount": 3,
    "fissionVideoRetryCount": 3,
    "globalTaskRetryCount": 2,
    "enableVariantMode": true,
    "maxVariantCount": 5
  },
  "description": "Step6 裂变配置",
  "created_at": 1234567890000,
  "updated_at": 1234567890000,
  "updated_by": null
}
```

### 3.4 配置使用方式

**Repository 层读取配置**:

```typescript
// src/persistence/fission-task-items-repository.ts
import type { BusinessConfigService } from "../modules/business-config-service.js";

class FissionTaskItemsRepository implements IFissionTaskItemsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly businessConfigService: BusinessConfigService
  ) {}

  async appendImageVariant(id: string, input: UpdateImageVariantInput): Promise<FissionTaskItemRecord> {
    // 1. 读取配置
    const config = this.businessConfigService.get("step6_fission", DEFAULT_STEP6_FISSION_CONFIG);
    
    // 2. 检查是否启用变体模式
    if (!config.enableVariantMode) {
      // 禁用变体模式：直接覆盖旧结果
      return this.updateImageStatus(id, input);
    }
    
    // 3. 检查变体数量上限
    const current = await this.getById(id);
    if (current.image_variants && current.image_variants.length >= config.maxVariantCount) {
      throw new AppError(400, "VARIANT_LIMIT_EXCEEDED", `图片变体数量已达上限（${config.maxVariantCount}个）`);
    }
    
    // 4. 追加变体
    const now = Date.now();
    const newVariant = {
      url: input.imageUrl,
      path: input.imagePath,
      createdAt: now,
    };

    await this.pool.query(
      `UPDATE nrm_fission_task_items
       SET image_variants = image_variants || $1::jsonb,
           selected_image_index = jsonb_array_length(image_variants),
           image_url = $2,
           image_path = $3,
           image_status = COALESCE($4, image_status),
           updated_at = $5
       WHERE id = $6
       RETURNING *`,
      [JSON.stringify(newVariant), input.imageUrl, input.imagePath, input.status, now, id]
    );

    return this.getById(id);
  }
}
```

### 3.5 配置变更影响范围

| 配置项 | 影响范围 | 变更时机 |
|--------|---------|---------|
| `enableVariantMode` | 执行器（图片/视频）、Repository、前端 | 实时生效（通过 BusinessConfigService 缓存刷新） |
| `maxVariantCount` | Repository（追加变体时检查） | 实时生效 |

---

## 四、数据模型设计

### 3.4 表结构扩展

**表名**: `nrm_fission_task_items`

**新增字段**:

```sql
-- 图片变体相关
ALTER TABLE nrm_fission_task_items
ADD COLUMN image_variants JSONB DEFAULT '[]'::jsonb,
ADD COLUMN selected_image_index INTEGER DEFAULT 0;

-- 视频变体相关
ALTER TABLE nrm_fission_task_items
ADD COLUMN video_variants JSONB DEFAULT '[]'::jsonb,
ADD COLUMN selected_video_index INTEGER DEFAULT 0;

-- 添加注释
COMMENT ON COLUMN nrm_fission_task_items.image_variants IS '图片变体列表：[{url, path, createdAt}]';
COMMENT ON COLUMN nrm_fission_task_items.selected_image_index IS '当前选中的图片变体索引';
COMMENT ON COLUMN nrm_fission_task_items.video_variants IS '视频变体列表：[{url, path, taskId, createdAt}]';
COMMENT ON COLUMN nrm_fission_task_items.selected_video_index IS '当前选中的视频变体索引';
```

### 3.5 数据结构定义

**图片变体结构**:

```typescript
interface ImageVariant {
  url: string;        // 图片访问 URL
  path: string;       // OSS 存储路径
  createdAt: number;  // 生成时间戳
}
```

**视频变体结构**:

```typescript
interface VideoVariant {
  url: string;        // 视频访问 URL
  path: string;       // OSS 存储路径
  taskId?: string;    // LLM 任务 ID（用于重试时查询）
  createdAt: number;  // 生成时间戳
}
```

**完整记录示例**:

```json
{
  "id": "uuid-123",
  "fission_video_status_id": "status-uuid",
  "task_type": "image_video",
  "item_index": 1,
  "image_url": "https://oss.../image-1.png",
  "image_path": "fission/.../image-1.png",
  "image_status": "completed",
  "image_variants": [
    { "url": "https://oss.../image-1.png", "path": "fission/.../image-1.png", "createdAt": 1234567890 },
    { "url": "https://oss.../image-2.png", "path": "fission/.../image-2.png", "createdAt": 1234567899 }
  ],
  "selected_image_index": 0,
  "video_url": "https://oss.../video-1.mp4",
  "video_path": "fission/.../video-1.mp4",
  "video_status": "completed",
  "video_variants": [
    { "url": "https://oss.../video-1.mp4", "path": "fission/.../video-1.mp4", "taskId": "task-abc", "createdAt": 1234567900 }
  ],
  "selected_video_index": 0,
  "created_at": 1234567880,
  "updated_at": 1234567910
}
```

### 3.6 数据迁移策略

**迁移脚本**:

```sql
-- 1. 将现有 imageUrl/imagePath 迁移为第一个变体
UPDATE nrm_fission_task_items
SET image_variants = jsonb_build_array(
  jsonb_build_object(
    'url', image_url,
    'path', image_path,
    'createdAt', created_at
  )
),
selected_image_index = 0
WHERE image_url IS NOT NULL
  AND (image_variants IS NULL OR image_variants = '[]'::jsonb);

-- 2. 将现有 videoUrl/videoPath 迁移为第一个变体
UPDATE nrm_fission_task_items
SET video_variants = jsonb_build_array(
  jsonb_build_object(
    'url', video_url,
    'path', video_path,
    'taskId', video_task_id,
    'createdAt', created_at
  )
),
selected_video_index = 0
WHERE video_url IS NOT NULL
  AND (video_variants IS NULL OR video_variants = '[]'::jsonb);
```

**向后兼容查询**:

```typescript
// 查询时优先使用变体，兜底使用旧字段
function getImageUrl(item: FissionTaskItemRecord): string | null {
  if (item.image_variants && item.image_variants.length > 0) {
    const index = item.selected_image_index ?? 0;
    return item.image_variants[index]?.url ?? null;
  }
  return item.image_url; // 兜底旧字段
}
```

### 3.7 Repository 接口扩展

**文件位置**: `src/persistence/fission-task-items-repository.ts`

**新增接口**:

```typescript
interface UpdateImageVariantInput {
  imageUrl: string;
  imagePath: string;
  status?: FissionItemStatus;
}

interface UpdateVideoVariantInput {
  videoUrl: string;
  videoPath: string;
  videoTaskId?: string;
  status?: FissionItemStatus;
}

interface IFissionTaskItemsRepository {
  // 现有方法...

  /** 追加图片变体 */
  appendImageVariant(id: string, input: UpdateImageVariantInput): Promise<FissionTaskItemRecord>;

  /** 追加视频变体 */
  appendVideoVariant(id: string, input: UpdateVideoVariantInput): Promise<FissionTaskItemRecord>;

  /** 选择图片变体 */
  selectImageVariant(id: string, index: number): Promise<FissionTaskItemRecord>;

  /** 选择视频变体 */
  selectVideoVariant(id: string, index: number): Promise<FissionTaskItemRecord>;
}
```

**Repository 实现**:

```typescript
import type { BusinessConfigService } from "../../modules/business-config-service.js";
import { DEFAULT_STEP6_FISSION_CONFIG } from "../../contracts/business-config-contract.js";

class FissionTaskItemsRepository implements IFissionTaskItemsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly businessConfigService: BusinessConfigService
  ) {}

  async appendImageVariant(id: string, input: UpdateImageVariantInput): Promise<FissionTaskItemRecord> {
    // 1. 读取配置
    const config = this.businessConfigService.get("step6_fission", DEFAULT_STEP6_FISSION_CONFIG);
    
    // 2. 检查是否启用变体模式
    if (!config.enableVariantMode) {
      // 禁用变体模式：直接更新，不追加变体
      return this.updateImageStatus(id, input);
    }
    
    // 3. 加锁查询当前变体数量
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const currentResult = await client.query(
        'SELECT image_variants FROM nrm_fission_task_items WHERE id = $1 FOR UPDATE',
        [id]
      );
      
      const currentVariants = currentResult.rows[0]?.image_variants || [];
      
      // 4. 检查变体数量上限
      if (currentVariants.length >= config.maxVariantCount) {
        await client.query('ROLLBACK');
        throw new AppError(400, "VARIANT_LIMIT_EXCEEDED", `图片变体数量已达上限（${config.maxVariantCount}个）`);
      }
      
      // 5. 追加变体
      const now = Date.now();
      const newVariant = {
        url: input.imageUrl,
        path: input.imagePath,
        createdAt: now,
      };

      await client.query(
        `UPDATE nrm_fission_task_items
         SET image_variants = image_variants || $1::jsonb,
             selected_image_index = jsonb_array_length(image_variants),
             image_url = $2,
             image_path = $3,
             image_status = COALESCE($4, image_status),
             updated_at = $5
         WHERE id = $6`,
        [JSON.stringify(newVariant), input.imageUrl, input.imagePath, input.status, now, id]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return this.getById(id);
  }

  async appendVideoVariant(id: string, input: UpdateVideoVariantInput): Promise<FissionTaskItemRecord> {
    // 1. 读取配置
    const config = this.businessConfigService.get("step6_fission", DEFAULT_STEP6_FISSION_CONFIG);
    
    // 2. 检查是否启用变体模式
    if (!config.enableVariantMode) {
      return this.updateVideoStatus(id, input);
    }
    
    // 3. 加锁查询当前变体数量
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const currentResult = await client.query(
        'SELECT video_variants FROM nrm_fission_task_items WHERE id = $1 FOR UPDATE',
        [id]
      );
      
      const currentVariants = currentResult.rows[0]?.video_variants || [];
      
      // 4. 检查变体数量上限
      if (currentVariants.length >= config.maxVariantCount) {
        await client.query('ROLLBACK');
        throw new AppError(400, "VARIANT_LIMIT_EXCEEDED", `视频变体数量已达上限（${config.maxVariantCount}个）`);
      }
      
      // 5. 追加变体
      const now = Date.now();
      const newVariant = {
        url: input.videoUrl,
        path: input.videoPath,
        taskId: input.videoTaskId,
        createdAt: now,
      };

      await client.query(
        `UPDATE nrm_fission_task_items
         SET video_variants = video_variants || $1::jsonb,
             selected_video_index = jsonb_array_length(video_variants),
             video_url = $2,
             video_path = $3,
             video_task_id = $4,
             video_status = COALESCE($5, video_status),
             updated_at = $6
         WHERE id = $7`,
        [JSON.stringify(newVariant), input.videoUrl, input.videoPath, input.videoTaskId, input.status, now, id]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return this.getById(id);
  }

  async selectImageVariant(id: string, index: number): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const result = await this.pool.query(
      `UPDATE nrm_fission_task_items
       SET selected_image_index = $1,
           image_url = image_variants->$1->>'url',
           image_path = image_variants->$1->>'path',
           updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [index, now, id]
    );

    return this.rowToRecord(result.rows[0]);
  }

  async selectVideoVariant(id: string, index: number): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const result = await this.pool.query(
      `UPDATE nrm_fission_task_items
       SET selected_video_index = $1,
           video_url = video_variants->$1->>'url',
           video_path = video_variants->$1->>'path',
           video_task_id = video_variants->$1->>'taskId',
           updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [index, now, id]
    );

    return this.rowToRecord(result.rows[0]);
  }
}
```

---

## 五、API 设计

### 5.1 新增重试接口

**接口路径**: `POST /fission/items/retry`

**请求参数**:

```typescript
interface RetryItemRequest {
  projectId: string;
  itemIndex: number;        // 分镜索引（1-based）
  taskType: "image_video" | "new_story";
  retryType: "image" | "video" | "both";  // 重试类型
}
```

**响应**:

```typescript
interface RetryItemResponse {
  success: boolean;
  jobIds?: string[];        // 创建的任务 ID 列表
  message: string;
}
```

**实现逻辑**:

1. 获取裂变状态记录和目标 task_item
2. 获取裂变上下文（角色参考图、服饰参考图等）
3. 获取提示词（从 shot_prompts）
4. 根据重试类型创建异步任务：
   - `retryType === "image"`: 创建图片任务
   - `retryType === "video"`: 创建视频任务
   - `retryType === "both"`: 同时创建图片和视频任务
5. 触发任务执行

**核心代码位置**: `src/routes/fission-video-routes.ts`

### 5.2 新增变体选择接口

**接口路径**: `PATCH /fission/items/:itemId/select-variant`

**请求参数**:

```typescript
interface SelectVariantRequest {
  variantType: "image" | "video";
  variantIndex: number;     // 变体索引
}
```

**响应**:

```typescript
interface SelectVariantResponse {
  success: boolean;
  item: FissionTaskItemRecord;  // 更新后的 task_item
}
```

**实现逻辑**:

1. 获取 task_item
2. 验证变体索引有效性
3. 更新选中索引
4. 同步更新 `imageUrl`/`videoUrl` 字段（向后兼容）
5. 返回更新后的记录

### 5.3 扩展现有接口

**接口路径**: `GET /fission/status/:id/task-items`

**响应增强**:

```typescript
interface GetTaskItemsResponse {
  success: boolean;
  items: Array<FissionTaskItemRecord & {
    // 变体信息已包含在基础字段中
    image_variants: ImageVariant[];
    selected_image_index: number;
    video_variants: VideoVariant[];
    selected_video_index: number;
  }>;
}
```

---

## 六、执行器逻辑改造

### 6.1 图片执行器改造

**文件位置**: `src/modules/fission-video/fission-item-image-executor.ts`

**关键变更点**:

```typescript
// 原逻辑（line 146-151）：
await this.taskItemsService.updateImageStatus(item.id, input.fissionVideoStatusId, input.taskType, {
  imageUrl: oss.url,
  imagePath: oss.path,
  status: "completed",
});

// 新逻辑：
await this.taskItemsService.appendImageVariant(item.id, input.fissionVideoStatusId, input.taskType, {
  imageUrl: oss.url,
  imagePath: oss.path,
  status: "completed",
});
```

### 6.2 视频执行器改造

**Submit 阶段**:

**文件位置**: `src/modules/fission-video/fission-item-video-submit-executor.ts`

**关键变更点**（line 141-146）:

```typescript
// 原逻辑：
await this.taskItemsService.updateVideoStatus(item!.id, input.fissionVideoStatusId, input.taskType, {
  videoUrl: vr.videoUrl,
  videoPath: vr.videoPath || undefined,
  status: "completed",
  videoTaskId: vr.taskId,
});

// 新逻辑：
await this.taskItemsService.appendVideoVariant(item!.id, input.fissionVideoStatusId, input.taskType, {
  videoUrl: vr.videoUrl,
  videoPath: vr.videoPath || undefined,
  status: "completed",
  videoTaskId: vr.taskId,
});
```

**Query 阶段**:

**文件位置**: `src/modules/fission-video/fission-item-video-query-executor.ts`

**关键变更点**（line 160-165）:

```typescript
// 原逻辑：
await this.taskItemsService.updateVideoStatus(item.id, input.fissionVideoStatusId, input.taskType, {
  videoUrl: vr.videoUrl,
  videoPath: vr.videoPath || undefined,
  status: "completed",
  videoTaskId: vr.taskId,
});

// 新逻辑：
await this.taskItemsService.appendVideoVariant(item.id, input.fissionVideoStatusId, input.taskType, {
  videoUrl: vr.videoUrl,
  videoPath: vr.videoPath || undefined,
  status: "completed",
  videoTaskId: vr.taskId,
});
```

---

## 七、前端交互设计

### 7.1 变体选择器组件设计

**参考组件**: `apps/web/pages/project-flow/step4-video-workspace/step4VideoVariantSelector.tsx`

**核心交互流程**:

```
1. 分镜卡片左上角显示徽章按钮
   ├─ 图片徽章：V{currentIndex}/{variantCount}
   └─ 视频徽章：V{currentIndex}/{variantCount}

2. 点击徽章 → 弹出 Portal 渲染的弹窗
   ├─ 中央显示当前选中的变体大图/视频
   ├─ 底部缩略图选择条（横向滚动）
   ├─ 点击缩略图切换预览
   └─ 点击确认或关闭弹窗

3. 确认切换时自动应用（无需二次确认）
```

### 7.2 裂变分镜卡片组件设计

**新增组件**: `FissionItemCard.tsx`（复用 Step4 的弹窗选择模式）

**UI 布局**:

```
┌─────────────────────────────────┐
│ [图片 V1/3]      [视频 V2/2]     │ ← 左上角徽章按钮
│                                 │
│      [主图片预览区域]            │
│      [主视频预览区域]            │
│                                 │
│  [🔄 重试] 下拉菜单              │ ← 底部重试按钮
└─────────────────────────────────┘
```

**点击图片徽章**:

```
弹出图片变体选择弹窗（Portal 渲染到屏幕中央）：
┌──────────────────────────────────────────┐
│  选择版本                          [×]   │
├──────────────────────────────────────────┤
│                                          │
│          [当前预览图片 - 大图]           │
│                                          │
│      ◀  [缩略图1] [缩略图2] [缩略图3] ▶  │
│                                          │
└──────────────────────────────────────────┘
```

**点击视频徽章**:

```
弹出视频变体选择弹窗（Portal 渲染到屏幕中央）：
┌──────────────────────────────────────────┐
│  选择版本                          [×]   │
├──────────────────────────────────────────┤
│                                          │
│          [当前预览视频 - 自动播放]        │
│                                          │
│      ◀  [缩略图1] [缩略图2] ▶            │
│                                          │
└──────────────────────────────────────────┘
```

### 7.3 重试按钮交互设计

**位置**: 分镜卡片底部

**下拉菜单**:

```
点击 [🔄 重试] 按钮：
┌──────────────────────┐
│ 🔄 重试图片          │ → 创建新图片变体任务
│ 🔄 重试视频          │ → 创建新视频变体任务
│ 🔄 重试两者          │ → 同时创建图片+视频任务
└──────────────────────┘
```

**交互流程**:

1. 点击重试按钮 → 弹出下拉菜单
2. 选择重试类型 → 调用 `POST /fission/items/retry`
3. 创建异步任务 → 徽章显示"生成中"
4. 任务执行完成 → 自动追加到变体列表
5. 徽章更新为 `V{新总数}/{新总数}`
6. 用户可点击徽章选择保留哪个版本

### 7.4 组件复用策略

**创建通用组件**: `VariantSelector.tsx`

```typescript
interface VariantSelectorProps<T extends "image" | "video"> {
  variantType: T;
  viewModel: {
    selectedIndex: number;
    variants: Array<{ url: string; createdAt: number }>;
  };
  children: React.ReactNode; // 主预览组件
  onSelectVariant: (variantIndex: number) => void;
  onDeleteVariant?: (variantIndex: number) => void | Promise<void>;
  isGenerating?: boolean;
}
```

**复用场景**:

- Step4 视频变体选择：`variantType="video"`
- 裂变图片变体选择：`variantType="image"`
- 裂变视频变体选择：`variantType="video"`

**优势**:

- 统一的 UI 风格和交互逻辑
- 减少代码重复
- 便于维护和扩展

---

## 八、实现计划

### 8.1 后端任务清单

#### Phase 1: 配置与数据模型

- [ ] 扩展配置契约：`Step6FissionConfig` 新增 `enableVariantMode`、`maxVariantCount`
- [ ] 更新默认配置：`DEFAULT_STEP6_FISSION_CONFIG`
- [ ] 数据库迁移脚本：添加变体字段
- [ ] 数据迁移脚本：将现有数据迁移为变体
- [ ] Repository 接口扩展：新增变体方法
- [ ] Repository 实现：`appendImageVariant`、`appendVideoVariant`（包含配置检查）
- [ ] Repository 实现：`selectImageVariant`、`selectVideoVariant`
- [ ] 单元测试：Repository 方法、配置读取、上限检查

#### Phase 2: API 路由

- [ ] 新增路由：`POST /fission/items/retry`
- [ ] 新增路由：`PATCH /fission/items/:itemId/select-variant`
- [ ] 扩展现有路由：`GET /fission/status/:id/task-items` 响应增强
- [ ] 集成测试：API 端点

#### Phase 3: 执行器改造

- [ ] 图片执行器改造：使用 `appendImageVariant`
- [ ] 视频执行器改造：使用 `appendVideoVariant`
- [ ] Service 层方法：`appendImageVariant`、`appendVideoVariant`
- [ ] 集成测试：任务执行流程、配置开关切换

### 8.2 前端任务清单

#### Phase 1: 组件开发

- [ ] 提取通用组件：`VariantSelector.tsx`（从 Step4 提取）
- [ ] 新增组件：`FissionItemCard.tsx`（裂变分镜卡片）
- [ ] 新增组件：图片变体选择器
- [ ] 新增组件：视频变体选择器
- [ ] 新增组件：重试按钮下拉菜单

#### Phase 2: API 集成

- [ ] API 封装：`retryFissionItem(projectId, itemIndex, retryType)`
- [ ] API 封装：`selectVariant(itemId, variantType, variantIndex)`
- [ ] 状态管理：变体列表更新逻辑

#### Phase 3: 集成测试

- [ ] E2E 测试：重试流程
- [ ] E2E 测试：变体选择流程
- [ ] UI 测试：组件渲染和交互

---

## 九、测试计划

### 9.1 后端测试

#### 单元测试

- Repository 方法：变体追加、选择、索引验证
- 配置读取：`enableVariantMode`、`maxVariantCount` 默认值和自定义值
- 上限检查：变体数量达到上限时的错误处理
- 并发控制：多个同时追加变体的事务隔离

#### 集成测试

- API 端点：重试接口、变体选择接口
- 任务执行：图片/视频生成追加变体
- 配置开关：禁用变体模式时覆盖旧结果
- 并发场景：多个重试任务同时执行

#### 回归测试

- 现有重试逻辑（`POST /fission/retry`）仍正常工作
- 现有接口向后兼容（旧字段 `imageUrl`/`videoUrl` 正常返回）

### 9.2 前端测试

#### 组件测试

- 变体选择器：徽章显示、弹窗渲染、缩略图切换
- 重试按钮：下拉菜单、选项点击
- 分镜卡片：整体布局、交互流程

#### E2E 测试

- 重试图片流程：点击重试 → 任务创建 → 变体追加 → 选择变体
- 重试视频流程：点击重试 → 任务创建 → 变体追加 → 选择变体
- 重试两者流程：同时创建图片+视频任务

---

## 十、风险与缓解措施

### 10.1 数据迁移风险

**风险**: 现有数据迁移失败导致数据丢失

**缓解措施**:

1. 迁移前备份数据库
2. 迁移脚本使用事务，失败时回滚
3. 迁移后验证数据完整性
4. 保留旧字段（`imageUrl`/`videoUrl`）作为兜底

### 10.2 存储成本风险

**风险**: 变体模式会增加存储成本（保留多个版本）

**缓解措施**:

1. 设置变体数量上限（`maxVariantCount`，默认 5 个）
2. 通过配置开关控制是否启用变体模式（`enableVariantMode`）
3. 定期监控存储成本
4. 后续可考虑提供删除变体功能

### 10.3 性能风险

**风险**: 变体列表过长影响查询性能

**缓解措施**:

1. 通过配置限制变体数量上限
2. 使用 JSONB 索引优化查询
3. 变体列表只存储必要字段（URL、路径、时间戳）

### 10.4 用户体验风险

**风险**: 用户不知道如何使用新功能

**缓解措施**:

1. 提供引导提示（首次使用时）
2. 徽章按钮显示版本数量，直观提示
3. 重试按钮提供明确的选项说明

---

## 十一、总结

本设计通过引入**变体模式**解决了现有裂变重试的限制，支持：

1. ✅ **单个分镜重试**：用户可选择特定分镜重新生成
2. ✅ **图片和视频都支持重试**：即使成功也能重新生成
3. ✅ **保留多个版本**：变体列表管理，用户可选择最佳结果
4. ✅ **参考 Step4 设计**：复用弹窗选择模式，统一交互体验
5. ✅ **配置化管理**：通过业务配置表控制功能开关和变体上限
6. ✅ **灵活切换**：管理员可随时调整配置，实时生效

**关键设计决策**：

- 变体模式而非覆盖模式（可通过配置切换）
- 数据库 JSONB 字段存储变体列表
- 业务配置表管理功能开关和上限控制
- Repository 接口扩展支持变体操作
- 执行器改造为追加变体逻辑（支持配置禁用时覆盖）
- 前端复用 Step4 的弹窗选择组件

**下一步**：调用 `writing-plans` 技能创建详细的实现计划。
