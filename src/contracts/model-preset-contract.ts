// src/contracts/model-preset-contract.ts
/**
 * 模型预设类型定义
 * 用于预定义主流模型配置，支持一键创建 Provider
 *
 * v2 改动：
 * - 支持多模型变体（一个预设可包含多个模型）
 * - Provider 配置合并为 providerConfig
 * - 新增支持的功能类型标记
 */
import type { ProviderType } from "./types.js";

// ============================================================================
// 协议类型
// ============================================================================

/** 协议类型：支持多种视频/图像/LLM 协议 */
export type ModelPresetProtocol =
  | "veo"
  | "doubao"
  | "jimeng"
  | "runway"
  | "openai_compatible"
  | "gemini"
  | "dashscope";

// ============================================================================
// 模型变体
// ============================================================================

/** 模型变体：一个预设可包含多个模型 */
export interface ModelVariant {
  /** 模型变体 ID */
  id: string;
  /** 显示名称，如 "VEO 3.1" */
  name: string;
  /** 实际调用的模型标识符 */
  modelId: string;
  /** 是否为该预设的默认模型 */
  isDefault?: boolean;
  /** 模型能力标签，如 ["fast", "high_quality"] */
  capabilities?: string[];
  /** 模型描述 */
  description?: string;
}

// ============================================================================
// Provider 配置
// ============================================================================

/** Provider 配置（合并存储） */
export interface ProviderConfig {
  /** 供应商：yunwu/doubao/jimeng/gemini 等 */
  vendor: string;
  /** API 基础地址 */
  baseUrl: string;
  /** 协议类型 */
  protocol?: ModelPresetProtocol;
  /** 协议特定配置 */
  protocolOptions?: Record<string, unknown>;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 认证类型：bearer/api_key/custom */
  authType?: string;
}

// ============================================================================
// 模型预设实体
// ============================================================================

/** 模型预设实体 */
export interface ModelPreset {
  /** 主键 ID */
  id: string;
  /** 预设名称，如 "云雾 VEO 系列" */
  name: string;
  /** 类型：text/image/video */
  type: ProviderType;

  // ---- 新增字段（v2）----
  /** Provider 配置（合并存储） */
  providerConfig: ProviderConfig | null;
  /** 模型变体列表（一个预设可包含多个模型） */
  models: ModelVariant[];

  // ---- 兼容旧字段（deprecated，保留向后兼容）----
  /** @deprecated 使用 providerConfig.vendor 代替 */
  vendor: string;
  /** @deprecated 使用 providerConfig.baseUrl 代替 */
  baseUrl: string;
  /** @deprecated 使用 models[0].modelId 代替 */
  model: string;
  /** @deprecated 使用 providerConfig.protocol 代替 */
  protocol: ModelPresetProtocol | null;
  /** @deprecated 使用 providerConfig.protocolOptions 代替 */
  protocolOptions: Record<string, unknown> | null;

  // ---- 通用字段 ----
  /** 可选配置（如 geminiGroundingEnabled） */
  options: Record<string, unknown> | null;
  /** 预设描述 */
  description: string | null;
  /** 排序权重 */
  sortOrder: number;
  /** 是否启用 */
  isEnabled: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

// ============================================================================
// 创建/更新输入
// ============================================================================

/** 创建预设输入 */
export interface CreateModelPresetInput {
  /** 预设名称 */
  name: string;
  /** 类型 */
  type: ProviderType;

  // ---- v2 新字段 ----
  /** Provider 配置 */
  providerConfig?: ProviderConfig;
  /** 模型变体列表 */
  models?: ModelVariant[];

  // ---- 兼容旧字段 ----
  /** @deprecated 使用 providerConfig 代替 */
  vendor?: string;
  /** @deprecated 使用 providerConfig 代替 */
  baseUrl?: string;
  /** @deprecated 使用 models 代替 */
  model?: string;
  /** @deprecated 使用 providerConfig 代替 */
  protocol?: ModelPresetProtocol;
  /** @deprecated 使用 providerConfig 代替 */
  protocolOptions?: Record<string, unknown>;

  // ---- 通用字段 ----
  /** 可选配置 */
  options?: Record<string, unknown>;
  /** 描述 */
  description?: string;
  /** 排序 */
  sortOrder?: number;
  /** 是否启用 */
  isEnabled?: boolean;
}

/** 更新预设输入 */
export interface UpdateModelPresetInput {
  /** 预设名称 */
  name?: string;

  // ---- v2 新字段 ----
  /** Provider 配置 */
  providerConfig?: ProviderConfig | null;
  /** 模型变体列表 */
  models?: ModelVariant[];

  // ---- 兼容旧字段 ----
  /** @deprecated 使用 providerConfig 代替 */
  vendor?: string;
  /** @deprecated 使用 providerConfig 代替 */
  baseUrl?: string;
  /** @deprecated 使用 models 代替 */
  model?: string;
  /** @deprecated 使用 providerConfig 代替 */
  protocol?: ModelPresetProtocol | null;
  /** @deprecated 使用 providerConfig 代替 */
  protocolOptions?: Record<string, unknown> | null;

  // ---- 通用字段 ----
  /** 可选配置 */
  options?: Record<string, unknown> | null;
  /** 描述 */
  description?: string | null;
  /** 排序 */
  sortOrder?: number;
  /** 是否启用 */
  isEnabled?: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从旧格式转换为新格式
 * 用于兼容历史数据
 */
export function normalizePresetFromLegacy(data: Partial<ModelPreset> & {
  vendor?: string;
  baseUrl?: string;
  model?: string;
  protocol?: ModelPresetProtocol | null;
}): ModelPreset {
  const now = Date.now();

  // 如果已有新格式字段，直接返回
  if (data.providerConfig && data.models && data.models.length > 0) {
    return {
      id: data.id ?? "",
      name: data.name ?? "",
      type: data.type ?? "text",
      providerConfig: data.providerConfig,
      models: data.models,
      // 兼容字段
      vendor: data.providerConfig.vendor,
      baseUrl: data.providerConfig.baseUrl,
      model: data.models.find(m => m.isDefault)?.modelId ?? data.models[0]?.modelId ?? "",
      protocol: data.providerConfig.protocol ?? null,
      protocolOptions: data.providerConfig.protocolOptions ?? null,
      // 通用字段
      options: data.options ?? null,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
      isEnabled: data.isEnabled ?? true,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
  }

  // 从旧格式转换
  const providerConfig: ProviderConfig = {
    vendor: data.vendor ?? "",
    baseUrl: data.baseUrl ?? "",
    protocol: data.protocol ?? undefined,
    protocolOptions: data.protocolOptions ?? undefined,
  };

  const models: ModelVariant[] = data.model ? [{
    id: `${data.id ?? "model"}-default`,
    name: data.name ?? "",
    modelId: data.model,
    isDefault: true,
  }] : [];

  return {
    id: data.id ?? "",
    name: data.name ?? "",
    type: data.type ?? "text",
    providerConfig,
    models,
    // 兼容字段
    vendor: data.vendor ?? "",
    baseUrl: data.baseUrl ?? "",
    model: data.model ?? "",
    protocol: data.protocol ?? null,
    protocolOptions: data.protocolOptions ?? null,
    // 通用字段
    options: data.options ?? null,
    description: data.description ?? null,
    sortOrder: data.sortOrder ?? 0,
    isEnabled: data.isEnabled ?? true,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };
}

/**
 * 获取预设的默认模型
 */
export function getDefaultModel(preset: ModelPreset): ModelVariant | null {
  return preset.models.find(m => m.isDefault) ?? preset.models[0] ?? null;
}

/**
 * 根据类型筛选匹配的预设
 */
export function filterPresetsByType(
  presets: ModelPreset[],
  type: ProviderType
): ModelPreset[] {
  return presets.filter(p =>
    p.isEnabled &&
    p.type === type
  );
}