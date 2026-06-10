# 光影配方库与材质响应

> 提供可复用的光影配方和材质响应条目，增强光线描述的配方式组合能力。

## 光影配方（按场景选择）

### 窗口光配方
```
soft directional light from window camera left, warm temperature shift from cool ambient to golden direct light, subtle gradient across face (bright side to shadow side transition over cheekbone), catchlight in pupils shaped as vertical rectangle (window reflection)
```

### 轮廓光配方（背光场景）
```
strong backlight creating golden rim light on hair edges and shoulder outline, face in soft shadow with fill light preserving detail, lens flare from light source partially visible at frame edge, warm amber glow separating subject from background
```

### 产品展示光配方（电商场景）
```
even diffused overhead lighting with soft box quality, smooth shadow transitions across product surface, secondary fill from below balancing under-chin tones, clean white light rendering accurate fabric/product color, subtle specular highlight on smooth surfaces
```

### 戏剧光配方（情绪场景）
```
chiaroscuro lighting, single source from 45 degrees camera right, deep shadow on opposite side of face with minimal fill, dramatic contrast ratio (8:1 or higher), eye catchlight as single sharp point
```

### 户外自然光配方
```
golden hour sunlight at low angle, warm color temperature (3500K-4500K), long soft shadows on ground, natural hair rim light from sun behind, sky gradient from warm horizon to cool blue overhead
```

## 材质响应条目

描述光线与特定材质的交互，根据画面中出现的人物/物品选择：

| 材质 | 光线响应描述 |
|------|------------|
| 皮肤毛孔 | subtle skin texture visible under side light, pores and fine lines catch light on nose bridge and cheekbone area |
| 头发边缘光 | individual hair strands lit at edges creating glow halo, light passing through thin hair producing translucent quality |
| 金属条状高光 | metal surface reflecting light as elongated specular stripe along curvature, bright highlight line following surface contour |
| 玻璃反射 | glass surface reflecting light source as bright spot with soft edge, transparent areas showing background distortion |
| 布料褶皱 | fabric folds creating alternating light and shadow stripes, each fold casting micro shadow on adjacent surface, texture visible under raking light |
| 水面反射 | water surface acting as mirror reflecting sky and surroundings, ripple distortion breaking reflection into fragments, specular sparkles on wave peaks |

## 空间深度层次

描述画面从前景到背景的光影层次：

```
foreground: soft blur with bokeh quality, slightly darker exposure setting depth cue
midground: subject in sharp focus, primary lighting illuminating key features
background: gradual atmospheric haze increasing with distance, color temperature shift (warmer near subject, cooler at infinity), light falloff creating natural vignette
```
