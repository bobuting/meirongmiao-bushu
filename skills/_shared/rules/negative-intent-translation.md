# 否定词意图翻译层

> **补充规则**（不替换下方已有的 negative prompt 规则）：在生成 negative prompt 之前，先将部分否定约束翻译为正向视觉目标写入 prompt 正文。
> 排除列表仍按原有规则生成，本层额外补充对应的正向引导。

## 否定约束分类

收到否定约束时，先判断类别：

| 类别 | 特征 | 处理策略 |
|------|------|----------|
| 低价值负面命令 | "不要变形"、"不要奇怪" | 翻译为正向视觉目标，不写入 negative prompt |
| 风格排除 | "无动画无CGI"、"不要插画风" | 保留为 negative prompt 边界条件 |
| 运动需求 | "不要一动不动"、"不要僵硬" | 翻译为具体微动作描述，写入 prompt 正文 |
| 物理约束 | "不要穿模"、"不要换场景" | 翻译为物理正确性描述，写入 prompt 正文 |

## 翻译映射表

| 否定约束 | 正向视觉目标（写入 prompt 正文） | 是否仍需 negative 排除 |
|----------|--------------------------------|----------------------|
| 不要变形 | stable outline, consistent face/body/product shape throughout | 否 |
| 不要穿模 | clear contact point, visible separation between overlapping elements | 否 |
| 不要一动不动 | breathing, blinking, slight head turn, small hand movement | 否 |
| 不要换场景 | same room, same camera side, same background layout | 否 |
| 无动画无CGI | live-action photographic look, practical lighting, real camera footage | 是（no CGI, no animation） |
| 不要僵硬 | natural posture, relaxed shoulders, weight distributed naturally | 否 |
| 不要模糊 | sharp focus on subject, clear details, high definition | 是（no blur） |
| 不要过度曝光 | balanced exposure, highlight detail preserved | 是（no overexposure） |
| 服饰不要变形 | fabric drape following natural gravity, consistent clothing silhouette, garment maintaining designed shape | 否 |
| 不要换脸/不要走样 | consistent facial features matching reference, same eye shape and nose bridge, identical face throughout | 是（no face swap, no face change） |
| 服饰细节不要丢 | visible fabric texture, stitch details preserved, hardware/buttons/zippers clearly rendered | 是（no missing details） |

## 应用规则

1. **风格排除保留**：当排除本身就是需求（如"不要插画风格"），保留为 negative prompt 的边界条件
2. **运动/物理类翻译**：翻译后写入 prompt 正文的具体描述部分，不在 negative prompt 中重复
3. **低价值负面命令过滤**：如"不好看"、"不自然"等主观判断，翻译为具体的正向视觉特征
