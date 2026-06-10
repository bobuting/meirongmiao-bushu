# 统一脚本库实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 统一脚本库，使用 `nrm_script_data` 作为唯一脚本存储表，移除冗余的脚本相关表和服务。

**架构：** 扩展 `nrm_script_data` 表增加 user_id、project_id、source_script_id、previous_script_id、tags、content 字段；项目表新增 active_script_id 字段；移除 nrm_library_scripts、nrm_library_script_versions、nrm_user_script_assoc、nrm_project_script_assoc 四表。

**技术栈：** Node.js + TypeScript + PostgreSQL + Fastify 5

---

## 文件结构

### 将要修改的文件

| 文件 | 职责 | 改动类型 |
|------|------|----------|
| `src/contracts/types.ts` | 类型定义 | 扩展 ScriptData、Project 类型 |
| `src/repositories/pg/script-data-pg-repository.ts` | 脚本数据仓库 | 扩展字段映射和新增方法 |
| `src/repositories/pg/project-pg-repository.ts` | 项目仓库 | 新增 active_script_id 字段映射 |
| `src/repositories/pg/index.ts` | 仓库集合 | 移除旧仓库导出 |
| `src/core/app-context.ts` | 应用上下文 | 更新服务引用 |
| `src/routes/library-routes.ts` | 库路由 | 移除旧脚本库路由 |
| `src/contracts/services.ts` | 服务接口 | 更新 IScriptLibraryService |

### 将要创建的文件

| 文件 | 职责 |
|------|------|
| `src/services/script/unified-script-service.ts` | 统一脚本服务 |
| `src/routes/script-routes.ts` | 统一脚本路由 |
| `scripts/migrate-script-library.ts` | 数据迁移脚本 |

### 将要删除的文件

| 文件 | 原因 |
|------|------|
| `src/repositories/pg/user-script-assoc-pg-repository.ts` | 移除用户脚本关联表 |
| `src/modules/script-library-service.ts` | 移除旧的内存脚本库服务 |
| `src/service/library-scripts-db-service.ts` | 移除旧的库脚本数据库服务（如存在） |

---

## 任务 1：类型定义扩展

**文件：**
- 修改：`src/contracts/types.ts`

- [ ] **步骤 1：扩展 ScriptData 接口**

在 `src/contracts/types.ts` 中找到 `ScriptData` 相关定义（或新建），添加新字段：

```typescript
// 在 ScriptData 接口附近（约 line 附近）添加/修改
export interface ScriptData {
  id: string;
  type: ScriptTypeValue;           // 脚本类型（0-5）
  payloadHash: string;
  title: string;
  theme: string | null;
  summary: string | null;
  videoType: number | null;
  videoStyle: string | null;
  targetAudience: string | null;
  fashionSuitable: boolean | null;
  fashionReason: string | null;
  emotionDetail: string | null;
  onScreenPresence: string | null;
  fashionStyles: string[] | null;
  editingAnalysis: unknown | null;
  // === 新增字段 ===
  userId: string;                   // 脚本归属用户，NOT NULL
  projectId: string | null;         // 脚本归属项目，可为 NULL
  sourceScriptId: string | null;    // 重写链源脚本ID
  previousScriptId: string | null;  // 直接前驱脚本ID
  tags: string[];                   // 用户自定义标签
  content: string;                  // 脚本正文内容
  updatedAt: number;
  createdAt: number;
}
```

- [ ] **步骤 2：扩展 Project 接口**

在 `src/contracts/types.ts` 中找到 `Project` 接口（约 line 145），添加 `activeScriptId` 字段：

```typescript
export interface Project extends SoftDeletable {
  id: string;
  userId: string;
  name: string;
  status: ProjectStatus;
  selectedOutfitPlanId: string | null;
  selectedCharacterPreviewId: string | null;
  // === 新增字段 ===
  activeScriptId: string | null;    // 当前选中的脚本ID
  createdAt: number;
  updatedAt: number;
  thumbnailUrl: string;
  formatLabel: string;
  durationSec: number;
  views: number;
  lastVisitedStep: number;
  lastReverseTaskId: string | null;
  lastReverseScriptVersionId: string | null;
  projectKind: "image" | "video";
  exportUrl: string | null;
}
```

- [ ] **步骤 3：Commit 类型定义变更**

```bash
git add src/contracts/types.ts
git commit -m "feat(types): 扩展 ScriptData 和 Project 类型定义"
```

---

## 任务 2：Repository 层扩展

**文件：**
- 修改：`src/repositories/pg/script-data-pg-repository.ts`
- 修改：`src/repositories/pg/project-pg-repository.ts`

- [ ] **步骤 1：扩展 ScriptDataRepository 字段映射**

修改 `src/repositories/pg/script-data-pg-repository.ts`：

```typescript
// 更新 ScriptData 接口（如果未在 types.ts 中定义）
export interface ScriptData {
  id: string;
  type: number;
  payloadHash: string;
  title: string;
  theme: string | null;
  summary: string | null;
  videoType: number | null;
  videoStyle: string | null;
  targetAudience: string | null;
  fashionSuitable: boolean | null;
  fashionReason: string | null;
  emotionDetail: string | null;
  onScreenPresence: string | null;
  fashionStyles: string[] | null;
  editingAnalysis: unknown | null;
  // 新增字段
  userId: string;
  projectId: string | null;
  sourceScriptId: string | null;
  previousScriptId: string | null;
  tags: string[];
  content: string;
  updatedAt: number;
  createdAt: number;
}

// 更新 mapRow 方法
protected mapRow(row: Record<string, unknown>): ScriptData {
  return {
    id: row.id as string,
    type: row.type as number,
    title: row.title as string,
    theme: row.theme as string | null,
    summary: row.summary as string | null,
    videoType: row.video_type as number | null,
    videoStyle: row.video_style as string | null,
    targetAudience: row.target_audience as string | null,
    fashionSuitable: row.fashion_suitable as boolean | null,
    fashionReason: row.fashion_reason as string | null,
    emotionDetail: row.emotion_detail as string | null,
    onScreenPresence: row.on_screen_presence as string | null,
    fashionStyles: row.fashion_styles as string[] | null,
    editingAnalysis: row.editing_analysis as unknown | null,
    // 新增字段映射
    userId: (row.user_id as string) ?? "",
    projectId: row.project_id as string | null,
    sourceScriptId: row.source_script_id as string | null,
    previousScriptId: row.previous_script_id as string | null,
    tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
    content: (row.content as string) ?? "",
    updatedAt: Number(row.updated_at),
    createdAt: Number(row.created_at),
  };
}

// 更新 mapEntity 方法
protected mapEntity(entity: ScriptData): Record<string, unknown> {
  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    theme: entity.theme,
    summary: entity.summary,
    video_type: entity.videoType,
    video_style: entity.videoStyle,
    target_audience: entity.targetAudience,
    fashion_suitable: entity.fashionSuitable,
    fashion_reason: entity.fashionReason,
    emotion_detail: entity.emotionDetail,
    on_screen_presence: entity.onScreenPresence,
    fashion_styles: entity.fashionStyles,
    editing_analysis: entity.editingAnalysis,
    // 新增字段
    user_id: entity.userId,
    project_id: entity.projectId,
    source_script_id: entity.sourceScriptId,
    previous_script_id: entity.previousScriptId,
    tags: PgBaseRepository.toJsonb(entity.tags),
    content: entity.content,
    updated_at: entity.updatedAt,
    created_at: entity.createdAt,
  };
}
```

- [ ] **步骤 2：新增查询方法**

在 `PgScriptDataRepository` 类中添加新方法：

```typescript
/** 按项目ID查询脚本列表 */
async findByProjectId(projectId: string): Promise<ScriptData[]> {
  return this.findWhere({ project_id: projectId });
}

/** 按用户ID查询脚本列表 */
async findByUserId(userId: string): Promise<ScriptData[]> {
  return this.findWhere({ user_id: userId });
}

/** 按源脚本ID查询衍生脚本 */
async findBySourceScriptId(sourceScriptId: string): Promise<ScriptData[]> {
  return this.findWhere({ source_script_id: sourceScriptId });
}

/** 创建脚本（带事务支持） */
async create(params: {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: number;
  projectId?: string;
  sourceScriptId?: string;
  previousScriptId?: string;
  tags?: string[];
}): Promise<ScriptData> {
  const now = Date.now();
  const entity: ScriptData = {
    id: params.id,
    type: params.type,
    payloadHash: "",
    title: params.title,
    theme: null,
    summary: null,
    videoType: null,
    videoStyle: null,
    targetAudience: null,
    fashionSuitable: null,
    fashionReason: null,
    emotionDetail: null,
    onScreenPresence: null,
    fashionStyles: null,
    editingAnalysis: null,
    userId: params.userId,
    projectId: params.projectId ?? null,
    sourceScriptId: params.sourceScriptId ?? null,
    previousScriptId: params.previousScriptId ?? null,
    tags: params.tags ?? [],
    content: params.content,
    updatedAt: now,
    createdAt: now,
  };
  await this.upsert(entity);
  return entity;
}
```

- [ ] **步骤 3：扩展 ProjectRepository**

修改 `src/repositories/pg/project-pg-repository.ts`，更新 `mapRow` 和 `mapEntity`：

```typescript
// 更新 mapRow 方法
protected mapRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    status: row.status as Project["status"],
    selectedOutfitPlanId: row.selected_outfit_plan_id as string | null,
    selectedCharacterPreviewId: row.selected_character_preview_id as string | null,
    activeScriptId: row.active_script_id as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    thumbnailUrl: row.thumbnail_url as string,
    formatLabel: row.format_label as string,
    durationSec: row.duration_sec as number,
    views: row.views as number,
    lastVisitedStep: row.last_visited_step as number,
    lastReverseTaskId: row.last_reverse_task_id as string | null,
    lastReverseScriptVersionId: row.last_reverse_script_version_id as string | null,
    projectKind: (row.project_kind as "image" | "video") || "video",
    exportUrl: row.export_url as string | null,
    deletedAt: row.deleted_at as number | null | undefined,
    deletedBy: row.deleted_by as string | null | undefined,
  };
}

// 更新 mapEntity 方法
protected mapEntity(p: Project): Record<string, unknown> {
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    status: p.status,
    selected_outfit_plan_id: p.selectedOutfitPlanId,
    selected_character_preview_id: p.selectedCharacterPreviewId,
    active_script_id: p.activeScriptId,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    thumbnail_url: p.thumbnailUrl,
    format_label: p.formatLabel,
    duration_sec: p.durationSec,
    views: p.views,
    last_visited_step: p.lastVisitedStep,
    last_reverse_task_id: p.lastReverseTaskId,
    last_reverse_script_version_id: p.lastReverseScriptVersionId,
    project_kind: p.projectKind,
    export_url: p.exportUrl,
    deleted_at: p.deletedAt ?? null,
    deleted_by: p.deletedBy ?? null,
  };
}

// 在类中新增方法
async updateActiveScriptId(projectId: string, scriptId: string | null): Promise<void> {
  await this.queryClient.query(
    `UPDATE ${this.tableName} SET active_script_id = $1, updated_at = $2 WHERE id = $3`,
    [scriptId, Date.now(), projectId],
  );
}
```

- [ ] **步骤 4：Commit Repository 变更**

```bash
git add src/repositories/pg/script-data-pg-repository.ts src/repositories/pg/project-pg-repository.ts
git commit -m "feat(repos): 扩展 ScriptData 和 Project 仓库字段映射"
```

---

## 任务 3：统一脚本服务

**文件：**
- 创建：`src/services/script/unified-script-service.ts`
- 修改：`src/contracts/services.ts`

- [ ] **步骤 1：定义服务接口**

在 `src/contracts/services.ts` 中更新 `IScriptLibraryService` 接口：

```typescript
// 替换现有的 IScriptLibraryService（约 line 362）
export interface IScriptLibraryService {
  /** 创建脚本 */
  create(
    userId: string,
    params: {
      projectId?: string;
      title: string;
      content: string;
      type: ScriptTypeValue;
      tags?: string[];
      sourceScriptId?: string;
      previousScriptId?: string;
    },
  ): Promise<ScriptData>;
  
  /** 按ID查询脚本 */
  findById(scriptId: string): Promise<ScriptData | null>;
  
  /** 按项目ID查询脚本列表 */
  listByProjectId(projectId: string): Promise<ScriptData[]>;
  
  /** 按用户ID查询脚本列表 */
  listByUserId(userId: string): Promise<ScriptData[]>;
  
  /** 删除脚本（检查是否为项目选中脚本） */
  remove(userId: string, scriptId: string): Promise<void>;
  
  /** 批量删除脚本 */
  batchRemove(userId: string, scriptIds: string[]): Promise<{ deleted: number }>;
}
```

- [ ] **步骤 2：创建服务目录结构**

```bash
mkdir -p src/services/script
```

- [ ] **步骤 3：实现统一脚本服务**

创建 `src/services/script/unified-script-service.ts`：

```typescript
/**
 * 统一脚本服务
 * 基于 nrm_script_data 表实现脚本管理
 */

import type { ScriptData, ScriptTypeValue } from "../../contracts/types.js";
import type { IScriptLibraryService } from "../../contracts/services.js";
import type { RepositoryCollection } from "../../repositories/index.js";
import { AppError } from "../../core/errors.js";

export class UnifiedScriptService implements IScriptLibraryService {
  constructor(
    private readonly repos: RepositoryCollection,
  ) {}

  async create(
    userId: string,
    params: {
      projectId?: string;
      title: string;
      content: string;
      type: ScriptTypeValue;
      tags?: string[];
      sourceScriptId?: string;
      previousScriptId?: string;
    },
  ): Promise<ScriptData> {
    const id = this.repos.clock.generateId();
    
    const script = await this.repos.scriptData.create({
      id,
      userId,
      title: params.title.trim(),
      content: params.content.trim(),
      type: params.type,
      projectId: params.projectId,
      sourceScriptId: params.sourceScriptId,
      previousScriptId: params.previousScriptId,
      tags: params.tags ?? [],
    });
    
    return script;
  }

  async findById(scriptId: string): Promise<ScriptData | null> {
    return this.repos.scriptData.findById(scriptId);
  }

  async listByProjectId(projectId: string): Promise<ScriptData[]> {
    return this.repos.scriptData.findByProjectId(projectId);
  }

  async listByUserId(userId: string): Promise<ScriptData[]> {
    return this.repos.scriptData.findByUserId(userId);
  }

  async remove(userId: string, scriptId: string): Promise<void> {
    const script = await this.repos.scriptData.findById(scriptId);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }
    if (script.userId !== userId) {
      throw new AppError(403, "FORBIDDEN", "无权删除此脚本");
    }
    
    // 检查是否为项目选中脚本
    if (script.projectId) {
      const project = await this.repos.projects.findById(script.projectId);
      if (project && project.activeScriptId === scriptId) {
        throw new AppError(400, "SCRIPT_IS_ACTIVE", "无法删除当前选中的脚本，请先切换其他脚本");
      }
    }
    
    await this.repos.scriptData.delete(scriptId);
  }

  async batchRemove(userId: string, scriptIds: string[]): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const scriptId of scriptIds) {
      try {
        await this.remove(userId, scriptId);
        deleted += 1;
      } catch {
        // 忽略失败项，继续删除其他
      }
    }
    return { deleted };
  }
}
```

- [ ] **步骤 4：创建索引文件**

创建 `src/services/script/index.ts`：

```typescript
export { UnifiedScriptService } from "./unified-script-service.js";
```

- [ ] **步骤 5：Commit 服务变更**

```bash
git add src/services/script/ src/contracts/services.ts
git commit -m "feat(service): 创建统一脚本服务 UnifiedScriptService"
```

---

## 任务 4：更新应用上下文

**文件：**
- 修改：`src/core/app-context.ts`

- [ ] **步骤 1：更新 AppContext 接口**

在 `src/core/app-context.ts` 中更新服务引用：

```typescript
// 在 import 部分添加
import { UnifiedScriptService } from "../services/script/index.js";

// 在 AppContext 接口中替换 scriptLibraryService 类型
export interface AppContext {
  // ... 其他字段 ...
  scriptLibraryService: IScriptLibraryService;  // 类型不变，实现替换
  // ... 其他字段 ...
}
```

- [ ] **步骤 2：更新服务初始化**

找到服务初始化位置，替换为 `UnifiedScriptService`：

```typescript
// 在初始化服务的地方（通常在 buildApp 或类似函数中）
scriptLibraryService: new UnifiedScriptService(repos),
```

- [ ] **步骤 3：Commit 上下文变更**

```bash
git add src/core/app-context.ts
git commit -m "feat(context): 使用 UnifiedScriptService 替换旧服务"
```

---

## 任务 5：统一脚本路由

**文件：**
- 创建：`src/routes/script-routes.ts`

- [ ] **步骤 1：创建脚本路由文件**

创建 `src/routes/script-routes.ts`：

```typescript
/**
 * 统一脚本路由
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";
import { requireUser } from "../services/auth/route-guards.js";
import { AppError } from "../core/errors.js";

export function registerScriptRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // GET /scripts - 查询脚本列表
  app.get("/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const query = (request.query as Record<string, unknown>) ?? {};
    
    const projectId = query.projectId as string | undefined;
    const userId = query.userId as string | undefined;
    
    if (projectId) {
      return { scripts: await ctx.scriptLibraryService.listByProjectId(projectId) };
    }
    
    const targetUserId = userId ?? user.id;
    return { scripts: await ctx.scriptLibraryService.listByUserId(targetUserId) };
  });

  // POST /scripts - 创建脚本
  app.post("/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      projectId?: string;
      title: string;
      content: string;
      type: number;
      tags?: string[];
      sourceScriptId?: string;
      previousScriptId?: string;
    };
    
    const script = await ctx.scriptLibraryService.create(user.id, {
      projectId: body.projectId,
      title: body.title,
      content: body.content,
      type: body.type,
      tags: body.tags,
      sourceScriptId: body.sourceScriptId,
      previousScriptId: body.previousScriptId,
    });
    
    return script;
  });

  // GET /scripts/:scriptId - 获取脚本详情
  app.get("/scripts/:scriptId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { scriptId: string };
    
    const script = await ctx.scriptLibraryService.findById(params.scriptId);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }
    
    return script;
  });

  // DELETE /scripts/:scriptId - 删除脚本
  app.delete("/scripts/:scriptId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { scriptId: string };
    
    await ctx.scriptLibraryService.remove(user.id, params.scriptId);
    
    return { ok: true, message: "脚本已删除" };
  });

  // POST /scripts/batch-delete - 批量删除脚本
  app.post("/scripts/batch-delete", async (request) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as { scriptIds?: string[] }) ?? {};
    
    const scriptIds = [...new Set((body.scriptIds ?? []).filter(Boolean))];
    const result = await ctx.scriptLibraryService.batchRemove(user.id, scriptIds);
    
    return { ok: true, deleted: result.deleted };
  });

  // GET /projects/:projectId/scripts - 查询项目所有脚本
  app.get("/projects/:projectId/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    
    // 验证项目所有权
    const project = await ctx.repos.projects.findById(params.projectId);
    if (!project || project.userId !== user.id) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }
    
    const scripts = await ctx.scriptLibraryService.listByProjectId(params.projectId);
    return { scripts, activeScriptId: project.activeScriptId };
  });

  // PUT /projects/:projectId/active-script - 设置项目选中脚本
  app.put("/projects/:projectId/active-script", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { scriptId: string | null };
    
    // 验证项目所有权
    const project = await ctx.repos.projects.findById(params.projectId);
    if (!project || project.userId !== user.id) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }
    
    // 如果设置新脚本，验证脚本存在且属于该项目
    if (body.scriptId) {
      const script = await ctx.scriptLibraryService.findById(body.scriptId);
      if (!script || script.projectId !== params.projectId) {
        throw new AppError(400, "INVALID_SCRIPT", "脚本不属于该项目");
      }
    }
    
    await ctx.repos.projects.updateActiveScriptId(params.projectId, body.scriptId);
    
    return { ok: true, activeScriptId: body.scriptId };
  });
}
```

- [ ] **步骤 2：注册路由**

在路由注册入口（通常是 `src/app-setup/setup-routes.ts` 或 `src/app.ts`）添加：

```typescript
import { registerScriptRoutes } from "../routes/script-routes.js";

// 在路由注册部分
registerScriptRoutes(app, ctx);
```

- [ ] **步骤 3：Commit 路由变更**

```bash
git add src/routes/script-routes.ts
git commit -m "feat(routes): 创建统一脚本路由"
```

---

## 任务 6：移除旧代码

**文件：**
- 修改：`src/repositories/pg/index.ts`
- 修改：`src/routes/library-routes.ts`
- 删除：`src/repositories/pg/user-script-assoc-pg-repository.ts`
- 删除：`src/modules/script-library-service.ts`

- [ ] **步骤 1：从仓库集合中移除旧仓库**

修改 `src/repositories/pg/index.ts`：

```typescript
// 移除以下 import
import { PgUserScriptAssocRepository } from "./user-script-assoc-pg-repository.js";

// 从 PgRepositoryCollection 接口中移除
// userScriptAssocs: PgUserScriptAssocRepository;

// 从 createPgRepositories 函数中移除
// userScriptAssocs: new PgUserScriptAssocRepository(pool),

// 从 createPgRepositoriesFromClient 函数中移除
// userScriptAssocs: new PgUserScriptAssocRepository(pool, client),
```

- [ ] **步骤 2：移除旧脚本库路由**

修改 `src/routes/library-routes.ts`，移除以下路由：
- `/library/scripts` GET
- `/library/scripts` POST
- `/library/scripts/:scriptId` PATCH
- `/library/scripts/:scriptId` DELETE
- `/library/scripts/batch-delete` POST
- `/library/scripts/:scriptId/versions` GET
- `/library/scripts/:scriptId/rollback` POST
- `/my-library/scripts` GET

- [ ] **步骤 3：删除旧文件**

```bash
rm src/repositories/pg/user-script-assoc-pg-repository.ts
rm src/modules/script-library-service.ts
```

- [ ] **步骤 4：Commit 清理变更**

```bash
git add -A
git commit -m "refactor: 移除旧脚本库相关代码"
```

---

## 任务 7：数据迁移脚本

**文件：**
- 创建：`scripts/migrate-script-library.ts`

- [ ] **步骤 1：创建迁移脚本**

创建 `scripts/migrate-script-library.ts`：

```typescript
/**
 * 脚本库统一迁移脚本
 * 
 * 使用方式：
 *   npx tsx scripts/migrate-script-library.ts
 * 
 * 环境变量：
 *   DATABASE_URL - PostgreSQL 连接字符串
 */

import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("开始迁移...");
    
    // 步骤1: 扩展 nrm_script_data 表
    console.log("步骤1: 扩展 nrm_script_data 表结构...");
    await client.query(`
      ALTER TABLE nrm_script_data 
        ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS project_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS source_script_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS previous_script_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
    `);
    console.log("  ✓ nrm_script_data 表扩展完成");
    
    // 步骤2: 项目表加字段
    console.log("步骤2: 项目表新增 active_script_id 字段...");
    await client.query(`
      ALTER TABLE nrm_project 
        ADD COLUMN IF NOT EXISTS active_script_id VARCHAR(64);
    `);
    console.log("  ✓ 项目表扩展完成");
    
    // 步骤3: 迁移 nrm_library_scripts
    console.log("步骤3: 迁移 nrm_library_scripts 数据...");
    const libraryResult = await client.query(`
      INSERT INTO nrm_script_data (id, user_id, title, content, type, tags, created_at, updated_at)
      SELECT id, user_id, title, COALESCE(content, ''), COALESCE(type, 0), tags, created_at, updated_at
      FROM nrm_library_scripts
      WHERE deleted_at IS NULL
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        tags = EXCLUDED.tags
    `);
    console.log(`  ✓ 迁移了 ${libraryResult.rowCount} 条记录`);
    
    // 步骤4: 迁移 nrm_user_script_assoc
    console.log("步骤4: 迁移 nrm_user_script_assoc 数据...");
    const assocResult = await client.query(`
      INSERT INTO nrm_script_data (id, user_id, title, tags, type, created_at, updated_at)
      SELECT 
        usa.script_data_id,
        usa.user_id,
        usa.title,
        usa.tags,
        0,
        usa.created_at,
        usa.updated_at
      FROM nrm_user_script_assoc usa
      WHERE NOT EXISTS (
        SELECT 1 FROM nrm_script_data sd WHERE sd.id = usa.script_data_id AND sd.user_id != ''
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        tags = EXCLUDED.tags
    `);
    console.log(`  ✓ 迁移了 ${assocResult.rowCount} 条记录`);
    
    // 步骤5: 迁移项目关联
    console.log("步骤5: 迁移项目关联...");
    const projectResult = await client.query(`
      UPDATE nrm_project p
      SET active_script_id = sub.script_data_id
      FROM (
        SELECT project_id, script_data_id,
               ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY version DESC) as rn
        FROM nrm_project_script_assoc
        WHERE is_active = true
      ) sub
      WHERE p.id = sub.project_id AND sub.rn = 1
    `);
    console.log(`  ✓ 更新了 ${projectResult.rowCount} 个项目的 active_script_id`);
    
    console.log("\n迁移完成！");
    
    // 验证
    console.log("\n验证迁移结果...");
    const verifyResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM nrm_script_data WHERE user_id != '') as scripts_with_user,
        (SELECT COUNT(*) FROM nrm_library_scripts WHERE deleted_at IS NULL) as library_scripts,
        (SELECT COUNT(*) FROM nrm_project WHERE active_script_id IS NOT NULL) as projects_with_script
    `);
    console.log("  验证结果:", verifyResult.rows[0]);
    
  } finally {
    client.release();
  }
}

migrate()
  .then(() => {
    console.log("\n迁移脚本执行完毕");
    process.exit(0);
  })
  .catch((error) => {
    console.error("迁移失败:", error);
    process.exit(1);
  });
```

- [ ] **步骤 2：Commit 迁移脚本**

```bash
git add scripts/migrate-script-library.ts
git commit -m "feat(scripts): 添加脚本库统一迁移脚本"
```

---

## 任务 8：编译验证

- [ ] **步骤 1：编译项目**

```bash
npm run build
```

预期：编译成功，无 TypeScript 错误

- [ ] **步骤 2：检查依赖引用**

```bash
# 检查是否有文件引用了已删除的模块
grep -r "user-script-assoc-pg-repository" src/
grep -r "script-library-service" src/
```

预期：无匹配结果

- [ ] **步骤 3：Commit 最终验证**

```bash
git add -A
git commit -m "chore: 编译验证通过"
```

---

## 后续任务（可选）

### 任务 9：运行迁移脚本

- [ ] **步骤 1：备份数据库**

```bash
pg_dump $DATABASE_URL > backup_before_script_migration.sql
```

- [ ] **步骤 2：运行迁移**

```bash
DATABASE_URL=your_connection_string npx tsx scripts/migrate-script-library.ts
```

- [ ] **步骤 3：验证数据完整性**

执行规格文档中的验证 SQL。

### 任务 10：删除旧表（迁移成功后）

- [ ] **步骤 1：执行 DROP TABLE**

```sql
DROP TABLE IF EXISTS nrm_library_scripts;
DROP TABLE IF EXISTS nrm_library_script_versions;
DROP TABLE IF EXISTS nrm_user_script_assoc;
DROP TABLE IF EXISTS nrm_project_script_assoc;
```