# 广场反推"投入创作"流程重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将广场反推结果的"投入创作"流程从直接跳 Step3 改为从 Step1 开始，携带脚本 ID 经过完整的 Step1→Step2→Step3 流水线，在创建项目时自动关联脚本，Step3 自动识别并使用该脚本（跳过脚本生成器），直接锁定。

**架构：** 
- 前端：Square 页面点击"投入创作"时携带 `reverseDeckScriptId` 跳转 `/create/new/step1`，Layout 组件接收该 ID 并通过 `pendingReverseDeckScript` 存到 projectData 中
- 项目创建：首次 `saveProjectWorkflowState` 时后端记录 `reverseDeckScriptId` 关联
- Step3：检测到 `pendingReverseDeckScript` 后，跳过脚本生成器，直接将反推脚本作为唯一候选，用 Step1/Step2 获取的服饰和角色信息进行脚本重写（如有），然后直接锁定

**技术栈：** React 18 + Zustand, Fastify 5, TypeScript, PostgreSQL

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `apps/web/pages/square/Square.tsx:1264-1280` | 修改 | "投入创作"按钮逻辑：改为携带 scriptId 跳转 Step1 |
| `apps/web/components/Layout.tsx:363-397` | 修改 | `startNewProject` 接收 `pendingReverseDeckScript` 并传递到 Step1 |
| `apps/web/store/useAppStore.ts` | 修改 | WorkflowState 增加 `reverseDeckScriptId` 字段 |
| `apps/web/pages/project-flow/ScriptEditor.tsx:907-993` | 修改 | Step3 导入逻辑：检测 `pendingReverseDeckScript`，跳过生成器，直接锁定 |
| `apps/web/pages/project-flow/ProjectLayout.tsx` | 修改 | 进入 Step3 前检查 `pendingReverseDeckScript` 并传递 |
| `src/routes/project-flow-route-handlers.ts` | 修改 | 工作流状态持久化时保留 `pendingReverseDeckScript` |
| `apps/web/pages/square/squareReverseDeckSnapshot.ts` | 修改 | `SquareReverseDeckSnapshot` 增加 `libraryScriptId` 字段 |

---

### 任务 1：反推快照增加 scriptId 字段

**文件：**
- 修改：`apps/web/pages/square/squareReverseDeckSnapshot.ts:4-28`

- [ ] **步骤 1：在 SquareReverseDeckSnapshot 接口增加 libraryScriptId 字段**

```typescript
export interface SquareReverseDeckSnapshot {
  updatedAt: number;
  title: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  /** 反推生成的脚本在脚本库中的 ID，用于"投入创作"流程 */
  libraryScriptId: string | null;
  keywords: string[];
  scriptText: string;
  // ... 其余字段不变
}
```

- [ ] **步骤 2：在 applyReverseParseResultToDeck 中设置 libraryScriptId**

在 `apps/web/pages/square/Square.tsx` 的 `applyReverseParseResultToDeck` 函数中，构建 snapshot 时添加：

```typescript
const snapshot: SquareReverseDeckSnapshot = {
  updatedAt: Date.now(),
  title: resolveSquareReverseDeckTitle({ ... }),
  sourceTitle,
  sourceUrl,
  libraryScriptId: parsed.libraryScriptId ?? parsed.libraryScript?.id ?? null,
  // ... 其余字段不变
};
```

运行：`npm run build` 确认无编译错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/square/squareReverseDeckSnapshot.ts apps/web/pages/square/Square.tsx
git commit -m "feat: 反推快照增加 libraryScriptId 字段，用于投入创作流程"
```

---

### 任务 2：前端 WorkflowState 增加 pendingReverseDeckScript

**文件：**
- 修改：`apps/web/store/useAppStore.ts` — 在 WorkflowState 接口增加字段

- [ ] **步骤 1：在 WorkflowState 接口增加字段**

找到 `WorkflowState` 接口定义，添加：

```typescript
interface WorkflowState {
  // ... 现有字段
  reverseDeckScriptId: string | null;
  // ...
}
```

- [ ] **步骤 2：在 resetWorkflow 中重置该字段**

找到 `resetWorkflow` 函数，确保包含：

```typescript
reverseDeckScriptId: null,
```

运行：`npm run build` 确认无编译错误

- [ ] **步骤 3：Commit**

```bash
git add apps/web/store/useAppStore.ts
git commit -m "feat: WorkflowState 增加 reverseDeckScriptId 字段"
```

---

### 任务 3：修改"投入创作"按钮逻辑

**文件：**
- 修改：`apps/web/pages/square/Square.tsx:1264-1280`
- 修改：`apps/web/components/Layout.tsx:363-397`

- [ ] **步骤 1：修改 handleSendSnapshotToStep3 函数**

```typescript
const handleSendSnapshotToStep3 = () => {
  if (!reverseDeckSnapshot) {
    return;
  }
  setSelectedProjectId(null);
  resetWorkflow();
  resetProjectData();
  
  // 关键变更：不再直接跳 Step3，而是携带 scriptId 跳 Step1
  useAppStore.getState().setGlobalTimerStart();
  useAppStore.getState().updateProjectData({
    pendingReverseDeckScript: {
      libraryScriptId: reverseDeckSnapshot.libraryScriptId,
      title: reverseDeckSnapshot.title || "反推脚本",
      content: reverseDeckSnapshot.scriptText || "暂无文案内容",
      segments: reverseDeckSnapshot.segments ?? [],
    },
  });
  
  navigate('/create/new/step1');
};
```

- [ ] **步骤 2：修改 Layout.tsx 的 startNewProject 函数**

在 `startNewProject` 函数中，检测 `projectData.pendingReverseDeckScript` 并传递通知：

```typescript
const startNewProject = (projectFlowKind: ProjectFlowKind = "video") => {
  setSidebarCollapsed(true);
  clearProjectFlowActiveSession();
  const pendingStoryboardImport = projectData.pendingStoryboardImport ?? null;
  const pendingReverseDeckScript = projectData.pendingReverseDeckScript ?? null;
  setSelectedProjectId(null);
  resetWorkflow();
  resetProjectData();

  useAppStore.getState().setGlobalTimerStart();

  if (projectFlowKind === "image") {
    updateProjectData({ projectFlowKind });
    navigate('/image-create/new/step1');
    return;
  }

  // 新增：处理反推脚本导入
  if (pendingReverseDeckScript) {
    updateProjectData({
      projectFlowKind,
      pendingReverseDeckScript,
    });
    navigate('/create/new/step1');
    return;
  }

  // ... 其余不变
};
```

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/square/Square.tsx apps/web/components/Layout.tsx
git commit -m "refactor: 投入创作改为从 Step1 开始，携带反推脚本数据"
```

---

### 任务 4：后端持久化保留 pendingReverseDeckScript

**文件：**
- 修改：`src/routes/project-flow-route-handlers.ts:143-210` — `buildProjectStepState` 函数

- [ ] **步骤 1：在 step3 的 pick 列表中添加 pendingReverseDeckScript**

```typescript
step3: pickProjectStepState(projectData, [
  "script",
  "step3OriginalScriptSegments",
  "step3RewrittenScriptSegments",
  "step3RewriteMeta",
  "pendingScriptImport",
  "pendingReverseDeckScript",  // 新增
  "step3CharacterReferencePool",
  // ... 其余不变
]),
```

- [ ] **步骤 2：在 saveProjectWorkflowStateRoute 中保存关联信息**

当 `projectData.pendingReverseDeckScript` 存在时，记录 `reverseDeckScriptId` 关联。找到 `saveProjectWorkflowStateRoute` 函数，在保存工作流状态后添加：

```typescript
// 如果存在反推脚本关联，记录到项目的扩展字段中
const pendingReverseDeckScript = projectData?.pendingReverseDeckScript;
if (pendingReverseDeckScript && typeof pendingReverseDeckScript === "object") {
  const reverseDeckScriptId = (pendingReverseDeckScript as { libraryScriptId?: string }).libraryScriptId;
  if (reverseDeckScriptId) {
    // 更新项目的 script关联（复用现有 script 关联表或直接存到 workflow）
    await ctx.projectService.updateProjectMeta(user, params.projectId, {
      reverseDeckScriptId,
    });
  }
}
```

如果 `updateProjectMeta` 不存在，直接在 `nrm_project_workflow_states` 的 workflow JSON 中保存即可，无需新建表。

运行：`npm run build` 确认无编译错误

- [ ] **步骤 3：Commit**

```bash
git add src/routes/project-flow-route-handlers.ts
git commit -m "feat: 后端持久化保留 pendingReverseDeckScript 并记录脚本关联"
```

---

### 任务 5：Step3 检测并使用 pendingReverseDeckScript

**文件：**
- 修改：`apps/web/pages/project-flow/ScriptEditor.tsx:907-993` — 导入逻辑 useEffect

- [ ] **步骤 1：在导入 useEffect 中增加 pendingReverseDeckScript 检测**

在现有的 `importedStoryboard` 和 `importedScript` 逻辑之后，添加 `pendingReverseDeckScript` 处理：

```typescript
useEffect(() => {
  const routeState = (location.state ?? null) as { ... } | null;
  // ... 现有 importedStoryboard 和 importedScript 逻辑不变 ...

  // 新增：处理从广场反推"投入创作"携带的脚本
  const pendingReverseDeckScript = projectData.pendingReverseDeckScript;
  if (pendingReverseDeckScript && !importedStoryboard && !imported) {
    const segments = Array.isArray(pendingReverseDeckScript.segments)
      ? pendingReverseDeckScript.segments
      : [];
    const content = (typeof pendingReverseDeckScript.content === "string"
      ? pendingReverseDeckScript.content.trim()
      : "") || buildFullScriptDraftFromSegments(segments).trim();

    if (!content && segments.length < 1) {
      updateProjectData({ pendingReverseDeckScript: null });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    // 直接使用反推脚本作为 segments，跳过脚本生成器
    const nextSegments = segments.length > 0
      ? segments
      : mergeTextToSegments(content, []);

    setSegments(nextSegments);
    setFullScriptDraft(content);
    markStep3StoryboardCueScriptSource("reverse_deck");

    // 将反推脚本作为唯一候选并自动选中
    const importedCandidate = buildStep3ImportedStoryboardCandidate({
      sourceLibraryId: pendingReverseDeckScript.libraryScriptId ?? undefined,
      title: pendingReverseDeckScript.title ?? "反推脚本",
      segments: nextSegments,
    });
    setImportedStoryboardCandidate(importedCandidate);
    setSelectedCandidateId(importedCandidate.id);

    updateProjectData({
      script: nextSegments,
      pendingReverseDeckScript: null,  // 清除，避免重复导入
    });

    setFeedback(`已导入广场反推脚本：${pendingReverseDeckScript.title || "未命名"}`);
    navigate(location.pathname, { replace: true, state: null });
    return;
  }
}, [
  location.pathname,
  location.state,
  navigate,
  projectData.pendingStoryboardImport,
  projectData.pendingReverseDeckScript,  // 新增依赖
  // ... 其余依赖不变
]);
```

- [ ] **步骤 2：在 step3FullScriptDraft 中增加 reverse_deck 来源**

找到 `markStep3StoryboardCueScriptSource` 的调用位置，确认 `"reverse_deck"` 是一个合法的值。如果不是，需要在对应的类型定义中添加。

- [ ] **步骤 3：确保 importedStoryboardCandidate 被自动锁定**

检查 `buildStep3ImportedStoryboardCandidate` 函数，确认当存在 `importedStoryboardCandidate` 时，候选列表只包含该候选且自动选中。现有逻辑（第 831-869 行）已处理此场景：

```typescript
const base = importedStoryboardCandidate ? [importedStoryboardCandidate] : step3CandidateFeed;
```

这意味着 `importedStoryboardCandidate` 存在时，它会被自动设为选中状态，且用户无法切换到其他候选。

运行：`npm run build` 确认无编译错误

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/ScriptEditor.tsx
git commit -m "feat: Step3 检测 pendingReverseDeckScript 并直接导入反推脚本"
```

---

### 任务 6：添加前端类型定义

**文件：**
- 修改：`apps/web/store/useAppStore.ts` — 在 ProjectData 相关类型中添加

- [ ] **步骤 1：定义 PendingReverseDeckScript 类型**

在 `useAppStore.ts` 或单独的类型文件中添加：

```typescript
interface PendingReverseDeckScript {
  /** 脚本库 ID */
  libraryScriptId: string | null;
  /** 脚本标题 */
  title: string;
  /** 脚本全文内容 */
  content: string;
  /** 分段数据 */
  segments: Array<{
    time: string;
    title: string;
    content: string;
    visualCue: string;
  }>;
}
```

- [ ] **步骤 2：在 ProjectData 类型中添加字段**

```typescript
interface ProjectData {
  // ... 现有字段
  pendingReverseDeckScript?: PendingReverseDeckScript | null;
}
```

- [ ] **步骤 3：Commit**

```bash
git add apps/web/store/useAppStore.ts
git commit -m "types: 添加 PendingReverseDeckScript 类型定义"
```

---

### 任务 7：端到端验证

- [ ] **步骤 1：验证完整流程**

手动测试以下流程：
1. 广场页面进行视频反推
2. 反推完成后查看反推结果卡片
3. 点击"投入创作"按钮
4. 确认跳转到 `/create/new/step1`（服装上传页）
5. 完成 Step1：上传服装 → 获取搭配推荐 → 选择搭配
6. 进入 Step2：角色定妆 → 确认角色
7. 进入 Step3：确认自动加载了反推脚本（不显示脚本生成器）
8. 确认反推脚本被锁定（不可切换）
9. 继续 Step4 分镜 → 确认正常生成

- [ ] **步骤 2：验证持久化**

完成 Step1 后刷新页面，确认：
- `pendingReverseDeckScript` 数据在 localStorage 中保留
- 刷新后仍能从 Step1 继续完成流程

- [ ] **步骤 3：验证边界情况**

- 反推结果没有 scriptId 时的行为（应该仍然正常导入，只是没有关联 ID）
- 用户在 Step1 中途关闭项目后重新进入

---

### 任务 8：清理旧逻辑

**文件：**
- 修改：`apps/web/pages/square/Square.tsx:1264-1280` — 删除旧的直接跳 Step3 逻辑
- 修改：`apps/web/pages/project-flow/ScriptEditor.tsx` — 清理不再需要的旧 `importedScript` 逻辑（如果与新模式冲突）

- [ ] **步骤 1：删除旧的 handleSendSnapshotToStep3 直接导航到 Step3 的逻辑**

旧逻辑已被新逻辑替代，确认删除或注释掉不再使用的 `/create/new/step3` 直接导航代码。

- [ ] **步骤 2：Commit**

```bash
git add apps/web/pages/square/Square.tsx apps/web/pages/project-flow/ScriptEditor.tsx
git commit -m "refactor: 清理旧的直接跳 Step3 导入逻辑"
```

---

## 自检

### 1. 规格覆盖度

| 需求 | 对应任务 |
|------|---------|
| 携带脚本 ID 到 Step1 | 任务 1, 3 |
| 创建项目后存储关联脚本信息 | 任务 4 |
| Step1 → Step2 正常流程 | 不修改（现有流程不变） |
| Step3 识别带入脚本，不用生成器 | 任务 5 |
| 用带入脚本直接锁定 | 任务 5（复用 importedStoryboardCandidate 锁定机制） |
| 后续与新项目一样生成分镜 | 不修改（Step4+ 流程不变） |

### 2. 占位符扫描

计划中无 "TODO"、"待定"、"类似任务 N" 等占位符。每个步骤包含具体代码和预期结果。

### 3. 类型一致性

- `pendingReverseDeckScript` 类型在任务 6 中统一定义
- `libraryScriptId` 在任务 1 和任务 2 中保持一致
- `importedStoryboardCandidate` 复用现有机制，类型已定义
- `markStep3StoryboardCueScriptSource("reverse_deck")` 需确认类型枚举值，如有需要需在任务 5 步骤 2 中补充
