/**
 * BusinessConfigManagement.tsx - 业务配置管理页面
 * Tab 名称存数据库（config_json.tabLabel），不允许为空
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { ApiError } from "../../services/backendApi";
import { realBackendApi } from "../../services/realApi";
import { backendApi } from "../../services/backendApi";

// ── CopyableText 组件 ──────────────────────────────────

function CopyableText({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1 cursor-pointer group ${className || ""}`}
      onClick={handleCopy}
      title="点击复制"
    >
      <span className="font-mono text-xs text-gray-600 truncate max-w-[160px]">{text}</span>
      <span className="material-symbols-outlined text-[14px] text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors">
        {copied ? "check" : "content_copy"}
      </span>
    </span>
  );
}

// ── 模块定义 ──────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  description: string;
  type?: "number" | "boolean" | "text";
}

interface ModuleDef {
  module: string;
  defaultTabLabel: string;
  defaultDescription: string;
  fields: FieldDef[];
}

const INITIAL_MODULE_DEFS: ModuleDef[] = [
  {
    module: "step1_outfit",
    defaultTabLabel: "Step1 穿搭",
    defaultDescription: "服装搭配与穿搭推荐相关配置",
    fields: [
      { key: "outfitRecommendRetryCount", label: "穿搭推荐重试次数", description: "穿搭推荐失败时的最大重试次数" },
    ],
  },
  {
    module: "step2_character",
    defaultTabLabel: "Step2 定妆",
    defaultDescription: "角色定妆与五视图生成相关配置",
    fields: [
      { key: "fiveViewRegenCount", label: "五视图重新生成次数", description: "五视图不满意时可重新生成的次数" },
    ],
  },
  {
    module: "step3_image",
    defaultTabLabel: "Step3 图片",
    defaultDescription: "图片生成与脚本推荐相关配置",
    fields: [
      { key: "imageRegenLimit", label: "图片重新生成次数限制", description: "图片不满意时可重新生成的最大次数" },
      { key: "scriptRefreshRecommendCount", label: "脚本刷新推荐次数", description: "脚本不满意时可刷新推荐的最大次数" },
    ],
  },
  {
    module: "step4_video",
    defaultTabLabel: "Step4 视频",
    defaultDescription: "视频生成相关配置（并发控制已移至任务管理-全局调度）",
    fields: [
      { key: "batchGenerateCount", label: "批量生成数量", description: "每个分镜场景生成的视频变体数量" },
      { key: "retryCount", label: "重试次数", description: "单视频生成失败后重试次数" },
    ],
  },
  {
    module: "step5_publish",
    defaultTabLabel: "Step5 发布",
    defaultDescription: "发布流程相关配置",
    fields: [
      { key: "publishTimeoutMs", label: "发布超时时间（毫秒）", description: "单次发布操作的超时时间" },
    ],
  },
  {
    module: "step6_fission",
    defaultTabLabel: "Step6 裂变",
    defaultDescription: "裂变任务与重试策略相关配置",
    fields: [
      { key: "fissionImageRetryCount", label: "裂变单图重试次数", description: "裂变任务中单张图片生成失败的重试次数" },
      { key: "fissionVideoRetryCount", label: "裂变单视频重试次数", description: "裂变任务中单个视频生成失败的重试次数" },
      { key: "globalTaskRetryCount", label: "全局任务重试次数", description: "裂变全局任务失败时的最大重试次数" },
    ],
  },
  {
    module: "scoring_loop",
    defaultTabLabel: "评分闭环",
    defaultDescription: "评分结果回注库存筛选、弱项反馈注入、低分淘汰",
    fields: [
      { key: "enabled", label: "闭环总开关", description: "启用后评分结果参与库存筛选、弱项反馈注入、低分淘汰", type: "boolean" },
      { key: "minScoreForLibrary", label: "库存筛选最低分", description: "低于此分数的脚本不进入 library 推荐池" },
      { key: "deprecationThreshold", label: "低分淘汰阈值", description: "低于此分数的脚本标记为 deprecated（不再推荐）" },
      { key: "weaknessFeedbackEnabled", label: "弱项反馈注入", description: "将历史评分弱项注入脚本改写 LLM prompt", type: "boolean" },
    ],
  },
  {
    module: "system_database",
    defaultTabLabel: "数据库配置",
    defaultDescription: "测试库与正式库连接配置，用于项目数据迁移",
    fields: [
      { key: "testDbUrl", label: "测试库连接", description: "测试数据库连接字符串（postgres://...）", type: "text" },
      { key: "prodDbUrl", label: "正式库连接", description: "正式数据库连接字符串（postgres://...）", type: "text" },
    ],
  },
];

// ── 新增字段弹窗 ──────────────────────────────────────────

function AddFieldModal({
  open,
  onClose,
  onAdd,
  existingKeys,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (key: string, label: string, description: string) => void;
  existingKeys: Set<string>;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");

  if (!open) return null;

  const conflict = existingKeys.has(key.trim().toLowerCase());
  const valid = key.trim().length > 0 && label.trim().length > 0 && !conflict;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[480px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">新增配置字段</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              字段编码 <span className="text-red-500">*</span>
            </label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="例：customMaxRetries（camelCase）"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
              autoFocus
            />
            {conflict && <p className="text-xs text-red-500 mt-1">编码已存在，请使用其他名称</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              显示名称 <span className="text-red-500">*</span>
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例：自定义最大重试次数"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">说明</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="可选，字段用途说明"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
            />
          </div>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100">取消</button>
          <button
            disabled={!valid}
            onClick={() => { onAdd(key.trim(), label.trim(), desc.trim()); setKey(""); setLabel(""); setDesc(""); }}
            className={`px-4 py-2 rounded-md text-sm text-white ${valid ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"}`}
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主页面组件 ──────────────────────────────────────────────

type ModuleConfigState = Record<string, Record<string, unknown>>;
type ModuleDirtyState = Record<string, boolean>;
type CustomFieldsState = Record<string, Array<{ key: string; label: string; description: string }>>;
type TabLabelsState = Record<string, string>;

/** 从 localStorage 加载自定义字段 */
function loadCustomFields(): CustomFieldsState {
  try {
    const saved = localStorage.getItem("nrm_business_custom_fields");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export const BusinessConfigManagement: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const canAccess = currentUser?.role === "admin" && Boolean(token);

  const [activeTab, setActiveTab] = useState(0);
  const [configs, setConfigs] = useState<ModuleConfigState>({});
  const [originalConfigs, setOriginalConfigs] = useState<ModuleConfigState>({});
  const [dirty, setDirty] = useState<ModuleDirtyState>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [originalDescriptions, setOriginalDescriptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [tabLabels, setTabLabels] = useState<TabLabelsState>({});
  const [originalTabLabels, setOriginalTabLabels] = useState<TabLabelsState>({});

  const [customFields, setCustomFields] = useState<CustomFieldsState>(loadCustomFields);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queueStatus, setQueueStatus] = useState<{ globalActiveCount: number; pendingCount: number; runningCount: number; byType: Array<{ jobType: string; status: string; count: number }> } | null>(null);

  // Step3 候选管理解锁
  const [unlockForm, setUnlockForm] = useState({ projectId: "", reason: "" });
  const [unlockLoading, setUnlockLoading] = useState(false);

  // 持久化自定义字段
  useEffect(() => {
    localStorage.setItem("nrm_business_custom_fields", JSON.stringify(customFields));
  }, [customFields]);

  // 反馈自动消失
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setFeedback({ type, message });
    saveTimeoutRef.current = setTimeout(() => setFeedback(null), 3000);
  }, []);

  const loadConfigs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await realBackendApi.businessConfigsList(token);
      const configMap: ModuleConfigState = {};
      const descMap: Record<string, string> = {};
      const tabMap: TabLabelsState = {};
      for (const item of res.items) {
        configMap[item.module] = item.config ?? {};
        descMap[item.module] = item.description ?? "";
        tabMap[item.module] = (item.config as Record<string, unknown>)?.tabLabel as string || "";
      }
      for (const def of INITIAL_MODULE_DEFS) {
        if (!descMap[def.module]) descMap[def.module] = def.defaultDescription;
        if (!tabMap[def.module]) tabMap[def.module] = def.defaultTabLabel;
      }
      setConfigs(configMap);
      setOriginalConfigs(JSON.parse(JSON.stringify(configMap)));
      setDescriptions(descMap);
      setOriginalDescriptions({ ...descMap });
      setTabLabels(tabMap);
      setOriginalTabLabels({ ...tabMap });
      setDirty({});
      // 加载队列状态
      try {
        const qs = await realBackendApi.taskQueueStatus(token);
        setQueueStatus(qs);
      } catch { /* 队列状态加载失败不影响主功能 */ }
    } catch (err) {
      showToast("error", `加载配置失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    if (canAccess) loadConfigs();
  }, [canAccess, loadConfigs]);

  const markDirty = (module: string) => setDirty((prev) => ({ ...prev, [module]: true }));

  const handleChange = (module: string, key: string, value: unknown) => {
    setConfigs((prev) => ({ ...prev, [module]: { ...(prev[module] ?? {}), [key]: value } }));
    markDirty(module);
  };

  const handleDescriptionChange = (module: string, value: string) => {
    setDescriptions((prev) => ({ ...prev, [module]: value }));
    markDirty(module);
  };

  const handleTabLabelChange = (module: string, value: string) => {
    setTabLabels((prev) => ({ ...prev, [module]: value }));
    markDirty(module);
  };

  const handleReset = (module: string) => {
    setConfigs((prev) => ({ ...prev, [module]: { ...(originalConfigs[module] ?? {}) } }));
    setDescriptions((prev) => ({ ...prev, [module]: originalDescriptions[module] ?? "" }));
    setTabLabels((prev) => ({ ...prev, [module]: originalTabLabels[module] ?? "" }));
    setDirty((prev) => ({ ...prev, [module]: false }));
  };

  const handleSave = async (module: string) => {
    if (!token) return;
    // Tab 名称不允许为空
    const tabLabel = (tabLabels[module] ?? "").trim();
    if (!tabLabel) {
      showToast("error", "Tab 名称不能为空");
      return;
    }
    setSaving(module);
    try {
      const config = { ...(configs[module] ?? {}), tabLabel };
      await realBackendApi.businessConfigPatch(token, module, {
        config,
        description: descriptions[module] || undefined,
      });
      setConfigs((prev) => ({ ...prev, [module]: config }));
      setOriginalConfigs((prev) => ({ ...prev, [module]: JSON.parse(JSON.stringify(config)) }));
      setOriginalDescriptions((prev) => ({ ...prev, [module]: descriptions[module] ?? "" }));
      setOriginalTabLabels((prev) => ({ ...prev, [module]: tabLabel }));
      setDirty((prev) => ({ ...prev, [module]: false }));
      showToast("success", "保存成功");
    } catch (err) {
      showToast("error", `保存失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const handleAddCustomField = useCallback((module: string, key: string, label: string, description: string) => {
    const existing = customFields[module] ?? [];
    if (existing.some((f) => f.key.toLowerCase() === key.toLowerCase())) {
      showToast("error", "编码已存在");
      return;
    }
    setCustomFields((prev) => ({ ...prev, [module]: [...(prev[module] ?? []), { key, label, description }] }));
    setConfigs((prev) => ({ ...prev, [module]: { ...(prev[module] ?? {}), [key]: 0 } }));
    setOriginalConfigs((prev) => ({ ...prev, [module]: { ...(prev[module] ?? {}), [key]: 0 } }));
    markDirty(module);
    setShowAddModal(false);
    showToast("success", "字段已添加");
  }, [customFields, showToast]);

  const handleDeleteCustomField = useCallback((module: string, fieldKey: string) => {
    setCustomFields((prev) => ({
      ...prev,
      [module]: (prev[module] ?? []).filter((f) => f.key !== fieldKey),
    }));
    setConfigs((prev) => {
      const copy = { ...(prev[module] ?? {}) };
      delete copy[fieldKey];
      return { ...prev, [module]: copy };
    });
    setOriginalConfigs((prev) => {
      const copy = { ...(prev[module] ?? {}) };
      delete copy[fieldKey];
      return { ...prev, [module]: copy };
    });
    markDirty(module);
  }, []);

  const handleRefresh = () => {
    loadConfigs();
  };

  // Step3 候选管理解锁
  const handleStep3Unlock = async () => {
    if (!token) {
      showToast("error", "登录已失效，请重新登录");
      return;
    }
    const projectId = unlockForm.projectId.trim();
    const reason = unlockForm.reason.trim();
    if (!projectId) {
      showToast("error", "请填写 Project ID");
      return;
    }
    if (!reason) {
      showToast("error", "解锁必须填写 reason");
      return;
    }
    try {
      setUnlockLoading(true);
      const response = await backendApi.step3CandidateAdminUnlock(token, projectId, reason);
      showToast("success", `Step3 解锁成功：${projectId}${response.success ? "" : "（未成功）"}`);
      setUnlockForm({ projectId: "", reason: "" });
    } catch (error) {
      showToast("error", error instanceof ApiError ? error.message : "Step3 解锁失败");
    } finally {
      setUnlockLoading(false);
    }
  };

  // ── 渲染 ──────────────────────────────────────────────

  if (!canAccess) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="text-center text-gray-500 py-12">仅管理员可访问此页面</div>
      </div>
    );
  }

  const currentDef = INITIAL_MODULE_DEFS[activeTab];
  const currentModule = currentDef.module;
  const currentConfig = configs[currentModule] ?? {};
  const isDirty = dirty[currentModule] ?? false;
  const isSaving = saving === currentModule;
  const moduleCustomFields = customFields[currentModule] ?? [];
  const currentTabLabel = tabLabels[currentModule] || currentDef.defaultTabLabel;

  const allFields = [
    ...currentDef.fields.map((f) => ({ ...f, custom: false as const })),
    ...moduleCustomFields.map((f) => ({ ...f, custom: true as const })),
  ];

  return (
    <>
      <AddFieldModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(key, label, desc) => handleAddCustomField(currentModule, key, label, desc)}
        existingKeys={new Set([...currentDef.fields.map((f) => f.key.toLowerCase()), ...moduleCustomFields.map((f) => f.key.toLowerCase())])}
      />

      <div className="h-full overflow-auto p-6 md:p-8">
        <div className="w-full">
          {/* 标题和导航 */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">业务配置管理</h1>
                <p className="text-gray-600 mt-1">按模块管理各业务配置参数，修改后即时生效</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-1"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  刷新
                </button>
                <button
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
                  onClick={() => handleReset(currentModule)}
                  disabled={!isDirty}
                >
                  重置
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => handleSave(currentModule)}
                  disabled={!isDirty || isSaving}
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>

            {/* Tab 导航 */}
            <div className="mt-4 flex space-x-4 border-b border-gray-200">
              {INITIAL_MODULE_DEFS.map((def, idx) => {
                const isActive = idx === activeTab;
                const modDirty = dirty[def.module] ?? false;
                const tabLabel = tabLabels[def.module] || def.defaultTabLabel;
                return (
                  <div key={def.module} className="relative">
                    <button
                      className={`px-4 py-2 ${isActive ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                      onClick={() => setActiveTab(idx)}
                    >
                      {tabLabel}
                    </button>
                    {modDirty && (
                      <span className="absolute -top-0.5 right-0 w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 队列状态概览 */}
          {queueStatus && (
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{queueStatus.globalActiveCount}</div>
                <div className="text-xs text-gray-500 mt-1">全局活跃任务</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{queueStatus.pendingCount}</div>
                <div className="text-xs text-gray-500 mt-1">排队中</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{queueStatus.runningCount}</div>
                <div className="text-xs text-gray-500 mt-1">执行中</div>
              </div>
            </div>
          )}

          {/* 反馈消息 */}
          {feedback && (
            <div className={`mb-4 p-4 rounded-lg ${feedback.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {feedback.message}
              <button className="ml-4 underline" onClick={() => setFeedback(null)}>关闭</button>
            </div>
          )}

          {/* 内容区域 */}
          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block w-7 h-7 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="ml-3 text-sm text-gray-500">加载配置中...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 模块信息：Tab 名称 + 描述 */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">{currentTabLabel}</h2>
                  <span className="text-xs font-normal text-gray-400 font-mono">({currentModule})</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tab 显示名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={tabLabels[currentModule] || ""}
                      onChange={(e) => handleTabLabelChange(currentModule, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                      placeholder="请输入 Tab 显示名称（必填）"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">模块备注</label>
                    <textarea
                      value={descriptions[currentModule] ?? ""}
                      onChange={(e) => handleDescriptionChange(currentModule, e.target.value)}
                      className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none placeholder:text-gray-400"
                      rows={1}
                      placeholder="输入此模块的备注说明..."
                    />
                  </div>
                </div>
              </div>

              {/* 配置表格 */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[20%]">字段编码</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[20%]">显示名称</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[12%]">值</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[38%]">说明</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[10%]">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {allFields.map((field) => {
                      const isCustom = field.custom;

                      return (
                        <tr key={field.key} className={`transition-colors ${isCustom ? "bg-orange-50/30 hover:bg-orange-50" : "hover:bg-gray-50"}`}>
                          <td className="px-6 py-3">
                            <CopyableText text={field.key} />
                          </td>
                          <td className="px-6 py-3">
                            {isCustom ? (
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => {
                                  const newLabel = e.target.value;
                                  setCustomFields((prev) => ({
                                    ...prev,
                                    [currentModule]: (prev[currentModule] ?? []).map((f) =>
                                      f.key === field.key ? { ...f, label: newLabel } : f
                                    ),
                                  }));
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                              />
                            ) : (
                              <span className="text-gray-800">{field.label}</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {field.custom === false && field.type === "boolean" ? (
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(currentConfig[field.key])}
                                  onChange={(e) => handleChange(currentModule, field.key, e.target.checked)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-600">
                                  {Boolean(currentConfig[field.key]) ? "已启用" : "已禁用"}
                                </span>
                              </label>
                            ) : field.type === "text" ? (
                              <input
                                type="text"
                                value={String(currentConfig[field.key] ?? "")}
                                onChange={(e) => handleChange(currentModule, field.key, e.target.value)}
                                className="w-80 px-2 py-1 border border-gray-300 rounded text-sm font-mono text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                              />
                            ) : (
                              <input
                                type="number"
                                min={0}
                                value={String(currentConfig[field.key] ?? "")}
                                onChange={(e) => handleChange(currentModule, field.key, Number(e.target.value) || 0)}
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm font-mono text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                              />
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {isCustom ? (
                              <input
                                type="text"
                                value={field.description}
                                onChange={(e) => {
                                  const newDesc = e.target.value;
                                  setCustomFields((prev) => ({
                                    ...prev,
                                    [currentModule]: (prev[currentModule] ?? []).map((f) =>
                                      f.key === field.key ? { ...f, description: newDesc } : f
                                    ),
                                  }));
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none placeholder:text-gray-400"
                                placeholder="字段说明..."
                              />
                            ) : (
                              <span className="text-xs text-gray-500">{field.description}</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {isCustom ? (
                              <button
                                onClick={() => handleDeleteCustomField(currentModule, field.key)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                删除
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* 新增字段按钮 */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    新增自定义字段
                  </button>
                </div>
              </div>

              {/* Step3 候选管理解锁（仅 step3_image tab 显示） */}
              {currentModule === "step3_image" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-200">
                      <span className="material-icons-round text-sm text-amber-700">lock_open</span>
                    </span>
                    <h3 className="text-sm font-bold text-amber-900">候选管理解锁</h3>
                    <span className="text-xs text-amber-600">将已确认锁定的脚本候选解锁回可编辑状态</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block mb-1 text-xs font-semibold text-gray-600">Project ID</label>
                      <input
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300"
                        placeholder="projectId"
                        value={unlockForm.projectId}
                        onChange={(e) => setUnlockForm((prev) => ({ ...prev, projectId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-xs font-semibold text-gray-600">Reason（必填）</label>
                      <input
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300"
                        placeholder="解锁原因"
                        value={unlockForm.reason}
                        onChange={(e) => setUnlockForm((prev) => ({ ...prev, reason: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => void handleStep3Unlock()}
                      disabled={unlockLoading}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {unlockLoading ? "解锁中..." : "解锁"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
