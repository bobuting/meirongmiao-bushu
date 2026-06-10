/**
 * Prompt 进化提案生成器
 *
 * 接收进化信号，调用 LLM 生成改进版 Prompt 提案。
 */

import type { EvolutionSignal } from "./signal-detector.js";
import type { AppContext } from "../../core/app-context.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import { getLogger } from "../../core/logger/index.js";
import { skillLoader } from "../../services/skills/index.js";
import { requestLlmPlainTextWithMetadata } from "../../services/llm/llm-transport.js";

const logger = getLogger("prompt-evolution-proposal-generator");

const SKILL_CODE_PROPOSAL = "prompt_evolution_proposal";

/** 提案生成依赖（LLM 调用能力） */
export interface ProposalGeneratorDeps {
  ctx: AppContext;
  routeKey: ProviderRouteKey;
  userId: string;
  generateId: () => string;
}

/** LLM 生成的提案结果 */
export interface GeneratedProposal {
  id: string;
  promptCode: string;
  sourceVersion: string;
  proposedContent: string;
  rationale: string;
  signalType: string;
  signalDetails: Record<string, unknown>;
}

/**
 * 为单个信号生成进化提案
 */
export async function generateProposal(
  signal: EvolutionSignal,
  currentPromptContent: string,
  deps: ProposalGeneratorDeps,
): Promise<GeneratedProposal | null> {
  const signalDescription = buildSignalDescription(signal);

  try {
    const { system, user } = await skillLoader.render(SKILL_CODE_PROPOSAL, {
      currentPromptContent,
      qualitySignals: signalDescription,
    });
    const response = await requestLlmPlainTextWithMetadata(
      { id: deps.routeKey, vendor: "gemini", baseUrl: "", model: "", callMode: "openai" as const, timeoutMs: 60_000, secret: "" },
      system,
      user,
      0.3,
      {
        ctx: deps.ctx,
        routeKey: deps.routeKey,
        businessContext: "Prompt 进化提案生成",
        userId: deps.userId,
        timeoutMsOverride: 60_000,
      },
    );
    const parsed = parseProposalResponse(response.text);

    if (!parsed) return null;

    return {
      id: deps.generateId(),
      promptCode: signal.promptCode,
      sourceVersion: signal.promptVersion,
      proposedContent: parsed.proposedContent,
      rationale: parsed.rationale,
      signalType: signal.signalType,
      signalDetails: signal.signalDetails,
    };
  } catch (error) {
    logger.error({ err: error, promptCode: signal.promptCode }, "generateProposal failed");
    return null;
  }
}

/** 构建信号描述文本 */
function buildSignalDescription(signal: EvolutionSignal): string {
  switch (signal.signalType) {
    case "low_avg_score":
      return `**信号类型**：平均评分过低
- 平均分：${signal.currentAvgScore}（阈值：${signal.signalDetails.threshold}）
- 通过率：${Math.round((signal.signalDetails.passRate as number) * 100)}%
- 样本数：${signal.sampleCount}`;

    case "declining_trend":
      return `**信号类型**：评分下降趋势
- 近 ${signal.signalDetails.windowDays} 天平均分：${signal.signalDetails.recentAvg}
- 前 ${signal.signalDetails.windowDays} 天平均分：${signal.signalDetails.previousAvg}
- 下降幅度：${signal.signalDetails.declinePercent}%`;

    case "high_weakness_frequency":
      return `**信号类型**：高频弱项
- 最常见弱项：「${signal.signalDetails.topWeakness}」
- 出现频率：${Math.round((signal.signalDetails.frequency as number) * 100)}%
- 出现次数：${signal.signalDetails.occurrenceCount}/${signal.signalDetails.totalScripts} 个脚本`;

    default:
      return `未知信号类型：${signal.signalType}`;
  }
}

/** 解析 LLM 返回的提案 JSON */
function parseProposalResponse(
  response: string,
): { rationale: string; proposedContent: string } | null {
  const jsonStr = extractJson(response);
  if (!jsonStr) return null;

  try {
    const obj = JSON.parse(jsonStr);
    if (typeof obj.rationale === "string" && typeof obj.proposed_content === "string") {
      return {
        rationale: obj.rationale,
        proposedContent: obj.proposed_content,
      };
    }
    if (typeof obj.rationale === "string" && typeof obj.proposedContent === "string") {
      return {
        rationale: obj.rationale,
        proposedContent: obj.proposedContent,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** 从 markdown 代码块或裸文本中提取 JSON */
function extractJson(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();

  const braceMatch = text.match(/\{[\s\S]*\}/);
  return braceMatch ? braceMatch[0] : null;
}
