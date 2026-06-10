---
gsd_version: 1.0
phase: 04
phase_name: step4-ecommerce-page
plan: 01
plan_name: "类型定义 + Repository + Section 规划服务 + 图片生成服务 + 路由"
type: auto
autonomous: true
created: "2026-04-10"
duration_minutes: 45
dependencies: []
requires: []
provides:
  - PageSection and SectionVersion domain types
  - IPageSectionRepository and ISectionVersionRepository ports
  - PgPageSectionRepository and PgSectionVersionRepository
  - SectionPlanningService with LLM-based planning
  - SectionGenerationService with image generation
  - 11 REST API routes for ecommerce page section management
affects:
  - src/contracts/types.ts
  - src/contracts/repository-ports/library-repository.ts
  - src/repositories/pg/index.ts
  - nrm_prompt_templates (added step4_section_planning)
tech_stack:
  added: []
  patterns:
    - Repository pattern with PgPool/PoolClient dual support
    - Dependency injection via deps interfaces
    - LLM prompt management via getPromptContent()
    - Provider resolution via resolveRouteProvider()
key_files:
  created:
    - src/repositories/pg/page-section-pg-repository.ts
    - src/repositories/pg/section-version-pg-repository.ts
    - src/modules/section-planning-service.ts
    - src/modules/section-generation-service.ts
    - src/routes/image-project/step4-handlers.ts
    - src/routes/image-project/index.ts
  modified:
    - src/contracts/types.ts
    - src/contracts/repository-ports/library-repository.ts
    - src/repositories/pg/index.ts
decisions:
  - "Routes placed in src/routes/image-project/ directory (new), not in app.ts per CLAUDE.md"
  - "11 routes instead of 10 (plan said 10 but listed 11 distinct operations)"
  - "Image generation supports Nano Banana, Gemini, and Jimeng providers"
  - "Section planning uses step4_section_planning prompt created in database"
  - "Model photos loaded directly from nrm_model_photos table (no dedicated repository needed)"
metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 3
  lines_added: ~1500
  duration_minutes: 45
  completed_date: "2026-04-10"
---

# Phase 04 Plan 01: 类型定义 + Repository + Section 规划服务 + 图片生成服务 + 路由 执行摘要

**One-liner:** 电商详情页 Section 规划与图片生成后端完整实现，包含类型定义、Repository 层、LLM 规划服务、图片生成服务、11 个 REST API 路由。

## Tasks Executed

### Task 1: 类型定义 + Repository 层 (commit: 06f7e2f1)

**Created/Modified Files:**
- `src/contracts/types.ts` — 新增 `SectionType`、`SectionStatus`、`PageSection`、`SectionVersion` 类型
- `src/contracts/repository-ports/library-repository.ts` — 新增 `IPageSectionRepository`、`ISectionVersionRepository` 接口
- `src/repositories/pg/page-section-pg-repository.ts` — PgPageSectionRepository 实现（CRUD + batch sort + image update）
- `src/repositories/pg/section-version-pg-repository.ts` — PgSectionVersionRepository 实现（版本追踪 + 激活切换）
- `src/repositories/pg/index.ts` — 注册两个新仓库到 PgRepositoryCollection

**DB Verification:** `nrm_page_sections` 和 `nrm_section_versions` 表已存在（Phase 1 创建）

### Task 2: Section 规划服务 (commit: 3e66a7d7)

**Created Files:**
- `src/modules/section-planning-service.ts`

**Key Functions:**
- `planSections()` — 获取项目 + 搭配方案 + 模特照片 → 构建 prompt → 调用 LLM → 解析 JSON → 校验 → 返回 `PageSection[]`
- `isValidSectionPlanItem()` — 严格校验 LLM 返回的每个 Section 项
- `persistSections()` — 批量保存 Section 到数据库
- 使用 `getPromptContent("step4_section_planning", ...)` 获取提示词，无硬编码

**Prompt 创建：** 在 `nrm_prompt_templates` 中创建了 `step4_section_planning` 提示词模板（status: published）

### Task 3: 图片生成服务 + 路由 (commit: 5b86a943)

**Created Files:**
- `src/modules/section-generation-service.ts` — Section 图片生成服务
- `src/routes/image-project/step4-handlers.ts` — 11 个路由处理器
- `src/routes/image-project/index.ts` — 路由注册入口

**SectionGenerationService Methods:**
- `generateSectionImage()` — 生成单个 Section 图片
- `regenerateSectionImage()` — 重新生成（创建新版本）
- `generateAllSections()` — 批量生成所有 Section 图片
- `persistSectionVersion()` — 持久化版本
- `listSectionVersions()` — 列出版本
- `activateSectionVersion()` — 激活指定版本

**11 Routes:**
| # | Method | Path | Handler |
|---|--------|------|---------|
| 1 | POST | `/projects/:projectId/sections/plan` | 规划 Section |
| 2 | GET | `/projects/:projectId/sections` | 列出所有 Section |
| 3 | POST | `/projects/:projectId/sections` | 创建 Section |
| 4 | PUT | `/projects/:projectId/sections/:sectionId` | 更新 Section |
| 5 | DELETE | `/projects/:projectId/sections/:sectionId` | 删除 Section |
| 6 | POST | `/projects/:projectId/sections/:sectionId/generate` | 生成图片 |
| 7 | POST | `/projects/:projectId/sections/:sectionId/regenerate` | 重新生成 |
| 8 | POST | `/projects/:projectId/sections/generate-all` | 生成全部 |
| 9 | PUT | `/projects/:projectId/sections/reorder` | 重排序 |
| 10 | GET | `/projects/:projectId/sections/:sectionId/versions` | 版本列表 |
| 11 | POST | `/projects/:projectId/sections/:sectionId/versions/:versionId/activate` | 激活版本 |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| section-generation-service.ts | 143 | `currentImageAssetId = null` | 图片 URL 已持久化到对象存储，但尚未关联到 asset 表。待后续 plan 实现 asset 关联逻辑 |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new_endpoints | src/routes/image-project/step4-handlers.ts | 新增 11 个 API 端点，已通过 requireUser() + 项目所有权验证保护 |
| threat_flag: llm_input | src/modules/section-planning-service.ts | 搭配方案和模特照片数据传入 LLM，需确保无敏感信息泄露 |
| threat_flag: image_gen | src/modules/section-generation-service.ts | 调用外部图片生成 Provider，已添加错误处理和状态回滚 |

## Self-Check

- [x] src/contracts/types.ts — FOUND (modified)
- [x] src/contracts/repository-ports/library-repository.ts — FOUND (modified)
- [x] src/repositories/pg/index.ts — FOUND (modified)
- [x] src/repositories/pg/page-section-pg-repository.ts — FOUND
- [x] src/repositories/pg/section-version-pg-repository.ts — FOUND
- [x] src/modules/section-planning-service.ts — FOUND
- [x] src/modules/section-generation-service.ts — FOUND
- [x] src/routes/image-project/step4-handlers.ts — FOUND
- [x] src/routes/image-project/index.ts — FOUND
- [x] TypeScript compilation — PASSED (no errors)
- [x] step4_section_planning prompt — CREATED in nrm_prompt_templates (published)
- [x] DB tables verified — nrm_page_sections, nrm_section_versions exist

## Self-Check: PASSED
