/**
 * LayoutRenderer.tsx - HTML版式渲染器（含SVG图形层 + 设计感元素）
 * 将全屏背景图 + 文字 + 图形元素 + 设计感元素按模板叠加渲染为HTML
 */

import React, { forwardRef } from 'react';
import type { LayoutTemplate } from '../templates/types';
import { getTemplateById, DEFAULT_TEMPLATE } from '../templates/layoutTemplates';
import {
  DESIGN_TEMPLATES,
  getTemplateDefinition,
} from '../templates/designTemplates';
import {
  DividerLine,
  BrandAccent,
  MicroDecorationElement,
  applyTextEffect,
} from '../templates/DesignElementsRenderer';

interface LayoutRendererProps {
  backgroundImage: string;
  title: string | null;
  copy: string | null;
  templateId?: string;
  /** 设计模板ID（新版模板驱动） */
  designTemplateId?: string;
  customOverrides?: Partial<LayoutTemplate>;
  width?: number;
  height?: number;
}

/**
 * HTML版式渲染器（支持模板驱动和向后兼容）
 */
export const LayoutRenderer = forwardRef<HTMLDivElement, LayoutRendererProps>(
  (
    {
      backgroundImage,
      title,
      copy,
      templateId,
      designTemplateId,
      customOverrides,
      width = 750,
      height = 900,
    },
    ref
  ) => {
    // 新版：模板驱动渲染
    if (designTemplateId) {
      return (
        <TemplateDrivenRenderer
          ref={ref}
          backgroundImage={backgroundImage}
          title={title}
          copy={copy}
          designTemplateId={designTemplateId}
          width={width}
          height={height}
        />
      );
    }

    // 旧版：向后兼容渲染
    const baseTemplate = getTemplateById(templateId ?? DEFAULT_TEMPLATE);
    if (!baseTemplate) {
      console.error(`Template not found: ${templateId}`);
      return null;
    }
    const template = { ...baseTemplate, ...customOverrides } as LayoutTemplate;

    const containerStyle: React.CSSProperties = {
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url(${backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    };

    const overlayStyle = computeOverlayStyle(template);
    const textAreaStyle = computeTextAreaStyle(template);
    const titleStyle = computeTitleStyle(template);
    const copyStyle = computeCopyStyle(template);

    return (
      <div ref={ref} style={containerStyle}>
        {template.overlay.type !== 'none' && <div style={overlayStyle} />}
        <div style={textAreaStyle}>
          {title && <h2 style={titleStyle}>{title}</h2>}
          {copy && <p style={copyStyle}>{copy}</p>}
        </div>
      </div>
    );
  }
);

LayoutRenderer.displayName = 'LayoutRenderer';

// ============================================================
// 模板驱动渲染器（新版）
// ============================================================

interface TemplateDrivenRendererProps {
  backgroundImage: string;
  title: string | null;
  copy: string | null;
  designTemplateId: string;
  width: number;
  height: number;
}

const TemplateDrivenRenderer = forwardRef<HTMLDivElement, TemplateDrivenRendererProps>(
  ({ backgroundImage, title, copy, designTemplateId, width, height }, ref) => {
    const templateDef = getTemplateDefinition(designTemplateId);
    if (!templateDef) {
      console.error(`Design template not found: ${designTemplateId}`);
      return null;
    }

    const { layout, designElements, colorScheme } = templateDef;

    // 容器样式
    const containerStyle: React.CSSProperties = {
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url(${backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    };

    // 遮罩层样式
    const overlayStyle = computeOverlayStyle(layout);

    // 文字区域样式
    const textAreaStyle = computeTextAreaStyle(layout);

    // 标题样式（应用文字效果）
    const titleBaseStyle = computeTitleStyle(layout);
    const titleStyle =
      designElements.textEffect?.appliedTo === 'title'
        ? applyTextEffect(designElements.textEffect, titleBaseStyle)
        : titleBaseStyle;

    // 文案样式
    const copyStyle = computeCopyStyle(layout);

    return (
      <div ref={ref} style={containerStyle}>
        {/* 1. 遮罩层 */}
        {layout.overlay.type !== 'none' && <div style={overlayStyle} />}

        {/* 2. 设计感元素层 */}
        {designElements.divider && (
          <DividerLine element={designElements.divider} width={width} height={height} />
        )}
        {designElements.brandAccent && (
          <BrandAccent element={designElements.brandAccent} width={width} height={height} />
        )}
        {designElements.microDecorations?.map((dec, idx) => (
          <MicroDecorationElement key={idx} element={dec} width={width} height={height} />
        ))}

        {/* 3. 文字层 */}
        <div style={textAreaStyle}>
          {title && <h2 style={titleStyle}>{title}</h2>}
          {copy && <p style={copyStyle}>{copy}</p>}
        </div>
      </div>
    );
  }
);

TemplateDrivenRenderer.displayName = 'TemplateDrivenRenderer';

// ============================================================
// CSS计算辅助函数
// ============================================================

function computeOverlayStyle(template: LayoutTemplate): React.CSSProperties {
  const { overlay } = template;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  };

  switch (overlay.type) {
    case 'solid':
      style.background = overlay.color;
      style.opacity = overlay.opacity;
      break;

    case 'gradient':
      const directionMap: Record<string, string> = {
        'to-top': 'to top',
        'to-bottom': 'to bottom',
        'to-left': 'to left',
        'to-right': 'to right',
        'to-top-right': 'to top right',
        'to-bottom-left': 'to bottom left',
      };
      const gradientDir = directionMap[overlay.gradientDirection ?? 'to-top'] ?? 'to top';
      style.background = `linear-gradient(${gradientDir}, transparent, ${overlay.color})`;
      style.opacity = overlay.opacity;
      break;

    case 'blur':
      style.background = overlay.color;
      style.opacity = overlay.opacity;
      style.filter = 'blur(8px)';
      break;

    case 'shape':
      style.background = overlay.color;
      style.opacity = overlay.opacity;
      if (overlay.borderRadius) {
        style.borderRadius = `${overlay.borderRadius}px`;
      }
      break;

    case 'block':
      style.background = overlay.color;
      style.opacity = overlay.opacity;
      if (overlay.borderRadius) {
        style.borderRadius = `${overlay.borderRadius}px`;
      }
      break;

    default:
      break;
  }

  return style;
}

function computeTextAreaStyle(template: LayoutTemplate): React.CSSProperties {
  const { position, typography, rhythm } = template;

  const style: React.CSSProperties = {
    position: 'absolute',
    textAlign: typography.textAlign,
    maxWidth: rhythm.maxWidth ? `${rhythm.maxWidth}px` : undefined,
    padding: `${rhythm.paddingY}px ${rhythm.paddingX}px`,
    boxSizing: 'border-box',
  };

  // 垂直位置
  switch (position.vertical) {
    case 'top':
      if (position.offset?.top) {
        style.top = position.offset.top;
      } else {
        style.top = '20px';
      }
      break;
    case 'center':
      style.top = '50%';
      style.transform = 'translateY(-50%)';
      break;
    case 'bottom':
      if (position.offset?.bottom) {
        style.bottom = position.offset.bottom;
      } else {
        style.bottom = '0';
      }
      break;
    case 'top-third':
      style.top = '30%';
      break;
    case 'bottom-third':
      style.top = '70%';
      break;
  }

  // 水平位置
  switch (position.horizontal) {
    case 'left':
      if (position.offset?.left) {
        style.left = position.offset.left;
      } else {
        style.left = '24px';
      }
      break;
    case 'center':
      style.left = '50%';
      if (style.transform) {
        style.transform = `translateX(-50%) ${style.transform}`;
      } else {
        style.transform = 'translateX(-50%)';
      }
      break;
    case 'right':
      if (position.offset?.right) {
        style.right = position.offset.right;
      } else {
        style.right = '24px';
      }
      break;
  }

  return style;
}

function computeTitleStyle(template: LayoutTemplate): React.CSSProperties {
  const { typography, rhythm } = template;
  const { title } = typography;

  const style: React.CSSProperties = {
    fontSize: `${title.fontSize}px`,
    fontWeight: title.fontWeight,
    letterSpacing: `${title.letterSpacing}em`,
    lineHeight: typography.lineHeight,
    marginBottom: `${rhythm.titleCopyGap}px`,
    margin: 0,
  };

  // 颜色
  switch (title.colorMode) {
    case 'white':
      style.color = '#ffffff';
      break;
    case 'black':
      style.color = '#000000';
      break;
    case 'custom':
      style.color = title.customColor ?? '#000000';
      break;
    case 'auto':
      // auto模式由外部根据背景亮度决定，这里默认白色
      style.color = '#ffffff';
      break;
  }

  // 阴影
  if (title.shadow && title.shadowConfig) {
    style.textShadow = `${title.shadowConfig.offsetX}px ${title.shadowConfig.offsetY}px ${title.shadowConfig.blur}px ${title.shadowConfig.color}`;
  }

  return style;
}

function computeCopyStyle(template: LayoutTemplate): React.CSSProperties {
  const { typography } = template;
  const { copy } = typography;

  const style: React.CSSProperties = {
    fontSize: `${copy.fontSize}px`,
    fontWeight: copy.fontWeight,
    letterSpacing: `${copy.letterSpacing}em`,
    lineHeight: typography.lineHeight,
    opacity: copy.opacity,
    margin: 0,
  };

  // 颜色
  switch (copy.colorMode) {
    case 'white':
      style.color = '#ffffff';
      break;
    case 'black':
      style.color = '#000000';
      break;
    case 'custom':
      style.color = copy.customColor ?? '#000000';
      break;
    case 'auto':
      style.color = '#ffffff';
      break;
  }

  return style;
}