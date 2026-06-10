# 项目迁移功能设计规格

> 在后台管理界面新增项目迁移功能，将测试库项目数据同步到正式库。

---

## 功能概述

在 `/admin-portal?tab=projects` 项目管理页面的项目列表中，新增"迁移"按钮，点击后弹出迁移弹窗，预览数据量并执行迁移。

**迁移方向**：测试库 → 正式库（单向）

---

## 数据库配置

### 配置位置

业务配置页面 `/admin-portal?tab=business-config` 新增模块 `system_database`。

### 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `prodDbUrl` | string | 正式库连接字符串（完整 postgres://...） |
| `testDbUrl` | string | 测试库连接字符串（完整 postgres://...） |

### 存储方式

复用现有 `nrm_business_configs` 表，模块名为 `system_database`。

---

## 用户流程

```
点击"迁移"按钮
    ↓
打开迁移弹窗
    ↓
自动加载预览信息
├── 表结构检查结果
├── 数据量统计
└── 已存在数据标记
    ↓
确认迁移
    ↓
执行迁移
    ↓
显示迁移结果
```

---

## 前端组件

### 新增文件

- `apps/web/pages/admin/MigrateProjectModal.tsx` — 迁移弹窗组件

### 弹窗结构

```
┌─────────────────────────────────────────────────────────┐
│  迁移项目到正式库                                  [关闭] │
├─────────────────────────────────────────────────────────┤
│  项目：[项目名称]  类型：[视频项目]                       │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  迁移预览                                               │
│                                                         │
│  表结构检查：✅ 全部一致（29 张表）                       │
│  或                                                     │
│  表结构检查：⚠️ 存在差异                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │ nrm_projects: 目标库缺少字段 xxx                 │   │
│  │ nrm_script_data: 类型不一致 yyy                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  数据量统计：                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ nrm_projects           1 条   (已存在 0 条)      │   │
│  │ nrm_garment_assets     3 条   (已存在 1 条)      │   │
│  │ nrm_script_data        2 条   (已存在 0 条)      │   │
│  │ ...                                             │   │
│  │ 总计：56 条  (新增 55 条，跳过 1 条)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [取消]                        [确认迁移]               │
└─────────────────────────────────────────────────────────┘
```

### 交互细节

1. 打开弹窗时自动调用预览 API
2. 预览加载中显示 loading 状态
3. 表结构存在差异时，高亮显示问题列表
4. 确认迁移按钮在迁移过程中禁用并显示进度
5. 迁移完成后显示结果统计

---

## 后端 API

### 新增路由

`POST /admin/projects/migrate`

### 请求体

```typescript
interface MigrateProjectRequest {
  projectId: string;    // 项目 ID
  preview?: boolean;    // true = 仅预览，false = 执行迁移（默认 true）
}
```

### 预览响应（preview=true）

```typescript
interface MigratePreviewResponse {
  success: true;
  data: {
    projectInfo: {
      id: string;
      name: string;
      projectKind: string;
      status: string;
    };
    structureCheck: {
      status: 'ok' | 'warning';
      details: Array<{
        table: string;
        issue: string;
      }>;
    };
    tables: Array<{
      tableName: string;
      sourceCount: number;
      existsCount: number;
    }>;
    totalSource: number;
    totalExists: number;
    totalToInsert: number;
  };
}
```

### 执行响应（preview=false）

```typescript
interface MigrateExecuteResponse {
  success: true;
  data: {
    inserted: number;
    skipped: number;
    details: Array<{
      tableName: string;
      inserted: number;
      skipped: number;
    }>;
  };
}
```

---

## 迁移逻辑

### 核心文件

`src/routes/admin/project-migrate-handler.ts`

### 处理步骤

1. **获取数据库连接**
   - 从 `nrm_business_configs` 读取 `system_database` 模块配置
   - 获取 `testDbUrl` 和 `prodDbUrl`

2. **表结构检查**
   - 对比源库和目标库的表结构
   - 检查字段名称、类型、长度
   - 返回差异列表

3. **查询源库数据**
   - 按项目 ID 查询所有关联表
   - 按项目类型筛选涉及的表

4. **检查目标库已存在数据**
   - 统计目标库中已存在的记录数
   - 用于预览展示"跳过"数量

5. **插入数据**
   - 按依赖顺序正向插入
   - JSONB 字段正确处理（查询时 `::text`，插入前 `JSON.parse()`）
   - 唯一键冲突时跳过

6. **返回统计结果**

### 涉及表清单

按插入顺序：

```
nrm_garment_assets → nrm_library_characters → nrm_character_five_views
  ↓
nrm_projects
  ↓
nrm_project_garment_assoc → nrm_outfit_plans → nrm_project_outfit_plans
  ↓
nrm_role_direction_cards → nrm_project_characters
  ↓
nrm_outfit_change_projects → nrm_outfit_segment_images → nrm_outfit_segment_videos
  ↓
nrm_video_project_business_data
  ↓
nrm_model_photos → nrm_image_project_ext → nrm_page_sections → nrm_section_versions
  ↓
nrm_script_data → nrm_project_script_assoc → nrm_user_script_assoc → nrm_shot_breakdown
  ↓
nrm_step3_frame_images → nrm_shot_prompts
  ↓
nrm_step4_video_scenes → nrm_project_video_musics → nrm_final_videos
  ↓
nrm_fission_video_status → nrm_fission_task_items → nrm_fission_videos
```

### JSONB 处理

**问题**：直接传递 JSONB 字段会导致双重序列化。

**解决方案**：
1. 查询时使用 `::text` 将 JSONB 转为字符串
2. 插入前 `JSON.parse()` 解析为对象
3. 插入时 PostgreSQL 驱动自动序列化

**示例**：
```typescript
// 查询
const result = await sourcePool.query(`
  SELECT id, items::text, tags::text
  FROM nrm_outfit_plans
  WHERE project_id = $1
`, [projectId]);

// 处理
const rows = result.rows.map(row => ({
  ...row,
  items: JSON.parse(row.items),  // 解析 JSONB 字符串
  tags: JSON.parse(row.tags),
}));

// 插入
await targetPool.query(`
  INSERT INTO nrm_outfit_plans (id, items, tags)
  VALUES ($1, $2, $3)
`, [row.id, row.items, row.tags]);  // 自动序列化
```

---

## 错误处理

### 连接阶段

| 场景 | 处理 |
|------|------|
| 配置不存在 | 返回错误，提示先在业务配置中设置数据库连接 |
| 源库连接失败 | 返回错误，提示检查测试库连接字符串 |
| 目标库连接失败 | 返回错误，提示检查正式库连接字符串 |

### 预览阶段

| 场景 | 处理 |
|------|------|
| 源库项目不存在 | 返回错误，提示项目 ID 无效 |
| 表结构不一致 | 返回警告，列出差异详情，允许继续 |

### 迁移阶段

| 场景 | 处理 |
|------|------|
| 目标库已存在记录 | 跳过该条，记录 skipped |
| 插入错误 | 记录错误，继续下一条 |
| 严重错误 | 抛出异常，中断迁移 |

---

## 安全处理

- 连接字符串存储在数据库中，不写入日志
- 审计日志记录：操作者 ID、项目 ID、操作时间、结果状态
- 不记录数据库密码

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/web/pages/admin/BusinessConfigManagement.tsx` | 修改 | 新增 `system_database` 模块定义 |
| `apps/web/pages/admin/ProjectManagement.tsx` | 修改 | 列表行添加"迁移"按钮 |
| `apps/web/pages/admin/MigrateProjectModal.tsx` | 新增 | 迁移弹窗组件 |
| `src/routes/admin/project-migrate-handler.ts` | 新增 | 迁移 API 处理逻辑 |
| `src/routes/admin/projects-routes.ts` | 修改 | 注册迁移路由 |
| `apps/web/services/backendApi.ts` | 修改 | 添加迁移 API 方法 |

---

## 实现注意事项

1. **复用现有逻辑**：参考 `temp/doc/table/move/migrate-project.cjs` 的表清单和查询逻辑
2. **HTTP 超时**：设置较长超时时间（如 5 分钟），迁移可能耗时较长
3. **进度反馈**：考虑后续版本支持进度条或流式响应
4. **数据验证**：迁移完成后可在前端提供"查看项目"链接验证
