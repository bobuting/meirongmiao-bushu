# 管理后台与系统参数整合 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 合并管理后台的两个配置 API 为一个，统一类型定义，精简前端状态管理，按业务域重新组织 Tab 结构。

**架构：** 后端删除独立的 CharacterWorkflowSystemSettings API，将字段合并到 AdminConfig；前端删除独立 draft 状态，统一使用 globalDraft；Tab 结构精简为 6 个，卡片按业务域重新归属。

**技术栈：** Node.js + Fastify 5 + TypeScript（后端），React 18 + TypeScript + TanStack Query（前端）

---

## 文件结构

### 后端文件

| 文件 | 职责 | 改动类型 |
|------|------|----------|
| `src/contracts/character-workflow-system-settings.ts` | 工作流配置类型定义 | 废弃标记 |
| `src/routes/admin-routes.ts` | 管理后台路由 | 删除废弃路由 |
| `src/core/config.ts` | 默认配置值 | 添加字段默认值 |
| `src/modules/admin-config-service.ts` | 配置服务 | 确保字段包含 |

### 前端文件

| 文件 | 职责 | 改动类型 |
|------|------|----------|
| `apps/web/pages/admin/SystemSettings.tsx` | 管理后台页面 | 简化状态管理 |
| `apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx` | 全局配置面板 | 扩展卡片配置 |
| `apps/web/pages/admin/adminSystemSettingsSurface.ts` | 配置操作封装 | 简化函数 |
| `apps/web/services/realApi/admin.ts` | 管理后台 API | 删除废弃方法 |
| `apps/web/services/backendApi.ts` | 后端 API 封装 | 删除废弃方法 |
| `apps/web/services/backendApi.squareAdminLibrary.ts` | API 方法映射 | 删除废弃映射 |

---

## 任务 1：后端 - 添加默认配置值

**文件：**
- 修改：`src/core/config.ts`

- [ ] **步骤 1：添加 CharacterWorkflow 字段到默认配置**

在 `DEFAULT_RUNTIME_CONFIG` 对象中添加工作流相关字段的默认值：

```typescript
// 在 DEFAULT_RUNTIME_CONFIG 对象中添加以下字段（位于现有字段后）
step1AutoReverseOnConfirm: false,
step1HideVisualRecommendationCards: false,
step1RoleDirectionCount: 3,
step2AutoGenerateOnEnter: true,
step2SelectedRoleDirectionPanelVisible: true,
step2ImageToImagePanelVisible: true,
step2PromptImage1Mode: "code",
step2PromptImage2Mode: "llm",
step2PromptImage3Mode: "llm",
step3CompactStoryboardPanelEnabled: false,
step4AutoGenerateOnEnter: true,
```

- [ ] **步骤 2：验证后端编译**

运行：`npm run build`
预期：编译通过，无类型错误

- [ ] **步骤 3：Commit**

```bash
git add src/core/config.ts
git commit -m "feat(config): add CharacterWorkflow fields to default config"
```

---

## 任务 2：后端 - 删除废弃路由

**文件：**
- 修改：`src/routes/admin-routes.ts`

- [ ] **步骤 1：删除 CharacterWorkflowSystemSettings 路由**

找到并删除以下两个路由处理器：

1. `app.get("/admin/system-settings/character-workflow", ...)` - 整个处理函数
2. `app.put("/admin/system-settings/character-workflow", ...)` - 整个处理函数

- [ ] **步骤 2：删除相关导入（如有单独导入）**

检查文件顶部，删除任何仅用于已删除路由的导入，如 `CharacterWorkflowSystemSettings` 类型导入（如果不再使用）。

- [ ] **步骤 3：验证后端编译**

运行：`npm run build`
预期：编译通过

- [ ] **步骤 4：Commit**

```bash
git add src/routes/admin-routes.ts
git commit -m "refactor(admin): remove deprecated CharacterWorkflowSystemSettings routes"
```

---

## 任务 3：后端 - 标记废弃类型

**文件：**
- 修改：`src/contracts/character-workflow-system-settings.ts`

- [ ] **步骤 1：添加废弃注释**

在文件顶部添加废弃说明：

```typescript
/**
 * @deprecated 此类型已废弃，所有字段已合并到 AdminConfig。
 * 请使用 src/modules/admin-config-service.ts 中的 AdminConfig 类型。
 * 此文件将在后续版本中删除。
 */
```

- [ ] **步骤 2：验证后端编译**

运行：`npm run build`
预期：编译通过

- [ ] **步骤 3：Commit**

```bash
git add src/contracts/character-workflow-system-settings.ts
git commit -m "deprecated: mark CharacterWorkflowSystemSettings as deprecated"
```

---

## 任务 4：前端 - 删除废弃 API 类型定义

**文件：**
- 修改：`apps/web/services/realApi/admin.ts`

- [ ] **步骤 1：删除 adminCharacterWorkflowSystemSettingsGet 类型定义**

找到 `RealAdminApi` 接口，删除以下方法签名：

```typescript
adminCharacterWorkflowSystemSettingsGet(token: string): Promise<{
  step1AutoReverseOnConfirm: boolean;
  step1HideVisualRecommendationCards: boolean;
  step1RoleDirectionCount: number;
  step2AutoGenerateOnEnter: boolean;
  step2SelectedRoleDirectionPanelVisible: boolean;
  step2ImageToImagePanelVisible: boolean;
  step2PromptImage1Mode: string;
  step2PromptImage2Mode: string;
  step2PromptImage3Mode: string;
  step3CompactStoryboardPanelEnabled: boolean;
  step4AutoGenerateOnEnter: boolean;
}>;
```

- [ ] **步骤 2：删除 adminCharacterWorkflowSystemSettingsPut 类型定义**

删除以下方法签名：

```typescript
adminCharacterWorkflowSystemSettingsPut(
  token: string,
  payload: Partial<{
    step1AutoReverseOnConfirm: boolean;
    step1HideVisualRecommendationCards: boolean;
    step1RoleDirectionCount: number;
    step2AutoGenerateOnEnter: boolean;
    step2SelectedRoleDirectionPanelVisible: boolean;
    step2ImageToImagePanelVisible: boolean;
    step2PromptImage1Mode: string;
    step2PromptImage2Mode: string;
    step2PromptImage3Mode: string;
    step3CompactStoryboardPanelEnabled: boolean;
    step4AutoGenerateOnEnter: boolean;
  }>,
): Promise<{ ok: boolean }>;
```

- [ ] **步骤 3：删除 API 实现**

在 `realAdminApi` 对象中删除以下两个方法实现：

1. `adminCharacterWorkflowSystemSettingsGet(token: string) { ... }`
2. `adminCharacterWorkflowSystemSettingsPut(token: string, payload: ...) { ... }`

- [ ] **步骤 4：验证前端编译**

运行：`cd apps/web && npm run build`
预期：编译通过

- [ ] **步骤 5：Commit**

```bash
git add apps/web/services/realApi/admin.ts
git commit -m "refactor(api): remove deprecated CharacterWorkflowSystemSettings API methods"
```

---

## 任务 5：前端 - 删除 backendApi 废弃方法

**文件：**
- 修改：`apps/web/services/backendApi.ts`
- 修改：`apps/web/services/backendApi.squareAdminLibrary.ts`

- [ ] **步骤 1：删除 backendApi.ts 中的方法**

找到并删除以下内容：

1. 在 `METHOD_CATEGORY` 对象中删除：
   ```typescript
   adminCharacterWorkflowSystemSettingsGet: "admin",
   adminCharacterWorkflowSystemSettingsPut: "admin",
   ```

2. 在 `mockBackendApi` 对象中删除两个方法实现：
   - `async adminCharacterWorkflowSystemSettingsGet(token: string) { ... }`
   - `async adminCharacterWorkflowSystemSettingsPut(token: string, payload: ...) { ... }`

- [ ] **步骤 2：删除 backendApi.squareAdminLibrary.ts 中的映射**

找到并删除以下内容：

1. 在 `SquareAdminLibraryApiMethodName` 类型中删除：
   ```typescript
   | "adminCharacterWorkflowSystemSettingsGet"
   | "adminCharacterWorkflowSystemSettingsPut"
   ```

2. 在 `SQUARE_ADMIN_LIBRARY_API_METHODS` 数组中删除：
   ```typescript
   "adminCharacterWorkflowSystemSettingsGet",
   "adminCharacterWorkflowSystemSettingsPut",
   ```

3. 在 `squareAdminLibraryApi` 对象中删除：
   ```typescript
   adminCharacterWorkflowSystemSettingsGet: (...args) => routeApiCall("adminCharacterWorkflowSystemSettingsGet", args),
   adminCharacterWorkflowSystemSettingsPut: (...args) => routeApiCall("adminCharacterWorkflowSystemSettingsPut", args),
   ```

- [ ] **步骤 3：验证前端编译**

运行：`cd apps/web && npm run build`
预期：编译通过

- [ ] **步骤 4：Commit**

```bash
git add apps/web/services/backendApi.ts apps/web/services/backendApi.squareAdminLibrary.ts
git commit -m "refactor(api): remove deprecated CharacterWorkflowSystemSettings from backendApi"
```

---

## 任务 6：前端 - 更新 AdminConfig 类型

**文件：**
- 修改：`apps/web/services/realApi/admin.ts`

- [ ] **步骤 1：添加 CharacterWorkflow 字段到 AdminConfig 接口**

在 `AdminConfig` 接口中添加以下字段：

```typescript
// CharacterWorkflow 字段
step1AutoReverseOnConfirm: boolean;
step1HideVisualRecommendationCards: boolean;
step1RoleDirectionCount: number;
step2AutoGenerateOnEnter: boolean;
step2SelectedRoleDirectionPanelVisible: boolean;
step2ImageToImagePanelVisible: boolean;
step2PromptImage1Mode: "code" | "llm";
step2PromptImage2Mode: "code" | "llm";
step2PromptImage3Mode: "code" | "llm";
step3CompactStoryboardPanelEnabled: boolean;
step4AutoGenerateOnEnter: boolean;
```

- [ ] **步骤 2：验证前端编译**

运行：`cd apps/web && npm run build`
预期：编译通过

- [ ] **步骤 3：Commit**

```bash
git add apps/web/services/realApi/admin.ts
git commit -m "feat(types): add CharacterWorkflow fields to AdminConfig interface"
```

---

## 任务 7：前端 - 扩展全局配置面板卡片

**文件：**
- 修改：`apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx`

- [ ] **步骤 1：添加 CharacterWorkflow 字段到 Draft 类型**

在 `AdminGlobalSystemSettingsDraft` 接口中添加：

```typescript
// CharacterWorkflow 字段
step1AutoReverseOnConfirm: boolean;
step1HideVisualRecommendationCards: boolean;
step1RoleDirectionCount: number;
step2AutoGenerateOnEnter: boolean;
step2SelectedRoleDirectionPanelVisible: boolean;
step2ImageToImagePanelVisible: boolean;
step2PromptImage1Mode: "code" | "llm";
step2PromptImage2Mode: "code" | "llm";
step2PromptImage3Mode: "code" | "llm";
step3CompactStoryboardPanelEnabled: boolean;
step4AutoGenerateOnEnter: boolean;
```

- [ ] **步骤 2：添加默认值到 ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS**

```typescript
// CharacterWorkflow 默认值
step1AutoReverseOnConfirm: false,
step1HideVisualRecommendationCards: false,
step1RoleDirectionCount: 3,
step2AutoGenerateOnEnter: true,
step2SelectedRoleDirectionPanelVisible: true,
step2ImageToImagePanelVisible: true,
step2PromptImage1Mode: "code",
step2PromptImage2Mode: "llm",
step2PromptImage3Mode: "llm",
step3CompactStoryboardPanelEnabled: false,
step4AutoGenerateOnEnter: true,
```

- [ ] **步骤 3：更新 Tab 分类定义**

修改 `AdminSystemSettingsTabKey` 类型：

```typescript
export type AdminSystemSettingsTabKey =
  | "all"
  | "system"
  | "scheduler"
  | "generation"
  | "hottrend"
  | "workflow";
```

更新 `GLOBAL_CATEGORY_META`，删除 `recommend` 分类。

- [ ] **步骤 4：移动卡片配置**

1. 找到 `video-music` 卡片，将其 `category` 从 `"recommend"` 改为 `"system"`
2. 找到 `recommend-function` 卡片，将其 `category` 从 `"recommend"` 改为 `"hottrend"`
3. 找到 `reverse-switches` 卡片，将其 `category` 从 `"recommend"` 改为 `"workflow"`

- [ ] **步骤 5：更新 buildAdminGlobalSystemSettingsDraft 函数**

添加新字段的处理逻辑：

```typescript
step1AutoReverseOnConfirm:
  typeof source?.step1AutoReverseOnConfirm === "boolean"
    ? source.step1AutoReverseOnConfirm
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step1AutoReverseOnConfirm,
step1HideVisualRecommendationCards:
  typeof source?.step1HideVisualRecommendationCards === "boolean"
    ? source.step1HideVisualRecommendationCards
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step1HideVisualRecommendationCards,
step1RoleDirectionCount:
  typeof source?.step1RoleDirectionCount === "number"
    ? source.step1RoleDirectionCount
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step1RoleDirectionCount,
step2AutoGenerateOnEnter:
  typeof source?.step2AutoGenerateOnEnter === "boolean"
    ? source.step2AutoGenerateOnEnter
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step2AutoGenerateOnEnter,
step2SelectedRoleDirectionPanelVisible:
  typeof source?.step2SelectedRoleDirectionPanelVisible === "boolean"
    ? source.step2SelectedRoleDirectionPanelVisible
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step2SelectedRoleDirectionPanelVisible,
step2ImageToImagePanelVisible:
  typeof source?.step2ImageToImagePanelVisible === "boolean"
    ? source.step2ImageToImagePanelVisible
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step2ImageToImagePanelVisible,
step2PromptImage1Mode:
  source?.step2PromptImage1Mode === "llm" || source?.step2PromptImage1Mode === "code"
    ? source.step2PromptImage1Mode
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step2PromptImage1Mode,
step2PromptImage2Mode:
  source?.step2PromptImage2Mode === "llm" || source?.step2PromptImage2Mode === "code"
    ? source.step2PromptImage2Mode
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step2PromptImage2Mode,
step2PromptImage3Mode:
  source?.step2PromptImage3Mode === "llm" || source?.step2PromptImage3Mode === "code"
    ? source.step2PromptImage3Mode
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step2PromptImage3Mode,
step3CompactStoryboardPanelEnabled:
  typeof source?.step3CompactStoryboardPanelEnabled === "boolean"
    ? source.step3CompactStoryboardPanelEnabled
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step3CompactStoryboardPanelEnabled,
step4AutoGenerateOnEnter:
  typeof source?.step4AutoGenerateOnEnter === "boolean"
    ? source.step4AutoGenerateOnEnter
    : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.step4AutoGenerateOnEnter,
```

- [ ] **步骤 6：验证前端编译**

运行：`cd apps/web && npm run build`
预期：编译通过

- [ ] **步骤 7：Commit**

```bash
git add apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx
git commit -m "feat(admin): extend AdminGlobalSystemSettingsPanel with CharacterWorkflow fields"
```

---

## 任务 8：前端 - 简化 SystemSettings 页面状态管理

**文件：**
- 修改：`apps/web/pages/admin/SystemSettings.tsx`
- 修改：`apps/web/pages/admin/adminSystemSettingsSurface.ts`

- [ ] **步骤 1：删除独立 draft 状态**

在 `SystemSettings.tsx` 中：

1. 删除 `draft` 状态声明：
   ```typescript
   const [draft, setDraft] = useState<CharacterWorkflowSystemSettings>(createDefaultCharacterWorkflowSystemSettings());
   ```

2. 删除 `activeWorkflowTab` 状态：
   ```typescript
   const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkflowInnerTabKey>("step1");
   ```

3. 删除 `workflowFeedback` 状态：
   ```typescript
   const [workflowFeedback, setWorkflowFeedback] = useState<string>("");
   ```

4. 删除 `settingsQuery` 查询：
   ```typescript
   const settingsQuery = useQuery({ ... });
   ```

- [ ] **步骤 2：删除废弃导入**

删除以下导入：
```typescript
import {
  CHARACTER_WORKFLOW_SYSTEM_SETTINGS_DEFAULTS,
  createDefaultCharacterWorkflowSystemSettings,
  normalizeCharacterWorkflowSystemSettingsInput,
  type CharacterWorkflowStep2PromptMode,
  type CharacterWorkflowSystemSettings,
} from "../../../../src/contracts/character-workflow-system-settings";
```

删除：
```typescript
import {
  handleRefreshCharacterWorkflowSystemSettings,
  handleSaveCharacterWorkflowSystemSettings,
} from "./adminSystemSettingsSurface";
```

- [ ] **步骤 3：更新 Tab 配置**

修改 `SYSTEM_SETTINGS_TABS` 数组，删除"推荐模块"：

```typescript
const SYSTEM_SETTINGS_TABS: Array<{ key: AdminSystemSettingsTabKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "system", label: "系统配置" },
  { key: "scheduler", label: "任务调度" },
  { key: "generation", label: "生成与积分" },
  { key: "hottrend", label: "热榜处理" },
  { key: "workflow", label: "AI 工作流" },
];
```

- [ ] **步骤 4：简化 handleRefreshAll 函数**

删除 `settingsQuery.refetch()` 调用：

```typescript
const handleRefreshAll = async (): Promise<void> => {
  if (!canAccess) {
    return;
  }
  setRefreshingAll(true);
  setGlobalFeedback("");
  try {
    await configQuery.refetch();
  } catch (error) {
    const message = resolveAdminSystemSettingsErrorMessage(error);
    setGlobalFeedback(message);
  } finally {
    setRefreshingAll(false);
  }
};
```

- [ ] **步骤 5：简化 handleSaveAll 函数**

删除工作流保存逻辑：

```typescript
const handleSaveAll = async (): Promise<void> => {
  if (!token || !canAccess) {
    return;
  }
  setSavingAll(true);
  setGlobalFeedback("");

  try {
    const response = await backendApi.adminConfigPatch(token, globalDraft);
    setGlobalDraft(buildAdminGlobalSystemSettingsDraft(response));
    setGlobalFeedback("系统参数已保存");
    await configQuery.refetch();
  } catch (error) {
    setGlobalFeedback(resolveAdminSystemSettingsErrorMessage(error));
  }

  setSavingAll(false);
};
```

- [ ] **步骤 6：删除废弃的辅助函数**

删除以下函数：
- `persistWorkflowDraft`
- `saveWorkflowSection`
- `resetWorkflowSection`
- `saveStep1AnalysisSection`
- `resetStep1AnalysisSection`
- `buildResetWorkflowSectionDraft`

- [ ] **步骤 7：更新 feedbackItems 计算**

```typescript
const feedbackItems = useMemo(
  () => [globalFeedback].filter((message) => Boolean(message)),
  [globalFeedback],
);
```

- [ ] **步骤 8：删除工作流子标签 UI**

删除 `WORKFLOW_INNER_TABS` 常量和相关 UI 渲染代码。工作流配置将直接在 `AdminGlobalSystemSettingsPanel` 中以卡片形式展示。

- [ ] **步骤 9：简化 adminSystemSettingsSurface.ts**

删除以下函数：
- `handleRefreshCharacterWorkflowSystemSettings`
- `handleSaveCharacterWorkflowSystemSettings`

- [ ] **步骤 10：验证前端编译**

运行：`cd apps/web && npm run build`
预期：编译通过

- [ ] **步骤 11：Commit**

```bash
git add apps/web/pages/admin/SystemSettings.tsx apps/web/pages/admin/adminSystemSettingsSurface.ts
git commit -m "refactor(admin): simplify SystemSettings state management"
```

---

## 任务 9：前端 - 添加工作流卡片配置

**文件：**
- 修改：`apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx`

- [ ] **步骤 1：添加工作流卡片到 GLOBAL_CARDS 数组**

在 `GLOBAL_CARDS` 数组末尾添加工作流相关卡片：

```typescript
{
  id: "workflow-step1",
  category: "workflow",
  title: "Step1 分析阶段",
  description: "控制 Step1 分析阶段的数量与入口策略",
  columns: 2,
  fields: [
    { key: "step1RoleDirectionCount", label: "Step1 角色方向数量" },
    {
      key: "step1HideVisualRecommendationCards",
      label: "隐藏 Step1 图片搭配推荐卡",
      description: "关闭后不展示图片搭配推荐卡，改为将反推分析卡置顶展示",
      inputType: "checkbox",
    },
    {
      key: "step1AutoReverseOnConfirm",
      label: "Step1 确认后自动反推",
      description: "覆盖上传确认与库选确认两个入口，减少人工重复触发",
      inputType: "checkbox",
    },
  ],
},
{
  id: "workflow-step2",
  category: "workflow",
  title: "Step2 定妆工作流",
  description: "定妆生成、右侧面板与图生图辅助区域统一收口",
  columns: 1,
  fields: [
    {
      key: "step2AutoGenerateOnEnter",
      label: "Step2 进入即自动定妆生成",
      description: "进入 Step2 后自动触发 3 个生成位批量生成",
      inputType: "checkbox",
    },
    {
      key: "step2SelectedRoleDirectionPanelVisible",
      label: "Step2 右侧已选推荐角色面板",
      description: "关闭后隐藏 Step2 左侧配置区的已选推荐角色预设面板",
      inputType: "checkbox",
    },
    {
      key: "step2ImageToImagePanelVisible",
      label: "Step2 图生图右侧面板",
      description: "关闭后隐藏候选详情抽屉与图生图提示词输入区",
      inputType: "checkbox",
    },
  ],
},
{
  id: "workflow-step2-prompt",
  category: "workflow",
  title: "Step2 三图提示词模式",
  description: "三张图都走同一固定模板，开关只决定参数由代码还是 LLM 参与生成",
  columns: 2,
  fields: [
    {
      key: "step2PromptImage1Mode",
      label: "图片一模式",
      description: "默认代码模式",
      inputType: "text",
    },
    {
      key: "step2PromptImage2Mode",
      label: "图片二模式",
      description: "默认 LLM 模式",
      inputType: "text",
    },
    {
      key: "step2PromptImage3Mode",
      label: "图片三模式",
      description: "默认 LLM 模式",
      inputType: "text",
    },
  ],
},
{
  id: "workflow-step3",
  category: "workflow",
  title: "Step3 分镜工作台",
  description: "控制 Step3 编辑器的布局与镜头卡展示方式",
  columns: 1,
  fields: [
    {
      key: "step3CompactStoryboardPanelEnabled",
      label: "Step3 分镜紧凑模式",
      description: "开启后 Step3 分镜编辑区切换为双列紧凑卡，并隐藏高级图片操作",
      inputType: "checkbox",
    },
  ],
},
{
  id: "workflow-step4",
  category: "workflow",
  title: "Step4 视频工作台",
  description: "控制进入 Step4 后是否自动触发预览视频生成",
  columns: 1,
  fields: [
    {
      key: "step4AutoGenerateOnEnter",
      label: "Step4 进入即自动预览视频生成",
      description: "进入 Step4 工作台后自动发起预览视频生成，减少人工补点",
      inputType: "checkbox",
    },
  ],
},
```

- [ ] **步骤 2：更新 GLOBAL_CATEGORY_META 添加 workflow 分类描述**

确保 `GLOBAL_CATEGORY_META` 包含 `workflow` 分类：

```typescript
workflow: {
  title: "AI 工作流",
  icon: "auto_fix_high",
  description: "按 Step 链路集中管理分析、生成、分镜与视频入口行为",
},
```

- [ ] **步骤 3：验证前端编译**

运行：`cd apps/web && npm run build`
预期：编译通过

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx
git commit -m "feat(admin): add workflow cards to AdminGlobalSystemSettingsPanel"
```

---

## 任务 10：验证与测试

**文件：**
- 无文件修改，仅验证

- [ ] **步骤 1：后端完整编译**

运行：`npm run build`
预期：编译通过，无错误

- [ ] **步骤 2：前端完整编译**

运行：`cd apps/web && npm run build`
预期：编译通过，无错误

- [ ] **步骤 3：启动后端服务**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`
预期：服务启动成功，无路由注册错误

- [ ] **步骤 4：验证 API 响应**

使用 curl 或浏览器访问：
- `GET /admin/config` - 应返回包含所有字段的配置对象
- `GET /admin/system-settings/character-workflow` - 应返回 404

- [ ] **步骤 5：Final Commit（如有遗漏修复）**

```bash
git add -A
git commit -m "fix: final cleanup for admin settings consolidation"
```

---

## 验收清单

- [ ] 后端编译通过
- [ ] 前端编译通过
- [ ] `/admin/config` API 返回完整配置
- [ ] `/admin/system-settings/character-workflow` 返回 404
- [ ] Tab 结构为：全部、系统配置、任务调度、生成与积分、热榜处理、AI 工作流
- [ ] 音乐能力设置卡片在系统配置 Tab
- [ ] 推荐函数参数卡片在热榜处理 Tab
- [ ] 反推模块开关卡片在 AI 工作流 Tab
- [ ] Step1-5 配置卡片在 AI 工作流 Tab
- [ ] 所有配置可正常保存