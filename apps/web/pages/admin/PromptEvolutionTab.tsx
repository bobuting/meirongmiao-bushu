/**
 * 提示词自进化 Tab 组件
 * 用于 Skills 管理面板中的提示词进化功能
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { request } from '../../services/backendApi.request';

/* ===================== 类型定义 ===================== */

type ProposalStatus = 'draft' | 'ab_testing' | 'published' | 'rejected';

interface Proposal {
  id: string;
  prompt_code: string;
  signal_type: string;
  signal_data: Record<string, unknown>;
  proposed_content: string;
  rationale: string;
  status: ProposalStatus;
  created_at: string;
  reviewed_by?: string;
  review_notes?: string;
  ab_test_version?: string;
}

/* ===================== API 函数 ===================== */

async function fetchProposals(status?: ProposalStatus): Promise<Proposal[]> {
  const url = status
    ? `/admin/prompt-evolution/proposals?status=${status}`
    : '/admin/prompt-evolution/proposals';
  const res = await request<{ proposals: Proposal[] }>('GET', url);
  return res.proposals;
}

async function startABTest(id: string, reviewNotes?: string) {
  return request<{ success: boolean; abTestVersion?: string }>('POST', `/admin/prompt-evolution/proposals/${id}/start-ab-test`, {
    body: { reviewNotes },
  });
}

async function publishProposal(id: string, reviewNotes?: string) {
  return request<{ success: boolean; oldVersion?: string; newVersion?: string; filePath?: string; error?: string }>('POST', `/admin/prompt-evolution/proposals/${id}/publish`, {
    body: { reviewNotes },
  });
}

async function rejectProposal(id: string, reviewNotes?: string) {
  return request<{ success: boolean }>('POST', `/admin/prompt-evolution/proposals/${id}/reject`, {
    body: { reviewNotes },
  });
}

async function triggerDetection() {
  return request<{ signals: unknown[]; count: number }>('POST', '/admin/prompt-evolution/detect', {});
}

/* ==================== 主组件 ==================== */

export const PromptEvolutionTab: React.FC = () => {
  const queryClient = useQueryClient();
  const token = useAppStore((state) => state.token);

  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('draft');
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 查询提案列表
  const proposalsQuery = useQuery({
    queryKey: ['prompt-evolution-proposals', statusFilter],
    queryFn: () => fetchProposals(statusFilter === 'all' ? undefined : statusFilter),
    enabled: !!token,
  });

  // 手动触发检测
  const detectMutation = useMutation({
    mutationFn: triggerDetection,
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: `检测完成，发现 ${data.count} 个信号` });
      queryClient.invalidateQueries({ queryKey: ['prompt-evolution-proposals'] });
    },
    onError: () => {
      setFeedback({ type: 'error', message: '检测失败' });
    },
  });

  // 开始 A/B 测试
  const abTestMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => startABTest(id, notes),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'A/B 测试已启动' });
      setSelectedProposal(null);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['prompt-evolution-proposals'] });
    },
    onError: () => {
      setFeedback({ type: 'error', message: 'A/B 测试启动失败' });
    },
  });

  // 发布提案
  const publishMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => publishProposal(id, notes),
    onSuccess: (data) => {
      setFeedback({
        type: 'success',
        message: `发布成功：${data.oldVersion} → ${data.newVersion}`
      });
      setSelectedProposal(null);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['prompt-evolution-proposals'] });
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: error.error || '发布失败' });
    },
  });

  // 拒绝提案
  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => rejectProposal(id, notes),
    onSuccess: () => {
      setFeedback({ type: 'success', message: '提案已拒绝' });
      setSelectedProposal(null);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['prompt-evolution-proposals'] });
    },
    onError: () => {
      setFeedback({ type: 'error', message: '拒绝失败' });
    },
  });

  const proposals = proposalsQuery.data || [];

  const statusConfig = (status: ProposalStatus) => {
    switch (status) {
      case 'draft': return { label: '待审核', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' };
      case 'ab_testing': return { label: 'A/B 测试中', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' };
      case 'published': return { label: '已发布', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' };
      case 'rejected': return { label: '已拒绝', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
    }
  };

  return (
    <div className="space-y-5 pb-32">
      {/* 标题区域：优化样式 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">auto_awesome</span>
          <h2 className="text-lg font-semibold text-gray-900">提示词自进化管理</h2>
        </div>
        <button
          onClick={() => detectMutation.mutate()}
          disabled={detectMutation.isPending}
          className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2 font-medium"
        >
          <span className="material-icons-round text-base">
            {detectMutation.isPending ? 'hourglass_empty' : 'radar'}
          </span>
          {detectMutation.isPending ? '检测中...' : '手动触发检测'}
        </button>
      </div>

      {/* 反馈提示：优化样式 */}
      {feedback && (
        <div className={`p-4 rounded-lg border flex items-center gap-3 ${
          feedback.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span className={`material-icons-round ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {feedback.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto underline text-sm opacity-70 hover:opacity-100">
            关闭
          </button>
        </div>
      )}

      {/* 状态筛选：优化样式 */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'draft', 'ab_testing', 'published', 'rejected'] as const).map(status => {
          const config = status === 'all' ? null : statusConfig(status);
          const count = status === 'all'
            ? proposals.length
            : proposals.filter(p => p.status === status).length;

          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                statusFilter === status
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {status !== 'all' && config && (
                <span className={`w-2 h-2 rounded-full ${config.dot}`} />
              )}
              {status === 'all' ? '全部' : config?.label}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                statusFilter === status ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 提案列表：优化样式 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {proposalsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin mb-3" />
            <div className="text-gray-500 text-sm">加载中...</div>
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-icons-round text-5xl text-gray-300 mb-3">auto_awesome</span>
            <p className="text-gray-500">暂无提案</p>
            <p className="text-gray-400 text-sm mt-1">点击"手动触发检测"发现改进机会</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {proposals.map(proposal => {
              const config = statusConfig(proposal.status);
              return (
                <div key={proposal.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {proposal.prompt_code}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} flex items-center gap-1.5`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                          {config.label}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {proposal.signal_type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2 line-clamp-2">{proposal.rationale}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="material-icons-round text-sm">schedule</span>
                          {new Date(proposal.created_at).toLocaleString('zh-CN')}
                        </span>
                        {proposal.reviewed_by && (
                          <span className="flex items-center gap-1">
                            <span className="material-icons-round text-sm">person</span>
                            {proposal.reviewed_by}
                            {proposal.review_notes && ` - ${proposal.review_notes}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedProposal(proposal)}
                      className="px-4 py-2 text-sm font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <span className="material-icons-round text-base">visibility</span>
                      查看详情
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 提案详情弹窗：优化样式 */}
      {selectedProposal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl animate-fade-in-scale">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <span className="material-icons-round text-primary text-xl">description</span>
                <h2 className="text-lg font-bold text-gray-900">提案详情</h2>
              </div>
              <button
                onClick={() => setSelectedProposal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Skill 代码</label>
                  <p className="font-mono text-sm font-semibold text-primary">{selectedProposal.prompt_code}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">信号类型</label>
                  <p className="text-sm text-gray-900">{selectedProposal.signal_type}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">改进理由</label>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4">{selectedProposal.rationale}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">改进后的内容</label>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto max-h-80 font-mono">
                  {selectedProposal.proposed_content}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">审核备注（可选）</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                  rows={3}
                  placeholder="输入审核意见..."
                />
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="flex gap-3 p-5 border-t border-gray-200 bg-gray-50/50">
              {selectedProposal.status === 'draft' && (
                <>
                  <button
                    onClick={() => publishMutation.mutate({ id: selectedProposal.id, notes: reviewNotes })}
                    disabled={publishMutation.isPending}
                    className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all flex items-center gap-2 font-medium"
                  >
                    <span className="material-icons-round text-base">
                      {publishMutation.isPending ? 'hourglass_empty' : 'publish'}
                    </span>
                    {publishMutation.isPending ? '发布中...' : '直接发布'}
                  </button>
                  <button
                    onClick={() => abTestMutation.mutate({ id: selectedProposal.id, notes: reviewNotes })}
                    disabled={abTestMutation.isPending}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2 font-medium"
                  >
                    <span className="material-icons-round text-base">
                      {abTestMutation.isPending ? 'hourglass_empty' : 'science'}
                    </span>
                    {abTestMutation.isPending ? '启动中...' : '开始 A/B 测试'}
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate({ id: selectedProposal.id, notes: reviewNotes })}
                    disabled={rejectMutation.isPending}
                    className="px-5 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-all flex items-center gap-2 font-medium"
                  >
                    <span className="material-icons-round text-base">
                      {rejectMutation.isPending ? 'hourglass_empty' : 'block'}
                    </span>
                    {rejectMutation.isPending ? '拒绝中...' : '拒绝'}
                  </button>
                </>
              )}
              {selectedProposal.status === 'ab_testing' && (
                <button
                  onClick={() => publishMutation.mutate({ id: selectedProposal.id, notes: reviewNotes })}
                  disabled={publishMutation.isPending}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all flex items-center gap-2 font-medium"
                >
                  <span className="material-icons-round text-base">
                    {publishMutation.isPending ? 'hourglass_empty' : 'publish'}
                  </span>
                  {publishMutation.isPending ? '发布中...' : '发布到生产'}
                </button>
              )}
              <button
                onClick={() => setSelectedProposal(null)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium ml-auto"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
