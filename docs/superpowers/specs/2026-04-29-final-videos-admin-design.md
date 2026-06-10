# nrm_final_videos 后台管理 — 设计规格

## 元信息

- **日期**: 2026-04-29
- **状态**: 已实现
- **表**: `nrm_final_videos` — 统一存储 Step4 成片和裂变成片

## 目标

为 `nrm_final_videos` 表新增后台管理页面，支持：按项目/用户筛选 → 项目列表 → 视频网格展示 → 点击查看视频详情（右侧滑出面板）。面向运营查看成片产出、排查视频问题场景。

---

## 1. 数据模型

### 1.1 `nrm_final_videos` 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `project_id` | uuid | 所属项目 |
| `video_type` | varchar | `step4` / `fission` |
| `video_url` | varchar | 视频地址 |
| `duration_sec` | int | 时长（秒） |
| `file_size` | bigint | 文件大小（字节） |
| `cover_image_url` | varchar | 封面图 |
| `background_music_url` | varchar | 背景音乐地址 |
| `background_music_title` | varchar | 背景音乐标题 |
| `transition_type` | varchar | 转场类型 |
| `transition_duration_ms` | int | 转场时长（毫秒） |
| `storyboard_ids` | varchar | 关联分镜 ID（逗号分隔） |
| `storyboard_urls` | jsonb | 分镜图 URL 数组 |
| `creator_id` | uuid | 创建者 |
| `created_at` | bigint | 创建时间（unix ms） |
| `updated_at` | bigint | 更新时间（unix ms） |
| `is_deleted` | boolean | 软删除标记 |

### 1.2 关联关系

- `project_id` → `nrm_projects.id`（项目名称、用户关联）
- `creator_id` → `nrm_users.id`（创建者邮箱）

---

## 2. 后端 API

### 路由文件

`src/routes/admin/final-videos-routes.ts`，导出 `registerAdminFinalVideosRoutes(app, ctx)`。

每个处理程序首行调用 `requireAdmin(ctx, request)` 做权限守卫。删除操作写入 `nrm_audit_logs` 审计日志。

### 2.1 项目列表 `GET /admin/final-videos/projects`

查询有成片记录的项目，支持按用户和关键词筛选。

**Query 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 按用户过滤（可选） |
| `search` | string | 项目名称/用户邮箱模糊搜索（可选） |

**响应：**
```typescript
{
  projects: {
    id: string;
    name: string;
    userId: string;
    userEmail: string;
    finalVideoCount: number;
    updatedAt: number;
  }[];
}
```

**SQL 逻辑：** `nrm_projects` JOIN `nrm_users` JOIN `nrm_final_videos`，GROUP BY 项目，COUNT 成片数。

### 2.2 成片列表 `GET /admin/final-videos`

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectId` | string | 是 | 项目 ID |

**响应：**
```typescript
{
  videos: {
    id: string;
    projectId: string;
    videoType: "step4" | "fission";
    videoUrl: string;
    durationSec: number | null;
    fileSize: number | null;
    coverImageUrl: string | null;
    backgroundMusicTitle: string | null;
    backgroundMusicUrl: string | null;
    storyboardUrls: string[] | null;
    transitionType: string | null;
    transitionDurationMs: number | null;
    creatorId: string | null;
    createdAt: number;
    updatedAt: number;
    isDeleted: boolean;
    projectName: string | null;
    creatorEmail: string | null;
  }[];
}
```

### 2.3 删除成片 `DELETE /admin/final-videos/:id`

软删除：设置 `is_deleted = true`，不物理删除数据。写入审计日志。

**响应：** `{ ok: true }`

---

## 3. 前端页面

### 3.1 页面文件

`apps/web/pages/admin/FinalVideosManagement.tsx`

### 3.2 布局结构

三栏布局：

```
┌─────────────────────────────────────────────────┐
│  Header: 标题 + 刷新按钮                          │
├────────────┬────────────────────┬────────────────┤
│ 左侧 280px │ 中间 flex-1        │ 右侧 360px     │
│ 项目列表    │ 视频网格 (2-4 列)   │ 详情面板       │
│            │                   │ (点击后滑出)    │
│ ┌────────┐ │ ┌────┐┌────┐┌────┐│ ┌────────────┐ │
│ │搜索框   │ │ │视频││视频││视频││ │ 视频播放器  │ │
│ │用户筛选 │ │ │卡片││卡片││卡片││ │ 元数据列表  │ │
│ ├────────┤ │ └────┘└────┘└────┘│ │ 分镜图网格  │ │
│ │项目卡片 │ │ ┌────┐┌────┐┌────┐│ │ 删除按钮    │ │
│ │项目卡片 │ │ │视频││视频││视频││ │            │ │
│ │项目卡片 │ │ │卡片││卡片││卡片││ │            │ │
│ └────────┘ │ └────┘└────┘└────┘│ └────────────┘ │
└────────────┴────────────────────┴────────────────┘
```

### 3.3 左侧 — 项目列表

- 搜索框：按项目名称模糊搜索（Enter 触发）
- 用户下拉筛选：从 `/admin/users` 获取用户列表
- 项目卡片：显示项目名称、用户邮箱、成片数量、最后更新时间
- 选中态：蓝色边框 + 浅蓝背景

### 3.4 中间 — 视频网格

- 响应式网格：2 列（sm）→ 3 列（md）→ 4 列（lg）
- 视频卡片：
  - 9:16 比例封面区（灰色底 + 播放按钮 hover 效果）
  - 类型标签：Step4（蓝色）/ 裂变（紫色）
  - 底部信息：时长 + 文件大小 + 创建时间
- 空态：引导文案"请在左侧选择项目查看成片"

### 3.5 右侧 — 详情面板

点击视频卡片后从右侧滑入（360px 固定宽度）：

- 视频播放器（9:16 比例，原生 `<video>` 控件）
- 基本信息列表：类型、时长、大小
- 背景音乐（如有）
- 转场类型 + 时长（如有）
- 项目 ID、创建者、创建时间
- 分镜图网格（3 列缩略图，如有）
- 操作按钮：删除成片（红色，带确认弹窗）

### 3.6 状态管理

不使用 TanStack Query，直接用 `useState` + `useCallback` + `useEffect`：

| 状态 | 类型 | 说明 |
|------|------|------|
| `projectList` | `ProjectSummary[]` | 项目列表 |
| `videoList` | `FinalVideo[]` | 当前项目的成片 |
| `userList` | `UserBrief[]` | 用户下拉选项 |
| `selectedProjectId` | `string \| null` | 当前选中项目 |
| `selectedVideo` | `FinalVideo \| null` | 当前选中的成片（非 null 时右侧面板显示） |

---

## 4. 交互流程

```
进入页面 → 加载项目列表 + 用户列表
  → 选择用户筛选 → 重新加载项目列表
  → 搜索项目 → Enter 触发重新加载
  → 点击项目 → 加载该项目的成片网格
    → 点击成片卡片 → 右侧详情面板滑出
      → 预览视频 / 查看详情 / 查看分镜图
      → 删除按钮 → 确认弹窗 → 删除 → 刷新列表
    → 点击关闭 → 面板滑出
  → 点击刷新 → 重新加载当前数据
```

---

## 5. 文件清单

| 文件 | 说明 | 状态 |
|------|------|------|
| `apps/web/pages/admin/FinalVideosManagement.tsx` | 前端页面组件 | ✅ 已完成 |
| `src/routes/admin/final-videos-routes.ts` | 后端 API 路由 | ✅ 已完成 |
| `apps/web/services/realApi/admin.ts` | 前端 API 类型定义 | ⬜ 待添加接口声明 |
| `apps/web/App.tsx` | 页面路由注册 | ⬜ 待添加路由 |
| `src/app-setup/setup-routes.ts` | 后端路由注册 | ⬜ 待注册 |

---

## 6. 待完成

1. **前端 API 接口声明** — 在 `RealAdminApi` 接口中添加 `finalVideosProjects`、`finalVideosList`、`finalVideoDelete` 三个方法，并在 `realAdminApi` 对象中实现
2. **后端路由注册** — 在 `setup-routes.ts` 中 import 并调用 `registerAdminFinalVideosRoutes`
3. **前端路由注册** — 在 `App.tsx` 中添加 `/admin/final-videos` 路由
4. **页面访问入口** — 在管理后台导航中添加入口链接
