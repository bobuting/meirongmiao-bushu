/**
 * Prompt 进化模块导出
 */

export type {
  EvolutionProposal,
  ProposalStatus,
  EvolutionDaemonConfig,
  EvolutionDaemonDeps,
} from "./evolution-types.js";

export { PromptEvolutionDaemon } from "./evolution-daemon.js";
export { detectEvolutionSignals, DEFAULT_SIGNAL_DETECTOR_CONFIG } from "./signal-detector.js";
export type { EvolutionSignal, EvolutionSignalType, SignalDetectorConfig } from "./signal-detector.js";
export { generateProposal } from "./proposal-generator.js";
export type { ProposalGeneratorDeps, GeneratedProposal } from "./proposal-generator.js";
