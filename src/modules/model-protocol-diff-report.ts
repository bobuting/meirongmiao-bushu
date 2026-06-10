import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type ProtocolLayer = "CONFIG" | "ROUTING" | "PROTOCOL" | "UPSTREAM" | "NETWORK" | "UNKNOWN";

export interface ProtocolAuditRecord {
  auditId: string;
  createdAt: string;
  providerId: string;
  providerName: string | null;
  providerType: string | null;
  vendor: string | null;
  baseUrl: string | null;
  model: string | null;
  routeKey: string;
  status: "success" | "error" | "timeout";
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary: string | null;
  responseSummary: string | null;
}

export interface GenerateProtocolDiffReportInput {
  logDir: string;
  outDir: string;
  nowMs?: number;
  windowHours?: number;
  maxSamples?: number;
}

export interface GenerateProtocolDiffReportResult {
  outputPath: string;
  records: number;
  failures: number;
}

const LOG_FILE_RE = /^(\d{8})-(\d{4})\.jsonl$/i;

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

function parseAuditRecord(line: string): ProtocolAuditRecord | null {
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
  if (!createdAt || !providerId || !routeKey) {
    return null;
  }
  return {
    auditId: toNullableString(raw.auditId) ?? `${providerId}-${createdAt}`,
    createdAt,
    providerId,
    providerName: toNullableString(raw.providerName),
    providerType: toNullableString(raw.providerType),
    vendor: toNullableString(raw.vendor),
    baseUrl: toNullableString(raw.baseUrl),
    model: toNullableString(raw.model),
    routeKey,
    status: statusValue,
    errorCode: toNullableString(raw.errorCode),
    errorMessage: toNullableString(raw.errorMessage),
    requestSummary: toNullableString(raw.requestSummary),
    responseSummary: toNullableString(raw.responseSummary),
  };
}

function readProtocolAuditRecords(logDir: string, sinceMs: number): ProtocolAuditRecord[] {
  if (!existsSync(logDir)) {
    return [];
  }
  const files = readdirSync(logDir)
    .filter((name) => LOG_FILE_RE.test(name))
    .map((name) => ({ name, slotMs: parseSlotStartMs(name) }))
    .filter((item): item is { name: string; slotMs: number } => Number.isFinite(item.slotMs))
    .filter((item) => item.slotMs >= sinceMs)
    .sort((a, b) => a.slotMs - b.slotMs);

  const records: ProtocolAuditRecord[] = [];
  for (const file of files) {
    const fullPath = join(logDir, file.name);
    const content = readFileSync(fullPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const record = parseAuditRecord(line);
      if (record) {
        records.push(record);
      }
    }
  }
  records.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return records;
}

function extractEndpoint(text: string | null): string | null {
  if (!text) {
    return null;
  }
  const matched = text.match(/endpoint=([^;\s]+)/i);
  if (!matched) {
    return null;
  }
  const endpoint = matched[1].trim();
  return endpoint.length > 0 ? endpoint : null;
}

function detectExpectedProtocol(record: ProtocolAuditRecord): "gemini" | "openai_chat" | "openai_image" | "video" | "unknown" {
  const routeKey = record.routeKey.toLowerCase();
  const vendor = (record.vendor ?? "").toLowerCase();
  const baseUrl = (record.baseUrl ?? "").toLowerCase();
  const model = (record.model ?? "").toLowerCase();
  const summary = `${record.requestSummary ?? ""} ${record.errorMessage ?? ""}`.toLowerCase();

  if (routeKey.includes("video")) {
    return "video";
  }
  if (routeKey.includes("image")) {
    if (summary.includes("/images/")) {
      return "openai_image";
    }
    return "openai_image";
  }
  if (vendor.includes("gemini") || vendor.includes("google") || model.includes("gemini") || baseUrl.includes("generativelanguage")) {
    return "gemini";
  }
  if (summary.includes(":generatecontent")) {
    return "gemini";
  }
  if (summary.includes("/chat/completions")) {
    return "openai_chat";
  }
  return routeKey.includes("script") ? "openai_chat" : "unknown";
}

function isProtocolMismatch(record: ProtocolAuditRecord): boolean {
  const endpoint = extractEndpoint(record.errorMessage ?? record.requestSummary);
  if (!endpoint) {
    return false;
  }
  const expected = detectExpectedProtocol(record);
  const lower = endpoint.toLowerCase();
  if (expected === "gemini") {
    return !lower.includes(":generatecontent");
  }
  if (expected === "openai_chat") {
    return !lower.includes("/chat/completions");
  }
  if (expected === "openai_image") {
    return !/\/images\/(generations|edits|compositions)/i.test(lower);
  }
  if (expected === "video") {
    return !lower.includes("/videos/generations");
  }
  return false;
}

export function classifyProtocolLayer(record: ProtocolAuditRecord): ProtocolLayer {
  const code = (record.errorCode ?? "").toLowerCase();
  const message = (record.errorMessage ?? "").toLowerCase();

  if (record.status === "timeout" || /timeout|abort|etimedout|econnreset|enotfound|dns|socket/.test(message)) {
    return "NETWORK";
  }
  if (/provider_policy_missing|provider_secret_missing|provider_policy_invalid|primary_provider_invalid|fallback_provider_invalid/.test(code)) {
    return "CONFIG";
  }
  if (/route|policy|fallback_required/.test(code) && !/provider_policy/.test(code)) {
    return "ROUTING";
  }
  if (isProtocolMismatch(record)) {
    return "PROTOCOL";
  }
  if (/llm_provider_error|image_provider_error|video_provider_error|tikhub|douhot|upstream/.test(code + " " + message)) {
    return "UPSTREAM";
  }
  return "UNKNOWN";
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

export function buildModelProtocolDiffMarkdown(
  records: ProtocolAuditRecord[],
  options?: {
    generatedAtIso?: string;
    windowHours?: number;
    maxSamples?: number;
  },
): string {
  const generatedAtIso = options?.generatedAtIso ?? new Date().toISOString();
  const windowHours = Math.max(1, Math.floor(options?.windowHours ?? 72));
  const maxSamples = Math.max(1, Math.floor(options?.maxSamples ?? 30));
  const failures = records.filter((item) => item.status !== "success");

  const layerBuckets = new Map<ProtocolLayer, ProtocolAuditRecord[]>();
  for (const failure of failures) {
    const layer = classifyProtocolLayer(failure);
    const list = layerBuckets.get(layer) ?? [];
    list.push(failure);
    layerBuckets.set(layer, list);
  }

  const layers: ProtocolLayer[] = ["CONFIG", "ROUTING", "PROTOCOL", "UPSTREAM", "NETWORK", "UNKNOWN"];
  const lines: string[] = [];
  lines.push("# 模型协议差异与分层卡点报告");
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- 审计窗口: 最近 ${windowHours} 小时`);
  lines.push(`- 审计记录数: ${records.length}`);
  lines.push(`- 失败记录数: ${failures.length}`);
  lines.push("");
  lines.push("## 分层统计");
  lines.push("");
  lines.push("| Layer | Count | 说明 |");
  lines.push("|---|---:|---|");
  for (const layer of layers) {
    const count = layerBuckets.get(layer)?.length ?? 0;
    const explain =
      layer === "CONFIG"
        ? "配置/密钥/策略缺失或无效"
        : layer === "ROUTING"
        ? "路由/fallback 链选择异常"
        : layer === "PROTOCOL"
        ? "端点/协议形态与预期不一致"
        : layer === "UPSTREAM"
        ? "供应商服务返回业务错误"
        : layer === "NETWORK"
        ? "网络与超时问题"
        : "无法归类";
    lines.push(`| ${layer} | ${count} | ${explain} |`);
  }

  lines.push("");
  lines.push("## 协议差异样本");
  lines.push("");
  const samples = [...failures]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, maxSamples);
  if (samples.length < 1) {
    lines.push("当前窗口内无失败样本。");
  } else {
    samples.forEach((item, index) => {
      const layer = classifyProtocolLayer(item);
      const endpoint = extractEndpoint(item.errorMessage ?? item.requestSummary);
      const expected = detectExpectedProtocol(item);
      lines.push(`### ${index + 1}. ${item.createdAt} / ${item.providerName ?? item.providerId}`);
      lines.push(`- layer: ${layer}`);
      lines.push(`- routeKey: ${item.routeKey}`);
      lines.push(`- expectedProtocol: ${expected}`);
      lines.push(`- endpoint: ${endpoint ?? "-"}`);
      lines.push(`- errorCode: ${item.errorCode ?? "-"}`);
      lines.push(`- errorMessage: ${truncate(item.errorMessage, 800)}`);
      lines.push(`- requestSummary: ${truncate(item.requestSummary, 800)}`);
      lines.push(`- responseSummary: ${truncate(item.responseSummary, 800)}`);
      lines.push("");
    });
  }

  lines.push("## 修复优先级建议");
  lines.push("");
  lines.push("1. 先清理 CONFIG 层错误（缺 policy/secret/provider），否则后续链路验证无意义。");
  lines.push("2. 再处理 PROTOCOL 层（endpoint/参数/鉴权结构），避免伪成功与协议漂移。");
  lines.push("3. 最后处理 NETWORK 与 UPSTREAM 层（timeout、供应商稳定性与容量）。");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function generateModelProtocolDiffReport(input: GenerateProtocolDiffReportInput): GenerateProtocolDiffReportResult {
  const nowMs = input.nowMs ?? Date.now();
  const windowHours = Math.max(1, Math.floor(input.windowHours ?? 72));
  const maxSamples = Math.max(1, Math.floor(input.maxSamples ?? 30));
  const sinceMs = nowMs - windowHours * 60 * 60 * 1000;
  const logDir = resolve(input.logDir);
  const outDir = resolve(input.outDir);
  const records = readProtocolAuditRecords(logDir, sinceMs);
  const markdown = buildModelProtocolDiffMarkdown(records, {
    generatedAtIso: new Date(nowMs).toISOString(),
    windowHours,
    maxSamples,
  });

  const stamp = new Date(nowMs).toISOString().replace(/[-:]/g, "").slice(0, 13);
  const outputPath = join(outDir, `model-protocol-diff-${stamp}.md`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");

  return {
    outputPath,
    records: records.length,
    failures: records.filter((item) => item.status !== "success").length,
  };
}
