---
code: character_five_view_generation_child
name: 儿童角色五视图生成
description: 儿童专属五视图生成提示词，包含精致五官规则、比例完美约束、混血特征增强、服装精致度匹配
category: image_generation
tags: [child, refinement, mixed-race, outfit-detail]
version: 2.1.0
author: system
defaultVariant: default
includes:
  rules:
    - five-view-body-direction
    - five-view-full-body
    - five-view-technical
    - five-view-negative-child
    - garment-logo-consistency
    - facial-fidelity
---

# 儿童角色五视图生成

儿童专属五视图生成提示词，针对 0-17 岁儿童角色的特殊比例和审美需求优化。

## 核心特性

- **精致五官**：眼睛占比 30-35%、鼻子小巧立体、嘴唇自然微张
- **比例完美**：脸型圆润、五官间距符合儿童解剖学
- **混血特征增强**：智能判断 + 30%概率轻微混血
- **服装精致度匹配**：蕾丝、刺绣、纽扣细节清晰可见
- **审美特征库**：动态追踪主流审美变化（细化特征类别）

## 适用场景

- 图片项目 Step2 定妆（0-17岁儿童角色）
- 角色管理页儿童角色生成
- 混血儿童角色专属生成