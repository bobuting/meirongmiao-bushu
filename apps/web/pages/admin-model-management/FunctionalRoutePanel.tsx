// apps/web/pages/admin-model-management/FunctionalRoutePanel.tsx
/**
 * 模型类型配置面板
 * 按 3 种类型切换模型：文本、图像、视频
 *
 * v2 改动：
 * - Provider 自动选择（只有一个时自动选中）
 * - 新增备用模型列表 UI
 */
import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { backendApi } from "../../services/backendApi";

// -----------------------------------------------------------------------------
// 功能类型定义
// -----------------------------------------------------------------------------

type ProviderType = "text" | "image" | "video";

// -----------------------------------------------------------------------------
// Provider 类型
// -----------------------------------------------------------------------------

interface ProviderRecord {
  id: string;
  name: string;
  type: "text" | "image" | "video";
  vendor: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  remark?: string | null;
}

// -----------------------------------------------------------------------------
// 模型类型配置状态
// -----------------------------------------------------------------------------

interface FunctionalRouteState {
  providerId: string;
  fallbackProviderIds: string[];
}

// -----------------------------------------------------------------------------
// 功能路由面板组件
// -----------------------------------------------------------------------------

export const FunctionalRoutePanel: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();

  // 本地状态：功能路由配置（用于编辑）
  const [localRoutes, setLocalRoutes] = useState<Record<ProviderType, FunctionalRouteState>>(
    {} as Record<ProviderType, FunctionalRouteState>
  );
  // 是否有未保存的更改
  const [hasChanges, setHasChanges] = useState(false);
  // 展开的备用模型面板
  const [expandedFallbacks, setExpandedFallbacks] = useState<Set<ProviderType>>(new Set());

  // 获取功能路由配置
  const {
    data: functionalRoutesData,
    isLoading: routesLoading,
    error: routesError,
  } = useQuery({
    queryKey: ["admin-functional-routes"],
    queryFn: () => backendApi.adminFunctionalRoutes(token!),
    enabled: !!token,
  });

  // 获取 Provider 列表（用于下拉选择）
  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => backendApi.adminProviders(token!),
    enabled: !!token,
  });

  const functionalRoutes = functionalRoutesData?.routes ?? [];
  const providers = (providersData?.providers ?? []) as ProviderRecord[];

  // 当后端数据加载完成时，初始化本地状态
  useEffect(() => {
    if (functionalRoutes.length > 0) {
      const initial: Record<string, FunctionalRouteState> = {};
      functionalRoutes.forEach((r) => {
        initial[r.type] = {
          providerId: r.providerId ?? "",
          fallbackProviderIds: r.fallbackProviderIds ?? [],
        };
      });
      setLocalRoutes(initial as Record<ProviderType, FunctionalRouteState>);
      setHasChanges(false);
    }
  }, [functionalRoutes]);

  // 根据 Provider 类型筛选可用模型
  const getProvidersForFunction = useMemo(() => {
    return (type: ProviderType): ProviderRecord[] => {
      const typeMapping: Record<ProviderType, string> = {
        text: "text",
        image: "image",
        video: "video",
      };
      const targetType = typeMapping[type];
      return providers.filter((p) => p.type === targetType && p.enabled);
    };
  }, [providers]);

  // 自动选择唯一的 Provider
  useEffect(() => {
    if (providers.length === 0 || functionalRoutes.length === 0) return;

    const updates: Partial<Record<ProviderType, FunctionalRouteState>> = {};
    const allTypes: ProviderType[] = ["text", "image", "video"];

    let hasUpdates = false;
    for (const type of allTypes) {
      const available = getProvidersForFunction(type);
      const current = localRoutes[type];

      // 如果只有一个可用 Provider 且当前未选择，自动选中
      if (available.length === 1 && (!current?.providerId || current.providerId === "")) {
        updates[type] = {
          providerId: available[0].id,
          fallbackProviderIds: current?.fallbackProviderIds ?? [],
        };
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      setLocalRoutes(prev => ({ ...prev, ...updates }) as Record<ProviderType, FunctionalRouteState>);
    }
  }, [providers, functionalRoutes, getProvidersForFunction]);

  // 批量保存配置
  const saveMutation = useMutation({
    mutationFn: async () => {
      const routesToSave = Object.entries(localRoutes)
        .filter(([_, state]) => state.providerId && state.providerId.length > 0)
        .map(([type, state]) => ({
          type,
          providerId: state.providerId,
          fallbackProviderIds: state.fallbackProviderIds,
          enabled: true,
        }));

      if (routesToSave.length === 0) {
        return { routes: [] };
      }

      return backendApi.adminBatchSetFunctionalRoutes(token!, { routes: routesToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-functional-routes"] });
      setHasChanges(false);
    },
  });

  // 处理主模型选择变更
  const handleProviderChange = (type: ProviderType, providerId: string) => {
    setLocalRoutes((prev) => {
      const current = prev[type] ?? { providerId: "", fallbackProviderIds: [] };
      // 如果主模型变更，从备用列表中移除
      const newFallbacks = current.fallbackProviderIds.filter(id => id !== providerId);
      return {
        ...prev,
        [type]: {
          providerId,
          fallbackProviderIds: newFallbacks,
        },
      };
    });
    setHasChanges(true);
  };

  // 处理备用模型添加
  const handleAddFallback = (type: ProviderType, providerId: string) => {
    setLocalRoutes((prev) => {
      const current = prev[type] ?? { providerId: "", fallbackProviderIds: [] };
      if (current.fallbackProviderIds.includes(providerId)) return prev;
      return {
        ...prev,
        [type]: {
          ...current,
          fallbackProviderIds: [...current.fallbackProviderIds, providerId],
        },
      };
    });
    setHasChanges(true);
  };

  // 处理备用模型移除
  const handleRemoveFallback = (type: ProviderType, providerId: string) => {
    setLocalRoutes((prev) => {
      const current = prev[type] ?? { providerId: "", fallbackProviderIds: [] };
      return {
        ...prev,
        [type]: {
          ...current,
          fallbackProviderIds: current.fallbackProviderIds.filter(id => id !== providerId),
        },
      };
    });
    setHasChanges(true);
  };

  // 处理备用模型排序（上移）
  const handleMoveFallbackUp = (type: ProviderType, index: number) => {
    if (index <= 0) return;
    setLocalRoutes((prev) => {
      const current = prev[type] ?? { providerId: "", fallbackProviderIds: [] };
      const newFallbacks = [...current.fallbackProviderIds];
      [newFallbacks[index - 1], newFallbacks[index]] = [newFallbacks[index], newFallbacks[index - 1]];
      return {
        ...prev,
        [type]: {
          ...current,
          fallbackProviderIds: newFallbacks,
        },
      };
    });
    setHasChanges(true);
  };

  // 处理备用模型排序（下移）
  const handleMoveFallbackDown = (type: ProviderType, index: number) => {
    setLocalRoutes((prev) => {
      const current = prev[type] ?? { providerId: "", fallbackProviderIds: [] };
      if (index >= current.fallbackProviderIds.length - 1) return prev;
      const newFallbacks = [...current.fallbackProviderIds];
      [newFallbacks[index], newFallbacks[index + 1]] = [newFallbacks[index + 1], newFallbacks[index]];
      return {
        ...prev,
        [type]: {
          ...current,
          fallbackProviderIds: newFallbacks,
        },
      };
    });
    setHasChanges(true);
  };

  // 获取 Provider 显示名称
  const getProviderDisplayName = (providerId: string): string => {
    const provider = providers.find((p) => p.id === providerId);
    return provider ? `${provider.name} (${provider.vendor} / ${provider.model})` : "未选择";
  };

  // 获取可添加的备用 Provider 列表
  const getAvailableFallbacks = (type: ProviderType): ProviderRecord[] => {
    const current = localRoutes[type];
    const mainProviderId = current?.providerId ?? "";
    const existingFallbacks = current?.fallbackProviderIds ?? [];
    return getProvidersForFunction(type).filter(
      (p) => p.id !== mainProviderId && !existingFallbacks.includes(p.id)
    );
  };

  // UI 元素映射
  const typeMeta: Record<ProviderType, { label: string; icon: string; description: string }> = {
    text: { label: "文本模型", icon: "📝", description: "用于文本生成和理解任务" },
    image: { label: "图像模型", icon: "🎨", description: "用于图像生成和处理任务" },
    video: { label: "视频模型", icon: "📹", description: "用于视频生成和处理任务" },
  };

  const isLoading = routesLoading || providersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (routesError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-500 text-sm">加载功能路由配置失败，请刷新页面重试</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题区域 */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
        {/* 背景网格 */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />
        {/* 渐变光晕 */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/10 rounded-full blur-2xl" />

        <div className="relative z-10">
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-3">
            <span className="text-2xl">🎛️</span>
            功能路由配置
          </h2>
          <p className="text-slate-400 text-sm">
            为每种类型选择主模型和备用模型。主模型不可用时自动切换到备用模型。
          </p>
        </div>
      </div>

      {/* 功能路由表格 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* 表头 */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-600">
            <div className="col-span-3">模型类型</div>
            <div className="col-span-2 text-center">说明</div>
            <div className="col-span-5">模型配置</div>
            <div className="col-span-2 text-center">状态</div>
          </div>
        </div>

        {/* 表格内容 */}
        <div className="divide-y divide-slate-100">
          {(Object.keys(typeMeta) as ProviderType[]).map((type) => {
            const meta = typeMeta[type];
            const availableProviders = getProvidersForFunction(type);
            const currentState = localRoutes[type] ?? { providerId: "", fallbackProviderIds: [] };
            const hasValue = currentState.providerId && currentState.providerId.length > 0;
            const isExpanded = expandedFallbacks.has(type);
            const availableFallbacks = getAvailableFallbacks(type);

            return (
              <div
                key={type}
                className="px-6 py-4 hover:bg-slate-50/50 transition-colors duration-200"
              >
                <div className="space-y-3">
                  {/* 主行 */}
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* 功能名称 */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/50"
                      >
                        {meta.icon}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{meta.label}</div>
                        <div className="text-xs text-slate-500">{meta.description}</div>
                      </div>
                    </div>

                    {/* 说明 */}
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="text-xs text-slate-500">{meta.description}</span>
                    </div>

                    {/* 主模型选择器 */}
                    <div className="col-span-5">
                      {availableProviders.length > 0 ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <select
                              value={currentState.providerId}
                              onChange={(e) => handleProviderChange(type, e.target.value)}
                              className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all cursor-pointer hover:border-slate-300"
                            >
                              <option value="">-- 选择模型 --</option>
                              {availableProviders.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.vendor} / {p.model})
                                </option>
                              ))}
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {/* 备用模型数量提示 */}
                          {currentState.fallbackProviderIds.length > 0 && (
                            <button
                              onClick={() => setExpandedFallbacks(prev => {
                                const next = new Set(prev);
                                if (next.has(type)) next.delete(type);
                                else next.add(type);
                                return next;
                              })}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isExpanded ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} />
                              </svg>
                              {currentState.fallbackProviderIds.length} 个备用模型
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm text-slate-400 text-center">
                          暂不支持
                        </div>
                      )}
                    </div>

                    {/* 状态 */}
                    <div className="col-span-2 flex justify-center">
                      {hasValue ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          已配置
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-400 text-xs font-medium rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          未配置
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 展开的备用模型列表 */}
                  {isExpanded && hasValue && (
                    <div className="ml-14 border-t border-slate-100 pt-3">
                      {currentState.fallbackProviderIds.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-slate-500 mb-2">备用模型优先级（从上到下）</div>
                          {currentState.fallbackProviderIds.map((fallbackId, idx) => (
                            <div key={fallbackId} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 font-mono w-4">{idx + 1}</span>
                                <span className="text-sm text-slate-700">{getProviderDisplayName(fallbackId)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleMoveFallbackUp(type, idx)}
                                  disabled={idx === 0}
                                  className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                  title="上移"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleMoveFallbackDown(type, idx)}
                                  disabled={idx === currentState.fallbackProviderIds.length - 1}
                                  className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                  title="下移"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleRemoveFallback(type, fallbackId)}
                                  className="p-1 text-red-400 hover:text-red-600"
                                  title="移除"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 mb-3">暂无备用模型</div>
                      )}

                      {/* 添加备用模型 */}
                      {availableFallbacks.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddFallback(type, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="flex-1 appearance-none bg-white border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                          >
                            <option value="">+ 添加备用模型</option>
                            {availableFallbacks.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.vendor} / {p.model})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 快捷添加备用模型入口 */}
                  {!isExpanded && hasValue && availableFallbacks.length > 0 && (
                    <div className="ml-14">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddFallback(type, e.target.value);
                            setExpandedFallbacks(prev => new Set(prev).add(type));
                          }
                        }}
                        className="appearance-none bg-transparent border-none text-xs text-amber-500 hover:text-amber-600 cursor-pointer focus:outline-none"
                      >
                        <option value="">+ 添加备用</option>
                        {availableFallbacks.slice(0, 3).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        {availableFallbacks.length > 3 && (
                          <option value="__more__">更多 {availableFallbacks.length - 3} 个...</option>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部操作栏 */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              已配置 {Object.values(localRoutes).filter((s) => s.providerId && s.providerId.length > 0).length} /{" "}
              3 个类型
              {hasChanges && (
                <span className="text-amber-600 ml-2">（有未保存的更改）</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // 重置为后端当前保存的值
                  const reset: Record<string, FunctionalRouteState> = {};
                  functionalRoutes.forEach((r) => {
                    reset[r.type] = {
                      providerId: r.providerId ?? "",
                      fallbackProviderIds: r.fallbackProviderIds ?? [],
                    };
                  });
                  setLocalRoutes(reset as Record<ProviderType, FunctionalRouteState>);
                  setHasChanges(false);
                  setExpandedFallbacks(new Set());
                }}
                disabled={!hasChanges}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                重置
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !hasChanges}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    保存中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    保存配置
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="bg-amber-50 border border-amber-200/50 rounded-xl p-4 flex items-start gap-3">
        <div className="text-amber-500 mt-0.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="text-sm text-amber-800">
          <div className="font-medium mb-1">配置说明</div>
          <ul className="text-amber-700 space-y-1">
            <li>• <strong>主模型</strong>：优先使用的模型，所有请求首先发送到该模型</li>
            <li>• <strong>备用模型</strong>：主模型失败时自动切换，按列表顺序尝试</li>
            <li>• <strong>文本模型</strong>：用于文本生成和理解任务</li>
            <li>• <strong>图像模型</strong>：用于图像生成和处理任务</li>
            <li>• <strong>视频模型</strong>：用于视频生成和处理任务</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FunctionalRoutePanel;