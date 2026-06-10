/**
 * 脚本管理面板
 *
 * 功能：
 * 1. 脚本评分数据展示（Tab: 评分查询）
 * 2. 脚本库管理（Tab: 库存管理）- 创建、导入、导出、编辑、删除
 * 3. 评分设置（Tab: 评分设置）- 评分守护进程开关
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { ApiError, backendApi } from '../../services/backendApi';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';

/** 脚本数据项（评分查询） */
interface ScriptDataItem {
  id: string;
  projectId: string | null;
  userId: string | null;
  title: string | null;
  content: string;
  type: number | null;           // 脚本类型（整数）
  sourceType: string | null;     // 来源类型（策略）
  videoStyle: string | null;     // 视频风格
  createdAt: number;
  updatedAt: number;
}

/** 评分数据 */
interface QualityScoreData {
  id: string;
  scriptDataId: string;
  strategy: string;
  score: number;
  viewerScore: number | null;
  directorScore: number | null;
  strategistScore: number | null;
  ruleBasedScore: number | null;
  scoringMethod: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scoreSpread: number | null;
  createdAt: number;
}

/** 脚本库项（库存管理） */
interface ScriptLibraryItem {
  id: string;
  title: string;
  tags: string[];
  content: string;
  ownerId: string;
  ownerEmail: string;
  date: number;
  status: string;
}

/** 脚本列表查询参数 */
interface ScriptListParams {
  page: number;
  pageSize: number;
  strategy?: string;
  hasScore?: boolean;
  search?: string;
}

/** 脚本表单 */
interface ScriptForm {
  title: string;
  content: string;
  tags: string;
  ownerEmail: string;
}

type SubTab = 'scores' | 'library' | 'settings';

/** 评分守护进程配置 */
interface ScoringDaemonConfig {
  scoringDaemonEnabled: boolean;
}

/**
 * 脚本管理面板组件
 */
export const ScriptManagementPanel: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const { confirm } = useConfirm();

  // ========== 子标签页状态 ==========
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('scores');

  // ========== 评分查询状态 ==========
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [strategyFilter, setStrategyFilter] = useState<string>('');
  const [hasScoreFilter, setHasScoreFilter] = useState<boolean | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);

  // ========== 库存管理状态 ==========
  const [showCreateScript, setShowCreateScript] = useState(false);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize] = useState(20);
  const [scriptCreateForm, setScriptCreateForm] = useState<ScriptForm>({
    title: '',
    content: '',
    tags: '',
    ownerEmail: '',
  });
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [scriptEditForm, setScriptEditForm] = useState<ScriptForm>({
    title: '',
    content: '',
    tags: '',
    ownerEmail: '',
  });
  const [showScriptImport, setShowScriptImport] = useState(false);
  const [scriptImportText, setScriptImportText] = useState('[\n  {\n    "projectId": "",\n    "basicInfo": "",\n    "roleTable": "",\n    "outfitTable": "",\n    "storyboard": ""\n  }\n]');
  const [libraryFeedback, setLibraryFeedback] = useState<string | null>(null);

  // ========== 脚本列表查询（评分查询） ==========
  const {
    data: scriptListData,
    isLoading: scriptListLoading,
    refetch: refetchScriptList,
  } = useQuery({
    queryKey: ['admin-scripts-scores', page, pageSize, strategyFilter, hasScoreFilter, searchKeyword],
    queryFn: async () => {
      const params: ScriptListParams = {
        page,
        pageSize,
        strategy: strategyFilter || undefined,
        hasScore: hasScoreFilter,
        search: searchKeyword || undefined,
      };
      const response = await backendApi.adminGetScripts(token!, params);
      // backendApi 已返回解包后的数据
      return response as { items: ScriptDataItem[]; total: number; scoresMap: Record<string, { score: number }> };
    },
    enabled: !!token && activeSubTab === 'scores',
  });

  // ========== 评分数据查询 ==========
  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: ['script-quality-score', selectedScriptId],
    queryFn: async () => {
      if (!selectedScriptId) return null;
      const response = await backendApi.adminGetScriptQualityScore(token!, selectedScriptId);
      // backendApi 已返回解包后的数据
      return response as QualityScoreData | null;
    },
    enabled: !!token && !!selectedScriptId,
  });

  // ========== 脚本库查询（库存管理） ==========
  const {
    data: libraryData,
    isLoading: libraryLoading,
    refetch: refetchLibrary,
  } = useQuery({
    queryKey: ['admin-scripts-library', token, libraryPage, libraryPageSize],
    queryFn: async () => {
      const response = await backendApi.adminScripts(token!, { page: libraryPage, pageSize: libraryPageSize });
      return response;
    },
    enabled: !!token && activeSubTab === 'library',
  });

  const scripts = (libraryData?.scripts ?? []) as unknown as ScriptLibraryItem[];
  const libraryPagination = libraryData?.pagination;

  // ========== 评分守护进程配置查询 ==========
  const queryClient = useQueryClient();
  const { data: scoringConfigData, isLoading: scoringConfigLoading } = useQuery({
    queryKey: ['admin-scoring-daemon-config'],
    queryFn: async () => {
      const response = await backendApi.adminGetSchedulerConfig(token!);
      return response as ScoringDaemonConfig;
    },
    enabled: !!token && activeSubTab === 'settings',
  });

  // ========== 更新评分守护进程配置 ==========
  const updateScoringConfigMutation = useMutation({
    mutationFn: async (config: Partial<ScoringDaemonConfig>) => {
      await backendApi.adminUpdateSchedulerConfig(token!, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scoring-daemon-config'] });
    },
  });

  // ========== 策略类型选项 ==========
  const strategyOptions = [
    { value: '', label: '全部策略' },
    { value: 'library', label: '库存脚本' },
    { value: 'video', label: '视频脚本' },
    { value: 'realtime', label: '实时热点' },
    { value: 'effectiveness', label: '效果导向' },
    { value: 'custom', label: '自定义' },
    { value: 'fashion', label: '时尚' },
    { value: 'emotion_archetype', label: '情绪原型' },
    { value: 'aesthetic', label: '审美' },
  ];

  const hasScoreOptions = [
    { value: undefined, label: '全部' },
    { value: true, label: '已评分' },
    { value: false, label: '未评分' },
  ];

  // ========== 评分分数颜色 ==========
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // ========== 库存管理操作 ==========
  const handleCreateScript = async () => {
    if (!token) return;
    try {
      setLibraryFeedback(null);
      await backendApi.adminCreateScript(token, {
        title: scriptCreateForm.title,
        content: scriptCreateForm.content,
        tags: scriptCreateForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        ownerEmail: scriptCreateForm.ownerEmail.trim() || undefined,
      });
      setLibraryPage(1); // 重置到第一页
      await refetchLibrary();
      setShowCreateScript(false);
      setScriptCreateForm({ title: '', content: '', tags: '', ownerEmail: '' });
      setLibraryFeedback('脚本已新增');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '新增脚本失败';
      setLibraryFeedback(message);
    }
  };

  const beginEditScript = (script: ScriptLibraryItem) => {
    setEditingScriptId(script.id);
    setScriptEditForm({
      title: script.title,
      content: script.content,
      tags: script.tags.join(', '),
      ownerEmail: script.ownerEmail,
    });
  };

  const handleSaveScriptEdit = async () => {
    if (!token || !editingScriptId) return;
    try {
      setLibraryFeedback(null);
      await backendApi.adminUpdateScript(token, editingScriptId, {
        title: scriptEditForm.title,
        content: scriptEditForm.content,
        tags: scriptEditForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      await refetchLibrary();
      setEditingScriptId(null);
      setLibraryFeedback('脚本已更新');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '更新脚本失败';
      setLibraryFeedback(message);
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!token) return;
    const confirmed = await confirm('确认删除该脚本？', '删除确认');
    if (!confirmed) return;
    try {
      setLibraryFeedback(null);
      await backendApi.adminDeleteScript(token, scriptId);
      await refetchLibrary();
      setLibraryFeedback('脚本已删除');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '删除脚本失败';
      setLibraryFeedback(message);
    }
  };

  const handleImportScripts = async () => {
    if (!token) return;
    try {
      setLibraryFeedback(null);
      const items = JSON.parse(scriptImportText);
      if (!Array.isArray(items)) {
        setLibraryFeedback('JSON 格式错误：需要数组格式');
        return;
      }
      const normalized = items
        .map((item: Record<string, unknown>) => ({
          projectId: String(item.projectId ?? '').trim(),
          basicInfo: String(item.basicInfo ?? '').trim(),
          roleTable: item.roleTable ? String(item.roleTable).trim() : undefined,
          outfitTable: item.outfitTable ? String(item.outfitTable).trim() : undefined,
          storyboard: item.storyboard ? String(item.storyboard).trim() : undefined,
        }))
        .filter((item) => item.projectId.length > 0 && item.basicInfo.length > 0);
      const result = await backendApi.adminImportScripts(token, { items: normalized as Array<{ projectId: string; basicInfo: string; roleTable?: string; outfitTable?: string; storyboard?: string }> });
      await refetchLibrary();
      setLibraryFeedback(`导入完成：成功 ${result.created.length}，失败 ${result.failed.length}`);
      setShowScriptImport(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入脚本失败';
      setLibraryFeedback(message);
    }
  };

  const handleExportScripts = async () => {
    if (!token) return;
    try {
      setLibraryFeedback(null);
      const result = await backendApi.adminExportScripts(token);
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scripts-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLibraryFeedback('脚本数据已导出');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '导出脚本失败';
      setLibraryFeedback(message);
    }
  };

  // ========== 渲染评分详情对话框 ==========
  const renderScoreDetailModal = () => {
    if (!selectedScriptId || !scoreData) return null;

    const score = scoreData as QualityScoreData;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          {/* 头部 */}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">评分详情</h3>
            <button onClick={() => setSelectedScriptId(null)} className="p-2 hover:bg-gray-100 rounded">
              <span className="material-icons-round">close</span>
            </button>
          </div>

          {/* 内容 */}
          <div className="p-6 space-y-6">
            {/* 综合评分 */}
            <div className="text-center">
              <div className={`text-5xl font-bold ${getScoreColor(score.score)}`}>
                {score.score}
              </div>
              <p className="text-gray-500 mt-2">综合评分</p>
              <p className="text-sm text-gray-400 mt-1">
                方法：{score.scoringMethod === 'llm_multi_perspective' ? 'LLM 多视角评估' : '规则评分'}
              </p>
            </div>

            {/* 三视角评分 */}
            {score.viewerScore && score.directorScore && score.strategistScore && (
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${getScoreColor(score.viewerScore)}`}>
                    {score.viewerScore}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">观众视角</p>
                  <p className="text-xs text-gray-400">权重 30%</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${getScoreColor(score.directorScore)}`}>
                    {score.directorScore}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">编导视角</p>
                  <p className="text-xs text-gray-400">权重 30%</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${getScoreColor(score.strategistScore)}`}>
                    {score.strategistScore}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">策略师视角</p>
                  <p className="text-xs text-gray-400">权重 40%</p>
                </div>
              </div>
            )}

            {/* 视角分歧 */}
            {score.scoreSpread && score.scoreSpread > 25 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ 视角分歧较大（分差 {score.scoreSpread} 分）
                </p>
              </div>
            )}

            {/* 规则评分 */}
            {score.ruleBasedScore && (
              <div className="text-center p-3 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">规则评分：</span>
                <span className={`font-bold ${getScoreColor(score.ruleBasedScore)}`}>
                  {score.ruleBasedScore}
                </span>
              </div>
            )}

            {/* 优点 */}
            {score.strengths && score.strengths.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">优点</h4>
                <ul className="space-y-1">
                  {score.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                      <span className="material-icons-round text-xs">check_circle</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 弱点 */}
            {score.weaknesses && score.weaknesses.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">弱点</h4>
                <ul className="space-y-1">
                  {score.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <span className="material-icons-round text-xs">error</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 建议 */}
            {score.suggestions && score.suggestions.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">改进建议</h4>
                <ul className="space-y-1">
                  {score.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="material-icons-round text-xs">lightbulb</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 元数据 */}
            <div className="text-xs text-gray-400 text-center">
              评分时间：{new Date(score.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========== 渲染创建脚本对话框 ==========
  const renderCreateScriptModal = () => {
    if (!showCreateScript) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-lg w-full">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">新增脚本</h3>
            <button onClick={() => setShowCreateScript(false)} className="p-2 hover:bg-gray-100 rounded">
              <span className="material-icons-round">close</span>
            </button>
          </div>
          <div className="p-4 space-y-4">
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="标题"
              value={scriptCreateForm.title}
              onChange={(e) => setScriptCreateForm(f => ({ ...f, title: e.target.value }))}
            />
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-32"
              placeholder="内容"
              value={scriptCreateForm.content}
              onChange={(e) => setScriptCreateForm(f => ({ ...f, content: e.target.value }))}
            />
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="标签（逗号分隔）"
              value={scriptCreateForm.tags}
              onChange={(e) => setScriptCreateForm(f => ({ ...f, tags: e.target.value }))}
            />
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="所属用户邮箱（可选）"
              value={scriptCreateForm.ownerEmail}
              onChange={(e) => setScriptCreateForm(f => ({ ...f, ownerEmail: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreateScript(false)}>取消</Button>
              <Button onClick={() => void handleCreateScript()}>创建</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========== 渲染编辑脚本对话框 ==========
  const renderEditScriptModal = () => {
    if (!editingScriptId) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-lg w-full">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">编辑脚本</h3>
            <button onClick={() => setEditingScriptId(null)} className="p-2 hover:bg-gray-100 rounded">
              <span className="material-icons-round">close</span>
            </button>
          </div>
          <div className="p-4 space-y-4">
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="标题"
              value={scriptEditForm.title}
              onChange={(e) => setScriptEditForm(f => ({ ...f, title: e.target.value }))}
            />
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-32"
              placeholder="内容"
              value={scriptEditForm.content}
              onChange={(e) => setScriptEditForm(f => ({ ...f, content: e.target.value }))}
            />
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="标签（逗号分隔）"
              value={scriptEditForm.tags}
              onChange={(e) => setScriptEditForm(f => ({ ...f, tags: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingScriptId(null)}>取消</Button>
              <Button onClick={() => void handleSaveScriptEdit()}>保存</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========== 渲染导入脚本对话框 ==========
  const renderImportScriptModal = () => {
    if (!showScriptImport) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">批量导入脚本</h3>
            <button onClick={() => setShowScriptImport(false)} className="p-2 hover:bg-gray-100 rounded">
              <span className="material-icons-round">close</span>
            </button>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-500">
              JSON 数组格式，字段：projectId、basicInfo（必需）、roleTable、outfitTable、storyboard（可选）
            </p>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-48 font-mono"
              value={scriptImportText}
              onChange={(e) => setScriptImportText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowScriptImport(false)}>取消</Button>
              <Button onClick={() => void handleImportScripts()}>执行导入</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* 头部：标题 + 子标签页 */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">脚本管理</h2>
            <p className="text-sm text-gray-500 mt-1">
              脚本评分查询与库存管理
            </p>
          </div>
          <button
            onClick={() => {
              if (activeSubTab === 'scores') refetchScriptList();
              else refetchLibrary();
            }}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <span className="material-icons-round text-sm">refresh</span>
            刷新
          </button>
        </div>

        {/* 子标签页切换 */}
        <div className="mt-4 flex gap-4">
          <button
            onClick={() => setActiveSubTab('scores')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'scores'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            评分查询
          </button>
          <button
            onClick={() => setActiveSubTab('library')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'library'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            库存管理
          </button>
          <button
            onClick={() => setActiveSubTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeSubTab === 'settings'
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            评分设置
          </button>
        </div>
      </div>

      {/* 评分查询面板 */}
      {activeSubTab === 'scores' && (
        <>
          {/* 筛选栏 */}
          <div className="p-4 bg-white border-b border-gray-200">
            <div className="flex gap-4 items-center">
              {/* 策略筛选 */}
              <select
                value={strategyFilter}
                onChange={(e) => setStrategyFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {strategyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* 评分状态筛选 */}
              <select
                value={hasScoreFilter === undefined ? '' : hasScoreFilter ? 'true' : 'false'}
                onChange={(e) => {
                  const val = e.target.value;
                  setHasScoreFilter(val === '' ? undefined : val === 'true');
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {hasScoreOptions.map((opt) => (
                  <option key={String(opt.value)} value={opt.value === undefined ? '' : String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* 搜索框 */}
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索标题或内容..."
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1"
              />
            </div>
          </div>

          {/* 脚本列表 */}
          <div className="flex-1 overflow-y-auto p-4">
            {scriptListLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
              </div>
            ) : scriptListData && scriptListData.items.length > 0 ? (
              <div className="space-y-3">
                {scriptListData.items.map((script: ScriptDataItem) => (
                  <div
                    key={script.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedScriptId(script.id)}
                  >
                    <div className="flex justify-between items-start">
                      {/* 左侧：脚本信息 */}
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">
                          {script.title || '无标题'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {(script.content ?? '').substring(0, 100)}...
                        </p>
                        <div className="flex gap-2 mt-2 text-xs text-gray-400">
                          <span>来源：{script.sourceType || '未知'}</span>
                          {script.videoStyle && <span>风格：{script.videoStyle}</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          创建时间：{new Date(script.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {/* 右侧：评分信息 */}
                      {scriptListData.scoresMap?.[script.id] && (
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${getScoreColor(scriptListData.scoresMap[script.id].score)}`}>
                            {scriptListData.scoresMap[script.id].score}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">评分</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                无脚本数据
              </div>
            )}
          </div>

          {/* 分页 */}
          {scriptListData && scriptListData.total > pageSize && (
            <div className="p-4 bg-white border-t border-gray-200 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                共 {scriptListData.total} 条，当前第 {page} 页
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page * pageSize >= scriptListData.total}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 库存管理面板 */}
      {activeSubTab === 'library' && (
        <>
          {/* 操作栏 */}
          <div className="p-4 bg-white border-b border-gray-200">
            {libraryFeedback && (
              <div className="mb-3 px-3 py-2 text-xs bg-gray-100 rounded border border-gray-200">
                {libraryFeedback}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShowCreateScript(true)}>+ 新增脚本</Button>
              <Button variant="secondary" onClick={() => setShowScriptImport(true)}>批量导入</Button>
              <Button variant="secondary" onClick={() => void handleExportScripts()}>导出脚本</Button>
            </div>
          </div>

          {/* 脚本库列表 */}
          <div className="flex-1 overflow-y-auto p-4">
            {libraryLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
              </div>
            ) : scripts.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">标题</th>
                      <th className="px-4 py-3">标签</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3 whitespace-nowrap">更新时间</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scripts.map((script) => (
                      <tr key={script.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-semibold">{script.title || '-'}</td>
                        <td className="px-4 py-3">
                          {script.tags.length > 0 ? (
                            <span className="text-xs">{script.tags.join(', ')}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">{script.ownerEmail}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(script.date).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => beginEditScript(script)}>编辑</Button>
                            <Button variant="secondary" size="sm" onClick={() => void handleDeleteScript(script.id)}>删除</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                无库存脚本
              </div>
            )}
          </div>

          {/* 分页 */}
          {libraryPagination && libraryPagination.total > libraryPageSize && (
            <div className="p-4 bg-white border-t border-gray-200 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                共 {libraryPagination.total} 条，当前第 {libraryPage} 页
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLibraryPage(libraryPage - 1)}
                  disabled={libraryPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setLibraryPage(libraryPage + 1)}
                  disabled={libraryPage * libraryPageSize >= libraryPagination.total}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 评分设置面板 */}
      {activeSubTab === 'settings' && (
        <div className="flex-1 overflow-y-auto p-6">
          {scoringConfigLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : scoringConfigData ? (
            <div className="max-w-2xl mx-auto">
              {/* 标题 */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">评分守护进程配置</h3>
                <p className="text-sm text-gray-500 mt-1">控制脚本质量评分服务的运行状态</p>
              </div>

              {/* 配置卡片 */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">评分守护进程</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      自动对脚本进行质量评分，提升脚本库整体质量
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      updateScoringConfigMutation.mutate({
                        scoringDaemonEnabled: !scoringConfigData.scoringDaemonEnabled,
                      });
                    }}
                    disabled={updateScoringConfigMutation.isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      scoringConfigData.scoringDaemonEnabled
                        ? 'bg-primary'
                        : 'bg-gray-300'
                    } ${updateScoringConfigMutation.isPending ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        scoringConfigData.scoringDaemonEnabled
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* 状态说明 */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        scoringConfigData.scoringDaemonEnabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {scoringConfigData.scoringDaemonEnabled ? '运行中' : '已停止'}
                    </span>
                    {updateScoringConfigMutation.isPending && (
                      <span className="text-xs text-gray-500">更新中...</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              无法加载配置
            </div>
          )}
        </div>
      )}

      {/* 对话框 */}
      {renderScoreDetailModal()}
      {renderCreateScriptModal()}
      {renderEditScriptModal()}
      {renderImportScriptModal()}
    </div>
  );
};