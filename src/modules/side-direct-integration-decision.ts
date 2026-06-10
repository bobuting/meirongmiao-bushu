export interface SideIntegrationMetric {
  capability: "video" | "reverse_copy" | "video_reverse" | "hot_billboard";
  successRate: number;
  failureRate: number;
  p95LatencyMs: number;
}

export interface SideDirectIntegrationThreshold {
  minSuccessRate: number;
  maxFailureRate: number;
  maxP95LatencyMs: number;
}

export interface SideDirectIntegrationDecision {
  triggerDirectIntegration: boolean;
  threshold: SideDirectIntegrationThreshold;
  metrics: SideIntegrationMetric[];
  violations: Array<{
    capability: SideIntegrationMetric["capability"];
    reasons: string[];
  }>;
}

export const DEFAULT_SIDE_DIRECT_THRESHOLD: SideDirectIntegrationThreshold = {
  minSuccessRate: 0.92,
  maxFailureRate: 0.08,
  maxP95LatencyMs: 8_000,
};

function toRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function toLatency(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(value));
}

export function evaluateSideDirectIntegrationDecision(
  metrics: SideIntegrationMetric[],
  threshold: SideDirectIntegrationThreshold = DEFAULT_SIDE_DIRECT_THRESHOLD,
): SideDirectIntegrationDecision {
  const violations: SideDirectIntegrationDecision["violations"] = [];
  for (const metric of metrics) {
    const reasons: string[] = [];
    if (toRate(metric.successRate) < threshold.minSuccessRate) {
      reasons.push(
        `successRate=${toRate(metric.successRate).toFixed(3)} < minSuccessRate=${threshold.minSuccessRate.toFixed(3)}`,
      );
    }
    if (toRate(metric.failureRate) > threshold.maxFailureRate) {
      reasons.push(
        `failureRate=${toRate(metric.failureRate).toFixed(3)} > maxFailureRate=${threshold.maxFailureRate.toFixed(3)}`,
      );
    }
    if (toLatency(metric.p95LatencyMs) > threshold.maxP95LatencyMs) {
      reasons.push(`p95LatencyMs=${toLatency(metric.p95LatencyMs)} > maxP95LatencyMs=${threshold.maxP95LatencyMs}`);
    }
    if (reasons.length > 0) {
      violations.push({
        capability: metric.capability,
        reasons,
      });
    }
  }
  return {
    triggerDirectIntegration: violations.length > 0,
    threshold,
    metrics,
    violations,
  };
}

export function buildSideDirectIntegrationDecisionMarkdown(
  decision: SideDirectIntegrationDecision,
  generatedAtIso: string,
): string {
  const lines: string[] = [];
  lines.push("# 直连 side 模块决策门槛（AT-14-06）");
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- 触发直连: ${decision.triggerDirectIntegration ? "YES" : "NO"}`);
  lines.push("");
  lines.push("## 决策阈值");
  lines.push("");
  lines.push(`- minSuccessRate: ${decision.threshold.minSuccessRate}`);
  lines.push(`- maxFailureRate: ${decision.threshold.maxFailureRate}`);
  lines.push(`- maxP95LatencyMs: ${decision.threshold.maxP95LatencyMs}`);
  lines.push("");
  lines.push("## 指标输入");
  lines.push("");
  lines.push("| 能力 | successRate | failureRate | p95LatencyMs |");
  lines.push("|---|---:|---:|---:|");
  for (const metric of decision.metrics) {
    lines.push(
      `| ${metric.capability} | ${metric.successRate.toFixed(3)} | ${metric.failureRate.toFixed(3)} | ${metric.p95LatencyMs} |`,
    );
  }
  lines.push("");
  lines.push("## 违规项");
  lines.push("");
  if (decision.violations.length < 1) {
    lines.push("- 无违规项。维持主项目独立实现，不触发直连 side 模块。");
  } else {
    for (const violation of decision.violations) {
      lines.push(`- ${violation.capability}: ${violation.reasons.join("; ")}`);
    }
    lines.push("- 结论：触发直连 side 模块升级评审。 ");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
