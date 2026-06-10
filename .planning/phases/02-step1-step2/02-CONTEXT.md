# Phase 2: Step 1+2（服装搭配+角色定妆）- Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** Developer discussion

<domain>
## Phase Boundary

交付图片项目 Step 1 服装搭配和 Step 2 角色定妆的完整前后端流程。不复用视频项目 step 代码，但复用底层服务（outfit-service、character-service）和 LLM 传输层。

**输入:** Phase 1 的类型定义、数据库表、合约契约
**输出:**
- 前端：精简现有 `ImageAssets.tsx` 和 `ImageCharacterSelection.tsx`，保持逻辑与视频项目一致
- 后端：在 `src/routes/image-project/` 实现 Step 1 和 Step 2 路由 handlers
- 数据：复用 `outfit_plans`、`character_previews` 表，通过 projectId 区分

</domain>

<decisions>
## Implementation Decisions

### 前端策略
- 精简现有 `ImageAssets.tsx`（3146行）和 `ImageCharacterSelection.tsx`（3118行），不复用视频项目业务逻辑
- 共享 UI 组件（`UploadSlotCard`、`OutfitCard`、`OutfitAnalysisCard`、`SelectionPanel`）可复用
- 目前保持逻辑与视频项目一致，不裁剪模块
- 路由：`/image-create/:projectId/step1` 和 `/image-create/:projectId/step2`

### 后端策略
- 在 `src/routes/image-project/` 下实现 Step 1 和 Step 2 路由
- 复用现有 `outfit-service`、`character-service` 处理业务逻辑
- 复用 LLM 传输层（`llm-transport.ts`）
- 复用提示词管理模块（`prompt-helper.ts`）
- 路由注册：在 `registerImageProjectRoutes()` 中添加 step1/step2 路由

### 数据存储
- 复用已有 `outfit_plans`、`character_previews` 表
- 通过 `projectId` 区分图片/视频项目
- 图片项目 step1/step2 的 workflow state 存储在独立的 `step1`/`step2` 字段（已在 Phase 1 的 `buildProjectStepState` 分支中实现）

### Step 1 搭配分析
- 支持多主体+多方案（和视频项目一致）
- 用户上传商品图 → AI 搭配分析 → 输出多套标准化搭配方案
- 用户可选择满意的方案进入 Step 2

### Step 2 角色定妆
- 保持和视频项目一致的五视图生成流程
- 用户确认搭配方案后，基于搭配生成角色定妆图（五视图）
- 五视图：正面、侧面、背面、45度、全身

### 架构约束
- `app.ts` 只减不增，所有新路由放 `src/routes/`
- 提示词必须通过提示词管理模块，禁止硬编码
- 主流程失败时直接报错，禁止静默降级
- 不创建数据库迁移文件，直接操作数据库

</decisions>

<canonical_refs>
## Canonical References

### 项目规范
- `CLAUDE.md` — 项目核心规范
- `.planning/PROJECT.md` — 项目上下文
- `.planning/ROADMAP.md` — Phase 路线图
- `.planning/REQUIREMENTS.md` — v1 需求

### Phase 1 交付物
- `.planning/phases/01-data-foundation/01-SUMMARY.md` — Phase 1 总结
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — Phase 1 决策

### 前端
- `apps/web/pages/image-project/ImageAssets.tsx` — Step 1 页面（需精简）
- `apps/web/pages/image-project/ImageCharacterSelection.tsx` — Step 2 页面（需精简）
- `apps/web/pages/shared/step1-shared-components.tsx` — 共享 Step 1 UI 组件
- `apps/web/pages/project-flow/Assets.tsx` — 视频项目 Step 1 参考
- `apps/web/pages/project-flow/CharacterSelection.tsx` — 视频项目 Step 2 参考

### 后端
- `src/routes/image-project/index.ts` — 图片项目路由注册器（待填充）
- `src/modules/outfit-service.ts` — 搭配分析服务（复用）
- `src/modules/character-service.ts` — 角色定妆服务（复用）
- `src/modules/prompt/prompt-helper.ts` — 提示词管理模块
- `src/routes/step1-outfit/index.ts` — 视频项目 Step 1 路由参考
- `src/routes/step2-character/index.ts` — 视频项目 Step 2 路由参考

### 类型定义
- `src/contracts/types.ts` — ModelPhoto, PageSection, SectionVersion 等
- `src/contracts/project-step-snapshot.ts` — ImageStep1-4Snapshot
- `src/contracts/step1-joint-reverse-contract.ts` — Step 1 合约
- `src/contracts/step1-outfit-module-contract.ts` — Step 1 模块合约

</canonical_refs>

<specifics>
## Specific Ideas

### 后端路由需要实现
1. Step 1: 图片上传、AI 搭配分析接口（推荐 outfit）
2. Step 1: 选择/取消搭配方案
3. Step 1: 图片分类、背景移除
4. Step 2: 角色定妆图生成
5. Step 2: 确认/重新生成定妆图
6. Step 2: 五视图管理

### 前端精简重点
- 移除视频项目特有的 Step 3-5 相关逻辑
- 确保数据流指向图片项目的 workflow state 字段
- 路由导航使用 `buildImageProjectCanonicalRoute` 而非视频路由

### 数据库
- 不需要新建表，复用已有 outfit_plans 和 character_previews
- 通过 projectId 自然隔离

</specifics>

<deferred>
## Deferred Ideas

- Step 3 姿势库/背景库管理界面 → Phase 3
- Step 4 三栏编辑器前端 → Phase 4
- 导出为长图/ZIP → Phase 5
- 非商品图分类拦截逻辑 → 后续按需添加
- Admin debug prompt 面板 → 后续按需保留

</deferred>

---

*Phase: 02-step1-step2*
*Context gathered: 2026-04-10 via developer discussion*
