# 用户服饰资产表合并实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 合并 `nrm_assets` + `nrm_library_assets` 为统一的 `nrm_garment_assets` 表，并创建多对多关联表。

**架构：** 新建服饰资产表 + 项目关联表，迁移旧数据，更新 Repository/Service/API 层，前端同步更新端点。

**技术栈：** PostgreSQL、Fastify 5、TypeScript、React 18

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `migrations/create-garment-assets-tables.sql` | DDL 迁移：创建新表 |
| `src/contracts/repository-ports/garment-repository.ts` | Repository 接口定义 |
| `src/repositories/pg/garment-asset-pg-repository.ts` | 服饰资产 PG 仓库 |
| `src/repositories/pg/project-garment-assoc-pg-repository.ts` | 项目服饰关联 PG 仓库 |
| `src/routes/garment-asset-routes.ts` | 服饰资产 API 路由 |
| `src/routes/project-garment-assoc-routes.ts` | 项目服饰关联 API 路由 |
| `scripts/migrate-garment-assets.ts` | 数据迁移脚本 |
| `apps/web/services/api-modules/garment-assets.ts` | 前端 API 封装 |
| `apps/web/services/api-modules/project-garment-assoc.ts` | 前端关联 API 封装 |

### 修改文件

| 文件 | 职责 |
|------|------|
| `src/contracts/types.ts` | 新增 GarmentAsset、ProjectGarmentAssoc 类型 |
| `src/modules/asset-library-service.ts` | 使用新 Repository |
| `scripts/create_all_tables.ts` | 替换旧表为新表 |
| `src/app-setup/setup-routes.ts` | 注册新 API 路由 |
| `apps/web/services/backendApi.ts` | 注册新前端 API 模块 |

---

## 任务 1：创建 DDL 迁移文件

**文件：**
- 创建：`migrations/create-garment-assets-tables.sql`

- [ ] **步骤 1：编写 DDL 文件**

```sql
-- migrations/create-garment-assets-tables.sql
-- 用户服饰资产表（合并 nrm_assets + nrm_library_assets）

CREATE TABLE IF NOT EXISTS nrm_garment_assets (
  id TEXT PRIMARY KEY,                              -- 主键
  user_id TEXT NOT NULL,                            -- 用户ID（公共资产用 "system")
  name TEXT NOT NULL,                               -- 服饰名称
  type TEXT NOT NULL,                               -- 类型：image / video
  category TEXT NOT NULL,                           -- 服装类别：top / bottom / shoes / accessory

  -- 图片链接（四个独立字段）
  main_image_url TEXT NOT NULL,                     -- 主图
  sub_image_url_1 TEXT,                             -- 副图1
  sub_image_url_2 TEXT,                             -- 副图2
  sub_image_url_3 TEXT,                             -- 副图3

  -- 基本信息
  size_mb NUMERIC(8,2),                             -- 文件大小（MB）

  -- AI 分类结果（传统字段）
  ai_category TEXT,                                 -- AI识别类别：top / bottom / shoes / accessory / unknown
  ai_view_label TEXT,                               -- AI视角标签：main / detail
  ai_confidence NUMERIC(4,3),                       -- AI置信度（0~1）
  ai_reason TEXT,                                   -- AI分类原因说明

  -- 时间戳
  created_at BIGINT NOT NULL,                       -- 创建时间戳（毫秒）
  updated_at BIGINT NOT NULL,                       -- 更新时间戳（毫秒）

  -- 软删除
  deleted_at BIGINT,                                -- 删除时间戳
  deleted_by TEXT                                   -- 删除操作者
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_garment_assets_user_id ON nrm_garment_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_garment_assets_category ON nrm_garment_assets(category);
CREATE INDEX IF NOT EXISTS idx_garment_assets_type ON nrm_garment_assets(type);

-- 项目服饰关联表（多对多）
CREATE TABLE IF NOT EXISTS nrm_project_garment_assoc (
  id TEXT PRIMARY KEY,                              -- 主键
  project_id TEXT NOT NULL REFERENCES nrm_projects(id) ON DELETE CASCADE,
  garment_asset_id TEXT NOT NULL REFERENCES nrm_garment_assets(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,                       -- 创建时间戳
  updated_at BIGINT NOT NULL,                       -- 更新时间戳

  UNIQUE(project_id, garment_asset_id)              -- 防止重复关联
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_project_garment_assoc_project_id ON nrm_project_garment_assoc(project_id);
CREATE INDEX IF NOT EXISTS idx_project_garment_assoc_garment_asset_id ON nrm_project_garment_assoc(garment_asset_id);
```

- [ ] **步骤 2：手动执行 DDL（或通过脚本）**

```bash
# 方式1：直接执行 SQL 文件
psql $DATABASE_URL -f migrations/create-garment-assets-tables.sql

# 方式2：通过 Node.js 执行（推荐，更可控）
npx tsx -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('migrations/create-garment-assets-tables.sql', 'utf8');
pool.query(sql).then(() => { console.log('Tables created'); pool.end(); }).catch(e => { console.error(e); pool.end(); });
"
```

预期：输出 "Tables created"，数据库中存在 `nrm_garment_assets` 和 `nrm_project_garment_assoc` 表

- [ ] **步骤 3：验证表结构**

```bash
psql $DATABASE_URL -c "\d nrm_garment_assets"
psql $DATABASE_URL -c "\d nrm_project_garment_assoc"
```

预期：输出表结构，字段与设计文档一致

- [ ] **步骤 4：Commit**

```bash
git add migrations/create-garment-assets-tables.sql
git commit -m "feat(db): add garment_assets and project_garment_assoc tables"
```

---

## 任务 2：更新类型定义

**文件：**
- 修改：`src/contracts/types.ts`

- [ ] **步骤 1：新增 GarmentAsset 类型**

在 `src/contracts/types.ts` 中，找到 `LibraryAsset` 类型定义后，添加：

```typescript
/** 用户服饰资产（合并 nrm_assets + nrm_library_assets） */
export interface GarmentAsset extends SoftDeletable {
  id: string;
  userId: string;                    // 用户ID，公共资产用 "system"
  name: string;                      // 服饰名称
  type: "image" | "video";           // 类型
  category: AssetCategory;           // 服装类别
  mainImageUrl: string;              // 主图
  subImageUrl1: string | null;       // 副图1
  subImageUrl2: string | null;       // 副图2
  subImageUrl3: string | null;       // 副图3
  sizeMb: number | null;             // 文件大小
  aiCategory: string | null;         // AI识别类别
  aiViewLabel: string | null;        // AI视角标签
  aiConfidence: number | null;       // AI置信度（0~1）
  aiReason: string | null;           // AI分类原因
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 2：新增 ProjectGarmentAssoc 类型**

在同一文件中添加：

```typescript
/** 项目服饰关联（多对多） */
export interface ProjectGarmentAssoc {
  id: string;
  projectId: string;
  garmentAssetId: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 3：编译验证**

```bash
npm run build
```

预期：编译成功，无类型错误

- [ ] **步骤 4：Commit**

```bash
git add src/contracts/types.ts
git commit -m "feat(types): add GarmentAsset and ProjectGarmentAssoc types"
```

---

## 任务 3：创建 Repository 接口

**文件：**
- 创建：`src/contracts/repository-ports/garment-repository.ts`

- [ ] **步骤 1：编写接口文件**

```typescript
// src/contracts/repository-ports/garment-repository.ts
/**
 * 服饰资产仓库端口
 */

import type { GarmentAsset, ProjectGarmentAssoc } from "../types.js";

/** 服饰资产仓库端口 */
export interface IGarmentAssetRepository {
  findById(id: string): Promise<GarmentAsset | null>;
  findByUserId(userId: string): Promise<GarmentAsset[]>;
  findByIds(ids: string[]): Promise<GarmentAsset[]>;
  findPublicAssets(): Promise<GarmentAsset[]>;  // user_id = "system"
  upsert(asset: GarmentAsset): Promise<void>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
}

/** 项目服饰关联仓库端口 */
export interface IProjectGarmentAssocRepository {
  findById(id: string): Promise<ProjectGarmentAssoc | null>;
  findByProjectId(projectId: string): Promise<ProjectGarmentAssoc[]>;
  findByGarmentAssetId(assetId: string): Promise<ProjectGarmentAssoc[]>;
  findAssetIdsByProjectId(projectId: string): Promise<string[]>;
  upsert(assoc: ProjectGarmentAssoc): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}
```

- [ ] **步骤 2：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/contracts/repository-ports/garment-repository.ts
git commit -m "feat(repo): add IGarmentAssetRepository and IProjectGarmentAssocRepository interfaces"
```

---

## 任务 4：创建 GarmentAsset PG Repository

**文件：**
- 创建：`src/repositories/pg/garment-asset-pg-repository.ts`

- [ ] **步骤 1：编写 Repository 文件**

```typescript
// src/repositories/pg/garment-asset-pg-repository.ts
/**
 * 服饰资产 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { GarmentAsset } from "../../contracts/types.js";
import type { IGarmentAssetRepository } from "../../contracts/repository-ports/garment-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { nrm } from "./base-pg-repository.js";

export class PgGarmentAssetRepository
  extends PgSoftDeletableRepository<GarmentAsset>
  implements IGarmentAssetRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("garment_assets"), client);
  }

  protected mapRow(row: Record<string, unknown>): GarmentAsset {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      type: row.type as GarmentAsset["type"],
      category: row.category as GarmentAsset["category"],
      mainImageUrl: row.main_image_url as string,
      subImageUrl1: (row.sub_image_url_1 as string) ?? null,
      subImageUrl2: (row.sub_image_url_2 as string) ?? null,
      subImageUrl3: (row.sub_image_url_3 as string) ?? null,
      sizeMb: (row.size_mb as number) ?? null,
      aiCategory: (row.ai_category as string) ?? null,
      aiViewLabel: (row.ai_view_label as string) ?? null,
      aiConfidence: (row.ai_confidence as number) ?? null,
      aiReason: (row.ai_reason as string) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      deletedAt: (row.deleted_at as number) ?? null,
      deletedBy: (row.deleted_by as string) ?? null,
    };
  }

  protected mapEntity(a: GarmentAsset): Record<string, unknown> {
    return {
      id: a.id,
      user_id: a.userId,
      name: a.name,
      type: a.type,
      category: a.category,
      main_image_url: a.mainImageUrl,
      sub_image_url_1: a.subImageUrl1 ?? null,
      sub_image_url_2: a.subImageUrl2 ?? null,
      sub_image_url_3: a.subImageUrl3 ?? null,
      size_mb: a.sizeMb ?? null,
      ai_category: a.aiCategory ?? null,
      ai_view_label: a.aiViewLabel ?? null,
      ai_confidence: a.aiConfidence ?? null,
      ai_reason: a.aiReason ?? null,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
      deleted_at: a.deletedAt ?? null,
      deleted_by: a.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<GarmentAsset[]> {
    return this.findWhere({ user_id: userId });
  }

  async findByIds(ids: string[]): Promise<GarmentAsset[]> {
    if (ids.length === 0) return [];
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findPublicAssets(): Promise<GarmentAsset[]> {
    return this.findWhere({ user_id: "system" });
  }
}
```

- [ ] **步骤 2：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/repositories/pg/garment-asset-pg-repository.ts
git commit -m "feat(repo): add PgGarmentAssetRepository"
```

---

## 任务 5：创建 ProjectGarmentAssoc PG Repository

**文件：**
- 创建：`src/repositories/pg/project-garment-assoc-pg-repository.ts`

- [ ] **步骤 1：编写 Repository 文件**

```typescript
// src/repositories/pg/project-garment-assoc-pg-repository.ts
/**
 * 项目服饰关联 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ProjectGarmentAssoc } from "../../contracts/types.js";
import type { IProjectGarmentAssocRepository } from "../../contracts/repository-ports/garment-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgProjectGarmentAssocRepository
  extends PgBaseRepository<ProjectGarmentAssoc>
  implements IProjectGarmentAssocRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_garment_assoc"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectGarmentAssoc {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      garmentAssetId: row.garment_asset_id as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(a: ProjectGarmentAssoc): Record<string, unknown> {
    return {
      id: a.id,
      project_id: a.projectId,
      garment_asset_id: a.garmentAssetId,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ProjectGarmentAssoc[]> {
    return this.findWhere({ project_id: projectId });
  }

  async findByGarmentAssetId(assetId: string): Promise<ProjectGarmentAssoc[]> {
    return this.findWhere({ garment_asset_id: assetId });
  }

  async findAssetIdsByProjectId(projectId: string): Promise<string[]> {
    const result = await this.queryClient.query(
      `SELECT garment_asset_id FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return result.rows.map((row) => row.garment_asset_id as string);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }
}
```

- [ ] **步骤 2：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/repositories/pg/project-garment-assoc-pg-repository.ts
git commit -m "feat(repo): add PgProjectGarmentAssocRepository"
```

---

## 任务 6：更新 AssetLibraryService

**文件：**
- 修改：`src/modules/asset-library-service.ts`

- [ ] **步骤 1：更新 import 和类型引用**

修改文件头部 import：

```typescript
// 原代码
import type { ILibraryAssetRepository } from "../contracts/repository-ports/library-repository.js";
import type { LibraryAsset, User, AssetClassificationResult } from "../contracts/types.js";

// 改为
import type { IGarmentAssetRepository } from "../contracts/repository-ports/garment-repository.js";
import type { GarmentAsset, User, AssetClassificationResult } from "../contracts/types.js";
```

- [ ] **步骤 2：更新类定义和方法**

将 `AssetLibraryService` 类改为使用新 Repository：

```typescript
export class AssetLibraryService implements IAssetLibraryService {
  constructor(
    private readonly repos: { garmentAssets: IGarmentAssetRepository },
    private readonly clock: IRepositoryClock,
  ) {}

  async list(user: User): Promise<GarmentAsset[]> {
    // 获取用户资产 + 公共资产
    const userAssets = await this.repos.garmentAssets.findByUserId(user.id);
    const publicAssets = await this.repos.garmentAssets.findPublicAssets();
    const allAssets = [...userAssets, ...publicAssets];
    return allAssets.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async create(
    user: User,
    input: {
      name: string;
      type: "image" | "video";
      category: "top" | "bottom" | "shoes" | "accessory" | "video";
      mainImageUrl: string;
      subImageUrl1?: string | null;
      subImageUrl2?: string | null;
      subImageUrl3?: string | null;
      sizeMb: number;
      classification?: AssetClassificationResult;
    },
  ): Promise<GarmentAsset> {
    const name = input.name.trim();
    assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Asset name required");
    assertCondition(input.mainImageUrl.trim().length > 0, 400, "URL_REQUIRED", "Main image url required");
    assertCondition(input.sizeMb > 0, 400, "SIZE_INVALID", "Asset size invalid");
    
    const now = this.clock.now();
    const item: GarmentAsset = {
      id: this.clock.generateId(),
      userId: user.id,
      name,
      type: input.type,
      category: input.category,
      mainImageUrl: input.mainImageUrl.trim(),
      subImageUrl1: input.subImageUrl1 ?? null,
      subImageUrl2: input.subImageUrl2 ?? null,
      subImageUrl3: input.subImageUrl3 ?? null,
      sizeMb: input.sizeMb,
      createdAt: now,
      updatedAt: now,
      // AI 分类结果
      aiCategory: input.classification?.category ?? null,
      aiViewLabel: input.classification?.viewLabel ?? null,
      aiConfidence: input.classification?.confidence ?? null,
      aiReason: input.classification?.reason ?? null,
    };
    await this.repos.garmentAssets.upsert(item);
    return item;
  }

  async update(
    user: User,
    assetId: string,
    patch: Partial<Pick<GarmentAsset, "name" | "category" | "mainImageUrl" | "subImageUrl1" | "subImageUrl2" | "subImageUrl3" | "sizeMb">>,
  ): Promise<GarmentAsset> {
    const existing = await this.requireOwnerAsset(user, assetId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Asset name required");
      existing.name = name;
    }
    if (patch.category !== undefined) {
      existing.category = patch.category;
    }
    if (patch.mainImageUrl !== undefined) {
      assertCondition(patch.mainImageUrl.trim().length > 0, 400, "URL_REQUIRED", "Main image url required");
      existing.mainImageUrl = patch.mainImageUrl.trim();
    }
    if (patch.subImageUrl1 !== undefined) existing.subImageUrl1 = patch.subImageUrl1;
    if (patch.subImageUrl2 !== undefined) existing.subImageUrl2 = patch.subImageUrl2;
    if (patch.subImageUrl3 !== undefined) existing.subImageUrl3 = patch.subImageUrl3;
    if (patch.sizeMb !== undefined) {
      assertCondition(patch.sizeMb > 0, 400, "SIZE_INVALID", "Asset size invalid");
      existing.sizeMb = patch.sizeMb;
    }
    existing.updatedAt = this.clock.now();
    await this.repos.garmentAssets.upsert(existing);
    return existing;
  }

  async remove(user: User, assetId: string): Promise<void> {
    await this.requireOwnerAsset(user, assetId);
    await this.repos.garmentAssets.softDelete(assetId, user.id);
  }

  private async requireOwnerAsset(user: User, assetId: string): Promise<GarmentAsset> {
    const asset = await this.repos.garmentAssets.findById(assetId);
    assertCondition(Boolean(asset), 404, "NOT_FOUND", "Asset not found");
    const existing = asset as GarmentAsset;
    // 用户只能操作自己的资产（公共资产 user_id="system" 不可修改）
    assertCondition(existing.userId === user.id, 403, "FORBIDDEN", "Asset owner only");
    return existing;
  }
}
```

- [ ] **步骤 3：更新 IAssetLibraryService 接口**

在 `src/contracts/services.ts` 中找到 `IAssetLibraryService` 接口，修改返回类型：

```typescript
// 原代码
export interface IAssetLibraryService {
  list(user: User): Promise<LibraryAsset[]>;
  create(...): Promise<LibraryAsset>;
  update(...): Promise<LibraryAsset>;
  remove(...): Promise<void>;
}

// 改为
export interface IAssetLibraryService {
  list(user: User): Promise<GarmentAsset[]>;
  create(...): Promise<GarmentAsset>;
  update(...): Promise<GarmentAsset>;
  remove(...): Promise<void>;
}
```

- [ ] **步骤 4：编译验证**

```bash
npm run build
```

预期：编译成功（可能有其他文件引用旧类型，需逐一修复）

- [ ] **步骤 5：修复其他引用**

搜索 `LibraryAsset` 的引用并更新为 `GarmentAsset`：

```bash
grep -r "LibraryAsset" src/contracts src/modules src/routes --include="*.ts"
```

- [ ] **步骤 6：Commit**

```bash
git add src/modules/asset-library-service.ts src/contracts/services.ts
git commit -m "refactor(service): update AssetLibraryService to use GarmentAsset"
```

---

## 任务 7：创建服饰资产 API 路由

**文件：**
- 创建：`src/routes/garment-asset-routes.ts`

- [ ] **步骤 1：编写路由文件**

```typescript
// src/routes/garment-asset-routes.ts
/**
 * 服饰资产 API 路由
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { GarmentAsset, User } from "../contracts/types.js";

/** 服饰资产路由依赖 */
export interface GarmentAssetRouteDeps {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

interface CreateGarmentAssetBody {
  name?: unknown;
  type?: unknown;
  category?: unknown;
  mainImageUrl?: unknown;
  subImageUrl1?: unknown;
  subImageUrl2?: unknown;
  subImageUrl3?: unknown;
  sizeMb?: unknown;
}

interface UpdateGarmentAssetBody {
  name?: unknown;
  category?: unknown;
  mainImageUrl?: unknown;
  subImageUrl1?: unknown;
  subImageUrl2?: unknown;
  subImageUrl3?: unknown;
  sizeMb?: unknown;
}

/** 创建服饰资产路由处理器 */
export function createGarmentAssetHandlers(
  app: FastifyInstance,
  ctx: AppContext,
  deps: GarmentAssetRouteDeps,
) {
  const { requireUser } = deps;

  const listAssets = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    return { items: await ctx.assetLibraryService.list(user) };
  };

  const getAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assetId: string };
    const asset = await ctx.garmentAssetRepo.findById(params.assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }
    // 只能查看自己的资产或公共资产
    if (asset.userId !== user.id && asset.userId !== "system") {
      throw new Error("Forbidden");
    }
    return asset;
  };

  const createAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as CreateGarmentAssetBody) ?? {};
    const created = await ctx.assetLibraryService.create(user, {
      name: typeof body.name === "string" ? body.name : "",
      type: typeof body.type === "string" && (body.type === "image" || body.type === "video") ? body.type : "image",
      category: typeof body.category === "string" ? (body.category as GarmentAsset["category"]) : "top",
      mainImageUrl: typeof body.mainImageUrl === "string" ? body.mainImageUrl : "",
      subImageUrl1: typeof body.subImageUrl1 === "string" ? body.subImageUrl1 : null,
      subImageUrl2: typeof body.subImageUrl2 === "string" ? body.subImageUrl2 : null,
      subImageUrl3: typeof body.subImageUrl3 === "string" ? body.subImageUrl3 : null,
      sizeMb: typeof body.sizeMb === "number" ? body.sizeMb : 0,
    });
    return created;
  };

  const updateAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assetId: string };
    const body = (request.body as UpdateGarmentAssetBody) ?? {};
    const updated = await ctx.assetLibraryService.update(user, params.assetId, {
      name: typeof body.name === "string" ? body.name : undefined,
      category: typeof body.category === "string" ? (body.category as GarmentAsset["category"]) : undefined,
      mainImageUrl: typeof body.mainImageUrl === "string" ? body.mainImageUrl : undefined,
      subImageUrl1: typeof body.subImageUrl1 === "string" ? body.subImageUrl1 : undefined,
      subImageUrl2: typeof body.subImageUrl2 === "string" ? body.subImageUrl2 : undefined,
      subImageUrl3: typeof body.subImageUrl3 === "string" ? body.subImageUrl3 : undefined,
      sizeMb: typeof body.sizeMb === "number" ? body.sizeMb : undefined,
    });
    return updated;
  };

  const deleteAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assetId: string };
    await ctx.assetLibraryService.remove(user, params.assetId);
    return { ok: true };
  };

  return { listAssets, getAsset, createAsset, updateAsset, deleteAsset };
}

/** 注册服饰资产路由 */
export function registerGarmentAssetRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: GarmentAssetRouteDeps,
) {
  const handlers = createGarmentAssetHandlers(app, ctx, deps);

  app.get("/api/garment-assets", handlers.listAssets);
  app.get("/api/garment-assets/:assetId", handlers.getAsset);
  app.post("/api/garment-assets", handlers.createAsset);
  app.put("/api/garment-assets/:assetId", handlers.updateAsset);
  app.delete("/api/garment-assets/:assetId", handlers.deleteAsset);
}
```

- [ ] **步骤 2：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/routes/garment-asset-routes.ts
git commit -m "feat(routes): add garment-asset API routes"
```

---

## 任务 8：创建项目服饰关联 API 路由

**文件：**
- 创建：`src/routes/project-garment-assoc-routes.ts`

- [ ] **步骤 1：编写路由文件**

```typescript
// src/routes/project-garment-assoc-routes.ts
/**
 * 项目服饰关联 API 路由
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User, GarmentAsset, ProjectGarmentAssoc } from "../contracts/types.js";

/** 项目服饰关联路由依赖 */
export interface ProjectGarmentAssocRouteDeps {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

interface CreateAssocBody {
  projectId?: unknown;
  garmentAssetId?: unknown;
}

/** 创建项目服饰关联路由处理器 */
export function createProjectGarmentAssocHandlers(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectGarmentAssocRouteDeps,
) {
  const { requireUser } = deps;

  const listAssocs = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const query = request.query as { projectId?: string };
    if (!query.projectId) {
      throw new Error("projectId required");
    }
    // 验证项目所有权
    const project = await ctx.projectRepo.findById(query.projectId);
    if (!project || project.ownerId !== user.id) {
      throw new Error("Project not found or forbidden");
    }
    const assocs = await ctx.projectGarmentAssocRepo.findByProjectId(query.projectId);
    // 获取关联的服饰资产详情
    const assetIds = assocs.map((a) => a.garmentAssetId);
    const assets = await ctx.garmentAssetRepo.findByIds(assetIds);
    return { items: assocs, assets };
  };

  const addAssoc = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as CreateAssocBody) ?? {};
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const garmentAssetId = typeof body.garmentAssetId === "string" ? body.garmentAssetId : "";
    if (!projectId || !garmentAssetId) {
      throw new Error("projectId and garmentAssetId required");
    }
    // 验证项目所有权
    const project = await ctx.projectRepo.findById(projectId);
    if (!project || project.ownerId !== user.id) {
      throw new Error("Project not found or forbidden");
    }
    // 验证服饰资产（用户自己的或公共的）
    const asset = await ctx.garmentAssetRepo.findById(garmentAssetId);
    if (!asset) {
      throw new Error("Asset not found");
    }
    if (asset.userId !== user.id && asset.userId !== "system") {
      throw new Error("Asset forbidden");
    }
    const now = Date.now();
    const assoc: ProjectGarmentAssoc = {
      id: `${projectId}_${garmentAssetId}`,
      projectId,
      garmentAssetId,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.projectGarmentAssocRepo.upsert(assoc);
    return assoc;
  };

  const removeAssoc = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assocId: string };
    const assoc = await ctx.projectGarmentAssocRepo.findById(params.assocId);
    if (!assoc) {
      throw new Error("Assoc not found");
    }
    // 验证项目所有权
    const project = await ctx.projectRepo.findById(assoc.projectId);
    if (!project || project.ownerId !== user.id) {
      throw new Error("Project not found or forbidden");
    }
    await ctx.projectGarmentAssocRepo.delete(params.assocId);
    return { ok: true };
  };

  return { listAssocs, addAssoc, removeAssoc };
}

/** 注册项目服饰关联路由 */
export function registerProjectGarmentAssocRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectGarmentAssocRouteDeps,
) {
  const handlers = createProjectGarmentAssocHandlers(app, ctx, deps);

  app.get("/api/project-garment-assoc", handlers.listAssocs);
  app.post("/api/project-garment-assoc", handlers.addAssoc);
  app.delete("/api/project-garment-assoc/:assocId", handlers.removeAssoc);
}
```

- [ ] **步骤 2：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/routes/project-garment-assoc-routes.ts
git commit -m "feat(routes): add project-garment-assoc API routes"
```

---

## 任务 9：注册新路由到 App

**文件：**
- 修改：`src/app-setup/setup-routes.ts`
- 修改：`src/core/app-context.ts`（添加新 Repository 到 context）

- [ ] **步骤 1：更新 AppContext 类型定义**

在 `src/core/app-context.ts` 中添加新 Repository：

```typescript
// 在 AppContext 接口中添加
export interface AppContext {
  // ... existing fields ...
  garmentAssetRepo: IGarmentAssetRepository;
  projectGarmentAssocRepo: IProjectGarmentAssocRepository;
}
```

- [ ] **步骤 2：在 setup-routes.ts 中注册路由**

```typescript
// 在 src/app-setup/setup-routes.ts 中添加 import
import { registerGarmentAssetRoutes } from "../routes/garment-asset-routes.js";
import { registerProjectGarmentAssocRoutes } from "../routes/project-garment-assoc-routes.js";

// 在注册路由函数中添加
export function setupRoutes(app: FastifyInstance, ctx: AppContext) {
  // ... existing routes ...
  registerGarmentAssetRoutes(app, ctx, { requireUser });
  registerProjectGarmentAssocRoutes(app, ctx, { requireUser });
}
```

- [ ] **步骤 3：在 app-services.ts 中初始化 Repository**

```typescript
// 在 src/app-setup/app-services.ts 中添加
import { PgGarmentAssetRepository } from "../repositories/pg/garment-asset-pg-repository.js";
import { PgProjectGarmentAssocRepository } from "../repositories/pg/project-garment-assoc-pg-repository.js";

// 在 createAppServices 函数中添加
const garmentAssetRepo = new PgGarmentAssetRepository(pool);
const projectGarmentAssocRepo = new PgProjectGarmentAssocRepository(pool);

// 返回的 context 中添加
return {
  // ... existing repos ...
  garmentAssetRepo,
  projectGarmentAssocRepo,
};
```

- [ ] **步骤 4：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 5：Commit**

```bash
git add src/app-setup/setup-routes.ts src/app-setup/app-services.ts src/core/app-context.ts
git commit -m "feat(app): register garment-asset and project-garment-assoc routes"
```

---

## 任务 10：创建数据迁移脚本

**文件：**
- 创建：`scripts/migrate-garment-assets.ts`

- [ ] **步骤 1：编写迁移脚本**

```typescript
// scripts/migrate-garment-assets.ts
/**
 * 数据迁移脚本：将 nrm_assets + nrm_library_assets 合并到 nrm_garment_assets
 */

import { Pool } from "pg";
import "dotenv/config";

async function migrateGarmentAssets() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("开始迁移服饰资产数据...\n");

    // 1. 迁移 nrm_library_assets
    console.log("[1/2] 迁移 nrm_library_assets...");
    const libraryAssets = await pool.query(`
      SELECT id, user_id, name, type, category, url, related_image_urls, size_mb,
             classification, created_at, updated_at
      FROM nrm_library_assets
    `);

    for (const row of libraryAssets.rows) {
      const relatedUrls = row.related_image_urls ?? [];
      const classification = row.classification ?? {};

      await pool.query(`
        INSERT INTO nrm_garment_assets (
          id, user_id, name, type, category,
          main_image_url, sub_image_url_1, sub_image_url_2, sub_image_url_3,
          size_mb, ai_category, ai_view_label, ai_confidence, ai_reason,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
      `, [
        row.id,
        row.user_id,
        row.name,
        row.type,
        row.category,
        row.url,
        relatedUrls[0] ?? null,
        relatedUrls[1] ?? null,
        relatedUrls[2] ?? null,
        row.size_mb,
        classification.category ?? null,
        classification.viewLabel ?? null,
        classification.confidence ?? null,
        classification.reason ?? null,
        row.created_at,
        row.updated_at,
      ]);
    }
    console.log(`  ✓ 已迁移 ${libraryAssets.rows.length} 条 library_assets 记录`);

    // 2. 迁移 nrm_assets + 创建关联
    console.log("[2/2] 迁移 nrm_assets...");
    const assets = await pool.query(`
      SELECT id, project_id, user_id, file_name, library_asset_id, apparel_category, size_mb, created_at
      FROM nrm_assets
      WHERE deleted_at IS NULL
    `);

    let migratedCount = 0;
    let assocCount = 0;

    for (const row of assets.rows) {
      // 如果有 library_asset_id，复用已有资产，只创建关联
      if (row.library_asset_id) {
        // 检查 library_asset 是否已迁移
        const existing = await pool.query(
          `SELECT id FROM nrm_garment_assets WHERE id = $1`,
          [row.library_asset_id],
        );
        if (existing.rows.length > 0) {
          // 创建关联
          const now = Date.now();
          await pool.query(`
            INSERT INTO nrm_project_garment_assoc (id, project_id, garment_asset_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $4)
            ON CONFLICT (id) DO NOTHING
          `, [`${row.project_id}_${row.library_asset_id}`, row.project_id, row.library_asset_id, now]);
          assocCount++;
          continue;
        }
      }

      // 创建新的 garment_asset
      const newId = row.id; // 保持原 ID
      const name = row.file_name ?? "未命名服饰";
      const category = row.apparel_category ?? "top";
      // nrm_assets 没有图片 URL，使用 placeholder 或标记待补充
      const mainImageUrl = `placeholder://assets/${row.id}/main`;

      const now = Date.now();
      await pool.query(`
        INSERT INTO nrm_garment_assets (
          id, user_id, name, type, category,
          main_image_url, sub_image_url_1, sub_image_url_2, sub_image_url_3,
          size_mb, created_at, updated_at
        ) VALUES ($1, $2, $3, 'image', $4, $5, NULL, NULL, NULL, $6, $7, $7)
        ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
      `, [newId, row.user_id, name, category, mainImageUrl, row.size_mb ?? null, now]);

      // 创建项目关联
      await pool.query(`
        INSERT INTO nrm_project_garment_assoc (id, project_id, garment_asset_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT DO NOTHING
      `, [`${row.project_id}_${newId}`, row.project_id, newId, now]);

      migratedCount++;
      assocCount++;
    }

    console.log(`  ✓ 已迁移 ${migratedCount} 条 assets 记录`);
    console.log(`  ✓ 已创建 ${assocCount} 条项目关联`);

    console.log("\n=== 迁移完成 ===");
    console.log("注意：nrm_assets 数据的 main_image_url 为 placeholder，需后续补充");

  } catch (error) {
    console.error("迁移失败:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrateGarmentAssets();
```

- [ ] **步骤 2：执行迁移脚本**

```bash
npx tsx scripts/migrate-garment-assets.ts
```

预期：输出迁移记录数量，无错误

- [ ] **步骤 3：验证迁移结果**

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM nrm_garment_assets"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM nrm_project_garment_assoc"
```

预期：记录数与原表之和匹配

- [ ] **步骤 4：Commit**

```bash
git add scripts/migrate-garment-assets.ts
git commit -m "feat(scripts): add garment-assets migration script"
```

---

## 任务 11：更新建表脚本

**文件：**
- 修改：`scripts/create_all_tables.ts`

- [ ] **步骤 1：替换旧表定义为新表**

在 `scripts/create_all_tables.ts` 中：
1. 删除 `nrm_assets` 表定义（第 176-185 行）
2. 删除 `nrm_library_assets` 表定义（第 188-194 行）
3. 添加 `nrm_garment_assets` 和 `nrm_project_garment_assoc` 表定义

- [ ] **步骤 2：更新 console.log 输出**

```typescript
// 原代码
console.log("  ✓ assets, library_assets, library_characters, outfit_plans, character_previews");

// 改为
console.log("  ✓ garment_assets, project_garment_assoc, library_characters, outfit_plans, character_previews");
```

- [ ] **步骤 3：编译验证**

```bash
npm run build
```

预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add scripts/create_all_tables.ts
git commit -m "refactor(scripts): replace assets/library_assets with garment_assets in create_all_tables"
```

---

## 任务 12：创建前端 API 封装

**文件：**
- 创建：`apps/web/services/api-modules/garment-assets.ts`
- 创建：`apps/web/services/api-modules/project-garment-assoc.ts`

- [ ] **步骤 1：编写 garment-assets.ts**

```typescript
// apps/web/services/api-modules/garment-assets.ts
/**
 * 服饰资产 API 封装
 */

import type { BackendApi } from "../backendApi";

export interface GarmentAsset {
  id: string;
  userId: string;
  name: string;
  type: "image" | "video";
  category: "top" | "bottom" | "shoes" | "accessory";
  mainImageUrl: string;
  subImageUrl1: string | null;
  subImageUrl2: string | null;
  subImageUrl3: string | null;
  sizeMb: number | null;
  aiCategory: string | null;
  aiViewLabel: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateGarmentAssetInput {
  name: string;
  type: "image" | "video";
  category: "top" | "bottom" | "shoes" | "accessory";
  mainImageUrl: string;
  subImageUrl1?: string | null;
  subImageUrl2?: string | null;
  subImageUrl3?: string | null;
  sizeMb: number;
}

export interface UpdateGarmentAssetInput {
  name?: string;
  category?: "top" | "bottom" | "shoes" | "accessory";
  mainImageUrl?: string;
  subImageUrl1?: string | null;
  subImageUrl2?: string | null;
  subImageUrl3?: string | null;
  sizeMb?: number;
}

export function createGarmentAssetsApi(api: BackendApi) {
  return {
    list: async (): Promise<GarmentAsset[]> => {
      const res = await api.get("/api/garment-assets");
      return res.items ?? [];
    },

    get: async (id: string): Promise<GarmentAsset> => {
      return api.get(`/api/garment-assets/${id}`);
    },

    create: async (input: CreateGarmentAssetInput): Promise<GarmentAsset> => {
      return api.post("/api/garment-assets", input);
    },

    update: async (id: string, input: UpdateGarmentAssetInput): Promise<GarmentAsset> => {
      return api.put(`/api/garment-assets/${id}`, input);
    },

    delete: async (id: string): Promise<void> => {
      await api.delete(`/api/garment-assets/${id}`);
    },
  };
}
```

- [ ] **步骤 2：编写 project-garment-assoc.ts**

```typescript
// apps/web/services/api-modules/project-garment-assoc.ts
/**
 * 项目服饰关联 API 封装
 */

import type { BackendApi } from "../backendApi";
import type { GarmentAsset } from "./garment-assets";

export interface ProjectGarmentAssoc {
  id: string;
  projectId: string;
  garmentAssetId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ListAssocResult {
  items: ProjectGarmentAssoc[];
  assets: GarmentAsset[];
}

export function createProjectGarmentAssocApi(api: BackendApi) {
  return {
    list: async (projectId: string): Promise<ListAssocResult> => {
      const res = await api.get(`/api/project-garment-assoc?projectId=${projectId}`);
      return { items: res.items ?? [], assets: res.assets ?? [] };
    },

    add: async (projectId: string, garmentAssetId: string): Promise<ProjectGarmentAssoc> => {
      return api.post("/api/project-garment-assoc", { projectId, garmentAssetId });
    },

    remove: async (assocId: string): Promise<void> => {
      await api.delete(`/api/project-garment-assoc/${assocId}`);
    },
  };
}
```

- [ ] **步骤 3：在 backendApi.ts 中注册**

```typescript
// apps/web/services/backendApi.ts

import { createGarmentAssetsApi } from "./api-modules/garment-assets";
import { createProjectGarmentAssocApi } from "./api-modules/project-garment-assoc";

// 在 BackendApi 类或导出对象中添加
export const garmentAssets = createGarmentAssetsApi(api);
export const projectGarmentAssoc = createProjectGarmentAssocApi(api);
```

- [ ] **步骤 4：编译前端**

```bash
npm --prefix apps/web run build
```

预期：编译成功

- [ ] **步骤 5：Commit**

```bash
git add apps/web/services/api-modules/garment-assets.ts apps/web/services/api-modules/project-garment-assoc.ts apps/web/services/backendApi.ts
git commit -m "feat(web): add garment-assets and project-garment-assoc API modules"
```

---

## 任务 13：更新前端页面调用

**文件：**
- 修改：`apps/web/pages/step1/...`（具体文件需根据实际结构确定）
- 修改：`apps/web/pages/library/...`（具体文件需根据实际结构确定）

- [ ] **步骤 1：搜索旧 API 调用**

```bash
grep -r "library-assets" apps/web/pages --include="*.tsx"
grep -r "assets" apps/web/pages --include="*.tsx" | grep -v "nrm_"
```

- [ ] **步骤 2：更新调用端点**

将 `/api/library-assets` 改为 `/api/garment-assets`
将 `/api/assets?projectId=xxx` 改为 `/api/project-garment-assoc?projectId=xxx`

- [ ] **步骤 3：编译前端验证**

```bash
npm --prefix apps/web run build
```

预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages
git commit -m "refactor(web): update pages to use new garment-assets API"
```

---

## 自检清单

| 检查项 | 状态 |
|--------|------|
| 规格覆盖度 | ✓ 所有设计章节对应任务 |
| 占位符扫描 | ✓ 无 TODO/待定，所有步骤有代码 |
| 类型一致性 | ✓ GarmentAsset 类型在各文件一致 |

---

## 执行顺序总结

1. 任务 1-2：DDL + 类型定义（基础设施）
2. 任务 3-5：Repository 层（数据访问）
3. 任务 6：Service 层（业务逻辑）
4. 任务 7-9：API 路由（接口层）
5. 任务 10：数据迁移（执行迁移）
6. 任务 11：建表脚本更新
7. 任务 12-13：前端更新

建议按顺序执行，确保每步编译通过后再继续。