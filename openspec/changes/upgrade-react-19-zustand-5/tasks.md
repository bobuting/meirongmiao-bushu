## 1. React 19 依赖升级与验证

- [x] 1.1 升级 React 和 React-DOM 到 19.0.0（精确版本锁定）
- [x] 1.2 升级 @tanstack/react-query 到 5.100.9（确保 React 19 兼容）
- [x] 1.3 运行构建验证（npm run build --prefix apps/web）
- [x] 1.4 检查 peer dependencies 兼容性（npm list 验证）
- [x] 1.5 验证 react-router-dom 6.22.3 兼容性（无需升级）

## 2. Zustand 5 依赖升级

- [x] 2.1 升级 Zustand 到 5.0.13（精确版本锁定）
- [x] 2.2 运行构建验证（确保无 peer dependency 警告）
- [x] 2.3 验证 React 19 peer dependencies 满足（react >= 18.0.0）

## 3. Store 类型迁移（方案调整）

- [x] 3.1 保留 AppState 接口，使用 create<AppState>() 显式类型参数（实际可行方案）
- [x] 3.2 TypeScript 类型安全验证通过（无 Zustand 类型推断错误）
- [x] 3.3 运行 TypeScript 编译验证（npm run typecheck --prefix apps/web）
- [x] 3.4 确保严格模式下无类型错误（create<AppState> 提供完整类型推断）
- [x] 3.5 验证 Store 功能完整性（所有方法正确工作）

**方案调整说明**：
原 spec.md 要求删除 AppState 接口并使用类型断言，但实际验证发现该方法会导致 TypeScript 无法正确推断 selector 回调参数类型。
采用 Zustand 5 推荐的显式类型参数模式：`create<AppState>((set) => ({...}))`，既保持类型安全，又避免复杂的类型断言。

## 4. React 19 运行时兼容性修复

**重大发现**：React 19 的 useSyncExternalStore 对 getSnapshot 结果稳定性要求导致 Zustand selector 无限循环。

### 问题根源
两层面问题：
1. **解构 selector 模式**：`useAppStore((state) => ({...}))` 每次创建新对象，触发 getSnapshot 缓存失效
2. **内联空对象 fallback**：`?? {}` 和 `?? emptyProjectData()` 在 selector 中每次创建新引用

### 解决方案
1. **Layout.tsx**：拆分为单独的 `useAppStore((state) => state.X)` selector（15 个独立 selector）
2. **34 个文件**：批量转换为 `useAppStore(useShallow((state) => ({...})))` 模式
3. **useProjectState.ts**：将内联 `?? {}` 和 `?? emptyProjectData()` 替换为模块级缓存常量
4. **Step4VideoWorkspaceScreen.tsx**：同样修复内联 `?? {}` 为模块级常量
5. **useTheme.ts**：移除 useCallback 中的 Zustand setter 依赖
6. **Layout.tsx useEffect**：移除 Zustand 函数的依赖项（4 处）

### 修改文件清单
- `apps/web/components/Layout.tsx` - selector 拆分 + useEffect deps 修复
- `apps/web/hooks/useProjectState.ts` - 缓存空对象常量
- `apps/web/hooks/useTheme.ts` - useCallback deps 修复
- `apps/web/components/shared/GlobalTimer.tsx` - useShallow 转换
- `apps/web/components/AuthReLoginModal.tsx` - useShallow 转换
- `apps/web/pages/square/Square.tsx` - useShallow 转换
- `apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx` - 缓存空对象
- 31 个其他文件 - useShallow 批量转换（Login, Assets, ScriptEditor, MyProjects 等）

### 当前状态
- [x] 修复 Layout.tsx selector 和 useEffect 依赖
- [x] 批量修复 34 个文件的解构 selector
- [x] 修复 useProjectState.ts 内联空对象 fallback
- [x] 修复 useTheme.ts useCallback 依赖
- [x] 删除未使用的 useStableAppStore.ts
- [x] 创作广场页面验证通过（零 console 错误）
- [x] 我的项目页面验证通过
- [x] 脚本中心页面验证通过
- [x] 4.1 测试 Step4 视频生成功能（验证 @webav/av-cliper 兼容）
- [x] 4.2 测试 Step3 脚本生成功能（验证 Store 状态管理）
- [x] 4.3 测试 Step1-Step6 项目流程页面
- [x] 4.4 测试全局任务队列（验证通知系统）

## 5. 最终验证与提交

- [x] 5.1 运行完整构建验证（npm run build --prefix apps/web） - ✓ 3.47s
- [x] 5.2 运行开发服务器验证（dashboard/projects/reverse 页面正常）
- [x] 5.3 检查控制台无 React 警告（零 error/warning）
- [x] 5.4 提交 package.json 和 package-lock.json 变更 - ✓ commit 72c16e94
- [x] 5.5 提交 useAppStore.ts 类型迁移变更（无变更，已使用 create<AppState>()） - ✓ 无需修改
- [x] 5.6 创建 Git 提交记录（记录升级详情） - ✓ commit 72c16e94
- [x] 5.7 提交运行时兼容性修复变更（Layout.tsx, useProjectState.ts 等）

## 6. 文档更新（可选）

- [x] 6.1 更新 CLAUDE.md 技术栈版本（记录 React 19 + Zustand 5）
- [x] 6.2 更新 package.json 注释（标注升级原因）— JSON 不支持注释，改用 README.md 升级记录
- [x] 6.3 添加升级说明到 README（可选）— 已创建 README.md 包含完整升级记录
