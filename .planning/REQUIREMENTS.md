# Requirements: 图片项目 4 步流水线

**Defined:** 2026-04-10
**Core Value:** 从上传商品图到完整的电商详情页图片，4 步完成

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Step 1 — 服装搭配

- [ ] **IMG-01**: 用户可以上传图片并完成 AI 搭配分析，输出标准化搭配方案

### Step 2 — 角色定妆

- [ ] **IMG-02**: 用户可以基于搭配方案生成角色定妆图，支持五视图展示

### Step 3 — 模特图自动生成

- [ ] **IMG-03**: 基于定妆图，AI 自动生成多张专业模特图（姿势+背景自动组合），用户可勾选和重新生成

### Step 4 — 电商详情页

- [ ] **IMG-04**: AI 规划页面结构并分区块生成详情页图片，支持手机预览和局部编辑
- [ ] **IMG-06**: 三栏编辑器布局（模块树 + 手机预览 + 编辑面板）
- [ ] **IMG-07**: 图片生成失败时自动 SVG 降级

### Infrastructure

- [ ] **IMG-05**: 图片项目独立的路由、导航、数据存储体系（不与视频项目共享 step 代码）

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: 姿势库/背景库管理界面（可视化编辑、新增、删除）
- **ENH-02**: 多语言支持（en-US, ja-JP, ko-KR）
- **ENH-03**: AI provider 动态配置和模型能力探测
- **ENH-04**: 导出为长图/ZIP 多格式

### Optimization

- **OPT-01**: 模特图生成并行化优化
- **OPT-02**: Section 生成任务队列化（支持异步进度推送）

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 视频项目代码复用 | step1/step2 后续逻辑可能调整，不共享 |
| 降级策略 | 项目规范禁止：主流程失败时直接报错 |
| SQLite/Prisma | 使用项目已有的 PostgreSQL + persistence 层 |
| 硬编码提示词 | 必须通过提示词管理模块 |
| app.ts 新增路由 | 只减不增，路由放 src/routes/ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMG-01 | Phase 2 | Pending |
| IMG-02 | Phase 2 | Pending |
| IMG-03 | Phase 3 | Pending |
| IMG-04 | Phase 4 | Pending |
| IMG-05 | Phase 1, 5 | Pending |
| IMG-06 | Phase 4 | Pending |
| IMG-07 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
