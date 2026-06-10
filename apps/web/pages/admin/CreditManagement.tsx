/**
 * 积分管理页面
 * 从 ReviewDashboard 独立出来的积分相关功能：
 * - 积分审计（creditAudit）
 * - RouteKey 积分定价（routeKeyPricing）
 * - 全局配置（generation）
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { backendApi } from "../../services/backendApi";
import {
  AdminGlobalSystemSettingsPanel,
  type AdminSystemSettingsTabKey,
} from "./adminGlobalSystemSettingsPanel";
import { useAdminGlobalConfig } from "./hooks/useAdminGlobalConfig";
import { RouteKeyCreditCostPanel } from "./RouteKeyCreditCostPanel";
import { useToast } from "../../components/ui/Toast";

type CreditTab = "creditAudit" | "routeKeyPricing" | "generation";

export const CreditManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CreditTab>("creditAudit");
  const toast = useToast();
  const {
    canAccess,
    token,
    globalDraft,
    setGlobalDraft,
    configQuery,
    savingSectionId,
    savingGlobalAll,
    refreshingGlobalAll,
    feedback,
    saveGlobalSection,
    resetGlobalSection,
    handleRefreshGlobalAll,
    handleSaveGlobalAll,
  } = useAdminGlobalConfig();

  // 积分审计分页与过滤
  const [auditPage, setAuditPage] = useState(0);
  const auditPageSize = 50;
  const [filterUserEmail, setFilterUserEmail] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterActivity, setFilterActivity] = useState("");
  const activeFilters = {
    userEmail: filterUserEmail.trim() || undefined,
    projectId: filterProjectId.trim() || undefined,
    activity: filterActivity.trim() || undefined,
  };
  const hasFilters = !!(activeFilters.userEmail || activeFilters.projectId || activeFilters.activity);

  // 复制到剪贴板
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`复制${label}成功`);
  };

  const creditAuditsQuery = useQuery({
    queryKey: ["admin-credit-audits", token, auditPage, activeFilters],
    enabled: canAccess,
    queryFn: async () =>
      backendApi.adminCreditAudits(token, auditPageSize, auditPage * auditPageSize, activeFilters),
  });

  const creditAudits = (creditAuditsQuery.data?.items ?? []) as Array<{
    id: string;
    userId: string;
    userEmail: string;
    amount: number;
    type: string;
    reason: string;
    createdAt: number;
    label: string;
    actorEmail: string;
    activity: string;
    success: boolean;
    chargeAmount: number;
    delta: number;
    projectId: string | null;
  }>;
  const auditTotal = creditAuditsQuery.data?.total ?? 0;
  const auditTotalPages = Math.ceil(auditTotal / auditPageSize);

  if (!canAccess) {
    return (
      <div className="flex h-full items-center justify-center text-gray-600">
        只有管理员可以访问此页面。
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col bg-[#f8f9fc]">
        <div className="border-b border-gray-200 bg-white px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900 font-display">积分管理</h1>
          <p className="mt-1 text-sm text-gray-500">积分审计与生成配置</p>
        </div>

        <div className="border-b border-gray-200 bg-white px-8">
          <div className="flex gap-6 overflow-x-auto">
            {[
              { id: "creditAudit", label: "积分审计" },
              { id: "routeKeyPricing", label: "RouteKey 积分定价" },
              { id: "generation", label: "全局配置" },
            ].map((tab) => {
              const isTabLoading =
                (tab.id === "creditAudit" && creditAuditsQuery.isFetching) ||
                (tab.id === "generation" && configQuery.isFetching);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as CreditTab)}
                  className={`border-b-2 py-4 text-sm font-semibold inline-flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-gray-500"
                  }`}
                >
                  {tab.label}
                  {isTabLoading ? (
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === "creditAudit" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void creditAuditsQuery.refetch()}
                  isLoading={creditAuditsQuery.isFetching}
                >
                  刷新积分审计
                </Button>
                <input
                  type="text"
                  placeholder="用户邮箱"
                  value={filterUserEmail}
                  onChange={(e) => { setFilterUserEmail(e.target.value); setAuditPage(0); }}
                  className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="项目 ID"
                  value={filterProjectId}
                  onChange={(e) => { setFilterProjectId(e.target.value); setAuditPage(0); }}
                  className="h-9 w-52 rounded-md border border-gray-300 px-3 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="活动（routeKey）"
                  value={filterActivity}
                  onChange={(e) => { setFilterActivity(e.target.value); setAuditPage(0); }}
                  className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:border-primary focus:outline-none"
                />
                {hasFilters ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFilterUserEmail("");
                      setFilterProjectId("");
                      setFilterActivity("");
                      setAuditPage(0);
                    }}
                  >
                    清除过滤
                  </Button>
                ) : null}
                <span className="ml-auto text-xs text-gray-500">
                  共 {auditTotal} 条，第 {auditPage + 1}/{auditTotalPages} 页
                </span>
              </div>
              {creditAuditsQuery.isError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {creditAuditsQuery.error instanceof Error
                    ? creditAuditsQuery.error.message
                    : "加载积分审计失败"}
                </div>
              ) : null}
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">标注</th>
                      <th className="px-4 py-3">用户</th>
                      <th className="px-4 py-3">项目 ID</th>
                      <th className="px-4 py-3">时间</th>
                      <th className="px-4 py-3">活动</th>
                      <th className="px-4 py-3">是否成功</th>
                      <th className="px-4 py-3">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditAudits.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-semibold text-gray-800">{item.label}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="flex items-center gap-1">
                            <span>{item.userEmail}</span>
                            <button
                              onClick={() => copyToClipboard(item.userEmail, '用户邮箱')}
                              className="p-0.5 text-gray-400 hover:text-primary rounded transition-colors"
                              title="复制用户邮箱"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                          <div className="text-[11px] text-gray-400">操作人：{item.actorEmail}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {item.projectId ? (
                            <div className="flex items-center gap-1">
                              <span title={item.projectId} className="cursor-default">{item.projectId.slice(0, 12)}…</span>
                              <button
                                onClick={() => copyToClipboard(item.projectId!, '项目ID')}
                                className="p-0.5 text-gray-400 hover:text-primary rounded transition-colors"
                                title="复制项目ID"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(item.createdAt).toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{item.activity}</td>
                        <td className="px-4 py-3">
                          <span className={item.success ? "text-green-600" : "text-red-600"}>
                            {item.success ? "成功" : "失败"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-900">
                          {item.label === "管理员调账"
                            ? `${item.delta > 0 ? "+" : ""}${item.delta}`
                            : item.chargeAmount}
                          积分
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {creditAudits.length < 1 ? (
                  <div className="border-t border-gray-100 px-4 py-6 text-sm text-gray-500">
                    暂无积分审计记录。
                  </div>
                ) : null}
                {auditTotalPages > 1 ? (
                  <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                    <span className="text-xs text-gray-500">
                      {auditPage * auditPageSize + 1}-
                      {Math.min((auditPage + 1) * auditPageSize, auditTotal)} / {auditTotal}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        disabled={auditPage === 0}
                        onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={auditPage >= auditTotalPages - 1}
                        onClick={() => setAuditPage((p) => Math.min(auditTotalPages - 1, p + 1))}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "routeKeyPricing" ? (
            <RouteKeyCreditCostPanel />
          ) : null}

          {activeTab === "generation" ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray-600">系统全局配置，修改后即时生效。</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => void handleRefreshGlobalAll()}
                    isLoading={refreshingGlobalAll || configQuery.isRefetching}
                  >
                    刷新全部
                  </Button>
                  <Button onClick={() => void handleSaveGlobalAll()} isLoading={savingGlobalAll}>
                    保存全部
                  </Button>
                </div>
              </div>
              {feedback ? (
                <div className="border border-[#f3d3a8] bg-[#fff7ed] px-4 py-3 text-sm text-[#9a3412]">
                  {feedback}
                </div>
              ) : null}
              <AdminGlobalSystemSettingsPanel
                activeTab={"generation" as AdminSystemSettingsTabKey}
                draft={globalDraft}
                feedback=""
                savingSectionId={savingSectionId}
                onChange={(patch) => setGlobalDraft((current) => ({ ...current, ...patch }))}
                onSaveSection={(sectionId) => void saveGlobalSection(sectionId)}
                onResetSection={(sectionId) => void resetGlobalSection(sectionId)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};
