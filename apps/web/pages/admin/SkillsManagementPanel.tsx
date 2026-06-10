/**
 * Skills 管理面板
 * 提供 Skills 的可视化管理界面
 */

import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 懒加载 Markdown 编辑器，减少首屏加载体积（~350 kB）
const MDEditor = lazy(() => import('@uiw/react-md-editor')) as unknown as typeof import('@uiw/react-md-editor').default;
import { useAppStore } from '../../store/useAppStore';
import { createSkillsBackendApi } from '../../services/backendApi.skills';
import type { SkillListItem, SkillDetail, CreateSkillRequest, UpdateSkillRequest, SkillsSystemStatus } from '../../services/backendApi.skills';
import { PromptEvolutionTab } from './PromptEvolutionTab';
import { ConfirmDialog } from '../../components/ConfirmDialog';

/* ===================== 类型定义 ===================== */

type TabType = 'list' | 'create' | 'edit' | 'metrics' | 'evolution' | 'shared-rules' | 'config';

interface SkillFormData {
  code: string;
  name: string;
  description: string;
  type: string;
  tags: string[];
  systemPrompt: string;
  userPrompt: string;
  inputSchema: string;
  author?: string;
  changeLog?: string;
  // 新增：共享规则依赖
  includes: {
    rules: string[];
  };
}

/* ===================== 常量定义 ===================== */

const DEFAULT_FORM_DATA: SkillFormData = {
  code: '',
  name: '',
  description: '',
  type: 'other',
  tags: [],
  systemPrompt: '',
  userPrompt: '',
  inputSchema: `import { z } from 'zod';

export const inputSchema = z.object({
  // 在此定义输入参数
});

export type InputVariables = z.infer<typeof inputSchema>;`,
  includes: { rules: [] },
};

/* ==================== 主组件 ==================== */

export const SkillsManagementPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const token = useAppStore((state) => state.token);
  const api = createSkillsBackendApi();

  // 状态
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [formData, setFormData] = useState<SkillFormData>(DEFAULT_FORM_DATA);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; code: string; name: string }>({
    isOpen: false,
    code: '',
    name: '',
  });

  // 查询数据
  const skillsQuery = useQuery({
    queryKey: ['skills-list'],
    queryFn: () => api.listSkills(),
    enabled: !!token,
  });

  const skillDetailQuery = useQuery({
    queryKey: ['skill-detail', selectedCode],
    queryFn: () => api.getSkill(selectedCode!),
    enabled: !!token && !!selectedCode && activeTab === 'edit',
  });

  const metricsQuery = useQuery({
    queryKey: ['skills-metrics'],
    queryFn: () => api.getMetrics(),
    enabled: !!token && activeTab === 'metrics',
    refetchInterval: 5000, // 每 5 秒刷新
  });

  const systemConfigQuery = useQuery({
    queryKey: ['skills-system-config'],
    queryFn: () => api.getSystemConfig(),
    enabled: !!token && activeTab === 'config',
    refetchInterval: 5000,
  });

  // 过滤后的 Skills 列表
  const filteredSkills = useMemo(() => {
    if (!skillsQuery.data) return [];

    return skillsQuery.data.filter(skill => {
      const matchKeyword = !searchKeyword ||
        skill.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        skill.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchKeyword.toLowerCase());

      const matchType = !typeFilter || skill.category === typeFilter;

      return matchKeyword && matchType;
    });
  }, [skillsQuery.data, searchKeyword, typeFilter]);

  // 获取所有类型
  const allTypes = useMemo(() => {
    if (!skillsQuery.data) return [];
    const types = new Set(skillsQuery.data.map(s => s.category).filter((c): c is string => Boolean(c)));
    return Array.from(types).sort();
  }, [skillsQuery.data]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateSkillRequest) => api.createSkill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills-list'] });
      setFeedback({ type: 'success', message: 'Skill 创建成功' });
      setActiveTab('list');
      setFormData(DEFAULT_FORM_DATA);
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ code, data }: { code: string; data: UpdateSkillRequest }) =>
      api.updateSkill(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills-list'] });
      queryClient.invalidateQueries({ queryKey: ['skill-detail', selectedCode] });
      setFeedback({ type: 'success', message: 'Skill 更新成功' });
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => api.deleteSkill(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills-list'] });
      setFeedback({ type: 'success', message: 'Skill 删除成功' });
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  // 事件处理
  const handleCreate = () => {
    if (!formData.code || !formData.name || !formData.systemPrompt || !formData.userPrompt) {
      setFeedback({ type: 'error', message: '请填写必填字段' });
      return;
    }

    createMutation.mutate({
      code: formData.code,
      name: formData.name,
      description: formData.description,
      category: formData.type,
      tags: formData.tags,
      systemPrompt: formData.systemPrompt,
      userPrompt: formData.userPrompt,
      inputSchema: formData.inputSchema,
    });
  };

  const handleUpdate = () => {
    if (!selectedCode) return;

    const updateData: Record<string, string | string[]> = {
      name: formData.name,
      description: formData.description,
      category: formData.type,
      tags: formData.tags,
      systemPrompt: formData.systemPrompt,
      userPrompt: formData.userPrompt,
      inputSchema: formData.inputSchema,
    };

    // 添加版本信息（如果有）
    if (formData.author) {
      updateData.author = formData.author;
    }
    if (formData.changeLog) {
      updateData.changeLog = formData.changeLog;
    }

    updateMutation.mutate({
      code: selectedCode,
      data: updateData,
    });
  };

  const handleEdit = (skill: SkillListItem) => {
    setSelectedCode(skill.code);
    setActiveTab('edit');
  };

  const handleDelete = (code: string) => {
    const skill = skillsQuery.data?.find(s => s.code === code);
    setDeleteConfirm({
      isOpen: true,
      code,
      name: skill?.name || code,
    });
  };

  const confirmDelete = () => {
    deleteMutation.mutate(deleteConfirm.code);
    setDeleteConfirm({ isOpen: false, code: '', name: '' });
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, code: '', name: '' });
  };

  // 当加载详情后，填充表单
  React.useEffect(() => {
    if (skillDetailQuery.data && activeTab === 'edit') {
      const detail = skillDetailQuery.data;
      setFormData({
        code: detail.code,
        name: detail.name,
        description: detail.description,
        type: detail.category || 'other',
        tags: detail.tags,
        systemPrompt: detail.systemPrompt,
        userPrompt: detail.userPrompt,
        inputSchema: detail.inputSchema || DEFAULT_FORM_DATA.inputSchema,
        // 从后端数据填充 includes
        includes: { rules: detail.includes?.rules ?? [] },
      });
    }
  }, [skillDetailQuery.data, activeTab]);

  // 清除反馈
  React.useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  return (
    <>
      {/* 使用项目统一的浅灰蓝背景 */}
      <div className="min-h-screen bg-[#f8f9fc] p-6 pb-40">
        <div className="max-w-7xl mx-auto">
          {/* 标题区域：添加渐变装饰条和统计预览 */}
          <div className="mb-6">
            {/* 顶部装饰渐变条 */}
            <div className="h-1.5 rounded-full bg-gradient-to-r from-primary via-accent to-primary/50 mb-4" />

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Skills 管理</h1>
                <p className="text-sm text-gray-500 mt-1">
                  管理 AI 提示词 Skills · 版本控制 · 性能监控
                </p>
              </div>

              {/* 快速统计预览 */}
              <div className="flex gap-4">
                <div className="bg-white rounded-lg border border-gray-200 px-4 py-2 shadow-sm">
                  <div className="text-2xl font-bold text-primary">
                    {skillsQuery.data?.length || 0}
                  </div>
                  <div className="text-xs text-gray-500">Skills 总数</div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 px-4 py-2 shadow-sm">
                  <div className="text-2xl font-bold text-green-600">
                    {metricsQuery.data?.cacheHitRate ? `${(metricsQuery.data.cacheHitRate * 100).toFixed(0)}%` : '--'}
                  </div>
                  <div className="text-xs text-gray-500">缓存命中率</div>
                </div>
              </div>
            </div>
          </div>

          {/* 反馈提示：优化样式 */}
          {feedback && (
            <div className={`mb-4 p-4 rounded-lg border flex items-center gap-3 ${
              feedback.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <span className={`material-icons-round ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {feedback.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Tab 导航：优化卡片样式 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            {/* Tab 头部：添加分组感 */}
            <div className="border-b border-gray-200 bg-gray-50/50">
              <nav className="flex gap-1 px-4 py-2" aria-label="Tabs">
                {[
                  { id: 'list', label: 'Skills 列表', icon: 'list', group: '管理' },
                  { id: 'create', label: '创建', icon: 'add_circle', group: '管理' },
                  { id: 'edit', label: '编辑', icon: 'edit', disabled: !selectedCode, group: '管理' },
                  { id: 'shared-rules', label: '共享规则', icon: 'rule', group: '管理' },
                  { id: 'metrics', label: '性能监控', icon: 'analytics', group: '监控' },
                  { id: 'evolution', label: '提示词进化', icon: 'auto_awesome', group: '监控' },
                  { id: 'config', label: '系统配置', icon: 'settings', group: '系统' },
                ].map((tab, index) => {
                  // 分组分隔符
                  const showSeparator = index > 0 && tab.group !== [
                    { id: 'list', label: 'Skills 列表', icon: 'list', group: '管理' },
                    { id: 'create', label: '创建', icon: 'add_circle', group: '管理' },
                    { id: 'edit', label: '编辑', icon: 'edit', disabled: !selectedCode, group: '管理' },
                    { id: 'shared-rules', label: '共享规则', icon: 'rule', group: '管理' },
                    { id: 'metrics', label: '性能监控', icon: 'analytics', group: '监控' },
                    { id: 'evolution', label: '提示词进化', icon: 'auto_awesome', group: '监控' },
                    { id: 'config', label: '系统配置', icon: 'settings', group: '系统' },
                  ][index - 1].group;

                  return (
                    <React.Fragment key={tab.id}>
                      {showSeparator && (
                        <div className="w-px h-8 bg-gray-200 self-center mx-2" />
                      )}
                      <button
                        onClick={() => !tab.disabled && setActiveTab(tab.id as TabType)}
                        disabled={tab.disabled}
                        className={`
                          flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
                          transition-all duration-200
                          ${activeTab === tab.id
                            ? 'bg-primary text-white shadow-sm'
                            : tab.disabled
                            ? 'text-gray-400 cursor-not-allowed opacity-50'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                          }
                        `}
                      >
                        <span className="material-icons-round text-lg">{tab.icon}</span>
                        {tab.label}
                      </button>
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>

            {/* Tab 内容 */}
            <div className="p-6">
              {activeTab === 'list' && (
                <SkillsListView
                  skills={filteredSkills}
                  loading={skillsQuery.isLoading}
                  searchKeyword={searchKeyword}
                  typeFilter={typeFilter}
                  allTypes={allTypes}
                  onSearchChange={setSearchKeyword}
                  onTypeFilterChange={setTypeFilter}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}

              {activeTab === 'create' && (
                <SkillFormView
                  mode="create"
                  formData={formData}
                  onChange={setFormData}
                  onSubmit={handleCreate}
                  loading={createMutation.isPending}
                />
              )}

              {activeTab === 'edit' && selectedCode && (
                <SkillFormView
                  mode="edit"
                  formData={formData}
                  onChange={setFormData}
                  onSubmit={handleUpdate}
                  loading={updateMutation.isPending || skillDetailQuery.isLoading}
                  skillCode={selectedCode}
                  api={api}
                />
              )}

              {activeTab === 'shared-rules' && (
                <SharedRulesView api={api} />
              )}

              {activeTab === 'metrics' && (
                <MetricsView
                  metrics={metricsQuery.data}
                  loading={metricsQuery.isLoading}
                  api={api}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['skills-metrics'] })}
                />
              )}

              {activeTab === 'evolution' && (
                <PromptEvolutionTab />
              )}

              {activeTab === 'config' && (
                <ConfigView
                  config={systemConfigQuery.data}
                  loading={systemConfigQuery.isLoading}
                  api={api}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['skills-system-config'] })}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="删除 Skill"
        message={`确定删除 Skill "${deleteConfirm.name}" (${deleteConfirm.code}) 吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        danger
      />
    </>
  );
};

/* ==================== 子组件 ==================== */

// Skills 列表视图
interface SkillsListViewProps {
  skills: SkillListItem[];
  loading: boolean;
  searchKeyword: string;
  typeFilter: string;
  allTypes: string[];
  onSearchChange: (keyword: string) => void;
  onTypeFilterChange: (type: string) => void;
  onEdit: (skill: SkillListItem) => void;
  onDelete: (code: string) => void;
}

const SkillsListView: React.FC<SkillsListViewProps> = ({
  skills,
  loading,
  searchKeyword,
  typeFilter,
  allTypes,
  onSearchChange,
  onTypeFilterChange,
  onEdit,
  onDelete,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin mb-3" />
        <div className="text-gray-500 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32">
      {/* 搜索和筛选：优化样式 */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
            search
          </span>
          <input
            type="text"
            placeholder="搜索 Skill（名称、代码、描述）"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white min-w-[140px]"
        >
          <option value="">所有类型</option>
          {allTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* 统计信息：优化样式 */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="material-icons-round text-base text-primary">inventory_2</span>
        共 <span className="font-semibold text-gray-700">{skills.length}</span> 个 Skills
      </div>

      {/* Skills 列表：优化卡片样式 */}
      {skills.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-icons-round text-6xl text-gray-300 mb-3">search_off</span>
          <p className="text-gray-500">没有找到匹配的 Skills</p>
          <p className="text-gray-400 text-sm mt-1">尝试调整搜索条件或创建新的 Skill</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(skill => (
            <div
              key={skill.code}
              className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-200"
            >
              {/* 卡片顶部装饰条 */}
              <div className="h-1 bg-gradient-to-r from-primary to-accent" />

              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{skill.name}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{skill.code}</p>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full shrink-0 ml-2">
                    {skill.category || 'other'}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2 min-h-[40px]">
                  {skill.description || '暂无描述'}
                </p>

                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {skill.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        {tag}
                      </span>
                    ))}
                    {skill.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                        +{skill.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* 操作按钮：轻量化设计 */}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => onEdit(skill)}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-1.5"
                  >
                    <span className="material-icons-round text-base">edit</span>
                    编辑
                  </button>
                  <button
                    onClick={() => onDelete(skill.code)}
                    className="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center"
                    title="删除"
                  >
                    <span className="material-icons-round text-base">delete_outline</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Skill 表单视图
interface SkillFormViewProps {
  mode: 'create' | 'edit';
  formData: SkillFormData;
  onChange: (data: SkillFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  skillCode?: string;
  api?: ReturnType<typeof createSkillsBackendApi>;
}

const SkillFormView: React.FC<SkillFormViewProps> = ({
  mode,
  formData,
  onChange,
  onSubmit,
  loading,
  skillCode,
  api,
}) => {
  if (!api) return null;
  const [activeEditor, setActiveEditor] = useState<'system' | 'user' | 'schema' | 'includes'>('system');
  const [activeTab, setActiveTab] = useState<'edit' | 'versions'>('edit');
  const [author, setAuthor] = useState('');
  const [changeLog, setChangeLog] = useState('');
  // 新增：共享规则查询
  const sharedRulesQuery = useQuery({
    queryKey: ['shared-rules-list'],
    queryFn: () => api.listSharedRules(),
    enabled: !!api,
  });

  // 查询版本历史
  const versionsQuery = useQuery({
    queryKey: ['skill-versions', skillCode],
    queryFn: () => api.getVersions(skillCode!),
    enabled: !!skillCode && activeTab === 'versions',
  });

  const handleFieldChange = (field: keyof SkillFormData, value: any) => {
    onChange({ ...formData, [field]: value });
  };

  const handleTagsChange = (tagsStr: string) => {
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    handleFieldChange('tags', tags);
  };

  const handleSubmitWithVersion = () => {
    // 将 author 和 changeLog 附加到表单数据
    (formData as any).author = author;
    (formData as any).changeLog = changeLog;
    onSubmit();
  };

  const handleRollback = async (version: string) => {
    if (!skillCode) return;
    if (!confirm(`确定要回滚到版本 ${version} 吗？`)) return;

    try {
      await api.rollbackToVersion(skillCode, version);
      alert('回滚成功');
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : '回滚失败');
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* 标签页切换：优化样式 */}
      {mode === 'edit' && (
        <div className="flex gap-2 border-b border-gray-200 bg-gray-50/50 -mx-6 px-6 py-2">
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'edit'
                ? 'bg-white text-primary shadow-sm border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="material-icons-round text-base">edit_note</span>
              编辑
            </span>
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'versions'
                ? 'bg-white text-primary shadow-sm border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="material-icons-round text-base">history</span>
              版本历史
            </span>
          </button>
        </div>
      )}

      {/* 版本历史视图：优化样式 */}
      {activeTab === 'versions' && mode === 'edit' && (
        <div className="space-y-4">
          {versionsQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin mb-3" />
              <div className="text-gray-500 text-sm">加载中...</div>
            </div>
          )}
          {versionsQuery.error && (
            <div className="text-center py-12 text-red-500 bg-red-50 rounded-lg border border-red-200">
              加载失败: {versionsQuery.error instanceof Error ? versionsQuery.error.message : '未知错误'}
            </div>
          )}
          {versionsQuery.data && versionsQuery.data.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <span className="material-icons-round text-4xl text-gray-300 mb-2">history</span>
              <p>暂无版本历史</p>
            </div>
          )}
          {versionsQuery.data && versionsQuery.data.length > 0 && (
            <div className="space-y-3">
              {versionsQuery.data.map((version) => (
                <div key={version.version} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {version.version}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(version.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <span className="font-medium text-gray-700">作者:</span> {version.author}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">变更:</span> {version.changeLog}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRollback(version.version)}
                      className="px-4 py-2 text-sm font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-icons-round text-base">restore</span>
                      回滚
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 编辑表单视图 */}
      {activeTab === 'edit' && (
        <>
      {/* 基本信息：优化布局 */}
      <div className="bg-gray-50/50 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
          <span className="material-icons-round text-primary">info</span>
          基本信息
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              代码 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => handleFieldChange('code', e.target.value)}
              disabled={mode === 'edit'}
              placeholder="skill-code"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500 transition-all"
            />
            <p className="text-xs text-gray-500 mt-1.5">只能包含小写字母、数字、下划线和连字符</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="Skill 名称"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">类型</label>
            <input
              type="text"
              value={formData.type}
              onChange={(e) => handleFieldChange('type', e.target.value)}
              placeholder="other"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">标签</label>
            <input
              type="text"
              value={formData.tags.join(', ')}
              onChange={(e) => handleTagsChange(e.target.value)}
              placeholder="标签1, 标签2"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <p className="text-xs text-gray-500 mt-1.5">用逗号分隔多个标签</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">描述</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="Skill 描述"
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
          />
        </div>
      </div>

      {/* 编辑器切换：优化样式 */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
          <span className="material-icons-round text-primary">code</span>
          提示词编辑
        </div>
        <div className="flex gap-1 mb-0 bg-gray-100 rounded-t-xl p-1">
          {[
            { id: 'system', label: 'System Prompt', required: true, icon: 'terminal' },
            { id: 'user', label: 'User Prompt', required: true, icon: 'person' },
            { id: 'schema', label: 'Input Schema', required: false, icon: 'data_object' },
            { id: 'includes', label: '共享规则', required: false, icon: 'link' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveEditor(tab.id as any)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                activeEditor === tab.id
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <span className="material-icons-round text-base">{tab.icon}</span>
              {tab.label}
              {tab.required && <span className="text-red-500 text-xs">*</span>}
            </button>
          ))}
        </div>

        <div className="border-2 border-gray-200 border-t-0 rounded-b-xl overflow-hidden bg-white">
          {activeEditor === 'system' && (
            <Suspense fallback={<div className="h-[400px] flex items-center justify-center text-gray-400">加载编辑器...</div>}>
              <MDEditor
                value={formData.systemPrompt}
                onChange={(val) => handleFieldChange('systemPrompt', val || '')}
                height={400}
                preview="edit"
              />
            </Suspense>
          )}

          {activeEditor === 'user' && (
            <Suspense fallback={<div className="h-[400px] flex items-center justify-center text-gray-400">加载编辑器...</div>}>
              <MDEditor
                value={formData.userPrompt}
                onChange={(val) => handleFieldChange('userPrompt', val || '')}
                height={400}
                preview="edit"
              />
            </Suspense>
          )}

          {activeEditor === 'schema' && (
            <textarea
              value={formData.inputSchema}
              onChange={(e) => handleFieldChange('inputSchema', e.target.value)}
              className="w-full h-[400px] p-4 font-mono text-sm focus:outline-none bg-gray-50"
              placeholder="TypeScript Schema 定义"
            />
          )}

          {activeEditor === 'includes' && (
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  共享规则依赖（includes.rules）
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  选择此 Skill 依赖的共享规则文件。规则内容会在渲染时注入到提示词中。
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {sharedRulesQuery.data?.map((rule) => (
                    <label
                      key={rule.name}
                      className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-primary/30 cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={formData.includes.rules.includes(rule.name)}
                        onChange={(e) => {
                          const newRules = e.target.checked
                            ? [...formData.includes.rules, rule.name]
                            : formData.includes.rules.filter((r) => r !== rule.name);
                          onChange({
                            ...formData,
                            includes: { rules: newRules },
                          });
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{rule.name}</span>
                    </label>
                  ))}
                </div>
                {sharedRulesQuery.isLoading && (
                  <div className="text-gray-500 text-sm py-4 text-center">加载共享规则列表...</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  已选规则
                </label>
                <div className="flex flex-wrap gap-2">
                  {formData.includes.rules.length === 0 ? (
                    <span className="text-gray-500 text-sm py-2">未选择任何规则</span>
                  ) : (
                    formData.includes.rules.map((rule) => (
                      <span
                        key={rule}
                        className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm flex items-center gap-1.5 font-medium"
                      >
                        {rule}
                        <button
                          onClick={() => {
                            onChange({
                              ...formData,
                              includes: {
                                rules: formData.includes.rules.filter((r) => r !== rule),
                              },
                            });
                          }}
                          className="text-primary/60 hover:text-primary"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
          <span className="material-icons-round text-sm">info</span>
          {activeEditor === 'system' && 'System Prompt 模板，支持 Handlebars 语法（如 {{variable}}）'}
          {activeEditor === 'user' && 'User Prompt 模板，支持 Handlebars 语法（如 {{variable}}）'}
          {activeEditor === 'schema' && 'TypeScript 类型定义，使用 Zod Schema 验证输入参数'}
        </p>
      </div>

      {/* 操作按钮：优化样式 */}
      <div className="space-y-4 bg-gray-50/50 rounded-xl p-4">
        {mode === 'edit' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">作者</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="输入作者名称"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">变更说明</label>
              <input
                type="text"
                value={changeLog}
                onChange={(e) => setChangeLog(e.target.value)}
                placeholder="描述本次修改内容"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={mode === 'edit' ? handleSubmitWithVersion : onSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
          >
            <span className="material-icons-round text-base">
              {loading ? 'hourglass_empty' : 'save'}
            </span>
            {loading ? '保存中...' : mode === 'create' ? '创建 Skill' : '保存修改'}
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

// 性能监控视图
interface MetricsViewProps {
  metrics: any;
  loading: boolean;
  api: ReturnType<typeof createSkillsBackendApi>;
  onRefresh: () => void;
}

const MetricsView: React.FC<MetricsViewProps> = ({ metrics, loading, api, onRefresh }) => {
  const handleReset = async () => {
    if (!confirm('确定重置所有指标吗？')) return;
    try {
      await api.resetMetrics();
      onRefresh();
      alert('指标已重置');
    } catch (error) {
      alert(error instanceof Error ? error.message : '重置失败');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin mb-3" />
        <div className="text-gray-500 text-sm">加载中...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-16">
        <span className="material-icons-round text-5xl text-gray-300 mb-3">analytics</span>
        <p className="text-gray-500">无法加载指标</p>
      </div>
    );
  }

  const stats = [
    { label: '总请求数', value: metrics.total, icon: 'request_page', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Skills 使用次数', value: metrics.skillsUsed, icon: 'psychology', color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Skills 成功次数', value: metrics.skillsSuccess, icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Skills 失败次数', value: metrics.skillsFailed, icon: 'error', color: 'text-red-600', bg: 'bg-red-50' },
    { label: '数据库使用次数', value: metrics.dbUsed, icon: 'storage', color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const performance = [
    { label: 'Skills 平均耗时', value: `${metrics.avgDuration.toFixed(2)} ms`, icon: 'speed', color: 'text-green-600', bg: 'bg-green-50' },
    { label: '数据库平均耗时', value: `${metrics.dbAvgDuration.toFixed(2)} ms`, icon: 'timer', color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '缓存命中次数', value: metrics.cacheHits, icon: 'cached', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '缓存未命中次数', value: metrics.cacheMisses, icon: 'sync_problem', color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: '缓存命中率', value: `${(metrics.cacheHitRate * 100).toFixed(1)}%`, icon: 'percent', color: 'text-primary', bg: 'bg-primary/10' },
  ];

  return (
    <div className="space-y-6">
      {/* 刷新按钮：优化样式 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="material-icons-round text-base text-primary animate-pulse">sync</span>
          数据每 5 秒自动刷新
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center gap-2"
          >
            <span className="material-icons-round text-base">refresh</span>
            立即刷新
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-all flex items-center gap-2"
          >
            <span className="material-icons-round text-base">restart_alt</span>
            重置指标
          </button>
        </div>
      </div>

      {/* 使用统计：优化卡片样式 */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
          <span className="material-icons-round text-primary">bar_chart</span>
          使用统计
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map(stat => (
            <div key={stat.label} className={`bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow`}>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <span className={`material-icons-round text-xl ${stat.color}`}>{stat.icon}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 性能指标：优化卡片样式 */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
          <span className="material-icons-round text-primary">speed</span>
          性能指标
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {performance.map(stat => (
            <div key={stat.label} className={`bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow`}>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <span className={`material-icons-round text-xl ${stat.color}`}>{stat.icon}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 性能对比：优化样式 */}
      {metrics.avgDuration > 0 && metrics.dbAvgDuration > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <span className="material-icons-round text-2xl text-green-600">trending_up</span>
            </div>
            <div>
              <h3 className="font-semibold text-green-900">性能提升</h3>
              <p className="text-sm text-green-700 mt-1">
                Skills 系统比数据库方式快{' '}
                <span className="font-bold text-lg text-green-600">
                  {((1 - metrics.avgDuration / metrics.dbAvgDuration) * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================
// 共享规则管理视图
// =====================================================

interface SharedRulesViewProps {
  api: ReturnType<typeof createSkillsBackendApi>;
}

/* ==================== 系统配置视图 ===================== */

interface ConfigViewProps {
  config?: SkillsSystemStatus;
  loading: boolean;
  api: ReturnType<typeof createSkillsBackendApi>;
  onRefresh: () => void;
}

const ConfigView: React.FC<ConfigViewProps> = ({ config, loading, api, onRefresh }) => {
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggle = async (key: 'scoringDaemonEnabled' | 'evolutionEnabled') => {
    if (!config) return;
    setUpdating(key);
    try {
      await api.updateSystemConfig({
        ...config.config,
        [key]: !config.config[key],
      });
      queryClient.invalidateQueries({ queryKey: ['skills-system-config'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新失败');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">加载中...</div>;
  }

  if (!config) {
    return <div className="text-center py-8 text-gray-500">暂无数据</div>;
  }

  const { config: cfg, runtime, metrics, cache, warnings } = config;

  return (
    <div className="space-y-6">
      {/* 配置不一致性警告 */}
      {warnings && warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-amber-800">配置警告</h4>
              <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Daemon 开关 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 评分 Daemon */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-medium text-gray-900">脚本质量评分服务</h3>
              <p className="text-sm text-gray-500 mt-1">自动评分生成的脚本质量</p>
            </div>
            <button
              onClick={() => handleToggle('scoringDaemonEnabled')}
              disabled={updating === 'scoringDaemonEnabled'}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${cfg.scoringDaemonEnabled ? 'bg-green-500' : 'bg-gray-300'}
                ${updating === 'scoringDaemonEnabled' ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${cfg.scoringDaemonEnabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${runtime.scoringDaemonRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className={runtime.scoringDaemonRunning ? 'text-green-700' : 'text-gray-500'}>
              {runtime.scoringDaemonRunning ? '运行中' : '已停止'}
            </span>
          </div>
        </div>

        {/* 进化 Daemon */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-medium text-gray-900">提示词进化服务</h3>
              <p className="text-sm text-gray-500 mt-1">检测质量信号，自动生成改进提案</p>
            </div>
            <button
              onClick={() => handleToggle('evolutionEnabled')}
              disabled={updating === 'evolutionEnabled'}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${cfg.evolutionEnabled ? 'bg-green-500' : 'bg-gray-300'}
                ${updating === 'evolutionEnabled' ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${cfg.evolutionEnabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${runtime.evolutionRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className={runtime.evolutionRunning ? 'text-green-700' : 'text-gray-500'}>
              {runtime.evolutionRunning ? '运行中' : '已停止'}
            </span>
          </div>
        </div>
      </div>

      {/* 缓存和指标概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 缓存状态 */}
        {cache && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">缓存状态</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">缓存大小</span>
                <p className="font-medium text-gray-900">{cache.size}</p>
              </div>
              <div>
                <span className="text-gray-500">命中率</span>
                <p className="font-medium text-gray-900">{(cache.hitRate * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-gray-500">命中次数</span>
                <p className="font-medium text-gray-900">{cache.hits}</p>
              </div>
              <div>
                <span className="text-gray-500">未命中次数</span>
                <p className="font-medium text-gray-900">{cache.misses}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                try { await api.clearCache(); onRefresh(); } catch (e) { alert(e instanceof Error ? e.message : '清空失败'); }
              }}
              className="mt-3 text-xs text-red-600 hover:text-red-800"
            >
              清空缓存
            </button>
          </div>
        )}

        {/* 指标概览 */}
        {metrics && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">评分指标</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">总调用</span>
                <p className="font-medium text-gray-900">{metrics.total}</p>
              </div>
              <div>
                <span className="text-gray-500">成功</span>
                <p className="font-medium text-green-700">{metrics.skillsSuccess}</p>
              </div>
              <div>
                <span className="text-gray-500">失败</span>
                <p className="font-medium text-red-700">{metrics.skillsFailed}</p>
              </div>
              <div>
                <span className="text-gray-500">平均耗时</span>
                <p className="font-medium text-gray-900">{metrics.avgDuration.toFixed(0)}ms</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SharedRulesView: React.FC<SharedRulesViewProps> = ({ api }) => {
  const queryClient = useQueryClient();
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isNewRule, setIsNewRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');

  // 查询共享规则列表
  const rulesQuery = useQuery({
    queryKey: ['shared-rules-list'],
    queryFn: () => api.listSharedRules(),
  });

  // 查询选中规则详情
  const ruleDetailQuery = useQuery({
    queryKey: ['shared-rule-detail', selectedRule],
    queryFn: () => api.getSharedRule(selectedRule!),
    enabled: !!selectedRule,
  });

  // 创建规则 mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; content: string }) =>
      api.createSharedRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-rules-list'] });
      setIsNewRule(false);
      setNewRuleName('');
      setEditContent('');
      alert('共享规则创建成功');
    },
    onError: (error: Error) => {
      alert(`创建失败: ${error.message}`);
    },
  });

  // 更新规则 mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name: string; content: string }) =>
      api.updateSharedRule(data.name, { content: data.content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-rules-list'] });
      queryClient.invalidateQueries({ queryKey: ['shared-rule-detail', selectedRule] });
      setIsEditing(false);
      alert('共享规则更新成功');
    },
    onError: (error: Error) => {
      alert(`更新失败: ${error.message}`);
    },
  });

  // 删除规则 mutation
  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteSharedRule(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-rules-list'] });
      setSelectedRule(null);
      alert('共享规则删除成功');
    },
    onError: (error: Error) => {
      alert(`删除失败: ${error.message}`);
    },
  });

  // 开始编辑
  const handleEdit = () => {
    if (ruleDetailQuery.data) {
      setEditContent(ruleDetailQuery.data.content);
      setIsEditing(true);
    }
  };

  // 开始新建
  const handleNew = () => {
    setIsNewRule(true);
    setNewRuleName('');
    setEditContent('');
  };

  // 保存
  const handleSave = () => {
    if (isNewRule) {
      if (!newRuleName.trim()) {
        alert('请输入规则名称');
        return;
      }
      if (!/^[\w-]+$/.test(newRuleName)) {
        alert('规则名称只能包含字母、数字、下划线和连字符');
        return;
      }
      createMutation.mutate({ name: newRuleName, content: editContent });
    } else if (selectedRule) {
      updateMutation.mutate({ name: selectedRule, content: editContent });
    }
  };

  // 删除
  const handleDelete = () => {
    if (!selectedRule) return;
    if (!confirm(`确定删除共享规则 "${selectedRule}" 吗？`)) return;
    deleteMutation.mutate(selectedRule);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* 标题：优化样式 */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-primary text-xl">link</span>
            <h3 className="font-semibold text-gray-900">共享规则管理</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            共享规则文件位于 <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">skills/_shared/rules/</code> 目录，可被多个 Skill 通过 includes.rules 引用
          </p>
        </div>
        <button
          onClick={handleNew}
          className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 font-medium"
        >
          <span className="material-icons-round text-base">add</span>
          新建规则
        </button>
      </div>

      {/* 新建规则表单：优化样式 */}
      {isNewRule && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 pb-3 border-b border-gray-100">
            <span className="material-icons-round text-primary">create_new_folder</span>
            新建共享规则
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              规则名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              placeholder="hotspot-analysis-output-schema"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              只能包含字母、数字、下划线和连字符
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              规则内容（Markdown）
            </label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <Suspense fallback={<div className="h-[400px] flex items-center justify-center text-gray-400">加载编辑器...</div>}>
                <MDEditor
                  value={editContent}
                  onChange={(val) => setEditContent(val || '')}
                  height={400}
                  preview="edit"
                />
              </Suspense>
            </div>
          </div>
          <div className="flex gap-3 pt-3">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending}
              className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2 font-medium"
            >
              <span className="material-icons-round text-base">
                {createMutation.isPending ? 'hourglass_empty' : 'save'}
              </span>
              {createMutation.isPending ? '创建中...' : '创建规则'}
            </button>
            <button
              onClick={() => setIsNewRule(false)}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 规则列表：优化样式 */}
      {!isNewRule && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 左侧：规则列表 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
              <span className="material-icons-round text-primary text-base">folder_open</span>
              规则文件列表
            </div>
            {rulesQuery.isLoading && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin mb-2" />
                <div className="text-gray-500 text-sm">加载中...</div>
              </div>
            )}
            {rulesQuery.data?.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <span className="material-icons-round text-3xl text-gray-300 mb-2">folder_off</span>
                <p className="text-sm">暂无共享规则</p>
              </div>
            )}
            <div className="space-y-2">
              {rulesQuery.data?.map((rule) => (
                <button
                  key={rule.name}
                  onClick={() => setSelectedRule(rule.name)}
                  className={`w-full p-3 rounded-xl text-left transition-all ${
                    selectedRule === rule.name
                      ? 'bg-primary/10 border-2 border-primary shadow-sm'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{rule.name}</div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {rule.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：规则详情 */}
          <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            {!selectedRule && (
              <div className="text-center py-16 text-gray-500">
                <span className="material-icons-round text-5xl text-gray-300 mb-3">description</span>
                <p>请从左侧选择一个规则查看详情</p>
              </div>
            )}
            {selectedRule && ruleDetailQuery.isLoading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin mb-3" />
                <div className="text-gray-500 text-sm">加载中...</div>
              </div>
            )}
            {selectedRule && ruleDetailQuery.data && !isEditing && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-primary">description</span>
                    <h4 className="font-semibold text-gray-900">
                      {ruleDetailQuery.data.name}
                    </h4>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleEdit}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all flex items-center gap-1.5 text-sm font-medium"
                    >
                      <span className="material-icons-round text-base">edit</span>
                      编辑
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all flex items-center gap-1.5 text-sm font-medium"
                    >
                      <span className="material-icons-round text-base">delete</span>
                      删除
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <Suspense fallback={<div className="h-[200px] flex items-center justify-center text-gray-400">加载预览...</div>}>
                    <MDEditor.Markdown source={ruleDetailQuery.data.content} />
                  </Suspense>
                </div>
              </div>
            )}
            {selectedRule && isEditing && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-primary">edit_document</span>
                    <h4 className="font-semibold text-gray-900">
                      编辑：{selectedRule}
                    </h4>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5 text-sm font-medium"
                    >
                      <span className="material-icons-round text-base">
                        {updateMutation.isPending ? 'hourglass_empty' : 'save'}
                      </span>
                      {updateMutation.isPending ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium"
                    >
                      取消
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Suspense fallback={<div className="h-[500px] flex items-center justify-center text-gray-400">加载编辑器...</div>}>
                    <MDEditor
                      value={editContent}
                      onChange={(val) => setEditContent(val || '')}
                      height={500}
                      preview="edit"
                    />
                  </Suspense>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
