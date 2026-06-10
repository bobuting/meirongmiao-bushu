/**
 * 设计模板库 - 后端版式模板定义
 * 从前端 designTemplates.ts + designTemplatesExtended.ts 合并提取
 * 包含：版式骨架 + 设计感元素 + 品牌色系 + 图片约束
 */

import type { LayoutTemplateDefinition, SectionType } from './template-types';

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
// 扩展模板 - 单标题版式（只有 title，无 copy/subtitle）
// ============================================================

/** 居中大标题 - 巨字海报风 */
export const center_hero: LayoutTemplateDefinition = {
  id: 'center-hero',
  displayName: '巨字居中',
  category: 'creative',

  layout: {
    id: 'center-no-overlay',
    name: '居中无遮罩',
    category: 'creative',
    position: { vertical: 'center', horizontal: 'center' },
    overlay: { type: 'none', opacity: 0 },
    typography: {
      title: {
        fontSize: 56,
        fontWeight: 700,
        letterSpacing: 0.02,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 4, offsetX: 2, offsetY: 2 },
      },
      copy: {
        fontSize: 14,
        fontWeight: 300,
        letterSpacing: 0.05,
        colorMode: 'white',
        opacity: 0.7,
      },
      lineHeight: 1.2,
      textAlign: 'center',
    },
    rhythm: {
      titleCopyGap: 16,
      paddingX: 24,
      paddingY: 20,
      maxWidth: 600,
      blocks: 'stack',
    },
  },

  designElements: {
    textEffect: {
      style: 'shadow',
      appliedTo: 'title',
      config: { shadowColor: '#000000', shadowBlur: 4, shadowOffset: { x: 2, y: 2 } },
    },
  },

  colorScheme: { primary: '#FFFFFF', secondary: '#F0F0F0', shadowColor: '#000000', glowColor: '#E0E0E0' },

  imageConstraint: {
    productPosition: { vertical: 'center', coverage: '85-95%' },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'natural' },
    visualPromptTemplate: '商品居中放大，占画面85-95%，背景干净自然',
  },

  applicableSections: ['brand_story', 'detail_showcase', 'outfit_overview', 'scene_application'],
};

/** 顶部横幅标题 */
export const top_banner: LayoutTemplateDefinition = {
  id: 'top-banner',
  displayName: '顶部横幅',
  category: 'editorial',

  layout: {
    id: 'top-banner-solid',
    name: '顶部横幅',
    category: 'editorial',
    position: { vertical: 'top', horizontal: 'center', offset: { top: '30px' } },
    overlay: { type: 'gradient', opacity: 0.35, gradientDirection: 'to-bottom', color: '#000000' },
    typography: {
      title: {
        fontSize: 36,
        fontWeight: 600,
        letterSpacing: 0.03,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 2, offsetX: 1, offsetY: 1 },
      },
      copy: {
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: 0.02,
        colorMode: 'white',
        opacity: 0.75,
      },
      lineHeight: 1.4,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: 10, paddingX: 24, paddingY: 16, maxWidth: 600, blocks: 'stack' },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.2, y: 0.14, width: 0.6, height: 0.002 },
      style: { color: '#FFFFFF', thickness: 1, opacity: 0.5 },
    },
  },

  colorScheme: { primary: '#FFFFFF', secondary: '#CCCCCC', shadowColor: '#000000', glowColor: '#F5F5F5' },

  imageConstraint: {
    productPosition: { vertical: 'center', coverage: '80-90%' },
    emptyArea: { position: 'top', size: '15%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'natural' },
    visualPromptTemplate: '商品居中，占画面80-90%，顶部预留15%空白',
  },

  applicableSections: ['brand_story', 'outfit_overview', 'material_texture', 'scene_application'],
};

/** 底部色条标题 */
export const bottom_strip: LayoutTemplateDefinition = {
  id: 'bottom-strip',
  displayName: '底部色条',
  category: 'dark',

  layout: {
    id: 'bottom-solid-bar',
    name: '底部色条',
    category: 'dark',
    position: { vertical: 'bottom', horizontal: 'left', offset: { bottom: '0px', left: '0px' } },
    overlay: { type: 'solid', opacity: 0.75, color: '#1A1A2E' },
    typography: {
      title: {
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: 0.02,
        colorMode: 'white',
        shadow: false,
      },
      copy: {
        fontSize: 14,
        fontWeight: 300,
        letterSpacing: 0,
        colorMode: 'white',
        opacity: 0.7,
      },
      lineHeight: 1.4,
      textAlign: 'left',
    },
    rhythm: { titleCopyGap: 8, paddingX: 32, paddingY: 20, maxWidth: 600, blocks: 'stack' },
  },

  designElements: {
    brandAccent: {
      type: 'tag_label',
      position: { x: 0.04, y: 0.78, width: 0.12, height: 0.04 },
      style: { primaryColor: '#E94560', secondaryColor: '#FFFFFF', shape: 'pill' },
    },
  },

  colorScheme: { primary: '#E94560', secondary: '#1A1A2E', shadowColor: '#000000', glowColor: '#FF6B6B' },

  imageConstraint: {
    productPosition: { vertical: 'center-top', yRange: '0.10-0.65', coverage: '70-80%' },
    emptyArea: { position: 'bottom', size: '25%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品居中偏上，占画面70-80%，底部预留25%空白',
  },

  applicableSections: ['call_to_action', 'outfit_overview', 'detail_showcase', 'price_display'],
};

/** 左侧竖排文字 */
export const left_stripe: LayoutTemplateDefinition = {
  id: 'left-stripe',
  displayName: '左侧竖条',
  category: 'editorial',

  layout: {
    id: 'left-stripe',
    name: '左侧竖条',
    category: 'editorial',
    position: { vertical: 'center', horizontal: 'left', offset: { left: '20px' } },
    overlay: { type: 'solid', opacity: 0.65, color: '#2C3E50', borderRadius: 12 },
    typography: {
      title: {
        fontSize: 28,
        fontWeight: 600,
        letterSpacing: 0.02,
        colorMode: 'white',
        shadow: false,
      },
      copy: {
        fontSize: 13,
        fontWeight: 300,
        letterSpacing: 0.01,
        colorMode: 'white',
        opacity: 0.8,
      },
      lineHeight: 1.4,
      textAlign: 'left',
    },
    rhythm: { titleCopyGap: 10, paddingX: 20, paddingY: 16, maxWidth: 220, blocks: 'stack' },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.22, y: 0.25, width: 0.002, height: 0.50 },
      style: { color: '#E74C3C', thickness: 3, opacity: 1 },
    },
    brandAccent: {
      type: 'hot_mark',
      position: { x: 0.06, y: 0.80, width: 0.06, height: 0.04 },
      style: { primaryColor: '#E74C3C', shape: 'badge' },
    },
  },

  colorScheme: { primary: '#E74C3C', secondary: '#2C3E50', shadowColor: '#1A252F', glowColor: '#FF6B6B' },

  imageConstraint: {
    productPosition: { vertical: 'center', horizontal: 'right', xRange: '0.25-0.90', coverage: '60-70%' },
    emptyArea: { position: 'left', size: '20%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品偏右展示，x=0.25-0.90，占60-70%，左侧浅色背景',
  },

  applicableSections: ['brand_story', 'styling_guide', 'material_texture', 'scene_application'],
};

// ============================================================
// 扩展模板 - 主副标题版式
// ============================================================

/** 杂志封面 - 大主标题 + 醒目副标题 */
export const magazine_cover: LayoutTemplateDefinition = {
  id: 'magazine-cover',
  displayName: '杂志封面',
  category: 'editorial',

  layout: {
    id: 'magazine-cover',
    name: '杂志封面',
    category: 'editorial',
    position: { vertical: 'bottom', horizontal: 'center', offset: { bottom: '50px' } },
    overlay: { type: 'gradient', opacity: 0.55, gradientDirection: 'to-top', color: '#000000' },
    typography: {
      title: {
        fontSize: 44,
        fontWeight: 700,
        letterSpacing: 0,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 3, offsetX: 1, offsetY: 2 },
      },
      copy: {
        fontSize: 22,
        fontWeight: 400,
        letterSpacing: 0.03,
        colorMode: 'custom',
        customColor: '#F5C518',
        opacity: 1,
      },
      lineHeight: 1.3,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: 14, paddingX: 24, paddingY: 20, maxWidth: 600, blocks: 'stack' },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.15, y: 0.82, width: 0.70, height: 0.002 },
      style: { color: '#F5C518', thickness: 2, opacity: 0.8 },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.03, y: 0.03, width: 0.06, height: 0.06 },
        style: { primaryColor: '#F5C518', opacity: 0.6 },
      },
    ],
  },

  colorScheme: { primary: '#F5C518', secondary: '#FFFFFF', shadowColor: '#000000', glowColor: '#FFE066' },

  imageConstraint: {
    productPosition: { vertical: 'center-top', yRange: '0.10-0.60', coverage: '70-80%' },
    emptyArea: { position: 'bottom', size: '25%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'bright' },
    visualPromptTemplate: '商品居中偏上，占画面70-80%，底部预留25%空白，光线明亮',
  },

  applicableSections: ['brand_story', 'outfit_overview', 'detail_showcase', 'scene_application', 'styling_guide'],
};

/** 电影海报 - 底部大标题 + 副标题 */
export const movie_poster: LayoutTemplateDefinition = {
  id: 'movie-poster',
  displayName: '电影海报',
  category: 'dark',

  layout: {
    id: 'movie-poster-bottom',
    name: '电影海报底部',
    category: 'dark',
    position: { vertical: 'bottom', horizontal: 'center', offset: { bottom: '40px' } },
    overlay: { type: 'gradient', opacity: 0.7, gradientDirection: 'to-top', color: '#000000' },
    typography: {
      title: {
        fontSize: 40,
        fontWeight: 700,
        letterSpacing: 0.05,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 4, offsetX: 0, offsetY: 2 },
      },
      copy: {
        fontSize: 18,
        fontWeight: 300,
        letterSpacing: 0.08,
        colorMode: 'white',
        opacity: 0.85,
      },
      lineHeight: 1.3,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: 12, paddingX: 32, paddingY: 20, maxWidth: 600, blocks: 'stack' },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.30, y: 0.83, width: 0.40, height: 0.003 },
      style: { color: '#4ECDC4', thickness: 2, opacity: 0.9 },
    },
    textEffect: {
      style: 'shadow',
      appliedTo: 'title',
      config: { shadowColor: '#000000', shadowBlur: 4, shadowOffset: { x: 0, y: 2 } },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.88, y: 0.03, width: 0.08, height: 0.08 },
        style: { primaryColor: '#4ECDC4', opacity: 0.5 },
      },
    ],
  },

  colorScheme: { primary: '#4ECDC4', secondary: '#1A1A2E', shadowColor: '#000000', glowColor: '#7FEFEF' },

  imageConstraint: {
    productPosition: { vertical: 'center-top', yRange: '0.05-0.55', coverage: '65-75%' },
    emptyArea: { position: 'bottom', size: '30%' },
    backgroundStyle: { type: 'gradient', simplicity: 'medium', lighting: 'soft' },
    visualPromptTemplate: '商品居中偏上，占画面65-75%，底部预留30%深色渐变空白，电影海报构图',
  },

  applicableSections: ['brand_story', 'outfit_overview', 'detail_showcase', 'scene_application'],
};

/** 分栏编辑 - 左侧深色面板主副标题 */
export const split_editorial: LayoutTemplateDefinition = {
  id: 'split-editorial',
  displayName: '分栏编辑',
  category: 'editorial',

  layout: {
    id: 'split-editorial',
    name: '分栏编辑',
    category: 'editorial',
    position: { vertical: 'center', horizontal: 'left', offset: { left: '30px' } },
    overlay: { type: 'gradient', opacity: 0.4, gradientDirection: 'to-right', color: '#000000' },
    typography: {
      title: {
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: 0.02,
        colorMode: 'white',
        shadow: false,
      },
      copy: {
        fontSize: 18,
        fontWeight: 400,
        letterSpacing: 0.01,
        colorMode: 'custom',
        customColor: '#F0A500',
        opacity: 1,
      },
      lineHeight: 1.4,
      textAlign: 'left',
    },
    rhythm: { titleCopyGap: 14, paddingX: 16, paddingY: 14, maxWidth: 260, blocks: 'stack' },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.30, y: 0.20, width: 0.003, height: 0.60 },
      style: { color: '#F0A500', thickness: 2, opacity: 0.7 },
    },
    brandAccent: {
      type: 'tag_label',
      position: { x: 0.04, y: 0.82, width: 0.10, height: 0.04 },
      style: { primaryColor: '#F0A500', secondaryColor: '#1A1A2E', shape: 'pill' },
    },
  },

  colorScheme: { primary: '#F0A500', secondary: '#1A1A2E', shadowColor: '#000000', glowColor: '#FFD166' },

  imageConstraint: {
    productPosition: { vertical: 'center', horizontal: 'right', xRange: '0.30-0.90', coverage: '55-65%' },
    emptyArea: { position: 'left', size: '25%' },
    backgroundStyle: { type: 'gradient', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品偏右展示，x=0.30-0.90，占55-65%，左侧深色渐变背景',
  },

  applicableSections: ['brand_story', 'styling_guide', 'material_texture', 'detail_showcase'],
};

/** 极简反转 - 小副标题在上，大主标题在下 */
export const minimalist_invert: LayoutTemplateDefinition = {
  id: 'minimalist-invert',
  displayName: '极简反转',
  category: 'minimal',

  layout: {
    id: 'center-no-overlay',
    name: '居中无遮罩',
    category: 'minimal',
    position: { vertical: 'center', horizontal: 'center' },
    overlay: { type: 'none', opacity: 0 },
    typography: {
      title: {
        fontSize: 42,
        fontWeight: 300,
        letterSpacing: 0.06,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#000000', blur: 3, offsetX: 1, offsetY: 2 },
      },
      copy: {
        fontSize: 16,
        fontWeight: 500,
        letterSpacing: 0.15,
        colorMode: 'white',
        opacity: 0.6,
      },
      lineHeight: 1.4,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: -4, paddingX: 24, paddingY: 20, maxWidth: 500, blocks: 'stack' },
  },

  designElements: {
    textEffect: {
      style: 'outline',
      appliedTo: 'title',
      config: { shadowColor: '#000000', shadowBlur: 3, glow: false },
    },
  },

  colorScheme: { primary: '#FFFFFF', secondary: '#E0E0E0', shadowColor: '#000000', glowColor: '#F5F5F5' },

  imageConstraint: {
    productPosition: { vertical: 'center', coverage: '85-95%' },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'natural' },
    visualPromptTemplate: '商品居中放大，占画面85-95%，背景简洁干净',
  },

  applicableSections: ['outfit_overview', 'detail_showcase', 'material_texture', 'brand_story'],
};

/** 毛玻璃卡片 - 浮动卡片主副标题 */
export const glass_card: LayoutTemplateDefinition = {
  id: 'glass-card',
  displayName: '毛玻璃卡片',
  category: 'creative',

  layout: {
    id: 'center-block',
    name: '居中卡片',
    category: 'creative',
    position: { vertical: 'center', horizontal: 'center' },
    overlay: { type: 'block', opacity: 0.6, color: '#FFFFFF', borderRadius: 16 },
    typography: {
      title: {
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: 0.01,
        colorMode: 'custom',
        customColor: '#1A1A2E',
        shadow: false,
      },
      copy: {
        fontSize: 18,
        fontWeight: 400,
        letterSpacing: 0.01,
        colorMode: 'custom',
        customColor: '#666666',
        opacity: 1,
      },
      lineHeight: 1.4,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: 10, paddingX: 28, paddingY: 20, maxWidth: 400, blocks: 'stack' },
  },

  designElements: {
    divider: {
      type: 'divider_line',
      position: { x: 0.30, y: 0.56, width: 0.40, height: 0.002 },
      style: { color: '#667EEA', thickness: 2, opacity: 0.8 },
    },
    microDecorations: [
      {
        type: 'corner_ornament',
        position: { x: 0.35, y: 0.35, width: 0.06, height: 0.06 },
        style: { primaryColor: '#667EEA', opacity: 0.3 },
      },
    ],
  },

  colorScheme: { primary: '#667EEA', secondary: '#764BA2', shadowColor: '#1A1A2E', glowColor: '#A78BFA' },

  imageConstraint: {
    productPosition: { vertical: 'center', coverage: '80-90%' },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'bright' },
    visualPromptTemplate: '商品居中放大，占画面80-90%，背景明亮干净',
  },

  applicableSections: ['brand_story', 'detail_showcase', 'user_review', 'outfit_overview'],
};

/** 动感斜切 - 标题区域倾斜 */
export const diagonal_dynamic: LayoutTemplateDefinition = {
  id: 'diagonal-dynamic',
  displayName: '动感斜切',
  category: 'creative',

  layout: {
    id: 'diagonal-bottom',
    name: '底部斜切',
    category: 'creative',
    position: { vertical: 'bottom', horizontal: 'left', offset: { bottom: '30px', left: '24px' } },
    overlay: { type: 'solid', opacity: 0.65, color: '#FF6B35' },
    typography: {
      title: {
        fontSize: 36,
        fontWeight: 700,
        letterSpacing: 0,
        colorMode: 'white',
        shadow: true,
        shadowConfig: { color: '#CC4400', blur: 2, offsetX: 1, offsetY: 1 },
      },
      copy: {
        fontSize: 20,
        fontWeight: 400,
        letterSpacing: 0.02,
        colorMode: 'white',
        opacity: 0.9,
      },
      lineHeight: 1.3,
      textAlign: 'left',
    },
    rhythm: { titleCopyGap: 10, paddingX: 20, paddingY: 16, maxWidth: 500, blocks: 'stack' },
  },

  designElements: {
    textEffect: {
      style: 'shadow',
      appliedTo: 'title',
      config: { shadowColor: '#CC4400', shadowBlur: 2, shadowOffset: { x: 1, y: 1 } },
    },
    brandAccent: {
      type: 'sale_ribbon',
      position: { x: 0.75, y: 0.05, width: 0.22, height: 0.05 },
      style: { primaryColor: '#FFFFFF', secondaryColor: '#FF6B35', shape: 'ribbon' },
    },
  },

  colorScheme: { primary: '#FF6B35', secondary: '#004E89', shadowColor: '#CC4400', glowColor: '#FF9F1C' },

  imageConstraint: {
    productPosition: { vertical: 'center-top', yRange: '0.10-0.60', coverage: '70-80%' },
    emptyArea: { position: 'bottom', size: '25%' },
    backgroundStyle: { type: 'gradient', simplicity: 'medium', lighting: 'bright' },
    visualPromptTemplate: '商品居中偏上，占画面70-80%，底部预留25%空白，动感构图',
  },

  applicableSections: ['call_to_action', 'hot_sales', 'price_display', 'outfit_overview'],
};

/** 暗夜霓虹 - 深色背景 + 霓虹标题 + 副标题 */
export const neon_night: LayoutTemplateDefinition = {
  id: 'neon-night',
  displayName: '暗夜霓虹',
  category: 'dark',

  layout: {
    id: 'center-dark',
    name: '深色居中',
    category: 'dark',
    position: { vertical: 'center', horizontal: 'center' },
    overlay: { type: 'solid', opacity: 0.45, color: '#0A0A0A' },
    typography: {
      title: {
        fontSize: 38,
        fontWeight: 700,
        letterSpacing: 0.04,
        colorMode: 'custom',
        customColor: '#00FF87',
        shadow: true,
        shadowConfig: { color: '#00FF87', blur: 6, offsetX: 0, offsetY: 0 },
      },
      copy: {
        fontSize: 18,
        fontWeight: 300,
        letterSpacing: 0.06,
        colorMode: 'white',
        opacity: 0.85,
      },
      lineHeight: 1.4,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: 14, paddingX: 24, paddingY: 20, maxWidth: 550, blocks: 'stack' },
  },

  designElements: {
    textEffect: {
      style: 'neon',
      appliedTo: 'title',
      config: { glowColor: '#00FF87', shadowBlur: 6, glow: true },
    },
    divider: {
      type: 'divider_line',
      position: { x: 0.20, y: 0.58, width: 0.60, height: 0.001 },
      style: { color: '#00FF87', thickness: 1, opacity: 0.5 },
    },
    microDecorations: [
      {
        type: 'neon_pulse',
        position: { x: 0.04, y: 0.04, width: 0.06, height: 0.06 },
        style: { primaryColor: '#00FF87', glow: true },
      },
      {
        type: 'neon_pulse',
        position: { x: 0.90, y: 0.90, width: 0.06, height: 0.06 },
        style: { primaryColor: '#60EFFF', glow: true },
      },
    ],
  },

  colorScheme: { primary: '#00FF87', secondary: '#60EFFF', shadowColor: '#0A0A0A', glowColor: '#00FF87' },

  imageConstraint: {
    productPosition: { vertical: 'center', coverage: '75-85%' },
    emptyArea: { position: 'none', size: '0%' },
    backgroundStyle: { type: 'solid', simplicity: 'high', lighting: 'soft' },
    visualPromptTemplate: '商品居中，占画面75-85%，深色背景，霓虹光影效果',
  },

  applicableSections: ['brand_story', 'detail_showcase', 'call_to_action', 'styling_guide', 'outfit_overview'],
};

/** 产品特写 - 中心产品 + 底部圆角卡片主副标题 */
export const product_focus: LayoutTemplateDefinition = {
  id: 'product-focus',
  displayName: '产品特写',
  category: 'minimal',

  layout: {
    id: 'bottom-rounded-card',
    name: '底部圆角卡片',
    category: 'minimal',
    position: { vertical: 'bottom', horizontal: 'center', offset: { bottom: '20px' } },
    overlay: { type: 'block', opacity: 0.9, color: '#FFFFFF', borderRadius: 20 },
    typography: {
      title: {
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: 0.01,
        colorMode: 'custom',
        customColor: '#1A1A2E',
        shadow: false,
      },
      copy: {
        fontSize: 16,
        fontWeight: 400,
        letterSpacing: 0,
        colorMode: 'custom',
        customColor: '#666666',
        opacity: 1,
      },
      lineHeight: 1.4,
      textAlign: 'center',
    },
    rhythm: { titleCopyGap: 8, paddingX: 24, paddingY: 16, maxWidth: 500, blocks: 'stack' },
  },

  designElements: {
    brandAccent: {
      type: 'price_tag',
      position: { x: 0.78, y: 0.80, width: 0.15, height: 0.04 },
      style: { primaryColor: '#FF4757', secondaryColor: '#FFFFFF', shape: 'pill' },
    },
  },

  colorScheme: { primary: '#FF4757', secondary: '#1A1A2E', shadowColor: '#CCCCCC', glowColor: '#FF6B81' },

  imageConstraint: {
    productPosition: { vertical: 'center-top', yRange: '0.05-0.60', coverage: '70-80%' },
    emptyArea: { position: 'bottom', size: '25%' },
    backgroundStyle: { type: 'clean', simplicity: 'high', lighting: 'bright' },
    visualPromptTemplate: '商品居中偏上，占画面70-80%，底部预留25%白色卡片区域',
  },

  applicableSections: ['detail_showcase', 'detail_closeup', 'material_texture', 'outfit_recommendation', 'price_display'],
};

// ============================================================
// 模板库汇总
// ============================================================

/** 所有设计模板汇总（基础 + 扩展） */
export const DESIGN_TEMPLATES: Record<string, LayoutTemplateDefinition> = {
  // 小红书系列
  'xiaohongshu-fashion': xiaohongshu_fashion,
  'xiaohongshu-sale': xiaohongshu_sale,
  'xiaohongshu-minimal': xiaohongshu_minimal,
  // 金色奢华系列
  'luxury-gold': luxury_gold,
  'luxury-classic': luxury_classic,
  // 极简白金系列
  'minimal-white-gold': minimal_white_gold,
  // 科技蓝系列
  'tech-blue-modern': tech_blue_modern,
  // 自然绿系列
  'natural-eco': natural_eco,
  // 扩展模板 - 单标题版式
  'center-hero': center_hero,
  'top-banner': top_banner,
  'bottom-strip': bottom_strip,
  'left-stripe': left_stripe,
  // 扩展模板 - 主副标题版式
  'magazine-cover': magazine_cover,
  'movie-poster': movie_poster,
  'split-editorial': split_editorial,
  'minimalist-invert': minimalist_invert,
  'glass-card': glass_card,
  'diagonal-dynamic': diagonal_dynamic,
  'neon-night': neon_night,
  'product-focus': product_focus,
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
