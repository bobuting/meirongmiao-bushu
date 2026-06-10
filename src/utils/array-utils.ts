/**
 * 数组工具函数
 */

/**
 * 数组随机打乱（Fisher-Yates 洗牌算法）
 * 返回新数组，不修改原数组
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}