/**
 * 敏感信息脱敏
 *
 * 用于日志输出时自动脱敏敏感字段，防止密码、密钥等泄露
 */

/** 敏感字段模式（不区分大小写） */
const SENSITIVE_PATTERNS = [
  "secret",
  "apikey",
  "api_key",
  "auth",
  "token",
  "password",
  "passwd",
  "credential",
  "privatekey",
  "private_key",
  "accesskey",
  "access_key",
];

/** 最大递归深度 */
const MAX_DEPTH = 10;

/**
 * 检查字段名是否为敏感字段
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_PATTERNS.some((pattern) => lowerKey.includes(pattern));
}

/**
 * 脱敏敏感值
 *
 * - 短字符串（<=8）：完全脱敏为 ****
 * - 长字符串：保留前4位和后4位，中间用 ... 替代
 * - 空值：返回 ****
 */
export function maskSensitiveValue(key: string, value: unknown): string {
  // 空值处理
  if (value === null || value === undefined || value === "") {
    return "****";
  }

  // 非字符串转换为字符串
  const strValue = typeof value === "string" ? value : String(value);

  // 短字符串完全脱敏
  if (strValue.length <= 8) {
    return "****";
  }

  // 长字符串保留前后4位
  const prefix = strValue.slice(0, 4);
  const suffix = strValue.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * 递归脱敏对象
 *
 * @param obj - 要脱敏的对象
 * @param depth - 当前递归深度（内部使用）
 * @returns 脱敏后的对象副本
 */
export function redactObject<T>(obj: T, depth = 0): T {
  // 原始类型直接返回
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  // 超过最大深度，返回占位符
  if (depth > MAX_DEPTH) {
    return "[MAX_DEPTH_EXCEEDED]" as T;
  }

  // Error 对象特殊处理：保留原始引用
  if (obj instanceof Error) {
    return obj;
  }

  // 数组处理
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1)) as T;
  }

  // 对象处理
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      // null 和 undefined 保持原样
      result[key] = value;
    } else if (typeof value === "object") {
      // 对象类型：递归脱敏（无论 key 是否敏感）
      result[key] = redactObject(value, depth + 1);
    } else if (isSensitiveKey(key)) {
      // 敏感字段的原始值：进行脱敏
      result[key] = maskSensitiveValue(key, value);
    } else {
      // 非敏感非对象：直接保留
      result[key] = value;
    }
  }

  return result as T;
}
