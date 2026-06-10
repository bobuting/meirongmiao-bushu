# Step1-Step5 存储方案改造实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 消除 WorkflowState 跨 step 数据覆盖问题，各 step 数据存储在业务表，WorkflowState 只记录状态和历史展示数据

**架构：**
- 后端 `projectResumeSnapshot` 改为返回轻量 `historySnapshot`（用于左侧历史面板）
- 后端新增 `getStep3FrameImages` 查询 API（已有），Step4 从 `nrm_step3_frame_images` 获取分镜图片
- 删除 `flushLatestWorkflowState` 和 `saveState`，消除路由切换时的数据覆盖
- 各 step 数据通过独立 API 获取和保存，不依赖整体 `projectData`

**技术栈：** Fastify 5, PostgreSQL, React 18, Zustand, TypeScript

---

## 文件清单

### 后端修改
| 文件 | 职责 |
|------|------|
| `src/routes/project-flow-route-handlers.ts` | 修改 `saveProjectWorkflowStateRoute` 和 `getProjectResumeSnapshotRoute` |
| `src/service/step3-frame-images-db-service.ts` | 已有，Step4 获取分镜图片的 DB 服务 |

### 前端修改
| 文件 | 职责 |
|------|------|
| `apps/web/services/realApi/projects.ts` | 修改 `projectResumeSnapshot` 和 `saveProjectWorkflowState` 接口签名 |
| `apps/web/store/useAppStore.ts` | 修改 Zustand store，删除 `saveState`，新增 `historySnapshot` 字段 |
| `apps/web/pages/project-flow/ProjectLayout.tsx` | 删除 `flushLatestWorkflowState` 及相关逻辑 |
| `apps/web/pages/project-flow/projectFlowResumeSnapshot.ts` | 修改 `restoreProjectFlowFromSnapshot`，不再恢复完整 `projectData` |
| `apps/web/pages/project-flow/Step4VideoWorkspaceScreen.tsx` | 分镜图片改为从 `getStep3FrameImages` API 获取 |
| `apps/web/components/project-flow/ProjectFlowHistorySidebar.tsx` | 数据源改为 `historySnapshot` |

---

### 阶段 1：后端基础改造

### 任务 1：修改 `saveProjectWorkflowStateRoute` 不再保存完整 projectData

**文件：**
- 修改：`src/routes/project-flow-route-handlers.ts:585-660`

**步骤 1：修改 handler 只保存轻量数据**

当前 handler 将完整 `projectData` 保存到数据库。改为只保存：
- `lastVisitedStep`
- `workflow`（轻量工作流状态）
- `historySnapshot`（新增字段，历史展示数据）

```typescript
// 修改前（line 588-591）
const body = (request.body as {
  step?: number;
  workflow?: unknown;
  projectData?: unknown;
} | undefined) ?? {};

// 修改后
const body = (request.body as {
  step?: number;
  workflow?: unknown;
  historySnapshot?: unknown;  // 新增：历史展示数据
} | undefined) ?? {};

// 修改前（line 598）
const projectData = sanitizeWorkflowStateProjectData(toPlainRecord(body.projectData));

// 修改后 - 不再保存完整 projectData
const historySnapshot = toPlainRecord(body.historySnapshot);
```

```typescript
// 修改前（line 628-641）
const persisted: ProjectWorkflowStateRecord = {
  id: existing?.id ?? project.id,
  projectId: project.id,
  userId: user.id,
  lastVisitedStep: normalizedStep,
  workflow,
  projectData,  // 删除此字段
  snapshotVersion: PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
  pageContentSnapshot,
  backgroundGenerationTask,
  stepState: buildProjectStepState(projectData),
  updatedAt: now,
};

// 修改后
const persisted: ProjectWorkflowStateRecord = {
  id: existing?.id ?? project.id,
  projectId: project.id,
  userId: user.id,
  lastVisitedStep: normalizedStep,
  workflow,
  historySnapshot,  // 新增：历史展示数据
  updatedAt: now,
};
```

**步骤 2：运行类型检查确认无错误**

运行：`npx tsc --noEmit`
预期：无新增类型错误

**步骤 3：Commit**

```bash
git add src/routes/project-flow-route-handlers.ts
git commit -m "refactor: saveProjectWorkflowStateRoute 改为只保存轻量状态和历史快照，不再保存完整 projectData"
```

---

### 任务 2：修改 `getProjectResumeSnapshotRoute` 返回 historySnapshot

**文件：**
- 修改：`src/routes/project-flow-route-handlers.ts:663-794`

**步骤 1：修改返回值，新增 `historySnapshot` 字段**

```typescript
// 在返回对象中新增（line 747-793 附近）
return {
  project: { ... },
  persistedWorkflowState: {
    id: persisted?.id,
    projectId: persisted?.projectId,
    lastVisitedStep: persisted?.lastVisitedStep,
    workflow: persisted?.workflow,
    historySnapshot: persisted?.historySnapshot,  // 新增
    // 删除 projectData 返回
    updatedAt: persisted?.updatedAt,
  },
  state: { ... },
  snapshot: { ... },
};
```

**步骤 2：运行类型检查确认无错误**

运行：`npx tsc --noEmit`
预期：无新增类型错误

**步骤 3：Commit**

```bash
git add src/routes/project-flow-route-handlers.ts
git commit -m "feat: projectResumeSnapshot 返回 historySnapshot 字段，不再返回完整 projectData"
```

---

### 任务 3：前端修改 `projectResumeSnapshot` 接口签名

**文件：**
- 修改：`apps/web/services/realApi/projects.ts:14-22` (接口), `382-435` (实现)

**步骤 1：修改接口签名**

```typescript
// 修改前（line 16-20）
projectResumeSnapshot(token: string, projectId: string): Promise<{
  project: { ... };
  workflowState: { ... } | null;
  persistedWorkflowState: { projectData: Record<string, unknown> | null; workflow: Record<string, unknown> | null; ... } | null;
  // ...
}>;

// 修改后
projectResumeSnapshot(token: string, projectId: string): Promise<{
  project: { id: string; name: string; status: string; ... };
  workflowState: { lastVisitedStep: number; ... } | null;
  persistedWorkflowState: {
    id: string;
    projectId: string;
    lastVisitedStep: number;
    workflow: Record<string, unknown> | null;
    historySnapshot: Record<string, unknown> | null;  // 新增
    updatedAt: number;
  } | null;
  state: { ... };
  snapshot: { ... };
}>;
```

**步骤 2：运行类型检查确认无错误**

运行：`npm run build`
预期：无新增类型错误

**步骤 3：Commit**

```bash
git add apps/web/services/realApi/projects.ts
git commit -m "refactor: projectResumeSnapshot 接口签名改为返回 historySnapshot，不再返回 projectData"
```

---

### 阶段 2：删除问题代码

### 任务 4：删除 `flushLatestWorkflowState` 自动保存逻辑

**文件：**
- 修改：`apps/web/pages/project-flow/ProjectLayout.tsx:102-198`

**步骤 1：删除 `flushLatestWorkflowState` 函数及调用**

```typescript
// 删除 line 102-163 的 flushLatestWorkflowState 函数定义
// 删除 line 180-198 的 useEffect（包含 visibilitychange, pagehide, beforeunload 监听）

// 保留 line 171-177 的 useEffect（设置 DRAFT 状态）
// 保留 line 200-220 的 useEffect（写入 session）
// 保留 line 224-265 的 useEffect（恢复快照）
```

**步骤 2：删除相关引用和 imports**

检查是否有其他地方引用了 `flushLatestWorkflowState`、`latestWorkflowPayloadRef`、`syncedWorkflowStateRef`、`workflowStateTimerRef`、`parseStepFromPath`、`sanitizeProjectDataForWorkflowStateSync`、`backendApi.saveProjectWorkflowState`。如有则一并删除。

```typescript
// 删除相关 ref 定义（如果有）
const latestWorkflowPayloadRef = useRef<...>(null);
const syncedWorkflowStateRef = useRef<string>("");
const workflowStateTimerRef = useRef<number | null>(null);
const isClosingProjectRef = useRef(false);
```

**步骤 3：运行类型检查确认无错误**

运行：`npx tsc --noEmit --project apps/web/tsconfig.json`
预期：无新增类型错误

**步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/ProjectLayout.tsx
git commit -m "fix: 删除 flushLatestWorkflowState 自动保存逻辑，消除路由切换时的数据覆盖问题"
```

---

### 任务 5：删除 `saveState` 函数

**文件：**
- 修改：`apps/web/store/useAppStore.ts:705-722`

**步骤 1：删除 `saveState` 函数**

```typescript
// 删除 line 705-722
saveState: async () => {
  const state = useAppStore.getState();
  if (!state.workflow.projectId || !state.token) return;

  state.setSaveStatus('saving');
  try {
    await backendApi.saveProjectWorkflowState(state.token, state.workflow.projectId, {
      step: 1,  // 硬编码 bug
      workflow: state.workflow as unknown as Record<string, unknown>,
      projectData: state.projectData as unknown as Record<string, unknown>,
    });
    state.setSaveStatus('saved');
    setTimeout(() => state.setSaveStatus('idle'), 1000);
  } catch (error) {
    state.setSaveStatus('error');
    console.error('Failed to save project state:', error);
  }
},
```

**步骤 2：清理调用点**

搜索 `saveState()` 的调用位置：
- `apps/web/pages/project-flow/Assets.tsx` - 11 处调用
- `apps/web/pages/project-flow/ScriptEditor.tsx` - 1 处调用
- `apps/web/components/shared/SaveStatusIndicator.tsx` - 调用

将这些调用替换为空操作或移除相关 UI 元素。

```typescript
// 示例：Assets.tsx 中的调用改为注释或删除
// state.saveState();  // 已删除：不再使用整体保存逻辑
```

**步骤 3：运行类型检查确认无错误**

运行：`npx tsc --noEmit --project apps/web/tsconfig.json`
预期：无新增类型错误

**步骤 4：Commit**

```bash
git add apps/web/store/useAppStore.ts apps/web/pages/project-flow/Assets.tsx apps/web/pages/project-flow/ScriptEditor.tsx apps/web/components/shared/SaveStatusIndicator.tsx
git commit -m "fix: 删除 saveState 函数（硬编码 step:1 bug），清理相关调用点"
```

---

### 阶段 3：各 step 改造

### 任务 6：Step4 分镜图片改为从 `nrm_step3_frame_images` 获取

**文件：**
- 修改：`apps/web/pages/project-flow/Step4VideoWorkspaceScreen.tsx`

**步骤 1：新增分镜图片加载逻辑**

在 Step4 组件中，进入时调用 `getStep3FrameImages` API 获取分镜图片数据。

```typescript
// 在 Step4VideoWorkspaceScreen 中新增 useEffect
useEffect(() => {
  if (!workflow.projectId || !token) return;

  let cancelled = false;
  void (async () => {
    const frameImages = await realProjectsApi.getStep3FrameImages(token, workflow.projectId);
    if (!cancelled) {
      // 将分镜图片数据保存到 Zustand 或本地 state
      // 用于左侧面板展示和视频生成
      setStep3FrameImages(frameImages);
    }
  })();
  return () => { cancelled = true; };
}, [workflow.projectId, token]);
```

**步骤 2：修改分镜图片读取路径**

```typescript
// 修改前：从 projectData.script[index].sceneImageUrl 读取
const frameImageUrls = segments.map((seg, i) => projectData.script?.[i]?.sceneImageUrl ?? null);

// 修改后：从 step3FrameImages state 读取
const frameImageUrls = segments.map((seg, i) => {
  const frameImage = step3FrameImages.find(f => f.frame_index === i);
  return frameImage?.selected_image_url ?? null;
});
```

**步骤 3：运行类型检查确认无错误**

运行：`npx tsc --noEmit --project apps/web/tsconfig.json`
预期：无新增类型错误

**步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/Step4VideoWorkspaceScreen.tsx
git commit -m "feat: Step4 分镜图片改为从 nrm_step3_frame_images 表获取，不再依赖 projectData"
```

---

### 任务 7：修改 Zustand store 新增 historySnapshot 字段

**文件：**
- 修改：`apps/web/store/useAppStore.ts`

**步骤 1：新增 `historySnapshot` 字段和更新方法**

```typescript
// 在 Zustand state 中新增
interface AppState {
  // ... 现有字段
  historySnapshot: {
    step1?: {
      uploads: Array<{ slot: string; label: string; imageUrl: string }>;
      selectedOutfit?: { sourceLabel: string; title: string };
      rolePreset?: { title: string; imageUrl: string };
    };
    step2?: {
      characterReferences: Array<{ id: string; imageUrl: string }>;
    };
    step3?: {
      scriptInfoList: Array<{
        id: string; title: string; durationSec: number;
        shotCount: number; suitability: "high" | "medium" | "low" | null;
        isSelected?: boolean;
      }>;
      frameImages: Array<{ index: number; title: string; imageUrl: string }>;
    };
    step4?: {
      clips: Array<{ index: number; title: string; thumbnailUrl: string }>;
      music?: { id: string; title: string; audioUrl: string };
    };
  };
  updateHistorySnapshot: (snapshot: Partial<AppState['historySnapshot']>) => void;
}

// 新增更新方法
updateHistorySnapshot: (snapshot) => set((state) => ({
  historySnapshot: { ...state.historySnapshot, ...snapshot },
})),
```

**步骤 2：修改 `resetWorkflow` 时也重置 historySnapshot**

```typescript
// 在 resetWorkflow 中新增
historySnapshot: {},
```

**步骤 3：运行类型检查确认无错误**

运行：`npx tsc --noEmit --project apps/web/tsconfig.json`
预期：无新增类型错误

**步骤 4：Commit**

```bash
git add apps/web/store/useAppStore.ts
git commit -m "feat: Zustand store 新增 historySnapshot 字段，用于跨 step 历史展示数据"
```

---

### 任务 8：修改 `restoreProjectFlowFromSnapshot` 不再恢复完整 projectData

**文件：**
- 修改：`apps/web/pages/project-flow/projectFlowResumeSnapshot.ts:627-708`

**步骤 1：修改恢复逻辑**

```typescript
// 修改前（line 702）
updateProjectData(buildProjectDataFromResumeSnapshot(snapshot));

// 修改后
// 1. 恢复 historySnapshot
const historySnapshot = extractHistorySnapshotFromResume(snapshot);
updateHistorySnapshot(historySnapshot);

// 2. 不再恢复完整 projectData
// 各 step 数据在进入时按需从业务表 API 获取
```

**步骤 2：新增 `extractHistorySnapshotFromResume` 函数**

```typescript
function extractHistorySnapshotFromResume(snapshot: ProjectResumeSnapshot) {
  const persisted = snapshot.persistedWorkflowState;
  if (persisted?.historySnapshot) {
    return persisted.historySnapshot;
  }

  // 兼容旧数据：从 state 构建历史快照
  return {
    step1: {
      uploads: Object.entries(snapshot.state.uploadsBySlot).map(([slot, url]) => ({
        slot,
        label: slot,
        imageUrl: url ?? '',
      })),
      selectedOutfit: snapshot.state.outfitPlans?.find(p => p.id === snapshot.state.selectedOutfitPlanId),
      rolePreset: snapshot.state.step1RoleDirectionCards?.find(c => c.id === snapshot.state.step1SelectedRoleDirectionId),
    },
    step2: {
      characterReferences: snapshot.state.confirmedCharacterReferences ?? [],
    },
    step3: {
      scriptInfoList: snapshot.state.latestScript ? [{
        id: snapshot.state.latestScript.id,
        title: snapshot.state.latestScript.payload?.basicInfo?.title ?? '',
        durationSec: snapshot.state.latestScript.durationSec ?? 0,
        shotCount: snapshot.state.storyboardFrames?.length ?? 0,
        suitability: null,
        isSelected: true,
      }] : [],
      frameImages: (snapshot.state.storyboardFrames ?? []).map((frame: any) => ({
        index: frame.index,
        title: frame.title ?? `镜头 ${frame.index + 1}`,
        imageUrl: frame.imageUrl ?? '',
      })),
    },
    step4: {
      clips: (snapshot.state.latestVideoJob?.clipUrls ?? []).map((url: string, i: number) => ({
        index: i,
        title: `片段 ${i + 1}`,
        thumbnailUrl: url,
      })),
    },
  };
}
```

**步骤 3：运行类型检查确认无错误**

运行：`npx tsc --noEmit --project apps/web/tsconfig.json`
预期：无新增类型错误

**步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/projectFlowResumeSnapshot.ts
git commit -m "refactor: restoreProjectFlowFromSnapshot 改为恢复 historySnapshot，不再恢复完整 projectData"
```

---

### 任务 9：左侧历史面板数据源改为 historySnapshot

**文件：**
- 修改：`apps/web/components/project-flow/ProjectFlowHistorySidebar.tsx`
- 修改：各 step 页面组件中传递给 Sidebar 的数据

**步骤 1：修改 Sidebar 组件的数据来源**

```typescript
// 修改前：从 projectData 读取各 step 数据
// 修改后：从 historySnapshot 读取

// ProjectFlowHistorySidebar 组件的 props 改为接收 historySnapshot
export interface ProjectFlowHistorySidebarProps {
  currentStep: 2 | 3 | 4 | 5 | 6;
  historySnapshot: {
    step1?: { uploads: any[]; selectedOutfit?: any; rolePreset?: any };
    step2?: { characterReferences: any[] };
    step3?: { scriptInfoList: any[]; frameImages: any[] };
    step4?: { clips: any[]; music?: any };
  };
  children?: React.ReactNode;
  onImagePreview?: (frames: any[], currentIndex: number) => void;
  onVideoPreview?: (clips: any[], currentIndex: number) => void;
}
```

**步骤 2：更新各 step 页面中 Sidebar 的使用**

```typescript
// 在 ProjectLayout.tsx 或各 step 页面中
const { historySnapshot } = useAppStore();

<ProjectFlowHistorySidebar
  currentStep={currentStep}
  historySnapshot={historySnapshot}
  onImagePreview={...}
  onVideoPreview={...}
/>
```

**步骤 3：运行类型检查确认无错误**

运行：`npx tsc --noEmit --project apps/web/tsconfig.json`
预期：无新增类型错误

**步骤 4：Commit**

```bash
git add apps/web/components/project-flow/ProjectFlowHistorySidebar.tsx apps/web/pages/project-flow/*.tsx
git commit -m "refactor: 左侧历史面板数据源改为 historySnapshot"
```

---

### 阶段 4：清理

### 任务 10：清理 WorkflowState 表中的旧数据

**文件：**
- 修改：`src/routes/project-flow-route-handlers.ts`

**步骤 1：添加数据迁移兼容逻辑**

在 `getProjectResumeSnapshotRoute` 中，如果 `historySnapshot` 为空，从旧的 `projectData` 中提取数据构建 historySnapshot。

```typescript
// 在 getProjectResumeSnapshotRoute 中
let historySnapshot = persisted?.historySnapshot;
if (!historySnapshot && persisted?.projectData) {
  // 从旧 projectData 构建 historySnapshot（向后兼容）
  historySnapshot = buildHistorySnapshotFromLegacyProjectData(persisted.projectData);
}
```

```typescript
function buildHistorySnapshotFromLegacyProjectData(projectData: Record<string, unknown>) {
  return {
    step1: {
      uploads: projectData.uploads ?? [],
      selectedOutfit: projectData.selectedOutfitSource,
      rolePreset: projectData.step1RoleDirectionCards?.find(
        (c: any) => c.id === projectData.step1SelectedRoleDirectionId
      ),
    },
    step2: {
      characterReferences: projectData.step3CharacterReferencePool ?? [],
    },
    step3: {
      scriptInfoList: projectData.step3ScriptCandidateSnapshot?.items ?? [],
      frameImages: (projectData.script ?? []).map((s: any, i: number) => ({
        index: i,
        title: s.title ?? `镜头 ${i + 1}`,
        imageUrl: s.sceneImageUrl ?? '',
      })),
    },
    step4: {
      clips: projectData.step4VideoScenes ?? [],
      music: projectData.step4MusicPayload,
    },
  };
}
```

**步骤 2：运行类型检查确认无错误**

运行：`npx tsc --noEmit`
预期：无新增类型错误

**步骤 3：Commit**

```bash
git add src/routes/project-flow-route-handlers.ts
git commit -m "chore: 添加从旧 projectData 构建 historySnapshot 的向后兼容逻辑"
```

---

### 任务 11：最终验证和清理

**步骤 1：运行完整类型检查**

运行：`npm run build`
预期：前后端编译通过，无类型错误

**步骤 2：验证前端开发模式**

运行：`npm run dev`
预期：服务正常启动，无运行时错误

**步骤 3：Commit**

```bash
git add .
git commit -m "chore: 完成 Step1-Step5 存储方案改造，消除 WorkflowState 数据覆盖问题"
```

---

## 规格自检

1. **占位符扫描**：所有步骤都包含具体代码和文件路径，无"TODO"或"待定"
2. **内部一致性**：所有类型定义和函数签名保持一致，`historySnapshot` 结构在各处统一
3. **范围检查**：计划聚焦于存储方案改造，不包含无关重构
4. **模糊性检查**：所有改造点都已明确，包括删除的代码和新增的代码

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-04-16-step-storage-refactor.md`。两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
