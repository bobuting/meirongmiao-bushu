/**
 * 主题CSS变量工具函数
 * 用于将主题配置动态注入到页面
 *
 * @module apps/web/utils/themeUtils
 */

import type { ThemeConfig, ThemeColors, ThemeGradients, ThemeFonts, ThemeAnimations } from '../types';

/* ===================== CSS变量名称映射 ===================== */

/**
 * 颜色配置到CSS变量名的映射
 * 定义 ThemeColors 接口字段与 CSS 变量名的对应关系
 */
const COLOR_VAR_MAP: Record<Exclude<keyof ThemeColors, 'text'>, string> = {
  primary: '--color-primary',                    // 主色调
  primaryHover: '--color-primary-hover',         // 主色调悬浮状态
  primaryActive: '--color-primary-active',       // 主色调激活状态
  primaryLight: '--color-primary-light',         // 主色调浅色背景
  accent: '--color-accent',                      // 强调色
  accentHover: '--color-accent-hover',           // 强调色悬浮状态
  accentActive: '--color-accent-active',         // 强调色激活状态
  secondary: '--color-secondary',                // 次要色
  background: '--color-bg',                      // 主背景色
  backgroundWarm: '--color-bg-warm',             // 暖色背景
  surface: '--color-surface',                    // 表面色
  border: '--color-border',                      // 边框色
  borderFocus: '--color-border-focus',           // 聚焦边框色
};

/**
 * 文字颜色配置到CSS变量名的映射
 */
const TEXT_COLOR_VAR_MAP: Record<keyof ThemeColors['text'], string> = {
  primary: '--color-text-primary',               // 主要文字色
  secondary: '--color-text-secondary',           // 次要文字色
  muted: '--color-text-muted',                   // 弱化文字色
};

/**
 * 渐变配置到CSS变量名的映射
 */
const GRADIENT_VAR_MAP: Record<keyof ThemeGradients, string> = {
  primary: '--gradient-primary',                 // 主渐变
  primaryHover: '--gradient-primary-hover',      // 主渐变悬浮
  primaryActive: '--gradient-primary-active',    // 主渐变激活
};

/**
 * 字体配置到CSS变量名的映射
 */
const FONT_VAR_MAP: Record<keyof ThemeFonts, string> = {
  main: '--font-main',                           // 主字体
  display: '--font-display',                     // 展示字体
};

/**
 * 动画配置到CSS变量名的映射
 */
const ANIMATION_VAR_MAP: Record<keyof ThemeAnimations, string> = {
  transitionSpeed: '--transition-speed',         // 过渡速度
  hoverTransform: '--hover-transform',           // 悬浮变换
};

/* ===================== 默认主题配置 ===================== */

/**
 * 默认主题配置（内容喵主题）
 * 用于在加载用户主题前的初始状态
 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  colors: {
    primary: '#e68c19',          // 主色调：橙黄
    primaryHover: '#d97e10',     // 主色调悬浮状态
    primaryActive: '#c97108',    // 主色调激活状态
    primaryLight: '#fff7ed',     // 主色调浅色背景
    accent: '#00a8ff',           // 强调色：亮蓝
    accentHover: '#00ccff',      // 强调色悬浮状态
    accentActive: '#0099dd',     // 强调色激活状态
    secondary: '#1A1A1A',        // 次要色：深灰
    background: '#fdfbf7',       // 主背景色：暖白
    backgroundWarm: '#fcfaf7',   // 暖色背景
    surface: '#ffffff',          // 表面色：白色
    text: {
      primary: '#002244',        // 主要文字色
      secondary: '#666666',      // 次要文字色
      muted: '#999999',          // 弱化文字色
    },
    border: '#e0e0e0',           // 边框色
    borderFocus: '#e68c19',      // 聚焦边框色
  },
  gradients: {
    primary: 'linear-gradient(135deg, #e68c19 0%, #00a8ff 100%)',           // 主渐变
    primaryHover: 'linear-gradient(135deg, #d97e10 0%, #00ccff 100%)',     // 主渐变悬浮
    primaryActive: 'linear-gradient(135deg, #c97108 0%, #0099dd 100%)',    // 主渐变激活
  },
  fonts: {
    main: "'Noto Sans SC', Inter, sans-serif",    // 主字体
    display: 'Inter, sans-serif',                  // 展示字体
  },
  animations: {
    transitionSpeed: '200ms',             // 过渡速度
    hoverTransform: 'translateY(-2px)',   // 悬浮变换效果
  },
};

/* ===================== 核心函数 ===================== */

/**
 * 设置单个CSS变量
 * @param varName - CSS变量名（如 "--color-primary"）
 * @param value - 变量值
 */
function setCSSVariable(varName: string, value: string): void {
  // 获取根元素（:root）
  const root = document.documentElement;
  // 设置CSS变量值
  root.style.setProperty(varName, value);
}

/**
 * 移除单个CSS变量
 * @param varName - CSS变量名
 */
function removeCSSVariable(varName: string): void {
  // 获取根元素（:root）
  const root = document.documentElement;
  // 移除CSS变量（恢复为CSS文件中定义的默认值）
  root.style.removeProperty(varName);
}

/**
 * 应用颜色配置到CSS变量
 * @param colors - 颜色配置对象
 */
function applyColors(colors: ThemeColors): void {
  // 遍历所有颜色字段（排除 text，因为它是一个嵌套对象）
  Object.entries(COLOR_VAR_MAP).forEach(([key, varName]) => {
    // 获取颜色值
    const value = colors[key as Exclude<keyof ThemeColors, 'text'>];
    // 如果是字符串类型，设置CSS变量
    if (typeof value === 'string') {
      setCSSVariable(varName, value);
    }
  });

  // 单独处理文字颜色（嵌套对象）
  Object.entries(TEXT_COLOR_VAR_MAP).forEach(([key, varName]) => {
    // 获取文字颜色值
    const value = colors.text[key as keyof ThemeColors['text']];
    // 设置CSS变量
    setCSSVariable(varName, value);
  });
}

/**
 * 应用渐变配置到CSS变量
 * @param gradients - 渐变配置对象
 */
function applyGradients(gradients: ThemeGradients): void {
  // 遍历所有渐变字段
  Object.entries(GRADIENT_VAR_MAP).forEach(([key, varName]) => {
    // 获取渐变值
    const value = gradients[key as keyof ThemeGradients];
    // 设置CSS变量
    setCSSVariable(varName, value);
  });
}

/**
 * 应用字体配置到CSS变量
 * @param fonts - 字体配置对象
 */
function applyFonts(fonts: ThemeFonts): void {
  // 遍历所有字体字段
  Object.entries(FONT_VAR_MAP).forEach(([key, varName]) => {
    // 获取字体值
    const value = fonts[key as keyof ThemeFonts];
    // 设置CSS变量
    setCSSVariable(varName, value);
  });
}

/**
 * 应用动画配置到CSS变量
 * @param animations - 动画配置对象
 */
function applyAnimations(animations: ThemeAnimations): void {
  // 遍历所有动画字段
  Object.entries(ANIMATION_VAR_MAP).forEach(([key, varName]) => {
    // 获取动画值
    const value = animations[key as keyof ThemeAnimations];
    // 设置CSS变量
    setCSSVariable(varName, value);
  });
}

/**
 * 将主题配置应用到CSS变量
 * 通过动态修改 :root 元素的 CSS 变量实现主题切换
 *
 * @param config - 主题配置对象
 * @example
 * ```typescript
 * import { applyTheme } from './utils/themeUtils';
 *
 * // 应用新主题
 * applyTheme({
 *   colors: { primary: '#ff0000', ... },
 *   gradients: { primary: 'linear-gradient(...)', ... },
 *   fonts: { main: 'Arial', ... },
 *   animations: { transitionSpeed: '300ms', ... }
 * });
 * ```
 */
export function applyTheme(config: ThemeConfig): void {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') {
    console.warn('[themeUtils] applyTheme: 不在浏览器环境中，跳过主题应用');
    return;
  }

  // 检查配置是否有效
  if (!config) {
    console.error('[themeUtils] applyTheme: 无效的主题配置');
    return;
  }

  // 添加平滑过渡效果
  const root = document.documentElement;
  // 保存当前的 transition 设置
  const currentTransition = root.style.transition;
  // 设置主题切换时的过渡动画
  root.style.transition = 'background-color 0.3s ease, color 0.3s ease';

  // 应用颜色配置
  if (config.colors) {
    applyColors(config.colors);
  }

  // 应用渐变配置
  if (config.gradients) {
    applyGradients(config.gradients);
  }

  // 应用字体配置
  if (config.fonts) {
    applyFonts(config.fonts);
  }

  // 应用动画配置
  if (config.animations) {
    applyAnimations(config.animations);
  }

  // 恢复原来的 transition 设置（可选：延迟执行）
  setTimeout(() => {
    root.style.transition = currentTransition;
  }, 300);

}

/**
 * 重置为默认主题
 * 移除所有动态设置的 CSS 变量，恢复为 CSS 文件中定义的默认值
 *
 * @example
 * ```typescript
 * import { resetTheme } from './utils/themeUtils';
 *
 * // 重置为默认主题
 * resetTheme();
 * ```
 */
export function resetTheme(): void {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') {
    console.warn('[themeUtils] resetTheme: 不在浏览器环境中，跳过主题重置');
    return;
  }

  // 获取根元素
  const root = document.documentElement;

  // 定义所有需要移除的 CSS 变量列表
  const allVarNames: string[] = [
    // 颜色变量
    ...Object.values(COLOR_VAR_MAP),
    ...Object.values(TEXT_COLOR_VAR_MAP),
    // 渐变变量
    ...Object.values(GRADIENT_VAR_MAP),
    // 字体变量
    ...Object.values(FONT_VAR_MAP),
    // 动画变量
    ...Object.values(ANIMATION_VAR_MAP),
  ];

  // 移除所有动态设置的 CSS 变量
  allVarNames.forEach((varName) => {
    removeCSSVariable(varName);
  });

  // 输出调试信息
  console.log('[themeUtils] 主题已重置为默认值');
}

/**
 * 获取当前应用的主题配置
 * 从 :root 元素的 style 属性中读取 CSS 变量值
 *
 * @returns 当前应用的主题配置（部分）
 * @example
 * ```typescript
 * import { getCurrentTheme } from './utils/themeUtils';
 *
 * const currentTheme = getCurrentTheme();
 * console.log('当前主色调:', currentTheme.colors?.primary);
 * ```
 */
export function getCurrentTheme(): Partial<ThemeConfig> {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') {
    console.warn('[themeUtils] getCurrentTheme: 不在浏览器环境中');
    return {};
  }

  // 获取根元素的计算样式
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);

  /**
   * 从计算样式中获取 CSS 变量值
   * @param varName - CSS变量名
   * @returns 变量值或 undefined
   */
  function getVarValue(varName: string): string | undefined {
    // 获取 CSS 变量值
    const value = computedStyle.getPropertyValue(varName).trim();
    // 返回值（如果为空则返回 undefined）
    return value || undefined;
  }

  // 构建当前主题配置
  const config: Partial<ThemeConfig> = {
    colors: {
      primary: getVarValue(COLOR_VAR_MAP.primary) || DEFAULT_THEME_CONFIG.colors.primary,
      primaryHover: getVarValue(COLOR_VAR_MAP.primaryHover) || DEFAULT_THEME_CONFIG.colors.primaryHover,
      primaryActive: getVarValue(COLOR_VAR_MAP.primaryActive) || DEFAULT_THEME_CONFIG.colors.primaryActive,
      primaryLight: getVarValue(COLOR_VAR_MAP.primaryLight) || DEFAULT_THEME_CONFIG.colors.primaryLight,
      accent: getVarValue(COLOR_VAR_MAP.accent) || DEFAULT_THEME_CONFIG.colors.accent,
      accentHover: getVarValue(COLOR_VAR_MAP.accentHover) || DEFAULT_THEME_CONFIG.colors.accentHover,
      accentActive: getVarValue(COLOR_VAR_MAP.accentActive) || DEFAULT_THEME_CONFIG.colors.accentActive,
      secondary: getVarValue(COLOR_VAR_MAP.secondary) || DEFAULT_THEME_CONFIG.colors.secondary,
      background: getVarValue(COLOR_VAR_MAP.background) || DEFAULT_THEME_CONFIG.colors.background,
      backgroundWarm: getVarValue(COLOR_VAR_MAP.backgroundWarm) || DEFAULT_THEME_CONFIG.colors.backgroundWarm,
      surface: getVarValue(COLOR_VAR_MAP.surface) || DEFAULT_THEME_CONFIG.colors.surface,
      text: {
        primary: getVarValue(TEXT_COLOR_VAR_MAP.primary) || DEFAULT_THEME_CONFIG.colors.text.primary,
        secondary: getVarValue(TEXT_COLOR_VAR_MAP.secondary) || DEFAULT_THEME_CONFIG.colors.text.secondary,
        muted: getVarValue(TEXT_COLOR_VAR_MAP.muted) || DEFAULT_THEME_CONFIG.colors.text.muted,
      },
      border: getVarValue(COLOR_VAR_MAP.border) || DEFAULT_THEME_CONFIG.colors.border,
      borderFocus: getVarValue(COLOR_VAR_MAP.borderFocus) || DEFAULT_THEME_CONFIG.colors.borderFocus,
    },
    gradients: {
      primary: getVarValue(GRADIENT_VAR_MAP.primary) || DEFAULT_THEME_CONFIG.gradients.primary,
      primaryHover: getVarValue(GRADIENT_VAR_MAP.primaryHover) || DEFAULT_THEME_CONFIG.gradients.primaryHover,
      primaryActive: getVarValue(GRADIENT_VAR_MAP.primaryActive) || DEFAULT_THEME_CONFIG.gradients.primaryActive,
    },
    fonts: {
      main: getVarValue(FONT_VAR_MAP.main) || DEFAULT_THEME_CONFIG.fonts.main,
      display: getVarValue(FONT_VAR_MAP.display) || DEFAULT_THEME_CONFIG.fonts.display,
    },
    animations: {
      transitionSpeed: getVarValue(ANIMATION_VAR_MAP.transitionSpeed) || DEFAULT_THEME_CONFIG.animations.transitionSpeed,
      hoverTransform: getVarValue(ANIMATION_VAR_MAP.hoverTransform) || DEFAULT_THEME_CONFIG.animations.hoverTransform,
    },
  };

  return config;
}

/**
 * 合并主题配置（用于处理用户自定义覆盖）
 * 将用户自定义配置合并到基础主题配置上
 *
 * @param baseConfig - 基础主题配置
 * @param customConfig - 用户自定义配置（部分）
 * @returns 合并后的完整配置
 * @example
 * ```typescript
 * import { mergeThemeConfig } from './utils/themeUtils';
 *
 * const mergedConfig = mergeThemeConfig(baseTheme.config, {
 *   colors: {
 *     primary: '#ff0000' // 用户自定义主色
 *   }
 * });
 * ```
 */
export function mergeThemeConfig(
  baseConfig: ThemeConfig,
  customConfig?: Partial<ThemeConfig>
): ThemeConfig {
  // 如果没有自定义配置，直接返回基础配置
  if (!customConfig) {
    return baseConfig;
  }

  // 深度合并配置
  return {
    colors: {
      ...baseConfig.colors,
      ...customConfig.colors,
      // 单独处理 text 对象（确保深度合并）
      text: {
        ...baseConfig.colors.text,
        ...(customConfig.colors?.text || {}),
      },
    },
    gradients: {
      ...baseConfig.gradients,
      ...customConfig.gradients,
    },
    fonts: {
      ...baseConfig.fonts,
      ...customConfig.fonts,
    },
    animations: {
      ...baseConfig.animations,
      ...customConfig.animations,
    },
  };
}
