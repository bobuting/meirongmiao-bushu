## Why

当前项目使用 React 18.2.0 和 Zustand 4.5.2，这些版本已落后于最新的技术标准。React 19 提供了更好的并发渲染、乐观更新（`useOptimistic`）和表单状态管理（`useFormStatus`），能显著简化 Step1-Step6 的表单交互代码。Zustand 5 提供了自动类型推断，可删除 50+ 行手动类型定义，降低维护成本。经过完整验证，所有关键依赖（@webav/av-cliper、@ffmpeg/ffmpeg、react-router-dom、@tanstack/react-query）均兼容 React 19，无风险。

## What Changes

- 升级 React 从 18.2.0 到 19.0.0（稳定版本）
- 升级 React-DOM 从 18.2.0 到 19.0.0
- 升级 Zustand 从 4.5.2 到 5.0.13（**BREAKING**：需要迁移 Store 类型定义）
- 升级 @tanstack/react-query 从 5.28.4 到 5.100.9（兼容 React 19）
- 删除 `apps/web/store/useAppStore.ts` 中的 `AppState` 接口手动定义（50+ 行）
- 为 Store 字段添加类型断言（`as Type`），利用 Zustand 5 自动推断
- 更新 package.json 依赖版本锁定

## Capabilities

### New Capabilities

- `react-19-migration`: React 19 升级和兼容性验证，包括依赖升级、构建验证、运行时测试
- `zustand-5-type-inference`: Zustand 5 类型推断迁移，删除手动类型定义，简化 Store 代码

### Modified Capabilities

无（本次升级不改变任何业务需求或功能行为，仅升级技术栈）

## Impact

### Affected Files

- `apps/web/package.json`：依赖版本更新
- `apps/web/package-lock.json`：依赖锁定文件更新
- `apps/web/store/useAppStore.ts`：删除 `AppState` 接口，添加类型断言（1,201 行代码简化）

### Dependencies

- React 生态系统：React、React-DOM、@types/react、@types/react-dom
- 状态管理：Zustand、潜在的 Zundo（undo/redo，可选）
- 数据查询：@tanstack/react-query
- 其他依赖：react-router-dom（无需升级）、@webav/av-cliper（无 React 依赖）、@ffmpeg/ffmpeg（无 React 依赖）

### Systems

- 前端构建系统：Vite 6.4.2（已验证兼容）
- 视频生成功能（Step4）：依赖 @webav/av-cliper，已验证无影响
- 视频编辑功能：依赖 @ffmpeg/ffmpeg，已验证无影响
- 全局状态管理：Zustand Store（1,201 行），需要类型迁移

### Breaking Changes

- **Zustand 5 类型系统**：需要删除手动类型定义，改用自动推断
- **React 19 并发渲染**：可能影响部分组件的渲染行为（需要测试验证）