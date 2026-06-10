/**
 * numeric.ts — 数值安全处理工具函数
 * 解决 NaN、Infinity、除零、边界溢出问题
 */

/**
 * 数值边界约束
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * 安全除法（防止除零和 Infinity）
 */
export function safeDivide(a: number, b: number, fallback: number = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return fallback;
  }
  return a / b;
}

/**
 * 安全乘法（防止 Infinity 溢出）
 */
export function safeMultiply(a: number, b: number, max: number = 10000): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  const result = a * b;
  if (!Number.isFinite(result) || result > max) {
    return max;
  }
  return result;
}

/**
 * 安全角度值（限制在 ±360 度，NaN → 0）
 */
export function safeRotation(rotation: number | undefined | null): number {
  if (rotation == null || !Number.isFinite(rotation)) return 0;
  return clamp(rotation, -360, 360);
}

/**
 * 安全尺寸值（限制在合理范围，防止负数和超大值）
 */
export function safeDimension(value: number, min: number = 0.02, max: number = 1): number {
  if (!Number.isFinite(value) || value <= 0) return min;
  return clamp(value, min, max);
}

/**
 * 安全坐标值（限制在 0-1 范围）
 */
export function safeCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

/**
 * 安全 scale 值（防止过小或过大）
 */
export function safeScale(scale: number, min: number = 0.5, max: number = 10): number {
  if (!Number.isFinite(scale) || scale <= 0) return min;
  return clamp(scale, min, max);
}

/**
 * 安全比例值（防止除零）
 */
export function safeAspectRatio(w: number, h: number, fallback: number = 1): number {
  const safeW = safeDimension(w, 0.001, 10000);
  const safeH = safeDimension(h, 0.001, 10000);
  return safeDivide(safeW, safeH, fallback);
}

/**
 * 安全整数解析（用于索引）
 */
export function safeParseInt(str: string, fallback: number = -1): number {
  const parsed = parseInt(str, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}