/**
 * 设计模板库 - 完整版式模板定义
 * 包含：版式骨架 + 设计感元素 + 品牌色系 + 图片约束
 */

import type { LayoutTemplateDefinition, SectionType } from './types';
import { EXTENDED_TEMPLATES } from './designTemplatesExtended';

// ============================================================
// 小红书风格系列
// ============================================================

/** 小红书时尚模板 */
export const xiaohongshu_fashion: LayoutTemplateDefinition = {
  id: 'xiaohongshu-fashion',
  displayName: '小红书时尚',
  category: 'xiaohongshu',

  layout: {
    id: 'bottom-gradient-classic',
    name: '底部渐变经典',
    category: 'social',
    position: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { bottom: '40px' },
    },
    overlay: {
      type: 'gradient',
      opacity: 0.4,
      gradientDirection: 'to-top',
      color: '#000000',
    },
    typography: {
      title: {
        fontSize: 28,
        fontWeight: 500,
        letterSpacing: 0.02,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 2, offsetX: 1, offsetY: 1 },
      },
      copy: {
        fontSize: 16,
        fontWeight: 400,
        letterSpacing: 0,
        colorMode: 'white',
        opacity: 0.85,
      },
      lineHeight: 1.5,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 12,
      paddingX: 24,
      paddingY: 16,
      maxWidth: 600,
      blocks: 'stack',
    },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.1, y: 0.82, width: 0.8, height: 0.002 },
      style: {
        color: '#FFD700',
        thickness: 1,
        opacity: 0.8,
        gradient: {
          direction: 'horizontal',
          startColor: '#FFD700',
          endColor: '#FFFFFF',
          startOpacity: 0.8,
          endOpacity: 0.3,
        },
      },
    },
    brandAccent: {
      type: 'price_tag',
      position: { x: 0.85, y: 0.88, width: 0.12, height: 0.04 },
      style: {
        primaryColor: '#FF2442',
        secondaryColor: '#FFFFFF',
        shape: 'pill',
      },
    },
    textEffect: {
      style: 'shadow',
      appliedTo: 'title',
      config: {
        shadowColor: '#000000',
        shadowBlur: 2,
        shadowOffset: { x: 1, y: 1 },
      },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.02, y: 0.02, width: 0.08, height: 0.08 },
        style: { primaryColor: '#FFD700', opacity: 0.6 },
      },
    ],
  },

  colorScheme: {
    primary: '#FF2442',
    secondary: '#FFD700',
    shadowColor: '#000000',
    glowColor: '#FF6B6B',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center-top',
      yRange: '0.15-0.65',
      coverage: '70-80%',
    },
    emptyArea: { position: 'bottom', size: '25%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate:
      '商品居中偏上(y=0.15-0.65)，占画面70-80%，底部简洁渐变背景延伸，预留底部25%空白，光线均匀柔和',
  },

  applicableSections: ['material_texture', 'brand_story'],
};

/** 小红书促销模板 */
export const xiaohongshu_sale: LayoutTemplateDefinition = {
  id: 'xiaohongshu-sale',
  displayName: '小红书促销',
  category: 'xiaohongshu',

  layout: {
    id: 'bottom-pill-social',
    name: '底部药丸社交',
    category: 'social',
    position: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { bottom: '35px' },
    },
    overlay: {
      type: 'solid',
      opacity: 0.5,
      color: '#000000',
    },
    typography: {
      title: {
        fontSize: 32,
        fontWeight: 600,
        letterSpacing: 0,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#FF2442', blur: 4, offsetX: 0, offsetY: 0 },
      },
      copy: {
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: 0,
        colorMode: 'custom',
        customColor: '#FF2442',
        opacity: 1,
      },
      lineHeight: 1.4,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 8,
      paddingX: 20,
      paddingY: 12,
      maxWidth: 500,
      blocks: 'stack',
    },
  },

  designElements: {
    brandAccent: {
      type: 'sale_ribbon',
      position: { x: 0.70, y: 0.05, width: 0.25, height: 0.06 },
      style: {
        primaryColor: '#FF2442',
        secondaryColor: '#FFFFFF',
        shape: 'ribbon',
      },
      content: '限时特惠',
    },
    textEffect: {
      style: 'neon',
      appliedTo: 'title',
      config: {
        glowColor: '#FF6B6B',
        shadowBlur: 4,
        glow: true,
      },
    },
    microDecorations: [
      {
        type: 'neon_pulse',
        position: { x: 0.92, y: 0.92, width: 0.06, height: 0.06 },
        style: { primaryColor: '#FF2442', glow: true },
      },
    ],
  },

  colorScheme: {
    primary: '#FF2442',
    secondary: '#FFD700',
    shadowColor: '#000000',
    glowColor: '#FF6B6B',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center-top',
      yRange: '0.10-0.60',
      coverage: '75-85%',
    },
    emptyArea: { position: 'bottom', size: '20%' },
    backgroundStyle: { type: 'solid', simplicity: 'high', lighting: 'bright' },
    visualPromptTemplate: '商品居中偏上，占画面75-85%，底部预留20%空白，背景简洁，光线明亮',
  },

  applicableSections: ['call_to_action', 'hot_sales', 'price_display'],
};

/** 小红书简约模板 */
export const xiaohongshu_minimal: LayoutTemplateDefinition = {
  id: 'xiaohongshu-minimal',
  displayName: '小红书简约',
  category: 'xiaohongshu',

  layout: {
    id: 'center-no-overlay',
    name: '居中无遮罩',
    category: 'minimal',
    position: {
      vertical: 'center',
      horizontal: 'center',
    },
    overlay: {
      type: 'none',
      opacity: 0,
    },
    typography: {
      title: {
        fontSize: 36,
        fontWeight: 300,
        letterSpacing: 0.05,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 3, offsetX: 2, offsetY: 2 },
      },
      copy: {
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: 0,
        colorMode: 'white',
        opacity: 0.9,
      },
      lineHeight: 1.6,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 16,
      paddingX: 24,
      paddingY: 20,
      maxWidth: 550,
      blocks: 'stack',
    },
  },

  designElements: {
    textEffect: {
      style: 'shadow',
      appliedTo: 'title',
      config: {
        shadowColor: '#000000',
        shadowBlur: 3,
        shadowOffset: { x: 2, y: 2 },
      },
    },
  },

  colorScheme: {
    primary: '#FFFFFF',
    secondary: '#FFD700',
    shadowColor: '#000000',
    glowColor: '#F5F5F5',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center',
      coverage: '85-95%',
    },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'natural' },
    visualPromptTemplate: '商品居中放大，占画面85-95%，背景简洁干净，光线均匀自然',
  },

  applicableSections: ['material_texture', 'detail_showcase'],
};

// ============================================================
// 金色奢华系列
// ============================================================

/** 金色奢华模板 */
export const luxury_gold: LayoutTemplateDefinition = {
  id: 'luxury-gold',
  displayName: '金色奢华',
  category: 'luxury',

  layout: {
    id: 'fullscreen-dark-center',
    name: '全屏深色居中',
    category: 'minimal',
    position: {
      vertical: 'center',
      horizontal: 'center',
    },
    overlay: {
      type: 'solid',
      opacity: 0.35,
      color: '#000000',
    },
    typography: {
      title: {
        fontSize: 42,
        fontWeight: 300,
        letterSpacing: 0.05,
        colorMode: 'custom',
        customColor: '#FFD700',
        shadow: true,
        shadowConfig: { color: '#C9A227', blur: 2, offsetX: 1, offsetY: 1 },
      },
      copy: {
        fontSize: 18,
        fontWeight: 300,
        letterSpacing: 0.02,
        colorMode: 'white',
        opacity: 0.8,
      },
      lineHeight: 1.5,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 20,
      paddingX: 24,
      paddingY: 20,
      maxWidth: 500,
      blocks: 'stack',
    },
  },

  designElements: {
    textEffect: {
      style: 'gold_emboss',
      appliedTo: 'title',
      config: {
        primaryColor: '#FFD700',
        highlightColor: '#FFF8DC',
        shadowColor: '#C9A227',
        embossDepth: 2,
      },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.02, y: 0.02, width: 0.10, height: 0.10 },
        style: { primaryColor: '#FFD700', opacity: 0.7 },
      },
      {
        type: 'corner_ornament',
        position: { x: 0.88, y: 0.88, width: 0.10, height: 0.10 },
        style: { primaryColor: '#FFD700', opacity: 0.7 },
      },
    ],
    divider: {
      type: 'divider_line',
      position: { x: 0.15, y: 0.55, width: 0.70, height: 0.002 },
      style: {
        color: '#FFD700',
        thickness: 1,
        opacity: 0.6,
      },
    },
  },

  colorScheme: {
    primary: '#FFD700',
    secondary: '#C9A227',
    shadowColor: '#000000',
    glowColor: '#FFF8DC',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center',
      coverage: '80-90%',
    },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'solid', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品居中放大，占画面80-90%，背景深色简洁，光线柔和，可叠加半透明遮罩',
  },

  applicableSections: ['brand_story', 'detail_showcase', 'price_display'],
};

/** 金色经典模板 */
export const luxury_classic: LayoutTemplateDefinition = {
  id: 'luxury-classic',
  displayName: '金色经典',
  category: 'luxury',

  layout: {
    id: 'left-aligned-magazine',
    name: '左侧对齐杂志',
    category: 'magazine',
    position: {
      vertical: 'center',
      horizontal: 'left',
      offset: { left: '40px' },
    },
    overlay: {
      type: 'gradient',
      opacity: 0.3,
      gradientDirection: 'to-right',
      color: '#FFFFFF',
    },
    typography: {
      title: {
        fontSize: 32,
        fontWeight: 500,
        letterSpacing: 0.02,
        colorMode: 'custom',
        customColor: '#FFD700',
        shadow: false,
      },
      copy: {
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: 0,
        colorMode: 'custom',
        customColor: '#333333',
        opacity: 1,
      },
      lineHeight: 1.5,
      textAlign: 'left',
    },
    rhythm: {
      titleCopyGap: 12,
      paddingX: 16,
      paddingY: 12,
      maxWidth: 250,
      blocks: 'stack',
    },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.28, y: 0.25, width: 0.002, height: 0.50 },
      style: {
        color: '#FFD700',
        thickness: 1,
        opacity: 0.8,
        gradient: {
          direction: 'vertical',
          startColor: '#FFD700',
          endColor: '#FFFFFF',
        },
      },
    },
    textEffect: {
      style: 'gradient',
      appliedTo: 'title',
      config: {
        primaryColor: '#FFD700',
        secondaryColor: '#C9A227',
      },
    },
    brandAccent: {
      type: 'hot_mark',
      position: { x: 0.05, y: 0.75, width: 0.08, height: 0.05 },
      style: {
        primaryColor: '#FFD700',
        shape: 'badge',
      },
      content: '精选',
    },
  },

  colorScheme: {
    primary: '#FFD700',
    secondary: '#C9A227',
    shadowColor: '#000000',
    glowColor: '#FFF8DC',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center',
      horizontal: 'right',
      xRange: '0.30-0.85',
      coverage: '60-70%',
    },
    emptyArea: { position: 'left', size: '20%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品偏右展示，位置 x=0.30-0.85，占画面60-70%，左侧浅色背景延伸，预留左侧20%空白',
  },

  applicableSections: ['styling_guide', 'brand_story'],
};

// ============================================================
// 极简白金系列
// ============================================================

/** 极简白金模板 */
export const minimal_white_gold: LayoutTemplateDefinition = {
  id: 'minimal-white-gold',
  displayName: '极简白金',
  category: 'minimal',

  layout: {
    id: 'center-no-overlay',
    name: '居中无遮罩',
    category: 'minimal',
    position: {
      vertical: 'center',
      horizontal: 'center',
    },
    overlay: {
      type: 'none',
      opacity: 0,
    },
    typography: {
      title: {
        fontSize: 38,
        fontWeight: 400,
        letterSpacing: 0.08,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#FFD700', blur: 1, offsetX: 0, offsetY: 2 },
      },
      copy: {
        fontSize: 16,
        fontWeight: 300,
        letterSpacing: 0.02,
        colorMode: 'white',
        opacity: 0.85,
      },
      lineHeight: 1.5,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 18,
      paddingX: 24,
      paddingY: 20,
      maxWidth: 500,
      blocks: 'stack',
    },
  },

  designElements: {
    textEffect: {
      style: 'outline',
      appliedTo: 'title',
      config: {
        shadowColor: '#FFD700',
        shadowBlur: 1,
        glow: true,
        glowColor: '#FFD700',
      },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.02, y: 0.02, width: 0.06, height: 0.06 },
        style: { primaryColor: '#FFD700', opacity: 0.4 },
      },
      {
        type: 'corner_ornament',
        position: { x: 0.92, y: 0.92, width: 0.06, height: 0.06 },
        style: { primaryColor: '#FFD700', opacity: 0.4 },
      },
    ],
  },

  colorScheme: {
    primary: '#FFFFFF',
    secondary: '#FFD700',
    shadowColor: '#000000',
    glowColor: '#F5F5F5',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center',
      coverage: '80-90%',
    },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'bright' },
    visualPromptTemplate: '商品居中放大，占画面80-90%，背景干净明亮，光线自然',
  },

  applicableSections: ['quality_cert', 'user_review'],
};

// ============================================================
// 科技蓝系列
// ============================================================

/** 科技蓝现代模板 */
export const tech_blue_modern: LayoutTemplateDefinition = {
  id: 'tech-blue-modern',
  displayName: '科技蓝现代',
  category: 'tech',

  layout: {
    id: 'bottom-gradient-classic',
    name: '底部渐变经典',
    category: 'social',
    position: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { bottom: '45px' },
    },
    overlay: {
      type: 'gradient',
      opacity: 0.45,
      gradientDirection: 'to-top',
      color: '#000000',
    },
    typography: {
      title: {
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: 0,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#0066FF', blur: 3, offsetX: 0, offsetY: 0 },
      },
      copy: {
        fontSize: 16,
        fontWeight: 400,
        letterSpacing: 0,
        colorMode: 'white',
        opacity: 0.85,
      },
      lineHeight: 1.5,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 14,
      paddingX: 24,
      paddingY: 16,
      maxWidth: 550,
      blocks: 'stack',
    },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.12, y: 0.85, width: 0.76, height: 0.002 },
      style: {
        color: '#00A3FF',
        thickness: 1,
        opacity: 0.7,
        gradient: {
          direction: 'horizontal',
          startColor: '#00A3FF',
          endColor: '#0066FF',
        },
      },
    },
    textEffect: {
      style: 'neon',
      appliedTo: 'title',
      config: {
        glowColor: '#4D9FFF',
        shadowBlur: 3,
        glow: true,
      },
    },
    microDecorations: [
      {
        type: 'neon_pulse',
        position: { x: 0.03, y: 0.03, width: 0.08, height: 0.08 },
        style: { primaryColor: '#00A3FF', glow: true },
      },
    ],
  },

  colorScheme: {
    primary: '#0066FF',
    secondary: '#00A3FF',
    shadowColor: '#000000',
    glowColor: '#4D9FFF',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center-top',
      yRange: '0.15-0.65',
      coverage: '70-80%',
    },
    emptyArea: { position: 'bottom', size: '25%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品居中偏上，占画面70-80%，底部渐变背景，预留底部25%空白，科技感光线',
  },

  applicableSections: ['detail_showcase', 'call_to_action'],
};

// ============================================================
// 自然绿系列
// ============================================================

/** 自然生态模板 */
export const natural_eco: LayoutTemplateDefinition = {
  id: 'natural-eco',
  displayName: '自然生态',
  category: 'natural',

  layout: {
    id: 'center-no-overlay',
    name: '居中无遮罩',
    category: 'minimal',
    position: {
      vertical: 'center',
      horizontal: 'center',
    },
    overlay: {
      type: 'none',
      opacity: 0,
    },
    typography: {
      title: {
        fontSize: 34,
        fontWeight: 400,
        letterSpacing: 0.03,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 2, offsetX: 1, offsetY: 1 },
      },
      copy: {
        fontSize: 15,
        fontWeight: 400,
        letterSpacing: 0,
        colorMode: 'white',
        opacity: 0.85,
      },
      lineHeight: 1.5,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 16,
      paddingX: 24,
      paddingY: 18,
      maxWidth: 500,
      blocks: 'stack',
    },
  },

  designElements: {
    textEffect: {
      style: 'shadow',
      appliedTo: 'title',
      config: {
        shadowColor: '#000000',
        shadowBlur: 2,
        shadowOffset: { x: 1, y: 1 },
      },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.02, y: 0.02, width: 0.08, height: 0.08 },
        style: { primaryColor: '#4CAF50', opacity: 0.5 },
      },
    ],
  },

  colorScheme: {
    primary: '#4CAF50',
    secondary: '#81C784',
    shadowColor: '#000000',
    glowColor: '#A5D6A7',
  },

  imageConstraint: {
    productPosition: {
      vertical: 'center',
      coverage: '75-85%',
    },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'natural' },
    visualPromptTemplate: '商品居中放大，占画面75-85%，背景自然干净，光线柔和自然',
  },

  applicableSections: ['scene_application', 'quality_cert'],
};

// ============================================================
// 模板库汇总
// ============================================================

export const DESIGN_TEMPLATES: Record<string, LayoutTemplateDefinition> = {
  'xiaohongshu-fashion': xiaohongshu_fashion,
  'xiaohongshu-sale': xiaohongshu_sale,
  'xiaohongshu-minimal': xiaohongshu_minimal,
  'luxury-gold': luxury_gold,
  'luxury-classic': luxury_classic,
  'minimal-white-gold': minimal_white_gold,
  'tech-blue-modern': tech_blue_modern,
  'natural-eco': natural_eco,
  ...EXTENDED_TEMPLATES,
};

/** Section 类型到模板的映射 */
export const SECTION_TEMPLATE_MAP: Record<SectionType, string[]> = {
  // 后端原有类型
  outfit_overview: ['magazine-cover', 'xiaohongshu-fashion', 'luxury-gold', 'center-hero', 'movie-poster'],
  detail_showcase: ['luxury-gold', 'product-focus', 'xiaohongshu-minimal', 'tech-blue-modern', 'glass-card'],
  scene_application: ['natural-eco', 'xiaohongshu-fashion', 'movie-poster', 'split-editorial'],
  material_texture: ['xiaohongshu-fashion', 'xiaohongshu-minimal', 'luxury-gold', 'minimalist-invert'],
  size_comparison: ['tech-blue-modern', 'minimal-white-gold', 'bottom-strip'],
  call_to_action: ['xiaohongshu-sale', 'diagonal-dynamic', 'tech-blue-modern', 'neon-night'],
  brand_story: ['magazine-cover', 'luxury-gold', 'xiaohongshu-fashion', 'minimal-white-gold', 'split-editorial'],
  styling_guide: ['luxury-classic', 'split-editorial', 'xiaohongshu-fashion', 'neon-night'],
  detail_closeup: ['luxury-gold', 'product-focus', 'xiaohongshu-minimal'],
  outfit_recommendation: ['xiaohongshu-fashion', 'luxury-classic', 'glass-card'],
  user_review: ['minimal-white-gold', 'glass-card', 'xiaohongshu-minimal'],
  // 前端扩展类型
  hot_sales: ['xiaohongshu-sale', 'diagonal-dynamic', 'neon-night'],
  quality_cert: ['minimal-white-gold', 'natural-eco', 'minimalist-invert'],
  price_display: ['xiaohongshu-sale', 'bottom-strip', 'product-focus', 'luxury-gold'],
};

/** LLM 智能选择模板的默认规则 */
export const DEFAULT_TEMPLATE_PRIORITY: Partial<Record<SectionType, string>> = {
  outfit_overview: 'xiaohongshu-fashion',
  detail_showcase: 'luxury-gold',
  scene_application: 'natural-eco',
  material_texture: 'xiaohongshu-fashion',
  call_to_action: 'xiaohongshu-sale',
  brand_story: 'luxury-gold',
  styling_guide: 'luxury-classic',
  hot_sales: 'xiaohongshu-sale',
  price_display: 'xiaohongshu-sale',
  quality_cert: 'minimal-white-gold',
};

/** 获取 Section 的默认模板 */
export function getDefaultTemplate(sectionType: SectionType): string {
  return DEFAULT_TEMPLATE_PRIORITY[sectionType] || SECTION_TEMPLATE_MAP[sectionType]?.[0] || 'xiaohongshu-fashion';
}

/** 获取模板定义 */
export function getTemplateDefinition(templateId: string): LayoutTemplateDefinition | undefined {
  return DESIGN_TEMPLATES[templateId];
}

/** 验证模板是否适用于指定 Section */
export function isTemplateApplicable(templateId: string, sectionType: SectionType): boolean {
  const template = DESIGN_TEMPLATES[templateId];
  return template?.applicableSections.includes(sectionType) ?? false;
}