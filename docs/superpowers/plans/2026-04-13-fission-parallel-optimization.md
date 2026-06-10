# 裂变流程优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现裂变流程优化：步骤2（图生视频）和步骤3（新故事）并行执行 + 分镜级恢复能力。

**架构：**
1. 新增 `nrm_fission_task_items` 表追踪每个分镜的图片和视频生成状态
2. 修改 `/fission/image-to-video` 和 `/fission/new-story` API 支持增量生成
3. 前端轮询状态并在完成后支持重试失败项

**技术栈：** TypeScript, PostgreSQL, React, TanStack Query

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `src/persistence/fission-task-items-repository.ts` | 分镜任务项数据访问层 |
| `src/modules/fission-video/fission-task-items-service.ts` | 分镜任务项业务逻辑服务 |

### 修改文件
| 文件 | 职责 | 变更内容 |
|------|------|---------|
| `src/service/services-sub.ts` | 服务注册 | 导出新服务接口和实现 |
| `src/routes/fission-video-routes.ts` | API 路由 | 并行执行入口 + 增量生成逻辑 |
| `src/modules/fission-video/fission-video-config.ts` | 类型定义 | 新增状态枚举 |
| `apps/web/pages/fission/useFissionVideo.ts` | 前端 Hook | 并行调用 + 状态轮询 + 重试逻辑 |
| `apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx` | 前端页面 | 失败项展示 + 重试按钮 |

---

## 任务 1：创建数据库表

**文件：**
- 数据库：直接执行 SQL

- [ ] **步骤 1：创建 nrm_fission_task_items 表**

```sql
-- 分镜任务项表：追踪每个分镜的图片和视频生成状态
CREATE TABLE IF NOT EXISTS nrm_fission_task_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fission_video_status_id UUID NOT NULL REFERENCES nrm_fission_video_status(id) ON DELETE CASCADE,
  task_type VARCHAR(20) NOT NULL,  -- 'image_video' | 'new_story'
  item_index INT NOT NULL,  -- 分镜索引（从1开始）
  image_url TEXT,
  image_path TEXT,
  image_status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  image_error_message TEXT,
  video_url TEXT,
  video_path TEXT,
  video_status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  video_error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 添加表注释
COMMENT ON TABLE nrm_fission_task_items IS '裂变任务分镜项表：追踪每个分镜的图片和视频生成状态';
COMMENT ON COLUMN nrm_fission_task_items.id IS '主键ID';
COMMENT ON COLUMN nrm_fission_task_items.fission_video_status_id IS '关联的裂变状态记录ID';
COMMENT ON COLUMN nrm_fission_task_items.task_type IS '任务类型：image_video(图生视频) 或 new_story(新故事)';
COMMENT ON COLUMN nrm_fission_task_items.item_index IS '分镜索引，从1开始';
COMMENT ON COLUMN nrm_fission_task_items.image_url IS '生成的图片URL';
COMMENT ON COLUMN nrm_fission_task_items.image_path IS '生成的图片存储路径';
COMMENT ON COLUMN nrm_fission_task_items.image_status IS '图片状态：pending/processing/completed/failed';
COMMENT ON COLUMN nrm_fission_task_items.image_error_message IS '图片生成失败时的错误信息';
COMMENT ON COLUMN nrm_fission_task_items.video_url IS '生成的视频URL';
COMMENT ON COLUMN nrm_fission_task_items.video_path IS '生成的视频存储路径';
COMMENT ON COLUMN nrm_fission_task_items.video_status IS '视频状态：pending/processing/completed/failed';
COMMENT ON COLUMN nrm_fission_task_items.video_error_message IS '视频生成失败时的错误信息';
COMMENT ON COLUMN nrm_fission_task_items.retry_count IS '重试次数';
COMMENT ON COLUMN nrm_fission_task_items.created_at IS '创建时间戳（毫秒）';
COMMENT ON COLUMN nrm_fission_task_items.updated_at IS '更新时间戳（毫秒）';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_fission_task_items_fission_id ON nrm_fission_task_items(fission_video_status_id);
CREATE INDEX IF NOT EXISTS idx_fission_task_items_type ON nrm_fission_task_items(task_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fission_task_items_unique ON nrm_fission_task_items(fission_video_status_id, task_type, item_index);
```

- [ ] **步骤 2：扩展主表 nrm_fission_video_status**

```sql
-- 添加进度计数器字段
ALTER TABLE nrm_fission_video_status
ADD COLUMN IF NOT EXISTS image_video_total INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_video_completed INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_video_failed INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_story_total INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_story_completed INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_story_failed INT DEFAULT 0;

-- 添加字段注释
COMMENT ON COLUMN nrm_fission_video_status.image_video_total IS '图生视频总分镜数';
COMMENT ON COLUMN nrm_fission_video_status.image_video_completed IS '图生视频已完成数';
COMMENT ON COLUMN nrm_fission_video_status.image_video_failed IS '图生视频失败数';
COMMENT ON COLUMN nrm_fission_video_status.new_story_total IS '新故事总分镜数';
COMMENT ON COLUMN nrm_fission_video_status.new_story_completed IS '新故事已完成数';
COMMENT ON COLUMN nrm_fission_video_status.new_story_failed IS '新故事失败数';
```

- [ ] **步骤 3：验证表创建成功**

运行 SQL 验证：
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'nrm_fission_task_items'
ORDER BY ordinal_position;
```

---

## 任务 2：实现 FissionTaskItemsRepository

**文件：**
- 创建：`src/persistence/fission-task-items-repository.ts`

- [ ] **步骤 1：编写类型定义和接口**

```typescript
// src/persistence/fission-task-items-repository.ts

import { Pool } from "pg";
import { randomUUID } from "node:crypto";

// ========== 类型定义 ==========

/** 任务类型 */
export type FissionTaskType = 'image_video' | 'new_story';

/** 分镜项状态 */
export type FissionItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 分镜任务项记录 */
export interface FissionTaskItemRecord {
  id: string;
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
  imageUrl: string | null;
  imagePath: string | null;
  imageStatus: FissionItemStatus;
  imageErrorMessage: string | null;
  videoUrl: string | null;
  videoPath: string | null;
  videoStatus: FissionItemStatus;
  videoErrorMessage: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

/** 创建分镜任务项输入 */
export interface CreateFissionTaskItemInput {
  fissionVideoStatusId: string;
  taskType: FissionTaskType;
  itemIndex: number;
}

/** 更新图片状态输入 */
export interface UpdateImageStatusInput {
  imageUrl?: string;
  imagePath?: string;
  imageStatus: FissionItemStatus;
  imageErrorMessage?: string;
}

/** 更新视频状态输入 */
export interface UpdateVideoStatusInput {
  videoUrl?: string;
  videoPath?: string;
  videoStatus: FissionItemStatus;
  videoErrorMessage?: string;
}

/** 批量创建结果 */
export interface BatchCreateResult {
  created: number;
  skipped: number;
}

// ========== 数据库行类型 ==========

interface FissionTaskItemRow {
  id: string;
  fission_video_status_id: string;
  task_type: FissionTaskType;
  item_index: number;
  image_url: string | null;
  image_path: string | null;
  image_status: FissionItemStatus;
  image_error_message: string | null;
  video_url: string | null;
  video_path: string | null;
  video_status: FissionItemStatus;
  video_error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

// ========== Repository 接口 ==========

export interface IFissionTaskItemsRepository {
  /** 根据ID获取分镜任务项 */
  getById(id: string): Promise<FissionTaskItemRecord | null>;

  /** 根据裂变状态ID获取所有分镜任务项 */
  listByFissionStatusId(fissionVideoStatusId: string): Promise<FissionTaskItemRecord[]>;

  /** 根据裂变状态ID和任务类型获取分镜任务项 */
  listByFissionStatusIdAndType(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 获取待处理的分镜任务项（用于增量生成） */
  listPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 获取失败的分镜任务项（用于重试） */
  listFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 创建单个分镜任务项 */
  create(input: CreateFissionTaskItemInput): Promise<FissionTaskItemRecord>;

  /** 批量创建分镜任务项（幂等，已存在则跳过） */
  batchCreate(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    totalCount: number
  ): Promise<BatchCreateResult>;

  /** 更新图片状态 */
  updateImageStatus(id: string, input: UpdateImageStatusInput): Promise<FissionTaskItemRecord>;

  /** 更新视频状态 */
  updateVideoStatus(id: string, input: UpdateVideoStatusInput): Promise<FissionTaskItemRecord>;

  /** 增加重试计数 */
  incrementRetryCount(id: string): Promise<FissionTaskItemRecord>;

  /** 删除指定裂变状态的所有分镜任务项 */
  deleteByFissionStatusId(fissionVideoStatusId: string): Promise<number>;
}

// ========== Repository 实现 ==========

export class FissionTaskItemsRepository implements IFissionTaskItemsRepository {
  constructor(private pool: Pool) {}

  private table(name: string): string {
    return `nrm_${name}`;
  }

  private rowToRecord(row: FissionTaskItemRow): FissionTaskItemRecord {
    return {
      id: row.id,
      fissionVideoStatusId: row.fission_video_status_id,
      taskType: row.task_type,
      itemIndex: row.item_index,
      imageUrl: row.image_url,
      imagePath: row.image_path,
      imageStatus: row.image_status,
      imageErrorMessage: row.image_error_message,
      videoUrl: row.video_url,
      videoPath: row.video_path,
      videoStatus: row.video_status,
      videoErrorMessage: row.video_error_message,
      retryCount: row.retry_count,
      createdAt: parseInt(row.created_at, 10),
      updatedAt: parseInt(row.updated_at, 10),
    };
  }

  async getById(id: string): Promise<FissionTaskItemRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table('fission_task_items')} WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? this.rowToRecord(result.rows[0]) : null;
  }

  async listByFissionStatusId(fissionVideoStatusId: string): Promise<FissionTaskItemRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table('fission_task_items')}
       WHERE fission_video_status_id = $1
       ORDER BY task_type, item_index`,
      [fissionVideoStatusId]
    );
    return result.rows.map(this.rowToRecord);
  }

  async listByFissionStatusIdAndType(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table('fission_task_items')}
       WHERE fission_video_status_id = $1 AND task_type = $2
       ORDER BY item_index`,
      [fissionVideoStatusId, taskType]
    );
    return result.rows.map(this.rowToRecord);
  }

  async listPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table('fission_task_items')}
       WHERE fission_video_status_id = $1
         AND task_type = $2
         AND (image_status = 'pending' OR video_status = 'pending')
       ORDER BY item_index`,
      [fissionVideoStatusId, taskType]
    );
    return result.rows.map(this.rowToRecord);
  }

  async listFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table('fission_task_items')}
       WHERE fission_video_status_id = $1
         AND task_type = $2
         AND (image_status = 'failed' OR video_status = 'failed')
       ORDER BY item_index`,
      [fissionVideoStatusId, taskType]
    );
    return result.rows.map(this.rowToRecord);
  }

  async create(input: CreateFissionTaskItemInput): Promise<FissionTaskItemRecord> {
    const id = randomUUID();
    const now = Date.now();

    const result = await this.pool.query(
      `INSERT INTO ${this.table('fission_task_items')}
       (id, fission_video_status_id, task_type, item_index, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [id, input.fissionVideoStatusId, input.taskType, input.itemIndex, now]
    );

    return this.rowToRecord(result.rows[0]);
  }

  async batchCreate(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    totalCount: number
  ): Promise<BatchCreateResult> {
    let created = 0;
    let skipped = 0;

    for (let i = 1; i <= totalCount; i++) {
      try {
        await this.create({
          fissionVideoStatusId,
          taskType,
          itemIndex: i,
        });
        created++;
      } catch (error) {
        // 唯一索引冲突表示已存在，跳过
        if ((error as { code?: string }).code === '23505') {
          skipped++;
        } else {
          throw error;
        }
      }
    }

    return { created, skipped };
  }

  async updateImageStatus(
    id: string,
    input: UpdateImageStatusInput
  ): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const updates: string[] = ['image_status = $2', 'updated_at = $3'];
    const values: (string | number | null)[] = [id, input.imageStatus, now];
    let paramIndex = 4;

    if (input.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      values.push(input.imageUrl);
      paramIndex++;
    }
    if (input.imagePath !== undefined) {
      updates.push(`image_path = $${paramIndex}`);
      values.push(input.imagePath);
      paramIndex++;
    }
    if (input.imageErrorMessage !== undefined) {
      updates.push(`image_error_message = $${paramIndex}`);
      values.push(input.imageErrorMessage);
      paramIndex++;
    }

    const result = await this.pool.query(
      `UPDATE ${this.table('fission_task_items')}
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      values
    );

    return this.rowToRecord(result.rows[0]);
  }

  async updateVideoStatus(
    id: string,
    input: UpdateVideoStatusInput
  ): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const updates: string[] = ['video_status = $2', 'updated_at = $3'];
    const values: (string | number | null)[] = [id, input.videoStatus, now];
    let paramIndex = 4;

    if (input.videoUrl !== undefined) {
      updates.push(`video_url = $${paramIndex}`);
      values.push(input.videoUrl);
      paramIndex++;
    }
    if (input.videoPath !== undefined) {
      updates.push(`video_path = $${paramIndex}`);
      values.push(input.videoPath);
      paramIndex++;
    }
    if (input.videoErrorMessage !== undefined) {
      updates.push(`video_error_message = $${paramIndex}`);
      values.push(input.videoErrorMessage);
      paramIndex++;
    }

    const result = await this.pool.query(
      `UPDATE ${this.table('fission_task_items')}
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      values
    );

    return this.rowToRecord(result.rows[0]);
  }

  async incrementRetryCount(id: string): Promise<FissionTaskItemRecord> {
    const now = Date.now();
    const result = await this.pool.query(
      `UPDATE ${this.table('fission_task_items')}
       SET retry_count = retry_count + 1, updated_at = $2
       WHERE id = $1
       RETURNING *`,
      [id, now]
    );

    return this.rowToRecord(result.rows[0]);
  }

  async deleteByFissionStatusId(fissionVideoStatusId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM ${this.table('fission_task_items')}
       WHERE fission_video_status_id = $1`,
      [fissionVideoStatusId]
    );

    return result.rowCount ?? 0;
  }
}

// ========== 工厂函数 ==========

export function createFissionTaskItemsRepository(pool: Pool): IFissionTaskItemsRepository {
  return new FissionTaskItemsRepository(pool);
}
```

- [ ] **步骤 2：验证编译通过**

运行：`npm run build`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/persistence/fission-task-items-repository.ts
git commit -m "$(cat <<'EOF'
feat(fission): 添加分镜任务项 Repository

- 新增 FissionTaskItemsRepository 用于追踪每个分镜的生成状态
- 支持批量创建、增量查询、状态更新等操作
- 图片和视频状态独立管理，支持单独重试
EOF
)"
```

---

## 任务 3：实现 FissionTaskItemsService

**文件：**
- 创建：`src/modules/fission-video/fission-task-items-service.ts`
- 修改：`src/service/services-sub.ts`

- [ ] **步骤 1：编写 Service 实现**

```typescript
// src/modules/fission-video/fission-task-items-service.ts

import type { Pool } from "pg";
import {
  createFissionTaskItemsRepository,
  type IFissionTaskItemsRepository,
  type FissionTaskItemRecord,
  type FissionTaskType,
  type FissionItemStatus,
  type BatchCreateResult,
} from "../../persistence/fission-task-items-repository.js";
import { FissionVideoStatusService } from "../../service/services-sub.js";

// ========== 类型定义 ==========

/** 任务进度统计 */
export interface TaskProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
}

/** 分镜项进度信息 */
export interface StoryboardItemProgress {
  itemIndex: number;
  imageStatus: FissionItemStatus;
  videoStatus: FissionItemStatus;
  imageUrl: string | null;
  videoUrl: string | null;
  imageErrorMessage: string | null;
  videoErrorMessage: string | null;
  retryCount: number;
}

/** 任务进度详情 */
export interface TaskProgressDetail {
  imageVideo: TaskProgress;
  newStory: TaskProgress;
  items: StoryboardItemProgress[];
}

// ========== Service 接口 ==========

export interface IFissionTaskItemsService {
  /** 初始化任务项（批量创建，幂等） */
  initializeTaskItems(
    fissionVideoStatusId: string,
    imageVideoCount: number,
    newStoryCount: number
  ): Promise<{ imageVideo: BatchCreateResult; newStory: BatchCreateResult }>;

  /** 获取待处理的分镜项 */
  getPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 获取失败的分镜项 */
  getFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 更新图片状态并同步主表计数 */
  updateImageStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: { imageUrl?: string; imagePath?: string; status: FissionItemStatus; errorMessage?: string }
  ): Promise<FissionTaskItemRecord>;

  /** 更新视频状态并同步主表计数 */
  updateVideoStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: { videoUrl?: string; videoPath?: string; status: FissionItemStatus; errorMessage?: string }
  ): Promise<FissionTaskItemRecord>;

  /** 获取任务进度详情 */
  getTaskProgress(fissionVideoStatusId: string): Promise<TaskProgressDetail>;

  /** 重置失败项为待处理状态（用于重试） */
  resetFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    itemIds?: string[]  // 可选，不传则重置所有失败项
  ): Promise<number>;
}

// ========== Service 实现 ==========

export class FissionTaskItemsService implements IFissionTaskItemsService {
  private repository: IFissionTaskItemsRepository;
  private statusService: FissionVideoStatusService;

  constructor(pool: Pool, statusService: FissionVideoStatusService) {
    this.repository = createFissionTaskItemsRepository(pool);
    this.statusService = statusService;
  }

  async initializeTaskItems(
    fissionVideoStatusId: string,
    imageVideoCount: number,
    newStoryCount: number
  ): Promise<{ imageVideo: BatchCreateResult; newStory: BatchCreateResult }> {
    // 批量创建图生视频任务项
    const imageVideo = await this.repository.batchCreate(
      fissionVideoStatusId,
      'image_video',
      imageVideoCount
    );

    // 批量创建新故事任务项
    const newStory = await this.repository.batchCreate(
      fissionVideoStatusId,
      'new_story',
      newStoryCount
    );

    // 更新主表计数器
    await this.statusService.update(fissionVideoStatusId, {
      imageVideoTotal: imageVideoCount,
      imageVideoCompleted: 0,
      imageVideoFailed: 0,
      newStoryTotal: newStoryCount,
      newStoryCompleted: 0,
      newStoryFailed: 0,
    });

    return { imageVideo, newStory };
  }

  async getPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    return this.repository.listPendingItems(fissionVideoStatusId, taskType);
  }

  async getFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    return this.repository.listFailedItems(fissionVideoStatusId, taskType);
  }

  async updateImageStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: { imageUrl?: string; imagePath?: string; status: FissionItemStatus; errorMessage?: string }
  ): Promise<FissionTaskItemRecord> {
    // 更新分镜项状态
    const record = await this.repository.updateImageStatus(id, {
      imageUrl: input.imageUrl,
      imagePath: input.imagePath,
      imageStatus: input.status,
      imageErrorMessage: input.errorMessage,
    });

    // 同步更新主表计数器
    await this.syncProgressCounters(fissionVideoStatusId, taskType);

    return record;
  }

  async updateVideoStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: { videoUrl?: string; videoPath?: string; status: FissionItemStatus; errorMessage?: string }
  ): Promise<FissionTaskItemRecord> {
    // 更新分镜项状态
    const record = await this.repository.updateVideoStatus(id, {
      videoUrl: input.videoUrl,
      videoPath: input.videoPath,
      videoStatus: input.status,
      videoErrorMessage: input.errorMessage,
    });

    // 同步更新主表计数器
    await this.syncProgressCounters(fissionVideoStatusId, taskType);

    return record;
  }

  async getTaskProgress(fissionVideoStatusId: string): Promise<TaskProgressDetail> {
    const items = await this.repository.listByFissionStatusId(fissionVideoStatusId);

    const imageVideoItems = items.filter(item => item.taskType === 'image_video');
    const newStoryItems = items.filter(item => item.taskType === 'new_story');

    const calculateProgress = (taskItems: FissionTaskItemRecord[]): TaskProgress => {
      const total = taskItems.length;
      let completed = 0;
      let failed = 0;
      let pending = 0;
      let processing = 0;

      for (const item of taskItems) {
        // 视频完成才算整体完成
        if (item.videoStatus === 'completed') {
          completed++;
        } else if (item.videoStatus === 'failed') {
          failed++;
        } else if (item.videoStatus === 'processing') {
          processing++;
        } else {
          pending++;
        }
      }

      return { total, completed, failed, pending, processing };
    };

    const storyboardItems: StoryboardItemProgress[] = items.map(item => ({
      itemIndex: item.itemIndex,
      imageStatus: item.imageStatus,
      videoStatus: item.videoStatus,
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      imageErrorMessage: item.imageErrorMessage,
      videoErrorMessage: item.videoErrorMessage,
      retryCount: item.retryCount,
    }));

    return {
      imageVideo: calculateProgress(imageVideoItems),
      newStory: calculateProgress(newStoryItems),
      items: storyboardItems,
    };
  }

  async resetFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    itemIds?: string[]
  ): Promise<number> {
    const failedItems = await this.repository.listFailedItems(fissionVideoStatusId, taskType);
    const itemsToReset = itemIds
      ? failedItems.filter(item => itemIds.includes(item.id))
      : failedItems;

    let resetCount = 0;
    for (const item of itemsToReset) {
      // 重置图片状态（如果图片也失败）
      if (item.imageStatus === 'failed') {
        await this.repository.updateImageStatus(item.id, {
          imageStatus: 'pending',
          imageErrorMessage: null,
        });
      }

      // 重置视频状态
      await this.repository.updateVideoStatus(item.id, {
        videoStatus: 'pending',
        videoErrorMessage: null,
      });

      // 增加重试计数
      await this.repository.incrementRetryCount(item.id);
      resetCount++;
    }

    // 同步更新主表计数器
    await this.syncProgressCounters(fissionVideoStatusId, taskType);

    return resetCount;
  }

  /** 同步主表进度计数器 */
  private async syncProgressCounters(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<void> {
    const items = await this.repository.listByFissionStatusIdAndType(fissionVideoStatusId, taskType);

    let completed = 0;
    let failed = 0;

    for (const item of items) {
      if (item.videoStatus === 'completed') {
        completed++;
      } else if (item.videoStatus === 'failed') {
        failed++;
      }
    }

    const updateData =
      taskType === 'image_video'
        ? { imageVideoCompleted: completed, imageVideoFailed: failed }
        : { newStoryCompleted: completed, newStoryFailed: failed };

    await this.statusService.update(fissionVideoStatusId, updateData);
  }
}

// ========== 工厂函数 ==========

export function createFissionTaskItemsService(
  pool: Pool,
  statusService: FissionVideoStatusService
): IFissionTaskItemsService {
  return new FissionTaskItemsService(pool, statusService);
}
```

- [ ] **步骤 2：更新 services-sub.ts 导出**

在 `src/service/services-sub.ts` 文件末尾添加导出：

```typescript
// 在文件末尾添加

// ========== 导出裂变任务项服务 ==========
export {
  createFissionTaskItemsService,
  type IFissionTaskItemsService,
  type TaskProgress,
  type TaskProgressDetail,
  type StoryboardItemProgress,
} from "../modules/fission-video/fission-task-items-service.js";

export {
  createFissionTaskItemsRepository,
  type IFissionTaskItemsRepository,
  type FissionTaskItemRecord,
  type FissionTaskType,
  type FissionItemStatus,
} from "../persistence/fission-task-items-repository.js";
```

- [ ] **步骤 3：验证编译通过**

运行：`npm run build`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add src/modules/fission-video/fission-task-items-service.ts src/service/services-sub.ts
git commit -m "$(cat <<'EOF'
feat(fission): 添加分镜任务项 Service

- FissionTaskItemsService 封装业务逻辑，自动同步主表计数器
- 支持增量获取待处理/失败项，支持重置失败项重试
- 提供进度统计接口供前端展示
EOF
)"
```

---

## 任务 4：修改 FissionVideoStatusService 支持新字段

**文件：**
- 修改：`src/service/services-sub.ts`

- [ ] **步骤 1：更新类型定义**

找到 `FissionVideoStatusRow` 接口，添加新字段：

```typescript
// 在 FissionVideoStatusRow 接口中添加字段
interface FissionVideoStatusRow {
  // ... 现有字段 ...
  image_video_total: number | null;
  image_video_completed: number | null;
  image_video_failed: number | null;
  new_story_total: number | null;
  new_story_completed: number | null;
  new_story_failed: number | null;
}
```

- [ ] **步骤 2：更新 CreateFissionVideoStatusInput 接口**

```typescript
// 在 CreateFissionVideoStatusInput 接口中添加可选字段
export interface CreateFissionVideoStatusInput {
  // ... 现有字段 ...
  imageVideoTotal?: number;
  imageVideoCompleted?: number;
  imageVideoFailed?: number;
  newStoryTotal?: number;
  newStoryCompleted?: number;
  newStoryFailed?: number;
}
```

- [ ] **步骤 3：更新 UpdateFissionVideoStatusInput 接口**

```typescript
// 在 UpdateFissionVideoStatusInput 接口中添加可选字段
export interface UpdateFissionVideoStatusInput {
  // ... 现有字段 ...
  imageVideoTotal?: number;
  imageVideoCompleted?: number;
  imageVideoFailed?: number;
  newStoryTotal?: number;
  newStoryCompleted?: number;
  newStoryFailed?: number;
}
```

- [ ] **步骤 4：更新 rowToRecord 方法**

在 `rowToRecord` 方法中添加新字段映射：

```typescript
private rowToRecord(row: FissionVideoStatusRow): FissionVideoStatusRecord {
  return {
    // ... 现有字段映射 ...
    imageVideoTotal: row.image_video_total ?? 0,
    imageVideoCompleted: row.image_video_completed ?? 0,
    imageVideoFailed: row.image_video_failed ?? 0,
    newStoryTotal: row.new_story_total ?? 0,
    newStoryCompleted: row.new_story_completed ?? 0,
    newStoryFailed: row.new_story_failed ?? 0,
  };
}
```

- [ ] **步骤 5：更新 create 方法**

在 SQL INSERT 语句中添加新字段：

```typescript
async create(input: CreateFissionVideoStatusInput, creatorId: string): Promise<FissionVideoStatusRecord> {
  const id = randomUUID();
  const now = Date.now();

  const result = await this.pool.query(
    `INSERT INTO ${this.table('fission_video_status')}
     (id, project_id, status, /* 其他现有字段 */, 
      image_video_total, image_video_completed, image_video_failed,
      new_story_total, new_story_completed, new_story_failed,
      creator_id, created_at, updated_at)
     VALUES ($1, $2, $3, /* 其他参数 */,
             $4, $5, $6, $7, $8, $9,
             $10, $11, $11)
     RETURNING *`,
    [id, input.projectId, input.status, /* 其他参数 */,
     input.imageVideoTotal ?? 0, input.imageVideoCompleted ?? 0, input.imageVideoFailed ?? 0,
     input.newStoryTotal ?? 0, input.newStoryCompleted ?? 0, input.newStoryFailed ?? 0,
     creatorId, now]
  );

  return this.rowToRecord(result.rows[0]);
}
```

- [ ] **步骤 6：更新 update 方法**

在 SQL UPDATE 语句中添加新字段：

```typescript
async update(id: string, input: UpdateFissionVideoStatusInput): Promise<FissionVideoStatusRecord> {
  const now = Date.now();
  const updates: string[] = ['updated_at = $2'];
  const values: (string | number | null)[] = [id, now];
  let paramIndex = 3;

  // ... 现有字段更新逻辑 ...

  // 添加新字段的更新逻辑
  if (input.imageVideoTotal !== undefined) {
    updates.push(`image_video_total = $${paramIndex}`);
    values.push(input.imageVideoTotal);
    paramIndex++;
  }
  if (input.imageVideoCompleted !== undefined) {
    updates.push(`image_video_completed = $${paramIndex}`);
    values.push(input.imageVideoCompleted);
    paramIndex++;
  }
  if (input.imageVideoFailed !== undefined) {
    updates.push(`image_video_failed = $${paramIndex}`);
    values.push(input.imageVideoFailed);
    paramIndex++;
  }
  if (input.newStoryTotal !== undefined) {
    updates.push(`new_story_total = $${paramIndex}`);
    values.push(input.newStoryTotal);
    paramIndex++;
  }
  if (input.newStoryCompleted !== undefined) {
    updates.push(`new_story_completed = $${paramIndex}`);
    values.push(input.newStoryCompleted);
    paramIndex++;
  }
  if (input.newStoryFailed !== undefined) {
    updates.push(`new_story_failed = $${paramIndex}`);
    values.push(input.newStoryFailed);
    paramIndex++;
  }

  const result = await this.pool.query(
    `UPDATE ${this.table('fission_video_status')}
     SET ${updates.join(', ')}
     WHERE id = $1
     RETURNING *`,
    values
  );

  return this.rowToRecord(result.rows[0]);
}
```

- [ ] **步骤 7：验证编译通过**

运行：`npm run build`
预期：无错误

- [ ] **步骤 8：Commit**

```bash
git add src/service/services-sub.ts
git commit -m "$(cat <<'EOF'
feat(fission): FissionVideoStatusService 支持进度计数器

- 添加图生视频和新故事的完成/失败计数器字段
- 更新 create/update 方法支持新字段
EOF
)"
```

---

## 任务 5：修改 fission-video-config.ts 添加新状态

**文件：**
- 修改：`src/modules/fission-video/fission-video-config.ts`

- [ ] **步骤 1：更新 FissionStatus 枚举**

```typescript
// src/modules/fission-video/fission-video-config.ts

export enum FissionStatus {
  /** 新建中 */
  CREATING = "新建中",
  /** 整理镜像 */
  ORGANIZING_MIRROR = "整理镜像",
  /** 并行执行中（新增） */
  PARALLEL_RUNNING = "并行执行中",
  /** 部分完成（新增） */
  PARTIAL_COMPLETE = "部分完成",
  /** 等待步骤4（新增） */
  READY_FOR_STEP4 = "等待步骤4",
  /** 新镜像 */
  NEW_MIRROR = "新镜像",
  /** 新故事 */
  NEW_STORY = "新故事",
  /** 新故事完成 */
  NEW_STORY_FINISH = "新故事完成",
  /** 已完成 */
  COMPLETED = "已完成",
}
```

- [ ] **步骤 2：验证编译通过**

运行：`npm run build`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/modules/fission-video/fission-video-config.ts
git commit -m "$(cat <<'EOF'
feat(fission): 添加裂变流程新状态

- PARALLEL_RUNNING: 图生视频和新故事并行执行中
- PARTIAL_COMPLETE: 部分分镜完成
- READY_FOR_STEP4: 等待用户进入步骤4
EOF
)"
```

---

## 任务 6：修改 fission-video-routes.ts 实现并行执行

**文件：**
- 修改：`src/routes/fission-video-routes.ts`

- [ ] **步骤 1：添加新 API - 并行执行入口**

在 `createFissionVideoRouteHandlersWithContext` 函数中添加新的处理器：

```typescript
// 在 FissionVideoRouteHandlers 接口中添加
export interface FissionVideoRouteHandlers {
  // ... 现有处理器 ...
  
  /** 并行执行图生视频和新故事 */
  startParallelFission: RouteHandlerMethod;
  
  /** 获取任务进度 */
  getFissionProgress: RouteHandlerMethod;
  
  /** 重试失败项 */
  retryFailedItems: RouteHandlerMethod;
}
```

- [ ] **步骤 2：实现 startParallelFission 处理器**

```typescript
// 在 createFissionVideoRouteHandlersWithContext 函数中实现

startParallelFission: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const { projectId, imageVideoCount, newStoryCount } = request.body as {
    projectId: string;
    imageVideoCount: number;
    newStoryCount: number;
  };

  if (!projectId || imageVideoCount === undefined || newStoryCount === undefined) {
    return reply.status(400).send({ error: "缺少必要参数" });
  }

  try {
    // 获取或创建裂变状态记录
    let statusRecord = await fissionVideoStatusService.getByProject(projectId);
    if (!statusRecord) {
      statusRecord = await fissionVideoStatusService.create(
        {
          projectId,
          status: FissionStatus.PARALLEL_RUNNING,
        },
        user.id
      );
    } else {
      // 更新状态为并行执行中
      await fissionVideoStatusService.update(statusRecord.id, {
        status: FissionStatus.PARALLEL_RUNNING,
      });
    }

    // 初始化任务项
    const taskItemsService = createFissionTaskItemsService(ctx.pool, fissionVideoStatusService);
    await taskItemsService.initializeTaskItems(
      statusRecord.id,
      imageVideoCount,
      newStoryCount
    );

    // 并行启动两个任务（不等待结果，直接返回）
    // 图生视频任务
    const imageVideoPromise = executeImageVideoTask(
      projectId,
      statusRecord.id,
      ctx,
      user,
      storage,
      taskItemsService
    ).catch(error => {
      ctx.log.error({ error }, "图生视频任务失败");
    });

    // 新故事任务
    const newStoryPromise = executeNewStoryTask(
      projectId,
      statusRecord.id,
      ctx,
      user,
      storage,
      taskItemsService
    ).catch(error => {
      ctx.log.error({ error }, "新故事任务失败");
    });

    // 不等待任务完成，直接返回
    // 任务会在后台继续执行
    Promise.all([imageVideoPromise, newStoryPromise]).then(() => {
      // 所有任务完成后更新状态
      updateFinalStatus(projectId, statusRecord.id, ctx).catch(err => {
        ctx.log.error({ err }, "更新最终状态失败");
      });
    });

    return reply.send({
      success: true,
      fissionVideoStatusId: statusRecord.id,
      message: "并行任务已启动",
    });
  } catch (error) {
    ctx.log.error({ error }, "启动并行裂变失败");
    return reply.status(500).send({ error: "启动并行裂变失败" });
  }
},
```

- [ ] **步骤 3：实现 executeImageVideoTask 辅助函数**

```typescript
// 在文件顶部或 createFissionVideoRouteHandlersWithContext 外部

/** 执行图生视频任务（支持增量恢复） */
async function executeImageVideoTask(
  projectId: string,
  fissionVideoStatusId: string,
  ctx: AppContext,
  user: User,
  storage: IObjectStorageAdapter,
  taskItemsService: IFissionTaskItemsService
): Promise<void> {
  // 获取待处理的分镜项
  const pendingItems = await taskItemsService.getPendingItems(fissionVideoStatusId, 'image_video');

  if (pendingItems.length === 0) {
    ctx.log.info({ projectId }, "图生视频无待处理项，可能已完成");
    return;
  }

  // 获取项目数据和 shotPrompts
  const projectData = await getProjectData(projectId, ctx);
  const shotPrompts = await getShotPrompts(projectId, ctx);

  // 提取图片列表
  const allImages = extractImagesFromProjectData(projectData, shotPrompts);

  // 只处理待处理的图片
  const imagesToProcess = pendingItems.map(item => allImages[item.itemIndex - 1]).filter(Boolean);

  // 调用现有的图生视频生成逻辑
  const result = await generateImageToVideoVideos({
    projectId,
    images: imagesToProcess,
    ctx,
    userId: user.id,
    storage,
    onProgress: async (percent, message) => {
      ctx.log.info({ projectId, percent, message }, "图生视频进度");
    },
  });

  // 更新每个分镜项的状态
  for (const video of result.videos) {
    const item = pendingItems.find(i => i.itemIndex === video.imageIndex + 1);
    if (item) {
      await taskItemsService.updateVideoStatus(
        item.id,
        fissionVideoStatusId,
        'image_video',
        {
          videoUrl: video.url,
          videoPath: video.path,
          status: 'completed',
        }
      );
    }
  }

  // 更新失败项
  for (const failed of result.failedItems) {
    const item = pendingItems.find(i => i.itemIndex === failed.imageIndex + 1);
    if (item) {
      await taskItemsService.updateVideoStatus(
        item.id,
        fissionVideoStatusId,
        'image_video',
        {
          status: 'failed',
          errorMessage: failed.errorMessage,
        }
      );
    }
  }
}
```

- [ ] **步骤 4：实现 executeNewStoryTask 辅助函数**

```typescript
/** 执行新故事任务（支持增量恢复） */
async function executeNewStoryTask(
  projectId: string,
  fissionVideoStatusId: string,
  ctx: AppContext,
  user: User,
  storage: IObjectStorageAdapter,
  taskItemsService: IFissionTaskItemsService
): Promise<void> {
  // 检查是否已有新故事数据（阶段1已完成）
  let statusRecord = await fissionVideoStatusService.getByProject(projectId);
  let newStoryJson = statusRecord?.newStoryJson;

  // 如果没有，先执行阶段1生成新故事
  if (!newStoryJson) {
    const storyResult = await generateNewStory(projectId, ctx, user);
    newStoryJson = storyResult.newStoryJson;

    // 保存到主表
    await fissionVideoStatusService.updateNewStoryJson(projectId, newStoryJson);
  }

  // 获取待处理的分镜项（固定为2个：扩张开头和扩张结尾）
  const pendingItems = await taskItemsService.getPendingItems(fissionVideoStatusId, 'new_story');

  if (pendingItems.length === 0) {
    ctx.log.info({ projectId }, "新故事无待处理项，可能已完成");
    return;
  }

  // 执行图片和视频生成
  const orchestrator = createFissionNewStoryOrchestrator({
    pool: ctx.pool,
    storage,
    ctx,
    userId: user.id,
  });

  // 使用现有逻辑生成图片和视频
  // 但改为逐个分镜处理，并更新任务项状态
  for (const item of pendingItems) {
    try {
      // 获取对应的分镜数据
      const shotData = newStoryJson.storyboards?.[item.itemIndex - 1];
      if (!shotData) {
        await taskItemsService.updateVideoStatus(
          item.id,
          fissionVideoStatusId,
          'new_story',
          { status: 'failed', errorMessage: '分镜数据不存在' }
        );
        continue;
      }

      // 生成图片
      const imageUrl = await generateStoryboardImage(shotData, projectId, ctx, user, storage);
      await taskItemsService.updateImageStatus(
        item.id,
        fissionVideoStatusId,
        'new_story',
        { imageUrl, status: 'completed' }
      );

      // 生成视频
      const videoUrl = await generateStoryboardVideo(shotData, imageUrl, projectId, ctx, user, storage);
      await taskItemsService.updateVideoStatus(
        item.id,
        fissionVideoStatusId,
        'new_story',
        { videoUrl, status: 'completed' }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      await taskItemsService.updateVideoStatus(
        item.id,
        fissionVideoStatusId,
        'new_story',
        { status: 'failed', errorMessage }
      );
    }
  }
}
```

- [ ] **步骤 5：实现 getFissionProgress 处理器**

```typescript
getFissionProgress: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const { projectId } = request.params as { projectId: string };

  try {
    const statusRecord = await fissionVideoStatusService.getByProject(projectId);
    if (!statusRecord) {
      return reply.status(404).send({ error: "未找到裂变状态记录" });
    }

    const taskItemsService = createFissionTaskItemsService(ctx.pool, fissionVideoStatusService);
    const progress = await taskItemsService.getTaskProgress(statusRecord.id);

    return reply.send({
      success: true,
      status: statusRecord.status,
      progress,
    });
  } catch (error) {
    ctx.log.error({ error }, "获取裂变进度失败");
    return reply.status(500).send({ error: "获取裂变进度失败" });
  }
},
```

- [ ] **步骤 6：实现 retryFailedItems 处理器**

```typescript
retryFailedItems: async (request, reply) => {
  const user = await requireUser(ctx, request);
  const { projectId, taskType, itemIds } = request.body as {
    projectId: string;
    taskType: 'image_video' | 'new_story';
    itemIds?: string[];
  };

  try {
    const statusRecord = await fissionVideoStatusService.getByProject(projectId);
    if (!statusRecord) {
      return reply.status(404).send({ error: "未找到裂变状态记录" });
    }

    const taskItemsService = createFissionTaskItemsService(ctx.pool, fissionVideoStatusService);

    // 重置失败项状态
    const resetCount = await taskItemsService.resetFailedItems(
      statusRecord.id,
      taskType,
      itemIds
    );

    // 重新执行对应任务
    if (taskType === 'image_video') {
      executeImageVideoTask(projectId, statusRecord.id, ctx, user, storage, taskItemsService)
        .catch(error => ctx.log.error({ error }, "重试图生视频失败"));
    } else {
      executeNewStoryTask(projectId, statusRecord.id, ctx, user, storage, taskItemsService)
        .catch(error => ctx.log.error({ error }, "重试新故事失败"));
    }

    return reply.send({
      success: true,
      resetCount,
      message: `已重置 ${resetCount} 个失败项`,
    });
  } catch (error) {
    ctx.log.error({ error }, "重试失败项失败");
    return reply.status(500).send({ error: "重试失败项失败" });
  }
},
```

- [ ] **步骤 7：注册新路由**

在 `registerFissionVideoRoutes` 函数中添加：

```typescript
export function registerFissionVideoRoutes(
  app: FastifyInstance,
  handlers: FissionVideoRouteHandlers
): void {
  // ... 现有路由 ...

  // 新增路由
  app.post("/fission/parallel/start", handlers.startParallelFission);
  app.get("/fission/progress/:projectId", handlers.getFissionProgress);
  app.post("/fission/retry", handlers.retryFailedItems);
}
```

- [ ] **步骤 8：验证编译通过**

运行：`npm run build`
预期：无错误

- [ ] **步骤 9：Commit**

```bash
git add src/routes/fission-video-routes.ts
git commit -m "$(cat <<'EOF'
feat(fission): 实现并行执行和增量恢复 API

- startParallelFission: 并行启动图生视频和新故事任务
- getFissionProgress: 获取任务进度详情
- retryFailedItems: 重试失败的分镜项
- 支持增量恢复：自动跳过已完成的分镜
EOF
)"
```

---

## 任务 7：修改前端 useFissionVideo.ts

**文件：**
- 修改：`apps/web/pages/fission/useFissionVideo.ts`

- [ ] **步骤 1：添加并行执行和状态轮询 Hook**

```typescript
// 在文件中添加新的 Hook 函数

/** 并行执行裂变任务 */
export function useParallelFission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      imageVideoCount: number;
      newStoryCount: number;
    }) => {
      const response = await fetch('/neirongmiao/api/fission/parallel/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('启动并行裂变失败');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fission-progress'] });
    },
  });
}

/** 获取裂变进度 */
export function useFissionProgress(projectId: string | undefined) {
  return useQuery({
    queryKey: ['fission-progress', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await fetch(`/neirongmiao/api/fission/progress/${projectId}`);
      if (!response.ok) throw new Error('获取进度失败');
      return response.json();
    },
    refetchInterval: (query) => {
      // 如果状态是并行执行中，每3秒刷新一次
      if (query.state.data?.status === '并行执行中') {
        return 3000;
      }
      // 否则停止轮询
      return false;
    },
    enabled: !!projectId,
  });
}

/** 重试失败项 */
export function useRetryFailedItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      taskType: 'image_video' | 'new_story';
      itemIds?: string[];
    }) => {
      const response = await fetch('/neirongmiao/api/fission/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('重试失败');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fission-progress'] });
    },
  });
}
```

- [ ] **步骤 2：导出新 Hook**

在文件末尾的导出语句中添加：

```typescript
export {
  useParallelFission,
  useFissionProgress,
  useRetryFailedItems,
};
```

- [ ] **步骤 3：验证编译通过**

运行：`npm run build:ui`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/fission/useFissionVideo.ts
git commit -m "$(cat <<'EOF'
feat(fission): 前端添加并行执行和状态轮询 Hook

- useParallelFission: 启动并行裂变任务
- useFissionProgress: 轮询任务进度（3秒间隔）
- useRetryFailedItems: 重试失败的分镜项
EOF
)"
```

---

## 任务 8：修改前端 Step6FissionScreen.tsx

**文件：**
- 修改：`apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx`

- [ ] **步骤 1：添加进度展示组件**

```tsx
// 在文件中添加进度展示组件

import { useFissionProgress, useRetryFailedItems } from '../../fission/useFissionVideo';

/** 进度条组件 */
function FissionProgressBar({ progress }: { progress: TaskProgressDetail }) {
  const { imageVideo, newStory } = progress;

  const total = imageVideo.total + newStory.total;
  const completed = imageVideo.completed + newStory.completed;
  const failed = imageVideo.failed + newStory.failed;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 总进度 */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>总进度</span>
          <span>{completed}/{total} ({percent}%)</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* 分类进度 */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-600">图生视频</div>
          <div className="flex items-center gap-2">
            <span>{imageVideo.completed}/{imageVideo.total}</span>
            {imageVideo.failed > 0 && (
              <span className="text-red-500">({imageVideo.failed} 失败)</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-gray-600">新故事</div>
          <div className="flex items-center gap-2">
            <span>{newStory.completed}/{newStory.total}</span>
            {newStory.failed > 0 && (
              <span className="text-red-500">({newStory.failed} 失败)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 失败项列表组件 */
function FailedItemsList({
  items,
  taskType,
  onRetry
}: {
  items: StoryboardItemProgress[];
  taskType: 'image_video' | 'new_story';
  onRetry: (itemIds?: string[]) => void;
}) {
  const failedItems = items.filter(
    item => item.imageStatus === 'failed' || item.videoStatus === 'failed'
  );

  if (failedItems.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-red-50 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-red-800">
          {taskType === 'image_video' ? '图生视频' : '新故事'}失败项
        </h4>
        <button
          onClick={() => onRetry()}
          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          重试全部
        </button>
      </div>
      <ul className="space-y-1 text-sm">
        {failedItems.map(item => (
          <li key={item.itemIndex} className="flex justify-between items-center">
            <span>分镜 {item.itemIndex}</span>
            <div className="flex items-center gap-2">
              <span className="text-red-600">
                {item.imageErrorMessage || item.videoErrorMessage}
              </span>
              <button
                onClick={() => onRetry([String(item.itemIndex)])}
                className="text-blue-600 hover:underline"
              >
                重试
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **步骤 2：在主组件中集成**

```tsx
// 在 Step6FissionScreen 组件中使用

export function Step6FissionScreen({ projectId }: { projectId: string }) {
  const { data: progressData, isLoading } = useFissionProgress(projectId);
  const retryMutation = useRetryFailedItems();

  const handleRetry = (taskType: 'image_video' | 'new_story', itemIds?: string[]) => {
    retryMutation.mutate({ projectId, taskType, itemIds });
  };

  return (
    <div className="space-y-6">
      {/* 现有内容 */}

      {/* 进度展示 */}
      {progressData?.progress && (
        <FissionProgressBar progress={progressData.progress} />
      )}

      {/* 失败项列表 */}
      {progressData?.progress && (
        <>
          <FailedItemsList
            items={progressData.progress.items.filter(
              item => /* 图生视频项 */
              item.taskType === 'image_video'
            )}
            taskType="image_video"
            onRetry={(itemIds) => handleRetry('image_video', itemIds)}
          />
          <FailedItemsList
            items={progressData.progress.items.filter(
              item => /* 新故事项 */
              item.taskType === 'new_story'
            )}
            taskType="new_story"
            onRetry={(itemIds) => handleRetry('new_story', itemIds)}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **步骤 3：验证编译通过**

运行：`npm run build:ui`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx
git commit -m "$(cat <<'EOF'
feat(fission): 前端添加进度展示和重试 UI

- FissionProgressBar: 显示总进度和分类进度
- FailedItemsList: 显示失败项列表并支持重试
- 集成状态轮询，自动刷新进度
EOF
)"
```

---

## 任务 9：集成测试

**文件：**
- 无需新建文件

- [ ] **步骤 1：启动项目**

```bash
# 清理数据库残留查询
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
pool.query('SELECT pg_terminate_backend(pid), pid, query FROM pg_stat_activity WHERE datname = current_database() AND pid != pg_backend_pid() AND state != \\'idle\\'')
  .then(r => { console.log('Killed:', r.rows.length); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"

# 启动后端
PERSISTENCE_REQUIRE_READY=false npm run dev &

# 启动前端
npm --prefix apps/web run dev &
```

- [ ] **步骤 2：测试正常流程**

1. 打开浏览器访问 http://localhost:3000
2. 进入项目的步骤6裂变页面
3. 点击"一键裂变"按钮
4. 观察进度条正常更新
5. 确认图生视频和新故事并行执行
6. 确认所有分镜完成后状态正确

- [ ] **步骤 3：测试中断恢复**

1. 启动裂变任务
2. 中途关闭浏览器或刷新页面
3. 重新进入页面
4. 确认进度正确显示
5. 确认任务继续执行，未完成的分镜继续生成

- [ ] **步骤 4：测试重试功能**

1. 模拟部分分镜失败（可通过暂时断网等方式）
2. 确认失败项列表正确显示
3. 点击"重试"按钮
4. 确认失败项重新执行并最终成功

- [ ] **步骤 5：清理并提交**

```bash
# 如果测试通过，提交所有更改
git add -A
git commit -m "test: 验证裂变流程优化功能正常"
```

---

## 十、改动清单总结

| 类型 | 文件 | 变更内容 |
|------|------|---------|
| 数据库 | 直接执行 SQL | 新增 nrm_fission_task_items 表，扩展 nrm_fission_video_status 表 |
| 新建 | `src/persistence/fission-task-items-repository.ts` | 分镜任务项数据访问层 |
| 新建 | `src/modules/fission-video/fission-task-items-service.ts` | 分镜任务项业务逻辑服务 |
| 修改 | `src/service/services-sub.ts` | 导出新服务，更新类型定义 |
| 修改 | `src/modules/fission-video/fission-video-config.ts` | 添加新状态枚举 |
| 修改 | `src/routes/fission-video-routes.ts` | 添加并行执行、进度查询、重试 API |
| 修改 | `apps/web/pages/fission/useFissionVideo.ts` | 添加并行执行和状态轮询 Hook |
| 修改 | `apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx` | 添加进度展示和重试 UI |
