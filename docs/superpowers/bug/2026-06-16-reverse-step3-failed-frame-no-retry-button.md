# 反推项目 Step3 分镜预览：失败帧无重试按钮、无错误提示、无占位图

> 发现日期：2026-06-16
> 影响范围：反推项目（`reverse`）Step3 分镜预览图部分失败的场景
> 严重程度：高 — 用户无法重试失败帧，只能重新批量生图（浪费积分）

---

## 用户现象

批量生成分镜预览图后，部分帧生成成功、部分帧失败。**失败帧上**：
- ❌ 没有重试按钮
- ❌ 没有错误提示
- ❌ 连占位图都没显示
- ✅ 成功帧正常显示图片和操作按钮

---

## 根因

**`useProjectTasks.ts` 的 `fetchAllTasks` 解析逻辑严重 bug**，丢弃了后端返回的 `jobType`/`status`/`error` 字段。

### Bug 代码

文件：`apps/web/hooks/useProjectTasks.ts:33-36`

```ts
return (data.jobs ?? []).map((j: { id: string; input: string }) => ({
  id: j.id,
  ...JSON.parse(j.input),   // ← 只展开 input JSON，丢弃后端所有独立字段
}));
```

后端 `formatJobResponse`（`src/routes/async-job-routes.ts:91-106`）返回的完整字段：

```ts
{ id, jobType, status, stage, input, projectId, createdAt, updatedAt, result, error, parentJobId }
```

而 `input` JSON 的内容是：

```json
{ "scriptDataId": "...", "projectId": "...", "userId": "...", "frameIndex": 1, "shotId": "..." }
```

**input JSON 里没有 `type`、没有 `status`、没有 `error`。**

### 三重字段丢失

| 丢失字段 | 后端返回值 | input JSON 里 | 前端实际值 |
|---------|-----------|-------------|-----------|
| `type`（应为 `step3_frame_preview`） | ✅ `jobType` | ❌ 无 | `undefined` |
| `status`（应为 `"failed"`） | ✅ `status` | ❌ 无 | `undefined` |
| `error`（应为 `{ message: "..." }`） | ✅ `error` | ❌ 无 | `undefined` |

---

## 传导链路（4 级）

### 第 1 级：`useStep3Tasks` 过滤失败

文件：`apps/web/hooks/useProjectTasks.ts:67-70`

```ts
task.type.startsWith('step3_')  // task.type 是 undefined → TypeError
```

`undefined.startsWith()` 抛 TypeError，React Query catch 后返回 `data = undefined`，消费方 `= []` 兜底拿到空数组。**所有 `step3_frame_preview` 任务静默丢失。**

### 第 2 级：`frameErrorMessages` 永远为空

文件：`apps/web/pages/project-flow/ReverseScriptEditor.tsx:162-186`

```ts
for (const task of step3Tasks) {           // step3Tasks = [] → 循环不执行
  if (task.type !== GlobalTaskType.STEP3_FRAME_PREVIEW) continue;
  if (task.status !== "failed") continue;  // 即使有，status 也是 undefined
  if (!task.error?.message) continue;      // error 也是 undefined
```

`frameErrorMessages` 永远是 `{}`，失败帧拿不到错误信息。

### 第 3 级：`ReverseStoryboardCard` 不渲染预览区域

文件：`apps/web/pages/project-flow/reverse-script-editor/ReverseStoryboardCard.tsx:70-71`

```ts
const hasImage = Boolean(imageUrl || segment.sceneImageUrl);  // 失败帧 → false
const shouldShowPreviewArea = isGenerating || hasImage || Boolean(errorMessage);
//                       false        false          false (undefined)
// shouldShowPreviewArea = false → 整个预览区域不渲染
```

### 第 4 级：重试按钮随之消失

预览区域不渲染 → `Step3PreviewCardRuntime` 不挂载 → 重试按钮、错误提示、占位图全部不存在。

---

## 对比：为什么成功的帧有按钮

成功帧 `imageUrl` 不为空 → `hasImage = true` → `shouldShowPreviewArea = true` → 预览区域渲染 → 显示图片 + 右上角操作按钮。

## 对比：`useGlobalTasks` 是正确的

文件：`apps/web/hooks/useGlobalTasks.ts:34-83`

```ts
return {
  id: j.id,
  type: j.jobType || 'unknown',    // ✅ 正确映射
  status: j.status,                 // ✅ 正确映射
  error: j.error,                   // ✅ 正确映射
  projectId: j.projectId,           // ✅ 正确映射
};
```

但 `ReverseScriptEditor` 用的是 `useStep3Tasks`（基于 `fetchAllTasks`），**不是** `useGlobalTasks`。

---

## 全局影响范围

`fetchAllTasks` 的 bug 不是局部问题——`useProjectTasks.ts` 导出的 **6 个 Hook 全部受害**，任务状态检测在整个应用中静默失效。

### 受影响 Hook 清单

| Hook | 消费方 | 使用的字段 | 受影响程度 | 现象 |
|------|-------|-----------|-----------|------|
| `useStep3Tasks` | `ReverseScriptEditor`、`ScriptEditor`、`useReverseScriptRewrite` | `type`、`status`、`error` | 🔴 严重 | 错误信息丢失、批量状态失灵、重试按钮不显示 |
| `useFissionTasks` | `useFissionVideo`、`Step6FissionScreen` | `type`、`status`、`error` | 🔴 严重 | 裂变任务状态全部失灵、错误提示丢失 |
| `useOutfitChangeTasks` | `OutfitChangeStep4` | `type`、`status`、`error` | 🔴 严重 | 换装进度和错误提示失效 |
| `useImageStep3Tasks` | `ImageModelPhotos` | `type`、`status`、`error` | 🔴 严重 | 模特图生成状态检测失效、失败任务无提示 |
| `useStep2FiveViewTasks` | `CharacterSelection`、`ImageCharacterSelection`、`useFiveViewGeneration` | `type`、`status` | 🟡 中等 | 五视图任务完成检测失效 |
| `useImageStep4Tasks` | `ImageEcommerceEditor` | `type`、`status` | 🟡 中等 | 详情页生成状态检测失效 |

### 为什么页面没崩溃？

`undefined.startsWith()` 抛 TypeError → React Query catch → `data = undefined` → 消费方 `= []` 兜底 → 拿到空数组 → 走了其他逻辑路径（通常是"无任务"分支）。**数据静默丢失，不报错但功能失效。**

---

## 修复方案

### 方案一：修复 `fetchAllTasks` 解析逻辑（✅ 推荐）

**改动**：1 个文件（`apps/web/hooks/useProjectTasks.ts`），约 20 行。

**修复代码**：

```ts
// 修复前（bug）
async function fetchAllTasks(): Promise<GlobalTaskItem[]> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token found');
  const resp = await fetch('/neirongmiao/api/async-jobs/my', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Failed to fetch global tasks: ${resp.statusText}`);
  const data = await resp.json();
  return (data.jobs ?? []).map((j: { id: string; input: string }) => ({
    id: j.id,
    ...JSON.parse(j.input),
  }));
}

// 修复后
async function fetchAllTasks(): Promise<GlobalTaskItem[]> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No token found');
  const resp = await fetch('/neirongmiao/api/async-jobs/my', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Failed to fetch global tasks: ${resp.statusText}`);
  const data = await resp.json();
  return (data.jobs ?? []).map((j: {
    id: string;
    jobType: string;
    status: string;
    stage: string | null;
    input: string;
    projectId: string | null;
    createdAt: number;
    updatedAt: number;
    result: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
    parentJobId?: string | null;
  }): GlobalTaskItem => ({
    id: j.id,
    type: j.jobType || 'unknown',
    status: j.status as GlobalTaskItem['status'],
    stage: j.stage,
    input: j.input,
    projectId: j.projectId,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    result: j.result,
    error: j.error,
    parentJobId: j.parentJobId ?? null,
  }));
}
```

**风险评估**：低。

- 修正数据源解析，把废数据变回正确数据
- 消费方的 `task.type`/`task.status`/`task.error` 从 `undefined` 变成真实值，过滤和判断逻辑恢复正常
- **需注意**：修复后 `step3Tasks` 等不再是空数组，之前因空数组而"恰好没出错"的消费方现在会拿到真实任务数据，可能触达之前被遮盖的逻辑分支。需逐个确认：

| 消费方 | 修复前行为 | 修复后需确认 |
|-------|-----------|------------|
| `ReverseScriptEditor` | `frameErrorMessages = {}`，失败帧无提示 | `frameErrorMessages` 有值，失败帧显示错误+重试按钮 ✅ |
| `ScriptEditor` | `frameJobs = []`，批量状态不更新 | `frameJobs` 有值，批量进度条和按钮状态正常 ✅ |
| `useReverseScriptRewrite` | `step3Tasks = []`，改写完成检测失效 | 任务数据正常，改写完成检测恢复 ✅ |
| `useFissionVideo` | `fissionTasks = []`，裂变状态全失灵 | 任务数据正常，裂变流程恢复 ✅ |
| `OutfitChangeStep4` | `outfitChangeTasks = []`，换装进度失灵 | 任务数据正常，换装流程恢复 ✅ |
| `ImageModelPhotos` | `imageStep3Tasks = []`，模特图状态失灵 | 任务数据正常，模特图流程恢复 ✅ |

### 方案二：让消费方改用 `useGlobalTasks`（❌ 不推荐）

**改动**：6+ 个消费方文件，每个约 5-10 行。

**不推荐原因**：
1. 1 个 bug 根源不该让 6 个消费方改代码
2. `useGlobalTasks` 用 `useAppStore` 取 token，`useProjectTasks` 用 `localStorage`，认证方式不同
3. 改动量大，回归风险高

### 方案三：删掉 `useProjectTasks.ts`，统一到 `useGlobalTasks`（长期方向，暂不急）

把所有 Hook 迁移为基于 `useGlobalTasks` 的派生。架构正确方向，但改动量大，作为后续技术债清理。

---

## 可选加固：失败帧始终显示预览区域

即使修复了 `fetchAllTasks`，仍建议在 `ReverseStoryboardCard.tsx` 中增加兜底逻辑：

**当前逻辑**：
```ts
const shouldShowPreviewArea = isGenerating || hasImage || Boolean(errorMessage);
```

**问题**：如果 `errorMessage` 因任何原因再次丢失（如任务被清理），失败帧仍会隐藏。

**加固方案**：增加"批量已结束但该帧无图"的判断，始终为无图帧显示占位区域+重试按钮：

```ts
// 批量已完成 = batchState 存在且 running=false 且 completedCount+failedCount > 0
const batchFinished = !isBatchBusy && (/* 由父组件传入批量完成信号 */);
const shouldShowPreviewArea = isGenerating || hasImage || Boolean(errorMessage) || batchFinished;
```

---

## 涉及文件

| 文件 | 角色 |
|------|------|
| `apps/web/hooks/useProjectTasks.ts` | **Bug 所在**：`fetchAllTasks` 解析逻辑错误 |
| `apps/web/hooks/useGlobalTasks.ts` | 正确的参考实现 |
| `apps/web/pages/project-flow/ReverseScriptEditor.tsx` | 消费 `step3Tasks`，构建 `frameErrorMessages` |
| `apps/web/pages/project-flow/ScriptEditor.tsx` | 同样消费 `useStep3Tasks`，受同一 bug 影响 |
| `apps/web/pages/project-flow/reverse-script-editor/ReverseStoryboardCard.tsx` | 根据 `shouldShowPreviewArea` 控制预览区域显示 |
| `apps/web/pages/project-flow/step3-workspace/step3PreviewCardRuntime.tsx` | 实际渲染重试按钮的组件 |
| `apps/web/pages/fission/useFissionVideo.ts` | 消费 `useFissionTasks`，裂变状态受影响 |
| `apps/web/pages/outfit-change/OutfitChangeStep4.tsx` | 消费 `useOutfitChangeTasks`，换装状态受影响 |
| `apps/web/pages/image-project/ImageModelPhotos.tsx` | 消费 `useImageStep3Tasks`，模特图状态受影响 |
| `src/routes/async-job-routes.ts` | 后端 `formatJobResponse` 返回完整字段 |
