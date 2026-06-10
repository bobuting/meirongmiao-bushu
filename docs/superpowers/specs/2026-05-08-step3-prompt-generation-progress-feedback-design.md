---
title: Step3 分镜预览阶段0进度反馈优化
date: 2026-05-08
status: approved
---

## 背景

Step3 分镜预览流程中，阶段0（专业提示词生成）是一次 LLM 调用生成所有帧的提示词，耗时较长（通常 10-30 秒）。当前前端在此期间缺乏直观的进度反馈：

- 帧卡片处于空白状态，用户无法感知系统正在工作
- 底部控制栏按钮不显示阶段0状态，只在帧子任务出现后才显示"生成中"
- 全局任务队列面板虽有提示词任务进度，但不够直观

## 方案

**仅前端显示优化，不改后端逻辑。** 从已有的 `globalTaskQueue` 数据推断阶段0状态，更新帧卡片和底部控制栏。

### 状态推算逻辑

从 `globalTaskQueue` 双重判断阶段0状态：

```
globalTaskQueue
  ├─ 过滤当前项目的 step3_batch_preview 任务
  │   ├─ 找到 running 的父任务 → runningBatch
  │   └─ 检查父任务 stage
  │       ├─ stage === "生成提示词中" → isPromptGenerating = true
  │       └─ stage !== "生成提示词中" → isPromptGenerating = false
  └─ 辅助验证：过滤 step3_shot_prompt 任务
      ├─ 找到 running/pending 的提示词子任务 → 确认阶段0还在进行
      └─ 没有 → 阶段0已结束
```

双重判断确保精确性：
- 父任务 `stage === "生成提示词中"` → 直接判断阶段0
- 父任务 stage 未知但存在 `step3_shot_prompt` 子任务 → 兜底判断阶段0

### 帧卡片反馈

阶段0期间，每帧待生成卡片显示：
- **Loading spinner**（`material-icons-round` 的 `sync` 旋转动画）
- 文案：**"正在生成专业提示词..."**
- 背景样式：与"生成脚本中..."按钮一致的蓝色调

阶段0完成后自动切换：spinner 消失 → 等待帧子任务 → 模拟进度条启动

### 底部控制栏按钮反馈

阶段0期间，按钮变为蓝色加载状态：
- 样式：蓝色边框 + 蓝色文字 + `sync` 旋转图标（与"生成脚本中..."按钮风格一致）
- 文案：**"生成提示词中..."**
- 禁止点击（`cursor-wait`）

阶段0完成后自动切换：`"生成提示词中..."` → `"生成中 (completed/target)"` → 逐帧递增

### 新增 prop 传递链

```
ScriptEditor (计算 isPromptGenerating)
  ↓ prop
step3GlobalControlBar (按钮状态分支)
  ↓ prop
step3PreviewCardRuntime (spinner + 文案)
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `apps/web/pages/project-flow/ScriptEditor.tsx` | 扩展 `useEffect` 监听 globalTaskQueue，计算 `isPromptGenerating` 状态，传递给子组件 |
| `apps/web/pages/project-flow/step3-workspace/step3GlobalControlBar.tsx` | 新增 `isPromptGenerating` prop，添加阶段0按钮分支（蓝色加载状态） |
| `apps/web/pages/project-flow/step3-workspace/step3PreviewCardRuntime.tsx` | 新增 `isPromptGenerating` prop，阶段0期间显示 spinner + 文案 |
| `apps/web/pages/project-flow/step3-workspace/step3StoryboardCardPreviewPanel.tsx` | 传递 `isPromptGenerating` prop 到 `step3PreviewCardRuntime` |

## 不涉及的改动

- 后端编排器逻辑不变
- 后端 executor 不变
- SSE 机制不变
- 全局任务队列面板不变

## 自动切换机制

阶段0完成 → SSE 推送 `job_completed` → `refreshGlobalTasks()` → `globalTaskQueue` 更新 → `ScriptEditor` useEffect 重算 → `isPromptGenerating = false` → UI 自动切换到帧生成进度。