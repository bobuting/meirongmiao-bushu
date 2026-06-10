// src/modules/model-preset-service.ts
/**
 * 模型预设服务
 * 管理模型预设的 CRUD 操作，支持预设库管理
 *
 * v2 改动：
 * - 支持多模型变体
 * - Provider 配置合并存储
 * - 支持功能类型标记
 */
import type {
  ModelPreset,
  CreateModelPresetInput,
  UpdateModelPresetInput,
  ModelPresetProtocol,
  ModelVariant,
  ProviderConfig,
} from "../contracts/model-preset-contract.js";
import { normalizePresetFromLegacy, getDefaultModel } from "../contracts/model-preset-contract.js";
import type { User, ProviderType } from "../contracts/types.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import type { TrackedMap } from "../core/tracked-map.js";
import { assertCondition } from "../core/errors.js";

// 权限检查：仅管理员可操作
function requireAdmin(user: User): void {
  assertCondition(user.role === "admin", 403, "FORBIDDEN", "Admin only");
}

// ============================================================================
// 内置预设数据（v2 格式）
// ============================================================================

interface BuiltinPresetV2 {
  name: string;
  type: ProviderType;
  providerConfig: ProviderConfig;
  models: ModelVariant[];
  description?: string;
  sortOrder?: number;
}

const BUILTIN_PRESETS: BuiltinPresetV2[] = [
  // ---- 视频模型 ----
  {
    name: "云雾 VEO 系列",
    type: "video",
    providerConfig: {
      vendor: "yunwu",
      baseUrl: "https://yunwu.ai",
      protocol: "veo",
    },
    models: [
      { id: "veo-3.1", name: "VEO 3.1", modelId: "veo3.1", isDefault: true, description: "高质量视频生成" },
      { id: "veo-3.1-fast", name: "VEO 3.1 Fast", modelId: "veo3.1-fast", capabilities: ["fast"], description: "快速视频生成" },
    ],
    description: "Google VEO 视频生成模型系列",
    sortOrder: 1,
  },
  {
    name: "豆包 Seedance 系列",
    type: "video",
    providerConfig: {
      vendor: "doubao",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      protocol: "doubao",
    },
    models: [
      { id: "seedance-1-5-pro", name: "Seedance 1.5 Pro", modelId: "doubao-seedance-1-5-pro-251215", isDefault: true },
    ],
    description: "字节豆包视频生成模型",
    sortOrder: 2,
  },
  {
    name: "即梦视频系列",
    type: "video",
    providerConfig: {
      vendor: "jimeng",
      baseUrl: "https://api.jimeng.ai",
      protocol: "jimeng",
    },
    models: [
      { id: "jimeng-video-3.0", name: "即梦 3.0", modelId: "jimeng-video-3.0" },
      { id: "jimeng-video-3.1", name: "即梦 3.1", modelId: "jimeng-video-3.1", isDefault: true },
    ],
    description: "即梦视频生成模型系列",
    sortOrder: 3,
  },
  {
    name: "万相视频系列（DashScope）",
    type: "video",
    providerConfig: {
      vendor: "aliyun-bailian",
      baseUrl: "https://dashscope.aliyuncs.com",
      protocol: "dashscope",
    },
    models: [
      { id: "wan2.7-i2v", name: "万相 2.7 图生视频", modelId: "wan2.7-i2v", isDefault: true, description: "最新图生视频模型" },
      { id: "wan2.7-t2v", name: "万相 2.7 文生视频", modelId: "wan2.7-t2v", description: "最新文生视频模型" },
      { id: "wan2.6-i2v-flash", name: "万相 2.6 Flash", modelId: "wan2.6-i2v-flash", capabilities: ["fast"], description: "快速图生视频" },
      { id: "wan2.6-t2v", name: "万相 2.6 文生视频", modelId: "wan2.6-t2v", description: "文生视频模型" },
    ],
    description: "阿里云百炼万相视频生成模型系列",
    sortOrder: 4,
  },
  // ---- 图像模型 ----
  {
    name: "即梦图像系列",
    type: "image",
    providerConfig: {
      vendor: "jimeng",
      baseUrl: "https://api.jimeng.ai",
      protocol: "jimeng",
    },
    models: [
      { id: "jimeng-4.5", name: "即梦 4.5", modelId: "jimeng-4.5", isDefault: true },
    ],
    description: "即梦图像生成模型",
    sortOrder: 10,
  },
  // ---- LLM 模型 ----
  {
    name: "阿里云百炼（Qwen）",
    type: "text",
    providerConfig: {
      vendor: "aliyun-bailian",
      baseUrl: "https://ws-bnsomjkf6yta3zpo.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      protocol: "openai_compatible",
    },
    models: [
      { id: "qwen3.6-plus", name: "Qwen 3.6 Plus", modelId: "qwen3.6-plus", isDefault: true },
    ],
    description: "阿里云百炼 Qwen3.6（支持文本/识图/视频理解）",
    sortOrder: 18,
  },
  {
    name: "DeepSeek 系列",
    type: "text",
    providerConfig: {
      vendor: "modelscope",
      baseUrl: "https://api.modelscope.cn",
      protocol: "openai_compatible",
    },
    models: [
      { id: "deepseek-v3", name: "DeepSeek V3", modelId: "deepseek-ai/DeepSeek-V3.2", isDefault: true },
    ],
    description: "DeepSeek 大语言模型",
    sortOrder: 20,
  },
  {
    name: "Gemini 系列",
    type: "text",
    providerConfig: {
      vendor: "google",
      baseUrl: "https://generativelanguage.googleapis.com",
      protocol: "gemini",
    },
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", modelId: "gemini-3-pro-preview", isDefault: true },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", modelId: "gemini-3-flash-preview", capabilities: ["fast"] },
    ],
    description: "Google Gemini 大语言模型",
    sortOrder: 21,
  },
];

// ============================================================================
// 服务类
// ============================================================================

export class ModelPresetService {
  constructor(
    private readonly presets: TrackedMap<string, ModelPreset>,
    private readonly auditStore: IAuditStore,
    private readonly generateId: () => string,
    private readonly now: () => number,
  ) {}

  /**
   * 获取预设列表，支持按类型筛选
   * 按 sortOrder 升序、name 字母序排列
   */
  listPresets(actor: User, type?: string): ModelPreset[] {
    requireAdmin(actor);
    const items = [...this.presets.values()]
      .filter((p) => (type ? p.type === type : true))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return items;
  }

  /**
   * 获取单个预设
   */
  getPreset(actor: User, id: string): ModelPreset | null {
    requireAdmin(actor);
    return this.presets.get(id) ?? null;
  }

  /**
   * 创建新预设
   */
  createPreset(actor: User, input: CreateModelPresetInput): ModelPreset {
    requireAdmin(actor);
    const now = this.now();
    const name = input.name.trim();

    // 必填字段校验
    assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Preset name required");

    // 处理 ProviderConfig（兼容新旧格式）
    let providerConfig: ProviderConfig;
    if (input.providerConfig) {
      providerConfig = input.providerConfig;
    } else if (input.vendor && input.baseUrl) {
      // 从旧格式转换
      providerConfig = {
        vendor: input.vendor.trim(),
        baseUrl: input.baseUrl.trim(),
        protocol: input.protocol,
        protocolOptions: input.protocolOptions,
      };
    } else {
      throw new Error("providerConfig or vendor/baseUrl is required");
    }

    // 处理 models（兼容新旧格式）
    let models: ModelVariant[];
    if (input.models && input.models.length > 0) {
      models = input.models;
    } else if (input.model) {
      // 从旧格式转换
      models = [{
        id: this.generateId(),
        name: name,
        modelId: input.model.trim(),
        isDefault: true,
      }];
    } else {
      throw new Error("models or model is required");
    }

    const preset: ModelPreset = {
      id: this.generateId(),
      name,
      type: input.type,
      // 新字段
      providerConfig,
      models,
      baseUrl: providerConfig.baseUrl,
      vendor: providerConfig.vendor,
      model: getDefaultModel({ models } as ModelPreset)?.modelId ?? "",
      protocol: providerConfig.protocol ?? null,
      protocolOptions: providerConfig.protocolOptions ?? null,
      // 通用字段
      options: input.options ?? null,
      description: input.description?.trim() ?? null,
      sortOrder: input.sortOrder ?? 0,
      isEnabled: input.isEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.presets.set(preset.id, preset);

    // 记录审计日志
    this.auditStore.insertAuditLog({
      id: this.generateId(),
      actorUserId: actor.id,
      action: "model_preset_created",
      targetId: preset.id,
      meta: { type: preset.type, name: preset.name, modelCount: preset.models.length },
      createdAt: now,
    });

    return preset;
  }

  /**
   * 更新预设
   */
  updatePreset(actor: User, id: string, input: UpdateModelPresetInput): ModelPreset {
    requireAdmin(actor);
    const existing = this.presets.get(id);
    assertCondition(Boolean(existing), 404, "NOT_FOUND", "Preset not found");
    const preset = existing!;
    const now = this.now();

    // 更新名称
    if (input.name !== undefined) preset.name = input.name.trim();

    // 更新 ProviderConfig
    if (input.providerConfig !== undefined && input.providerConfig !== null) {
      preset.providerConfig = input.providerConfig;
      preset.vendor = input.providerConfig.vendor;
      preset.baseUrl = input.providerConfig.baseUrl;
      preset.protocol = input.providerConfig.protocol ?? null;
      preset.protocolOptions = input.providerConfig.protocolOptions ?? null;
    } else {
      // 兼容旧格式
      if (input.vendor !== undefined) {
        preset.vendor = input.vendor.trim();
        preset.providerConfig = { ...preset.providerConfig!, vendor: preset.vendor };
      }
      if (input.baseUrl !== undefined) {
        preset.baseUrl = input.baseUrl.trim();
        preset.providerConfig = { ...preset.providerConfig!, baseUrl: preset.baseUrl };
      }
      if (input.protocol !== undefined) {
        preset.protocol = input.protocol;
        preset.providerConfig = { ...preset.providerConfig!, protocol: input.protocol ?? undefined };
      }
      if (input.protocolOptions !== undefined) {
        preset.protocolOptions = input.protocolOptions;
        preset.providerConfig = { ...preset.providerConfig!, protocolOptions: input.protocolOptions ?? undefined };
      }
    }

    // 更新 models
    if (input.models !== undefined) {
      preset.models = input.models;
      const defaultModel = getDefaultModel(preset);
      if (defaultModel) {
        preset.model = defaultModel.modelId;
      }
    } else if (input.model !== undefined) {
      // 兼容旧格式：更新默认模型的 modelId
      preset.model = input.model.trim();
      if (preset.models.length > 0) {
        const defaultIdx = preset.models.findIndex(m => m.isDefault);
        if (defaultIdx >= 0) {
          preset.models[defaultIdx].modelId = preset.model;
        }
      }
    }


    // 更新通用字段
    if (input.options !== undefined) preset.options = input.options;
    if (input.description !== undefined) preset.description = input.description?.trim() ?? null;
    if (input.sortOrder !== undefined) preset.sortOrder = input.sortOrder;
    if (input.isEnabled !== undefined) preset.isEnabled = input.isEnabled;
    preset.updatedAt = now;

    // 记录审计日志
    this.auditStore.insertAuditLog({
      id: this.generateId(),
      actorUserId: actor.id,
      action: "model_preset_updated",
      targetId: preset.id,
      meta: { modelCount: preset.models.length },
      createdAt: now,
    });

    return preset;
  }

  /**
   * 删除预设
   */
  deletePreset(actor: User, id: string): void {
    requireAdmin(actor);
    const existing = this.presets.get(id);
    assertCondition(Boolean(existing), 404, "NOT_FOUND", "Preset not found");
    this.presets.delete(id);

    // 记录审计日志
    this.auditStore.insertAuditLog({
      id: this.generateId(),
      actorUserId: actor.id,
      action: "model_preset_deleted",
      targetId: id,
      createdAt: this.now(),
    });
  }

  /**
   * 从预设创建 Provider 配置
   * 返回可用于创建 Provider 的配置对象
   * @param preset 预设对象
   * @param modelId 指定模型 ID，不指定则使用默认模型
   */
  buildProviderConfigFromPreset(
    preset: ModelPreset,
    modelId?: string
  ): {
    name: string;
    type: ModelPreset["type"];
    vendor: string;
    baseUrl: string;
    model: string;
    options?: Record<string, unknown>;
  } {
    // 选择模型
    let selectedModel: ModelVariant | null = null;
    if (modelId) {
      selectedModel = preset.models.find(m => m.id === modelId || m.modelId === modelId) ?? null;
    }
    if (!selectedModel) {
      selectedModel = getDefaultModel(preset);
    }
    if (!selectedModel) {
      throw new Error(`No model found in preset "${preset.name}"`);
    }

    return {
      name: `${preset.name} - ${selectedModel.name}`,
      type: preset.type,
      vendor: preset.providerConfig?.vendor ?? preset.vendor,
      baseUrl: preset.providerConfig?.baseUrl ?? preset.baseUrl,
      model: selectedModel.modelId,
      options: preset.options ?? undefined,
    };
  }

  /**
   * 初始化内置预设数据
   * 如果预设为空则插入内置预设
   */
  initializeBuiltinPresets(): void {
    // 如果已有预设数据，跳过初始化
    if (this.presets.size > 0) {
      return;
    }

    const now = this.now();
    for (const builtin of BUILTIN_PRESETS) {
      const preset: ModelPreset = {
        id: this.generateId(),
        name: builtin.name,
        type: builtin.type,
        // 新字段
        providerConfig: builtin.providerConfig,
        models: builtin.models,
        // 兼容旧字段
        vendor: builtin.providerConfig.vendor,
        baseUrl: builtin.providerConfig.baseUrl,
        model: builtin.models.find(m => m.isDefault)?.modelId ?? builtin.models[0]?.modelId ?? "",
        protocol: builtin.providerConfig.protocol ?? null,
        protocolOptions: builtin.providerConfig.protocolOptions ?? null,
        // 通用字段
        options: null,
        description: builtin.description ?? null,
        sortOrder: builtin.sortOrder ?? 0,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      };
      this.presets.set(preset.id, preset);
    }
  }
}