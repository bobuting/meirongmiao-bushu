export interface HotTrendRawTopic {
  id: number;
  label: string;
  url: string;
  trend: "up" | "down" | "flat";
  itemId?: string | null;
  suitability?: "high" | "medium" | "low" | null;
  reason?: string | null;
}

export interface HotTrendVideoFetchGuardSnapshot {
  expectedTopicCount: number;
  initialTopicCount: number;
  finalTopicCount: number;
  fallbackApplied: boolean;
  fallbackStrategy: "none" | "expanded_fetch_then_cache";
  fallbackStep: "none" | "expanded_fetch" | "expanded_fetch_plus_cache";
  fallbackTopicDelta: number;
  passed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface HotTrendRawSection {
  source: string;
  section: string;
  updatedAt: string | null;
  syncedAt?: number;
  nextSyncAt?: number | null;
  intervalMs?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  videoFetchGuard?: HotTrendVideoFetchGuardSnapshot | null;
  topics: HotTrendRawTopic[];
}

export interface HotTrendSyncJobSnapshot {
  id: string;
  trendType: "realtime" | "video";
  source: string;
  dateWindow: string;
  status: "running" | "success" | "failed";
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
  topicCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface HotTrendRawDumpPayload {
  generatedAt: string;
  realtime: HotTrendRawSection;
  video: HotTrendRawSection;
  syncJobs: HotTrendSyncJobSnapshot[];
  config: {
    douyinHotHubRealtimeUrl: string;
    tikhubVideoHotApiUrl: string;
    tikhubRealtimeHotApiUrl: string;
    hotTrendVideoTopN?: number;
    hotTrendVideoExpectedTopicCount?: number;
    hotTrendVideoUnderflowFallbackStrategy?: string;
  };
}

function formatEpoch(epoch?: number | null): string {
  if (!Number.isFinite(epoch)) {
    return "N/A";
  }
  return new Date(Number(epoch)).toISOString();
}

function renderSection(title: string, payload: HotTrendRawSection): string {
  const guardJson =
    payload.videoFetchGuard && typeof payload.videoFetchGuard === "object"
      ? JSON.stringify(payload.videoFetchGuard, null, 2)
      : "null";
  return [
    `## ${title}`,
    "",
    `- source: \`${payload.source}\``,
    `- section: \`${payload.section}\``,
    `- updatedAt: \`${payload.updatedAt ?? "N/A"}\``,
    `- syncedAt: \`${formatEpoch(payload.syncedAt)}\``,
    `- nextSyncAt: \`${formatEpoch(payload.nextSyncAt)}\``,
    `- intervalMs: \`${payload.intervalMs ?? "N/A"}\``,
    `- errorCode: \`${payload.errorCode ?? "none"}\``,
    `- errorMessage: \`${payload.errorMessage ?? "none"}\``,
    `- topicCount: \`${payload.topics.length}\``,
    `- videoFetchGuard: \`${payload.videoFetchGuard ? (payload.videoFetchGuard.passed ? "passed" : "failed") : "n/a"}\``,
    "",
    "```json",
    guardJson,
    "```",
    "",
    "```json",
    JSON.stringify(payload.topics, null, 2),
    "```",
    "",
  ].join("\n");
}

export function buildHotTrendRawDumpMarkdown(payload: HotTrendRawDumpPayload): string {
  const lines: string[] = [];
  lines.push("# Hot Trend Raw Dump");
  lines.push("");
  lines.push(`- generatedAt: \`${payload.generatedAt}\``);
  lines.push(`- realtimeSourceUrl: \`${payload.config.douyinHotHubRealtimeUrl}\``);
  lines.push(`- tikhubVideoHotApiUrl: \`${payload.config.tikhubVideoHotApiUrl}\``);
  lines.push(`- tikhubRealtimeHotApiUrl: \`${payload.config.tikhubRealtimeHotApiUrl}\``);
  lines.push(`- hotTrendVideoTopN: \`${payload.config.hotTrendVideoTopN ?? "N/A"}\``);
  lines.push(`- hotTrendVideoExpectedTopicCount: \`${payload.config.hotTrendVideoExpectedTopicCount ?? "N/A"}\``);
  lines.push(
    `- hotTrendVideoUnderflowFallbackStrategy: \`${payload.config.hotTrendVideoUnderflowFallbackStrategy ?? "N/A"}\``,
  );
  lines.push("");

  lines.push(renderSection("Realtime Trend Raw Payload", payload.realtime));
  lines.push(renderSection("Video Trend Raw Payload", payload.video));

  lines.push("## Recent Sync Jobs");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(payload.syncJobs, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

export const HOT_TREND_RAW_DUMP_REPORT_VERSION = "N23-R5-06.v3";
