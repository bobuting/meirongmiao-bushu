/**
 * 审美特征库后台管理页面
 * 提供 4 个功能模块：统计概览、特征列表、添加特征、热度排行
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { Button } from "../../components/ui/Button";
import {
  adminAestheticLibraryApi,
  type AgeRange,
  type AddFeaturePayload,
  type EditFeaturePayload,
  type UpdateTriggerType,
  type UpdateLogStatus,
} from "../../services/realApi/admin-aesthetic-library";
import { AGE_GROUPS, AGE_GROUP_RANGES, getAgeGroupByRange, type AgeGroupRange } from "../../../../src/constants/age-groups";

type ActiveTab = "statistics" | "list" | "add" | "ranking" | "logs";

// 根据年龄范围字符串获取中文标签
function getAgeRangeLabel(range: string | null | undefined): string {
  if (!range) return "-";
  try {
    const key = getAgeGroupByRange(range as AgeGroupRange);
    return AGE_GROUPS[key].label;
  } catch {
    return range;
  }
}

// 年龄范围选项（使用统一年龄段定义）
const AGE_RANGE_OPTIONS: Array<{ value: AgeRange | ""; label: string }> = [
  { value: "", label: "全部年龄范围" },
  ...AGE_GROUP_RANGES.map(range => ({
    value: range,
    label: `${getAgeRangeLabel(range)} (${range}岁)`,
  })),
];

export const AestheticLibraryManagement: React.FC = () => {
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
  const [ageRangeFilter, setAgeRangeFilter] = useState<AgeRange | "">("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditFeaturePayload>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null); // 图片预览弹窗

  // 统计数据 Query
  const statsQuery = useQuery({
    queryKey: ["aesthetic-stats", token],
    queryFn: () => adminAestheticLibraryApi.fetchStatistics(token!),
    staleTime: 60000,
  });

  // 特征列表 Query
  const featuresQuery = useQuery({
    queryKey: ["aesthetic-features", token, ageRangeFilter, page],
    queryFn: () =>
      adminAestheticLibraryApi.fetchFeatures(token!, {
        ageRange: ageRangeFilter || undefined,
        page,
        limit: 20,
      }),
    staleTime: 30000,
  });

  // 热度排行 Query
  const rankingQuery = useQuery({
    queryKey: ["aesthetic-ranking", token, ageRangeFilter],
    queryFn: () =>
      adminAestheticLibraryApi.fetchRanking(token!, {
        ageRange: ageRangeFilter || undefined,
        limit: 10,
      }),
    staleTime: 60000,
  });

  // 添加 Mutation
  const addMutation = useMutation({
    mutationFn: (data: AddFeaturePayload) =>
      adminAestheticLibraryApi.addFeature(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aesthetic-features"] });
      queryClient.invalidateQueries({ queryKey: ["aesthetic-stats"] });
      queryClient.invalidateQueries({ queryKey: ["aesthetic-ranking"] });
      setActiveTab("list");
    },
  });

  // 编辑 Mutation
  const editMutation = useMutation({
    mutationFn: (data: { id: string; payload: EditFeaturePayload }) =>
      adminAestheticLibraryApi.editFeature(token!, data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aesthetic-features"] });
      queryClient.invalidateQueries({ queryKey: ["aesthetic-ranking"] });
      setEditingId(null);
      setEditDraft({});
    },
  });

  // 删除 Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminAestheticLibraryApi.deleteFeature(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aesthetic-features"] });
      queryClient.invalidateQueries({ queryKey: ["aesthetic-stats"] });
      queryClient.invalidateQueries({ queryKey: ["aesthetic-ranking"] });
    },
  });

  // 运行记录相关状态
  const [logPage, setLogPage] = useState(1);
  const [logTriggerFilter, setLogTriggerFilter] = useState<UpdateTriggerType | "">("");
  const [logStatusFilter, setLogStatusFilter] = useState<UpdateLogStatus | "">("");

  // 运行记录 Query
  const logsQuery = useQuery({
    queryKey: ["aesthetic-update-logs", token, logPage, logTriggerFilter, logStatusFilter],
    queryFn: () =>
      adminAestheticLibraryApi.fetchUpdateLogs(token!, {
        page: logPage,
        limit: 15,
        triggerType: logTriggerFilter || undefined,
        status: logStatusFilter || undefined,
      }),
    staleTime: 10000,
  });

  // 手动触发更新 Mutation
  const triggerMutation = useMutation({
    mutationFn: () =>
      adminAestheticLibraryApi.triggerUpdate(token!, {
        ageRange: ageRangeFilter || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aesthetic-update-logs"] });
    },
  });

  // 提交添加表单
  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const ethnicityRaw = formData.get("ethnicity")?.toString() || "";
    const ethnicityApplicable = ethnicityRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    addMutation.mutate({
      featureCategory: formData.get("category")?.toString() || "",
      featureName: formData.get("name")?.toString() || "",
      featureDescription: formData.get("description")?.toString() || "",
      ethnicityApplicable,
      ageRange: formData.get("ageRange")?.toString() as AgeRange,
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
          <h1 className="text-2xl font-bold mb-6">审美特征库管理</h1>

          {/* 年龄范围筛选 */}
          <div className="mb-4">
            <select
              value={ageRangeFilter}
              onChange={(e) => setAgeRangeFilter(e.target.value as AgeRange | "")}
              className="border rounded px-3 py-2 text-sm"
            >
              {AGE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 标签页切换 */}
          <div className="flex gap-2 mb-6">
            {(["statistics", "list", "add", "ranking", "logs"] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded text-sm ${
                  activeTab === tab
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {tab === "statistics" && "统计概览"}
                {tab === "list" && "特征列表"}
                {tab === "add" && "添加特征"}
                {tab === "ranking" && "热度排行"}
                {tab === "logs" && "运行记录"}
              </button>
            ))}
          </div>

          {/* 统计概览 */}
          {activeTab === "statistics" && statsQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}
          {activeTab === "statistics" && statsQuery.data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm">总数</div>
                <div className="text-2xl font-bold">{statsQuery.data.totalCount}</div>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm">儿童特征</div>
                <div className="text-2xl font-bold">{statsQuery.data.childCount}</div>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm">成人特征</div>
                <div className="text-2xl font-bold">{statsQuery.data.adultCount}</div>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm">近7天更新</div>
                <div className="text-2xl font-bold">{statsQuery.data.recentUpdates}</div>
              </div>

              {/* 分类分布 */}
              <div className="col-span-2 md:col-span-4 bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm mb-2">分类分布</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(statsQuery.data.categoryDistribution).map(
                    ([category, count]) => (
                      <div key={category} className="text-sm">
                        <span className="text-gray-600">{category}:</span>
                        <span className="ml-1 font-medium">{count}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 特征列表 */}
          {activeTab === "list" && featuresQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}
          {activeTab === "list" && featuresQuery.data && (
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left whitespace-nowrap">分析图片</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">特征名称</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">分类</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">年龄范围</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">热度</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">新建时间</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {featuresQuery.data.items.map((feature) => (
                    <tr key={feature.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {(feature.ossImageUrl || feature.sourceImageUrl) ? (
                          <img
                            src={feature.ossImageUrl || feature.sourceImageUrl}
                            alt={feature.featureName}
                            className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            loading="lazy"
                            onClick={() => setPreviewImage(feature.ossImageUrl || feature.sourceImageUrl || null)}
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">无图片</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {feature.featureNameCn || feature.featureName}
                        {feature.featureNameCn && (
                          <span className="text-gray-400 text-xs ml-1">({feature.featureName})</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {feature.featureCategoryCn || feature.featureCategory}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{feature.ageRange}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{feature.popularityScore}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500 text-xs">
                        {feature.createdAt ? new Date(feature.createdAt).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingId(feature.id);
                              setEditDraft({
                                featureName: feature.featureName,
                                featureDescription: feature.featureDescription,
                                ethnicityApplicable: feature.ethnicityApplicable,
                              });
                            }}
                            className="text-blue-500 hover:underline text-xs"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("确认删除此特征？")) {
                                deleteMutation.mutate(feature.id);
                              }
                            }}
                            className="text-red-500 hover:underline text-xs"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              <div className="p-4 flex justify-center gap-2 border-t">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm">
                  第 {page} 页（共 {featuresQuery.data.total} 条）
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={featuresQuery.data.items.length < 20}
                  className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
                >
                  下一页
                </button>
              </div>

              {/* 编辑弹窗 */}
              {editingId && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
                    <h2 className="text-lg font-bold mb-4">编辑特征</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">特征名称</label>
                        <input
                          value={editDraft.featureName || ""}
                          onChange={(e) =>
                            setEditDraft((d) => ({ ...d, featureName: e.target.value }))
                          }
                          className="w-full border rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">描述</label>
                        <textarea
                          value={editDraft.featureDescription || ""}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              featureDescription: e.target.value,
                            }))
                          }
                          className="w-full border rounded px-3 py-2 text-sm"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          适用种族（逗号分隔）
                        </label>
                        <input
                          value={editDraft.ethnicityApplicable?.join(",") || ""}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              ethnicityApplicable: e.target.value.split(",").map((s) => s.trim()),
                            }))
                          }
                          className="w-full border rounded px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft({});
                        }}
                        className="px-4 py-2 border rounded text-sm"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleEditSubmit}
                        disabled={editMutation.isPending}
                        className="px-4 py-2 bg-blue-500 text-white rounded text-sm disabled:opacity-50"
                      >
                        {editMutation.isPending ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 添加特征 */}
          {activeTab === "add" && (
            <div className="bg-white p-6 rounded shadow">
              <form onSubmit={handleAddSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">特征分类 *</label>
                  <input
                    name="category"
                    className="w-full border rounded px-3 py-2 text-sm"
                    required
                    placeholder="如：jawline_definition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">特征名称 *</label>
                  <input
                    name="name"
                    className="w-full border rounded px-3 py-2 text-sm"
                    required
                    placeholder="如：清晰下颌线"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">描述 *</label>
                  <textarea
                    name="description"
                    className="w-full border rounded px-3 py-2 text-sm"
                    rows={3}
                    required
                    placeholder="特征详细描述"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">适用种族（逗号分隔）</label>
                  <input
                    name="ethnicity"
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="如：asian, western"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">年龄范围 *</label>
                  <select
                    name="ageRange"
                    className="w-full border rounded px-3 py-2 text-sm"
                    required
                  >
                    {AGE_RANGE_OPTIONS.filter(opt => opt.value !== "").map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    type="submit"
                    disabled={addMutation.isPending}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50 text-sm"
                  >
                    {addMutation.isPending ? "添加中..." : "添加"}
                  </Button>
                  {addMutation.isError && (
                    <span className="text-red-500 text-sm">添加失败</span>
                  )}
                  {addMutation.isSuccess && (
                    <span className="text-green-500 text-sm">添加成功</span>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* 热度排行 */}
          {activeTab === "ranking" && rankingQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}
          {activeTab === "ranking" && rankingQuery.data && (
            <div className="bg-white rounded shadow overflow-hidden">
              <div className="p-4 border-b font-medium text-sm">热度排行 TOP 10</div>
              <ul>
                {rankingQuery.data.map((item, index) => (
                  <li key={item.id} className="p-4 border-t flex justify-between text-sm">
                    <div>
                      <span className="font-bold mr-2 text-gray-500">#{index + 1}</span>
                      {item.featureNameCn || item.featureName}
                      {item.featureNameCn && (
                        <span className="text-gray-400 text-xs ml-1">({item.featureName})</span>
                      )}
                    </div>
                    <div className="text-gray-500">热度: {item.popularityScore}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 运行记录 */}
          {activeTab === "logs" && (
            <div className="space-y-4">
              {/* 操作栏：筛选 + 手动触发 */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <select
                    value={logTriggerFilter}
                    onChange={(e) => { setLogTriggerFilter(e.target.value as UpdateTriggerType | ""); setLogPage(1); }}
                    className="border rounded px-3 py-2 text-sm"
                  >
                    <option value="">全部触发方式</option>
                    <option value="scheduled">定时任务</option>
                    <option value="manual">手动触发</option>
                  </select>
                  <select
                    value={logStatusFilter}
                    onChange={(e) => { setLogStatusFilter(e.target.value as UpdateLogStatus | ""); setLogPage(1); }}
                    className="border rounded px-3 py-2 text-sm"
                  >
                    <option value="">全部状态</option>
                    <option value="running">运行中</option>
                    <option value="success">成功</option>
                    <option value="failed">失败</option>
                    <option value="skipped">跳过</option>
                  </select>
                </div>
                <Button
                  onClick={() => triggerMutation.mutate()}
                  disabled={triggerMutation.isPending}
                  className="px-4 py-2 bg-green-500 text-white rounded text-sm disabled:opacity-50"
                >
                  {triggerMutation.isPending ? "触发中..." : "手动触发更新"}
                </Button>
              </div>

              {/* 触发结果反馈 */}
              {triggerMutation.isSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm">
                  {triggerMutation.data.message}
                </div>
              )}
              {triggerMutation.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
                  触发失败，请稍后重试
                </div>
              )}

              {/* 记录表格 */}
              {logsQuery.isLoading && (
                <div className="text-center py-8 text-gray-500">加载中...</div>
              )}
              {logsQuery.data && (
                <div className="bg-white rounded shadow overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">触发方式</th>
                        <th className="px-4 py-2 text-left">状态</th>
                        <th className="px-4 py-2 text-left">年龄范围</th>
                        <th className="px-4 py-2 text-left">小红书</th>
                        <th className="px-4 py-2 text-left">Instagram</th>
                        <th className="px-4 py-2 text-left">微博</th>
                        <th className="px-4 py-2 text-left">抖音</th>
                        <th className="px-4 py-2 text-left">特征更新</th>
                        <th className="px-4 py-2 text-left">耗时</th>
                        <th className="px-4 py-2 text-left">开始时间</th>
                        <th className="px-4 py-2 text-left">错误信息</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsQuery.data.items.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                            暂无运行记录
                          </td>
                        </tr>
                      )}
                      {logsQuery.data.items.map((logItem) => (
                        <tr key={logItem.id} className="border-t">
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              logItem.triggerType === "scheduled"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-purple-100 text-purple-700"
                            }`}>
                              {logItem.triggerType === "scheduled" ? "定时" : "手动"}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              logItem.status === "success"
                                ? "bg-green-100 text-green-700"
                                : logItem.status === "failed"
                                  ? "bg-red-100 text-red-700"
                                  : logItem.status === "running"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-gray-100 text-gray-700"
                            }`}>
                              {logItem.status === "running" ? "运行中" :
                               logItem.status === "success" ? "成功" :
                               logItem.status === "failed" ? "失败" : "跳过"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {getAgeRangeLabel(logItem.ageRange)}
                          </td>
                          <td className="px-4 py-2">{logItem.xiaohongshuCount}</td>
                          <td className="px-4 py-2">{logItem.instagramCount}</td>
                          <td className="px-4 py-2">{logItem.weiboCount ?? 0}</td>
                          <td className="px-4 py-2">{logItem.douyinCount ?? 0}</td>
                          <td className="px-4 py-2">{logItem.featuresUpdated}</td>
                          <td className="px-4 py-2">
                            {logItem.durationMs > 0
                              ? `${(logItem.durationMs / 1000).toFixed(1)}s`
                              : "-"}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                            {logItem.startedAt
                              ? new Date(logItem.startedAt).toLocaleString("zh-CN")
                              : "-"}
                          </td>
                          <td className="px-4 py-2 text-red-500 text-xs max-w-[200px] truncate">
                            {logItem.errorMessage || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 分页 */}
                  <div className="p-4 flex justify-center gap-2 border-t">
                    <button
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={logPage === 1}
                      className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
                    >
                      上一页
                    </button>
                    <span className="px-3 py-1 text-sm">
                      第 {logPage} 页（共 {logsQuery.data.total} 条）
                    </span>
                    <button
                      onClick={() => setLogPage((p) => p + 1)}
                      disabled={logsQuery.data.items.length < 15}
                      className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="预览图片"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-lg"
          />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white text-2xl hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
};

export default AestheticLibraryManagement;