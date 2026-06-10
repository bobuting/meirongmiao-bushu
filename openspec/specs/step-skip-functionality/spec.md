## ADDED Requirements

### Requirement: Step 3 支持跳过功能

换装项目的 Step 3（选择角色）页面 SHALL 提供跳过功能，允许用户不选择角色直接进入 Step 4。

#### Scenario: 点击跳过按钮进入 Step 4

- **WHEN** 用户在 Step 3 页面点击"跳过"按钮
- **THEN** 系统直接导航到 Step 4 页面 (`/outfit-create/:projectId/step4`)
- **AND** 不保存任何角色选择数据

#### Scenario: 跳过后 Step 4 处理无角色数据

- **WHEN** 用户跳过 Step 3 后进入 Step 4
- **THEN** Step 4 使用默认角色或原视频人物进行换装处理

### Requirement: 跳过按钮位置和样式

跳过按钮 SHALL 位于底部工具栏中"上一步"按钮和状态文本之间，使用 `variant="ghost"` 样式。

#### Scenario: 移动端跳过按钮显示图标

- **WHEN** 用户在移动端设备上查看 Step 3 的底部工具栏
- **THEN** "跳过"按钮仅显示 `skip_next` 图标，文字被隐藏

#### Scenario: 桌面端跳过按钮显示文字和图标

- **WHEN** 用户在桌面端设备上查看 Step 3 的底部工具栏
- **THEN** "跳过"按钮显示 `skip_next` 图标和"跳过"文字

### Requirement: 跳过功能不影响后续步骤

用户跳过 Step 3 后 SHALL 能够正常完成 Step 4 的换装操作，系统 SHALL 处理角色数据缺失的情况。

#### Scenario: 跳过后可以正常换装

- **WHEN** 用户跳过 Step 3 并在 Step 4 点击"开始换装"
- **THEN** 系统使用已有的视频和服装数据进行换装处理
- **AND** 换装任务正常完成并返回结果