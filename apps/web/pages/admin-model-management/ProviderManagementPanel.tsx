// apps/web/pages/admin-model-management/ProviderManagementPanel.tsx
/**
 * Provider 管理面板
 * 支持 Provider 的增删改查、密钥管理和连通性测试
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { backendApi, ApiError } from "../../services/backendApi";
import { CopyableText } from "../../components/ui/CopyableText";
import { ProviderCallMode as CallMode, PROVIDER_TYPE_CALL_MODES as BACKEND_CALL_MODES } from "../../../../src/contracts/types";

type ProviderType = "text" | "image" | "video";

// Provider 类型选项
const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string; icon: string }[] = [
  { value: "video", label: "视频模型", icon: "📹" },
  { value: "image", label: "图像模型", icon: "🎨" },
  { value: "text", label: "文本模型", icon: "🧠" },
];

// Provider 类型颜色映射
const PROVIDER_TYPE_COLORS: Record<ProviderType, { bg: string; text: string; border: string }> = {
  video: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  image: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  text: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

// 类型 → 可用 CallMode 映射（直接引用后端枚举，单一数据源）
const PROVIDER_TYPE_CALL_MODES = BACKEND_CALL_MODES as Record<ProviderType, CallMode[]>;

// 所有 CallMode 的中文 label
const CALL_MODE_LABELS: Record<string, string> = {
  // text
  openai: "OpenAI 兼容",
  gemini: "Gemini 原生",
  dashscope: "DashScope 原生",
  "dashscope-stream": "DashScope 流式",
  // image
  "openai-image-to-text": "OpenAI 图生文",
  "gemini-to-image": "Gemini 图片生成",
  "gemini-to-image-inline": "Gemini 图片生成(inline)",
  "nano-banana-image": "Nano Banana 图片",
  "seedream-image-ark": "Seedream 图片(方舟)",
  "seedream-image-ark-yunwu": "Seedream 图片(云雾)",
  "wanx-image-bailian": "万相图片(百炼)",
  "openai-image": "OpenAI 图片生成",
  // video
  "kling-video-yunwu": "可灵视频(云雾)",
  "kling-video-edit-yunwu": "可灵视频编辑(云雾)",
  "kling-omni-video-yunwu": "可灵Omni-Video(云雾)",
  "kling-omni-video-dataeyes": "可灵Omni-Video(DataEyes)",
  "kling-video-official": "可灵视频(官方)",
  "veo-video-yunwu-tongyi": "VEO 视频(云雾通义)",
  "veo-video-yunwu-openai": "VEO 视频(云雾OpenAI)",
  "doubao-seedance-video-yunwu": "豆包视频(云雾)",
  "wanx-video-bailian": "万相视频(百炼)",
  "happyhorse-video-bailian": "快乐马视频(百炼)",
  "happyhorse-video-edit-bailian": "快乐马视频编辑(百炼)",
  "wanxiang-video-mix-bailian": "万相换人视频(百炼)",
  "animate-anyone-detect-bailian": "AA图片检测(百炼)",
  "animate-anyone-template-bailian": "AA模板生成(百炼)",
  "animate-anyone-video-bailian": "AA视频生成(百炼)",
};

const CUSTOM_MODEL_VALUE = "__custom__";

interface ProviderRecord {
  id: string;
  name: string;
  type: ProviderType;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: CallMode;
  accessKey?: string | null;
  remark?: string | null;
  enabled: boolean;
  options?: {
    geminiGroundingEnabled?: boolean;
    geminiFallbackModels?: string[];
  };
  hasSecret: boolean;
  maskedSecret: string | null;
  createdAt: number;
  updatedAt: number;
}

export const ProviderManagementPanel: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<ProviderType | "all">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderRecord | null>(null);
  const [copyingProvider, setCopyingProvider] = useState<ProviderRecord | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // 操作反馈
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 反馈自动消失
  React.useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  // 获取 Provider 列表（切换 tab 时不刷新，使用缓存）
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => backendApi.adminProviders(token!),
    enabled: !!token,
    staleTime: Infinity,
  });

  // 删除 Provider
  const deleteMutation = useMutation({
    mutationFn: (id: string) => backendApi.adminDeleteProvider(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      setFeedback({ type: "success", message: "Provider 删除成功" });
    },
  });

  const providers = (data?.providers ?? []) as ProviderRecord[];
  const filteredProviders = selectedType === "all"
    ? providers
    : providers.filter((p) => p.type === selectedType);

  // 统计数据
  const stats = {
    total: providers.length,
    enabled: providers.filter((p) => p.enabled).length,
    withSecret: providers.filter((p) => p.hasSecret).length,
  };

  return (
    <div className="space-y-6">
      {/* 操作反馈 */}
      {feedback && (
        <div
          className={`rounded-xl p-4 flex items-center justify-between transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {feedback.type === "success" ? "✅" : "❌"}
            </span>
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-sm opacity-60 hover:opacity-100"
          >
            关闭
          </button>
        </div>
      )}

      {/* 快速统计 */}
      <div className="flex items-center gap-6 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-700">{stats.total}</div>
          <div className="text-xs text-slate-500">总数</div>
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <div className="text-center">
          <div className="text-xl font-bold text-emerald-600">{stats.enabled}</div>
          <div className="text-xs text-slate-500">启用</div>
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <div className="text-center">
          <div className="text-xl font-bold text-amber-600">{stats.withSecret}</div>
          <div className="text-xs text-slate-500">已配置密钥</div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 类型筛选 */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                selectedType === "all"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              全部
            </button>
            {PROVIDER_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedType(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                  selectedType === opt.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 新建按钮 */}
        <button
          onClick={() => setIsCreateDialogOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-amber-500/20 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建 Provider
        </button>
      </div>

      {/* Provider 列表 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            {error instanceof ApiError ? error.message : "加载失败"}
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm">暂无 Provider 数据</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Base URL</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Call Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Access Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">备注说明</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">密钥</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredProviders.map((provider) => {
                  const typeConfig = PROVIDER_TYPE_COLORS[provider.type] ?? PROVIDER_TYPE_COLORS.text;
                  const typeOption = PROVIDER_TYPE_OPTIONS.find((o) => o.value === provider.type);

                  return (
                    <tr key={provider.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* 名称 - 合并类型、Vendor、Model信息 */}
                      <td className="px-4 py-3 min-w-[280px]">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${typeConfig.bg} ${typeConfig.border} border`}>
                              {typeOption?.icon ?? "📦"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-900 truncate" title={provider.name}>
                                <CopyableText text={provider.name} />
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 pl-10">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-700 font-medium border border-slate-200">
                                {provider.type}
                              </span>
                              <span className="text-slate-300">|</span>
                              <span className="truncate max-w-[100px]" title={provider.vendor}>
                                {provider.vendor}
                              </span>
                              <span className="text-slate-300">|</span>
                              <span className="truncate max-w-[120px] font-medium text-slate-800" title={provider.model}>
                                {provider.model}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Base URL — 完整显示 */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-700 whitespace-nowrap font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200">
                          {provider.baseUrl}
                        </span>
                      </td>
                      {/* Call Mode — 显示中文标签，点击可复制原始值 */}
                      <td className="px-4 py-3">
                        <CopyableText text={CALL_MODE_LABELS[provider.callMode] ?? provider.callMode} copyText={provider.callMode} />
                      </td>
                      {/* Access Key — 访问标识（遮盖显示） */}
                      <td className="px-4 py-3">
                        {provider.accessKey ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-mono text-slate-600 max-w-[120px] truncate cursor-help"
                            title={provider.accessKey}
                          >
                            {provider.accessKey.length > 5
                              ? `${provider.accessKey.slice(0, 2)}${'*'.repeat(Math.max(3, provider.accessKey.length - 5))}${provider.accessKey.slice(-3)}`
                              : provider.accessKey}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      {/* 备注说明 */}
                      <td className="px-4 py-3">
                        {provider.remark ? (
                          <span className="text-sm text-slate-700 max-w-[200px] truncate block" title={provider.remark}>
                            {provider.remark}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      {/* 密钥 — 缩短显示 */}
                      <td className="px-4 py-3">
                        {provider.maskedSecret ? (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-600 max-w-[100px] truncate" title={provider.maskedSecret}>
                            <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            {provider.maskedSecret}
                          </span>
                        ) : (
                          <span className="text-red-500 text-xs">未配置</span>
                        )}
                      </td>
                      {/* 状态 */}
                      <td className="px-4 py-3">
                        {provider.enabled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">启用</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">禁用</span>
                        )}
                      </td>
                      {/* 操作 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={async () => {
                              // 根据 callMode 确定 transportMode
                              let transportMode: "auto" | "gemini" | "openai" | undefined;
                              if (provider.callMode === "gemini") {
                                transportMode = "gemini";
                              } else if (provider.callMode === "openai") {
                                transportMode = "openai";
                              } else {
                                // 对于其他 callMode，使用 auto 或不指定
                                transportMode = undefined;
                              }

                              setTestingProvider(provider.id);
                              try {
                                await backendApi.adminTestProviderConnectivity(token!, provider.id, { transportMode });
                                alert("连通性测试通过");
                              } catch (e) {
                                alert(`连通性测试失败: ${e instanceof Error ? e.message : String(e)}`);
                              } finally {
                                setTestingProvider(null);
                              }
                            }}
                            disabled={testingProvider === provider.id}
                            className="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                          >
                            {testingProvider === provider.id ? "测试中..." : "测试"}
                          </button>
                          <button
                            onClick={() => setCopyingProvider(provider)}
                            className="px-2 py-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors"
                          >
                            复制
                          </button>
                          <button
                            onClick={() => setEditingProvider(provider)}
                            className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定删除 Provider「${provider.name}」吗？`)) {
                                deleteMutation.mutate(provider.id);
                              }
                            }}
                            className="px-2 py-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 底部统计 */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              显示 {filteredProviders.length} / {providers.length} 个 Provider
            </div>
          </div>
        </div>
      </div>

      {/* 创建/编辑/复制弹窗 */}
      {(isCreateDialogOpen || editingProvider || copyingProvider) && (
        <ProviderFormDialog
          key={editingProvider?.id ?? `copy-${copyingProvider?.id}`}
          provider={editingProvider}
          copySource={copyingProvider}
          providers={providers}
          typeModels={(data?.typeModels ?? {}) as Record<string, { value: string; label: string }[]>}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setEditingProvider(null);
            setCopyingProvider(null);
          }}
          onSuccess={(message) => setFeedback({ type: "success", message })}
        />
      )}
    </div>
  );
};

// Provider 表单弹窗
const ProviderFormDialog: React.FC<{
  provider: ProviderRecord | null;
  copySource: ProviderRecord | null;
  providers: ProviderRecord[];
  typeModels: Record<string, { value: string; label: string }[]>;
  onClose: () => void;
  onSuccess: (message: string) => void;
}> = ({ provider, copySource, providers, typeModels, onClose, onSuccess }) => {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const isEditing = !!provider;
  const isCopying = !!copySource;

  const [form, setForm] = useState({
    name: provider?.name ?? (copySource ? `${copySource.name} 副本` : ""),
    type: provider?.type ?? copySource?.type ?? "text" as ProviderType,
    callMode: provider?.callMode ?? copySource?.callMode ?? ("openai" as CallMode),
    vendor: provider?.vendor ?? copySource?.vendor ?? "",
    baseUrl: provider?.baseUrl ?? copySource?.baseUrl ?? "",
    model: provider?.model ?? copySource?.model ?? "",
    accessKey: provider?.accessKey ?? copySource?.accessKey ?? "",
    remark: provider?.remark ?? copySource?.remark ?? "",
    secret: "",
    enabled: provider?.enabled ?? copySource?.enabled ?? true,
    geminiGroundingEnabled: provider?.options?.geminiGroundingEnabled ?? copySource?.options?.geminiGroundingEnabled ?? false,
  });

  const createMutation = useMutation({
    mutationFn: (input: typeof form) =>
      backendApi.adminCreateProvider(token!, {
        name: input.name,
        type: input.type,
        vendor: input.vendor,
        baseUrl: input.baseUrl,
        model: input.model,
        callMode: input.callMode,
        accessKey: input.accessKey || null,
        remark: input.remark || null,
        enabled: input.enabled,
        secret: input.secret || undefined,
        options: input.geminiGroundingEnabled ? { geminiGroundingEnabled: true } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      onSuccess("Provider 创建成功");
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: typeof form) =>
      backendApi.adminUpdateProvider(token!, provider!.id, {
        name: input.name,
        vendor: input.vendor,
        baseUrl: input.baseUrl,
        model: input.model,
        callMode: input.callMode,
        accessKey: input.accessKey || null,
        remark: input.remark || null,
        enabled: input.enabled,
        secret: input.secret || undefined,
        options: input.geminiGroundingEnabled ? { geminiGroundingEnabled: true } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      onSuccess("Provider 更新成功");
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  // 类型卡片配色
  const typeCardColors: Record<ProviderType, { active: string; icon: string }> = {
    text: { active: "border-purple-400 bg-purple-50 text-purple-700", icon: "🧠" },
    image: { active: "border-green-400 bg-green-50 text-green-700", icon: "🎨" },
    video: { active: "border-blue-400 bg-blue-50 text-blue-700", icon: "📹" },
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* 弹窗标题 - 固定在顶部 */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 rounded-t-2xl shrink-0">
          <h2 className="text-lg font-semibold text-white">{isEditing ? "编辑 Provider" : isCopying ? "复制 Provider" : "新建 Provider"}</h2>
          <p className="text-xs text-slate-400 mt-0.5">配置模型服务的连接信息和认证密钥</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* 可滚动表单内容 */}
          <div className="p-6 space-y-6 overflow-y-auto scrollbar-hide flex-1">
          {/* ── 基本信息 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">基本信息</h3>
            </div>

            <div className="space-y-4">
              {/* 名称 + Vendor 并排 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">名称 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    placeholder="如：GPT-4o"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">厂商 *</label>
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    placeholder="如：OpenAI"
                    required
                  />
                </div>
              </div>

              {/* 类型卡片选择 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">类型 *</label>
                <div className="flex items-center gap-2">
                  {(["text", "image", "video"] as ProviderType[]).map((t) => {
                    const cardColor = typeCardColors[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          if (isEditing) return;
                          const availableModes = PROVIDER_TYPE_CALL_MODES[t] ?? [];
                          const firstMode = availableModes[0] ?? ("openai" as CallMode);
                          setForm({ ...form, type: t, callMode: firstMode });
                        }}
                        disabled={isEditing}
                        className={`flex-1 px-3 py-3 rounded-xl border-2 transition-all ${
                          form.type === t
                            ? cardColor.active
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        } ${isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="text-xl mb-0.5">{cardColor.icon}</div>
                        <div className="text-xs font-medium">
                          {t === "text" ? "文本" : t === "image" ? "图像" : "视频"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 调用方式 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">调用方式</label>
                <select
                  value={form.callMode}
                  onChange={(e) => setForm({ ...form, callMode: e.target.value as CallMode })}
                  className="w-full appearance-none px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 cursor-pointer"
                >
                  {(PROVIDER_TYPE_CALL_MODES[form.type] ?? []).map((mode) => (
                    <option key={mode} value={mode}>{CALL_MODE_LABELS[mode] ?? mode}</option>
                  ))}
                </select>
              </div>

              {/* 备注说明 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">备注说明 *</label>
                <input
                  type="text"
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                  placeholder="填写用途、场景等说明"
                  required
                />
              </div>
            </div>
          </div>

          {/* ── 连接配置 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold text-slate-800">连接配置</h3>
            </div>

            <div className="space-y-4">
              {/* Base URL */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Base URL *</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                  placeholder="https://api.example.com/v1"
                  required
                />
              </div>

              {/* Model — 按 ProviderType 过滤的下拉 + 自定义输入 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Model *</label>
                <ModelSelect
                  providerType={form.type}
                  value={form.model}
                  onChange={(v) => setForm({ ...form, model: v })}
                  models={typeModels[form.type] ?? []}
                />
              </div>
            </div>
          </div>

          {/* ── 认证密钥 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-800">认证密钥</h3>
            </div>

            <div className="space-y-4">
              {/* API 密钥 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  API 密钥 {!isEditing && "*"}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    value={form.secret}
                    onChange={(e) => setForm({ ...form, secret: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    placeholder={isEditing ? "留空保持不变" : "输入 API 密钥"}
                    required={!isEditing}
                    autoComplete="new-password"
                  />
                </div>
                {isEditing && <p className="text-xs text-slate-400 mt-1">留空表示不修改现有密钥</p>}
              </div>

              {/* Access Key */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Access Key <span className="text-slate-400 font-normal">(可选)</span>
                </label>
                <input
                  type="text"
                  value={form.accessKey}
                  onChange={(e) => setForm({ ...form, accessKey: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                  placeholder="部分云服务需要额外的 Access Key"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {/* ── 高级选项 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">高级选项</h3>
            </div>

            <div className="space-y-3">
              {/* Gemini Grounding */}
              {form.vendor.toLowerCase().includes("gemini") && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.geminiGroundingEnabled}
                    onChange={(e) => setForm({ ...form, geminiGroundingEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/20"
                  />
                  <label className="text-sm text-slate-700">启用 Gemini Grounding（搜索增强）</label>
                </div>
              )}

              {/* 启用开关 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">启用状态</label>
                  <p className="text-xs text-slate-400">禁用后此 Provider 不会被路由策略选中</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    form.enabled ? "bg-amber-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      form.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
          </div>

          {/* 按钮组 - 固定在底部 */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? "保存中..." : isEditing ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Model 下拉选择组件：按 CallMode 过滤 + 支持自定义输入
const ModelSelect: React.FC<{
  providerType: ProviderType;
  value: string;
  onChange: (v: string) => void;
  models: { value: string; label: string }[];
}> = ({ providerType, value, onChange, models }) => {
  const isPresetValue = models.some((m) => m.value === value);
  const [isCustom, setIsCustom] = useState(!!value && !isPresetValue);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === CUSTOM_MODEL_VALUE) {
      setIsCustom(true);
      onChange("");
    } else {
      setIsCustom(false);
      onChange(selected);
    }
  };

  return (
    <div className="space-y-1.5">
      <select
        value={isCustom ? CUSTOM_MODEL_VALUE : value}
        onChange={handleSelectChange}
        className="w-full appearance-none px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 cursor-pointer"
      >
        {models.map((m) => (
          <option key={m.value} value={m.value}>{m.label}（{m.value}）</option>
        ))}
        <option value={CUSTOM_MODEL_VALUE}>✏️ 自定义输入...</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
          placeholder="输入自定义 Model 标识"
          autoFocus
        />
      )}
    </div>
  );
};

export default ProviderManagementPanel;