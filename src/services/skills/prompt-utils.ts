/**
 * 提示词模板工具函数
 */

/**
 * 提示词模板变量构建选项
 */
export interface PromptVariableBuilderOptions {
  /** 需要自动 JSON 序列化的字段名（值为对象/数组时序列化为格式化字符串） */
  jsonFields?: readonly string[];
  /** 需要自动 join 的字段名及其分隔符（值为字符串数组时合并为单字符串） */
  joinFields?: Readonly<Record<string, string>>;
}

/**
 * 通用提示词模板变量构建器
 *
 * 按键值对传入业务数据，自动处理常见转换：
 * - null / undefined / 空数组 自动过滤
 * - jsonFields 中指定的字段自动 JSON 序列化
 * - joinFields 中指定的字段自动数组 join
 */
export function buildPromptVariables(
  input: Record<string, unknown>,
  options?: PromptVariableBuilderOptions,
): Record<string, unknown> {
  const jsonFields = new Set(options?.jsonFields ?? []);
  const joinFields = options?.joinFields ?? {};
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0 && !(key in joinFields)) continue;

    if (jsonFields.has(key)) {
      result[key] = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      continue;
    }

    if (key in joinFields && Array.isArray(value)) {
      result[key] = value.join(joinFields[key]);
      continue;
    }

    result[key] = value;
  }

  return result;
}
