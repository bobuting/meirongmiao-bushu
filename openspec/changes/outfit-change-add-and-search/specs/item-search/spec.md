## ADDED Requirements

### Requirement: Step 2 支持服饰名称搜索

换装项目 Step 2 页面 SHALL 提供搜索输入框，允许用户按名称快速过滤服饰列表。

#### Scenario: 输入搜索词过滤列表

- **WHEN** 用户在搜索框输入搜索词
- **THEN** 系统即时过滤服饰列表，仅显示名称包含搜索词的服饰
- **AND** 过滤结果实时更新

#### Scenario: 清空搜索恢复全部列表

- **WHEN** 用户点击搜索框的清除按钮或清空输入
- **THEN** 系统恢复显示全部服饰列表

#### Scenario: 搜索无结果显示提示

- **WHEN** 用户输入搜索词后无匹配结果
- **THEN** 系统显示"无匹配结果"提示

### Requirement: Step 3 支持角色名称搜索

换装项目 Step 3 页面 SHALL 提供搜索输入框，允许用户按名称快速过滤角色列表。

#### Scenario: 输入搜索词过滤列表

- **WHEN** 用户在搜索框输入搜索词
- **THEN** 系统即时过滤角色列表，仅显示名称包含搜索词的角色
- **AND** 过滤结果实时更新

#### Scenario: 清空搜索恢复全部列表

- **WHEN** 用户点击搜索框的清除按钮或清空输入
- **THEN** 系统恢复显示全部角色列表

### Requirement: 搜索框位置和样式

搜索框 SHALL 位于列表上方，使用 Material Icons `search` 图标作为前缀，`close` 图标作为清除按钮。

#### Scenario: 搜索框包含图标和输入区域

- **WHEN** 用户查看 Step 2/3 页面
- **THEN** 搜索框左侧显示 `search` 图标
- **AND** 搜索框右侧显示 `close` 清除按钮（当有输入时）
- **AND** 输入框支持 placeholder "搜索名称..."

### Requirement: 搜索与分页的交互

搜索结果 SHALL 独立分页，搜索词变更时重置到第一页。

#### Scenario: 搜索后分页调整

- **WHEN** 用户输入搜索词
- **THEN** 系统在过滤结果上进行分页
- **AND** 页码重置到第一页