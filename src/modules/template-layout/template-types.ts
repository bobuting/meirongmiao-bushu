/**
 * 版式模板类型定义（后端用）
 * 从前端 templates/types.ts 复制，去掉 UI 相关类型
 */

/** Section 类型枚举 */
export type SectionType =
  | 'outfit_overview'
  | 'detail_showcase'
  | 'scene_application'
  | 'material_texture'
  | 'size_comparison'
  | 'call_to_action'
  | 'brand_story'
  | 'styling_guide'
  | 'detail_closeup'
  | 'outfit_recommendation'
  | 'user_review'
  | 'hot_sales'
  | 'quality_cert'
  | 'price_display';

/** 模板风格分类 */
export type TemplateCategory = 'xiaohongshu' | 'luxury' | 'minimal' | 'tech' | 'natural' | 'editorial' | 'creative' | 'dark';

/** 版式骨架分类（LayoutTemplate 专用，含 layout 级别的细分类型） */
export type LayoutCategory = TemplateCategory | 'social' | 'magazine';

/** 位置定义 */
export interface ElementPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** 渐变配置 */
export interface GradientConfig {
  direction: 'horizontal' | 'vertical';
  startColor: string;
  endColor: string;
  startOpacity?: number;
  endOpacity?: number;
}

/** 分割线元素 */
export interface DividerElement {
  type: 'divider_line';
  position: ElementPosition;
  style: {
    color: string;
    thickness: number;
    opacity: number;
    gradient?: GradientConfig;
  };
}

/** 品牌点缀元素 */
export interface BrandAccentElement {
  type: 'price_tag' | 'sale_ribbon' | 'tag_label' | 'hot_mark';
  position: ElementPosition;
  style: {
    primaryColor: string;
    secondaryColor?: string;
    shape: 'pill' | 'ribbon' | 'badge' | 'stamp';
  };
  content?: string;
}

/** 文字效果配置 */
export interface TextEffectConfig {
  style: 'outline' | 'shadow' | 'gold_emboss' | 'gradient' | 'neon';
  appliedTo: 'title' | 'copy' | 'artText';
  config: {
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffset?: { x: number; y: number };
    glow?: boolean;
    glowColor?: string;
    primaryColor?: string;
    secondaryColor?: string;
    highlightColor?: string;
    embossDepth?: number;
  };
}

/** 微交互装饰元素 */
export interface MicroDecoration {
  type: 'number_badge' | 'star_rating' | 'corner_ornament' | 'neon_pulse';
  position: ElementPosition;
  style: {
    primaryColor: string;
    secondaryColor?: string;
    opacity?: number;
    glow?: boolean;
  };
  content?: string | number;
}

/** 设计感元素集合 */
export interface DesignElements {
  divider?: DividerElement;
  brandAccent?: BrandAccentElement;
  textEffect?: TextEffectConfig;
  microDecorations?: MicroDecoration[];
}

/** 品牌色系 */
export interface ColorScheme {
  primary: string;
  secondary: string;
  shadowColor: string;
  glowColor: string;
}

/** 图片约束配置 */
export interface ImageConstraint {
  productPosition: {
    vertical: 'center' | 'center-top' | 'center-bottom';
    yRange?: string;
    horizontal?: 'center' | 'left' | 'right';
    xRange?: string;
    coverage: string;
  };
  emptyArea: {
    position: 'none' | 'bottom' | 'top' | 'left' | 'right';
    size: string;
  };
  backgroundStyle?: {
    type: 'solid' | 'gradient' | 'blur' | 'clean';
    simplicity?: 'high' | 'medium';
    lighting?: 'soft' | 'bright' | 'natural';
  };
  visualPromptTemplate: string;
}

/** 版式骨架（文字叠加布局） */
export interface LayoutTemplate {
  id: string;
  name: string;
  category: LayoutCategory;
  position: {
    vertical: "top" | "center" | "bottom" | "top-third" | "bottom-third";
    horizontal: "left" | "center" | "right";
    offset?: { top?: string; bottom?: string; left?: string; right?: string };
  };
  overlay: {
    type: "none" | "solid" | "gradient" | "blur" | "shape" | "block";
    opacity: number;
    gradientDirection?: "to-top" | "to-bottom" | "to-left" | "to-right" | "to-top-right" | "to-bottom-left";
    color?: string;
    borderRadius?: number;
  };
  typography: {
    title: {
      fontSize: number;
      fontWeight: number;
      letterSpacing: number;
      colorMode: "auto" | "white" | "black" | "custom";
      customColor?: string;
      shadow: boolean;
      shadowConfig?: { color: string; blur: number; offsetX: number; offsetY: number };
    };
    copy: {
      fontSize: number;
      fontWeight: number;
      letterSpacing: number;
      colorMode: "auto" | "white" | "black" | "custom";
      customColor?: string;
      opacity: number;
    };
    lineHeight: number;
    textAlign: "left" | "center" | "right";
  };
  rhythm: {
    titleCopyGap: number;
    paddingX: number;
    paddingY: number;
    maxWidth?: number;
    blocks: "stack" | "split-horizontal" | "split-vertical";
  };
  effects?: {
    animation?: string;
    decorativeElements?: { type: "line" | "dot" | "badge"; position: string; color: string };
  };
}

/** 版式模板完整定义 */
export interface LayoutTemplateDefinition {
  id: string;
  displayName: string;
  category: TemplateCategory;
  layout: LayoutTemplate;
  designElements: DesignElements;
  colorScheme: ColorScheme;
  imageConstraint: ImageConstraint;
  applicableSections: SectionType[];
}
