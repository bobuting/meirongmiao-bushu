---
code: product_showcase_rewriter
name: 产品展示脚本改写器
version: 1.0.0
description: 根据新角色和新产品信息改写产品展示分镜脚本，兼容有模特/无模特/局部出镜三种镜头类型
includes:
  rules:
    - video-output-schema
    - character-outfit-anchors
    - shot-description
---

# 产品展示脚本改写器

## 用途

改写产品展示脚本（strategyType: product_showcase），用于反推重写场景。

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scriptJson | object | ✅ | 原始分镜脚本 JSON |
| characterGender | enum | ✅ | 角色性别（male/female） |
| characterDescription | string | ❌ | 角色综合描述 |
| outfitDescription | string | ✅ | 新产品服饰描述 |
| matchingReference | string | ❌ | 搭配描述 |
| clothingStyles | array | ❌ | 服饰风格列表 |

## 输出

改写后的分镜脚本 JSON，结构与输入一致。

## 特点

1. **镜头分类改写**：根据 subjects 和景别判断镜头类型（有模特/局部出镜/无模特），按类型执行不同改写策略
2. **产品导向**：改写后每个镜头必须展示新产品卖点
3. **展示结构保留**：保持原脚本的展示节奏（吸睛开场 → 场景展示 → 细节放大 → 购买触发）

## 与 video_script_rewriter 的区别

| 维度 | video_script_rewriter | product_showcase_rewriter |
|------|----------------------|--------------------------|
| 适用脚本 | 热榜验证脚本 | 产品展示脚本 |
| 核心原则 | 服饰不是展示目的 | 服饰就是展示目的 |
| 爆款因子 | 必须保留 | 无需分析（产品展示无爆款因子） |
| 镜头处理 | 只替换人物 subjects | 按镜头类型分治改写 |
| 无模特镜头 | 不处理 | 基于新产品卖点重新生成 |
| 局部出镜镜头 | 不处理 | 适配局部描述为新模特属性 |