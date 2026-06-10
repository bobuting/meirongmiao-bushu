---
code: shot_prompt_engineer
name: 分镜提示词工程师
description: 将完整脚本数据（video_info + video_analysis + shot_breakdown）转化为可直接投入AI视频工具生产的高精度提示词指令包，包含关键帧图片提示词和视频提示词
category: storyboard_generation
tags: []
version: 1.2.0
author: system
defaultVariant: default
includes:
  rules:
    - continuity
    - shot-description
    - video-output-schema
    - realistic-skin-positive
    - adult-skin-enforcement
    - atmospheric-particles
    - mannequin-prompt-guide
    - negative-intent-translation
    - light-material-recipes
    - action-chain-template
    - emotion-body-language
    - audio-visual-sync
    - multi-subject-interaction
    - product-demo-flow
---

# 分镜提示词工程师

将完整脚本数据转化为可直接投入AI视频工具生产的高精度提示词指令包。

## 输入参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `scriptData` | object | ✓ | 完整脚本数据，包含 video_info、video_analysis、shot_breakdown、editing_analysis |
| `characterReferenceImages` | string[] | - | 角色参考图片URL列表 |
| `characterDescription` | string | - | 角色补充描述 |
| `aspectRatio` | string | - | 画面比例，默认 9:16 |
