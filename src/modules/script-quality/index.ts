/**
 * script-quality 模块入口
 */

export { ScriptQualityScoringDaemon } from "./scoring-daemon.js";
export { DailyScoringScheduler } from "./daily-scoring-scheduler.js";
export { scoreScript } from "./scoring-engine.js";
export { insertScore, getScoreByScriptId, getAverageScoreByStrategy, getScoresByPromptVersion } from "./scoring-repository.js";
export {
  getLibraryScriptScores,
  filterByScore,
  getDeprecatedScriptIds,
  markScriptQualityStatus,
  getWeaknessFeedbackForStrategy,
  buildWeaknessFeedbackPrompt,
} from "./scoring-loop.js";
export type { ScriptQualityStatus } from "./scoring-loop.js";
export type {
  ScoringStrategy,
  ScoringMethod,
  QualityScoreRecord,
  PerspectiveResult,
  ScoringJobInput,
  ScoringDaemonConfig,
  ScoringEngineDeps,
} from "./scoring-types.js";
export { STRATEGY_PROMPT_CODE_MAP } from "./scoring-types.js";
