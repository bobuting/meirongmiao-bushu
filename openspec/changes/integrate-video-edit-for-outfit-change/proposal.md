## Why

当前换装流程使用"换帧+图生视频"方案，存在以下问题：
1. **动作偏差**：图生视频用文本描述动作，可能与原视频轨迹有细微差异
2. **流程复杂**：需要生成首末帧图片（2N张），再调用图生视频API
3. **服装一致性风险**：首末帧分开生成，跨片段一致性依赖API稳定性

可灵视频编辑 Pro API (`kling-video-o3-pro`) 支持"最多4张参考图+文本"双重控制服装，且直接修改源视频保留原动作轨迹。采用"切片+视频编辑+拼接"方案可提升换装质量和简化流程。

## What Changes

- **新增**：视频切片工具 `src/utils/video-split.ts`（按镜头切换点切片）
- **新增**：镜头切换检测工具（使用 ffmpeg 场景检测或 PySceneDetect）
- **新增**：可灵视频编辑 Pro API 集成（`kling-video-o3-pro/video-edit`）
- **修改**：换装流程 Stage 1 → 从"脚本分镜提取"改为"镜头切换检测"
- **修改**：换装流程 Stage 2 → 从"换帧生成首末帧"改为"视频切片"
- **修改**：换装流程 Stage 3 → 从"图生视频"改为"视频编辑API换装"
- **保留**：Stage 0 参考图采集（用于生成换装参考图）
- **保留**：视频合并工具 `src/utils/video-merge.ts`

## Capabilities

### New Capabilities

- `video-split`: 视频切片能力，按镜头切换点将源视频切成 3-15s 片段
- `scene-detection`: 镜头切换检测，识别视频中的场景切换点
- `kling-video-edit`: 可灵视频编辑 Pro API 集成，支持图片+文本双重控制换装

### Modified Capabilities

- `outfit-change-workflow`: 换装流程核心逻辑，从"换帧+图生视频"改为"切片+视频编辑+拼接"
  - Stage 1: 脚本分镜提取 → 镜头切换检测
  - Stage 2: 换帧生成 → 视频切片
  - Stage 3: 图生视频 → 视频编辑API

## Impact

**代码影响**：
- `src/modules/video-step/step3-outfit-change/` - 主要修改区域
- `src/utils/` - 新增切片和镜头检测工具
- `src/core/video-config.ts` - 新增 `KLING_VIDEO_EDIT_PRO` 配置
- `src/modules/kling-video-provider-endpoints.ts` - 新增视频编辑 endpoint

**API 影响**：
- 新增可灵视频编辑 Pro API 调用
- 保留现有图生视频 API（可作为备选方案）

**数据影响**：
- `segmentImages` 表 → 改为存储切片视频 URL（或新建 `segmentVideos` 表）
- 换装任务状态流程调整

**依赖影响**：
- ffmpeg（已有，用于切片和场景检测）
- 可能需要 PySceneDetect（Python，可选）