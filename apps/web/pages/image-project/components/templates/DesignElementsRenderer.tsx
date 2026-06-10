/**
 * 设计感元素渲染器
 * 渲染分割线、品牌点缀、文字效果、微交互装饰等设计感元素
 */

import React from 'react';
import type {
  DividerElement,
  BrandAccentElement,
  TextEffectConfig,
  MicroDecoration,
} from './types';

// ============================================================
// 分割线渲染器
// ============================================================

interface DividerLineProps {
  element: DividerElement;
  width: number;
  height: number;
}

export const DividerLine: React.FC<DividerLineProps> = ({ element, width, height }) => {
  const { position, style } = element;

  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x * width}px`,
    top: `${position.y * height}px`,
    opacity: style.opacity,
  };

  // 判断是水平还是垂直分割线
  const isHorizontal = position.width && position.width > (position.height || 0);

  if (isHorizontal) {
    lineStyle.width = `${position.width! * width}px`;
    lineStyle.height = `${style.thickness}px`;
  } else {
    lineStyle.width = `${style.thickness}px`;
    lineStyle.height = `${position.height! * height}px`;
  }

  // 渐变处理
  if (style.gradient) {
    const gradientDir =
      style.gradient.direction === 'horizontal'
        ? 'to right'
        : 'to bottom';
    const startColor = style.gradient.startColor;
    const endColor = style.gradient.endColor;
    const startOpacity = style.gradient.startOpacity ?? 1;
    const endOpacity = style.gradient.endOpacity ?? 0;

    // 使用 rgba 格式处理透明度
    lineStyle.background = `linear-gradient(${gradientDir},
      ${hexToRgba(startColor, startOpacity)},
      ${hexToRgba(endColor, endOpacity)})`;
  } else {
    lineStyle.backgroundColor = style.color;
  }

  return <div style={lineStyle} />;
};

// ============================================================
// 品牌点缀渲染器
// ============================================================

interface BrandAccentProps {
  element: BrandAccentElement;
  width: number;
  height: number;
}

export const BrandAccent: React.FC<BrandAccentProps> = ({ element, width, height }) => {
  const { position, style, content } = element;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x * width}px`,
    top: `${position.y * height}px`,
    minWidth: `${(position.width || 0.1) * width}px`,
    height: `${(position.height || 0.04) * height}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  };

  // 根据形状类型渲染
  switch (style.shape) {
    case 'pill':
      return (
        <div
          style={{
            ...containerStyle,
            backgroundColor: style.primaryColor,
            borderRadius: '999px',
            padding: '4px 12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span
            style={{
              color: style.secondaryColor || '#FFFFFF',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {content}
          </span>
        </div>
      );

    case 'ribbon':
      return (
        <div
          style={{
            ...containerStyle,
            backgroundColor: style.primaryColor,
            clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)',
            padding: '6px 18px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <span
            style={{
              color: style.secondaryColor || '#FFFFFF',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {content}
          </span>
        </div>
      );

    case 'badge':
      return (
        <div
          style={{
            ...containerStyle,
            backgroundColor: style.primaryColor,
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            padding: '3px 8px',
          }}
        >
          <span
            style={{
              color: style.secondaryColor || '#FFFFFF',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {content}
          </span>
        </div>
      );

    case 'stamp':
      return (
        <div
          style={{
            ...containerStyle,
            border: `2px solid ${style.primaryColor}`,
            borderRadius: '50%',
            padding: '8px',
            transform: 'rotate(-5deg)',
          }}
        >
          <span
            style={{
              color: style.primaryColor,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {content}
          </span>
        </div>
      );

    default:
      return null;
  }
};

// ============================================================
// 文字效果应用器
// ============================================================

/**
 * 将文字效果应用到基础样式
 */
export function applyTextEffect(
  effect: TextEffectConfig | null | undefined,
  baseStyle: React.CSSProperties
): React.CSSProperties {
  if (!effect) return baseStyle;

  const result = { ...baseStyle };

  switch (effect.style) {
    case 'outline':
      // 描边效果：使用多层 textShadow
      const outlineColor = effect.config.shadowColor || '#000000';
      const blur = effect.config.shadowBlur || 2;
      result.textShadow = `
        -${blur}px -${blur}px 0 ${outlineColor},
        ${blur}px -${blur}px 0 ${outlineColor},
        -${blur}px ${blur}px 0 ${outlineColor},
        ${blur}px ${blur}px 0 ${outlineColor}
      `;
      break;

    case 'shadow':
      // 阴影效果
      const offsetX = effect.config.shadowOffset?.x || 2;
      const offsetY = effect.config.shadowOffset?.y || 2;
      result.textShadow = `${offsetX}px ${offsetY}px ${effect.config.shadowBlur || 3}px ${effect.config.shadowColor || '#000000'}`;
      break;

    case 'gold_emboss':
      // 金属浮雕效果：多层阴影模拟3D立体感
      const primary = effect.config.primaryColor || '#FFD700';
      const highlight = effect.config.highlightColor || '#FFF8DC';
      const shadow = effect.config.shadowColor || '#C9A227';
      result.textShadow = `
        0 1px 0 ${highlight},
        0 2px 0 ${primary},
        0 3px 0 ${shadow},
        0 4px 3px rgba(0,0,0,0.4)
      `;
      break;

    case 'gradient':
      // 渐变文字效果：使用 background-clip: text
      const start = effect.config.primaryColor || '#FFD700';
      const end = effect.config.secondaryColor || '#C9A227';
      result.background = `linear-gradient(to bottom, ${start}, ${end})`;
      result.backgroundClip = 'text';
      result.WebkitBackgroundClip = 'text';
      result.WebkitTextFillColor = 'transparent';
      // 渐变文字需要额外的下阴影保持可读性
      result.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))';
      break;

    case 'neon':
      // 霓虹发光效果
      const glowColor = effect.config.glowColor || '#FF6B6B';
      const glowBlur = effect.config.shadowBlur || 4;
      result.textShadow = `
        0 0 ${glowBlur}px ${glowColor},
        0 0 ${glowBlur * 2}px ${glowColor},
        0 0 ${glowBlur * 4}px ${glowColor}
      `;
      if (effect.config.glow) {
        result.animation = 'neon-pulse 2s ease-in-out infinite alternate';
      }
      break;
  }

  return result;
}

// ============================================================
// 微交互装饰渲染器
// ============================================================

interface MicroDecorationProps {
  element: MicroDecoration;
  width: number;
  height: number;
}

export const MicroDecorationElement: React.FC<MicroDecorationProps> = ({
  element,
  width,
  height,
}) => {
  const { type, position, style, content } = element;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x * width}px`,
    top: `${position.y * height}px`,
    width: `${(position.width || 0.08) * width}px`,
    height: `${(position.height || 0.08) * height}px`,
    opacity: style.opacity ?? 0.7,
  };

  switch (type) {
    case 'corner_ornament':
      // 四角装饰：简单的几何线条
      return (
        <svg
          style={baseStyle}
          viewBox="0 0 100 100"
          fill="none"
          stroke={style.primaryColor}
          strokeWidth="2"
        >
          <path d="M0 50 L50 0" opacity="0.8" />
          <path d="M50 0 L100 0" opacity="0.6" />
          <path d="M0 50 L0 100" opacity="0.6" />
        </svg>
      );

    case 'number_badge':
      // 数字徽章
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: style.primaryColor,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: style.glow ? `0 0 10px ${style.primaryColor}` : '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span
            style={{
              color: style.secondaryColor || '#FFFFFF',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {content}
          </span>
        </div>
      );

    case 'star_rating':
      // 星级评分
      const stars = typeof content === 'number' ? content : 5;
      return (
        <div style={baseStyle}>
          {[...Array(stars)].map((_, i) => (
            <svg
              key={i}
              viewBox="0 0 24 24"
              fill={style.primaryColor}
              style={{ width: '20px', height: '20px' }}
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </div>
      );

    case 'neon_pulse':
      // 霓虹脉冲点
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: style.primaryColor,
            borderRadius: '50%',
            boxShadow: style.glow
              ? `0 0 15px ${style.primaryColor}, 0 0 30px ${style.primaryColor}`
              : '0 2px 8px rgba(0,0,0,0.3)',
            animation: 'neon-pulse 2s ease-in-out infinite alternate',
          }}
        />
      );

    default:
      return null;
  }
};

// ============================================================
// 工具函数
// ============================================================

/**
 * HEX 颜色转 RGBA
 */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}