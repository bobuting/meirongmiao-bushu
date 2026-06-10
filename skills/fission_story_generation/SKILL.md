---
code: fission_story_generation
name: 裂变故事生成
description: 根据原视频脚本在指定位置插入扩写分镜，原分镜保留不变
category: fission
tags: []
version: 2.0.0
author: system
defaultVariant: default
includes:
  rules:
    - shot-description
    - video-output-schema
    - character-outfit-anchors
---

# 裂变故事生成

输入完整视频脚本JSON和插入位置，在指定位置插入扩写分镜，输出新的完整脚本。

## 输入参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| originalScript | object | ✅ | 原视频脚本完整JSON |
| insertPositions | number[] | ✅ | 需要插入扩写的 shot_id 位置 |

## 输出

完整的视频脚本JSON，shot_id 从 1 开始重新编号。