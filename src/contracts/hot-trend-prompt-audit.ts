export const HOT_TREND_PROMPT_AUDIT_META_KEY = "hotTrendPromptMeta";

export interface HotTrendPromptAuditMeta {
  providerRoute: string;
  promptVersion: string;
  generationMode: "real" | "degraded";
  trendType: "realtime" | "video";
  topN: number;
  promptTemplateBefore: string;
  promptTemplateAfter: string;
  promptRuntime: string;
  auditStage?:
    | "labeling"
    | "hot_trend_expand"
    | "video_hot_trend_multimodal_screen"
    | "video_hot_trend_prompt_b";
  beforeSummary?: string;
  afterSummary?: string;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function encodeHotTrendPromptAuditMeta(meta: HotTrendPromptAuditMeta): string {
  return `${HOT_TREND_PROMPT_AUDIT_META_KEY}=${encodeURIComponent(JSON.stringify(meta))}`;
}

export function extractHotTrendPromptAuditMeta(input: string | null | undefined): HotTrendPromptAuditMeta | null {
  const summary = normalizeText(input);
  if (!summary) {
    return null;
  }
  const match = summary.match(
    new RegExp(`${HOT_TREND_PROMPT_AUDIT_META_KEY}=([^;\\s]+)`, "i"),
  );
  if (!match?.[1]) {
    return null;
  }
  let decoded = "";
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const generationModeRaw = normalizeText(record.generationMode).toLowerCase();
  const generationMode: "real" | "degraded" | null =
    generationModeRaw === "real" || generationModeRaw === "degraded"
      ? generationModeRaw
      : null;
  if (!generationMode) {
    return null;
  }
  const trendTypeRaw = normalizeText(record.trendType).toLowerCase();
  const trendType: "realtime" | "video" | null =
    trendTypeRaw === "realtime" || trendTypeRaw === "video"
      ? trendTypeRaw
      : null;
  if (!trendType) {
    return null;
  }
  const topNRaw = Number(record.topN);
  const topN = Number.isFinite(topNRaw) ? Math.max(1, Math.min(50, Math.floor(topNRaw))) : 1;
  const providerRoute = normalizeText(record.providerRoute);
  const promptVersion = normalizeText(record.promptVersion);
  const promptTemplateBefore = normalizeText(record.promptTemplateBefore);
  const promptTemplateAfter = normalizeText(record.promptTemplateAfter);
  const promptRuntime = normalizeText(record.promptRuntime);
  const auditStageRaw = normalizeText(record.auditStage).toLowerCase();
  const auditStage: HotTrendPromptAuditMeta["auditStage"] =
    auditStageRaw === "labeling" ||
    auditStageRaw === "hot_trend_expand" ||
    auditStageRaw === "video_hot_trend_multimodal_screen" ||
    auditStageRaw === "video_hot_trend_prompt_b"
      ? (auditStageRaw as HotTrendPromptAuditMeta["auditStage"])
      : undefined;
  const beforeSummary = normalizeText(record.beforeSummary ?? record.beforeSample);
  const afterSummary = normalizeText(record.afterSummary ?? record.afterSample);
  if (
    providerRoute.length < 1 ||
    promptVersion.length < 1 ||
    promptTemplateBefore.length < 1 ||
    promptTemplateAfter.length < 1 ||
    promptRuntime.length < 1
  ) {
    return null;
  }
  return {
    providerRoute,
    promptVersion,
    generationMode,
    trendType,
    topN,
    promptTemplateBefore,
    promptTemplateAfter,
    promptRuntime,
    ...(auditStage ? { auditStage } : {}),
    ...(beforeSummary.length > 0 ? { beforeSummary } : {}),
    ...(afterSummary.length > 0 ? { afterSummary } : {}),
  };
}
