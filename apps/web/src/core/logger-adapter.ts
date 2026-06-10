/**
 * 日志适配器
 * 将 FreeCut 的 createLogger 适配到 neirongmiao 的 getLogger
 */

import { getLogger } from './logger';

// FreeCut 使用 createLogger，我们适配为 getLogger
export function createLogger(name: string) {
  return getLogger(name);
}
