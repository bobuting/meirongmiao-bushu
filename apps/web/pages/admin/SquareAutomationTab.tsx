/**
 * 自动化配置 + 执行日志 Tab
 * 上半部分：达人发现/模板自动发布配置
 * 下半部分：执行日志（达人发现/模板发布）
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { createApiRequest } from '../../services/backendApi.request';
import { useToast } from '../../components/ui/Toast';

// 执行状态标签
const EXEC_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: 'bg-blue-50 text-blue-700' },
  success: { label: '成功', color: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', color: 'bg-red-50 text-red-500' },
};

// 执行日志
interface ExecutionLog {
  id: string;
  type: 'discovery' | 'auto_publish';
  status: 'running' | 'success' | 'failed';
  summary: string | null;
  resultData: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ExecutionLogListResponse {
  success: boolean;
  data: ExecutionLog[];
  total: number;
  page: number;
  pageSize: number;
}

interface ConfigResponse {
  config: {
    squareCreatorDiscoveryEnabled: boolean;
    squareCreatorDiscoveryHour: number;
    squareTemplateAutoPublishEnabled: boolean;
    squareTemplateAutoPublishHour: number;
  };
}

export const SquareAutomationTab: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const toast = useToast();
  const apiRequest = useCallback(createApiRequest(token), [token]);

  // 配置状态
  const [config, setConfig] = useState({
    squareCreatorDiscoveryEnabled: false,
    squareCreatorDiscoveryHour: 2,
    squareTemplateAutoPublishEnabled: false,
    squareTemplateAutoPublishHour: 3,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  // 手动触发状态
  const [triggeringDiscovery, setTriggeringDiscovery] = useState(false);
  const [triggeringPublish, setTriggeringPublish] = useState(false);

  // 运行记录状态
  const [recordType, setRecordType] = useState<'discovery' | 'auto_publish'>('discovery');

  // 执行日志状态
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;

  // 加载配置
  const loadConfig = useCallback(async () => {
    if (!token) return;
    setConfigLoading(true);
    try {
      const data: ConfigResponse = await apiRequest('/admin/config');
      if (data.config) {
        setConfig({
          squareCreatorDiscoveryEnabled: data.config.squareCreatorDiscoveryEnabled ?? false,
          squareCreatorDiscoveryHour: data.config.squareCreatorDiscoveryHour ?? 2,
          squareTemplateAutoPublishEnabled: data.config.squareTemplateAutoPublishEnabled ?? false,
          squareTemplateAutoPublishHour: data.config.squareTemplateAutoPublishHour ?? 3,
        });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setConfigLoading(false);
    }
  }, [token, apiRequest]);

  // 加载执行日志
  const loadLogs = useCallback(async () => {
    if (!token) return;
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(logPage),
        pageSize: String(logPageSize),
        type: recordType,
      });
      const data: ExecutionLogListResponse = await apiRequest(`/admin/square-execution-logs?${params}`);
      if (data.success) {
        setLogs(data.data);
        setLogTotal(data.total);
      }
    } catch (error) {
      console.error('加载执行日志失败:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [logPage, recordType, token, apiRequest]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  // 保存配置
  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true);
    try {
      await apiRequest('/admin/config', {
        method: 'PATCH',
        body: config,
      });
      toast.success('配置已保存，部分配置需重启后端生效');
    } catch (error) {
      console.error('保存配置失败:', error);
      toast.error('保存失败，请重试');
    } finally {
      setConfigSaving(false);
    }
  }, [config, apiRequest]);

  // 手动触发达人发现
  const handleTriggerDiscovery = useCallback(async () => {
    setTriggeringDiscovery(true);
    setRecordType('discovery');
    setLogPage(1);
    setTimeout(() => loadLogs(), 500);
    try {
      const data = await apiRequest('/admin/square-trigger/discovery', { method: 'POST' }) as { success: boolean; data?: { evaluated: number; qualified: number }; message?: string };
      if (data.success) {
        const { evaluated, qualified } = data.data ?? { evaluated: 0, qualified: 0 };
        toast.success(`达人发现完成：评估 ${evaluated} 位，符合条件 ${qualified} 位`);
      } else {
        toast.error(data.message || '触发失败');
      }
    } catch (error) {
      toast.error('触发失败，请重试');
    } finally {
      setTriggeringDiscovery(false);
      loadLogs();
    }
  }, [apiRequest, loadLogs]);

  // 手动触发模板自动发布
  const handleTriggerPublish = useCallback(async () => {
    setTriggeringPublish(true);
    setRecordType('auto_publish');
    setLogPage(1);
    setTimeout(() => loadLogs(), 500);
    try {
      const data = await apiRequest('/admin/square-trigger/auto-publish', { method: 'POST' }) as { success: boolean; data?: { pulled: number; reversed: number }; message?: string };
      if (data.success) {
        const { pulled, reversed } = data.data ?? { pulled: 0, reversed: 0 };
        toast.success(`模板发布完成：拉取 ${pulled} 个，反推 ${reversed} 个`);
      } else {
        toast.error(data.message || '触发失败');
      }
    } catch (error) {
      toast.error('触发失败，请重试');
    } finally {
      setTriggeringPublish(false);
      loadLogs();
    }
  }, [apiRequest, loadLogs]);

  return (
    <div className="flex flex-col h-full overflow-auto gap-6 p-6">
      {/* 配置卡片 */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-text-primary">自动化配置</h3>
            <p className="text-sm text-text-secondary mt-1">达人发现与模板自动发布，开启后需重启后端生效</p>
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={configSaving || configLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {configSaving && <span className="material-icons-round text-base animate-spin">sync</span>}
            {configSaving ? '保存中...' : '保存配置'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerDiscovery}
              disabled={triggeringDiscovery || configLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
              title="手动触发达人发现（不等待定时任务）"
            >
              {triggeringDiscovery && <span className="material-icons-round text-base animate-spin">sync</span>}
              {triggeringDiscovery ? '执行中...' : '触发达人发现'}
            </button>
            <button
              onClick={handleTriggerPublish}
              disabled={triggeringPublish || configLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
              title="手动触发模板自动发布（不等待定时任务）"
            >
              {triggeringPublish && <span className="material-icons-round text-base animate-spin">sync</span>}
              {triggeringPublish ? '执行中...' : '触发模板发布'}
            </button>
          </div>
        </div>
        {configLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-icons-round animate-spin text-primary text-3xl">sync</span>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-2 gap-8">
              {/* 达人发现 */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <span className="material-icons-round text-primary text-lg">search</span>
                  达人发现
                </h4>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.squareCreatorDiscoveryEnabled}
                      onChange={(e) => setConfig(prev => ({ ...prev, squareCreatorDiscoveryEnabled: e.target.checked }))}
                      className="shrink-0"
                    />
                    <span className="text-sm text-text-primary">启用达人发现</span>
                  </label>
                  <p className="text-xs text-text-muted">每天凌晨自动搜索抖音优质「场景种草」型创作者</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-text-secondary whitespace-nowrap">执行时间</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={config.squareCreatorDiscoveryHour}
                      onChange={(e) => setConfig(prev => ({ ...prev, squareCreatorDiscoveryHour: parseInt(e.target.value) || 0 }))}
                      className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      min={0}
                      max={23}
                    />
                    <span className="text-sm text-text-secondary">点</span>
                  </div>
                </div>
              </div>

              {/* 模板自动发布 */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <span className="material-icons-round text-primary text-lg">auto_awesome</span>
                  模板自动发布
                </h4>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.squareTemplateAutoPublishEnabled}
                      onChange={(e) => setConfig(prev => ({ ...prev, squareTemplateAutoPublishEnabled: e.target.checked }))}
                      className="shrink-0"
                    />
                    <span className="text-sm text-text-primary">启用模板自动发布</span>
                  </label>
                  <p className="text-xs text-text-muted">拉取达人作品 → LLM 分类 → 反推脚本 → 创建模板</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-text-secondary whitespace-nowrap">执行时间</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={config.squareTemplateAutoPublishHour}
                      onChange={(e) => setConfig(prev => ({ ...prev, squareTemplateAutoPublishHour: parseInt(e.target.value) || 0 }))}
                      className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      min={0}
                      max={23}
                    />
                    <span className="text-sm text-text-secondary">点</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 运行记录 */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => { setRecordType('discovery'); setLogPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  recordType === 'discovery' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                达人发现
              </button>
              <button
                onClick={() => { setRecordType('auto_publish'); setLogPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  recordType === 'auto_publish' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                模板发布
              </button>
            </div>
            <p className="text-sm text-text-secondary">共 {logTotal} 条执行记录</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadLogs()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
              title="刷新"
            >
              <span className="material-icons-round text-lg">refresh</span>
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons-round animate-spin text-primary text-3xl">sync</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <span className="material-icons-round text-5xl mb-3">history</span>
              <p>暂无执行记录</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-36">开始时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">执行结果</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-36">耗时</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((logEntry) => {
                  const statusInfo = EXEC_STATUS_LABEL[logEntry.status] || { label: logEntry.status, color: 'bg-gray-100 text-text-secondary' };
                  const startedAt = new Date(logEntry.startedAt);
                  const duration = logEntry.completedAt
                    ? (() => {
                        const ms = new Date(logEntry.completedAt).getTime() - startedAt.getTime();
                        if (ms < 1000) return `${ms}ms`;
                        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
                        return `${(ms / 60000).toFixed(1)}min`;
                      })()
                    : '-';
                  return (
                    <tr key={logEntry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {startedAt.toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg font-medium ${statusInfo.color}`}>
                          {logEntry.status === 'running' && <span className="material-icons-round text-xs animate-spin">sync</span>}
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {logEntry.status === 'failed' ? (
                          <p className="text-sm text-red-500 truncate max-w-md" title={logEntry.errorMessage || ''}>
                            {logEntry.errorMessage || '未知错误'}
                          </p>
                        ) : (
                          <p className="text-sm text-text-primary truncate max-w-md" title={logEntry.summary || ''}>
                            {logEntry.summary || '-'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{duration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        {Math.ceil(logTotal / logPageSize) > 1 && (
          <div className="flex items-center justify-center gap-2 py-4 border-t border-gray-100">
            <button
              onClick={() => setLogPage(p => Math.max(1, p - 1))}
              disabled={logPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-text-secondary">第 {logPage} / {Math.ceil(logTotal / logPageSize)} 页</span>
            <button
              onClick={() => setLogPage(p => Math.min(Math.ceil(logTotal / logPageSize), p + 1))}
              disabled={logPage === Math.ceil(logTotal / logPageSize)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SquareAutomationTab;
