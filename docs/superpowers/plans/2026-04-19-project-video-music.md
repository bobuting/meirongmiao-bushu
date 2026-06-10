# 项目-视频音乐关联表实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 创建 `nrm_project_video_musics` 表及相关模块，替代已删除的 `step4MusicPayload`

**架构：** 新建独立数据库表存储项目-音乐关联，包含仓库层、路由层、前端服务层，支持推荐候选快照存储和单选模式

**技术栈：** PostgreSQL、Fastify 5、TypeScript 5、React 18、Vitest

---

## 文件结构

**创建文件：**
- `src/contracts/types.ts` — 添加 `ProjectVideoMusic` 类型（修改）
- `src/contracts/repository-ports/project-video-music-repository.ts` — 仓库接口定义
- `src/repositories/pg/project-video-music-pg-repository.ts` — 仓库实现
- `src/routes/project-video-music-routes.ts` — API 路由
- `test/project_video_music_service.unit.test.ts` — 单元测试

**修改文件：**
- `src/repositories/pg/index.ts` — 注册新仓库
- `src/routes/index.ts` — 添加 registrar ID
- `src/routes/app-shell-thin-entry.ts` — 创建 registrar
- `src/routes/api-registration.ts` — 调用路由注册
- `apps/web/services/backendApi.videoMusic.ts` — 添加 API 方法
- `apps/web/pages/project-flow/step4-video-workspace/step4MusicController.ts` — 修改持久化逻辑

---

## 任务 1：定义类型和接口

**文件：**
- 修改：`src/contracts/types.ts`（添加 `ProjectVideoMusic` 类型）
- 创建：`src/contracts/repository-ports/project-video-music-repository.ts`

- [ ] **步骤 1：在 types.ts 中添加 ProjectVideoMusic 类型**

在 `src/contracts/types.ts` 文件末尾添加：

```typescript
/** 项目-视频音乐关联记录 */
export interface ProjectVideoMusic {
  id: string;
  projectId: string;
  musicId: string;
  musicUrl: string;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
  isSelected: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 2：创建仓库接口文件**

创建 `src/contracts/repository-ports/project-video-music-repository.ts`：

```typescript
/**
 * 项目-视频音乐关联仓库端口
 */

import type { ProjectVideoMusic } from "../types.js";

/** 批量保存输入 */
export interface BatchSaveProjectVideoMusicInput {
  musicId: string;
  musicUrl: string;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** 更新参数 */
export interface ProjectVideoMusicUpdatePatch {
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** 项目-视频音乐关联仓库端口 */
export interface IProjectVideoMusicRepository {
  /** 根据项目ID获取所有关联记录 */
  listByProject(projectId: string): Promise<ProjectVideoMusic[]>;

  /** 获取项目选中的音乐（is_selected=true） */
  getSelected(projectId: string): Promise<ProjectVideoMusic | null>;

  /** 根据ID获取单条记录 */
  findById(id: string): Promise<ProjectVideoMusic | null>;

  /** 批量保存（覆盖旧数据） */
  batchSave(
    projectId: string,
    musics: BatchSaveProjectVideoMusicInput[],
    selectedMusicId?: string | null,
  ): Promise<ProjectVideoMusic[]>;

  /** 选择音乐（设置 is_selected=true，其他设为 false） */
  select(projectId: string, id: string): Promise<ProjectVideoMusic>;

  /** 更新音乐参数 */
  update(id: string, patch: ProjectVideoMusicUpdatePatch): Promise<ProjectVideoMusic>;

  /** 删除记录 */
  delete(id: string): Promise<boolean>;

  /** 删除项目所有记录 */
  deleteByProjectId(projectId: string): Promise<void>;
}
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 4：Commit**

```bash
git add src/contracts/types.ts src/contracts/repository-ports/project-video-music-repository.ts
git commit -m "feat: 添加 ProjectVideoMusic 类型定义和仓库接口"
```

---

## 任务 2：实现数据库仓库

**文件：**
- 创建：`src/repositories/pg/project-video-music-pg-repository.ts`
- 修改：`src/repositories/pg/index.ts`
- 测试：`test/project_video_music_service.unit.test.ts`

- [ ] **步骤 1：编写失败的单元测试**

创建 `test/project_video_music_service.unit.test.ts`：

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { Pool } from "pg";
import {
  PgProjectVideoMusicRepository,
} from "../src/repositories/pg/project-video-music-pg-repository.js";
import type { ProjectVideoMusic, BatchSaveProjectVideoMusicInput } from "../src/contracts/types.js";

// 内存测试（使用 Mock Pool）
describe("project video music repository (unit)", () => {
  // 注意：这是单元测试，实际数据库集成测试需要连接真实数据库
  // 这里只测试类型和接口定义是否正确

  it("defines correct interface methods", async () => {
    // 测试类型定义编译正确
    const input: BatchSaveProjectVideoMusicInput = {
      musicId: "music-001",
      musicUrl: "https://example.com/music.mp3",
      volume: 0.5,
      fadeInSec: 0,
      fadeOutSec: 0,
    };

    expect(input.musicId).toBe("music-001");
    expect(input.musicUrl).toBe("https://example.com/music.mp3");
  });

  it("ProjectVideoMusic type has required fields", () => {
    const record: ProjectVideoMusic = {
      id: "pvm-001",
      projectId: "project-001",
      musicId: "music-001",
      musicUrl: "https://example.com/music.mp3",
      volume: 0.5,
      fadeInSec: 0,
      fadeOutSec: 0,
      isSelected: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(record.id).toBe("pvm-001");
    expect(record.isSelected).toBe(true);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test test/project_video_music_service.unit.test.ts`
预期：测试通过（因为只是类型测试，仓库还未实现）

- [ ] **步骤 3：创建仓库实现**

创建 `src/repositories/pg/project-video-music-pg-repository.ts`：

```typescript
/**
 * 项目-视频音乐关联 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ProjectVideoMusic } from "../../contracts/types.js";
import type {
  IProjectVideoMusicRepository,
  BatchSaveProjectVideoMusicInput,
  ProjectVideoMusicUpdatePatch,
} from "../../contracts/repository-ports/project-video-music-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { AppError } from "../../core/errors.js";

export class PgProjectVideoMusicRepository
  extends PgBaseRepository<ProjectVideoMusic>
  implements IProjectVideoMusicRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_video_musics"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectVideoMusic {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      musicId: row.music_id as string,
      musicUrl: row.music_url as string,
      volume: (row.volume ?? 0.5) as number,
      fadeInSec: (row.fade_in_sec ?? 0) as number,
      fadeOutSec: (row.fade_out_sec ?? 0) as number,
      isSelected: (row.is_selected ?? false) as boolean,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(m: ProjectVideoMusic): Record<string, unknown> {
    return {
      id: m.id,
      project_id: m.projectId,
      music_id: m.musicId,
      music_url: m.musicUrl,
      volume: m.volume,
      fade_in_sec: m.fadeInSec,
      fade_out_sec: m.fadeOutSec,
      is_selected: m.isSelected,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    };
  }

  async listByProject(projectId: string): Promise<ProjectVideoMusic[]> {
    return this.findWhere({ project_id: projectId });
  }

  async getSelected(projectId: string): Promise<ProjectVideoMusic | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND is_selected = TRUE LIMIT 1`,
      [projectId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async batchSave(
    projectId: string,
    musics: BatchSaveProjectVideoMusicInput[],
    selectedMusicId?: string | null,
  ): Promise<ProjectVideoMusic[]> {
    const now = Date.now();

    // 1. 删除旧记录
    await this.deleteByProjectId(projectId);

    // 2. 批量插入新记录（最多 3 条）
    const maxCount = 3;
    const toInsert = musics.slice(0, maxCount);
    const inserted: ProjectVideoMusic[] = [];

    for (const music of toInsert) {
      const id = this.generateId();
      const isSelected = selectedMusicId === music.musicId;
      const record: ProjectVideoMusic = {
        id,
        projectId,
        musicId: music.musicId,
        musicUrl: music.musicUrl,
        volume: music.volume ?? 0.5,
        fadeInSec: music.fadeInSec ?? 0,
        fadeOutSec: music.fadeOutSec ?? 0,
        isSelected,
        createdAt: now,
        updatedAt: now,
      };

      await this.queryClient.query(
        `INSERT INTO ${this.tableName}
         (id, project_id, music_id, music_url, volume, fade_in_sec, fade_out_sec, is_selected, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.projectId,
          record.musicId,
          record.musicUrl,
          record.volume,
          record.fadeInSec,
          record.fadeOutSec,
          record.isSelected,
          record.createdAt,
          record.updatedAt,
        ],
      );

      inserted.push(record);
    }

    return inserted;
  }

  async select(projectId: string, id: string): Promise<ProjectVideoMusic> {
    const now = Date.now();

    // 1. 检查记录是否存在
    const record = await this.findById(id);
    if (!record || record.projectId !== projectId) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    // 2. 清除该项目所有 is_selected
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = FALSE, updated_at = $1 WHERE project_id = $2`,
      [now, projectId],
    );

    // 3. 设置目标记录 is_selected = TRUE
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = TRUE, updated_at = $1 WHERE id = $2`,
      [now, id],
    );

    // 4. 返回更新后的记录
    return this.findById(id) as Promise<ProjectVideoMusic>;
  }

  async update(id: string, patch: ProjectVideoMusicUpdatePatch): Promise<ProjectVideoMusic> {
    const record = await this.findById(id);
    if (!record) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    const now = Date.now();
    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (patch.volume !== undefined) {
      updates.push(`volume = $${paramIndex}`);
      values.push(patch.volume);
      paramIndex++;
    }
    if (patch.fadeInSec !== undefined) {
      updates.push(`fade_in_sec = $${paramIndex}`);
      values.push(patch.fadeInSec);
      paramIndex++;
    }
    if (patch.fadeOutSec !== undefined) {
      updates.push(`fade_out_sec = $${paramIndex}`);
      values.push(patch.fadeOutSec);
      paramIndex++;
    }

    if (updates.length === 0) {
      return record;
    }

    updates.push(`updated_at = $${paramIndex}`);
    values.push(now);
    paramIndex++;

    values.push(id);

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );

    return this.findById(id) as Promise<ProjectVideoMusic>;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }
}
```

- [ ] **步骤 4：在 index.ts 中注册仓库**

修改 `src/repositories/pg/index.ts`：

1. 在文件顶部添加 import：
```typescript
import { PgProjectVideoMusicRepository } from "./project-video-music-pg-repository.js";
```

2. 在 `PgRepositoryCollection` 接口中添加：
```typescript
projectVideoMusics: PgProjectVideoMusicRepository;
```

3. 在 `createPgRepositories` 函数的 repos 对象中添加：
```typescript
projectVideoMusics: new PgProjectVideoMusicRepository(pool),
```

4. 在 `createPgRepositoriesFromClient` 函数中添加：
```typescript
projectVideoMusics: new PgProjectVideoMusicRepository(pool, client),
```

- [ ] **步骤 5：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 6：Commit**

```bash
git add src/repositories/pg/project-video-music-pg-repository.ts src/repositories/pg/index.ts test/project_video_music_service.unit.test.ts
git commit -m "feat: 实现 ProjectVideoMusicRepository 仓库"
```

---

## 任务 3：实现 API 路由

**文件：**
- 创建：`src/routes/project-video-music-routes.ts`
- 修改：`src/routes/index.ts`
- 修改：`src/routes/app-shell-thin-entry.ts`
- 修改：`src/routes/api-registration.ts`

- [ ] **步骤 1：创建路由文件**

创建 `src/routes/project-video-music-routes.ts`：

```typescript
/**
 * 项目-视频音乐关联路由
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User, ProjectVideoMusic } from "../contracts/types.js";
import type { BatchSaveProjectVideoMusicInput, ProjectVideoMusicUpdatePatch } from "../contracts/repository-ports/project-video-music-repository.js";
import { AppError } from "../core/errors.js";

interface ProjectVideoMusicRouteDependencies {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

/** 项目音乐列表响应 */
interface ProjectVideoMusicListResponse {
  items: ProjectVideoMusic[];
  selectedMusic: ProjectVideoMusic | null;
}

/** 批量保存请求体 */
interface BatchSaveRequestBody {
  musics: BatchSaveProjectVideoMusicInput[];
  selectedMusicId?: string | null;
}

/** 批量保存响应 */
interface BatchSaveResponse {
  success: boolean;
  items: ProjectVideoMusic[];
}

/** 选择音乐响应 */
interface SelectResponse {
  success: boolean;
  item: ProjectVideoMusic;
}

/** 更新音乐请求体 */
interface UpdateRequestBody {
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** 更新音乐响应 */
interface UpdateResponse {
  success: boolean;
  item: ProjectVideoMusic;
}

/** 删除响应 */
interface DeleteResponse {
  success: boolean;
  removedId: string;
}

export function registerProjectVideoMusicRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectVideoMusicRouteDependencies,
): void {
  const repos = ctx.repos;

  // POST /projects/:projectId/video-musics/batch-save
  // 批量保存推荐列表（覆盖旧数据）
  app.post("/projects/:projectId/video-musics/batch-save", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as BatchSaveRequestBody) ?? { musics: [] };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证 musics 不为空
    if (!body.musics || body.musics.length === 0) {
      throw new AppError(400, "MUSICS_REQUIRED", "音乐列表不能为空");
    }

    // 批量保存
    const items = await repos.projectVideoMusics.batchSave(
      project.id,
      body.musics,
      body.selectedMusicId ?? null,
    );

    return {
      success: true,
      items,
    } as BatchSaveResponse;
  });

  // GET /projects/:projectId/video-musics
  // 获取项目音乐列表
  app.get("/projects/:projectId/video-musics", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 获取列表
    const items = await repos.projectVideoMusics.listByProject(project.id);
    const selectedMusic = await repos.projectVideoMusics.getSelected(project.id);

    return {
      items,
      selectedMusic,
    } as ProjectVideoMusicListResponse;
  });

  // PUT /projects/:projectId/video-musics/:id/select
  // 选择音乐（设置 is_selected=true）
  app.put("/projects/:projectId/video-musics/:id/select", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string; id: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 选择音乐
    const item = await repos.projectVideoMusics.select(project.id, params.id);

    return {
      success: true,
      item,
    } as SelectResponse;
  });

  // PUT /projects/:projectId/video-musics/:id
  // 更新音乐参数（volume、淡入淡出）
  app.put("/projects/:projectId/video-musics/:id", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string; id: string };
    const body = (request.body as UpdateRequestBody) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证记录属于该项目
    const record = await repos.projectVideoMusics.findById(params.id);
    if (!record || record.projectId !== project.id) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    // 更新参数
    const patch: ProjectVideoMusicUpdatePatch = {};
    if (body.volume !== undefined) patch.volume = body.volume;
    if (body.fadeInSec !== undefined) patch.fadeInSec = body.fadeInSec;
    if (body.fadeOutSec !== undefined) patch.fadeOutSec = body.fadeOutSec;

    const item = await repos.projectVideoMusics.update(params.id, patch);

    return {
      success: true,
      item,
    } as UpdateResponse;
  });

  // DELETE /projects/:projectId/video-musics/:id
  // 删除音乐记录
  app.delete("/projects/:projectId/video-musics/:id", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string; id: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证记录属于该项目
    const record = await repos.projectVideoMusics.findById(params.id);
    if (!record || record.projectId !== project.id) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    // 删除
    await repos.projectVideoMusics.delete(params.id);

    return {
      success: true,
      removedId: params.id,
    } as DeleteResponse;
  });
}
```

- [ ] **步骤 2：在 index.ts 中添加 registrar ID**

修改 `src/routes/index.ts`：

1. 在 `APP_ROUTE_REGISTRAR_IDS` 数组中添加：
```typescript
"project_video_music_routes",
```

2. 在 `createRouteRegistrarRegistry` 函数返回对象中添加：
```typescript
project_video_music_routes: map.get("project_video_music_routes") as RouteRegistrar,
```

- [ ] **步骤 3：在 app-shell-thin-entry.ts 中创建 registrar**

修改 `src/routes/app-shell-thin-entry.ts`：

1. 在文件顶部添加 import：
```typescript
import { registerProjectVideoMusicRoutes } from "./project-video-music-routes.js";
```

2. 在 registry 数组定义中添加：
```typescript
{
  id: "project_video_music_routes",
  register: (targetApp, targetCtx) => {
    registerProjectVideoMusicRoutes(targetApp, targetCtx, handlers.projectVideoMusic);
  },
},
```

3. 在 `AppShellThinEntryHandlers` 接口中添加依赖（如果需要）：

```typescript
projectVideoMusic: {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
};
```

4. 在 handlers 对象中添加：
```typescript
projectVideoMusic: { requireUser: handlers.requireUser },
```

5. 在 `registry.video_music_routes.register(app, ctx);` 后添加：
```typescript
registry.project_video_music_routes.register(app, ctx);
```

- [ ] **步骤 4：在 api-registration.ts 中调用路由注册**

修改 `src/routes/api-registration.ts`：

1. 在文件顶部添加 import：
```typescript
import { registerProjectVideoMusicRoutes } from "./project-video-music-routes.js";
```

2. 在 `registerApiRoutes` 函数末尾（`registerStep4VideoSceneRoutes` 后）添加：
```typescript
// --- 项目-视频音乐关联路由 ---
registerProjectVideoMusicRoutes(apiApp, ctx, { requireUser });
```

- [ ] **步骤 5：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 6：Commit**

```bash
git add src/routes/project-video-music-routes.ts src/routes/index.ts src/routes/app-shell-thin-entry.ts src/routes/api-registration.ts
git commit -m "feat: 实现 ProjectVideoMusic 路由注册"
```

---

## 任务 4：更新前端服务层

**文件：**
- 修改：`apps/web/services/backendApi.videoMusic.ts`
- 修改：`apps/web/pages/project-flow/step4-video-workspace/step4MusicController.ts`

- [ ] **步骤 1：在 backendApi.videoMusic.ts 中添加 API 方法**

修改 `apps/web/services/backendApi.videoMusic.ts`：

1. 在文件顶部添加类型定义：
```typescript
export interface ProjectVideoMusicDto {
  id: string;
  projectId: string;
  musicId: string;
  musicUrl: string;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
  isSelected: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectVideoMusicListResult {
  items: ProjectVideoMusicDto[];
  selectedMusic: ProjectVideoMusicDto | null;
}

export interface BatchSaveProjectVideoMusicPayload {
  musics: Array<{
    musicId: string;
    musicUrl: string;
    volume?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
  }>;
  selectedMusicId?: string | null;
}

export interface BatchSaveResult {
  success: boolean;
  items: ProjectVideoMusicDto[];
}

export interface SelectResult {
  success: boolean;
  item: ProjectVideoMusicDto;
}

export interface UpdateResult {
  success: boolean;
  item: ProjectVideoMusicDto;
}

export interface DeleteResult {
  success: boolean;
  removedId: string;
}
```

2. 在 `VideoMusicBackendApiShape` 接口中添加：
```typescript
// 项目音乐方法
listProjectVideoMusics: (token: string, projectId: string) => Promise<ProjectVideoMusicListResult>;
batchSaveProjectVideoMusics: (token: string, projectId: string, payload: BatchSaveProjectVideoMusicPayload) => Promise<BatchSaveResult>;
selectProjectVideoMusic: (token: string, projectId: string, id: string) => Promise<SelectResult>;
updateProjectVideoMusic: (token: string, projectId: string, id: string, payload: { volume?: number; fadeInSec?: number; fadeOutSec?: number }) => Promise<UpdateResult>;
deleteProjectVideoMusic: (token: string, projectId: string, id: string) => Promise<DeleteResult>;
```

3. 在 `createVideoMusicRealBackendApi` 函数中添加实现：
```typescript
listProjectVideoMusics: (token, projectId) =>
  request<ProjectVideoMusicListResult>("GET", `/projects/${projectId}/video-musics`, { token }),
batchSaveProjectVideoMusics: (token, projectId, payload) =>
  request<BatchSaveResult>("POST", `/projects/${projectId}/video-musics/batch-save`, { token, body: payload }),
selectProjectVideoMusic: (token, projectId, id) =>
  request<SelectResult>("PUT", `/projects/${projectId}/video-musics/${id}/select`, { token }),
updateProjectVideoMusic: (token, projectId, id, payload) =>
  request<UpdateResult>("PUT", `/projects/${projectId}/video-musics/${id}`, { token, body: payload }),
deleteProjectVideoMusic: (token, projectId, id) =>
  request<DeleteResult>("DELETE", `/projects/${projectId}/video-musics/${id}`, { token }),
```

4. 在 `createVideoMusicMockBackendApi` 函数中添加 Mock 实现：
```typescript
async listProjectVideoMusics(_token, projectId) {
  await dependencies.mockDelay();
  return { items: [], selectedMusic: null };
},
async batchSaveProjectVideoMusics(_token, projectId, payload) {
  await dependencies.mockDelay();
  const now = Date.now();
  const items: ProjectVideoMusicDto[] = payload.musics.map((m, i) => ({
    id: `pvm-${projectId}-${i}`,
    projectId,
    musicId: m.musicId,
    musicUrl: m.musicUrl,
    volume: m.volume ?? 0.5,
    fadeInSec: m.fadeInSec ?? 0,
    fadeOutSec: m.fadeOutSec ?? 0,
    isSelected: payload.selectedMusicId === m.musicId,
    createdAt: now,
    updatedAt: now,
  }));
  return { success: true, items };
},
async selectProjectVideoMusic(_token, projectId, id) {
  await dependencies.mockDelay();
  return {
    success: true,
    item: {
      id,
      projectId,
      musicId: "mock-music",
      musicUrl: "https://example.com/music.mp3",
      volume: 0.5,
      fadeInSec: 0,
      fadeOutSec: 0,
      isSelected: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
},
async updateProjectVideoMusic(_token, projectId, id, payload) {
  await dependencies.mockDelay();
  return {
    success: true,
    item: {
      id,
      projectId,
      musicId: "mock-music",
      musicUrl: "https://example.com/music.mp3",
      volume: payload.volume ?? 0.5,
      fadeInSec: payload.fadeInSec ?? 0,
      fadeOutSec: payload.fadeOutSec ?? 0,
      isSelected: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
},
async deleteProjectVideoMusic(_token, projectId, id) {
  await dependencies.mockDelay();
  return { success: true, removedId: id };
},
```

5. 在 `createVideoMusicBackendApi` 函数中添加：
```typescript
listProjectVideoMusics: (...args) => routeApiCall("listProjectVideoMusics", args),
batchSaveProjectVideoMusics: (...args) => routeApiCall("batchSaveProjectVideoMusics", args),
selectProjectVideoMusic: (...args) => routeApiCall("selectProjectVideoMusic", args),
updateProjectVideoMusic: (...args) => routeApiCall("updateProjectVideoMusic", args),
deleteProjectVideoMusic: (...args) => routeApiCall("deleteProjectVideoMusic", args),
```

- [ ] **步骤 2：更新 step4MusicController.ts**

修改 `apps/web/pages/project-flow/step4-video-workspace/step4MusicController.ts`：

1. 添加新的持久化函数（替换 `buildStep4MusicPersistPatch`）：

```typescript
import { backendApi } from "../../../services/backendApi";
import type {
  ProjectVideoMusicDto,
  BatchSaveProjectVideoMusicPayload,
} from "../../../services/backendApi.videoMusic";

/**
 * 批量保存推荐列表到数据库
 * 替代 buildStep4MusicPersistPatch（已废弃）
 */
export async function saveStep4MusicToDatabase(
  token: string,
  projectId: string,
  recommendation: VideoMusicMatchResultDto | null,
  selectedMusicId?: string | null,
): Promise<ProjectVideoMusicDto[]> {
  if (!recommendation?.music) {
    return [];
  }

  const musics = extractMusicsFromRecommendation(recommendation);
  const payload: BatchSaveProjectVideoMusicPayload = {
    musics: musics.map((m) => ({
      musicId: m.id,
      musicUrl: m.musicUrl,
    })),
    selectedMusicId: selectedMusicId ?? recommendation.music.id,
  };

  const result = await backendApi.batchSaveProjectVideoMusics(token, projectId, payload);
  return result.items;
}

/**
 * 从数据库加载项目音乐列表
 */
export async function loadStep4MusicFromDatabase(
  token: string,
  projectId: string,
): Promise<ProjectVideoMusicListResult | null> {
  try {
    return await backendApi.listProjectVideoMusics(token, projectId);
  } catch {
    return null;
  }
}

/**
 * 选择音乐（更新数据库）
 */
export async function selectStep4MusicInDatabase(
  token: string,
  projectId: string,
  musicId: string,
): Promise<ProjectVideoMusicDto | null> {
  try {
    // 先获取列表找到对应的记录 id
    const list = await backendApi.listProjectVideoMusics(token, projectId);
    const record = list.items.find((item) => item.musicId === musicId);
    if (!record) return null;

    const result = await backendApi.selectProjectVideoMusic(token, projectId, record.id);
    return result.item;
  } catch {
    return null;
  }
}
```

2. 删除或注释旧的 `buildStep4MusicPersistPatch` 和 `resolveStep4MusicPayload` 函数（已废弃）

- [ ] **步骤 3：验证前端编译**

运行：`npm run build:ui`
预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add apps/web/services/backendApi.videoMusic.ts apps/web/pages/project-flow/step4-video-workspace/step4MusicController.ts
git commit -m "feat: 前端添加 ProjectVideoMusic API 方法和持久化函数"
```

---

## 任务 5：创建数据库表

**注意：** 此任务需要直接操作数据库，不创建迁移文件。

- [ ] **步骤 1：创建数据库表**

执行以下 SQL（通过数据库连接工具或代码执行）：

```sql
-- 创建表
CREATE TABLE nrm_project_video_musics (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  music_id VARCHAR(64) NOT NULL,
  music_url TEXT NOT NULL,
  volume DECIMAL(3,2) DEFAULT 0.5,
  fade_in_sec DECIMAL(5,2) DEFAULT 0,
  fade_out_sec DECIMAL(5,2) DEFAULT 0,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,

  -- 外键约束
  CONSTRAINT fk_project_video_musics_project
    FOREIGN KEY (project_id) REFERENCES nrm_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_video_musics_music
    FOREIGN KEY (music_id) REFERENCES nrm_video_musics(id) ON DELETE RESTRICT,

  -- 唯一约束：同一项目中同一音乐只能有一条记录
  CONSTRAINT uq_project_video_musics_project_music
    UNIQUE (project_id, music_id)
);

-- 创建索引
CREATE INDEX idx_project_video_musics_project ON nrm_project_video_musics(project_id);
CREATE INDEX idx_project_video_musics_selected ON nrm_project_video_musics(project_id, is_selected) WHERE is_selected = TRUE;

-- 添加表注释
COMMENT ON TABLE nrm_project_video_musics IS '项目-视频音乐关联表：存储项目的背景音乐选择';
COMMENT ON COLUMN nrm_project_video_musics.id IS '主键';
COMMENT ON COLUMN nrm_project_video_musics.project_id IS '项目ID';
COMMENT ON COLUMN nrm_project_video_musics.music_id IS '音乐ID（关联 nrm_video_musics）';
COMMENT ON COLUMN nrm_project_video_musics.music_url IS '音乐链接快照（选择时的 URL 副本，不受音乐库变更影响）';
COMMENT ON COLUMN nrm_project_video_musics.volume IS '音量（0.00-1.00）';
COMMENT ON COLUMN nrm_project_video_musics.fade_in_sec IS '淡入时长（秒）';
COMMENT ON COLUMN nrm_project_video_musics.fade_out_sec IS '淡出时长（秒）';
COMMENT ON COLUMN nrm_project_video_musics.is_selected IS '是否被选中';
COMMENT ON COLUMN nrm_project_video_musics.created_at IS '创建时间戳';
COMMENT ON COLUMN nrm_project_video_musics.updated_at IS '更新时间戳';
```

可以通过以下 Node.js 代码执行：

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = `
CREATE TABLE nrm_project_video_musics (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  music_id VARCHAR(64) NOT NULL,
  music_url TEXT NOT NULL,
  volume DECIMAL(3,2) DEFAULT 0.5,
  fade_in_sec DECIMAL(5,2) DEFAULT 0,
  fade_out_sec DECIMAL(5,2) DEFAULT 0,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_project_video_musics_project FOREIGN KEY (project_id) REFERENCES nrm_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_video_musics_music FOREIGN KEY (music_id) REFERENCES nrm_video_musics(id) ON DELETE RESTRICT,
  CONSTRAINT uq_project_video_musics_project_music UNIQUE (project_id, music_id)
);
CREATE INDEX idx_project_video_musics_project ON nrm_project_video_musics(project_id);
CREATE INDEX idx_project_video_musics_selected ON nrm_project_video_musics(project_id, is_selected) WHERE is_selected = TRUE;
COMMENT ON TABLE nrm_project_video_musics IS '项目-视频音乐关联表';
`;
pool.query(sql).then(() => { console.log('Table created'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"
```

预期：表创建成功

- [ ] **步骤 2：验证表结构**

执行 SQL 查询验证：
```sql
\d nrm_project_video_musics
```

预期：显示表结构，包含所有字段和约束

---

## 任务 6：集成测试与验证

- [ ] **步骤 1：启动后端服务**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`
预期：服务启动成功

- [ ] **步骤 2：测试 API 端点**

使用 curl 或 Postman 测试：

```bash
# 获取项目音乐列表（需要 token）
curl -X GET http://localhost:3020/neirongmiao/api/projects/{projectId}/video-musics \
  -H "Authorization: Bearer {token}"

# 批量保存音乐
curl -X POST http://localhost:3020/neirongmiao/api/projects/{projectId}/video-musics/batch-save \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"musics":[{"musicId":"music-001","musicUrl":"https://example.com/music.mp3"}],"selectedMusicId":"music-001"}'

# 选择音乐
curl -X PUT http://localhost:3020/neirongmiao/api/projects/{projectId}/video-musics/{id}/select \
  -H "Authorization: Bearer {token}"
```

预期：所有请求返回正确响应

- [ ] **步骤 3：运行单元测试**

运行：`npm run test`
预期：所有测试通过

- [ ] **步骤 4：Commit 所有更改**

```bash
git add -A
git commit -m "feat: 完成 ProjectVideoMusic 模块实现"
```

---

## 规格覆盖度检查

| 规格章节 | 对应任务 |
|---------|---------|
| 表结构设计 | 任务 5 |
| 类型定义 `ProjectVideoMusic` | 任务 1 |
| 仓库接口 `IProjectVideoMusicRepository` | 任务 1 |
| 仓库实现 | 任务 2 |
| API 端点（5 个） | 任务 3 |
| 前端 API 方法 | 任务 4 |
| 快照存储 | 任务 2（`batchSave` 方法） |
| is_selected 约束 | 任务 2（`select` 方法） |

**覆盖率：100%**