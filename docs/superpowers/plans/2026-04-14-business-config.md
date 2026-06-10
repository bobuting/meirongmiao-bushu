# 业务配置管理模块实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 建立独立的业务配置管理体系，支持按模块分类存储和管理配置

**架构：** 数据库层（PostgreSQL JSONB）→ 仓库层 → 服务层 → API 路由 → 前端页面，模块隔离设计

**技术栈：** TypeScript, Fastify 5, PostgreSQL, React 18, TanStack Query

---

## 文件结构

### 后端（新建）

| 文件 | 职责 |
|------|------|
| `src/contracts/business-config-contract.ts` | 类型定义、验证逻辑、默认值 |
| `src/repositories/pg/business-config-pg-repository.ts` | 数据库 CRUD 操作 |
| `src/modules/business-config-service.ts` | 业务逻辑、配置验证 |
| `src/routes/business-config-routes.ts` | API 路由定义 |

### 前端（新建）

| 文件 | 职责 |
|------|------|
| `apps/web/services/realApi/businessConfig.ts` | API 封装 |
| `apps/web/pages/admin/BusinessConfigManagement.tsx` | 配置管理页面 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/routes/index.ts` | 注册新路由 |
| `src/contracts/services.ts` | 新增服务接口定义 |
| `src/repositories/pg/index.ts` | 导出新仓库 |
| `apps/web/App.tsx` | 新增路由 |
| `apps/web/services/backendApi.ts` | 导出新 API |

---

## 任务 1：数据库表创建

**文件：** 无（直接操作数据库）

- [ ] **步骤 1：创建数据库表**

执行 SQL：

```sql
CREATE TABLE nrm_business_configs (
  module VARCHAR(64) PRIMARY KEY,
  config_json JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  updated_by VARCHAR(64)
);

COMMENT ON TABLE nrm_business_configs IS '业务模块配置表，按模块存储 JSONB 配置';
COMMENT ON COLUMN nrm_business_configs.module IS '模块标识，如 step4_video, step5_publish';
COMMENT ON COLUMN nrm_business_configs.config_json IS '模块配置 JSON';
COMMENT ON COLUMN nrm_business_configs.description IS '模块说明';
COMMENT ON COLUMN nrm_business_configs.created_at IS '创建时间戳（毫秒）';
COMMENT ON COLUMN nrm_business_configs.updated_at IS '更新时间戳（毫秒）';
COMMENT ON COLUMN nrm_business_configs.updated_by IS '最后操作人 ID';
```

- [ ] **步骤 2：插入初始数据**

```sql
INSERT INTO nrm_business_configs (module, config_json, description, created_at, updated_at)
VALUES 
  ('step4_video', '{"batchGenerateCount": 3, "retryCount": 2}', 'Step4 视频生成配置', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000);
```

---

## 任务 2：类型定义和契约

**文件：**
- 创建：`src/contracts/business-config-contract.ts`

- [ ] **步骤 1：创建类型定义文件**

```typescript
/**
 * 业务配置契约
 * 定义各业务模块的配置类型、默认值和验证逻辑
 */

// ============================================================================
// 模块标识
// ============================================================================

/** 支持的业务模块 */
export type BusinessModule = 
  | "step4_video"
  | "step5_publish";

// ============================================================================
// Step4 视频配置
// ============================================================================

/** Step4 视频生成配置 */
export interface Step4VideoConfig {
  /** 每个分镜场景生成的视频变体数量 */
  batchGenerateCount: number;
  /** 单视频生成失败重试次数 */
  retryCount: number;
}

/** Step4 视频配置默认值 */
export const DEFAULT_STEP4_VIDEO_CONFIG: Step4VideoConfig = {
  batchGenerateCount: 3,
  retryCount: 2,
};

/** Step4 视频配置验证 */
export function validateStep4VideoConfig(config: unknown): Step4VideoConfig {
  const obj = config as Record<string, unknown>;
  const result: Step4VideoConfig = { ...DEFAULT_STEP4_VIDEO_CONFIG };

  if (typeof obj.batchGenerateCount === "number") {
    if (!Number.isInteger(obj.batchGenerateCount) || obj.batchGenerateCount < 1 || obj.batchGenerateCount > 10) {
      throw new Error("batchGenerateCount 必须是 1-10 之间的整数");
    }
    result.batchGenerateCount = obj.batchGenerateCount;
  }

  if (typeof obj.retryCount === "number") {
    if (!Number.isInteger(obj.retryCount) || obj.retryCount < 0 || obj.retryCount > 5) {
      throw new Error("retryCount 必须是 0-5 之间的整数");
    }
    result.retryCount = obj.retryCount;
  }

  return result;
}

// ============================================================================
// 模块配置联合类型
// ============================================================================

/** 模块配置映射 */
export interface ModuleConfigMap {
  step4_video: Step4VideoConfig;
  step5_publish: Record<string, never>;
}

/** 模块描述映射 */
export const MODULE_DESCRIPTIONS: Record<BusinessModule, string> = {
  step4_video: "Step4 视频生成配置",
  step5_publish: "Step5 发布配置",
};

/** 模块默认配置 */
export const DEFAULT_MODULE_CONFIGS: ModuleConfigMap = {
  step4_video: DEFAULT_STEP4_VIDEO_CONFIG,
  step5_publish: {},
};

// ============================================================================
// 验证函数映射
// ============================================================================

/** 模块验证函数类型 */
type ConfigValidator<M extends BusinessModule> = (config: unknown) => ModuleConfigMap[M];

/** 模块验证函数映射 */
export const MODULE_VALIDATORS: {
  [M in BusinessModule]: ConfigValidator<M>;
} = {
  step4_video: validateStep4VideoConfig as ConfigValidator<"step4_video">,
  step5_publish: (config: unknown) => config as Record<string, never>,
};

// ============================================================================
// 数据库实体
// ============================================================================

/** 业务配置数据库实体 */
export interface BusinessConfigEntity {
  module: BusinessModule;
  configJson: unknown;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
}

// ============================================================================
// API 响应类型
// ============================================================================

/** 单模块配置响应 */
export interface BusinessConfigResponse<M extends BusinessModule> {
  module: M;
  config: ModuleConfigMap[M];
  updatedAt: number;
  updatedBy: string | null;
}

/** 所有模块配置列表响应 */
export interface BusinessConfigListResponse {
  modules: Array<{
    module: BusinessModule;
    config: unknown;
    description: string | null;
    updatedAt: number;
  }>;
}
```

---

## 任务 3：仓库层

**文件：**
- 创建：`src/repositories/pg/business-config-pg-repository.ts`
- 修改：`src/repositories/pg/index.ts`

- [ ] **步骤 1：创建仓库文件**

```typescript
/**
 * 业务配置 PostgreSQL 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { BusinessModule, BusinessConfigEntity } from "../../contracts/business-config-contract.js";
import { nrm } from "./base-pg-repository.js";

export class PgBusinessConfigRepository {
  private readonly table = nrm("business_configs");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 获取指定模块配置 */
  async findByModule(module: BusinessModule): Promise<BusinessConfigEntity | null> {
    const result = await this.queryClient.query(
      `SELECT module, config_json, description, created_at, updated_at, updated_by
       FROM ${this.table}
       WHERE module = $1
       LIMIT 1`,
      [module],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      module: row.module as BusinessModule,
      configJson: row.config_json,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  /** 获取所有模块配置 */
  async findAll(): Promise<BusinessConfigEntity[]> {
    const result = await this.queryClient.query(
      `SELECT module, config_json, description, created_at, updated_at, updated_by
       FROM ${this.table}
       ORDER BY module`,
    );

    return result.rows.map((row) => ({
      module: row.module as BusinessModule,
      configJson: row.config_json,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));
  }

  /** 更新模块配置（不存在则插入） */
  async upsert(
    module: BusinessModule,
    configJson: unknown,
    updatedBy: string,
  ): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `INSERT INTO ${this.table} (module, config_json, description, created_at, updated_at, updated_by)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6)
       ON CONFLICT (module) DO UPDATE SET
         config_json = EXCLUDED.config_json,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by`,
      [module, JSON.stringify(configJson), null, now, now, updatedBy],
    );
  }
}
```

- [ ] **步骤 2：在 index.ts 中导出**

在 `src/repositories/pg/index.ts` 中添加导出：

```typescript
export { PgBusinessConfigRepository } from "./business-config-pg-repository.js";
```

---

## 任务 4：服务层

**文件：**
- 创建：`src/modules/business-config-service.ts`
- 修改：`src/contracts/services.ts`

- [ ] **步骤 1：创建服务文件**

```typescript
/**
 * 业务配置服务
 */

import type { BusinessModule, ModuleConfigMap, BusinessConfigListResponse } from "../contracts/business-config-contract.js";
import { DEFAULT_MODULE_CONFIGS, MODULE_VALIDATORS, MODULE_DESCRIPTIONS } from "../contracts/business-config-contract.js";
import type { PgBusinessConfigRepository } from "../repositories/pg/business-config-pg-repository.js";
import type { User } from "../contracts/types.js";
import { assertCondition } from "../core/errors.js";

export class BusinessConfigService {
  constructor(
    private readonly configRepo: PgBusinessConfigRepository,
  ) {}

  /** 获取指定模块配置 */
  async getModuleConfig<M extends BusinessModule>(module: M): Promise<ModuleConfigMap[M]> {
    const entity = await this.configRepo.findByModule(module);
    
    if (!entity) {
      // 返回默认配置
      return { ...DEFAULT_MODULE_CONFIGS[module] };
    }

    // 验证并返回
    const validator = MODULE_VALIDATORS[module];
    return validator(entity.configJson);
  }

  /** 更新指定模块配置 */
  async updateModuleConfig<M extends BusinessModule>(
    module: M,
    patch: Partial<ModuleConfigMap[M]>,
    actor: User,
  ): Promise<ModuleConfigMap[M]> {
    // 验证权限
    assertCondition(actor.role === "admin", 403, "FORBIDDEN", "仅管理员可修改配置");

    // 获取当前配置
    const current = await this.getModuleConfig(module);
    
    // 合并更新
    const updated = { ...current, ...patch };
    
    // 验证新配置
    const validator = MODULE_VALIDATORS[module];
    const validated = validator(updated);
    
    // 持久化
    await this.configRepo.upsert(module, validated, actor.id);
    
    return validated;
  }

  /** 获取所有模块配置 */
  async listAllConfigs(): Promise<BusinessConfigListResponse> {
    const entities = await this.configRepo.findAll();
    
    return {
      modules: entities.map((entity) => ({
        module: entity.module,
        config: entity.configJson,
        description: entity.description ?? MODULE_DESCRIPTIONS[entity.module] ?? null,
        updatedAt: entity.updatedAt,
      })),
    };
  }
}
```

- [ ] **步骤 2：在 services.ts 中添加接口定义**

在 `src/contracts/services.ts` 中添加：

```typescript
import type { BusinessConfigService } from "../modules/business-config-service.js";

// 在 IAdminConfigService 后面添加
export type IBusinessConfigService = InstanceType<typeof BusinessConfigService>;
```

---

## 任务 5：API 路由

**文件：**
- 创建：`src/routes/business-config-routes.ts`
- 修改：`src/routes/index.ts`

- [ ] **步骤 1：创建路由文件**

```typescript
/**
 * 业务配置 API 路由
 * 
 * GET  /neirongmiao/api/admin/business-configs/:module  获取指定模块配置
 * PATCH /neirongmiao/api/admin/business-configs/:module  更新指定模块配置
 * GET  /neirongmiao/api/admin/business-configs          获取所有模块配置
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { BusinessModule } from "../contracts/business-config-contract.js";
import { requireUser } from "../services/auth/route-guards.js";
import { assertCondition } from "../core/errors.js";

interface ModuleParams {
  module: BusinessModule;
}

const SUPPORTED_MODULES: BusinessModule[] = ["step4_video", "step5_publish"];

export function registerBusinessConfigRoutes(app: FastifyInstance, ctx: AppContext): void {
  /** 获取所有模块配置 */
  app.get(
    "/neirongmiao/api/admin/business-configs",
    { schema: { tags: ["admin-business-config"] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      assertCondition(user.role === "admin", 403, "FORBIDDEN", "仅管理员可访问");

      const result = await ctx.businessConfigService.listAllConfigs();
      return reply.send(result);
    },
  );

  /** 获取指定模块配置 */
  app.get<{ Params: ModuleParams }>(
    "/neirongmiao/api/admin/business-configs/:module",
    { schema: { tags: ["admin-business-config"] } },
    async (request: FastifyRequest<{ Params: ModuleParams }>, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      assertCondition(user.role === "admin", 403, "FORBIDDEN", "仅管理员可访问");

      const { module } = request.params;
      assertCondition(
        SUPPORTED_MODULES.includes(module),
        400,
        "INVALID_MODULE",
        `不支持的模块: ${module}`,
      );

      const config = await ctx.businessConfigService.getModuleConfig(module);
      return reply.send({ module, config });
    },
  );

  /** 更新指定模块配置 */
  app.patch<{ Params: ModuleParams; Body: Record<string, unknown> }>(
    "/neirongmiao/api/admin/business-configs/:module",
    { schema: { tags: ["admin-business-config"] } },
    async (
      request: FastifyRequest<{ Params: ModuleParams; Body: Record<string, unknown> }>,
      reply: FastifyReply,
    ) => {
      const user = await requireUser(ctx, request);
      assertCondition(user.role === "admin", 403, "FORBIDDEN", "仅管理员可访问");

      const { module } = request.params;
      assertCondition(
        SUPPORTED_MODULES.includes(module),
        400,
        "INVALID_MODULE",
        `不支持的模块: ${module}`,
      );

      const patch = request.body;
      const updated = await ctx.businessConfigService.updateModuleConfig(module, patch, user);
      return reply.send({ module, config: updated });
    },
  );
}
```

- [ ] **步骤 2：在 index.ts 中注册路由**

在 `src/routes/index.ts` 中：

```typescript
import { registerBusinessConfigRoutes } from "./business-config-routes.js";

// 在 otherHandlers 数组中添加
export const otherHandlers = [
  // ... 现有路由
  registerBusinessConfigRoutes,
];
```

---

## 任务 6：AppContext 集成

**文件：**
- 修改：`src/core/app-context.ts`

- [ ] **步骤 1：在 AppContext 中添加服务**

在 `src/core/app-context.ts` 中添加：

```typescript
import type { BusinessConfigService } from "../modules/business-config-service.js";

// 在 AppContext 接口中添加
export interface AppContext {
  // ... 现有字段
  businessConfigService: BusinessConfigService;
}
```

- [ ] **步骤 2：在 app.ts 中初始化服务**

在 `src/app.ts` 中添加服务初始化（在现有服务初始化附近）：

```typescript
import { BusinessConfigService } from "./modules/business-config-service.js";
import { PgBusinessConfigRepository } from "./repositories/pg/business-config-pg-repository.js";

// 在 buildApp 函数中，创建服务实例
const businessConfigRepo = new PgBusinessConfigRepository(pool);
const businessConfigService = new BusinessConfigService(businessConfigRepo);

// 在 AppContext 对象中添加
const ctx: AppContext = {
  // ... 现有字段
  businessConfigService,
};
```

---

## 任务 7：前端 API 封装

**文件：**
- 创建：`apps/web/services/realApi/businessConfig.ts`
- 修改：`apps/web/services/backendApi.ts`

- [ ] **步骤 1：创建 API 封装文件**

```typescript
/**
 * 业务配置 API 封装
 */

import { request } from "./request";

export type BusinessModule = "step4_video" | "step5_publish";

export interface Step4VideoConfig {
  batchGenerateCount: number;
  retryCount: number;
}

export interface BusinessConfigResponse<M extends BusinessModule> {
  module: M;
  config: M extends "step4_video" ? Step4VideoConfig : Record<string, never>;
}

export interface BusinessConfigListResponse {
  modules: Array<{
    module: BusinessModule;
    config: unknown;
    description: string | null;
    updatedAt: number;
  }>;
}

/** 获取指定模块配置 */
export async function businessConfigGet<M extends BusinessModule>(
  token: string,
  module: M,
): Promise<BusinessConfigResponse<M>> {
  const response = await request(
    token,
    `/neirongmiao/api/admin/business-configs/${module}`,
    { method: "GET" },
  );
  return response as BusinessConfigResponse<M>;
}

/** 更新指定模块配置 */
export async function businessConfigPatch<M extends BusinessModule>(
  token: string,
  module: M,
  config: Partial<BusinessConfigResponse<M>["config"]>,
): Promise<BusinessConfigResponse<M>> {
  const response = await request(
    token,
    `/neirongmiao/api/admin/business-configs/${module}`,
    {
      method: "PATCH",
      body: JSON.stringify(config),
    },
  );
  return response as BusinessConfigResponse<M>;
}

/** 获取所有模块配置 */
export async function businessConfigList(
  token: string,
): Promise<BusinessConfigListResponse> {
  const response = await request(
    token,
    "/neirongmiao/api/admin/business-configs",
    { method: "GET" },
  );
  return response as BusinessConfigListResponse;
}
```

- [ ] **步骤 2：在 backendApi.ts 中导出**

在 `apps/web/services/backendApi.ts` 中添加：

```typescript
export * from "./realApi/businessConfig.js";
```

---

## 任务 8：前端页面

**文件：**
- 创建：`apps/web/pages/admin/BusinessConfigManagement.tsx`
- 修改：`apps/web/App.tsx`

- [ ] **步骤 1：创建配置管理页面**

```tsx
/**
 * 业务配置管理页面
 * 独立于系统配置，按模块管理各业务配置参数
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "../../components/Layout";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import {
  businessConfigGet,
  businessConfigPatch,
  businessConfigList,
  type BusinessModule,
  type Step4VideoConfig,
} from "../../services/realApi/businessConfig";

// ============================================================================
// 配置卡片组件
// ============================================================================

interface ConfigCardProps {
  module: BusinessModule;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}

function ConfigCard({
  module,
  title,
  description,
  children,
  onSave,
  onReset,
  saving,
}: ConfigCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onReset} disabled={saving}>
          重置
        </Button>
        <Button onClick={onSave} isLoading={saving}>
          保存
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Step4 视频配置卡片
// ============================================================================

interface Step4VideoConfigCardProps {
  token: string;
}

function Step4VideoConfigCard({ token }: Step4VideoConfigCardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Step4VideoConfig>({
    batchGenerateCount: 3,
    retryCount: 2,
  });

  // 获取配置
  const { data, isLoading } = useQuery({
    queryKey: ["business-config", "step4_video", token],
    queryFn: () => businessConfigGet(token, "step4_video"),
    enabled: Boolean(token),
  });

  // 同步服务器数据到 draft
  React.useEffect(() => {
    if (data?.config) {
      setDraft(data.config);
    }
  }, [data]);

  // 更新配置
  const updateMutation = useMutation({
    mutationFn: (config: Partial<Step4VideoConfig>) =>
      businessConfigPatch(token, "step4_video", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-config", "step4_video"] });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(draft);
  };

  const handleReset = () => {
    setDraft({
      batchGenerateCount: 3,
      retryCount: 2,
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        加载中...
      </div>
    );
  }

  return (
    <ConfigCard
      module="step4_video"
      title="Step4 视频生成"
      description="配置分镜视频生成的批量数量和重试策略"
      onSave={handleSave}
      onReset={handleReset}
      saving={updateMutation.isPending}
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">
          批量生成数量
        </label>
        <p className="mb-2 text-xs text-gray-500">
          每个分镜场景生成的视频变体数量
        </p>
        <input
          type="number"
          min={1}
          max={10}
          value={draft.batchGenerateCount}
          onChange={(e) =>
            setDraft({ ...draft, batchGenerateCount: parseInt(e.target.value) || 1 })
          }
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          重试次数
        </label>
        <p className="mb-2 text-xs text-gray-500">
          单视频生成失败后自动重试次数
        </p>
        <input
          type="number"
          min={0}
          max={5}
          value={draft.retryCount}
          onChange={(e) =>
            setDraft({ ...draft, retryCount: parseInt(e.target.value) || 0 })
          }
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
    </ConfigCard>
  );
}

// ============================================================================
// 主页面组件
// ============================================================================

export const BusinessConfigManagement: React.FC = () => {
  const { token, currentUser } = useAppStore();
  const canAccess = currentUser?.role === "admin" && Boolean(token);

  if (!canAccess) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center bg-gray-50 p-6">
          <div className="mx-auto max-w-3xl border border-red-100 bg-white p-6 text-red-700">
            此页面仅管理员可访问。
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex h-full flex-col bg-gray-50">
        {/* 头部 */}
        <section className="border-b border-gray-200 bg-white px-8 py-5">
          <h1 className="text-2xl font-bold text-gray-900">业务配置管理</h1>
          <p className="mt-1 text-sm text-gray-500">按模块管理各业务配置参数</p>
        </section>

        {/* 配置区域 */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="space-y-6">
            <Step4VideoConfigCard token={token as string} />
            {/* 未来可添加更多模块配置卡片 */}
          </div>
        </div>
      </div>
    </Layout>
  );
};
```

- [ ] **步骤 2：在 App.tsx 中添加路由**

在 `apps/web/App.tsx` 中添加路由：

```tsx
import { BusinessConfigManagement } from "./pages/admin/BusinessConfigManagement";

// 在 admin 路由组中添加
<Route path="/admin/business-config" element={<BusinessConfigManagement />} />
```

---

## 任务 9：编译和测试

**文件：** 无

- [ ] **步骤 1：编译后端**

```bash
npm run build
```

预期：编译成功，无类型错误

- [ ] **步骤 2：编译前端**

```bash
npm run build:ui
```

预期：编译成功，无类型错误

- [ ] **步骤 3：启动后端服务**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

- [ ] **步骤 4：启动前端服务**

```bash
npm --prefix apps/web run dev
```

- [ ] **步骤 5：手动测试**

1. 访问 `http://localhost:3000/admin/business-config`
2. 验证页面能正常加载
3. 修改 step4 视频配置
4. 点击保存，验证配置已更新
5. 刷新页面，验证配置持久化

---

## 任务 10：Commit

- [ ] **步骤 1：提交代码**

```bash
git add .
git commit -m "$(cat <<'EOF'
feat: 新增业务配置管理模块

- 新建 nrm_business_configs 表，按模块存储配置
- 实现后端服务层、仓库层、API 路由
- 实现前端独立配置管理页面
- 支持 step4_video 模块配置管理
EOF
)"
```
