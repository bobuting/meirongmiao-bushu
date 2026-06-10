# Roadmap: 图片项目 4 步流水线

## Overview

为 AI 电商短视频平台新增独立的图片项目 4 步流水线。从 Phase 1 的数据基础开始，逐步交付服装搭配、角色定妆、模特图自动生成、电商详情页规划与生成，最终形成完整可用的图片项目工作流。

## Phases

- [x] **Phase 1: 数据基础** — 类型定义、数据库表、合约契约
- [x] **Phase 2: Step 1+2（服装搭配+角色定妆）** — 图片项目前两步完整流程
- [x] **Phase 3: Step 3（模特图自动生成）** — 姿势+背景库，AI 自动匹配组合出图
- [x] **Phase 4: Step 4（电商详情页）** — Section-based 规划 + 分区块图片生成 + 手机预览编辑器
- [x] **Phase 5: 集成与打磨** — 路由接入、数据导出、错误处理、项目列表集成

## Phase Details

### Phase 1: 数据基础
**Goal**: 建立图片项目 4 步流水线所需的全部类型定义、数据库表和合约契约
**Depends on**: Nothing (first phase)
**Requirements**: [IMG-05]
**Success Criteria** (what must be TRUE):
  1. `ModelPhoto`、`PageSection`、`SectionVersion` 类型定义已存在于 `src/contracts/types.ts`
  2. 图片项目 step1-4 的 snapshot 类型已定义在 `project-step-snapshot.ts`
  3. `IMAGE_PROJECT_MAX_STEP = 4`，图片项目的 clamp/filter 逻辑覆盖 step1-4
  4. PostgreSQL 数据库表已创建（`nrm_model_photos`、`nrm_page_sections`、`nrm_section_versions`）
  5. 图片项目专用的路由注册扩展点已在 `api-registration.ts` 就绪
**Plans**: 2 plans

Plans:
- [x] 01-01: 类型定义 + 合约契约（Step1-4 snapshot、ModelPhoto、PageSection、SectionVersion、MAX_STEP 更新）
- [x] 01-02: 数据库表创建 + 路由注册扩展点

### Phase 2: Step 1+2（服装搭配+角色定妆）
**Goal**: 交付图片项目 Step 1 服装搭配和 Step 2 角色定妆的完整前后端流程（新写，不复用视频代码）
**Depends on**: Phase 1
**Requirements**: [IMG-01, IMG-02]
**Success Criteria** (what must be TRUE):
  1. 用户可以上传图片并完成 AI 搭配分析，输出标准化搭配方案
  2. 用户可以基于搭配方案生成角色定妆图，支持五视图展示
  3. Step 1 确认后可进入 Step 2，Step 2 确认后可进入 Step 3
  4. 图片项目路由 `/image-create/:projectId/step1` 和 `/image-create/:projectId/step2` 可正常访问
  5. 数据存储到独立的 step1/step2 字段，不与视频项目混用
**Plans**: 1 plan

Plans:
- [x] 02-01: Step 1+2 完整前后端 — 图片项目路由 + 前端精简 + 工作流保存 (COMPLETE - 8/8 tasks)

### Phase 3: Step 3（模特图自动生成）
**Goal**: 基于定妆图，AI 自动生成多张专业模特图（姿势+背景自动组合），用户可选中和重新生成
**Depends on**: Phase 2
**Requirements**: [IMG-03]
**Success Criteria** (what must be TRUE):
  1. 进入 Step 3 后可一键触发模特图批量生成
  2. 生成过程中显示进度，完成后以网格展示所有候选图
  3. 每张图标注使用的姿势和背景标签
  4. 用户可以勾选/取消满意的图（加入素材池）
  5. 用户可以重新生成单张不满意的图
  6. 选中的图数据正确传递给 Step 4
**Plans**: 3 plans

Plans:
- [x] 03-01: 模特图 Repository + 后端路由 + 前端网格页面 (COMPLETE - 3/3 tasks)

### Phase 4: Step 4（电商详情页）
**Goal**: 借鉴 banana-mall 的 Section-based 架构，AI 规划页面结构并分区块生成详情页图片，支持手机预览和局部编辑
**Depends on**: Phase 3
**Requirements**: [IMG-04, IMG-06, IMG-07]
**Success Criteria** (what must be TRUE):
  1. 进入 Step 4 时 AI 自动规划页面结构（Hero + 卖点 + 场景 + 详情等区块）
  2. 每个区块可独立生成图片，也可一键生成全部
  3. 三栏编辑器：左栏模块树 + 中栏手机预览 + 右栏编辑面板
  4. 用户可以编辑单个区块的标题、文案并重新生成
  5. 所有区块生成完成后可导出图片
**Plans**: 2 plans

Plans:
- [x] 04-01: 后端 — 类型定义、Repository 层、AI 规划服务、图片生成服务、路由 handlers (COMPLETE)
- [x] 04-02: 前端 — Step 4 API 模块、三栏编辑器（模块树+手机预览+编辑面板+版本历史） (COMPLETE)
- [x] 04-03: 路由接入 — App.tsx step4 路由 + ImageEcommerceEditorRoute 容器 (COMPLETE)

### Phase 5: 集成与打磨
**Goal**: 打通图片项目完整链路，接入 AppContext 注册路由、错误处理、项目列表集成
**Depends on**: Phase 4
**Requirements**: [IMG-05]
**Success Criteria** (what must be TRUE):
  1. 从创建图片项目 → Step 1 → Step 2 → Step 3 → Step 4 全流程可跑通
  2. 图片项目出现在项目列表中，可正常 resume
  3. 所有接口有完善的错误处理和用户反馈
  4. `buildProjectStepState` 按 projectKind 分支正确处理图片项目 step1-4
  5. 导航栏正确显示图片项目 4 步标签和进度
**Plans**: 2 plans

Plans:
- [x] 05-01: 路由接入 + AppContext 注册 + buildProjectStepState 扩展 (COMPLETE)
- [x] 05-02: 错误处理 + 项目列表集成 + 全流程 E2E 验证 (COMPLETE)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 数据基础 | 1/1 | Complete | 2026-04-10 |
| 2. Step 1+2 | 1/1 | Complete | 2026-04-10 |
| 3. Step 3 | 1/1 | Complete | 2026-04-10 |
| 4. Step 4 | 2/2 | Complete | 2026-04-10 |
| 5. 集成与打磨 | 2/2 | Complete | 2026-04-10 |

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMG-01 | Phase 2 | Complete |
| IMG-02 | Phase 2 | Complete |
| IMG-03 | Phase 3 | Complete |
| IMG-04 | Phase 4 | Complete |
| IMG-05 | Phase 1, 5 | Complete |
| IMG-06 | Phase 4 | Complete |
| IMG-07 | Phase 4 | Complete |

**Coverage:** 7/7 requirements completed (100%)

## Dependencies

```
Phase 1 (数据基础)
    ↓
Phase 2 (Step 1+2)
    ↓
Phase 3 (Step 3 模特图)
    ↓
Phase 4 (Step 4 详情页)
    ↓
Phase 5 (集成与打磨)
```

Each phase depends on the previous one completing. No parallel execution between phases.

---

*Last updated: 2026-04-10*
