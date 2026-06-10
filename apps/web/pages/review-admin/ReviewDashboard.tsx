import React, { useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  AdminGlobalSystemSettingsPanel,
  type AdminSystemSettingsTabKey,
} from "../admin/adminGlobalSystemSettingsPanel";
import { ThemeManagementPanel } from "../admin/ThemeManagementPanel";
import { useAdminGlobalConfig } from "../admin/hooks/useAdminGlobalConfig";

type AdminTab = "theme" | "system";

export const ReviewDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("theme");
  const {
    canAccess,
    globalDraft,
    setGlobalDraft,
    configQuery,
    savingSectionId,
    savingGlobalAll,
    refreshingGlobalAll,
    feedback,
    setFeedback,
    saveGlobalSection,
    resetGlobalSection,
    handleRefreshGlobalAll,
    handleSaveGlobalAll,
  } = useAdminGlobalConfig();

  if (!canAccess) {
    return (
      <div className="flex h-full items-center justify-center text-gray-600">只有管理员可以访问此页面。</div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col bg-[#f8f9fc]">
        <div className="border-b border-gray-200 bg-white px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900 font-display">基础配置</h1>
          <p className="mt-1 text-sm text-gray-500">主题维护与系统配置</p>
        </div>

        <div className="border-b border-gray-200 bg-white px-8">
          <div className="flex gap-6 overflow-x-auto">
            {[
              { id: "theme", label: "主题维护" },
              { id: "system", label: "系统配置" },
            ].map((tab) => {
              const isTabLoading = tab.id === "system" && configQuery.isFetching;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as AdminTab)}
                  className={`border-b-2 py-4 text-sm font-semibold inline-flex items-center gap-1.5 ${
                    activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-gray-500"
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
          {activeTab === "theme" ? <ThemeManagementPanel /> : null}

          {activeTab === "system" ? (
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
                activeTab={activeTab as AdminSystemSettingsTabKey}
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
