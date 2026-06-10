# 项目后台管理系统设计更新

**版本**: 2.2（基于数据结构变化更新）
**日期**: 2026-05-06
**作者**: Claude
**状态**: 已批准，准备实施
**更新原因**: 数据结构发生变化，需要更新设计方案

---

## 1. 变更摘要

### 1.1 数据结构变化

**新增字段**（`nrm_projects` 表）：
- `coverImageUrl` - 项目封面URL（成片截帧或角色图）
- `garmentImageUrl` - 服饰主图URL
- `publishTitle` - Step5 发布标题
- `selectedRoleDirection` - Step1 角色方向选择结果（JSONB）

**新增表**：
- `nrm_project_characters` - 项目与角色库的多对多关联

**已删除表**：
- `nrm_project_workflow_states` - 已废弃，状态直接在项目表管理

### 1.2 设计文档更新内容

- 补充新增字段和表的描述
- 优化项目列表查询（利用新增封面字段）
- 补充项目详情查询（关联角色表）
- 调整实施优先级（渐进式实现）

---

## 2. Phase 2 核心功能实现

### 2.1 项目列表 API

**接口定义**：
```
GET /admin/projects
```

**查询参数**：
```typescript
interface ProjectListQuery {
  projectKind?: 'video' | 'image' | 'reverse' | 'outfit_change';
  status?: string;          // VideoProjectStatus 或 ImageProjectStatus
  companyName?: string;     // 公司名称筛选
  anomalyType?: 'stuck' | 'failed_task' | 'slow_step';
  userId?: string;
  timeRange?: 'today' | '7days' | '30days';
  search?: string;          // 标题/ID 模糊搜索
  page?: number;
  pageSize?: number;
}
```

**响应结构**：
```typescript
interface ProjectListResponse {
  projects: ProjectListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ProjectListItem {
  id: string;
  title: string;
  projectKind: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  companyName: string;
  userId: string;
  userName: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail: string;        // 优化后的封面URL
  publishTitle?: string;    // 新增：发布标题
}
```

**SQL 查询优化**（利用新增字段）：
```sql
SELECT
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
  -- 优化：使用新增封面字段，避免子查询
  COALESCE(p.cover_image_url, p.garment_image_url) as thumbnail_url,
  -- 新增：发布标题（用于已发布项目）
  p.publish_title
FROM nrm_projects p
LEFT JOIN nrm_users u ON p.user_id = u.id
WHERE p.deleted_at IS NULL
  -- 筛选条件...
ORDER BY p.updated_at DESC
LIMIT $limit OFFSET $offset
```

---

### 2.2 项目详情 API

**接口定义**：
```
GET /admin/projects/:id/detail
```

**响应结构**：
```typescript
interface ProjectDetailResponse {
  basicInfo: {
    id: string;
    title: string;
    projectKind: string;
    status: string;
    currentStep: number;
    companyName: string;
    userId: string;
    userName: string;
    userEmail: string;
    createdAt: Date;
    updatedAt: Date;
    // 新增字段
    coverImageUrl: string;
    garmentImageUrl: string;
    publishTitle: string;
    selectedRoleDirection: object | null;
  };
  stepTimeline: StepTimelineItem[];
  // 新增：角色关联信息
  characters: ProjectCharacter[];
  tasks: TaskItem[];
  resourceConsumption: {
    llmCalls: number;
    imageGenerations: number;
    videoGenerations: number;
  };
}

interface ProjectCharacter {
  id: string;
  libraryCharacterId: string;
  name: string;
  portraitUrl: string;
  role: 'main' | 'supporting';
  isSelected: boolean;
}
```

**SQL 查询**：
```sql
-- 项目基本信息（包含新增字段）
SELECT p.*, u.name as user_name, u.company_name, u.email as user_email
FROM nrm_projects p
LEFT JOIN nrm_users u ON p.user_id = u.id
WHERE p.id = $id AND p.deleted_at IS NULL

-- 角色关联信息（新增）
SELECT pc.*, lc.name, lc.portrait_url
FROM nrm_project_characters pc
JOIN nrm_library_characters lc ON pc.library_character_id = lc.id
WHERE pc.project_id = $projectId AND pc.deleted_at IS NULL
ORDER BY pc.is_selected DESC, pc.created_at

-- 任务列表
SELECT id, job_type, status, progress, error, created_at, updated_at
FROM nrm_async_jobs
WHERE project_id = $projectId
ORDER BY created_at DESC
LIMIT 20
```

---

### 2.3 干预操作 API

**接口定义**：
```
POST /admin/projects/:id/operations
```

**操作类型**（Phase 2 实现解锁操作）：

| 操作类型 | 说明 | 数据影响 | 风险等级 | 实施阶段 |
|---------|------|---------|---------|---------|
| `unlock_script` | 解锁脚本选择 | 仅回退状态到 SCRIPT_SELECTED | 🟡 中 | Phase 2 |
| `unlock_character` | 解锁角色选择 | 仅回退状态到 CHARACTER_SELECTED | 🟡 中 | Phase 2 |
| `unlock_outfit` | 解锁服装搭配 | 仅回退状态到 OUTFIT_SELECTED | 🟡 中 | Phase 2 |
| `reset_step` | 重置到指定 Step | 清除该 Step 及之后的数据 | 🔴 高 | Phase 2+ |
| `retry_task` | 重试失败任务 | 重启指定任务 | 🟢 低 | Phase 2+ |
| `force_complete` | 强制标记完成 | 更新状态到下一阶段 | 🔴 高 | Phase 2+ |

**解锁操作逻辑**：

```typescript
// 解锁脚本选择（Step3）
async function unlockScript(projectId: string): Promise<void> {
  await ctx.pool.query(
    `UPDATE nrm_projects 
     SET status = 'SCRIPT_SELECTED', updated_at = NOW() 
     WHERE id = $projectId 
       AND status IN ('SCRIPT_CONFIRMED', 'STORYBOARDING', 'STORYBOARD_PREVIEW_COMPLETED')`,
    { projectId }
  );
}

// 解锁角色选择（Step2）
async function unlockCharacter(projectId: string): Promise<void> {
  await ctx.pool.query(
    `UPDATE nrm_projects 
     SET status = 'CHARACTER_SELECTED', updated_at = NOW() 
     WHERE id = $projectId 
       AND status IN ('CHARACTER_CONFIRMED', 'SCRIPT_GENERATED', 'SCRIPT_SELECTED', 'SCRIPT_CONFIRMED')`,
    { projectId }
  );
}

// 解锁服装搭配（Step1）
async function unlockOutfit(projectId: string): Promise<void> {
  await ctx.pool.query(
    `UPDATE nrm_projects 
     SET status = 'OUTFIT_SELECTED', updated_at = NOW() 
     WHERE id = $projectId 
       AND status IN ('OUTFIT_CONFIRMED', 'CHARACTER_VIEW_READY', 'CHARACTER_SELECTED', 'CHARACTER_CONFIRMED')`,
    { projectId }
  );
}
```

---

## 3. 前端实现优化

### 3.1 项目列表页优化

**缩略图优化**：
- 优先使用 `coverImageUrl`
- 备选 `garmentImageUrl`
- 加载失败显示占位图

**标题展示优化**：
- 已发布项目显示 `publishTitle`
- 未发布或无发布标题时显示 `title`

### 3.2 项目详情页新增展示

**新增字段展示**：
- 项目封面（`coverImageUrl`）
- 角色方向（`selectedRoleDirection`）
- 关联角色列表（`nrm_project_characters`）

---

## 4. 异常检测机制

### 4.1 卡住项目检测

```typescript
async function detectStuckProjects(): Promise<StuckProjectStats> {
  const result = await ctx.pool.query(`
    SELECT COUNT(*) as count
    FROM nrm_projects
    WHERE deleted_at IS NULL
      AND status IN ('STORYBOARDING', 'FILMING', 'FISSIONING')
      AND updated_at < NOW() - INTERVAL '2 hours'
  `);
  
  return {
    count: parseInt(result.rows[0]?.count || "0"),
    threshold: 2, // 小时
    statuses: ['STORYBOARDING', 'FILMING', 'FISSIONING']
  };
}
```

### 4.2 失败任务检测

```typescript
async function detectFailedTasks(): Promise<FailedTaskStats> {
  const result = await ctx.pool.query(`
    SELECT COUNT(*) as count
    FROM nrm_async_jobs
    WHERE status = 'failed'
  `);
  
  return {
    count: parseInt(result.rows[0]?.count || "0"),
    jobTypes: await getFailedTaskBreakdown()
  };
}
```

---

## 5. 实施计划

### 5.1 Phase 2 实施顺序（渐进式）

| 序号 | 任务 | 预计工时 | 依赖 | 优先级 |
|------|------|---------|------|--------|
| 1 | 完善 API 实现（项目列表） | 2h | 无 | P0 |
| 2 | 完善 API 实现（项目详情） | 2h | 任务1 | P0 |
| 3 | 实现 API（公司列表） | 0.5h | 无 | P0 |
| 4 | 实现 API（异常统计） | 1h | 无 | P0 |
| 5 | 前端接入真实数据（列表页） | 2h | 任务1,3,4 | P0 |
| 6 | 前端接入真实数据（详情页） | 2h | 任务2,5 | P0 |
| 7 | 实现解锁操作 API | 2h | 任务2 | P1 |
| 8 | 前端实现干预操作 UI | 2h | 任务7 | P1 |
| 9 | 实现重置操作 API | 4h | 任务2 | P2 |
| 10 | 测试与优化 | 2h | 全部 | P0 |

**总计工时**：约 19.5 小时（2.5 个工作日）

### 5.2 Phase 3 延后内容

- 项目创建/完成趋势（折线图）
- Step 流失率分析（漏斗图）
- 成本消耗统计（柱状图）
- 公司维度统计（分组报表）
- 数据导出功能（CSV/Excel）

---

## 6. 验收标准

### 6.1 功能验收

- ✅ 项目列表页能正确展示项目列表
- ✅ 筛选条件能正确过滤项目
- ✅ 异常快速入口能正确定位问题项目
- ✅ 项目详情页能展示完整信息（包含新增字段）
- ✅ 解锁操作能正确回退项目状态
- ✅ 操作审计日志能正确记录

### 6.2 性能验收

- 项目列表加载（1000 条） < 1s
- 项目详情加载 < 1.5s
- 解锁操作响应 < 3s

---

## 7. 相关文档

- 原设计文档：`docs/superpowers/specs/2026-04-25-project-admin-management-design-v2.md`
- 数据结构变化提交：`2dc8126b`（新增字段）、`fbf9d41e`（新增表）
