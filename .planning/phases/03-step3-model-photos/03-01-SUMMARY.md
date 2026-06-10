---
gsd_state_version: 1.0
phase: 03-step3-model-photos
plan: 01
type: execute
subsystem: image-project-step3
tags:
  - image-project
  - model-photos
  - step3
  - ai-generation
requires:
  - 02-step1-step2/02-01 (Step 1+2 服装搭配+角色定妆)
provides:
  - ModelPhoto CRUD 仓库层
  - 4 个 Step 3 API 端点 (generate-batch, list, regenerate, select)
  - 前端网格展示页面 + 灯箱预览
  - ImageProjectLayout step3 自动保存支持
affects:
  - src/contracts/types.ts (新增 ModelPhoto 接口)
  - src/contracts/repository-ports/library-repository.ts (新增 IModelPhotoRepository)
  - src/repositories/pg/model-photo-pg-repository.ts (新建)
  - src/repositories/pg/index.ts (注册 modelPhotos)
  - src/routes/image-project/step3-handlers.ts (新建)
  - src/routes/image-project/index.ts (注册 step3 路由)
  - apps/web/services/realApi/image-step3.ts (新建)
  - apps/web/services/realApi/index.ts (合并 imageStep3Api)
  - apps/web/pages/image-project/ImageModelPhotos.tsx (新建)
  - apps/web/pages/image-project/ImageProjectLayout.tsx (修复 step 上限 + step3 自动保存)
  - apps/web/store/useAppStore.ts (添加 ImageProjectStep3Snapshot + step3 字段)
  - apps/web/App.tsx (注册 step3 路由)
tech-stack:
  added: []
  patterns:
    - Repository 模式 (IModelPhotoRepository + PgModelPhotoRepository)
    - 路由 handler 模式 (registerImageProjectStep3Routes)
    - 前端 API 模块模式 (imageStep3Api + realBackendApi 合并)
key-files:
  created:
    - src/repositories/pg/model-photo-pg-repository.ts
    - src/routes/image-project/step3-handlers.ts
    - apps/web/services/realApi/image-step3.ts
    - apps/web/pages/image-project/ImageModelPhotos.tsx
  modified:
    - src/contracts/types.ts
    - src/contracts/repository-ports/library-repository.ts
    - src/repositories/pg/index.ts
    - src/routes/image-project/index.ts
    - apps/web/services/realApi/index.ts
    - apps/web/pages/image-project/ImageProjectLayout.tsx
    - apps/web/store/useAppStore.ts
    - apps/web/App.tsx
decisions:
  - 数据库列使用 sort_order (非 order_num)，与 Phase 1 创建的表结构保持一致
  - ModelPhoto 类型在 Phase 1 的 types.ts 中缺失，补定义为 [Rule 2 - missing critical type]
  - generate-batch 端点在 imageProvider 未配置时直接抛错 (主流程失败直接报错)
  - 单张图片生成失败不影响其他图片 (try-catch 单张级别)
metrics:
  duration: ~15 min
  completed: 2026-04-10T07:00:00Z
  tasks_completed: 3/3
  deviations: 1
---

# Phase 03 Plan 01: Step 3 模特图自动生成 Summary

**One-liner:** ModelPhoto Repository 层 + 4 个后端 API 端点 (LLM 规划 + 逐张生成 + 重新生成 + 选中切换) + 前端响应式网格展示页面 + 灯箱预览 + Layout 自动保存扩展

## What Was Delivered

### Task 1: ModelPhoto Repository 层

- **IModelPhotoRepository 接口** (`src/contracts/repository-ports/library-repository.ts`) — findByProjectId, create, update, bulkCreate, updateFields, deleteByProjectId
- **PgModelPhotoRepository 实现** (`src/repositories/pg/model-photo-pg-repository.ts`) — 继承 PgBaseRepository, 映射数据库 sort_order 列, 支持批量 INSERT
- **注册到 RepositoryCollection** (`src/repositories/pg/index.ts`) — 工厂模式和事务模式均已注册

**Deviation [Rule 2 - Missing Type]:** ModelPhoto 接口在 types.ts 中缺失（Phase 1 的 SUMMARY 声称已添加但实际未写入），补定义了完整的 ModelPhoto 类型（含 ModelPhotoStatus 联合类型）。

### Task 2: 后端路由 handlers

**`src/routes/image-project/step3-handlers.ts`** — 4 个 API 端点：

| 端点 | 功能 |
|------|------|
| `POST /image-projects/:projectId/step3/photos/generate-batch` | LLM 规划 + 批量创建 + 逐张生成 |
| `GET /image-projects/:projectId/step3/photos` | 查询项目所有模特图 |
| `POST /image-projects/:projectId/step3/photos/:photoId/regenerate` | 重新生成单张 |
| `POST /image-projects/:projectId/step3/photos/:photoId/select` | 切换选中状态 |

- 所有端点包含 `requireUser` 认证 + `requireOwnerProject` 归属校验
- generate-batch 验证项目已完成 Step 2（selectedCharacterPreviewId 存在）
- LLM 通过 `getPromptContent("step3_photo_plan")` 获取提示词（非硬编码）
- 图片生成使用 `requestJimengImageUrl` + `persistImageSourceToStorage`
- 单张失败不影响其他张（仅标记 failed）
- JSON 解析使用 `extractJsonObject`，非法格式抛 AppError(400)

**路由注册** (`src/routes/image-project/index.ts`) — `registerImageProjectStep3Routes` 已调用

### Task 3: 前端

**`apps/web/services/realApi/image-step3.ts`** — imageStep3Api 模块，4 个方法匹配后端端点

**`apps/web/services/realApi/index.ts`** — 合并到 realBackendApi

**`apps/web/pages/image-project/ImageModelPhotos.tsx`** — 网格展示页面：
- 响应式布局：grid-cols-2 md:grid-cols-3 lg:grid-cols-4
- 一键生成按钮 + 进度文字
- 模特图卡片：图片 + poseLabel/bgLabel 标签 + 勾选框 + 重新生成按钮
- 灯箱大图预览（ESC 关闭）
- 生成中/失败/空状态 三种状态反馈

**`apps/web/pages/image-project/ImageProjectLayout.tsx`** — 修复：
- L133: `Math.min(2, ...)` → `Math.min(IMAGE_PROJECT_MAX_STEP, ...)`
- L179: `Math.min(2, ...)` → `Math.min(IMAGE_PROJECT_MAX_STEP, ...)`
- L225 snapshotHash 增加 step3
- L240 projectData 保存增加 step3

**`apps/web/store/useAppStore.ts`** — 添加 ImageProjectStep3Snapshot 接口和 step3 字段

**`apps/web/App.tsx`** — 两条项目流程均注册 step3 路由

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Type] 补定义 ModelPhoto 接口**
- **Found during:** Task 1
- **Issue:** Phase 1 SUMMARY 声称 types.ts 已添加 ModelPhoto 接口，但实际文件中不存在（只有 CharacterFiveView 和 SoftDeletable）
- **Fix:** 在 src/contracts/types.ts 末尾添加了 ModelPhotoStatus 类型和 ModelPhoto 接口
- **Files modified:** src/contracts/types.ts
- **Commit:** c4198ef9

**2. [Rule 2 - Missing State Type] 补定义 ImageProjectStep3Snapshot**
- **Found during:** Task 3
- **Issue:** useAppStore.ts 的 ProjectState 只有 step1/step2 类型定义，缺少 step3
- **Fix:** 添加 ImageProjectStep3Snapshot 接口和 step3 可选字段
- **Files modified:** apps/web/store/useAppStore.ts
- **Commit:** 3036571a

## Known Stubs

| Stub | File | Line | Description |
|------|------|------|-------------|
| TODO: 错误提示 UI | apps/web/pages/image-project/ImageModelPhotos.tsx | 250 | generate-batch 失败时 catch 块缺少用户可见的错误反馈 |

## Threat Flags

None — 所有端点已实现 T-03-01 至 T-03-06 的 mitigations（认证、归属校验、JSON 校验、内部存储路径、单张失败隔离）。

## Self-Check: PASSED

All created files verified:
- `src/repositories/pg/model-photo-pg-repository.ts` ✓
- `src/routes/image-project/step3-handlers.ts` ✓
- `apps/web/services/realApi/image-step3.ts` ✓
- `apps/web/pages/image-project/ImageModelPhotos.tsx` ✓
- Route registration confirmed in `src/routes/image-project/index.ts` ✓
