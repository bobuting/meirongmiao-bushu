/**
 * templateToElements.ts - 模板 → 图形层元素转换（后端用）
 * 纯函数，无浏览器依赖，从前端 templateToElements.ts 移植
 */

import type { LayoutTemplateDefinition } from './template-types';
import type { GraphicsLayerElement } from '../../contracts/types';

/** 将设计模板转换为图形层元素数组 */
export function templateToElements(
  template: LayoutTemplateDefinition,
  title: string | null,
  copy: string | null,
): GraphicsLayerElement[] {
  const elements: GraphicsLayerElement[] = [];
  const { layout, designElements, colorScheme } = template;
  const uid = () => `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. 遮罩背景
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

  // 2. 主标题（autoSize: 前端根据实际文字渲染计算 width/height）
  if (title) {
    elements.push({
      type: 'overlay_text',
      content: title,
      x: layout.position.horizontal === 'center' ? 0.50 : layout.position.horizontal === 'left' ? 0.06 : 0.94,
      y: layout.position.vertical === 'bottom' ? 0.78 : layout.position.vertical === 'top' ? 0.10 : 0.42,
      width: 0,
      height: 0,
      direction: 'horizontal',
      fontSize: clampFontSize(layout.typography.title.fontSize),
      fontWeight: layout.typography.title.fontWeight >= 600 ? 'bold' : 'normal',
      fontFamily: mapFontFamily(template),
      letterSpacing: Math.round(layout.typography.title.letterSpacing * 100),
      align: layout.typography.textAlign,
      color: resolveColor(layout.typography.title, colorScheme),
      shadow: layout.typography.title.shadow,
      shadowColor: layout.typography.title.shadowConfig?.color ?? '#000000',
      autoSize: true,
      uid: uid(),
    } as GraphicsLayerElement & { uid: string });
  }

  // 3. 副标题/文案（autoSize: 前端根据实际文字渲染计算 width/height）
  if (copy) {
    elements.push({
      type: 'overlay_text',
      content: copy,
      x: layout.position.horizontal === 'center' ? 0.50 : layout.position.horizontal === 'left' ? 0.06 : 0.94,
      y: layout.position.vertical === 'bottom' ? 0.86 : layout.position.vertical === 'top' ? 0.18 : 0.50,
      width: 0,
      height: 0,
      direction: 'horizontal',
      fontSize: clampFontSize(layout.typography.copy.fontSize),
      fontWeight: layout.typography.copy.fontWeight >= 600 ? 'bold' : 'normal',
      fontFamily: mapFontFamily(template),
      letterSpacing: Math.round(layout.typography.copy.letterSpacing * 100),
      align: layout.typography.textAlign,
      color: resolveCopyColor(layout.typography.copy, colorScheme),
      shadow: false,
      opacity: layout.typography.copy.opacity,
      autoSize: true,
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

  // 5. 边框装饰（用 border_frame 替代 corner_ornament，直角细线更美观）
  //    多个 corner_ornament 只生成一个居中的 border_frame
  if (designElements.microDecorations) {
    const cornerDeco = designElements.microDecorations.find(d => d.type === 'corner_ornament');
    if (cornerDeco) {
      const frameSize = 0.92;
      const frameOffset = (1 - frameSize) / 2; // 居中偏移
      elements.push({
        type: 'border_frame',
        x: frameOffset,
        y: frameOffset,
        width: frameSize,
        height: frameSize,
        color: cornerDeco.style.primaryColor ?? colorScheme.primary,
        secondaryColor: colorScheme.secondary,
        opacity: cornerDeco.style.opacity ?? 0.5,
        uid: uid(),
      } as GraphicsLayerElement & { uid: string });
    }

    for (const deco of designElements.microDecorations) {
      if (deco.type === 'neon_pulse') {
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
    return { x: 0, y: 0.25, width: 1, height: 0.50 };
  }
  if (position.horizontal === 'left') {
    return { x: 0.02, y: 0.25, width: 0.30, height: 0.50 };
  }
  return { x: 0.10, y: 0.30, width: 0.80, height: 0.40 };
}


/** 模板像素字号映射到相对字号（0.5-1.0） */
function clampFontSize(px: number): number {
  return Math.max(0.5, Math.min(1.0, px / 56));
}

/** 映射字体族 */
function mapFontFamily(template: LayoutTemplateDefinition): 'simhei' | 'yahei' | 'helvetica' {
  const cat = template.category;
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
