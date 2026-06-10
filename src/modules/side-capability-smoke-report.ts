export interface SideCapabilitySmokeSample {
  capability: "video" | "reverse_copy" | "video_reverse" | "hot_billboard";
  scenario: "success" | "failure";
  endpoint: string;
  statusCode: number;
  diagnosticsAttempts: number;
  summary: string;
}

export function buildSideCapabilitySmokeMarkdown(
  samples: SideCapabilitySmokeSample[],
  generatedAtIso: string,
): string {
  const lines: string[] = [];
  lines.push("# 四能力集成联调样例（AT-14-05）");
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- 样例总数: ${samples.length}`);
  lines.push("");
  lines.push("## 样例矩阵");
  lines.push("");
  lines.push("| 能力 | 场景 | 接口 | HTTP | attempts | 摘要 |");
  lines.push("|---|---|---|---:|---:|---|");
  for (const sample of samples) {
    lines.push(
      `| ${sample.capability} | ${sample.scenario} | ${sample.endpoint} | ${sample.statusCode} | ${sample.diagnosticsAttempts} | ${sample.summary.replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  lines.push("## 校验结论");
  lines.push("");
  const grouped = new Map<string, Set<string>>();
  for (const sample of samples) {
    const key = sample.capability;
    const current = grouped.get(key) ?? new Set<string>();
    current.add(sample.scenario);
    grouped.set(key, current);
  }
  for (const [capability, scenarios] of grouped.entries()) {
    const hasSuccess = scenarios.has("success");
    const hasFailure = scenarios.has("failure");
    lines.push(`- ${capability}: success=${hasSuccess ? "yes" : "no"}, failure=${hasFailure ? "yes" : "no"}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
