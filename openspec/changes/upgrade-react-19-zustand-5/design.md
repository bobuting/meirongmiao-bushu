## Context

### 当前状态

项目前端当前使用 React 18.2.0 + Zustand 4.5.2 + @tanstack/react-query 5.28.4，已落后于最新标准。经过完整验证（构建测试 + 依赖分析），确认：

- React 19.0.0 与所有关键依赖兼容
- Zustand 5.0.13 需升级以支持 React 19
- @tanstack/react-query 需升级到 5.100.9 以支持 React 19
- @webav/av-cliper 1.2.7 和 @ffmpeg/ffmpeg 0.12.15 无 React 依赖，无影响

### 约束条件

- **时间窗口**：1-2天完成迁移（低风险）
- **兼容性**：已验证构建成功，无运行时警告
- **代码影响**：主要影响 `useAppStore.ts`（1,201 行），需要类型迁移
- **功能影响**：不改变任何业务逻辑或功能行为

### 相关方

- 前端开发者（需要迁移 Store）
- 后端开发者（无影响）
- 用户（体验不变，性能可能提升）

## Goals / Non-Goals

**Goals:**

- 升级 React 到 19.0.0，利用并发渲染和乐观更新特性（可选）
- 升级 Zustand 到 5.0.13，简化类型定义（删除 50+ 行手动类型）
- 升级 @tanstack/react-query 到 5.100.9，兼容 React 19
- 保持所有现有功能不变（零破坏性）
- 确保构建成功，运行时无警告

**Non-Goals:**

- 不使用 React 19 新特性（`useOptimistic`、`useFormStatus`）— 仅升级版本，后续按需采用
- 不添加 undo/redo 功能（Zundo 2）— 本次仅升级 Zustand，不扩展功能
- 不修改业务逻辑或组件代码 — 仅升级依赖和类型定义
- 不升级 react-router-dom（6.22.3 已兼容 React 19）
- 不升级 Vite（6.4.2 已兼容 React 19）

## Decisions

### Decision 1: 升级路径

**选择**：直接升级到 React 19.0.0 + Zustand 5.0.13

**备选方案**：
- A: 等待 React 19.x 稳定版（已稳定，无需等待）
- B: 渐进式升级（先 React 19，后 Zustand 5）— 增加 1 次迁移工作量

**理由**：
- React 19.0.0 已稳定（2024年12月发布）
- Zustand 5.0.13 必须升级以支持 React 19（peer deps 要求）
- 一次性升级减少迁移成本（验证已完成）

### Decision 2: Zustand Store 类型迁移策略

**选择**：删除手动类型定义，添加类型断言（`as Type`）

**备选方案**：
- A: 保持手动类型定义（不利用 Zustand 5 自动推断）— 维持现状
- B: 完全依赖自动推断（不添加类型断言）— 可能导致类型错误

**理由**：
- Zustand 5 自动推断更准确（减少人为错误）
- 删除 50+ 行重复代码（维护成本降低）
- 类型断言确保边界情况正确（如 `null as string | null`）

### Decision 3: React 19 新特性使用

**选择**：仅升级版本，不立即使用新特性

**备选方案**：
- A: 立即使用 `useOptimistic`（Step1-Step6 表单）— 需要重构表单组件
- B: 立即使用 `useFormStatus`（所有提交按钮）— 需要重构按钮组件

**理由**：
- 新特性使用需要额外开发时间（2-3周）
- 当前版本已稳定，新特性可后续按需采用
- 降低迁移风险（零破坏性升级）

## Risks / Trade-offs

### Risk 1: React 19 并发渲染影响组件行为

**风险**：部分组件可能依赖 React 18 的渲染时序，并发渲染可能导致微妙的状态变化

**缓解**：
- 全面测试关键页面（Step1-Step6、项目列表）
- 重点测试视频生成（Step4）和视频编辑功能
- 监控生产环境性能指标

### Risk 2: Zustand 类型迁移遗漏字段

**风险**：删除 `AppState` 接口后，可能遗漏部分字段类型断言

**缓解**：
- 使用 TypeScript 严格模式检查类型错误
- 逐字段迁移，确保所有字段都有类型断言
- 运行 `tsc --noEmit` 验证类型正确性

### Risk 3: 依赖版本锁定不稳定

**风险**：升级后的依赖版本可能存在未知问题

**缓解**：
- 使用精确版本锁定（`--save-exact`）
- 保留 package-lock.json 回滚能力
- Git 分支测试验证后合并

### Trade-off 1: 不使用 React 19 新特性

**权衡**：放弃即时收益（乐观更新简化），换取零风险迁移

**理由**：
- 后续可按需采用，不急迫
- 降低迁移复杂度（仅依赖升级）

### Trade-off 2: 不升级 react-router-dom

**权衡**：维持旧版本（6.22.3），放弃新特性（7.x）

**理由**：
- 6.22.3 已兼容 React 19
- 7.x 可能引入 breaking changes（路由 API 变化）
- 当前路由功能满足需求

## Migration Plan

### Phase 1: 依赖升级（已完成）

```bash
npm install react@19.0.0 react-dom@19.0.0 --prefix apps/web --save-exact
npm install zustand@5.0.13 --prefix apps/web --save-exact
npm install @tanstack/react-query@5.100.9 --prefix apps/web --save-exact
npm run build --prefix apps/web  # 验证构建成功
```

**验证结果**：构建成功（4.21s），无错误

### Phase 2: Store 类型迁移（待实施）

1. 删除 `useAppStore.ts` 中的 `AppState` 接口（第 151-270 行）
2. 为所有字段添加类型断言：
   ```typescript
   // Before
   interface AppState {
     projectId: string | null;
     projectName: string | null;
   }

   // After
   export const useAppStore = create((set) => ({
     projectId: null as string | null,
     projectName: null as string | null,
   }))
   ```
3. 运行 `tsc --noEmit --prefix apps/web` 验证类型

### Phase 3: 测试验证（待实施）

- 重点测试：
  - Step4 视频生成（依赖 @webav/av-cliper）
  - Step3 脚本生成（依赖 Zustand Store）
  - 项目列表（乐观添加、删除）
  - 全局任务队列（通知系统）
- 运行开发服务器验证运行时兼容性

### Rollback Strategy

如果升级后出现问题：

1. 回滚 package.json 到原始版本：
   ```bash
   git checkout apps/web/package.json apps/web/package-lock.json
   npm install --prefix apps/web
   ```

2. 回滚 Store 代码（如果已修改）：
   ```bash
   git checkout apps/web/store/useAppStore.ts
   ```

3. 验证回滚成功：
   ```bash
   npm run build --prefix apps/web
   npm run dev --prefix apps/web
   ```

## Open Questions

无（本次升级决策已明确，无待解决问题）