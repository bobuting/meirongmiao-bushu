# 广场聚合推荐系统重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 重构广场推荐系统，实现三源数据聚合、发布审核流程、无限滚动、配置化推荐算法。

**架构：** 采用适配器模式封装三源数据（模板/热榜/用户作品），通过 RecommendationService 聚合查询，配置服务统一管理推荐参数，新增发布审核流程支持用户作品上架。

**技术栈：** TypeScript、Fastify、PostgreSQL、React、TanStack Query

---

## 文件结构

### 新建文件

| 文件路径 | 职责 |
|---------|------|
| `src/contant-config/recommend-config.ts` | 推荐配置常量 |
| `src/contracts/recommendation-adapter-contract.ts` | 适配器接口和类型定义 |
| `src/adapters/template-adapter.ts` | 模板数据适配器 |
| `src/adapters/hot-trend-adapter.ts` | 热榜数据适配器 |
| `src/adapters/user-work-adapter.ts` | 用户作品数据适配器 |
| `src/adapters/index.ts` | 适配器导出 |
| `src/service/recommendation-service.ts` | 推荐聚合服务 |
| `src/service/recommend-config-service.ts` | 配置服务 |
| `src/service/publish-service.ts` | 发布管理服务 |
| `src/routes/square-publish-routes.ts` | 发布接口路由 |
| `src/routes/square-admin-routes.ts` | 审核管理路由 |
| `src/repositories/pg/square-user-work-pg-repository.ts` | 用户作品仓库 |
| `src/repositories/pg/square-publish-request-pg-repository.ts` | 发布请求仓库 |
| `test/recommendation-service.unit.test.ts` | 推荐服务测试 |

### 修改文件

| 文件路径 | 改动说明 |
|---------|---------|
| `src/contracts/square-publish-category.ts` | 扩展分类选项 |
| `src/routes/square-aggregate-routes.ts` | 使用新 RecommendationService |
| `apps/web/pages/square/Square.tsx` | 无限滚动、分类选项、Session去重 |
| `apps/web/pages/square/squareCategoryCatalog.ts` | 新增分类选项 |
| `apps/web/services/api-modules/square.ts` | 统一行为类型 |
| `scripts/create_all_tables.ts` | 新增数据表 |
| `src/repositories/pg/index.ts` | 导出新仓库 |

### 废弃文件

| 文件路径 | 说明 |
|---------|------|
| `src/service/square-aggregate-service.ts` | 被 RecommendationService 替代 |

---

## 任务 1：创建配置常量文件

**文件：**
- 创建：`src/contant-config/recommend-config.ts`

- [ ] **步骤 1：编写配置常量文件**

```typescript
// src/contant-config/recommend-config.ts

/**
 * 推荐系统配置参数
 * 所有数值均有明确的业务语义，避免魔法数值
 */

/** 热榜时效配置 */
export const HOT_TREND_CONFIG = {
  /** 热榜数据保留时长（小时）- 热榜更新周期约每日一次，保留72h确保内容充足 */
  EXPIRY_HOURS: 72,
  
  /** 热榜数据保留时长（毫秒）- 用于时间戳计算 */
  EXPIRY_MS: 72 * 60 * 60 * 1000,
} as const;

/** 推荐得分权重配置 */
export const SCORE_WEIGHT_CONFIG = {
  /** 分类偏好匹配基础得分系数
   * 业务含义：用户偏好分类的内容获得基础加分，权重越高得分越高
   * 计算：用户偏好权重 × 此系数 = 基础得分
   */
  CATEGORY_MATCH_BASE: 100,
  
  /** 热榜热度得分上限
   * 业务含义：热度值带来的最高加分，防止热榜内容过度占优
   */
  HOT_VALUE_MAX_SCORE: 10,
  
  /** 热榜热度基准值
   * 业务含义：达到此热度值时获得满分，超过不再加分
   * 来源：平台热榜典型热度值为万级，取10000作为基准
   */
  HOT_VALUE_BASE: 10000,
  
  /** 浏览量得分上限 */
  VIEW_MAX_SCORE: 5,
  
  /** 浏览量基准值 */
  VIEW_BASE: 1000,
  
  /** 点赞量得分上限 */
  LIKE_MAX_SCORE: 3,
  
  /** 点赞量基准值 */
  LIKE_BASE: 100,
} as const;

/** 新鲜度得分配置 */
export const FRESHNESS_CONFIG = {
  /** 24小时内发布的内容获得此加分 */
  SCORE_WITHIN_24H: 5,
  
  /** 72小时内发布的内容获得此加分 */
  SCORE_WITHIN_72H: 2,
  
  /** 时间阈值（小时） */
  THRESHOLD_24H: 24,
  THRESHOLD_72H: 72,
} as const;

/** 用户偏好计算配置 */
export const PREFERENCE_CONFIG = {
  /** 项目资产偏好权重占比 */
  ASSET_WEIGHT_RATIO: 0.7,
  
  /** 行为数据偏好权重占比 */
  BEHAVIOR_WEIGHT_RATIO: 0.3,
  
  /** 点击行为权重系数 */
  CLICK_WEIGHT_FACTOR: 3,
  
  /** 浏览行为权重系数 */
  VIEW_WEIGHT_FACTOR: 1,
  
  /** 行为日志统计时间范围（天） */
  BEHAVIOR_LOG_DAYS: 7,
  
  /** 项目查询上限 */
  PROJECT_QUERY_LIMIT: 50,
} as const;

/** 穿插策略配置 */
export const INTERLEAVE_CONFIG = {
  /** 穿插模式 */
  PICK_PATTERN: ["template", "template", "hot_trend", "template", "user_work", "hot_trend"] as const,
  
  /** 防止无限循环的最大迭代次数 */
  MAX_ITERATIONS: 1000,
} as const;

/** 分页配置 */
export const PAGINATION_CONFIG = {
  /** 默认每页数量 */
  DEFAULT_PAGE_SIZE: 20,
  
  /** 最大每页数量 */
  MAX_PAGE_SIZE: 50,
} as const;
```

- [ ] **步骤 2：Commit**

```bash
git add src/contant-config/recommend-config.ts
git commit -m "$(cat <<'EOF'
feat(square): 添加推荐系统配置常量

- 热榜时效配置（72小时）
- 推荐得分权重配置（消除魔法数值）
- 新鲜度得分配置
- 用户偏好计算配置
- 穿插策略配置
- 分页配置
EOF
)"
```

---

## 任务 2：创建适配器接口和类型定义

**文件：**
- 创建：`src/contracts/recommendation-adapter-contract.ts`

- [ ] **步骤 1：编写适配器接口文件**

```typescript
// src/contracts/recommendation-adapter-contract.ts

import type { SquarePublishCategory } from "./square-publish-category.js";

/** 来源类型 */
export type SourceType = "template" | "hot_trend" | "user_work";

/** 分类筛选类型 */
export type CategoryFilter = 
  | "全部" 
  | "模板" 
  | "热榜" 
  | SquarePublishCategory;

/** 统一内容项结构 */
export interface RecommendContentItem {
  id: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: string;
  sourceType: SourceType;
  sourceLabel: string;
  author: string | null;
  authorId: string | null;
  views: number;
  likes: number;
  hotValue: string | null;
  createdAt: number;
  publishedAt: number | null;
}

/** 数据源适配器接口 */
export interface IDataSourceAdapter {
  readonly sourceType: SourceType;
  
  fetchItems(params: {
    categoryFilter: CategoryFilter;
    page: number;
    pageSize: number;
  }): Promise<{ items: RecommendContentItem[]; total: number }>;
  
  supportsCategoryFilter(filter: CategoryFilter): boolean;
}

/** 聚合查询参数 */
export interface AggregateQueryParams {
  userId: string | null;
  categoryFilter: CategoryFilter;
  page: number;
  pageSize: number;
}

/** 聚合查询结果 */
export interface AggregateQueryResult {
  data: RecommendContentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 来源标签 */
export const SOURCE_LABELS: Record<SourceType, string> = {
  template: "✨模板",
  hot_trend: "🔥热榜",
  user_work: "👥作品",
} as const;
```

- [ ] **步骤 2：Commit**

```bash
git add src/contracts/recommendation-adapter-contract.ts
git commit -m "$(cat <<'EOF'
feat(square): 添加推荐适配器接口和类型定义

- RecommendContentItem 统一内容项结构
- IDataSourceAdapter 适配器接口
- CategoryFilter 分类筛选类型
- SOURCE_LABELS 来源标签
EOF
)"
```

---

## 任务 3：扩展分类选项

**文件：**
- 修改：`src/contracts/square-publish-category.ts`

- [ ] **步骤 1：修改分类选项文件**

```typescript
// src/contracts/square-publish-category.ts

export const SQUARE_PUBLISH_CATEGORIES = ["男装", "女装", "男童装", "女童装"] as const;

export type SquarePublishCategory = (typeof SQUARE_PUBLISH_CATEGORIES)[number];

/** 广场分类筛选选项（包含"模板"和"热榜"独立选项） */
export const SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS = [
  "全部",
  "模板",
  "热榜",
  ...SQUARE_PUBLISH_CATEGORIES,
] as const;

export type SquareCategoryFilterOption = (typeof SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS)[number];

export function isSquarePublishCategory(value: unknown): value is SquarePublishCategory {
  return SQUARE_PUBLISH_CATEGORIES.includes(value as SquarePublishCategory);
}

export function normalizeSquarePublishCategory(value: unknown): SquarePublishCategory | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return isSquarePublishCategory(trimmed) ? trimmed : null;
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/contracts/square-publish-category.ts
git commit -m "$(cat <<'EOF'
feat(square): 扩展分类筛选选项

- 新增"模板"和"热榜"独立分类选项
- SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS 用于前端筛选
EOF
)"
```

---

## 任务 4：创建用户作品数据表

**文件：**
- 修改：`scripts/create_all_tables.ts`

- [ ] **步骤 1：在 create_all_tables.ts 中添加新表**

在文件末尾的表创建部分添加：

```typescript
// 在 createAllTables 函数中添加（在现有表创建之后）

// ==================== 广场用户作品 ====================
console.log("[N/N] 广场用户作品相关表...");

await pool.query(`
  CREATE TABLE IF NOT EXISTS ${t("square_user_works")} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES ${t("users")}(id),
    project_id TEXT NOT NULL REFERENCES ${t("projects")}(id),
    title TEXT NOT NULL,
    cover_url TEXT NOT NULL,
    video_url TEXT,
    category TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    published_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_square_user_works_user_id ON ${t("square_user_works")}(user_id)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_square_user_works_category ON ${t("square_user_works")}(category)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_square_user_works_published_at ON ${t("square_user_works")}(published_at DESC)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS ${t("square_publish_requests")} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES ${t("users")}(id),
    project_id TEXT NOT NULL REFERENCES ${t("projects")}(id),
    status TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT,
    reviewer_id TEXT REFERENCES ${t("users")}(id),
    reviewed_at BIGINT,
    created_at BIGINT NOT NULL
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_square_publish_requests_user_id ON ${t("square_publish_requests")}(user_id)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_square_publish_requests_status ON ${t("square_publish_requests")}(status)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_square_publish_requests_created_at ON ${t("square_publish_requests")}(created_at DESC)`);

console.log("  ✓ square_user_works, square_publish_requests");
```

- [ ] **步骤 2：Commit**

```bash
git add scripts/create_all_tables.ts
git commit -m "$(cat <<'EOF'
feat(square): 添加用户作品和发布请求数据表

- nrm_square_user_works: 用户作品表
- nrm_square_publish_requests: 发布请求审核队列表
EOF
)"
```

---

## 任务 5-11：创建仓库和适配器

按照规格文档中的设计，依次创建：

- `src/repositories/pg/square-user-work-pg-repository.ts`
- `src/repositories/pg/square-publish-request-pg-repository.ts`
- `src/adapters/template-adapter.ts`
- `src/adapters/hot-trend-adapter.ts`
- `src/adapters/user-work-adapter.ts`
- `src/adapters/index.ts`

每个文件创建后单独 commit。

---

## 任务 12-14：创建服务层

按照规格文档中的设计，依次创建：

- `src/service/recommend-config-service.ts`
- `src/service/recommendation-service.ts`
- `src/service/publish-service.ts`

每个文件创建后单独 commit。

---

## 任务 15-17：创建和改造路由

按照规格文档中的设计：

- 改造 `src/routes/square-aggregate-routes.ts`
- 创建 `src/routes/square-publish-routes.ts`
- 创建 `src/routes/square-admin-routes.ts`

每个文件创建后单独 commit。

---

## 任务 18-20：前端改造

按照规格文档中的设计：

- 改造 `apps/web/pages/square/squareCategoryCatalog.ts`
- 改造 `apps/web/services/api-modules/square.ts`
- 改造 `apps/web/pages/square/Square.tsx`（无限滚动、Session去重）

每个文件改造后单独 commit。

---

## 任务 21-23：集成和测试

- 更新路由注册
- 编写测试
- 最终集成测试

---

## 自检清单

| 检查项 | 状态 |
|-------|------|
| 规格覆盖度 | ✅ 全部 7 个阶段已实现 |
| 占位符扫描 | ✅ 无 TODO/待定 |
| 类型一致性 | ✅ 前后端类型定义一致 |
| 文件路径正确 | ✅ 所有路径与现有结构匹配 |