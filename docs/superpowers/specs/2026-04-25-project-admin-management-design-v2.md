# 项目后台管理系统设计规格

**版本**: 2.1（基于当前代码结构验证更新）
**日期**: 2026-04-28
**作者**: Claude
**状态**: 设计阶段（部分基础设施已就绪）

---

## 1. 概述

### 1.1 项目背景

内容猫（neirongmiao）是一个 AI 电商短视频/图片生成平台：
- **视频项目**: 6 步工作流（服装上传 → 角色定妆 → 脚本分镜 → 视频生成 → 发布 → 裂变）
- **图片项目**: 4 步工作流（服装搭配 → 角色定妆 → 模特图生成 → 详情页生成）

随着项目规模增长，管理员需要一个专业的后台管理系统，用于：
- **快速定位问题项目**（核心痛点）
- **高效干预异常状态**
- **数据辅助决策**

### 1.2 设计目标优先级

**基于实际管理场景重新排序**：

| 优先级 | 目标 | 核心价值 |
|--------|------|---------|
| **P0** | 快速定位问题 | 异常项目实时监控、Step 关键节点追踪、任务状态可视化 |
| **P1** | 高效干预能力 | 一键解锁/重置、批量清理失败任务、操作影响范围预览 |
| **P2** | 数据辅助决策 | 项目创建/完成趋势、Step 流失率分析、成本消耗统计 |

**为什么调整？**
原设计将"数据洞察"放在首位，但管理后台的核心用户是运营/客服人员，他们的核心痛点是"快速定位问题项目并干预"，而非"看统计数据"。

---

## 2. 当前代码结构分析

### 2.1 核心数据表

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `nrm_projects` | 项目主表 | `project_kind`, `status`, `last_visited_step`, `user_id` |
| `nrm_users` | 用户表 | `company_name`（公司名称字段） |
| `nrm_async_jobs` | **任务表（已存在）** | `job_type`, `status`, `project_id`, `error` |
| `nrm_step4_video_scenes` | Step4 分镜 | `clip_status`, `clip_progress`, `error_message` |
| `nrm_final_videos` | 成片 | Step4 合成视频和裂变视频 |
| `nrm_provider_call_audits` | LLM 调用审计 | 31 列完整调用记录 |

**重要发现**：
- ✅ **任务表结构完整**：`nrm_async_jobs` 已包含 `project_id` 字段
- ✅ **不需要新建工作流状态表**：已被废弃，状态直接在项目表
- ⚠️ **需要补充管理操作日志表**：`nrm_admin_operation_logs`（审计管理干预）
- ⚠️ **需要补充查询优化索引**：项目列表和任务查询性能优化

### 2.2 项目状态系统

**视频项目状态（16 个）**：
```typescript
VIDEO_PROJECT_STATUS_ORDER = [
  "DRAFT",
  "GARMENT_UPLOADED",           // Step1: 服饰已上传
  "ROLE_DIRECTION_CONFIRMED",   // Step1: 角色方向已确认
  "OUTFIT_SELECTED",            // Step1: 穿搭已选择
  "OUTFIT_CONFIRMED",           // Step1: 穿搭已确认（进入 Step2）
  "CHARACTER_VIEW_READY",       // Step2: 角色视图就绪
  "CHARACTER_SELECTED",
  "CHARACTER_CONFIRMED",        // Step2: 角色已确认（进入 Step3）
  "SCRIPT_GENERATED",
  "SCRIPT_SELECTED",
  "SCRIPT_CONFIRMED",           // Step3: 脚本已确认（进入 Step4）
  "STORYBOARDING",              // Step3: 分镜制作
  "STORYBOARD_PREVIEW_COMPLETED",
  "FILMING",                    // Step4: 视频生成
  "FISSIONING",                 // Step6: 裂变
  "READY_TO_PUBLISH",
  "PUBLISHED"
];
```

**图片项目状态（12 个）**：
```typescript
IMAGE_PROJECT_STATUS_ORDER = [
  "IMAGE_DRAFT",
  "IMAGE_GARMENT_UPLOADED",
  "IMAGE_ROLE_DIRECTION_CONFIRMED",
  "IMAGE_OUTFIT_SELECTED",
  "IMAGE_OUTFIT_CONFIRMED",
  "IMAGE_CHARACTER_VIEW_READY",
  "IMAGE_CHARACTER_SELECTED",
  "IMAGE_CHARACTER_CONFIRMED",  // 进入 Step3
  "IMAGE_MODEL_PHOTOS_READY",   // Step3: 模特图就绪
  "IMAGE_DETAIL_PAGE_GENERATED", // Step4: 详情页生成
  "IMAGE_READY_TO_PUBLISH",
  "IMAGE_PUBLISHED"
];
```

**Step 锁定机制**（已实现）：
```typescript
// src/contracts/types.ts
isVideoStatusBeyond(current, threshold)  // 判断是否已越过指定阶段
isImageStatusBeyond(current, threshold)  // 图片项目版本

// 应用场景：当 status > SCRIPT_CONFIRMED（进入 STORYBOARDING 及之后）
// Step3 变为只读，用户可回访但不能修改
```

### 2.3 任务类型

**`nrm_async_jobs.job_type` 已有类型**：

| job_type | 对应 Step | 说明 |
|----------|----------|------|
| `step4_video` | Step4 | 视频分镜生成 |
| `step2_five_view` | Step2 | 角色五视图生成 |
| `llm_reverse` | 反推 | LLM 反推任务 |
| `step6_fission_*` | Step6 | 裂变相关任务 |

**任务状态流转**：
```
pending → running → completed
   ↓         ↓
expired   failed
```

### 2.4 现有管理架构

**管理页面目录**：`apps/web/pages/admin/`（14+ 页面）

**侧边栏菜单**：`layoutNavigationController.ts`
```typescript
adminSidebarLinks = [
  { to: "/admin", label: "管理后台" },
  { to: "/admin/model-management", label: "大模型管理" },
  { to: "/admin/logs", label: "日志管理" },
  { to: "/admin/files", label: "文件注册中心" },
  { to: "/admin/deleted-data", label: "数据清理" },
  // ... 共 15+ 项
];
```

**权限守卫**：`requireAdmin(ctx, request)` - 检查 `user.role === "admin"`

**可复用组件模式**：
- `LogsFilterBar` - 时间范围 + 关键词筛选
- `LogsExportButton` - 导出功能
- `Pagination` - 分页
- Tab 结构模式（LogsManagement 有 3 Tab）
- TanStack Query + Mutation + invalidateQueries

---

## 3. 数据库设计

### 3.1 新增表（最小化）

**管理操作日志表**：
```sql
CREATE TABLE nrm_admin_operation_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  project_id VARCHAR(50),
  operation_type VARCHAR(50) NOT NULL,
    -- 'unlock_script', 'unlock_character', 'unlock_outfit',
    -- 'reset_step', 'retry_task', 'force_complete', 'delete_project'
  operation_detail JSONB,       -- 操作详情
  reason TEXT,                  -- 操作原因（必填）
  affected_data JSONB,          -- 受影响的数据快照
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_admin_user ON nrm_admin_operation_logs (admin_user_id);
CREATE INDEX idx_project ON nrm_admin_operation_logs (project_id);
CREATE INDEX idx_created_at ON nrm_admin_operation_logs (created_at DESC);

COMMENT ON TABLE nrm_admin_operation_logs IS '管理员干预操作审计日志';
```

### 3.2 现有表索引补充

**需要补充的索引**：

```sql
-- ============================================
-- 异步任务查询优化
-- ============================================

-- 按项目 + 状态查询（项目详情页任务列表）
CREATE INDEX IF NOT EXISTS idx_async_jobs_project_status
ON nrm_async_jobs (project_id, status);

-- 按类型 + 状态查询（异常任务筛选）
CREATE INDEX IF NOT EXISTS idx_async_jobs_type_status
ON nrm_async_jobs (job_type, status);

-- ============================================
-- 项目列表查询优化
-- ============================================

-- 按状态 + 类型筛选
CREATE INDEX IF NOT EXISTS idx_projects_status_kind
ON nrm_projects (status, project_kind);

-- 按更新时间排序
CREATE INDEX IF NOT EXISTS idx_projects_updated_at
ON nrm_projects (updated_at DESC);

-- ============================================
-- 公司筛选优化
-- ============================================

-- 按公司名称筛选
CREATE INDEX IF NOT EXISTS idx_users_company_name
ON nrm_users (company_name);
```

**索引用途说明**：

| 索引 | 用途 | 典型查询场景 |
|------|------|-------------|
| `idx_async_jobs_project_status` | 项目任务列表 | 项目详情页查看该项目的所有任务 |
| `idx_async_jobs_type_status` | 异常任务筛选 | 按任务类型筛选失败/卡住任务 |
| `idx_projects_status_kind` | 项目列表筛选 | 按状态和类型筛选项目 |
| `idx_projects_updated_at` | 项目列表排序 | 按最近更新时间排序 |
| `idx_users_company_name` | 公司维度筛选 | 按公司名称筛选项目/统计 |

**公司筛选查询策略**：
```sql
-- 获取公司下拉选项（去重）
SELECT DISTINCT company_name FROM nrm_users WHERE company_name IS NOT NULL ORDER BY company_name;

-- 按公司名称筛选项目
SELECT p.* FROM nrm_projects p
JOIN nrm_users u ON p.user_id = u.id
WHERE u.company_name = :companyName
ORDER BY p.updated_at DESC;
```

---

## 4. 功能设计

### 4.1 页面结构

```
/admin/projects（项目管理入口）
├── /admin/projects/list          - 项目列表（核心页面）
├── /admin/projects/:id/detail    - 项目详情
└── /admin/projects/statistics    - 统计分析（P2）
```

### 4.2 项目列表页（P0）

**核心功能**：快速定位问题项目

**布局结构**：
```
┌──────────────────────────────────────────────────────────────┐
│ 📋 项目管理                                   [导出数据]     │
├──────────────────────────────────────────────────────────────┤
│ 筛选栏                                                        │
│ [项目类型▼] [状态▼] [公司▼] [异常筛选▼] [用户搜索...]        │
│ [时间范围▼]                                   [重置] [筛选]   │
├──────────────────────────────────────────────────────────────┤
│ 异常快速入口                                                  │
│ 🔴 卡住项目(3)  🔴 失败任务(12)  ⚠️ 高耗时(5)               │
├──────────────────────────────────────────────────────────────┤
│ 项目列表                                                      │
│ 缩略图 │ 标题/ID │ 公司   │ 用户 │ 类型 │ 状态 │ Step │ 操作│
│ ┌──┐  │ #1247   │ XX科技 │ 张三 │ 视频 │ 卡住 │ [4⚠️]│ ⋮  │
│ │▶️│  │ 春季新品│        │      │      │      │      │     │
│ └──┘  │         │        │      │      │      │      │     │
├──────────────────────────────────────────────────────────────┤
│ 显示 1-20 / 共 1,247 条          [<] 1 2 3 ... 63 [>]       │
└──────────────────────────────────────────────────────────────┘
```

**筛选维度**：

| 筛选项 | 类型 | 说明 |
|--------|------|------|
| 项目类型 | 下拉 | 视频/图片/反推/换装 |
| 状态 | 下拉 | 16 种视频状态 / 12 种图片状态 |
| 公司 | 下拉 | 用户所属公司（从 `nrm_users.company_name` 获取） |
| 异常筛选 | 下拉 | 卡住/失败任务/高耗时 |
| 用户搜索 | 输入框 | 用户 ID 或用户名搜索 |
| 时间范围 | 下拉 | 今日/近7天/近30天 |

**异常快速入口**（核心创新）：

| 入口 | 查询条件 | 用途 |
|------|---------|------|
| 🔴 卡住项目 | `status` 包含 STORYBOARDING/FILMING 且 `updated_at < now() - 2h` | 快速定位长时间未进展项目 |
| 🔴 失败任务 | `nrm_async_jobs.status = 'failed'` | 快速定位失败任务 |
| ⚠️ 高耗时 | 单 Step 耗时 > 预期 × 2 | 性能异常项目 |

**Step 进度可视化**：
```
视频项目：[1][2][3][4][5][6]
图片项目：[1][2][3][4]

状态标识：
✅ 已完成（绿色）  🔄 进行中（蓝色动画）
⚠️ 异常（黄色）   ❌ 失败（红色）
⏳ 待处理（灰色） 🔒 已锁定（深灰）
```

**行操作菜单（⋮）**：

| 操作 | 说明 | 风险等级 |
|------|------|---------|
| 📋 查看详情 | 项目详情页 | 🟢 低 |
| 🔄 重置到 Step N | 回退到指定步骤 | 🔴 高 |
| 🧹 清理失败任务 | 清理卡住/失败任务 | 🟢 低 |
| 📤 导出数据 | 导出项目数据 | 🟢 低 |
| 🗑️ 删除项目 | 永久删除 | 🔴 高 |

> **注意**：解锁操作（解锁脚本/角色/服装）暂不实现。如需修改已锁定的内容，使用"重置到指定 Step"即可。

### 4.3 项目详情页（P0）

**核心功能**：Step 关键节点追踪 + 任务状态可视化

**布局结构**：
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 项目详情 #1247                              [返回列表]  │
├─────────────────────────────────────────────────────────────┤
│ 📹 春季新品推广视频  🟡 STORYBOARDING  Step 4/6            │
│ 公司: XX科技  |  用户: 张三  |  创建: 2026-04-17 14:23    │
│ 耗时: 2h 15m                              [🔧 干预操作]    │
├─────────────────────────────────────────────────────────────┤
│ Step 执行时间轴                      │ 关键数据面板         │
│                                     │                      │
│ Step1 ✅ 04-17 14:30 (15分钟)       │ Step4 分镜状态       │
│  └─ 服装: 3件 搭配: 2套             │ ├─ 已生成: 8帧 ✅    │
│                                     │ ├─ 进行中: 3帧 🔄    │
│ Step2 ✅ 04-17 15:45 (1小时)        │ ├─ 失败: 1帧 ❌      │
│  └─ 角色: 1个 五视图: ✅            │ └─ 进度: 67%         │
│                                     │                      │
│ Step3 ✅ 04-17 16:20 (35分钟)       │ 任务列表             │
│  └─ 脚本: 3版本 分镜: 12帧          │ ├─ task_001 ✅ 12m   │
│                                     │ ├─ task_002 ✅ 3m    │
│ Step4 ⚠️ 04-18 09:00 (卡住 2h)      │ ├─ task_003 🔄 8m    │
│  └─ ⚠️ 分镜生成卡住                 │ └─ task_004 ❌ 15m   │
│                                     │                      │
│ Step5 ⏳ 待处理                     │ [查看全部任务 →]      │
│ Step6 ⏳ 待处理                     │                      │
│                                     │ 资源消耗             │
│                                     │ LLM: 23次 图片: 15张 │
└─────────────────────────────────────────────────────────────┘
```

**干预操作面板**：
```
┌─────────────────────────────────────────────────────────────┐
│ 🔧 干预操作                                                  │
├─────────────────────────────────────────────────────────────┤
│ 当前状态: STORYBOARDING (分镜制作中)                         │
│                                                             │
│ [解锁脚本选择]  - 解锁 Step3，允许用户重新选择脚本           │
│ [重置到 Step3]  - 回退到 Step3，清除 Step4+ 数据            │
│ [清理失败任务]  - 清理 task_004 失败任务                    │
│                                                             │
│ ⚠️ 操作影响预览：                                           │
│ 重置到 Step3 将清除：                                       │
│ ├─ Step4 分镜数据（8帧）                                    │
│ ├─ Step4 任务记录（4个）                                    │
│ └─ Step5/6 相关数据                                         │
│                                                             │
│ 操作原因: [必填] _________________________________________ │
│                                             [确认] [取消]   │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 业务逻辑定义（核心）

**解锁操作影响范围**：

| 操作 | 影响范围 | 数据清理策略 |
|------|---------|-------------|
| 解锁脚本选择（Step3） | 不清除 Step4+ 数据 | 仅将 `status` 回退到 `SCRIPT_SELECTED`，用户可重新选择脚本版本，已生成的分镜保留（用户可选择重新生成或继续使用） |
| 解锁角色选择（Step2） | 不清除 Step3+ 数据 | 仅将 `status` 回退到 `CHARACTER_SELECTED`，角色变更后需提示用户"脚本可能需要重新生成" |
| 解锁服装搭配（Step1） | 不清除 Step2+ 数据 | 仅将 `status` 回退到 `OUTFIT_SELECTED`，服装变更后需提示用户"角色和脚本可能需要调整" |

**重置操作影响范围**：

| 操作 | 影响范围 | 数据清理策略 |
|------|---------|-------------|
| 重置到 Step3 | 清除 Step4-6 数据 | 软删除 `nrm_step4_video_scenes`、`nrm_final_videos`、`nrm_async_jobs`（job_type=step4_video），保留审计日志 |
| 重置到 Step2 | 清除 Step3-6 数据 | 软删除 `nrm_script_data`、Step4+ 数据，保留审计日志 |
| 重置到 Step1 | 清除 Step2-6 数据 | 软删除角色、脚本、视频相关数据，保留审计日志 |

**详细回滚操作手册**：参见 [`docs/buss/table/project-rollback-operations.md`](../../buss/table/project-rollback-operations.md)

**并发操作处理**：
```typescript
// 乐观锁：每次操作前检查 updated_at
async function performAdminOperation(projectId: string, operation: string) {
  const project = await getProject(projectId);
  const originalUpdatedAt = project.updated_at;

  // 执行操作...
  const result = await updateProject(projectId, data, {
    where: { updated_at: originalUpdatedAt }  // 乐观锁条件
  });

  if (result.affectedRows === 0) {
    throw new Error('项目已被其他操作修改，请刷新后重试');
  }
}
```

**操作失败处理**：

| 失败场景 | 处理策略 |
|---------|---------|
| 数据库写入失败 | 回滚事务，返回错误信息，不记录审计日志 |
| 文件删除失败 | 记录错误日志，标记为"部分成功"，需要人工介入 |
| 乐观锁冲突 | 返回"项目已被修改，请刷新后重试" |

### 4.5 统计分析页（P2）

**延后实现，支持公司维度统计**：

#### 4.5.1 基础统计维度

| 统计功能 | 展示形式 | 数据源 |
|---------|---------|--------|
| 项目创建/完成趋势 | 折线图 | `nrm_projects` 按时间聚合 |
| Step 流失率分析 | 漏斗图 | 各 Step 状态流转统计 |
| 成本消耗统计 | 柱状图 | `nrm_provider_call_audits` |
| 数据导出功能 | - | CSV/Excel 导出 |

#### 4.5.2 公司维度统计（新增）

**公司筛选器**：
- 全局公司下拉选择（支持多选）
- 与项目列表页共用公司数据源

**公司维度报表**：

| 统计项 | 展示形式 | 说明 |
|-------|---------|------|
| 公司项目分布 | 饼图/表格 | 各公司项目数量占比 |
| 公司项目趋势 | 多折线图 | 按公司分组的时间趋势对比 |
| 公司流失率对比 | 分组漏斗图 | 各公司 Step 流失率对比 |
| 公司成本排行 | 横向柱状图 | 成本消耗 Top 10 公司 |
| 公司活跃度 | 表格 | 项目数、完成数、成功率、平均耗时 |

**公司活跃度表格字段**：

```
┌──────────────┬────────┬────────┬─────────┬──────────┐
│ 公司名称      │ 项目数 │ 完成数 │ 成功率  │ 平均耗时  │
├──────────────┼────────┼────────┼─────────┼──────────┤
│ XX科技        │ 156    │ 142    │ 91.0%   │ 2h 15m   │
│ YY传媒        │ 89     │ 76     │ 85.4%   │ 3h 42m   │
│ ZZ电商        │ 45     │ 38     │ 84.4%   │ 1h 58m   │
└──────────────┴────────┴────────┴─────────┴──────────┘
```

#### 4.5.3 统计 API 设计（预定义）

```typescript
// GET /api/admin/stats/overview
interface StatsOverviewRequest {
  companyName?: string;     // 单公司筛选
  companyNames?: string[];  // 多公司筛选
  timeRange: '7days' | '30days' | '90days' | 'custom';
  startDate?: string;
  endDate?: string;
}

interface StatsOverviewResponse {
  totalProjects: number;
  completedProjects: number;
  successRate: number;
  avgDuration: number;
  companyBreakdown: CompanyStat[];  // 公司维度统计
}

interface CompanyStat {
  companyName: string;
  projectCount: number;
  completedCount: number;
  successRate: number;
  avgDuration: number;
  costAmount: number;
}

// GET /api/admin/stats/trend
interface StatsTrendRequest {
  metric: 'projects' | 'cost' | 'duration';
  groupBy: 'day' | 'week' | 'month';
  companyName?: string;
  companyNames?: string[];
  timeRange: string;
}

// GET /api/admin/stats/funnel
interface StatsFunnelRequest {
  companyName?: string;
  timeRange: string;
}

interface StatsFunnelResponse {
  steps: FunnelStep[];
  companyBreakdown?: Record<string, FunnelStep[]>;  // 按公司分组
}
```

#### 4.5.4 数据查询策略

```sql
-- 公司项目分布统计
SELECT
  u.company_name,
  COUNT(p.id) as project_count,
  COUNT(CASE WHEN p.status = 'COMPLETED' THEN 1 END) as completed_count,
  AVG(EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/3600) as avg_duration_hours
FROM nrm_projects p
JOIN nrm_users u ON p.user_id = u.id
WHERE p.created_at >= :startDate
GROUP BY u.company_name
ORDER BY project_count DESC;

-- 公司成本统计
SELECT
  u.company_name,
  SUM(a.cost_amount) as total_cost,
  COUNT(a.id) as call_count
FROM nrm_provider_call_audits a
JOIN nrm_projects p ON a.project_id = p.id
JOIN nrm_users u ON p.user_id = u.id
WHERE a.created_at >= :startDate
GROUP BY u.company_name
ORDER BY total_cost DESC;
```

---

## 5. API 设计

### 5.1 统一操作接口（核心创新）

**合并分散的操作接口**：
```typescript
// 单一入口，降低维护成本
POST /admin/projects/:id/operations

// 请求体
{
  operationType: 'unlock_script' | 'unlock_character' | 'unlock_outfit'
               | 'reset_step' | 'retry_task' | 'force_complete';
  reason: string;           // 操作原因（必填）
  targetStep?: number;      // reset_step 时必填
  taskId?: string;          // retry_task 时必填
  preview?: boolean;        // 是否仅预览影响范围（默认 false）
}

// 响应体
{
  success: boolean;
  message: string;
  affectedData?: {          // preview=true 或操作成功后返回
    tables: string[];       // 受影响的表
    records: number;        // 受影响的记录数
    files?: string[];       // 受影响的文件
  };
}
```

### 5.2 项目查询接口

**GET /admin/projects**
```typescript
{
  projectKind?: 'video' | 'image' | 'reverse' | 'outfit_change';
  status?: string;          // VideoProjectStatus 或 ImageProjectStatus
  companyName?: string;     // 公司名称筛选（新增）
  anomalyType?: 'stuck' | 'failed_task' | 'slow_step';
  userId?: string;
  timeRange?: 'today' | '7days' | '30days';
  search?: string;
  page?: number;
  pageSize?: number;
}
```

**GET /admin/projects/:id/detail**
```typescript
{
  basicInfo: {
    id: string;
    title: string;
    projectKind: string;
    status: string;
    currentStep: number;
    companyName?: string;   // 公司名称（新增）
    userId: string;
    userName: string;
    createdAt: string;
    updatedAt: string;
  };
  stepTimeline: {
    step: number;
    status: 'completed' | 'running' | 'failed' | 'pending';
    startTime: string;
    endTime?: string;
    duration?: number;
    keyData: Record<string, any>;
  }[];
  tasks: AsyncJobRecord[];
  resourceConsumption: {
    llmCalls: number;
    imageGenerations: number;
    videoGenerations: number;
  };
}
```

**GET /admin/companies**
```typescript
// 获取公司下拉选项（新增）
{
  companies: string[];  // 去重后的公司名称列表
}
```

### 5.3 任务查询接口

**GET /admin/projects/:id/tasks**
```typescript
{
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'expired';
  jobType?: 'step4_video' | 'step2_five_view' | 'llm_reverse';
}
```

**GET /admin/tasks/anomalies**
```typescript
{
  type?: 'failed' | 'stuck';  // stuck = running 且 updated_at < now() - 1h
  hours?: number;             // 卡住时长阈值
}
```

---

## 6. 异步任务管理（独立模块）

> **详细设计参见**：[`2026-04-27-async-jobs-admin-design.md`](./2026-04-27-async-jobs-admin-design.md)

异步任务管理是一个独立的后台管理模块，与项目管理互补：

| 模块 | 入口 | 核心功能 |
|------|------|---------|
| 项目管理 | `/admin/projects` | 项目状态监控、Step 回滚、数据清理 |
| 异步任务管理 | `/admin/async-jobs` | 任务状态监控、批量操作、清理堵塞 |

**关联关系**：
- 项目详情页可跳转到该项目关联的任务列表
- 任务管理页可反向查看任务所属项目
- 共享 `nrm_async_jobs` 表和索引

---

## 7. 前端实现

### 7.1 路由配置

```typescript
// apps/web/App.tsx
<Route path="/admin/projects" element={<AdminProjectsLayout />}>
  <Route index element={<Navigate to="list" replace />} />
  <Route path="list" element={<AdminProjectsList />} />
  <Route path=":id/detail" element={<AdminProjectDetail />} />
  <Route path="statistics" element={<AdminProjectsStatistics />} />
</Route>
```

### 7.2 菜单配置

```typescript
// layoutNavigationController.ts - adminSidebarLinks 添加
{ to: "/admin/projects", icon: "folder", label: "项目管理" },
{ to: "/admin/async-jobs", icon: "cloud_sync", label: "异步任务" },
```

### 7.3 复用现有模式

**权限检查**：
```tsx
const { currentUser, token } = useAppStore();
const canAccess = currentUser?.role === "admin" && Boolean(token);
if (!canAccess) {
  return <Layout><div>需要管理员权限</div></Layout>;
}
```

**TanStack Query**：
```tsx
const projectsQuery = useQuery({
  queryKey: ["admin-projects", filters],
  queryFn: () => adminProjectsApi.listProjects(token!, filters),
  staleTime: 30000,
});

const operationMutation = useMutation({
  mutationFn: (op: OperationRequest) => adminProjectsApi.performOperation(token!, projectId, op),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
    queryClient.invalidateQueries({ queryKey: ["admin-project", projectId] });
  },
});
```

**筛选栏**：复用 `LogsFilterBar` 模式
**分页**：复用 `Pagination` 组件
**导出**：复用 `LogsExportButton` 模式

---

## 8. 安全设计

### 8.1 权限系统

**当前**：两级权限（user / admin）
**扩展**（可选）：三级权限
```typescript
type AdminLevel = 1 | 2 | 3;  // 1=普通管理员, 2=高级管理员, 3=超级管理员

// 权限矩阵
const PERMISSIONS = {
  view: [1, 2, 3],           // 查看项目详情
  unlock: [1, 2, 3],         // 解锁操作
  reset: [2, 3],             // 重置操作（高级管理员）
  delete: [3],               // 删除项目（超级管理员）
};
```

### 8.2 操作保护

**二次确认**：高风险操作（重置、删除）必须确认
**操作原因**：所有干预操作必须填写原因
**冷却时间**：防止误操作
```typescript
const COOLDOWN = {
  unlock: 5000,    // 5 秒
  reset: 10000,    // 10 秒
  delete: 30000,   // 30 秒
};
```

**审计日志**：所有操作记录到 `nrm_admin_operation_logs`

---

## 9. 实现优先级

### Phase 1：基础设施（立即执行）

| 任务 | 工作量 | 状态 |
|------|--------|------|
| 创建 `nrm_admin_operation_logs` 表 | 0.5 天 | 待执行 |
| 补充缺失索引（5 个） | 0.5 天 | 待执行 |

#### 1.1 创建管理操作日志表

```sql
-- 管理员干预操作审计日志表
CREATE TABLE nrm_admin_operation_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  project_id VARCHAR(50),
  operation_type VARCHAR(50) NOT NULL,
    -- 'unlock_script', 'unlock_character', 'unlock_outfit',
    -- 'reset_step', 'retry_task', 'force_complete', 'delete_project'
  operation_detail JSONB,       -- 操作详情
  reason TEXT,                  -- 操作原因（必填）
  affected_data JSONB,          -- 受影响的数据快照
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_admin_user ON nrm_admin_operation_logs (admin_user_id);
CREATE INDEX idx_project ON nrm_admin_operation_logs (project_id);
CREATE INDEX idx_created_at ON nrm_admin_operation_logs (created_at DESC);

-- 表注释
COMMENT ON TABLE nrm_admin_operation_logs IS '管理员干预操作审计日志';
```

#### 1.2 补充查询优化索引

```sql
-- ============================================
-- 异步任务查询优化
-- ============================================

-- 按项目 + 状态查询（项目详情页任务列表）
CREATE INDEX IF NOT EXISTS idx_async_jobs_project_status
ON nrm_async_jobs (project_id, status);

-- 按类型 + 状态查询（异常任务筛选）
CREATE INDEX IF NOT EXISTS idx_async_jobs_type_status
ON nrm_async_jobs (job_type, status);

-- ============================================
-- 项目列表查询优化
-- ============================================

-- 按状态 + 类型筛选
CREATE INDEX IF NOT EXISTS idx_projects_status_kind
ON nrm_projects (status, project_kind);

-- 按更新时间排序
CREATE INDEX IF NOT EXISTS idx_projects_updated_at
ON nrm_projects (updated_at DESC);

-- ============================================
-- 公司筛选优化
-- ============================================

-- 按公司名称筛选
CREATE INDEX IF NOT EXISTS idx_users_company_name
ON nrm_users (company_name);
```

#### 1.3 验证执行结果

```sql
-- 验证表是否创建成功
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'nrm_admin_operation_logs';

-- 验证索引是否创建成功
SELECT indexname, tablename FROM pg_indexes 
WHERE indexname IN (
  'idx_admin_user', 'idx_project', 'idx_created_at',
  'idx_async_jobs_project_status', 'idx_async_jobs_type_status',
  'idx_projects_status_kind', 'idx_projects_updated_at',
  'idx_users_company_name'
);

-- 验证表结构
\d nrm_admin_operation_logs
```

#### 1.4 一键执行脚本

```bash
# 完整执行脚本（可保存为 setup-admin-infra.sh）
#!/bin/bash
set -e

echo "========== 1. 创建管理操作日志表 =========="
psql -d neirongmiao << 'EOF'
CREATE TABLE IF NOT EXISTS nrm_admin_operation_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  project_id VARCHAR(50),
  operation_type VARCHAR(50) NOT NULL,
  operation_detail JSONB,
  reason TEXT,
  affected_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_user ON nrm_admin_operation_logs (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_project ON nrm_admin_operation_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON nrm_admin_operation_logs (created_at DESC);

COMMENT ON TABLE nrm_admin_operation_logs IS '管理员干预操作审计日志';
EOF
echo "✓ 表创建完成"

echo ""
echo "========== 2. 补充查询优化索引 =========="
psql -d neirongmiao << 'EOF'
CREATE INDEX IF NOT EXISTS idx_async_jobs_project_status ON nrm_async_jobs (project_id, status);
CREATE INDEX IF NOT EXISTS idx_async_jobs_type_status ON nrm_async_jobs (job_type, status);
CREATE INDEX IF NOT EXISTS idx_projects_status_kind ON nrm_projects (status, project_kind);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON nrm_projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_company_name ON nrm_users (company_name);
EOF
echo "✓ 索引创建完成"

echo ""
echo "========== 3. 验证执行结果 =========="
psql -d neirongmiao << 'EOF'
SELECT 'nrm_admin_operation_logs' as table_name, 
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'nrm_admin_operation_logs') as exists_flag
UNION ALL
SELECT 'indexes_count', (SELECT COUNT(*) FROM pg_indexes WHERE indexname IN (
  'idx_admin_user', 'idx_project', 'idx_created_at',
  'idx_async_jobs_project_status', 'idx_async_jobs_type_status',
  'idx_projects_status_kind', 'idx_projects_updated_at', 'idx_users_company_name'
))::text;
EOF

echo ""
echo "✅ 基础设施部署完成！"
```

#### 1.5 回滚方案（如需）

```sql
-- 删除管理操作日志表（谨慎操作，会丢失审计数据）
DROP TABLE IF EXISTS nrm_admin_operation_logs CASCADE;

-- 删除索引（不影响数据）
DROP INDEX IF EXISTS idx_admin_user;
DROP INDEX IF EXISTS idx_project;
DROP INDEX IF EXISTS idx_created_at;
DROP INDEX IF EXISTS idx_async_jobs_project_status;
DROP INDEX IF EXISTS idx_async_jobs_type_status;
DROP INDEX IF EXISTS idx_projects_status_kind;
DROP INDEX IF EXISTS idx_projects_updated_at;
DROP INDEX IF EXISTS idx_users_company_name;
```

### Phase 2：核心功能（P0）

| 功能 | 工作量 | 依赖 |
|------|--------|------|
| 异步任务管理页面（独立设计已批准） | 3 天 | Phase 1 |
| 项目列表页 | 3 天 | Phase 1 |
| 项目详情页 | 2 天 | 列表页 |
| 项目干预操作 | 2 天 | 详情页 |

**总计**：约 10 天

### Phase 3：数据辅助（P2）

| 功能 | 工作量 | 依赖 |
|------|--------|------|
| 统计分析页 | 3 天 | Phase 2 |
| 数据导出 | 1 天 | Phase 2 |

**总计**：约 4 天

---

## 10. 验收标准

### 10.1 性能指标

| 指标 | 要求 |
|------|------|
| 项目列表加载（1000 条） | < 1s |
| 项目详情加载 | < 1.5s |
| 解锁操作响应 | < 3s |
| 重置操作响应 | < 5s |

### 10.2 功能指标

| 指标 | 要求 |
|------|------|
| 异常项目检测 | 卡住 > 2h 自动标记 |
| 操作审计日志 | 100% 记录 |
| 数据一致性 | 重置操作不丢失审计数据 |

---

## 11. 风险与注意事项

### 11.1 数据一致性风险

- **重置操作**：必须软删除而非物理删除，保留审计追踪
- **并发操作**：乐观锁防止冲突
- **失败处理**：事务回滚，不产生半成品状态

### 11.2 性能风险

- **大数据量**：使用索引优化、分页
- **实时查询**：异常检测用定时任务预计算，而非实时查询

### 11.3 业务风险

- **误操作**：高风险操作二次确认 + 影响范围预览
- **用户通知**：项目被干预后，前端显示提示

---

## 12. 附录

### 12.1 关键文件路径

| 类别 | 文件 |
|------|------|
| 状态定义 | `src/contracts/types.ts` |
| 任务表 | `nrm_async_jobs` |
| 项目表 | `nrm_projects` |
| 管理路由入口 | `src/routes/admin-routes.ts` |
| 侧边栏配置 | `apps/web/components/layout/layoutNavigationController.ts` |
| 权限守卫 | `src/services/auth/route-guards.ts` |
| 回滚操作手册 | `docs/buss/table/project-rollback-operations.md` |

### 12.2 复用组件

| 组件 | 位置 | 用途 |
|------|------|------|
| LogsFilterBar | `apps/web/pages/admin/logs/` | 筛选栏模式 |
| Pagination | `apps/web/components/ui/` | 分页 |
| LogsExportButton | `apps/web/pages/admin/logs/` | 导出模式 |
| LogsManagement | `apps/web/pages/admin/` | Tab 结构模式 |

### 12.3 相关设计文档

| 文档 | 说明 |
|------|------|
| [`2026-04-27-async-jobs-admin-design.md`](./2026-04-27-async-jobs-admin-design.md) | 异步任务管理设计（已批准） |
| [`project-rollback-operations.md`](../../buss/table/project-rollback-operations.md) | 项目回滚操作手册 |

---

**文档结束**
