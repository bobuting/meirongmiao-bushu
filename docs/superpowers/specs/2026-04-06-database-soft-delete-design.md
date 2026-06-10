---
name: database-soft-delete-design
description: 数据库伪删除机制设计 — 支持数据恢复和审计追溯
type: project
---

# 数据库伪删除设计规格说明

**日期**: 2026-04-06
**状态**: 设计完成，待实现

---

## 1. 需求背景

### 1.1 目的

伪删除主要用于两个场景：

1. **数据恢复** — 用户误删后可恢复数据（如项目、素材）
2. **审计追溯** — 保留删除记录用于合规审计

### 1.2 权限边界

| 角色 | 伪删除权限 | 恢复权限 | 清理权限 |
|------|-----------|----------|----------|
| **普通用户** | 可删除自己的数据 | ❌ 无 | ❌ 无 |
| **管理员** | 可删除所有数据 | ✅ 可恢复任意数据 | ✅ 可手动清理 |

用户删除后需联系管理员恢复数据。

---

## 2. 覆盖范围

### 2.1 需要伪删除的表（共 21 个）

#### 🟢 核心业务数据（9 表）

| 表名 | Repository | 说明 |
|------|------------|------|
| `projects` | `PgProjectRepository` | 用户项目 |
| `project_workflow_states` | `PgWorkflowStateRepository` | 项目工作流状态 |
| `assets` | `PgAssetRepository` | 项目资产 |
| `outfit_plans` | `PgOutfitPlanRepository` | 服装搭配计划 |
| `character_previews` | `PgCharacterPreviewRepository` | 角色预览 |
| `script_data` | `PgScriptStoryboardRepository` | 脚本数据 |
| `storyboard_frames` | `PgStoryboardFrameRepository` | 分镜帧 |
| `library_characters` | `PgLibraryCharacterRepository` | 角色素材库 |
| `library_scripts` | `PgLibraryScriptRepository` | 脚本素材库 |

#### 🟡 审计追溯需要（7 表）

| 表名 | Repository | 说明 |
|------|------------|------|
| `users` | `PgUserRepository` | 用户账户 |
| `credits` | `PgCreditRepository` | 积分记录 |
| `sessions` | `PgSessionRepository` | 会话记录 |
| `review_requests` | `PgReviewRequestRepository` | 审核请求 |
| `video_jobs` | `PgVideoJobRepository` | 视频生成任务 |
| `fission_videos` | `PgFissionVideoRepository` | 裂变视频 |
| `fission_results` | `PgFissionResultRepository` | 裁切结果 |

#### 🔵 系统配置（5 表）

| 表名 | Repository | 说明 |
|------|------------|------|
| `providers` | `PgProviderRepository` | Provider 配置 |
| `provider_secrets` | `PgProviderSecretRepository` | Provider 密钥 |
| `provider_policies` | `PgProviderPolicyRepository` | Provider 策略 |
| `video_musics` | `PgVideoMusicRepository` | 视频音乐 |
| `square_templates` | `PgSquareTemplateRepository` | 方形模板 |

### 2.2 不需要伪删除的表

系统/日志类表不需要伪删除：

| 表名 | 说明 | 不推荐理由 |
|------|------|------------|
| `config` | 系统配置 | 系统级，无恢复需求 |
| `migrations` | 数据库迁移 | 系统级元数据 |
| `dead_letters` | 死信队列 | 失败任务记录 |
| `audit_logs` | 审计日志 | 本身是审计记录 |
| `themes` | 主题配置 | 系统配置 |
| `functional_routes` | 功能路由 | 系统配置 |
| `trend_*` | 热点趋势 | 系统数据 |
| `prompt_*` | 提示词管理 | 系统配置 |

---

## 3. 技术方案

### 3.1 方案选择

采用**独立 SoftDeletableRepository 子类**方案：

- 创建 `PgSoftDeletableRepository<T>` 继承 `PgBaseRepository<T>`
- 需要伪删除的 Repository 继承此子类
- 不需要伪删除的 Repository 保持原继承 `PgBaseRepository`

**理由**：
- 职责清晰 — 伪删除是明确的业务特性，应有独立抽象
- 精确控制 — 只影响需要的 21 个表
- 易于维护 — TypeScript 类型安全
- 测试友好 — 可单独测试伪删除能力

---

## 4. 数据库字段设计

### 4.1 新增字段

每个需要伪删除的表添加以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `deleted_at` | `BIGINT` | 删除时间戳（毫秒），NULL 表示未删除 |
| `deleted_by` | `TEXT` | 删除操作者 ID |

### 4.2 查询过滤策略

- **默认查询**：自动过滤 `deleted_at IS NULL`（只返回未删除数据）
- **包含已删除**：`includeDeleted: true` 选项返回全部数据
- **只查已删除**：`listDeleted()` 方法查询已删除数据

---

## 5. Repository 层设计

### 5.1 伪删除基类

```typescript
// src/repositories/pg/soft-deletable-repository.ts

export abstract class PgSoftDeletableRepository<T> extends PgBaseRepository<T> {

  /** 伪删除：设置 deleted_at 和 deleted_by */
  async softDelete(id: string, deletedBy: string): Promise<void>;

  /** 恢复：清除 deleted_at 和 deleted_by */
  async restore(id: string): Promise<void>;

  /** 物理删除：真正删除数据 */
  async hardDelete(id: string): Promise<void>;

  /** 查找（默认过滤已删除） */
  async findById(id: string, options?: { includeDeleted?: boolean }): Promise<T | null>;

  /** 查找所有（默认过滤已删除） */
  async list(options?: { includeDeleted?: boolean }): Promise<T[]>;

  /** 查找已删除记录（用于清理任务） */
  async listDeleted(retentionDays?: number): Promise<T[]>;

  /** 条件查询（自动过滤已删除） */
  protected async findWhere(
    conditions: Record<string, unknown>,
    options?: { includeDeleted?: boolean }
  ): Promise<T[]>;
}
```

### 5.2 Repository 改造示例

```typescript
// 改造前
export class PgProjectRepository extends PgBaseRepository<Project> { ... }

// 改造后
export class PgProjectRepository extends PgSoftDeletableRepository<Project> { ... }
```

---

## 6. 清理任务设计

### 6.1 保留期限

- **统一保留 60 天**
- 超过 60 天的伪删除数据自动物理删除

### 6.2 清理服务

```typescript
// src/modules/deleted-data-cleanup-service.ts

export class DeletedDataCleanupService {
  private readonly RETENTION_DAYS = 60;

  /** 定时清理任务：每天凌晨执行 */
  async runScheduledCleanup(): Promise<CleanupResult>;

  /** 手动清理：管理员指定表和期限 */
  async manualCleanup(tableName: string, customRetentionDays?: number): Promise<number>;
}
```

### 6.3 定时调度

在单独的 scheduler 模块注册定时任务：

```typescript
// src/scheduler/deleted-data-cleanup-scheduler.ts

// 每天凌晨 3 点执行清理
cron.schedule('0 3 * * *', async () => {
  await cleanupService.runScheduledCleanup();
});
```

---

## 7. 管理员 API 设计

### 7.1 API 路由

| 接口 | 说明 |
|------|------|
| `GET /admin/deleted-data` | 查看伪删除数据列表 |
| `GET /admin/deleted-data/:table/:id` | 查看单条伪删除数据详情 |
| `POST /admin/deleted-data/:table/:id/restore` | 恢复伪删除数据 |
| `POST /admin/deleted-data/cleanup` | 手动清理伪删除数据 |
| `GET /admin/deleted-data/cleanup/status` | 查看清理任务状态 |
| `POST /admin/deleted-data/cleanup/toggle` | 启用/禁用定时清理 |

### 7.2 权限控制

- 所有 `/admin/deleted-data/*` 路由需要 `admin` 角色
- 使用 `requireAdmin(ctx, request)` 验证权限

---

## 8. 用户删除接口设计

### 8.1 用户删除 API

```typescript
// 用户删除自己的项目（伪删除）
DELETE /projects/:projectId
Response: { success: true, message: "项目已删除，如需恢复请联系管理员" }
```

### 8.2 权限验证

- 用户只能删除 `user_id` 匹配自己的数据
- 删除时自动记录 `deleted_by = user.id`
- 删除响应提示用户联系管理员恢复

---

## 9. 前端管理员界面设计

### 9.1 界面结构

```
/admin/deleted-data
├── 页面标题：伪删除数据管理
├── 筛选区域
│   ├── 表名下拉选择（全部 / 单个表）
│   ├── 删除时间范围筛选
│   └── 删除者筛选
├── 数据列表表格
│   ├── 列：表名 | ID | 名称 | 删除时间 | 删除者 | 操作
│   ├── 操作按钮：查看详情 | 恢复 | 物理删除
├── 分页控件
├── 清理任务状态面板
│   ├── 上次清理时间
│   ├── 下次清理时间
│   ├── 保留期限显示（60 天）
│   ├── 启用/禁用开关
│   ├── 手动清理按钮
└── 手动清理弹窗
    ├── 选择清理表（全部 / 单个表）
    ├── 自定义保留期限（默认 60 天）
    └── 确认执行按钮
```

---

## 10. 数据迁移方案

### 10.1 迁移脚本

```typescript
// scripts/migrations/add_soft_delete_fields.ts

const tables = [
  // 核心业务数据（9 表）
  'projects', 'project_workflow_states', 'assets', 'outfit_plans',
  'character_previews', 'script_data', 'storyboard_frames',
  'library_characters', 'library_scripts',
  // 审计追溯需要（7 表）
  'users', 'credits', 'sessions', 'review_requests',
  'video_jobs', 'fission_videos', 'fission_results',
  // 系统配置（5 表）
  'providers', 'provider_secrets', 'provider_policies',
  'video_musics', 'square_templates',
];

// 每个表添加 deleted_at 和 deleted_by 字段
// 添加部分索引 WHERE deleted_at IS NOT NULL
```

### 10.2 迁移策略

1. **幂等性保证** — 使用 `IF NOT EXISTS`
2. **向后兼容** — 新字段默认 NULL，不影响现有数据
3. **渐进式迁移** — 先核心表，后其他表
4. **回滚方案** — 可删除新增字段和索引

---

## 11. 测试策略

### 11.1 单元测试

| 测试用例 | 说明 |
|----------|------|
| `softDelete()` | 设置 deleted_at 和 deleted_by |
| `restore()` | 清除 deleted_at 和 deleted_by |
| `findById()` 默认行为 | 过滤已删除记录 |
| `findById(includeDeleted)` | 返回已删除记录 |
| `list()` 默认行为 | 只返回未删除记录 |
| `listDeleted()` | 只返回已删除记录 |
| `listDeleted(retentionDays)` | 只返回超期记录 |
| `hardDelete()` | 物理删除数据 |
| `findWhere()` | 自动过滤已删除记录 |

### 11.2 集成测试

| 测试用例 | 说明 |
|----------|------|
| 创建 → 伪删除 → 恢复 → 查询 | 完整恢复流程 |
| 创建 → 伪删除 → 等待超期 → 自动清理 | 自动清理流程 |
| 创建 → 伪删除 → 手动清理 → 物理删除 | 手动清理流程 |

---

## 12. 实现计划

详见 writing-plans 技能生成的实现计划。