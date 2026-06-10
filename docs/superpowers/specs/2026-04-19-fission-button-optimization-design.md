# 裂变按钮状态逻辑优化设计

## 问题背景

当前裂变按钮状态逻辑存在以下问题：

| 问题 | 表现 |
|------|------|
| 状态太多 | 5+ 种状态（creating, parallel_running, ready_for_step4, completed, partial_complete），6 种文本，5 种 action |
| 变迁不直观 | 状态跳转逻辑散落在多个条件判断中，像个黑盒 |
| 映射不一致 | 同状态不同条件显示不同文本，容易出错 |
| 难以扩展 | 新功能需要修改多处逻辑，怕改坏现有逻辑 |

## 当前状态分析

### 按钮状态定义（`useFissionVideo.ts:464-516`）

| 条件 | 文本 | disabled | action | 说明 |
|------|------|----------|--------|------|
| `generateVideoLoading` | 裂变中... | ✅ | `none` | 正在生成视频 |
| `projectDataLoading || !hasLoadedProjectData` | 加载中... | ✅ | `none` | 项目数据加载中 |
| `!originalVideoUrl` | 一键裂变 | ✅ | `new` | 原视频未加载 |
| `asyncPrepStatus.processing` | 正在准备数据... | ✅ | `none` | 异步准备任务处理中 |
| `asyncPrepStatus.failed` | 重试裂变 | ❌/✅ | `retry_async` | 异步准备失败 |
| `!fissionVideoStatus` | 一键裂变 | ❌/✅ | `new` | 无裂变记录 |
| `status === 'parallel_running'` | 裂变中... | ✅ | `none` | 分镜视频生成中 |
| `status === 'ready_for_step4'` | 裂变中... | ✅ | `auto` | 等待组合合并 |
| `status === 'completed'` | 再次裂变 | ❌/✅ | `continue` | 裂变完成 |
| `status === 'partial_complete'` | 重试裂变 | ❌/✅ | `continue` | 部分完成 |
| 其他状态 | 一键裂变 | ❌/✅ | `new` | creating 等 |

### 文本变迁流程

```
初始状态
    ↓
[一键裂变] ←─────────────────────────────┐
    │ 点击                                │
    ↓                                     │
[加载中...]                               │
    │                                     │
    ↓                                     │
[正在准备数据...] (异步准备)               │
    │                                     │
    ↓                                     │
[裂变中...] (parallel_running)            │
    │                                     │
    ↓                                     │
[裂变中...] (ready_for_step4, 等待合并)    │
    │                                     │
    ↓                                     │
[再次裂变] (completed) ───────────────────┘
    │ 点击（仅重新组合+合并）
    ↓
[裂变中...] → [再次裂变]

异常分支：
[重试裂变] ← partial_complete 或 asyncPrepStatus.failed
```

### action 类型说明

| action | 行为 |
|--------|------|
| `new` | 创建新的裂变任务 |
| `continue` | 继续裂变（仅重新组合+合并） |
| `retry_async` | 重试异步准备任务 |
| `auto` | 自动触发组合合并 |
| `none` | 无操作（禁用状态） |

---

## 三种优化方案

### 方案 A：简化状态机（推荐）

**核心思路**：减少状态数量，明确变迁路径，统一映射规则

```
现状：5+ 状态散落
     creating, parallel_running, ready_for_step4, completed, partial_complete

优化：3 个核心阶段
     空白 → 进行中 → 完成
```

| 维度 | 优化前 | 优化后 |
|------|--------|--------|
| 状态数 | 5+ | 3 |
| 文本数 | 6 | 3-4 |
| 映射规则 | 多层 if-else | 单层 switch |
| 变迁路径 | 隐式 | 显式定义 |

**优点**：改动小，向后兼容，易于理解  
**缺点**：可能需要调整后端状态值

**详细设计**：

```typescript
// 简化后的状态
type FissionPhase = 'idle' | 'running' | 'done';

// 状态映射（单一规则）
const phaseToButton = {
  idle: { text: '一键裂变', disabled: false, action: 'start' },
  running: { text: '裂变中...', disabled: true, action: 'none' },
  done: { text: '再次裂变', disabled: false, action: 'restart' },
};

// 从现有状态映射到简化阶段
const toPhase = (status: string, hasFailed: boolean): FissionPhase => {
  if (!status || status === 'creating') return 'idle';
  if (status === 'completed' && !hasFailed) return 'done';
  return 'running';
};
```

---

### 方案 B：引入状态机框架

**核心思路**：使用 XState 定义状态机，可视化 + 类型安全

```typescript
import { createMachine } from 'xstate';

const fissionMachine = createMachine({
  id: 'fission',
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'preparing' },
      meta: { text: '一键裂变', action: 'start' }
    },
    preparing: {
      on: { READY: 'running', FAIL: 'failed' },
      meta: { text: '正在准备数据...', action: 'none' }
    },
    running: {
      on: { DONE: 'completed', FAIL: 'partial' },
      meta: { text: '裂变中...', action: 'none' }
    },
    completed: {
      on: { RETRY: 'running' },
      meta: { text: '再次裂变', action: 'restart' }
    },
    partial: {
      on: { RETRY: 'running' },
      meta: { text: '重试裂变', action: 'retry' }
    },
    failed: {
      on: { RETRY: 'preparing' },
      meta: { text: '重试裂变', action: 'retry_async' }
    }
  }
});
```

**优点**：状态变迁可视化，类型安全，易于扩展  
**缺点**：引入新依赖（XState），学习成本，改动较大

---

### 方案 C：阶段式流程重构

**核心思路**：将裂变拆分为明确的阶段，类似 Step1-5 的设计

```
阶段1: 准备数据
阶段2: 生成分镜视频
阶段3: 组合合并
阶段4: 完成
```

每个阶段有独立的进度、状态、错误处理，与项目整体流程一致。

**优点**：
- 与项目整体流程一致（Step1-5），用户心智模型统一
- 每个阶段可独立展示进度和错误
- 易于扩展新阶段

**缺点**：改动最大，需要重构前后端

**详细设计**：

```typescript
// 阶段定义
type FissionStage = 
  | { stage: 'idle' }
  | { stage: 'preparing', subStage: 'data' | 'prompts', progress: number }
  | { stage: 'generating', progress: number, total: number }
  | { stage: 'merging', progress: number }
  | { stage: 'done' }
  | { stage: 'failed', errorStage: string, message: string };

// 阶段到按钮映射
const stageToButton = (stage: FissionStage): ButtonState => {
  switch (stage.stage) {
    case 'idle': return { text: '一键裂变', disabled: false, action: 'start' };
    case 'preparing': return { text: `准备数据 ${stage.progress}%`, disabled: true };
    case 'generating': return { text: `生成视频 ${stage.progress}/${stage.total}`, disabled: true };
    case 'merging': return { text: '合并视频...', disabled: true };
    case 'done': return { text: '再次裂变', disabled: false, action: 'restart' };
    case 'failed': return { text: '重试裂变', disabled: false, action: 'retry' };
  }
};
```

---

## 推荐：方案 A

理由：
1. **改动最小**，风险可控
2. **向后兼容**，不破坏现有数据
3. **效果明显**，从 5+ 状态降到 3 个核心阶段

---

## 实现要点（方案 A）

### 1. 状态简化映射

```typescript
// 前端：useFissionVideo.ts
const fissionPhase = useMemo(() => {
  if (!fissionVideoStatus) return 'idle';
  
  const { status, imageVideoFailed, newStoryFailed } = fissionVideoStatus;
  const hasFailed = imageVideoFailed > 0 || newStoryFailed > 0;
  
  if (status === 'completed' && !hasFailed) return 'done';
  if (['parallel_running', 'ready_for_step4'].includes(status)) return 'running';
  if (status === 'partial_complete') return 'running'; // 视为 running，允许重试
  
  return 'idle';
}, [fissionVideoStatus]);

const buttonState = useMemo(() => {
  switch (fissionPhase) {
    case 'idle': return { text: '一键裂变', disabled: !canFission, action: 'start' };
    case 'running': return { text: '裂变中...', disabled: true, action: 'none' };
    case 'done': return { text: '再次裂变', disabled: !canFission, action: 'restart' };
    default: return { text: '一键裂变', disabled: true, action: 'none' };
  }
}, [fissionPhase, canFission]);
```

### 2. 后端状态兼容

无需修改后端状态值，前端通过映射层兼容：

```typescript
// 状态映射表
const STATUS_TO_PHASE = {
  'creating': 'idle',
  'parallel_running': 'running',
  'ready_for_step4': 'running',
  'completed': 'done',
  'partial_complete': 'running', // 有失败项，视为 running 允许重试
};
```

### 3. 异步准备状态处理

异步准备状态（`asyncPrepStatus`）作为 running 的子状态：

```typescript
if (fissionPhase === 'running' && asyncPrepStatus?.processing) {
  return { text: '正在准备数据...', disabled: true };
}
```

---

## 后续讨论

- 是否需要保留 `partial_complete` 的特殊处理？
- 异步准备失败时是否需要专门的"重试准备"按钮？
- 是否需要展示详细进度（如"生成视频 3/5"）？