/**
 * 日期工具函数
 */

/**
 * 获取当前季节
 */
export function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "春季";
  if (month >= 6 && month <= 8) return "夏季";
  if (month >= 9 && month <= 11) return "秋季";
  return "冬季";
}

/**
 * 获取当前季度（如 2026-q1）
 */
export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const quarter = Math.ceil(month / 3); // 1-4
  return `${year}-q${quarter}`;
}

/**
 * 获取指定日期的季度
 */
export function getQuarterForDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${year}-q${quarter}`;
}
