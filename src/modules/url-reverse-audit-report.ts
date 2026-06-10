export interface ReverseAttemptAuditItem {
  id: string;
  traceId: string;
  stage: string;
  provider: string;
  status: "success" | "failed";
  reasonCode: string;
  retryable: boolean;
  nextAction: string;
  detail: string | null;
  createdAt: number;
}

export interface ReverseTraceAuditItem {
  traceId: string;
  userId: string;
  projectId: string;
  url: string;
  finalStage: string;
  nextAction: string;
  success: boolean;
  resolvedVideoUrl: string | null;
  updatedAt: number;
}

function truncate(value: string | null, maxLength: number): string {
  if (!value) {
    return "-";
  }
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLength - 3)}...`;
}

export function buildUrlReverseAuditMarkdown(
  attempts: ReverseAttemptAuditItem[],
  traces: ReverseTraceAuditItem[],
  generatedAtIso: string,
): string {
  const totalAttempts = attempts.length;
  const failedAttempts = attempts.filter((item) => item.status === "failed").length;
  const successfulTraces = traces.filter((item) => item.success).length;
  const fallbackTraces = traces.length - successfulTraces;
  const latestAttempts = [...attempts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  const latestTraces = [...traces].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);

  const lines: string[] = [];
  lines.push("# URL 反推链路审计报告");
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- Attempt 数: ${totalAttempts}`);
  lines.push(`- Attempt 失败数: ${failedAttempts}`);
  lines.push(`- Trace 成功数: ${successfulTraces}`);
  lines.push(`- Trace fallback 数: ${fallbackTraces}`);
  lines.push("");

  lines.push("## 最近 Attempt 样本");
  lines.push("");
  lines.push("| Time | Trace | Stage | Provider | Status | Reason | Next | Detail |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const item of latestAttempts) {
    lines.push(
      `| ${new Date(item.createdAt).toISOString()} | ${item.traceId} | ${item.stage} | ${item.provider} | ${item.status} | ${item.reasonCode} | ${item.nextAction} | ${truncate(item.detail, 180)} |`,
    );
  }
  if (latestAttempts.length < 1) {
    lines.push("| - | - | - | - | - | - | - | - |");
  }

  lines.push("");
  lines.push("## 最近 Trace 样本");
  lines.push("");
  lines.push("| Time | Trace | Project | URL | Success | Final Stage | Next | Resolved Video |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const item of latestTraces) {
    lines.push(
      `| ${new Date(item.updatedAt).toISOString()} | ${item.traceId} | ${item.projectId} | ${truncate(item.url, 100)} | ${item.success ? "yes" : "no"} | ${item.finalStage} | ${item.nextAction} | ${truncate(item.resolvedVideoUrl, 120)} |`,
    );
  }
  if (latestTraces.length < 1) {
    lines.push("| - | - | - | - | - | - | - | - |");
  }

  lines.push("");
  lines.push("## 诊断结论");
  lines.push("");
  lines.push("1. 失败样本必须包含 stage/provider/reason/detail，便于定位链路卡点。");
  lines.push("2. fallback 场景应返回 upstreamSummary，避免“空失败”不可排查。");
  lines.push("3. 若同一 reasonCode 连续高频出现，优先修该 stage 的凭据/协议配置。");
  lines.push("");

  return `${lines.join("\n")}\n`;
}
