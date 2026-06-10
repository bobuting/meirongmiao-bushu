/**
 * Step3 年龄匹配公共函数
 * 供 library 和 video 脚本过滤复用
 */

/** 年龄范围映射表（可配置） */
export const AGE_RANGE_MAP: Record<string, [number, number]> = {
  "儿童": [0, 12],
  "少年": [13, 17],
  "青少年": [13, 17],
  "青年": [18, 35],
  "年轻": [18, 35],
  "中年": [36, 55],
  "老年": [56, 120],
  "中老年": [56, 120],
};

/**
 * 解析年龄范围
 *
 * 支持格式：
 * - 映射表关键词："儿童"、"青年"、"中年" 等
 * - 范围格式："25-30岁"、"20~35岁"、"20至35岁"
 * - 单数字："16"（允许 ±3 岁误差）
 *
 * @param ageStr 年龄字符串
 * @returns [最小年龄, 最大年龄]
 */
export function parseAgeRange(ageStr: string): [number, number] {
  if (!ageStr || typeof ageStr !== "string") {
    return [0, 120];
  }

  const trimmed = ageStr.trim();

  // 1. 查找映射表
  for (const [key, range] of Object.entries(AGE_RANGE_MAP)) {
    if (trimmed.includes(key)) {
      return range;
    }
  }

  // 2. 解析范围格式 "25-30岁"、"20~35岁"、"20至35岁"
  const rangeMatch = trimmed.match(/(\d+)\s*[-~至]\s*(\d+)/);
  if (rangeMatch) {
    return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
  }

  // 3. 解析单数字 "16"（允许 ±3 岁误差）
  const singleMatch = trimmed.match(/(\d+)/);
  if (singleMatch) {
    const age = parseInt(singleMatch[1], 10);
    return [Math.max(0, age - 3), age + 3];
  }

  // 4. 无法解析，返回全范围（不限制）
  return [0, 120];
}

/**
 * 检查年龄是否在范围内
 *
 * @param scriptAge 脚本中的年龄
 * @param range 年龄范围 [min, max]
 * @returns 是否在范围内
 */
export function isAgeInRange(scriptAge: number, range: [number, number]): boolean {
  return scriptAge >= range[0] && scriptAge <= range[1];
}
