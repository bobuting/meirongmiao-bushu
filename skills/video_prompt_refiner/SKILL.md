---
code: video_prompt_refiner
name: 视频提示词优化器
description: 分析视频生成失败原因，优化视频提示词以提升重试成功率。输入原始提示词、失败原因和场景上下文，输出优化后的提示词及分析记录。
category: video_generation
tags: [retry, optimization]
version: 1.0.0
author: system
defaultVariant: default
---

# 视频提示词优化器

分析视频生成失败原因并优化提示词，用于分镜视频生成重试场景。

## 输入参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `originalPrompt` | string | ✓ | 当前视频提示词（clip_prompt） |
| `errorMessage` | string | ✓ | 上次生成失败的错误信息 |
| `sceneDescription` | string | - | 该镜头的场景描述（从 shot_breakdown 获取） |
| `retryCount` | number | - | 当前是第几次重试（从 1 开始） |
