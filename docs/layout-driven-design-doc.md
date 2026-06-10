# 版式模板驱动设计流程 — 设计文档

> **核心思想**：版式模板是完整设计方案。先选版式模板，再生成配合模板的内容。

---

## 一、当前实现问题分析

### 1.1 当前数据流

```
┌─────────────────────────────────────────────────────────────┐
│              Step4 Section Planning Skill                     │
│  （一次性输出所有内容）                                        │
├─────────────────────────────────────────────────────────────┤
│  输入: 卖点数据 + 搭配方案 + 模特照片                          │
│                                                               │
│  输出:                                                        │
│  ┌──────────────────────────────────────────────┐           │
│  │ {                                             │           │
│  │   sectionType: "material_texture",            │ ← 类型    │
│  │   layoutConfig: {                             │           │
│  │     template: "fullscreen-dark-center",       │ ← 版式ID  │
│  │     graphicsLayout: {                         │           │
│  │       elements: [                             │ ← 图形    │
│  │         { type: "art_text", x: 0.85, ... }    │   凭空   │
│  │         { type: "air_flow", x: 0.05, ... }    │   规划   │
│  │       ]                                       │           │
│  │     }                                         │           │
│  │   },                                          │           │
│  │   visualPrompt: "面料特写...",               │ ← 图片词  │
│  │   title: "轻盈透气",                          │ ← 文案    │
│  │   copy: null                                  │           │
│  │ }                                             │           │
│  └──────────────────────────────────────────────┘           │
│                                                               │
│  问题: 版式只是ID字段，设计感元素凭空规划                       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 问题根源

| 维度 | 问题 | 影响 |
|------|------|------|
| **版式定义** | 版式只是布局ID，不含设计感元素 | 设计感凭空规划，风格不统一 |
| **图片生成** | visualPrompt 不考虑版式布局 | 商品位置和文字区域冲突 |
| **设计感元素** | 图形/艺术字位置随意放置 | 缺乏版式约束，视觉混乱 |
| **品牌色系** | 颜色硬编码或不协调 | 无品牌识别感 |

---

## 二、版式模板核心概念

### 2.1 版式模板 = 完整设计方案

**版式模板包含 4 个组成部分：**

```
版式模板 = {
  版式骨架,      // 布局结构：position + overlay + typography + rhythm
  设计感元素,    // 视觉引导线 + 品牌色点缀 + 光效质感 + 微交互装饰
  品牌色系,      // primary + secondary + shadowColor + glowColor
  图片约束       // 商品位置 + 留白区域 + 背景风格
}
```

### 2.2 版式模板示例

```typescript
// 示例：小红书时尚风格模板
const xiaohongshu_fashion = {
  // === 版式骨架 ===
  layout: {
    id: "bottom-gradient-classic",
    position: { vertical: "bottom", horizontal: "center" },
    overlay: { type: "gradient", color: "#000000", opacity: 0.4 },
    typography: {
      title: { fontSize: 28, fontWeight: 500, color: "#FFFFFF" },
      copy: { fontSize: 16, fontWeight: 400, color: "#FFFFFF", opacity: 0.85 }
    },
    rhythm: { titleCopyGap: 12, maxWidth: 600 }
  },
  
  // === 设计感元素 ===
  designElements: {
    divider: {
      type: "divider_line",
      position: { x: 0.1, y: 0.82, width: 0.8 },
      style: { color: "#FFD700", thickness: 1, gradient: true }
    },
    brandAccent: {
      type: "price_tag",
      position: { x: 0.85, y: 0.90 },
      style: { primaryColor: "#FF2442", shape: "pill" }
    },
    textEffect: {
      style: "outline",
      appliedTo: "title",
      config: { shadowColor: "#000000", blur: 2 }
    },
    microDecoration: {
      type: "corner_ornament",
      position: { x: 0.02, y: 0.02 },
      style: { primaryColor: "#FFD700" }
    }
  },
  
  // === 品牌色系 ===
  colorScheme: {
    primary: "#FF2442",      // 小红书红
    secondary: "#FFD700",    // 金色点缀
    shadowColor: "#000000",  // 阴影色
    glowColor: "#FF6B6B"     // 发光色
  },
  
  // === 图片约束 ===
  imageConstraint: {
    productPosition: { vertical: "center-top", y: "0.15-0.65", coverage: "70-80%" },
    emptyArea: { position: "bottom", size: "25%" },
    backgroundStyle: { type: "gradient", simplicity: "high" },
    visualPromptTemplate: "商品居中偏上(y=0.15-0.65)，底部简洁渐变背景延伸，预留底部25%空白，光线均匀柔和"
  }
};
```

### 2.3 版式模板驱动流程

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: 版式模板选择                                          │
│                                                               │
│  首次生成：LLM智能选择                                         │
│  - 输入: sectionType + 商品风格偏好                           │
│  - 规则: 从 SECTION_TEMPLATE_MAP[sectionType] 中智能推荐     │
│  - 输出: templateId（如 xiaohongshu-fashion）                 │
│                                                               │
│  后续编辑：用户主动选择                                        │
│  - UI: 右侧栏模板选择器                                        │
│  - 预览: 实时预览模板效果                                      │
│  - 切换: 点击切换模板，自动更新设计感元素                      │
│                                                               │
│  版式模板包含: 版式骨架 + 设计感元素 + 品牌色系 + 图片约束     │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: 图片提示词生成（配合版式）                            │
│                                                               │
│  输入: 版式模板.imageConstraint + 商品卖点                   │
│  输出: visualPrompt（含版式约束）                             │
│                                                               │
│  示例:                                                        │
│  版式模板 xiaohongshu_fashion:                               │
│  → "面料质感特写，商品居中偏上占70%，                          │
│     底部简洁渐变背景，预留底部25%空白，光线均匀柔和"           │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: 内容填充（填充版式）                                  │
│                                                               │
│  输入: 版式模板 + 图片生成结果 + 卖点                         │
│  输出: 文案（位置固定）                                       │
│                                                               │
│  版式约束:                                                    │
│  - 标题位置 = 版式模板.layout.position                        │
│  - 标题样式 = 版式模板.layout.typography.title                │
│  - 文案位置 = 标题下方，间距 = layout.rhythm.titleCopyGap     │
│                                                               │
│  注意: 设计感元素位置已在模板中预设，不需要LLM规划             │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: 统一渲染                                              │
│                                                               │
│  渲染器: LayoutRenderer                                       │
│  输入: 版式模板 + 图片 + 文案                                 │
│  输出: HTML/SVG 渲染结果                                      │
│                                                               │
│  渲染顺序:                                                    │
│  1. 背景图片                                                  │
│  2. 遮罩层（版式.overlay）                                    │
│  3. 设计感元素（divider + brandAccent + microDecoration）    │
│  4. 文字层（title + copy，应用textEffect）                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、版式模板库设计

### 3.1 模板分类

按**品牌风格**分类，而非按版式布局分类：

| 风格类别 | 模板数量 | 特点 |
|---------|---------|------|
| **小红书风格** | 3种 | 红色主色、price_tag标签、渐变分割线 |
| **金色奢华** | 2种 | 金色主色、金属质感文字、金色角饰 |
| **极简白金** | 2种 | 白色主色、金色点缀、简洁阴影 |
| **科技蓝** | 2种 | 蓝色主色、霓虹发光、渐变分割线 |
| **自然绿** | 1种 | 绿色主色、简约风格、无过多装饰 |

### 3.2 模板详细定义

#### 3.2.1 小红书风格系列

| 模板ID | 版式骨架 | 设计感元素 | 适用sectionType |
|--------|---------|-----------|----------------|
| `xiaohongshu-fashion` | bottom-gradient-classic | divider_line金色 + price_tag红色 + outline文字 + corner_ornament | material_texture, brand_story |
| `xiaohongshu-sale` | bottom-pill-social | sale_ribbon红色 + price_tag金色 + shadow文字 + neon_pulse | call_to_action, hot_sales |
| `xiaohongshu-minimal` | center-no-overlay | 无装饰 + shadow文字 | material_texture（纯净风格） |

#### 3.2.2 金色奢华系列

| 模板ID | 版式骨架 | 设计感元素 | 适用sectionType |
|--------|---------|-----------|----------------|
| `luxury-gold` | fullscreen-dark-center | gold_emboss文字 + corner_ornament金色 + divider_line金色 | brand_story, detail_showcase |
| `luxury-classic` | left-aligned-magazine | divider_line垂直金色 + gradient文字 + hot_mark金色 | styling_guide |

#### 3.2.3 其他系列

（见附录 A）

### 3.3 sectionType → 模板推荐映射

```typescript
const SECTION_TEMPLATE_MAP: Record<SectionType, string[]> = {
  material_texture: ["xiaohongshu-fashion", "xiaohongshu-minimal", "luxury-gold"],
  brand_story: ["luxury-gold", "xiaohongshu-fashion"],
  detail_showcase: ["luxury-gold", "tech-blue-modern"],
  styling_guide: ["luxury-classic", "xiaohongshu-fashion"],
  call_to_action: ["xiaohongshu-sale", "tech-blue-neon"],
  hot_sales: ["xiaohongshu-sale"],
  quality_cert: ["minimal-white-gold", "natural-eco"],
  user_review: ["minimal-white-gold"],
  price_display: ["xiaohongshu-sale", "luxury-gold"],
  scene_application: ["natural-eco", "xiaohongshu-fashion"]
};
```

---

## 四、数据结构设计

### 4.1 版式模板驱动 Section 数据结构

```typescript
/** 版式模板驱动的 Section 规划结果 */
interface TemplateDrivenSection {
  // === Step 1: 版式模板 ===
  sectionKey: string;
  sectionType: SectionType;
  templateId: string;                    // 版式模板ID（如 xiaohongshu-fashion）
  
  // === Step 2: 图片 ===
  visualPrompt: string;                  // 图片生成提示词（含模板约束）
  
  // === Step 3: 内容 ===
  title: string;                         // 标题文案（位置由模板预设）
  copy?: string;                         // 副文案（位置由模板预设）
  
  // === Step 4: 渲染参数 ===
  renderConfig: {
    width: 750;
    height: 900;
    quality: "high";
  };
}
```

**关键变化**：
- **不再需要 LLM 规划设计感元素位置**（模板已预设）
- **不再需要 LLM 规划文字位置**（模板已预设）
- **不再需要 LLM 规划颜色**（模板已预设品牌色系）
- **LLM 只需填充文案内容**

### 4.2 版式模板定义结构

```typescript
/** 版式模板完整定义 */
interface LayoutTemplateDefinition {
  id: string;                            // 模板ID
  displayName: string;                   // 显示名称
  category: "xiaohongshu" | "luxury" | "minimal" | "tech" | "natural";
  
  // === 版式骨架 ===
  layout: {
    id: string;                          // 版式ID（如 bottom-gradient-classic）
    position: LayoutPosition;
    overlay: OverlayConfig;
    typography: TypographyConfig;
    rhythm: RhythmConfig;
  };
  
  // === 设计感元素 ===
  designElements: {
    divider?: DividerElement;
    brandAccent?: BrandAccentElement;
    textEffect?: TextEffectConfig;
    microDecorations?: MicroDecoration[];
  };
  
  // === 品牌色系 ===
  colorScheme: ColorScheme;
  
  // === 图片约束 ===
  imageConstraint: ImageConstraint;
  
  // === 适用场景 ===
  applicableSections: SectionType[];
}
```

---

## 五、实施步骤

### 5.1 分步实施计划

| 步骤 | 任务 | 工作量 | 说明 |
|------|------|--------|------|
| **Phase 1** | 创建版式模板库 | 2天 | 定义10-15个完整模板 |
| **Phase 2** | 修改 Skill 输出 | 1天 | 只输出 templateId + visualPrompt + 文案 |
| **Phase 3** | 扩展渲染器 | 2天 | 渲染设计感元素层 |
| **Phase 4** | 模板选择器 UI | 1天 | 右侧栏模板预览选择 |
| **Phase 5** | 测试验证 | 1天 | 验证模板效果一致性 |

**总工作量：7天**（比原方案减少5天）

### 5.2 Phase 1: 创建版式模板库

**目标**：定义10-15个完整版式模板

**输出文件**：`apps/web/pages/image-project/components/templates/designTemplates.ts`

```typescript
// 示例结构
export const DESIGN_TEMPLATES: Record<string, LayoutTemplateDefinition> = {
  "xiaohongshu-fashion": {
    id: "xiaohongshu-fashion",
    displayName: "小红书时尚",
    category: "xiaohongshu",
    layout: { /* ... */ },
    designElements: { /* ... */ },
    colorScheme: { primary: "#FF2442", secondary: "#FFD700", /* ... */ },
    imageConstraint: { /* ... */ },
    applicableSections: ["material_texture", "brand_story"]
  },
  // ... 其他模板
};
```

### 5.3 Phase 2: 修改 Skill 输出

**目标**：简化 Skill 输出，只填充文案

**修改文件**：`skills/step4_section_planning/system.hbs`

**新输出格式**：

```json
{
  "sections": [
    {
      "sectionKey": "material_texture_01",
      "sectionType": "material_texture",
      "templateId": "xiaohongshu-fashion",
      "visualPrompt": "面料质感特写，商品居中偏上占70%，底部简洁渐变背景...",
      "title": "轻盈透气",
      "copy": null
    }
  ]
}
```

**关键规则**：
- `templateId` 从 `SECTION_TEMPLATE_MAP[sectionType]` 中选择
- `visualPrompt` = 商品卖点描述 + 模板的 `imageConstraint.visualPromptTemplate`
- `title` 和 `copy` 只填内容，位置由模板预设

### 5.4 Phase 3: 扩展渲染器

**目标**：LayoutRenderer 支持渲染设计感元素

**修改文件**：`apps/web/pages/image-project/components/templates/LayoutRenderer.tsx`

**新渲染流程**：

```typescript
export const LayoutRenderer = ({ section, template }: LayoutRendererProps) => {
  const templateDef = DESIGN_TEMPLATES[template];
  
  return (
    <div style={containerStyle}>
      {/* 1. 背景图片 */}
      <img src={section.image} />
      
      {/* 2. 遮罩层 */}
      {templateDef.layout.overlay.type !== 'none' && 
        <div style={overlayStyle} />
      }
      
      {/* 3. 设计感元素层 */}
      {templateDef.designElements.divider && 
        <DividerLine element={templateDef.designElements.divider} />
      }
      {templateDef.designElements.brandAccent && 
        <BrandAccent element={templateDef.designElements.brandAccent} />
      }
      {templateDef.designElements.microDecorations?.map(dec => 
        <MicroDecoration element={dec} />
      )}
      
      {/* 4. 文字层（应用 textEffect） */}
      <div style={textAreaStyle}>
        <h2 style={titleStyle}>{section.title}</h2>
        {section.copy && <p style={copyStyle}>{section.copy}</p>}
      </div>
    </div>
  );
};
```

---

## 六、预期效果对比

### 6.1 当前效果（碎片化）

```
┌─────────────────────────────┐
│      [艺术字]               │ ← 凭空放置，位置随意
│                             │
│         商品图片            │ ← 商品位置可能遮挡文字
│                             │
│  [气流线条]                  │ ← 凭空放置
│                             │
│        轻盈透气              │ ← 文字位置凭空规划
└─────────────────────────────┘

问题：
- 版式只是ID，设计感元素凭空规划
- 整体效果碎片化，风格不统一
```

### 6.2 版式模板效果（整体协调）

```
┌─────────────────────────────┐
│ [角饰]                       │ ← 模板预设：左上角金色角饰
│                             │
│         商品图片            │ ← 商品居中偏上（配合版式）
│                             │
│  ──────金色分割线──────     │ ← 模板预设：水平分割线
│                             │
│        轻盈透气              │ ← 模板预设：底部居中
│                   [价格标签] │ ← 模板预设：右下角红色标签
└─────────────────────────────┘

改进：
- 版式模板包含完整设计方案
- 设计感元素位置预设，风格统一
- 商品位置配合版式，不冲突
```

---

## 七、总结

### 7.1 核心改进

| 维度 | 当前 | 版式模板驱动 |
|------|------|-------------|
| **版式定义** | 只是ID字段 | 完整设计方案 |
| **设计感元素** | LLM凭空规划 | 模板预设位置 |
| **品牌色系** | 硬编码或不协调 | 模板预设色系 |
| **图片约束** | 无约束 | 模板预设约束 |
| **LLM负担** | 高（规划所有元素） | 低（只填充文案） |
| **效果稳定性** | 低（LLM审美不稳定） | 高（模板预设效果） |

### 7.2 工作量对比

| 方案 | 工作量 | 复杂度 |
|------|--------|--------|
| **原5步方案** | 12天 | 高 |
| **版式模板方案** | 7天 | 低 |

---

## 附录 A: 版式模板完整定义表

### A.1 小红书风格系列

```typescript
// apps/web/pages/image-project/components/templates/designTemplates.ts

/** 小红书时尚模板 */
export const xiaohongshu_fashion: LayoutTemplateDefinition = {
  id: "xiaohongshu-fashion",
  displayName: "小红书时尚",
  category: "xiaohongshu",
  
  layout: {
    id: "bottom-gradient-classic",
    position: { vertical: "bottom", horizontal: "center", offset: { bottom: "40px" } },
    overlay: { type: "gradient", color: "#000000", opacity: 0.4, gradientDirection: "to-top" },
    typography: {
      title: { fontSize: 28, fontWeight: 500, color: "#FFFFFF", letterSpacing: 0.02 },
      copy: { fontSize: 16, fontWeight: 400, color: "#FFFFFF", opacity: 0.85 },
      textAlign: "center"
    },
    rhythm: { titleCopyGap: 12, maxWidth: 600, paddingX: 24, paddingY: 16 }
  },
  
  designElements: {
    divider: {
      type: "divider_line",
      position: { x: 0.10, y: 0.82, width: 0.80, height: 0.002 },
      style: {
        color: "#FFD700",
        thickness: 1,
        opacity: 0.8,
        gradient: { direction: "horizontal", startColor: "#FFD700", endColor: "#FFFFFF", startOpacity: 0.8, endOpacity: 0.3 }
      }
    },
    brandAccent: {
      type: "price_tag",
      position: { x: 0.85, y: 0.88, width: 0.12, height: 0.04 },
      style: { primaryColor: "#FF2442", secondaryColor: "#FFFFFF", shape: "pill" }
    },
    textEffect: {
      style: "outline",
      appliedTo: "title",
      config: { shadowColor: "#000000", shadowBlur: 2, shadowOffset: { x: 1, y: 1 } }
    },
    microDecorations: [
      { type: "corner_ornament", position: { x: 0.02, y: 0.02, width: 0.08, height: 0.08 }, style: { primaryColor: "#FFD700", opacity: 0.6 } }
    ]
  },
  
  colorScheme: { primary: "#FF2442", secondary: "#FFD700", shadowColor: "#000000", glowColor: "#FF6B6B" },
  
  imageConstraint: {
    productPosition: { vertical: "center-top", yRange: "0.15-0.65", coverage: "70-80%" },
    emptyArea: { position: "bottom", size: "25%" },
    backgroundStyle: { type: "gradient", simplicity: "high", lighting: "soft" },
    visualPromptTemplate: "商品居中偏上(y=0.15-0.65)，占画面70-80%，底部简洁渐变背景延伸，预留底部25%空白，光线均匀柔和"
  },
  
  applicableSections: ["material_texture", "brand_story"]
};

/** 小红书促销模板 */
export const xiaohongshu_sale: LayoutTemplateDefinition = {
  id: "xiaohongshu-sale",
  displayName: "小红书促销",
  category: "xiaohongshu",
  
  layout: {
    id: "bottom-pill-social",
    position: { vertical: "bottom", horizontal: "center", offset: { bottom: "35px" } },
    overlay: { type: "solid", color: "#000000", opacity: 0.5 },
    typography: {
      title: { fontSize: 32, fontWeight: 600, color: "#FFFFFF" },
      copy: { fontSize: 18, fontWeight: 500, color: "#FF2442" },  // 促销价格用红色
      textAlign: "center"
    },
    rhythm: { titleCopyGap: 8, maxWidth: 500 }
  },
  
  designElements: {
    brandAccent: {
      type: "sale_ribbon",
      position: { x: 0.70, y: 0.05, width: 0.25, height: 0.06 },
      style: { primaryColor: "#FF2442", secondaryColor: "#FFFFFF", shape: "ribbon" },
      content: "限时特惠"
    },
    textEffect: {
      style: "shadow",
      appliedTo: "title",
      config: { shadowColor: "#FF2442", shadowBlur: 4, glow: true }
    },
    microDecorations: [
      { type: "neon_pulse", position: { x: 0.92, y: 0.92, width: 0.06, height: 0.06 }, style: { primaryColor: "#FF2442", glow: true } }
    ]
  },
  
  colorScheme: { primary: "#FF2442", secondary: "#FFD700", shadowColor: "#000000", glowColor: "#FF6B6B" },
  
  imageConstraint: {
    productPosition: { vertical: "center-top", yRange: "0.10-0.60", coverage: "75-85%" },
    emptyArea: { position: "bottom", size: "20%" },
    visualPromptTemplate: "商品居中偏上，占画面75-85%，底部预留20%空白，背景简洁，光线明亮"
  },
  
  applicableSections: ["call_to_action", "hot_sales", "price_display"]
};

/** 小红书简约模板 */
export const xiaohongshu_minimal: LayoutTemplateDefinition = {
  id: "xiaohongshu-minimal",
  displayName: "小红书简约",
  category: "xiaohongshu",
  
  layout: {
    id: "center-no-overlay",
    position: { vertical: "center", horizontal: "center" },
    overlay: { type: "none" },
    typography: {
      title: { fontSize: 36, fontWeight: 300, color: "#FFFFFF" },
      copy: { fontSize: 14, fontWeight: 400, color: "#FFFFFF", opacity: 0.9 },
      textAlign: "center"
    },
    rhythm: { titleCopyGap: 16, maxWidth: 550 }
  },
  
  designElements: {
    textEffect: {
      style: "shadow",
      appliedTo: "title",
      config: { shadowColor: "#000000", shadowBlur: 3, shadowOffset: { x: 2, y: 2 } }
    }
  },
  
  colorScheme: { primary: "#FFFFFF", secondary: "#FFD700", shadowColor: "#000000", glowColor: "#F5F5F5" },
  
  imageConstraint: {
    productPosition: { vertical: "center", horizontal: "center", coverage: "85-95%" },
    emptyArea: { position: "none" },
    visualPromptTemplate: "商品居中放大，占画面85-95%，背景简洁干净，光线均匀自然"
  },
  
  applicableSections: ["material_texture", "detail_showcase"]
};
```

### A.2 金色奢华系列

```typescript
/** 金色奢华模板 */
export const luxury_gold: LayoutTemplateDefinition = {
  id: "luxury-gold",
  displayName: "金色奢华",
  category: "luxury",
  
  layout: {
    id: "fullscreen-dark-center",
    position: { vertical: "center", horizontal: "center" },
    overlay: { type: "solid", color: "#000000", opacity: 0.35 },
    typography: {
      title: { fontSize: 42, fontWeight: 300, color: "#FFD700", letterSpacing: 0.05 },
      copy: { fontSize: 18, fontWeight: 300, color: "#FFFFFF", opacity: 0.8 },
      textAlign: "center"
    },
    rhythm: { titleCopyGap: 20, maxWidth: 500 }
  },
  
  designElements: {
    textEffect: {
      style: "gold_emboss",
      appliedTo: "title",
      config: { 
        primaryColor: "#FFD700", 
        highlightColor: "#FFF8DC",
        shadowColor: "#C9A227",
        embossDepth: 2
      }
    },
    microDecorations: [
      { type: "corner_ornament", position: { x: 0.02, y: 0.02, width: 0.10, height: 0.10 }, style: { primaryColor: "#FFD700", opacity: 0.7 } },
      { type: "corner_ornament", position: { x: 0.88, y: 0.88, width: 0.10, height: 0.10 }, style: { primaryColor: "#FFD700", opacity: 0.7 } }
    ],
    divider: {
      type: "divider_line",
      position: { x: 0.15, y: 0.55, width: 0.70, height: 0.002 },
      style: { color: "#FFD700", thickness: 1, opacity: 0.6 }
    }
  },
  
  colorScheme: { primary: "#FFD700", secondary: "#C9A227", shadowColor: "#000000", glowColor: "#FFF8DC" },
  
  imageConstraint: {
    productPosition: { vertical: "center", horizontal: "center", coverage: "80-90%" },
    emptyArea: { position: "none" },
    visualPromptTemplate: "商品居中放大，占画面80-90%，背景深色简洁，光线柔和，可叠加半透明遮罩"
  },
  
  applicableSections: ["brand_story", "detail_showcase", "price_display"]
};

/** 金色经典模板 */
export const luxury_classic: LayoutTemplateDefinition = {
  id: "luxury-classic",
  displayName: "金色经典",
  category: "luxury",
  
  layout: {
    id: "left-aligned-magazine",
    position: { vertical: "center", horizontal: "left", offset: { left: "40px" } },
    overlay: { type: "gradient", color: "#FFFFFF", opacity: 0.3, gradientDirection: "to-right" },
    typography: {
      title: { fontSize: 32, fontWeight: 500, color: "#FFD700" },
      copy: { fontSize: 14, fontWeight: 400, color: "#333333" },
      textAlign: "left"
    },
    rhythm: { titleCopyGap: 12, maxWidth: 250 }
  },
  
  designElements: {
    divider: {
      type: "divider_line",
      position: { x: 0.28, y: 0.25, width: 0.002, height: 0.50 },
      style: { color: "#FFD700", thickness: 1, opacity: 0.8, gradient: { direction: "vertical", startColor: "#FFD700", endColor: "#FFFFFF" } }
    },
    textEffect: {
      style: "gradient",
      appliedTo: "title",
      config: { startColor: "#FFD700", endColor: "#C9A227", direction: "vertical" }
    },
    brandAccent: {
      type: "hot_mark",
      position: { x: 0.05, y: 0.75, width: 0.08, height: 0.05 },
      style: { primaryColor: "#FFD700", shape: "badge" },
      content: "精选"
    }
  },
  
  colorScheme: { primary: "#FFD700", secondary: "#C9A227", shadowColor: "#000000", glowColor: "#FFF8DC" },
  
  imageConstraint: {
    productPosition: { vertical: "center", horizontal: "right", xRange: "0.30-0.85", coverage: "60-70%" },
    emptyArea: { position: "left", size: "20%" },
    visualPromptTemplate: "商品偏右展示，位置 x=0.30-0.85，占画面60-70%，左侧浅色背景延伸，预留左侧20%空白"
  },
  
  applicableSections: ["styling_guide", "brand_story"]
};
```

### A.3 其他系列（极简白金、科技蓝、自然绿）

（完整定义见 `designTemplates.ts`）

### A.4 模板映射表

```typescript
// apps/web/pages/image-project/components/templates/templateMapping.ts

export const SECTION_TEMPLATE_MAP: Record<SectionType, string[]> = {
  material_texture: ["xiaohongshu-fashion", "xiaohongshu-minimal", "luxury-gold"],
  brand_story: ["luxury-gold", "xiaohongshu-fashion", "minimal-white-gold"],
  detail_showcase: ["luxury-gold", "xiaohongshu-minimal", "tech-blue-modern"],
  styling_guide: ["luxury-classic", "xiaohongshu-fashion"],
  call_to_action: ["xiaohongshu-sale", "tech-blue-neon"],
  hot_sales: ["xiaohongshu-sale"],
  quality_cert: ["minimal-white-gold", "natural-eco"],
  user_review: ["minimal-white-gold", "xiaohongshu-minimal"],
  price_display: ["xiaohongshu-sale", "luxury-gold"],
  scene_application: ["natural-eco", "xiaohongshu-fashion"]
};

/** LLM智能选择模板的默认规则 */
export const DEFAULT_TEMPLATE_PRIORITY: Partial<Record<SectionType, string>> = {
  material_texture: "xiaohongshu-fashion",   // 默认小红书时尚
  brand_story: "luxury-gold",                 // 默认金色奢华
  call_to_action: "xiaohongshu-sale",         // 默认小红书促销
  hot_sales: "xiaohongshu-sale",              // 默认小红书促销
  price_display: "xiaohongshu-sale",          // 默认小红书促销
  quality_cert: "minimal-white-gold"          // 默认极简白金
};
```

---

## 附录 B: 渲染器实现细节

### B.1 设计感元素渲染组件

```typescript
// apps/web/pages/image-project/components/templates/DesignElementsRenderer.tsx

import React from 'react';
import type { DividerElement, BrandAccentElement, MicroDecoration, TextEffectConfig } from './types';

/** 分割线渲染器 */
export const DividerLine: React.FC<{ element: DividerElement; width: number; height: number }> = ({ element, width, height }) => {
  const { position, style } = element;
  
  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x * width}px`,
    top: `${position.y * height}px`,
    width: position.width ? `${position.width * width}px` : `${style.thickness}px`,
    height: position.height ? `${position.height * height}px` : `${style.thickness}px`,
    backgroundColor: style.gradient ? undefined : style.color,
    opacity: style.opacity,
  };
  
  if (style.gradient) {
    const gradientDir = style.gradient.direction === 'horizontal' ? 'to right' : 'to bottom';
    lineStyle.background = `linear-gradient(${gradientDir}, ${style.gradient.startColor}, ${style.gradient.endColor})`;
  }
  
  return <div style={lineStyle} />;
};

/** 品牌点缀渲染器 */
export const BrandAccent: React.FC<{ element: BrandAccentElement; width: number; height: number }> = ({ element, width, height }) => {
  const { position, style, content } = element;
  
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x * width}px`,
    top: `${position.y * height}px`,
    minWidth: `${position.width * width}px`,
    height: `${position.height * height}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  };
  
  // 根据形状类型渲染
  switch (style.shape) {
    case 'pill':
      return (
        <div style={{ ...containerStyle, backgroundColor: style.primaryColor, borderRadius: '999px', padding: '4px 12px' }}>
          <span style={{ color: style.secondaryColor, fontSize: 14, fontWeight: 500 }}>{content}</span>
        </div>
      );
    case 'ribbon':
      return (
        <div style={{ ...containerStyle, backgroundColor: style.primaryColor, clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)', padding: '6px 16px' }}>
          <span style={{ color: style.secondaryColor, fontSize: 16, fontWeight: 600 }}>{content}</span>
        </div>
      );
    case 'badge':
      return (
        <div style={{ ...containerStyle, backgroundColor: style.primaryColor, borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
          <span style={{ color: style.secondaryColor || '#FFFFFF', fontSize: 12 }}>{content}</span>
        </div>
      );
    default:
      return null;
  }
};

/** 微交互装饰渲染器 */
export const MicroDecorationElement: React.FC<{ element: MicroDecoration; width: number; height: number }> = ({ element, width, height }) => {
  const { type, position, style } = element;
  
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x * width}px`,
    top: `${position.y * height}px`,
    width: `${position.width * width}px`,
    height: `${position.height * height}px`,
  };
  
  // 根据 type 渲染不同装饰（复用现有的图形渲染逻辑）
  // corner_ornament, number_badge, neon_pulse, star_rating 等
  // 可以直接复用 GraphicsSvgOverlay 中的渲染代码
  
  return <div style={baseStyle}>{/* 装饰内容 */}</div>;
};

/** 文字效果应用器 */
export const applyTextEffect = (effect: TextEffectConfig, baseStyle: React.CSSProperties): React.CSSProperties => {
  if (!effect) return baseStyle;
  
  const result = { ...baseStyle };
  
  switch (effect.style) {
    case 'outline':
      result.textShadow = `0 0 ${effect.config.shadowBlur}px ${effect.config.shadowColor}`;
      break;
    case 'shadow':
      result.textShadow = `${effect.config.shadowOffset?.x || 2}px ${effect.config.shadowOffset?.y || 2}px ${effect.config.shadowBlur}px ${effect.config.shadowColor}`;
      break;
    case 'gold_emboss':
      // 多层阴影模拟金属浮雕效果
      result.textShadow = `
        0 1px 0 ${effect.config.highlightColor},
        0 2px 0 ${effect.config.primaryColor},
        0 3px 0 ${effect.config.shadowColor},
        0 4px 3px rgba(0,0,0,0.4)
      `;
      break;
    case 'gradient':
      // CSS 无法直接做文字渐变，需要特殊处理
      // 方案：使用 background-clip: text
      result.background = `linear-gradient(${effect.config.direction || 'vertical' === 'vertical' ? 'to bottom' : 'to right'}, ${effect.config.startColor}, ${effect.config.endColor})`;
      result.backgroundClip = 'text';
      result.webkitBackgroundClip = 'text';
      result.webkitTextFillColor = 'transparent';
      break;
    case 'neon':
      result.textShadow = `
        0 0 ${effect.config.shadowBlur}px ${effect.config.glowColor},
        0 0 ${effect.config.shadowBlur * 2}px ${effect.config.glowColor},
        0 0 ${effect.config.shadowBlur * 4}px ${effect.config.glowColor}
      `;
      break;
  }
  
  return result;
};
```

### B.2 LayoutRenderer 改造

```typescript
// apps/web/pages/image-project/components/templates/LayoutRenderer.tsx

import React, { forwardRef } from 'react';
import { DESIGN_TEMPLATES } from './designTemplates';
import { DividerLine, BrandAccent, MicroDecorationElement, applyTextEffect } from './DesignElementsRenderer';
import type { TemplateDrivenSection } from './types';

interface LayoutRendererProps {
  section: TemplateDrivenSection;
  templateId: string;
  backgroundImage: string;
  width?: number;
  height?: number;
}

export const LayoutRenderer = forwardRef<HTMLDivElement, LayoutRendererProps>(
  ({ section, templateId, backgroundImage, width = 750, height = 900 }, ref) => {
    const template = DESIGN_TEMPLATES[templateId];
    if (!template) {
      console.error(`Template not found: ${templateId}`);
      return null;
    }
    
    // 容器样式
    const containerStyle: React.CSSProperties = {
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url(${backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    };
    
    // 遮罩样式
    const overlayStyle = computeOverlayStyle(template.layout.overlay);
    
    // 文字区域样式（从模板 layout.position 计算）
    const textAreaStyle = computeTextAreaStyle(template.layout);
    
    // 标题样式（应用 textEffect）
    const titleBaseStyle = computeTitleStyle(template.layout.typography);
    const titleStyle = applyTextEffect(template.designElements.textEffect?.appliedTo === 'title' ? template.designElements.textEffect : null, titleBaseStyle);
    
    // 文案样式
    const copyStyle = computeCopyStyle(template.layout.typography);
    
    return (
      <div ref={ref} style={containerStyle}>
        {/* 1. 遮罩层 */}
        {template.layout.overlay.type !== 'none' && <div style={overlayStyle} />}
        
        {/* 2. 设计感元素层 */}
        {template.designElements.divider && (
          <DividerLine element={template.designElements.divider} width={width} height={height} />
        )}
        {template.designElements.brandAccent && (
          <BrandAccent element={template.designElements.brandAccent} width={width} height={height} />
        )}
        {template.designElements.microDecorations?.map((dec, idx) => (
          <MicroDecorationElement key={idx} element={dec} width={width} height={height} />
        ))}
        
        {/* 3. 文字层 */}
        <div style={textAreaStyle}>
          {section.title && <h2 style={titleStyle}>{section.title}</h2>}
          {section.copy && <p style={copyStyle}>{section.copy}</p>}
        </div>
      </div>
    );
  }
);

LayoutRenderer.displayName = 'LayoutRenderer';
```

---

## 附录 C: 模板选择器 UI 设计

### C.1 组件设计

```typescript
// apps/web/pages/image-project/components/templates/DesignTemplateSelector.tsx

import React from 'react';
import { DESIGN_TEMPLATES, SECTION_TEMPLATE_MAP } from './designTemplates';
import type { SectionType } from './types';

interface DesignTemplateSelectorProps {
  sectionType: SectionType;
  currentTemplateId: string;
  onTemplateChange: (templateId: string) => void;
}

export const DesignTemplateSelector: React.FC<DesignTemplateSelectorProps> = ({
  sectionType,
  currentTemplateId,
  onTemplateChange,
}) => {
  // 获取当前 sectionType 可用的模板列表
  const availableTemplates = SECTION_TEMPLATE_MAP[sectionType] || [];
  
  return (
    <div className="template-selector">
      <h3 className="text-sm font-medium mb-2">设计模板</h3>
      
      <div className="grid grid-cols-3 gap-2">
        {availableTemplates.map(templateId => {
          const template = DESIGN_TEMPLATES[templateId];
          return (
            <button
              key={templateId}
              onClick={() => onTemplateChange(templateId)}
              className={`template-card ${currentTemplateId === templateId ? 'active ring-2 ring-blue-500' : ''}`}
            >
              {/* 模板缩略图预览 */}
              <div 
                className="template-preview h-16 rounded bg-gray-100"
                style={{
                  // 使用模板的品牌色作为预览色
                  background: `linear-gradient(135deg, ${template.colorScheme.primary}40, ${template.colorScheme.secondary}40)`
                }}
              >
                {/* 模板名称 */}
                <span className="text-xs">{template.displayName}</span>
              </div>
            </button>
          );
        })}
      </div>
      
      {/* 模板详情预览 */}
      {currentTemplateId && (
        <div className="template-detail mt-3 p-2 bg-gray-50 rounded">
          <TemplatePreview templateId={currentTemplateId} />
        </div>
      )}
    </div>
  );
};

/** 模板实时预览组件 */
const TemplatePreview: React.FC<{ templateId: string }> = ({ templateId }) => {
  const template = DESIGN_TEMPLATES[templateId];
  
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium">{template.displayName}</span>
        <span className="text-gray-400">{template.category}</span>
      </div>
      
      {/* 设计感元素预览 */}
      <div className="flex gap-1">
        {template.designElements.divider && <span className="px-1 bg-gray-200 rounded">分割线</span>}
        {template.designElements.brandAccent && <span className="px-1 bg-gray-200 rounded">品牌点缀</span>}
        {template.designElements.textEffect && <span className="px-1 bg-gray-200 rounded">文字效果</span>}
        {template.designElements.microDecorations?.length > 0 && <span className="px-1 bg-gray-200 rounded">装饰</span>}
      </div>
      
      {/* 品牌色系预览 */}
      <div className="flex gap-1 mt-1">
        <div className="w-4 h-4 rounded" style={{ backgroundColor: template.colorScheme.primary }} />
        <div className="w-4 h-4 rounded" style={{ backgroundColor: template.colorScheme.secondary }} />
      </div>
    </div>
  );
};
```

### C.2 UI 位置

- 放置位置：右侧栏「样式」Tab
- 交互方式：点击切换模板，实时预览效果
- 状态同步：切换模板后，更新 `section.displayConfig.templateId`

---

## 附录 D: 数据迁移和兼容处理

### D.1 向后兼容策略

```typescript
// apps/web/pages/image-project/components/templates/templateUtils.ts

/** 判断是否为新版模板驱动数据 */
export function isTemplateDriven(section: PageSection): boolean {
  return section.displayConfig?.templateId !== undefined;
}

/** 兼容渲染：新版用模板，旧版用原有逻辑 */
export function renderSection(section: PageSection, image: string) {
  if (isTemplateDriven(section)) {
    // 新流程：模板驱动渲染
    const template = DESIGN_TEMPLATES[section.displayConfig.templateId];
    return <LayoutRenderer section={section} templateId={section.displayConfig.templateId} backgroundImage={image} />;
  } else {
    // 旧流程：兼容渲染（保留原有 LayoutRenderer 逻辑）
    return <LegacyLayoutRenderer section={section} backgroundImage={image} />;
  }
}

/** 旧数据迁移：为没有 templateId 的 section 补充默认模板 */
export function migrateToTemplateDriven(section: PageSection): TemplateDrivenSection {
  if (isTemplateDriven(section)) {
    return section as TemplateDrivenSection;
  }
  
  // 根据旧版 layoutConfig.template 映射到新版 templateId
  const legacyTemplateId = section.layoutConfig?.template;
  const migratedTemplateId = LEGACY_TEMPLATE_MIGRATION_MAP[legacyTemplateId] || DEFAULT_TEMPLATE_PRIORITY[section.sectionType] || 'xiaohongshu-fashion';
  
  return {
    ...section,
    displayConfig: {
      ...section.displayConfig,
      templateId: migratedTemplateId,
    },
  };
}

/** 旧版模板ID → 新版模板ID 映射 */
const LEGACY_TEMPLATE_MIGRATION_MAP: Record<string, string> = {
  'fullscreen-dark-center': 'luxury-gold',
  'bottom-gradient-classic': 'xiaohongshu-fashion',
  'bottom-pill-social': 'xiaohongshu-sale',
  'left-aligned-magazine': 'luxury-classic',
  'center-no-overlay': 'xiaohongshu-minimal',
};
```

### D.2 数据库字段变更

```sql
-- 无需新增字段，复用现有 displayConfig.templateId
-- 但需要确保 Skill 输出的 templateId 写入数据库

-- 验证现有数据
SELECT section_key, section_type, display_config->>'templateId' as template_id
FROM nrm_image_project_sections
WHERE display_config->>'templateId' IS NULL;  -- 查找需要迁移的旧数据
```

---

## 附录 E: 验证清单

### E.1 Phase 1 验证

- [ ] `designTemplates.ts` 文件创建完成
- [ ] 定义至少 10 个完整模板
- [ ] 每个模板包含 4 个组成部分（layout、designElements、colorScheme、imageConstraint）
- [ ] `SECTION_TEMPLATE_MAP` 映射正确
- [ ] TypeScript 类型定义完整无报错

### E.2 Phase 2 验证

- [ ] Skill 输出格式改为 `templateId + visualPrompt + title + copy`
- [ ] LLM 能正确选择 `templateId`（测试多种 sectionType）
- [ ] `visualPrompt` 包含模板的图片约束词
- [ ] 后端接收并存储 `templateId` 到数据库

### E.3 Phase 3 验证

- [ ] `DesignElementsRenderer.tsx` 组件创建完成
- [ ] DividerLine、BrandAccent、MicroDecorationElement 渲染正确
- [ ] `applyTextEffect` 函数效果正确（outline、shadow、gold_emboss、gradient、neon）
- [ ] LayoutRenderer 改造完成，支持模板驱动渲染
- [ ] SVG 预览效果正确

### E.4 Phase 4 验证

- [ ] 模板选择器组件创建完成
- [ ] UI 放置在右侧栏正确位置
- [ ] 点击切换模板，实时预览更新
- [ ] 切换模板后，数据库更新成功

### E.5 Phase 5 验证

- [ ] 旧数据兼容渲染正确
- [ ] 新模板驱动渲染效果一致
- [ ] Canvas 下载效果匹配 SVG 预览
- [ ] 多模板切换无问题
- [ ] 端到端流程测试通过

---

## 附录 F: 文件变更清单

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `apps/web/pages/image-project/components/templates/designTemplates.ts` | **新建** | 版式模板定义库 |
| `apps/web/pages/image-project/components/templates/templateMapping.ts` | **新建** | sectionType → 模板映射 |
| `apps/web/pages/image-project/components/templates/types.ts` | **修改** | 新增 LayoutTemplateDefinition 类型 |
| `apps/web/pages/image-project/components/templates/DesignElementsRenderer.tsx` | **新建** | 设计感元素渲染组件 |
| `apps/web/pages/image-project/components/templates/LayoutRenderer.tsx` | **修改** | 改造为模板驱动渲染 |
| `apps/web/pages/image-project/components/templates/templateUtils.ts` | **新建** | 兼容处理工具函数 |
| `apps/web/pages/image-project/components/templates/DesignTemplateSelector.tsx` | **新建** | 模板选择器 UI |
| `apps/web/pages/image-project/components/SectionEditor.tsx` | **修改** | 集成模板选择器到右侧栏 |
| `skills/step4_section_planning/system.hbs` | **修改** | 输出格式简化为 templateId + 文案 |
| `src/modules/section-planning-service.ts` | **修改** | 接收并验证 templateId |
| `src/repositories/pg/image-project-section-pg-repository.ts` | **修改** | 存储 templateId 到 displayConfig |