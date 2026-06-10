---
code: garment_flat_lay_generation
name: 服饰平铺图生成
description: 基于用户上传的服饰图片，生成正反面电商专业平铺图（上下布局）
category: image_generation
tags: []
version: 3.0.0
author: system
defaultVariant: default
includes:
  rules:
    - garment-logo-consistency
---

# 服饰平铺图生成

基于用户上传的服饰图片，生成正反面电商专业平铺图（上下布局）

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageCount | number | 否 | 图片数量提示 |
| additionalInstructions | string | 否 | 用户额外指令 |

## 使用示例

```typescript
const { system, user } = await skillLoader.render('garment_flat_lay_generation', {
  imageCount: 3,
});
```

## 输出格式

9:16 竖屏比例，上下两栏布局：
- 上半部分：正面平铺图（标注 "FRONT"）
- 下半部分：背面平铺图（标注 "BACK"）
- 背景：纯白色 #FFFFFF
