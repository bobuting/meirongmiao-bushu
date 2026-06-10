# nrm_async_jobs 后台管理 — 设计规格

## 元信息

- **日期**: 2026-04-27
- **状态**: 已批准
- **方案**: A — 单一路由 + URL 驱动筛选

## 目标

为 `nrm_async_jobs` 表新增一个全能型后台管理页面，支持：列表查看 + 统计图表 + 高级筛选 + 详情侧边面板 + 状态变更/编辑/删除/批量操作。面向运维监控、数据管理、用户支持三类场景。

---

## 1. 后端 API

### 路由文件

`src/routes/admin/async-jobs-routes.ts`，导出 `registerAdminAsyncJobsRoutes(app, ctx)`。

每个处理程序首行调用 `requireAdmin(ctx, request)` 做权限守卫。操作类接口写入 `nrm_audit_logs` 审计日志。

### 1.1 统计聚合 `GET /admin/async-jobs/stats`

```typescript
// 响应
{
  overview: {
    total: number;          // 总任务数
    pending: number;
    running: number;
    completed: number;
    failed: number;
    expired: number;
    todayTotal: number;     // 今日新增
    todayFailed: number;    // 今日失败
  };
  byJobType: { jobType: string; count: number }[];  // 任务类型分布
  trend: { date: string; total: number; failed: number }[]; // 近 7 天
}
```

### 1.2 分页列表 `GET /admin/async-jobs`

Query 参数：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页条数（最大 100） |
| `status` | string | - | 逗号分隔多个：pending,running,completed,failed,expired |
| `jobType` | string | - | 模糊匹配（ILIKE） |
| `userId` | string | - | 精确 |
| `projectId` | string | - | 精确 |
| `jobId` | string | - | 精确 |
| `parentJobId` | string | - | 精确 |
| `visibleToUser` | boolean | - | 精确 |
| `stuckOnly` | boolean | false | 停滞任务：pending `updated_at` 超 20 分钟无变化 或 running 超 30 分钟无变化 |
| `sortBy` | string | `createdAt` | createdAt / updatedAt |
| `sortOrder` | string | `desc` | asc / desc |
| `dateFrom` | number | - | 创建时间起点（unix ms） |
| `dateTo` | number | - | 创建时间终点（unix ms） |

```typescript
// 响应
{
  items: AsyncJobRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
```

### 1.3 详情 `GET /admin/async-jobs/:id`

```typescript
// 响应
{
  job: AsyncJobRecord;
  children: AsyncJobRecord[];      // parent_job_id = :id
  dependencies: AsyncJobRecord[];  // id IN (depends_on)
}
```

### 1.4 操作接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/admin/async-jobs/:id/retry` | 重置为 pending |
| `POST` | `/admin/async-jobs/:id/cancel` | 设为 expired |
| `PATCH` | `/admin/async-jobs/:id` | 编辑 input/result/error（body 含要更新的字段） |
| `DELETE` | `/admin/async-jobs/:id` | 硬删除，运行中任务先 cancel |
| `POST` | `/admin/async-jobs/batch` | `{ ids: string[], action: "retry"\|"cancel"\|"delete" }`，返回 `{ success: string[], failed: { id: string; reason: string }[] }` |
| `POST` | `/admin/async-jobs/clear-stuck` | 按用户清理堵塞任务，见下方详细说明 |

### 1.5 清理堵塞任务 `POST /admin/async-jobs/clear-stuck`

一键清理某用户的超时/卡住/堵塞任务，让用户可以继续正常使用工作流。

**请求体：**

```typescript
{
  userId: string;              // 必填：目标用户
  scope?: "all" | "project";  // 清理范围：all = 全局，project = 指定项目
  projectId?: string;          // scope=project 时必填
  includeFailed?: boolean;     // 是否同时清理 failed 任务（默认 true）
}
```

**清理逻辑（基于 `updated_at` 停滞判断）：**

卡住的本质不是"跑了多久"，而是"停滞不动"。判断标准：

| 任务状态 | 判断条件 | 清理动作 |
|----------|---------|---------|
| pending | `updated_at` 未更新超过 **20 分钟**（排队无进展） | → 标记 expired |
| running | `updated_at` 未更新超过 **30 分钟**（stage 停滞） | → 标记 failed + error `{ code: "STUCK", message: "任务停滞超过30分钟未更新" }` |
| failed（includeFailed=true） | 状态为 failed | → 硬删除，释放阻塞位 |
| completed / expired | — | → 不动 |

**响应：**

```typescript
{
  cleared: number;             // 清理总数
  details: {
    expiredStuck: number;      // 超时 pending → expired
    failedStuck: number;       // 卡住 running → failed
    deletedFailed: number;     // 已失败 → 删除（仅 includeFailed=true）
  };
  remainingActive: number;     // 该用户剩余活跃任务数
}
```

**前端交互：**

- 筛选栏用户 ID 输入框旁加"清理堵塞"按钮
- 点击后弹确认框，展示将清理的任务数量预览（先调 `GET /admin/async-jobs?userId=xxx&stuckOnly=true` 计数）
- 确认后执行清理，成功后自动刷新列表

### 服务层新增方法

在 `src/service/async-job-service.ts` 中新增：

- `listAllAsyncJobs(filters)` — 不加 `visible_to_user` 过滤，支持所有筛选条件 + 分页
- `getAsyncJobStats()` — 聚合查询
- `getAsyncJobWithRelations(id)` — 带子任务和依赖的详情查询
- `clearStuckJobsForUser(userId, scope, projectId, includeFailed)` — 清理堵塞任务

### 路由注册

在 `src/routes/admin-routes.ts` 中导入并调用 `registerAdminAsyncJobsRoutes(app, ctx)`。

---

## 2. 前端页面

### 文件

`apps/web/pages/admin/AsyncJobsManagement.tsx`，单文件（如超 800 行再拆分）。

### 三区域布局

```
┌──────────────────────────────────────────────┐
│  筛选栏（可折叠）                              │
│  [状态▾] [类型▾] [用户ID] [项目ID] [时间]      │
│  [⏱卡住] [ID搜索]           [搜索] [重置]      │
├──────────────────────────────────────────────┤
│  统计卡片 + 图表                               │
│  [总计] [运行中] [失败] [今日]                  │
│  状态饼图        近7天趋势折线图                 │
├──────────────────────────────────────────────┤
│  任务表格 + 分页                               │
│  [☐] ID | 类型 | 状态 | 用户 | 项目 | 时间 | 操作│
│  分页器                                        │
└──────────────────────────────────────────────┘
右侧滑出：任务详情面板
```

### 数据流

```
URL SearchParams ←→ useSearchParams()
       │
       ▼  parseFilters()
  AdminJobFilters
       │
       ├── useQuery(["admin-async-job-stats"]) → 统计卡片 + 图表
       ├── useQuery(["admin-async-jobs", filters]) → JobsTable
       └── 点击行 → setSelectedJobId → useQuery(["admin-async-job", id]) → JobDetailPanel
                        │
                        ▼
                   操作按钮 → useMutation → invalidateQueries(...)
```

### 交互要点

- 所有筛选值编码在 URL search params，刷新不丢失
- 表格行点击 → 右侧滑出详情面板（宽 ~480px）
- 表头 checkbox 全选当前页 → 底部批量操作条
- 状态标签颜色：pending 灰 / running 蓝 / completed 绿 / failed 红 / expired 深灰
- 卡住标记（pending 超 20 分钟 / running 超 30 分钟 `updated_at` 无变化）：行背景泛红 + 警告图标
- 手动刷新按钮，不做自动轮询

### API 客户端

在 `apps/web/services/realApi/admin.ts` 的 `RealAdminApi` 接口和实现对象中新增对应方法。

### 路由注册

- `apps/web/App.tsx`：`React.lazy` 导入 + `<Route path="/admin/async-jobs">`
- `apps/web/components/layout/layoutNavigationController.ts`：`adminSidebarLinks` 追加 `{ to: "/admin/async-jobs", icon: "cloud_sync", label: "异步任务" }`

---

## 3. 错误与边界

| 场景 | 处理 |
|------|------|
| 列表为空 | "暂无匹配的任务"空状态 |
| 网络错误 | TanStack Query isError → "加载失败，点击重试" |
| 删除操作 | 二次确认弹窗，展示将删除数量 |
| 批量操作部分失败 | 返回成功/失败分组，展示结果摘要 |
| 运行中任务被删除 | 后端先 cancel 再 delete |
| JSON 大字段 | 详情面板中折叠式 JSON 树展示 |
| 非 admin 访问 | 前端 RequireAuth + 后端 requireAdmin 双重守卫 |
| 审计日志 | 操作类接口全部写入 nrm_audit_logs |

---

## 4. 实现文件清单

| 文件 | 操作 | 内容 |
|------|------|------|
| `src/routes/admin/async-jobs-routes.ts` | **新建** | 9 个 API 端点的路由注册（stats + list + detail + retry + cancel + update + delete + batch + clearStuck） |
| `src/service/async-job-service.ts` | **修改** | 新增 listAllAsyncJobs、getAsyncJobStats、getAsyncJobWithRelations |
| `src/routes/admin-routes.ts` | **修改** | 导入并调用 registerAdminAsyncJobsRoutes |
| `apps/web/services/realApi/admin.ts` | **修改** | 新增 listAsyncJobs、getAsyncJobStats、getAsyncJobDetail、retryAsyncJob、cancelAsyncJob、updateAsyncJob、deleteAsyncJob、batchAsyncJobs、clearStuckJobs |
| `apps/web/pages/admin/AsyncJobsManagement.tsx` | **新建** | 完整管理页面 |
| `apps/web/App.tsx` | **修改** | 懒加载 + 路由 |
| `apps/web/components/layout/layoutNavigationController.ts` | **修改** | 侧边栏菜单项 |
