## 1. Step 2 搜索功能

- [x] 1.1 添加 `searchQuery` 状态变量
- [x] 1.2 添加搜索输入框组件（search 图标 + 输入框 + close 清除按钮）
- [x] 1.3 实现过滤逻辑：`filteredGarments = garments.filter(g => g.name.includes(searchQuery))`
- [x] 1.4 修改列表渲染使用 `filteredGarments`
- [x] 1.5 搜索无结果时显示提示
- [x] 1.6 搜索变更时重置分页到第一页

## 2. Step 2 新增服饰功能

- [x] 2.1 添加"新增服饰"按钮（add 图标）
- [x] 2.2 复用现有 `AssetModal` 组件（服饰创建/编辑弹窗）
- [x] 2.3 弹窗通过 `onAssetCreated` 回调刷新列表
- [x] 2.4 上传成功后刷新服饰列表
- [x] 2.5 弹窗响应式样式（AssetModal 已内置）

## 3. Step 3 搜索功能

- [x] 3.1 添加 `searchQuery` 状态变量
- [x] 3.2 添加搜索输入框组件
- [x] 3.3 实现过滤逻辑：`filteredCharacters = characters.filter(c => c.name.includes(searchQuery))`
- [x] 3.4 修改列表渲染使用 `filteredCharacters`
- [x] 3.5 搜索无结果时显示提示
- [x] 3.6 搜索变更时重置分页到第一页

## 4. Step 3 新增角色功能

- [x] 4.1 添加"新增角色"按钮（add 图标）
- [x] 4.2 复用现有 `CreateCharacterModal` 组件（角色库完整创建弹窗）
- [x] 4.3 弹窗内部完成上传、人像分析、创建角色流程
- [x] 4.4 创建成功后通过 `onSave` 回调刷新角色列表
- [x] 4.5 弹窗响应式样式（CreateCharacterModal 已内置）

## 5. 验证和测试

- [x] 5.1 TypeScript 编译通过
- [ ] 5.2 测试 Step 2 搜索功能
- [ ] 5.3 测试 Step 2 新增服饰功能
- [ ] 5.4 测试 Step 3 搜索功能
- [ ] 5.5 测试 Step 3 新增角色功能
- [ ] 5.6 测试搜索与分页交互