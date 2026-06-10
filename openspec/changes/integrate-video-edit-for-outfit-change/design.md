## Context

当前换装流程采用"换帧+图生视频"方案：
- **Stage 0**: 参考图采集（背景帧、角色帧、色彩风格）
- **Stage 1**: 视频理解 → 提取脚本分镜（N个动作片段）
- **Stage 2**: 换帧处理 → 为每个片段生成首帧+末帧（2N张图片）
- **Stage 3**: 图生视频 → 每个片段调用 Omni-Video API（首末帧+文本描述）
- **Stage 4**: 视频合并 → ffmpeg concat 拼接

**现有工具**：
- `src/utils/video-merge.ts` - ffmpeg concat demuxer（已有）
- `src/utils/video-frame-extract.ts` - ffmpeg 帧提取（已有）
- `src/utils/video-compression.ts` - 视频压缩（已有）

**约束**：
- 可灵视频编辑 std 支持 3-15s，pro 支持更长
- 视频编辑 API 输入：源视频 + 参考图（最多4张）+ 文本描述
- 需保留原有图生视频方案作为备选

## Goals / Non-Goals

**Goals:**
- 实现视频切片工具（根据视频理解的动作分镜时间边界切片）
- 集成可灵视频编辑 Pro API（图片+文本双重控制换装）
- 简化换装流程（从 2N 张图片减少到 N 张参考图）
- 提升换装质量（保留原视频动作轨迹）
- 保留原有方案作为备选（可切换）

**Non-Goals:**
- 不修改 Stage 0 参考图采集逻辑
- 不修改 Stage 1 视频理解逻辑（保留原有动作分镜提取）
- 不修改数据库表结构（复用现有 segmentImages/segmentVideos 表）
- 不实现实时视频编辑（仅支持异步任务模式）
- 不支持多人换装（仅支持单人场景）

## Decisions

### 1. 视频切片方案

**决策**: 根据 Stage 1 视频理解的动作分镜时间边界切片

**理由**:
- Stage 1 已提取动作分镜（startTime/endTime），无需额外场景检测
- ffmpeg 已在项目中使用（video-merge、video-frame-extract）
- ffmpeg 切片性能优秀，支持精准时间定位

**实现**:
```typescript
// src/utils/video-split.ts
interface SplitPoint { startTime: number; endTime: number; index: number }
async function splitVideoBySegments(
  videoUrl: string,
  actionSegments: ActionSegment[]  // 来自 Stage 1 的输出
): Promise<string[]> // 返回切片 URL 数组
```

**切片流程**:
```
Stage 1 输出: actionSegments = [{startTime:0, endTime:5}, {startTime:5, endTime:12}, ...]
    ↓
根据时间边界切片: ffmpeg -ss 0 -t 5, ffmpeg -ss 5 -t 7, ...
    ↓
输出: N 个切片视频 URL
```

### 2. Kling 视频编辑 API 集成

**决策**: 新增 `KLING_VIDEO_EDIT_PRO` RouteKey

**理由**:
- 项目已有 RouteKey 体系（`ProviderRouteKeys`）
- 统一的 LLM 调用链路（`llm-transport`）
- 支持审计日志（`llm-debug-recorder`）

**API 参数**（基于文档）:
```typescript
interface KlingVideoEditInput {
  video_url: string;           // 源视频（切片片段）
  reference_images: string[];  // 参考图（最多4张）
  prompt: string;              // 换装描述
  negative_prompt?: string;    // 负向提示词
  duration?: number;           // 输出时长
}
```

**Endpoint 构建**:
```typescript
// src/modules/kling-video-provider-endpoints.ts
export function buildKlingVideoEditEndpoint(input: KlingVideoEditInput) {
  return {
    url: `${KLING_BASE_URL}/video-edit`,
    method: "POST",
    body: {
      model: "kling-video-o3-pro",
      input: {
        video_url: input.video_url,
        reference_images: input.reference_images,
        prompt: input.prompt,
      }
    }
  };
}
```

### 3. 数据模型调整

**决策**: 复用现有表，扩展字段语义

**理由**:
- 减少数据库迁移成本
- segmentImages 可存储"换装参考图"（而非首末帧）
- segmentVideos 存储切片视频 URL

**字段映射**:
| 原字段 | 新语义 |
|--------|--------|
| `segmentImages.first_frame_url` | 换装参考图 URL |
| `segmentImages.last_frame_url` | 不使用（null） |
| `segmentVideos.source_video_url` | 切片视频 URL（新增） |
| `segmentVideos.result_video_url` | 编辑后视频 URL |

### 4. 工作流程调整

**决策**: 仅修改 Stage 2-3，保留 Stage 0-1

**新流程**:
```
Stage 0: 参考图采集（不变）
    ↓
Stage 1: 视频理解 → 动作分镜提取（不变）
    ↓
Stage 2: 视频切片 + 换装参考图生成（替代"换帧生成首末帧")
    ↓
Stage 3: 视频编辑 API 换装（替代"图生视频")
    ↓
Stage 4: 视频合并（不变）
```

**关键变化**:
- Stage 1 保持不变，actionSegments 时间边界用于切片
- Stage 2 新增视频切片步骤，参考图从 2N 张减少到 N 张
- Stage 3 从图生视频改为视频编辑 API

## Risks / Trade-offs

### Risk 1: 服装一致性跨片段偏差
**风险**: 多个切片片段独立调用 API，服装可能有细微差异
**缓解**: 
- 所有片段使用同一张换装参考图
- 使用相同文本描述（如"白色衬衫，黑色西裤"）
- Pro 版支持4张参考图，可提供多角度参考

### Risk 2: 视频编辑 API 时长限制
**风险**: std 版支持 3-15s，超过需切更细
**缓解**:
- 自动调整切片长度（最长 15s）
- Pro 版支持更长时长（优先使用 Pro）

### Risk 3: API 调用失败
**风险**: 单片段失败导致整体失败
**缓解**:
- 失败片段自动重试（最多 3 次）
- 提供备选方案切换回图生视频
- 记录失败日志，支持人工干预

### Trade-off 1: 流程简化 vs 可控性
**权衡**: 新方案流程更简单，但失去"首末帧约束"的精确控制
**接受理由**: 视频编辑 Pro 支持图片+文本双重控制，可控性足够

### Trade-off 2: 原动作保留 vs 动作替换能力
**权衡**: 新方案保留原动作，无法替换动作（如换舞蹈）
**接受理由**: 换装项目核心需求是换服装，动作替换是动作控制 API 的场景

## Migration Plan

### Phase 1: 新增能力（不修改现有流程）
1. 实现 `src/utils/video-split.ts`（根据 actionSegments 切片）
2. 新增 `KLING_VIDEO_EDIT_PRO` RouteKey
3. 新增 `src/modules/video-step/step3-outfit-change/stage2-video-edit-adapt.ts`
4. 新增 `src/modules/video-step/step3-outfit-change/stage3-video-edit-generation.ts`

### Phase 2: 集成新流程
1. 修改 `executor-handlers.ts` 支持双模式切换
2. 修改 Stage 2 在 video-edit 模式下调用视频切片 + 参考图生成
3. 修改 Stage 3 在 video-edit 模式下调用视频编辑 API

### Phase 3: 验证与切换
1. 并行运行两套方案（A/B 测试）
2. 对比换装质量、处理耗时
3. 确认稳定后切换默认方案

### Rollback 策略
- 配置开关一键切换回原有方案
- 原有代码不删除，保留作为备选
- 数据库字段兼容两种方案

## Open Questions

1. **切片边界处理**: 动作分镜时间边界是否精准？拼接是否有跳帧感？
2. **API 成本**: 视频编辑 Pro vs 图生视频，成本对比如何？
3. **音频保留**: 视频编辑 API 是否保留原音频？需要确认 API 文档
4. **超长片段处理**: 单个动作分镜超过 15s 时，是否需要二次切片？