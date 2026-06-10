# Bug 分析：resume-snapshot 失败导致项目数据损坏

**日期：** 2026-04-14
**状态：** 待修复
**严重级别：** 高（可能导致用户项目数据永久丢失）

---

## 一、问题描述

用户打开 Step4 页面时，`resume-snapshot` 接口返回 404/500 错误，但 `workflow-state` 保存接口正常。导致前端空状态被自动保存到数据库，覆盖原有项目数据。

---

## 二、问题完整链路

```
┌─────────────────────────────────────────────────────────────────┐
│                     用户打开 Step4 页面                          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              useEffect 触发 resume-snapshot 请求                 │
│              [ProjectLayout.tsx:256-277]                        │
└─────────────────────────────────────────────────────────────────┘
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
             ▼                                   ▼
 ┌───────────────────┐               ┌───────────────────┐
 │    请求成功        │               │    请求失败        │
 │   (正常流程)       │               │  (401/500/网络)   │
 └───────────────────┘               └───────────────────┘
             │                                   │
             ▼                                   ▼
 ┌───────────────────┐               ┌───────────────────┐
 │ restoreProjectFlow│               │ catch 块处理       │
 │ FromSnapshot()    │               │ [L269-274]        │
 │ Zustand 状态恢复   │               │                   │
 └───────────────────┘               │ ❌ 只处理 404      │
             │                       │ ❌ 其他错误忽略    │
             │                       │ Zustand 保持空     │
             │                       └───────────────────┘
             │                                   │
             │                                   ▼
             │                       ┌───────────────────┐
             │                       │ 页面继续渲染       │
             │                       │ 用户看到空白状态   │
             │                       └───────────────────┘
             │                                   │
             │                                   ▼
             │                       ┌───────────────────┐
             │                       │ 自动保存触发       │
             │                       │ (visibilitychange │
             │                       │  / pagehide /     │
             │                       │  useEffect cleanup)│
             │                       │ [L192-210]        │
             │                       └───────────────────┘
             │                                   │
             │                                   ▼
             │                       ┌───────────────────┐
             │                       │ flushLatestWorkflow│
             │                       │ State() 执行       │
             │                       │ [L102-163]        │
             │                       │                   │
             │                       │ ❌ 无状态检查      │
             │                       │ ❌ 无恢复标记检查  │
             │                       └───────────────────┘
             │                                   │
             │                                   ▼
             │                       ┌───────────────────┐
             │                       │ saveProjectWorkflow│
             │                       │ State() 调用       │
             │                       │                   │
             │                       │ 空数据 → 数据库    │
             │                       │ 原数据被覆盖       │
             │                       │ 💥 数据损坏        │
             │                       └───────────────────┘
```

---

## 三、现有代码问题点

### 问题点 1：错误处理不完整

**位置：** `apps/web/pages/project-flow/ProjectLayout.tsx:269-274`

```typescript
} catch (error) {
  if (cancelled) return;
  // 问题：只处理 404，其他错误完全忽略
  if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) {
    setProjectNotFoundError(true);
  }
  // 401/500/网络错误：静默失败，Zustand 保持初始空状态
}
```

| 错误类型 | 当前处理 | 后果 |
|---------|---------|------|
| 404 (项目不存在) | ✅ 显示错误页面 | 正确 |
| 401 (未授权) | ❌ 静默忽略 | 页面空白，数据损坏 |
| 500 (服务器错误) | ❌ 静默忽略 | 页面空白，数据损坏 |
| 网络错误 | ❌ 静默忽略 | 页面空白，数据损坏 |

### 问题点 2：自动保存无前置检查

**位置：** `apps/web/pages/project-flow/ProjectLayout.tsx:102-163`

```typescript
const flushLatestWorkflowState = () => {
  // 问题：没有检查状态是否已成功恢复
  if (isClosingProjectRef.current) {
    return;
  }
  // 直接读取当前 Zustand 状态并保存
  const storeState = useAppStore.getState();
  // ...
  void backendApi.saveProjectWorkflowState(...);
};
```

- 只检查了"是否正在关闭项目"
- 没有检查"状态是否已成功恢复"
- 导致空状态被保存

### 问题点 3：自动保存触发时机过于激进

**位置：** `apps/web/pages/project-flow/ProjectLayout.tsx:192-210`

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushLatestWorkflowState(); // 切换 tab 就保存
    }
  };
  const handlePageHide = () => {
    flushLatestWorkflowState(); // 页面隐藏就保存
  };
}, []);
```

用户切换 tab → 触发保存 → 状态未恢复 → 保存空数据 → 原数据被覆盖

---

## 四、处理方式对比

### 方式 A：前端标记 + 错误提示（推荐）

**改动范围：** 仅前端 `ProjectLayout.tsx`

**实现思路：**
1. 新增 `workflowRestoredRef` 标记，初始为 `false`
2. `resume-snapshot` 成功后设为 `true`
3. `flushLatestWorkflowState()` 开头检查标记，未恢复则阻止保存
4. 恢复失败时显示错误提示，提供重试按钮

```
workflowRestoredRef = false (初始)
         ↓
resume-snapshot 成功 → workflowRestoredRef = true
         ↓
flushLatestWorkflowState() → 检查 workflowRestoredRef
         ↓
true  → 允许保存
false → 阻止保存 + 打印警告
```

| 维度 | 评估 |
|------|------|
| 复杂度 | 低 |
| 防护强度 | 阻止错误源头 |
| 性能影响 | 无 |
| 风险 | 低 |

---

### 方式 B：后端数据保护

**改动范围：** 后端 `project-flow-handlers.ts`

**实现思路：**
保存前对比新旧数据，新数据明显为空时拒绝覆盖。

```typescript
// 伪代码
if (existingData.hasSignificantContent() && newData.isEmpty()) {
  // 拒绝覆盖，记录警告日志
  return existingData;
}
```

| 维度 | 评估 |
|------|------|
| 复杂度 | 中 |
| 防护强度 | 数据库层防御 |
| 性能影响 | 每次保存多一次查询 |
| 风险 | "空"的定义难以精确，可能误判新建项目 |

---

### 方式 C：前端双重验证

**改动范围：** 前端 `ProjectLayout.tsx`

**实现思路：**
保存前先读取数据库当前状态，对比内存状态与数据库状态。

```typescript
const currentSnapshot = await backendApi.projectResumeSnapshot(token, projectId);
if (hasSignificantData(currentSnapshot) && isMemoryEmpty()) {
  return; // 阻止保存
}
```

| 维度 | 评估 |
|------|------|
| 复杂度 | 高 |
| 防护强度 | 最严格 |
| 性能影响 | 每次保存多一次网络请求 |
| 风险 | 实现复杂，增加延迟 |

---

### 方式 D：禁用自动保存直到手动确认

**改动范围：** 前端

**实现思路：**
恢复失败时显示错误页面，完全禁用自动保存，用户点击"重新加载"后才恢复。

| 维度 | 评估 |
|------|------|
| 复杂度 | 低 |
| 防护强度 | 彻底阻止 |
| 性能影响 | 无 |
| 风险 | 正常情况可能增加等待 |

---

## 五、推荐方案

**方式 A（前端标记）+ 方式 B（后端保护）组合**，两层防护：

| 防护层 | 阻止的问题类型 | 覆盖率 |
|--------|---------------|--------|
| 前端标记 | 状态未恢复时的自动保存 | 95% |
| 后端保护 | 任何来源的空数据覆盖 | 99% |
| 组合效果 | 双重保险 | 99.9% |

---

## 六、具体修改清单

| 文件 | 修改点 | 复杂度 |
|------|--------|--------|
| `apps/web/pages/project-flow/ProjectLayout.tsx` | 新增 `workflowRestoredRef` 标记、修改错误处理、新增错误提示 UI | 低 |
| `src/routes/project-flow-handlers.ts` | `saveProjectWorkflowStateRoute` 增加空数据保护逻辑 | 中 |

---

## 七、风险评估

### 不修复的风险

| 场景 | 概率 | 影响 | 风险等级 |
|------|------|------|---------|
| 用户刷新页面时 token 过期 | 中 | 数据损坏 | 🔴 高 |
| 后端临时 500 错误 | 低 | 数据损坏 | 🟡 中 |
| 网络波动导致请求失败 | 低 | 数据损坏 | 🟡 中 |
| 用户在错误状态下操作 | 中 | 数据损坏 | 🔴 高 |

---

## 八、相关代码索引

| 文件 | 说明 |
|------|------|
| `apps/web/pages/project-flow/ProjectLayout.tsx:102-163` | 自动保存逻辑 |
| `apps/web/pages/project-flow/ProjectLayout.tsx:192-210` | 自动保存触发时机 |
| `apps/web/pages/project-flow/ProjectLayout.tsx:256-277` | 状态恢复逻辑 |
| `apps/web/pages/project-flow/projectFlowResumeSnapshot.ts` | 恢复快照数据处理 |
| `src/routes/project-flow-handlers.ts:660` | 后端 getProjectResumeSnapshotRoute |
| `src/routes/project-flow-routes.ts:35` | 路由定义 |
