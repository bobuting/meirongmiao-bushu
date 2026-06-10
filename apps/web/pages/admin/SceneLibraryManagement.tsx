/**
 * 场景库后台管理页面
 * 提供 5 个功能模块：统计概览、场景列表、添加场景、热度排行、运行记录
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { Button } from "../../components/ui/Button";
import {
  adminSceneLibraryApi,
  type SceneCategory,
  type AddScenePayload,
  type EditScenePayload,
  type SceneUpdateTriggerType,
  type SceneUpdateLogStatus,
  SCENE_CATEGORY_LABELS,
} from "../../services/realApi/admin-scene-library";

type ActiveTab = "statistics" | "list" | "add" | "ranking" | "logs";

const SCENE_CATEGORY_OPTIONS: Array<{ value: SceneCategory | ""; label: string }> = [
  { value: "", label: "全部分类" },
  { value: "indoor", label: "室内场景" },
  { value: "outdoor", label: "室外场景" },
  { value: "e_commerce", label: "电商场景" },
  { value: "studio", label: "影棚/直播间" },
  { value: "lifestyle", label: "生活场景" },
  { value: "commercial", label: "商业场景" },
];

export const SceneLibraryManagement: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const queryClient = useQueryClient();

  const canAccess = currentUser?.role === "admin" && Boolean(token);
  if (!canAccess) {
    return <div className="p-8 text-center text-gray-500">需要管理员权限</div>;
  }

  const [activeTab, setActiveTab] = useState<ActiveTab>("statistics");
  const [categoryFilter, setCategoryFilter] = useState<SceneCategory | "">("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditScenePayload>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Queries
  const statsQuery = useQuery({
    queryKey: ["scene-stats", token],
    queryFn: () => adminSceneLibraryApi.fetchStatistics(token!),
    staleTime: 60000,
  });

  const scenesQuery = useQuery({
    queryKey: ["scene-items", token, categoryFilter, page],
    queryFn: () =>
      adminSceneLibraryApi.fetchScenes(token!, {
        sceneCategory: categoryFilter || undefined,
        page,
        limit: 20,
      }),
    staleTime: 30000,
  });

  const rankingQuery = useQuery({
    queryKey: ["scene-ranking", token, categoryFilter],
    queryFn: () =>
      adminSceneLibraryApi.fetchRanking(token!, {
        sceneCategory: categoryFilter || undefined,
        limit: 10,
      }),
    staleTime: 60000,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: (data: AddScenePayload) => adminSceneLibraryApi.addScene(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-items"] });
      queryClient.invalidateQueries({ queryKey: ["scene-stats"] });
      queryClient.invalidateQueries({ queryKey: ["scene-ranking"] });
      setActiveTab("list");
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; payload: EditScenePayload }) =>
      adminSceneLibraryApi.editScene(token!, data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-items"] });
      queryClient.invalidateQueries({ queryKey: ["scene-ranking"] });
      setEditingId(null);
      setEditDraft({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminSceneLibraryApi.deleteScene(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-items"] });
      queryClient.invalidateQueries({ queryKey: ["scene-stats"] });
      queryClient.invalidateQueries({ queryKey: ["scene-ranking"] });
    },
  });

  // 运行记录
  const [logPage, setLogPage] = useState(1);
  const [logTriggerFilter, setLogTriggerFilter] = useState<SceneUpdateTriggerType | "">("");
  const [logStatusFilter, setLogStatusFilter] = useState<SceneUpdateLogStatus | "">("");

  const logsQuery = useQuery({
    queryKey: ["scene-update-logs", token, logPage, logTriggerFilter, logStatusFilter],
    queryFn: () =>
      adminSceneLibraryApi.fetchUpdateLogs(token!, {
        page: logPage,
        limit: 15,
        triggerType: logTriggerFilter || undefined,
        status: logStatusFilter || undefined,
      }),
    staleTime: 10000,
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      adminSceneLibraryApi.triggerUpdate(token!, {
        sceneCategory: categoryFilter || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scene-update-logs"] });
    },
  });

  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const tagsRaw = formData.get("tags")?.toString() || "";
    const sceneTags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const suitRaw = formData.get("suitability")?.toString() || "";
    const suitability = suitRaw.split(",").map((s) => s.trim()).filter(Boolean);

    addMutation.mutate({
      sceneCategory: formData.get("sceneCategory")?.toString() as SceneCategory,
      sceneName: formData.get("sceneName")?.toString() || "",
      sceneDescription: formData.get("sceneDescription")?.toString() || "",
      sceneTags: sceneTags.length > 0 ? sceneTags : undefined,
      lightingType: formData.get("lightingType")?.toString() || undefined,
      suitability: suitability.length > 0 ? suitability : undefined,
    });
  };

  const handleEditSubmit = () => {
    if (!editingId) return;
    const cleaned: EditScenePayload = { ...editDraft };
    if (cleaned.lightingType === "") cleaned.lightingType = undefined;
    editMutation.mutate({ id: editingId, payload: cleaned });
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">场景库管理</h1>

          {/* 场景分类筛选 */}
          <div className="mb-4">
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value as SceneCategory | ""); setPage(1); }}
              className="border rounded px-3 py-2 text-sm"
            >
              {SCENE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Tab 切换 */}
          <div className="flex gap-2 mb-6">
            {(["statistics", "list", "add", "ranking", "logs"] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded text-sm ${activeTab === tab ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
              >
                {tab === "statistics" && "统计概览"}
                {tab === "list" && "场景列表"}
                {tab === "add" && "添加场景"}
                {tab === "ranking" && "热度排行"}
                {tab === "logs" && "运行记录"}
              </button>
            ))}
          </div>

          {/* 统计概览 */}
          {activeTab === "statistics" && statsQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}
          {activeTab === "statistics" && statsQuery.isError && (
            <div className="text-center py-8 text-red-500">加载统计数据失败，请刷新重试</div>
          )}
          {activeTab === "statistics" && statsQuery.data && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm">总数</div>
                <div className="text-2xl font-bold">{statsQuery.data.totalCount}</div>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm">近7天更新</div>
                <div className="text-2xl font-bold">{statsQuery.data.recentUpdates}</div>
              </div>
              <div className="col-span-2 md:col-span-3 bg-white p-4 rounded shadow">
                <div className="text-gray-500 text-sm mb-2">分类分布</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(statsQuery.data.categoryDistribution).map(([cat, count]) => (
                    <div key={cat} className="text-sm">
                      <span className="text-gray-600">{SCENE_CATEGORY_LABELS[cat as SceneCategory] || cat}:</span>
                      <span className="ml-1 font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 场景列表 */}
          {activeTab === "list" && scenesQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}
          {activeTab === "list" && scenesQuery.isError && (
            <div className="text-center py-8 text-red-500">加载场景列表失败，请刷新重试</div>
          )}
          {activeTab === "list" && scenesQuery.data && (
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left whitespace-nowrap">预览</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">场景名称</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">分类</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">光照</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">热度</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">新建时间</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {scenesQuery.data.items.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">暂无场景数据</td></tr>
                  )}
                  {scenesQuery.data.items.map((scene) => (
                    <tr key={scene.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {(scene.ossImageUrl || scene.sourceImageUrl) ? (
                          <img
                            src={scene.ossImageUrl || scene.sourceImageUrl}
                            alt={scene.sceneName}
                            className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80"
                            loading="lazy"
                            onClick={() => setPreviewImage(scene.ossImageUrl || scene.sourceImageUrl || null)}
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">无图片</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {scene.sceneNameCn || scene.sceneName}
                        {scene.sceneNameCn && (
                          <span className="text-gray-400 text-xs ml-1">({scene.sceneName})</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {SCENE_CATEGORY_LABELS[scene.sceneCategory as SceneCategory] || scene.sceneCategory}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{scene.lightingType || "-"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{scene.popularityScore.toFixed(2)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500 text-xs">
                        {scene.createdAt ? new Date(scene.createdAt).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingId(scene.id);
                              setEditDraft({
                                sceneName: scene.sceneName,
                                sceneDescription: scene.sceneDescription,
                                sceneTags: scene.sceneTags,
                                lightingType: scene.lightingType,
                                suitability: scene.suitability,
                              });
                            }}
                            className="text-blue-500 hover:underline text-xs"
                          >编辑</button>
                          <button
                            onClick={() => { if (confirm("确认删除此场景？")) deleteMutation.mutate(scene.id); }}
                            disabled={deleteMutation.isPending}
                            className="text-red-500 hover:underline disabled:opacity-50 text-xs"
                          >{deleteMutation.isPending ? "删除中..." : "删除"}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              <div className="p-4 flex justify-center gap-2 border-t">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50 text-sm">上一页</button>
                <span className="px-3 py-1 text-sm">第 {page} 页（共 {scenesQuery.data.total} 条）</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={scenesQuery.data.items.length < 20} className="px-3 py-1 border rounded disabled:opacity-50 text-sm">下一页</button>
              </div>

              {/* 编辑弹窗 */}
              {editingId && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
                    <h2 className="text-lg font-bold mb-4">编辑场景</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">场景名称</label>
                        <input value={editDraft.sceneName || ""} onChange={(e) => setEditDraft((d) => ({ ...d, sceneName: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">描述</label>
                        <textarea value={editDraft.sceneDescription || ""} onChange={(e) => setEditDraft((d) => ({ ...d, sceneDescription: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={3} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
                        <input value={editDraft.sceneTags?.join(",") || ""} onChange={(e) => setEditDraft((d) => ({ ...d, sceneTags: e.target.value.split(",").map((s) => s.trim()) }))} className="w-full border rounded px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">光照类型</label>
                        <select value={editDraft.lightingType || ""} onChange={(e) => setEditDraft((d) => ({ ...d, lightingType: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                          <option value="">未指定</option>
                          <option value="natural">自然光</option>
                          <option value="artificial">人工光</option>
                          <option value="mixed">混合光</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">适用类型（逗号分隔）</label>
                        <input value={editDraft.suitability?.join(",") || ""} onChange={(e) => setEditDraft((d) => ({ ...d, suitability: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} className="w-full border rounded px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button onClick={() => { setEditingId(null); setEditDraft({}); }} className="px-4 py-2 border rounded text-sm">取消</button>
                      <button onClick={handleEditSubmit} disabled={editMutation.isPending} className="px-4 py-2 bg-blue-500 text-white rounded text-sm disabled:opacity-50">
                        {editMutation.isPending ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 添加场景 */}
          {activeTab === "add" && (
            <div className="bg-white p-6 rounded shadow">
              <form onSubmit={handleAddSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">场景分类 *</label>
                  <select name="sceneCategory" className="w-full border rounded px-3 py-2 text-sm" required>
                    {Object.entries(SCENE_CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">场景名称 *</label>
                  <input name="sceneName" className="w-full border rounded px-3 py-2 text-sm" required placeholder="如：modern_office" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">描述 *</label>
                  <textarea name="sceneDescription" className="w-full border rounded px-3 py-2 text-sm" rows={3} required placeholder="场景详细描述" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
                  <input name="tags" className="w-full border rounded px-3 py-2 text-sm" placeholder="如：warm, modern, bright" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">光照类型</label>
                  <select name="lightingType" className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">未指定</option>
                    <option value="natural">自然光</option>
                    <option value="artificial">人工光</option>
                    <option value="mixed">混合光</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">适用类型（逗号分隔）</label>
                  <input name="suitability" className="w-full border rounded px-3 py-2 text-sm" placeholder="如：clothing, beauty" />
                </div>
                <div className="flex items-center gap-4">
                  <Button type="submit" disabled={addMutation.isPending} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50 text-sm">
                    {addMutation.isPending ? "添加中..." : "添加"}
                  </Button>
                  {addMutation.isError && <span className="text-red-500 text-sm">添加失败</span>}
                  {addMutation.isSuccess && <span className="text-green-500 text-sm">添加成功</span>}
                </div>
              </form>
            </div>
          )}

          {/* 热度排行 */}
          {activeTab === "ranking" && rankingQuery.isLoading && (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          )}
          {activeTab === "ranking" && rankingQuery.isError && (
            <div className="text-center py-8 text-red-500">加载热度排行失败，请刷新重试</div>
          )}
          {activeTab === "ranking" && rankingQuery.data && (
            <div className="bg-white rounded shadow overflow-hidden">
              <div className="p-4 border-b font-medium text-sm">热度排行 TOP 10</div>
              <ul>
                {rankingQuery.data.map((item, index) => (
                  <li key={item.id} className="p-4 border-t flex justify-between text-sm">
                    <div>
                      <span className="font-bold mr-2 text-gray-500">#{index + 1}</span>
                      {item.sceneNameCn || item.sceneName}
                      {item.sceneNameCn && <span className="text-gray-400 text-xs ml-1">({item.sceneName})</span>}
                    </div>
                    <div className="text-gray-500">热度: {item.popularityScore.toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 运行记录 */}
          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <select value={logTriggerFilter} onChange={(e) => { setLogTriggerFilter(e.target.value as SceneUpdateTriggerType | ""); setLogPage(1); }} className="border rounded px-3 py-2 text-sm">
                    <option value="">全部触发方式</option>
                    <option value="scheduled">定时任务</option>
                    <option value="manual">手动触发</option>
                  </select>
                  <select value={logStatusFilter} onChange={(e) => { setLogStatusFilter(e.target.value as SceneUpdateLogStatus | ""); setLogPage(1); }} className="border rounded px-3 py-2 text-sm">
                    <option value="">全部状态</option>
                    <option value="running">运行中</option>
                    <option value="success">成功</option>
                    <option value="failed">失败</option>
                    <option value="skipped">跳过</option>
                  </select>
                </div>
                <Button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending} className="px-4 py-2 bg-green-500 text-white rounded text-sm disabled:opacity-50">
                  {triggerMutation.isPending ? "触发中..." : "手动触发更新"}
                </Button>
              </div>

              {triggerMutation.isSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm">{triggerMutation.data.message}</div>
              )}
              {triggerMutation.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">触发失败，请稍后重试</div>
              )}

              {logsQuery.isLoading && <div className="text-center py-8 text-gray-500">加载中...</div>}
              {logsQuery.isError && <div className="text-center py-8 text-red-500">加载运行记录失败，请刷新重试</div>}
              {logsQuery.data && (
                <div className="bg-white rounded shadow overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">触发方式</th>
                        <th className="px-4 py-2 text-left">状态</th>
                        <th className="px-4 py-2 text-left">场景分类</th>
                        <th className="px-4 py-2 text-left">小红书</th>
                        <th className="px-4 py-2 text-left">Instagram</th>
                        <th className="px-4 py-2 text-left">微博</th>
                        <th className="px-4 py-2 text-left">抖音</th>
                        <th className="px-4 py-2 text-left">场景更新</th>
                        <th className="px-4 py-2 text-left">耗时</th>
                        <th className="px-4 py-2 text-left">开始时间</th>
                        <th className="px-4 py-2 text-left">错误信息</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsQuery.data.items.length === 0 && (
                        <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">暂无运行记录</td></tr>
                      )}
                      {logsQuery.data.items.map((logItem) => (
                        <tr key={logItem.id} className="border-t">
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${logItem.triggerType === "scheduled" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                              {logItem.triggerType === "scheduled" ? "定时" : "手动"}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              logItem.status === "success" ? "bg-green-100 text-green-700" :
                              logItem.status === "failed" ? "bg-red-100 text-red-700" :
                              logItem.status === "running" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                            }`}>
                              {logItem.status === "running" ? "运行中" : logItem.status === "success" ? "成功" : logItem.status === "failed" ? "失败" : "跳过"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {SCENE_CATEGORY_LABELS[logItem.sceneCategory as SceneCategory] || logItem.sceneCategory || "-"}
                          </td>
                          <td className="px-4 py-2">{logItem.xiaohongshuCount}</td>
                          <td className="px-4 py-2">{logItem.instagramCount}</td>
                          <td className="px-4 py-2">{logItem.weiboCount ?? 0}</td>
                          <td className="px-4 py-2">{logItem.douyinCount ?? 0}</td>
                          <td className="px-4 py-2">{logItem.scenesUpdated}</td>
                          <td className="px-4 py-2">{logItem.durationMs > 0 ? `${(logItem.durationMs / 1000).toFixed(1)}s` : "-"}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                            {logItem.startedAt ? new Date(logItem.startedAt).toLocaleString("zh-CN") : "-"}
                          </td>
                          <td className="px-4 py-2 text-red-500 text-xs max-w-[200px] truncate">{logItem.errorMessage || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 flex justify-center gap-2 border-t">
                    <button onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={logPage === 1} className="px-3 py-1 border rounded disabled:opacity-50 text-sm">上一页</button>
                    <span className="px-3 py-1 text-sm">第 {logPage} 页（共 {logsQuery.data.total} 条）</span>
                    <button onClick={() => setLogPage((p) => p + 1)} disabled={logsQuery.data.items.length < 15} className="px-3 py-1 border rounded disabled:opacity-50 text-sm">下一页</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="预览" className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-lg"  loading="lazy" />
          <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 text-white text-2xl hover:opacity-70">✕</button>
        </div>
      )}
    </>
  );
};

export default SceneLibraryManagement;
