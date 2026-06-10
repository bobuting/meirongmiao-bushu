/**
 * 项目脚本数据和专业提示词展示组件
 * mode="scripts" → 展示 VideoScriptPayload JSON
 * mode="prompts" → 展示 shot_prompt_engineer 输出 JSON
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../services/backendApi';

interface ProjectScriptsTabProps {
  token: string;
  projectId: string;
  mode: 'scripts' | 'prompts';
  reverseScriptId?: string | null;
  projectKind?: string;
}

interface ScriptItem {
  scriptId: string;
  title: string;
  isSelected: boolean;
  isConfirmed: boolean;
  strategyType: string;
  createdAt: number;
  payload: Record<string, unknown>;
  shotPrompts: Record<string, unknown> | null;
}

const formatDate = (timestamp: number) => {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const JsonBlock: React.FC<{ data: unknown; maxHeight?: string }> = ({ data, maxHeight = '60vh' }) => {
  const [copied, setCopied] = useState(false);

  if (!data) {
    return <div className="text-gray-400 text-sm p-8 text-center">无数据</div>;
  }

  const jsonStr = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-3 py-1 text-xs rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 shadow-sm z-10 transition-colors"
      >
        {copied ? '已复制' : '复制 JSON'}
      </button>
      <pre
        className="bg-gray-50 p-4 rounded-lg text-xs overflow-auto border border-gray-200 font-mono text-gray-800 leading-relaxed whitespace-pre-wrap break-all"
        style={{ maxHeight }}
      >
        {jsonStr}
      </pre>
    </div>
  );
};

export const ProjectScriptsTab: React.FC<ProjectScriptsTabProps> = ({ token, projectId, mode, reverseScriptId, projectKind }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 是否选中源脚本（用于区分源脚本和普通脚本）
  const [isSourceScriptSelected, setIsSourceScriptSelected] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'project', projectId, 'scripts-raw'],
    queryFn: () => backendApi.getAdminProjectScriptsRaw(token, projectId),
  });

  // 查询反推源脚本
  const { data: reverseScript, isLoading: reverseLoading } = useQuery({
    queryKey: ['admin', 'reverse-script', reverseScriptId],
    queryFn: () => backendApi.getAdminReverseScript(token, reverseScriptId!),
    enabled: !!token && !!reverseScriptId && projectKind === 'reverse',
  });

  // 点击源脚本卡片
  const handleSourceScriptClick = () => {
    setIsSourceScriptSelected(true);
    setSelectedId(null); // 取消普通脚本的选中
  };

  // 点击普通脚本卡片
  const handleScriptClick = (scriptId: string) => {
    setIsSourceScriptSelected(false);
    setSelectedId(scriptId);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">加载中...</div>;
  }

  const scripts: ScriptItem[] = (data as any)?.scripts || [];

  if (scripts.length === 0) {
    return <div className="p-8 text-center text-gray-400">该项目暂无脚本数据</div>;
  }

  // prompts 模式下过滤有 shotPrompts 的脚本
  const displayScripts = mode === 'prompts'
    ? scripts.filter(s => s.shotPrompts != null)
    : scripts;

  // 默认选中第一个
  const activeScript = selectedId
    ? displayScripts.find(s => s.scriptId === selectedId)
    : displayScripts[0];

  const statusStyle = (isSelected: boolean, isConfirmed: boolean) => {
    if (isConfirmed) return 'bg-green-100 text-green-700 border-green-200';
    if (isSelected) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-500 border-gray-200';
  };

  return (
    <div className="flex gap-4" style={{ height: '55vh' }}>
      {/* 左侧脚本列表 */}
      <div className="w-64 flex-shrink-0 overflow-y-auto space-y-1 pr-1">
        {/* 源脚本卡片（仅反推项目且 scripts 模式显示） */}
        {projectKind === 'reverse' && reverseScriptId && mode === 'scripts' && (
          <div className="mb-2">
            {reverseLoading ? (
              <div className="text-gray-400 text-xs text-center py-2 border border-purple-200 rounded-lg">加载源脚本...</div>
            ) : reverseScript ? (
              <button
                onClick={handleSourceScriptClick}
                className={`w-full rounded-lg border overflow-hidden text-left transition-colors ${
                  isSourceScriptSelected
                    ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200'
                    : 'border-purple-200 bg-purple-50/50 hover:bg-purple-50'
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2 bg-purple-100/50 border-b border-purple-200">
                  <div className="flex items-center gap-1.5">
                    <span className="material-icons-round text-purple-500 text-sm">source</span>
                    <span className="text-xs font-semibold text-purple-700">源脚本（反推来源）</span>
                  </div>
                  <span className="text-xs text-purple-500">点击查看详情</span>
                </div>
                <div className="p-2 text-xs text-gray-600 truncate">
                  {reverseScript.title || '(无标题)'}
                </div>
              </button>
            ) : (
              <div className="text-gray-400 text-xs text-center py-2 border border-gray-200 rounded-lg">源脚本不存在</div>
            )}
          </div>
        )}

        {displayScripts.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-4">
            {mode === 'prompts' ? '暂无专业提示词数据' : '暂无脚本数据'}
          </div>
        ) : (
          displayScripts.map((s) => (
            <button
              key={s.scriptId}
              onClick={() => handleScriptClick(s.scriptId)}
              className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                activeScript?.scriptId === s.scriptId && !isSourceScriptSelected
                  ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-gray-150 hover:bg-gray-50'
              }`}
            >
              <div className="font-semibold text-gray-800 truncate">
                {s.title || '(无标题)'}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${statusStyle(s.isSelected, s.isConfirmed)}`}>
                  {s.isConfirmed ? '已确认' : s.isSelected ? '已选中' : '候选'}
                </span>
                <span className="text-[10px] text-gray-400">{s.strategyType}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{formatDate(s.createdAt)}</div>
              {mode === 'prompts' && (
                <div className="text-[10px] text-indigo-500 mt-0.5">有提示词数据</div>
              )}
            </button>
          ))
        )}
      </div>

      {/* 右侧 JSON 详情 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* 源脚本详情 */}
        {isSourceScriptSelected && reverseScript ? (
          <div className="h-full flex flex-col">
            <div className="text-sm font-semibold text-purple-700 mb-2 flex items-center gap-2 flex-shrink-0">
              <span className="material-icons-round text-purple-500">source</span>
              源脚本（反推来源）
              <span className="text-xs font-normal text-gray-500">
                {reverseScript.title || '(无标题)'}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* 显示 payload 内容，与普通脚本格式一致 */}
              <JsonBlock
                data={mode === 'scripts' ? reverseScript.payload : reverseScript.shotPrompts}
              />
            </div>
          </div>
        ) : activeScript ? (
          <div className="h-full flex flex-col">
            <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between flex-shrink-0">
              <span>
                {mode === 'scripts' ? '脚本 JSON' : '专业提示词 JSON'}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {activeScript.title || '(无标题)'}
                </span>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <JsonBlock
                data={mode === 'scripts' ? activeScript.payload : activeScript.shotPrompts}
              />
            </div>
          </div>
        ) : (
          <div className="text-gray-400 text-sm text-center pt-16">请选择脚本</div>
        )}
      </div>
    </div>
  );
};

export default ProjectScriptsTab;
