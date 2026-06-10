# mediabunny 完整迁移方案

> 本方案详细规划从 @webav/av-cliper 迁移到 mediabunny 的完整路径。
> 预计工期：14-21 工作日，分5个阶段执行。

---

## 一、迁移背景与收益

### 1.1 当前架构分析

**@webav/av-cliper 依赖清单**：

| 文件 | 使用功能 | 复杂度 |
|------|----------|--------|
| `libs/video-frame-extract.ts` | MP4Clip | 低 |
| `libs/video-mirror.ts` | MP4Clip + Combinator + OffscreenSprite | 高 |
| `libs/video-merge.ts` | Combinator + MP4Clip + OffscreenSprite + AudioClip + ImgClip | 极高 |
| `libs/transition-generator.ts` | MP4Clip | 中 |
| `libs/video-merge-webgl.ts` | Combinator | 中 |
| `src/modules/transitions/transition-clip.ts` | IClip 接口 | 低 |

### 1.2 迁移收益矩阵

| 维度 | 当前 (@webav) | 迁移后 (mediabunny) | 收益量化 |
|------|---------------|---------------------|----------|
| **转场效果数量** | 3 种基础 | 18+ 高级 WGSL shader | ⭐⭐⭐⭐⭐ |
| **GPU 特效** | 0 | 5 大类（color/blur/distort/stylize/keying） | ⭐⭐⭐⭐⭐ |
| **绿幕抠像** | ❌ 无法实现 | ✅ chromaKey + lumaKey | ⭐⭐⭐⭐⭐（换装项目必需） |
| **导出速度** | 重新编码（慢） | EncodedPacketSink 直接提取 | ⭐⭐⭐⭐⭐（5-10倍提速） |
| **渲染性能** | WebGL | WebGPU | ⭐⭐⭐⭐（2-3倍提速） |
| **大文件处理** | 内存限制 | OPFS + 流式处理 | ⭐⭐⭐⭐ |
| **音频处理** | 基础播放 | EQ + 变调 + 混音 | ⭐⭐⭐ |

---

## 二、FreeCut代码复用清单（关键）

> **重要**：以下代码可直接从 FreeCut 复制或借鉴，无需重写，大幅降低迁移成本。

### 2.0.1 可直接复用的核心模块

| 模块 | FreeCut 源码位置 | 复用方式 | 工作量节省 |
|------|------------------|----------|------------|
| **CompositorPipeline** | `/tmp/freecut/src/lib/gpu-compositor/compositor-pipeline.ts` | 直接复制，修改导入路径 | ⭐⭐⭐⭐⭐（节省3天） |
| **TransitionPipeline** | `/tmp/freecut/src/lib/gpu-transitions/transition-pipeline.ts` | 直接复制 | ⭐⭐⭐⭐⭐（节省2天） |
| **EffectsPipeline** | `/tmp/freecut/src/lib/gpu-effects/effects-pipeline.ts` | 直接复制 | ⭐⭐⭐⭐⭐（节省2天） |
| **MediaRenderPipeline** | `/tmp/freecut/src/lib/gpu-media/media-render-pipeline.ts` | 直接复制 | ⭐⭐⭐⭐（节省1天） |
| **18+ WGSL 转场 shader** | `/tmp/freecut/src/lib/gpu-transitions/transitions/*.ts` | 直接复制所有文件 | ⭐⭐⭐⭐⭐（节省2天） |
| **5大类 GPU 特效** | `/tmp/freecut/src/lib/gpu-effects/effects/**/*.ts` | 直接复制所有文件 | ⭐⭐⭐⭐⭐（节省3天） |
| **Blend Modes WGSL** | `/tmp/freecut/src/lib/gpu-shared/blend-modes.ts` | 直接复制 | ⭐⭐⭐（节省0.5天） |
| **GPU Texture Pool** | `/tmp/freecut/src/lib/gpu-compositor/gpu-texture-pool.ts` | 直接复制 | ⭐⭐⭐（节省0.5天） |

**总计节省工作量**：约 **12-14 天**，原计划 14-21 天可缩减至 **3-7 天**。

### 2.0.2 复用步骤（3步）

```bash
# 步骤1：复制核心GPU模块
mkdir -p apps/web/src/core/gpu-{compositor,transitions,effects,media,shared}

cp /tmp/freecut/src/lib/gpu-compositor/*.ts apps/web/src/core/gpu-compositor/
cp /tmp/freecut/src/lib/gpu-transitions/*.ts apps/web/src/core/gpu-transitions/
cp /tmp/freecut/src/lib/gpu-effects/*.ts apps/web/src/core/gpu-effects/
cp /tmp/freecut/src/lib/gpu-media/*.ts apps/web/src/core/gpu-media/
cp /tmp/freecut/src/lib/gpu-shared/*.ts apps/web/src/core/gpu-shared/

# 步骤2：复制转场 shader（18个文件）
cp /tmp/freecut/src/lib/gpu-transitions/transitions/*.ts \
   apps/web/src/core/gpu-transitions/transitions/

# 步骤3：复制特效 shader（5大类）
cp -r /tmp/freecut/src/lib/gpu-effects/effects/* \
      apps/web/src/core/gpu-effects/effects/
```

### 2.0.3 需要修改的内容

| 修改类型 | 说明 | 工作量 |
|----------|------|--------|
| **导入路径** | `@/` →相对路径或新别名 | 0.5 天 |
| **日志系统** | FreeCut 用 `createLogger` → neirongmiao 用 `getLogger` | 0.5 天 |
| **类型定义** | 部分类型可能需要适配 | 1 天 |
| **测试用例** | 复制并适配测试 | 1 天 |

### 2.0.4 FreeCut 依赖的共享代码

以下辅助代码也需要复制：

```typescript
// 必须复用的共享模块
/tmp/freecut/src/lib/gpu-shared/
├── blend-modes.ts       # 混合模式 WGSL 定义（必须）
├── noise.ts             # 噪声函数（sparkles等转场依赖）
├── color-spaces.ts      # 颜色空间转换（color特效依赖）
└── math-helpers.ts      # 数学辅助函数
```

### 2.0.5 一键复制脚本

创建迁移脚本，一键复制所有 FreeCut 代码：

```bash
# 创建迁移脚本
cat > scripts/migrate-from-freecut.sh << 'EOF'
#!/bin/bash
# FreeCut 代码迁移脚本
# 自动复制 GPU 管线、转场、特效等核心模块

FREECUT_PATH="/tmp/freecut/src/lib"
TARGET_PATH="apps/web/src/core"

echo "=== 开始迁移 FreeCut GPU 模块 ==="

# 1. 创建目录结构
mkdir -p $TARGET_PATH/gpu-{compositor,transitions,effects,media,shared}
mkdir -p $TARGET_PATH/gpu-transitions/transitions
mkdir -p $TARGET_PATH/gpu-effects/effects/{color,blur,distort,stylize,keying}

# 2. 复制 GPU 管线核心代码
echo "复制 GPU 管线..."
cp $FREECUT_PATH/gpu-compositor/*.ts $TARGET_PATH/gpu-compositor/
cp $FREECUT_PATH/gpu-transitions/*.ts $TARGET_PATH/gpu-transitions/
cp $FREECUT_PATH/gpu-effects/*.ts $TARGET_PATH/gpu-effects/
cp $FREECUT_PATH/gpu-media/*.ts $TARGET_PATH/gpu-media/
cp $FREECUT_PATH/gpu-shared/*.ts $TARGET_PATH/gpu-shared/

# 3. 复制18个转场 shader
echo "复制转场 shader..."
cp $FREECUT_PATH/gpu-transitions/transitions/*.ts \
   $TARGET_PATH/gpu-transitions/transitions/

# 4. 复制5大类 GPU 特效
echo "复制 GPU 特效..."
cp -r $FREECUT_PATH/gpu-effects/effects/color/*.ts \
      $TARGET_PATH/gpu-effects/effects/color/
cp -r $FREECUT_PATH/gpu-effects/effects/blur/*.ts \
      $TARGET_PATH/gpu-effects/effects/blur/
cp -r $FREECUT_PATH/gpu-effects/effects/distort/*.ts \
      $TARGET_PATH/gpu-effects/effects/distort/
cp -r $FREECUT_PATH/gpu-effects/effects/stylize/*.ts \
      $TARGET_PATH/gpu-effects/effects/stylize/
cp -r $FREECUT_PATH/gpu-effects/effects/keying/*.ts \
      $TARGET_PATH/gpu-effects/effects/keying/

# 5. 统计复制结果
echo "===迁移完成 ==="
echo "GPU管线: $(ls $TARGET_PATH/gpu-compositor/*.ts | wc -l) 个文件"
echo "转场shader: $(ls $TARGET_PATH/gpu-transitions/transitions/*.ts | wc -l) 个文件"
echo "GPU特效: $(find $TARGET_PATH/gpu-effects/effects -name '*.ts' | wc -l) 个文件"
echo "共享模块: $(ls $TARGET_PATH/gpu-shared/*.ts | wc -l) 个文件"

# 6. 提示后续修改
echo ""
echo "后续需要修改的内容:"
echo "1. 导入路径: @/ → 相对路径或新别名"
echo "2. 日志系统: createLogger → getLogger"
echo "3. 类型定义: 检查并适配冲突"
EOF

chmod +x scripts/migrate-from-freecut.sh
./scripts/migrate-from-freecut.sh
```

### 2.0.6 复制后的必要修改清单

| 文件类型 | 修改内容 | 示例 |
|----------|----------|------|
| **所有 GPU 文件** | 导入路径别名 | `@/shared/logging` → `@/core/logger` |
| **所有 GPU 文件** | 日志函数替换 | `createLogger('X')` → `getLogger('X')` |
| **compositor-pipeline.ts** | 添加类型导出 | `export type { BlendMode }` |
| **transition-pipeline.ts** | 注册到全局管理器 | 添加 `transitionManager.register()` |
| **effects-pipeline.ts** | 创建 neirongmiao 特效注册表 | 适配现有特效系统 |
| **types.ts** | 合并类型定义 | 检查与现有类型冲突 |

---

## 二、目标架构设计

### 2.1 新架构概览

```
┌────────────────────────────────────────────────────────────────┐
│                     neirongmiao (迁移后)                        │
├────────────────────────────────────────────────────────────────┤
│                        应用层                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Step4 视频工作台                                          │  │
│  │  - 视频合并（带转场）                                       │  │
│  │  - 视频镜像                                                │  │
│  │  - 首帧提取                                                │  │
│  │  - 实时预览                                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    核心引擎层                              │  │
│  │  ┌────────────────┐  ┌────────────────┐                  │  │
│  │  │ VideoComposer  │  │ AudioMixer     │                  │  │
│  │  │ (WebGPU合成)   │  │ (AudioWorklet) │                  │  │
│  │  └────────────────┘  └────────────────┘                  │  │
│  │  ┌────────────────┐  ┌────────────────┐                  │  │
│  │  │ TransitionPipe│  │ EffectsPipeline│                  │  │
│  │  │ (18+转场)      │  │ (GPU特效)      │                  │  │
│  │  └────────────────┘  └────────────────┘                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 mediabunny 底层                            │  │
│  │  ┌────────────────┐  ┌────────────────┐                  │  │
│  │  │ Input          │  │ EncodedPacketSink│ ← 导出优化     │  │
│  │  │ (解码入口)     │  │ (编码包提取)    │                  │  │
│  │  └────────────────┘  └────────────────┐                  │  │
│  │  ┌────────────────┐  │ AudioSampleSink  │ ← 音频采样     │  │
│  │  │ BlobSource     │  │ (音频提取)      │                  │  │
│  │  │ StreamSource   │  └────────────────┘                  │  │
│  │  │ UrlSource      │                                      │  │
│  │  └────────────────┘                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块对照表

| @webav 模块 | mediabunny 替代方案 | 说明 |
|-------------|---------------------|------|
| `MP4Clip` | `Input + BlobSource/StreamSource` | 解码入口 |
| `Combinator` | 自建 `VideoComposer`（WebGPU） | 合成引擎 |
| `OffscreenSprite` | 自建 `CompositionLayer` | 时间线层管理 |
| `AudioClip` | `AudioSampleSink` | 音频处理 |
| `ImgClip` | 自建 `ImageLayer` | 图片层 |
| `IClip.tick()` | 自建 `ClipSource.tick()` | 帧获取接口 |
| `Combinator.output()` | `EncodedPacketSink` + WebCodecs | 导出管道 |

---

## 三、详细实施计划

### 阶段 1：基础解码层迁移（2-3 天）

#### 目标
- 替换 MP4Clip 为 mediabunny Input
- 建立统一的视频解码接口

#### 任务清单

```markdown
- [ ] 1.1 安装 mediabunny 依赖
  - npm install mediabunny @mediabunny/ac3 @mediabunny/mp3-encoder
  - 验证版本兼容性

- [ ] 1.2 创建 VideoSource 抽象层
  - 文件：`apps/web/src/core/video-source.ts`
  - 接口设计：
    ```typescript
    interface VideoSource {
      ready: Promise<VideoMeta>;
      meta: VideoMeta;
      tick(time: number): Promise<VideoFrame | null>;
      destroy(): void;
    }
    ```
  - 实现：
    - `BlobVideoSource`（本地文件）
    - `StreamVideoSource`（远程 URL）
    - `OPFSVideoSource`（Origin Private File System）

- [ ] 1.3 迁移 video-frame-extract.ts
  - 替换：MP4Clip → BlobVideoSource
  - 保持接口不变：`extractFirstFrame(options)`
  - 测试：首帧提取功能

- [ ] 1.4 创建 AudioSource 抽象层
  - 文件：`apps/web/src/core/audio-source.ts`
  - 使用 mediabunny AudioSampleSink
  - 支持音量控制、淡入淡出

- [ ] 1.5 单元测试
  - VideoSource 解码测试
  - AudioSource 解码测试
  - 错误处理测试
```

#### 代码示例

```typescript
// apps/web/src/core/video-source.ts

import { Input, BlobSource, StreamSource } from 'mediabunny';

export interface VideoMeta {
  width: number;
  height: number;
  duration: number; // 微秒
  fps: number;
  hasAudio: boolean;
}

export interface VideoSourceOptions {
  file?: File;
  url?: string;
  proxyUrl?: string; // 代理URL（带认证）
}

export class MediabunnyVideoSource {
  private input: Input | null = null;
  private _meta: VideoMeta | null = null;
  private _ready: Promise<VideoMeta>;
  
  constructor(options: VideoSourceOptions) {
    this._ready = this.init(options);
  }
  
  private async init(options: VideoSourceOptions): Promise<VideoMeta> {
    let source;
    
    if (options.file) {
      source = new BlobSource(options.file);
    } else if (options.url) {
      const response = await fetch(options.proxyUrl || options.url);
      source = new StreamSource(response.body!);
    } else {
      throw new Error('必须提供 file 或 url');
    }
    
    this.input = new Input(source);
    
    // 获取元数据
    const videoTrack = this.input.videoTrack;
    const audioTrack = this.input.audioTrack;
    
    this._meta = {
      width: videoTrack?.width ?? 0,
      height: videoTrack?.height ?? 0,
      duration: videoTrack?.duration ?? 0,
      fps: videoTrack?.fps ?? 30,
      hasAudio: audioTrack !== null,
    };
    
    return this._meta;
  }
  
  get ready() { return this._ready; }
  get meta() { return this._meta!; }
  
  async tick(time: number): Promise<VideoFrame | null> {
    if (!this.input) return null;
    return await this.input.videoTrack?.getFrame(time);
  }
  
  destroy() {
    this.input?.destroy();
    this.input = null;
  }
}
```

---

### 阶段 2：GPU 渲染管线搭建（3-5 天）

#### 目标
- 建立基于 WebGPU 的合成引擎
- 移植 FreeCut 的 compositor-pipeline

#### 任务清单

```markdown
- [ ] 2.1 WebGPU 环境检测
  - 文件：`apps/web/src/core/gpu-context.ts`
  - 检测 WebGPU 支持
  - 创建 GPUDevice 管理器
  - 降级方案：WebGPU → WebGL → Canvas 2D

- [ ] 2.2 创建 CompositorPipeline
  - 文件：`apps/web/src/core/gpu-compositor/compositor-pipeline.ts`
  - 移植 FreeCut compositor-pipeline.ts
  - 功能：
    - Ping-pong 纹理合成
    - Blend modes（source-over, additive, multiply, screen, overlay）
    - 变换（scale, rotation, position, 3D perspective）
    - Opacity 动画
    - Mask 纹理支持

- [ ] 2.3 创建 TransitionPipeline
  - 文件：`apps/web/src/core/gpu-transitions/transition-pipeline.ts`
  - 移植 FreeCut transition-pipeline.ts
  - WGSL shader 管理
  - 18+ 转场效果注册

- [ ] 2.4 创建 EffectsPipeline
  - 文件：`apps/web/src/core/gpu-effects/effects-pipeline.ts`
  - 移植 FreeCut effects-pipeline.ts
  - 5 大类特效注册：
    - color: brightness, contrast, saturation, hueRotate
    - blur: gaussianBlur, motionBlur
    - distort: fisheye, ripple
    - stylize: vignette, grain
    - keying: chromaKey, lumaKey

- [ ] 2.5 创建 MediaRenderPipeline
  - 文件：`apps/web/src/core/gpu-media/media-render-pipeline.ts`
  - 视频帧 → GPUTexture 转换
  - 支持 VideoFrame, ImageBitmap, Canvas

- [ ] 2.6 单元测试
  - CompositorPipeline 合成测试
  - TransitionPipeline 转场测试
  - EffectsPipeline 特效测试
```

#### WGSL Shader 移植示例

```typescript
// apps/web/src/core/gpu-transitions/transitions/dissolve-variants.ts

import type { GpuTransitionDefinition } from '../types';

// additiveDissolve - 叠化时中间帧叠加闪光
export const additiveDissolve: GpuTransitionDefinition = {
  id: 'additiveDissolve',
  name: 'Additive Dissolve',
  category: 'dissolve',
  hasDirection: false,
  entryPoint: 'additiveDissolveFragment',
  uniformSize: 16,
  shader: /* wgsl */ `
struct AdditiveDissolveParams {
  progress: f32,
  width: f32,
  height: f32,
  _pad: f32,
};

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var leftTex: texture_2d<f32>;
@group(0) @binding(2) var rightTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: AdditiveDissolveParams;

@fragment
fn additiveDissolveFragment(input: VertexOutput) -> @location(0) vec4f {
  let p = clamp(params.progress, 0.0, 1.0);
  let left = textureSample(leftTex, texSampler, input.uv);
  let right = textureSample(rightTex, texSampler, input.uv);
  let base = left.rgb * (1.0 - p) + right.rgb * p;
  let flash = (left.rgb + right.rgb) * sin(p * PI) * 0.22;
  return vec4f(clamp(base + flash, vec3f(0.0), vec3f(1.0)), mix(left.a, right.a, p));
}`,
  packUniforms: (progress, width, height) => new Float32Array([progress, width, height, 0]),
};

// blurDissolve - 模糊叠化
export const blurDissolve: GpuTransitionDefinition = {
  id: 'blurDissolve',
  name: 'Blur Dissolve',
  category: 'dissolve',
  hasDirection: false,
  entryPoint: 'blurDissolveFragment',
  uniformSize: 16,
  shader: /* wgsl */ `
struct BlurDissolveParams {
  progress: f32,
  width: f32,
  height: f32,
  strength: f32,
};

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var leftTex: texture_2d<f32>;
@group(0) @binding(2) var rightTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: BlurDissolveParams;

fn sampleSoft(tex: texture_2d<f32>, uv: vec2f, radius: vec2f) -> vec4f {
  let center = textureSample(tex, texSampler, uv);
  let a = textureSample(tex, texSampler, clamp(uv + vec2f(radius.x, 0.0), vec2f(0.0), vec2f(1.0)));
  let b = textureSample(tex, texSampler, clamp(uv - vec2f(radius.x, 0.0), vec2f(0.0), vec2f(1.0)));
  let c = textureSample(tex, texSampler, clamp(uv + vec2f(0.0, radius.y), vec2f(0.0), vec2f(1.0)));
  let d = textureSample(tex, texSampler, clamp(uv - vec2f(0.0, radius.y), vec2f(0.0), vec2f(1.0)));
  return center * 0.36 + (a + b + c + d) * 0.16;
}

@fragment
fn blurDissolveFragment(input: VertexOutput) -> @location(0) vec4f {
  let p = clamp(params.progress, 0.0, 1.0);
  let envelope = sin(p * PI);
  let radius = vec2f(1.0 / params.width, 1.0 / params.height) * params.strength * envelope;
  let left = sampleSoft(leftTex, input.uv, radius);
  let right = sampleSoft(rightTex, input.uv, radius);
  let t = 0.5 - 0.5 * cos(p * PI);
  return mix(left, right, t);
}`,
  packUniforms: (progress, width, height, _direction, properties) => {
    const strength = (properties?.strength as number) ?? 9;
    return new Float32Array([progress, width, height, strength]);
  },
};
```

---

### 阶段 3：合成引擎核心（4-6 天）

#### 目标
- 实现 VideoComposer（替代 Combinator）
- 实现时间线管理

#### 任务清单

```markdown
- [ ] 3.1 创建 CompositionLayer 接口
  - 文件：`apps/web/src/core/composition/composition-layer.ts`
  - 接口：
    ```typescript
    interface CompositionLayer {
      source: VideoSource | AudioSource | ImageSource;
      time: { offset: number; duration: number };
      rect: { x: number; y: number; w: number; h: number };
      opacity: number;
      blendMode: BlendMode;
      effects: EffectInstance[];
      animation?: KeyframeAnimation;
      destroy(): void;
    }
    ```

- [ ] 3.2 创建 VideoComposer
  - 文件：`apps/web/src/core/composition/video-composer.ts`
  - 功能：
    - 多层合成（视频、图片、文字）
    - 时间线管理
    - 实时预览
    - 帧缓存优化

- [ ] 3.3 创建 KeyframeAnimation
  - 文件：`apps/web/src/core/composition/keyframe-animation.ts`
  - 支持属性：
    - opacity（透明度）
    - rect.position（位置）
    - rect.scale（缩放）
    - rect.rotation（旋转）
    - effects.params（特效参数）

- [ ] 3.4 创建 AudioMixer
  - 文件：`apps/web/src/core/audio/audio-mixer.ts`
  - 使用 AudioWorklet
  - 功能：
    - 多音轨混音
    - 音量控制
    - 淡入淡出
    - 变调（SoundTouch）

- [ ] 3.5 迁移 video-merge.ts
  - 替换：Combinator → VideoComposer
  - 替换：MP4Clip → MediabunnyVideoSource
  - 替换：OffscreenSprite → CompositionLayer
  - 保持接口：`mergeVideosWithTransitions(options)`
  - 新功能：GPU 转场替代 opacity 动画

- [ ] 3.6 迁移 video-mirror.ts
  - 替换：Combinator → VideoComposer
  - 新功能：GPU flip 特效替代 tickInterceptor

- [ ] 3.7 单元测试
  - VideoComposer 合成测试
  - KeyframeAnimation 动画测试
  - AudioMixer 混音测试
```

#### VideoComposer 核心实现

```typescript
// apps/web/src/core/composition/video-composer.ts

import { CompositorPipeline, TransitionPipeline, EffectsPipeline } from '../gpu';
import type { CompositionLayer } from './composition-layer';

export interface VideoComposerOptions {
  width: number;
  height: number;
  bgColor?: string;
  bitrate?: number;
}

export class VideoComposer {
  private device: GPUDevice | null = null;
  private compositor: CompositorPipeline | null = null;
  private transitionPipeline: TransitionPipeline | null = null;
  private effectsPipeline: EffectsPipeline | null = null;
  private layers: CompositionLayer[] = [];
  private outputCanvas: OffscreenCanvas | null = null;
  
  constructor(options: VideoComposerOptions) {
    this.init(options);
  }
  
  private async init(options: VideoComposerOptions): Promise<void> {
    // 检测 WebGPU
    if (!navigator.gpu) {
      throw new Error('WebGPU 不支持，请使用最新 Chrome');
    }
    
    const adapter = await navigator.gpu.requestAdapter();
    this.device = await adapter?.requestDevice();
    
    if (!this.device) {
      throw new Error('无法创建 GPUDevice');
    }
    
    // 创建管线
    this.compositor = new CompositorPipeline(this.device);
    this.transitionPipeline = new TransitionPipeline(this.device);
    this.effectsPipeline = new EffectsPipeline(this.device);
    
    // 创建输出画布
    this.outputCanvas = new OffscreenCanvas(options.width, options.height);
  }
  
  addLayer(layer: CompositionLayer): void {
    this.layers.push(layer);
  }
  
  removeLayer(layer: CompositionLayer): void {
    const index = this.layers.indexOf(layer);
    if (index >= 0) {
      this.layers.splice(index, 1);
      layer.destroy();
    }
  }
  
  /**
   * 渲染指定时间点的帧
   */
  async renderFrame(time: number): Promise<VideoFrame | null> {
    if (!this.device || !this.compositor || !this.outputCanvas) {
      return null;
    }
    
    // 1. 获取所有可见层的帧
    const visibleLayers = this.layers.filter(layer => {
      const { offset, duration } = layer.time;
      return time >= offset && time < offset + duration;
    });
    
    // 2. 为每个层获取源帧
    const layerFrames = await Promise.all(
      visibleLayers.map(async layer => {
        const relativeTime = time - layer.time.offset;
        const frame = await layer.source.tick(relativeTime);
        return { layer, frame };
      })
    );
    
    // 3. GPU 渲染管线
    //   - 应用特效
    //   - 应用转场
    //   - 合成叠加
    
    let baseTexture = this.compositor.createBaseTexture();
    
    for (const { layer, frame } of layerFrames) {
      if (!frame) continue;
      
      // 转换为 GPUTexture
      let layerTexture = this.device.createTexture({
        size: [frame.displayWidth, frame.displayHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      
      this.device.queue.copyExternalImageToTexture(
        { source: frame },
        { texture: layerTexture },
        [frame.displayWidth, frame.displayHeight]
      );
      
      // 应用特效
      if (layer.effects.length > 0) {
        layerTexture = await this.effectsPipeline.apply(layerTexture, layer.effects);
      }
      
      // 合成到基座
      baseTexture = await this.compositor.compose(baseTexture, layerTexture, {
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        rect: layer.rect,
      });
      
      // 清理临时纹理
      layerTexture.destroy();
      frame.close();
    }
    
    // 4. 输出到 Canvas
    const outputTexture = this.compositor.blitToCanvas(baseTexture, this.outputCanvas);
    
    // 5. 创建 VideoFrame
    const outputFrame = new VideoFrame(this.outputCanvas, { timestamp: time });
    
    // 清理
    baseTexture.destroy();
    outputTexture?.destroy();
    
    return outputFrame;
  }
  
  destroy(): void {
    this.layers.forEach(layer => layer.destroy());
    this.layers = [];
    this.compositor?.destroy();
    this.transitionPipeline?.destroy();
    this.effectsPipeline?.destroy();
    this.device?.destroy();
  }
}
```

---

### 阶段 4：导出优化（2-3 天）

#### 目标
- 实现 EncodedPacketSink 导出
- 大幅提升导出速度

#### 任务清单

```markdown
- [ ] 4.1 创建 ExportPipeline
  - 文件：`apps/web/src/core/export/export-pipeline.ts`
  - 使用 mediabunny EncodedPacketSink
  - WebCodecs 编码器配置
  - 支持格式：MP4, WebM, MOV

- [ ] 4.2 实现编码包直接提取
  - 保留原始编码（无需重编码）
  - 流式导出（边合成边导出）
  - 进度监控

- [ ] 4.3 实现重新编码模式
  - 用于特效/转场后的视频
  - H.264/H.265/VP9/AV1 编码器选择
  - 质量配置（bitrate, quality）

- [ ] 4.4 迁移导出功能
  - 替换 Combinator.output() → ExportPipeline
  - 保持接口兼容

- [ ] 4.5 性能测试
  - 对比导出速度
  - 内存占用监控
  - 大文件处理测试（>1GB）
```

#### EncodedPacketSink 导出示例

```typescript
// apps/web/src/core/export/export-pipeline.ts

import { EncodedPacketSink, Input, BlobSource } from 'mediabunny';

export interface ExportOptions {
  sources: MediabunnyVideoSource[];
  composer: VideoComposer;
  format: 'mp4' | 'webm' | 'mov';
  codec: 'h264' | 'h265' | 'vp9' | 'av1';
  bitrate: number;
  onProgress?: (percent: number) => void;
}

export class ExportPipeline {
  /**
   * 快速导出（保留原始编码）
   * 用于无特效的简单拼接
   */
  static async quickExport(options: ExportOptions): Promise<Blob> {
    const { sources, format, onProgress } = options;
    
    // 创建编码包接收器
    const chunks: Uint8Array[] = [];
    
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const sink = new EncodedPacketSink(source.input!.videoTrack!);
      
      // 直接提取编码包
      const packets = await sink.extractAllPackets();
      chunks.push(...packets);
      
      onProgress?.(Math.floor((i + 1) / sources.length * 100));
    }
    
    // 封装为 MP4
    return new Blob(chunks, { type: `video/${format}` });
  }
  
  /**
   * 完整导出（重新编码）
   * 用于有特效/转场的视频
   */
  static async fullExport(options: ExportOptions): Promise<Blob> {
    const { composer, codec, bitrate, onProgress } = options;
    
    // 创建编码器
    const encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        // 收集编码块
      },
      error: (e) => console.error('编码错误:', e),
    });
    
    encoder.configure({
      codec: codec === 'h264' ? 'avc1.42001E' : 'vp09.00.10.08',
      width: composer.width,
      height: composer.height,
      bitrate,
      framerate: 30,
    });
    
    // 渲染 + 编码循环
    const totalDuration = composer.totalDuration;
    const frameDuration = 33333; // 30fps
    let time = 0;
    
    while (time < totalDuration) {
      const frame = await composer.renderFrame(time);
      if (frame) {
        encoder.encode(frame);
        frame.close();
      }
      
      onProgress?.(Math.floor(time / totalDuration * 100));
      time += frameDuration;
    }
    
    await encoder.flush();
    encoder.close();
    
    // 封装
    return new Blob(chunks, { type: 'video/mp4' });
  }
}
```

---

### 阶段 5：集成测试与优化（3-5 天）

#### 目标
- 全流程集成测试
- 性能优化
- 兼容性处理

#### 任务清单

```markdown
- [ ] 5.1 功能回归测试
  - 首帧提取
  - 视频镜像
  - 视频合并（带转场）
  - 背景音乐添加
  - 封面图片支持

- [ ] 5.2 性能优化
  - GPU 纹理池复用
  - 帧缓存策略
  - 内存泄漏排查
  - WebGPU 资源管理

- [ ] 5.3 兼容性处理
  - WebGPU 检测与降级
  - 浏览器兼容性测试：
    - Chrome 113+（WebGPU）
    - Firefox（WebGPU 实验性）
    - Safari（WebGPU 支持）
  - 降级方案：
    - WebGPU → WebGL 2.0
    - WebGL → Canvas 2D

- [ ] 5.4 文档更新
  - CLAUDE.md 技术栈更新
  - API 文档
  - 迁移日志

- [ ] 5.5 清理旧依赖
  - 移除 @webav/av-cliper
  - 移除 @webav/av-canvas
  - 清理旧代码

- [ ] 5.6 上线准备
  - 代码审查
  - 性能基准测试
  - 发布计划
```

---

## 四、风险与应对

### 4.1 技术风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| **WebGPU 浏览器支持不足** | 高 | 三级降级方案：WebGPU → WebGL → Canvas 2D |
| **WGSL shader 移植错误** | 中 | 逐个 shader 单元测试，参考 FreeCut 测试用例 |
| **mediabunny API 变更** | 中 | 锁定版本，跟进 GitHub 更新 |
| **性能不及预期** | 中 | 基准测试，优化纹理池和帧缓存 |
| **内存泄漏** | 高 | GPU 资源追踪，定期清理 |

### 4.2 业务风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| **功能中断** | 高 | 分阶段迁移，每阶段独立可用 |
| **用户体验下降** | 中 | 保持接口兼容，用户无感知 |
| **导出质量下降** | 中 | 对比测试，确保质量无损 |

---

## 五、回退方案

### 5.1 部分回退

如果某个阶段失败，可以：
- **阶段 1 失败**：保留 MP4Clip，仅替换 Combinator
- **阶段 2 失败**：使用 WebGL 替代 WebGPU
- **阶段 3 失败**：保留 OffscreenSprite，仅用 GPU 转场
- **阶段 4 失败**：保留 Combinator.output()，仅优化编码器

### 5.2 完全回退

保留 `@webav` 依赖，创建双轨架构：

```typescript
// apps/web/src/core/video-source-factory.ts

export function createVideoSource(options: VideoSourceOptions): VideoSource {
  if (useMediabunny && isWebGPUSupported()) {
    return new MediabunnyVideoSource(options);
  } else {
    return new WebavVideoSource(options); // 兼容层
  }
}
```

---

## 六、验收标准

### 6.1 功能验收

| 功能 |验收标准 |
|------|----------|
| 首帧提取 | 100% 成功，速度 ≥ @webav |
| 视频镜像 | 100% 成功，GPU flip 特效 |
| 视频合并 | 支持所有转场类型，无重影 |
| GPU 转场 | 18+ 转场效果可用 |
| GPU 特效 | 5 大类特效可用 |
| 绿幕抠像 | chromaKey 可用 |
| 导出速度 | ≥ @webav 5 倍 |

### 6.2 性能验收

| 指标 | 目标 |
|------|------|
| 预览帧率 | ≥ 30fps（1080p） |
| 导出速度 | ≥ 5 倍提升 |
| 内存占用 | ≤ 500MB（10 个1080p 视频源） |
| GPU 资源 | 无泄漏，纹理池复用 |

---

## 七、资源需求

### 7.1 人力

- **主开发**：1 人（14-21 天）
- **代码审查**：1 人（每阶段 0.5 天）
- **测试**：1 人（3-5 天）

### 7.2 依赖

```json
{
  "dependencies": {
    "mediabunny": "^1.44.2",
    "@mediabunny/ac3": "^1.34.3",
    "@mediabunny/mp3-encoder": "^1.27.0"
  }
}
```

---

## 八、里程碑

| 里程碑 | 完成标志 | 预计日期 |
|--------|----------|----------|
| **M1：基础解码** | VideoSource/AudioSource 可用 | 第 3 天 |
| **M2：GPU管线** | CompositorPipeline 可用 | 第 8 天 |
| **M3：合成引擎** | VideoComposer 可用 | 第 14 天 |
| **M4：导出优化** | ExportPipeline 可用 | 第 17 天 |
| **M5：集成上线** | 全流程可用，移除 @webav | 第 21 天 |

---

## 九、附录

### A. mediabunny API 速查

```typescript
//输入源
import { BlobSource, StreamSource, UrlSource } from 'mediabunny';

// 解码入口
import { Input } from 'mediabunny';
const input = new Input(new BlobSource(file));

// 编码包提取
import { EncodedPacketSink } from 'mediabunny';
const sink = new EncodedPacketSink(input.videoTrack);
const packets = await sink.extractAllPackets();

// 音频采样提取
import { AudioSampleSink } from 'mediabunny';
const audioSink = new AudioSampleSink(input.audioTrack);
const samples = await audioSink.extractAllSamples();
```

### B. FreeCut 源码参考

| 模块 | FreeCut 源码位置 |
|------|------------------|
| CompositorPipeline | `/tmp/freecut/src/lib/gpu-compositor/compositor-pipeline.ts` |
| TransitionPipeline | `/tmp/freecut/src/lib/gpu-transitions/transition-pipeline.ts` |
| EffectsPipeline | `/tmp/freecut/src/lib/gpu-effects/effects-pipeline.ts` |
| MediaRenderPipeline | `/tmp/freecut/src/lib/gpu-media/media-render-pipeline.ts` |
| Dissolve转场 | `/tmp/freecut/src/lib/gpu-transitions/transitions/dissolve-variants.ts` |
| Sparkles转场 | `/tmp/freecut/src/lib/gpu-transitions/transitions/sparkles.ts` |
| Glitch转场 | `/tmp/freecut/src/lib/gpu-transitions/transitions/glitch.ts` |
| ChromaKey特效 | `/tmp/freecut/src/lib/gpu-effects/effects/keying/chroma-key.ts` |

### C. 目录结构规划

```
apps/web/src/core/
├── video-source.ts          # 视频解码抽象
├── audio-source.ts          # 音频解码抽象
├── image-source.ts          # 图片源抽象
├── gpu-context.ts           # WebGPU 环境管理
├── gpu-compositor/
│   ├── compositor-pipeline.ts
│   ├── blend-modes.ts
│   └── corner-pin.ts
├── gpu-transitions/
│   ├── transition-pipeline.ts
│   ├── types.ts
│   ├── common.ts
│   └── transitions/
│       ├── dissolve-variants.ts
│       ├── sparkles.ts
│       ├── glitch.ts
│       ├── light-leak-burn.ts
│       └── ... (15+ more)
├── gpu-effects/
│   ├── effects-pipeline.ts
│   ├── types.ts
│   └── effects/
│       ├── color/
│       ├── blur/
│       ├── distort/
│       ├── stylize/
│       └── keying/
├── gpu-media/
│   ├── media-render-pipeline.ts
│   └── media-blend-pipeline.ts
├── composition/
│   ├── composition-layer.ts
│   ├── video-composer.ts
│   ├── keyframe-animation.ts
│   └── audio-mixer.ts
├── export/
│   ├── export-pipeline.ts
│   ├── encoder-config.ts
│   └── muxer.ts
└── fallback/
    ├── webgl-compositor.ts   # WebGL 降级
    └── canvas-compositor.ts  # Canvas 2D 降级
```

---

**文档版本**：v1.0
**创建日期**：2026-05-10
**作者**：Claude Code
**审阅状态**：待审阅