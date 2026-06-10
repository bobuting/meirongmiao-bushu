# Feature Landscape

**Domain:** AI 电商图片生成（模特图 + 详情页）
**Researched:** 2026-04-10

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Step 1 服装搭配分析** | 用户上传服装图后，必须看到 AI 分析结果（搭配方案、风格标签）才能确认继续。没有这一步用户不知道自己上传的图被怎么理解了。 | 低 | 新写，不复用视频 step1。调用多模态 LLM 分析服装图，输出搭配方案。 |
| **Step 2 角色定妆** | 服装分析确认后，必须看到"这个模特/角色穿这件衣服长什么样"的定妆图，建立信任。 | 中 | 新写，不复用视频 step2。需要服装图 + 角色设定生成定妆参考图。 |
| **Step 3 模特图自动生成** | 这是核心价值点。用户期望上传服装后自动获得多张专业级模特图，不需要自己选姿势或背景。AI 自动匹配姿势+背景组合。 | 高 | 需要 AI 自动选择姿势库 + 背景场景库，自动组合生成。参考 ZMO.AI、Botika 等工具。 |
| **Step 4 电商详情页区块规划** | 用户期望 AI 能自动规划出完整的详情页结构，而不是给一个空白模板。Section-based 架构是 2025-2026 年主流（Pic Copilot、微盟 WIME、Shopify Magic 均采用）。 | 高 | 借鉴 banana-mall 的 section planning 模式：先规划区块（hero + detail sections），再逐个生成。 |
| **Step 4 详情页区块图片生成** | 规划完成后，每个区块必须能自动生成对应的图片。这是 banana-mall 的 5 步流水线中"生成"环节的核心。 | 高 | 每个 section 独立生成，支持 `visualPrompt` 驱动。需要图像生成模型支持。 |
| **商品图片上传与身份锚定** | 用户上传的商品图是"产品身份锚点"，所有生成结果必须保持同一件商品（形状、材质、颜色一致）。banana-mall 的 `buildMainImageInstruction` 明确要求这一点。 | 中 | 需要在每次 LLM 图像生成 prompt 中注入产品身份约束。 |
| **生成状态可见** | 用户必须看到每一步的生成进度和结果状态（排队中/生成中/成功/失败）。banana-mall 的 `GenerationStatus` 枚举定义了 IDLE → QUEUED → GENERATING → SUCCESS/FAILED。 | 低 | 前端需要轮询或 WebSocket 同步状态。 |
| **Step 4 图片重新生成** | AI 生成第一次通常不完美，用户必须能针对某个区块单独重新生成。banana-mall 提供了 `buildRegenerationPrompt` 和版本管理（SectionVersion）。 | 中 | 每个 section 支持 regenerate，保留历史版本。 |
| **平台适配** | 不同电商平台（淘宝/拼多多/抖音/小红书）对图片尺寸、风格要求不同。用户期望 AI 自动适配目标平台规范。 | 低 | banana-mall 已有 platformOptions（通用电商、淘宝天猫、拼多多、小红书、抖音电商）。 |
| **风格选择** | 用户需要选择生成风格（通用简洁/高级质感/柔和生活/转化导向/科技感）。 | 低 | banana-mall 已有 styleOptions。 |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI 自动姿势+背景组合（Step 3）** | 竞品（ZMO.AI、Botika、Photoroom）大多需要用户手动选择姿势或背景。如果 AI 能根据服装类型自动匹配最优姿势+背景组合（如连衣裙配海边场景，西装配办公场景），是显著差异化。 | 高 | 需要建立姿势标签库和场景库，结合服装分析结果做智能匹配。 |
| **Step 4 手机预览模拟器 + 三栏编辑器** | banana-mall 的核心 UX 差异化：左侧模块树 + 中间手机预览 + 右侧编辑面板。用户能实时看到生成结果在手机上的真实效果。 | 高 | 需要构建移动端预览框架，支持区块拖拽排序、实时编辑。参考 banana-mall 的 editor-workspace 和 planner-workspace。 |
| **SVG 兜底机制** | 图片生成失败时自动生成 SVG 排版布局（含文案、色块、产品图占位），而不是空白。保证用户始终有可用结果。banana-mall 通过 `buildSectionSvgLayoutPrompt` 实现。 | 中 | 失败时降级为 SVG JSON 布局渲染，保留所有文案和排版结构。注意：这是"可选增值"而非"主流程降级"，主流程失败仍应报错。 |
| **Section 版本管理** | 每个区块支持多版本对比和回滚。banana-mall 的 `SectionVersion` 表记录了每次生成的 prompt 快照、文案快照和图片。 | 中 | 需要数据库存储版本历史，前端支持版本切换对比。 |
| **图片编辑（重绘/增强）** | banana-mall 的 `buildImageEditPrompt` 支持两种模式：repaint（重新设计构图）和 enhance（保留构图提升质感）。用户能精细控制生成结果。 | 高 | 需要图像编辑模型（image_edit）支持，区别于纯生成。 |
| **多语言支持** | banana-mall 的 contentLanguage 系统支持多语言文案生成。虽然本项目只做中文，但架构预留多语言扩展能力是差异化。 | 低 | prompt 模板已支持 targetLanguage 参数。 |
| **区块类型智能推荐** | banana-mall 有 11 种 section type（头图主视觉、卖点模块、场景展示、细节特写、规格参数、材质工艺、对比说明、送礼场景、品牌信任、总结收口、自定义模块）。AI 根据商品类别自动推荐最合适的区块组合。 | 中 | `suggestedSectionPlan` 由分析阶段产出，规划阶段参考使用。 |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **手动姿势/背景选择器** | 违反"AI 自动匹配组合"的设计目标。让用户选择会增加决策负担，偏离"4 步完成"的核心价值。 | AI 根据服装分析结果自动匹配，允许用户在编辑阶段微调。 |
| **视频项目代码复用（step1/step2）** | PROJECT.md 明确"step1/step2 全部新写，后续逻辑可能调整，不共享"。视频项目有复杂的 5 步工作流约束，图片项目应保持独立。 | 独立路由、独立组件、独立数据模型。 |
| **模板填充式详情页** | 2025-2026 年的趋势是从"模板填充"进化为"AI 创意驱动"。模板填充模式给用户的感觉是"换皮工具"，不是 AI 产品。 | Section-based 架构 + AI 规划 + 逐个生成，参考 banana-mall。 |
| **硬编码提示词** | 项目 CLAUDE.md 明确要求"所有提示词通过提示词管理模块，禁止硬编码"。 | 使用已有的提示词管理模块，Markdown 格式存储。 |
| **主流程静默降级** | 项目 CLAUDE.md 明确要求"主流程失败时直接报错，禁止静默降级"。 | SVG 兜底是"可选增值"（失败时提供结构化布局而非空白），不是"主流程降级"。主流程失败仍应报错。 |
| **多语言 i18n** | PROJECT.md 明确"只做中文，不做 i18n"。 | 架构预留 contentLanguage 参数，但前端只做中文 UI。 |

## Feature Dependencies

```
Step 1 服装搭配分析 → Step 2 角色定妆（需要搭配分析结果）
Step 2 角色定妆 → Step 3 模特图生成（需要定妆图作为参考）
Step 3 模特图生成 → Step 4 详情页区块规划（模特图作为 hero sections 的素材）
Step 4 区块规划 → Step 4 区块图片生成（规划产出 section list 是生成的输入）

Step 4 三栏编辑器 → Step 4 区块图片生成（编辑器是生成的 UI 载体）
SVG 兜底机制 → Step 4 区块图片生成（失败时的兜底路径）

图片上传（前置）→ Step 1 服装搭配分析
平台选择（前置）→ Step 4 区块规划（影响 section 数量和类型）
风格选择（前置）→ Step 4 区块规划（影响文案和视觉风格）
```

### banana-mall Section Types Reference

banana-mall 定义了 11 种 section type，可作为本项目 Step 4 的参考：

| Section Type | 中文标签 | 作用 |
|--------------|----------|------|
| HERO | 头图主视觉 | 首屏吸引力，4 张 hero 分别承担不同沟通角色 |
| SELLING_POINTS | 卖点模块 | 核心卖点可视化展示 |
| SCENARIO | 场景展示 | 产品使用场景氛围图 |
| DETAIL_CLOSEUP | 细节特写 | 产品细节、工艺、材质近距离展示 |
| SPECS | 规格参数 | 尺寸、颜色、型号等规格信息 |
| MATERIAL | 材质工艺 | 材料来源、制作工艺说明 |
| COMPARISON | 对比说明 | 与竞品或旧款对比 |
| GIFT_SCENE | 送礼场景 | 礼品场景氛围图 |
| BRAND_TRUST | 品牌信任 | 品牌背书、资质、用户评价 |
| SUMMARY | 总结收口 | 行动号召（CTA）、总结性视觉 |
| CUSTOM | 自定义模块 | 用户自定义内容区块 |

### banana-mall 5 步流水线参考

| Step | 名称 | 说明 | 本项目对应 |
|------|------|------|------------|
| 1 | 上传 | 用户上传商品图 | 已有 |
| 2 | 分析 | AI 分析商品信息（productName, category, sellingPoints 等） | Step 1 服装搭配 |
| 3 | 规划 | AI 规划详情页区块结构（hero + detail sections） | Step 4 区块规划 |
| 4 | 编辑 | 三栏编辑器，逐个生成/编辑区块图片 | Step 4 区块生成 + 编辑器 |
| 5 | 导出 | 导出最终图片 | 待规划 |

## MVP Recommendation

Prioritize:
1. **Step 1 服装搭配分析** — 用户理解商品的第一步，缺少则后续流程无法启动
2. **Step 2 角色定妆** — 建立用户信任的关键环节，"这件衣服穿在模特上长什么样"
3. **Step 3 模特图自动生成** — 核心价值点，AI 自动姿势+背景组合
4. **Step 4 区块规划** — AI 自动规划详情页结构，4 张 hero + 6 张 detail section（参考 banana-mall）

Defer:
- **Step 4 三栏编辑器** — 第一版可以先用简单的列表式编辑，验证 section-based 架构后再做完整的手机预览模拟器
- **图片编辑（重绘/增强）** — 依赖 regenerate 先跑通，编辑是进阶需求
- **Section 版本管理** — 先跑通单版本生成，版本管理是优化项
- **SVG 兜底机制** — 先确保主流程图片生成稳定，兜底是容错增强

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes | HIGH | 直接来自 PROJECT.md 需求 + banana-mall 已验证模式 + 竞品分析 |
| Differentiators | MEDIUM | 基于竞品功能对比（ZMO.AI/Botika/Photoroom/Pic Copilot），实际差异化效果需上线验证 |
| Anti-features | HIGH | 来自 PROJECT.md 明确约束 + CLAUDE.md 规范 |
| Feature dependencies | HIGH | 来自 banana-mall 数据模型 + 业务逻辑推导 |
| MVP recommendation | MEDIUM | 基于复杂度评估，实际优先级需用户确认 |

## Sources

- banana-mall: `/tmp/banana-mall/types/domain.ts`, `/tmp/banana-mall/prisma/schema.prisma`, `/tmp/banana-mall/lib/ai/prompts/planning.ts`, `/tmp/banana-mall/lib/ai/prompts/generation.ts`
- PROJECT.md: `/Users/Abner/HCode/neirongmiao/.planning/PROJECT.md`
- [Pic Copilot — AI 产品详情页设计策略](https://www.piccopilot.com/zh/blog/ai-product-detail-page-design-strategy-zh)
- [Pic Copilot — AI 产品详情页设计生成器](https://www.piccopilot.com/zh/tools/product-detail-page-design)
- [微盟 WAI — 1分钟AI试衣、AI商品详情页](https://zhuanlan.zhihu.com/p/1921954320997390166)
- [Nano Banana Pro — 电商详情页制作指南](https://help.apiyi.com/nano-banana-pro-ecommerce-product-page-guide.html)
- [火山引擎 ADG — AI电商详情页智能生成系统](https://adg.csdn.net/6970798c437a6b40336a6849.html)
- [WearView — 9 best AI fashion model generators for ecommerce (2026)](https://www.wearview.co/blog/best-ai-fashion-model-generators)
- [Photoroom — AI Fashion Model Generators](https://www.photoroom.com/blog/ai-fashion-model-generators)
- [Claid.ai — AI fashion model generator guide](https://claid.ai/blog/article/ai-fashion-model-generators)
