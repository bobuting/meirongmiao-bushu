# 用户服饰资产表合并设计

**日期：** 2026-04-06
**状态：** 待用户审查

---

## 背景

项目现有两张资产表：
- `nrm_assets`：用户项目资产表（直接关联 project_id）
- `nrm_library_assets`：公共资产库表

存在问题：
1. 表名语义不准确（应为"服饰资产"而非"资产")
2. 两张表结构相似，数据分散，维护复杂
3. 用户资产与项目是直接外键关联，不支持多对多关系
4. 图片 URL 存储在 JSONB 数组中，查询不便
5. 部分字段使用 JSONB payload，不符合传统字段模式规范

---

## 设计目标

1. 合并两张表为统一的"用户服饰资产表"
2. 用户服饰资产与项目改为多对多关系
3. 图片存储改为四个独立字段（主图 + 三张副图）
4. AI 分类结果拆解为传统字段
5. 统一 API 端点，前端同步更新

---

## 表结构设计

### 用户服饰资产表 `nrm_garment_assets`

```sql
CREATE TABLE nrm_garment_assets (
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
CREATE INDEX idx_garment_assets_user_id ON nrm_garment_assets(user_id);
CREATE INDEX idx_garment_assets_category ON nrm_garment_assets(category);
CREATE INDEX idx_garment_assets_type ON nrm_garment_assets(type);
```

### 项目服饰关联表 `nrm_project_garment_assoc`

```sql
CREATE TABLE nrm_project_garment_assoc (
  id TEXT PRIMARY KEY,                              -- 主键
  project_id TEXT NOT NULL REFERENCES nrm_projects(id) ON DELETE CASCADE,
  garment_asset_id TEXT NOT NULL REFERENCES nrm_garment_assets(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,                       -- 创建时间戳
  updated_at BIGINT NOT NULL,                       -- 更新时间戳

  UNIQUE(project_id, garment_asset_id)              -- 防止重复关联
);

-- 索引
CREATE INDEX idx_project_garment_assoc_project_id ON nrm_project_garment_assoc(project_id);
CREATE INDEX idx_project_garment_assoc_garment_asset_id ON nrm_project_garment_assoc(garment_asset_id);
```

---

## 数据迁移方案

### 迁移步骤

| 步骤 | 操作 |
|------|------|
| 1 | 创建新表 `nrm_garment_assets` + `nrm_project_garment_assoc` |
| 2 | 迁移 `nrm_library_assets` 数据 → `nrm_garment_assets` |
| 3 | 迁移 `nrm_assets` 数据 → `nrm_garment_assets`，并建立项目关联 |
| 4 | 更新 Repository 层代码 |
| 5 | 更新 Service 层代码 |
| 6 | 删除旧表（可选，建议保留一段时间观察） |

### 数据映射规则

**`nrm_library_assets` → `nrm_garment_assets`**

| 原字段 | 新字段 | 说明 |
|--------|--------|------|
| `id` | `id` | 直接迁移 |
| `user_id` | `user_id` | 直接迁移 |
| `name` | `name` | 直接迁移 |
| `type` | `type` | 直接迁移 |
| `category` | `category` | 直接迁移 |
| `url` | `main_image_url` | 主图 |
| `related_image_urls[0]` | `sub_image_url_1` | 副图1 |
| `related_image_urls[1]` | `sub_image_url_2` | 副图2 |
| `related_image_urls[2]` | `sub_image_url_3` | 副图3 |
| `size_mb` | `size_mb` | 直接迁移 |
| `classification.category` | `ai_category` | JSONB 拆解 |
| `classification.viewLabel` | `ai_view_label` | JSONB 拆解 |
| `classification.confidence` | `ai_confidence` | JSONB 拆解 |
| `classification.reason` | `ai_reason` | JSONB 拆解 |
| `created_at` | `created_at` | 直接迁移 |
| `updated_at` | `updated_at` | 直接迁移 |

**`nrm_assets` → `nrm_garment_assets` + `nrm_project_garment_assoc`**

| 原字段 | 新字段/表 | 说明 |
|--------|-----------|------|
| `id` | `nrm_garment_assets.id` | 保持原 ID 或生成新 ID |
| `project_id` | `nrm_project_garment_assoc.project_id` | 移到关联表 |
| `user_id` | `nrm_garment_assets.user_id` | 直接迁移 |
| `library_asset_id` | — | 若有引用，复用 library_asset 数据 |
| `file_name` | `name` | 作为服饰名称 |
| `apparel_category` | `category` | 直接迁移 |
| `size_mb` | `size_mb` | 直接迁移 |

**注意：** `nrm_assets` 没有图片 URL 字段，需从 `file_name` 推断 OSS 路径填充 `main_image_url`，或标记为待补充。

---

## 代码层改造

### 类型定义

```typescript
// src/contracts/types.ts

/** 用户服饰资产 */
export interface GarmentAsset {
  id: string;
  userId: string;
  name: string;
  type: "image" | "video";
  category: AssetCategory;
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
  deletedAt?: number | null;
  deletedBy?: string | null;
}

/** 项目服饰关联 */
export interface ProjectGarmentAssoc {
  id: string;
  projectId: string;
  garmentAssetId: string;
  createdAt: number;
  updatedAt: number;
}
```

### 需修改的文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/repositories/pg/asset-pg-repository.ts` | 重写 | 改为 `PgGarmentAssetRepository` |
| `src/repositories/pg/library-pg-repository.ts` | 删除 `PgLibraryAssetRepository` | 合入新 Repository |
| `src/modules/asset-library-service.ts` | 修改 | 使用新 Repository |
| `src/contracts/types.ts` | 修改 | 更新类型定义 |
| `src/contracts/repository-ports/asset-repository.ts` | 修改 | 更新接口定义 |
| `scripts/create_all_tables.ts` | 修改 | 替换旧表为新表 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/repositories/pg/garment-asset-pg-repository.ts` | 服饰资产 PG 仓库 |
| `src/repositories/pg/project-garment-assoc-pg-repository.ts` | 项目服饰关联 PG 仓库 |
| `src/routes/garment-asset-routes.ts` | 服饰资产 API 路由 |
| `src/routes/project-garment-assoc-routes.ts` | 项目服饰关联 API 路由 |

---

## API 端点设计

### `/api/garment-assets`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/garment-assets` | 获取用户服饰资产列表（含公共资产） |
| GET | `/api/garment-assets/:id` | 获取单个服饰资产 |
| POST | `/api/garment-assets` | 创建服饰资产 |
| PUT | `/api/garment-assets/:id` | 更新服饰资产 |
| DELETE | `/api/garment-assets/:id` | 删除服饰资产 |

### `/api/project-garment-assoc`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/project-garment-assoc?projectId=xxx` | 获取项目的服饰资产关联列表 |
| POST | `/api/project-garment-assoc` | 添加服饰资产到项目 |
| DELETE | `/api/project-garment-assoc/:id` | 移除服饰资产关联 |

---

## 前端改动

| 文件 | 改动 |
|------|------|
| `apps/web/services/api-modules/garment-assets.ts` | 新增 API 封装模块 |
| `apps/web/services/api-modules/project-garment-assoc.ts` | 新增 API 封装模块 |
| `apps/web/services/backendApi.ts` | 注册新 API 模块 |
| `apps/web/pages/step1/...` | 更新调用端点 |
| `apps/web/pages/library/...` | 更新调用端点 |

---

## 风险与注意事项

1. **数据迁移**：`nrm_assets` 缺少图片 URL，需从 OSS 路径推断或标记待补充
2. **停服窗口**：建议迁移期间暂停服务，避免数据不一致
3. **回滚预案**：保留旧表一段时间，确认无问题后再删除
4. **前端同步**：API 端点更新需与前端同步发布

---

## 实施顺序

1. 创建新表（DDL）
2. 编写迁移脚本并执行
3. 更新 Repository 层
4. 更新 Service 层
5. 新增 API 路由
6. 更新前端 API 封装
7. 更新前端页面调用
8. 删除旧表（确认稳定后）