# Quick Task: Step2 角色库推荐 UI 优化

## Goal
优化 Step2 角色定妆页面的角色库推荐区域，使其更美观、支持上传后即时显示、支持从完整角色库选择。

## Context
- 当前角色库推荐区是一个 4 列平铺卡片，视觉层次较弱
- 快速上传后新角色没有明确的首位展示
- 缺少从完整角色库选择角色的入口

## Requirements

### 1. 美观优化
- 角色库推荐区卡片样式升级：更大的缩略图、渐变边框、hover 动效
- 区域标题区优化：更清晰的视觉层次，带图标
- 统一生成候选区和角色库推荐区的视觉风格
- 卡片支持标签展示、状态指示

### 2. 上传后即时显示
- 快速上传角色成功后，新角色自动插入推荐区第一个位置
- 添加"新上传"视觉标识（badge）
- 自动选中新上传的角色并打开预览面板

### 3. 完整角色库选择入口
- 在角色库推荐区添加"从角色库选择"按钮
- 点击弹出模态框，展示完整角色列表
- 模态框内支持：
  - 搜索框（按角色名称搜索）
  - 标签筛选（性别、风格等）
  - 角色卡片网格展示
  - 点击选择后关闭弹窗并设为当前角色
- 新角色上传后也需要加入角色库

## Files to Modify
- `apps/web/pages/project-flow/CharacterSelection.tsx` — 主页面，添加角色库选择器模态框
- `apps/web/pages/shared/step2-shared-components.tsx` — 添加新的共享组件（角色选择器）
- `apps/web/pages/shared/step2-quick-create-modal.tsx` — 修改上传后回调逻辑
- `apps/web/components/project-flow/HistoryStep1Panel.tsx` — 可能涉及
- `apps/web/pages/project-flow/step2LibraryFiveViewMatch.ts` — 可能需要修改匹配逻辑

## Success Criteria
1. 角色库推荐区视觉效果明显提升
2. 上传角色后新角色出现在推荐区第一位，带"新"标签
3. 点击"从角色库选择"弹出模态框，支持搜索和筛选
4. 选择角色后正确设置并更新预览
