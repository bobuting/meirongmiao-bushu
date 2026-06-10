---
code: outfit_change_reference_image
name: 换装参考图生成
description: 为换装视频编辑模式生成每个分镜的参考图，确保服装一致性
version: 1.0.0
author: AI Team
tags:
  - outfit-change
  - reference-image
  - video-edit
createdAt: 2026-05-13
updatedAt: 2026-05-13
---

# 换装参考图生成

## 功能说明

为换装视频编辑模式（Omni-Video）生成每个分镜的参考图。参考图用于指导 AI 将目标服装应用到角色身上，确保所有分镜保持服装视觉统一性。

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| garmentName | string | 是 | 目标服装名称 |
| garmentDescription | string | 否 | 目标服装详细描述 |
| segmentIndex | number | 是 | 分镜序号（从 0 开始） |
| actionType | string | 是 | 动作类型（如 walking, sitting 等） |

## 输出格式

生成一张换装参考图，将服装穿在角色身上，用于 Omni-Video API 的 image_list 参数。

## 服装一致性要求

所有分镜必须保持服装视觉统一性：
- 服装颜色、纹理、款式完全一致
- 不同角度、动作下细节保持一致
- 服装贴合自然，符合人体工学

## 使用示例

```typescript
const skill = await skillLoader.load('outfit_change_reference_image');
const { system, user } = await skill.render({
  garmentName: '白色衬衫配黑色西裤',
  garmentDescription: '经典商务套装，纯白衬衫配修身黑色西裤',
  segmentIndex: 0,
  actionType: 'walking',
});

// 发送给图像生成 AI
const response = await ai.generateImage({
  prompt: user,
  images: [garmentImageUrl, characterImageUrl],
});
```