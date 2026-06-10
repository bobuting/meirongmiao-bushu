# Provider 密钥表合并实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 `nrm_provider_secrets` 表合并到 `nrm_providers` 表，简化数据模型和代码架构。

**架构：** 在 `nrm_providers` 表新增 `cipher_text` 字段存储加密密钥，删除独立的 `nrm_provider_secrets` 表。所有密钥操作改为直接读写 `nrm_providers.cipher_text`。

**技术栈：** TypeScript, PostgreSQL, Fastify

---

## 文件结构

### 需要修改的文件

| 文件 | 改动类型 | 职责 |
|------|----------|------|
| `src/contracts/types.ts` | 修改 | `ProviderConfig` 新增 `cipherText` 字段，删除 `ProviderSecret` 和 `ProviderSecretView` |
| `src/contracts/repository-ports/provider-repository.ts` | 修改 | 删除 `IProviderSecretRepository` 接口 |
| `src/contracts/repository-ports/index.ts` | 修改 | 删除 `IProviderSecretRepository` 导出 |
| `src/contracts/persistence.ts` | 修改 | 删除 `ProviderSecret` 相关定义 |
| `src/repositories/pg/provider-pg-repository.ts` | 修改 | 新增 `cipher_text` 映射，删除 `PgProviderSecretRepository` 类 |
| `src/repositories/pg/index.ts` | 修改 | 删除 `providerSecrets` 属性 |
| `src/modules/provider-admin-service.ts` | 修改 | 移除 `providerSecrets` 依赖，直接操作 `cipherText` |
| `src/services/llm/provider-resolver.ts` | 修改 | 从 `provider.cipherText` 获取密钥 |
| `src/routes/admin/provider-routes.ts` | 修改 | 从 `provider.cipherText` 获取密钥 |
| `src/routes/admin-library-provider-routes.ts` | 修改 | 删除 `upsertProviderSecret` 路由 |
| `src/core/app-context.ts` | 修改 | 移除 `providerSecrets` 参数 |
| `src/app-setup/credential-resolvers.ts` | 修改 | 从 `provider.cipherText` 获取密钥 |
| `src/modules/hot-trend-sync-config.ts` | 修改 | 从 `provider.cipherText` 获取密钥 |
| `src/modules/deleted-data-cleanup-service.ts` | 修改 | 删除 `provider_secrets` 清理逻辑 |
| `test/app_shell_thin_entry.unit.test.ts` | 修改 | 删除 `upsertProviderSecret` mock |

---

## 任务清单

### 任务 1：数据库迁移 - 添加 cipher_text 字段并迁移数据

**文件：**
- 数据库：`nrm_providers` 表，`nrm_provider_secrets` 表

- [ ] **步骤 1：在 nrm_providers 表添加 cipher_text 字段**

```sql
ALTER TABLE nrm_providers ADD COLUMN cipher_text TEXT DEFAULT NULL;
COMMENT ON COLUMN nrm_providers.cipher_text IS '加密后的 API 密钥';
```

运行命令：
```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE nrm_providers ADD COLUMN IF NOT EXISTS cipher_text TEXT DEFAULT NULL')
  .then(() => { console.log('字段添加成功'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **步骤 2：迁移数据从 nrm_provider_secrets 到 nrm_providers**

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  UPDATE nrm_providers p 
  SET cipher_text = s.cipher_text 
  FROM nrm_provider_secrets s 
  WHERE p.id = s.provider_id AND s.deleted_at IS NULL
\`)
  .then(r => { console.log('迁移了', r.rowCount, '条记录'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **步骤 3：验证数据迁移成功**

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
Promise.all([
  pool.query('SELECT COUNT(*) FROM nrm_providers WHERE cipher_text IS NOT NULL'),
  pool.query('SELECT COUNT(*) FROM nrm_provider_secrets WHERE deleted_at IS NULL')
]).then(([p, s]) => {
  console.log('providers with cipher_text:', p.rows[0].count);
  console.log('provider_secrets:', s.rows[0].count);
  pool.end();
});
"
```

---

### 任务 2：修改类型定义

**文件：**
- 修改：`src/contracts/types.ts`
- 修改：`src/contracts/repository-ports/provider-repository.ts`
- 修改：`src/contracts/repository-ports/index.ts`
- 修改：`src/contracts/persistence.ts`

- [ ] **步骤 1：修改 ProviderConfig 接口，新增 cipherText 字段**

在 `src/contracts/types.ts` 中找到 `ProviderConfig` 接口，在 `accessKey` 字段后添加：

```typescript
export interface ProviderConfig extends SoftDeletable {
  id: string;
  name: string;
  type: ProviderType;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: ProviderCallMode;
  /** 访问标识（如 AWS Access Key ID / 可灵 AccessKey），用于 JWT 认证等场景 */
  accessKey?: string | null;
  /** 加密后的 API 密钥 */
  cipherText?: string | null;
  options?: {
    geminiGroundingEnabled?: boolean;
    geminiFallbackModels?: string[];
  };
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **步骤 2：删除 ProviderSecret 和 ProviderSecretView 接口**

在 `src/contracts/types.ts` 中删除以下代码：

```typescript
// 删除这两个接口
export interface ProviderSecret extends SoftDeletable {
  id: string;
  providerId: string;
  keyHint: string | null;
  cipherText: string;
  regionPrefix: string | null;
  createdAt: number;
}

export interface ProviderSecretView {
  providerId: string;
  cipherText: string;
  updatedAt: number;
}
```

- [ ] **步骤 3：删除 IProviderSecretRepository 接口**

在 `src/contracts/repository-ports/provider-repository.ts` 中：

删除导入：
```typescript
// 删除 ProviderSecret 从导入中
import type { Provider, ProviderRoutingPolicy } from "../types.js";
```

删除接口定义：
```typescript
// 删除整个接口
export interface IProviderSecretRepository {
  findById(id: string): Promise<ProviderSecret | null>;
  findByProviderId(providerId: string): Promise<ProviderSecret | null>;
  upsert(secret: ProviderSecret): Promise<void>;
  delete(id: string): Promise<void>;
}
```

- [ ] **步骤 4：更新 repository-ports/index.ts 导出**

```typescript
// 从
export type { IProviderRepository, IProviderSecretRepository, IProviderPolicyRepository } from "./provider-repository.js";
// 改为
export type { IProviderRepository, IProviderPolicyRepository } from "./provider-repository.js";
```

- [ ] **步骤 5：更新 persistence.ts**

删除 `ProviderSecret` 相关：

```typescript
// 从导入中删除 ProviderSecret
import type {
  User,
  Session,
  // ... 其他类型
  ProviderConfig,
  ProviderRoutingPolicy,
  // 删除: ProviderSecret,
  // ...
} from "./types.js";

// 从 PersistenceSnapshot 中删除 providerSecrets 字段
export interface PersistenceSnapshot {
  // ... 其他字段
  providers: ProviderConfig[];
  // 删除: providerSecrets: ProviderSecret[];
  providerPolicies: ProviderRoutingPolicy[];
  // ...
}
```

- [ ] **步骤 6：编译验证**

```bash
npm run build
```

预期：编译通过

---

### 任务 3：修改 Repository 层

**文件：**
- 修改：`src/repositories/pg/provider-pg-repository.ts`
- 修改：`src/repositories/pg/index.ts`

- [ ] **步骤 1：修改 PgProviderRepository 的 mapRow 方法**

在 `src/repositories/pg/provider-pg-repository.ts` 中，找到 `PgProviderRepository.mapRow` 方法：

```typescript
protected mapRow(row: Record<string, unknown>): Provider {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    type: (row.type as Provider["type"]) ?? "llm",
    vendor: row.vendor as Provider["vendor"],
    baseUrl: row.base_url as string,
    model: row.model as string,
    callMode: ((row.call_mode as string) ?? "openai") as Provider["callMode"],
    accessKey: (row.access_key as string) ?? undefined,
    cipherText: row.cipher_text as string | null ?? null,  // 新增
    options: PgBaseRepository.fromJsonb<Provider["options"]>(row.options) ?? undefined,
    enabled: (row.enabled as boolean) ?? true,
    createdAt: row.created_at as number,
    updatedAt: (row.updated_at as number) ?? row.created_at as number,
    deletedAt: row.deleted_at as number | null,
    deletedBy: row.deleted_by as string | null,
  };
}
```

- [ ] **步骤 2：修改 PgProviderRepository 的 mapEntity 方法**

```typescript
protected mapEntity(p: Provider): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    vendor: p.vendor,
    base_url: p.baseUrl,
    model: p.model,
    call_mode: p.callMode,
    access_key: p.accessKey ?? null,
    cipher_text: p.cipherText ?? null,  // 新增
    options: PgBaseRepository.toJsonb(p.options),
    enabled: p.enabled,
    created_at: p.createdAt,
    updated_at: p.updatedAt ?? Date.now(),
    deleted_at: p.deletedAt ?? null,
    deleted_by: p.deletedBy ?? null,
  };
}
```

- [ ] **步骤 3：删除 PgProviderSecretRepository 类**

在 `src/repositories/pg/provider-pg-repository.ts` 中删除整个 `PgProviderSecretRepository` 类（约 80 行代码）。

同时更新导入：
```typescript
// 从
import type { Provider, ProviderSecret, ProviderRoutingPolicy } from "../../contracts/types.js";
import type { IProviderRepository, IProviderSecretRepository, IProviderPolicyRepository } from "../../contracts/repository-ports/provider-repository.js";
// 改为
import type { Provider, ProviderRoutingPolicy } from "../../contracts/types.js";
import type { IProviderRepository, IProviderPolicyRepository } from "../../contracts/repository-ports/provider-repository.js";
```

删除导出：
```typescript
// 从
export { PgProviderRepository, PgProviderSecretRepository, PgProviderPolicyRepository };
// 改为
export { PgProviderRepository, PgProviderPolicyRepository };
```

- [ ] **步骤 4：修改 repositories/pg/index.ts**

删除导入：
```typescript
// 从
import { PgProviderRepository, PgProviderSecretRepository, PgProviderPolicyRepository } from "./provider-pg-repository.js";
// 改为
import { PgProviderRepository, PgProviderPolicyRepository } from "./provider-pg-repository.js";
```

删除 RepositoryCollection 中的属性：
```typescript
export interface RepositoryCollection {
  // ...
  providers: PgProviderRepository;
  // 删除: providerSecrets: PgProviderSecretRepository;
  providerPolicies: PgProviderPolicyRepository;
  // ...
}
```

删除实例化（两处，createRepos 和 withTransaction）：
```typescript
// 删除这行
providerSecrets: new PgProviderSecretRepository(pool),
// 和
providerSecrets: new PgProviderSecretRepository(pool, client),
```

- [ ] **步骤 5：编译验证**

```bash
npm run build
```

预期：有类型错误（因为其他文件还在引用 `providerSecrets`），这是预期的。

---

### 任务 4：修改 ProviderAdminService

**文件：**
- 修改：`src/modules/provider-admin-service.ts`

- [ ] **步骤 1：修改构造函数，移除 providerSecrets 依赖**

```typescript
// 从
import type { IProviderRepository, IProviderSecretRepository, IProviderPolicyRepository } from "../contracts/repository-ports/provider-repository.js";
// 改为
import type { IProviderRepository, IProviderPolicyRepository } from "../contracts/repository-ports/provider-repository.js";

// 构造函数
constructor(
  private readonly repos: {
    providers: IProviderRepository;
    // 删除: providerSecrets: IProviderSecretRepository;
    providerPolicies: IProviderPolicyRepository;
  },
  // ...
)
```

- [ ] **步骤 2：修改 listProviders 方法**

从 `provider.cipherText` 获取密钥，不再查询 secrets 表：

```typescript
async listProviders(actor: User): Promise<Array<ProviderConfig & { hasSecret: boolean; maskedSecret: string | null }>> {
  requireAdmin(actor);
  const allProviders = (await this.repos.providers.list())
    .sort((a, b) => a.createdAt - b.createdAt);
  
  return allProviders.map(provider => {
    if (!provider.cipherText) {
      return { ...provider, hasSecret: false, maskedSecret: null };
    }
    
    let maskedSecret: string | null = null;
    try {
      maskedSecret = maskSecret(decryptSecret(provider.cipherText));
    } catch {
      maskedSecret = "****(需要重新保存)";
    }
    return {
      ...provider,
      hasSecret: true,
      maskedSecret,
    };
  });
}
```

- [ ] **步骤 3：修改 createProvider 方法**

密钥直接存入 provider 表：

```typescript
async createProvider(
  actor: User,
  input: Pick<ProviderConfig, "name" | "type" | "vendor" | "baseUrl" | "model" | "callMode" | "accessKey" | "options"> & { enabled?: boolean; secret?: string },
): Promise<ProviderConfig & { maskedSecret?: string }> {
  // ... 前面的验证代码保持不变 ...

  const provider: ProviderConfig = {
    id: this.clock.generateId(),
    name,
    type: input.type,
    vendor,
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    callMode: input.callMode ?? "openai",
    accessKey: input.accessKey?.trim() || null,
    cipherText: encryptSecret(secret),  // 直接存储加密密钥
    options: normalizeProviderOptions(input.options),
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
  await this.repos.providers.upsert(provider);
  
  // 删除以下代码（不再需要单独存储密钥）
  // await this.repos.providerSecrets.upsert({ ... });
  
  this.auditStore.insertAuditLog({
    id: this.clock.generateId(),
    actorUserId: actor.id,
    action: "provider_created",
    targetId: provider.id,
    meta: { providerType: provider.type },
    createdAt: now,
  });
  
  return { ...provider, maskedSecret: maskSecret(secret) };
}
```

- [ ] **步骤 4：修改 updateProvider 方法**

```typescript
async updateProvider(
  actor: User,
  providerId: string,
  patch: Partial<Pick<ProviderConfig, "name" | "vendor" | "baseUrl" | "model" | "callMode" | "accessKey" | "cipherText" | "options" | "enabled">> & { secret?: string },
): Promise<ProviderConfig & { maskedSecret?: string }> {
  // ... 前面的验证代码保持不变 ...

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
  if (patch.options !== undefined) {
    existing.options = normalizeProviderOptions(patch.options);
  }
  if (patch.enabled !== undefined) {
    existing.enabled = patch.enabled;
  }
  
  let maskedSecret: string | undefined;
  if (patch.secret) {
    const secret = patch.secret.trim();
    assertCondition(secret.length >= 8, 400, "SECRET_INVALID", "Secret too short (min 8 characters)");
    existing.cipherText = encryptSecret(secret);  // 直接更新 cipherText
    maskedSecret = maskSecret(secret);
  }
  
  existing.updatedAt = now;
  await this.repos.providers.upsert(existing);
  
  // 删除以下代码
  // await this.repos.providerSecrets.upsert({ ... });
  
  this.auditStore.insertAuditLog({
    id: this.clock.generateId(),
    actorUserId: actor.id,
    action: "provider_updated",
    targetId: existing.id,
    createdAt: now,
  });
  
  return { ...existing, maskedSecret };
}
```

- [ ] **步骤 5：修改 deleteProvider 方法**

```typescript
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
  // 删除: await this.repos.providerSecrets.delete(providerId);
  
  this.auditStore.insertAuditLog({
    id: this.clock.generateId(),
    actorUserId: actor.id,
    action: "provider_deleted",
    targetId: providerId,
    createdAt: this.clock.now(),
  });
}
```

- [ ] **步骤 6：修改 upsertSecret 方法**

改为更新 provider 表的 cipherText：

```typescript
async upsertSecret(actor: User, providerId: string, secret: string): Promise<{ providerId: string; maskedSecret: string }> {
  requireAdmin(actor);
  const provider = await this.repos.providers.findById(providerId);
  assertCondition(Boolean(provider), 404, "NOT_FOUND", "Provider not found");
  const normalized = secret.trim();
  assertCondition(normalized.length >= 8, 400, "SECRET_INVALID", "Secret too short");
  const now = this.clock.now();
  
  // 直接更新 provider 的 cipherText
  provider!.cipherText = encryptSecret(normalized);
  provider!.updatedAt = now;
  await this.repos.providers.upsert(provider!);
  
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
```

- [ ] **步骤 7：编译验证**

```bash
npm run build
```

---

### 任务 5：修改 Provider Resolver

**文件：**
- 修改：`src/services/llm/provider-resolver.ts`

- [ ] **步骤 1：修改 resolveRouteProvider 函数**

从 `provider.cipherText` 获取密钥：

```typescript
export async function resolveRouteProvider(ctx: AppContext, routeKey: ProviderRouteKey): Promise<ResolvedRouteProvider | null> {
  const policy = (await ctx.repos.providerPolicies.list()).find((item) => item.routeKey === routeKey && item.enabled);
  if (!policy) {
    return null;
  }
  const provider = await ctx.repos.providers.findById(policy.primaryProviderId);
  if (!provider || !provider.enabled) {
    throw new AppError(400, "PROVIDER_POLICY_INVALID", `${routeKey} primary provider unavailable`);
  }
  
  // 改为从 provider.cipherText 获取
  if (!provider.cipherText) {
    throw new AppError(400, "PROVIDER_SECRET_MISSING", `${routeKey} provider secret missing`);
  }
  
  return {
    id: provider.id,
    vendor: provider.vendor,
    baseUrl: provider.baseUrl,
    model: provider.model,
    callMode: provider.callMode,
    accessKey: provider.accessKey || undefined,
    options: provider.options,
    timeoutMs: resolveProviderTimeoutMs(routeKey, policy.timeoutMs, provider),
    secret: decryptSecret(provider.cipherText),
  };
}
```

- [ ] **步骤 2：修改 resolveRouteProviderChain 函数**

```typescript
export async function resolveRouteProviderChain(ctx: AppContext, routeKey: ProviderRouteKey): Promise<ResolvedRouteProvider[]> {
  const policy = (await ctx.repos.providerPolicies.list()).find((item) => item.routeKey === routeKey && item.enabled);
  if (!policy) {
    const single = await resolveRouteProvider(ctx, routeKey);
    return single ? [single] : [];
  }
  const providerIds = [policy.primaryProviderId, ...(policy.fallbackProviderIds ?? [])];
  const seen = new Set<string>();
  const providers: ResolvedRouteProvider[] = [];
  
  for (const providerId of providerIds) {
    const normalizedId = String(providerId ?? "").trim();
    if (!normalizedId || seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    const provider = await ctx.repos.providers.findById(normalizedId);
    if (!provider || !provider.enabled) {
      continue;
    }
    
    // 改为从 provider.cipherText 获取
    if (!provider.cipherText) {
      continue;
    }
    
    providers.push({
      id: provider.id,
      vendor: provider.vendor,
      baseUrl: provider.baseUrl,
      model: provider.model,
      callMode: provider.callMode,
      accessKey: provider.accessKey || undefined,
      options: provider.options,
      timeoutMs: resolveProviderTimeoutMs(routeKey, policy.timeoutMs, provider),
      secret: decryptSecret(provider.cipherText),
    });
  }
  return providers;
}
```

- [ ] **步骤 3：编译验证**

```bash
npm run build
```

---

### 任务 6：修改路由层

**文件：**
- 修改：`src/routes/admin/provider-routes.ts`
- 修改：`src/routes/admin-library-provider-routes.ts`

- [ ] **步骤 1：修改 provider-routes.ts 中的连通性测试**

```typescript
// 在 connectivity-test 路由中
const provider = await ctx.repos.providers.findById(params.providerId);
if (!provider) {
  throw new AppError(404, "NOT_FOUND", "Provider not found");
}

// 改为从 provider 获取
if (!provider.cipherText) {
  throw new AppError(400, "PROVIDER_SECRET_MISSING", "Provider secret missing");
}

const resolvedProvider: ResolvedRouteProvider = {
  id: provider.id,
  vendor: provider.vendor,
  baseUrl: provider.baseUrl,
  model: provider.model,
  callMode: provider.callMode ?? "openai",
  accessKey: provider.accessKey,
  options: provider.options,
  timeoutMs: timeoutDecision.timeoutMs,
  secret: decryptSecret(provider.cipherText),
};
```

- [ ] **步骤 2：修改 provider-routes.ts 中的策略测试**

```typescript
// 在 policy test 路由中
const provider = await ctx.repos.providers.findById(policy.primaryProviderId);
if (!provider) {
  throw new AppError(400, "PROVIDER_MISSING", "Primary provider not found");
}

// 改为从 provider 获取
if (!provider.cipherText) {
  throw new AppError(400, "PROVIDER_SECRET_MISSING", "Provider secret missing");
}

const resolvedProvider: ResolvedRouteProvider = {
  id: provider.id,
  vendor: provider.vendor,
  baseUrl: provider.baseUrl,
  model: provider.model,
  callMode: provider.callMode ?? "openai",
  accessKey: provider.accessKey,
  options: provider.options,
  timeoutMs: policy.timeoutMs,
  secret: decryptSecret(provider.cipherText),
};
```

- [ ] **步骤 3：修改 admin-library-provider-routes.ts**

删除 `upsertProviderSecret` 相关：

```typescript
// 从接口中删除
export interface AdminProviderRouteHandlers {
  readonly listProviders: RouteHandlerMethod;
  readonly createProvider: RouteHandlerMethod;
  readonly updateProvider: RouteHandlerMethod;
  readonly deleteProvider: RouteHandlerMethod;
  // 删除: readonly upsertProviderSecret: RouteHandlerMethod;
}

// 从注册函数中删除
export function registerAdminProviderRoutes(
  app: FastifyInstance,
  handlers: AdminProviderRouteHandlers,
): void {
  app.get("/admin/providers", handlers.listProviders);
  app.post("/admin/providers", handlers.createProvider);
  app.patch("/admin/providers/:providerId", handlers.updateProvider);
  app.delete("/admin/providers/:providerId", handlers.deleteProvider);
  // 删除: app.put("/admin/providers/:providerId/secret", handlers.upsertProviderSecret);
}
```

- [ ] **步骤 4：编译验证**

```bash
npm run build
```

---

### 任务 7：修改 Context 和 Credential Resolvers

**文件：**
- 修改：`src/core/app-context.ts`
- 修改：`src/app-setup/credential-resolvers.ts`
- 修改：`src/modules/hot-trend-sync-config.ts`

- [ ] **步骤 1：修改 app-context.ts**

```typescript
// 找到 ProviderAdminService 实例化
const providerAdminService: IProviderAdminService = new ProviderAdminService(
  {
    providers: repos.providers,
    // 删除: providerSecrets: repos.providerSecrets,
    providerPolicies: repos.providerPolicies
  },
  clock,
  configService,
  auditStore,
  {
    providerAuditLogDir: options.providerAuditLogDir,
    objectStorageLocalDir: options.objectStorageLocalDir,
  }
);
```

- [ ] **步骤 2：修改 credential-resolvers.ts**

```typescript
export async function resolveTikHubProviderSecret(
  ctx: AppContext,
): Promise<string | null> {
  const providers = [...await ctx.repos.providers.list()]
    .filter((item) => item.enabled)
    .filter((item) => {
      const signature = `${item.name} ${item.vendor} ${item.baseUrl}`.toLowerCase();
      return signature.includes("tikhub");
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  for (const provider of providers) {
    // 改为从 provider.cipherText 获取
    if (!provider.cipherText) {
      continue;
    }
    try {
      const value = decryptSecret(provider.cipherText).trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}
```

- [ ] **步骤 3：修改 hot-trend-sync-config.ts**

```typescript
export async function resolveTikHubProviderSecret(ctx: AppContext): Promise<string | null> {
  const providers = [...await ctx.repos.providers.list()]
    .filter((item) => item.enabled)
    .filter((item) => {
      const signature = `${item.name} ${item.vendor} ${item.baseUrl}`.toLowerCase();
      return signature.includes("tikhub");
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  for (const provider of providers) {
    // 改为从 provider.cipherText 获取
    if (!provider.cipherText) {
      continue;
    }
    try {
      const value = decryptSecret(provider.cipherText).trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}
```

- [ ] **步骤 4：编译验证**

```bash
npm run build
```

---

### 任务 8：修改清理服务

**文件：**
- 修改：`src/modules/deleted-data-cleanup-service.ts`

- [ ] **步骤 1：删除 provider_secrets 表清理**

```typescript
// 从表名联合类型中删除
export type CleanupTableName =
  | "projects"
  | "users"
  // ... 其他表
  | "providers"
  // 删除: | "provider_secrets"
  | "provider_policies"
  | "video_musics";
```

```typescript
// 从 buildCleanupRepos 方法中删除
cleanupRepos.set("providers", repos.providers);
// 删除: cleanupRepos.set("provider_secrets", new ProviderSecretCleanupAdapter(this.pool));
cleanupRepos.set("provider_policies", repos.providerPolicies);
```

- [ ] **步骤 2：删除 ProviderSecretCleanupAdapter 类**

删除整个适配器类：

```typescript
// 删除这个类（约 15 行）
class ProviderSecretCleanupAdapter extends PgSoftDeletableRepository<SoftDeletableEntity> {
  constructor(pool: Pool) {
    super(pool, nrm("provider_secrets"));
  }

  protected mapRow(row: Record<string, unknown>): SoftDeletableEntity {
    return {
      id: row.id as string,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }
}
```

- [ ] **步骤 3：编译验证**

```bash
npm run build
```

---

### 任务 9：修改测试文件

**文件：**
- 修改：`test/app_shell_thin_entry.unit.test.ts`

- [ ] **步骤 1：删除 upsertProviderSecret handler**

在所有出现的地方删除：

```typescript
// 从 handler 对象中删除
adminProviders: {
  listProviders: createHandler(),
  createProvider: createHandler(),
  updateProvider: createHandler(),
  deleteProvider: createHandler(),
  // 删除: upsertProviderSecret: createHandler(),
},
```

- [ ] **步骤 2：运行测试验证**

```bash
npm test
```

---

### 任务 10：删除数据库表

**文件：**
- 数据库：`nrm_provider_secrets` 表

- [ ] **步骤 1：确认所有功能正常后，删除 nrm_provider_secrets 表**

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('DROP TABLE IF EXISTS nrm_provider_secrets')
  .then(() => { console.log('表已删除'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **步骤 2：最终编译和测试验证**

```bash
npm run build && npm run build:ui && npm test
```

预期：全部通过

---

## 验收标准

- [ ] 所有编译通过（后端 `npm run build`，前端 `npm run build:ui`）
- [ ] 所有测试通过（`npm test`）
- [ ] Provider 管理界面正常显示和编辑
- [ ] LLM 调用正常工作
- [ ] 密钥存储在 `nrm_providers.cipher_text` 字段
- [ ] `nrm_provider_secrets` 表已删除

---

## 回滚方案

如果出现问题，可以从备份恢复：

```bash
# 1. 恢复 nrm_provider_secrets 表（如果有备份）
# 2. 将 cipher_text 数据迁移回 nrm_provider_secrets
# 3. 回滚代码变更
```
