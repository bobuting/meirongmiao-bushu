---
phase: 2
plan: 01
name: "图片项目 Step 1 (服装搭配) + Step 2 (角色定妆) 前端-后端全链路"
type: execution
tags: [image-project, step1, step2, outfit, character, fullstack]
subsystem: image-pipeline
dependencyGraph:
  requires: [phase-01-data-foundation]
  provides: [step1-outfit-flow, step2-character-flow, image-project-routes]
  affects: [project-layout, real-api-layer]
techStack:
  added:
    - Fastify route handlers (step1-handlers.ts, step2-handlers.ts)
    - Dedicated image API modules (image-step1.ts, image-step2.ts)
    - React component simplification (ImageAssets, ImageCharacterSelection)
  patterns:
    - /image-projects/ path prefix isolation
    - projectData.step1/step2 nested store structure
    - Auto-save with change detection (3s interval)
keyFiles:
  created:
    - src/routes/image-project/step1-handlers.ts
    - src/routes/image-project/step2-handlers.ts
    - apps/web/services/realApi/image-step1.ts
    - apps/web/services/realApi/image-step2.ts
  modified:
    - src/routes/image-project/index.ts
    - apps/web/services/realApi/index.ts
    - apps/web/pages/image-project/ImageAssets.tsx
    - apps/web/pages/image-project/ImageCharacterSelection.tsx
    - apps/web/pages/image-project/ImageProjectLayout.tsx
decisions:
  - "Image API 模块使用 image- 前缀方法名，不修改 shared step1/step2.ts"
  - "Frontend 组件使用 projectData.step1/step2 嵌套结构，匹配后端 snapshot 类型"
  - "imageResolveStep2FixedTemplateParameterVariants 使用直接 request() 调用，绕过共享函数中硬编码的 /projects/ 路径"
  - "ImageProjectLayout 自动保存采用数据指纹比对，避免无效请求"
metrics:
  duration: "~45 min"
  completedDate: "2026-04-10"
  tasksCompleted: 8
  totalTasks: 8
---

# Phase 2 Plan 01: 图片项目 Step 1+2 全链路 Summary

## 一句话总结

实现图片项目完整的 Step 1（服装搭配推荐/选择/分类/抠图/角色方向）和 Step 2（角色定妆预览/确认/重生成）前后端全链路，包括 10 个后端路由、12 个前端 API 方法、2 个精简前端组件、1 个自动保存布局。

## 任务完成情况

| 任务 | 名称 | Commit | 文件 |
|------|------|--------|------|
| 1 | 注册 step1/step2 路由 handler | 41a6d3b8 | `src/routes/image-project/index.ts` |
| 2 | 创建 step1-handlers.ts (6 路由) | 7a73dd22 | `src/routes/image-project/step1-handlers.ts` |
| 3 | 创建 step2-handlers.ts (4 路由) | 7a73dd22 | `src/routes/image-project/step2-handlers.ts` |
| 4A | 创建 image-step1.ts + image-step2.ts | d09f5dfd | `apps/web/services/realApi/image-step1.ts`, `image-step2.ts` |
| 4B | 注册到 realBackendApi | d09f5dfd | `apps/web/services/realApi/index.ts` |
| 4C | 精简 ImageAssets.tsx (3146→561行) | f3847417 | `apps/web/pages/image-project/ImageAssets.tsx` |
| 4C | 精简 ImageCharacterSelection.tsx (3118→449行) | f3847417 | `apps/web/pages/image-project/ImageCharacterSelection.tsx` |
| 4D | ImageProjectLayout 自动保存 | c27a8d27 | `apps/web/pages/image-project/ImageProjectLayout.tsx` |

## 后端路由清单

### Step 1 路由 (6 endpoints)
| 路径 | 方法 | 功能 |
|------|------|------|
| `/image-projects/:projectId/step1/outfits/recommend` | POST | 生成搭配推荐 |
| `/image-projects/:projectId/step1/outfits/select` | POST | 选中搭配方案 |
| `/image-projects/:projectId/step1/outfits/unselect` | POST | 取消选中搭配 |
| `/image-projects/:projectId/step1/classify-image` | POST | 图片分类（正面/侧面等） |
| `/image-projects/:projectId/step1/remove-bg` | POST | 图片抠图去背景 |
| `/image-projects/:projectId/step1/role-direction` | POST | 生成角色方向卡片 |

### Step 2 路由 (4 endpoints)
| 路径 | 方法 | 功能 |
|------|------|------|
| `/image-projects/:projectId/step2/fixed-template-parameter-variants` | POST | LLM 提示词参数变体生成 |
| `/image-projects/:projectId/step2/characters/previews` | POST | 生成五视角定妆预览 |
| `/image-projects/:projectId/step2/characters/confirm` | POST | 确认定妆预览 |
| `/image-projects/:projectId/step2/characters/previews/:previewId/regenerate` | POST | 重新生成单个视角 |

## 前端 API 方法

### imageStep1Api (4 methods)
- `imageUploadAssets` — 上传服装资产
- `imageStep1ClassifyImage` — 图片分类
- `imageStep1RemoveBg` — 抠图去背景
- `imageStep1GenerateRoleDirection` — 角色方向生成

### imageStep2Api (8 methods)
- `imageRecommendOutfits` — 搭配推荐
- `imageSelectOutfit` — 选中搭配
- `imageUnselectOutfit` — 取消选中
- `imageListPresets` — 列出角色预设
- `imageGeneratePreviews` — 生成五视角预览
- `imageConfirmPreview` — 确认预览
- `imageRegenerateCharacterPreview` — 重新生成预览
- `imageResolveStep2FixedTemplateParameterVariants` — 参数变体生成

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ctx 上调用独立函数的编译错误**
- **Found during:** Task 2 (step1-handlers.ts)
- **Issue:** 初始代码尝试在 `ctx` 上调用 `buildStep1ImageClassificationHeuristic`、`requestStep1ImageClassification`、`isSupportedLlmImageUrl`、`removeStep1ImageBackgroundToWhiteDataUrl`，但这些是独立模块函数，不在 AppContext 上
- **Fix:** 改为直接从源模块 import：
  - `buildStep1ImageClassificationHeuristic` from `../../modules/step1-image-classification.js`
  - `isSupportedLlmImageUrl` from `../../services/media/image-utils.js`
  - `requestStep1ImageClassification` from `../../modules/step1-image-classification.js`
  - `removeStep1ImageBackgroundToWhiteDataUrl` from `../../modules/single-image-outfit-analysis.js`
- **Files modified:** `src/routes/image-project/step1-handlers.ts`

**2. [Rule 1 - Bug] requestStep2FixedTemplateParameterVariants 硬编码 /projects/ 路径**
- **Found during:** Task 4A (image-step2.ts)
- **Issue:** 共享函数 `requestStep2FixedTemplateParameterVariants` 在 `backendApi.step2PromptVariants.ts` 中硬编码了 `/projects/${projectId}/...` 路径，图片项目需要使用 `/image-projects/`
- **Fix:** 在 `image-step2.ts` 中使用直接 `request()` 调用，传入 `/image-projects/${projectId}/step2/fixed-template-parameter-variants`
- **Files modified:** `apps/web/services/realApi/image-step2.ts`

**3. [Rule 1 - Bug] assertCondition 重复定义**
- **Found during:** Task 3 (step2-handlers.ts)
- **Issue:** 初始代码在文件底部定义了本地 `assertCondition` 函数，但 `src/core/errors.js` 已导出同名函数
- **Fix:** 改为 `import { AppError, assertCondition } from "../../core/errors.js"`，删除本地定义
- **Files modified:** `src/routes/image-project/step2-handlers.ts`

## 编译验证结果

- **Backend (npx tsc --noEmit):** 通过（仅 baseUrl 弃用警告）
- **Frontend (cd apps/web && npx tsc --noEmit):** 通过（仅 baseUrl 弃用警告，无新增错误）

## 文件行数检查

| 文件 | 行数 | 限制 | 状态 |
|------|------|------|------|
| ImageAssets.tsx | 561 | < 1200 | ✅ |
| ImageCharacterSelection.tsx | 449 | < 1200 | ✅ |
| ImageProjectLayout.tsx | 269 | < 1200 | ✅ |
| step1-handlers.ts | 464 | < 1200 | ✅ |
| step2-handlers.ts | 444 | < 1200 | ✅ |
| image-step1.ts | 133 | < 1200 | ✅ |
| image-step2.ts | 184 | < 1200 | ✅ |

## 路由隔离验证

- **image-step1.ts:** 所有路径使用 `/image-projects/` ✅
- **image-step2.ts:** 所有路径使用 `/image-projects/` ✅
- **无硬编码 `/projects/` 路径泄漏** ✅
- **realApi/step1.ts 和 realApi/step2.ts 未被修改** ✅

## Threat Flags

无新增安全威胁面。所有路由均复用现有 auth guard (`requireUser`) 和 owner 验证 (`requireOwnerProject`)。

## Self-Check: PASSED

- 所有创建的文件已验证存在
- 所有 commit 已验证 (41a6d3b8, 7a73dd22, d09f5dfd, f3847417, c27a8d27)
- 后端编译通过
- 前端编译通过
- 路由隔离验证通过
- 文件行数全部 < 1200
