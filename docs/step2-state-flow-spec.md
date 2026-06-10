# Step2 五视图生成状态流转规范

> 版本: v1.1
> 更新日期: 2026-05-22
> 目的: 明确后端三层状态与前端 UI 状态的关系，避免状态不一致问题

---

## 1. 后端状态定义

### 1.1 三层状态架构（按优先级从高到低）

```
┌─────────────────────────────────────────────────────────────┐
│  优先级 1: 激活五视图层 (nrm_character_five_views)            │
│  用途: 当前选中五视图的状态，前端 UI 展示的**最高优先级依据** │
│  关联: character.active_five_view_id → five_view.status      │
│  状态: pending → processing → ready / failed                 │
└─────────────────────────────────────────────────────────────┘
                              ↑ 聚合来源
┌─────────────────────────────────────────────────────────────┐
│  优先级 2: 角色层 (nrm_library_characters)                    │
│  用途: 角色整体状态，聚合所有五视图状态                       │
│  关联: active_five_view_id 指向当前激活的五视图               │
│  状态: processing → ready / failed                           │
│  注意: 角色状态可能滞后于激活五视图状态                       │
└─────────────────────────────────────────────────────────────┘
                              ↑ 触发来源
┌─────────────────────────────────────────────────────────────┐
│  优先级 3: 任务层 (nrm_async_jobs)                            │
│  用途: 异步任务执行状态，用于任务队列调度和 SSE 推送           │
│  状态: pending → running → completed / failed                │
│  注意: 任务状态仅用于调度，不直接参与 UI 状态判断             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  优先级 4: 前端 runtimeMeta (仅进度展示)                       │
│  用途: 进度百分比、开始时间，**不参与状态判断**               │
│  数据: startedAtMs, backendProgressPercent                   │
│  注意: 仅在状态为 pending/processing 时用于展示进度           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 角色与五视图的关联

```
nrm_library_characters
├── id                          -- 角色ID
├── active_five_view_id ────────→ nrm_character_five_views.id (当前选中的五视图)
├── five_view_oss_image_url     -- 激活五视图的图片 URL
└── status                      -- 角色整体状态（由激活五视图状态聚合）

nrm_character_five_views
├── id                          -- 五视图ID
├── character_id ──────────────→ nrm_library_characters.id
├── status                      -- 五视图生成状态（**最高优先级**）
├── is_active                   -- 是否为激活五视图
└── error_message               -- 失败时的错误信息

关系:
- 一个角色可以有多个五视图记录（支持重试和版本管理）
- 角色的 active_five_view_id 指向当前选中的五视图
- 前端 UI 以**激活五视图状态**为准，而非角色状态
```

### 1.3 状态枚举值

| 表 | 字段 | 可能值 | 含义 |
|---|------|--------|------|
| `nrm_async_jobs` | `status` | `pending` | 任务排队中，等待调度 |
| | | `running` | 任务执行中 |
| | | `completed` | 任务成功完成 |
| | | `failed` | 任务执行失败 |
| `nrm_library_characters` | `status` | `processing` | 角色正在生成五视图 |
| | | `ready` | 五视图生成完成 |
| | | `failed` | 五视图生成失败 |
| `nrm_library_characters` | `active_five_view_id` | UUID | 当前激活五视图的ID |
| `nrm_character_five_views` | `status` | `pending` | 五视图等待生成 |
| | | `processing` | 五视图正在生成 |
| | | `ready` | 五视图生成完成 |
| | | `failed` | 五视图生成失败 |
| `nrm_character_five_views` | `is_active` | boolean | 是否为激活五视图 |

---

## 2. 状态流转时机

### 2.1 正常流程（成功）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 事件                    │ 任务状态    │ 角色状态      │ 激活五视图状态 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. 用户点击"生成"       │ pending     │ processing    │ pending        │
│ 2. 任务开始执行         │ running     │ processing    │ processing     │
│ 3. 图片生成成功         │ running     │ processing    │ processing     │
│ 4. 图片保存到 OSS       │ running     │ processing    │ processing     │
│ 5. 五视图标记完成       │ running     │ processing    │ ready          │
│ 6. 角色状态更新         │ running     │ ready         │ ready          │
│ 7. 任务完成             │ completed   │ ready         │ ready          │
│ 8. SSE 推送信号         │ completed   │ ready         │ ready          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 异常流程（失败）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 事件                    │ 任务状态    │ 角色状态      │ 激活五视图状态 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. 用户点击"生成"       │ pending     │ processing    │ pending        │
│ 2. 任务开始执行         │ running     │ processing    │ processing     │
│ 3. 图片生成失败         │ running     │ processing    │ processing     │
│    (socket hang up)     │             │               │                │
│ 4. 五视图标记失败       │ running     │ processing    │ failed         │
│ 5. 角色状态更新         │ running     │ failed        │ failed         │
│ 6. 任务标记失败         │ failed      │ failed        │ failed         │
│ 7. SSE 推送信号         │ failed      │ failed        │ failed         │
└──────────────────────────────────────────────────────────────────────────────┘

注意: 五视图状态先更新为 failed，角色状态随后聚合更新
```

### 2.3 批量生成流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 结构: 父任务 + 3 个子任务（每个角色一个）                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ 父任务: step2_batch_five_view                                                 │
│   - 状态: pending → running → completed                                       │
│   - 完成条件: 所有子任务完成（completed 或 failed）                            │
│                                                                               │
│ 子任务: step2_five_view (每个角色)                                             │
│   - 状态: pending → running → completed / failed                              │
│   - 关联: character_id, five_view_id                                          │
│   - 更新顺序: 五视图状态 → 角色状态 → 任务状态                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 后端状态更新逻辑

### 3.1 状态更新顺序（关键）

```
任务执行完成或失败时，状态更新顺序:
1. 五视图状态 (nrm_character_five_views.status) ← 最先更新
2. 角色状态 (nrm_library_characters.status) ← 聚合更新
3. 任务状态 (nrm_async_jobs.status) ← 最后更新
4. SSE 信号推送 ← 通知前端

原因: 五视图是粒度最细的状态，角色状态由五视图聚合，任务状态是调度状态
```

### 3.2 任务执行器代码（step2-five-view-job-executor.ts）

```typescript
// 失败时的处理逻辑（第 358-384 行）
catch (error) {
  const errMsg = error instanceof Error ? error.message : "Unknown error";

  // 1. 先更新五视图状态为 failed
  const existingView = await ctx.repos.characterFiveViews.findById(input.fiveViewId);
  if (existingView) {
    await ctx.repos.characterFiveViews.update({
      ...existingView,
      status: "failed",
      errorMessage: errMsg,
    });
  }

  // 2. 再更新角色状态为 failed（聚合）
  await ctx.pool.query(
    `UPDATE nrm_library_characters SET status = 'failed', updated_at = $1 WHERE id = $2`,
    [ctx.clock.now(), input.characterId]
  );

  // 3. 最后更新任务状态为 failed
  await finalizeAsyncJob(pool, job.id, "failed", null, {
    code: "FIVE_VIEW_GENERATION_FAILED",
    message: errMsg,
  });
}
```

---

## 4. 前端状态同步机制

### 4.1 状态来源优先级（修正）

```
┌─────────────────────────────────────────────────────────────┐
│  前端 UI 状态判断优先级（从高到低）                           │
├─────────────────────────────────────────────────────────────┤
│  1. 激活五视图状态 (activeFiveViewStatus)                    │
│     - 来源: API 返回的 character.activeFiveViewStatus       │
│     - 最权威，直接反映当前选中五视图的真实状态               │
│                                                               │
│  2. 角色状态 (character.status)                              │
│     - 来源: API 返回的 character.status                      │
│     - 聚合状态，可能滞后于激活五视图                         │
│                                                               │
│  3. 任务状态 (globalTaskQueue)                                │
│     - 来源: SSE + refreshGlobalTasks                         │
│     - 仅用于触发刷新，不参与 UI 状态判断                     │
│                                                               │
│  4. runtimeMeta (startedAtMs, backendProgressPercent)        │
│     - 来源: 前端本地状态                                      │
│     - 仅用于进度百分比展示，不参与状态判断                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 API 返回结构

```typescript
// backendApi.listProjectCharacters 返回的数据结构
interface ProjectCharacterDto {
  character: {
    status: "processing" | "ready" | "failed";  // 角色状态
    activeFiveViewStatus: "pending" | "processing" | "ready" | "failed" | null;  // 激活五视图状态
    fiveViewOssImageUrl: string | null;          // 激活五视图图片
  } | null;
}

// 前端应优先使用 activeFiveViewStatus，而非 character.status
```

### 4.3 SSE 信号推送

```
┌─────────────────────────────────────────────────────────────┐
│ SSE 信号类型        │ 触发时机           │ 前端响应          │
├─────────────────────────────────────────────────────────────┤
│ job_created         │ 任务创建           │ 刷新任务列表      │
│ job_updated         │ 任务进度更新       │ 刷新任务列表      │
│ job_completed       │ 任务成功完成       │ 刷新角色数据      │
│ job_failed          │ 任务失败           │ 刷新角色数据      │
└─────────────────────────────────────────────────────────────┘

注意: SSE 信号触发 refreshCharacters()，从 API 获取最新的五视图状态
```

### 4.4 前端刷新调用链

```
SSE job_failed 信号
    ↓
refreshGlobalTasks() → 更新 globalTaskQueue（任务状态）
    ↓
useFiveViewGeneration useEffect → 检测到 failed 任务
    ↓
updateCharacterStatusToFailed() → 更新本地状态（应急）
    ↓
refreshCharacters() → 从 API 获取最新数据
    ↓
获取 character.activeFiveViewStatus（最高优先级）
    ↓
buildStep2GeneratedFiveViewCandidates → 计算 generationStatus
    ↓
buildStep2RuntimeProgressBridge → 计算 phase
    ↓
UI 显示状态
```

---

## 5. 前端 UI 状态计算规则

### 5.1 generationStatus 计算（修正）

```typescript
// 位置: apps/web/pages/project-flow/step2GeneratedFiveViewCandidates.ts:49-50
// 输入: status = character.status 或 activeFiveViewStatus

// 修正: 应优先使用 activeFiveViewStatus
const status = char?.character?.activeFiveViewStatus ?? char?.character?.status;

const generationStatus: "ready" | "pending" | "failed" =
  status === "ready" ? "ready" 
  : status === "failed" ? "failed" 
  : "pending";

// 注意: 
// - processing 也映射为 pending（前端统一用 pending 表示"进行中"）
// - activeFiveViewStatus 比 character.status 更及时、更准确
```

### 5.2 runtimeProgress.phase 计算

```typescript
// 位置: src/modules/step2-runtime-progress-bridge.ts

// 关键: generationStatus 为 ready/failed 时，强制 hasActiveTask = false
const hasActiveTask =
  matchesActiveCandidate &&
  card.generationStatus === "pending" &&  // ← 只在 pending 时才活跃
  (hasStartedTask || hasBackendProgressSignal);

// contract state 函数优先级:
// 1. hasActiveTask && pending → phase: "generating"（进度展示）
// 2. generationStatus === "ready" → phase: "ready"
// 3. generationStatus === "failed" → phase: "failed"
// 4. 其他 → phase: "idle" / "blocked"
```

### 5.3 UI 展示映射

| generationStatus | phase | UI 显示 | 颜色 |
|---|---|---|---|
| `pending` + hasActiveTask | `generating` | "生成中 XX%" | 蓝色 |
| `pending` + noActiveTask | `generating` | "生成中" | 蓝色 |
| `ready` | `ready` | "已生成" | 绿色 |
| `failed` | `failed` | "生成失败" | 红色 |

---

## 6. 问题修复记录

### 6.1 问题描述

```
现象: 五视图生成失败后，前端显示"待生成"而非"生成失败"
根因: 
1. buildStep2RuntimeProgressBridge 中 hasActiveTask 判断
   未考虑 generationStatus，导致 phase 优先返回 "generating"
   覆盖了 generationStatus === "failed" 的正确状态
2. generationStatus 计算使用 character.status 而非 activeFiveViewStatus
   导致状态判断不够及时准确
```

### 6.2 修复方案

```typescript
// 文件: src/modules/step2-runtime-progress-bridge.ts
// 修改: 第 42-45 行

// 修复前:
const hasActiveTask =
  matchesActiveCandidate &&
  (hasStartedTask || hasBackendProgressSignal);

// 修复后:
const hasActiveTask =
  matchesActiveCandidate &&
  card.generationStatus === "pending" &&  // 只在 pending 时才视为活跃任务
  (hasStartedTask || hasBackendProgressSignal);
```

---

## 7. 状态一致性保证

### 7.1 后端保证

```
状态更新顺序（严格执行）:
1. 五视图状态 → failed/ready（最细粒度）
2. 角色状态 → failed/ready（聚合状态）
3. 任务状态 → failed/completed（调度状态）
4. SSE 信号推送 ← 确保前端及时感知

使用事务或顺序更新，确保状态一致
```

### 7.2 前端保证

```
状态判断规则:
1. 优先使用 activeFiveViewStatus（最权威）
2. character.status 作为备选（可能滞后）
3. runtimeMeta 仅用于进度展示，不参与状态判断
4. generationStatus 为 ready/failed 时，强制 hasActiveTask = false
```

---

## 8. 未来优化建议

### 8.1 前端直接使用 activeFiveViewStatus

```typescript
// 建议: 在 buildStep2GeneratedFiveViewCandidates 中优先使用 activeFiveViewStatus
const status = char?.character?.activeFiveViewStatus ?? char?.character?.status ?? "pending";
```

### 8.2 移除 runtimeMeta 的状态判断逻辑

```
建议: runtimeMeta 仅保留进度百分比和开始时间
      状态判断完全依赖后端返回的 activeFiveViewStatus
```

### 8.3 API 返回结构优化

```
建议: API 直接返回 fiveViewStatus 字段，减少前端计算层级
      character.status 仅作为历史兼容字段
```

---

## 9. 附录：关键文件位置

| 文件 | 用途 |
|---|---|
| `src/modules/step2-five-view-job-executor.ts` | 后端任务执行器，状态更新顺序 |
| `src/routes/library-routes.ts` | 后端路由，任务启动 |
| `src/routes/project-character-routes.ts` | 后端 API，返回 activeFiveViewStatus |
| `src/modules/step2-runtime-progress-bridge.ts` | 前端进度状态计算 |
| `src/contracts/step2-runtime-progress-contract.ts` | 前端状态契约函数 |
| `apps/web/pages/project-flow/step2GeneratedFiveViewCandidates.ts` | 前端卡片数据构建 |
| `apps/web/hooks/useFiveViewGeneration.ts` | 前端 hook，状态更新 |
| `apps/web/pages/image-project/ImageCharacterSelection.tsx` | 前端 UI 展示 |
| `apps/web/components/project-flow/FiveViewHistoryBar.tsx` | 前端历史五视图切换组件 |

---

## 10. 历史五视图切换功能

### 10.1 功能概述

```
┌─────────────────────────────────────────────────────────────┐
│  背景: 一个角色可以有多个五视图版本（重试生成、不同提示词）   │
│  功能: 用户可在历史五视图中切换激活版本                       │
│  位置: 图片/视频项目角色卡片下方，横向缩略图列表               │
│  触发: 直接点击缩略图切换（无弹窗）                            │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 数据模型

```
nrm_character_five_views（五视图表）
├── id                          -- 五视图ID
├── character_id                -- 关联角色ID
├── image_url                   -- 五视图图片URL
├── status                      -- 状态：pending/processing/ready/failed
├── is_active                   -- 是否为激活版本（只有一个为 true）
├── prompt                      -- 生成提示词
├── created_at                  -- 创建时间（用于排序）
└── retry_count                 -- 重试次数

角色 active_five_view_id 指向当前激活的五视图记录
```

### 10.3 API 调用

| API | 用途 | 路径 |
|---|---|---|
| `listCharacterFiveViews` | 获取角色所有五视图 | `GET /library/characters/:id/five-views` |
| `activateCharacterFiveView` | 切换激活五视图 | `PUT /library/characters/:id/five-views/:viewId/activate` |

### 10.4 切换流程

```
用户点击"历史"按钮
    ↓
调用 listCharacterFiveViews(characterId)
    ↓
返回五视图列表（按创建时间倒序）
    ↓
显示弹窗：所有版本 + 状态标签 + 缩略图
    ↓
用户点击"设为激活"（仅 ready 状态可激活）
    ↓
调用 activateCharacterFiveView(characterId, viewId)
    ↓
后端处理：
  1. 验证角色未被项目使用（CHARACTER_IN_USE 错误）
  2. 验证五视图状态为 ready（尚未生成完成错误）
  3. 更新所有五视图 is_active = false
  4. 更新目标五视图 is_active = true
  5. 更新角色的 active_five_view_id
  6. 更新角色的 five_view_oss_image_url
    ↓
前端刷新：refreshCharacters()
    ↓
UI 更新：显示新的激活五视图图片
```

### 10.5 错误处理

| 错误码 | 含义 | UI 提示 |
|---|---|---|
| `CHARACTER_IN_USE` | 角色正在被项目使用 | "角色正在被项目使用，无法切换" |
| `VIEW_NOT_READY` | 五视图尚未生成完成 | "该五视图尚未生成完成，无法激活" |

### 10.6 UI 组件位置

```
apps/web/components/project-flow/FiveViewHistoryBar.tsx
├── Props:
│   ├── characterId: string          -- 角色ID
│   ├── currentImageUrl: string      -- 当前激活五视图图片
│   ├── currentStatus: string        -- 当前状态
│   └── onActivated: () => void      -- 切换成功回调
│
├── 功能:
│   ├── 自动加载历史五视图列表
│   ├── 横向缩略图列表（10x10）
│   ├── 当前激活有 primary 边框高亮
│   └── 点击切换激活版本
│
└── 集成位置:
    apps/web/pages/image-project/ImageCharacterSelection.tsx
    apps/web/pages/project-flow/CharacterSelection.tsx
    └── 生成角色卡片下方（article 外部）
```

### 10.7 前端代码示例

```typescript
// 位置: 卡片 article 外部，div 包装内
{card.candidateId?.startsWith("generated-") && (
  <FiveViewHistoryBar
    characterId={card.candidateId.replace("generated-", "")}
    currentImageUrl={card.fiveViewAssetUrl}
    currentStatus={card.generationStatus}
    onActivated={() => {
      void refreshCharacters();
    }}
  />
)}
```

---

## 11. 版本历史

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.0 | 2026-05-22 | 初始版本：三层状态架构、优先级定义 |
| v1.1 | 2026-05-22 | 修正：状态判断优先级，前端刷新调用链 |
| v1.2 | 2026-05-22 | 新增：历史五视图切换功能、API 调用、UI 组件 |