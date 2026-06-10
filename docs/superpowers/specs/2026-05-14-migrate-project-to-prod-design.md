# 项目归档功能设计规格

> 将优质项目从测试库归档到正式库长期保存。

---

## 功能概述

在 `/admin-portal?tab=projects` 项目管理页面的项目详情弹窗中，新增"归档到正式库"按钮，通过弹窗引导用户完成项目数据迁移。

---

## 用户流程

```
第一步：输入数据库连接
├── 源库（测试库）连接字符串
├── 目标库（正式库）连接字符串
└── [验证连接并查询数据量]

第二步：查看迁移预览
├── 连接验证（失败则提示错误）
├── 目标库状态（已存在/不存在）
├── 项目基本信息
├── 涉及表列表 + 各表数据量
└── 总计数据量

第三步：确认执行
├── [确认执行归档]
└── 展示结果（插入数、跳过数、详情）
```

---

## 前端组件

### 新增文件

- `apps/web/pages/admin/MigrateProjectModal.tsx` — 迁移弹窗组件

### 弹窗结构

```
┌─────────────────────────────────────────────────────┐
│  归档项目到正式库                              [关闭] │
├─────────────────────────────────────────────────────┤
│  项目：[项目名称]  类型：[视频项目]                   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  数据库连接                                          │
│  源库（测试库）连接字符串：                           │
│  [postgresql://user:pass@host:port/db]              │
│  目标库（正式库）连接字符串：                         │
│  [postgresql://user:pass@host:port/db]              │
│  [验证连接并查询数据量]                              │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  迁移预览（验证后展示）                               │
│  目标库状态：已存在 / 不存在                          │
│  涉及表（共 X 张）：                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ nrm_projects         1 条                    │   │
│  │ nrm_script_data      3 条                    │   │
│  │ ...  总计：XX 条                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [取消]                    [确认执行归档]            │
└─────────────────────────────────────────────────────┘
```

### 验证连接逻辑

1. 验证源库连接 → 失败提示错误
2. 验证目标库连接 → 失败提示错误
3. 两库都成功 → 查询数据量

### 触发入口

项目详情弹窗 (`ProjectDetailModal.tsx`) 新增"归档到正式库"按钮。

---

## 后端 API

### 新增路由

`POST /admin/projects/migrate`

### 请求体

```typescript
interface MigrateProjectRequest {
  projectId: string;          // 项目 ID
  sourceDbUrl: string;        // 源库（测试库）连接字符串
  targetDbUrl: string;        // 目标库（正式库）连接字符串
  preview?: boolean;          // true = 仅查询预览，false = 执行迁移
}
```

### 响应体（preview=true）

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
    targetStatus: 'exists' | 'not_exists';
    tables: Array<{
      tableName: string;
      count: number;
    }>;
    totalCount: number;
  };
}
```

### 响应体（preview=false，执行迁移）

```typescript
interface MigrateExecuteResponse {
  success: true;
  data: {
    inserted: number;
    skipped: number;
    total: number;
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

### 复用现有脚本

复用 `docs/buss/table/move/migrate-project.cjs` 的核心逻辑，支持 29 张表迁移。

### 按项目类型筛选

| 项目类型 | 涉及表数 | 特有表 |
|---------|---------|--------|
| video | ~20张 | nrm_video_project_business_data, 脚本/分镜/裂变相关 |
| image | ~8张 | nrm_model_photos, nrm_page_sections, nrm_section_versions |
| outfit_change | ~7张 | nrm_outfit_change_projects, nrm_outfit_segment_images/videos |
| reverse | ~15张 | 脚本相关表 |

### 插入顺序

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

---

## 错误处理

### 连接阶段

| 场景 | 处理 |
|------|------|
| 源库连接失败 | 返回错误，提示检查连接字符串 |
| 目标库连接失败 | 返回错误，提示检查连接字符串 |
| 源库项目不存在 | 返回错误，提示项目 ID 无效 |

### 迁移阶段

| 场景 | 处理 |
|------|------|
| 目标库已存在项目 | 提示但继续（已有记录跳过） |
| 表结构不一致（源库多字段） | 自动过滤，继续迁移 |
| 唯一键冲突 | 跳过该条，记录 skipped |
| 其他插入错误 | 记录错误，抛出异常中断 |

---

## 安全处理

- 连接字符串仅内存使用，不写入日志或数据库
- 审计日志仅记录：操作者 ID、项目 ID、操作时间、结果状态
- 不记录数据库密码

---

## 文件结构

### 新增

| 文件 | 说明 |
|------|------|
| `apps/web/pages/admin/MigrateProjectModal.tsx` | 迁移弹窗组件 |
| `src/routes/admin/project-migrate-handler.ts` | 迁移处理逻辑 |

### 修改

| 文件 | 修改内容 |
|------|---------|
| `apps/web/pages/admin/ProjectDetailModal.tsx` | 添加"归档到正式库"按钮 |
| `src/routes/admin/projects-routes.ts` | 添加迁移 API 路由 |
| `apps/web/services/backendApi.ts` | 添加 `migrateProjectPreview` 和 `migrateProject` 方法 |

---

## 实现方案

采用单 API 同步执行：
- 前端调用后端 API
- 后端完整执行迁移后返回结果
- 设置较长 HTTP 超时（如 5 分钟）

优点：实现简单，架构一致，数据量可控不超时。