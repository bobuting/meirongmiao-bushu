## Context

当前视频合并转场系统基于 GPU shader 实现，使用微秒作为时长单位，配置参数有限。FreeCut 项目提供了成熟的转场架构：

**FreeCut 核心概念**:
- `TransitionDefinition`: 定义转场类型元数据（defaultDuration, minDuration, maxDuration, hasDirection, directions）
- `TransitionPresentation`: 具体转场效果（dissolve, wipe, slide, flip, iris, shape 等 40+ 种）
- `TransitionTiming`: 缓动函数（linear, ease-in, ease-out, ease-in-out, cubic-bezier）
- `alignment`: 转场对齐（0=右片段，0.5=居中于剪辑点，1=左片段）
- Handle-based 模型：片段保持相邻，转场消耗隐藏 source handles

**当前实现状态**:
- `TransitionConfig`: 包含 index, transitionId, duration(微秒), startTime, direction
- `TransitionPipeline`: GPU shader 渲染器，支持 18 种转场
- 时长以微秒为单位，与帧率无关
- 无 timing/easing、alignment 支持

## Goals / Non-Goals

**Goals:**
- 时长单位改为帧数，支持帧率自适应
- 实现 5 种缓动函数，提供流畅的过渡效果
- 实现 alignment 参数，精确控制转场位置
- 扩展转场类型至 40+ 种
- 保持现有 GPU shader 架构，逐步扩展而非重写

**Non-Goals:**
- 不引入新的外部依赖库
- 不改变视频合并的整体流程架构
- 不实现 FreeCut 的全部功能（仅借鉴转场模型）
- 不支持自定义 shader 导入

## Decisions

### 1. 时长单位：采用帧数而非微秒

**理由**: 帧数是视频编辑的标准单位，与帧率关联，更符合编辑直觉。微秒配置在不同帧率下效果不一致（如 3 秒在 30fps=90 帧，在 60fps=180 帧）。

**实现**: 
```typescript
interface TransitionConfig {
  durationInFrames: number;  // 替代 duration (微秒)
  // ...
}
```

**转换**: 微秒 → 帧数 = `Math.round(durationUs / frameDurationUs)`，其中 `frameDurationUs = 1000000 / fps`

### 2. 缓动函数：采用 CSS 标准的 timing-function

**理由**: CSS timing-function 是业界标准，开发者熟悉，易于理解和配置。

**实现**:
```typescript
type TransitionTiming = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';

interface TransitionConfig {
  timing: TransitionTiming;
  timingBezier?: [number, number, number, number]; // cubic-bezier 参数
}
```

**缓动映射**: 
- `linear`: `progress`
- `ease-in`: `progress²`
- `ease-out`: `1 - (1-progress)²`
- `ease-in-out`: `progress < 0.5 ? 2*progress² : 1 - (1-progress)²/2`
- `cubic-bezier`: 使用 bezier 曲线计算

### 3. Alignment：采用 FreeCut 的 0-1 范围模型

**理由**: 0-1 范围直观易理解，0=右片段、0.5=居中、1=左片段，与 FreeCut 兼容。

**实现**:
```typescript
interface TransitionConfig {
  alignment: number; // 0-1 范围，默认 0.5
}
```

**时间计算**: 
- `alignment = 0`: 转场在右片段开始时启动
- `alignment = 0.5`: 转场居中于剪辑点（左片段结束点）
- `alignment = 1`: 转场在左片段结束前启动

### 4. 转场类型扩展：保持 GPU shader 架构

**理由**: 现有 TransitionPipeline 已实现 WebGPU shader 渲染，性能良好。扩展 shader 种类比引入新渲染方案更简单。

**实现**: 
- 分类整理 FreeCut 40+ 转场为系列（dissolve, wipe, slide, flip, iris, shape）
- 为每个系列创建 shader 实现
- 保持 `getGpuTransitionIds()` 作为入口

**优先级**: 先实现高频使用的转场（dissolve, wipe, slide），再逐步扩展

## Risks / Trade-offs

**风险**: 帧数单位可能与现有业务配置不兼容
→ **缓解**: 提供转换函数 `framesToMicroseconds(frames, fps)`, 保持向后兼容过渡期

**风险**: 缓动函数计算增加 CPU 开销
→ **缓解**: 缓动计算轻量（简单数学运算），对渲染性能影响微小

**风险**: Alignment 计算可能改变转场视觉效果
→ **缓解**: 默认 alignment=0.5 保持与现有效果一致

**风险**: 40+ shader 实现工作量较大
→ **缓解**: 分批实现，优先高频转场，后续逐步扩展

## Migration Plan

1. **Phase 1**: 重构 TransitionConfig 接口（帧数、timing、alignment）
2. **Phase 2**: 更新 ExportPipeline 渲染逻辑（缓动计算、alignment 时间计算）
3. **Phase 3**: 更新 video-merge.ts 配置生成逻辑
4. **Phase 4**: 更新 videoMergeHelper.ts 业务配置
5. **Phase 5**: 扩展 GPU shader 转场类型

**回滚策略**: 保持旧接口兼容，可通过配置开关切换新旧模式