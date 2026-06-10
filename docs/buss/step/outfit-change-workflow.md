# 换装视频生成工作流

## 概述

换装视频生成支持两种工作流模式：

| 模式 | 描述 | 适用场景 |
|------|------|---------|
| **video-edit** | 视频切片 + 编辑 API | 保持原始视频动作流畅度，适合动作复杂的视频 |
| **image-to-video** | 换帧 + 图生视频 API | 从关键帧重新生成视频，适合静态展示场景 |

**默认模式**: `video-edit`

**时长限制**: 30 秒（前端裁切）

## Step 1: 前端视频裁切

换装功能仅支持 30 秒以内的视频。用户上传源视频时，前端自动裁切：

### 裁切流程

```
用户上传源视频
    ↓
前端检测视频时长
    ↓
时长 > 30s ?
    ├─ 是 → ffmpeg.wasm 裁切前 30s（保留音频）
    └       ↓
           上传裁切后的 MP4 → OSS
    └─ 否 → 直接上传原视频 → OSS
    ↓
sourceVideoUrl 传给后端
    ↓
保存到 draft 表
```

### 技术方案

| 方案 | 音频 | 格式 | 浏览器支持 |
|------|------|------|------------|
| **ffmpeg.wasm**（优先） | ✅ 保留 | MP4 | Chrome/Edge/Firefox |
| **Canvas + MediaRecorder**（降级） | ❌ 无 | WebM | 所有浏览器 |

### ffmpeg.wasm 实现

```typescript
// apps/web/utils/videoTrim.ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

async function trimVideoWithFfmpeg(file: File, maxDuration: number): Promise<File> {
  const ffmpeg = await loadFfmpeg();
  
  await ffmpeg.writeFile("input.mp4", await fetchFile(file));
  
  // 无损复制音视频
  await ffmpeg.exec([
    "-i", "input.mp4",
    "-t", String(maxDuration),
    "-c:v", "copy",  // 视频流复制
    "-c:a", "copy",  // 音频流复制
    "-movflags", "+faststart",
    "output.mp4",
  ]);
  
  const data = await ffmpeg.readFile("output.mp4");
  return new File([data], "trimmed.mp4", { type: "video/mp4" });
}
```

### 浏览器兼容性

| 浏览器 | ffmpeg.wasm | 说明 |
|--------|-------------|------|
| Chrome 92+ | ✅ 支持 | 默认启用 SharedArrayBuffer |
| Edge 92+ | ✅ 支持 | 默认启用 |
| Firefox 79+ | ✅ 支持 | 默认启用 |
| Safari 15.2+ | ⚠️ 部分支持 | 需配置安全头 |
| iOS Safari | ❌ 不支持 | 自动降级到 Canvas |

**降级方案**: 不支持时使用 Canvas + MediaRecorder（无音频）

### 性能影响

| 资源 | 大小 | 说明 |
|------|------|------|
| ffmpeg-core.wasm | 31MB | 首次加载 3-10 秒 |
| 内存占用 | ~150MB | 处理时峰值 |
| 裁切耗时 | 0.5-5s | 取决于视频大小 |

**优化**: 单例模式避免重复加载

详细文档见：[ffmpeg-wasm-video-trim.md](./ffmpeg-wasm-video-trim.md)

## 模式切换

通过环境变量 `OUTFIT_CHANGE_MODE` 切换：

```bash
# 使用 video-edit 模式（默认）
OUTFIT_CHANGE_MODE=video-edit

# 使用 image-to-video 模式
OUTFIT_CHANGE_MODE=image-to-video
```

## 工作流对比

### video-edit 模式

```
Stage 0: 参考图采集（背景帧、角色帧）
    ↓
Stage 1: 视频理解（骨架序列、动作分段 → actionSegments）
    ↓
Stage 2: 视频切片 + 参考图生成
    - 根据 actionSegments.startTime/endTime 切分源视频
    - 生成换装参考图（服装 + 角色合成）
    - 存储到 segmentVideos 表（source_video_url, reference_image_url）
    ↓
Stage 3: 视频编辑 API
    - 调用可灵视频编辑 API（kling-video-o3-pro）
    - 输入：切片视频 + 参考图 + 换装提示词
    - 输出：编辑后的视频
    ↓
合并: 将所有编辑后的片段合并为最终视频
```

### image-to-video 模式

```
Stage 0: 参考图采集（背景帧、角色帧）
    ↓
Stage 1: 视频理解（骨架序列、动作分段 → actionSegments）
    ↓
Stage 2: 换帧处理
    - 提取每个片段的首帧和尾帧
    - 使用图像生成 API 换装
    - 存储到 segmentImages 表（first_frame_url, last_frame_url）
    ↓
Stage 3: 视频生成 API
    - 调用图生视频 API（首帧 → 尾帧）
    - 输入：换装后的首帧 + 尾帧 + 背景帧
    - 输出：生成的视频
    ↓
合并: 将所有生成的片段合并为最终视频
```

## 数据存储

### segmentVideos 表

| 字段 | video-edit 模式 | image-to-video 模式 |
|------|-----------------|---------------------|
| `source_video_url` | 切片视频 URL | null |
| `reference_image_url` | 参考图 URL | null |
| `video_url` | 编辑/生成后的视频 URL | 编辑/生成后的视频 URL |
| `duration` | 视频时长 | 视频时长 |
| `status` | pending → ready → completed | pending → completed |

### segmentImages 表

仅 `image-to-video` 模式使用：

| 字段 | 说明 |
|------|------|
| `first_frame_url` | 换装后的首帧 |
| `last_frame_url` | 换装后的尾帧 |

## 任务类型

| 任务类型 | 模式 | 说明 |
|----------|------|------|
| `outfit_change_understand` | 通用 | Stage 0 + Stage 1，创建子任务 |
| `outfit_change_adapt_frame` | image-to-video | 换帧处理 |
| `outfit_change_adapt_video_edit` | video-edit | 切片 + 参考图生成 |
| `outfit_change_gen_video` | image-to-video | 图生视频 |
| `outfit_change_gen_video_edit` | video-edit | 视频编辑 |

## API 配置

### Provider Route Keys

| RouteKey | 模式 | API |
|----------|------|-----|
| `OUTFIT_CHANGE_IMAGE_GENERATION` | 通用 | 换装图像生成 |
| `OUTFIT_CHANGE_VIDEO_GENERATION` | image-to-video | 图生视频 |
| `OUTFIT_CHANGE_VIDEO_EDIT` | video-edit | 视频编辑 |

### Call Modes

| CallMode | 说明 |
|----------|------|
| `KLING_VIDEO_EDIT_YUNWU` | 可灵视频编辑 API（异步轮询） |

## 错误处理

### 重试机制

视频编辑 API 支持：
- 最大重试次数：3
- 指数退避：5s → 10s → 20s（带抖动）
- 错误分类：
  - `permanent`: 不重试（400/401/403/404/422）
  - `transient`: 重试（超时、连接错误）
  - `service`: 重试并报警（429/500/502/503/504）

### 状态流转

```
pending → processing → ready → completed
                ↓           ↓
              failed       failed
```

## 回滚策略

如需回退到 `image-to-video` 模式：

1. 修改环境变量：`OUTFIT_CHANGE_MODE=image-to-video`
2. 重启服务
3. 新任务将使用旧模式

**注意**: 已创建的任务不受影响，按创建时的模式执行。

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/core/video-config.ts` | 模式配置 |
| `src/modules/video-step/step3-outfit-change/stage2-video-edit-adapt.ts` | video-edit Stage 2 |
| `src/modules/video-step/step3-outfit-change/stage3-video-edit-generation.ts` | video-edit Stage 3 |
| `src/modules/video-step/step3-outfit-change/executor-handlers.ts` | 任务执行器 |
| `src/repositories/pg/segment-video-pg-repository.ts` | 视频片段仓储 |
| `src/utils/video-split.ts` | 视频切片工具 |