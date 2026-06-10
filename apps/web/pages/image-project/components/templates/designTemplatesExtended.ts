/**
 * 设计模板扩展库 - 海报/封面版式
 * 包含：单标题版式 + 主副标题版式
 * 覆盖杂志封面、电影海报、产品海报、极简封面等多种风格
 */

import type { LayoutTemplateDefinition } from './types';

// ============================================================
// 单标题版式（只有 title，无 copy/subtitle）
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
// 主副标题版式（title 作主标题，copy 作副标题，copy 字号加大突出）
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

/** 极简上副下主 - 小副标题在上，大主标题在下 */
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
// 扩展模板汇总导出
// ============================================================

export const EXTENDED_TEMPLATES: Record<string, LayoutTemplateDefinition> = {
  'center-hero': center_hero,
  'top-banner': top_banner,
  'bottom-strip': bottom_strip,
  'left-stripe': left_stripe,
  'magazine-cover': magazine_cover,
  'movie-poster': movie_poster,
  'split-editorial': split_editorial,
  'minimalist-invert': minimalist_invert,
  'glass-card': glass_card,
  'diagonal-dynamic': diagonal_dynamic,
  'neon-night': neon_night,
  'product-focus': product_focus,
};
