# 项目持久化优化设计

**日期**: 2026-04-08
**状态**: 待实现
**作者**: Claude

---

## 1. 背景

当前项目创建时机分散在多个操作中（上传图片、白底化、生成搭配等），状态持久化需要手动调用，存在以下问题：

1. 用户不清楚项目何时创建
2. 关键操作后容易遗漏保存
3. 项目被删除时用户工作丢失
4. 缺少保存状态反馈

---

## 2. 目标

- 明确项目创建时机：首次上传主图
- 自动保存机制：关键操作后立即保存 + 定时兜底
- 保存状态可视化：右上角状态指示器
- 优雅处理异常：项目不存在时引导用户

---

## 3. 设计决策

### 3.1 项目创建时机

**决策**: 只在首次上传主图时创建项目

**理由**:
- 用户有明确操作意图时才创建
- 避免过早创建空项目
- 其他操作假设项目已存在

**改动点**:

| 函数 | 改造前 | 改造后 |
|------|--------|--------|
| `handleUploadStep1ModuleImage` | 上传时调用 `ensureProjectId()` | **主图上传**时调用，其他视角图假设项目已存在 |
| `handleStep1ModuleRemoveBg` | 调用 `ensureProjectId()` | 移除，假设项目已存在 |
| `handleGenerateOutfits` | 调用 `ensureProjectId()` | 移除，假设项目已存在 |
| `handleSelectOutfit` | 调用 `ensureProjectId()` | 移除，假设项目已存在 |
| `handleSelectRoleDirection` | 调用 `ensureProjectId()` | 移除，假设项目已存在 |
| `handleConfirmRoleDirection` | 调用 `ensureProjectId()` | 移除，假设项目已存在 |

### 3.2 关闭页面时的清理

**决策**: 用户点击关闭时，如果没有主图，删除空项目

**空项目定义**: `step1OutfitModules` 中所有模块都没有 `mainImage`

**处理流程**:
```
用户点击关闭
    ↓
检查是否有主图
    ↓
有主图 → 直接返回，保留项目
无主图 → 删除空项目 → 返回项目列表
```

**边缘情况**:
- 删除失败 → 忽略错误，直接返回
- 用户直接关闭浏览器标签 → 无法捕获，空项目保留

### 3.3 自动保存机制

**决策**: 混合模式 — 关键操作后立即保存 + 10秒定时兜底

**关键操作列表**（数据变化即保存）:

| 操作 | 保存时机 |
|------|---------|
| 上传主图/其他视角图 | 上传成功并入库后 |
| 从服饰库导入 | 导入完成后 |
| 删除图片 | 删除完成后 |
| 生成搭配方案 | 生成完成后 |
| 选择搭配方案 | 选择完成后 |
| 生成角色方向 | 生成完成后 |
| 选择角色方向 | 确认后 |
| 进入下一步 | 状态变更后 |
| 白底化处理 | 处理完成后 |
| 修改主体名称/描述 | 修改完成后 |

**定时保存**: 每 10 秒自动保存一次（兜底机制）

### 3.4 保存状态指示器

**位置**: 页面右上角

**状态**:

| 状态 | 图标 | 文字 | 颜色 | 持续时间 |
|------|------|------|------|---------|
| 空闲 | 无 | — | — | — |
| 保存中 | 旋转图标 | 保存中... | 灰色 | — |
| 已保存 | ✓ | 已保存 | 绿色 | 1秒后淡出 |
| 保存失败 | ⚠ | 保存失败 | 红色 | 持续显示，点击可重试 |

### 3.5 项目不存在时的处理

**决策**: 显示错误提示，引导用户返回项目列表

**触发场景**:
- 用户刷新页面，localStorage 中的项目 ID 对应的项目已被删除
- 协作场景中，项目被其他用户删除

**错误提示 UI**:
```
┌────────────────────────────────────┐
│         ⚠ 项目不存在               │
│  该项目已被删除或您没有访问权限     │
│      [返回项目列表]                │
└────────────────────────────────────┘
```

**处理流程**:
```
API 调用返回 404
    ↓
显示全屏错误提示
    ↓
用户点击"返回项目列表"
    ↓
清除 localStorage 中的项目 ID
    ↓
跳转到 /create 或首页
```

---

## 4. 架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────┐
│  useProjectPersistence Hook                     │
├─────────────────────────────────────────────────┤
│  - ensureProject()     创建项目（懒创建）        │
│  - saveState()         手动保存状态              │
│  - startAutoSave()     启动定时保存              │
│  - stopAutoSave()      停止定时保存              │
└─────────────────────────────────────────────────┘
          ↓ 调用
┌─────────────────────────────────────────────────┐
│  Zustand Store (useAppStore)                    │
│  - workflow                                      │
│  - projectData                                   │
│  - saveStatus (新增)                             │
└─────────────────────────────────────────────────┘
          ↓ 持久化
┌─────────────────────────────────────────────────┐
│  backendApi.saveProjectWorkflowState()          │
└─────────────────────────────────────────────────┘
```

### 4.2 文件结构

**新增文件**:

| 文件路径 | 用途 |
|---------|------|
| `apps/web/hooks/useProjectPersistence.ts` | 持久化 Hook |
| `apps/web/components/shared/SaveStatusIndicator.tsx` | 保存状态指示器组件 |
| `apps/web/pages/project-flow/ProjectNotFoundError.tsx` | 项目不存在错误页面 |

**修改文件**:

| 文件路径 | 修改内容 |
|---------|---------|
| `apps/web/store/useAppStore.ts` | 新增 `saveStatus` 状态 |
| `apps/web/pages/project-flow/Assets.tsx` | 移除冗余 `ensureProjectId` 调用，集成 `useProjectPersistence` |
| `apps/web/pages/project-flow/ProjectLayout.tsx` | 添加关闭时清理逻辑，项目不存在错误处理 |

---

## 5. 实现细节

### 5.1 useProjectPersistence Hook

```typescript
// apps/web/hooks/useProjectPersistence.ts
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { backendApi } from '../services/backendApi';

interface UseProjectPersistenceOptions {
  autoSaveInterval?: number; // 默认 10000ms
}

export function useProjectPersistence(options?: UseProjectPersistenceOptions) {
  const { workflow, projectData, updateWorkflow, setSaveStatus } = useAppStore();
  const interval = options?.autoSaveInterval ?? 10000;
  const lastSaveRef = useRef<number>(0);

  // 手动保存
  const saveState = useCallback(async () => {
    if (!workflow.projectId) return;
    
    setSaveStatus('saving');
    try {
      await backendApi.saveProjectWorkflowState(
        useAppStore.getState().token,
        workflow.projectId,
        { workflow, projectData }
      );
      setSaveStatus('saved');
      lastSaveRef.current = Date.now();
      
      // 1秒后恢复 idle
      setTimeout(() => setSaveStatus('idle'), 1000);
    } catch (error) {
      setSaveStatus('error');
      console.error('Failed to save project state:', error);
    }
  }, [workflow, projectData, setSaveStatus]);

  // 定时保存
  useEffect(() => {
    if (!workflow.projectId) return;
    
    const timer = setInterval(() => {
      // 只有数据有变化时才保存
      if (Date.now() - lastSaveRef.current > interval) {
        saveState();
      }
    }, interval);
    
    return () => clearInterval(timer);
  }, [workflow.projectId, saveState, interval]);

  return { saveState };
}
```

### 5.2 SaveStatusIndicator 组件

```typescript
// apps/web/components/shared/SaveStatusIndicator.tsx
import { useAppStore } from '../../store/useAppStore';

export function SaveStatusIndicator() {
  const saveStatus = useAppStore((state) => state.saveStatus);
  const saveState = useProjectPersistence().saveState;

  if (saveStatus === 'idle') return null;

  return (
    <div className={`save-status-indicator save-status-${saveStatus}`}>
      {saveStatus === 'saving' && (
        <>
          <span className="animate-spin material-icons-round">refresh</span>
          <span>保存中...</span>
        </>
      )}
      {saveStatus === 'saved' && (
        <>
          <span className="material-icons-round text-green-500">check</span>
          <span>已保存</span>
        </>
      )}
      {saveStatus === 'error' && (
        <>
          <span className="material-icons-round text-red-500">warning</span>
          <span onClick={saveState} className="cursor-pointer">保存失败（点击重试）</span>
        </>
      )}
    </div>
  );
}
```

### 5.3 Zustand Store 扩展

```typescript
// apps/web/store/useAppStore.ts 新增
interface AppState {
  // ... 现有字段
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
}

// 初始值
saveStatus: 'idle',

// 方法
setSaveStatus: (status) => set({ saveStatus: status }),
```

### 5.4 项目创建时机改造

```typescript
// apps/web/pages/project-flow/Assets.tsx
// handleUploadStep1ModuleImage 中

// 只在主图上传时创建项目
if (target.target === "main") {
  const projectId = await ensureProjectId();
  // ... 后续逻辑
}

// 其他视角图假设项目已存在
if (target.target === "other" && !workflow.projectId) {
  setApiFeedback("请先上传主图");
  return;
}
```

### 5.5 关闭时清理逻辑

```typescript
// apps/web/pages/project-flow/ProjectLayout.tsx

const handleCloseProject = useCallback(async () => {
  // 检查是否有主图
  const hasMainImage = step1OutfitModules.some(m => m.mainImage);
  
  if (!hasMainImage && workflow.projectId) {
    // 删除空项目
    try {
      await backendApi.deleteProject(token, workflow.projectId);
    } catch {
      // 忽略删除失败
    }
  }
  
  // 返回项目列表
  navigate('/create');
}, [step1OutfitModules, workflow.projectId, token, navigate]);
```

---

## 6. 测试要点

### 6.1 项目创建时机
- [ ] 首次上传主图 → 创建项目
- [ ] 上传其他视角图（无主图）→ 提示先上传主图
- [ ] 上传其他视角图（有主图）→ 不创建新项目
- [ ] 删除主图后再上传 → 复用原项目

### 6.2 自动保存
- [ ] 上传图片后自动保存
- [ ] 删除图片后自动保存
- [ ] 选择搭配后自动保存
- [ ] 10秒定时保存触发
- [ ] 保存状态指示器正确显示

### 6.3 关闭时清理
- [ ] 有主图 → 保留项目
- [ ] 无主图 → 删除空项目

### 6.4 项目不存在处理
- [ ] 项目被删除后刷新页面 → 显示错误提示
- [ ] 点击返回项目列表 → 正确跳转

---

## 7. 迁移计划

1. 新增 `saveStatus` 到 Zustand Store
2. 创建 `useProjectPersistence` Hook
3. 创建 `SaveStatusIndicator` 组件
4. 改造 `Assets.tsx` 中的 `ensureProjectId` 调用
5. 在 `ProjectLayout.tsx` 添加关闭清理逻辑
6. 创建 `ProjectNotFoundError` 组件
7. 集成到项目加载流程

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 频繁保存增加服务器压力 | 中 | 使用 debounce 或检查数据变化 |
| 保存失败数据丢失 | 高 | 失败提示 + 重试机制 |
| 空项目清理遗漏 | 低 | 后续可通过定时任务清理 |
| 浏览器标签直接关闭 | 低 | 无法捕获，接受此限制 |

---

## 9. 后续优化

- [ ] 添加保存失败的自动重试机制
- [ ] 后端添加定时清理空项目的任务
- [ ] 支持离线模式（Service Worker）
- [ ] 保存历史版本支持回滚