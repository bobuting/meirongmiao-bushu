import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { ApiError, backendApi } from "../../services/backendApi";
import { useConfirm } from "../../components/ui/ConfirmDialog";

/** 同步运行记录条目 */
interface SyncLogEntry {
  id: string;
  triggerType: string;
  trendType: string;
  status: string;
  source: string | null;
  topicCount: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

/** 热榜抓取参数默认值 */
const DEFAULT_FETCH_PARAMS = {
  hotTrendRealtimeTopN: 50,
  hotTrendVideoTopN: 20,
  hotTrendRealtimeSyncIntervalHours: 2,
  hotTrendVideoSyncIntervalHours: 12,
  hotTrendVideoDateWindowHours: 24,
};

const PAGE_SIZE = 50;

/** 热榜管理页面 — 资产管理 + 抓取参数配置 */
export function HotTrendAssetManagement(): React.ReactElement {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const { confirm } = useConfirm();
  const canAccess = currentUser?.role === "admin";

  const [hotTrendAssetTypeTab, setHotTrendAssetTypeTab] = useState<"realtime" | "video" | "logs" | "dailyReport">("realtime");
  const [currentPage, setCurrentPage] = useState(1);
  const [syncingHotTrend, setSyncingHotTrend] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [llmDetail, setLlmDetail] = useState<Record<string, unknown> | null>(null);

  // 运行记录筛选状态
  const [logPage, setLogPage] = useState(1);
  const [logTriggerFilter, setLogTriggerFilter] = useState<string>("");
  const [logTrendTypeFilter, setLogTrendTypeFilter] = useState<string>("");
  const [logStatusFilter, setLogStatusFilter] = useState<string>("");

  // 每日报告筛选状态
  const [dailyReportPage, setDailyReportPage] = useState(1);

  // 每日报告数据查询
  const dailyReportsQuery = useQuery({
    queryKey: ["admin-hot-trend-daily-reports", token, dailyReportPage],
    enabled: canAccess && hotTrendAssetTypeTab === "dailyReport",
    queryFn: async () => backendApi.adminHotTrendDailyReports(token as string, {
      page: dailyReportPage,
      limit: 15,
    }),
    staleTime: 30_000,
  });

  // 报告详情弹窗
  const [selectedReportDate, setSelectedReportDate] = useState<string | null>(null);
  const [selectedReportDetail, setSelectedReportDetail] = useState<Record<string, unknown> | null>(null);

  const dailyReportDetailQuery = useQuery({
    queryKey: ["admin-hot-trend-daily-report-detail", selectedReportDate],
    enabled: !!selectedReportDate,
    queryFn: async () => {
      // report_date 在数据库中是 date 类型，pg 驱动返回 UTC ISO 字符串（如 2026-04-24T16:00:00.000Z 表示北京时间 04-25）
      // split("T")[0] 会得到 UTC 日期 04-24，与数据库实际值 04-25 不匹配，必须用本地时区转换
      const d = new Date(selectedReportDate!);
      const dateOnly = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return backendApi.adminHotTrendDailyReportDetail(token as string, dateOnly);
    },
  });

  // 热榜资产数据查询（按 trendType 分页）
  const hotTrendScriptsQuery = useQuery({
    queryKey: ["admin-hot-trend-scripts", token, hotTrendAssetTypeTab, currentPage],
    enabled: canAccess && hotTrendAssetTypeTab !== "logs",
    queryFn: async () => backendApi.adminHotTrendScripts(token as string, {
      trendType: hotTrendAssetTypeTab as "realtime" | "video",
      page: currentPage,
      pageSize: PAGE_SIZE,
    }),
    staleTime: 60_000,
  });

  // 同步运行记录查询
  const syncLogsQuery = useQuery({
    queryKey: ["admin-hot-trend-sync-logs", token, logPage, logTriggerFilter, logTrendTypeFilter, logStatusFilter],
    enabled: canAccess && hotTrendAssetTypeTab === "logs",
    queryFn: async () => backendApi.adminHotTrendSyncLogs(token as string, {
      page: logPage,
      limit: 15,
      triggerType: (logTriggerFilter || undefined) as "scheduled" | "manual" | undefined,
      trendType: (logTrendTypeFilter || undefined) as "realtime" | "video" | undefined,
      status: (logStatusFilter || undefined) as "running" | "success" | "failed" | undefined,
    }),
    staleTime: 10_000,
  });

  // 系统配置查询
  const configQuery = useQuery({
    queryKey: ["admin-config", token],
    enabled: canAccess,
    queryFn: async () => backendApi.adminConfigGet(token as string),
  });

  // 抓取参数本地编辑状态
  const [fetchDraft, setFetchDraft] = useState(DEFAULT_FETCH_PARAMS);
  const [fetchDraftInitialized, setFetchDraftInitialized] = useState(false);

  // 配置加载后初始化本地 draft
  if (configQuery.data && !fetchDraftInitialized) {
    const d = configQuery.data;
    setFetchDraft({
      hotTrendRealtimeTopN: d.hotTrendRealtimeTopN ?? DEFAULT_FETCH_PARAMS.hotTrendRealtimeTopN,
      hotTrendVideoTopN: d.hotTrendVideoTopN ?? DEFAULT_FETCH_PARAMS.hotTrendVideoTopN,
      hotTrendRealtimeSyncIntervalHours: d.hotTrendRealtimeSyncIntervalHours ?? DEFAULT_FETCH_PARAMS.hotTrendRealtimeSyncIntervalHours,
      hotTrendVideoSyncIntervalHours: d.hotTrendVideoSyncIntervalHours ?? DEFAULT_FETCH_PARAMS.hotTrendVideoSyncIntervalHours,
      hotTrendVideoDateWindowHours: d.hotTrendVideoDateWindowHours ?? DEFAULT_FETCH_PARAMS.hotTrendVideoDateWindowHours,
    });
    setFetchDraftInitialized(true);
  }

  const displayScripts = hotTrendScriptsQuery.data?.scripts ?? [];
  const total = hotTrendScriptsQuery.data?.total ?? 0;
  const realtimeTotal = hotTrendScriptsQuery.data?.realtimeTotal ?? 0;
  const videoTotal = hotTrendScriptsQuery.data?.videoTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 切换 tab 时重置到第 1 页
  const handleTabChange = (tab: "realtime" | "video" | "logs" | "dailyReport") => {
    if (tab !== hotTrendAssetTypeTab) {
      setHotTrendAssetTypeTab(tab);
      setCurrentPage(1);
      setLogPage(1);
    }
  };

  // 同步热榜资产
  const handleSyncHotTrendScripts = async (force: boolean, type: "realtime" | "video" | "all" = "realtime") => {
    if (!token) return;
    try {
      setSyncingHotTrend(true);
      setFeedback(null);
      const result = await backendApi.adminSyncHotTrendScripts(token, { force, type });
      await hotTrendScriptsQuery.refetch();
      const summary = result.synced
        .map((item) => `${item.type}:${item.topicCount}`)
        .join(" / ");
      setFeedback(`热榜资产同步完成(${summary})`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "热榜资产同步失败";
      setFeedback(message);
    } finally {
      setSyncingHotTrend(false);
    }
  };

  // 删除热榜脚本
  const handleDeleteHotTrendScript = async (scriptId: string) => {
    if (!token) return;
    const confirmed = await confirm("确认删除该热榜资产？", "删除确认");
    if (!confirmed) return;
    try {
      setFeedback(null);
      await backendApi.adminDeleteHotTrendScript(token, scriptId);
      await hotTrendScriptsQuery.refetch();
      setFeedback("热榜脚本已删除");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "删除热榜脚本失败";
      setFeedback(message);
    }
  };

  // 保存抓取参数
  const handleSaveFetchParams = async () => {
    if (!token) return;
    try {
      setSavingConfig(true);
      setFeedback(null);
      await backendApi.adminConfigPatch(token, fetchDraft);
      setFeedback("抓取参数已保存");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "保存失败";
      setFeedback(message);
    } finally {
      setSavingConfig(false);
    }
  };

  if (!canAccess) {
    return (
      <>
        <div className="flex h-full items-center justify-center text-gray-600">只有管理员可以访问此页面。</div>
      </>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col bg-[#f8f9fc]">
        {/* 页面标题 */}
        <div className="border-b border-gray-200 bg-white px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900 font-display">热榜管理</h1>
          <p className="mt-1 text-sm text-gray-500">热榜资产数据管理与抓取参数配置</p>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="space-y-6">

            {/* ======== 抓取参数配置 ======== */}
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-bold text-gray-900">热榜抓取参数</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">实时热榜 TopN 入库数</span>
                  <span className="mb-1 block text-[11px] text-gray-400">实时热榜抓取后存入数据库的最大条数</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="w-full rounded-lg border border-gray-200 bg-[#f3f5f9] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    value={fetchDraft.hotTrendRealtimeTopN}
                    onChange={(e) => setFetchDraft((d) => ({ ...d, hotTrendRealtimeTopN: Math.max(1, Number(e.target.value || 50)) }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">视频热榜 TopN 入库数</span>
                  <span className="mb-1 block text-[11px] text-gray-400">视频热榜抓取后入库 + 反推的最大条数</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="w-full rounded-lg border border-gray-200 bg-[#f3f5f9] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    value={fetchDraft.hotTrendVideoTopN}
                    onChange={(e) => setFetchDraft((d) => ({ ...d, hotTrendVideoTopN: Math.max(1, Number(e.target.value || 20)) }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">实时热榜抓取间隔（小时）</span>
                  <span className="mb-1 block text-[11px] text-gray-400">定时器每隔多少小时自动抓取一次实时热榜</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    className="w-full rounded-lg border border-gray-200 bg-[#f3f5f9] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    value={fetchDraft.hotTrendRealtimeSyncIntervalHours}
                    onChange={(e) => setFetchDraft((d) => ({ ...d, hotTrendRealtimeSyncIntervalHours: Math.max(1, Number(e.target.value || 2)) }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">视频热榜抓取间隔（小时）</span>
                  <span className="mb-1 block text-[11px] text-gray-400">定时器每隔多少小时自动抓取一次视频热榜</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    className="w-full rounded-lg border border-gray-200 bg-[#f3f5f9] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    value={fetchDraft.hotTrendVideoSyncIntervalHours}
                    onChange={(e) => setFetchDraft((d) => ({ ...d, hotTrendVideoSyncIntervalHours: Math.max(1, Number(e.target.value || 12)) }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">视频热榜时间窗（小时）</span>
                  <span className="mb-1 block text-[11px] text-gray-400">拉取视频热榜的时间范围，自动映射为 24h / 7d / 30d</span>
                  <input
                    type="number"
                    min={24}
                    max={720}
                    className="w-full rounded-lg border border-gray-200 bg-[#f3f5f9] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    value={fetchDraft.hotTrendVideoDateWindowHours}
                    onChange={(e) => setFetchDraft((d) => ({ ...d, hotTrendVideoDateWindowHours: Math.max(24, Number(e.target.value || 24)) }))}
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button isLoading={savingConfig} onClick={() => void handleSaveFetchParams()}>保存参数</Button>
              </div>
            </section>

            {/* 反馈消息 */}
            {feedback ? (
              <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">{feedback}</div>
            ) : null}

            {/* ======== 资产管理 ======== */}

            {/* 实时/视频/运行记录切换 */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => handleTabChange("realtime")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                  hotTrendAssetTypeTab === "realtime" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                实时热榜资产 ({realtimeTotal})
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("video")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                  hotTrendAssetTypeTab === "video" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                视频热榜资产 ({videoTotal})
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("logs")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                  hotTrendAssetTypeTab === "logs" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                运行记录
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("dailyReport")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                  hotTrendAssetTypeTab === "dailyReport" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                每日报告
              </button>
            </div>

            {/* 同步按钮（仅在视频/实时热榜 Tab 显示） */}
            {(hotTrendAssetTypeTab === "video" || hotTrendAssetTypeTab === "realtime") && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" isLoading={syncingHotTrend} onClick={() => void handleSyncHotTrendScripts(false, hotTrendAssetTypeTab)}>
                同步{hotTrendAssetTypeTab === "video" ? "视频" : "实时"}热榜(1小时缓存)
              </Button>
              <Button variant="secondary" isLoading={syncingHotTrend} onClick={() => void handleSyncHotTrendScripts(true, hotTrendAssetTypeTab)}>
                强制立即同步{hotTrendAssetTypeTab === "video" ? "视频" : "实时"}热榜
              </Button>
            </div>
            )}

            {/* ======== 运行记录 Tab ======== */}
            {hotTrendAssetTypeTab === "logs" && (
            <>
              {/* 筛选器 */}
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={logTriggerFilter}
                  onChange={(e) => { setLogTriggerFilter(e.target.value); setLogPage(1); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none"
                >
                  <option value="">全部触发方式</option>
                  <option value="scheduled">定时任务</option>
                  <option value="manual">手动触发</option>
                </select>
                <select
                  value={logTrendTypeFilter}
                  onChange={(e) => { setLogTrendTypeFilter(e.target.value); setLogPage(1); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none"
                >
                  <option value="">全部类型</option>
                  <option value="realtime">实时热榜</option>
                  <option value="video">视频热榜</option>
                </select>
                <select
                  value={logStatusFilter}
                  onChange={(e) => { setLogStatusFilter(e.target.value); setLogPage(1); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none"
                >
                  <option value="">全部状态</option>
                  <option value="running">运行中</option>
                  <option value="success">成功</option>
                  <option value="failed">失败</option>
                </select>
              </div>

              {/* 运行记录表格 */}
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">触发方式</th>
                      <th className="px-4 py-3">类型</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3">来源</th>
                      <th className="px-4 py-3">话题数</th>
                      <th className="px-4 py-3">耗时</th>
                      <th className="px-4 py-3">开始时间</th>
                      <th className="px-4 py-3">完成时间</th>
                      <th className="px-4 py-3">错误信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(syncLogsQuery.data?.items ?? []).map((log: SyncLogEntry) => (
                      <tr key={log.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            log.triggerType === "scheduled" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                          }`}>
                            {log.triggerType === "scheduled" ? "定时" : "手动"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            log.trendType === "realtime" ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"
                          }`}>
                            {log.trendType === "realtime" ? "实时" : "视频"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            log.status === "success"
                              ? "bg-green-100 text-green-700"
                              : log.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {log.status === "success" ? "成功" : log.status === "failed" ? "失败" : "运行中"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{log.source ?? "-"}</td>
                        <td className="px-4 py-3 text-xs text-gray-900 font-medium">{log.topicCount}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {log.durationMs > 0 ? `${(log.durationMs / 1000).toFixed(1)}s` : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {log.startedAt ? new Date(log.startedAt).toLocaleString("zh-CN") : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {log.finishedAt ? new Date(log.finishedAt).toLocaleString("zh-CN") : "-"}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {log.errorMessage ? (
                            <span className="text-xs text-red-600 truncate block" title={log.errorMessage}>
                              {log.errorMessage.length > 80 ? `${log.errorMessage.slice(0, 80)}...` : log.errorMessage}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(syncLogsQuery.data?.items ?? []).length === 0 ? (
                  <div className="border-t border-gray-100 px-4 py-6 text-sm text-gray-500">
                    {syncLogsQuery.isLoading ? "加载中..." : "暂无同步运行记录"}
                  </div>
                ) : null}

                {/* 运行记录分页 */}
                {(() => {
                  const logTotal = syncLogsQuery.data?.total ?? 0;
                  const logTotalPages = Math.max(1, Math.ceil(logTotal / 15));
                  return logTotalPages > 1 ? (
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                      <span className="text-xs text-gray-500">
                        共 {logTotal} 条，第 {logPage}/{logTotalPages} 页
                      </span>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={logPage <= 1} onClick={() => setLogPage(1)}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">首页</button>
                        <button type="button" disabled={logPage <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">上一页</button>
                        <button type="button" disabled={logPage >= logTotalPages} onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">下一页</button>
                        <button type="button" disabled={logPage >= logTotalPages} onClick={() => setLogPage(logTotalPages)}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">末页</button>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </>
            )}

            {/* ======== 资产管理（非 logs Tab） ======== */}
            {hotTrendAssetTypeTab !== "logs" && (
            <>
            {/* 资产列表表格 */}
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">标题</th>
                    {hotTrendAssetTypeTab === "video" ? (
                      <>
                        <th className="px-4 py-3">排名</th>
                        <th className="px-4 py-3">适合度</th>
                        <th className="px-4 py-3">真人出镜</th>
                        <th className="px-4 py-3">LLM返回</th>
                        <th className="px-4 py-3">来源</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">理由</th>
                      </>
                    )}
                    <th className="px-4 py-3">日期</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayScripts.map((script) => (
                    <tr key={script.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 max-w-xs truncate">
                        <span className="font-semibold text-gray-900" title={script.title}>{script.title}</span>
                      </td>
                      {hotTrendAssetTypeTab === "video" ? (
                        <>
                          <td className="px-4 py-3">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                              script.rank != null && Number(script.rank) <= 3
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-600"
                            }`}>
                              {String(script.rank ?? "-")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              String(script.suitability ?? "") === "high"
                                ? "bg-green-100 text-green-700"
                                : String(script.suitability ?? "") === "low"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {String(script.suitability ?? "") === "high" ? "高" : String(script.suitability ?? "") === "low" ? "低" : "中"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const hp = String(script.humanPresence ?? "uncertain");
                              return (
                                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                  hp === "yes" ? "bg-blue-100 text-blue-700" : hp === "no" ? "bg-gray-100 text-gray-600" : "bg-yellow-50 text-yellow-600"
                                }`}>
                                  {hp === "yes" ? "是" : hp === "no" ? "否" : "不确定"}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            {script.hotTrendLabels &&
                            typeof script.hotTrendLabels === "object" &&
                            Object.keys(script.hotTrendLabels).length > 0 ? (
                              <button
                                type="button"
                                className="whitespace-pre-wrap break-all text-[11px] text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer bg-transparent border-none p-0 font-mono"
                                onClick={() => setLlmDetail(script.hotTrendLabels ?? null)}
                              >
                                {JSON.stringify(script.hotTrendLabels, null, 2).slice(0, 80)}...
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {script.sourceUrl ? (
                              <a
                                href={String(script.sourceUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline truncate block max-w-[120px]"
                              >
                                {script.sourceUrl}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">{script.ownerEmail}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-600">{script.reason}</span>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3">{new Date(script.date).toLocaleDateString("zh-CN")}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" onClick={() => void handleDeleteHotTrendScript(script.id)}>删除</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayScripts.length === 0 ? (
                <div className="border-t border-gray-100 px-4 py-6 text-sm text-gray-500">
                  暂无{hotTrendAssetTypeTab === "video" ? "视频" : "实时"}热榜资产，点击&ldquo;同步&rdquo;按钮自动采集。
                </div>
              ) : null}

              {/* 分页控件 */}
              {totalPages > 1 ? (
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                  <span className="text-xs text-gray-500">
                    共 {total} 条，第 {currentPage}/{totalPages} 页
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      首页
                    </button>
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      末页
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            </>
            )}

            {/* ======== 每日报告 Tab ======== */}
            {hotTrendAssetTypeTab === "dailyReport" && (
            <>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">日期</th>
                      <th className="px-4 py-3">数据来源</th>
                      <th className="px-4 py-3">热点数</th>
                      <th className="px-4 py-3">核心趋势</th>
                      <th className="px-4 py-3">穿搭切入点</th>
                      <th className="px-4 py-3">情绪氛围</th>
                      <th className="px-4 py-3">更新时间</th>
                      <th className="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dailyReportsQuery.data?.items ?? []).map((report) => (
                      <tr key={report.report_date} className="border-t border-gray-100">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{report.report_date}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(report.platform_sources ?? []).map((p: string) => (
                              <span key={p} className="rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-semibold text-cyan-700">{p}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">{report.hotspot_count}</td>
                        <td className="px-4 py-3 max-w-[160px] truncate text-xs text-gray-600">
                          {(report.core_trends ?? []).slice(0, 2).join("、") || "-"}
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate text-xs text-gray-600">
                          {(report.outfit_angles ?? []).slice(0, 2).join("、") || "-"}
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate text-xs text-gray-600">
                          {(report.emotion_atmosphere ?? []).slice(0, 2).join("、") || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {report.updated_at ? new Date(report.updated_at).toLocaleString("zh-CN") : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelectedReportDate(report.report_date);
                            }}
                          >
                            详情
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(dailyReportsQuery.data?.items ?? []).length === 0 ? (
                  <div className="border-t border-gray-100 px-4 py-6 text-sm text-gray-500">
                    {dailyReportsQuery.isLoading ? "加载中..." : "暂无每日报告数据，等待凌晨 2 点自动生成"}
                  </div>
                ) : null}

                {/* 分页 */}
                {(() => {
                  const total = dailyReportsQuery.data?.total ?? 0;
                  const totalPages = Math.max(1, Math.ceil(total / 15));
                  return totalPages > 1 ? (
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                      <span className="text-xs text-gray-500">
                        共 {total} 条，第 {dailyReportPage}/{totalPages} 页
                      </span>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={dailyReportPage <= 1} onClick={() => setDailyReportPage(1)}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">首页</button>
                        <button type="button" disabled={dailyReportPage <= 1} onClick={() => setDailyReportPage((p) => Math.max(1, p - 1))}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">上一页</button>
                        <button type="button" disabled={dailyReportPage >= totalPages} onClick={() => setDailyReportPage((p) => Math.min(totalPages, p + 1))}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">下一页</button>
                        <button type="button" disabled={dailyReportPage >= totalPages} onClick={() => setDailyReportPage(totalPages)}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">末页</button>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </>
            )}
        </div>

        {/* LLM 返回详情弹窗 */}
        {llmDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setLlmDetail(null)}>
            <div className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-bold text-gray-900">LLM 完整返回数据</h3>
                <button
                  type="button"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  onClick={() => setLlmDetail(null)}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto p-6 max-h-[calc(85vh-4rem)]">
                <pre className="whitespace-pre-wrap break-all text-xs text-gray-800 leading-relaxed font-mono">
                  {JSON.stringify(llmDetail, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 每日报告详情弹窗 */}
        {selectedReportDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedReportDate(null)}>
            <div className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-bold text-gray-900">每日报告详情 — {selectedReportDate}</h3>
                <button
                  type="button"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  onClick={() => setSelectedReportDate(null)}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto p-6 max-h-[calc(85vh-4rem)] space-y-5">
                {dailyReportDetailQuery.isLoading ? (
                  <div className="text-center text-gray-500">加载中...</div>
                ) : dailyReportDetailQuery.data ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-gray-500">热点总数：</span><span className="font-medium">{String(dailyReportDetailQuery.data.hotspot_count)}</span></div>
                      <div><span className="text-gray-500">数据来源：</span><span className="font-medium">{((dailyReportDetailQuery.data.platform_sources as string[]) || []).join("、")}</span></div>
                    </div>
                    {dailyReportDetailQuery.data.platform_distribution && (
                      <div>
                        <h4 className="mb-2 text-sm font-bold text-gray-900">平台分布</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(dailyReportDetailQuery.data.platform_distribution as Record<string, number>).map(([k, v]) => (
                            <span key={k} className="rounded bg-gray-100 px-2 py-1 text-xs">{k}: {v}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(["core_trends", "outfit_angles", "emotion_atmosphere", "avoid_topics", "creative_suggestions"] as const).map((section) => {
                      const labelMap = { core_trends: "核心趋势", outfit_angles: "穿搭切入点", emotion_atmosphere: "情绪氛围", avoid_topics: "规避话题", creative_suggestions: "创意建议" } as const;
                      const items = dailyReportDetailQuery.data[section] as string[] | undefined;
                      if (!items || items.length === 0) return null;
                      return (
                        <div key={section}>
                          <h4 className="mb-2 text-sm font-bold text-gray-900">{labelMap[section]}</h4>
                          <ul className="list-inside list-disc text-sm text-gray-700">
                            {items.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      );
                    })}
                    {dailyReportDetailQuery.data.raw_report_text && (
                      <div>
                        <h4 className="mb-2 text-sm font-bold text-gray-900">LLM 分析原文</h4>
                        <pre className="whitespace-pre-wrap break-all text-xs text-gray-800 leading-relaxed font-mono bg-gray-50 p-4 rounded-lg max-h-[300px] overflow-y-auto">
                          {String(dailyReportDetailQuery.data.raw_report_text)}
                        </pre>
                      </div>
                    )}
                    {dailyReportDetailQuery.data.original_hotspots && (
                      <div>
                        <h4 className="mb-2 text-sm font-bold text-gray-900">原始热点数据</h4>
                        <pre className="whitespace-pre-wrap break-all text-xs text-gray-800 font-mono bg-gray-50 p-4 rounded-lg max-h-[200px] overflow-y-auto">
                          {JSON.stringify(dailyReportDetailQuery.data.original_hotspots, null, 2).slice(0, 1000)}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-gray-500">加载失败</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
