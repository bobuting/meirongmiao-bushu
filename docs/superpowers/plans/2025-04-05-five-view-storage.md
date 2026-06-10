# 五视图独立存储实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将五视图从角色内嵌存储改为独立表结构，支持版本历史和激活版本选择。

**架构：** 新建 `m5_character_five_views` 表存储五视图，通过 `character_id` 外键关联角色。每个角色可有多张五视图，其中一张为激活版本。创建角色时自动生成第一张五视图。

**技术栈：** PostgreSQL、Fastify 5、TypeScript、React 18

---

## 文件结构

### 新建文件
- `src/contracts/types.ts` — 添加 `CharacterFiveView` 类型定义
- `src/contracts/repository-ports/library-repository.ts` — 添加 `ICharacterFiveViewRepository` 接口
- `src/repositories/pg/character-five-view-pg-repository.ts` — 五视图 PG 仓库实现
- `src/routes/character-five-view-routes.ts` — 五视图 API 路由
- `scripts/create_character_five_views_table.ts` — 建表脚本

### 修改文件
- `src/repositories/pg/index.ts` — 注册新仓库
- `src/routes/library-routes.ts` — 修改角色创建流程，添加自动生成五视图逻辑
- `apps/web/services/backendApi.ts` — 添加五视图 API 调用
- `apps/web/services/backendApi.types.ts` — 添加前端类型定义
- `apps/web/pages/characters/CharacterManagement.tsx` — 更新五视图展示逻辑

---

## 任务 1：创建类型定义

**文件：**
- 修改：`src/contracts/types.ts`

- [ ] **步骤 1：添加 CharacterFiveView 类型定义**

在 `src/contracts/types.ts` 文件末尾添加：

```typescript
// ============================================================================
// 角色五视图
// ============================================================================

export type CharacterFiveViewStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface CharacterFiveView {
  id: string;
  characterId: string;
  imageUrl: string | null;
  status: CharacterFiveViewStatus;
  isActive: boolean;
  prompt: string | null;
  model: string | null;
  generationParams: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/contracts/types.ts
git commit -m "feat(types): add CharacterFiveView type definition"
```

---

## 任务 2：创建仓库接口

**文件：**
- 修改：`src/contracts/repository-ports/library-repository.ts`

- [ ] **步骤 1：添加 ICharacterFiveViewRepository 接口**

在 `src/contracts/repository-ports/library-repository.ts` 文件末尾添加：

```typescript
export interface ICharacterFiveViewRepository {
  findById(id: string): Promise<CharacterFiveView | null>;
  findByCharacterId(characterId: string): Promise<CharacterFiveView[]>;
  findActiveByCharacterId(characterId: string): Promise<CharacterFiveView | null>;
  create(view: CharacterFiveView): Promise<void>;
  update(view: CharacterFiveView): Promise<void>;
  delete(id: string): Promise<void>;
  setActive(characterId: string, viewId: string): Promise<void>;
}
```

- [ ] **步骤 2：添加导入**

在文件顶部添加导入：

```typescript
import type { CharacterFiveView } from "../types.js";
```

- [ ] **步骤 3：Commit**

```bash
git add src/contracts/repository-ports/library-repository.ts
git commit -m "feat(repository): add ICharacterFiveViewRepository interface"
```

---

## 任务 3：创建数据库表

**文件：**
- 创建：`scripts/create_character_five_views_table.ts`

- [ ] **步骤 1：编写建表脚本**

创建文件 `scripts/create_character_five_views_table.ts`：

```typescript
/**
 * 创建角色五视图表
 */

import { Pool } from "pg";
import { DEFAULT_CONFIG } from "../src/core/config.js";

const TABLE_NAME = "m5_character_five_views";

function table(name: string): string {
  return name;
}

async function main() {
  const pool = new Pool({
    connectionString: DEFAULT_CONFIG.databaseUrl,
  });

  try {
    console.log(`Creating table ${TABLE_NAME}...`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        is_active BOOLEAN NOT NULL DEFAULT false,
        prompt TEXT,
        model TEXT,
        generation_params JSONB,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_five_views_character_id ON ${TABLE_NAME}(character_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_five_views_is_active ON ${TABLE_NAME}(character_id, is_active) WHERE is_active = true
    `);

    // 添加外键约束（如果 library_characters 表存在）
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'm5_library_characters') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_five_views_character_id'
          ) THEN
            ALTER TABLE ${TABLE_NAME}
            ADD CONSTRAINT fk_five_views_character_id
            FOREIGN KEY (character_id) REFERENCES m5_library_characters(id) ON DELETE CASCADE;
          END IF;
        END IF;
      END $$
    `);

    // 添加表注释
    await pool.query(`COMMENT ON TABLE ${TABLE_NAME} IS '角色五视图表'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.id IS '主键UUID'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.character_id IS '关联角色ID'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.image_url IS '五视图图片OSS地址'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.status IS '状态：pending/processing/ready/failed'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.is_active IS '是否为激活版本'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.prompt IS '生成提示词'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.model IS '生成模型'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.generation_params IS '其他生成参数JSON'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.error_message IS '错误信息'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.retry_count IS '重试次数'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.created_at IS '创建时间戳'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.updated_at IS '更新时间戳'`);

    console.log(`✓ Table ${TABLE_NAME} created successfully`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed to create table:", err);
  process.exit(1);
});
```

- [ ] **步骤 2：运行建表脚本**

```bash
npx tsx scripts/create_character_five_views_table.ts
```

预期输出：`✓ Table m5_character_five_views created successfully`

- [ ] **步骤 3：Commit**

```bash
git add scripts/create_character_five_views_table.ts
git commit -m "feat(db): add character_five_views table creation script"
```

---

## 任务 4：创建 PG 仓库实现

**文件：**
- 创建：`src/repositories/pg/character-five-view-pg-repository.ts`

- [ ] **步骤 1：编写仓库实现**

创建文件 `src/repositories/pg/character-five-view-pg-repository.ts`：

```typescript
/**
 * 角色五视图 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { CharacterFiveView } from "../../contracts/types.js";
import type { ICharacterFiveViewRepository } from "../../contracts/repository-ports/library-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgCharacterFiveViewRepository
  extends PgBaseRepository<CharacterFiveView>
  implements ICharacterFiveViewRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("character_five_views"), client);
  }

  protected mapRow(row: Record<string, unknown>): CharacterFiveView {
    return {
      id: row.id as string,
      characterId: row.character_id as string,
      imageUrl: row.image_url as string | null,
      status: row.status as CharacterFiveView["status"],
      isActive: row.is_active as boolean,
      prompt: row.prompt as string | null,
      model: row.model as string | null,
      generationParams: PgBaseRepository.fromJsonb(row.generation_params) ?? null,
      errorMessage: row.error_message as string | null,
      retryCount: row.retry_count as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(v: CharacterFiveView): Record<string, unknown> {
    return {
      id: v.id,
      character_id: v.characterId,
      image_url: v.imageUrl ?? null,
      status: v.status,
      is_active: v.isActive,
      prompt: v.prompt ?? null,
      model: v.model ?? null,
      generation_params: PgBaseRepository.toJsonb(v.generationParams),
      error_message: v.errorMessage ?? null,
      retry_count: v.retryCount,
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    };
  }

  async findByCharacterId(characterId: string): Promise<CharacterFiveView[]> {
    return this.findWhere({ character_id: characterId });
  }

  async findActiveByCharacterId(characterId: string): Promise<CharacterFiveView | null> {
    const results = await this.findWhere({ character_id: characterId, is_active: true });
    return results[0] ?? null;
  }

  async setActive(characterId: string, viewId: string): Promise<void> {
    // 先将该角色所有五视图设为非激活
    await this.pool.query(
      `UPDATE ${this.tableName} SET is_active = false, updated_at = $1 WHERE character_id = $2`,
      [Date.now(), characterId]
    );
    // 再将目标五视图设为激活
    await this.pool.query(
      `UPDATE ${this.tableName} SET is_active = true, updated_at = $1 WHERE id = $2`,
      [Date.now(), viewId]
    );
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/repositories/pg/character-five-view-pg-repository.ts
git commit -m "feat(repository): add PgCharacterFiveViewRepository implementation"
```

---

## 任务 5：注册仓库

**文件：**
- 修改：`src/repositories/pg/index.ts`

- [ ] **步骤 1：导入新仓库**

在 `src/repositories/pg/index.ts` 文件顶部添加导入：

```typescript
import { PgCharacterFiveViewRepository } from "./character-five-view-pg-repository.js";
```

- [ ] **步骤 2：添加接口类型**

在 `PgRepositories` 接口中添加：

```typescript
characterFiveViews: PgCharacterFiveViewRepository;
```

- [ ] **步骤 3：实例化仓库**

在 `createRepositories` 函数中添加：

```typescript
characterFiveViews: new PgCharacterFiveViewRepository(pool),
```

- [ ] **步骤 4：在事务中添加仓库**

在 `withTransaction` 方法的返回对象中添加：

```typescript
characterFiveViews: new PgCharacterFiveViewRepository(pool, client),
```

- [ ] **步骤 5：Commit**

```bash
git add src/repositories/pg/index.ts
git commit -m "feat(repository): register PgCharacterFiveViewRepository"
```

---

## 任务 6：创建五视图 API 路由

**文件：**
- 创建：`src/routes/character-five-view-routes.ts`

- [ ] **步骤 1：编写路由处理函数**

创建文件 `src/routes/character-five-view-routes.ts`：

```typescript
/**
 * 角色五视图 API 路由
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";

interface CharacterIdParams {
  characterId: string;
}

interface ViewIdParams {
  characterId: string;
  viewId: string;
}

export function createCharacterFiveViewHandlers(ctx: AppContext) {
  // GET /library/characters/:characterId/five-views
  const listFiveViews = async (request: FastifyRequest<{ Params: CharacterIdParams }>) => {
    const user = request.user as User;
    const { characterId } = request.params;

    // 校验角色所有权
    const character = ctx.store.libraryCharacters.get(characterId);
    if (!character || character.userId !== user.id) {
      throw ctx.error("NOT_FOUND", "角色不存在");
    }

    const views = await ctx.repos.characterFiveViews.findByCharacterId(characterId);
    return { items: views };
  };

  // POST /library/characters/:characterId/five-views
  const createFiveView = async (request: FastifyRequest<{ Params: CharacterIdParams }>) => {
    const user = request.user as User;
    const { characterId } = request.params;

    // 校验角色所有权
    const character = ctx.store.libraryCharacters.get(characterId);
    if (!character || character.userId !== user.id) {
      throw ctx.error("NOT_FOUND", "角色不存在");
    }

    const now = Date.now();
    const view = {
      id: randomUUID(),
      characterId,
      imageUrl: null,
      status: 'pending' as const,
      isActive: false,
      prompt: null,
      model: null,
      generationParams: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.repos.characterFiveViews.create(view);

    // TODO: 触发后台异步生成任务
    // await triggerFiveViewGeneration(ctx, view);

    return view;
  };

  // PUT /library/characters/:characterId/five-views/:viewId/activate
  const activateFiveView = async (request: FastifyRequest<{ Params: ViewIdParams }>) => {
    const user = request.user as User;
    const { characterId, viewId } = request.params;

    // 校验角色所有权
    const character = ctx.store.libraryCharacters.get(characterId);
    if (!character || character.userId !== user.id) {
      throw ctx.error("NOT_FOUND", "角色不存在");
    }

    // 校验五视图存在且属于该角色
    const view = await ctx.repos.characterFiveViews.findById(viewId);
    if (!view || view.characterId !== characterId) {
      throw ctx.error("NOT_FOUND", "五视图不存在");
    }

    // 校验状态
    if (view.status !== 'ready') {
      throw ctx.error("BAD_REQUEST", "五视图尚未生成完成");
    }

    await ctx.repos.characterFiveViews.setActive(characterId, viewId);

    return { success: true };
  };

  // DELETE /library/characters/:characterId/five-views/:viewId
  const deleteFiveView = async (request: FastifyRequest<{ Params: ViewIdParams }>) => {
    const user = request.user as User;
    const { characterId, viewId } = request.params;

    // 校验角色所有权
    const character = ctx.store.libraryCharacters.get(characterId);
    if (!character || character.userId !== user.id) {
      throw ctx.error("NOT_FOUND", "角色不存在");
    }

    // 校验五视图存在且属于该角色
    const view = await ctx.repos.characterFiveViews.findById(viewId);
    if (!view || view.characterId !== characterId) {
      throw ctx.error("NOT_FOUND", "五视图不存在");
    }

    await ctx.repos.characterFiveViews.delete(viewId);

    return { success: true };
  };

  return {
    listFiveViews,
    createFiveView,
    activateFiveView,
    deleteFiveView,
  };
}

export function registerCharacterFiveViewRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  const handlers = createCharacterFiveViewHandlers(ctx);

  app.get("/library/characters/:characterId/five-views", handlers.listFiveViews);
  app.post("/library/characters/:characterId/five-views", handlers.createFiveView);
  app.put("/library/characters/:characterId/five-views/:viewId/activate", handlers.activateFiveView);
  app.delete("/library/characters/:characterId/five-views/:viewId", handlers.deleteFiveView);
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/routes/character-five-view-routes.ts
git commit -m "feat(routes): add character five view API routes"
```

---

## 任务 7：修改角色创建流程

**文件：**
- 修改：`src/routes/library-routes.ts`

- [ ] **步骤 1：导入五视图路由**

在 `src/routes/library-routes.ts` 顶部添加导入：

```typescript
import { registerCharacterFiveViewRoutes } from "./character-five-view-routes.js";
```

- [ ] **步骤 2：注册五视图路由**

在路由注册部分添加：

```typescript
registerCharacterFiveViewRoutes(app, ctx);
```

- [ ] **步骤 3：修改角色创建逻辑**

在 `app.post("/library/characters")` 路由中，角色创建成功后添加自动创建五视图记录的逻辑。

找到角色创建成功的位置，添加：

```typescript
// 自动创建五视图记录
const fiveViewId = randomUUID();
const now = Date.now();
await ctx.repos.characterFiveViews.create({
  id: fiveViewId,
  characterId: character.id,
  imageUrl: null,
  status: 'pending',
  isActive: false,
  prompt: null,
  model: null,
  generationParams: null,
  errorMessage: null,
  retryCount: 0,
  createdAt: now,
  updatedAt: now,
});
```

- [ ] **步骤 4：Commit**

```bash
git add src/routes/library-routes.ts
git commit -m "feat(routes): auto create five view on character creation"
```

---

## 任务 8：添加前端类型定义

**文件：**
- 修改：`apps/web/services/backendApi.types.ts`

- [ ] **步骤 1：添加前端类型定义**

在 `apps/web/services/backendApi.types.ts` 文件中添加：

```typescript
// ============================================================================
// 角色五视图
// ============================================================================

export type CharacterFiveViewStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface CharacterFiveViewDto {
  id: string;
  characterId: string;
  imageUrl: string | null;
  status: CharacterFiveViewStatus;
  isActive: boolean;
  prompt: string | null;
  model: string | null;
  generationParams: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 2：Commit**

```bash
git add apps/web/services/backendApi.types.ts
git commit -m "feat(types): add CharacterFiveViewDto frontend type"
```

---

## 任务 9：添加前端 API 调用

**文件：**
- 修改：`apps/web/services/backendApi.ts`

- [ ] **步骤 1：添加五视图 API 方法**

在 `backendApi` 对象中添加：

```typescript
// 五视图相关 API
listCharacterFiveViews: (token: string, characterId: string) =>
  request<{ items: CharacterFiveViewDto[] }>(
    "GET",
    `/library/characters/${characterId}/five-views`,
    { token }
  ),

createCharacterFiveView: (token: string, characterId: string) =>
  request<CharacterFiveViewDto>(
    "POST",
    `/library/characters/${characterId}/five-views`,
    { token }
  ),

activateCharacterFiveView: (token: string, characterId: string, viewId: string) =>
  request<{ success: boolean }>(
    "PUT",
    `/library/characters/${characterId}/five-views/${viewId}/activate`,
    { token }
  ),

deleteCharacterFiveView: (token: string, characterId: string, viewId: string) =>
  request<{ success: boolean }>(
    "DELETE",
    `/library/characters/${characterId}/five-views/${viewId}`,
    { token }
  ),
```

- [ ] **步骤 2：Commit**

```bash
git add apps/web/services/backendApi.ts
git commit -m "feat(api): add character five view API methods"
```

---

## 任务 10：更新前端五视图展示

**文件：**
- 修改：`apps/web/pages/characters/CharacterManagement.tsx`

- [ ] **步骤 1：修改五视图数据获取逻辑**

更新 `fiveViews` 的 useMemo，从新的 API 获取数据：

```typescript
// 获取五视图数据
const { data: fiveViewsData } = useQuery({
    queryKey: ['character-five-views', token, character?.id],
    enabled: Boolean(token && character),
    queryFn: async () => {
        if (!token || !character) return { items: [] };
        return backendApi.listCharacterFiveViews(token, character.id);
    },
});

// 获取激活的五视图
const activeFiveView = fiveViewsData?.items?.find(v => v.isActive);
const allFiveViews = fiveViewsData?.items ?? [];
```

- [ ] **步骤 2：更新五视图展示组件**

修改五视图展示区域，使用新的数据结构：

```typescript
{/* 五视图列表 */}
{allFiveViews.length > 0 && (
    <div className="bg-white rounded-xl p-4 border border-gray-200 mb-6">
        <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-500">五视图（{allFiveViews.length} 张）</div>
            <button
                onClick={async () => {
                    if (!token || !character) return;
                    await backendApi.createCharacterFiveView(token, character.id);
                    // 触发刷新
                }}
                className="text-xs text-primary hover:underline"
            >
                + 生成新五视图
            </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
            {allFiveViews.map(view => (
                <div
                    key={view.id}
                    className={`relative aspect-video rounded-lg overflow-hidden border cursor-pointer ${
                        view.isActive ? 'ring-2 ring-primary' : 'border-gray-200'
                    }`}
                    onClick={() => view.imageUrl && setPopupImage(view.imageUrl)}
                >
                    {view.imageUrl ? (
                        <img src={view.imageUrl} alt="五视图" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs">
                            {view.status === 'pending' && '等待生成'}
                            {view.status === 'processing' && '生成中...'}
                            {view.status === 'failed' && '生成失败'}
                        </div>
                    )}
                    {view.isActive && (
                        <div className="absolute top-1 right-1 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded">
                            激活
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
)}
```

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/characters/CharacterManagement.tsx
git commit -m "feat(ui): update character five view display"
```

---

## 任务 11：更新 M5 Persistence

**文件：**
- 修改：`src/persistence/postgres-m5-adapter_sub.ts`

- [ ] **步骤 1：添加五视图持久化逻辑**

在 `postgres-m5-adapter_sub.ts` 中添加五视图的 hydrate 和 flush 逻辑。

添加 `characterFiveViews` 到持久化列表。

- [ ] **步骤 2：Commit**

```bash
git add src/persistence/postgres-m5-adapter_sub.ts
git commit -m "feat(persistence): add character five view persistence"
```

---

## 任务 12：运行测试验证

- [ ] **步骤 1：编译后端**

```bash
npm run build
```

预期：编译成功，无错误

- [ ] **步骤 2：编译前端**

```bash
npm run build:ui
```

预期：编译成功，无错误

- [ ] **步骤 3：启动项目测试**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
npm --prefix apps/web run dev
```

预期：前后端启动成功

- [ ] **步骤 4：手动测试**

1. 创建新角色 → 验证自动创建五视图记录
2. 查看角色详情 → 验证五视图列表展示
3. 生成新五视图 → 验证创建成功
4. 设为激活版本 → 验证激活状态更新

---

## 完成检查

- [ ] 所有新建文件已创建
- [ ] 所有修改文件已更新
- [ ] 后端编译通过
- [ ] 前端编译通过
- [ ] 手动测试通过
- [ ] 所有 commit 已提交