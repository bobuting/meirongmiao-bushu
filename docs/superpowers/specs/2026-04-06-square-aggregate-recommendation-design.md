# 广场聚合推荐系统重构设计

> 创建日期：2026-04-06
> 状态：待实现

## 背景

创作广场列表存在以下问题需要全量修复：

| 问题 | 影响 |
|------|------|
| 用户作品数据源未实现 | 穿插策略失效，只有模板+热榜 |
| 热榜24h时效性过严格 | 热榜池经常为空 |
| 推荐得分使用魔法数值 | 违反规范，难以调整 |
| 前端行为追踪去重缺陷 | 切换分类会重复追踪 |
| 分类筛选不一致 | 热榜无视服装分类 |
| 前端分页未实现 | 只能看20条内容 |
| 行为类型前后端不一致 | play/like/share/replica 被后端拒绝 |

## 设计决策

| 问题 | 决策 |
|------|------|
| 用户作品数据源 | 公开作品库，用户主动发布 |
| 发布入口 | Step5 完成按钮改为"发布到广场" |
| 发布附加信息 | 无需填写，一键发布 |
| 发布审核机制 | 人工审核后才上架 |
| 热榜时效性 | 72小时 |
| 魔法数值处理 | 提取为配置常量+业务语义注释 |
| 热榜分类筛选 | 热榜作为单独分类选项 |
| 前端分页 | 无限滚动 |
| 行为追踪去重 | Session 级去重 |
| 行为类型 | 统一为 view / click |

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          前端层                                  │
├─────────────────────────────────────────────────────────────────┤
│  Square.tsx                                                      │
│    - 无限滚动 (IntersectionObserver sentinel)                    │
│    - IntersectionObserver 追踪（Session 去重）                    │
│    - 统一行为类型：view / click                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────────┐
│                          路由层                                  │
├─────────────────────────────────────────────────────────────────┤
│  square-aggregate-routes.ts                                      │
│    - GET /square/aggregate?category=&page=&pageSize=             │
│    - POST /square/track-behavior                                 │
│    - POST /square/publish (新增：发布作品)                         │
│  square-admin-routes.ts (新增：审核管理)                          │
│    - GET /admin/square/publish-requests (待审核列表)              │
│    - POST /admin/square/publish-requests/:id/approve             │
│    - POST /admin/square/publish-requests/:id/reject              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                          服务层 (新架构)                          │
├─────────────────────────────────────────────────────────────────┤
│  RecommendationService (新建：推荐聚合服务)                        │
│    - aggregate() 入口方法                                        │
│    - 调用各数据源适配器获取数据                                    │
│    - 应用推荐策略计算得分                                         │
│    - 返回分页结果                                                 │
│                                                                  │
│  DataSourceAdapter (新建：数据源适配器接口)                        │
│    - TemplateAdapter → 模板数据                                  │
│    - HotTrendAdapter → 热榜数据                                  │
│    - UserWorkAdapter → 用户作品数据                               │
│                                                                  │
│  RecommendConfigService (新建：配置服务)                          │
│    - 加载推荐配置参数                                             │
│    - 提供权重、时效等配置常量                                      │
│                                                                  │
│  SquareBehaviorService (保留：行为追踪)                           │
│  UserPreferenceService (保留：用户偏好)                           │
│  PublishService (新建：发布管理)                                  │
│    - createPublishRequest() 创建发布请求                          │
│    - approvePublishRequest() 审核通过                             │
│    - rejectPublishRequest() 审核拒绝                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                          数据层                                  │
├─────────────────────────────────────────────────────────────────┤
│  nrm_square_templates         (现有：模板)                        │
│  nrm_hot_trend_assets         (现有：热榜)                        │
│  nrm_square_user_works        (新建：用户作品)                     │
│  nrm_square_publish_requests  (新建：发布请求，审核队列)           │
│  nrm_square_behavior_logs     (现有：行为日志)                     │
│  nrm_user_square_preferences  (现有：用户偏好)                     │
└─────────────────────────────────────────────────────────────────┘
```

## 数据源适配器设计

### 适配器接口

```typescript
// src/contracts/recommendation-adapter-contract.ts

/** 统一内容项结构 */
export interface RecommendContentItem {
  id: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: string;          // 服装分类或来源平台
  sourceType: "template" | "hot_trend" | "user_work";
  sourceLabel: string;       // 展示标签
  author: string | null;
  authorId: string | null;   // 作者ID（用于作品）
  views: number;
  likes: number;
  hotValue: string | null;   // 仅热榜
  createdAt: number;
  publishedAt: number | null; // 作品上架时间
}

/** 分类筛选类型 */
export type CategoryFilter = 
  | "全部" 
  | "模板" 
  | "热榜" 
  | "男装" 
  | "女装" 
  | "男童装" 
  | "女童装";

/** 数据源适配器接口 */
export interface IDataSourceAdapter {
  /** 数据源类型标识 */
  readonly sourceType: "template" | "hot_trend" | "user_work";
  
  /** 获取内容列表 */
  fetchItems(params: {
    categoryFilter: CategoryFilter;
    page: number;
    pageSize: number;
  }): Promise<{ items: RecommendContentItem[]; total: number }>;
  
  /** 该适配器是否支持指定分类筛选 */
  supportsCategoryFilter(filter: CategoryFilter): boolean;
}
```

### 分类筛选路由

| 适配器 | 数据表 | 分类筛选支持 |
|-------|-------|-------------|
| `TemplateAdapter` | `nrm_square_templates` | 全部/模板/男装/女装/男童装/女童装 |
| `HotTrendAdapter` | `nrm_hot_trend_assets` | 全部/热榜（72h时效） |
| `UserWorkAdapter` | `nrm_square_user_works` | 全部/男装/女装/男童装/女童装 |

```typescript
function determineActiveAdapters(filter: CategoryFilter): IDataSourceAdapter[] {
  switch (filter) {
    case "全部":
      return [templateAdapter, hotTrendAdapter, userWorkAdapter];
    case "模板":
      return [templateAdapter];
    case "热榜":
      return [hotTrendAdapter];
    case "男装":
    case "女装":
    case "男童装":
    case "女童装":
      return [templateAdapter, userWorkAdapter]; // 热榜不参与服装分类
    default:
      return [templateAdapter, hotTrendAdapter, userWorkAdapter];
  }
}
```

## 推荐配置服务

### 配置常量

```typescript
// src/contant-config/recommend-config.ts

/** 热榜时效配置 */
export const HOT_TREND_CONFIG = {
  /** 热榜数据保留时长（小时）- 热榜更新周期约每日一次，保留72h确保内容充足 */
  EXPIRY_HOURS: 72,
  EXPIRY_MS: 72 * 60 * 60 * 1000,
};

/** 推荐得分权重配置 */
export const SCORE_WEIGHT_CONFIG = {
  /** 分类偏好匹配基础得分系数 */
  CATEGORY_MATCH_BASE: 100,
  /** 热榜热度得分上限 */
  HOT_VALUE_MAX_SCORE: 10,
  /** 热榜热度基准值 - 达到此热度值时获得满分 */
  HOT_VALUE_BASE: 10000,
  /** 浏览量得分上限 */
  VIEW_MAX_SCORE: 5,
  /** 浏览量基准值 */
  VIEW_BASE: 1000,
  /** 点赞量得分上限 */
  LIKE_MAX_SCORE: 3,
  /** 点赞量基准值 */
  LIKE_BASE: 100,
};

/** 新鲜度得分配置 */
export const FRESHNESS_CONFIG = {
  SCORE_WITHIN_24H: 5,
  SCORE_WITHIN_72H: 2,
  THRESHOLD_24H: 24,
  THRESHOLD_72H: 72,
};

/** 用户偏好计算配置 */
export const PREFERENCE_CONFIG = {
  ASSET_WEIGHT_RATIO: 0.7,
  BEHAVIOR_WEIGHT_RATIO: 0.3,
  CLICK_WEIGHT_FACTOR: 3,
  VIEW_WEIGHT_FACTOR: 1,
  BEHAVIOR_LOG_DAYS: 7,
  PROJECT_QUERY_LIMIT: 50,
};

/** 穿插策略配置 */
export const INTERLEAVE_CONFIG = {
  PICK_PATTERN: ["template", "template", "hot_trend", "template", "user_work", "hot_trend"],
  MAX_ITERATIONS: 1000,
};

/** 分页配置 */
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
};
```

## 发布与审核流程

### 发布流程

```
用户在 Step5 点击"发布到广场"
                ↓
        检查项目是否已完成视频生成
                ↓ 是
        创建发布请求记录 (status=pending)
        写入 nrm_square_publish_requests
                ↓
        返回提示："已提交发布申请，等待审核"
                ↓
运营后台审核列表显示新请求
                ↓
运营点击"通过"或"拒绝"
                ↓ 通过
        创建作品记录到 nrm_square_user_works
        更新发布请求状态为 approved
                ↓ 拒绝
        更新发布请求状态为 rejected
```

### 数据表：nrm_square_publish_requests

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 申请用户 |
| project_id | UUID | 关联项目 |
| status | ENUM | pending/approved/rejected |
| reject_reason | TEXT | 拒绝理由（可选） |
| reviewer_id | UUID | 审核人ID |
| reviewed_at | BIGINT | 审核时间戳 |
| created_at | BIGINT | 申请时间戳 |

### 数据表：nrm_square_user_works

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 作者ID |
| project_id | UUID | 来源项目 |
| title | TEXT | 作品标题（来自项目） |
| cover_url | TEXT | 封面图（来自项目） |
| video_url | TEXT | 视频链接（来自项目） |
| category | VARCHAR | 服装分类（来自项目apparelCategory） |
| views | INT | 浏览量，默认0 |
| likes | INT | 点赞量，默认0 |
| is_enabled | BOOLEAN | 是否上架，默认true |
| published_at | BIGINT | 上架时间戳 |
| created_at | BIGINT | 创建时间戳 |

### API 接口

#### 用户端

```typescript
// POST /square/publish
interface PublishRequestBody {
  projectId: string;
}
interface PublishResponse {
  success: boolean;
  message: string;
  requestId: string;
}
```

#### 运营后台

```typescript
// GET /admin/square/publish-requests
interface PublishRequestListParams {
  status?: "pending" | "approved" | "rejected";
  page?: number;
  pageSize?: number;
}

// POST /admin/square/publish-requests/:id/approve
interface ApproveResponse {
  success: boolean;
  workId: string;
}

// POST /admin/square/publish-requests/:id/reject
interface RejectRequestBody {
  reason?: string;
}
```

## 前端改造

### 分类筛选选项

```typescript
// apps/web/pages/square/squareCategoryCatalog.ts
export const SQUARE_CATEGORY_FILTER_OPTIONS = [
  "全部",
  "模板",
  "热榜",
  "男装",
  "女装",
  "男童装",
  "女童装",
];
```

### 无限滚动

```typescript
// 状态
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);

// IntersectionObserver 监听底部触发器
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadMore();
      }
    },
    { threshold: 0.1 }
  );
  const sentinel = document.querySelector('[data-load-more-sentinel]');
  if (sentinel) observer.observe(sentinel);
  return () => observer.disconnect();
}, [hasMore, loadingMore, activeCategory]);

// 切换分类时重置
useEffect(() => {
  setPage(1);
  setHasMore(true);
  setAggregateItems([]);
}, [activeCategory]);
```

### Session 级去重

```typescript
const TRACKED_SESSION_KEY = 'square.tracked_items.v1';

function getTrackedSet(): Set<string> {
  const raw = sessionStorage.getItem(TRACKED_SESSION_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function hasTracked(itemId: string): boolean {
  return getTrackedSet().has(itemId);
}

function markTracked(itemId: string): void {
  const set = getTrackedSet();
  set.add(itemId);
  sessionStorage.setItem(TRACKED_SESSION_KEY, JSON.stringify([...set]));
}
```

### 统一行为类型

```typescript
// 仅支持 view 和 click
export type BehaviorType = "view" | "click";

// 移除 play/like/share/replica 类型
```

## 推荐得分计算

### 得分组成

| 得分组成 | 计算方式 | 适用范围 |
|---------|---------|---------|
| 分类偏好匹配 | `userWeights[category] × 100` | 模板/作品 |
| 热度得分 | `min(hotValue/10000, 1) × 10` | 仅热榜 |
| 浏览量得分 | `min(views/1000, 1) × 5` | 模板/作品 |
| 点赞量得分 | `min(likes/100, 1) × 3` | 模板/作品 |
| 新鲜度得分 | 24h内+5，72h内+2 | 所有 |

### 穿插策略

Pattern: `["template", "template", "hot_trend", "template", "user_work", "hot_trend"]`

确保各来源内容交替展示，避免同一类型过于集中。

## 文件结构

```
src/service/
├── recommendation-service.ts        (新建)
├── recommend-config-service.ts      (新建)
├── publish-service.ts               (新建)
├── square-behavior-service.ts       (保留)
├── user-preference-service.ts       (保留)
└── square-aggregate-service.ts      (废弃)

src/contracts/
├── recommendation-adapter-contract.ts  (新建)
├── recommend-content-item.ts           (新建)

src/adapters/
├── template-adapter.ts               (新建)
├── hot-trend-adapter.ts              (新建)
├── user-work-adapter.ts              (新建)

src/routes/
├── square-aggregate-routes.ts        (改造)
├── square-publish-routes.ts          (新建)
├── square-admin-routes.ts            (新建)

apps/web/pages/square/
├── Square.tsx                        (改造)
├── squareCategoryCatalog.ts          (改造)
```

## 实现阶段

| 阶段 | 任务 | 依赖 |
|-----|------|------|
| Phase 1 | 创建配置文件、类型定义、合约文件 | 无 |
| Phase 2 | 创建 nrm_square_user_works、nrm_square_publish_requests 表 | Phase 1 |
| Phase 3 | 实现 TemplateAdapter、HotTrendAdapter、UserWorkAdapter | Phase 1, 2 |
| Phase 4 | 实现 RecommendConfigService、RecommendationService、PublishService | Phase 1, 2, 3 |
| Phase 5 | 改造 square-aggregate-routes、新建发布和审核路由 | Phase 4 |
| Phase 6 | 改造 Square.tsx（分类选项、无限滚动、去重） | Phase 5 |
| Phase 7 | 改造 Step5 完成按钮为"发布到广场" | Phase 5 |