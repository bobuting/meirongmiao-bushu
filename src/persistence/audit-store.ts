/**
 * 审计数据存储接口与实现
 *
 * 将 auditLogs 和 providerCallAudits 从内存 Map 迁移为直接 PG 操作。
 * 使用传统字段模式存储，不再使用 payload_json。
 *
 * PgAuditStore 通过 Repository 访问数据库（Phase 3 迁移）。
 */
import type { AuditLog, ProviderCallAudit } from "../contracts/types.js";
import type { PgAuditLogRepository } from "../repositories/pg/audit-log-pg-repository.js";
import type { PgProviderCallAuditRepository } from "../repositories/pg/provider-call-audit-pg-repository.js";
import { getLogger } from "../core/logger/index.js";

const logger = getLogger("audit-store");


// ========== 接口定义 ==========

/** 审计日志查询过滤条件 */
export interface AuditLogFilter {
  actorUserId?: string;
  action?: string;
  targetId?: string;
}

/**
 * 审计数据存储接口
 */
export interface IAuditStore {
  insertAuditLog(record: AuditLog): void;
  queryAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]>;
  bufferCallAudit(record: ProviderCallAudit): void;
  getCallAuditFromBuffer(id: string): ProviderCallAudit | null;
  updateBufferedCallAudit(record: ProviderCallAudit): void;
  findCallAudit(id: string): Promise<ProviderCallAudit | null>;
  listCallAudits(limit: number): Promise<ProviderCallAudit[]>;
  listCallAuditsSummary(limit: number): Promise<ProviderCallAudit[]>;
  clearCallAudits(): Promise<number>;
}

// ========== PG 实现 ==========

export class PgAuditStore implements IAuditStore {
  private pendingBuffer = new Map<string, ProviderCallAudit>();

  constructor(
    private readonly auditLogRepo: PgAuditLogRepository,
    private readonly callAuditRepo: PgProviderCallAuditRepository,
  ) {}

  // ---- 审计日志 ----

  insertAuditLog(record: AuditLog): void {
    const metaJson = record.meta ? JSON.stringify(record.meta) : null;
    this.auditLogRepo
      .upsertAuditLog({
        id: record.id,
        actorUserId: record.actorUserId,
        action: record.action,
        targetId: record.targetId,
        createdAt: record.createdAt,
        metaJson,
      })
      .catch((err) => {
        logger.error(err, "insertAuditLog 失败");
      });
  }

  async queryAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> {
    const rows = await this.auditLogRepo.queryLogs(filter);
    return rows.map((row) => {
      let meta: Record<string, unknown> | undefined;
      if (row.meta_json) {
        if (typeof row.meta_json === "string") {
          try {
            meta = JSON.parse(row.meta_json) as Record<string, unknown>;
          } catch {
            meta = undefined;
          }
        } else if (typeof row.meta_json === "object") {
          meta = row.meta_json as Record<string, unknown>;
        }
      }
      return {
        id: row.id as string,
        actorUserId: row.actor_user_id as string,
        action: row.action as string,
        targetId: row.target_id as string,
        createdAt: Number(row.created_at),
        meta,
      };
    });
  }

  // ---- 提供者调用审计 ----

  bufferCallAudit(record: ProviderCallAudit): void {
    this.pendingBuffer.set(record.id, record);
    this.writeCallAuditToPg(record);
  }

  getCallAuditFromBuffer(id: string): ProviderCallAudit | null {
    return this.pendingBuffer.get(id) ?? null;
  }

  updateBufferedCallAudit(record: ProviderCallAudit): void {
    this.pendingBuffer.set(record.id, record);
    this.writeCallAuditToPg(record);
  }

  async findCallAudit(id: string): Promise<ProviderCallAudit | null> {
    const cached = this.pendingBuffer.get(id);
    if (cached) return cached;

    const row = await this.callAuditRepo.findFullById(id);
    if (!row) return null;
    return mapCallAuditRow(row);
  }

  async listCallAudits(limit: number): Promise<ProviderCallAudit[]> {
    const rows = await this.callAuditRepo.listRecent(limit);
    return rows.map(mapCallAuditRow);
  }

  /** 列表摘要（排除大 JSON 字段） */
  async listCallAuditsSummary(limit: number): Promise<ProviderCallAudit[]> {
    const rows = await this.callAuditRepo.listRecentSummary(limit);
    return rows.map(mapCallAuditRow);
  }

  async clearCallAudits(): Promise<number> {
    const count = await this.callAuditRepo.clearAll();
    this.pendingBuffer.clear();
    return count;
  }

  private writeCallAuditToPg(record: ProviderCallAudit): void {
    this.callAuditRepo
      .upsertCallAudit(record as unknown as Record<string, unknown>)
      .catch((err) => {
        logger.error(err, "writeCallAuditToPg 失败");
      });
  }
}

/** 映射 ProviderCallAudit 行 */
function mapCallAuditRow(row: Record<string, unknown>): ProviderCallAudit {
  return {
    id: row.id as string,
    providerId: row.provider_id as string,
    routeKey: row.route_key as ProviderCallAudit["routeKey"],
    requestId: row.request_id as string | null,
    status: row.status as ProviderCallAudit["status"],
    latencyMs: row.latency_ms as number,
    timeoutMs: row.timeout_ms as number | null,
    slowRequest: row.slow_request === true ? true : row.slow_request === false ? false : undefined,
    cost: row.cost as number,
    errorCode: row.error_code as string | null,
    errorMessage: row.error_message as string | null,
    requestSummary: row.request_summary as string | null,
    responseSummary: row.response_summary as string | null,
    createdAt: Number(row.created_at),
    callContext: row.call_context as string | null,
    messagesJson: (row.messages_json ?? null) as string | null,
    queryParamsJson: (row.query_params_json ?? null) as string | null,
    actualModel: (row.actual_model ?? null) as string | null,
    providerVendor: (row.provider_vendor ?? null) as string | null,
    providerBaseUrl: (row.provider_base_url ?? null) as string | null,
    actualEndpoint: (row.actual_endpoint ?? null) as string | null,
    requestHeadersJson: (row.request_headers_json ?? null) as string | null,
    requestBodyJson: (row.request_body_json ?? null) as string | null,
    inputTokens: (row.input_tokens ?? null) as number | null,
    outputTokens: (row.output_tokens ?? null) as number | null,
    ttftMs: (row.ttft_ms ?? null) as number | null,
    projectId: (row.project_id ?? null) as string | null,
    userId: (row.user_id ?? null) as string | null,
    asyncJobId: (row.async_job_id ?? null) as string | null,
    attemptsJson: (row.attempts_json ?? null) as string | null,
    callMode: row.call_mode as ProviderCallAudit["callMode"],
  };
}

// ========== 可升级代理 ==========

export class UpgradableAuditStore implements IAuditStore {
  private inner: IAuditStore;

  constructor(initial: IAuditStore) {
    this.inner = initial;
  }

  upgrade(pgStore: IAuditStore): void {
    this.inner = pgStore;
  }

  insertAuditLog(record: AuditLog): void { this.inner.insertAuditLog(record); }
  queryAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> { return this.inner.queryAuditLogs(filter); }
  bufferCallAudit(record: ProviderCallAudit): void { this.inner.bufferCallAudit(record); }
  getCallAuditFromBuffer(id: string): ProviderCallAudit | null { return this.inner.getCallAuditFromBuffer(id); }
  updateBufferedCallAudit(record: ProviderCallAudit): void { this.inner.updateBufferedCallAudit(record); }
  findCallAudit(id: string): Promise<ProviderCallAudit | null> { return this.inner.findCallAudit(id); }
  listCallAudits(limit: number): Promise<ProviderCallAudit[]> { return this.inner.listCallAudits(limit); }
  listCallAuditsSummary(limit: number): Promise<ProviderCallAudit[]> { return this.inner.listCallAuditsSummary(limit); }
  clearCallAudits(): Promise<number> { return this.inner.clearCallAudits(); }
}

// ========== 内存实现 ==========

export class MemoryAuditStore implements IAuditStore {
  private auditLogsMap = new Map<string, AuditLog>();
  private providerCallAuditsMap = new Map<string, ProviderCallAudit>();

  insertAuditLog(record: AuditLog): void { this.auditLogsMap.set(record.id, record); }

  async queryAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> {
    let results = [...this.auditLogsMap.values()];
    if (filter?.actorUserId) results = results.filter((r) => r.actorUserId === filter.actorUserId);
    if (filter?.action) results = results.filter((r) => r.action === filter.action);
    if (filter?.targetId) results = results.filter((r) => r.targetId === filter.targetId);
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  bufferCallAudit(record: ProviderCallAudit): void { this.providerCallAuditsMap.set(record.id, record); }
  getCallAuditFromBuffer(id: string): ProviderCallAudit | null { return this.providerCallAuditsMap.get(id) ?? null; }
  updateBufferedCallAudit(record: ProviderCallAudit): void { this.providerCallAuditsMap.set(record.id, record); }
  async findCallAudit(id: string): Promise<ProviderCallAudit | null> { return this.providerCallAuditsMap.get(id) ?? null; }
  async listCallAudits(limit: number): Promise<ProviderCallAudit[]> {
    return [...this.providerCallAuditsMap.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(1, Math.min(limit, 500)));
  }
  async listCallAuditsSummary(limit: number): Promise<ProviderCallAudit[]> {
    return this.listCallAudits(limit);
  }
  async clearCallAudits(): Promise<number> {
    const count = this.providerCallAuditsMap.size;
    this.providerCallAuditsMap.clear();
    return count;
  }
}
