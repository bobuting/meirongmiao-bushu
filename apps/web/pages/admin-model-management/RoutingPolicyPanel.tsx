// apps/web/pages/admin-model-management/RoutingPolicyPanel.tsx
/**
 * 路由策略配置面板
 * 支持完整的 CRUD 操作：创建、编辑、删除策略
 * 根据 Provider 类型（text/image/video）筛选可用 Provider
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { backendApi } from "../../services/backendApi";
import { CopyableText } from "../../components/ui/CopyableText";

// -----------------------------------------------------------------------------
// Provider 类型定义（统一 3 类型系统）
// -----------------------------------------------------------------------------

type ProviderType = "text" | "image" | "video";

// -----------------------------------------------------------------------------
// Provider 类型定义
// -----------------------------------------------------------------------------

interface ProviderRecord {
  id: string;
  name: string;
  type: ProviderType;  // 修改为 ProviderType
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: "openai" | "gemini" | "dashscope" | "dashscope-stream" | "kling" | "kling-video-official" | "veo" | "doubao" | "wanx" | "wanx-video-bailian" | "jimeng";
  enabled: boolean;
  hasSecret?: boolean;
  maskedSecret?: string | null;
  remark?: string | null;
}

// -----------------------------------------------------------------------------
// 路由策略类型定义
// -----------------------------------------------------------------------------

interface RoutingPolicy {
  id: string;
  routeKey: string;
  type: ProviderType;  // 替换 functionalKey 为 type
  primaryProviderId: string;
  fallbackProviderIds: string[];
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  description: string;
  sortOrder: number;
  updatedAt: number;
}

/** 防御性归一化：确保 fallbackProviderIds 始终为 string[] */
function normalizeFallbackIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((item): item is string => typeof item === "string");
}

// -----------------------------------------------------------------------------
// 策略面板组件
// -----------------------------------------------------------------------------

export const RoutingPolicyPanel: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();

  // 弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<RoutingPolicy | null>(null);
  const [copyingPolicy, setCopyingPolicy] = useState<RoutingPolicy | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // 主模型切换确认
  const [switchProviderConfirm, setSwitchProviderConfirm] = useState<{
    policyId: string;
    policyName: string;
    oldProviderId: string;
    newProviderId: string;
    oldProviderName: string;
    newProviderName: string;
  } | null>(null);

  // 内联编辑说明
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editingDescriptionText, setEditingDescriptionText] = useState("");

  // 拖动排序
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 测试弹窗
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testingPolicy, setTestingPolicy] = useState<RoutingPolicy | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<{ sample: string; latencyMs: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [videoUploadFile, setVideoUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 过滤状态
  const [filterRouteKey, setFilterRouteKey] = useState<string>(""); // 业务场景搜索文字
  const [filterType, setFilterType] = useState<ProviderType | "">("");  // 替换 filterModelType 和 filterFunctionalKey
  const [filterProviderId, setFilterProviderId] = useState<string>("");

  // 排序状态：sortOrder | updatedAt_asc | updatedAt_desc
  const [sortBy, setSortBy] = useState<string>("sortOrder");

  // 操作反馈
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 反馈自动消失
  React.useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  // 获取路由策略列表（切换 tab 时不刷新，使用缓存）
  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ["admin-policies"],
    queryFn: () => backendApi.adminProviderPolicies(token!),
    enabled: !!token,
    staleTime: Infinity,
  });

  // 获取 Provider 列表（切换 tab 时不刷新，使用缓存）
  const { data: providersData } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => backendApi.adminProviders(token!),
    enabled: !!token,
    staleTime: Infinity,
  });

  const policies = ((policiesData?.policies ?? []) as RoutingPolicy[]).map(
    (p) => ({ ...p, fallbackProviderIds: normalizeFallbackIds(p.fallbackProviderIds) }),
  );
  const providers = (providersData?.providers ?? []) as ProviderRecord[];

  // 过滤后的策略列表
  const filteredPolicies = React.useMemo(() => {
    let result = policies.filter((policy) => {
      // 业务场景过滤（模糊匹配）
      if (filterRouteKey && !policy.routeKey.toLowerCase().includes(filterRouteKey.toLowerCase())) {
        return false;
      }
      // 类型过滤（直接检查 policy.type）
      if (filterType && policy.type !== filterType) {
        return false;
      }
      // 模型过滤（匹配主模型或备用模型）
      if (filterProviderId) {
        const isPrimary = policy.primaryProviderId === filterProviderId;
        const isFallback = policy.fallbackProviderIds.includes(filterProviderId);
        if (!isPrimary && !isFallback) {
          return false;
        }
      }
      return true;
    });

    // 排序
    if (sortBy === "sortOrder") {
      result = [...result].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    } else if (sortBy === "updatedAt_asc") {
      result = [...result].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
    } else if (sortBy === "updatedAt_desc") {
      result = [...result].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    }

    return result;
  }, [policies, filterRouteKey, filterType, filterProviderId, sortBy]);

  // 获取所有业务场景（用于下拉）
  const allRouteKeys = React.useMemo(() => {
    const keys = new Set(policies.map((p) => p.routeKey));
    return Array.from(keys).sort();
  }, [policies]);

  // 获取所有被使用的 Provider（用于下拉）
  const usedProviderIds = React.useMemo(() => {
    const ids = new Set<string>();
    policies.forEach((p) => {
      ids.add(p.primaryProviderId);
      p.fallbackProviderIds.forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  }, [policies]);

  const usedProviders = providers.filter((p) => usedProviderIds.includes(p.id));

  // 创建策略 Mutation
  const createMutation = useMutation({
    mutationFn: (payload: {
      routeKey: string;
      type: ProviderType;  // 替换 functionalKey
      primaryProviderId: string;
      fallbackProviderIds?: string[];
      timeoutMs?: number;
      retryCount?: number;
      enabled?: boolean;
      description?: string;
    }) => backendApi.adminCreateProviderPolicy(token!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-policies"] });
      setFeedback({ type: "success", message: "策略创建成功" });
      setShowModal(false);
      setEditingPolicy(null);
      setCopyingPolicy(null);
    },
  });

  // 更新策略 Mutation
  const updateMutation = useMutation({
    mutationFn: ({
      policyId,
      payload,
    }: {
      policyId: string;
      payload: Partial<RoutingPolicy>;
    }) => backendApi.adminUpdateProviderPolicy(token!, policyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-policies"] });
      setFeedback({ type: "success", message: "策略更新成功" });
      setShowModal(false);
      setEditingPolicy(null);
      setCopyingPolicy(null);
    },
  });

  // 删除策略 Mutation
  const deleteMutation = useMutation({
    mutationFn: (policyId: string) => backendApi.adminDeleteProviderPolicy(token!, policyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-policies"] });
      setFeedback({ type: "success", message: "策略删除成功" });
      setShowDeleteConfirm(null);
    },
  });

  // 保存说明
  const saveDescription = async (policyId: string) => {
    if (!editingDescriptionText.trim()) return;
    try {
      await updateMutation.mutateAsync({
        policyId,
        payload: { description: editingDescriptionText.trim() },
      });
    } catch (e) {
      console.warn('[RoutingPolicyPanel] 描述更新失败:', policyId, e);
    }
    setEditingDescriptionId(null);
    setEditingDescriptionText("");
  };

  // 拖动处理
  const handleDragStart = (_e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (_e: React.DragEvent, _index: number) => {
    // Drop handled in handleDragEnd
  };
  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      // 基于过滤后的列表重新排序
      const reordered = [...filteredPolicies];
      const [moved] = reordered.splice(draggedIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);

      // 批量更新 sortOrder（只更新有变化的）
      reordered.forEach((policy, idx) => {
        const newSortOrder = idx;
        if (policy.sortOrder !== newSortOrder) {
          updateMutation.mutate({
            policyId: policy.id,
            payload: { sortOrder: newSortOrder },
          });
        }
      });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 测试处理
  const openTestDialog = (policy: RoutingPolicy) => {
    setTestingPolicy(policy);
    setTestInput("");
    setTestResult(null);
    setTestError(null);
    setVideoUploadFile(null);
    setShowTestDialog(true);
  };
  const closeTestDialog = () => {
    setShowTestDialog(false);
    setTestingPolicy(null);
    setTestInput("");
    setTestResult(null);
    setTestError(null);
    setVideoUploadFile(null);
  };
  const runTest = async () => {
    if (!testingPolicy || !token) return;
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      let videoUrl: string | undefined;
      if (testingPolicy.type === "video" && videoUploadFile) {  // 使用 type 判断
        setUploading(true);
        // 将文件转为 base64 data URL 作为临时 URL
        videoUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(videoUploadFile);
        });
        setUploading(false);
      }
      const result = await backendApi.adminTestProviderPolicy(token, testingPolicy.id, {
        userInput: testInput || undefined,
        videoUrl,
      });
      setTestResult({ sample: result.sample, latencyMs: result.latencyMs });
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  // 打开创建弹窗
  const handleCreate = () => {
    setEditingPolicy(null);
    setShowModal(true);
  };

  // 打开编辑弹窗
  const handleEdit = (policy: RoutingPolicy) => {
    setEditingPolicy(policy);
    setShowModal(true);
  };

  // 确认删除
  const handleDeleteConfirm = (policyId: string) => {
    setShowDeleteConfirm(policyId);
  };

  // 执行删除
  const handleDelete = (policyId: string) => {
    deleteMutation.mutate(policyId);
  };

  // 根据 type 筛选可用 Provider（替换 getProvidersForFunctionalKey）
  const getProvidersForType = (type: ProviderType): ProviderRecord[] => {
    return providers.filter((p) => p.type === type && p.enabled);
  };

  // 获取类型显示信息
  const getTypeDisplay = (type: ProviderType) => {
    const displays = {
      text: { icon: "📝", label: "文本" },
      image: { icon: "🎨", label: "图像" },
      video: { icon: "📹", label: "视频" },
    };
    return displays[type];
  };

  if (policiesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* 过滤工具栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 类型过滤 - 简单 3 选项按钮组 */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setFilterType("")}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              filterType === ""
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterType("text")}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              filterType === "text"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            📝 文本
          </button>
          <button
            onClick={() => setFilterType("image")}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              filterType === "image"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            🎨 图像
          </button>
          <button
            onClick={() => setFilterType("video")}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              filterType === "video"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            📹 视频
          </button>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-slate-200" />

        {/* 业务场景 */}
        <div className="relative">
          <input
            type="text"
            value={filterRouteKey}
            onChange={(e) => setFilterRouteKey(e.target.value)}
            placeholder="业务场景"
            className="w-[140px] px-3 py-1.5 pr-8 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
          />
          <select
            value={filterRouteKey}
            onChange={(e) => setFilterRouteKey(e.target.value)}
            className="absolute right-0 top-0 h-full w-8 opacity-0 cursor-pointer"
          >
            <option value="">全部</option>
            {allRouteKeys.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
          <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* 模型 */}
        <select
          value={filterProviderId}
          onChange={(e) => setFilterProviderId(e.target.value)}
          className="w-[150px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
        >
          <option value="">全部模型</option>
          {usedProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.vendor})
            </option>
          ))}
        </select>

        {/* 清除过滤 */}
        {(filterRouteKey || filterType || filterProviderId) && (
          <button
            onClick={() => {
              setFilterRouteKey("");
              setFilterType("");
              setFilterProviderId("");
            }}
            className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            清除
          </button>
        )}

        {/* 统计 */}
        <div className="ml-auto text-sm text-slate-500">
          {filteredPolicies.length} / {policies.length} 条
        </div>
      </div>

      {/* 策略列表表格 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3" style={{ width: 40 }}></th>
              <th className="text-left px-2 py-3 font-medium text-slate-600" style={{ width: 200 }}>业务场景</th>
              <th className="text-left px-2 py-3 font-medium text-slate-600" style={{ width: 90 }}>类型</th>
              <th className="text-left px-2 py-3 font-medium text-slate-600" style={{ width: 260 }}>主模型</th>
              <th className="text-center px-2 py-3 font-medium text-slate-600" style={{ width: 60 }}>超时</th>
              <th className="text-center px-2 py-3 font-medium text-slate-600" style={{ width: 60 }}>备用</th>
              <th className="text-left px-2 py-3 font-medium text-slate-600" style={{ width: 120 }}>
                <button
                  onClick={() => {
                    if (sortBy === "updatedAt_desc") setSortBy("updatedAt_asc");
                    else if (sortBy === "updatedAt_asc") setSortBy("sortOrder");
                    else setSortBy("updatedAt_desc");
                  }}
                  className={`flex items-center gap-1 hover:text-slate-900 transition-colors ${sortBy.includes("updatedAt") ? "text-amber-600" : ""}`}
                >
                  修改时间
                  {sortBy === "updatedAt_desc" && <span className="text-xs">↓</span>}
                  {sortBy === "updatedAt_asc" && <span className="text-xs">↑</span>}
                  {sortBy === "sortOrder" && <span className="text-xs text-slate-400">↕</span>}
                </button>
              </th>
              <th className="text-left px-2 py-3 font-medium text-slate-600" style={{ width: 80 }}>说明</th>
              <th className="text-center px-2 py-3 font-medium text-slate-600" style={{ width: 140 }}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPolicies.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <div className="text-4xl mb-3">📋</div>
                  <div>{policies.length === 0 ? "暂无路由策略，点击下方按钮创建" : "没有匹配的策略"}</div>
                </td>
              </tr>
            ) : (
              filteredPolicies.map((policy, index) => {
                const typeDisplay = getTypeDisplay(policy.type);  // 替换 getFunctionalKeyDisplay
                const fallbackProviders = providers.filter((p) => policy.fallbackProviderIds.includes(p.id));
                const isDragOver = dragOverIndex === index;

                return (
                  <tr
                    key={policy.id}
                    className={`hover:bg-slate-50/50 ${isDragOver ? "bg-amber-50" : ""}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <td className="px-4 py-3">
                      <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600" title="拖动排序">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                        </svg>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-900"><CopyableText text={policy.routeKey} /></div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${policy.enabled ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${policy.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {policy.enabled ? "启用" : "禁用"}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <div className="w-6 h-6 rounded flex items-center justify-center text-xs bg-gradient-to-br from-amber-50 to-orange-50">{typeDisplay.icon}</div>
                        <div className="text-xs text-slate-700">{typeDisplay.label}</div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {(() => {
                        const availableProvs = getProvidersForType(policy.type);  // 替换 getProvidersForFunctionalKey
                        const currentProvider = providers.find((p) => p.id === policy.primaryProviderId);
                        return (
                          <select
                            value={policy.primaryProviderId}
                            onChange={(e) => {
                              const newProviderId = e.target.value;
                              if (newProviderId && newProviderId !== policy.primaryProviderId) {
                                const newProvider = providers.find((p) => p.id === newProviderId);
                                setSwitchProviderConfirm({
                                  policyId: policy.id,
                                  policyName: policy.routeKey,
                                  oldProviderId: policy.primaryProviderId,
                                  newProviderId,
                                  oldProviderName: currentProvider ? `${currentProvider.name} (${currentProvider.vendor})` : "未配置",
                                  newProviderName: newProvider ? `${newProvider.name} (${newProvider.vendor})` : "未配置",
                                });
                              }
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                          >
                            <option value="">-- 未配置 --</option>
                            {availableProvs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.vendor} / {p.model})</option>)}
                          </select>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-slate-600">{policy.timeoutMs ? `${Math.round(policy.timeoutMs / 1000)}秒` : "300秒"}</td>
                    <td className="px-2 py-3 text-center text-xs text-slate-600">{fallbackProviders.length > 0 ? `${fallbackProviders.length} 个` : <span className="text-slate-400">无</span>}</td>
                    <td className="px-2 py-3 text-xs text-slate-500">{policy.updatedAt ? new Date(policy.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="px-2 py-3">
                      {editingDescriptionId === policy.id ? (
                        <input
                          type="text"
                          value={editingDescriptionText}
                          onChange={(e) => setEditingDescriptionText(e.target.value)}
                          onBlur={() => saveDescription(policy.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveDescription(policy.id); if (e.key === "Escape") { setEditingDescriptionId(null); setEditingDescriptionText(""); } }}
                          className="w-full px-2 py-1 border border-amber-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                          autoFocus
                        />
                      ) : (
                        <span onClick={() => { setEditingDescriptionId(policy.id); setEditingDescriptionText(policy.description); }} className="cursor-pointer hover:text-amber-600 text-slate-600 text-xs truncate block" title={policy.description || "点击编辑"}>
                          {policy.description || <span className="text-slate-400 italic">添加...</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openTestDialog(policy)} className="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded">测试</button>
                        <button onClick={() => setCopyingPolicy(policy)} className="px-2 py-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded">复制</button>
                        <button onClick={() => handleEdit(policy)} className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded">编辑</button>
                        <button onClick={() => handleDeleteConfirm(policy.id)} className="px-2 py-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded">删除</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* 底部操作栏 */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              已配置 {policies.length} 个策略
              {filteredPolicies.length !== policies.length && (
                <span className="ml-2 text-amber-600">（筛选后 {filteredPolicies.length} 条）</span>
              )}
            </div>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-amber-500/20 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新增策略
            </button>
          </div>
        </div>
      </div>

      {/* 创建/编辑/复制弹窗 */}
      {(showModal || editingPolicy || copyingPolicy) && (
        <PolicyModal
          key={editingPolicy?.id ?? `copy-${copyingPolicy?.id}`}
          editingPolicy={editingPolicy}
          copyingPolicy={copyingPolicy}
          providers={providers}
          policies={policies}
          getProvidersForType={getProvidersForType}
          onCreate={(payload) => createMutation.mutate(payload)}
          onUpdate={(policyId, payload) => updateMutation.mutate({ policyId, payload })}
          onClose={() => {
            setShowModal(false);
            setEditingPolicy(null);
            setCopyingPolicy(null);
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">确认删除</h3>
            <p className="text-sm text-slate-600 mb-6">
              删除后无法恢复，确定要删除此路由策略吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主模型切换确认弹窗 */}
      {switchProviderConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">确认切换主模型</h3>
            <p className="text-sm text-slate-600 mb-2">
              策略：<span className="font-medium text-slate-900">{switchProviderConfirm.policyName}</span>
            </p>
            <p className="text-sm text-slate-600 mb-2">
              当前主模型：<span className="font-medium text-slate-900">{switchProviderConfirm.oldProviderName}</span>
            </p>
            <p className="text-sm text-slate-600 mb-4">
              切换为：<span className="font-medium text-amber-600">{switchProviderConfirm.newProviderName}</span>
            </p>
            <p className="text-sm text-slate-500 mb-6">
              确定要切换主模型吗？此操作会立即生效。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSwitchProviderConfirm(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  updateMutation.mutate({
                    policyId: switchProviderConfirm.policyId,
                    payload: { primaryProviderId: switchProviderConfirm.newProviderId },
                  });
                  setSwitchProviderConfirm(null);
                }}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? "切换中..." : "确认切换"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 测试弹窗 */}
      {showTestDialog && testingPolicy && (
        <TestDialog
          policy={testingPolicy}
          token={token!}
          onClose={closeTestDialog}
          testInput={testInput}
          setTestInput={setTestInput}
          testResult={testResult}
          testError={testError}
          testing={testing}
          uploading={uploading}
          videoUploadFile={videoUploadFile}
          setVideoUploadFile={setVideoUploadFile}
          runTest={runTest}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 测试弹窗组件
// -----------------------------------------------------------------------------

interface TestDialogProps {
  policy: RoutingPolicy;
  token: string;
  onClose: () => void;
  testInput: string;
  setTestInput: (v: string) => void;
  testResult: { sample: string; latencyMs: number } | null;
  testError: string | null;
  testing: boolean;
  uploading: boolean;
  videoUploadFile: File | null;
  setVideoUploadFile: (f: File | null) => void;
  runTest: () => void;
}

const TEST_INPUT_PLACEHOLDERS: Record<ProviderType, string> = {
  text: "请输入测试文本，例如：你好，请简单介绍一下自己",
  image: "请输入图片描述，例如：一只在草地上奔跑的金色猎犬",
  video: "请输入视频描述，例如：一朵花在阳光下缓缓绽放",
};

const TestDialog: React.FC<TestDialogProps> = ({
  policy,
  onClose,
  testInput,
  setTestInput,
  testResult,
  testError,
  testing,
  uploading,
  videoUploadFile,
  setVideoUploadFile,
  runTest,
}) => {
  const type = policy.type;  // 替换 funcKey
  const isVideo = type === "video";  // 简化判断逻辑

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-1">
          测试策略：{policy.routeKey}
          <span className="text-sm text-slate-500 ml-2">
            ({getTypeDisplay(type).icon} {getTypeDisplay(type).label})
          </span>
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          说明：{policy.description || "无"}
        </p>

        {/* 测试输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            测试输入
          </label>
          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder={TEST_INPUT_PLACEHOLDERS[type]}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
            rows={3}
          />
        </div>

        {/* 视频专用：视频上传 */}
        {isVideo && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              视频文件
            </label>
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => setVideoUploadFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {uploading && <div className="text-sm text-slate-500 mt-1">处理中...</div>}
            {videoUploadFile && (
              <div className="text-xs text-slate-500 mt-1">
                已选择：{videoUploadFile.name} ({(videoUploadFile.size / 1024 / 1024).toFixed(1)}MB)
              </div>
            )}
          </div>
        )}

        {/* 结果展示 */}
        {testResult && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm font-medium text-green-800 mb-1">测试结果（成功）</div>
            <pre className="text-xs text-green-700 whitespace-pre-wrap max-h-40 overflow-auto">
              {testResult.sample}
            </pre>
            <div className="text-xs text-green-500 mt-1">耗时：{testResult.latencyMs}ms</div>
          </div>
        )}
        {testError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-sm font-medium text-red-800 mb-1">测试失败</div>
            <pre className="text-xs text-red-700 whitespace-pre-wrap max-h-40 overflow-auto">
              {testError}
            </pre>
          </div>
        )}

        {/* 按钮 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            关闭
          </button>
          <button
            onClick={runTest}
            disabled={testing || uploading || (isVideo && !videoUploadFile)}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {testing ? "测试中..." : "发送测试"}
          </button>
        </div>
      </div>
    </div>
  );
};

// 获取类型显示信息（提取为独立函数供 TestDialog 使用）
function getTypeDisplay(type: ProviderType) {
  const displays = {
    text: { icon: "📝", label: "文本" },
    image: { icon: "🎨", label: "图像" },
    video: { icon: "📹", label: "视频" },
  };
  return displays[type];
}

// -----------------------------------------------------------------------------
// 创建/编辑策略弹窗组件
// -----------------------------------------------------------------------------

interface PolicyModalProps {
  editingPolicy: RoutingPolicy | null;
  copyingPolicy: RoutingPolicy | null;
  providers: ProviderRecord[];
  policies: RoutingPolicy[];
  getProvidersForType: (type: ProviderType) => ProviderRecord[];  // 替换 getProvidersForFunctionalKey
  onCreate: (payload: {
    routeKey: string;
    type: ProviderType;  // 替换 functionalKey
    primaryProviderId: string;
    fallbackProviderIds?: string[];
    timeoutMs?: number;
    retryCount?: number;
    enabled?: boolean;
    description?: string;
  }) => void;
  onUpdate: (policyId: string, payload: Partial<RoutingPolicy>) => void;
  onClose: () => void;
  isLoading: boolean;
}

const PolicyModal: React.FC<PolicyModalProps> = ({
  editingPolicy,
  copyingPolicy,
  providers: _providers,
  policies,
  getProvidersForType,
  onCreate,
  onUpdate,
  onClose,
  isLoading,
}) => {
  const isEditing = !!editingPolicy;
  const isCopying = !!copyingPolicy;
  const sourcePolicy = editingPolicy ?? copyingPolicy;

  // 表单状态
  const [routeKey, setRouteKey] = useState(copyingPolicy ? `${copyingPolicy.routeKey}_copy` : (editingPolicy?.routeKey ?? ""));
  const [description, setDescription] = useState(sourcePolicy?.description ?? "");
  const [type, setType] = useState<ProviderType>(  // 替换 functionalKey
    sourcePolicy?.type ?? "text"
  );
  const [primaryProviderId, setPrimaryProviderId] = useState(
    sourcePolicy?.primaryProviderId ?? ""
  );
  const [fallbackProviderIds, setFallbackProviderIds] = useState<string[]>(
    sourcePolicy?.fallbackProviderIds ?? []
  );
  // 超时时间内部使用秒数显示，提交时转换为毫秒
  const timeoutSecFromMs = (ms: number | null | undefined): number => {
    if (!ms) return 300; // 默认 5 分钟
    return Math.round(ms / 1000);
  };
  const [timeoutSec, setTimeoutSec] = useState<number>(
    timeoutSecFromMs(sourcePolicy?.timeoutMs)
  );
  const [retryCount, setRetryCount] = useState(sourcePolicy?.retryCount ?? 2);
  const [enabled, setEnabled] = useState(sourcePolicy?.enabled ?? true);

  // 错误状态
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 可用 Provider（根据 type 筛选）
  const availableProviders = getProvidersForType(type);  // 替换 getProvidersForFunctionalKey

  // 校验表单
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!routeKey.trim()) {
      newErrors.routeKey = "业务场景名称不能为空";
    } else if (!isEditing) {
      const duplicate = policies.some(
        (p) => p.routeKey === routeKey.trim() && p.type === type  // 替换 functionalKey
      );
      if (duplicate) {
        newErrors.routeKey = "该类型下已存在相同业务场景";
      }
    }

    if (!description.trim()) {
      newErrors.description = "说明不能为空";
    }

    if (!primaryProviderId) {
      newErrors.primaryProviderId = "请选择主模型";
    }

    if (timeoutSec < 5) {
      newErrors.timeoutMs = "超时时间不能小于 5 秒";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 提交表单
  const handleSubmit = () => {
    if (!validate()) return;

    const resolvedTimeoutMs = timeoutSec * 1000;

    if (editingPolicy) {
      onUpdate(editingPolicy.id, {
        routeKey: routeKey.trim(),
        type,  // 替换 functionalKey
        primaryProviderId,
        fallbackProviderIds,
        timeoutMs: resolvedTimeoutMs,
        retryCount,
        enabled,
        description: description.trim(),
      });
    } else {
      onCreate({
        routeKey: routeKey.trim(),
        type,  // 替换 functionalKey
        primaryProviderId,
        fallbackProviderIds,
        timeoutMs: resolvedTimeoutMs,
        retryCount,
        enabled,
        description: description.trim(),
      });
    }
  };

  // 切换类型
  const handleTypeChange = (newType: ProviderType) => {  // 替换 handleFunctionalKeyChange
    setType(newType);
  };

  // 备用模型多选处理（不允许选择已选主模型）
  const handleFallbackToggle = (providerId: string) => {
    if (providerId === primaryProviderId) return;
    setFallbackProviderIds((prev) =>
      prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId]
    );
  };

  // 类型卡片配色（与 Provider 弹窗保持一致）
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
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? "编辑策略" : isCopying ? "复制策略" : "创建策略"}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">配置业务场景的模型路由规则和容错策略</p>
        </div>

        {/* 表单内容 - 可滚动区域 */}
        <div className="p-6 space-y-6 overflow-y-auto scrollbar-hide flex-1 min-h-0">
          {/* ── 基本信息 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">基本信息</h3>
            </div>

            <div className="space-y-4">
              {/* 业务场景 + 说明 并排 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    业务场景 {!isEditing && "*"}
                  </label>
                  {isEditing ? (
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 select-all font-mono">
                      {routeKey}
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={routeKey}
                        onChange={(e) => setRouteKey(e.target.value)}
                        placeholder="如：script_generation"
                        className={`w-full px-3 py-2 border ${
                          errors.routeKey ? "border-red-300" : "border-slate-200"
                        } rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400`}
                      />
                      {errors.routeKey && (
                        <p className="text-xs text-red-500 mt-1">{errors.routeKey}</p>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">说明 *</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="简要说明用途"
                    className={`w-full px-3 py-2 border ${
                      errors.description ? "border-red-300" : "border-slate-200"
                    } rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400`}
                  />
                  {errors.description && (
                    <p className="text-xs text-red-500 mt-1">{errors.description}</p>
                  )}
                </div>
              </div>

              {/* 类型卡片 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">类型 *</label>
                <div className="flex items-center gap-2">
                  {(["text", "image", "video"] as ProviderType[]).map((t) => {
                    const cardColor = typeCardColors[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleTypeChange(t)}
                        className={`flex-1 px-3 py-3 rounded-xl border-2 transition-all ${
                          type === t
                            ? cardColor.active
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        }`}
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
            </div>
          </div>

          {/* ── 模型配置 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold text-slate-800">模型配置</h3>
            </div>

            <div className="space-y-4">
              {/* 主模型 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">主模型 *</label>
                <div className="relative">
                  <select
                    value={primaryProviderId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setPrimaryProviderId(newId);
                      setFallbackProviderIds((prev) => prev.filter((id) => id !== newId));
                    }}
                    className={`w-full appearance-none px-3 py-2 pr-10 border ${
                      errors.primaryProviderId ? "border-red-300" : "border-slate-200"
                    } rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 cursor-pointer`}
                  >
                    <option value="">-- 请选择主模型 --</option>
                    {availableProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.vendor} / {p.model}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {errors.primaryProviderId && (
                  <p className="text-xs text-red-500 mt-1">{errors.primaryProviderId}</p>
                )}
              </div>

              {/* 备用模型 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  备用模型 <span className="text-slate-400 font-normal">(可选，主模型失败后按顺序尝试)</span>
                </label>
                <div className="border border-slate-200 rounded-xl p-2 max-h-36 overflow-y-auto space-y-0.5">
                  {availableProviders.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-4">
                      当前类型下无可用 Provider
                    </div>
                  ) : (
                    availableProviders
                      .filter((p) => p.id !== primaryProviderId)
                      .map((p) => (
                        <label
                          key={p.id}
                          className={`flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
                            fallbackProviderIds.includes(p.id)
                              ? "bg-amber-50 hover:bg-amber-100/80"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={fallbackProviderIds.includes(p.id)}
                            onChange={() => handleFallbackToggle(p.id)}
                            className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/20"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                            <div className="text-xs text-slate-400">{p.vendor} · {p.model}</div>
                          </div>
                          {fallbackProviderIds.includes(p.id) && (
                            <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                              #{fallbackProviderIds.indexOf(p.id) + 1}
                            </span>
                          )}
                        </label>
                      ))
                  )}
                </div>
                {fallbackProviderIds.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    已选 {fallbackProviderIds.length} 个备用模型，按选中顺序依次尝试
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── 策略参数 ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-800">策略参数</h3>
            </div>

            <div className="space-y-4">
              {/* 超时 + 重试 并排 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    超时时间（秒）
                  </label>
                  <input
                    type="number"
                    value={timeoutSec}
                    onChange={(e) => setTimeoutSec(Number(e.target.value))}
                    min={5}
                    className={`w-full px-3 py-2 border ${
                      errors.timeoutMs ? "border-red-300" : "border-slate-200"
                    } rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400`}
                  />
                  {errors.timeoutMs ? (
                    <p className="text-xs text-red-500 mt-1">{errors.timeoutMs}</p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">默认 300 秒（5 分钟）</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">重试次数</label>
                  <input
                    type="number"
                    value={retryCount}
                    onChange={(e) => setRetryCount(Number(e.target.value))}
                    min={0}
                    max={10}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                  />
                  <p className="text-xs text-slate-400 mt-1">失败后自动重试</p>
                </div>
              </div>

              {/* 启用开关 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">启用状态</label>
                  <p className="text-xs text-slate-400">禁用后路由策略不生效</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    enabled ? "bg-amber-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作按钮 - 固定在底部 */}
        <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            {isLoading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isEditing ? "保存修改" : "创建策略"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoutingPolicyPanel;
