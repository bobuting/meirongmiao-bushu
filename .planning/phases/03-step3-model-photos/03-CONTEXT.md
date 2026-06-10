# Phase 3: Step 3（模特图自动生成）- Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** Developer discussion

<domain>
## Phase Boundary

基于定妆图，AI 自动生成多张专业模特图（姿势+背景由 LLM 动态生成），用户可勾选满意的图加入素材池，也可重新生成不满意的单张。

**输入:** Phase 2 完成后的角色定妆图（五视图）
**输出:**
- 后端：ModelPhoto 仓库层 + Step 3 路由 handlers + AI 规划生成逻辑
- 前端：网格展示 + 灯箱预览 + 选择交互页面
- 数据：nrm_model_photos 表的 CRUD 操作

</domain>

<decisions>
## Implementation Decisions

### 姿势库/背景库 — LLM 动态生成
- 不创建硬编码预设库或数据库配置表
- LLM 根据商品特征（搭配方案、角色定妆图信息）动态生成姿势和背景描述
- 每次生成时 AI 自动规划最优组合方案（约 8-12 张，覆盖不同场景）
- poseLabel 和 bgLabel 字段由 LLM 生成的中文描述填充（如 "正面全身站立"、"纯色渐变棚拍"）

### 生成流程 — AI 规划 + 分批生成
- **Step 3A - 规划**：LLM 分析搭配方案和定妆图，输出最优模特图规划方案（包含每张照片的姿势+背景组合）
- **Step 3B - 生成**：按规划方案逐张调用图片生成 API（requestJimengImageUrl，text_to_image 模式）
- 生成过程中显示进度（"正在生成 3/8 张..."）
- 用户可对不满意的单张点击重新生成（AI 会为该张重新规划参数）

### 前端展示 — 网格 + 灯箱预览
- 网格展示所有模特图（响应式，移动端 2 列，桌面端 3-4 列）
- 每张图显示：poseLabel、bgLabel 标签
- 勾选框：用户可勾选/取消满意的图（加入素材池）
- 点击任意图片打开灯箱（lightbox）大图预览
- 重新生成按钮：每张图右上角，点击后重新生成该张
- "一键生成"按钮：Step 3 进入后首显，触发 AI 规划+批量生成

### 数据存储
- 使用 nrm_model_photos 表（Phase 1 已创建）
- 需要创建 ModelPhoto 的 Repository 层（目前缺失）
- Repository 接口放在 `src/repositories/pg/` 下
- 通过 projectId 区分不同项目的模特图

### 图片生成
- 复用 `requestJimengImageUrl` 和 `persistImageSourceToStorage`
- Provider 解析：`resolveRouteProviderWithFallback(ctx, ["text_to_image", "image_generation"])`
- 生成失败直接报错（遵循项目规范，不降级）

### 架构约束
- `app.ts` 只减不增，路由放 `src/routes/image-project/`
- 提示词通过提示词管理模块，禁止硬编码
- 主流程失败直接报错，禁止静默降级
- 不创建数据库迁移文件，直接操作数据库
- 单文件不超过 1200 行

### ImageProjectLayout 扩展
- Phase 2 的 layout 只支持 step1/step2 的 auto-save 和 state restoration
- Phase 3 需要扩展 layout 支持 step3 的自动保存（`projectData.step3`）
- `Math.min(2, step)` 需改为 `Math.min(IMAGE_PROJECT_MAX_STEP, step)`

</decisions>

<canonical_refs>
## Canonical References

### 项目规范
- `CLAUDE.md` — 项目核心规范
- `.planning/PROJECT.md` — 项目上下文
- `.planning/ROADMAP.md` — Phase 路线图
- `.planning/REQUIREMENTS.md` — v1 需求

### 类型定义
- `src/contracts/types.ts` — ModelPhoto 接口（L1049-1065）
- `src/contracts/project-step-snapshot.ts` — ImageStep3Snapshot（L71-76）

### 图片生成
- `src/services/media/image-generation-providers.ts` — requestJimengImageUrl 等
- `src/services/media/storage-persist.ts` — persistImageSourceToStorage
- `src/services/llm/provider-resolver.ts` — resolveRouteProviderWithFallback

### LLM 传输
- `src/services/llm/llm-transport.ts` — LLM 调用入口
- `src/modules/prompt/prompt-helper.ts` — 提示词管理

### Phase 2 交付物
- `.planning/phases/02-step1-step2/02-SUMMARY.md` — Phase 2 总结
- `src/routes/image-project/step1-handlers.ts` — Step 1 路由参考
- `src/routes/image-project/step2-handlers.ts` — Step 2 路由参考

### 前端参考
- `apps/web/pages/image-project/ImageProjectLayout.tsx` — 布局组件（需扩展 step3 支持）
- `apps/web/pages/image-project/imageProjectRouteNormalization.ts` — 路由规范化
</canonical_refs>

<specifics>
## Specific Ideas

### 后端需要实现
1. ModelPhoto Repository — CRUD 操作（findById, findByProjectId, create, update, delete, bulkCreate）
2. Step 3 路由 handlers — 规划、生成、重新生成、选中/取消
3. AI 规划逻辑 — LLM 分析搭配方案，输出模特图规划方案（姿势+背景组合）
4. 图片生成逻辑 — 调用 Jimeng API，持久化到存储，写入数据库

### 前端需要实现
1. Step 3 页面组件 — 网格展示 + 灯箱预览 + 选择交互
2. ImageProjectLayout 扩展 — step3 自动保存 + state restoration
3. API 模块 — image-step3.ts（独立 API 层）

### 数据库
- nrm_model_photos 表已在 Phase 1 创建
- 需要创建对应的 Repository 实现
- 表结构：id, projectId, imageUrl, poseLabel, bgLabel, isSelected, status, errorMessage, order, createdAt, updatedAt

</specifics>

<deferred>
## Deferred Ideas

- 姿势库/背景库可视化管理界面 → v2
- 模特图批量导出/下载 → Phase 5
- 并行生成优化（多张图片同时生成）→ v2
- 生成历史记录/版本回溯 → v2

</deferred>

---

*Phase: 03-step3-model-photos*
*Context gathered: 2026-04-10 via developer discussion*
