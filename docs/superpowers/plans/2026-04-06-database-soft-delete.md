# 数据库伪删除实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 21 个数据库表添加伪删除机制，支持数据恢复和审计追溯

**架构：** 创建 `PgSoftDeletableRepository` 基类继承 `PgBaseRepository`，改造 21 个 Repository 继承此基类；新增 `deleted_at` 和 `deleted_by` 字段；创建清理服务和定时任务；提供管理员 API 和前端界面

**技术栈：** TypeScript, PostgreSQL, Fastify, React

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/repositories/pg/soft-deletable-repository.ts` | 伪删除 Repository 基类 |
| `src/modules/deleted-data-cleanup-service.ts` | 清理服务 |
| `src/scheduler/index.ts` | 定时任务调度入口 |
| `src/scheduler/deleted-data-cleanup-scheduler.ts` | 伪删除清理定时任务 |
| `src/routes/admin-deleted-data-routes.ts` | 管理员伪删除数据 API 路由 |
| `src/routes/admin-deleted-data-handlers.ts` | 管理员伪删除数据 API 处理函数 |
| `apps/web/pages/admin/deleted-data.tsx` | 前端管理员界面 |
| `scripts/migrations/add_soft_delete_fields.ts` | 数据库迁移脚本 |
| `tests/unit/soft-deletable-repository.test.ts` | 单元测试 |
| `tests/integration/soft-delete-flow.test.ts` | 集成测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/repositories/pg/project-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/asset-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/user-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/library-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/provider-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/credit-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/video-job-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/character-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/script-storyboard-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/system-pg-repository.ts` | 继承 `PgSoftDeletableRepository` |
| `src/repositories/pg/index.ts` | 导出新基类 |
| `src/app.ts` | 注册管理员路由和调度器 |
| `src/contracts/types.ts` | 新增 `SoftDeletable` 接口 |

---

## 任务分解

---

### 任务 1：创建 SoftDeletable 接口和基类

**文件：**
- 创建：`src/repositories/pg/soft-deletable-repository.ts`
- 修改：`src/contracts/types.ts`
- 修改：`src/repositories/pg/index.ts`

- [ ] **步骤 1：定义 SoftDeletable 接口**

在 `src/contracts/types.ts` 添加：

```typescript
/** 伪删除实体接口 */
export interface SoftDeletable {
  deletedAt?: number | null;
  deletedBy?: string | null;
}
```

- [ ] **步骤 2：创建 PgSoftDeletableRepository 基类**

创建 `src/repositories/pg/soft-deletable-repository.ts`：

```typescript
/**
 * PostgreSQL 伪删除仓库基类
 * 继承 PgBaseRepository，添加伪删除能力
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository } from "./base-pg-repository.js";
import type { SoftDeletable } from "../../contracts/types.js";

/** 查询选项 */
export interface SoftDeleteQueryOptions {
  includeDeleted?: boolean;
}

/** 伪删除 Repository 基类 */
export abstract class PgSoftDeletableRepository<T extends SoftDeletable> extends PgBaseRepository<T> {
  constructor(
    protected override readonly pool: Pool,
    protected override readonly tableName: string,
    protected override readonly client?: PoolClient,
  ) {
    super(pool, tableName, client);
  }

  /** 伪删除：设置 deleted_at 和 deleted_by */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET deleted_at = $2, deleted_by = $3 WHERE id = $1`,
      [id, Date.now(), deletedBy],
    );
  }

  /** 恢复：清除 deleted_at 和 deleted_by */
  async restore(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET deleted_at = NULL, deleted_by = NULL WHERE id = $1`,
      [id],
    );
  }

  /** 物理删除：真正删除数据 */
  async hardDelete(id: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
  }

  /** 根据 ID 查找（默认过滤已删除） */
  override async findById(id: string, options?: SoftDeleteQueryOptions): Promise<T | null> {
    const includeDeleted = options?.includeDeleted ?? false;
    const sql = includeDeleted
      ? `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`
      : `SELECT * FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`;
    const result = await this.queryClient.query(sql, [id]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 查找所有记录（默认过滤已删除） */
  override async list(options?: SoftDeleteQueryOptions): Promise<T[]> {
    const includeDeleted = options?.includeDeleted ?? false;
    const sql = includeDeleted
      ? `SELECT * FROM ${this.tableName}`
      : `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL`;
    const result = await this.queryClient.query(sql);
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查找已删除记录（用于清理任务） */
  async listDeleted(retentionDays?: number): Promise<T[]> {
    const threshold = retentionDays
      ? Date.now() - retentionDays * 24 * 60 * 60 * 1000
      : 0;
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
      [threshold],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据条件查找（自动过滤已删除） */
  protected override async findWhere(
    conditions: Record<string, unknown>,
    options?: SoftDeleteQueryOptions,
  ): Promise<T[]> {
    const keys = Object.keys(conditions);
    const includeDeleted = options?.includeDeleted ?? false;
    
    // 空条件时直接返回全部（已过滤）
    if (keys.length === 0) {
      return this.list(options);
    }
    
    const whereClause = keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ");
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause} ${deletedFilter}`,
      Object.values(conditions),
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查找单个记录（自动过滤已删除） */
  protected override async findOneWhere(
    conditions: Record<string, unknown>,
    options?: SoftDeleteQueryOptions,
  ): Promise<T | null> {
    const results = await this.findWhere(conditions, options);
    return results[0] ?? null;
  }

  /** 统计已删除记录数量 */
  async countDeleted(retentionDays?: number): Promise<number> {
    const threshold = retentionDays
      ? Date.now() - retentionDays * 24 * 60 * 60 * 1000
      : 0;
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
      [threshold],
    );
    return (result.rows[0]?.count as number) ?? 0;
  }
}
```

- [ ] **步骤 3：导出新基类**

在 `src/repositories/pg/index.ts` 添加导出：

```typescript
export { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
export type { SoftDeleteQueryOptions } from "./soft-deletable-repository.js";
```

- [ ] **步骤 4：Commit**

```bash
git add src/contracts/types.ts src/repositories/pg/soft-deletable-repository.ts src/repositories/pg/index.ts
git commit -m "feat: 添加 PgSoftDeletableRepository 伪删除基类"
```

---

### 任务 2：创建数据库迁移脚本

**文件：**
- 创建：`scripts/migrations/add_soft_delete_fields.ts`

- [ ] **步骤 1：创建迁移脚本**

创建 `scripts/migrations/add_soft_delete_fields.ts`：

```typescript
/**
 * 数据库迁移：为 21 个表添加伪删除字段
 * 
 * 运行方式：npm run migrate:soft-delete
 * 或直接：tsx scripts/migrations/add_soft_delete_fields.ts
 */

import { Pool } from "pg";
import { config } from "../src/core/config.js";

/** 需要添加伪删除字段的表 */
const SOFT_DELETE_TABLES = [
  // 核心业务数据（9 表）
  "projects",
  "project_workflow_states",
  "assets",
  "outfit_plans",
  "character_previews",
  "script_data",
  "storyboard_frames",
  "library_characters",
  "library_scripts",
  // 审计追溯需要（7 表）
  "users",
  "credits",
  "sessions",
  "review_requests",
  "video_jobs",
  "fission_videos",
  "fission_results",
  // 系统配置（5 表）
  "providers",
  "provider_secrets",
  "provider_policies",
  "video_musics",
  "square_templates",
];

/** 表名转换：添加 nrm_ 前缀 */
function t(name: string): string {
  return `nrm_${name}`;
}

async function main(): Promise<void> {
  console.log("开始伪删除字段迁移...");
  
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
  });

  try {
    for (const table of SOFT_DELETE_TABLES) {
      console.log(`处理表: ${t(table)}`);
      
      // 添加 deleted_at 字段
      await pool.query(`
        ALTER TABLE ${t(table)} 
        ADD COLUMN IF NOT EXISTS deleted_at BIGINT NULL
      `);
      
      // 添加 deleted_by 字段
      await pool.query(`
        ALTER TABLE ${t(table)} 
        ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL
      `);
      
      // 添加部分索引（仅索引已删除记录）
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_${t(table)}_deleted_at 
        ON ${t(table)}(deleted_at) 
        WHERE deleted_at IS NOT NULL
      `);
      
      console.log(`  ✓ ${t(table)} 字段和索引已添加`);
    }
    
    console.log(`\n迁移完成！共处理 ${SOFT_DELETE_TABLES.length} 个表`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("迁移失败:", err);
  process.exit(1);
});
```

- [ ] **步骤 2：添加迁移脚本命令**

在 `package.json` scripts 中添加：

```json
{
  "scripts": {
    "migrate:soft-delete": "tsx scripts/migrations/add_soft_delete_fields.ts"
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add scripts/migrations/add_soft_delete_fields.ts package.json
git commit -m "feat: 添加伪删除字段迁移脚本"
```

---

### 任务 3：改造核心业务 Repository（第一批）

**文件：**
- 修改：`src/repositories/pg/project-pg-repository.ts`
- 修改：`src/repositories/pg/asset-pg-repository.ts`
- 修改：`src/repositories/pg/character-pg-repository.ts`
- 修改：`src/contracts/types.ts`（添加 SoftDeletable 到类型）

- [ ] **步骤 1：更新 Project 类型**

在 `src/contracts/types.ts` 的 `Project` 接口添加：

```typescript
export interface Project extends SoftDeletable {
  // ... 现有字段
  deletedAt?: number | null;
  deletedBy?: string | null;
}
```

- [ ] **步骤 2：改造 PgProjectRepository**

修改 `src/repositories/pg/project-pg-repository.ts`：

```typescript
// 改造导入
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";
import type { SoftDeletable } from "../../contracts/types.js";

// 改造类声明
export class PgProjectRepository extends PgSoftDeletableRepository<Project> implements IProjectRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("projects"), client);
  }

  // mapRow 添加 deleted_at 和 deleted_by 映射
  protected override mapRow(row: Record<string, unknown>): Project {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  // mapEntity 添加 deleted_at 和 deleted_by 映射
  protected override mapEntity(p: Project): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  // findByUserId 使用 findWhere（自动过滤已删除）
  async findByUserId(userId: string): Promise<Project[]> {
    return this.findWhere({ user_id: userId });
  }
}
```

- [ ] **步骤 3：改造 PgAssetRepository**

修改 `src/repositories/pg/asset-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgAssetRepository extends PgSoftDeletableRepository<UploadAsset> implements IAssetRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("assets"), client);
  }

  protected override mapRow(row: Record<string, unknown>): UploadAsset {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(a: UploadAsset): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: a.deletedAt ?? null,
      deleted_by: a.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<UploadAsset[]> {
    return this.findWhere({ project_id: projectId });
  }
}

export class PgOutfitPlanRepository extends PgSoftDeletableRepository<OutfitPlan> implements IOutfitPlanRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("outfit_plans"), client);
  }

  protected override mapRow(row: Record<string, unknown>): OutfitPlan {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(p: OutfitPlan): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<OutfitPlan[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND deleted_at IS NULL ORDER BY index`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}
```

- [ ] **步骤 4：改造 PgCharacterPreviewRepository**

修改 `src/repositories/pg/character-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgCharacterPreviewRepository extends PgSoftDeletableRepository<CharacterPreview> implements ICharacterPreviewRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("character_previews"), client);
  }

  protected override mapRow(row: Record<string, unknown>): CharacterPreview {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(c: CharacterPreview): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: c.deletedAt ?? null,
      deleted_by: c.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<CharacterPreview[]> {
    return this.findWhere({ project_id: projectId });
  }
}
```

- [ ] **步骤 5：Commit**

```bash
git add src/repositories/pg/project-pg-repository.ts src/repositories/pg/asset-pg-repository.ts src/repositories/pg/character-pg-repository.ts src/contracts/types.ts
git commit -m "feat: 改造核心业务 Repository 支持伪删除（第一批）"
```

---

### 任务 4：改造核心业务 Repository（第二批）

**文件：**
- 修改：`src/repositories/pg/script-storyboard-pg-repository.ts`
- 修改：`src/repositories/pg/library-pg-repository.ts`

- [ ] **步骤 1：改造 PgStoryboardFrameRepository**

修改 `src/repositories/pg/script-storyboard-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgStoryboardFrameRepository extends PgSoftDeletableRepository<StoryboardFrame> implements IStoryboardFrameRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("storyboard_frames"), client);
  }

  protected override mapRow(row: Record<string, unknown>): StoryboardFrame {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(f: StoryboardFrame): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: f.deletedAt ?? null,
      deleted_by: f.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<StoryboardFrame[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND deleted_at IS NULL ORDER BY frame_index`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}
```

- [ ] **步骤 2：改造 Library Repositories**

修改 `src/repositories/pg/library-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgLibraryCharacterRepository extends PgSoftDeletableRepository<LibraryCharacter> implements ILibraryCharacterRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("library_characters"), client);
  }

  protected override mapRow(row: Record<string, unknown>): LibraryCharacter {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(c: LibraryCharacter): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: c.deletedAt ?? null,
      deleted_by: c.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<LibraryCharacter[]> {
    return this.findWhere({ user_id: userId });
  }
}

export class PgLibraryScriptRepository extends PgSoftDeletableRepository<LibraryScript> implements ILibraryScriptRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("library_scripts"), client);
  }

  protected override mapRow(row: Record<string, unknown>): LibraryScript {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(s: LibraryScript): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: s.deletedAt ?? null,
      deleted_by: s.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<LibraryScript[]> {
    return this.findWhere({ user_id: userId });
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/repositories/pg/script-storyboard-pg-repository.ts src/repositories/pg/library-pg-repository.ts
git commit -m "feat: 改造核心业务 Repository 支持伪删除（第二批）"
```

---

### 任务 5：改造审计追溯 Repository

**文件：**
- 修改：`src/repositories/pg/user-pg-repository.ts`
- 修改：`src/repositories/pg/credit-pg-repository.ts`
- 修改：`src/repositories/pg/video-job-pg-repository.ts`

- [ ] **步骤 1：改造 PgUserRepository**

修改 `src/repositories/pg/user-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgUserRepository extends PgSoftDeletableRepository<User> implements IUserRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("users"), client);
  }

  protected override mapRow(row: Record<string, unknown>): User {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(u: User): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: u.deletedAt ?? null,
      deleted_by: u.deletedBy ?? null,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere({ email: email.toLowerCase() });
  }
}

// PgSessionRepository 不继承 PgBaseRepository，需要单独实现伪删除
export class PgSessionRepository implements ISessionRepository {
  private readonly table = nrm("sessions");

  // ... 现有代码保持不变，sessions 表使用物理删除
}
```

- [ ] **步骤 2：改造 PgCreditRepository**

修改 `src/repositories/pg/credit-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgCreditRepository extends PgSoftDeletableRepository<CreditAccount> implements ICreditRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("credits"), client);
  }

  protected mapRow(row: Record<string, unknown>): CreditAccount {
    return {
      userId: row.user_id as string,
      balance: row.balance as number,
      expiresAt: row.expires_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(a: CreditAccount): Record<string, unknown> {
    return {
      user_id: a.userId,
      balance: a.balance,
      expires_at: a.expiresAt,
      deleted_at: a.deletedAt ?? null,
      deleted_by: a.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<CreditAccount | null> {
    return this.findOneWhere({ user_id: userId });
  }
}
```

- [ ] **步骤 3：改造 PgVideoJobRepository**

修改 `src/repositories/pg/video-job-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgVideoJobRepository extends PgSoftDeletableRepository<VideoJob> implements IVideoJobRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("video_jobs"), client);
  }

  protected override mapRow(row: Record<string, unknown>): VideoJob {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(j: VideoJob): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: j.deletedAt ?? null,
      deleted_by: j.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<VideoJob[]> {
    return this.findWhere({ project_id: projectId });
  }

  async findRunningByUserId(userId: string): Promise<VideoJob[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND status = 'running' AND deleted_at IS NULL`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

export class PgFissionResultRepository extends PgSoftDeletableRepository<FissionResult> implements IFissionResultRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("fission_results"), client);
  }

  protected override mapRow(row: Record<string, unknown>): FissionResult {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(f: FissionResult): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: f.deletedAt ?? null,
      deleted_by: f.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<FissionResult[]> {
    return this.findWhere({ project_id: projectId });
  }
}
```

- [ ] **步骤 4：Commit**

```bash
git add src/repositories/pg/user-pg-repository.ts src/repositories/pg/credit-pg-repository.ts src/repositories/pg/video-job-pg-repository.ts
git commit -m "feat: 改造审计追溯 Repository 支持伪删除"
```

---

### 任务 6：改造系统配置 Repository

**文件：**
- 修改：`src/repositories/pg/provider-pg-repository.ts`
- 修改：`src/repositories/pg/system-pg-repository.ts`

- [ ] **步骤 1：改造 Provider Repositories**

修改 `src/repositories/pg/provider-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgProviderRepository extends PgSoftDeletableRepository<Provider> implements IProviderRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("providers"), client);
  }

  protected override mapRow(row: Record<string, unknown>): Provider {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(p: Provider): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.findWhere({ vendor });
  }

  override async list(): Promise<Provider[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY name`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

export class PgProviderSecretRepository extends PgSoftDeletableRepository<ProviderSecret> implements IProviderSecretRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("provider_secrets"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProviderSecret {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(s: ProviderSecret): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: s.deletedAt ?? null,
      deleted_by: s.deletedBy ?? null,
    };
  }

  async findByProviderId(providerId: string): Promise<ProviderSecret | null> {
    return this.findOneWhere({ provider_id: providerId });
  }
}

export class PgProviderPolicyRepository extends PgSoftDeletableRepository<ProviderRoutingPolicy> implements IProviderPolicyRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("provider_policies"), client);
  }

  protected override mapRow(row: Record<string, unknown>): ProviderRoutingPolicy {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(p: ProviderRoutingPolicy): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByRouteKey(routeKey: string): Promise<ProviderRoutingPolicy[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE route_key = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [routeKey],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  override async list(): Promise<ProviderRoutingPolicy[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY route_key, updated_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}
```

- [ ] **步骤 2：改造 VideoMusicRepository**

修改 `src/repositories/pg/system-pg-repository.ts`：

```typescript
import { PgSoftDeletableRepository, nrm } from "./soft-deletable-repository.js";

export class PgVideoMusicRepository extends PgSoftDeletableRepository<VideoMusic> implements IVideoMusicRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("video_musics"), client);
  }

  protected override mapRow(row: Record<string, unknown>): VideoMusic {
    return {
      // ... 现有映射
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected override mapEntity(m: VideoMusic): Record<string, unknown> {
    return {
      // ... 现有映射
      deleted_at: m.deletedAt ?? null,
      deleted_by: m.deletedBy ?? null,
    };
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/repositories/pg/provider-pg-repository.ts src/repositories/pg/system-pg-repository.ts
git commit -m "feat: 改造系统配置 Repository 支持伪删除"
```

---

### 任务 7：创建清理服务

**文件：**
- 创建：`src/modules/deleted-data-cleanup-service.ts`

- [ ] **步骤 1：创建清理服务**

创建 `src/modules/deleted-data-cleanup-service.ts`：

```typescript
/**
 * 伪删除数据清理服务
 * 
 * 功能：
 * 1. 定时清理：每天凌晨执行，清理超过保留期限的伪删除数据
 * 2. 手动清理：管理员指定表和期限清理
 */

import type { Pool } from "pg";
import { PgSoftDeletableRepository } from "../repositories/pg/soft-deletable-repository.js";

/** 清理结果 */
export interface CleanupResult {
  tables: Record<string, number>;
  totalDeleted: number;
  lastRunAt: number;
}

/** 清理任务状态 */
export interface CleanupStatus {
  lastRunAt: number | null;
  nextRunAt: number;
  retentionDays: number;
  enabled: boolean;
}

/** 支持伪删除的表名映射 */
const SOFT_DELETE_TABLES = [
  "projects",
  "assets",
  "outfit_plans",
  "character_previews",
  "storyboard_frames",
  "library_characters",
  "library_scripts",
  "users",
  "credits",
  "video_jobs",
  "fission_results",
  "providers",
  "provider_secrets",
  "provider_policies",
  "video_musics",
] as const;

export type SoftDeleteTableName = typeof SOFT_DELETE_TABLES[number];

export class DeletedDataCleanupService {
  private readonly RETENTION_DAYS = 60;
  private lastRunAt: number | null = null;
  private enabled = true;

  constructor(
    private readonly pool: Pool,
    private readonly repos: Map<string, PgSoftDeletableRepository<{ id: string; deletedAt?: number | null; deletedBy?: string | null }>>,
  ) {}

  /** 获取清理任务状态 */
  getStatus(): CleanupStatus {
    const now = Date.now();
    const nextRunAt = this.lastRunAt
      ? this.lastRunAt + 24 * 60 * 60 * 1000 // 下一天凌晨
      : now;
    
    return {
      lastRunAt: this.lastRunAt,
      nextRunAt,
      retentionDays: this.RETENTION_DAYS,
      enabled: this.enabled,
    };
  }

  /** 启用/禁用定时清理 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** 定时清理任务 */
  async runScheduledCleanup(): Promise<CleanupResult> {
    if (!this.enabled) {
      return { tables: {}, totalDeleted: 0, lastRunAt: Date.now() };
    }

    const result: CleanupResult = {
      tables: {},
      totalDeleted: 0,
      lastRunAt: Date.now(),
    };

    for (const [tableName, repo] of this.repos.entries()) {
      try {
        const deletedRecords = await repo.listDeleted(this.RETENTION_DAYS);
        for (const record of deletedRecords) {
          await repo.hardDelete(record.id);
          result.totalDeleted++;
        }
        result.tables[tableName] = deletedRecords.length;
      } catch (err) {
        console.error(`清理表 ${tableName} 失败:`, err);
        result.tables[tableName] = 0;
      }
    }

    this.lastRunAt = result.lastRunAt;
    console.log(`[Cleanup] 清理完成，共删除 ${result.totalDeleted} 条记录`);
    
    return result;
  }

  /** 手动清理指定表 */
  async manualCleanup(
    tableName: SoftDeleteTableName,
    customRetentionDays?: number,
  ): Promise<number> {
    const repo = this.repos.get(tableName);
    if (!repo) {
      throw new Error(`表 ${tableName} 不支持伪删除`);
    }

    const days = customRetentionDays ?? this.RETENTION_DAYS;
    const deletedRecords = await repo.listDeleted(days);
    
    for (const record of deletedRecords) {
      await repo.hardDelete(record.id);
    }

    console.log(`[ManualCleanup] 表 ${tableName} 删除 ${deletedRecords.length} 条记录`);
    return deletedRecords.length;
  }

  /** 手动清理所有表 */
  async manualCleanupAll(customRetentionDays?: number): Promise<CleanupResult> {
    const result: CleanupResult = {
      tables: {},
      totalDeleted: 0,
      lastRunAt: Date.now(),
    };

    for (const [tableName, repo] of this.repos.entries()) {
      const count = await this.manualCleanup(tableName as SoftDeleteTableName, customRetentionDays);
      result.tables[tableName] = count;
      result.totalDeleted += count;
    }

    return result;
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/deleted-data-cleanup-service.ts
git commit -m "feat: 创建伪删除数据清理服务"
```

---

### 任务 8：创建定时调度模块

**文件：**
- 创建：`src/scheduler/index.ts`
- 创建：`src/scheduler/deleted-data-cleanup-scheduler.ts`

- [ ] **步骤 1：创建定时调度模块**

创建 `src/scheduler/deleted-data-cleanup-scheduler.ts`：

```typescript
/**
 * 伪删除清理定时任务调度
 * 
 * 每天凌晨 3 点执行清理任务
 */

import type { DeletedDataCleanupService } from "../modules/deleted-data-cleanup-service.js";

let schedulerInstance: DeletedDataCleanupScheduler | null = null;

export class DeletedDataCleanupScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly scheduleHour = 3; // 凌晨 3 点

  constructor(private readonly cleanupService: DeletedDataCleanupService) {}

  /** 启动定时任务 */
  start(): void {
    if (this.intervalId) {
      console.warn("[Scheduler] 清理任务已在运行");
      return;
    }

    // 计算下次执行时间
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(this.scheduleHour, 0, 0, 0);
    
    // 如果当前已过今天 3 点，设置为明天 3 点
    if (now.getHours() >= this.scheduleHour) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayMs = nextRun.getTime() - now.getTime();
    
    console.log(`[Scheduler] 清理任务将在 ${nextRun.toISOString()} 执行`);

    // 首次执行延迟
    setTimeout(() => {
      this.runCleanup();
      
      // 之后每 24 小时执行一次
      this.intervalId = setInterval(() => {
        this.runCleanup();
      }, 24 * 60 * 60 * 1000);
    }, delayMs);
  }

  /** 停止定时任务 */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Scheduler] 清理任务已停止");
    }
  }

  /** 执行清理 */
  private async runCleanup(): Promise<void> {
    console.log("[Scheduler] 开始执行清理任务...");
    try {
      const result = await this.cleanupService.runScheduledCleanup();
      console.log(`[Scheduler] 清理完成: ${result.totalDeleted} 条记录`);
    } catch (err) {
      console.error("[Scheduler] 清理任务失败:", err);
    }
  }

  /** 获取单例 */
  static getInstance(cleanupService: DeletedDataCleanupService): DeletedDataCleanupScheduler {
    if (!schedulerInstance) {
      schedulerInstance = new DeletedDataCleanupScheduler(cleanupService);
    }
    return schedulerInstance;
  }
}
```

- [ ] **步骤 2：创建调度入口**

创建 `src/scheduler/index.ts`：

```typescript
/**
 * 定时任务调度模块入口
 */

export { DeletedDataCleanupScheduler } from "./deleted-data-cleanup-scheduler.js";
```

- [ ] **步骤 3：Commit**

```bash
git add src/scheduler/index.ts src/scheduler/deleted-data-cleanup-scheduler.ts
git commit -m "feat: 创建伪删除清理定时调度模块"
```

---

### 任务 9：创建管理员 API 路由

**文件：**
- 创建：`src/routes/admin-deleted-data-routes.ts`
- 创建：`src/routes/admin-deleted-data-handlers.ts`

- [ ] **步骤 1：创建路由接口定义**

创建 `src/routes/admin-deleted-data-routes.ts`：

```typescript
/**
 * 管理员伪删除数据 API 路由定义
 */

import type { FastifyInstance, RouteHandlerMethod } from "fastify";

export interface AdminDeletedDataRouteHandlers {
  readonly listDeletedData: RouteHandlerMethod;
  readonly getDeletedDataDetail: RouteHandlerMethod;
  readonly restoreDeletedData: RouteHandlerMethod;
  readonly manualCleanup: RouteHandlerMethod;
  readonly getCleanupStatus: RouteHandlerMethod;
  readonly toggleCleanupScheduler: RouteHandlerMethod;
}

export function registerAdminDeletedDataRoutes(
  app: FastifyInstance,
  handlers: AdminDeletedDataRouteHandlers,
): void {
  // 查看伪删除数据列表
  app.get("/admin/deleted-data", handlers.listDeletedData);

  // 查看单条伪删除数据详情
  app.get("/admin/deleted-data/:table/:id", handlers.getDeletedDataDetail);

  // 恢复伪删除数据
  app.post("/admin/deleted-data/:table/:id/restore", handlers.restoreDeletedData);

  // 手动清理伪删除数据
  app.post("/admin/deleted-data/cleanup", handlers.manualCleanup);

  // 查看清理任务状态
  app.get("/admin/deleted-data/cleanup/status", handlers.getCleanupStatus);

  // 启用/禁用定时清理任务
  app.post("/admin/deleted-data/cleanup/toggle", handlers.toggleCleanupScheduler);
}
```

- [ ] **步骤 2：创建路由处理函数**

创建 `src/routes/admin-deleted-data-handlers.ts`：

```typescript
/**
 * 管理员伪删除数据 API 处理函数
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireAdmin } from "../core/auth.js";
import type { DeletedDataCleanupService, CleanupResult, SoftDeleteTableName } from "../modules/deleted-data-cleanup-service.js";
import { PgSoftDeletableRepository } from "../repositories/pg/soft-deletable-repository.js";

/** 请求参数类型 */
interface ListDeletedDataQuery {
  table?: string;
  page?: number;
  limit?: number;
}

interface TableIdParams {
  table: string;
  id: string;
}

interface CleanupBody {
  table?: string;
  retentionDays?: number;
}

interface ToggleBody {
  enabled: boolean;
}

/** 创建处理函数 */
export function createAdminDeletedDataHandlers(
  ctx: AppContext,
  cleanupService: DeletedDataCleanupService,
  repos: Map<string, PgSoftDeletableRepository<{ id: string; deletedAt?: number | null; deletedBy?: string | null }>>,
) {
  return {
    /** 查看伪删除数据列表 */
    listDeletedData: async (request: FastifyRequest<{ Querystring: ListDeletedDataQuery }>, reply: FastifyReply) => {
      const admin = await requireAdmin(ctx, request);
      const { table, page = 1, limit = 20 } = request.query;

      const result: { data: Array<{ table: string; id: string; deletedAt: number; deletedBy: string }>; total: number } = {
        data: [],
        total: 0,
      };

      // 如果指定了表，只查该表
      const tablesToQuery = table ? [table] : Array.from(repos.keys());

      for (const tableName of tablesToQuery) {
        const repo = repos.get(tableName);
        if (!repo) continue;

        const deletedRecords = await repo.list({ includeDeleted: true });
        const filtered = deletedRecords.filter(r => r.deletedAt !== null);
        
        for (const record of filtered) {
          result.data.push({
            table: tableName,
            id: record.id,
            deletedAt: record.deletedAt!,
            deletedBy: record.deletedBy ?? "",
          });
          result.total++;
        }
      }

      // 分页
      const offset = (page - 1) * limit;
      result.data = result.data.slice(offset, offset + limit);

      return reply.send(result);
    },

    /** 查看单条伪删除数据详情 */
    getDeletedDataDetail: async (request: FastifyRequest<{ Params: TableIdParams }>, reply: FastifyReply) => {
      const admin = await requireAdmin(ctx, request);
      const { table, id } = request.params;

      const repo = repos.get(table);
      if (!repo) {
        return reply.code(400).send({ error: `表 ${table} 不支持伪删除` });
      }

      const record = await repo.findById(id, { includeDeleted: true });
      if (!record || !record.deletedAt) {
        return reply.code(404).send({ error: "记录不存在或未删除" });
      }

      return reply.send({
        table,
        record,
        deletedAt: record.deletedAt,
        deletedBy: record.deletedBy,
      });
    },

    /** 恢复伪删除数据 */
    restoreDeletedData: async (request: FastifyRequest<{ Params: TableIdParams }>, reply: FastifyReply) => {
      const admin = await requireAdmin(ctx, request);
      const { table, id } = request.params;

      const repo = repos.get(table);
      if (!repo) {
        return reply.code(400).send({ error: `表 ${table} 不支持伪删除` });
      }

      const record = await repo.findById(id, { includeDeleted: true });
      if (!record || !record.deletedAt) {
        return reply.code(404).send({ error: "记录不存在或未删除" });
      }

      await repo.restore(id);
      
      return reply.send({ success: true, restoredId: id });
    },

    /** 手动清理伪删除数据 */
    manualCleanup: async (request: FastifyRequest<{ Body: CleanupBody }>, reply: FastifyReply) => {
      const admin = await requireAdmin(ctx, request);
      const { table, retentionDays } = request.body;

      let result: CleanupResult;
      
      if (table) {
        const count = await cleanupService.manualCleanup(table as SoftDeleteTableName, retentionDays);
        result = { tables: { [table]: count }, totalDeleted: count, lastRunAt: Date.now() };
      } else {
        result = await cleanupService.manualCleanupAll(retentionDays);
      }

      return reply.send(result);
    },

    /** 查看清理任务状态 */
    getCleanupStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      const admin = await requireAdmin(ctx, request);
      const status = cleanupService.getStatus();
      return reply.send(status);
    },

    /** 启用/禁用定时清理任务 */
    toggleCleanupScheduler: async (request: FastifyRequest<{ Body: ToggleBody }>, reply: FastifyReply) => {
      const admin = await requireAdmin(ctx, request);
      const { enabled } = request.body;
      
      cleanupService.setEnabled(enabled);
      
      return reply.send({ enabled });
    },
  };
}

export type AdminDeletedDataHandlers = ReturnType<typeof createAdminDeletedDataHandlers>;
```

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin-deleted-data-routes.ts src/routes/admin-deleted-data-handlers.ts
git commit -m "feat: 创建管理员伪删除数据 API"
```

---

### 任务 10：注册路由和调度器到 app.ts

**文件：**
- 修改：`src/app.ts`

- [ ] **步骤 1：导入新模块**

在 `src/app.ts` 顶部添加导入：

```typescript
import { DeletedDataCleanupService, SoftDeleteTableName } from "./modules/deleted-data-cleanup-service.js";
import { DeletedDataCleanupScheduler } from "./scheduler/deleted-data-cleanup-scheduler.js";
import { registerAdminDeletedDataRoutes } from "./routes/admin-deleted-data-routes.js";
import { createAdminDeletedDataHandlers } from "./routes/admin-deleted-data-handlers.js";
import { PgSoftDeletableRepository } from "./repositories/pg/soft-deletable-repository.js";
```

- [ ] **步骤 2：初始化清理服务**

在 app 初始化逻辑中添加（在 Repository 创建之后）：

```typescript
// 创建伪删除 Repository 映射
const softDeleteRepos = new Map<string, PgSoftDeletableRepository<{ id: string; deletedAt?: number | null; deletedBy?: string | null }>>();

// 注册核心业务 Repository
softDeleteRepos.set("projects", repos.project);
softDeleteRepos.set("assets", repos.asset);
softDeleteRepos.set("outfit_plans", repos.outfitPlan);
softDeleteRepos.set("character_previews", repos.characterPreview);
softDeleteRepos.set("storyboard_frames", repos.storyboardFrame);
softDeleteRepos.set("library_characters", repos.libraryCharacter);
softDeleteRepos.set("library_scripts", repos.libraryScript);

// 注册审计追溯 Repository
softDeleteRepos.set("users", repos.user);
softDeleteRepos.set("credits", repos.credit);
softDeleteRepos.set("video_jobs", repos.videoJob);
softDeleteRepos.set("fission_results", repos.fissionResult);

// 注册系统配置 Repository
softDeleteRepos.set("providers", repos.provider);
softDeleteRepos.set("provider_secrets", repos.providerSecret);
softDeleteRepos.set("provider_policies", repos.providerPolicy);
softDeleteRepos.set("video_musics", repos.videoMusic);

// 创建清理服务
const cleanupService = new DeletedDataCleanupService(pool, softDeleteRepos);

// 创建调度器
const scheduler = DeletedDataCleanupScheduler.getInstance(cleanupService);
scheduler.start();
```

- [ ] **步骤 3：注册管理员路由**

在路由注册部分添加：

```typescript
// 注册管理员伪删除数据路由
const deletedDataHandlers = createAdminDeletedDataHandlers(ctx, cleanupService, softDeleteRepos);
registerAdminDeletedDataRoutes(app, deletedDataHandlers);
```

- [ ] **步骤 4：Commit**

```bash
git add src/app.ts
git commit -m "feat: 注册伪删除清理服务和管理员路由到 app.ts"
```

---

### 任务 11：修改用户删除接口为伪删除

**文件：**
- 修改：`src/routes/project-flow-routes.ts`（或对应处理文件）
- 修改：相关删除处理逻辑

- [ ] **步骤 1：修改项目删除处理**

在项目删除处理函数中，将物理删除改为伪删除：

```typescript
// 改造前（物理删除）
async deleteProject(request) {
  await repos.project.delete(projectId);
  // ...
}

// 改造后（伪删除）
async deleteProject(request) {
  const user = await requireUser(ctx, request);
  const { projectId } = request.params;
  
  // 验证项目归属
  const project = await repos.project.findById(projectId);
  if (!project || project.userId !== user.id) {
    throw new Error("项目不存在或无权限");
  }
  
  // 伪删除项目
  await repos.project.softDelete(projectId, user.id);
  
  return { success: true, message: "项目已删除，如需恢复请联系管理员" };
}
```

- [ ] **步骤 2：修改其他用户删除接口**

类似改造其他用户可触发的删除操作：
- 素材库删除（library_characters、library_scripts）
- 其他用户自有数据删除

- [ ] **步骤 3：Commit**

```bash
git add src/routes/project-flow-routes.ts src/routes/library-routes.ts
git commit -m "feat: 用户删除接口改为伪删除"
```

---

### 任务 12：创建前端管理员界面

**文件：**
- 创建：`apps/web/pages/admin/deleted-data.tsx`

- [ ] **步骤 1：创建管理员页面组件**

创建 `apps/web/pages/admin/deleted-data.tsx`：

```tsx
/**
 * 管理员伪删除数据管理页面
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 类型定义
interface DeletedDataItem {
  table: string;
  id: string;
  deletedAt: number;
  deletedBy: string;
}

interface CleanupStatus {
  lastRunAt: number | null;
  nextRunAt: number;
  retentionDays: number;
  enabled: boolean;
}

// API 服务
const api = {
  listDeletedData: async (params: { table?: string; page: number; limit: number }) => {
    const query = new URLSearchParams({
      page: params.page.toString(),
      limit: params.limit.toString(),
      ...(params.table && { table: params.table }),
    });
    const res = await fetch(`/admin/deleted-data?${query}`);
    return res.json();
  },
  
  restore: async (table: string, id: string) => {
    const res = await fetch(`/admin/deleted-data/${table}/${id}/restore`, { method: 'POST' });
    return res.json();
  },
  
  cleanup: async (params: { table?: string; retentionDays?: number }) => {
    const res = await fetch('/admin/deleted-data/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },
  
  getCleanupStatus: async () => {
    const res = await fetch('/admin/deleted-data/cleanup/status');
    return res.json();
  },
  
  toggleScheduler: async (enabled: boolean) => {
    const res = await fetch('/admin/deleted-data/cleanup/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return res.json();
  },
};

export default function DeletedDataAdminPage() {
  const queryClient = useQueryClient();
  
  // 状态
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [page, setPage] = useState(1);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState(60);
  const [cleanupTable, setCleanupTable] = useState<string>('');
  
  // 查询伪删除数据列表
  const { data: deletedData, isLoading } = useQuery({
    queryKey: ['deletedData', selectedTable, page],
    queryFn: () => api.listDeletedData({ table: selectedTable || undefined, page, limit: 20 }),
  });
  
  // 查询清理状态
  const { data: cleanupStatus } = useQuery({
    queryKey: ['cleanupStatus'],
    queryFn: api.getCleanupStatus,
  });
  
  // 恢复数据
  const restoreMutation = useMutation({
    mutationFn: ({ table, id }: { table: string; id: string }) => api.restore(table, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletedData'] });
    },
  });
  
  // 手动清理
  const cleanupMutation = useMutation({
    mutationFn: api.cleanup,
    onSuccess: (result) => {
      alert(`清理完成，删除 ${result.totalDeleted} 条记录`);
      setShowCleanupModal(false);
      queryClient.invalidateQueries({ queryKey: ['deletedData', 'cleanupStatus'] });
    },
  });
  
  // 切换调度器
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.toggleScheduler(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleanupStatus'] });
    },
  });
  
  // 表名选项
  const tableOptions = [
    'projects', 'assets', 'outfit_plans', 'character_previews',
    'storyboard_frames', 'library_characters', 'library_scripts',
    'users', 'credits', 'video_jobs', 'fission_results',
    'providers', 'provider_secrets', 'provider_policies', 'video_musics',
  ];
  
  // 格式化时间
  const formatTime = (ts: number | null) => {
    if (!ts) return '从未执行';
    return new Date(ts).toLocaleString('zh-CN');
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">伪删除数据管理</h1>
      
      {/* 清理任务状态面板 */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">清理任务状态</h2>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">上次清理：</span>
            <span>{formatTime(cleanupStatus?.lastRunAt)}</span>
          </div>
          <div>
            <span className="text-gray-500">下次清理：</span>
            <span>{formatTime(cleanupStatus?.nextRunAt)}</span>
          </div>
          <div>
            <span className="text-gray-500">保留期限：</span>
            <span>{cleanupStatus?.retentionDays} 天</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">状态：</span>
            <button
              onClick={() => toggleMutation.mutate(!cleanupStatus?.enabled)}
              className={`px-3 py-1 rounded ${cleanupStatus?.enabled ? 'bg-green-500' : 'bg-gray-400'} text-white`}
            >
              {cleanupStatus?.enabled ? '已启用' : '已禁用'}
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowCleanupModal(true)}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          手动清理
        </button>
      </div>
      
      {/* 筛选区域 */}
      <div className="flex gap-4 mb-4">
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">全部表</option>
          {tableOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      
      {/* 数据列表 */}
      {isLoading ? (
        <div>加载中...</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 text-left">表名</th>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">删除时间</th>
              <th className="p-2 text-left">删除者</th>
              <th className="p-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {deletedData?.data?.map((item: DeletedDataItem) => (
              <tr key={`${item.table}-${item.id}`} className="border-b">
                <td className="p-2">{item.table}</td>
                <td className="p-2">{item.id}</td>
                <td className="p-2">{formatTime(item.deletedAt)}</td>
                <td className="p-2">{item.deletedBy}</td>
                <td className="p-2">
                  <button
                    onClick={() => restoreMutation.mutate({ table: item.table, id: item.id })}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    恢复
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      {/* 分页 */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          上一页
        </button>
        <span className="px-4 py-2">第 {page} 页</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={!deletedData?.data?.length}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          下一页
        </button>
      </div>
      
      {/* 手动清理弹窗 */}
      {showCleanupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h2 className="text-lg font-semibold mb-4">手动清理</h2>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">选择清理表</label>
              <select
                value={cleanupTable}
                onChange={(e) => setCleanupTable(e.target.value)}
                className="w-full px-4 py-2 border rounded"
              >
                <option value="">全部表</option>
                {tableOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">保留期限（天）</label>
              <input
                type="number"
                value={cleanupRetentionDays}
                onChange={(e) => setCleanupRetentionDays(parseInt(e.target.value))}
                className="w-full px-4 py-2 border rounded"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => cleanupMutation.mutate({
                  table: cleanupTable || undefined,
                  retentionDays: cleanupRetentionDays,
                })}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                执行清理
              </button>
              <button
                onClick={() => setShowCleanupModal(false)}
                className="px-4 py-2 border rounded"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：添加路由**

在 `apps/web/App.tsx` 或路由配置中添加管理员路由：

```tsx
<Route path="/admin/deleted-data" element={<DeletedDataAdminPage />} />
```

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/admin/deleted-data.tsx apps/web/App.tsx
git commit -m "feat: 创建前端管理员伪删除数据界面"
```

---

### 任务 13：创建单元测试

**文件：**
- 创建：`tests/unit/soft-deletable-repository.test.ts`

- [ ] **步骤 1：创建测试文件**

创建 `tests/unit/soft-deletable-repository.test.ts`：

```typescript
/**
 * PgSoftDeletableRepository 单元测试
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PgSoftDeletableRepository, SoftDeleteQueryOptions } from '../../src/repositories/pg/soft-deletable-repository.js';
import type { SoftDeletable } from '../../src/contracts/types.js';

// 测试实体类型
interface TestEntity extends SoftDeletable {
  id: string;
  name: string;
  deletedAt?: number | null;
  deletedBy?: string | null;
}

// 测试 Repository
class TestRepository extends PgSoftDeletableRepository<TestEntity> {
  constructor(pool: Pool) {
    super(pool, 'test_soft_delete', undefined);
  }

  protected mapRow(row: Record<string, unknown>): TestEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(e: TestEntity): Record<string, unknown> {
    return {
      id: e.id,
      name: e.name,
      deleted_at: e.deletedAt ?? null,
      deleted_by: e.deletedBy ?? null,
    };
  }
}

describe('PgSoftDeletableRepository', () => {
  let pool: Pool;
  let repo: TestRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    repo = new TestRepository(pool);
    
    // 创建测试表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_soft_delete (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        deleted_at BIGINT NULL,
        deleted_by TEXT NULL
      )
    `);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS test_soft_delete');
    await pool.end();
  });

  test('softDelete() 设置 deleted_at 和 deleted_by', async () => {
    // 创建测试数据
    await pool.query('INSERT INTO test_soft_delete (id, name) VALUES ($1, $2)', ['test-1', 'Test 1']);
    
    // 执行伪删除
    await repo.softDelete('test-1', 'user-1');
    
    // 验证
    const result = await pool.query('SELECT * FROM test_soft_delete WHERE id = $1', ['test-1']);
    expect(result.rows[0].deleted_at).not.toBeNull();
    expect(result.rows[0].deleted_by).toBe('user-1');
  });

  test('restore() 清除 deleted_at 和 deleted_by', async () => {
    // 恢复
    await repo.restore('test-1');
    
    // 验证
    const result = await pool.query('SELECT * FROM test_soft_delete WHERE id = $1', ['test-1']);
    expect(result.rows[0].deleted_at).toBeNull();
    expect(result.rows[0].deleted_by).toBeNull();
  });

  test('findById() 默认过滤已删除记录', async () => {
    // 创建并删除
    await pool.query('INSERT INTO test_soft_delete (id, name) VALUES ($1, $2)', ['test-2', 'Test 2']);
    await repo.softDelete('test-2', 'user-1');
    
    // 默认查询应返回 null
    const result = await repo.findById('test-2');
    expect(result).toBeNull();
  });

  test('findById(includeDeleted: true) 返回已删除记录', async () => {
    const result = await repo.findById('test-2', { includeDeleted: true });
    expect(result).not.toBeNull();
    expect(result?.deletedAt).not.toBeNull();
  });

  test('list() 默认只返回未删除记录', async () => {
    // 创建未删除记录
    await pool.query('INSERT INTO test_soft_delete (id, name) VALUES ($1, $2)', ['test-3', 'Test 3']);
    
    const result = await repo.list();
    expect(result.find(r => r.id === 'test-2')).toBeUndefined();
    expect(result.find(r => r.id === 'test-3')).toBeDefined();
  });

  test('listDeleted() 只返回已删除记录', async () => {
    const result = await repo.listDeleted();
    expect(result.find(r => r.id === 'test-2')).toBeDefined();
    expect(result.find(r => r.id === 'test-3')).toBeUndefined();
  });

  test('listDeleted(retentionDays) 只返回超期记录', async () => {
    // 创建 90 天前删除的记录
    const oldDeletedAt = Date.now() - 90 * 24 * 60 * 60 * 1000;
    await pool.query(
      'INSERT INTO test_soft_delete (id, name, deleted_at, deleted_by) VALUES ($1, $2, $3, $4)',
      ['test-4', 'Test 4', oldDeletedAt, 'user-1']
    );
    
    // 查询 60 天超期记录
    const result = await repo.listDeleted(60);
    expect(result.find(r => r.id === 'test-4')).toBeDefined();
    expect(result.find(r => r.id === 'test-2')).toBeUndefined();
  });

  test('hardDelete() 物理删除数据', async () => {
    await repo.hardDelete('test-1');
    
    const result = await pool.query('SELECT * FROM test_soft_delete WHERE id = $1', ['test-1']);
    expect(result.rows.length).toBe(0);
  });

  test('countDeleted() 统计已删除记录数量', async () => {
    const count = await repo.countDeleted(60);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **步骤 2：Commit**

```bash
git add tests/unit/soft-deletable-repository.test.ts
git commit -m "test: 添加 PgSoftDeletableRepository 单元测试"
```

---

### 任务 14：运行数据库迁移

**文件：**
- 无新文件，执行迁移命令

- [ ] **步骤 1：执行迁移脚本**

```bash
npm run migrate:soft-delete
```

预期输出：迁移完成，共处理 21 个表

- [ ] **步骤 2：验证迁移结果**

```sql
-- 检查字段是否添加成功
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'nrm_projects' AND column_name IN ('deleted_at', 'deleted_by');

-- 检查索引是否创建成功
SELECT indexname FROM pg_indexes 
WHERE tablename = 'nrm_projects' AND indexname LIKE '%deleted_at%';
```

---

### 任务 15：编译验证和最终测试

**文件：**
- 无新文件，执行编译和测试命令

- [ ] **步骤 1：编译后端**

```bash
npm run build
```

预期：编译成功，无 TypeScript 错误

- [ ] **步骤 2：编译前端**

```bash
npm run build:ui
```

预期：编译成功

- [ ] **步骤 3：运行单元测试**

```bash
npm run test:unit
```

预期：所有测试通过

- [ ] **步骤 4：启动服务验证**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

验证：
- 管理员 API `/admin/deleted-data` 可访问
- 清理任务状态 `/admin/deleted-data/cleanup/status` 返回正确

- [ ] **步骤 5：最终 Commit**

```bash
git add -A
git commit -m "feat: 完成数据库伪删除机制实现"
```

---

## 规格覆盖度检查

| 规格章节 | 对应任务 |
|----------|----------|
| 2.1 需要伪删除的 21 个表 | 任务 1-6 |
| 3.1 SoftDeletableRepository 子类方案 | 任务 1 |
| 4.1 deleted_at/deleted_by 字段 | 任务 2, 14 |
| 5.1 Repository 层设计 | 任务 3-6 |
| 6.1-6.3 清理任务设计 | 任务 7, 8 |
| 7.1-7.2 管理员 API | 任务 9, 10 |
| 8.1-8.2 用户删除接口 | 任务 11 |
| 9.1 前端管理员界面 | 任务 12 |
| 10.1 数据迁移方案 | 任务 2, 14 |
| 11.1-11.2 测试策略 | 任务 13 |

**覆盖完整，无遗漏。**