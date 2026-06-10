/**
 * Skills 系统统一入口
 *
 * 导出单例 skillLoader、工具函数和 admin 管理接口
 */

import path from 'node:path';
import { SkillLoader } from './skill-loader.js';
import { buildPromptVariables } from './prompt-utils.js';
export type { PromptVariableBuilderOptions } from './prompt-utils.js';

// ============================================================================
// 单例 SkillLoader
// ============================================================================

const skillsDir = path.join(process.cwd(), 'skills');
export const skillLoader = new SkillLoader(skillsDir);

// ============================================================================
// re-export
// ============================================================================

export { buildPromptVariables };

export { SkillLoader } from './skill-loader.js';
export type { Skill, SkillMetadata, SkillListItem } from './skill-types.js';

// ============================================================================
// Admin 管理接口
// ============================================================================

export function getSkillsStats() {
  return skillLoader.getCacheStats();
}

export function clearSkillsCache(): void {
  skillLoader.clearCache();
}

// ============================================================================
// Metrics 指标
// ============================================================================

interface SkillsMetrics {
  code: string;
  success: boolean;
  duration: number;
  error?: string;
  timestamp?: number;
}

const metricsBuffer: SkillsMetrics[] = [];

export function recordMetrics(metrics: SkillsMetrics): void {
  metricsBuffer.push({ ...metrics, timestamp: Date.now() });
  if (metricsBuffer.length > 1000) {
    metricsBuffer.shift();
  }
}

export function getSkillsMetrics() {
  const total = metricsBuffer.length;
  const success = metricsBuffer.filter(m => m.success).length;
  const failed = metricsBuffer.filter(m => !m.success).length;

  const avgDuration = total > 0
    ? metricsBuffer.reduce((sum, m) => sum + m.duration, 0) / total
    : 0;

  return {
    total,
    skillsUsed: total,
    skillsSuccess: success,
    skillsFailed: failed,
    skillsSuccessRate: total > 0 ? success / total : 0,
    avgDuration,
    skillsAvgDuration: avgDuration,
    dbUsed: 0,
    dbAvgDuration: 0,
    performanceGain: 0,
    cacheHits: skillLoader.getCacheStats().hits,
    cacheMisses: skillLoader.getCacheStats().misses,
    cacheHitRate: skillLoader.getCacheStats().hitRate,
  };
}

/** 清空内存中的指标缓冲 */
export function resetSkillsMetrics(): number {
  const count = metricsBuffer.length;
  metricsBuffer.length = 0;
  return count;
}
