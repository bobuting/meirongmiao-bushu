/**
 * color.ts — 颜色安全处理工具函数
 * 解决 ${color}XX 拼接对非 hex 颜色无效的问题
 */

/**
 * 将颜色转换为带透明度的 rgba 格式
 * 支持 hex (#RRGGBB)、rgb()、rgba()、named colors
 */
export function colorWithAlpha(color: string, alpha: number): string {
  // 边界保护
  if (!color || typeof color !== "string") {
    return `rgba(255,255,255,${alpha})`; // 默认白色
  }

  const trimmed = color.trim();
  const safeAlpha = Math.max(0, Math.min(1, alpha));

  // hex 格式 (#RRGGBB 或 #RGB)
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    // 短格式 #RGB → #RRGGBB
    const fullHex = hex.length === 3
      ? hex.split("").map(c => c + c).join("")
      : hex;

    if (fullHex.length === 6 && /^[0-9a-fA-F]{6}$/.test(fullHex)) {
      const r = parseInt(fullHex.slice(0, 2), 16);
      const g = parseInt(fullHex.slice(2, 4), 16);
      const b = parseInt(fullHex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
    // 已经是 8 位 hex (#RRGGBBAA) - 直接返回
    if (fullHex.length === 8 && /^[0-9a-fA-F]{8}$/.test(fullHex)) {
      return trimmed; // 保持原样
    }
  }

  // rgba 格式 - 调整 alpha
  if (trimmed.startsWith("rgba(")) {
    const match = trimmed.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (match) {
      return `rgba(${match[1]},${match[2]},${match[3]},${safeAlpha})`;
    }
  }

  // rgb 格式 - 转为 rgba
  if (trimmed.startsWith("rgb(")) {
    const match = trimmed.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (match) {
      return `rgba(${match[1]},${match[2]},${match[3]},${safeAlpha})`;
    }
  }

  // named colors - 转换为 rgba
  const namedToRgb: Record<string, string> = {
    white: "255,255,255",
    black: "0,0,0",
    red: "255,0,0",
    green: "0,128,0",
    blue: "0,0,255",
    yellow: "255,255,0",
    orange: "255,165,0",
    purple: "128,0,128",
    pink: "255,192,203",
    gray: "128,128,128",
    grey: "128,128,128",
    silver: "192,192,192",
    gold: "255,215,0",
    cyan: "0,255,255",
    magenta: "255,0,255",
    transparent: "0,0,0,0",
  };

  const lowerColor = trimmed.toLowerCase();
  if (namedToRgb[lowerColor]) {
    return `rgba(${namedToRgb[lowerColor]},${safeAlpha})`;
  }

  // 无法解析 - 返回原色（风险：可能无效，但避免静默降级）
  return trimmed;
}

/**
 * hex alpha 值转换表（用于 SVG 8 位 hex）
 * alpha: 0.6 → "60", 0.4 → "40", 0.25 → "40"
 */
export function alphaToHex(alpha: number): string {
  const hex = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return hex.toString(16).padStart(2, "0");
}

/**
 * 安全的 8 位 hex 颜色（仅用于 SVG，Canvas 用 colorWithAlpha）
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) {
    // 非 6 位 hex，转为 rgba
    return colorWithAlpha(hex, alpha);
  }
  return hex + alphaToHex(alpha);
}