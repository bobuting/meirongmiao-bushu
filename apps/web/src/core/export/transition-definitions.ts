/**
 * 转场定义注册表
 * 完全搬运 FreeCut 原版 21 种转场
 */

import type { TransitionDefinition } from './export-pipeline';

/**
 * 转场定义注册表
 */
export const TRANSITION_DEFINITIONS_REGISTRY = new Map<string, TransitionDefinition>();

function register(def: TransitionDefinition): void {
  TRANSITION_DEFINITIONS_REGISTRY.set(def.id, def);
}

// ==================== Basic 系列 (1) ====================
register({
  id: 'fade',
  defaultDuration: 30,
  minDuration: 5,
  maxDuration: 90,
  hasDirection: false,
  series: 'basic',
});

// ==================== Wipe 系列 (2) ====================
register({
  id: 'wipe',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
  series: 'wipe',
});

register({
  id: 'clockWipe',
  defaultDuration: 40,
  minDuration: 20,
  maxDuration: 120,
  hasDirection: false,
  series: 'wipe',
});

// ==================== Slide 系列 (1) ====================
register({
  id: 'slide',
  defaultDuration: 25,
  minDuration: 10,
  maxDuration: 80,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
  series: 'slide',
});

// ==================== Flip 系列 (1) ====================
register({
  id: 'flip',
  defaultDuration: 40,
  minDuration: 20,
  maxDuration: 100,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
  series: 'flip',
});

// ==================== Iris 系列 (1) ====================
register({
  id: 'iris',
  defaultDuration: 35,
  minDuration: 15,
  maxDuration: 100,
  hasDirection: false,
  series: 'iris',
});

// ==================== Canvas 2D Wipe 系列 (7) ====================
register({
  id: 'bandWipe',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: false,
  series: 'wipe',
});

register({
  id: 'centerWipe',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: false,
  series: 'wipe',
});

register({
  id: 'edgeWipe',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
  series: 'wipe',
});

register({
  id: 'radialWipe',
  defaultDuration: 40,
  minDuration: 20,
  maxDuration: 120,
  hasDirection: false,
  series: 'wipe',
});

register({
  id: 'spiralWipe',
  defaultDuration: 50,
  minDuration: 30,
  maxDuration: 150,
  hasDirection: false,
  series: 'wipe',
});

register({
  id: 'venetianBlindWipe',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: false,
  series: 'wipe',
});

register({
  id: 'xWipe',
  defaultDuration: 35,
  minDuration: 15,
  maxDuration: 100,
  hasDirection: false,
  series: 'wipe',
});

// ==================== Canvas 2D Motion 系列 (2) ====================
register({
  id: 'barnDoor',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: false,
  series: 'motion',
});

register({
  id: 'split',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
  hasDirection: false,
  series: 'motion',
});

// ==================== GPU 系列 (11) ====================
register({
  id: 'dissolve',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 120,
  hasDirection: false,
});

register({
  id: 'additiveDissolve',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 120,
  hasDirection: false,
});

register({
  id: 'blurDissolve',
  defaultDuration: 40,
  minDuration: 15,
  maxDuration: 120,
  hasDirection: false,
});

register({
  id: 'dipToColorDissolve',
  defaultDuration: 45,
  minDuration: 20,
  maxDuration: 150,
  hasDirection: false,
});

register({
  id: 'nonAdditiveDissolve',
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 120,
  hasDirection: false,
});

register({
  id: 'smoothCut',
  defaultDuration: 15,
  minDuration: 5,
  maxDuration: 60,
  hasDirection: false,
});

register({
  id: 'sparkles',
  defaultDuration: 50,
  minDuration: 30,
  maxDuration: 150,
  hasDirection: false,
});

register({
  id: 'glitch',
  defaultDuration: 20,
  minDuration: 10,
  maxDuration: 60,
  hasDirection: false,
});

register({
  id: 'pixelate',
  defaultDuration: 25,
  minDuration: 15,
  maxDuration: 80,
  hasDirection: false,
});

register({
  id: 'chromatic',
  defaultDuration: 30,
  minDuration: 15,
  maxDuration: 90,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
});

register({
  id: 'radialBlur',
  defaultDuration: 40,
  minDuration: 20,
  maxDuration: 100,
  hasDirection: false,
});

// ==================== 特效系列 (4) ====================
register({
  id: 'liquidDistort',
  defaultDuration: 45,
  minDuration: 25,
  maxDuration: 120,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
});

register({
  id: 'lensWarpZoom',
  defaultDuration: 35,
  minDuration: 15,
  maxDuration: 90,
  hasDirection: false,
});

register({
  id: 'lightLeakBurn',
  defaultDuration: 50,
  minDuration: 30,
  maxDuration: 150,
  hasDirection: true,
  directions: ['from-left', 'from-right', 'from-top', 'from-bottom'],
});

register({
  id: 'filmGateSlip',
  defaultDuration: 40,
  minDuration: 20,
  maxDuration: 100,
  hasDirection: false,
});

/**
 * 获取转场定义
 */
export function getTransitionDefinition(id: string): TransitionDefinition | undefined {
  return TRANSITION_DEFINITIONS_REGISTRY.get(id);
}

/**
 * 获取所有转场 ID
 */
export function getTransitionDefinitionIds(): string[] {
  return Array.from(TRANSITION_DEFINITIONS_REGISTRY.keys());
}

/**
 * 获取平滑转场 ID 列表（过滤激烈效果）
 */
export function getSmoothTransitionIds(): string[] {
  const intenseEffects = ['glitch', 'pixelate', 'chromatic'];
  return getTransitionDefinitionIds().filter(id => !intenseEffects.includes(id));
}

/**
 * 按系列获取转场 ID 列表
 */
export function getTransitionIdsBySeries(
  series: 'basic' | 'wipe' | 'slide' | 'flip' | 'iris'
): string[] {
  return getTransitionDefinitionIds().filter(
    id => TRANSITION_DEFINITIONS_REGISTRY.get(id)?.series === series
  );
}