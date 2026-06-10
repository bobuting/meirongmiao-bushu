## 1. 修改 Step 2 底部工具栏

- [x] 1.1 修改 `OutfitChangeStep2.tsx` 底部工具栏左侧按钮，将"返回我的项目"改为"上一步"
- [x] 1.2 更新导航逻辑：点击"上一步"按钮导航到 `/outfit-create/:projectId/step1`
- [x] 1.3 添加 `arrow_back` 图标和响应式样式（移动端仅图标，桌面端图标+文字）

## 2. 修改 Step 3 底部工具栏

- [x] 2.1 修改 `OutfitChangeStep3.tsx` 底部工具栏左侧按钮，将"返回我的项目"改为"上一步"
- [x] 2.2 更新导航逻辑：点击"上一步"按钮导航到 `/outfit-create/:projectId/step2`
- [x] 2.3 新增"跳过"按钮，位于"上一步"和状态文本之间
- [x] 2.4 实现跳过逻辑：点击"跳过"按钮导航到 `/outfit-create/:projectId/step4`，不保存角色数据
- [x] 2.5 添加 `skip_next` 图标和响应式样式

## 3. 修改 Step 4 底部工具栏

- [x] 3.1 修改 `OutfitChangeStep4.tsx` 底部工具栏左侧按钮，将"返回我的项目"改为"上一步"
- [x] 3.2 更新导航逻辑：点击"上一步"按钮导航到 `/outfit-create/:projectId/step3`
- [x] 3.3 添加 `arrow_back` 图标和响应式样式

## 4. Step 2 服装列表分页

- [x] 4.1 添加 `currentPage` 状态变量，初始值为 1
- [x] 4.2 计算总页数：`totalPages = Math.ceil(garments.length / 12)`
- [x] 4.3 实现数据切片：`paginatedGarments = garments.slice((currentPage - 1) * 12, currentPage * 12)`
- [x] 4.4 修改列表渲染，使用 `paginatedGarments` 替代 `garments`
- [x] 4.5 添加分页控件组件（上一页/下一页按钮 + 页码显示）
- [x] 4.6 实现 `handlePrevPage` 和 `handleNextPage` 函数
- [x] 4.7 禁用边界按钮（第一页禁用上一页，最后一页禁用下一页）
- [x] 4.8 分页控件响应式样式（移动端仅图标，桌面端图标+文字）

## 5. Step 3 角色列表分页

- [x] 5.1 添加 `currentPage` 状态变量，初始值为 1
- [x] 5.2 计算总页数：`totalPages = Math.ceil(characters.length / 12)`
- [x] 5.3 实现数据切片：`paginatedCharacters = characters.slice((currentPage - 1) * 12, currentPage * 12)`
- [x] 5.4 修改列表渲染，使用 `paginatedCharacters` 替代 `characters`
- [x] 5.5 添加分页控件组件（上一页/下一页按钮 + 页码显示）
- [x] 5.6 实现 `handlePrevPage` 和 `handleNextPage` 函数
- [x] 5.7 禁用边界按钮（第一页禁用上一页，最后一页禁用下一页）
- [x] 5.8 分页控件响应式样式（移动端仅图标，桌面端图标+文字）

## 6. 验证和测试

- [x] 6.1 验证 Step 1 "返回我的项目"按钮功能保持不变
- [x] 6.2 TypeScript 编译通过
- [x] 6.3 Step 2 分页功能代码审查确认（翻页逻辑、边界禁用、页码显示）
- [x] 6.4 Step 3 分页功能代码审查确认（翻页逻辑、边界禁用、页码显示）
- [x] 6.5 选择后页码保持不重置（状态不重置）
- [x] 6.6 响应式分页控件样式（`hidden md:inline`）

**全部任务完成！**