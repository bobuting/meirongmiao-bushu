/**
 * 版式模板类型定义
 * 全屏背景图 + 文字叠加版式系统
 */

/**
 * 版式模板接口
 */
export interface LayoutTemplate {
  id: string;
  name: string;
  category: TemplateCategory;

  // 文字叠加位置
  position: {
    vertical: "top" | "center" | "bottom" | "top-third" | "bottom-third";
    horizontal: "left" | "center" | "right";
    offset?: {
      top?: string;
      bottom?: string;
      left?: string;
      right?: string;
    };
  };

  // 遮罩效果
  overlay: {
    type: "none" | "solid" | "gradient" | "blur" | "shape" | "block";
    opacity: number;
    gradientDirection?: "to-top" | "to-bottom" | "to-left" | "to-right" | "to-top-right" | "to-bottom-left";
    color?: string;
    borderRadius?: number;
  };

  // 文字样式
  typography: {
    title: {
      fontSize: number;
      fontWeight: number;
      letterSpacing: number;
      colorMode: "auto" | "white" | "black" | "custom";
      customColor?: string;
      shadow: boolean;
      shadowConfig?: {
        color: string;
        blur: number;
        offsetX: number;
        offsetY: number;
      };
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

  // 排版节奏
  rhythm: {
    titleCopyGap: number;
    paddingX: number;
    paddingY: number;
    maxWidth?: number;
    blocks: "stack" | "split-horizontal" | "split-vertical";
  };

  // 特效（可选）
  effects?: {
    animation?: string;
    decorativeElements?: {
      type: "line" | "dot" | "badge";
      position: string;
      color: string;
    };
  };
}

/**
 * LLM 版式分析输出
 */
export interface LayoutAnalysisResult {
  // 图片分析结果
  imageAnalysis: {
    mainSubject: "model" | "product" | "scene" | "composition";
    subjectPosition: {
      vertical: "top" | "center" | "bottom" | "full";
      horizontal: "left" | "center" | "right" | "full";
    };
    brightness: "bright" | "dark" | "mixed";
    brightnessDistribution: {
      top: "bright" | "dark" | "neutral";
      bottom: "bright" | "dark" | "neutral";
      left: "bright" | "dark" | "neutral";
      right: "bright" | "dark" | "neutral";
    };
    emptyAreas: Array<{
      position: string;
      size: "large" | "medium" | "small";
    }>;
  };

  // 版式推荐
  layoutRecommendation: {
    primaryTemplate: string;
    alternativeTemplates: string[];
    adjustments?: {
      textPosition?: {
        vertical?: string;
        horizontal?: string;
        offset?: { top?: string; bottom?: string; left?: string; right?: string };
      };
      textColorOverride?: "white" | "black";
      overlayOpacityOverride?: number;
      overlayColorOverride?: string;
    };
    reasoning: string;
  };
}

/**
 * 版式渲染参数（用于实际渲染）
 */
export interface LayoutRenderParams {
  backgroundImage: string;
  title: string | null;
  copy: string | null;
  templateId: string;
  customOverrides?: Partial<LayoutTemplate>;
  width: number;
  height: number;
}

// ============================================================
// 版式模板驱动系统 - 新增类型定义
// ============================================================

/** Section 类型枚举（与后端 contracts/types.ts 保持一致） */
export type SectionType =
  // 后端原有类型
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
  // 前端扩展类型（设计模板系统新增）
  | 'hot_sales'
  | 'quality_cert'
  | 'price_display';

/** 模板风格分类 */
export type TemplateCategory = 'xiaohongshu' | 'luxury' | 'minimal' | 'tech' | 'natural' | 'editorial' | 'creative' | 'dark' | 'social' | 'magazine' | 'card';

/** 位置定义 */
export interface ElementPosition {
  x: number;      // 相对位置 0-1
  y: number;      // 相对位置 0-1
  width?: number; // 相对宽度 0-1
  height?: number; // 相对高度 0-1
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
    yRange?: string;       // 如 '0.15-0.65'
    horizontal?: 'center' | 'left' | 'right';
    xRange?: string;       // 如 '0.20-0.85'
    coverage: string;      // 如 '70-80%'
  };
  emptyArea: {
    position: 'none' | 'bottom' | 'top' | 'left' | 'right';
    size: string;          // 如 '25%'
  };
  backgroundStyle?: {
    type: 'solid' | 'gradient' | 'blur' | 'clean';
    simplicity?: 'high' | 'medium';
    lighting?: 'soft' | 'bright' | 'natural';
  };
  visualPromptTemplate: string;
}

/** 版式模板完整定义 */
export interface LayoutTemplateDefinition {
  id: string;
  displayName: string;
  category: TemplateCategory;

  /** 版式骨架（复用现有 LayoutTemplate） */
  layout: LayoutTemplate;

  /** 设计感元素 */
  designElements: DesignElements;

  /** 品牌色系 */
  colorScheme: ColorScheme;

  /** 图片约束 */
  imageConstraint: ImageConstraint;

  /** 适用场景 */
  applicableSections: SectionType[];
}

/** 模板驱动的 Section 数据 */
export interface TemplateDrivenSection {
  sectionKey: string;
  sectionType: SectionType;
  templateId: string;
  visualPrompt: string;
  title: string;
  copy?: string | null;
  renderConfig?: {
    width: number;
    height: number;
    quality: 'high' | 'medium';
  };
}