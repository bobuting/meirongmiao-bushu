## Why

换装项目（outfit_change）当前的步骤导航和内容展示存在用户体验问题：

1. **步骤导航问题**：所有步骤（Step 1-4）的底部工具栏都只有"返回我的项目"按钮，用户无法返回上一个步骤进行修改
2. **Step 3 跳过问题**：Step 3（选择角色）在某些场景下可以跳过，但当前强制用户选择
3. **分页问题**：Step 2 服装列表和 Step 3 角色列表一次性全部展示，当数据量大时用户难以浏览

**当前问题：**
- Step 2-4 用户无法返回上一步骤
- Step 3 没有跳过选项
- Step 2/3 服装/角色列表无分页，大量数据时体验差

## What Changes

### 步骤导航
- **Step 1**: 保持现有"返回我的项目"按钮
- **Step 2-4**: 底部工具栏左侧按钮改为"上一步"
- **Step 3**: 新增"跳过"按钮

### 内容分页
- **Step 2**: 服装列表添加分页功能（每页 12 个，翻页控件）
- **Step 3**: 角色列表添加分页功能（每页 12 个，翻页控件）

## Capabilities

### New Capabilities

- `outfit-step-navigation`: 换装项目的步骤导航能力，包括"上一步"和"跳过"功能
- `step-skip-functionality`: 步骤跳过能力，允许用户在某些步骤选择跳过
- `item-list-pagination`: 商品/角色列表分页能力，支持翻页浏览大量数据

### Modified Capabilities

无

## Impact

**前端文件：**
- `apps/web/pages/outfit-change/OutfitChangeStep2.tsx` — 导航 + 服装列表分页
- `apps/web/pages/outfit-change/OutfitChangeStep3.tsx` — 导航 + 跳过 + 角色列表分页
- `apps/web/pages/outfit-change/OutfitChangeStep4.tsx` — 导航

**用户体验：**
- 步骤导航灵活性提升
- 大量数据时可分页浏览，减少视觉负担
- Step 3 可跳过，加快流程