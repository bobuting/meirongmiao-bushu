/**
 * realApi/modelPreset.ts - 模型预设管理 API 实现
 *
 * v2 改动：
 * - 支持多模型变体
 * - Provider 配置合并存储
 * - 支持功能类型标记
 */

import { request } from "../backendApi.request";

// ============================================================================
// 类型定义
// ============================================================================

/** 模型预设类型 */
export type ModelPresetType = "text" | "image" | "video";

/** 协议类型 */
export type ModelPresetProtocol = "veo" | "doubao" | "jimeng" | "runway" | "openai_compatible" | "gemini";

/** 功能类型 */

// ============================================================================
// 模型变体
// ============================================================================

/** 模型变体：一个预设可包含多个模型 */
export interface ModelVariant {
  /** 模型变体 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 实际调用的模型标识符 */
  modelId: string;
  /** 是否为默认模型 */
  isDefault?: boolean;
  /** 模型能力标签 */
  capabilities?: string[];
  /** 模型描述 */
  description?: string;
}

// ============================================================================
// Provider 配置
// ============================================================================

/** Provider 配置 */
export interface ProviderConfig {
  vendor: string;
  baseUrl: string;
  protocol?: ModelPresetProtocol;
  protocolOptions?: Record<string, unknown>;
  headers?: Record<string, string>;
  authType?: string;
}

// ============================================================================
// 模型预设实体
// ============================================================================

/** 模型预设实体（v2） */
export interface ModelPreset {
  id: string;
  name: string;
  type: ModelPresetType;

  // v2 新字段
  providerConfig: ProviderConfig | null;
  models: ModelVariant[];

  // 兼容旧字段
  vendor: string;
  baseUrl: string;
  model: string;
  protocol: ModelPresetProtocol | null;
  protocolOptions: Record<string, unknown> | null;

  // 通用字段
  options: Record<string, unknown> | null;
  description: string | null;
  sortOrder: number;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// 创建/更新输入
// ============================================================================

/** 创建预设输入 */
export interface CreateModelPresetInput {
  name: string;
  type: ModelPresetType;

  // v2 新字段
  providerConfig?: ProviderConfig;
  models?: ModelVariant[];

  // 兼容旧字段
  vendor?: string;
  baseUrl?: string;
  model?: string;
  protocol?: ModelPresetProtocol;
  protocolOptions?: Record<string, unknown>;

  // 通用字段
  options?: Record<string, unknown>;
  description?: string;
  sortOrder?: number;
  isEnabled?: boolean;
}

/** 更新预设输入 */
export interface UpdateModelPresetInput {
  name?: string;

  // v2 新字段
  providerConfig?: ProviderConfig | null;
  models?: ModelVariant[];
  // 兼容旧字段
  vendor?: string;
  baseUrl?: string;
  model?: string;
  protocol?: ModelPresetProtocol | null;
  protocolOptions?: Record<string, unknown> | null;

  // 通用字段
  options?: Record<string, unknown> | null;
  description?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
}

// ============================================================================
// 其他类型
// ============================================================================

/** Provider 配置（用于切换返回） */
export interface ProviderConfigRecord {
  id: string;
  name: string;
  type: ModelPresetType;
  vendor: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 路由策略 */
export interface ProviderRoutingPolicy {
  id: string;
  routeKey: string;
  primaryProviderId: string | null;
  fallbackProviderIds: string[];
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 智能切换结果 */
export interface SwitchPrimaryResult {
  ok: boolean;
  policy: ProviderRoutingPolicy;
  created: boolean;
  provider?: ProviderConfigRecord;
}

// ============================================================================
// API 方法
// ============================================================================

/** 模型预设 API */
export const modelPresetApi = {
  /** 获取预设列表 */
  list(token: string, type?: ModelPresetType): Promise<{ presets: ModelPreset[] }> {
    const query = type ? `?type=${type}` : "";
    return request("GET", `/admin/model-presets${query}`, { token });
  },

  /** 获取单个预设 */
  get(token: string, id: string): Promise<{ preset: ModelPreset }> {
    return request("GET", `/admin/model-presets/${id}`, { token });
  },

  /** 创建预设 */
  create(token: string, input: CreateModelPresetInput): Promise<ModelPreset> {
    return request("POST", "/admin/model-presets", { token, body: input });
  },

  /** 更新预设 */
  update(token: string, id: string, input: UpdateModelPresetInput): Promise<ModelPreset> {
    return request("PATCH", `/admin/model-presets/${id}`, { token, body: input });
  },

  /** 删除预设 */
  delete(token: string, id: string): Promise<{ ok: boolean }> {
    return request("DELETE", `/admin/model-presets/${id}`, { token });
  },

  /** 智能切换主模型 */
  switchPrimary(
    token: string,
    policyId: string,
    payload: { newProviderId?: string; createFromPreset?: string; presetSecret?: string; modelId?: string },
  ): Promise<SwitchPrimaryResult> {
    return request("POST", `/admin/provider-policies/${policyId}/switch-primary`, {
      token,
      body: payload,
    });
  },
};