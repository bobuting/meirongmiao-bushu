## ADDED Requirements

### Requirement: 换装项目步骤导航支持"上一步"

换装项目的步骤导航系统 SHALL 允许用户从 Step 2-4 返回上一个步骤进行修改。

#### Scenario: Step 2 返回 Step 1

- **WHEN** 用户在 Step 2 页面点击底部工具栏的"上一步"按钮
- **THEN** 系统导航到 Step 1 页面 (`/outfit-create/:projectId/step1`)

#### Scenario: Step 3 返回 Step 2

- **WHEN** 用户在 Step 3 页面点击底部工具栏的"上一步"按钮
- **THEN** 系统导航到 Step 2 页面 (`/outfit-create/:projectId/step2`)

#### Scenario: Step 4 返回 Step 3

- **WHEN** 用户在 Step 4 页面点击底部工具栏的"上一步"按钮
- **THEN** 系统导航到 Step 3 页面 (`/outfit-create/:projectId/step3`)

### Requirement: Step 1 保持"返回我的项目"按钮

换装项目的 Step 1 页面 SHALL 保持现有的"返回我的项目"按钮功能，点击后返回项目列表页面。

#### Scenario: Step 1 返回项目列表

- **WHEN** 用户在 Step 1 页面点击底部工具栏的"返回我的项目"按钮
- **THEN** 系统导航到项目列表页面 (`/projects` 或 `/`)

### Requirement: 导航按钮显示"上一步"文字和图标

Step 2-4 的返回按钮 SHALL 显示"上一步"文字和 `arrow_back` 图标，与视频项目的导航按钮风格保持一致。

#### Scenario: 移动端显示图标

- **WHEN** 用户在移动端设备上查看 Step 2-4 的底部工具栏
- **THEN** "上一步"按钮仅显示 `arrow_back` 图标，文字被隐藏（使用 `hidden md:inline`）

#### Scenario: 桌面端显示文字和图标

- **WHEN** 用户在桌面端设备上查看 Step 2-4 的底部工具栏
- **THEN** "上一步"按钮显示 `arrow_back` 图标和"上一步"文字