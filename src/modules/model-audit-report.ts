import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type ProviderAuditStatus = "success" | "error" | "timeout";

export interface ProviderAuditRecord {
  auditId: string;
  createdAt: string;
  providerId: string;
  providerName: string | null;
  providerType: string | null;
  vendor: string | null;
  baseUrl: string | null;
  model: string | null;
  routeKey: string;
  status: ProviderAuditStatus;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary: string | null;
  responseSummary: string | null;
}

interface GenerateModelAuditReportInput {
  logDir: string;
  outDir: string;
  nowMs?: number;
  windowHours?: number;
  maxFailureSamples?: number;
}

interface GenerateModelAuditReportResult {
  outputPath: string;
  records: number;
  providers: number;
}

const LOG_FILE_RE = /^(\d{8})-(\d{4})\.jsonl$/i;

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) {
    return null;
  }
  return new Date(stamp).toISOString();
}

function parseSlotStartMs(fileName: string): number | null {
  const matched = fileName.match(LOG_FILE_RE);
  if (!matched) {
    return null;
  }
  const datePart = matched[1];
  const hourPart = matched[2];
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6));
  const day = Number(datePart.slice(6, 8));
  const hour = Number(hourPart.slice(0, 2));
  if (![year, month, day, hour].every((item) => Number.isFinite(item))) {
    return null;
  }
  return Date.UTC(year, month - 1, day, hour, 0, 0, 0);
}

function parseProviderAuditRecord(line: string): ProviderAuditRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  const statusValue = String(raw.status ?? "").trim().toLowerCase();
  if (statusValue !== "success" && statusValue !== "error" && statusValue !== "timeout") {
    return null;
  }

  const createdAt = toIsoTimestamp(raw.createdAt);
  const providerId = toNullableString(raw.providerId);
  const routeKey = toNullableString(raw.routeKey);
  const auditId = toNullableString(raw.auditId) ?? `${providerId ?? "unknown"}-${createdAt ?? "unknown"}`;
  if (!createdAt || !providerId || !routeKey) {
    return null;
  }

  return {
    auditId,
    createdAt,
    providerId,
    providerName: toNullableString(raw.providerName),
    providerType: toNullableString(raw.providerType),
    vendor: toNullableString(raw.vendor),
    baseUrl: toNullableString(raw.baseUrl),
    model: toNullableString(raw.model),
    routeKey,
    status: statusValue as ProviderAuditStatus,
    latencyMs: Math.max(0, Math.floor(toNumber(raw.latencyMs, 0))),
    errorCode: toNullableString(raw.errorCode),
    errorMessage: toNullableString(raw.errorMessage),
    requestSummary: toNullableString(raw.requestSummary),
    responseSummary: toNullableString(raw.responseSummary),
  };
}

function readAuditRecords(logDir: string, sinceMs: number): ProviderAuditRecord[] {
  if (!existsSync(logDir)) {
    return [];
  }
  const files = readdirSync(logDir)
    .filter((name) => LOG_FILE_RE.test(name))
    .map((name) => ({ name, slotMs: parseSlotStartMs(name) }))
    .filter((item): item is { name: string; slotMs: number } => Number.isFinite(item.slotMs))
    .filter((item) => item.slotMs >= sinceMs)
    .sort((a, b) => a.slotMs - b.slotMs);

  const records: ProviderAuditRecord[] = [];
  for (const file of files) {
    const fullPath = join(logDir, file.name);
    const content = readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const record = parseProviderAuditRecord(line);
      if (record) {
        records.push(record);
      }
    }
  }
  records.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return records;
}

function truncate(value: string | null, max: number): string {
  if (!value) {
    return "-";
  }
  if (value.length <= max) {
    return value.replace(/\n/g, " ");
  }
  return `${value.slice(0, max - 3).replace(/\n/g, " ")}...`;
}

export function buildModelAuditMarkdown(
  records: ProviderAuditRecord[],
  options?: {
    generatedAtIso?: string;
    windowHours?: number;
    maxFailureSamples?: number;
  },
): string {
  const generatedAtIso = options?.generatedAtIso ?? new Date().toISOString();
  const windowHours = Math.max(1, Math.floor(options?.windowHours ?? 48));
  const maxFailureSamples = Math.max(1, Math.floor(options?.maxFailureSamples ?? 20));

  const byProvider = new Map<
    string,
    {
      providerId: string;
      providerName: string | null;
      providerType: string | null;
      vendor: string | null;
      baseUrl: string | null;
      model: string | null;
      total: number;
      success: number;
      error: number;
      timeout: number;
      lastSeenAt: string;
      lastErrorCode: string | null;
      lastErrorMessage: string | null;
    }
  >();

  for (const record of records) {
    const current = byProvider.get(record.providerId) ?? {
      providerId: record.providerId,
      providerName: record.providerName,
      providerType: record.providerType,
      vendor: record.vendor,
      baseUrl: record.baseUrl,
      model: record.model,
      total: 0,
      success: 0,
      error: 0,
      timeout: 0,
      lastSeenAt: record.createdAt,
      lastErrorCode: null,
      lastErrorMessage: null,
    };
    current.total += 1;
    if (record.status === "success") current.success += 1;
    if (record.status === "error") current.error += 1;
    if (record.status === "timeout") current.timeout += 1;
    if (Date.parse(record.createdAt) >= Date.parse(current.lastSeenAt)) {
      current.lastSeenAt = record.createdAt;
      current.providerName = record.providerName ?? current.providerName;
      current.providerType = record.providerType ?? current.providerType;
      current.vendor = record.vendor ?? current.vendor;
      current.baseUrl = record.baseUrl ?? current.baseUrl;
      current.model = record.model ?? current.model;
      current.lastErrorCode = record.errorCode ?? null;
      current.lastErrorMessage = record.errorMessage ?? null;
    }
    byProvider.set(record.providerId, current);
  }

  const providers = [...byProvider.values()].sort((a, b) => b.total - a.total);
  const failures = [...records]
    .filter((item) => item.status !== "success")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, maxFailureSamples);

  const lines: string[] = [];
  lines.push(`# 模型配置与请求审计报告`);
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- 审计窗口: 最近 ${windowHours} 小时`);
  lines.push(`- 总记录数: ${records.length}`);
  lines.push(`- Provider 数量: ${providers.length}`);
  lines.push("");
  lines.push("## Provider 统计");
  lines.push("");
  lines.push("| Provider | ID | Type | Vendor | Base URL | Model | Total | Success | Error | Timeout | Last Error | Last Seen |");
  lines.push("|---|---|---|---|---|---|---:|---:|---:|---:|---|---|");
  for (const item of providers) {
    lines.push(
      `| ${item.providerName ?? "-"} | ${item.providerId} | ${item.providerType ?? "-"} | ${item.vendor ?? "-"} | ${item.baseUrl ?? "-"} | ${item.model ?? "-"} | ${item.total} | ${item.success} | ${item.error} | ${item.timeout} | ${item.lastErrorCode ?? "-"} | ${item.lastSeenAt} |`,
    );
  }
  if (providers.length === 0) {
    lines.push("| - | - | - | - | - | - | 0 | 0 | 0 | 0 | - | - |");
  }

  lines.push("");
  lines.push("## 最近失败样本");
  lines.push("");
  if (failures.length < 1) {
    lines.push("当前窗口内没有失败样本。");
  } else {
    failures.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.createdAt} / ${item.providerName ?? item.providerId}`);
      lines.push(`- routeKey: ${item.routeKey}`);
      lines.push(`- status: ${item.status}`);
      lines.push(`- errorCode: ${item.errorCode ?? "-"}`);
      lines.push(`- errorMessage: ${truncate(item.errorMessage, 600)}`);
      lines.push(`- requestSummary: ${truncate(item.requestSummary, 400)}`);
      lines.push(`- responseSummary: ${truncate(item.responseSummary, 400)}`);
      lines.push("");
    });
  }

  return `${lines.join("\n")}\n`;
}

export function generateModelAuditReport(input: GenerateModelAuditReportInput): GenerateModelAuditReportResult {
  const nowMs = input.nowMs ?? Date.now();
  const windowHours = Math.max(1, Math.floor(input.windowHours ?? 48));
  const maxFailureSamples = Math.max(1, Math.floor(input.maxFailureSamples ?? 20));
  const sinceMs = nowMs - windowHours * 60 * 60 * 1000;

  const logDir = resolve(input.logDir);
  const outDir = resolve(input.outDir);
  const records = readAuditRecords(logDir, sinceMs);
  const stamp = new Date(nowMs).toISOString().replace(/[-:]/g, "").slice(0, 13);
  const outputPath = join(outDir, `model-audit-${stamp}.md`);
  const markdown = buildModelAuditMarkdown(records, {
    generatedAtIso: new Date(nowMs).toISOString(),
    windowHours,
    maxFailureSamples,
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");

  const providerIds = new Set(records.map((item) => item.providerId));
  return {
    outputPath,
    records: records.length,
    providers: providerIds.size,
  };
}
