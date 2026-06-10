# Phase 1: 数据基础 - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** Developer discussion + banana-mall reference study

<domain>
## Phase Boundary

建立图片项目 4 步流水线所需的全部类型定义、数据库表和合约契约。这是零依赖的基础设施层，所有后续 Phase 都依赖于此。

**输入:** 项目现有的 TypeScript 类型系统、PostgreSQL persistence 层、路由注册机制
**输出:** 
- `src/contracts/types.ts` 新增图片项目专用类型
- `src/contracts/project-step-snapshot.ts` 图片项目 step1-4 snapshot
- PostgreSQL 数据库表（直接 SQL 操作，不写迁移文件）
- 路由注册扩展点

</domain>

<decisions>
## Implementation Decisions

### 类型定义
- 图片项目使用独立的 step1-4 snapshot，不与视频项目共享（step1/step2 后续可能调整）
- `IMAGE_PROJECT_MAX_STEP` 从 2 改为 4
- 所有 clamp/filter 逻辑覆盖 step1-4

### 数据库表
- 不使用 `payload_json` 模式，使用传统字段模式
- 表名和字段都要加中文备注
- 直接操作数据库，不创建迁移文件
- 表命名：`nrm_model_photos`（模特图）、`nrm_page_sections`（页面区块）、`nrm_section_versions`（区块版本）
- 图片项目 step1-4 的数据存储也需要新表（不与视频项目 step1-7 混用）

### 路由注册
- 不往 `app.ts` 写代码，路由放 `src/routes/`
- 新增 `image_project_routes` 注册器
- 通过 `...otherHandlers` 扩展点注册

### 架构约束
- step1/step2 全部新写，不复用视频项目代码
- 接口定义放 `src/service/services-sub.ts`
- 复用已有 LLM 传输层，不新建 provider 逻辑
- 复用已有对象存储 adapters

</decisions>

<canonical_refs>
## Canonical References

### 项目规范
- `CLAUDE.md` — 项目核心规范（文件约束、数据库约束、前端规范）
- `.planning/PROJECT.md` — 项目上下文
- `.planning/ROADMAP.md` — Phase 路线图
- `.planning/REQUIREMENTS.md` — v1 需求

### 研究
- `.planning/research/STACK.md` — 技术栈研究
- `.planning/research/FEATURES.md` — 功能研究
- `.planning/research/ARCHITECTURE.md` — 架构研究
- `.planning/research/PITFALLS.md` — 陷阱研究

### 参考项目
- `/tmp/banana-mall/lib/ai/schemas/section-plan.ts` — Section Plan Schema
- `/tmp/banana-mall/lib/ai/prompts/planning.ts` — 页面规划 Prompt
- `/tmp/banana-mall/lib/ai/prompts/generation.ts` — 图片生成 Prompt

</canonical_refs>

<specifics>
## Specific Ideas

### 需要定义的类型
1. **ModelPhoto** — Step 3 模特图数据模型
2. **PageSection** — Step 4 电商详情页区块
3. **SectionVersion** — Step 4 区块版本历史
4. **ImageProjectStep1-4 Snapshots** — 图片项目每步的 resume snapshot

### 需要创建的数据库表
1. `nrm_model_photos` — 模特图存储
2. `nrm_page_sections` — 页面区块
3. `nrm_section_versions` — 区块版本历史
4. 图片项目 step1-4 数据存储（可能需要独立表）

### 需要扩展的路由
- `src/routes/image-project/` — 图片项目专用路由目录
- `src/routes/index.ts` — 新增 `image_project_routes` 注册器
- `src/routes/project-flow-crud-routes.ts` — `buildProjectStepState` 扩展

</specifics>

<deferred>
## Deferred Ideas

- 姿势库/背景库管理界面 → Phase 3
- 三栏编辑器前端 → Phase 4
- 导出为长图/ZIP → Phase 5
- 多语言支持 → v2

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-04-10 via developer discussion*
