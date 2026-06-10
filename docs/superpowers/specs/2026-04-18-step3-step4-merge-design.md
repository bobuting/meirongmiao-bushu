# Step3 与 Step4 合并设计文档

## 概述

将视频项目的 Step3（脚本与分镜）和 Step4（视频生成）合并为单一步骤"Step3 脚本与视频"，采用流水线式任务网格界面，实现"确认即生成"的用户体验。

---

## 背景

### 当前流程

| 步骤 | 用户操作 | 核心产出 |
|------|---------|---------|
| Step3 | 确认脚本 → 批量生成分镜预览图 → 确认每张预览图 | segments（镜头数据） |
| Step4 | 接收确认的预览图 → 生成视频片段 → 合并视频 | finalVideoUrl |

### 问题

1. **步骤冗余**：Step4 不需要用户决策，仅等待视频生成完成
2. **等待时间**：用户必须等所有预览图生成完成后才能进入视频生成
3. **界面分散**：预览图和视频生成分属两个页面，增加认知负担

### 目标

- 减少步骤：从 6 步减少到 5 步
- 提升效率：采用流水线模式，确认预览图后立即开始视频生成
- 简化界面：统一任务网格展示预览图和视频状态

---

## 设计方案

### 核心理念

**从"批量确认→批量生成"改为"确认即生成"的流水线模式：**

```
传统模式：
预览图1 → 预览图2 → 预览图3 → 预览图4 → 全部确认 → 视频生成
                                    ↑ 等待点

流水线模式：
预览图1 → 确认 → 视频生成中
预览图2 → 确认 → 视频生成中
预览图3 → 确认 → 视频生成中
预览图4 → 确认 → 视频生成中
              ↑ 无等待，确认即开始
```

### 界面设计

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 3 脚本与视频                                                        │
├──────────────┬──────────────────────────────────────────────────────────┤
│              │                                                           │
│   历史记录    │  脚本编辑区域                                              │
│   侧边栏     │  ─── 脚本文案、场景描述、候选脚本选择                          │
│              │                                                           │
│              ├──────────────────────────────────────────────────────────┤
│              │                                                           │
│              │  任务网格（同时展示预览图+视频状态）                          │
│              │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│              │  │ 镜头 1   │ │ 镜头 2   │ │ 镜头 3   │ │ 镜头 4   │         │
│              │  │ [预览图] │ │ [预览图] │ │ [生成中] │ │ [待生成] │         │
│              │  │🎬视频生成中│ │✅确认并生成│ │    -     │ │    -     │         │
│              │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
│              │                                                           │
│              │  进度：预览图 2/4 已生成 | 视频 1/4 生成中                   │
│              │                                                           │
│              ├──────────────────────────────────────────────────────────┤
│              │                                                           │
│              │  [批量生成预览图]  [全部确认并生成视频]  [合并视频]          │
│              │                                                           │
└──────────────┴──────────────────────────────────────────────────────────┘
```

### 组件层级

```
Step3WorkspaceRoute (路由容器)
└── Step3WorkspaceShell (状态桥接层)
    └── ScriptEditor (主组件，重命名后可能叫 Step3ScriptAndVideoScreen)
        ├── ProjectFlowHistorySidebar (历史侧边栏)
        ├── Step3StructuredScriptCandidatesPanel (脚本候选面板)
        ├── StepContentHeader (标题栏)
        ├── Step3UnifiedTaskGrid (新组件：统一任务网格)
        │   └── Step3TaskCard[] (任务卡片)
        │       ├── PreviewImageArea (预览图区域)
        │       ├── StatusBadge (状态标签)
        │       └── ActionButtons (操作按钮：确认/重试/取消)
        ├── Step3ProgressOverview (进度概览)
        └── Step3GlobalControlBar (底部操作栏)
```

---

## 状态设计

### 单张任务卡片状态流转

```
⏸️ 待生成
    │
    ↓ 点击"批量生成预览图"或自动触发
⏳ 预览图生成中
    │
    ↓ 生成完成
✅ 已生成（预览图）
    │
    ├─→ 点击"重试" → ⏳ 预览图生成中
    │
    └─→ 点击"确认并生成" → 🎬 视频生成中
                              │
                              ├─→ 点击"取消" → ✅ 已生成（预览图）
                              │
                              └─→ 视频生成完成 → ✅ 视频已完成
                                                    │
                                                    └─→ 点击"重试" → 🎬 视频生成中
```

### 状态枚举定义

```typescript
type PreviewFrameStatus =
  | 'pending'        // 待生成
  | 'generating'     // 预览图生成中
  | 'generated'      // 已生成，待确认
  | 'confirmed'      // 已确认，视频生成中/已完成
  | 'video_generating'  // 视频生成中
  | 'video_completed'   // 视频已完成
  | 'video_failed'      // 视频生成失败
```

### 数据库设计

```sql
-- 新增字段：分镜预览图确认状态
ALTER TABLE nrm_project
ADD COLUMN IF NOT EXISTS preview_frame_status JSONB DEFAULT '{}';

-- 示例数据结构（按 frameIndex 索引）：
-- {
--   "1": "video_completed",
--   "2": "video_generating",
--   "3": "generated",
--   "4": "pending"
-- }
```

**Why JSONB？**
- 灵活扩展：未来可能需要存储每帧的重试次数、错误信息等
- 无需迁移：新增字段不影响现有数据
- 查询方便：支持 JSONB 查询和索引

---

## 交互设计

### 按钮状态矩阵

| 预览图状态 | 视频状态 | 主按钮 | 次按钮 |
|-----------|---------|--------|--------|
| 待生成 | - | - | - |
| 生成中 | - | - | - |
| 已生成 | 未开始 | ✅ 确认并生成 | 🔄 重试 |
| 已确认 | 生成中 | ❌ 取消 | - |
| 已确认 | 已完成 | 🔄 重试视频 | - |
| 已确认 | 失败 | 🔄 重试视频 | - |

### 重试逻辑

| 重试场景 | 重试范围 | 积分消耗 |
|---------|---------|---------|
| 重试预览图 | 重新生成单张预览图 | 按预览图单价计费 |
| 重试视频 | 重新生成单段视频 | 按视频单价计费 |
| 全部重试预览图 | 重新生成所有预览图 | 按数量 × 预览图单价 |
| 全部重试视频 | 重新生成所有视频 | 按数量 × 视频单价 |

**重试限制：**
- 单帧重试次数上限：3 次
- 达到上限后显示"请联系客服"

### 批量操作按钮

| 按钮 | 显示条件 | 点击行为 |
|------|---------|---------|
| 批量生成预览图 | 存在"待生成"状态的帧 | 批量生成所有待生成的预览图 |
| 全部确认并生成视频 | 存在"已生成"状态的帧，无"生成中" | 二次确认弹窗 → 确认所有已生成的帧并开始视频生成 |
| 合并视频 | 所有帧视频已完成 | 触发视频合并流程 |

### 全部确认弹窗设计

```
┌─────────────────────────────────────────┐
│  确认并开始视频生成                        │
├─────────────────────────────────────────┤
│                                         │
│  将确认 4 张预览图并开始生成视频：          │
│                                         │
│  • 镜头 1 - ✅ 已生成                     │
│  • 镜头 2 - ✅ 已生成                     │
│  • 镜头 3 - ✅ 已生成                     │
│  • 镜头 4 - ✅ 已生成                     │
│                                         │
│  预计消耗：4 × 10 = 40 积分               │
│                                         │
│  ⚠️ 确认后可随时取消，但已消耗的积分不退还    │
│                                         │
├─────────────────────────────────────────┤
│       [取消]        [确认并生成]          │
└─────────────────────────────────────────┘
```

### 取消确认

用户可通过以下方式取消确认：
1. **任务卡片上点击"取消"** — 仅视频生成中状态可取消，取消后：
   - 状态恢复为"已生成（预览图）"
   - 正在进行的视频任务会被终止
   - **已消耗的积分不退还**
2. **历史记录选择** — 恢复到之前的预览图状态，具体逻辑：
   - 历史记录中存储每个帧的预览图版本
   - 用户选择某个历史版本后，该帧状态重置为"已生成"

---

## API 设计

### 新增接口

#### 1. 确认预览图并开始视频生成

```
POST /neirongmiao/api/projects/:projectId/frames/:frameIndex/confirm

Request:
{
  "frameIndex": 1,
  "sourceImageUrl": "https://..." // 可选，指定使用哪个版本的预览图
}

Response:
{
  "success": true,
  "videoJobId": "job_xxx",
  "status": "video_generating"
}
```

#### 2. 取消确认

```
DELETE /neirongmiao/api/projects/:projectId/frames/:frameIndex/confirm

Response:
{
  "success": true,
  "status": "generated"
}
```

#### 3. 批量确认

```
POST /neirongmiao/api/projects/:projectId/frames/batch-confirm

Request:
{
  "frameIndexes": [1, 2, 3, 4]
}

Response:
{
  "success": true,
  "videoJobIds": ["job_1", "job_2", "job_3", "job_4"],
  "totalCreditCost": 40
}
```

#### 4. 获取帧状态

```
GET /neirongmiao/api/projects/:projectId/frames/status

Response:
{
  "frames": {
    "1": "video_completed",
    "2": "video_generating",
    "3": "generated",
    "4": "pending"
  },
  "summary": {
    "totalFrames": 4,
    "previewCompleted": 3,
    "videoCompleted": 1,
    "videoInProgress": 1
  }
}
```

### 复用现有接口

- 分镜预览图生成：复用现有 Step3 批量生成逻辑
- 视频片段生成：复用现有 Step4 视频生成逻辑
- 视频合并：复用现有 Step4 合并逻辑

---

## 状态流转设计

### 项目状态简化（可选）

当前状态：
```
DRAFT → OUTFIT_CONFIRMED → CHARACTER_CONFIRMED → SCRIPT_CONFIRMED
→ STORYBOARDING → FILMING → FISSIONING → READY_TO_PUBLISH
```

合并后可简化为：
```
DRAFT → OUTFIT_CONFIRMED → CHARACTER_CONFIRMED → SCRIPT_CONFIRMED
→ VIDEO_GENERATING → FISSIONING → READY_TO_PUBLISH
```

**变更说明：**
- 移除 `STORYBOARDING` 状态（分镜预览图生成融入视频生成流程）
- `FILMING` 重命名为 `VIDEO_GENERATING`（更准确描述状态）

---

## 技术实现要点

### 前端状态管理

```typescript
// useStep3FrameStatus.ts
interface Step3FrameStatusState {
  frames: Record<number, PreviewFrameStatus>;
  videoJobs: Record<number, VideoJobInfo>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchFrameStatus: () => Promise<void>;
  confirmFrame: (frameIndex: number) => Promise<void>;
  cancelConfirm: (frameIndex: number) => Promise<void>;
  batchConfirm: (frameIndexes: number[]) => Promise<void>;
  retryPreview: (frameIndex: number) => Promise<void>;
  retryVideo: (frameIndex: number) => Promise<void>;
}
```

### 轮询策略

| 状态 | 轮询频率 | 停止条件 |
|------|---------|---------|
| 预览图生成中 | 2s | 状态变为 generated 或 failed |
| 视频生成中 | 3s | 状态变为 video_completed 或 video_failed |
| 全部视频完成 | 不轮询 | - |

### 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 预览图生成失败 | 显示错误提示，允许重试 |
| 视频生成失败 | 显示错误提示，允许重试 |
| 网络断开 | 本地缓存状态，恢复后同步 |
| 积分不足 | 弹窗提示，阻止操作 |

---

## 改动范围

### 数据库

| 改动 | 文件/表 | 说明 |
|------|--------|------|
| 新增字段 | `nrm_project.preview_frame_status` | 存储每帧确认状态 |

### 后端

| 改动 | 文件 | 说明 |
|------|------|------|
| 新增路由 | `src/routes/step3-candidate/index.ts` | 帧确认相关 API |
| 新增服务 | `src/services/frame-confirm-service.ts` | 帧确认业务逻辑 |
| 修改服务 | `src/modules/video-job-service.ts` | 支持单帧视频生成 |

### 前端

| 改动 | 文件 | 说明 |
|------|------|------|
| 新增组件 | `Step3UnifiedTaskGrid.tsx` | 统一任务网格 |
| 新增组件 | `Step3TaskCard.tsx` | 任务卡片 |
| 新增 Hook | `useStep3FrameStatus.ts` | 帧状态管理 |
| 修改组件 | `ScriptEditor.tsx` | 集成任务网格 |
| 修改组件 | `Step3GlobalControlBar.tsx` | 按钮逻辑调整 |
| 修改路由 | `apps/web/App.tsx` | 移除 step4 路由 |

### 路由变更

| 原路由 | 新路由 | 说明 |
|-------|-------|------|
| `/create/:projectId/step3` | `/create/:projectId/step3` | 保持不变 |
| `/create/:projectId/step4` | 移除 | 功能合并到 step3 |

---

## 迁移计划

### 阶段 1：数据准备（0.5h）

1. 数据库新增 `preview_frame_status` 字段
2. 编写迁移脚本，为现有项目初始化状态

### 阶段 2：后端 API（1h）

1. 实现帧确认相关 API
2. 修改视频生成服务支持单帧生成
3. 测试 API 接口

### 阶段 3：前端组件（4h）

1. 实现 `Step3UnifiedTaskGrid` 组件
2. 实现 `Step3TaskCard` 组件
3. 实现 `useStep3FrameStatus` Hook
4. 集成到 `ScriptEditor` 主组件

### 阶段 4：路由合并（0.5h）

1. 移除 step4 路由
2. 更新步骤导航逻辑
3. 更新项目状态映射

### 阶段 5：测试与调试（2h）

1. 完整流程测试
2. 边界情况测试
3. 性能测试

**总工时估算：~8h**

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 界面拥挤 | 用户体验下降 | 分区域设计，折叠非必要信息 |
| 状态复杂 | 维护成本增加 | 清晰的状态机设计，充分的单元测试 |
| 向后兼容 | 现有项目异常 | 数据迁移脚本，保留旧路由重定向 |
| 性能问题 | 轮询过多 | 智能轮询策略，仅在活跃状态时轮询 |

---

## 成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 步骤数 | 6 步 | 5 步 |
| 用户等待时间 | 需等所有预览图生成 | 确认即开始视频生成 |
| 界面切换次数 | 2 次（step3 → step4） | 0 次 |
| 代码维护成本 | 2 个独立组件 | 1 个统一组件 |

---

## 附录

### 现有代码参考

- 任务网格组件：`apps/web/pages/fission/components/FissionTaskGrid.tsx`
- 状态管理：`apps/web/pages/project-flow/step3-workspace/useStep3ScriptJobs.ts`
- 视频生成：`apps/web/pages/project-flow/step4-video-workspace/step4VideoJobOrchestrator.ts`

### 相关文档

- 项目状态与步骤关系：`docs/buss/step/project-status-step-relation.md`
- Step3 组件层级：`docs/superpowers/specs/2026-04-18-step3-step4-merge-design.md`（本文档）

---

## 审查检查点

- [ ] 界面设计是否合理？
- [ ] 状态流转是否完整？
- [ ] API 设计是否清晰？
- [ ] 数据库设计是否合理？
- [ ] 改动范围是否可控？
- [ ] 风险是否识别并缓解？
