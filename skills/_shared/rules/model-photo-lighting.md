## MODEL PHOTO LIGHTING — CRITICAL

模特图光线必须具备**立体感、真实感、质感深度**。拒绝平面光照和AI典型光线问题。

### 主光源配置

**强制要求**：
- **角度**：45度侧光，从左上方或右上方照射（模拟自然窗光）
- **光质**：软光箱质量，柔和漫反射光，非硬闪光灯直射
- **强度**：中等亮度，避免过曝或死黑阴影
- **色温**：自然日光色温（约 5500K），非冷暖极端偏色

### 补光配置

**强制要求**：
- **对面补光**：阴影侧有微弱补光，比例约 3:1（主光:补光）
- **作用**：避免死黑阴影，保留暗部细节和皮肤纹理
- **强度控制**：补光足够柔和，不破坏主光立体感

### 光影立体感

**强制要求**：
- **过渡带宽度**：明暗交界线宽度约脸宽的 15-20%，柔和渐变非硬边
- **立体效果**：突出鼻梁高度、颧骨轮廓、下颌线条
- **阴影区域**：阴影中仍可见皮肤纹理和毛孔，非纯黑填充
- **拒绝平面光照**：均匀光照抹平所有纹理和立体感，必须避免

### 不同姿势的光线表现

| 姿势类型 | 光线要求 | 示例描述 |
|---------|---------|---------|
| **正面站立** | 45度侧光 + 补光 | "45-degree side light from upper left, soft diffused quality, natural skin texture visible in shadows" |
| **侧面转身** | 逆光 + 侧面光 | "rim light from left, soft backlight outlining silhouette, side light revealing fabric texture" |
| **动态行走** | 自然光 + 环境光 | "natural daylight, soft ambient light, even illumination without harsh shadows" |
| **坐姿倚靠** | 侧光 + 环境反射 | "side light from window, soft ambient reflections, natural shadows on seated posture" |

### 禁止的光线问题

| 问题类型 | 禁止描述 | 正确替代 |
|---------|---------|---------|
| **正面平光** | "front lighting, flat even light" ❌ | "45-degree side light, soft diffused quality" ✅ |
| **过度高光** | "bright highlights, shiny skin" ❌ | "soft highlights, natural skin glow" ✅ |
| **死黑阴影** | "dark shadows, no details in shadow" ❌ | "soft shadows with visible skin texture" ✅ |
| **均匀光照** | "even lighting, uniform illumination" ❌ | "graduated lighting, natural shadow transition" ✅ |
| **硬光直射** | "hard direct light, harsh shadows" ❌ | "soft diffused light, gentle shadow edges" ✅ |

### 光线描述模板

**posePrompt中的光线描述**（必须包含）：
```
[光源角度] + [光质] + [阴影表现] + [皮肤质感]

示例：
"45-degree side light from upper left, soft diffused quality, gentle shadows preserving skin texture, natural daylight color temperature"
```

**bgPrompt中的光线描述**（必须包含）：
```
[环境光线] + [氛围效果] + [自然细节]

示例：
"natural daylight through window, soft ambient illumination, gentle shadows on background, natural atmosphere"
```

### 强制检查清单

生成每个posePrompt/bgPrompt时必须检查：

```
□ 光源角度：是否明确写了光源方向（45度侧光/逆光/侧光）？
□ 光质描述：是否写了光质（软光/硬光/漫反射）？
□ 阴影表现：是否描述了阴影柔和度和纹理保留？
□ 禁止问题：是否避免了正面平光、过度高光、死黑阴影？
□ 光线一致性：posePrompt和bgPrompt的光线是否匹配？
```