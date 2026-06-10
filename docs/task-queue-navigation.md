# 任务队列跳转逻辑文档

> 维护规则：任何涉及任务队列的改动（新增任务类型、修改跳转路径、修改通知逻辑），必须同步更新此文档。

## 一、任务类型总览

### 枚举定义

**代码位置**: `apps/web/components/layout/taskQueueConfig.ts`

```typescript
/** 任务状态枚举 */
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  EXPIRED = "expired",
}

/** 全局任务类型枚举 — 覆盖所有后端 executor 注册的 job type */
export enum GlobalTaskType {
  // 反推
  LLM_REVERSE = "llm_reverse",
  // Step2 角色定妆（视频项目）
  STEP2_BATCH_FIVE_VIEW = "step2_batch_five_view",
  STEP2_FIVE_VIEW = "step2_five_view",
  // Step2 角色定妆（图片项目）
  IMAGE_STEP2_BATCH_FIVE_VIEW = "image_step2_batch_five_view",
  IMAGE_STEP2_FIVE_VIEW = "image_step2_five_view",
  // Step3 脚本+分镜
  STEP3_SCRIPTS_GENERATION = "step3_scripts_generation",
  STEP3_LIBRARY = "step3_library",
  STEP3_VIDEO = "step3_video",
  STEP3_REALTIME = "step3_realtime",
  STEP3_EFFECTIVENESS = "step3_effectiveness",
  STEP3_CUSTOM = "step3_custom",
  STEP3_FASHION = "step3_fashion",
  STEP3_EMOTION_ARCHETYPE = "step3_emotion_archetype",
  STEP3_AESTHETIC = "step3_aesthetic",
  STEP3_PRODUCT_SHOWCASE = "step3_product_showcase",
  STEP3_STORY_THEME = "step3_story_theme",
  STEP3_RESONANCE = "step3_resonance",
  STEP3_REVERSE_REWRITE = "step3_reverse_rewrite",
  STEP3_BATCH_PREVIEW = "step3_batch_preview",
  STEP3_SHOT_PROMPT = "step3_shot_prompt",
  STEP3_FRAME_PREVIEW = "step3_frame_preview",
  // Step4 视频生成
  STEP4_CLIP_SUBMIT = "step4_clip_submit",
  STEP4_CLIP_QUERY = "step4_clip_query",
  STEP4_VIDEO = "step4_video",
  // 图片项目 Step3 模特图
  IMAGE_STEP3_MODEL_PHOTO = "image_step3_model_photo",
  IMAGE_STEP3_MODEL_PLAN = "image_step3_model_plan",
  IMAGE_STEP3_SINGLE_PHOTO = "image_step3_single_photo",
  IMAGE_STEP3_MULTI_PERSON = "image_step3_multi_person",
  IMAGE_STEP3_MULTI_PERSON_PLAN = "image_step3_multi_person_plan",
  IMAGE_STEP3_SINGLE_PHOTO = "image_step3_single_photo",
  IMAGE_STEP4_LONG_IMAGE_SUBMIT = "image_step4_long_image_submit",
  IMAGE_STEP4_LONG_IMAGE_QUERY = "image_step4_long_image_query",
  // 换装项目
  OUTFIT_CHANGE = "outfit_change",
  OUTFIT_CHANGE_UNDERSTAND = "outfit_change_understand",
  OUTFIT_CHANGE_ADAPT_VIDEO_EDIT = "outfit_change_adapt_video_edit",
  OUTFIT_CHANGE_GEN_VIDEO_EDIT = "outfit_change_gen_video_edit",
  OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY = "outfit_change_gen_video_edit_query",
  // Step6 裂变
  STEP6_FISSION = "step6_fission",
  STEP6_FISSION_NEW_STORY = "step6_fission_new_story",
  STEP6_FISSION_SHOT_PROMPTS = "step6_fission_shot_prompts",
  STEP6_FISSION_ITEM_IMAGE = "step6_fission_item_image",
  STEP6_FISSION_ITEM_VIDEO_SUBMIT = "step6_fission_item_video_submit",
  STEP6_FISSION_ITEM_VIDEO_QUERY = "step6_fission_item_video_query",
  STEP6_FISSION_COMBINATION = "step6_fission_combination",
}
```

### 用户任务（面板可见）

| 枚举值 | 任务类型 | 显示标签 | 所属项目 |
|--------|---------|---------|---------|
| `LLM_REVERSE` | `llm_reverse` | LLM 反推 | 反推 |
| `STEP2_FIVE_VIEW` | `step2_five_view` | 五视图生成 | 视频项目 |
| `STEP2_BATCH_FIVE_VIEW` | `step2_batch_five_view` | 批量五视图 | 视频项目 |
| `IMAGE_STEP2_FIVE_VIEW` | `image_step2_five_view` | 五视图生成 | 图片项目 |
| `IMAGE_STEP2_BATCH_FIVE_VIEW` | `image_step2_batch_five_view` | 批量五视图 | 图片项目 |
| `STEP3_SCRIPTS_GENERATION` | `step3_scripts_generation` | 脚本批量生成 | 视频项目 |
| `STEP3_LIBRARY` | `step3_library` | 脚本库生成 | 视频项目 |
| `STEP3_VIDEO` | `step3_video` | 视频脚本 | 视频项目 |
| `STEP3_REALTIME` | `step3_realtime` | 热点脚本 | 视频项目 |
| `STEP3_EFFECTIVENESS` | `step3_effectiveness` | 效果脚本 | 视频项目 |
| `STEP3_CUSTOM` | `step3_custom` | 自定义脚本 | 视频项目 |
| `STEP3_FASHION` | `step3_fashion` | 时尚大片 | 视频项目 |
| `STEP3_EMOTION_ARCHETYPE` | `step3_emotion_archetype` | 情感原型 | 视频项目 |
| `STEP3_AESTHETIC` | `step3_aesthetic` | 生活美学 | 视频项目 |
| `STEP3_PRODUCT_SHOWCASE` | `step3_product_showcase` | 产品展示 | 视频项目 |
| `STEP3_STORY_THEME` | `step3_story_theme` | 故事主题 | 视频项目 |
| `STEP3_RESONANCE` | `step3_resonance` | 共鸣故事 | 视频项目 |
| `STEP3_REVERSE_REWRITE` | `step3_reverse_rewrite` | 反推脚本改写 | 视频项目 |
| `STEP3_BATCH_PREVIEW` | `step3_batch_preview` | 分镜预览生成 | 视频项目 |
| `STEP3_SHOT_PROMPT` | `step3_shot_prompt` | 专业提示词生成 | 视频项目 |
| `STEP3_FRAME_PREVIEW` | `step3_frame_preview` | 帧预览 | 视频项目 |
| `STEP4_CLIP_SUBMIT` | `step4_clip_submit` | 视频片段提交 | 视频项目 |
| `STEP4_VIDEO` | `step4_video` | 视频生成 | 视频项目 |
| `IMAGE_STEP3_MODEL_PHOTO` | `image_step3_model_photo` | 主图生成（主任务） | 图片项目 |
| `IMAGE_STEP3_MODEL_PLAN` | `image_step3_model_plan` | 主图规划（子任务） | 图片项目 |
| `IMAGE_STEP3_SINGLE_PHOTO` | `image_step3_single_photo` | 单张模特图（子任务） | 图片项目 |
| `IMAGE_STEP3_MULTI_PERSON` | `image_step3_multi_person` | 多人模特图生成（主任务） | 图片项目 |
| `IMAGE_STEP3_MULTI_PERSON_PLAN` | `image_step3_multi_person_plan` | 多人模特图规划（子任务） | 图片项目 |
| `IMAGE_STEP4_LONG_IMAGE_SUBMIT` | `image_step4_long_image_submit` | 万相营造长图提交 | 图片项目 |
| `IMAGE_STEP4_LONG_IMAGE_QUERY` | `image_step4_long_image_query` | 万相营造长图状态查询（系统） | Submit/Query 分离的 Query 端 |
| `OUTFIT_CHANGE` | `outfit_change` | AI 换装 | 换装项目 |
| `OUTFIT_CHANGE_ADAPT_VIDEO_EDIT` | `outfit_change_adapt_video_edit` | 换装切片适配 | 换装项目 |
| `OUTFIT_CHANGE_GEN_VIDEO_EDIT` | `outfit_change_gen_video_edit` | 换装视频编辑 | 换装项目 |
| `STEP6_FISSION` | `step6_fission` | 裂变任务 | 裂变 |
| `STEP6_FISSION_NEW_STORY` | `step6_fission_new_story` | 裂变新故事 | 裂变 |
| `STEP6_FISSION_SHOT_PROMPTS` | `step6_fission_shot_prompts` | 裂变提示词生成 | 裂变 |
| `STEP6_FISSION_ITEM_IMAGE` | `step6_fission_item_image` | 裂变图片 | 裂变 |
| `STEP6_FISSION_ITEM_VIDEO_SUBMIT` | `step6_fission_item_video_submit` | 裂变视频提交 | 裂变 |
| `STEP6_FISSION_COMBINATION` | `step6_fission_combination` | 裂变组合方案 | 裂变 |

### 系统任务（面板隐藏）

> 定义在 `taskQueueConfig.ts` 的 `SYSTEM_TASK_TYPE_SET`，用于面板过滤。用户不可见，用于内部轮询查询和快速完成的子任务。

| 枚举值 | 任务类型 | 显示标签 | 说明 |
|--------|----------|---------|------|
| `OUTFIT_CHANGE_UNDERSTAND` | `outfit_change_understand` | 换装理解（系统） | 快速完成，无需展示 |
| `OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY` | `outfit_change_gen_video_edit_query` | 换装视频编辑查询 | Submit/Query 分离的 Query 端 |
| `STEP4_CLIP_QUERY` | `step4_clip_query` | 视频片段查询 | Submit/Query 分离的 Query 端 |
| `STEP6_FISSION_ITEM_VIDEO_QUERY` | `step6_fission_item_video_query` | 裂变视频查询 | Submit/Query 分离的 Query 端 |

## 二、跳转逻辑详解

### 2.1 任务队列面板点击跳转

**代码位置**: `apps/web/components/layout/TaskQueuePanel.tsx` — `getTaskNavigatePath()`

**触发条件**: 任务状态为 `TaskStatus.RUNNING` 或 `TaskStatus.COMPLETED` 时可点击

**实现方式**: 使用 `switch` + `GlobalTaskType` 枚举匹配

| 项目/阶段 | 任务类型（枚举值） | 跳转路径 |
|----------|------------------|---------|
| 图片项目 Step2 | `IMAGE_STEP2_FIVE_VIEW`, `IMAGE_STEP2_BATCH_FIVE_VIEW` | `/image-create/{projectId}/step2` |
| 视频项目 Step2 | `STEP2_FIVE_VIEW`, `STEP2_BATCH_FIVE_VIEW` | `/create/{projectId}/step2` |
| 图片项目 Step3 | `IMAGE_STEP3_MODEL_PHOTO`, `IMAGE_STEP3_MODEL_PLAN`, `IMAGE_STEP3_SINGLE_PHOTO` | `/image-create/{projectId}/step3` |
| 图片项目 Step4 | `IMAGE_STEP4_LONG_IMAGE_SUBMIT`, `IMAGE_STEP4_LONG_IMAGE_QUERY` | `/image-create/{projectId}/step4` |
| 视频项目 Step3 | 所有 `STEP3_*` 枚举（14 种） | `/create/{projectId}/step3` |
| 视频项目 Step4 | `STEP4_CLIP_SUBMIT`, `STEP4_VIDEO` | `/create/{projectId}/step4` |
| 视频项目 Step6 | 所有 `STEP6_FISSION_*` 枚举（7 种） | `/create/{projectId}/step6` |
| 换装项目 | `OUTFIT_CHANGE`, `OUTFIT_CHANGE_UNDERSTAND`, `OUTFIT_CHANGE_ADAPT_VIDEO_EDIT`, `OUTFIT_CHANGE_GEN_VIDEO_EDIT` | `/outfit-create/{projectId}/step4` |
| 系统任务/反推 | `STEP4_CLIP_QUERY`, `OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY`, `STEP6_FISSION_ITEM_VIDEO_QUERY`, `LLM_REVERSE` | `/reverse` |
| 默认 | 未匹配类型 | `/reverse` |

**子任务跳转**: 子任务复用父任务的跳转路径（通过 `childOnClick` 属性传递），点击子任务跳转到与父任务相同的项目步骤页。

### 2.2 Toast 通知跳转

**代码位置**: `apps/web/components/Layout.tsx` — `routeFromNotification()`

Toast 点击后使用 `notification.targetPath` 进行跳转。同时会：
1. 调用 `updateProjectDataForProject()` 更新项目状态
2. 如果有 `libraryScriptId`，通过 `navigate state` 传递

### 2.3 各任务类型的 targetPath 配置

**代码位置**: `apps/web/store/useAppStore.ts` — `refreshGlobalTasks()`

所有任务类型均有完成和失败通知配置，跳转路径与对应项目步骤页一致。

## 三、相关文件清单

| 文件 | 用途 |
|-----|------|
| `apps/web/components/layout/taskQueueConfig.ts` | 任务类型枚举 + 状态枚举 + 标签配置 + 阶段配置 |
| `apps/web/components/layout/TaskQueuePanel.tsx` | 任务队列面板 + `getTaskNavigatePath()` 跳转函数 |
| `apps/web/components/layout/TaskQueueItemRow.tsx` | 任务项 UI + `childOnClick` 子任务跳转 |
| `apps/web/components/Layout.tsx` | Toast 通知渲染 + `routeFromNotification()` |
| `apps/web/store/useAppStore.ts` | 任务队列状态 + `GlobalTaskItem` 类型定义 + `refreshGlobalTasks()` 通知逻辑 |
| `apps/web/App.tsx` | 3 秒轮询启动逻辑 |
| `apps/web/hooks/useFiveViewGeneration.ts` | 五视图任务监听（使用枚举） |
| `apps/web/pages/project-flow/CharacterSelection.tsx` | Step2 五视图任务监听（使用枚举） |
| `apps/web/pages/project-flow/ScriptEditor.tsx` | Step3 分镜任务监听（使用枚举） |
| `apps/web/pages/project-flow/ReverseScriptEditor.tsx` | 反推分镜任务监听（使用枚举） |
| `apps/web/pages/admin/TaskManagementPanel.tsx` | 任务管理面板（使用枚举） |
| `src/app-setup/setup-executors.ts` | Executor 集中注册（42 个任务类型） |