## Why

当前视频合并转场系统使用微秒作为时长单位，缺乏 timing/easing 函数和 alignment 参数支持，转场效果类型有限（仅 18 种 GPU shader）。借鉴 FreeCut 的成熟转场模型，采用帧时长单位、40+ 转场效果、handle-based 时间线模型，可显著提升转场体验和灵活性。

**Why now**: 当前实现已稳定运行，但转场效果不够丰富、时长配置与帧率无关、无法精确控制转场对齐位置，限制了视频合并的用户体验。FreeCut 的开源实现提供了完整的转场架构范式，直接借鉴可避免重复设计。

## What Changes

- **BREAKING**: 时长单位从微秒改为帧数（`durationInFrames`）
- 新增 `TransitionTiming` 类型支持 5 种缓动函数（linear, ease-in, ease-out, ease-in-out, cubic-bezier）
- 新增 `alignment` 参数（0-1 范围），控制转场相对于剪辑点的位置
- 扩展转场类型至 40+ 种（借鉴 FreeCut 的 `TransitionPresentation` 系列）
- 重构 `TransitionConfig` 接口，采用 FreeCut 的 `TransitionDefinition` 模式
- 时间线模型改为 handle-based：片段保持相邻，转场消耗隐藏 source handles

## Capabilities

### New Capabilities

- `transition-duration-in-frames`: 时长单位从微秒改为帧数，支持帧率自适应
- `transition-timing-functions`: 5 种缓动函数支持（linear, ease-in, ease-out, ease-in-out, cubic-bezier）
- `transition-alignment`: 转场对齐参数（0=右片段，0.5=居中，1=左片段）
- `expanded-transition-types`: 40+ 转场效果（dissolve, wipe, slide, flip, iris, shape 等系列）

### Modified Capabilities

无现有 specs 需要修改。

## Impact

**代码影响**:
- `apps/web/src/core/export/export-pipeline.ts` - TransitionConfig 接口重构，渲染逻辑更新
- `apps/web/libs/video-merge.ts` - 转场配置生成逻辑重构
- `apps/web/utils/videoMergeHelper.ts` - 业务配置从微秒改为帧数
- `apps/web/src/core/gpu-transitions/transition-pipeline.ts` - 可能需要新增 shader 支持更多转场类型

**API 影响**:
- `TransitionConfig` 接口字段变更（duration → durationInFrames）
- 新增 timing、alignment 字段

**依赖影响**:
- 无新增外部依赖，纯内部重构