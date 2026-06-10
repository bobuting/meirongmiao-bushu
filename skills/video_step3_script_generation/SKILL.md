---
code: video_step3_script_generation
name: Step3 脚本生成
description: 生成服饰种草类短视频脚本，遵循叙事为主、软植入原则。输入需包含热点分析报告（hotspot-analysis-output-schema 格式）
category: video_step
tags: []
version: 1.0.0
author: system
defaultVariant: default
includes:
  rules:
    - shot-description
    - video-output-schema
    - character-outfit-anchors
    - hotspot-analysis-output-schema
---

# Step3 脚本生成

生成服饰种草类短视频脚本，遵循叙事为主、软植入原则。

**输入格式规范**：
- 热点分析报告需符合 `hotspot-analysis-output-schema` 规则文件定义的 JSON 结构
- 报告包含：batch_analysis、emotion_summary、theme_summary、deduction_summary、tags_keywords_summary、prediction_summary、creation_suggestions

**输出格式规范**：参见 `video-output-schema` 规则文件。
