// apps/web/pages/admin-model-management/MonitoringPanel.tsx
/**
 * 监控面板
 * 展示 Provider 调用统计、成功率、错误记录等
 */
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { backendApi, ApiError } from "../../services/backendApi";

type ProviderAudit = {
  id: string;
  providerId: string;
  routeKey: string;
  requestId?: string | null;
  status: "pending" | "success" | "error" | "timeout";
  latencyMs: number;
  timeoutMs?: number | null;
  slowRequest?: boolean;
  cost: number;
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary?: string | null;
  responseSummary?: string | null;
  createdAt: number;
};

type ProviderRecord = {
  id: string;
  name: string;
  type: string;
  vendor: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasSecret?: boolean;
  maskedSecret?: string | null;
  remark?: string | null;
  createdAt: number;
};

export const MonitoringPanel: React.FC = () => {
  const token = useAppStore((state) => state.token);

  // 获取审计日志（切换 tab 时不刷新，使用缓存）
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-provider-audits"],
    queryFn: () => backendApi.adminProviderAudits(token!, 200),
    enabled: !!token,
    staleTime: Infinity,
  });

  // 获取 Provider 列表（用于显示名称，切换 tab 时不刷新，使用缓存）
  const { data: providersData } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => backendApi.adminProviders(token!),
    enabled: !!token,
    staleTime: Infinity,
  });

  const audits = (data?.audits ?? []) as unknown as ProviderAudit[];
  const providers = (providersData?.providers ?? []) as unknown as ProviderRecord[];
  const providerMap = useMemo(() => {
    const map = new Map<string, ProviderRecord>();
    providers.forEach((p) => map.set(p.id, p));
    return map;
  }, [providers]);

  // 计算统计数据
  const stats = useMemo(() => {
    if (audits.length === 0) {
      return {
        totalCalls: 0,
        successCount: 0,
        failCount: 0,
        successRate: 0,
        avgLatency: 0,
        totalCost: 0,
        recentErrors: [],
        routeKeyStats: {},
      };
    }

    const successCount = audits.filter((a) => a.status === "success").length;
    const failCount = audits.filter((a) => a.status === "error" || a.status === "timeout").length;
    const totalLatency = audits.reduce((sum, a) => sum + (a.latencyMs || 0), 0);
    const totalCost = audits.reduce((sum, a) => sum + (a.cost || 0), 0);
    const recentErrors = audits
      .filter((a) => a.status === "error" || a.status === "timeout")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);

    // 按路由键统计
    const routeKeyStats: Record<string, { total: number; success: number; avgLatency: number; totalCost: number }> = {};
    audits.forEach((a) => {
      if (!routeKeyStats[a.routeKey]) {
        routeKeyStats[a.routeKey] = { total: 0, success: 0, avgLatency: 0, totalCost: 0 };
      }
      routeKeyStats[a.routeKey].total++;
      if (a.status === "success") routeKeyStats[a.routeKey].success++;
      routeKeyStats[a.routeKey].avgLatency += a.latencyMs || 0;
      routeKeyStats[a.routeKey].totalCost += a.cost || 0;
    });

    // 计算平均耗时
    Object.keys(routeKeyStats).forEach((key) => {
      routeKeyStats[key].avgLatency = Math.round(
        routeKeyStats[key].avgLatency / routeKeyStats[key].total
      );
    });

    return {
      totalCalls: audits.length,
      successCount,
      failCount,
      successRate: audits.length > 0 ? Math.round((successCount / audits.length) * 100) : 0,
      avgLatency: audits.length > 0 ? Math.round(totalLatency / audits.length) : 0,
      totalCost,
      recentErrors,
      routeKeyStats,
    };
  }, [audits]);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">加载中...</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        {error instanceof ApiError ? error.message : "加载失败"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总调用量"
          value={stats.totalCalls.toString()}
          icon="📊"
        />
        <StatCard
          title="成功率"
          value={`${stats.successRate}%`}
          subtitle={`${stats.successCount}/${stats.totalCalls}`}
          color={stats.successRate >= 95 ? "green" : stats.successRate >= 80 ? "yellow" : "red"}
        />
        <StatCard
          title="失败次数"
          value={stats.failCount.toString()}
          color={stats.failCount > 0 ? "red" : "gray"}
        />
        <StatCard
          title="平均耗时"
          value={`${stats.avgLatency}ms`}
          color={stats.avgLatency < 3000 ? "green" : stats.avgLatency < 10000 ? "yellow" : "red"}
        />
      </div>

      {/* 按路由键统计 */}
      {Object.keys(stats.routeKeyStats).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-medium text-gray-900">按路由统计</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">路由键</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">调用量</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功率</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">平均耗时</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(stats.routeKeyStats).map(([routeKey, stat]) => (
                  <tr key={routeKey} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{routeKey}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{stat.total}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{stat.success}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-medium ${
                        stat.total > 0 && (stat.success / stat.total) >= 0.95
                          ? "text-green-600"
                          : stat.total > 0 && (stat.success / stat.total) >= 0.8
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}>
                        {stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 0}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{stat.avgLatency}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 最近错误 */}
      {stats.recentErrors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-medium text-gray-900">最近错误</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {stats.recentErrors.map((error) => {
              const provider = providerMap.get(error.providerId);
              return (
                <div key={error.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {provider?.name ?? error.providerId}
                        </span>
                        <span className="text-xs text-gray-500">({error.routeKey})</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          error.status === "timeout" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
                        }`}>
                          {error.status === "timeout" ? "超时" : "错误"}
                        </span>
                      </div>
                      {error.errorMessage && (
                        <p className="text-sm text-red-600 line-clamp-2">{error.errorMessage}</p>
                      )}
                      {error.errorCode && (
                        <p className="text-xs text-gray-400 mt-1">错误码: {error.errorCode}</p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(error.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 无数据提示 */}
      {audits.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          暂无调用记录
        </div>
      )}
    </div>
  );
};

// 统计卡片组件
const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  icon?: string;
  color?: "green" | "yellow" | "red" | "gray";
}> = ({ title, value, subtitle, icon, color = "gray" }) => {
  const colorClasses = {
    green: "text-green-600",
    yellow: "text-yellow-600",
    red: "text-red-600",
    gray: "text-gray-900",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-400 mt-1">{subtitle}</div>
      )}
    </div>
  );
};