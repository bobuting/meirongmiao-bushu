/**
 * graphics-theme.ts — 图形设计系统
 * 统一色彩层级、分层渲染框架、阴影/高光规范
 * SVG 预览和 Canvas 下载共用此定义，保证一致性
 */

import type { GraphicsElement } from "../../../../../src/contracts/types";

// ================================================================
// 1. 色彩层级系统
// ================================================================

/** 单种图形的完整色彩定义（4 层） */
export interface GraphicColorTheme {
  /** 主体填充色 */
  primary: string;
  /** 亮部 / 高光 / 渐变终点 */
  secondary: string;
  /** 暗部 / 阴影 / 渐变起点 */
  shadow: string;
  /** 发光 / 外晕（带透明度） */
  glow: string;
}

/** 35 种图形 + custom_image 的色彩定义 */
export const GRAPHIC_COLORS: Record<GraphicsElement["type"], GraphicColorTheme> = {
  // --- 原始 8 种 ---
  air_flow:            { primary: "#87CEEB", secondary: "#B8E4F9", shadow: "#4A90B8", glow: "#87CEEB40" },
  elastic_arrow:       { primary: "#FF8C42", secondary: "#FFB87A", shadow: "#C46520", glow: "#FF8C4240" },
  quality_stamp:       { primary: "#D4A843", secondary: "#F5E6C8", shadow: "#9A7420", glow: "#D4A84340" },
  silhouette_line:     { primary: "#E8A0BF", secondary: "#F5C6D0", shadow: "#B87098", glow: "#E8A0BF40" },
  soft_curve:          { primary: "#D4C5A9", secondary: "#F5EDE0", shadow: "#A89878", glow: "#D4C5A940" },
  stitch_mark:         { primary: "#FFFFFF", secondary: "#FFFFFF", shadow: "#CCCCCC", glow: "#FFFFFF40" },
  scene_icon:          { primary: "#E8B86D", secondary: "#F5DEB3", shadow: "#B88840", glow: "#E8B86D40" },
  size_frame:          { primary: "#FFFFFF", secondary: "#FFFFFF", shadow: "#CCCCCC", glow: "#FFFFFF40" },
  // --- 标注类 ---
  arrow_callout:       { primary: "#FF6B6B", secondary: "#FFB3B3", shadow: "#CC3333", glow: "#FF6B6B40" },
  highlight_spot:      { primary: "#FFD93D", secondary: "#FFF3B0", shadow: "#CCB020", glow: "#FFD93D50" },
  crosshair_mark:      { primary: "#6BCB77", secondary: "#B5EAD7", shadow: "#3A9948", glow: "#6BCB7740" },
  circle_callout:      { primary: "#4D96FF", secondary: "#A0C4FF", shadow: "#2060CC", glow: "#4D96FF40" },
  magnifier:           { primary: "#FF922B", secondary: "#FFD8A8", shadow: "#CC6600", glow: "#FF922B40" },
  // --- 标签类 ---
  sale_ribbon:         { primary: "#FF4757", secondary: "#FF6B81", shadow: "#CC1A2A", glow: "#FF475740" },
  tag_label:           { primary: "#FF6348", secondary: "#FFAB91", shadow: "#CC3A20", glow: "#FF634840" },
  number_badge:        { primary: "#2ED573", secondary: "#7BED9F", shadow: "#1A9A4A", glow: "#2ED57340" },
  hot_mark:            { primary: "#FF4500", secondary: "#FF7043", shadow: "#CC3000", glow: "#FF450050" },
  star_rating:         { primary: "#FFA502", secondary: "#FFD43B", shadow: "#CC7800", glow: "#FFA50240" },
  // --- 装饰类 ---
  dot_pattern:         { primary: "#FFFFFF", secondary: "#F0F0F0", shadow: "#BBBBBB", glow: "#FFFFFF30" },
  wave_line:           { primary: "#74B9FF", secondary: "#A0C4FF", shadow: "#4080CC", glow: "#74B9FF40" },
  geometric_shape:     { primary: "#A29BFE", secondary: "#DDD6FE", shadow: "#7068CC", glow: "#A29BFE40" },
  light_glow:          { primary: "#FFEAA7", secondary: "#FEF9E7", shadow: "#CCB870", glow: "#FFEAA750" },
  sparkle:             { primary: "#FFFFFF", secondary: "#FFF9C4", shadow: "#CCCC99", glow: "#FFFFFF50" },
  // --- 版式装饰类（杂志/海报风格）---
  divider_line:        { primary: "#1E293B", secondary: "#94A3B8", shadow: "#0F172A", glow: "#1E293B20" },
  corner_ornament:     { primary: "#D4A843", secondary: "#F5E6C8", shadow: "#9A7420", glow: "#D4A84330" },
  quote_mark:          { primary: "#64748B", secondary: "#CBD5E1", shadow: "#475569", glow: "#64748B20" },
  border_frame:        { primary: "#E2E8F0", secondary: "#F8FAFC", shadow: "#CBD5E1", glow: "#E2E8F015" },
  decorative_icon:     { primary: "#F59E0B", secondary: "#FCD34D", shadow: "#D97706", glow: "#F59E0B30" },
  // --- 功能图标类 ---
  waterproof_shield:   { primary: "#0984E3", secondary: "#74B9FF", shadow: "#065AA0", glow: "#0984E340" },
  uv_protection:       { primary: "#FDCB6E", secondary: "#FFEAA7", shadow: "#CCA040", glow: "#FDCB6E40" },
  eco_leaf:            { primary: "#00B894", secondary: "#55EFC4", shadow: "#008060", glow: "#00B89440" },
  thermo_icon:         { primary: "#E17055", secondary: "#FAB1A0", shadow: "#B04830", glow: "#E1705540" },
  // --- 测量引导类 ---
  measure_line:        { primary: "#DFE6E9", secondary: "#FFFFFF", shadow: "#B2BEC3", glow: "#DFE6E930" },
  compare_frame:       { primary: "#B2BEC3", secondary: "#DFE6E9", shadow: "#808E95", glow: "#B2BEC340" },
  check_mark:          { primary: "#00B894", secondary: "#55EFC4", shadow: "#008060", glow: "#00B89440" },
  // --- 氛围装饰类（精致氛围感）---
  feather:             { primary: "#E8D5B7", secondary: "#F5EDE0", shadow: "#C4B498", glow: "#E8D5B740" },
  pen_tip:             { primary: "#2C3E50", secondary: "#5D6D7E", shadow: "#1A252F", glow: "#2C3E5030" },
  butterfly:           { primary: "#E8B4B8", secondary: "#F5D6D8", shadow: "#C49898", glow: "#E8B4B840" },
  heart_icon:          { primary: "#E8A0A0", secondary: "#F5C0C0", shadow: "#C48080", glow: "#E8A0A040" },
  leaf_decor:          { primary: "#7CB342", secondary: "#9CCC65", shadow: "#558B2F", glow: "#7CB34240" },
  sparkle_star:        { primary: "#FFD700", secondary: "#FFF8DC", shadow: "#DAA520", glow: "#FFD70050" },
  ribbon_decor:        { primary: "#E8B4D8", secondary: "#F5D6E8", shadow: "#C498B8", glow: "#E8B4D840" },
  flower_decor:        { primary: "#E898B8", secondary: "#F5B8D8", shadow: "#C47898", glow: "#E898B840" },
  music_note:          { primary: "#E8B498", secondary: "#F5D6C0", shadow: "#C49478", glow: "#E8B49840" },
  crown_decor:         { primary: "#D4AF37", secondary: "#F5DEB3", shadow: "#A88720", glow: "#D4AF3740" },
  // --- 自选图片 ---
  custom_image:        { primary: "#FFFFFF", secondary: "#FFFFFF", shadow: "#CCCCCC", glow: "#FFFFFF20" },
  // --- 价格标签 ---
  price_tag:           { primary: "#FF4757", secondary: "#FFFFFF", shadow: "#CC2233", glow: "#FF475740" },
};

// ================================================================
// 2. 阴影/高光参数
// ================================================================

/** 分层渲染阴影参数 */
export interface ShadowConfig {
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

/** 分层渲染高光参数 */
export interface HighlightConfig {
  color: string;
  opacity: number;
}

/** 按图形分类的阴影配置 */
export const SHADOW_PRESETS: Record<GraphicCategory, ShadowConfig> = {
  annotation:  { dx: 1.5, dy: 2,   blur: 4, color: "#000000", opacity: 0.25 },
  badge:       { dx: 2,   dy: 3,   blur: 6, color: "#000000", opacity: 0.3 },
  decoration:  { dx: 0.5, dy: 1,   blur: 2, color: "#000000", opacity: 0.15 },
  functional:  { dx: 1.5, dy: 2,   blur: 4, color: "#000000", opacity: 0.25 },
  measurement: { dx: 0.5, dy: 0.5, blur: 1, color: "#000000", opacity: 0.1 },
  original:    { dx: 1,   dy: 1.5, blur: 3, color: "#000000", opacity: 0.2 },
};

/** 按图形分类的高光配置 */
export const HIGHLIGHT_PRESETS: Record<GraphicCategory, HighlightConfig> = {
  annotation:  { color: "#FFFFFF", opacity: 0.25 },
  badge:       { color: "#FFFFFF", opacity: 0.3 },
  decoration:  { color: "#FFFFFF", opacity: 0.15 },
  functional:  { color: "#FFFFFF", opacity: 0.2 },
  measurement: { color: "#FFFFFF", opacity: 0.1 },
  original:    { color: "#FFFFFF", opacity: 0.2 },
};

// ================================================================
// 3. 图形分类映射
// ================================================================

export type GraphicCategory = "annotation" | "badge" | "decoration" | "functional" | "measurement" | "original";

/** 图形类型 → 分类 */
export const GRAPHIC_CATEGORY_MAP: Record<GraphicsElement["type"], GraphicCategory> = {
  // 原始 8 种
  air_flow: "original", elastic_arrow: "original", quality_stamp: "badge",
  silhouette_line: "original", soft_curve: "decoration", stitch_mark: "original",
  scene_icon: "original", size_frame: "measurement",
  // 标注类
  arrow_callout: "annotation", highlight_spot: "annotation", crosshair_mark: "annotation",
  circle_callout: "annotation", magnifier: "annotation",
  // 标签类
  sale_ribbon: "badge", tag_label: "badge", number_badge: "badge",
  hot_mark: "badge", star_rating: "badge",
  // 装饰类
  dot_pattern: "decoration", wave_line: "decoration", geometric_shape: "decoration",
  light_glow: "decoration", sparkle: "decoration",
  // 版式装饰类（杂志/海报风格）
  divider_line: "decoration", corner_ornament: "decoration", quote_mark: "decoration",
  border_frame: "decoration", decorative_icon: "decoration",
  // 功能图标类
  waterproof_shield: "functional", uv_protection: "functional",
  eco_leaf: "functional", thermo_icon: "functional",
  // 测量引导类
  measure_line: "measurement", compare_frame: "measurement", check_mark: "measurement",
  // 氛围装饰类（精致氛围感）
  feather: "decoration", pen_tip: "decoration", butterfly: "decoration",
  heart_icon: "decoration", leaf_decor: "decoration", sparkle_star: "decoration",
  ribbon_decor: "decoration", flower_decor: "decoration", music_note: "decoration",
  crown_decor: "decoration",
  // 自选图片
  custom_image: "original",
  // 价格标签
  price_tag: "badge",
};

/** 获取图形分类（带回退防止 undefined） */
export function getGraphicCategory(type: GraphicsElement["type"]): GraphicCategory {
  const cat = GRAPHIC_CATEGORY_MAP[type];
  if (!cat) {
    console.warn(`Unknown graphics type: ${type}, using "original" category`);
    return "original";
  }
  return cat;
}

/** 获取图形色彩（带回退防止崩溃） */
export function getGraphicColors(type: GraphicsElement["type"]): GraphicColorTheme {
  const colors = GRAPHIC_COLORS[type];
  if (!colors) {
    // 新图形类型未定义时的回退
    console.warn(`Unknown graphics type: ${type}, using default colors`);
    return { primary: "#FF6B6B", secondary: "#FFB3B3", shadow: "#CC3333", glow: "#FF6B6B40" };
  }
  return colors;
}

// ================================================================
// 4. Canvas 分层渲染辅助函数
// ================================================================

/** Canvas 绘制阴影层 */
export function canvasDrawShadow(
  ctx: CanvasRenderingContext2D,
  type: GraphicsElement["type"],
  drawBody: () => void,
  scale: number = 1,
): void {
  const cat = getGraphicCategory(type);
  const preset = SHADOW_PRESETS[cat];
  ctx.save();
  ctx.shadowOffsetX = preset.dx * scale;
  ctx.shadowOffsetY = preset.dy * scale;
  ctx.shadowBlur = preset.blur * scale;
  ctx.shadowColor = preset.color;
  ctx.globalAlpha = preset.opacity;
  drawBody();
  ctx.restore();
}

/** Canvas 绘制高光层（半透明白色覆盖在主体上方） */
export function canvasDrawHighlight(
  ctx: CanvasRenderingContext2D,
  type: GraphicsElement["type"],
): void {
  const cat = getGraphicCategory(type);
  const preset = HIGHLIGHT_PRESETS[cat];
  // 高光由各图形自行绘制位置，这里只设置全局透明度
  ctx.save();
  ctx.globalAlpha = preset.opacity;
  // 具体高光绘制由各图形实现
  ctx.restore();
}

// ================================================================
// 5. SVG 共享 Filter 定义
// ================================================================

/** 生成 SVG 共享 filter 定义（放在 <defs> 中） */
export function svgSharedFilterDefs(): string {
  return `
    <!-- 标注类阴影 -->
    <filter id="shadow-annotation" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1.5" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.25" />
    </filter>
    <!-- 标签类阴影（更重） -->
    <filter id="shadow-badge" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="6" flood-color="#000000" flood-opacity="0.3" />
    </filter>
    <!-- 装饰类阴影（轻） -->
    <filter id="shadow-decoration" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0.5" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.15" />
    </filter>
    <!-- 功能图标阴影 -->
    <filter id="shadow-functional" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1.5" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.25" />
    </filter>
    <!-- 原始类型阴影 -->
    <filter id="shadow-original" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1.5" stdDeviation="3" flood-color="#000000" flood-opacity="0.2" />
    </filter>
  `;
}

/** 获取图形分类对应的 SVG shadow filter id */
export function svgShadowFilterId(type: GraphicsElement["type"]): string | null {
  const cat = getGraphicCategory(type);
  if (cat === "measurement") return null; // 测量类不加阴影
  return `shadow-${cat}`;
}

/** 获取图形默认透明度（按分类） */
export function getDefaultGraphicOpacity(type: GraphicsElement["type"] | "art_text"): number {
  // 艺术字：高可见度
  if (type === "art_text") return 0.95;

  const t = type as GraphicsElement["type"];
  // 标注类 + 标签类 + 功能图标类：高可见度
  if (["arrow_callout", "highlight_spot", "crosshair_mark", "circle_callout", "magnifier",
       "sale_ribbon", "tag_label", "number_badge", "hot_mark", "star_rating",
       "waterproof_shield", "uv_protection", "eco_leaf", "thermo_icon",
       "check_mark", "quality_stamp"].includes(t)) return 0.92;
  // 装饰类：半透明
  if (["dot_pattern", "wave_line", "geometric_shape", "light_glow", "sparkle",
       "air_flow", "soft_curve"].includes(t)) return 0.75;
  // 其他（轮廓/测量/场景）
  return 0.85;
}

// ================================================================
// 6. 统一渲染比例常量（SVG 预览与 Canvas 下载视觉一致）
// ================================================================

/**
 * 核心原则：所有渲染参数基于元素尺寸比例，而非容器尺寸
 * - strokeWidth = 元素宽度 × STROKE_RATIO
 * - fontSize = 元素高度 × FONT_RATIO
 * - shadowBlur = 元素宽度 × SHADOW_RATIO
 * 这样无论容器多大（308px 预览或 750px 下载），视觉效果完全一致
 */

/** 线条宽度比例（基于元素宽度 w） */
export const STROKE_RATIO = {
  thin: 0.015,    // 细线：1.5% of w
  normal: 0.02,   // 正常：2% of w
  thick: 0.03,    // 粗线：3% of w
  bold: 0.04,     // 加粗：4% of w
  extraBold: 0.05, // 特粗：5% of w
};

/** 字体大小比例（基于元素高度 h） */
export const FONT_RATIO = {
  small: 0.15,    // 小字：15% of h
  normal: 0.2,    // 正常：20% of h
  large: 0.25,    // 大字：25% of h
  title: 0.35,    // 标题：35% of h
};

/** 阴影参数比例（基于元素尺寸） */
export const SHADOW_RATIO = {
  blur: 0.04,     // 模糊：4% of min(w, h)
  offsetX: 0.01,  // X偏移：1% of w
  offsetY: 0.02,  // Y偏移：2% of h
};

/** 艺术字专用比例（基于 fontSize） */
export const ART_TEXT_RATIO = {
  strokeWidth: {
    outlineOuter: 0.1,   // 外层描边：10% of fontSize
    outlineMain: 0.06,   // 主描边：6% of fontSize
    outlineInner: 0.015, // 内层高光：1.5% of fontSize
    shadow: 0.05,        // 阴影描边：5% of fontSize
    highlight: 0.01,     // 高光描边：1% of fontSize
  },
  shadowOffset: 0.02,    // 阴影偏移：2% of fontSize
  glowRadius: 0.08,      // 发光半径：8% of fontSize
};

/** 计算 strokeWidth（基于元素宽度） */
export function getStrokeWidth(w: number, thickness: keyof typeof STROKE_RATIO = "normal"): number {
  return Math.max(0.5, w * STROKE_RATIO[thickness]);
}

/** 计算 fontSize（基于元素高度） */
export function getFontSize(h: number, size: keyof typeof FONT_RATIO = "normal"): number {
  return clamp(h * FONT_RATIO[size], 12, 120);
}

/** 计算阴影 blur（基于元素尺寸） */
export function getShadowBlur(w: number, h: number): number {
  return Math.max(1, Math.min(w, h) * SHADOW_RATIO.blur);
}

/** 计算艺术字 strokeWidth（基于 fontSize） */
export function getArtTextStrokeWidth(fontSize: number, type: keyof typeof ART_TEXT_RATIO["strokeWidth"]): number {
  return Math.max(0.5, fontSize * ART_TEXT_RATIO.strokeWidth[type]);
}

/** clamp 工具函数（避免重复导入） */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
