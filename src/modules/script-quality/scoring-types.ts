/**
 * 脚本质量评分类型定义
 */

import type { ScriptStrategyType } from "../../contracts/script.dto.js";

/** 脚本策略类型，复用全局统一定义（排除 new_story，该策略不参与评分） */
export type ScoringStrategy = Exclude<ScriptStrategyType, "new_story">;

/** 评分方法 */
export type ScoringMethod = "llm_multi_perspective" | "rule_based";

/** 质量评分记录 */
export interface QualityScoreRecord {
  id: string;
  scriptDataId: string;
  strategy: ScoringStrategy;
  score: number;
  viewerScore: number | null;
  directorScore: number | null;
  strategistScore: number | null;
  ruleBasedScore: number | null;
  scoringMethod: ScoringMethod;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scoreSpread: number | null;
  promptCode: string | null;
  promptVersion: string | null;
  projectId: string | null;
  userId: string | null;
  llmModel: string | null;
  durationMs: number | null;
  createdAt: number;
}

/** 单视角评估结果 */
export interface PerspectiveResult {
  score: number;
  perspective: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/** 评分任务输入（存入 nrm_async_jobs.input） */
export interface ScoringJobInput {
  scriptDataId: string;
  strategy: ScoringStrategy;
  projectId: string | null;
  userId: string | null;
  promptCode: string | null;
  promptVersion: string | null;
  /** 脚本内容文本（用于 LLM 评估上下文） */
  scriptContent: string;
  scriptTitle: string | null;
  scriptSummary: string | null;
  videoType: string | null;
  videoStyle: string | null;
}

/** 评分守护进程配置 */
export interface ScoringDaemonConfig {
  enabled: boolean;
  /** 轮询间隔（毫秒），默认 10000 */
  intervalMs: number;
  /** 每轮最多处理任务数，默认 5 */
  batchSize: number;
  /** 单次 LLM 调用超时（毫秒），默认 30000 */
  llmTimeoutMs: number;
}

/** 评分引擎依赖 */
export interface ScoringEngineDeps {
  /** 调用 LLM（systemPrompt + userPrompt → 纯文本） */
  requestLlmPlainText: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** 生成唯一 ID */
  generateId: () => string;
}

/** 策略到 prompt code 的映射 */
export const STRATEGY_PROMPT_CODE_MAP: Record<ScoringStrategy, string | null> = {
  library: null,
  video: null,
  realtime: "hot_trend_realtime_generation",
  effectiveness: "script_effectiveness_generation",
  custom: "script_custom_generation",
  fashion: "script_fashion_generation",
  emotion_archetype: null,
  aesthetic: null,
  product_showcase: "script_product_showcase_generation",
  story_theme: "story_theme_generation",
  resonance: "resonance_story_generation",
};
