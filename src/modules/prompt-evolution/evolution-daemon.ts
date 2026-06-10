/**
 * Prompt 进化守护进程
 *
 * 定期检测质量信号，自动生成改进提案（status=draft），
 * 等待管理员审批后推进到 A/B 测试或发布。
 */

import type { FastifyBaseLogger } from "fastify";
import type { EvolutionDaemonConfig, EvolutionDaemonDeps, ProposalStatus } from "./evolution-types.js";
import type { EvolutionSignal } from "./signal-detector.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import { detectEvolutionSignals, DEFAULT_SIGNAL_DETECTOR_CONFIG } from "./signal-detector.js";
import { generateProposal } from "./proposal-generator.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";

export class PromptEvolutionDaemon {
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;
  private _running = false;

  /** 运行状态（定时器是否活跃） */
  get running(): boolean {
    return this.timer !== undefined;
  }

  constructor(
    private readonly deps: EvolutionDaemonDeps,
    private readonly config: EvolutionDaemonConfig,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.intervalMs = config.intervalMs;
  }

  start(): void {
    this.logger.info(`[EvolutionDaemon] started (interval=${this.intervalMs / 1000}s)`);
    this.scheduleNextRun();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("[EvolutionDaemon] stopped");
  }

  async runOnce(): Promise<number> {
    if (this._running) return 0;
    this._running = true;

    try {
      // 1. 检测进化信号
      const signals = await detectEvolutionSignals(this.deps.repos, {
        ...DEFAULT_SIGNAL_DETECTOR_CONFIG,
        minSampleSize: this.config.minSampleSize,
        lowScoreThreshold: this.config.lowScoreThreshold,
      });

      if (signals.length === 0) return 0;

      this.logger.info(`[EvolutionDaemon] detected ${signals.length} evolution signals`);

      // 2. 过滤已存在 draft 提案的信号
      const newSignals = await this.filterExistingProposals(signals);
      if (newSignals.length === 0) return 0;

      // 3. 为每个信号生成提案
      let generated = 0;

      for (const signal of newSignals) {
        if (!this.config.autoDraft) continue;

        const currentContent = await this.deps.getPromptContent(signal.promptCode);
        if (!currentContent) {
          this.logger.warn(`[EvolutionDaemon] prompt ${signal.promptCode} not found, skipping`);
          continue;
        }

        const owner = await this.deps.getOwner();
        const proposal = await generateProposal(signal, currentContent, {
          ctx: this.deps.ctx,
          routeKey: ProviderRouteKeys.PROMPT_EVOLUTION_GENERATION,
          userId: owner.id,
          generateId: this.deps.generateId,
        });

        if (proposal) {
          await this.deps.repos.promptEvolutionProposals.insertProposal({
            id: proposal.id,
            promptCode: proposal.promptCode,
            sourceVersion: proposal.sourceVersion,
            proposedContent: proposal.proposedContent,
            rationale: proposal.rationale,
            signalType: proposal.signalType,
            signalDetails: proposal.signalDetails,
            createdAt: this.deps.now(),
          });
          generated++;
        }
      }

      if (generated > 0) {
        this.logger.info(`[EvolutionDaemon] generated ${generated} proposals`);
      }

      return generated;
    } catch (err) {
      this.logger.error({ err }, "[EvolutionDaemon] runOnce failed");
      return 0;
    } finally {
      this._running = false;
    }
  }

  /** 过滤已有 draft/ab_testing 提案的信号 */
  private async filterExistingProposals(
    signals: EvolutionSignal[],
  ): Promise<EvolutionSignal[]> {
    const codes = signals.map((s) => s.promptCode);
    if (codes.length === 0) return [];

    const existing = await this.deps.repos.promptEvolutionProposals.findExistingByPromptCodes(codes);

    const existingSet = new Set(
      existing.map((r) => `${r.promptCode}|${r.sourceVersion}|${r.signalType}`),
    );

    return signals.filter(
      (s) => !existingSet.has(`${s.promptCode}|${s.promptVersion}|${s.signalType}`),
    );
  }

  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNextRun();
    }, this.intervalMs);
  }
}

// ---------------------------------------------------------------------------
// Repository helpers（路由层共用）
// ---------------------------------------------------------------------------

/** 查询提案列表 */
export async function listProposals(
  repos: PgRepositoryCollection,
  status?: ProposalStatus,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  const records = await repos.promptEvolutionProposals.listProposals(status, limit);
  // 返回原始行格式（兼容现有 API 响应）
  return records as unknown as Array<Record<string, unknown>>;
}

/** 获取单个提案 */
export async function getProposal(
  repos: PgRepositoryCollection,
  id: string,
): Promise<Record<string, unknown> | null> {
  return repos.promptEvolutionProposals.findRawById(id);
}

/** 更新提案状态 */
export async function updateProposalStatus(
  repos: PgRepositoryCollection,
  id: string,
  status: ProposalStatus,
  updates: {
    reviewedBy?: string;
    reviewNotes?: string;
    abTestVersion?: string;
  } = {},
): Promise<boolean> {
  return repos.promptEvolutionProposals.updateProposalStatus(id, status, updates);
}
