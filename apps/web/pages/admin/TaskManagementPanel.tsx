/**
 * 任务管理面板
 *
 * 包含三个子模块：
 * 1. 系统任务 - 后台自动化任务（quality_scoring 等）
 * 2. 用户任务 - 用户可见的异步任务（step4_video 等）
 * 3. 全局调度 - 任务并发控制与队列管理
 * 4. SSE 连接 - 实时推送连接统计
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { backendApi } from '../../services/backendApi';
import { realBackendApi } from '../../services/realApi';
import { GlobalTaskType } from '../../components/layout/taskQueueConfig';

type SubTab = 'system' | 'user' | 'global' | 'sse';

/** 系统任务状态 */
type SystemJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

/** 系统任务记录 */
interface SystemJobRecord {
  id: string;
  jobType: string;
  input: Record<string, unknown>;
  status: SystemJobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  scheduledAt: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

/** 用户任务记录 */
interface UserJobRecord {
  id: string;
  userId: string | null;
  projectId: string | null;
  jobType: string;
  status: string;
  stage: string | null;
  progress: number | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  createdAt: number;
  updatedAt: number;
  visibleToUser: boolean;
}

/** 全局任务调度配置 */
interface GlobalTaskConfig {
  maxGlobalConcurrent: number;
  maxPerUserConcurrent: number;
  maxQueueSize: number;
  maxPerUserQueued: number;
  queueTimeoutMinutes: number;
}

/** 全局任务调度配置字段定义 */
const GLOBAL_TASK_FIELDS: Array<{ key: keyof GlobalTaskConfig; label: string; description: string }> = [
  { key: 'maxGlobalConcurrent', label: '全局最大并发数', description: '系统整体最大并发任务数（所有用户所有类型）' },
  { key: 'maxPerUserConcurrent', label: '单用户最大并发数', description: '单用户最大并发任务数（所有类型合计）' },
  { key: 'maxQueueSize', label: '排队队列上限', description: '全局排队任务数上限，超限直接拒绝（默认100）' },
  { key: 'maxPerUserQueued', label: '用户排队上限', description: '单用户排队任务数上限，超限直接拒绝（默认5）' },
  { key: 'queueTimeoutMinutes', label: '排队超时（分钟）', description: 'pending 任务超过此时间自动标记为失败' },
];

/** Step3 脚本策略并发配置 */
interface Step3ScriptConfig {
  strategyConcurrency: number;
}

/** Step3 脚本策略并发配置字段定义 */
const STEP3_SCRIPT_FIELDS: Array<{ key: keyof Step3ScriptConfig; label: string; description: string }> = [
  { key: 'strategyConcurrency', label: '策略并发数', description: '同一项目最多同时执行 LLM 的策略数量（默认2）' },
];

/** 状态颜色映射 */
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  retrying: 'bg-orange-100 text-orange-800',
};

/**
 * 任务管理面板组件
 */
export const TaskManagementPanel: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('system');

  // ========== 系统任务查询参数 ==========
  const [systemJobType, setSystemJobType] = useState<string>('');
  const [systemStatus, setSystemStatus] = useState<string>('');
  const [systemPage, setSystemPage] = useState(1);

  // ========== 用户任务查询参数 ==========
  const [userJobType, setUserJobType] = useState<string>('');
  const [userStatus, setUserStatus] = useState<string>('');
  const [userPage, setUserPage] = useState(1);

  // ========== 全局调度配置状态 ==========
  const [globalTaskConfig, setGlobalTaskConfig] = useState<GlobalTaskConfig | null>(null);
  const [globalTaskDirty, setGlobalTaskDirty] = useState(false);
  const [globalTaskSaving, setGlobalTaskSaving] = useState(false);

  // ========== Step3 脚本策略并发配置状态 ==========
  const [step3ScriptConfig, setStep3ScriptConfig] = useState<Step3ScriptConfig | null>(null);
  const [step3ScriptDirty, setStep3ScriptDirty] = useState(false);
  const [step3ScriptSaving, setStep3ScriptSaving] = useState(false);

  // ========== 系统任务查询 ==========
  const { data: systemJobsData, isLoading: systemJobsLoading } = useQuery({
    queryKey: ['admin-system-jobs', systemJobType, systemStatus, systemPage],
    queryFn: async () => {
      const response = await realBackendApi.adminGetSystemJobs(token!, {
        jobType: systemJobType || undefined,
        status: systemStatus || undefined,
        page: systemPage,
        pageSize: 20,
      });
      return response;
    },
    enabled: !!token && activeSubTab === 'system',
  });

  // ========== 用户任务查询 ==========
  const { data: userJobsData, isLoading: userJobsLoading } = useQuery({
    queryKey: ['admin-user-jobs', userJobType, userStatus, userPage],
    queryFn: async () => {
      const response = await realBackendApi.adminGetUserJobs(token!, {
        jobType: userJobType || undefined,
        status: userStatus || undefined,
        page: userPage,
        pageSize: 20,
      });
      return response;
    },
    enabled: !!token && activeSubTab === 'user',
  });

  // ========== 加载全局调度配置 ==========
  useEffect(() => {
    if (activeSubTab === 'global' && token) {
      if (!globalTaskConfig) {
        realBackendApi.businessConfigGet(token, 'global_task').then((res) => {
          const config = res.config ?? {};
          setGlobalTaskConfig({
            maxGlobalConcurrent: (config.maxGlobalConcurrent as number) ?? 10,
            maxPerUserConcurrent: (config.maxPerUserConcurrent as number) ?? 3,
            maxQueueSize: (config.maxQueueSize as number) ?? 100,
            maxPerUserQueued: (config.maxPerUserQueued as number) ?? 5,
            queueTimeoutMinutes: (config.queueTimeoutMinutes as number) ?? 30,
          });
        }).catch((err) => {
          console.error('Failed to load global_task config:', err);
        });
      }
      if (!step3ScriptConfig) {
        realBackendApi.businessConfigGet(token, 'step3_script').then((res) => {
          const config = res.config ?? {};
          setStep3ScriptConfig({
            strategyConcurrency: (config.strategyConcurrency as number) ?? 2,
          });
        }).catch((err) => {
          console.error('Failed to load step3_script config:', err);
        });
      }
    }
  }, [activeSubTab, token, globalTaskConfig, step3ScriptConfig]);

  // ========== 更新全局调度配置字段 ==========
  const handleGlobalTaskChange = (key: keyof GlobalTaskConfig, value: number) => {
    if (!globalTaskConfig) return;
    setGlobalTaskConfig({ ...globalTaskConfig, [key]: value });
    setGlobalTaskDirty(true);
  };

  // ========== 保存全局调度配置 ==========
  const handleGlobalTaskSave = async () => {
    if (!token || !globalTaskConfig) return;
    setGlobalTaskSaving(true);
    try {
      await realBackendApi.businessConfigPatch(token, 'global_task', {
        config: { ...globalTaskConfig, tabLabel: '全局调度' },
        description: '全局任务并发控制与队列管理配置',
      });
      setGlobalTaskDirty(false);
    } catch (err) {
      console.error('Failed to save global_task config:', err);
    } finally {
      setGlobalTaskSaving(false);
    }
  };

  // ========== 更新 Step3 脚本策略并发配置字段 ==========
  const handleStep3ScriptChange = (key: keyof Step3ScriptConfig, value: number) => {
    if (!step3ScriptConfig) return;
    setStep3ScriptConfig({ ...step3ScriptConfig, [key]: value });
    setStep3ScriptDirty(true);
  };

  // ========== 保存 Step3 脚本策略并发配置 ==========
  const handleStep3ScriptSave = async () => {
    if (!token || !step3ScriptConfig) return;
    setStep3ScriptSaving(true);
    try {
      await realBackendApi.businessConfigPatch(token, 'step3_script', {
        config: { ...step3ScriptConfig, tabLabel: '脚本策略' },
        description: 'Step3 脚本策略并发控制',
      });
      setStep3ScriptDirty(false);
    } catch (err) {
      console.error('Failed to save step3_script config:', err);
    } finally {
      setStep3ScriptSaving(false);
    }
  };

  // ========== 渲染系统任务面板 ==========
  const renderSystemJobsPanel = () => (
    <>
      {/* 筛选栏 */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex gap-4 items-center">
          <select
            value={systemJobType}
            onChange={(e) => setSystemJobType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">全部类型</option>
            <option value="quality_scoring">评分任务</option>
            <option value="prompt_evolution">Prompt进化</option>
          </select>

          <select
            value={systemStatus}
            onChange={(e) => setSystemStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="running">运行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
            <option value="retrying">重试中</option>
          </select>
        </div>
      </div>

      {/* 统计卡片 */}
      {systemJobsData?.stats && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-5 gap-4">
            {Object.entries(systemJobsData.stats).map(([status, count]) => (
              <div key={status} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{count as React.ReactNode}</div>
                <div className="text-sm text-gray-500 capitalize">{status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {systemJobsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (systemJobsData?.items?.length ?? 0) > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">任务ID</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">重试</th>
                  <th className="px-4 py-3">创建时间</th>
                  <th className="px-4 py-3">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {systemJobsData!.items.map((job) => (
                  <tr key={job.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                    <td className="px-4 py-3">{job.jobType}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-800'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{job.retryCount}/{job.maxRetries}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(job.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            无系统任务
          </div>
        )}
      </div>
    </>
  );

  // ========== 渲染用户任务面板 ==========
  const renderUserJobsPanel = () => (
    <>
      {/* 筛选栏 */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex gap-4 items-center">
          <select
            value={userJobType}
            onChange={(e) => setUserJobType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">全部类型</option>
            <option value={GlobalTaskType.STEP2_FIVE_VIEW}>Step2 五视图</option>
            <option value={GlobalTaskType.STEP4_VIDEO}>Step4 视频</option>
            <option value={GlobalTaskType.STEP4_CLIP_SUBMIT}>Step4 片段</option>
            <option value={GlobalTaskType.STEP6_FISSION}>Step6 裂变</option>
          </select>

          <select
            value={userStatus}
            onChange={(e) => setUserStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="running">运行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>
      </div>

      {/* 统计卡片 */}
      {userJobsData?.stats && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(userJobsData.stats).map(([status, count]) => (
              <div key={status} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{count as React.ReactNode}</div>
                <div className="text-sm text-gray-500 capitalize">{status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {userJobsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (userJobsData?.items?.length ?? 0) > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">任务ID</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">阶段</th>
                  <th className="px-4 py-3">项目ID</th>
                  <th className="px-4 py-3">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {userJobsData!.items.map((job) => (
                  <tr key={job.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                    <td className="px-4 py-3">{job.jobType}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-800'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{job.stage || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{job.projectId || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            无用户任务
          </div>
        )}
      </div>
    </>
  );

  // ========== 渲染全局调度面板 ==========
  const renderGlobalTaskPanel = () => (
    <div className="flex-1 overflow-y-auto p-6">
      {!globalTaskConfig ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-8">
          {/* 全局任务并发 */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">全局调度配置</h3>
                <p className="text-sm text-gray-500 mt-1">任务并发控制与队列管理</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setGlobalTaskDirty(false)}
                  disabled={!globalTaskDirty}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  重置
                </button>
                <button
                  onClick={handleGlobalTaskSave}
                  disabled={!globalTaskDirty || globalTaskSaving}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {globalTaskSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-6 py-3 text-left">配置项</th>
                    <th className="px-6 py-3 text-left">说明</th>
                    <th className="px-6 py-3 text-left w-24">值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {GLOBAL_TASK_FIELDS.map((field) => (
                    <tr key={field.key} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{field.label}</td>
                      <td className="px-6 py-4 text-xs text-gray-500">{field.description}</td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          min={0}
                          value={globalTaskConfig[field.key]}
                          onChange={(e) => handleGlobalTaskChange(field.key, Number(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step3 脚本策略并发 */}
          {step3ScriptConfig && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">脚本策略并发</h3>
                  <p className="text-sm text-gray-500 mt-1">Step3 脚本生成策略的并发控制</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep3ScriptDirty(false)}
                    disabled={!step3ScriptDirty}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    重置
                  </button>
                  <button
                    onClick={handleStep3ScriptSave}
                    disabled={!step3ScriptDirty || step3ScriptSaving}
                    className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {step3ScriptSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-6 py-3 text-left">配置项</th>
                      <th className="px-6 py-3 text-left">说明</th>
                      <th className="px-6 py-3 text-left w-24">值</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {STEP3_SCRIPT_FIELDS.map((field) => (
                      <tr key={field.key} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">{field.label}</td>
                        <td className="px-6 py-4 text-xs text-gray-500">{field.description}</td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={step3ScriptConfig[field.key]}
                            onChange={(e) => handleStep3ScriptChange(field.key, Number(e.target.value) || 1)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ========== SSE 连接统计查询 ==========
  const { data: sseStats, isLoading: sseLoading, refetch: refetchSSE } = useQuery({
    queryKey: ['admin-sse-stats'],
    queryFn: async () => {
      const response = await fetch('/neirongmiao/api/async-jobs/sse/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch SSE stats');
      return response.json();
    },
    enabled: !!token && activeSubTab === 'sse',
    refetchInterval: 5000, // 每 5 秒刷新
  });

  // ========== 渲染 SSE 连接面板 ==========
  const renderSSEPanel = () => (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* 标题与操作栏 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">SSE 连接统计</h3>
            <p className="text-sm text-gray-500 mt-1">实时推送连接状态监控</p>
          </div>
          <button
            onClick={() => refetchSSE()}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            刷新
          </button>
        </div>

        {/* 统计卡片 */}
        {sseLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : sseStats ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <div className="text-3xl font-bold text-primary">{sseStats.totalConnections ?? 0}</div>
                <div className="text-sm text-gray-500 mt-1">总连接数</div>
              </div>
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <div className="text-3xl font-bold text-green-600">{sseStats.userCount ?? 0}</div>
                <div className="text-sm text-gray-500 mt-1">在线用户数</div>
              </div>
            </div>

            {/* 用户连接详情 */}
            {sseStats.connectionsPerUser && Object.keys(sseStats.connectionsPerUser).length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700">用户连接分布</h4>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">用户 ID</th>
                      <th className="px-4 py-3 text-left">连接数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(sseStats.connectionsPerUser).map(([userId, count]) => (
                      <tr key={userId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs">{userId}</td>
                        <td className="px-4 py-3">{count as React.ReactNode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-500">
            无法获取 SSE 统计信息
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* 头部：标题 + 子标签页 */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">任务管理</h2>
            <p className="text-sm text-gray-500 mt-1">
              系统任务、用户任务与全局调度
            </p>
          </div>
        </div>

        {/* 子标签页切换 */}
        <div className="mt-4 flex gap-4">
          <button
            onClick={() => setActiveSubTab('system')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'system'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            系统任务
          </button>
          <button
            onClick={() => setActiveSubTab('user')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'user'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            用户任务
          </button>
          <button
            onClick={() => setActiveSubTab('global')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'global'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            全局调度
          </button>
          <button
            onClick={() => setActiveSubTab('sse')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'sse'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            SSE 连接
          </button>
        </div>
      </div>

      {/* 内容面板 */}
      {activeSubTab === 'system' && renderSystemJobsPanel()}
      {activeSubTab === 'user' && renderUserJobsPanel()}
      {activeSubTab === 'global' && renderGlobalTaskPanel()}
      {activeSubTab === 'sse' && renderSSEPanel()}
    </div>
  );
};