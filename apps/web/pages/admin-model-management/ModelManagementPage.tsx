// apps/web/pages/admin-model-management/ModelManagementPage.tsx
/**
 * 大模型管理后台主页面
 * 包含功能路由、模型预设库、Provider管理、路由策略、监控面板五个 Tab
 */
import React, { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { ProviderManagementPanel } from "./ProviderManagementPanel";
import { RoutingPolicyPanel } from "./RoutingPolicyPanel";
import { MonitoringPanel } from "./MonitoringPanel";

type TabKey = "policies" | "providers" | "monitoring";

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: "policies", label: "路由策略", icon: "📋" },
  { key: "providers", label: "Provider管理", icon: "🔌" },
  { key: "monitoring", label: "监控", icon: "📊" },
];

export const ModelManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("policies");
  const currentUser = useAppStore((state) => state.currentUser);

  // 权限检查：仅管理员可访问
  if (!currentUser || currentUser.role !== "admin") {
    return (
      <>
        <div className="h-full overflow-auto p-6">
          <div className="text-center text-gray-500 py-12">
            无权限访问此页面
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto p-6">
        {/* Tab 导航 */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-2.5 px-4 border-b-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeTab === tab.key
                    ? "border-amber-500 text-amber-600 bg-amber-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab 内容 - 使用 CSS 隐藏而非卸载，保持组件状态 */}
        <div className="relative">
          <div className={activeTab === "policies" ? "" : "hidden"}>
            <RoutingPolicyPanel />
          </div>
          <div className={activeTab === "providers" ? "" : "hidden"}>
            <ProviderManagementPanel />
          </div>
          <div className={activeTab === "monitoring" ? "" : "hidden"}>
            <MonitoringPanel />
          </div>
        </div>
      </div>
    </>
  );
};

export default ModelManagementPage;