# 日志管理后台实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为后台管理系统新增统一的日志管理功能，支持错误日志、LLM调用审计、操作审计的查询、统计、详情查看和导出。

**架构：** 单页面多 Tab 模式，后端新增 `logs-routes.ts` 整合三种日志 API，前端新增 `LogsManagement.tsx` 主页面及子组件，复用现有的 Repository 和 Store。

**技术栈：** Fastify 5 + TypeScript + PostgreSQL（后端），React 18 + TanStack Query + Tailwind CSS（前端）

---

## 文件结构

| 文件 | 职责 | 状态 |
|------|------|------|
| `src/routes/admin/logs-routes.ts` | 后端日志管理路由（6个新API） | 创建 |
| `src/repositories/pg/error-log-pg-repository.ts:232` | 新增 `findById` 方法 | 修改 |
| `src/routes/admin-routes.ts:132` | 注册 logs-routes | 修改 |
| `apps/web/pages/admin/LogsManagement.tsx` | 主页面容器（Tab切换） | 创建 |
| `apps/web/pages/admin/logs/ErrorLogTab.tsx` | 错误日志表格与统计 | 创建 |
| `apps/web/pages/admin/logs/CallAuditTab.tsx` | LLM调用审计表格 | 创建 |
| `apps/web/pages/admin/logs/AuditLogTab.tsx` | 操作审计表格 | 创建 |
| `apps/web/pages/admin/logs/LogDetailModal.tsx` | 详情弹窗 | 创建 |
| `apps/web/pages/admin/logs/LogsFilterBar.tsx` | 筛选栏组件 | 创建 |
| `apps/web/pages/admin/logs/LogsStatsCards.tsx` | 统计卡片 | 创建 |
| `apps/web/pages/admin/logs/LogsExportButton.tsx` | 导出按钮 | 创建 |
| `apps/web/services/realApi/admin.ts` | 新增日志 API 调用方法 | 修改 |
| `apps/web/components/layout/layoutNavigationController.ts:39` | 新增导航入口 | 修改 |
| `apps/web/App.tsx:280` | 新增路由定义 | 修改 |

---

### 任务 1：后端 - 扩展 ErrorLogRepository

**文件：**
- 修改：`src/repositories/pg/error-log-pg-repository.ts:232`（文件末尾新增方法）

- [ ] **步骤 1：新增 findById 方法**

在 `PgErrorLogRepository` 类末尾新增方法：

```typescript
/**
 * 根据 ID 查找错误日志
 */
async findById(id: string): Promise<ErrorLog | null> {
  const result = await this.pool.query(
    `SELECT * FROM ${this.tableName} WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：无编译错误

- [ ] **步骤 3：Commit**

```bash
git add src/repositories/pg/error-log-pg-repository.ts
git commit -m "feat(error-log): add findById method for single log retrieval"
```

---

### 任务 2：后端 - 创建 logs-routes.ts

**文件：**
- 创建：`src/routes/admin/logs-routes.ts`

- [ ] **步骤 1：创建日志管理路由文件**

```typescript
/**
 * 日志管理后台路由
 * 整合错误日志、LLM调用审计、操作审计的查询与导出
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ErrorLogFilters, ErrorSeverity } from "../../contracts/error-log-contract.js";
import { requireAdmin } from "../../services/auth/route-guards.js";

/** 统一查询参数类型 */
interface LogsQueryParams {
  page?: number;
  pageSize?: number;
  startDate?: number;
  endDate?: number;
  keyword?: string;
  severity?: ErrorSeverity;
  errorCode?: string;
  provider?: string;
  userId?: string;
}

/** 导出请求体类型 */
interface LogsExportRequest {
  type: "error" | "llm" | "audit";
  filters: LogsQueryParams;
  format: "csv" | "json";
}

/** 注册日志管理路由 */
export async function registerLogsRoutes(
  app: FastifyInstance,
  ctx: AppContext
): Promise<void> {
  // ---- 错误日志详情 ----
  app.get("/admin/error-logs/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const log = await ctx.repos.errorLogs.findById(id);
    if (!log) {
      return reply.code(404).send({ error: "日志不存在" });
    }
    reply.send(log);
  });

  // ---- LLM 调用审计列表 ----
  app.get("/admin/call-audits", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as LogsQueryParams;
    const limit = query.pageSize ?? 20;
    const offset = ((query.page ?? 1) - 1) * limit;
    
    // 时间范围筛选
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(query.startDate);
      paramIndex++;
    }
    if (query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(query.endDate);
      paramIndex++;
    }
    if (query.provider) {
      conditions.push(`provider = $${paramIndex}`);
      values.push(query.provider);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const result = await ctx.auditStore.pool.query(
      `SELECT * FROM nrm_provider_call_audits ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    const totalResult = await ctx.auditStore.pool.query(
      `SELECT COUNT(*) as total FROM nrm_provider_call_audits ${whereClause}`,
      values
    );

    reply.send({
      items: result.rows,
      total: Number(totalResult.rows[0].total),
      page: query.page ?? 1,
      pageSize: limit,
    });
  });

  // ---- LLM 调用审计统计 ----
  app.get("/admin/call-audits/stats", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as { startDate?: number; endDate?: number };
    
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(query.startDate);
      paramIndex++;
    }
    if (query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(query.endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 成功率统计
    const successResult = await ctx.auditStore.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as success_count,
        AVG(latency_ms) as avg_latency,
        SUM(tokens_used) as total_tokens
      FROM nrm_provider_call_audits ${whereClause}`,
      values
    );

    const row = successResult.rows[0];
    reply.send({
      total: Number(row.total),
      successCount: Number(row.success_count),
      successRate: row.total > 0 ? Number(row.success_count) / Number(row.total) : 0,
      avgLatency: row.avg_latency ? Number(row.avg_latency) : 0,
      totalTokens: row.total_tokens ? Number(row.total_tokens) : 0,
    });
  });

  // ---- LLM 调用审计详情 ----
  app.get("/admin/call-audits/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const audit = await ctx.auditStore.findCallAudit(id);
    if (!audit) {
      return reply.code(404).send({ error: "审计记录不存在" });
    }
    reply.send(audit);
  });

  // ---- 操作审计日志列表 ----
  app.get("/admin/audit-logs", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as LogsQueryParams;
    const limit = query.pageSize ?? 20;
    const offset = ((query.page ?? 1) - 1) * limit;

    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(query.startDate);
      paramIndex++;
    }
    if (query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(query.endDate);
      paramIndex++;
    }
    if (query.userId) {
      conditions.push(`user_id = $${paramIndex}`);
      values.push(query.userId);
      paramIndex++;
    }
    if (query.keyword) {
      conditions.push(`(action ILIKE $${paramIndex} OR resource_type ILIKE $${paramIndex})`);
      values.push(`%${query.keyword}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await ctx.auditStore.pool.query(
      `SELECT * FROM nrm_audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    const totalResult = await ctx.auditStore.pool.query(
      `SELECT COUNT(*) as total FROM nrm_audit_logs ${whereClause}`,
      values
    );

    reply.send({
      items: result.rows,
      total: Number(totalResult.rows[0].total),
      page: query.page ?? 1,
      pageSize: limit,
    });
  });

  // ---- 操作审计日志详情 ----
  app.get("/admin/audit-logs/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const result = await ctx.auditStore.pool.query(
      `SELECT * FROM nrm_audit_logs WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "审计日志不存在" });
    }
    reply.send(result.rows[0]);
  });

  // ---- 日志导出 ----
  app.post("/admin/logs/export", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = request.body as LogsExportRequest;
    const { type, filters, format } = body;

    // 根据 type 获取数据
    let data: Record<string, unknown>[] = [];
    if (type === "error") {
      data = await ctx.repos.errorLogs.findByFilters({
        ...filters,
        page: 1,
        pageSize: 10000, // 导出最多 10000 条
      });
    } else if (type === "llm") {
      const result = await ctx.auditStore.pool.query(
        `SELECT * FROM nrm_provider_call_audits ORDER BY created_at DESC LIMIT 10000`
      );
      data = result.rows;
    } else if (type === "audit") {
      const result = await ctx.auditStore.pool.query(
        `SELECT * FROM nrm_audit_logs ORDER BY created_at DESC LIMIT 10000`
      );
      data = result.rows;
    }

    // 格式化输出
    const filename = `logs-${type}-export-${new Date().toISOString().split("T")[0]}`;
    
    if (format === "csv") {
      // CSV 格式化
      const headers = Object.keys(data[0] || {});
      const csvRows = [
        headers.join(","),
        ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","))
      ];
      const csvContent = csvRows.join("\n");
      
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}.csv"`)
        .send(csvContent);
    } else {
      reply
        .header("Content-Type", "application/json")
        .header("Content-Disposition", `attachment; filename="${filename}.json"`)
        .send(JSON.stringify(data, null, 2));
    }
  });
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：无编译错误

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin/logs-routes.ts
git commit -m "feat(logs): create logs-routes with 6 new APIs for logs management"
```

---

### 任务 3：后端 - 注册 logs-routes

**文件：**
- 修改：`src/routes/admin-routes.ts:132`（文件末尾）

- [ ] **步骤 1：导入并注册 logs-routes**

在文件头部添加导入：

```typescript
import { registerLogsRoutes } from "./admin/logs-routes.js";
```

在 `registerAdminRoutes` 函数末尾（第 132 行前）添加：

```typescript
registerLogsRoutes(app, ctx);
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：无编译错误

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin-routes.ts
git commit -m "feat(admin): register logs-routes in admin routes"
```

---

### 任务 4：前端 - 新增导航入口

**文件：**
- 修改：`apps/web/components/layout/layoutNavigationController.ts:39`

- [ ] **步骤 1：新增日志管理导航项**

在 `adminSidebarLinks` 数组末尾（第 47 行后）添加：

```typescript
{ to: "/admin/logs", icon: "history", label: "日志管理" },
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/components/layout/layoutNavigationController.ts
git commit -m "feat(nav): add logs management to admin sidebar"
```

---

### 任务 5：前端 - 新增 App.tsx 路由

**文件：**
- 修改：`apps/web/App.tsx:280`（admin 路由区域）

- [ ] **步骤 1：新增日志管理路由**

在 admin 路由区域添加路由定义：

```tsx
<Route
  path="/admin/logs"
  element={
    <RequireAuth>
      <Layout hideSidebar>
        <LazyPage>
          <LogsManagement />
        </LazyPage>
      </Layout>
    </RequireAuth>
  }
/>
```

同时在文件顶部 lazy imports 区域添加：

```tsx
const LogsManagement = lazy(() => import('./pages/admin/LogsManagement'));
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/App.tsx
git commit -m "feat(routes): add logs management route in App.tsx"
```

---

### 任务 6：前端 - 新增 admin.ts API 方法

**文件：**
- 修改：`apps/web/services/realApi/admin.ts`

- [ ] **步骤 1：新增日志 API 调用方法**

在 `RealAdminApi` interface 中添加类型定义：

```typescript
/** 日志管理 API */
errorLogsList(token: string, filters: ErrorLogFilters): Promise<{ items: ErrorLog[]; page: number; pageSize: number }>;
errorLogDetail(token: string, id: string): Promise<ErrorLog>;
errorLogsStatsByCode(token: string, startDate: number, endDate: number, severity?: string): Promise<ErrorCodeCountResult[]>;
errorLogsStatsByDate(token: string, startDate: number, endDate: number, severity?: string): Promise<DateCountResult[]>;
callAuditsList(token: string, filters: CallAuditsFilters): Promise<{ items: ProviderCallAudit[]; total: number; page: number; pageSize: number }>;
callAuditsStats(token: string, startDate?: number, endDate?: number): Promise<CallAuditsStats>;
callAuditDetail(token: string, id: string): Promise<ProviderCallAudit>;
auditLogsList(token: string, filters: AuditLogsFilters): Promise<{ items: AuditLog[]; total: number; page: number; pageSize: number }>;
auditLogDetail(token: string, id: string): Promise<AuditLog>;
logsExport(token: string, payload: LogsExportRequest): Promise<void>;
```

在文件末尾添加实现方法：

```typescript
// ---- 日志管理 ----
async errorLogsList(token: string, filters: ErrorLogFilters) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.startDate) params.set("startDate", String(filters.startDate));
  if (filters.endDate) params.set("endDate", String(filters.endDate));
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.errorCode) params.set("errorCode", filters.errorCode);
  return request(`/admin/error-logs?${params}`, token);
}

async errorLogDetail(token: string, id: string) {
  return request(`/admin/error-logs/${id}`, token);
}

async errorLogsStatsByCode(token: string, startDate: number, endDate: number, severity?: string) {
  const params = new URLSearchParams();
  params.set("startDate", String(startDate));
  params.set("endDate", String(endDate));
  if (severity) params.set("severity", severity);
  return request(`/admin/error-logs/stats/by-code?${params}`, token);
}

async errorLogsStatsByDate(token: string, startDate: number, endDate: number, severity?: string) {
  const params = new URLSearchParams();
  params.set("startDate", String(startDate));
  params.set("endDate", String(endDate));
  if (severity) params.set("severity", severity);
  return request(`/admin/error-logs/stats/by-date?${params}`, token);
}

async callAuditsList(token: string, filters: CallAuditsFilters) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.startDate) params.set("startDate", String(filters.startDate));
  if (filters.endDate) params.set("endDate", String(filters.endDate));
  if (filters.provider) params.set("provider", filters.provider);
  return request(`/admin/call-audits?${params}`, token);
}

async callAuditsStats(token: string, startDate?: number, endDate?: number) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", String(startDate));
  if (endDate) params.set("endDate", String(endDate));
  return request(`/admin/call-audits/stats?${params}`, token);
}

async callAuditDetail(token: string, id: string) {
  return request(`/admin/call-audits/${id}`, token);
}

async auditLogsList(token: string, filters: AuditLogsFilters) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.startDate) params.set("startDate", String(filters.startDate));
  if (filters.endDate) params.set("endDate", String(filters.endDate));
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.keyword) params.set("keyword", filters.keyword);
  return request(`/admin/audit-logs?${params}`, token);
}

async auditLogDetail(token: string, id: string) {
  return request(`/admin/audit-logs/${id}`, token);
}

async logsExport(token: string, payload: LogsExportRequest) {
  const response = await fetch("/neirongmiao/api/admin/logs/export", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("导出失败");
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "logs-export";
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/services/realApi/admin.ts
git commit -m "feat(api): add logs management API methods"
```

---

### 任务 7：前端 - 创建 LogsManagement 主页面

**文件：**
- 创建：`apps/web/pages/admin/LogsManagement.tsx`

- [ ] **步骤 1：创建主页面容器组件**

```tsx
/**
 * 日志管理主页面
 * Tab切换：错误日志、LLM调用、操作审计
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { LogsFilterBar } from './logs/LogsFilterBar';
import { ErrorLogTab } from './logs/ErrorLogTab';
import { CallAuditTab } from './logs/CallAuditTab';
import { AuditLogTab } from './logs/AuditLogTab';
import { LogsExportButton } from './logs/LogsExportButton';

type LogType = 'error' | 'llm' | 'audit';

export const LogsManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const logType = (searchParams.get('type') as LogType) || 'error';
  
  const { token } = useAppStore();
  const [filters, setFilters] = useState({
    startDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // 默认近 7 天
    endDate: Date.now(),
    keyword: '',
    page: 1,
    pageSize: 20,
  });

  const handleTabChange = (type: LogType) => {
    setSearchParams({ type });
    setFilters(prev => ({ ...prev, page: 1 })); // 切换 Tab 重置页码
  };

  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">日志管理</h1>
        <LogsExportButton token={token} logType={logType} filters={filters} />
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => handleTabChange('error')}
          className={`px-4 py-2 rounded-lg font-medium ${
            logType === 'error'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          错误日志
        </button>
        <button
          onClick={() => handleTabChange('llm')}
          className={`px-4 py-2 rounded-lg font-medium ${
            logType === 'llm'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          LLM调用
        </button>
        <button
          onClick={() => handleTabChange('audit')}
          className={`px-4 py-2 rounded-lg font-medium ${
            logType === 'audit'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          操作审计
        </button>
      </div>

      {/* 筛选栏 */}
      <LogsFilterBar filters={filters} onChange={handleFilterChange} />

      {/* Tab 内容 */}
      <div className="mt-6">
        {logType === 'error' && (
          <ErrorLogTab
            token={token}
            filters={filters}
            onPageChange={handlePageChange}
          />
        )}
        {logType === 'llm' && (
          <CallAuditTab
            token={token}
            filters={filters}
            onPageChange={handlePageChange}
          />
        )}
        {logType === 'audit' && (
          <AuditLogTab
            token={token}
            filters={filters}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
};

export default LogsManagement;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误（注意：子组件尚未创建，编译会报错，这是预期行为，后续任务会修复）

- [ ] **步骤 3：暂不 Commit**

子组件尚未创建，等待任务 8-14 完成后统一 Commit。

---

### 任务 8：前端 - 创建 LogsFilterBar 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/LogsFilterBar.tsx`

- [ ] **步骤 1：创建筛选栏组件**

```tsx
/**
 * 日志筛选栏组件
 * 时间范围、关键词搜索
 */
import React from 'react';

interface LogsFilterBarProps {
  filters: {
    startDate: number;
    endDate: number;
    keyword: string;
  };
  onChange: (filters: Partial<{ startDate: number; endDate: number; keyword: string }>) => void;
}

export const LogsFilterBar: React.FC<LogsFilterBarProps> = ({ filters, onChange }) => {
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const timestamp = new Date(value).getTime();
    onChange({ [field]: timestamp });
  };

  const handleKeywordChange = (value: string) => {
    onChange({ keyword: value });
  };

  const handleReset = () => {
    onChange({
      startDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
      endDate: Date.now(),
      keyword: '',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-center">
      {/* 时间范围 */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">开始时间:</label>
        <input
          type="date"
          value={new Date(filters.startDate).toISOString().split('T')[0]}
          onChange={(e) => handleDateChange('startDate', e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>
      
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">结束时间:</label>
        <input
          type="date"
          value={new Date(filters.endDate).toISOString().split('T')[0]}
          onChange={(e) => handleDateChange('endDate', e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>

      {/* 关键词搜索 */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">关键词:</label>
        <input
          type="text"
          value={filters.keyword}
          onChange={(e) => handleKeywordChange(e.target.value)}
          placeholder="搜索消息/路径"
          className="border rounded px-3 py-1.5 text-sm w-48"
        />
      </div>

      {/* 重置按钮 */}
      <button
        onClick={handleReset}
        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded"
      >
        重置
      </button>
    </div>
  );
};
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：暂不 Commit**

等待所有组件完成后统一 Commit。

---

### 任务 9：前端 - 创建 LogsStatsCards 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/LogsStatsCards.tsx`

- [ ] **步骤 1：创建统计卡片组件**

```tsx
/**
 * 统计卡片组件
 * 展示错误日志统计数据
 */
import React from 'react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: 'blue' | 'red' | 'yellow' | 'green';
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  green: 'bg-green-50 text-green-600',
};

export const LogsStatsCards: React.FC<{ stats: StatsCardProps[] }> = ({ stats }) => {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.title}
          className={`${colorClasses[stat.color]} rounded-lg p-4 shadow-sm`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons text-xl">{stat.icon}</span>
            <span className="text-sm font-medium">{stat.title}</span>
          </div>
          <div className="text-2xl font-bold">{stat.value}</div>
        </div>
      ))}
    </div>
  );
};

export default LogsStatsCards;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：暂不 Commit**

等待所有组件完成后统一 Commit。

---

### 任务 10：前端 - 创建 ErrorLogTab 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/ErrorLogTab.tsx`

- [ ] **步骤 1：创建错误日志 Tab 组件**

```tsx
/**
 * 错误日志 Tab 组件
 * 表格展示 + 统计卡片 + 详情弹窗
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../../services/backendApi';
import { LogsStatsCards } from './LogsStatsCards';
import { LogDetailModal } from './LogDetailModal';

interface ErrorLogTabProps {
  token: string;
  filters: {
    startDate: number;
    endDate: number;
    keyword: string;
    page: number;
    pageSize: number;
  };
  onPageChange: (page: number) => void;
}

export const ErrorLogTab: React.FC<ErrorLogTabProps> = ({ token, filters, onPageChange }) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // 查询错误日志列表
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['errorLogs', filters],
    queryFn: () => backendApi.admin.errorLogsList(token, filters),
  });

  // 查询统计数据
  const { data: statsByCode } = useQuery({
    queryKey: ['errorLogsStatsByCode', filters.startDate, filters.endDate],
    queryFn: () => backendApi.admin.errorLogsStatsByCode(token, filters.startDate, filters.endDate),
  });

  const { data: statsByDate } = useQuery({
    queryKey: ['errorLogsStatsByDate', filters.startDate, filters.endDate],
    queryFn: () => backendApi.admin.errorLogsStatsByDate(token, filters.startDate, filters.endDate),
  });

  // 统计卡片数据
  const statsCards = [
    {
      title: '总错误数',
      value: statsByDate?.reduce((sum: number, item: any) => sum + item.count, 0) || 0,
      icon: 'error',
      color: 'red' as const,
    },
    {
      title: '今日错误',
      value: statsByDate?.find((item: any) => {
        const today = new Date().toISOString().split('T')[0];
        return item.date === today;
      })?.count || 0,
      icon: 'today',
      color: 'yellow' as const,
    },
    {
      title: 'Top 错误码',
      value: statsByCode?.[0]?.errorCode || '-',
      icon: 'code',
      color: 'blue' as const,
    },
    {
      title: '严重错误',
      value: statsByCode?.filter((item: any) => item.severity === 'critical')?.reduce((sum: number, item: any) => sum + item.count, 0) || 0,
      icon: 'warning',
      color: 'red' as const,
    },
  ];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div>
      {/* 统计卡片 */}
      <LogsStatsCards stats={statsCards} />

      {/* 表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">错误码</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">消息</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">API路径</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">级别</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logsData?.items?.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-800">{log.errorCode}</td>
                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{log.errorMessage}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.apiPath || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          log.severity === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : log.severity === 'warn'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelectedLogId(log.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div className="text-sm text-gray-600">
                共 {logsData?.items?.length || 0} 条
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onPageChange(filters.page - 1)}
                  disabled={filters.page <= 1}
                  className="px-3 py-1 rounded bg-gray-100 disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="px-3 py-1">{filters.page}</span>
                <button
                  onClick={() => onPageChange(filters.page + 1)}
                  disabled={logsData?.items?.length < filters.pageSize}
                  className="px-3 py-1 rounded bg-gray-100 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedLogId && (
        <LogDetailModal
          token={token}
          logId={selectedLogId}
          logType="error"
          onClose={() => setSelectedLogId(null)}
        />
      )}
    </div>
  );
};

export default ErrorLogTab;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：暂不 Commit**

等待所有组件完成后统一 Commit。

---

### 任务 11：前端 - 创建 CallAuditTab 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/CallAuditTab.tsx`

- [ ] **步骤 1：创建 LLM 调用审计 Tab 组件**

```tsx
/**
 * LLM 调用审计 Tab 组件
 * 表格展示 + 统计数据
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../../services/backendApi';
import { LogsStatsCards } from './LogsStatsCards';
import { LogDetailModal } from './LogDetailModal';

interface CallAuditTabProps {
  token: string;
  filters: {
    startDate: number;
    endDate: number;
    keyword: string;
    page: number;
    pageSize: number;
  };
  onPageChange: (page: number) => void;
}

export const CallAuditTab: React.FC<CallAuditTabProps> = ({ token, filters, onPageChange }) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // 查询调用审计列表
  const { data: auditsData, isLoading } = useQuery({
    queryKey: ['callAudits', filters],
    queryFn: () => backendApi.admin.callAuditsList(token, filters),
  });

  // 查询统计数据
  const { data: stats } = useQuery({
    queryKey: ['callAuditsStats', filters.startDate, filters.endDate],
    queryFn: () => backendApi.admin.callAuditsStats(token, filters.startDate, filters.endDate),
  });

  // 统计卡片数据
  const statsCards = [
    {
      title: '总调用数',
      value: stats?.total || 0,
      icon: 'api',
      color: 'blue' as const,
    },
    {
      title: '成功率',
      value: `${(stats?.successRate * 100 || 0).toFixed(1)}%`,
      icon: 'check_circle',
      color: 'green' as const,
    },
    {
      title: '平均耗时',
      value: `${Math.round(stats?.avgLatency || 0)}ms`,
      icon: 'speed',
      color: 'blue' as const,
    },
    {
      title: 'Token消耗',
      value: stats?.totalTokens || 0,
      icon: 'token',
      color: 'yellow' as const,
    },
  ];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div>
      {/* 统计卡片 */}
      <LogsStatsCards stats={statsCards} />

      {/* 表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Provider</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Model</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">耗时</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Token</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditsData?.items?.map((audit: any) => (
                  <tr key={audit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(audit.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{audit.provider}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{audit.model}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{audit.latencyMs}ms</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{audit.tokensUsed || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          audit.success
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {audit.success ? '成功' : '失败'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelectedLogId(audit.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div className="text-sm text-gray-600">
                共 {auditsData?.total || 0} 条
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onPageChange(filters.page - 1)}
                  disabled={filters.page <= 1}
                  className="px-3 py-1 rounded bg-gray-100 disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="px-3 py-1">{filters.page}</span>
                <button
                  onClick={() => onPageChange(filters.page + 1)}
                  disabled={auditsData?.items?.length < filters.pageSize}
                  className="px-3 py-1 rounded bg-gray-100 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedLogId && (
        <LogDetailModal
          token={token}
          logId={selectedLogId}
          logType="llm"
          onClose={() => setSelectedLogId(null)}
        />
      )}
    </div>
  );
};

export default CallAuditTab;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：暂不 Commit**

等待所有组件完成后统一 Commit。

---

### 任务 12：前端 - 创建 AuditLogTab 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/AuditLogTab.tsx`

- [ ] **步骤 1：创建操作审计 Tab 组件**

```tsx
/**
 * 操作审计 Tab 组件
 * 表格展示用户操作记录
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../../services/backendApi';
import { LogDetailModal } from './LogDetailModal';

interface AuditLogTabProps {
  token: string;
  filters: {
    startDate: number;
    endDate: number;
    keyword: string;
    page: number;
    pageSize: number;
  };
  onPageChange: (page: number) => void;
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({ token, filters, onPageChange }) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // 查询操作审计列表
  const { data: auditsData, isLoading } = useQuery({
    queryKey: ['auditLogs', filters],
    queryFn: () => backendApi.admin.auditLogsList(token, filters),
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div>
      {/* 表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">用户</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">资源类型</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">资源ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditsData?.items?.map((audit: any) => (
                  <tr key={audit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(audit.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{audit.userId || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{audit.action}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{audit.resourceType || '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{audit.resourceId || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelectedLogId(audit.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div className="text-sm text-gray-600">
                共 {auditsData?.total || 0} 条
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onPageChange(filters.page - 1)}
                  disabled={filters.page <= 1}
                  className="px-3 py-1 rounded bg-gray-100 disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="px-3 py-1">{filters.page}</span>
                <button
                  onClick={() => onPageChange(filters.page + 1)}
                  disabled={auditsData?.items?.length < filters.pageSize}
                  className="px-3 py-1 rounded bg-gray-100 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedLogId && (
        <LogDetailModal
          token={token}
          logId={selectedLogId}
          logType="audit"
          onClose={() => setSelectedLogId(null)}
        />
      )}
    </div>
  );
};

export default AuditLogTab;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：暂不 Commit**

等待所有组件完成后统一 Commit。

---

### 任务 13：前端 - 创建 LogDetailModal 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/LogDetailModal.tsx`

- [ ] **步骤 1：创建详情弹窗组件**

```tsx
/**
 * 日志详情弹窗组件
 * 三种日志类型共用
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../../services/backendApi';

interface LogDetailModalProps {
  token: string;
  logId: string;
  logType: 'error' | 'llm' | 'audit';
  onClose: () => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({ token, logId, logType, onClose }) => {
  // 根据类型查询详情
  const { data: logDetail, isLoading } = useQuery({
    queryKey: ['logDetail', logType, logId],
    queryFn: () => {
      if (logType === 'error') {
        return backendApi.admin.errorLogDetail(token, logId);
      } else if (logType === 'llm') {
        return backendApi.admin.callAuditDetail(token, logId);
      } else {
        return backendApi.admin.auditLogDetail(token, logId);
      }
    },
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  // JSON 格式化展示
  const renderJsonSection = (title: string, data: any) => {
    if (!data) return null;
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">{title}</h4>
        <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64">
          {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {logType === 'error' ? '错误日志详情' : logType === 'llm' ? 'LLM调用详情' : '操作审计详情'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          {isLoading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : logDetail ? (
            <>
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">ID</label>
                  <div className="text-sm font-mono text-gray-800">{logDetail.id}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">时间</label>
                  <div className="text-sm text-gray-800">{formatDate(logDetail.createdAt)}</div>
                </div>
                
                {logType === 'error' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500">错误码</label>
                      <div className="text-sm font-mono text-gray-800">{logDetail.errorCode}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">级别</label>
                      <div className="text-sm text-gray-800">{logDetail.severity}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">API路径</label>
                      <div className="text-sm text-gray-800">{logDetail.apiPath || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">错误消息</label>
                      <div className="text-sm text-gray-800">{logDetail.errorMessage}</div>
                    </div>
                  </>
                )}

                {logType === 'llm' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500">Provider</label>
                      <div className="text-sm text-gray-800">{logDetail.provider}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Model</label>
                      <div className="text-sm text-gray-800">{logDetail.model}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">耗时</label>
                      <div className="text-sm text-gray-800">{logDetail.latencyMs}ms</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">状态</label>
                      <div className="text-sm">
                        <span className={logDetail.success ? 'text-green-600' : 'text-red-600'}>
                          {logDetail.success ? '成功' : '失败'}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {logType === 'audit' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500">用户ID</label>
                      <div className="text-sm text-gray-800">{logDetail.userId || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">操作</label>
                      <div className="text-sm text-gray-800">{logDetail.action}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">资源类型</label>
                      <div className="text-sm text-gray-800">{logDetail.resourceType || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">资源ID</label>
                      <div className="text-sm text-gray-800">{logDetail.resourceId || '-'}</div>
                    </div>
                  </>
                )}
              </div>

              {/* JSON 详情展示 */}
              {logType === 'error' && renderJsonSection('错误堆栈', logDetail.errorStack)}
              {logType === 'error' && renderJsonSection('输入参数', logDetail.inputParams)}
              {logType === 'llm' && renderJsonSection('请求消息', logDetail.messagesJson)}
              {logType === 'llm' && renderJsonSection('响应内容', logDetail.responseJson)}
              {logType === 'audit' && renderJsonSection('详情', logDetail.details)}
            </>
          ) : (
            <div className="text-center text-gray-500 py-8">日志不存在</div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogDetailModal;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：暂不 Commit**

等待所有组件完成后统一 Commit。

---

### 任务 14：前端 - 创建 LogsExportButton 组件

**文件：**
- 创建：`apps/web/pages/admin/logs/LogsExportButton.tsx`

- [ ] **步骤 1：创建导出按钮组件**

```tsx
/**
 * 日志导出按钮组件
 */
import React, { useState } from 'react';
import { backendApi } from '../../../services/backendApi';

interface LogsExportButtonProps {
  token: string;
  logType: 'error' | 'llm' | 'audit';
  filters: {
    startDate: number;
    endDate: number;
    keyword: string;
  };
}

export const LogsExportButton: React.FC<LogsExportButtonProps> = ({ token, logType, filters }) => {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  const handleExport = async () => {
    setExporting(true);
    try {
      await backendApi.admin.logsExport(token, {
        type: logType,
        filters,
        format,
      });
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* 格式选择 */}
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}
        className="border rounded px-3 py-1.5 text-sm"
      >
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>

      {/* 导出按钮 */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {exporting ? (
          <>
            <span className="material-icons animate-spin text-sm">refresh</span>
            <span>导出中...</span>
          </>
        ) : (
          <>
            <span className="material-icons text-sm">download</span>
            <span>导出</span>
          </>
        )}
      </button>
    </div>
  );
};

export default LogsExportButton;
```

- [ ] **步骤 2：验证前端编译**

运行：`npm --prefix apps/web run build`
预期：无编译错误

- [ ] **步骤 3：Commit 所有前端组件**

```bash
git add apps/web/pages/admin/LogsManagement.tsx apps/web/pages/admin/logs/
git commit -m "feat(ui): add logs management page with all components"
```

---

### 任务 15：验证与测试

**文件：**
- 无文件修改，验证功能

- [ ] **步骤 1：启动后端服务**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`

- [ ] **步骤 2：启动前端服务**

运行：`npm --prefix apps/web run dev`

- [ ] **步骤 3：访问日志管理页面**

浏览器访问：`http://localhost:3000/admin/logs`

验证：
1. 导航栏显示"日志管理"入口
2. 页面加载成功，三个 Tab 可切换
3. 筛选栏时间范围可调整
4. 错误日志表格显示数据
5. 点击"详情"弹窗正常打开
6. 导出按钮点击触发下载

- [ ] **步骤 4：最终 Commit**

```bash
git add -A
git commit -m "feat: complete logs management backend and frontend implementation"
```

---

## 规格覆盖度检查

| 规格需求 | 任务覆盖 |
|---------|---------|
| 路由 `/admin/logs` | 任务 5 |
| 导航入口新增 | 任务 4 |
| 错误日志列表（已有） | 无需修改 |
| 错误日志详情 API | 任务 1、2 |
| LLM调用审计列表 API | 任务 2 |
| LLM调用审计统计 API | 任务 2 |
| LLM调用审计详情 API | 任务 2 |
| 操作审计列表 API | 任务 2 |
| 操作审计详情 API | 任务 2 |
| 导出 API | 任务 2 |
| 前端主页面 LogsManagement | 任务 7 |
| 筛选栏组件 | 任务 8 |
| 统计卡片组件 | 任务 9 |
| 错误日志 Tab | 任务 10 |
| LLM调用 Tab | 任务 11 |
| 操作审计 Tab | 任务 12 |
| 详情弹窗 | 任务 13 |
| 导出按钮 | 任务 14 |
| requireAdmin 验证 | 任务 2（所有 API） |
| TanStack Query 状态管理 | 任务 10-14 |
| URL query Tab 类型 | 任务 7 |