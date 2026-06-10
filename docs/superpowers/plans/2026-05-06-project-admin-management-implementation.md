# 项目后台管理系统 Phase 2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现项目管理核心功能（项目列表、项目详情、解锁操作），支持快速定位问题项目并执行干预

**架构：** 后端 API 路由（Fastify）+ 前端管理页面（React + TanStack Query）+ PostgreSQL 数据库查询优化

**技术栈：** TypeScript, Fastify 5, React 18, TanStack Query 5, PostgreSQL, Tailwind CSS

---

## 文件结构

### 后端文件

| 文件路径 | 职责 | 变更类型 |
|---------|------|---------|
| `src/routes/admin/projects-routes.ts` | 项目管理 API 路由（已创建骨架） | 修改 |
| `src/contracts/admin-project-contract.ts` | 项目管理类型定义（新增） | 创建 |

### 前端文件

| 文件路径 | 职责 | 变更类型 |
|---------|------|---------|
| `apps/web/pages/admin/ProjectManagement.tsx` | 项目管理主页面（已创建骨架） | 修改 |
| `apps/web/services/backendApi.ts` | 后端 API 调用封装 | 修改 |
| `apps/web/pages/admin/components/ProjectList.tsx` | 项目列表组件（新增） | 创建 |
| `apps/web/pages/admin/components/ProjectDetailModal.tsx` | 项目详情弹窗（新增） | 创建 |
| `apps/web/pages/admin/components/AnomalyQuickEntry.tsx` | 异常快速入口组件（新增） | 创建 |

---

## 任务 1：完善项目列表 API 实现

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:25-154`
- 新增类型定义到文件头部

**目标：** 实现项目列表查询 API，支持筛选、分页、排序

- [ ] **步骤 1：定义类型接口**

在 `src/routes/admin/projects-routes.ts` 文件顶部添加类型定义：

```typescript
// ========== 类型定义 ==========
interface ProjectListRow {
  id: string;
  title: string;
  project_kind: string;
  status: string;
  last_visited_step: number;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  user_name: string;
  company_name: string;
  thumbnail_url: string;
  publish_title: string;
}

interface ProjectListQuery {
  projectKind?: 'video' | 'image' | 'reverse' | 'outfit_change';
  status?: string;
  companyName?: string;
  anomalyType?: 'stuck' | 'failed_task' | 'slow_step';
  userId?: string;
  timeRange?: 'today' | '7days' | '30days';
  search?: string;
  page?: number;
  pageSize?: number;
}
```

- [ ] **步骤 2：实现时间范围条件构建**

在 GET `/admin/projects` 路由中，替换现有的空实现：

```typescript
// 时间范围条件
let timeCondition = "";
if (query.timeRange === "today") {
  timeCondition = "AND p.created_at >= CURRENT_DATE";
} else if (query.timeRange === "7days") {
  timeCondition = "AND p.created_at >= CURRENT_DATE - INTERVAL '7 days'";
} else if (query.timeRange === "30days") {
  timeCondition = "AND p.created_at >= CURRENT_DATE - INTERVAL '30 days'";
}
```

- [ ] **步骤 3：实现异常筛选条件构建**

```typescript
// 异常筛选条件
let anomalyCondition = "";
if (query.anomalyType === "stuck") {
  anomalyCondition = `AND p.status IN ('STORYBOARDING', 'FILMING', 'FISSIONING')
                      AND p.updated_at < NOW() - INTERVAL '2 hours'`;
} else if (query.anomalyType === "failed_task") {
  anomalyCondition = `AND EXISTS (
    SELECT 1 FROM nrm_async_jobs aj
    WHERE aj.project_id = p.id AND aj.status = 'failed'
  )`;
}
```

- [ ] **步骤 4：构建基础查询 SQL**

```typescript
// 基础查询
const baseQuery = `
  FROM nrm_projects p
  LEFT JOIN nrm_users u ON p.user_id = u.id
  WHERE p.deleted_at IS NULL
    ${query.projectKind ? "AND p.project_kind = $projectKind" : ""}
    ${query.status ? "AND p.status = $status" : ""}
    ${query.userId ? "AND p.user_id = $userId" : ""}
    ${query.search ? "AND (p.title ILIKE $search OR p.id ILIKE $search)" : ""}
    ${query.companyName ? "AND u.company_name = $companyName" : ""}
    ${timeCondition}
    ${anomalyCondition}
`;
```

- [ ] **步骤 5：实现查询总数逻辑**

```typescript
// 查询总数
const countResult = await ctx.pool.query<{ total: string }>(
  `SELECT COUNT(*) as total ${baseQuery}`,
  {
    projectKind: query.projectKind,
    status: query.status,
    userId: query.userId,
    search: query.search ? `%${query.search}%` : undefined,
    companyName: query.companyName,
  }
);
const total = parseInt(countResult.rows[0]?.total || "0");
```

- [ ] **步骤 6：实现查询项目列表逻辑**

```typescript
// 查询项目列表
const result = await ctx.pool.query<ProjectListRow>(
  `SELECT
    p.id,
    p.title,
    p.project_kind,
    p.status,
    p.last_visited_step,
    p.created_at,
    p.updated_at,
    p.user_id,
    u.name as user_name,
    u.company_name,
    COALESCE(p.cover_image_url, p.garment_image_url) as thumbnail_url,
    p.publish_title
  ${baseQuery}
  ORDER BY p.updated_at DESC
  LIMIT $limit OFFSET $offset`,
  {
    projectKind: query.projectKind,
    status: query.status,
    userId: query.userId,
    search: query.search ? `%${query.search}%` : undefined,
    companyName: query.companyName,
    limit: pageSize,
    offset,
  }
);
```

- [ ] **步骤 7：实现 Step 计算函数**

在文件底部添加辅助函数：

```typescript
/**
 * 根据项目状态计算当前 Step
 */
function calculateCurrentStep(status: string, projectKind: string): number {
  if (projectKind === "video") {
    if (status === "DRAFT") return 0;
    if (["GARMENT_UPLOADED", "ROLE_DIRECTION_CONFIRMED", "OUTFIT_SELECTED", "OUTFIT_CONFIRMED"].includes(status)) return 1;
    if (["CHARACTER_VIEW_READY", "CHARACTER_SELECTED", "CHARACTER_CONFIRMED"].includes(status)) return 2;
    if (["SCRIPT_GENERATED", "SCRIPT_SELECTED", "SCRIPT_CONFIRMED", "STORYBOARDING", "STORYBOARD_PREVIEW_COMPLETED"].includes(status)) return 3;
    if (["FILMING"].includes(status)) return 4;
    if (["FISSIONING"].includes(status)) return 6;
    if (["READY_TO_PUBLISH", "PUBLISHED"].includes(status)) return 5;
    return 0;
  } else {
    // 图片项目
    if (status === "IMAGE_DRAFT") return 0;
    if (["IMAGE_GARMENT_UPLOADED", "IMAGE_ROLE_DIRECTION_CONFIRMED", "IMAGE_OUTFIT_SELECTED", "IMAGE_OUTFIT_CONFIRMED"].includes(status)) return 1;
    if (["IMAGE_CHARACTER_VIEW_READY", "IMAGE_CHARACTER_SELECTED", "IMAGE_CHARACTER_CONFIRMED"].includes(status)) return 2;
    if (["IMAGE_MODEL_PHOTOS_READY"].includes(status)) return 3;
    if (["IMAGE_DETAIL_PAGE_GENERATED", "IMAGE_READY_TO_PUBLISH", "IMAGE_PUBLISHED"].includes(status)) return 4;
    return 0;
  }
}
```

- [ ] **步骤 8：构建响应数据**

```typescript
return {
  projects: result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectKind: row.project_kind,
    status: row.status,
    currentStep: calculateCurrentStep(row.status, row.project_kind),
    totalSteps: row.project_kind === "video" ? 6 : 4,
    companyName: row.company_name,
    userId: row.user_id,
    userName: row.user_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    thumbnail: row.thumbnail_url,
    publishTitle: row.publish_title,
  })),
  pagination: {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  },
};
```

- [ ] **步骤 9：编译验证**

运行：`npm run build`
预期：编译成功，无 TypeScript 错误

- [ ] **步骤 10：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat: 实现项目列表 API（筛选、分页、排序）"
```

---

## 任务 2：实现公司列表 API

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:332-346`

**目标：** 实现公司列表查询 API，用于前端下拉筛选

- [ ] **步骤 1：实现公司列表查询**

替换 GET `/admin/companies` 路由的空实现：

```typescript
app.get("/admin/companies", async (request) => {
  const admin = await requireAdmin(ctx, request);

  const result = await ctx.pool.query<{ company_name: string }>(
    `SELECT DISTINCT company_name
    FROM nrm_users
    WHERE company_name IS NOT NULL AND company_name != ''
    ORDER BY company_name`
  );

  return {
    companies: result.rows.map((row) => row.company_name),
  };
});
```

- [ ] **步骤 2：编译验证**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat: 实现公司列表 API"
```

---

## 任务 3：实现异常统计 API

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:403-430`

**目标：** 实现异常项目统计 API，用于前端快速入口展示

- [ ] **步骤 1：实现异常统计查询**

替换 GET `/admin/tasks/anomalies` 路由的空实现：

```typescript
app.get("/admin/tasks/anomalies", async (request) => {
  const admin = await requireAdmin(ctx, request);
  const query = request.query as {
    hours?: number;
  };

  const hours = query.hours || 2;

  // 查询失败任务
  const failedResult = await ctx.pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM nrm_async_jobs
    WHERE status = 'failed'`
  );

  // 查询卡住项目
  const stuckResult = await ctx.pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM nrm_projects
    WHERE deleted_at IS NULL
      AND status IN ('STORYBOARDING', 'FILMING', 'FISSIONING')
      AND updated_at < NOW() - INTERVAL '${hours} hours'`
  );

  return {
    failed: parseInt(failedResult.rows[0]?.count || "0"),
    stuck: parseInt(stuckResult.rows[0]?.count || "0"),
  };
});
```

- [ ] **步骤 2：编译验证**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat: 实现异常统计 API（失败任务、卡住项目）"
```

---

## 任务 4：实现项目详情 API

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:157-231`

**目标：** 实现项目详情查询 API，展示项目完整信息

- [ ] **步骤 1：定义类型接口**

在文件顶部添加类型定义：

```typescript
interface ProjectDetailRow {
  id: string;
  title: string;
  project_kind: string;
  status: string;
  user_id: string;
  user_name: string;
  company_name: string;
  user_email: string;
  cover_image_url: string;
  garment_image_url: string;
  publish_title: string;
  selected_role_direction: any;
  created_at: Date;
  updated_at: Date;
  [key: string]: any;
}

interface TaskRow {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  error: string;
  created_at: Date;
  updated_at: Date;
}

interface CharacterRow {
  id: string;
  library_character_id: string;
  name: string;
  portrait_url: string;
  role: string;
  is_selected: boolean;
}
```

- [ ] **步骤 2：实现项目基本信息查询**

替换 GET `/admin/projects/:id/detail` 路由的空实现：

```typescript
app.get("/admin/projects/:id/detail", async (request) => {
  const admin = await requireAdmin(ctx, request);
  const params = request.params as { id: string };

  // 查询项目基本信息
  const projectResult = await ctx.pool.query<ProjectDetailRow>(
    `SELECT
      p.id,
      p.title,
      p.project_kind,
      p.status,
      p.user_id,
      p.cover_image_url,
      p.garment_image_url,
      p.publish_title,
      p.selected_role_direction,
      p.created_at,
      p.updated_at,
      u.name as user_name,
      u.company_name,
      u.email as user_email
    FROM nrm_projects p
    LEFT JOIN nrm_users u ON p.user_id = u.id
    WHERE p.id = $id AND p.deleted_at IS NULL`,
    { id: params.id }
  );

  if (projectResult.rows.length === 0) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const project = projectResult.rows[0];
```

- [ ] **步骤 3：实现任务列表查询**

```typescript
  // 查询任务列表
  const tasksResult = await ctx.pool.query<TaskRow>(
    `SELECT
      id,
      job_type,
      status,
      progress,
      error,
      created_at,
      updated_at
    FROM nrm_async_jobs
    WHERE project_id = $projectId
    ORDER BY created_at DESC
    LIMIT 20`,
    { projectId: params.id }
  );
```

- [ ] **步骤 4：实现角色关联查询**

```typescript
  // 查询角色关联信息
  const charactersResult = await ctx.pool.query<CharacterRow>(
    `SELECT
      pc.id,
      pc.library_character_id,
      lc.name,
      lc.portrait_url,
      pc.role,
      pc.is_selected
    FROM nrm_project_characters pc
    JOIN nrm_library_characters lc ON pc.library_character_id = lc.id
    WHERE pc.project_id = $projectId AND pc.deleted_at IS NULL
    ORDER BY pc.is_selected DESC, pc.created_at`,
    { projectId: params.id }
  );
```

- [ ] **步骤 5：实现 LLM 调用统计查询**

```typescript
  // 查询资源消耗（LLM 调用次数）
  const llmCallsResult = await ctx.pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
    FROM nrm_provider_call_audits
    WHERE project_id = $projectId`,
    { projectId: params.id }
  );
```

- [ ] **步骤 6：构建响应数据**

```typescript
  return {
    basicInfo: {
      id: project.id,
      title: project.title,
      projectKind: project.project_kind,
      status: project.status,
      currentStep: calculateCurrentStep(project.status, project.project_kind),
      companyName: project.company_name,
      userId: project.user_id,
      userName: project.user_name,
      userEmail: project.user_email,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      coverImageUrl: project.cover_image_url,
      garmentImageUrl: project.garment_image_url,
      publishTitle: project.publish_title,
      selectedRoleDirection: project.selected_role_direction,
    },
    characters: charactersResult.rows,
    tasks: tasksResult.rows,
    resourceConsumption: {
      llmCalls: parseInt(llmCallsResult.rows[0]?.count || "0"),
      imageGenerations: 0,
      videoGenerations: 0,
    },
  };
});
```

- [ ] **步骤 7：编译验证**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 8：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat: 实现项目详情 API（基本信息、任务列表、角色关联）"
```

---

## 任务 5：实现解锁操作 API

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:237-327`

**目标：** 实现解锁操作 API（解锁脚本、角色、服装）

- [ ] **步骤 1：定义操作类型**

确保请求体类型定义正确：

```typescript
const body = request.body as {
  operationType:
    | "unlock_script"
    | "unlock_character"
    | "unlock_outfit"
    | "reset_step"
    | "retry_task"
    | "force_complete"
    | "delete_project";
  reason: string;
  targetStep?: number;
  taskId?: string;
  preview?: boolean;
};
```

- [ ] **步骤 2：实现操作原因验证**

```typescript
if (!body.reason || body.reason.trim().length < 5) {
  throw new AppError(400, "REASON_REQUIRED", "操作原因至少需要 5 个字符");
}

// 验证项目存在
const projectResult = await ctx.pool.query<ProjectDetailRow>(
  `SELECT * FROM nrm_projects WHERE id = $id AND deleted_at IS NULL`,
  { id: params.id }
);

if (projectResult.rows.length === 0) {
  throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
}

const project = projectResult.rows[0];
```

- [ ] **步骤 3：实现解锁脚本操作**

```typescript
let affectedData = { tables: [] as string[], records: 0 };

if (body.operationType === "unlock_script") {
  await ctx.pool.query(
    `UPDATE nrm_projects 
     SET status = 'SCRIPT_SELECTED', updated_at = NOW() 
     WHERE id = $projectId 
       AND status IN ('SCRIPT_CONFIRMED', 'STORYBOARDING', 'STORYBOARD_PREVIEW_COMPLETED')`,
    { projectId: params.id }
  );
  affectedData = { tables: ["nrm_projects"], records: 1 };
}
```

- [ ] **步骤 4：实现解锁角色操作**

```typescript
else if (body.operationType === "unlock_character") {
  await ctx.pool.query(
    `UPDATE nrm_projects 
     SET status = 'CHARACTER_SELECTED', updated_at = NOW() 
     WHERE id = $projectId 
       AND status IN ('CHARACTER_CONFIRMED', 'SCRIPT_GENERATED', 'SCRIPT_SELECTED', 'SCRIPT_CONFIRMED')`,
    { projectId: params.id }
  );
  affectedData = { tables: ["nrm_projects"], records: 1 };
}
```

- [ ] **步骤 5：实现解锁服装操作**

```typescript
else if (body.operationType === "unlock_outfit") {
  await ctx.pool.query(
    `UPDATE nrm_projects 
     SET status = 'OUTFIT_SELECTED', updated_at = NOW() 
     WHERE id = $projectId 
       AND status IN ('OUTFIT_CONFIRMED', 'CHARACTER_VIEW_READY', 'CHARACTER_SELECTED', 'CHARACTER_CONFIRMED')`,
    { projectId: params.id }
  );
  affectedData = { tables: ["nrm_projects"], records: 1 };
}
```

- [ ] **步骤 6：实现其他操作的占位处理**

```typescript
else {
  throw new AppError(501, "NOT_IMPLEMENTED", "功能开发中");
}
```

- [ ] **步骤 7：记录审计日志**

```typescript
// 记录审计日志
await ctx.pool.query(
  `INSERT INTO nrm_admin_operation_logs
  (admin_user_id, project_id, operation_type, operation_detail, reason, affected_data, created_at)
  VALUES ($adminUserId, $projectId, $operationType, $operationDetail, $reason, $affectedData, NOW())`,
  {
    adminUserId: admin.id,
    projectId: params.id,
    operationType: body.operationType,
    operationDetail: JSON.stringify({
      targetStep: body.targetStep,
      taskId: body.taskId,
    }),
    reason: body.reason,
    affectedData: JSON.stringify(affectedData),
  }
);
```

- [ ] **步骤 8：返回响应**

```typescript
return {
  success: true,
  message: "操作成功",
  affectedData,
};
```

- [ ] **步骤 9：编译验证**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 10：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat: 实现解锁操作 API（脚本、角色、服装）"
```

---

## 任务 6：前端 API 封装

**文件：**
- 修改：`apps/web/services/backendApi.ts`

**目标：** 添加项目管理相关 API 调用方法

- [ ] **步骤 1：添加项目列表 API 方法**

在 `backendApi` 对象中添加：

```typescript
// 项目管理 API
listAdminProjects: async (token: string, params: {
  projectKind?: string;
  status?: string;
  companyName?: string;
  anomalyType?: string;
  userId?: string;
  timeRange?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) => {
  const query = new URLSearchParams();
  if (params.projectKind) query.append('projectKind', params.projectKind);
  if (params.status) query.append('status', params.status);
  if (params.companyName) query.append('companyName', params.companyName);
  if (params.anomalyType) query.append('anomalyType', params.anomalyType);
  if (params.userId) query.append('userId', params.userId);
  if (params.timeRange) query.append('timeRange', params.timeRange);
  if (params.search) query.append('search', params.search);
  if (params.page) query.append('page', params.page.toString());
  if (params.pageSize) query.append('pageSize', params.pageSize.toString());

  const response = await fetch(`${API_BASE_URL}/neirongmiao/api/admin/projects?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(response);
},
```

- [ ] **步骤 2：添加项目详情 API 方法**

```typescript
getAdminProjectDetail: async (token: string, projectId: string) => {
  const response = await fetch(`${API_BASE_URL}/neirongmiao/api/admin/projects/${projectId}/detail`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(response);
},
```

- [ ] **步骤 3：添加公司列表 API 方法**

```typescript
listAdminCompanies: async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/neirongmiao/api/admin/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(response);
},
```

- [ ] **步骤 4：添加异常统计 API 方法**

```typescript
getAdminAnomalies: async (token: string, hours?: number) => {
  const query = hours ? `?hours=${hours}` : '';
  const response = await fetch(`${API_BASE_URL}/neirongmiao/api/admin/tasks/anomalies${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(response);
},
```

- [ ] **步骤 5：添加解锁操作 API 方法**

```typescript
performAdminOperation: async (token: string, projectId: string, operation: {
  operationType: string;
  reason: string;
  targetStep?: number;
  taskId?: string;
  preview?: boolean;
}) => {
  const response = await fetch(`${API_BASE_URL}/neirongmiao/api/admin/projects/${projectId}/operations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(operation),
  });
  return handleResponse(response);
},
```

- [ ] **步骤 6：编译前端代码验证**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 7：Commit**

```bash
git add apps/web/services/backendApi.ts
git commit -m "feat: 添加项目管理 API 封装方法"
```

---

## 任务 7：前端项目列表组件实现

**文件：**
- 创建：`apps/web/pages/admin/components/ProjectList.tsx`

**目标：** 实现项目列表组件，接入真实数据

- [ ] **步骤 1：创建项目列表组件文件**

```typescript
/**
 * 项目列表组件
 * 展示项目列表，支持筛选、分页
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../../store/useAppStore';
import { backendApi } from '../../../services/backendApi';

interface ProjectListProps {
  filters: {
    projectKind: string;
    status: string;
    companyName: string;
    anomalyType: string;
    timeRange: string;
  };
}

export const ProjectList: React.FC<ProjectListProps> = ({ filters }) => {
  const { token } = useAppStore();
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-projects', filters, page],
    queryFn: () => backendApi.listAdminProjects(token!, { ...filters, page, pageSize }),
    enabled: !!token,
  });

  if (isLoading) {
    return <div className="p-6 text-center">加载中...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-500">加载失败</div>;
  }

  const projects = data?.projects || [];
  const pagination = data?.pagination;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 表头 */}
      <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
        <div className="col-span-1">缩略图</div>
        <div className="col-span-2">标题/ID</div>
        <div className="col-span-2">公司</div>
        <div className="col-span-1">用户</div>
        <div className="col-span-1">类型</div>
        <div className="col-span-2">状态</div>
        <div className="col-span-2">Step</div>
        <div className="col-span-1">操作</div>
      </div>

      {/* 项目列表 */}
      {projects.map((project: any) => (
        <div
          key={project.id}
          className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 items-center"
        >
          <div className="col-span-1">
            <img
              src={project.thumbnail || '/placeholder.png'}
              alt={project.title}
              className="w-12 h-12 rounded object-cover bg-gray-200"
            />
          </div>
          <div className="col-span-2">
            <div className="font-medium text-gray-900">
              {project.publishTitle || project.title}
            </div>
            <div className="text-xs text-gray-500">{project.id}</div>
          </div>
          <div className="col-span-2 text-sm text-gray-600">{project.companyName}</div>
          <div className="col-span-1 text-sm text-gray-600">{project.userName}</div>
          <div className="col-span-1">
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
              {project.projectKind === 'video' ? '视频' : '图片'}
            </span>
          </div>
          <div className="col-span-2">
            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
              {project.status}
            </span>
          </div>
          <div className="col-span-2">
            <StepProgress current={project.currentStep} total={project.totalSteps} />
          </div>
          <div className="col-span-1">
            <button className="p-2 rounded hover:bg-gray-100">
              <span className="material-icons-round text-gray-600">more_vert</span>
            </button>
          </div>
        </div>
      ))}

      {/* 空状态 */}
      {projects.length === 0 && (
        <div className="px-4 py-12 text-center text-gray-500">
          <span className="material-icons-round text-4xl">folder_open</span>
          <p className="mt-2">暂无项目</p>
        </div>
      )}

      {/* 分页 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, pagination.total)} / 共 {pagination.total} 条
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-3 py-1">{page} / {pagination.totalPages}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === pagination.totalPages}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const StepProgress: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-medium ${
            step < current
              ? 'bg-green-500 text-white'
              : step === current
              ? 'bg-blue-500 text-white animate-pulse'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {step}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **步骤 2：编译验证**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/admin/components/ProjectList.tsx
git commit -m "feat: 实现项目列表组件"
```

---

## 任务 8：前端异常快速入口组件实现

**文件：**
- 创建：`apps/web/pages/admin/components/AnomalyQuickEntry.tsx`

**目标：** 实现异常快速入口组件，展示异常统计

- [ ] **步骤 1：创建异常快速入口组件文件**

```typescript
/**
 * 异常快速入口组件
 * 展示异常项目统计，支持快速筛选
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../../store/useAppStore';
import { backendApi } from '../../../services/backendApi';

interface AnomalyQuickEntryProps {
  onAnomalyClick: (type: 'stuck' | 'failed_task') => void;
}

export const AnomalyQuickEntry: React.FC<AnomalyQuickEntryProps> = ({ onAnomalyClick }) => {
  const { token } = useAppStore();

  const { data } = useQuery({
    queryKey: ['admin-anomalies'],
    queryFn: () => backendApi.getAdminAnomalies(token!),
    enabled: !!token,
    refetchInterval: 30000, // 每 30 秒刷新
  });

  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        onClick={() => onAnomalyClick('stuck')}
        className="bg-white rounded-lg border border-gray-200 p-4 hover:border-red-300 hover:shadow-md transition-all group text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <span className="material-icons-round text-red-600">error_outline</span>
          </div>
          <div>
            <div className="text-sm text-gray-500">卡住项目</div>
            <div className="text-2xl font-bold text-gray-900">{data?.stuck || 0}</div>
          </div>
        </div>
      </button>

      <button
        onClick={() => onAnomalyClick('failed_task')}
        className="bg-white rounded-lg border border-gray-200 p-4 hover:border-red-300 hover:shadow-md transition-all group text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <span className="material-icons-round text-red-600">report_problem</span>
          </div>
          <div>
            <div className="text-sm text-gray-500">失败任务</div>
            <div className="text-2xl font-bold text-gray-900">{data?.failed || 0}</div>
          </div>
        </div>
      </button>
    </div>
  );
};
```

- [ ] **步骤 2：编译验证**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/admin/components/AnomalyQuickEntry.tsx
git commit -m "feat: 实现异常快速入口组件"
```

---

## 任务 9：集成到项目管理主页面

**文件：**
- 修改：`apps/web/pages/admin/ProjectManagement.tsx`

**目标：** 将新组件集成到项目管理主页面

- [ ] **步骤 1：导入新组件**

在文件顶部添加导入：

```typescript
import { ProjectList } from './components/ProjectList';
import { AnomalyQuickEntry } from './components/AnomalyQuickEntry';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../services/backendApi';
```

- [ ] **步骤 2：添加状态管理**

在 `ProjectManagement` 组件中添加状态：

```typescript
const [filters, setFilters] = useState({
  projectKind: '',
  status: '',
  companyName: '',
  anomalyType: '',
  timeRange: '30days',
});
```

- [ ] **步骤 3：加载公司列表**

```typescript
const { token } = useAppStore();
const { data: companiesData } = useQuery({
  queryKey: ['admin-companies'],
  queryFn: () => backendApi.listAdminCompanies(token!),
  enabled: !!token,
});
const companies = companiesData?.companies || [];
```

- [ ] **步骤 4：实现异常快速入口点击处理**

```typescript
const handleAnomalyClick = (type: 'stuck' | 'failed_task') => {
  setFilters({ ...filters, anomalyType: type });
};
```

- [ ] **步骤 5：替换主内容区**

```typescript
{/* 主内容区 */}
<div className="flex-1 overflow-y-auto p-6">
  <div className="max-w-7xl mx-auto space-y-6">
    {/* 异常快速入口 */}
    <AnomalyQuickEntry onAnomalyClick={handleAnomalyClick} />

    {/* 筛选栏 */}
    <ProjectFilterBar
      filters={filters}
      setFilters={setFilters}
      companies={companies}
    />

    {/* 项目列表 */}
    <ProjectList filters={filters} />
  </div>
</div>
```

- [ ] **步骤 6：更新筛选栏组件**

更新 `ProjectFilterBar` 组件，使用真实公司数据：

```typescript
const ProjectFilterBar: React.FC<{
  filters: any;
  setFilters: any;
  companies: string[];
}> = ({ filters, setFilters, companies }) => {
  // ... 保持原有实现，将 companies 映射到下拉选项
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="grid grid-cols-6 gap-4">
        {/* 项目类型 */}
        <select
          value={filters.projectKind}
          onChange={(e) => setFilters({ ...filters, projectKind: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">全部类型</option>
          <option value="video">视频项目</option>
          <option value="image">图片项目</option>
        </select>

        {/* 公司 */}
        <select
          value={filters.companyName}
          onChange={(e) => setFilters({ ...filters, companyName: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">全部公司</option>
          {companies.map((company) => (
            <option key={company} value={company}>{company}</option>
          ))}
        </select>

        {/* 异常筛选 */}
        <select
          value={filters.anomalyType}
          onChange={(e) => setFilters({ ...filters, anomalyType: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">全部项目</option>
          <option value="stuck">卡住项目</option>
          <option value="failed_task">失败任务</option>
        </select>

        {/* 时间范围 */}
        <select
          value={filters.timeRange}
          onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="today">今日</option>
          <option value="7days">近 7 天</option>
          <option value="30days">近 30 天</option>
        </select>

        {/* 重置按钮 */}
        <button
          onClick={() => setFilters({
            projectKind: '',
            status: '',
            companyName: '',
            anomalyType: '',
            timeRange: '30days',
          })}
          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          重置
        </button>
      </div>
    </div>
  );
};
```

- [ ] **步骤 7：编译验证**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 8：Commit**

```bash
git add apps/web/pages/admin/ProjectManagement.tsx
git commit -m "feat: 集成项目管理组件到主页面"
```

---

## 任务 10：测试与优化

**目标：** 测试完整功能流程，优化性能和体验

- [ ] **步骤 1：启动开发服务器**

运行：
```bash
# 终端 1：启动后端
PERSISTENCE_REQUIRE_READY=false npm run dev

# 终端 2：启动前端
npm --prefix apps/web run dev
```

预期：服务正常启动

- [ ] **步骤 2：访问管理后台**

1. 打开浏览器访问 `http://localhost:3000`
2. 登录管理员账号
3. 点击顶部导航栏"管理后台"
4. 点击侧边栏"项目管理"

预期：项目管理页面正常显示

- [ ] **步骤 3：测试项目列表功能**

1. 检查项目列表是否正确加载
2. 测试筛选功能（项目类型、公司、异常筛选）
3. 测试分页功能

预期：所有功能正常

- [ ] **步骤 4：测试异常快速入口**

1. 点击"卡住项目"卡片
2. 检查筛选是否正确应用

预期：快速入口功能正常

- [ ] **步骤 5：性能优化检查**

1. 打开浏览器开发者工具 Network 面板
2. 检查 API 请求响应时间
3. 确认项目列表加载时间 < 1s

预期：性能达标

- [ ] **步骤 6：最终 Commit**

```bash
git add .
git commit -m "test: 项目管理功能测试通过"
```

---

## 验收标准

### 功能验收
- ✅ 项目列表页能正确展示项目列表
- ✅ 筛选条件能正确过滤项目
- ✅ 异常快速入口能正确定位问题项目
- ✅ 公司下拉能正确加载公司列表
- ✅ 分页功能正常工作

### 性能验收
- ✅ 项目列表加载 < 1s
- ✅ 异常统计实时刷新（30 秒间隔）

### 代码质量
- ✅ TypeScript 类型完整
- ✅ 无编译错误
- ✅ 遵循现有代码风格
