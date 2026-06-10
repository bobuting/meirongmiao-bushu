# PLAN: Step2 角色库推荐 UI 优化

## Phase Goal
优化 Step2 角色定妆页的角色库推荐区域，实现 3 个核心功能：
1. 美观的 UI 升级
2. 上传后新角色即时显示
3. 完整角色库选择器弹窗

## Execution Strategy
这是一个纯前端 UI 优化任务，不涉及后端修改。主要修改：
- `CharacterSelection.tsx` — 添加角色库选择器状态和 UI
- `step2-shared-components.tsx` — 新建 CharacterLibrarySelectorModal 组件
- `step2-quick-create-modal.tsx` — 保持现有，只需确保上传后回调正确

## Tasks

### Task 1: 创建 CharacterLibrarySelectorModal 组件
**File:** `apps/web/pages/shared/step2-shared-components.tsx`
**Description:** 新建完整的角色库选择器模态框组件
- 搜索框（按名称实时搜索）
- 标签筛选（性别、风格等分类）
- 角色网格展示（3-4 列响应式）
- 角色卡片：缩略图 + 名称 + 标签 + 状态
- 点击选择后回调并关闭
- 支持空状态和加载状态

### Task 2: 优化角色库推荐区 UI
**File:** `apps/web/pages/project-flow/CharacterSelection.tsx`（渲染部分 ~2834-2902 行）
**Description:** 升级角色库推荐区的视觉设计
- 区域标题：添加图标，更清晰的视觉层次
- 卡片升级：更大的图片区域、圆角渐变边框、hover 动效
- 底部信息：角色名 + 标签（最多 2 个）
- 状态标识：优化现有 badge 样式
- 添加"从角色库选择"按钮

### Task 3: 上传后新角色即时显示
**File:** `apps/web/pages/project-flow/CharacterSelection.tsx`（状态管理和 quick create handler）
**Description:** 
- 维护一个 `newlyUploadedCharacterId` 状态
- Quick create 成功后，新角色插入推荐区第一个位置
- 添加"新"标签 badge
- 自动选中新上传角色并打开预览
- 5 秒后清除"新"标识

### Task 4: 接入完整角色库选择器
**File:** `apps/web/pages/project-flow/CharacterSelection.tsx`
**Description:**
- 在角色库推荐区 header 添加"从角色库选择"按钮
- 打开 CharacterLibrarySelectorModal
- 选择角色后设为当前活跃角色
- 使用现有的角色库数据（libraryCharactersResp）

### Task 5: 优化整体布局
**File:** `apps/web/pages/project-flow/CharacterSelection.tsx`
**Description:**
- 统一生成候选区和角色库推荐区的视觉风格
- 调整间距和边距
- 确保移动端响应式正常

## Risk Assessment
- **低风险**：纯前端 UI 修改，不影响后端数据流
- **注意点**：CharacterSelection.tsx 文件很大，修改时要小心定位
- **数据流**：使用现有的 libraryCharactersResp 和 presets 数据，不新增 API

## Files to Modify
1. `apps/web/pages/shared/step2-shared-components.tsx` — 添加 CharacterLibrarySelectorModal
2. `apps/web/pages/project-flow/CharacterSelection.tsx` — 主页面修改（UI + 状态）
