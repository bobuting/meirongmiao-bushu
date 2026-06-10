/**
 * API 配置管理页面
 *
 * 独立于审核管理的 API 配置面板：
 * 抖音热榜与视频反推 API 配置
 */

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { backendApi, ApiError } from "../../services/backendApi";

// ========== 类型定义 ==========
interface IntegrationConfigState {
  reverseFetchStageOrder: string;
  reverseExternalApiPriority: string;
  apifyReverseApiUrl: string;
  apifyReverseApiToken: string;
  tikhubVideoHotApiUrl: string;
  tikhubRealtimeHotApiUrl: string;
  tikhubReverseApiUrl: string;
  tikhubApiToken: string;
  anytocopyReverseApiUrl: string;
  anytocopyReverseApiToken: string;
  anytocopyEnabled: boolean;
  douhotVideoHotApiUrl: string;
  douyinHotHubRealtimeUrl: string;
  hotTrendPromptVersion: string;
  providerErrorLogRetentionDays: number;
}

const defaultIntegrationConfig: IntegrationConfigState = {
  reverseFetchStageOrder: "S5_EXTERNAL_API,S1_CUSTOM_COOKIE,S2_PUBLIC_POOL,S3_PLAYWRIGHT_GUEST,S4_USER_QR_COOKIE,S6_LOCAL_FILE",
  reverseExternalApiPriority: "apify,tikhub,anytocopy",
  apifyReverseApiUrl: "https://api.apify.com/v2/acts/apple_yang~douyin-transcripts-scraper/run-sync-get-dataset-items",
  apifyReverseApiToken: "",
  tikhubVideoHotApiUrl: "https://api.tikhub.io/api/v1/douyin/billboard/fetch_hot_total_low_fan_list",
  tikhubRealtimeHotApiUrl: "https://api.tikhub.io/api/v1/douyin/billboard/fetch_hot_total_list",
  tikhubReverseApiUrl: "https://api.tikhub.io/api/v1/douyin/web/fetch_video_high_quality_play_url",
  tikhubApiToken: "",
  anytocopyReverseApiUrl: "",
  anytocopyReverseApiToken: "",
  anytocopyEnabled: false,
  douhotVideoHotApiUrl: "https://douhot.douyin.com/square/hotspot",
  douyinHotHubRealtimeUrl: "https://raw.githubusercontent.com/lonnyzhang423/douyin-hot-hub/main/README.md",
  hotTrendPromptVersion: "ht-v2026.03.14-r1",
  providerErrorLogRetentionDays: 10,
};

// ========== 样式常量 ==========
const inputCls =
  "rounded-xl border border-gray-200 bg-[#f3f5f9] px-3 py-2.5 text-sm text-gray-800 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 w-full";
const labelCls = "block mb-1.5 text-xs font-semibold text-gray-600";

// ========== 配置分组定义 ==========
interface ConfigGroup {
  title: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  fields: Array<{
    key: keyof IntegrationConfigState;
    label: string;
    type?: "text" | "number";
    placeholder?: string;
    min?: number;
    max?: number;
  }>;
  checkboxes?: Array<{
    key: keyof IntegrationConfigState;
    label: string;
    accent?: string;
  }>;
}

const configGroups: ConfigGroup[] = [
  {
    title: "反推 Stage 配置",
    icon: "swap_vert",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    fields: [
      { key: "reverseFetchStageOrder", label: "反推 Stage 顺序", placeholder: "S5_EXTERNAL_API,S1_CUSTOM_COOKIE,..." },
      { key: "reverseExternalApiPriority", label: "S5 外部 API 优先级", placeholder: "apify,tikhub,anytocopy" },
    ],
  },
  {
    title: "视频热榜 API",
    icon: "trending_up",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    fields: [
      { key: "tikhubVideoHotApiUrl", label: "TikHub 视频热榜 API（主源）", placeholder: "https://api.tikhub.io/..." },
      { key: "douhotVideoHotApiUrl", label: "Douhot 视频热榜 API（备源）", placeholder: "https://douhot.douyin.com/..." },
    ],
  },
  {
    title: "实时热搜 API",
    icon: "bolt",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    fields: [
      { key: "douyinHotHubRealtimeUrl", label: "douyin-hot-hub README（主源）", placeholder: "https://raw.githubusercontent.com/..." },
      { key: "tikhubRealtimeHotApiUrl", label: "TikHub 实时热搜 API（备源）", placeholder: "https://api.tikhub.io/..." },
    ],
  },
  {
    title: "反推外部 API（S5 Stage）",
    icon: "hub",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    fields: [
      { key: "apifyReverseApiUrl", label: "Apify API URL（S5-1）", placeholder: "https://api.apify.com/..." },
      { key: "apifyReverseApiToken", label: "Apify Token（如 URL 已带 token 可留空）", placeholder: "apify_api_xxxx..." },
      { key: "tikhubReverseApiUrl", label: "TikHub 反推 API URL（S5-2）", placeholder: "https://api.tikhub.io/..." },
      { key: "tikhubApiToken", label: "TikHub Token", placeholder: "token_xxxx..." },
      { key: "anytocopyReverseApiUrl", label: "AnyToCopy API URL（S5-3，默认可留空）", placeholder: "https://..." },
      { key: "anytocopyReverseApiToken", label: "AnyToCopy Token（可选）", placeholder: "token_xxxx..." },
    ],
    checkboxes: [
      { key: "anytocopyEnabled", label: "启用 AnyToCopy（默认关闭）", accent: "accent-amber-500" },
    ],
  },
  {
    title: "其他配置",
    icon: "tune",
    iconBg: "bg-gray-100",
    iconColor: "text-gray-600",
    fields: [
      { key: "hotTrendPromptVersion", label: "热榜提示词版本", placeholder: "ht-v2026.03.14-r1" },
      { key: "providerErrorLogRetentionDays", label: "Provider 错误日志保留天数", type: "number", min: 1, max: 365, placeholder: "10" },
    ],
  },
];

// ========== 主组件 ==========
export const ApiConfigManagement: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const canAccess = currentUser?.role === "admin" && Boolean(token);

  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfigState>(defaultIntegrationConfig);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 查询配置
  const configQuery = useQuery({
    queryKey: ["admin-config", token],
    enabled: canAccess,
    queryFn: async () => backendApi.adminConfigGet(token as string),
  });

  // 同步远端配置到本地 state
  useEffect(() => {
    if (!configQuery.data) return;
    setIntegrationConfig({
      reverseFetchStageOrder: configQuery.data.reverseFetchStageOrder || defaultIntegrationConfig.reverseFetchStageOrder,
      reverseExternalApiPriority: configQuery.data.reverseExternalApiPriority || defaultIntegrationConfig.reverseExternalApiPriority,
      apifyReverseApiUrl: configQuery.data.apifyReverseApiUrl || defaultIntegrationConfig.apifyReverseApiUrl,
      apifyReverseApiToken: configQuery.data.apifyReverseApiToken ?? "",
      tikhubVideoHotApiUrl: configQuery.data.tikhubVideoHotApiUrl || defaultIntegrationConfig.tikhubVideoHotApiUrl,
      tikhubRealtimeHotApiUrl: configQuery.data.tikhubRealtimeHotApiUrl || defaultIntegrationConfig.tikhubRealtimeHotApiUrl,
      tikhubReverseApiUrl: configQuery.data.tikhubReverseApiUrl || defaultIntegrationConfig.tikhubReverseApiUrl,
      tikhubApiToken: configQuery.data.tikhubApiToken ?? "",
      anytocopyReverseApiUrl: configQuery.data.anytocopyReverseApiUrl ?? "",
      anytocopyReverseApiToken: configQuery.data.anytocopyReverseApiToken ?? "",
      anytocopyEnabled: configQuery.data.anytocopyEnabled ?? false,
      douhotVideoHotApiUrl: configQuery.data.douhotVideoHotApiUrl || defaultIntegrationConfig.douhotVideoHotApiUrl,
      douyinHotHubRealtimeUrl: configQuery.data.douyinHotHubRealtimeUrl || defaultIntegrationConfig.douyinHotHubRealtimeUrl,
      hotTrendPromptVersion: configQuery.data.hotTrendPromptVersion || defaultIntegrationConfig.hotTrendPromptVersion,
      providerErrorLogRetentionDays:
        configQuery.data.providerErrorLogRetentionDays ?? defaultIntegrationConfig.providerErrorLogRetentionDays,
    });
  }, [configQuery.data]);

  // 保存 API 配置
  const handleSave = async () => {
    if (!token) return;
    try {
      setSaving(true);
      setFeedback(null);
      await backendApi.adminConfigPatch(token, integrationConfig);
      await configQuery.refetch();
      setFeedback("配置已保存");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return <div className="flex h-full items-center justify-center text-gray-600">只有管理员可以访问此页面。</div>;
  }

  return (
    <div className="flex h-full flex-col bg-[#f8f9fc]">
      {/* 页头 */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900">API 配置</h1>
        <p className="mt-1 text-sm text-gray-500">抖音热榜、视频反推 API 与管理工具</p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* 反馈消息 */}
          {feedback ? (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800">{feedback}</div>
          ) : null}

          {/* 配置分组卡片 */}
          {configGroups.map((group) => (
            <section key={group.title} className="rounded-xl border border-gray-200 bg-white p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${group.iconBg}`}>
                  <span className={`material-icons-round text-base ${group.iconColor}`}>{group.icon}</span>
                </span>
                <h2 className="text-sm font-bold text-gray-900">{group.title}</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.fields.map((field) => (
                  <div key={field.key}>
                    <label className={labelCls}>{field.label}</label>
                    <input
                      type={field.type ?? "text"}
                      min={field.min}
                      max={field.max}
                      className={inputCls}
                      placeholder={field.placeholder}
                      value={integrationConfig[field.key] as string | number}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const val = field.type === "number" ? Math.max(field.min ?? 1, Number(raw || 10)) : raw;
                        setIntegrationConfig((prev) => ({ ...prev, [field.key]: val }));
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* 复选框 */}
              {group.checkboxes?.length ? (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {group.checkboxes.map((cb) => (
                    <label key={cb.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className={`h-4 w-4 ${cb.accent ?? "accent-amber-500"}`}
                        checked={Boolean(integrationConfig[cb.key])}
                        onChange={(event) =>
                          setIntegrationConfig((prev) => ({ ...prev, [cb.key]: event.target.checked }))
                        }
                      />
                      {cb.label}
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ))}

          {/* 保存按钮 */}
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} isLoading={saving}>
              保存全部 API 配置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
