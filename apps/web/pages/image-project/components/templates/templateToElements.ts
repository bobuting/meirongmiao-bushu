/**
 * templateToElements.ts - 模板 → 图形层元素转换
 * 选择模板后，将模板的版式/文案/装饰转换为 graphicsLayout.elements
 */

import type { LayoutTemplateDefinition } from './types';
import type { GraphicsLayerElement } from '@contracts/types';

/**
 * 将设计模板转换为图形层元素数组
 * @param template 模板定义
 * @param title 主标题文案
 * @param copy 副标题/文案
 * @returns graphicsLayout.elements 数组
 */
export function templateToElements(
  template: LayoutTemplateDefinition,
  title: string | null,
  copy: string | null,
): GraphicsLayerElement[] {
  const elements: GraphicsLayerElement[] = [];
  const { layout, designElements, colorScheme } = template;
  const uid = () => `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. 遮罩背景（非 none 时添加一个半透明矩形）
  if (layout.overlay.type !== 'none') {
    const overlayArea = computeOverlayArea(layout.position, layout.overlay);
    elements.push({
      type: 'overlay_text',
      content: '',
      x: overlayArea.x,
      y: overlayArea.y,
      width: overlayArea.width,
      height: overlayArea.height,
      direction: 'horizontal',
      backgroundColor: layout.overlay.color ?? '#000000',
      backgroundOpacity: layout.overlay.opacity,
      uid: uid(),
    } as GraphicsLayerElement & { uid: string });
  }

  // 2. 主标题
  if (title) {
    const titleArea = computeTextArea(layout.position, copy ? 0.5 : 0.8);
    elements.push({
      type: 'overlay_text',
      content: title,
      x: titleArea.x,
      y: titleArea.y,
      width: titleArea.width,
      height: titleArea.height,
      direction: 'horizontal',
      fontSize: clampFontSize(layout.typography.title.fontSize),
      fontWeight: layout.typography.title.fontWeight >= 600 ? 'bold' : 'normal',
      fontFamily: mapFontFamily(template),
      letterSpacing: Math.round(layout.typography.title.letterSpacing * 100),
      align: layout.typography.textAlign,
      color: resolveColor(layout.typography.title, colorScheme),
      shadow: layout.typography.title.shadow,
      shadowColor: layout.typography.title.shadowConfig?.color ?? '#000000',
      uid: uid(),
    } as GraphicsLayerElement & { uid: string });
  }

  // 3. 副标题/文案
  if (copy) {
    const copyArea = computeCopyArea(layout.position, title);
    elements.push({
      type: 'overlay_text',
      content: copy,
      x: copyArea.x,
      y: copyArea.y,
      width: copyArea.width,
      height: copyArea.height,
      direction: 'horizontal',
      fontSize: clampFontSize(layout.typography.copy.fontSize),
      fontWeight: layout.typography.copy.fontWeight >= 600 ? 'bold' : 'normal',
      fontFamily: mapFontFamily(template),
      letterSpacing: Math.round(layout.typography.copy.letterSpacing * 100),
      align: layout.typography.textAlign,
      color: resolveCopyColor(layout.typography.copy, colorScheme),
      shadow: false,
      opacity: layout.typography.copy.opacity,
      uid: uid(),
    } as GraphicsLayerElement & { uid: string });
  }

  // 4. 分割线装饰
  if (designElements.divider) {
    const divPos = designElements.divider.position;
    elements.push({
      type: 'divider_line',
      x: divPos.x,
      y: divPos.y,
      width: divPos.width ?? 0.7,
      height: divPos.height ?? 0.003,
      color: designElements.divider.style.color ?? colorScheme.primary,
      secondaryColor: colorScheme.secondary,
      uid: uid(),
    } as GraphicsLayerElement & { uid: string });
  }

  // 5. 角标装饰
  if (designElements.microDecorations) {
    for (const deco of designElements.microDecorations) {
      if (deco.type === 'corner_ornament') {
        elements.push({
          type: 'corner_ornament',
          x: deco.position.x,
          y: deco.position.y,
          width: deco.position.width ?? 0.94,
          height: deco.position.height ?? 0.94,
          color: deco.style.primaryColor ?? colorScheme.primary,
          secondaryColor: colorScheme.secondary,
          opacity: deco.style.opacity ?? 0.6,
          uid: uid(),
        } as GraphicsLayerElement & { uid: string });
      } else if (deco.type === 'neon_pulse') {
        // neon_pulse 不是 GraphicsType，改用 sparkle 作为发光效果
        elements.push({
          type: 'sparkle',
          x: deco.position.x,
          y: deco.position.y,
          width: deco.position.width ?? 0.08,
          height: deco.position.height ?? 0.06,
          color: deco.style.primaryColor ?? colorScheme.primary,
          secondaryColor: colorScheme.glowColor,
          label: deco.content ? String(deco.content) : undefined,
          uid: uid(),
        } as GraphicsLayerElement & { uid: string });
      }
    }
  }

  // 6. 品牌点缀
  if (designElements.brandAccent) {
    const accent = designElements.brandAccent;
    elements.push({
      type: accent.type,
      x: accent.position.x,
      y: accent.position.y,
      width: accent.position.width ?? 0.15,
      height: accent.position.height ?? 0.05,
      color: accent.style.primaryColor ?? colorScheme.primary,
      secondaryColor: accent.style.secondaryColor ?? '#FFFFFF',
      label: accent.content ?? '',
      uid: uid(),
    } as GraphicsLayerElement & { uid: string });
  }

  return elements;
}

// ============================================================
// 辅助函数
// ============================================================

/** 计算遮罩区域位置 */
function computeOverlayArea(
  position: LayoutTemplateDefinition['layout']['position'],
  overlay: LayoutTemplateDefinition['layout']['overlay'],
): { x: number; y: number; width: number; height: number } {
  if (overlay.type === 'solid' || overlay.type === 'gradient') {
    if (position.vertical === 'bottom') {
      return { x: 0, y: 0.60, width: 1, height: 0.40 };
    }
    if (position.vertical === 'top') {
      return { x: 0, y: 0, width: 1, height: 0.40 };
    }
    // center 或其他
    return { x: 0, y: 0.25, width: 1, height: 0.50 };
  }
  // block 类型（卡片等）
  if (position.horizontal === 'left') {
    return { x: 0.02, y: 0.25, width: 0.30, height: 0.50 };
  }
  return { x: 0.10, y: 0.30, width: 0.80, height: 0.40 };
}

/** 计算主标题文字区域 */
function computeTextArea(
  position: LayoutTemplateDefinition['layout']['position'],
  copyRatio: number,
): { x: number; y: number; width: number; height: number } {
  const hAlign = position.horizontal;
  const vAlign = position.vertical;

  const padding = 0.06;
  const width = hAlign === 'center' ? 0.80 : 0.40;
  const height = copyRatio;

  let xPos = hAlign === 'center' ? 0.10 : hAlign === 'left' ? padding : 1 - width - padding;
  let yPos: number;

  if (vAlign === 'bottom') {
    yPos = 0.72 - height;
  } else if (vAlign === 'top') {
    yPos = 0.08;
  } else {
    yPos = 0.38;
  }

  return { x: xPos, y: yPos, width, height };
}

/** 计算副标题/文案区域（紧跟主标题下方） */
function computeCopyArea(
  position: LayoutTemplateDefinition['layout']['position'],
  title: string | null,
): { x: number; y: number; width: number; height: number } {
  const titleArea = computeTextArea(position, title ? 0.5 : 0.8);
  const gap = 0.02;

  return {
    x: titleArea.x + 0.02,
    y: titleArea.y + titleArea.height + gap,
    width: titleArea.width - 0.04,
    height: 0.08,
  };
}

/** 将模板像素字号映射到相对字号（0.5-1.0） */
function clampFontSize(px: number): number {
  // 模板 title: 26-56px, copy: 13-22px
  // 映射到 OverlayTextElement.fontSize 0.5-1.0（基准 24px）
  // SVG 渲染: el.fontSize * h, h 为元素高度像素
  return Math.max(0.5, Math.min(1.0, px / 56));
}

/** 映射字体族 */
function mapFontFamily(layout: LayoutTemplateDefinition): 'simhei' | 'yahei' | 'helvetica' {
  const cat = layout.category;
  if (cat === 'xiaohongshu' || cat === 'editorial') return 'yahei';
  if (cat === 'luxury' || cat === 'tech') return 'helvetica';
  return 'simhei';
}

/** 解析标题颜色 */
function resolveColor(
  titleTypo: LayoutTemplateDefinition['layout']['typography']['title'],
  colorScheme: LayoutTemplateDefinition['colorScheme'],
): string {
  switch (titleTypo.colorMode) {
    case 'white': return '#FFFFFF';
    case 'black': return '#000000';
    case 'custom': return titleTypo.customColor ?? colorScheme.primary;
    default: return colorScheme.primary;
  }
}

/** 解析文案颜色 */
function resolveCopyColor(
  copyTypo: LayoutTemplateDefinition['layout']['typography']['copy'],
  colorScheme: LayoutTemplateDefinition['colorScheme'],
): string {
  switch (copyTypo.colorMode) {
    case 'white': return '#FFFFFF';
    case 'black': return '#000000';
    case 'custom': return copyTypo.customColor ?? colorScheme.secondary;
    default: return colorScheme.secondary;
  }
}
