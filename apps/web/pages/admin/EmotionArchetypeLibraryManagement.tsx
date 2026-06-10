/**
 * 情感原型库后台管理页面
 * 提供 5 个功能模块：统计概览、原型列表、添加原型、热度排行、重算流行度
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { Button } from "../../components/ui/Button";
import {
  adminEmotionArchetypeLibraryApi,
  type EmotionCategory,
  type AddArchetypePayload,
  type EditArchetypePayload,
  type RunLogItem,
} from "../../services/realApi/admin-emotion-archetype-library";
import { TEEN_AGE_RANGES, ALL_ADULT_AGE_RANGES } from "../../../../src/constants/age-groups.js";

type ActiveTab = "statistics" | "list" | "add" | "ranking" | "records";

// 默认适合年龄组合（青少年 + 成人）
const DEFAULT_SUITABLE_AGE = [...TEEN_AGE_RANGES, ...ALL_ADULT_AGE_RANGES];

// 情感原型类别选项
const CATEGORY_OPTIONS: Array<{ value: EmotionCategory | ""; label: string }> = [
  { value: "", label: "全部类别" },
  { value: "自我发现", label: "自我发现" },
  { value: "时间流逝", label: "时间流逝" },
  { value: "人际连接", label: "人际连接" },
  { value: "意外时刻", label: "意外时刻" },
  { value: "日常仪式", label: "日常仪式" },
  { value: "蜕变逆袭", label: "蜕变逆袭" },
  { value: "身份切换", label: "身份切换" },
  { value: "仪式庆典", label: "仪式庆典" },
];

// 来源选项
const SOURCE_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "manual", label: "手动添加" },
  { value: "hot_trend_llm", label: "LLM提取" },
];

// 活跃状态选项
const IS_ACTIVE_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "true", label: "已启用" },
  { value: "false", label: "已禁用" },
];

/** 运行类型标签映射 */
const RUN_TYPE_LABELS: Record<string, string> = {
  scheduled_update: "调度任务",
  archetype_usage: "原型使用",
};

/** 触发方式标签映射 */
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  scheduled: "定时触发",
  manual: "手动触发",
  auto: "自动",
};

/** 格式化耗时 */
function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 格式化时间戳 */
function formatTimestamp(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** 格式化任务结果摘要 */
function formatTaskResults(results: Record<string, unknown> | null, runType: string): string {
  if (!results) return "-";
  if (runType === "scheduled_update") {
    const parts: string[] = [];
    if (results.popularityUpdate) parts.push(`流行度更新: ${(results.popularityUpdate as Record<string, unknown>).updatedCount}`);
    if (results.deactivation) parts.push(`淘汰: ${(results.deactivation as Record<string, unknown>).deactivatedCount}`);
    if (results.merge) parts.push(`合并: ${(results.merge as Record<string, unknown>).mergedCount}`);
    if (results.trim) parts.push(`裁剪至: ${(results.trim as Record<string, unknown>).trimmedCount}`);
    return parts.join("，") || "-";
  }
  if (runType === "archetype_usage") {
    return (results as Record<string, unknown>).archetypeName ? String((results as Record<string, unknown>).archetypeName) : "-";
  }
  return JSON.stringify(results);
}

/** 运行记录行组件 */
const RunLogRow: React.FC<{ item: RunLogItem }> = ({ item }) => (
  <tr className="border-b hover:bg-gray-50">
    <td className="px-4 py-2 text-xs text-gray-500">{item.id}</td>
    <td className="px-4 py-2">
      <span className={`px-2 py-0.5 rounded text-xs ${
        item.runType === "scheduled_update"
          ? "bg-blue-100 text-blue-800"
          : "bg-green-100 text-green-800"
      }`}>
        {RUN_TYPE_LABELS[item.runType] || item.runType}
      </span>
    </td>
    <td className="px-4 py-2 text-xs">{TRIGGER_TYPE_LABELS[item.triggerType] || item.triggerType}</td>
    <td className="px-4 py-2">
      <span className={`px-2 py-0.5 rounded text-xs ${
        item.status === "completed"
          ? "bg-green-100 text-green-800"
          : item.status === "failed"
          ? "bg-red-100 text-red-800"
          : "bg-yellow-100 text-yellow-800"
      }`}>
        {item.status === "completed" ? "已完成" : item.status === "failed" ? "失败" : "运行中"}
      </span>
    </td>
    <td className="px-4 py-2 text-xs max-w-xs truncate" title={formatTaskResults(item.taskResults, item.runType)}>
      {formatTaskResults(item.taskResults, item.runType)}
    </td>
    <td className="px-4 py-2 text-xs">{item.archetypeId || "-"}</td>
    <td className="px-4 py-2 text-xs">{item.projectId || "-"}</td>
    <td className="px-4 py-2 text-xs">{formatDuration(item.durationMs)}</td>
    <td className="px-4 py-2 text-xs">{formatTimestamp(item.startedAt)}</td>
  </tr>
);

export const EmotionArchetypeLibraryManagement: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const queryClient = useQueryClient();

  // 管理员权限检查
  const canAccess = currentUser?.role === "admin" && Boolean(token);
  if (!canAccess) {
    return (
      <>
        <div className="p-8 text-center text-gray-500">需要管理员权限</div>
      </>
    );
  }

  // 状态管理
  const [activeTab, setActiveTab] = useState<ActiveTab>("statistics");
  const [categoryFilter, setCategoryFilter] = useState<EmotionCategory | "">("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditArchetypePayload>({});
  const [recordsRunTypeFilter, setRecordsRunTypeFilter] = useState("");
  const [recordsStatusFilter, setRecordsStatusFilter] = useState("");
  const [recordsPage, setRecordsPage] = useState(1);

  // 统计数据 Query
  const statsQuery = useQuery({
    queryKey: ["emotion-archetype-stats", token],
    queryFn: () => adminEmotionArchetypeLibraryApi.fetchStatistics(token!),
    staleTime: 60000,
  });

  // 原型列表 Query
  const archetypesQuery = useQuery({
    queryKey: ["emotion-archetypes", token, categoryFilter, sourceFilter, isActiveFilter, page],
    queryFn: () =>
      adminEmotionArchetypeLibraryApi.fetchArchetypes(token!, {
        category: categoryFilter || undefined,
        source: sourceFilter || undefined,
        isActive: isActiveFilter || undefined,
        page,
        limit: 20,
      }),
    staleTime: 30000,
  });

  // 热度排行 Query
  const rankingQuery = useQuery({
    queryKey: ["emotion-archetype-ranking", token, categoryFilter],
    queryFn: () =>
      adminEmotionArchetypeLibraryApi.fetchRanking(token!, {
        category: categoryFilter || undefined,
        limit: 10,
      }),
    staleTime: 60000,
  });

  // 添加 Mutation
  const addMutation = useMutation({
    mutationFn: (data: AddArchetypePayload) =>
      adminEmotionArchetypeLibraryApi.addArchetype(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotion-archetypes"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-stats"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-ranking"] });
      setActiveTab("list");
    },
  });

  // 编辑 Mutation
  const editMutation = useMutation({
    mutationFn: (data: { id: string; payload: EditArchetypePayload }) =>
      adminEmotionArchetypeLibraryApi.editArchetype(token!, data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotion-archetypes"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-ranking"] });
      setEditingId(null);
      setEditDraft({});
    },
  });

  // 删除 Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminEmotionArchetypeLibraryApi.deleteArchetype(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotion-archetypes"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-stats"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-ranking"] });
    },
  });

  // 重算流行度 Mutation
  const recalcMutation = useMutation({
    mutationFn: () =>
      adminEmotionArchetypeLibraryApi.recalculatePopularity(token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotion-archetypes"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-stats"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-ranking"] });
      queryClient.invalidateQueries({ queryKey: ["emotion-archetype-run-logs"] });
    },
  });

  // 运行记录 Query
  const runLogsQuery = useQuery({
    queryKey: ["emotion-archetype-run-logs", token, recordsRunTypeFilter, recordsStatusFilter, recordsPage],
    queryFn: () =>
      adminEmotionArchetypeLibraryApi.fetchRunLogs(token!, {
        runType: recordsRunTypeFilter || undefined,
        status: recordsStatusFilter || undefined,
        page: recordsPage,
        limit: 20,
      }),
    staleTime: 10000,
  });

  // 提交添加表单
  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    addMutation.mutate({
      name: formData.get("name")?.toString() || "",
      category: formData.get("category")?.toString() as EmotionCategory,
      emotionCore: formData.get("emotionCore")?.toString() || "",
      moment: formData.get("moment")?.toString() || "",
      conflict: formData.get("conflict")?.toString() || "",
      clothingRole: formData.get("clothingRole")?.toString() || "",
      suitableStyles: ["所有风格"],
      suitableAge: DEFAULT_SUITABLE_AGE,
      suitableGender: ["male", "female"],
    });
  };

  // 提交编辑
  const handleEditSubmit = () => {
    if (!editingId) return;
    editMutation.mutate({ id: editingId, payload: editDraft });
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">情感原型库管理</h1>

          {/* Tab 导航 */}
          <div className="flex space-x-4 mb-6">
            {(["statistics", "list", "add", "ranking", "records"] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab === "statistics" && "统计概览"}
                {tab === "list" && "原型列表"}
                {tab === "add" && "添加原型"}
                {tab === "ranking" && "热度排行"}
                {tab === "records" && "运行记录"}
              </button>
            ))}
          </div>

          {/* 筛选器 */}
          <div className="flex space-x-4 mb-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as EmotionCategory | "")}
              className="border rounded px-3 py-2 text-sm"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={isActiveFilter}
              onChange={(e) => setIsActiveFilter(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              {IS_ACTIVE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* 重算流行度按钮 */}
            <Button
              onClick={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending}
              className="bg-purple-600 text-white"
            >
              {recalcMutation.isPending ? "重算中..." : "重算流行度"}
            </Button>
          </div>

          {/* 统计概览 */}
          {activeTab === "statistics" && statsQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}

          {activeTab === "statistics" && statsQuery.data && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded p-4 shadow">
                <div className="text-sm text-gray-500">总原型数</div>
                <div className="text-2xl font-bold">{statsQuery.data.totalCount}</div>
              </div>
              <div className="bg-white rounded p-4 shadow">
                <div className="text-sm text-gray-500">活跃原型</div>
                <div className="text-2xl font-bold text-green-600">{statsQuery.data.activeCount}</div>
              </div>
              <div className="bg-white rounded p-4 shadow">
                <div className="text-sm text-gray-500">LLM提取</div>
                <div className="text-2xl font-bold text-blue-600">{statsQuery.data.llmExtractedCount}</div>
              </div>
              <div className="bg-white rounded p-4 shadow">
                <div className="text-sm text-gray-500">平均流行度</div>
                <div className="text-2xl font-bold text-purple-600">{statsQuery.data.avgPopularity}</div>
              </div>

              {/* 类别分布 */}
              <div className="col-span-4 bg-white rounded p-4 shadow">
                <h3 className="text-lg font-semibold mb-2">类别分布</h3>
                <div className="grid grid-cols-4 gap-2">
                  {statsQuery.data.categoryStats.map((stat) => (
                    <div key={stat.category} className="flex justify-between border-b py-1">
                      <span>{stat.category}</span>
                      <span className="font-medium">{stat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 原型列表 */}
          {activeTab === "list" && archetypesQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}

          {activeTab === "list" && archetypesQuery.data && (
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left whitespace-nowrap">名称</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">类别</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">情感核心</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">流行度</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">使用次数</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">来源</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">状态</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">新建时间</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {archetypesQuery.data.items.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap">{item.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{item.category}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{item.emotionCore}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-purple-600 font-medium">
                          {item.popularityScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{item.useCount}</td>
                      <td className="px-4 py-2 text-xs whitespace-nowrap">{item.source}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            item.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {item.isActive ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500 text-xs">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setEditDraft({
                                name: item.name,
                                emotionCore: item.emotionCore,
                                popularityScore: item.popularityScore,
                                isActive: item.isActive,
                              });
                            }}
                            className="text-blue-500 hover:underline text-xs"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-red-500 hover:underline text-xs"
                          >
                            禁用
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50">
                <span className="text-sm text-gray-500">
                  共 {archetypesQuery.data.total} 条，第 {archetypesQuery.data.page} 页
                </span>
                <div className="space-x-2">
                  <Button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="text-xs"
                  >
                    上一页
                  </Button>
                  <Button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= archetypesQuery.data.totalPages}
                    className="text-xs"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 添加原型表单 */}
          {activeTab === "add" && (
            <form onSubmit={handleAddSubmit} className="bg-white rounded p-6 shadow space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">原型名称 *</label>
                <input
                  name="name"
                  required
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：镜子里的陌生人"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">类别 *</label>
                <select name="category" required className="w-full border rounded px-3 py-2">
                  {CATEGORY_OPTIONS.filter(opt => opt.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">情感核心 *</label>
                <input
                  name="emotionCore"
                  required
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：不确定 → 接纳"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">关键时刻 *</label>
                <input
                  name="moment"
                  required
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：剪了新发型第一次照镜子"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">核心冲突</label>
                <input
                  name="conflict"
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：这真的是我吗？"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">服饰角色</label>
                <input
                  name="clothingRole"
                  className="w-full border rounded px-3 py-2"
                  placeholder="如：服饰=新身份的象征"
                />
              </div>

              <Button
                type="submit"
                disabled={addMutation.isPending}
                className="bg-blue-600 text-white"
              >
                {addMutation.isPending ? "添加中..." : "添加原型"}
              </Button>
            </form>
          )}

          {/* 热度排行 */}
          {activeTab === "ranking" && rankingQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}

          {activeTab === "ranking" && rankingQuery.data && (
            <div className="bg-white rounded shadow">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">排名</th>
                    <th className="px-4 py-2 text-left">原型名称</th>
                    <th className="px-4 py-2 text-left">类别</th>
                    <th className="px-4 py-2 text-left">情感核心</th>
                    <th className="px-4 py-2 text-left">流行度</th>
                    <th className="px-4 py-2 text-left">使用次数</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingQuery.data.items.map((item, idx) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{idx + 1}</td>
                      <td className="px-4 py-2">{item.name}</td>
                      <td className="px-4 py-2">{item.category}</td>
                      <td className="px-4 py-2">{item.emotionCore}</td>
                      <td className="px-4 py-2">
                        <span className="text-purple-600 font-medium">
                          {item.popularityScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2">{item.useCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 运行记录 */}
          {activeTab === "records" && (
            <>
              {/* 记录筛选器 */}
              <div className="flex space-x-4 mb-4">
                <select
                  value={recordsRunTypeFilter}
                  onChange={(e) => { setRecordsRunTypeFilter(e.target.value); setRecordsPage(1); }}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value="">全部类型</option>
                  <option value="scheduled_update">调度任务</option>
                  <option value="archetype_usage">原型使用</option>
                </select>

                <select
                  value={recordsStatusFilter}
                  onChange={(e) => { setRecordsStatusFilter(e.target.value); setRecordsPage(1); }}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value="">全部状态</option>
                  <option value="running">运行中</option>
                  <option value="completed">已完成</option>
                  <option value="failed">失败</option>
                </select>

                <Button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["emotion-archetype-run-logs"] })}
                  className="bg-gray-200 text-gray-700 text-xs"
                >
                  刷新
                </Button>
              </div>

              {runLogsQuery.isLoading && (
                <div className="text-center py-8 text-gray-500">加载中...</div>
              )}

              {runLogsQuery.data && (
                <div className="bg-white rounded shadow overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">ID</th>
                        <th className="px-4 py-2 text-left">运行类型</th>
                        <th className="px-4 py-2 text-left">触发方式</th>
                        <th className="px-4 py-2 text-left">状态</th>
                        <th className="px-4 py-2 text-left">任务结果</th>
                        <th className="px-4 py-2 text-left">关联原型</th>
                        <th className="px-4 py-2 text-left">关联项目</th>
                        <th className="px-4 py-2 text-left">耗时</th>
                        <th className="px-4 py-2 text-left">开始时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runLogsQuery.data.items.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                            暂无运行记录
                          </td>
                        </tr>
                      )}
                      {runLogsQuery.data.items.map((item: RunLogItem) => (
                        <RunLogRow key={item.id} item={item} />
                      ))}
                    </tbody>
                  </table>

                  {/* 分页 */}
                  <div className="flex justify-between items-center px-4 py-2 bg-gray-50">
                    <span className="text-sm text-gray-500">
                      共 {runLogsQuery.data.total} 条，第 {runLogsQuery.data.page} 页
                    </span>
                    <div className="space-x-2">
                      <Button
                        onClick={() => setRecordsPage(recordsPage - 1)}
                        disabled={recordsPage === 1}
                        className="text-xs"
                      >
                        上一页
                      </Button>
                      <Button
                        onClick={() => setRecordsPage(recordsPage + 1)}
                        disabled={recordsPage >= runLogsQuery.data.totalPages}
                        className="text-xs"
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 编辑弹窗 */}
          {editingId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded p-6 w-96 space-y-4">
                <h3 className="text-lg font-semibold">编辑原型</h3>

                <div>
                  <label className="block text-sm font-medium mb-1">名称</label>
                  <input
                    value={editDraft.name || ""}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">情感核心</label>
                  <input
                    value={editDraft.emotionCore || ""}
                    onChange={(e) => setEditDraft({ ...editDraft, emotionCore: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">流行度 (0-1)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={editDraft.popularityScore || 0}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, popularityScore: parseFloat(e.target.value) })
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">状态</label>
                  <select
                    value={editDraft.isActive ? "true" : "false"}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, isActive: e.target.value === "true" })
                    }
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="true">启用</option>
                    <option value="false">禁用</option>
                  </select>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={handleEditSubmit} className="bg-blue-600 text-white">
                    {editMutation.isPending ? "保存中..." : "保存"}
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft({});
                    }}
                    className="bg-gray-300"
                  >
                    取消
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};