/**
 * 全局 Handlebars Helpers
 *
 * 注册所有 Skills 模板共用的 helper 函数
 */

import Handlebars from 'handlebars';

let registered = false;

/**
 * 注册全局 Handlebars helpers（幂等，只注册一次）
 */
export function registerBuiltinHelpers(): void {
  if (registered) return;
  registered = true;

  Handlebars.registerHelper('eq', (a: unknown, b: unknown, options: Handlebars.HelperOptions) => {
    if (arguments.length === 2) {
      // 子表达式用法：{{#if (eq a b)}}
      return a === b;
    }
    // 块级用法：{{#eq a b}}...{{/eq}}
    if (a === b) {
      return options.fn ? options.fn(options.data?.root ?? {}) : true;
    }
    return options.inverse ? options.inverse(options.data?.root ?? {}) : '';
  });

  Handlebars.registerHelper('inc', (value: number): number => {
    return value + 1;
  });

  Handlebars.registerHelper('length', (arr: unknown): number => {
    return Array.isArray(arr) ? arr.length : 0;
  });

  Handlebars.registerHelper('join', (arr: unknown, separator: string): string => {
    if (!Array.isArray(arr)) return '';
    return arr.join(separator);
  });

  Handlebars.registerHelper('add', (a: number, b: number): number => {
    return a + b;
  });

  Handlebars.registerHelper('or', (...args: unknown[]): boolean => {
    // 最后一个参数是 Handlebars options 对象，排除掉
    const values = args.slice(0, -1) as boolean[];
    return values.some(Boolean);
  });

  Handlebars.registerHelper('and', (...args: unknown[]): boolean => {
    const values = args.slice(0, -1) as boolean[];
    return values.every(Boolean);
  });
}
