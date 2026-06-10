/**
 * Repository 公共类型定义
 */

/** Repository 时钟服务 */
export interface IRepositoryClock {
  /** 生成唯一 ID */
  generateId(): string;
  /** 获取当前时间戳（毫秒） */
  now(): number;
}