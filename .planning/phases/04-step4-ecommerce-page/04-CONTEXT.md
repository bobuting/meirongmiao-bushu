# Phase 4: Step 4（电商详情页）- Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** Developer discussion + banana-mall reference study

<domain>
## Phase Boundary

借鉴 banana-mall 的 Section-based 架构，AI 规划页面结构并分区块生成详情页图片，支持手机预览和局部编辑。完整实现三栏编辑器（模块树 + 手机预览 + 编辑面板）。

**输入:** Phase 3 完成后的选中模特图（素材池）
**输出:**
- 后端：Section/Version Repository 层 + 规划服务 + 生成服务 + 路由 handlers
- 前端：三栏编辑器（模块树 + 手机预览 + 编辑面板）
- 数据：nrm_page_sections 和 nrm_section_versions 表的完整 CRUD

</domain>

<decisions>
## Implementation Decisions

### 三栏编辑器 — 完整实现
- 左侧（320px）：模块结构树，展示所有 section 及其状态（idle/generating/success/failed）
- 中间（flex）：手机预览，真实手机外框 mockup，展示完整电商详情页
- 右侧（380px）：编辑面板，可编辑 section 内容、重新生成、版本历史

### Section 类型 — 完整复用 banana-mall 的 11 种
- `hero` — 头图主视觉
- `selling_points` — 卖点模块
- `scenario` — 场景展示
- `detail_closeup` — 细节特写
- `specs` — 规格参数
- `material` — 材质工艺
- `comparison` — 对比说明
- `gift_scene` — 送礼场景
- `brand_trust` — 品牌信任
- `summary` — 总结收口
- `custom` — 自定义模块

### SVG 降级 — 不做
- 图片生成失败直接报错，不生成 SVG 兜底
- 遵循项目规范：主流程失败直接报错，禁止静默降级

### AI 规划流程
- 进入 Step 4 时自动触发 AI 规划
- LLM 分析搭配方案、定妆图、模特图素材，输出最优页面结构
- 返回 section 列表（type、title、goal、copy、visualPrompt）
- 用户可手动调整 section 顺序、类型、内容

### 图片生成
- 每个 section 可独立生成/重新生成图片
- 支持一键生成全部 section
- 版本管理：每次生成自动创建版本记录，可回退
- 参考图片：使用模特图中的 selectedPhotoIds 作为生成参考

### Repository 层 — 补齐 Phase 1 缺口
- `PageSection` 和 `SectionVersion` 类型定义需添加到 `src/contracts/types.ts`
- 创建 `IPageSectionRepository` 和 `ISectionVersionRepository` 接口
- 创建 `PgPageSectionRepository` 和 `PgSectionVersionRepository` 实现
- 注册到 `PgRepositoryCollection` 和 `AppContext`

### 数据存储
- nrm_page_sections 表已存在（Phase 1 创建）
- nrm_section_versions 表已存在（Phase 1 创建）
- 通过 projectId 区分不同项目

### 架构约束
- `app.ts` 只减不增，路由放 `src/routes/image-project/`
- 提示词通过提示词管理模块，禁止硬编码
- 主流程失败直接报错，禁止静默降级
- 不创建数据库迁移文件
- 单文件不超过 1200 行，单组件不超过 300 行

</decisions>

<canonical_refs>
## Canonical References

### 项目规范
- `CLAUDE.md` — 项目核心规范
- `.planning/PROJECT.md` — 项目上下文
- `.planning/ROADMAP.md` — Phase 路线图
- `.planning/REQUIREMENTS.md` — v1 需求

### banana-mall 参考
- `/tmp/banana-mall/lib/ai/schemas/section-plan.ts` — Section Plan Schema
- `/tmp/banana-mall/lib/ai/prompts/planning.ts` — 页面规划 Prompt
- `/tmp/banana-mall/lib/ai/prompts/generation.ts` — 图片生成 Prompt
- `/tmp/banana-mall/lib/services/planner-service.ts` — 规划服务
- `/tmp/banana-mall/lib/services/generation-service.ts` — 生成服务
- `/tmp/banana-mall/components/editor/editor-workspace.tsx` — 三栏编辑器 UI
- `/tmp/banana-mall/types/domain.ts` — Section 类型枚举

### Phase 1 交付物
- `.planning/phases/01-data-foundation/01-SUMMARY.md` — Phase 1 总结
- `src/contracts/project-step-snapshot.ts` — ImageStep4Snapshot

### Phase 3 交付物
- `.planning/phases/03-step3-model-photos/03-01-SUMMARY.md` — Phase 3 总结
- `src/contracts/types.ts` — ModelPhoto 接口
- `src/repositories/pg/model-photo-pg-repository.ts` — 参考 Repository 结构

### 图片生成
- `src/services/media/image-generation-providers.ts` — requestJimengImageUrl
- `src/services/media/storage-persist.ts` — persistImageSourceToStorage
- `src/services/llm/provider-resolver.ts` — resolveRouteProviderWithFallback
</canonical_refs>

<specifics>
## Specific Ideas

### 后端需要实现
1. PageSection / SectionVersion 类型定义 → src/contracts/types.ts
2. IPageSectionRepository / ISectionVersionRepository 接口 → src/contracts/repository-ports/
3. PgPageSectionRepository / PgSectionVersionRepository 实现 → src/repositories/pg/
4. Section 规划服务（AI 规划页面结构）
5. Section 生成服务（逐张生成 + 版本管理）
6. Step 4 路由 handlers（规划、列表、生成、重新生成、编辑、版本）

### 前端需要实现
1. Step 4 API 模块 — image-step3.ts 模式
2. ImageEcommerceEditor.tsx — 三栏编辑器主组件
3. SectionTree.tsx — 左侧模块树（可能需要拆分子组件）
4. PhonePreview.tsx — 中间手机预览
5. SectionEditor.tsx — 右侧编辑面板
6. ImageProjectLayout 扩展 — step4 自动保存

### banana-mall 架构映射
| banana-mall | neirongmiao 对应 |
|-------------|-----------------|
| planSections() | Step 4 后端规划 handler |
| generateSectionImage() | Step 4 后端生成 handler |
| editor-workspace.tsx | ImageEcommerceEditor.tsx |
| Section types enum | SectionType 类型定义 |
| Section CRUD API | /image-projects/:projectId/step4/sections/* |
</specifics>

<deferred>
## Deferred Ideas

- 多语言支持（en-US, ja-JP, ko-KR）→ v2
- 导出为长图/ZIP → Phase 5
- 自定义 section 拖拽排序增强 → v2
- 实时协作编辑 → v2

</deferred>

---

*Phase: 04-step4-ecommerce-page*
*Context gathered: 2026-04-10 via developer discussion*
