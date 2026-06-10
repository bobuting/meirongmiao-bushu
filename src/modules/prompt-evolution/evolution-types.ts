/**
 * Prompt 进化模块类型定义
 */

import type { EvolutionSignalType } from "./signal-detector.js";
import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";

/** 进化提案记录 */
export interface EvolutionProposal {
  id: string;
  promptCode: string;
  sourceVersion: string;
  proposedContent: string;
  rationale: string | null;
  signalType: EvolutionSignalType;
  signalDetails: Record<string, unknown> | null;
  status: ProposalStatus;
  abTestVersion: string | null;
  abTestMetrics: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewNotes: string | null;
}

/** 提案状态 */
export type ProposalStatus = "draft" | "ab_testing" | "published" | "rejected";

/** 进化守护进程配置 */
export interface EvolutionDaemonConfig {
  enabled: boolean;
  intervalMs: number;
  minSampleSize: number;
  lowScoreThreshold: number;
  autoDraft: boolean;
}

/** 进化守护进程依赖 */
export interface EvolutionDaemonDeps {
  repos: PgRepositoryCollection;
  ctx: AppContext;
  resolveLlmPlainText: () => Promise<(sys: string, user: string) => Promise<string>>;
  getPromptContent: (code: string) => Promise<string | null>;
  getOwner: () => Promise<{ id: string }>;
  generateId: () => string;
  now: () => number;
}
