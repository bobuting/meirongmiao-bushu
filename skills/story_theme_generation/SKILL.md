---
code: story_theme_generation
name: 主题叙事-分镜展开
description: 基于故事大纲生成详细分镜（第三段）
category: video_step
tags:
  - story
  - theme
  - storyboard
version: 1.0.0
author: system
defaultVariant: default
includes:
  rules:
    - video-output-schema
    - character-outfit-anchors
---

# 主题叙事-分镜展开

基于已确认的故事大纲，生成详细的分镜脚本。
输出 VideoScriptPayload 格式，遵循统一输出规范。
