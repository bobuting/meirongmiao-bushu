## Why

换装项目 Step 2（选择服装）和 Step 3（选择角色）当前仅能从已有库中选择，用户无法在流程中快速添加新的服饰或角色，也无法快速搜索定位目标项。当用户缺少所需服装/角色时，必须离开当前流程去其他页面添加，导致体验中断。

**当前问题：**
- Step 2 无法直接新增服饰，需跳转到服饰管理页
- Step 3 无法直接新增角色，需跳转到角色管理页
- Step 2/3 无搜索功能，大量数据时难以定位

## What Changes

- **Step 2**: 添加"新增服饰"按钮，点击打开上传弹窗；添加搜索输入框，支持按名称搜索
- **Step 3**: 添加"新增角色"按钮，点击打开创建弹窗；添加搜索输入框，支持按名称搜索
- 新增的服饰/角色立即出现在列表中供选择

## Capabilities

### New Capabilities

- `inline-item-creation`: 流程内快速新增能力，支持在步骤页面直接创建服饰/角色
- `item-search`: 列表搜索能力，支持按名称快速过滤

### Modified Capabilities

无（这是新增功能）

## Impact

**前端文件：**
- `apps/web/pages/outfit-change/OutfitChangeStep2.tsx` — 新增服饰按钮 + 搜索框
- `apps/web/pages/outfit-change/OutfitChangeStep3.tsx` — 新增角色按钮 + 搜索框
- 可能需要新建弹窗组件或复用现有上传组件

**用户体验：**
- 流程内完成新增，无需跳转其他页面
- 搜索功能加速定位，减少翻页成本