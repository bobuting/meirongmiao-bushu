/**
 * 策略类型显示标签（前后端共用）
 * 从 src/contracts/types.ts 的 STRATEGY_TYPE_LABELS 同步
 */

import type { ScriptStrategyType } from "@contracts/script.dto";

/** 策略类型显示标签映射表 */
export const STRATEGY_TYPE_LABELS: Record<ScriptStrategyType, string> = {
  library: "库存精选",
  video: "视频热榜",
  realtime: "实时热榜",
  effectiveness: "实时智能",
  new_story: "新故事",
  custom: "场景化脚本",
  fashion: "时尚大片",
  emotion_archetype: "情感原型",
  aesthetic: "生活美学",
  product_showcase: "产品展示",
  story_theme: "主题叙事",
  resonance: "共鸣故事",
};

/** 策略类型简短标签映射表（用于紧凑显示） */
export const STRATEGY_TYPE_SHORT_LABELS: Record<ScriptStrategyType, string> = {
  library: "库存",
  video: "视频",
  realtime: "实时",
  effectiveness: "智能",
  new_story: "新故事",
  custom: "场景",
  fashion: "时尚",
  emotion_archetype: "情感",
  aesthetic: "美学",
  product_showcase: "展示",
  story_theme: "叙事",
  resonance: "共鸣",
};

/** 策略类型图标映射表 */
export const STRATEGY_TYPE_ICONS: Record<ScriptStrategyType, string> = {
  library: "📚",
  video: "🎬",
  realtime: "🔥",
  effectiveness: "🤖",
  new_story: "📖",
  custom: "🎭",
  fashion: "👗",
  emotion_archetype: "❤️",
  aesthetic: "✨",
  product_showcase: "📸",
  story_theme: "📖",
  resonance: "💫",
};

/** 策略类型 Material Icons 映射表（用于 UI 组件） */
export const STRATEGY_TYPE_MATERIAL_ICONS: Record<ScriptStrategyType, string> = {
  library: "library_books",
  video: "movie_creation",
  realtime: "whatshot",
  effectiveness: "smart_toy",
  new_story: "menu_book",
  custom: "auto_awesome",
  fashion: "checkroom",
  emotion_archetype: "favorite",
  aesthetic: "spa",
  product_showcase: "photo_camera",
  story_theme: "auto_stories",
  resonance: "volunteer_activism",
};

/** 获取策略类型显示标签 */
export function getStrategyTypeLabel(strategyType: ScriptStrategyType): string {
  return STRATEGY_TYPE_LABELS[strategyType] ?? "未标注";
}

/** 获取策略类型简短标签 */
export function getStrategyTypeShortLabel(strategyType: ScriptStrategyType): string {
  return STRATEGY_TYPE_SHORT_LABELS[strategyType] ?? "未知";
}

/** 获取策略类型图标 */
export function getStrategyTypeIcon(strategyType: ScriptStrategyType): string {
  return STRATEGY_TYPE_ICONS[strategyType] ?? "📋";
}
