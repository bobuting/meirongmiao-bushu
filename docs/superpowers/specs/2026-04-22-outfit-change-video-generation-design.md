# 服装换装视频生成系统设计规格

> 版本：2026-04-22
> 状态：已确认

## 1. 概述

### 1.1 项目背景

为 AI 电商短视频生成平台新增**服装换装视频生成**能力，支持用户上传参考视频后，将视频中的服装替换为目标服装，保持演员、动作、场景不变，生成换装后的新视频。

### 1.2 核心目标

- **服装换装**：保持原视频的演员、动作、场景，只替换服装
- **支持双角色类型**：真人模特 + AI 虚拟人物
- **极致精度追求**：在当前技术边界内追求最优效果（75-85% 视觉一致性）
- **商业化产品**：可规模化、自动化运行

### 1.3 技术约束

- 纯 AI 生成方案，不依赖传统视频合成技术
- 视频时长范围：15-60 秒
- 服装类型不限（连衣裙、上衣+裤子、外套等）
- 已有服装库和角色库数据基础

### 1.4 技术现实说明

当前 AI 视频生成技术（Sora、可灵、Runway Gen-3 等）存在固有限制：
- 无法实现逐像素精度的精确复刻
- 动态褶皱、光影变化难以精确控制
- 动作一致性可保持大致动作，但细节姿态会有偏差
- 本系统在技术边界内追求最优效果，而非完美复刻

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    服装换装视频生成系统                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │   输入层    │ → │   处理层    │ → │   输出层    │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
│                                                                 │
│  输入层：                                                        │
│  • 原视频（15-60秒）                                             │
│  • 目标服装图（来自服装库）                                       │
│  • 角色信息（来自角色库，真人/AI角色）                            │
│                                                                 │
│  处理层（5阶段流水线）：                                          │
│  • Stage 0: 参考图采集模块                                       │
│  • Stage 1: 视频理解模块                                         │
│  • Stage 2: 角色服装适配模块                                     │
│  • Stage 3: 视频生成模块                                         │
│  • Stage 4: 精调优化模块                                         │
│                                                                 │
│  输出层：                                                        │
│  • 换装后的视频文件                                              │
│  • 生成日志和审计记录                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 与现有项目的集成

- 作为**新的独立功能模块**接入现有 6 步工作流
- 可作为 Step4 的扩展能力，或独立的"换装生成"入口
- 复用现有角色库（Step2 输出）和服装库（Step1 输出）
- 复用现有对象存储（S3/OSS）、任务队列机制

---

## 3. 核心模块设计

### 3.1 Stage 0: 参考图采集模块

**功能职责**
- 从原视频中智能选取关键帧
- 提取背景、角色、色彩风格三类参考图
- 生成结构化的参考数据

**技术实现**

| 采集类型 | 技术方法 | 输出格式 |
|---------|---------|---------|
| 背景参考图 | 场景变化检测 + 静止帧识别 | 2-3 张背景清晰的关键帧 |
| 角色参考图 | 人脸检测 + 姿态评估 + 清晰度评分 | 正面/侧面各 1 张最佳帧 |
| 色彩风格参考图 | 多帧色彩分析 + 色调聚类 + 风格图生成 | 1 张色彩风格特征图 |

**数据结构**
```typescript
interface ReferenceCaptureResult {
  backgroundFrames: string[];      // 背景参考图 URL
  characterFrames: {
    front: string;                 // 正面图
    side?: string;                 // 侧面图（可选）
  };
  colorStyleFrame: string;         // 色彩风格图
  metadata: {
    sourceVideoId: string;
    captureTimestamps: number[];   // 采集的时间点（秒）
    qualityScore: number;          // 整体质量评分 0-1
  };
}
```

---

### 3.2 Stage 1: 视频理解模块

**功能职责**
- 分析原视频的动作序列
- 提取骨架/姿态数据
- 生成动作驱动的控制信号

**技术实现**

| 子任务 | 技术方法 | 输出 |
|-------|---------|-----|
| 动作提取 | 姿态估计算法（MediaPipe / DWPose） | 每帧骨架坐标序列 |
| 动作时序分析 | 动作识别 + 关键动作标注 | 动作类型 + 时间段标记 |
| 骨架数据生成 | 姿态序列标准化 | JSON 格式骨架数据流 |

**数据结构**
```typescript
interface VideoUnderstandingResult {
  poseSequence: PoseFrame[];       // 每帧姿态数据
  actionSegments: ActionSegment[]; // 动作分段标记
  duration: number;                // 视频时长（秒）
  fps: number;                     // 原视频帧率
}

interface PoseFrame {
  timestamp: number;               // 时间点（秒）
  keypoints: Keypoint[];           // 骨架关键点坐标
  confidence: number;              // 检测置信度 0-1
}

interface ActionSegment {
  startTime: number;
  endTime: number;
  actionType: string;              // 如 'walking', 'turning', 'posing'
}
```

---

### 3.3 Stage 2: 角色服装适配模块

**功能职责**
- 将目标服装适配到角色身上
- 保持角色原有特征（真人/AI角色）
- 生成换装后的角色参考图

**技术实现**

| 子任务 | 技术方法 | 输出 |
|-------|---------|-----|
| 服装适配 | Stable Diffusion + ControlNet | 换装角色图 |
| 角色特征保持 | 角色参考图作为条件输入 | 保持五官/体型一致 |
| 背景融合 | 背景参考图作为环境提示 | 场景融合自然 |

**数据结构**
```typescript
interface CharacterAdaptResult {
  adaptedCharacterImage: string;  // 换装后角色图 URL
  characterPreservationScore: number; // 角色保持度评分 0-1
  outfitFitScore: number;         // 服装适配度评分 0-1
  metadata: {
    sourceCharacterId: string;
    sourceOutfitId: string;
    generationModel: string;
  };
}
```

---

### 3.4 Stage 3: 视频生成模块

**功能职责**
- 使用动作数据驱动换装角色生成视频
- 保持动作序列与原视频一致
- 融合参考图确保场景/角色/风格一致性

**技术实现**

| 子任务 | 技术方法 | 输出 |
|-------|---------|-----|
| 动作驱动生成 | 可灵 / Runway Gen-3 / Animate Anyone | 视频帧序列 |
| 角色一致性 | 换装角色图 + 参考图作为条件 | 保持角色外观 |
| 场景一致性 | 背景参考图作为场景提示 | 保持环境一致 |

**数据结构**
```typescript
interface VideoGenerationResult {
  generatedVideoUrl: string;      // 生成的视频 URL
  frameCount: number;             // 总帧数
  consistencyScores: {
    action: number;               // 动作一致性 0-1
    character: number;            // 角色一致性 0-1
    scene: number;                // 场景一致性 0-1
  };
  generationTime: number;         // 生成耗时（秒）
}
```

---

### 3.5 Stage 4: 精调优化模块

**功能职责**
- 修正色调偏差，匹配原视频色彩风格
- 优化光影细节一致性
- 提升整体视觉质量

**技术实现**

| 子任务 | 技术方法 | 输出 |
|-------|---------|-----|
| 色彩风格修正 | 色彩迁移 + 风格迁移算法 | 调色后视频 |
| 光影优化 | 光照分析 + 阴影修正 | 光影一致性提升 |
| 质量增强 | Real-ESRGAN / Topaz 超分辨率 | 最终高质量视频 |

**数据结构**
```typescript
interface RefinementResult {
  finalVideoUrl: string;          // 最终视频 URL
  refinementApplied: {
    colorCorrection: boolean;
    lightingAdjustment: boolean;
    qualityEnhancement: boolean;
  };
  finalQualityScore: number;      // 最终质量评分 0-1
  improvementRatio: number;       // 相比 Stage 3 的提升比例
}
```

---

## 4. 数据流与错误处理

### 4.1 整体数据流

```
用户输入 → Stage 0 → ReferenceCaptureResult
                      ↓
         Stage 1 → VideoUnderstandingResult
                      ↓
         Stage 2 → CharacterAdaptResult
                      ↓
         Stage 3 → VideoGenerationResult
                      ↓
         Stage 4 → RefinementResult
                      ↓
               最终视频输出
```

### 4.2 错误处理策略

| 错误类型 | 处理方式 | 用户反馈 |
|---------|---------|---------|
| Stage 0 失败 | 视频解析失败、无有效关键帧 | 提示"视频质量不足，请更换更清晰的视频" |
| Stage 1 失败 | 姿态检测置信度过低 | 提示"动作提取失败，视频动作过于复杂或模糊" |
| Stage 2 失败 | 服装适配生成失败 | 提示"服装适配失败，请检查服装图片质量" |
| Stage 3 失败 | 视频生成超时/失败 | 提示"视频生成失败，系统繁忙请稍后重试" |
| Stage 4 失败 | 精调优化失败 | 返回 Stage 3 结果 + 提示"优化失败，已返回基础版本" |
| 整体超时 | 处理时间超过限制 | 提示"处理超时，请缩短视频时长或简化动作" |

### 4.3 重试与降级配置

```typescript
interface ErrorHandlingConfig {
  maxRetries: number;              // 每阶段最大重试次数（默认 2）
  retryDelayMs: number;            // 重试间隔（默认 3000ms）
  fallbackStrategy: {
    stage4: 'return-stage3';       // Stage 4 失败返回 Stage 3 结果
    stage3: 'notify-user';         // Stage 3 失败通知用户重试
    stage0to2: 'abort';            // Stage 0-2 失败中止流程
  };
  timeoutMinutes: number;          // 整体超时时间（默认 10 分钟）
}
```

---

## 5. 测试策略

### 5.1 测试覆盖范围

| 测试类型 | 覆盖内容 | 验证目标 |
|---------|---------|---------|
| 单元测试 | 各模块核心函数 | 函数逻辑正确性 |
| 集成测试 | 5 阶段流水线串联运行 | 数据流正确传递、接口兼容 |
| E2E 测试 | 完整换装流程 | 用户体验流畅、结果符合预期 |
| 性能测试 | 不同视频时长、动作复杂度 | 处理效率满足商业要求 |
| 质量测试 | 生成结果一致性评分 | 精度达到预期范围（75-85%） |

### 5.2 性能评估指标

| 指标 | 目标值 |
|-----|-------|
| 处理时间 | 15 秒视频 ≤ 3 分钟，60 秒视频 ≤ 10 分钟 |
| 成功率 | ≥ 90%（首次成功） |
| 一致性评分 | 75-85% 视觉一致 |
| 并发能力 | 支持 10 个任务并发 |
| 资源消耗 | 单任务 GPU 显存 ≤ 16GB |

### 5.3 质量评估方法

**自动化评分**
- 动作一致性：姿态序列对比（帧匹配率）
- 角色一致性：人脸特征对比（相似度评分）
- 场景一致性：背景特征对比（结构相似度 SSIM）

**人工评审**
- 随机抽样 10% 输出视频进行人工质量评估
- 评审维度：服装细节、动作流畅度、光影自然度、整体视觉一致性
- 评审结果用于模型调优和阈值调整

---

## 6. Skill 系统集成

### 6.1 Skill 定义与管理

所有大模型调用统一通过项目的 **Skill 提示词管理系统**进行管理，禁止硬编码提示词。

**Skill 文件结构**
```
skills/outfit_change_video_generation/
├── SKILL.md              # 元数据定义（frontmatter 格式）
├── system.hbs            # System Prompt 模板
├── user.hbs              # User Prompt 模板
├── examples.json         # 示例数据
├── schema.ts             # 输入 Schema 定义
└── variants/             # 变体（可选）
    ├── stage0_capture/   # Stage 0 参考图采集
    ├── stage1_understand/ # Stage 1 视频理解
    ├── stage2_adapt/     # Stage 2 角色服装适配
    ├── stage3_generate/  # Stage 3 视频生成
    └── stage4_refine/    # Stage 4 精调优化
```

### 6.2 各阶段 Skill 调用

| 阶段 | Skill Code | 用途 | 模型选择 |
|-----|-----------|-----|---------|
| Stage 0 | `outfit_change_stage0_capture` | 关键帧分析、参考图提取 | GPT-4V / Gemini Vision |
| Stage 1 | `outfit_change_stage1_understand` | 姿态提取、动作识别 | GPT-4V / Claude Vision |
| Stage 2 | `outfit_change_stage2_adapt` | 服装适配、角色图生成 | Stable Diffusion + ControlNet |
| Stage 3 | `outfit_change_stage3_generate` | 动作驱动视频生成 | 可灵 / Runway Gen-3 |
| Stage 4 | `outfit_change_stage4_refine` | 色彩迁移、质量增强 | 风格迁移模型 + Real-ESRGAN |

### 6.3 Skill 调用方式

```typescript
import { SkillLoader } from '@/services/skills/skill-loader.js';

const skillLoader = new SkillLoader('skills');

// 加载 Skill
const skill = await skillLoader.load('outfit_change_stage2_adapt');

// 构建输入变量
const variables = {
  userInput: `
【角色参考图】
${characterReferenceUrl}

【目标服装】
${outfitImageUrl}

【背景参考】
${backgroundReferenceUrl}
  `.trim()
};

// 获取完整提示词
const systemPrompt = await skill.compileSystemPrompt({});
const userPrompt = await skill.compileUserPrompt(variables);

// 调用 LLM 传输层
const result = await llmTransport.generateImage({
  systemPrompt,
  userPrompt,
  model: 'stable-diffusion-controlnet'
});
```

### 6.4 Skill 元数据示例

```yaml
---
code: outfit_change_stage2_adapt
name: 服装换装-角色服装适配
description: 将目标服装适配到角色身上，保持角色特征不变
category: outfit_change
tags: [服装, 适配, 图像生成]
version: 1.0.0
author: system
defaultVariant: default
includes:
  rules:
    - character-preservation
    - outfit-fitting
---
```

### 6.5 技术依赖清单

| 类别 | 技术选型 | 用途 | Skill 调用方式 |
|-----|---------|-----|---------------|
| 视觉理解 | GPT-4V / Gemini Vision | Stage 0/1 视频分析 | `outfit_change_stage0_capture`, `outfit_change_stage1_understand` |
| 图像生成 | Stable Diffusion + ControlNet | Stage 2 服装适配 | `outfit_change_stage2_adapt` |
| 视频生成 | 可灵 / Runway Gen-3 | Stage 3 动作驱动 | `outfit_change_stage3_generate` |
| 图像处理 | Real-ESRGAN / Topaz | Stage 4 质量增强 | `outfit_change_stage4_refine` |

---

## 7. 实现路径

### 7.1 阶段划分

| 阶段 | 目标 | 预计周期 |
|-----|-----|---------|
| Phase 1 | 实现 Stage 0-3 核心流水线，验证基本功能 | 4-6 周 |
| Phase 2 | 实现 Stage 4 精调模块，提升一致性至 75-80% | 2-3 周 |
| Phase 3 | 完善错误处理、并发能力、用户界面 | 2-3 周 |

### 7.2 与现有项目集成点

| 集成位置 | 说明 |
|---------|-----|
| 角色库复用 | Step2 输出的角色数据作为输入 |
| 服装库复用 | Step1 输出的服装图片库作为换装素材 |
| 路由扩展 | 在 `src/routes/` 中新增换装生成路由 |
| 任务队列 | 复用现有视频任务队列机制 |
| 存储层 | 复用现有对象存储（S3/OSS） |

---

## 8. 风险与约束

| 风险点 | 影响 | 缓解措施 |
|-------|-----|---------|
| AI 模型能力限制 | 无法达到逐像素精度 | 明确告知用户技术边界，设定合理预期 |
| 处理时间较长 | 用户体验等待 | 提供进度反馈，支持异步处理和通知 |
| 计算成本高 | 商业化成本压力 | 按视频时长/复杂度分级定价 |
| 真人角色适配难度 | 五官保持不稳定 | 增强角色参考图采集质量，优化模型参数 |

---

## 9. 附录

### 9.1 参考图采集详情

| 采集内容 | 具体信息 | 采集时机/方法 |
|---------|---------|--------------|
| 背景参考图 | 场景环境、物体位置、光源方向、环境色调 | 动作静止帧或背景清晰可见的关键帧 |
| 角色参考图 | 五官特征、体型轮廓、发型发色、皮肤质感 | 正面/侧面清晰可见的关键帧 |
| 色彩风格参考图 | 整体色调、光影分布、饱和度、阴影高光风格 | 分析多帧色彩分布，生成色彩风格图 |

### 9.2 参考图在各阶段的使用

| 阶段 | 使用的参考图 | 作用 |
|-----|-------------|-----|
| Stage 1 | 角色参考图 | 提取骨架时识别角色关节位置 |
| Stage 2 | 角色参考图 + 背景参考图 | 生成换装角色图时保持角色特征和背景融合 |
| Stage 3 | 全部参考图 | 视频生成时保持场景/角色/风格一致性 |
| Stage 4 | 色彩风格参考图 | 精调时修正色调偏差，匹配原视频风格 |