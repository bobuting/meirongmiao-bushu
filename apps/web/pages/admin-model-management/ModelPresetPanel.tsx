// apps/web/pages/admin-model-management/ModelPresetPanel.tsx
/**
 * 模型预设库面板
 * 支持预设的增删改查，以及从预设创建 Provider
 *
 * v2 改动：
 * - 支持多模型变体管理
 * - Provider 配置合并展示
 * - 支持功能类型标记
 * - 分组折叠 UI
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import {
  modelPresetApi,
  type ModelPreset,
  type ModelPresetType,
  type CreateModelPresetInput,
  type ModelVariant,
} from "../../services/realApi/modelPreset";
import { Button } from "../../components/ui/Button";

// -----------------------------------------------------------------------------
// 预设类型选项
// -----------------------------------------------------------------------------

const PRESET_TYPE_OPTIONS: { value: ModelPresetType; label: string; icon: string }[] = [
  { value: "video", label: "视频模型", icon: "📹" },
  { value: "image", label: "图像模型", icon: "🎨" },
  { value: "text", label: "LLM模型", icon: "🤖" },
];

const PRESET_TYPE_COLORS: Record<ModelPresetType, string> = {
  video: "bg-blue-100 text-blue-800",
  image: "bg-green-100 text-green-800",
  text: "bg-purple-100 text-purple-800",
};
// 主面板组件
// -----------------------------------------------------------------------------

export const ModelPresetPanel: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<ModelPresetType | "all">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ModelPreset | null>(null);

  // 获取预设列表
  const { data, isLoading, error } = useQuery({
    queryKey: ["model-presets", selectedType],
    queryFn: () => modelPresetApi.list(token!, selectedType === "all" ? undefined : selectedType),
    enabled: !!token,
  });

  // 删除预设
  const deleteMutation = useMutation({
    mutationFn: (id: string) => modelPresetApi.delete(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-presets"] });
    },
  });

  const presets = data?.presets ?? [];

  // 按类型分组
  const groupedPresets = React.useMemo(() => {
    const groups: Record<ModelPresetType, ModelPreset[]> = {
      video: [],
      image: [],
      text: [],
    };
    presets.forEach((p) => {
      if (groups[p.type]) {
        groups[p.type].push(p);
      }
    });
    return groups;
  }, [presets]);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* 类型筛选 */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ModelPresetType | "all")}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">全部类型</option>
            {PRESET_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
            ))}
          </select>

          {/* 统计 */}
          <span className="text-sm text-gray-500">
            共 {presets.length} 个预设
          </span>
        </div>

        {/* 新建按钮 */}
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          + 新建预设
        </Button>
      </div>

      {/* 预设列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">加载失败，请刷新重试</div>
      ) : presets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无预设数据</div>
      ) : (
        <div className="space-y-6">
          {/* 按类型分组展示 */}
          {(selectedType === "all" ? PRESET_TYPE_OPTIONS : PRESET_TYPE_OPTIONS.filter(o => o.value === selectedType)).map((typeOpt) => {
            const typePresets = groupedPresets[typeOpt.value];
            if (typePresets.length === 0) return null;

            return (
              <div key={typeOpt.value} className="space-y-3">
                {/* 类型标题 */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-lg">{typeOpt.icon}</span>
                  <h3 className="font-medium text-gray-900">{typeOpt.label}</h3>
                  <span className="text-sm text-gray-400">({typePresets.length})</span>
                </div>

                {/* 预设卡片 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {typePresets.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      onEdit={() => setEditingPreset(preset)}
                      onDelete={() => {
                        if (confirm(`确定删除预设「${preset.name}」吗？`)) {
                          deleteMutation.mutate(preset.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      {(isCreateDialogOpen || editingPreset) && (
        <PresetFormDialog
          preset={editingPreset}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setEditingPreset(null);
          }}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 预设卡片组件
// -----------------------------------------------------------------------------

const PresetCard: React.FC<{
  preset: ModelPreset;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ preset, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const typeColor = PRESET_TYPE_COLORS[preset.type];
  const defaultModel = preset.models?.find(m => m.isDefault) ?? preset.models?.[0];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-white">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{preset.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor}`}>
                {PRESET_TYPE_OPTIONS.find(o => o.value === preset.type)?.label ?? preset.type}
              </span>
              {preset.models && preset.models.length > 1 && (
                <span className="text-xs text-gray-400">{preset.models.length} 个模型</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
              title="编辑"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="删除"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 基本信息 */}
      <div className="p-4 space-y-3">
        {/* 默认模型 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16">默认模型</span>
          <span className="text-sm font-medium text-gray-900">
            {defaultModel?.name ?? preset.model}
          </span>
          {defaultModel?.modelId && (
            <span className="text-xs text-gray-400 font-mono">({defaultModel.modelId})</span>
          )}
        </div>

        {/* Provider 信息 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16">供应商</span>
          <span className="text-sm text-gray-700">{preset.providerConfig?.vendor ?? preset.vendor}</span>
          {preset.providerConfig?.protocol && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
              {preset.providerConfig.protocol}
            </span>
          )}
        </div>

        {/* 支持的功能 */}
        {(() => {
          const allCapabilities = [...new Set(preset.models.flatMap(m => m.capabilities ?? []))];
          return allCapabilities.length > 0 ? (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-16 pt-0.5">支持功能</span>
              <div className="flex flex-wrap gap-1">
                {allCapabilities.map((key) => (
                  <span key={key} className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ) : null;
        })()}
      </div>

      {/* 展开/收起模型列表 */}
      {preset.models && preset.models.length > 1 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-1"
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? "收起模型列表" : `展开全部 ${preset.models.length} 个模型`}
        </button>
      )}

      {/* 模型列表（展开时） */}
      {expanded && preset.models && preset.models.length > 1 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <div className="space-y-2">
            {preset.models.map((model, idx) => (
              <div key={model.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 w-4 text-right">{idx + 1}.</span>
                <span className={`font-medium ${model.isDefault ? "text-amber-600" : "text-gray-700"}`}>
                  {model.name}
                </span>
                <span className="text-xs text-gray-400 font-mono">{model.modelId}</span>
                {model.isDefault && (
                  <span className="text-xs px-1 py-0.5 bg-amber-100 text-amber-700 rounded">默认</span>
                )}
                {model.capabilities && model.capabilities.length > 0 && (
                  <div className="flex gap-1">
                    {model.capabilities.map(cap => (
                      <span key={cap} className="text-xs px-1 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 创建/编辑表单弹窗
// -----------------------------------------------------------------------------

const PresetFormDialog: React.FC<{
  preset: ModelPreset | null;
  onClose: () => void;
}> = ({ preset, onClose }) => {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const isEditing = !!preset;

  // 表单状态
  const [form, setForm] = useState<{
    name: string;
    type: ModelPresetType;
    vendor: string;
    baseUrl: string;
    protocol: ModelPreset["protocol"];
    models: ModelVariant[];
    description: string;
    isEnabled: boolean;
  }>({
    name: preset?.name ?? "",
    type: preset?.type ?? "video",
    vendor: preset?.providerConfig?.vendor ?? preset?.vendor ?? "",
    baseUrl: preset?.providerConfig?.baseUrl ?? preset?.baseUrl ?? "",
    protocol: preset?.providerConfig?.protocol ?? preset?.protocol ?? null,
    models: preset?.models ?? [{ id: "model-1", name: "", modelId: "", isDefault: true }],
    description: preset?.description ?? "",
    isEnabled: preset?.isEnabled ?? true,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateModelPresetInput) => modelPresetApi.create(token!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-presets"] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateModelPresetInput> }) =>
      modelPresetApi.update(token!, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-presets"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const input: CreateModelPresetInput = {
      name: form.name,
      type: form.type,
      providerConfig: {
        vendor: form.vendor,
        baseUrl: form.baseUrl,
        protocol: form.protocol ?? undefined,
      },
      models: form.models,
      description: form.description,
      isEnabled: form.isEnabled,
    };

    if (isEditing && preset) {
      updateMutation.mutate({ id: preset.id, input });
    } else {
      createMutation.mutate(input);
    }
  };

  // 添加模型
  const addModel = () => {
    setForm(prev => ({
      ...prev,
      models: [
        ...prev.models,
        { id: `model-${Date.now()}`, name: "", modelId: "", isDefault: false },
      ],
    }));
  };

  // 移除模型
  const removeModel = (index: number) => {
    if (form.models.length <= 1) return;
    setForm(prev => {
      const newModels = prev.models.filter((_, i) => i !== index);
      // 如果移除的是默认模型，将第一个设为默认
      if (prev.models[index].isDefault && newModels.length > 0) {
        newModels[0].isDefault = true;
      }
      return { ...prev, models: newModels };
    });
  };

  // 更新模型
  const updateModel = (index: number, field: keyof ModelVariant, value: string | boolean) => {
    setForm(prev => {
      const newModels = [...prev.models];
      newModels[index] = { ...newModels[index], [field]: value };
      // 如果设为默认，取消其他默认
      if (field === "isDefault" && value === true) {
        newModels.forEach((m, i) => {
          if (i !== index) m.isDefault = false;
        });
      }
      return { ...prev, models: newModels };
    });
  };

  // 切换功能类型
  const toggleCapability = (capability: string) => {
    setForm(prev => {
      const capabilities = prev.models.flatMap(m => m.capabilities ?? []);
      const updated = capabilities.includes(capability)
        ? capabilities.filter(c => c !== capability)
        : [...capabilities, capability];
      return {
        ...prev,
        models: prev.models.map((m, i) =>
          i === 0 ? { ...m, capabilities: updated } : m
        ),
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? "编辑预设" : "新建预设"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 名称 */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">预设名称 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            {/* 类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型 *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ModelPresetType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                disabled={isEditing}
              >
                {PRESET_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </select>
            </div>

            {/* 协议 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">协议</label>
              <select
                value={form.protocol ?? ""}
                onChange={(e) => setForm({ ...form, protocol: e.target.value as ModelPreset["protocol"] || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">无</option>
                <option value="veo">veo</option>
                <option value="doubao">doubao</option>
                <option value="jimeng">jimeng</option>
                <option value="runway">runway</option>
                <option value="openai_compatible">openai_compatible</option>
                <option value="gemini">gemini</option>
              </select>
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">供应商 *</label>
              <input
                type="text"
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API 地址 *</label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          {/* 模型列表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">模型列表</label>
              <button
                type="button"
                onClick={addModel}
                className="text-sm text-amber-600 hover:text-amber-700"
              >
                + 添加模型
              </button>
            </div>

            <div className="space-y-3">
              {form.models.map((model, index) => (
                <div key={model.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  {/* 默认标记 */}
                  <label className="flex items-center pt-6">
                    <input
                      type="radio"
                      name="defaultModel"
                      checked={model.isDefault}
                      onChange={() => updateModel(index, "isDefault", true)}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span className="ml-1 text-xs text-gray-500">默认</span>
                  </label>

                  {/* 模型信息 */}
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">显示名称</label>
                      <input
                        type="text"
                        value={model.name}
                        onChange={(e) => updateModel(index, "name", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="如: VEO 3.1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">模型 ID</label>
                      <input
                        type="text"
                        value={model.modelId}
                        onChange={(e) => updateModel(index, "modelId", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="如: veo3.1"
                      />
                    </div>
                  </div>

                  {/* 删除按钮 */}
                  {form.models.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeModel(index)}
                      className="p-1 text-red-400 hover:text-red-600 mt-5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 支持的功能 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">支持的功能类型</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TYPE_OPTIONS.map((opt) => {
                const capabilities = form.models.flatMap(m => m.capabilities ?? []);
                const isSelected = capabilities.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleCapability(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      isSelected
                        ? "bg-amber-50 border-amber-300 text-amber-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={2}
            />
          </div>

          {/* 启用状态 */}
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
              className="mr-2 text-amber-500 focus:ring-amber-500"
            />
            <label className="text-sm text-gray-700">启用此预设</label>
          </div>

          {/* 按钮组 */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
              {isEditing ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModelPresetPanel;