# Step3 分镜预览阶段0进度反馈 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 Step3 分镜预览阶段0（专业提示词生成）期间，为帧卡片和底部控制栏提供直观的进度反馈。

**架构：** 从已有的 `globalTaskQueue` 数据双重推断阶段0状态（父任务 `stage` + `step3_shot_prompt` 子任务存在性），新增 `isPromptGenerating` prop 传递链：ScriptEditor → Step3GlobalControlBar / Step3CompactStoryboardCard → Step3PreviewCardRuntime。

**技术栈：** React 18, TypeScript, Tailwind CSS, material-icons-round

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|------|------|---------|
| `apps/web/pages/project-flow/ScriptEditor.tsx` | 计算 `isPromptGenerating` 状态并传递给子组件 | 修改 |
| `apps/web/pages/project-flow/step3-workspace/step3GlobalControlBar.tsx` | 新增阶段0按钮分支（蓝色加载状态） | 修改 |
| `apps/web/pages/project-flow/step3-workspace/step3PreviewCardRuntime.tsx` | 新增阶段0 spinner + 文案显示 | 修改 |
| `apps/web/pages/project-flow/step3CompactStoryboardCard.tsx` | 传递 `isPromptGenerating` prop | 修改 |

---

### 任务 1：ScriptEditor — 计算 isPromptGenerating 状态

**文件：**
- 修改：`apps/web/pages/project-flow/ScriptEditor.tsx:308-370`

- [ ] **步骤 1：在 ScriptEditor 的 globalTaskQueue useEffect 中添加阶段0判断逻辑**

在现有的 `useEffect` 中（约第 309-370 行），在 `const hasActiveBatch = runningBatch != null;` 之后，添加阶段0判断：

```typescript
// 判断阶段0（专业提示词生成）是否正在进行
// 双重判断：父任务 stage + step3_shot_prompt 子任务存在性
const isPromptGenerating = hasActiveBatch
  && (
    runningBatch?.stage === "生成提示词中"
    || globalTaskQueue.some(
      (t) => t.projectId === effectiveProjectId
        && t.type === "step3_shot_prompt"
        && (t.status === "running" || t.status === "pending"),
    )
  );
```

- [ ] **步骤 2：在 ScriptEditor 组件中添加 isPromptGenerating state**

在现有的 `step3BatchState` state 附近（约第 290 行附近），添加：

```typescript
const [isPromptGenerating, setIsPromptGenerating] = useState(false);
```

然后在步骤1的 useEffect 中，在 `setStep3BatchState(...)` 之后添加：

```typescript
setIsPromptGenerating(isPromptGenerating);
```

注意：`isPromptGenerating` 是 useEffect 内计算的局部变量，需要赋值给 state 以便在 render 中使用。因为 useEffect 已经依赖 `globalTaskQueue`，不需要额外 dependency。

- [ ] **步骤 3：将 isPromptGenerating 传递给 Step3GlobalControlBar**

在 `<Step3GlobalControlBar>` 组件调用处（约第 2677 行），添加新 prop：

```tsx
<Step3GlobalControlBar
  ...existing props...
  isPromptGenerating={isPromptGenerating}
/>
```

- [ ] **步骤 4：将 isPromptGenerating 传递给 Step3CompactStoryboardCard**

在 `<Step3CompactStoryboardCard>` 组件调用处（约第 2618 行），添加新 prop：

```tsx
<Step3CompactStoryboardCard
  ...existing props...
  isPromptGenerating={isPromptGenerating}
/>
```

- [ ] **步骤 5：验证编译无误**

运行：`npm --prefix apps/web run build:ui`
预期：编译成功，无类型错误

- [ ] **步骤 6：Commit**

```bash
git add apps/web/pages/project-flow/ScriptEditor.tsx
git commit -m "feat: ScriptEditor 计算 isPromptGenerating 状态并传递给子组件"
```

---

### 任务 2：Step3GlobalControlBar — 阶段0按钮分支

**文件：**
- 修改：`apps/web/pages/project-flow/step3-workspace/step3GlobalControlBar.tsx:5-32,197-209`

- [ ] **步骤 1：在 Step3GlobalControlBarProps 中添加 isPromptGenerating prop**

在接口定义中（约第 5-32 行），添加：

```typescript
/** 阶段0（专业提示词生成）是否正在进行 */
isPromptGenerating?: boolean;
```

- [ ] **步骤 2：在组件参数解构中接收 isPromptGenerating**

在组件函数参数解构中（约第 34-57 行），添加：

```typescript
isPromptGenerating = false,
```

- [ ] **步骤 3：添加阶段0按钮分支**

在现有的 `batchBusy` 判断之后（约第 65 行），在条件渲染链中添加 `isPromptGenerating` 分支。

现有的条件渲染链（约第 173-209 行）：
```
isScriptLoading → 蓝色"生成脚本中..."
isConfirmingLock → 紫色"确认中..."
batchBusy → 橙色"生成中 (x/y)"
正常按钮 → 主色按钮
```

在 `isScriptLoading` 和 `isConfirmingLock` 之间插入 `isPromptGenerating` 分支：

```tsx
) : isPromptGenerating ? (
  /* 阶段0：生成专业提示词中 */
  <button
    type="button"
    disabled
    data-testid="step3-prompt-generating"
    title="正在生成专业提示词，请稍候..."
    aria-label="生成提示词中"
    className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-5 text-xs font-semibold text-blue-700 cursor-wait"
  >
    <span className="material-icons-round text-sm shrink-0 animate-spin">sync</span>
    <span>生成提示词中...</span>
  </button>
```

- [ ] **步骤 4：验证编译无误**

运行：`npm --prefix apps/web run build:ui`
预期：编译成功，无类型错误

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/step3-workspace/step3GlobalControlBar.tsx
git commit -m "feat: step3GlobalControlBar 新增阶段0蓝色加载状态按钮"
```

---

### 任务 3：Step3PreviewCardRuntime — 阶段0 spinner + 文案

**文件：**
- 修改：`apps/web/pages/project-flow/step3-workspace/step3PreviewCardRuntime.tsx:109-127,241-256`

- [ ] **步骤 1：在 Step3PreviewCardRuntime props 中添加 isPromptGenerating**

在组件 props 接口定义中（约第 109-127 行），在 `errorMessage` 后添加：

```typescript
/** 阶段0（专业提示词生成）是否正在进行 */
isPromptGenerating?: boolean;
```

- [ ] **步骤 2：在组件参数解构中接收 isPromptGenerating**

在组件函数参数解构中（约第 127-141 行），在 `errorMessage = null,` 后添加：

```typescript
isPromptGenerating = false,
```

- [ ] **步骤 3：修改空白卡片区域的条件渲染，添加阶段0 spinner 分支**

现有的空白卡片渲染逻辑（约第 241-256 行）：
```tsx
) : (
  <div data-testid="step3-preview-card-empty" ...>
    <span className="material-icons-round text-4xl text-slate-300">
      {isGenerating ? "hourglass_top" : "image"}
    </span>
    <div className="text-sm font-semibold text-slate-500">
      {isGenerating ? "镜头主图生成中" : viewModel.previewStatusText}
    </div>
    <div className="text-xs leading-5 text-slate-400">
      {isGenerating ? "正在基于当前镜头配置生成候选图。" : "可双击预览，或拖入 / 上传替换图片。"}
    </div>
  </div>
)
```

改为：

```tsx
) : isPromptGenerating ? (
  <div
    data-testid="step3-preview-card-prompt-generating"
    className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
  >
    <span className="material-icons-round text-4xl text-blue-400 animate-spin">sync</span>
    <div className="text-sm font-semibold text-blue-600">正在生成专业提示词...</div>
    <div className="text-xs leading-5 text-blue-400/80">提示词完成后将自动开始生图</div>
  </div>
) : (
  <div data-testid="step3-preview-card-empty" ...>
    ...existing content unchanged...
  </div>
)
```

注意：这个分支在 `errorMessage` 和 空白状态之间插入，整体条件链变为：
```
previewImageUrl → 显示图片
errorMessage → 显示错误面板
isPromptGenerating → 显示蓝色 spinner + 文案
else → 显示原始空白状态
```

- [ ] **步骤 4：验证编译无误**

运行：`npm --prefix apps/web run build:ui`
预期：编译成功，无类型错误

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/step3-workspace/step3PreviewCardRuntime.tsx
git commit -m "feat: step3PreviewCardRuntime 新增阶段0 spinner + 文案显示"
```

---

### 任务 4：Step3CompactStoryboardCard — 传递 isPromptGenerating prop

**文件：**
- 修改：`apps/web/pages/project-flow/step3CompactStoryboardCard.tsx:9-37,43-65,114-126`

- [ ] **步骤 1：在 Step3CompactStoryboardCardProps 中添加 isPromptGenerating prop**

在接口定义中（约第 9-37 行），在 `previewErrorMessage` 后添加：

```typescript
/** 阶段0（专业提示词生成）是否正在进行 */
isPromptGenerating?: boolean;
```

- [ ] **步骤 2：在组件参数解构中接收 isPromptGenerating**

在组件函数参数解构中（约第 43-65 行），在 `previewErrorMessage = null,` 后添加：

```typescript
isPromptGenerating = false,
```

- [ ] **步骤 3：将 isPromptGenerating 传递给 Step3PreviewCardRuntime**

在 `<Step3PreviewCardRuntime>` 调用处（约第 114-126 行），在 `isConfirmingLock={isConfirmingLock}` 后添加：

```tsx
<Step3PreviewCardRuntime
  ...existing props...
  isConfirmingLock={isConfirmingLock}
  isPromptGenerating={isPromptGenerating}
/>
```

- [ ] **步骤 4：验证编译无误**

运行：`npm --prefix apps/web run build:ui`
预期：编译成功，无类型错误

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/step3CompactStoryboardCard.tsx
git commit -m "feat: Step3CompactStoryboardCard 传递 isPromptGenerating 到 PreviewCardRuntime"
```

---

### 任务 5：功能验证

- [ ] **步骤 1：启动前端开发服务**

运行：`npm --prefix apps/web run dev`

- [ ] **步骤 2：启动后端开发服务**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`

- [ ] **步骤 3：在浏览器中测试**

1. 打开一个已有脚本的项目 Step3 页面
2. 点击"生成分镜预览"按钮
3. 验证：底部按钮变为蓝色"生成提示词中..."状态
4. 验证：每帧卡片显示蓝色 spinner + "正在生成专业提示词..."
5. 等待提示词生成完成
6. 验证：底部按钮自动切换为橙色"生成中 (0/N)"
7. 验证：帧卡片 spinner 消失，切换到模拟进度条

- [ ] **步骤 6：Commit（如有调整）**

如有视觉样式微调，单独 commit：

```bash
git commit -m "fix: 阶段0进度反馈样式微调"
```