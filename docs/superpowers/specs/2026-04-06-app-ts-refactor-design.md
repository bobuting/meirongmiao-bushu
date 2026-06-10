# app.ts 分层拆分设计文档

## 概述

将 `src/app.ts` 从 2040 行减少到约 300 行，通过分层拆分路由处理器和适配器构建函数。

## 目标

- app.ts 只保留 `buildApp` 函数骨架和路由注册调用
- 所有路由处理器提取到独立模块
- 所有适配器构建函数提取到独立模块
- 统一路由注册入口

## 新模块规划

### 1. `routes/project-flow-route-handlers.ts`

提取项目 CRUD 相关路由处理器：

| 函数 | 说明 |
|------|------|
| `createProjectRoute` | 创建项目 |
| `renameProjectRoute` | 重命名项目 |
| `updateProjectLastStepRoute` | 更新最后步骤 |
| `saveProjectWorkflowStateRoute` | 保存工作流状态 |
| `getProjectResumeSnapshotRoute` | 获取恢复快照 |
| `deleteProjectRoute` | 删除项目 |
| `uploadProjectAssetsRoute` | 上传资产 |
| `updateProjectUploadSlotRoute` | 更新上传槽位 |
| `pickProjectStepState` | 选取步骤状态 |
| `buildProjectStepState` | 构建步骤状态 |

**预估行数**：约 150 行

### 2. `modules/adapter-factory.ts`

提取适配器构建函数：

| 函数 | 说明 |
|------|------|
| `buildReverseFetchOrchestrator` | 构建反向获取编排器 |
| `buildSquareTrendVideoResolveOrchestrator` | 构建广场视频解析编排器 |
| `buildDouhotAdapter` | 构建 Douhot 适配器 |
| `buildTikHubVideoAdapter` | 构建 TikHub 视频适配器 |
| `buildTikHubRealtimeAdapter` | 构建 TikHub 实时适配器 |
| `resolveRuntimeStageOrder` | 解析运行时阶段顺序 |

**预估行数**：约 80 行

### 3. `routes/route-registrar.ts`

统一路由注册入口，封装所有 `register*Routes` 调用：

```typescript
export async function registerAllRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: RouteRegistrarDeps,
): void {
  app.register(async (apiApp) => {
    registerVideoApiRoutes(apiApp, ctx, deps);
    registerLibraryRoutes(apiApp, ctx, deps);
    registerAuthRoutes(apiApp, ctx);
    registerProjectRoutes(apiApp, ctx, deps);
    // ... 其他路由
  }, { prefix: "/neirongmiao/api" });
  
  registerVideoMusicFileRoutes(app, ctx);
  registerFrontendShellFallbackRoutes(app, deps);
}
```

**预估行数**：约 100 行

### 4. `routes/admin-helpers.ts`

提取管理员辅助函数：

| 函数 | 说明 |
|------|------|
| `toAdminScriptItem` | 转换脚本为管理员视图项 |

**预估行数**：约 20 行

## 最终 app.ts 结构

```typescript
// 导入（约 50 行）
import { setupCore } from "./app-setup/setup-core.js";
import { createAdapterFactory, type AdapterFactory } from "./modules/adapter-factory.js";
import { registerAllRoutes, type RouteRegistrarDeps } from "./routes/route-registrar.js";
// ... 精简的核心导入

// buildApp 函数（约 200 行）
export async function buildApp(): Promise<FastifyInstance> {
  // 阶段 1: 核心初始化
  const core = await setupCore();
  const { app, ctx, runtimeConfig } = core;
  
  // 阶段 2: 适配器工厂
  const adapterFactory = createAdapterFactory(ctx, runtimeConfig);
  
  // 阶段 3: 路由注册
  const routeDeps = buildRouteRegistrarDeps(ctx, adapterFactory);
  await registerAllRoutes(app, ctx, routeDeps);
  
  // 阶段 4: 错误处理和钩子
  setupErrorHandler(app);
  setupCorsHook(app);
  
  // 阶段 5: 静态路由和 SPA fallback
  registerStaticRoutes(app, ...);
  registerFrontendShellFallbackRoutes(app, ...);
  
  return app;
}

// 导出（约 50 行）
export { setupErrorHandler, setupCorsHook };
```

**预估总行数**：约 300 行

## 依赖关系

```
app.ts
  ├── app-setup/setup-core.ts (已存在)
  ├── modules/adapter-factory.ts (新建)
  ├── routes/route-registrar.ts (新建)
  ├── routes/project-flow-route-handlers.ts (新建)
  ├── routes/admin-helpers.ts (新建)
  └── routes/*.ts (已存在的路由模块)
```

## 实现步骤

1. 创建 `modules/adapter-factory.ts`，提取适配器构建函数
2. 创建 `routes/admin-helpers.ts`，提取 `toAdminScriptItem`
3. 创建 `routes/project-flow-route-handlers.ts`，提取项目路由处理器
4. 创建 `routes/route-registrar.ts`，统一路由注册入口
5. 重构 app.ts，只保留 buildApp 骨架
6. 精简 app.ts 导入，移除不再需要的导入
7. 编译验证

## 成功标准

- app.ts 行数 ≤ 350 行
- 编译通过，无类型错误
- 所有路由功能正常