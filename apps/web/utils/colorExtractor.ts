/**
 * 颜色提取工具函数
 * 从图片中提取主色调并生成完整的三色主题
 *
 * @module apps/web/utils/colorExtractor
 */

import chroma, { type Color } from 'chroma-js';
import { getLogger } from '../src/core/logger';

const log = getLogger('colorExtractor');

// chroma-js 运行时支持但类型定义中缺失的方法，通过扩展类型来补充
type ChromaColor = Color & {
  lab(): number[];
  get(mode: string): number;
};
type ChromaStatic = typeof chroma & {
  distance(color1: string | Color, color2: string | Color): number;
  contrast(color1: string | Color, color2: string | Color): number;
  hsl(h: number, s: number, l: number): Color;
};
const chromaLib = chroma as ChromaStatic;
import type { ThemeConfig, ThemeColors, ThemeGradients, ThemeFonts, ThemeAnimations } from '../types';

/* ===================== 类型定义 ===================== */

/**
 * 提取的颜色结果
 */
export interface ExtractedColors {
  /** 主色调（从图片提取的主色） */
  primary: string;
  /** 强调色（从图片提取的次要色或主色变体） */
  accent: string;
  /** 辅助色（从图片提取的第三色或主色变体） */
  secondary: string;
  /** 提取的颜色调色板 */
  palette: string[];
}

/**
 * 生成的主题配置
 */
export interface GeneratedTheme {
  colors: ThemeColors;
  gradients: ThemeGradients;
  fonts: ThemeFonts;
  animations: ThemeAnimations;
}

/* ===================== 常量定义 ===================== */

/**
 * 默认主题颜色（当颜色提取失败时使用）
 */
const DEFAULT_COLORS = {
  primary: '#e68c19',
  accent: '#00a8ff',
  secondary: '#1A1A1A',
};

/* ===================== 颜色提取函数 ===================== */

/**
 * 从图片中提取颜色调色板
 * 使用 Canvas API 采样图片像素
 *
 * @param imageUrl - 图片 URL 或 base64 数据 URL
 * @param colorCount - 要提取的颜色数量，默认 5
 * @returns 提取的颜色数组
 */
export async function extractColorsFromImage(
  imageUrl: string,
  colorCount: number = 5
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        // 创建 Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'));
          return;
        }

        // 缩小图片尺寸以提高性能
        const maxSize = 100;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 绘制图片
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // 采样像素并计算颜色频率
        const colorMap = new Map<string, number>();

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // 忽略透明像素
          if (a < 128) continue;

          // 量化颜色（减少颜色数量以便聚类）
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;

          const colorKey = `${qr},${qg},${qb}`;
          colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
        }

        // 按频率排序并获取最常见的颜色
        const sortedColors = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, colorCount * 3) // 取更多候选颜色
          .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            return (chroma as unknown as (input: number[]) => Color)([r, g, b]).hex();
          });

        // 使用 chroma-js 聚类去重
        const distinctColors: string[] = [];
        for (const color of sortedColors) {
          const isDistinct = distinctColors.every(
            (existing) => chromaLib.distance(color, existing) > 50
          );
          if (isDistinct) {
            distinctColors.push(color);
          }
          if (distinctColors.length >= colorCount) break;
        }

        // 如果颜色不足，使用变体填充
        while (distinctColors.length < colorCount) {
          const baseColor = distinctColors[distinctColors.length - 1] || DEFAULT_COLORS.primary;
          distinctColors.push(chroma(baseColor).darken(0.5).hex());
        }

        resolve(distinctColors);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };

    img.src = imageUrl;
  });
}

/**
 * 从提取的颜色中选择主色调、强调色和辅助色
 *
 * @param colors - 提取的颜色数组
 * @returns 选择的三色组合
 */
export function selectThemeColors(colors: string[]): ExtractedColors {
  if (colors.length === 0) {
    return {
      primary: DEFAULT_COLORS.primary,
      accent: DEFAULT_COLORS.accent,
      secondary: DEFAULT_COLORS.secondary,
      palette: [DEFAULT_COLORS.primary, DEFAULT_COLORS.accent, DEFAULT_COLORS.secondary],
    };
  }

  // 计算每个颜色的亮度和饱和度
  const colorStats = colors.map((color) => {
    const lab = (chroma(color) as ChromaColor).lab();
    const l = lab[0]; // 亮度 0-100
    const saturation = (chroma(color) as ChromaColor).get('hsl.s') || 0;
    return {
      color,
      lightness: l,
      saturation,
      // 适合作为主色的分数（中等亮度，高饱和度）
      primaryScore: (100 - Math.abs(l - 50) * 2) * 0.4 + saturation * 60,
      // 适合作为强调色的分数（较高亮度，高饱和度）
      accentScore: l * 0.5 + saturation * 50,
    };
  });

  // 按主色分数排序
  colorStats.sort((a, b) => b.primaryScore - a.primaryScore);

  // 选择主色（最适合作为品牌色的）
  const primary = ensureValidColor(colorStats[0]?.color || DEFAULT_COLORS.primary);

  // 选择强调色（与主色有明显区分的颜色）
  let accent = colorStats.find(
    (stat) => chromaLib.distance(stat.color, primary) > 80 && stat.accentScore > 30
  )?.color;

  if (!accent) {
    // 如果没有找到合适的强调色，基于主色生成
    accent = generateAccentColor(primary);
  }

  // 选择辅助色
  let secondary = colorStats.find(
    (stat) =>
      chromaLib.distance(stat.color, primary) > 60 &&
      chromaLib.distance(stat.color, accent) > 60
  )?.color;

  if (!secondary) {
    secondary = chroma(primary).desaturate(2).hex();
  }

  return {
    primary,
    accent: ensureValidColor(accent),
    secondary: ensureValidColor(secondary),
    palette: colors,
  };
}

/**
 * 确保颜色值有效且适合作为主题色
 *
 * @param color - 颜色值
 * @returns 有效的颜色值
 */
function ensureValidColor(color: string): string {
  try {
    const c = chroma(color) as ChromaColor;

    // 检查颜色是否太亮或太暗
    const l = c.get('lab.l');

    if (l > 90) {
      // 太亮，变暗一点
      return c.darken(1).hex();
    } else if (l < 15) {
      // 太暗，变亮一点
      return c.brighten(1).hex();
    }

    return c.hex();
  } catch {
    return DEFAULT_COLORS.primary;
  }
}

/**
 * 基于主色生成强调色
 *
 * @param primaryColor - 主色调
 * @returns 强调色
 */
function generateAccentColor(primaryColor: string): string {
  const c = chroma(primaryColor) as ChromaColor;
  const hue = c.get('hsl.h') || 200;

  // 色相偏移 30-60 度，生成互补或类似色
  const newHue = (hue + 45) % 360;

  return chromaLib.hsl(newHue, 0.8, 0.6).hex();
}

/**
 * 自定义颜色覆盖配置
 * 用于让用户覆盖自动生成的颜色
 */
export interface ColorOverrides {
  /** 文字色覆盖 */
  text?: {
    primary?: string;
    secondary?: string;
    muted?: string;
  };
  /** 背景色覆盖 */
  background?: string;
  backgroundWarm?: string;
  surface?: string;
  /** 边框色覆盖 */
  border?: string;
  borderFocus?: string;
}

/**
 * 基于主色生成完整的主题配置
 * 自动计算所有颜色变体，确保视觉统一和对比度符合 WCAG 标准
 *
 * @param primaryColor - 主色调
 * @param accentColor - 强调色（可选，如果不提供则自动生成）
 * @param overrides - 自定义颜色覆盖（可选，用于覆盖自动生成的颜色）
 * @returns 完整的主题配置
 */
export function generateThemeFromPrimaryColor(
  primaryColor: string,
  accentColor?: string,
  overrides?: ColorOverrides
): GeneratedTheme {
  const primary = chroma(primaryColor);

  // 生成主色的变体
  const primaryHover = primary.darken(0.3).hex();
  const primaryActive = primary.darken(0.6).hex();
  const primaryLight = primary.brighten(2.5).desaturate(1.5).hex();

  // 强调色
  const accent = accentColor ? chroma(accentColor) : chroma(generateAccentColor(primaryColor));
  const accentHover = accent.brighten(0.2).hex();
  const accentActive = accent.darken(0.2).hex();

  // 次要色（深灰，用于标题和重要文字）
  const secondary = '#1A1A1A';

  // 背景色系（暖白背景，与主色协调）
  const background = overrides?.background ?? '#fdfbf7';
  const backgroundWarm = overrides?.backgroundWarm ?? '#fcfaf7';
  const surface = overrides?.surface ?? '#ffffff';

  // 文字色系（使用覆盖值或默认值）
  const textPrimary = overrides?.text?.primary ?? '#002244';
  const textSecondary = overrides?.text?.secondary ?? '#666666';
  const textMuted = overrides?.text?.muted ?? '#999999';

  // 边框色系（使用覆盖值或默认值）
  const border = overrides?.border ?? '#e0e0e0';
  const borderFocus = overrides?.borderFocus ?? primary.hex();

  // 构建颜色配置
  const colors: ThemeColors = {
    primary: primary.hex(),
    primaryHover,
    primaryActive,
    primaryLight,
    accent: accent.hex(),
    accentHover,
    accentActive,
    secondary,
    background,
    backgroundWarm,
    surface,
    text: {
      primary: textPrimary,
      secondary: textSecondary,
      muted: textMuted,
    },
    border,
    borderFocus,
  };

  // 构建渐变配置
  const gradients: ThemeGradients = {
    primary: `linear-gradient(135deg, ${primary.hex()} 0%, ${accent.hex()} 100%)`,
    primaryHover: `linear-gradient(135deg, ${primaryHover} 0%, ${accentHover} 100%)`,
    primaryActive: `linear-gradient(135deg, ${primaryActive} 0%, ${accentActive} 100%)`,
  };

  // 构建字体配置
  const fonts: ThemeFonts = {
    main: "'Noto Sans SC', Inter, sans-serif",
    display: 'Inter, sans-serif',
  };

  // 构建动画配置
  const animations: ThemeAnimations = {
    transitionSpeed: '200ms',
    hoverTransform: 'translateY(-2px)',
  };

  return { colors, gradients, fonts, animations };
}

/**
 * 从图片生成完整的主题配置
 *
 * @param imageUrl - 图片 URL 或 base64 数据 URL
 * @returns 完整的主题配置
 */
export async function generateThemeFromImage(imageUrl: string): Promise<GeneratedTheme> {
  try {
    // 从图片提取颜色
    const colors = await extractColorsFromImage(imageUrl);

    // 选择主题色
    const selected = selectThemeColors(colors);

    // 生成完整主题
    return generateThemeFromPrimaryColor(selected.primary, selected.accent);
  } catch (error) {
    log.error('颜色提取失败，使用默认颜色:', error);

    // 返回默认主题
    return generateThemeFromPrimaryColor(DEFAULT_COLORS.primary, DEFAULT_COLORS.accent);
  }
}

/**
 * 验证颜色值是否有效
 *
 * @param color - 颜色值
 * @returns 是否有效
 */
export function isValidColor(color: string): boolean {
  try {
    chroma(color);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取颜色的亮度（0-1）
 *
 * @param color - 颜色值
 * @returns 亮度值
 */
export function getColorLightness(color: string): number {
  try {
    return (chroma(color) as ChromaColor).get('lab.l') / 100;
  } catch {
    return 0.5;
  }
}

/**
 * 调整颜色对比度，确保文字可读
 *
 * @param bgColor - 背景色
 * @param fgColor - 前景色（文字色）
 * @returns 调整后的前景色
 */
export function ensureContrast(bgColor: string, fgColor: string): string {
  const bg = chroma(bgColor);
  const fg = chroma(fgColor);

  const contrast = chromaLib.contrast(bg, fg);

  // WCAG AA 标准要求对比度至少 4.5:1
  if (contrast < 4.5) {
    // 根据背景色亮度调整前景色
    const bgLightness = (bg as ChromaColor).get('lab.l');
    return bgLightness > 50 ? fg.darken(2).hex() : fg.brighten(2).hex();
  }

  return fg.hex();
}