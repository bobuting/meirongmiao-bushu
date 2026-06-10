# 情绪肢体语言映射

> 扩展情绪表达从面部到全身的描述维度，增加呼吸和肢体语言层次。
> **前提**：仅当分镜原文已明确写了该角色的情绪（如"紧张"、"开心"等）时才适用。如果原文没写情绪，不能凭空添加肢体语言描述。

## 肢体语言映射表

| 情绪 | 肢体语言线索 |
|------|------------|
| 焦虑 | fingers gripping fabric/arm, restless weight shifting between feet, repeated small hand movements |
| 紧张 | shoulders tight and raised toward ears, arms close to body, hands clasped or fidgeting |
| 放松 | shoulders dropped naturally, arms loose at sides, weight evenly distributed, posture open |
| 自信 | chest slightly lifted, chin level, shoulders back, deliberate hand gestures, steady stance |
| 害羞 | shoulders slightly hunched inward, arms crossed or hands touching face/neck, body angled away from camera |
| 愤怒 | jaw clenched visible at neck line, fists tightened, body leaning forward aggressively, rigid posture |
| 悲伤 | body curled slightly inward, head tilted down, arms wrapped around torso, slow heavy movements |
| 惊喜 | eyebrows raised high, mouth slightly open, body leaning forward, hands raised with palms open |

## 呼吸维度

情绪影响呼吸模式，应在 prompt 中描述呼吸的物理表现：

| 情绪 | 呼吸表现 |
|------|----------|
| 悲伤/低落 | shallow breathing, minimal chest rise, slow exhale visible as slight shoulder drop |
| 紧张/恐惧 | held breath, chest expanded but not moving, visible tension in diaphragm area |
| 释然/放松 | deep exhale, shoulders dropping with breath release, visible chest fall |
| 兴奋/激动 | rapid breathing, visible chest movement, slight breathlessness in posture |
| 平静 | steady rhythmic breathing, natural chest rise and fall, relaxed diaphragm |

## 情绪递进序列模板

描述情绪变化时，使用四层递进：

```
[面部微表情细节] + [呼吸变化] + [肢体语言转换] + [镜头配合运动]
```

### 示例：紧张→释然
```
面部：紧锁的眉头逐渐舒展，眼角肌肉放松
呼吸：屏住的呼吸缓缓呼出，肩膀随之下降
肢体：紧握的双手慢慢松开，重心从脚尖回到全脚掌
镜头：镜头从紧凑的近景缓慢后拉，给人物呼吸的空间
```

## 自然言语身体语言

口播/说话场景中的自然身体语言：

- slight head tilt while listening or thinking
- occasional blink (natural cadence, not forced)
- small hand movement emphasizing key points
- weight shift from one foot to another during longer speech
- subtle lean toward listener during emphatic moments
