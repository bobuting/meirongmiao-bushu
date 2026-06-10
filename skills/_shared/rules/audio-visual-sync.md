# 音频-画面同步规则

> 为视频 prompt 提供系统化的音频与画面对齐方法论，覆盖口播、环境音、BGM 场景。
> **前提**：仅当分镜数据包含台词/旁白/环境音信息时才适用口播公式和口型描述。环境音联动仅在分镜已描述对应环境时适用，不凭空创造原文没有的音效。

## 口播公式

当分镜包含台词/旁白时，视频 prompt 应描述完整的音频-视觉对齐：

```
[说话者身份] + [精确台词片段] + [情绪/语气] + [语速/节奏] + [口型动作] + [环境音/BGM]
```

### 示例
```
女性角色面对镜头，语气温和真诚，中速节奏讲述，嘴唇自然张合配合每个音节，嘴角保持微笑弧度，背景环境音轻柔（咖啡馆白噪音）
```

## 语速-动作对齐表

| 语速 | 画面动作节奏 | 镜头运动 |
|------|------------|---------|
| 慢速（深情/沉思） | 缓慢自然的微小动作，呼吸可见 | 缓慢推镜或静止，让观众感受节奏 |
| 中速（日常对话） | 自然节奏的肢体语言和表情变化 | 平缓的跟拍或固定镜头 |
| 快速（激动/紧迫） | 快节奏的手势和表情转换，身体前倾 | 快速运镜或手持晃动感配合节奏 |

## 环境音与画面联动

环境音不仅是音频信息，也是视觉提示的来源：

| 环境音 | 对应视觉描述 |
|--------|------------|
| 雨声 | raindrops visible on surfaces, wet reflections on ground, water trails on window glass |
| 风声 | hair and fabric blowing in wind direction, leaves/grass swaying, trees bending |
| 城市交通 | car lights streaking in background, pedestrian movement, urban noise visual cues |
| 咖啡馆/室内 | steam rising from cups, ambient lighting warmth, soft background movement |
| 自然/鸟鸣 | dappled light through trees, gentle leaf movement, peaceful atmosphere |

## 口型描述分级

根据台词重要程度选择不同精细度的口型描述（任何级别都必须有口型描述，不允许省略）：

| 级别 | 适用场景 | 描述方式 |
|------|---------|---------|
| 精细 | 重要台词、情感高潮 | 精确口型配合：嘴唇张开幅度、舌尖位置、嘴角弧度随情绪变化 |
| 标准 | 一般台词 | 自然说话状态：嘴唇自然张合，配合节奏，表情与语气一致 |
| 简略 | 快速切换、群像背景 | 最低限度的口型描述：嘴唇微动配合语速，表情自然 |
