/**
 * Prompt 进化提案审批 API
 *
 * 管理员可查看 LLM 自动生成的 Prompt 改进提案，
 * 审批后推进到 A/B 测试或直接发布。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { listProposals, getProposal, updateProposalStatus } from "../../modules/prompt-evolution/evolution-daemon.js";
import type { ProposalStatus } from "../../modules/prompt-evolution/evolution-types.js";
import { AppError } from "../../core/errors.js";

const VALID_STATUSES: ProposalStatus[] = ["draft", "ab_testing", "published", "rejected"];

export function registerPromptEvolutionRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // GET /admin/prompt-evolution/proposals — 提案列表
  app.get("/admin/prompt-evolution/proposals", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const query = request.query as { status?: string; limit?: string };
    const status = VALID_STATUSES.includes(query.status as ProposalStatus)
      ? (query.status as ProposalStatus)
      : undefined;
    const limit = query.limit ? Math.min(Number(query.limit), 100) : 50;
    const proposals = await listProposals(ctx.repos, status, limit);
    void admin;
    return { proposals };
  });

  // GET /admin/prompt-evolution/proposals/:id — 单个提案详情
  app.get("/admin/prompt-evolution/proposals/:id", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const proposal = await getProposal(ctx.repos, params.id);
    void admin;
    if (!proposal) return { proposal: null };
    return { proposal };
  });

  // POST /admin/prompt-evolution/proposals/:id/start-ab-test — 开始 A/B 测试
  app.post("/admin/prompt-evolution/proposals/:id/start-ab-test", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as { reviewNotes?: string } | undefined;

    const proposal = await getProposal(ctx.repos, params.id);
    if (!proposal) throw new AppError(404, "PROPOSAL_NOT_FOUND", "Proposal not found");
    if (proposal.status !== "draft") throw new AppError(400, "INVALID_STATUS", "Only draft proposals can start A/B test");

    const abTestVersion = `AB-${Date.now()}`;

    const ok = await updateProposalStatus(ctx.repos, params.id, "ab_testing", {
      reviewedBy: admin.email,
      reviewNotes: body?.reviewNotes,
      abTestVersion,
    });

    return { success: ok, abTestVersion };
  });

  // POST /admin/prompt-evolution/proposals/:id/publish — 批准发布
  app.post("/admin/prompt-evolution/proposals/:id/publish", async (request, reply) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as { reviewNotes?: string } | undefined;

    const proposal = await getProposal(ctx.repos, params.id);
    if (!proposal) throw new AppError(404, "PROPOSAL_NOT_FOUND", "Proposal not found");
    if (proposal.status !== "ab_testing" && proposal.status !== "draft") {
      throw new AppError(400, "INVALID_STATUS", "Only draft or ab_testing proposals can be published");
    }

    // 使用新的 Skills 发布服务
    const promptCode = proposal.prompt_code as string;
    const proposedContent = proposal.proposed_content as string;
    const signalType = proposal.signal_type as string;
    const rationale = proposal.rationale as string || "质量优化";
    const changeSummary = `[自动进化] ${signalType} → ${rationale}`;

    const { publishToSkills } = await import("../../modules/prompt-evolution/skills-publisher.js");
    const publishResult = await publishToSkills(
      promptCode,
      proposedContent,
      changeSummary,
      request.log,
    );

    if (!publishResult.success) {
      throw new AppError(500, "PUBLISH_FAILED", publishResult.error || "Failed to publish to Skills system");
    }

    // 更新提案状态为已发布
    const ok = await updateProposalStatus(ctx.repos, params.id, "published", {
      reviewedBy: admin.email,
      reviewNotes: body?.reviewNotes,
    });

    return {
      success: ok,
      oldVersion: publishResult.oldVersion,
      newVersion: publishResult.newVersion,
      filePath: publishResult.filePath,
    };
  });

  // POST /admin/prompt-evolution/proposals/:id/reject — 拒绝提案
  app.post("/admin/prompt-evolution/proposals/:id/reject", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as { reviewNotes?: string } | undefined;

    const ok = await updateProposalStatus(ctx.repos, params.id, "rejected", {
      reviewedBy: admin.email,
      reviewNotes: body?.reviewNotes,
    });

    return { success: ok };
  });

  // POST /admin/prompt-evolution/detect — 手动触发信号检测
  app.post("/admin/prompt-evolution/detect", async (request) => {
    await requireAdmin(ctx, request);
    const { detectEvolutionSignals } = await import("../../modules/prompt-evolution/signal-detector.js");
    const signals = await detectEvolutionSignals(ctx.repos);
    return { signals, count: signals.length };
  });
}
