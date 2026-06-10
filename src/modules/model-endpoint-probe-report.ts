export type EndpointProbeProviderType = "text" | "image" | "video";

export interface EndpointProbeRunItem {
  providerId: string;
  providerName: string;
  providerType: EndpointProbeProviderType;
  vendor: string;
  baseUrl: string;
  model: string;
  routeKey: string;
  httpStatus: number;
  ok: boolean;
  code: string | null;
  message: string | null;
  sample: string | null;
}

export type EndpointProbeAuditStatus = "success" | "error" | "timeout";

export interface EndpointProbeAuditItem {
  providerId: string;
  routeKey: string;
  status: EndpointProbeAuditStatus;
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary: string | null;
  responseSummary: string | null;
  createdAt: number;
}

export interface BuildModelEndpointProbeMarkdownInput {
  generatedAtIso: string;
  probeItems: EndpointProbeRunItem[];
  latestAudits: EndpointProbeAuditItem[];
  auditsLimit: number;
}

function compact(value: string | null, maxLength = 600): string {
  if (!value) {
    return "-";
  }
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLength - 3)}...`;
}

function keyOf(providerId: string, routeKey: string): string {
  return `${providerId}::${routeKey}`;
}

export function buildModelEndpointProbeMarkdown(input: BuildModelEndpointProbeMarkdownInput): string {
  const probeItems = [...input.probeItems];
  const latestAudits = [...input.latestAudits].sort((a, b) => b.createdAt - a.createdAt);
  const successCount = probeItems.filter((item) => item.ok).length;
  const failedCount = probeItems.length - successCount;
  const auditMap = new Map<string, EndpointProbeAuditItem>();
  for (const audit of latestAudits) {
    const key = keyOf(audit.providerId, audit.routeKey);
    if (!auditMap.has(key)) {
      auditMap.set(key, audit);
    }
  }

  const lines: string[] = [];
  lines.push("# 模型端点联调报告");
  lines.push("");
  lines.push(`- 生成时间: ${input.generatedAtIso}`);
  lines.push(`- 探测 Provider 数: ${probeItems.length}`);
  lines.push(`- 成功: ${successCount}`);
  lines.push(`- 失败: ${failedCount}`);
  lines.push(`- 审计拉取上限: ${input.auditsLimit}`);
  lines.push("");
  lines.push("## 联调结果概览");
  lines.push("");
  lines.push("| Provider | Type | Route | HTTP | Result | Code | Message |");
  lines.push("|---|---|---|---:|---|---|---|");
  for (const item of probeItems) {
    lines.push(
      `| ${item.providerName} | ${item.providerType} | ${item.routeKey} | ${item.httpStatus} | ${item.ok ? "ok" : "fail"} | ${item.code ?? "-"} | ${compact(item.message, 180)} |`,
    );
  }
  if (probeItems.length < 1) {
    lines.push("| - | - | - | 0 | - | - | - |");
  }

  lines.push("");
  lines.push("## 逐端点请求/响应摘要");
  lines.push("");
  if (probeItems.length < 1) {
    lines.push("当前无可探测 Provider。");
  } else {
    for (const item of probeItems) {
      const audit = auditMap.get(keyOf(item.providerId, item.routeKey));
      lines.push(`### ${item.providerName} (${item.routeKey})`);
      lines.push(`- providerId: ${item.providerId}`);
      lines.push(`- vendor: ${item.vendor}`);
      lines.push(`- baseUrl: ${item.baseUrl}`);
      lines.push(`- model: ${item.model}`);
      lines.push(`- probeResult: ${item.ok ? "ok" : "fail"} (http=${item.httpStatus})`);
      lines.push(`- probeSample: ${compact(item.sample, 280)}`);
      if (!audit) {
        lines.push("- audit: 未找到对应调用审计记录");
      } else {
        lines.push(
          `- auditStatus: ${audit.status} (errorCode=${audit.errorCode ?? "-"}, createdAt=${new Date(audit.createdAt).toISOString()})`,
        );
        lines.push(`- requestSummary: ${compact(audit.requestSummary, 900)}`);
        lines.push(`- responseSummary: ${compact(audit.responseSummary, 900)}`);
        lines.push(`- auditErrorMessage: ${compact(audit.errorMessage, 900)}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}
