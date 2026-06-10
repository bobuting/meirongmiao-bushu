import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { IProviderRepository, IProviderSecretRepository, IProviderPolicyRepository } from "../contracts/repository-ports/provider-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { AppConfigService } from "../services/config/app-config-service.js";
import type { IProviderAdminService } from "../contracts/services.js";
import type {
  AuditLog,
  ProviderCallAudit,
  ProviderConfig,
  ProviderRoutingPolicy,
  ProviderType,
  User,
} from "../contracts/types.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import { getLogger } from "../core/logger/index.js";

const logger = getLogger("provider-admin");
import {
  normalizeProviderRoutePolicyConfigDto,
  type ProviderRouteKey,
} from "../contracts/provider-route-policy-contract.js";
import {
  createProviderRouteAuditRecord,
  normalizeProviderExecutionGovernanceConfig,
} from "../contracts/provider-execution-governance-contract.js";
import { assertCondition } from "../core/errors.js";
import { decryptSecret, encryptSecret, maskSecret } from "../core/security.js";
import { resolveObjectStorageLocalRoot } from "../storage/runtime.js";

function requireAdmin(actor: User): void {
  assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
}

function sortPolicies(list: ProviderRoutingPolicy[]): ProviderRoutingPolicy[] {
  return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.routeKey.localeCompare(b.routeKey));
}

function normalizeProviderOptions(
  input: ProviderConfig["options"] | undefined,
): ProviderConfig["options"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const next: NonNullable<ProviderConfig["options"]> = {};
  if (typeof input.geminiGroundingEnabled === "boolean") {
    next.geminiGroundingEnabled = input.geminiGroundingEnabled;
  }
  if (Array.isArray(input.geminiFallbackModels)) {
    const models = [...new Set(input.geminiFallbackModels.map((item) => String(item ?? "").trim()).filter(Boolean))];
    if (models.length > 0) {
      next.geminiFallbackModels = models;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

const FOUR_HOUR_SLOT_MS = 4 * 60 * 60 * 1000;
const PROVIDER_ERROR_LOG_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function resolveProviderErrorLogRoot(options?: {
  providerAuditLogDir?: string | null;
  objectStorageLocalDir?: string | null;
}): string {
  const explicit = options?.providerAuditLogDir?.trim();
  if (explicit) {
    return resolve(explicit);
  }
  const objectStorageRoot = resolveObjectStorageLocalRoot(options?.objectStorageLocalDir ?? undefined);
  return resolve(join(objectStorageRoot, "logs"));
}

function collectFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseSlotTimestampFromFilePath(filePath: string): number | null {
  const name = basename(filePath);
  let parts = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})00(?:-[a-z0-9_-]+)?\.jsonl$/i);
  if (!parts) {
    parts = name.match(/^provider-errors-(\d{4})(\d{2})(\d{2})-(\d{2})00\.jsonl$/i);
  }
  if (!parts) {
    return null;
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour)) {
    return null;
  }
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

export class ProviderAdminService implements IProviderAdminService {
  private readonly providerErrorLogRoot: string;
  private lastProviderErrorLogCleanupAt = 0;

  constructor(
    private readonly repos: {
      providers: IProviderRepository;
      providerSecrets: IProviderSecretRepository;
      providerPolicies: IProviderPolicyRepository;
    },
    private readonly clock: IRepositoryClock,
    private readonly configService: AppConfigService,
    private readonly auditStore: IAuditStore,
    options?: {
      providerAuditLogDir?: string | null;
      objectStorageLocalDir?: string | null;
    },
  ) {
    this.providerErrorLogRoot = resolveProviderErrorLogRoot(options);
  }

  private getProviderErrorLogRetentionDays(): number {
    const raw = Number(this.configService.get().providerErrorLogRetentionDays ?? 10);
    if (!Number.isFinite(raw)) {
      return 10;
    }
    return Math.max(1, Math.min(365, Math.floor(raw)));
  }

  private async writeProviderErrorAuditLog(record: ProviderCallAudit): Promise<void> {
    if (record.status !== "error" && record.status !== "timeout") {
      return;
    }
    const eventTime = Number.isFinite(record.createdAt) ? record.createdAt : this.clock.now();
    const slotStart = Math.floor(eventTime / FOUR_HOUR_SLOT_MS) * FOUR_HOUR_SLOT_MS;
    const slotDate = new Date(slotStart);
    const year = slotDate.getFullYear();
    const month = pad2(slotDate.getMonth() + 1);
    const day = pad2(slotDate.getDate());
    const hour = pad2(slotDate.getHours());
    const slotKey = `${year}${month}${day}-${hour}00`;
    const filePath = join(this.providerErrorLogRoot, `${slotKey}.jsonl`);
    const provider = await this.repos.providers.findById(record.providerId);
    const payload = {
      auditId: record.id,
      createdAt: new Date(eventTime).toISOString(),
      slotStartAt: new Date(slotStart).toISOString(),
      slotKey,
      providerId: record.providerId,
      providerName: provider?.name ?? null,
      providerType: provider?.type ?? null,
      vendor: provider?.vendor ?? null,
      baseUrl: provider?.baseUrl ?? null,
      model: provider?.model ?? null,
      routeKey: record.routeKey,
      requestId: record.requestId ?? null,
      status: record.status,
      latencyMs: record.latencyMs,
      timeoutMs: record.timeoutMs ?? null,
      slowRequest: record.slowRequest ?? null,
      cost: record.cost,
      errorCode: record.errorCode,
      errorMessage: typeof record.errorMessage === "string" ? record.errorMessage.slice(0, 12000) : null,
      requestSummary: typeof record.requestSummary === "string" ? record.requestSummary.slice(0, 12000) : null,
      responseSummary: typeof record.responseSummary === "string" ? record.responseSummary.slice(0, 12000) : null,
    };
    try {
      mkdirSync(this.providerErrorLogRoot, { recursive: true });
      appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
      this.cleanupProviderErrorAuditLogs(eventTime);
    } catch {
      // Provider call audit must not fail because filesystem logging failed.
    }
  }

  private cleanupProviderErrorAuditLogs(now: number): void {
    if (now - this.lastProviderErrorLogCleanupAt < PROVIDER_ERROR_LOG_CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastProviderErrorLogCleanupAt = now;
    const retentionDays = this.getProviderErrorLogRetentionDays();
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    try {
      const files = collectFilesRecursively(this.providerErrorLogRoot);
      for (const filePath of files) {
        const fileName = basename(filePath);
        if (/^provider-errors-\d{8}-\d{4}\.jsonl$/i.test(fileName)) {
          // Legacy nested layout: remove after switching to flat slot filenames.
          unlinkSync(filePath);
          continue;
        }
        const slotTimestamp = parseSlotTimestampFromFilePath(filePath);
        if (slotTimestamp === null) {
          continue;
        }
        if (slotTimestamp < cutoff) {
          unlinkSync(filePath);
        }
      }
    } catch {
      // Ignore cleanup failure to avoid impacting request path.
    }
  }

  async listProviders(actor: User): Promise<Array<ProviderConfig & { hasSecret: boolean; maskedSecret: string | null }>> {
    requireAdmin(actor);
    const allProviders = (await this.repos.providers.list())
      .sort((a, b) => a.createdAt - b.createdAt);
    const result: Array<ProviderConfig & { hasSecret: boolean; maskedSecret: string | null }> = [];
    for (const provider of allProviders) {
      const secret = await this.repos.providerSecrets.findByProviderId(provider.id);
      if (!secret) {
        result.push({ ...provider, hasSecret: false, maskedSecret: null });
        continue;
      }
      let maskedSecret: string | null = null;
      try {
        maskedSecret = maskSecret(decryptSecret(secret.cipherText));
      } catch {
        // Secret was encrypted with an old APP_SECRET_KEY; keep provider visible for migration/update.
        maskedSecret = "****(需要重新保存)";
      }
      result.push({
        ...provider,
        hasSecret: true,
        maskedSecret,
      });
    }
    return result;
  }

  async createProvider(
    actor: User,
    input: Pick<ProviderConfig, "name" | "type" | "vendor" | "baseUrl" | "model" | "callMode" | "accessKey" | "remark" | "options"> & { enabled?: boolean; secret?: string },
  ): Promise<ProviderConfig & { maskedSecret?: string }> {
    requireAdmin(actor);
    const now = this.clock.now();
    const name = input.name.trim();
    const vendor = input.vendor.trim();
    assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Provider name required");
    assertCondition(vendor.length > 0, 400, "VENDOR_REQUIRED", "Provider vendor required");
    assertCondition(input.baseUrl.trim().length > 0, 400, "BASE_URL_REQUIRED", "Provider base url required");
    assertCondition(input.model.trim().length > 0, 400, "MODEL_REQUIRED", "Provider model required");
    /* 密钥必填 */
    const secret = input.secret?.trim() ?? "";
    assertCondition(secret.length >= 8, 400, "SECRET_REQUIRED", "Provider secret is required (min 8 characters)");
    const allProviders = await this.repos.providers.list();
    const duplicate = allProviders.some(
      (provider) =>
        provider.type === input.type &&
        provider.name.toLowerCase() === name.toLowerCase(),
    );
    assertCondition(!duplicate, 409, "PROVIDER_NAME_EXISTS", "Provider name already exists in this category");

    const provider: ProviderConfig = {
      id: this.clock.generateId(),
      name,
      type: input.type,
      vendor,
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      callMode: input.callMode ?? "openai",
      accessKey: input.accessKey?.trim() || null,
      remark: input.remark?.trim() || null,
      options: normalizeProviderOptions(input.options),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.providers.upsert(provider);
    /* 创建 Provider 后一并存储密钥 */
    await this.repos.providerSecrets.upsert({
      id: provider.id,
      providerId: provider.id,
      keyHint: null,
      cipherText: encryptSecret(secret),
      regionPrefix: null,
      createdAt: now,
    });
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_created",
      targetId: provider.id,
      meta: {
        providerType: provider.type,
      },
      createdAt: now,
    });
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_secret_updated",
      targetId: provider.id,
      createdAt: now,
    });
    return { ...provider, maskedSecret: maskSecret(secret) };
  }

  async updateProvider(
    actor: User,
    providerId: string,
    patch: Partial<Pick<ProviderConfig, "name" | "vendor" | "baseUrl" | "model" | "callMode" | "accessKey" | "remark" | "options" | "enabled">> & { secret?: string },
  ): Promise<ProviderConfig & { maskedSecret?: string }> {
    requireAdmin(actor);
    const provider = await this.repos.providers.findById(providerId);
    assertCondition(Boolean(provider), 404, "NOT_FOUND", "Provider not found");
    const existing = provider as ProviderConfig;
    const now = this.clock.now();
    const nextName = patch.name?.trim() ?? existing.name;
    const nextVendor = patch.vendor?.trim() ?? existing.vendor;
    const nextBaseUrl = patch.baseUrl?.trim() ?? existing.baseUrl;
    const nextModel = patch.model?.trim() ?? existing.model;
    assertCondition(nextName.length > 0, 400, "NAME_REQUIRED", "Provider name required");
    assertCondition(nextVendor.length > 0, 400, "VENDOR_REQUIRED", "Provider vendor required");
    assertCondition(nextBaseUrl.length > 0, 400, "BASE_URL_REQUIRED", "Provider base url required");
    assertCondition(nextModel.length > 0, 400, "MODEL_REQUIRED", "Provider model required");
    const allProviders = await this.repos.providers.list();
    const duplicate = allProviders.some(
      (item) =>
        item.id !== providerId &&
        item.type === existing.type &&
        item.name.toLowerCase() === nextName.toLowerCase(),
    );
    assertCondition(!duplicate, 409, "PROVIDER_NAME_EXISTS", "Provider name already exists in this category");

    existing.name = nextName;
    existing.vendor = nextVendor;
    existing.baseUrl = nextBaseUrl;
    existing.model = nextModel;
    if (patch.callMode !== undefined) {
      existing.callMode = patch.callMode;
    }
    if (patch.accessKey !== undefined) {
      existing.accessKey = patch.accessKey?.trim() || null;
    }
    if (patch.remark !== undefined) {
      existing.remark = patch.remark?.trim() || null;
    }
    if (patch.options !== undefined) {
      existing.options = normalizeProviderOptions(patch.options);
    }
    if (patch.enabled !== undefined) {
      existing.enabled = patch.enabled;
    }
    existing.updatedAt = now;
    await this.repos.providers.upsert(existing);
    /* 如果传了密钥则一并更新 */
    let maskedSecret: string | undefined;
    if (patch.secret) {
      const secret = patch.secret.trim();
      assertCondition(secret.length >= 8, 400, "SECRET_INVALID", "Secret too short (min 8 characters)");
      await this.repos.providerSecrets.upsert({
        id: providerId,
        providerId,
        keyHint: null,
        cipherText: encryptSecret(secret),
        regionPrefix: null,
        createdAt: now,
      });
      maskedSecret = maskSecret(secret);
      this.auditStore.insertAuditLog({
        id: this.clock.generateId(),
        actorUserId: actor.id,
        action: "provider_secret_updated",
        targetId: providerId,
        createdAt: now,
      });
    }
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_updated",
      targetId: existing.id,
      createdAt: now,
    });
    return { ...existing, maskedSecret };
  }

  async deleteProvider(actor: User, providerId: string): Promise<void> {
    requireAdmin(actor);
    const provider = await this.repos.providers.findById(providerId);
    assertCondition(Boolean(provider), 404, "NOT_FOUND", "Provider not found");
    const allPolicies = await this.repos.providerPolicies.list();
    const usingPolicy = allPolicies.some(
      (policy) => policy.primaryProviderId === providerId || policy.fallbackProviderIds.includes(providerId),
    );
    assertCondition(!usingPolicy, 409, "POLICY_PROVIDER_IN_USE", "Provider still used by policy");
    await this.repos.providers.delete(providerId);
    await this.repos.providerSecrets.delete(providerId);
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_deleted",
      targetId: providerId,
      createdAt: this.clock.now(),
    });
  }

  async upsertSecret(actor: User, providerId: string, secret: string): Promise<{ providerId: string; maskedSecret: string }> {
    requireAdmin(actor);
    const provider = await this.repos.providers.findById(providerId);
    assertCondition(Boolean(provider), 404, "NOT_FOUND", "Provider not found");
    const normalized = secret.trim();
    assertCondition(normalized.length >= 8, 400, "SECRET_INVALID", "Secret too short");
    const now = this.clock.now();
    // repository 使用 ON CONFLICT (provider_id)，会自动处理插入或更新
    await this.repos.providerSecrets.upsert({
      id: providerId, // id 和 providerId 相同（表结构限制）
      providerId,
      keyHint: null, // 表中没有此字段
      cipherText: encryptSecret(normalized),
      regionPrefix: null, // 表中没有此字段
      createdAt: now,
    });
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_secret_updated",
      targetId: providerId,
      createdAt: now,
    });
    return {
      providerId,
      maskedSecret: maskSecret(normalized),
    };
  }

  async listPolicies(actor: User): Promise<ProviderRoutingPolicy[]> {
    requireAdmin(actor);
    return sortPolicies(await this.repos.providerPolicies.list());
  }

  async createPolicy(
    actor: User,
    input: {
      routeKey: ProviderRouteKey;
      type: ProviderType;
      primaryProviderId: string;
      fallbackProviderIds?: string[];
      timeoutMs?: number;
      retryCount?: number;
      enabled?: boolean;
      description?: string;
    },
  ): Promise<ProviderRoutingPolicy> {
    requireAdmin(actor);
    const normalized = normalizeProviderRoutePolicyConfigDto(input);
    const allPolicies = await this.repos.providerPolicies.list();
    const duplicate = allPolicies.some(
      (policy) => policy.routeKey === normalized.routeKey,
    );
    assertCondition(!duplicate, 409, "ROUTE_POLICY_EXISTS", "Route policy already exists");

    // 校验 primaryProviderId 的 type 与 type 匹配
    const primaryProvider = await this.repos.providers.findById(normalized.primaryProviderId);
    assertCondition(
      Boolean(primaryProvider),
      400,
      "PRIMARY_PROVIDER_INVALID",
      "Primary provider invalid",
    );
    
    assertCondition(
      primaryProvider!.type === normalized.type,
      400,
      "PROVIDER_TYPE_MISMATCH",
      `Primary provider type must be ${normalized.type}`,
    );

    // 校验备用模型类型
    const fallbackProviderIds = [...new Set(normalized.fallbackProviderIds)];
    for (const providerId of fallbackProviderIds) {
      const fb = await this.repos.providers.findById(providerId);
      assertCondition(Boolean(fb), 400, "FALLBACK_PROVIDER_INVALID", "Fallback provider invalid");
      assertCondition(
        fb!.type === normalized.type,
        400,
        "FALLBACK_PROVIDER_TYPE_MISMATCH",
        `Fallback provider type must be ${normalized.type}`,
      );
    }
    const now = this.clock.now();
    const policy: ProviderRoutingPolicy = {
      id: this.clock.generateId(),
      routeKey: normalized.routeKey,
      type: normalized.type,
      primaryProviderId: normalized.primaryProviderId,
      fallbackProviderIds,
      timeoutMs: normalized.timeoutMs,
      retryCount: normalized.retryCount,
      enabled: normalized.enabled,
      description: input.description ?? "",
      sortOrder: 0,
      updatedAt: now,
    };
    await this.repos.providerPolicies.upsert(policy);
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_policy_created",
      targetId: policy.id,
      meta: { routeKey: policy.routeKey },
      createdAt: now,
    });
    return policy;
  }

  async updatePolicy(
    actor: User,
    policyId: string,
    patch: Partial<Pick<ProviderRoutingPolicy, "type" | "primaryProviderId" | "fallbackProviderIds" | "timeoutMs" | "retryCount" | "enabled" | "description" | "sortOrder">>,
  ): Promise<ProviderRoutingPolicy> {
    requireAdmin(actor);
    const policy = await this.repos.providerPolicies.findById(policyId);
    assertCondition(Boolean(policy), 404, "NOT_FOUND", "Policy not found");
    const existing = policy as ProviderRoutingPolicy;
    if (patch.type !== undefined) {
      existing.type = patch.type;
    }
    // 获取当前的 type（可能已更新）用于类型校验
    const expectedType = patch.type ?? existing.type;

    if (patch.primaryProviderId !== undefined) {
      const pp = await this.repos.providers.findById(patch.primaryProviderId);
      assertCondition(Boolean(pp), 400, "PRIMARY_PROVIDER_INVALID", "Primary provider invalid");
      // 校验类型匹配
      assertCondition(
        pp!.type === expectedType,
        400,
        "PROVIDER_TYPE_MISMATCH",
        `Primary provider type must be ${expectedType}`,
      );
      existing.primaryProviderId = patch.primaryProviderId;
    }
    if (patch.fallbackProviderIds !== undefined) {
      const unique = [...new Set(patch.fallbackProviderIds)];
      for (const providerId of unique) {
        const fb = await this.repos.providers.findById(providerId);
        assertCondition(Boolean(fb), 400, "FALLBACK_PROVIDER_INVALID", "Fallback provider invalid");
        assertCondition(
          fb!.type === expectedType,
          400,
          "FALLBACK_PROVIDER_TYPE_MISMATCH",
          `Fallback provider type must be ${expectedType}`,
        );
      }
      existing.fallbackProviderIds = unique;
    }
    if (patch.timeoutMs !== undefined) {
      existing.timeoutMs = Math.max(1000, patch.timeoutMs);
    }
    if (patch.retryCount !== undefined) {
      existing.retryCount = Math.max(0, patch.retryCount);
    }
    if (patch.enabled !== undefined) {
      existing.enabled = patch.enabled;
    }
    if (patch.description !== undefined) {
      existing.description = patch.description;
    }
    if (patch.sortOrder !== undefined) {
      existing.sortOrder = patch.sortOrder;
    }
    existing.updatedAt = this.clock.now();
    await this.repos.providerPolicies.upsert(existing);
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_policy_updated",
      targetId: existing.id,
      createdAt: existing.updatedAt,
    });
    return existing;
  }

  async deletePolicy(actor: User, policyId: string): Promise<void> {
    requireAdmin(actor);
    const exists = await this.repos.providerPolicies.findById(policyId);
    assertCondition(Boolean(exists), 404, "NOT_FOUND", "Policy not found");
    await this.repos.providerPolicies.delete(policyId);
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_policy_deleted",
      targetId: policyId,
      createdAt: this.clock.now(),
    });
  }

  recordCallAudit(
    input: Omit<ProviderCallAudit, "id" | "createdAt"> & {
      createdAt?: number;
      slowRequestThresholdMs?: number;
      // 新增可选参数
      callContext?: string | null;
      messagesJson?: string | null;
      queryParamsJson?: string | null;
      actualModel?: string | null;
      providerVendor?: string | null;
      providerBaseUrl?: string | null;
      actualEndpoint?: string | null;
      requestHeadersJson?: string | null;
      requestBodyJson?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      ttftMs?: number | null;
      projectId?: string | null;
      userId?: string | null;
      asyncJobId?: string | null;
      attemptsJson?: string | null;
      callMode?: ProviderCallAudit["callMode"];
    },
  ): ProviderCallAudit {
    const createdAt =
      typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
        ? Math.floor(input.createdAt)
        : this.clock.now();
    const runtimeConfig = normalizeProviderExecutionGovernanceConfig({
      timeoutMs: input.timeoutMs,
      slowRequestThresholdMs: input.slowRequestThresholdMs,
    });
    const recordId = this.clock.generateId();
    const requestId =
      typeof input.requestId === "string" && input.requestId.trim().length > 0 ? input.requestId.trim() : recordId;
    const normalized = createProviderRouteAuditRecord({
      providerId: input.providerId,
      routeKey: input.routeKey,
      requestId,
      status: input.status,
      latencyMs: input.latencyMs,
      timeoutMs: runtimeConfig.timeoutMs,
      slowRequestThresholdMs: runtimeConfig.slowRequestThresholdMs,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      requestSummary: input.requestSummary,
      responseSummary: input.responseSummary,
      createdAt,
    });
    const record: ProviderCallAudit = {
      id: recordId,
      providerId: normalized.providerId,
      routeKey: normalized.routeKey,
      requestId: normalized.requestId,
      status: normalized.status,
      latencyMs: normalized.latencyMs,
      timeoutMs: normalized.timeoutMs,
      slowRequest: normalized.slowRequest,
      cost: Math.max(0, input.cost),
      errorCode: normalized.errorCode ?? null,
      errorMessage: normalized.errorMessage ?? null,
      requestSummary:
        typeof normalized.requestSummary === "string" && normalized.requestSummary.trim().length > 0
          ? normalized.requestSummary.trim()
          : null,
      responseSummary:
        typeof normalized.responseSummary === "string" && normalized.responseSummary.trim().length > 0
          ? normalized.responseSummary.trim()
          : null,
      createdAt: normalized.createdAt,
      // 新增字段
      callContext: input.callContext ?? null,
      messagesJson: input.messagesJson ?? null,
      queryParamsJson: input.queryParamsJson ?? null,
      actualModel: input.actualModel ?? null,
      providerVendor: input.providerVendor ?? null,
      providerBaseUrl: input.providerBaseUrl ?? null,
      actualEndpoint: input.actualEndpoint ?? null,
      requestHeadersJson: input.requestHeadersJson ?? null,
      requestBodyJson: input.requestBodyJson ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      ttftMs: input.ttftMs ?? null,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      asyncJobId: input.asyncJobId ?? null,
      attemptsJson: input.attemptsJson ?? null,
      callMode: input.callMode ?? null,
    };
    this.auditStore.bufferCallAudit(record);
    // 异步写入错误日志（不阻塞主流程）
    this.writeProviderErrorAuditLog(record).catch((err) => {
      logger.warn({ err, auditId: record.id }, "writeProviderErrorAuditLog 失败");
    });
    return record;
  }

  updateCallAudit(
    input: Partial<Omit<ProviderCallAudit, "createdAt">> & {
      auditId: string;
      slowRequestThresholdMs?: number;
      // 新增可选参数
      callContext?: string | null;
      messagesJson?: string | null;
      queryParamsJson?: string | null;
      actualModel?: string | null;
      providerVendor?: string | null;
      providerBaseUrl?: string | null;
      actualEndpoint?: string | null;
      requestHeadersJson?: string | null;
      requestBodyJson?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      ttftMs?: number | null;
      projectId?: string | null;
      userId?: string | null;
      attemptsJson?: string | null;
      callMode?: ProviderCallAudit["callMode"];
    },
  ): ProviderCallAudit {
    const existing = this.auditStore.getCallAuditFromBuffer(input.auditId);
    if (!existing) {
      return this.recordCallAudit({
        providerId: String(input.providerId ?? "").trim() || "system-default",
        routeKey: input.routeKey as ProviderRouteKey,
        requestId: input.requestId ?? undefined,
        status: input.status ?? "error",
        latencyMs: input.latencyMs ?? 0,
        timeoutMs: input.timeoutMs ?? undefined,
        slowRequestThresholdMs: input.slowRequestThresholdMs,
        cost: input.cost ?? 0,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        requestSummary: input.requestSummary ?? null,
        responseSummary: input.responseSummary ?? null,
        // 新增字段
        callContext: input.callContext ?? null,
        messagesJson: input.messagesJson ?? null,
        queryParamsJson: input.queryParamsJson ?? null,
        actualModel: input.actualModel ?? null,
        providerVendor: input.providerVendor ?? null,
        providerBaseUrl: input.providerBaseUrl ?? null,
        actualEndpoint: input.actualEndpoint ?? null,
        requestHeadersJson: input.requestHeadersJson ?? null,
        requestBodyJson: input.requestBodyJson ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        ttftMs: input.ttftMs ?? null,
        projectId: input.projectId ?? null,
        userId: input.userId ?? null,
        attemptsJson: input.attemptsJson ?? null,
        callMode: input.callMode ?? null,
      });
    }

    const runtimeConfig = normalizeProviderExecutionGovernanceConfig({
      timeoutMs: input.timeoutMs ?? existing.timeoutMs ?? undefined,
      slowRequestThresholdMs: input.slowRequestThresholdMs ?? undefined,
    });
    const normalized = createProviderRouteAuditRecord({
      providerId:
        typeof input.providerId === "string" && input.providerId.trim().length > 0
          ? input.providerId.trim()
          : existing.providerId,
      routeKey: input.routeKey ?? existing.routeKey,
      requestId:
        typeof input.requestId === "string" && input.requestId.trim().length > 0
          ? input.requestId.trim()
          : existing.requestId ?? existing.id,
      status: input.status ?? existing.status,
      latencyMs: typeof input.latencyMs === "number" ? input.latencyMs : existing.latencyMs,
      timeoutMs: runtimeConfig.timeoutMs,
      slowRequestThresholdMs: runtimeConfig.slowRequestThresholdMs,
      errorCode: Object.prototype.hasOwnProperty.call(input, "errorCode") ? input.errorCode : existing.errorCode,
      errorMessage:
        Object.prototype.hasOwnProperty.call(input, "errorMessage") ? input.errorMessage : existing.errorMessage,
      requestSummary:
        Object.prototype.hasOwnProperty.call(input, "requestSummary") ? input.requestSummary : existing.requestSummary,
      responseSummary:
        Object.prototype.hasOwnProperty.call(input, "responseSummary") ? input.responseSummary : existing.responseSummary,
      createdAt: existing.createdAt,
    });

    const record: ProviderCallAudit = {
      id: existing.id,
      providerId: normalized.providerId,
      routeKey: normalized.routeKey,
      requestId: normalized.requestId,
      status: normalized.status,
      latencyMs: normalized.latencyMs,
      timeoutMs: normalized.timeoutMs,
      slowRequest: normalized.slowRequest,
      cost: typeof input.cost === "number" ? Math.max(0, input.cost) : existing.cost,
      errorCode: normalized.errorCode ?? null,
      errorMessage: normalized.errorMessage ?? null,
      requestSummary:
        typeof normalized.requestSummary === "string" && normalized.requestSummary.trim().length > 0
          ? normalized.requestSummary.trim()
          : null,
      responseSummary:
        typeof normalized.responseSummary === "string" && normalized.responseSummary.trim().length > 0
          ? normalized.responseSummary.trim()
          : null,
      createdAt: existing.createdAt,
      // 新增字段：优先使用输入值，否则保留现有值
      callContext: input.callContext ?? existing.callContext ?? null,
      messagesJson: input.messagesJson ?? existing.messagesJson ?? null,
      queryParamsJson: input.queryParamsJson ?? existing.queryParamsJson ?? null,
      actualModel: input.actualModel ?? existing.actualModel ?? null,
      providerVendor: input.providerVendor ?? existing.providerVendor ?? null,
      providerBaseUrl: input.providerBaseUrl ?? existing.providerBaseUrl ?? null,
      actualEndpoint: input.actualEndpoint ?? existing.actualEndpoint ?? null,
      requestHeadersJson: input.requestHeadersJson ?? existing.requestHeadersJson ?? null,
      requestBodyJson: input.requestBodyJson ?? existing.requestBodyJson ?? null,
      inputTokens: input.inputTokens ?? existing.inputTokens ?? null,
      outputTokens: input.outputTokens ?? existing.outputTokens ?? null,
      ttftMs: input.ttftMs ?? existing.ttftMs ?? null,
      projectId: input.projectId ?? existing.projectId ?? null,
      userId: input.userId ?? existing.userId ?? null,
      attemptsJson: input.attemptsJson ?? existing.attemptsJson ?? null,
      callMode: input.callMode ?? existing.callMode ?? null,
    };
    // DEBUG: 打印最终记录
    this.auditStore.updateBufferedCallAudit(record);
    // 异步写入错误日志（不阻塞主流程）
    this.writeProviderErrorAuditLog(record).catch((err) => {
      logger.warn({ err, auditId: record.id }, "writeProviderErrorAuditLog 失败");
    });
    return record;
  }

  /** 追加尝试记录到审计（用于 Provider Chain 重试实时更新） */
  appendCallAuditAttempt(
    input: {
      auditId: string;
      attempt: {
        sequence: number;
        providerId: string;
        model: string;
        paramsSummary: string;
        status: "success" | "error" | "timeout";
        latencyMs: number;
        errorCode: string | null;
        errorMessage: string | null;
        fallbackReason: string | null;
      };
    },
  ): void {
    const existing = this.auditStore.getCallAuditFromBuffer(input.auditId);
    if (!existing) {
      logger.warn({ auditId: input.auditId }, "appendCallAuditAttempt: 审计记录不存在");
      return;
    }

    // 解析现有 attempts
    let attempts: Array<{
      sequence: number;
      providerId: string;
      model: string;
      paramsSummary: string;
      status: "success" | "error" | "timeout";
      latencyMs: number;
      errorCode: string | null;
      errorMessage: string | null;
      fallbackReason: string | null;
    }> = [];
    if (existing.attemptsJson) {
      try {
        attempts = JSON.parse(existing.attemptsJson) as typeof attempts;
      } catch {
        attempts = [];
      }
    }

    // 追加新 attempt
    attempts.push(input.attempt);

    // 更新审计记录
    this.auditStore.updateBufferedCallAudit({
      ...existing,
      attemptsJson: JSON.stringify(attempts),
    });
  }

  async listCallAudits(actor: User, limit = 100): Promise<ProviderCallAudit[]> {
    requireAdmin(actor);
    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    return this.auditStore.listCallAudits(normalizedLimit);
  }

  async listCallAuditsSummary(actor: User, limit = 100): Promise<ProviderCallAudit[]> {
    requireAdmin(actor);
    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    return this.auditStore.listCallAuditsSummary(normalizedLimit);
  }

  async getCallAuditById(actor: User, id: string): Promise<ProviderCallAudit | null> {
    requireAdmin(actor);
    return this.auditStore.findCallAudit(id);
  }

  async clearCallAudits(actor: User): Promise<{ removed: number }> {
    requireAdmin(actor);
    const removed = await this.auditStore.clearCallAudits();
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "provider_call_audits_cleared",
      targetId: "provider-audits",
      meta: { removed },
      createdAt: this.clock.now(),
    });
    return { removed };
  }
}
