# 项目持久化优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 优化项目创建时机为首次上传主图，添加自动保存机制，提升用户体验和数据安全性。

**架构：** 创建统一的 `useProjectPersistence` Hook 封装持久化逻辑，通过 Zustand Store 管理保存状态，在关键操作后立即保存 + 10秒定时兜底。

**技术栈：** React 18, TypeScript, Zustand, TanStack Query

---

## 文件结构

### 新增文件

| 文件路径 | 职责 |
|---------|------|
| `apps/web/hooks/useProjectPersistence.ts` | 项目持久化 Hook：自动保存、手动保存、状态管理 |
| `apps/web/components/shared/SaveStatusIndicator.tsx` | 保存状态指示器组件，显示在页面右上角 |
| `apps/web/pages/project-flow/ProjectNotFoundError.tsx` | 项目不存在错误页面，全屏显示引导用户返回 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `apps/web/store/useAppStore.ts` | 新增 `saveStatus` 状态和 `setSaveStatus` 方法 |
| `apps/web/pages/project-flow/Assets.tsx` | 改造项目创建时机，集成自动保存 |
| `apps/web/pages/project-flow/ProjectLayout.tsx` | 添加关闭时清理逻辑，集成错误处理 |

---

## 任务 1：扩展 Zustand Store 添加保存状态

**文件：**
- 修改：`apps/web/store/useAppStore.ts`

- [ ] **步骤 1：定位 AppState 接口定义**

使用 Grep 搜索 `interface AppState` 定位类型定义位置。

- [ ] **步骤 2：添加 saveStatus 类型定义**

在 `AppState` 接口中添加：

```typescript
saveStatus: 'idle' | 'saving' | 'saved' | 'error';
setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
```

- [ ] **步骤 3：添加初始值**

在 `useAppStore` 初始值中添加：

```typescript
saveStatus: 'idle',
```

- [ ] **步骤 4：添加 setSaveStatus 方法**

在 `useAppStore` 方法中添加：

```typescript
setSaveStatus: (status) => set({ saveStatus: status }),
```

- [ ] **步骤 5：验证类型检查通过**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 6：Commit**

```bash
git add apps/web/store/useAppStore.ts
git commit -m "feat(store): 添加 saveStatus 状态用于持久化状态指示"
```

---

## 任务 2：创建 useProjectPersistence Hook

**文件：**
- 创建：`apps/web/hooks/useProjectPersistence.ts`

- [ ] **步骤 1：创建 Hook 文件**

```typescript
// apps/web/hooks/useProjectPersistence.ts
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { backendApi } from '../services/backendApi';

interface UseProjectPersistenceOptions {
  autoSaveInterval?: number;
}

/**
 * 项目持久化 Hook
 * 提供自动保存和手动保存功能
 */
export function useProjectPersistence(options?: UseProjectPersistenceOptions) {
  const workflow = useAppStore((state) => state.workflow);
  const projectData = useAppStore((state) => state.projectData);
  const token = useAppStore((state) => state.token);
  const setSaveStatus = useAppStore((state) => state.setSaveStatus);
  
  const interval = options?.autoSaveInterval ?? 10000;
  const lastSaveRef = useRef<number>(0);
  const lastDataRef = useRef<string>('');

  // 手动保存
  const saveState = useCallback(async () => {
    if (!workflow.projectId || !token) return;
    
    setSaveStatus('saving');
    try {
      await backendApi.saveProjectWorkflowState(token, workflow.projectId, {
        step: 1,
        workflow,
        projectData,
      });
      setSaveStatus('saved');
      lastSaveRef.current = Date.now();
      lastDataRef.current = JSON.stringify({ workflow, projectData });
      
      // 1秒后恢复 idle
      setTimeout(() => setSaveStatus('idle'), 1000);
    } catch (error) {
      setSaveStatus('error');
      console.error('Failed to save project state:', error);
    }
  }, [workflow, projectData, token, setSaveStatus]);

  // 定时保存（只在数据有变化时保存）
  useEffect(() => {
    if (!workflow.projectId) return;
    
    const timer = setInterval(() => {
      const currentData = JSON.stringify({ workflow, projectData });
      if (currentData !== lastDataRef.current && Date.now() - lastSaveRef.current >= interval) {
        saveState();
      }
    }, interval);
    
    return () => clearInterval(timer);
  }, [workflow.projectId, workflow, projectData, saveState, interval]);

  return { saveState };
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/hooks/useProjectPersistence.ts
git commit -m "feat(hooks): 创建 useProjectPersistence Hook 实现自动保存"
```

---

## 任务 3：创建 SaveStatusIndicator 组件

**文件：**
- 创建：`apps/web/components/shared/SaveStatusIndicator.tsx`

- [ ] **步骤 1：创建组件文件**

```typescript
// apps/web/components/shared/SaveStatusIndicator.tsx
import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useProjectPersistence } from '../../hooks/useProjectPersistence';

/**
 * 保存状态指示器
 * 显示在页面右上角，展示保存状态
 */
export function SaveStatusIndicator() {
  const saveStatus = useAppStore((state) => state.saveStatus);
  const { saveState } = useProjectPersistence();

  if (saveStatus === 'idle') return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-md border border-gray-200">
      {saveStatus === 'saving' && (
        <>
          <span className="material-icons-round animate-spin text-gray-500">refresh</span>
          <span className="text-sm text-gray-600">保存中...</span>
        </>
      )}
      {saveStatus === 'saved' && (
        <>
          <span className="material-icons-round text-green-500">check_circle</span>
          <span className="text-sm text-green-600">已保存</span>
        </>
      )}
      {saveStatus === 'error' && (
        <>
          <span className="material-icons-round text-red-500">error</span>
          <span 
            onClick={saveState} 
            className="cursor-pointer text-sm text-red-600 hover:underline"
          >
            保存失败（点击重试）
          </span>
        </>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/components/shared/SaveStatusIndicator.tsx
git commit -m "feat(components): 创建 SaveStatusIndicator 保存状态指示器"
```

---

## 任务 4：改造 Assets.tsx 项目创建时机

**文件：**
- 修改：`apps/web/pages/project-flow/Assets.tsx`

- [ ] **步骤 1：导入 useProjectPersistence**

在文件顶部导入区域添加：

```typescript
import { useProjectPersistence } from "../../hooks/useProjectPersistence";
```

- [ ] **步骤 2：在组件内初始化 Hook**

在 `Assets` 组件内，其他 Hook 定义附近添加：

```typescript
const { saveState } = useProjectPersistence();
```

- [ ] **步骤 3：修改 handleUploadStep1ModuleImage 函数**

找到 `handleUploadStep1ModuleImage` 函数，将 `ensureProjectId()` 调用限制为只在主图上传时执行：

```typescript
// 只在主图上传时创建项目
if (target.target === "main") {
  const projectId = await ensureProjectId();
  // ... 后续上传逻辑
}

// 其他视角图假设项目已存在
if (target.target === "other" && !workflow.projectId) {
  setApiFeedback("请先上传主图");
  return;
}
```

- [ ] **步骤 4：移除其他函数中的 ensureProjectId 调用**

在以下函数中移除 `ensureProjectId()` 调用：
- `handleStep1ModuleRemoveBg`
- `handleGenerateOutfits`
- `handleSelectOutfit`
- `handleSelectRoleDirection`
- 其他涉及项目操作但不应主动创建项目的函数

- [ ] **步骤 5：验证修改无 TypeScript 错误**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 6：Commit**

```bash
git add apps/web/pages/project-flow/Assets.tsx
git commit -m "refactor(Assets): 项目创建时机限制为首次上传主图"
```

---

## 任务 5：集成自动保存到关键操作

**文件：**
- 修改：`apps/web/pages/project-flow/Assets.tsx`

- [ ] **步骤 1：在上传图片后添加保存**

在 `handleUploadStep1ModuleImage` 函数成功上传后调用：

```typescript
// 上传成功后保存状态
await saveState();
```

- [ ] **步骤 2：在从服饰库导入后添加保存**

在 `handleImportStep1ModuleFromLibrary` 函数导入完成后调用：

```typescript
// 导入完成后保存状态
await saveState();
```

- [ ] **步骤 3：在删除图片后添加保存**

在 `handleDeleteStep1ModuleImage` 函数删除完成后调用：

```typescript
// 删除完成后保存状态
await saveState();
```

- [ ] **步骤 4：在生成搭配方案后添加保存**

在搭配方案生成完成后的回调中调用：

```typescript
// 生成完成后保存状态
await saveState();
```

- [ ] **步骤 5：在选择搭配方案后添加保存**

在选择搭配方案的函数中调用：

```typescript
// 选择完成后保存状态
await saveState();
```

- [ ] **步骤 6：在选择角色方向后添加保存**

在确认角色方向的函数中调用：

```typescript
// 确认后保存状态
await saveState();
```

- [ ] **步骤 7：验证修改无 TypeScript 错误**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 8：Commit**

```bash
git add apps/web/pages/project-flow/Assets.tsx
git commit -m "feat(Assets): 关键操作后自动保存项目状态"
```

---

## 任务 6：创建 ProjectNotFoundError 组件

**文件：**
- 创建：`apps/web/pages/project-flow/ProjectNotFoundError.tsx`

- [ ] **步骤 1：创建组件文件**

```typescript
// apps/web/pages/project-flow/ProjectNotFoundError.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';

/**
 * 项目不存在错误页面
 * 当项目被删除或用户无权限时显示
 */
export function ProjectNotFoundError() {
  const navigate = useNavigate();
  const setSelectedProjectId = useAppStore((state) => state.setSelectedProjectId);
  const resetWorkflow = useAppStore((state) => state.resetWorkflow);
  const resetProjectData = useAppStore((state) => state.resetProjectData);

  const handleReturnToList = () => {
    // 清除项目 ID
    setSelectedProjectId(null);
    // 重置工作流状态
    resetWorkflow();
    resetProjectData();
    // 跳转到项目列表
    navigate('/create');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
          <span className="material-icons-round text-3xl text-orange-500">warning</span>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">项目不存在</h2>
        <p className="mb-6 text-gray-600">
          该项目已被删除或您没有访问权限
        </p>
        <button
          onClick={handleReturnToList}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-white font-medium hover:bg-primary/90 transition-colors"
        >
          返回项目列表
        </button>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/project-flow/ProjectNotFoundError.tsx
git commit -m "feat(components): 创建 ProjectNotFoundError 项目不存在错误页面"
```

---

## 任务 7：集成 SaveStatusIndicator 到 ProjectLayout

**文件：**
- 修改：`apps/web/pages/project-flow/ProjectLayout.tsx`

- [ ] **步骤 1：导入 SaveStatusIndicator**

在文件顶部导入区域添加：

```typescript
import { SaveStatusIndicator } from "../../components/shared/SaveStatusIndicator";
```

- [ ] **步骤 2：在页面布局中添加 SaveStatusIndicator**

在 `ProjectLayout` 组件的返回 JSX 中，最外层添加：

```tsx
return (
  <div className="...">
    <SaveStatusIndicator />
    {/* 现有内容 */}
  </div>
);
```

- [ ] **步骤 3：验证类型检查通过**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/ProjectLayout.tsx
git commit -m "feat(ProjectLayout): 集成 SaveStatusIndicator 显示保存状态"
```

---

## 任务 8：添加关闭时清理逻辑

**文件：**
- 修改：`apps/web/pages/project-flow/ProjectLayout.tsx`

- [ ] **步骤 1：导入 useProjectPersistence**

在文件顶部导入区域添加：

```typescript
import { useProjectPersistence } from "../../hooks/useProjectPersistence";
```

- [ ] **步骤 2：定义关闭清理函数**

在 `ProjectLayout` 组件内添加：

```typescript
const token = useAppStore((state) => state.token);
const workflow = useAppStore((state) => state.workflow);
const step1OutfitModules = useAppStore((state) => state.projectData.step1OutfitModules ?? []);

const handleCloseProject = useCallback(async () => {
  // 检查是否有主图
  const hasMainImage = step1OutfitModules.some((m) => m.mainImage);
  
  // 无主图且项目存在时，删除空项目
  if (!hasMainImage && workflow.projectId && token) {
    try {
      await backendApi.deleteProject(token, workflow.projectId);
    } catch {
      // 忽略删除失败，不影响用户体验
    }
  }
  
  // 返回项目列表
  navigate('/create');
}, [step1OutfitModules, workflow.projectId, token, navigate]);
```

- [ ] **步骤 3：绑定关闭按钮事件**

找到关闭按钮（左上角返回按钮），将其 onClick 事件绑定到 `handleCloseProject`：

```tsx
<button onClick={handleCloseProject}>
  {/* 关闭图标 */}
</button>
```

- [ ] **步骤 4：验证修改无 TypeScript 错误**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/ProjectLayout.tsx
git commit -m "feat(ProjectLayout): 关闭时检查并清理空项目"
```

---

## 任务 9：集成项目不存在错误处理

**文件：**
- 修改：`apps/web/pages/project-flow/ProjectLayout.tsx`

- [ ] **步骤 1：导入 ProjectNotFoundError**

在文件顶部导入区域添加：

```typescript
import { ProjectNotFoundError } from "./ProjectNotFoundError";
```

- [ ] **步骤 2：添加项目不存在状态**

在 `ProjectLayout` 组件内添加状态：

```typescript
const [projectNotFoundError, setProjectNotFoundError] = useState(false);
```

- [ ] **步骤 3：在数据加载时捕获 404 错误**

在项目数据加载的 useEffect 或数据获取函数中，捕获 404 错误：

```typescript
try {
  // 现有数据加载逻辑
} catch (error) {
  if (error instanceof ApiError && error.status === 404) {
    setProjectNotFoundError(true);
    return;
  }
  throw error;
}
```

- [ ] **步骤 4：条件渲染错误页面**

在组件返回的最外层添加条件判断：

```tsx
if (projectNotFoundError) {
  return <ProjectNotFoundError />;
}

return (
  // 现有布局
);
```

- [ ] **步骤 5：验证修改无 TypeScript 错误**

运行：`cd apps/web && npm run build`
预期：无 TypeScript 错误

- [ ] **步骤 6：Commit**

```bash
git add apps/web/pages/project-flow/ProjectLayout.tsx
git commit -m "feat(ProjectLayout): 集成项目不存在错误处理"
```

---

## 任务 10：手动测试验证

- [ ] **步骤 1：启动开发服务器**

运行：`npm run dev` 和 `npm --prefix apps/web run dev`

- [ ] **步骤 2：测试项目创建时机**

1. 进入 Step1 页面，不上传图片，刷新页面 → 无项目创建
2. 上传主图 → 项目创建，右上角显示"已保存"
3. 上传其他视角图 → 不创建新项目
4. 删除主图后再上传 → 复用原项目

- [ ] **步骤 3：测试自动保存**

1. 上传图片 → 等待"已保存"提示
2. 修改主体名称 → 等待自动保存
3. 删除图片 → 等待自动保存
4. 等待 10 秒 → 定时保存触发

- [ ] **步骤 4：测试关闭时清理**

1. 上传主图后关闭 → 项目保留
2. 删除所有主图后关闭 → 项目被删除
3. 返回项目列表验证结果

- [ ] **步骤 5：测试项目不存在处理**

1. 手动删除数据库中的项目记录
2. 刷新页面 → 显示错误提示
3. 点击"返回项目列表" → 正确跳转

- [ ] **步骤 6：Final Commit**

```bash
git add -A
git commit -m "feat: 完成项目持久化优化

- 项目创建时机限制为首次上传主图
- 混合自动保存：关键操作 + 10秒定时
- 保存状态指示器：右上角显示
- 项目不存在处理：引导用户返回
- 关闭时清理：无主图删除空项目"
```

---

## 验收标准

- [ ] 项目只在首次上传主图时创建
- [ ] 其他视角图上传需要先有主图
- [ ] 关键操作后自动保存并显示状态
- [ ] 10秒定时保存正常工作
- [ ] 保存状态指示器正确显示所有状态
- [ ] 保存失败可点击重试
- [ ] 关闭时无主图的项目被删除
- [ ] 项目不存在时显示错误页面
- [ ] 所有 TypeScript 编译通过
- [ ] 无控制台错误