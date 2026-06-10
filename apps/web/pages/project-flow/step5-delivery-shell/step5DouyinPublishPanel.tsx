/**
 * 抖音发布面板（扩展模式）
 * 使用 Chrome 扩展直接通过浏览器发布，取代旧的二维码/远程登录方案
 */

import React from "react";
import { Button } from "../../../components/ui/Button";

/** 扩展绑定的抖音账号 */
export interface ExtDouyinAccount {
  id: string;
  label: string;
  douyinUid: string | null;
  status: string;
  lastVerifiedAt: number | null;
  createdAt: number;
}

interface Step5DouyinPublishHistoryItem {
  id: string;
  status: string;
  createdAt: number;
  result: { ok: boolean; message: string; errorDetail: string | null; screenshotUrl?: string | null } | null;
}

interface Step5DouyinPublishPanelProps {
  /** 扩展是否已安装 */
  extensionInstalled: boolean;
  panelOpen: boolean;
  onToggleOpen: () => void;
  /** 已绑定的抖音账号列表 */
  accounts: readonly ExtDouyinAccount[];
  /** 当前选中的账号 ID */
  selectedAccountId: string | null;
  onSelectedAccountChange: (accountId: string) => void;
  /** 是否可发布（扩展已安装 + 有选中账号 + 账号状态 active） */
  readyToPublish: boolean;
  /** 配置扩展（发送 API 地址和 Token） */
  onConfigExtension: () => void;
  tags: string;
  onTagsChange: (value: string) => void;
  linkUrl: string;
  onLinkUrlChange: (value: string) => void;
  productLink: string;
  onProductLinkChange: (value: string) => void;
  productTitle: string;
  onProductTitleChange: (value: string) => void;
  scheduleMode: "now" | "scheduled";
  onScheduleModeChange: (value: "now" | "scheduled") => void;
  scheduleDate: string;
  onScheduleDateChange: (value: string) => void;
  scheduleTime: string;
  onScheduleTimeChange: (value: string) => void;
  uploadCover: boolean;
  onUploadCoverChange: (value: boolean) => void;
  aiGeneratedDeclaration: boolean;
  onAiGeneratedDeclarationChange: (value: boolean) => void;
  publishStatus: string | null;
  publishMessage: string | null;
  publishJobId: string | null;
  publishDetail: string | null;
  publishLogs: readonly string[];
  publishScreenshot: string | null;
  isSubmitting: boolean;
  hasDeliveryPayload: boolean;
  onPublish: () => void;
  showPublishHistory: boolean;
  onTogglePublishHistory: () => void;
  publishHistory: readonly Step5DouyinPublishHistoryItem[];
  formatTimestamp: (value: number | null | undefined) => string;
  onInstallExtension?: () => void;
}

export const Step5DouyinPublishPanel: React.FC<Step5DouyinPublishPanelProps> = ({
  extensionInstalled,
  panelOpen,
  onToggleOpen,
  accounts,
  selectedAccountId,
  onSelectedAccountChange,
  readyToPublish,
  onConfigExtension,
  tags,
  onTagsChange,
  linkUrl,
  onLinkUrlChange,
  productLink,
  onProductLinkChange,
  productTitle,
  onProductTitleChange,
  scheduleMode,
  onScheduleModeChange,
  scheduleDate,
  onScheduleDateChange,
  scheduleTime,
  onScheduleTimeChange,
  uploadCover,
  onUploadCoverChange,
  aiGeneratedDeclaration,
  onAiGeneratedDeclarationChange,
  publishStatus,
  publishMessage,
  publishJobId,
  publishDetail,
  publishLogs,
  publishScreenshot,
  isSubmitting,
  hasDeliveryPayload,
  onPublish,
  showPublishHistory,
  onTogglePublishHistory,
  publishHistory,
  formatTimestamp,
  onInstallExtension,
}) => {
  const usingProductCard = productLink.trim().length > 0;

  // 统计活跃账号数
  const activeAccountCount = accounts.filter((a) => a.status === "active").length;

  return (
    <div className="rounded-3xl border border-[#ffd9df] bg-gradient-to-br from-[#fff7f8] to-white p-6 shadow-sm">
      {/* 顶部标题栏 */}
      <button className="flex w-full items-center gap-3 text-left" onClick={onToggleOpen} type="button">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#fe2c55] to-[#ff6b6b] flex items-center justify-center shadow-lg shadow-[#fe2c55]/30">
          <span className="material-icons-round text-white text-xl">smart_display</span>
        </div>
        <div className="flex-1">
          <span className="text-sm font-bold text-gray-800">抖音发布助手</span>
          <span className="block text-xs text-gray-500 mt-0.5">扩展模式 · 真实 IP · 低风控</span>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            extensionInstalled
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {extensionInstalled ? "已启用" : "未启用"}
        </span>
        <span className="material-icons-round text-gray-400 hover:text-gray-600 transition-colors">
          {panelOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {panelOpen ? (
        <div className="mt-4 space-y-3">
          {/* 扩展未安装：显示安装引导 */}
          {!extensionInstalled ? (
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <span className="material-icons-round text-white text-xl">extension</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">需要安装 Chrome 扩展</p>
                  <p className="text-xs text-gray-500 mt-1">扩展模式使用真实 IP，降低封号风险</p>
                </div>
                <button
                  type="button"
                  onClick={onInstallExtension}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 flex items-center gap-2"
                >
                  <span className="material-icons-round text-sm">download</span>
                  一键安装
                </button>
              </div>
            </div>
          ) : null}

          {extensionInstalled ? (
            <>
              {/* 账号状态区域 */}
              <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      抖音账号
                      {activeAccountCount > 0 && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {activeAccountCount} 个已登录
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {accounts.length === 0
                        ? "尚未绑定抖音账号，请在扩展弹窗中添加"
                        : `已绑定 ${accounts.length} 个账号`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onConfigExtension}
                    className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-xs font-medium text-white hover:from-indigo-600 hover:to-purple-600 transition-all"
                  >
                    一键配置
                  </button>
                </div>

                {/* 账号列表 */}
                {accounts.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {accounts.map((account) => (
                      <label
                        key={account.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                          selectedAccountId === account.id
                            ? "border-[#fe2c55]/40 bg-[#fff0f3]"
                            : "border-gray-200 bg-gray-50 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="douyin-account"
                          value={account.id}
                          checked={selectedAccountId === account.id}
                          onChange={() => onSelectedAccountChange(account.id)}
                          className="sr-only"
                        />
                        <span
                          className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                            selectedAccountId === account.id
                              ? "border-[#fe2c55] bg-[#fe2c55]"
                              : "border-gray-300"
                          }`}
                        >
                          {selectedAccountId === account.id ? (
                            <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                          ) : null}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {account.label}
                          </p>
                          {account.douyinUid ? (
                            <p className="text-[11px] text-gray-400">UID: {account.douyinUid}</p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            account.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : account.status === "expired"
                                ? "bg-red-100 text-red-600"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {account.status === "active"
                            ? "已登录"
                            : account.status === "expired"
                              ? "已过期"
                              : "待登录"}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
                    <span className="material-icons-round text-gray-400 text-2xl">person_add</span>
                    <p className="mt-2 text-xs text-gray-500">点击扩展图标，在弹窗中添加抖音账号</p>
                  </div>
                )}
              </div>

              {/* 话题标签 */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">话题标签（逗号或空格分隔）</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(event) => onTagsChange(event.target.value)}
                  placeholder="穿搭, OOTD, 时尚"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* 描述挂链接 */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {usingProductCard ? "描述挂链接（已挂小黄车时将默认忽略）" : "描述挂链接（附加到描述末尾，最稳定）"}
                </label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(event) => onLinkUrlChange(event.target.value)}
                  placeholder="https://your-shop.com/product"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* 商品链接卡片 */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">商品链接卡片（需账号权限）</label>
                <input
                  type="text"
                  value={productLink}
                  onChange={(event) => onProductLinkChange(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
                {usingProductCard ? (
                  <>
                    <label className="mb-1 mt-2 block text-xs text-gray-500">商品短标题（必填，最多 10 个字）</label>
                    <input
                      type="text"
                      value={productTitle}
                      onChange={(event) => onProductTitleChange(event.target.value.slice(0, 10))}
                      placeholder="填写商品短标题"
                      maxLength={10}
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
                        productTitle.trim().length > 0 ? "border-gray-300" : "border-amber-300 bg-amber-50/60"
                      }`}
                    />
                  </>
                ) : null}
              </div>

              {/* 发布时间 */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">发布时间</label>
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onScheduleModeChange("now")}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      scheduleMode === "now"
                        ? "bg-[#fe2c55] text-white"
                        : "border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    立即发布
                  </button>
                  <button
                    type="button"
                    onClick={() => onScheduleModeChange("scheduled")}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      scheduleMode === "scheduled"
                        ? "bg-[#fe2c55] text-white"
                        : "border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    定时发布
                  </button>
                </div>
                {scheduleMode === "scheduled" ? (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(event) => onScheduleDateChange(event.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(event) => onScheduleTimeChange(event.target.value)}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ) : null}
              </div>

              {/* 选项 */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={uploadCover}
                  onChange={(event) => onUploadCoverChange(event.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary/20"
                />
                <span className="text-xs text-gray-500">上传封面（实验性）</span>
              </label>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={aiGeneratedDeclaration}
                  onChange={(event) => onAiGeneratedDeclarationChange(event.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary/20"
                />
                <span className="text-xs text-gray-500">
                  <span className="block text-gray-700">声明内容由 AI 生成</span>
                </span>
              </label>

              {/* 发布状态 */}
              {publishStatus ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    publishStatus === "completed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : publishStatus === "failed"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                  }`}
                >
                  <span className="font-bold">
                    {publishStatus === "pending" && "等待中..."}
                    {publishStatus === "running" && "发布中..."}
                    {publishStatus === "completed" && "发布成功"}
                    {publishStatus === "failed" && "发布失败"}
                  </span>
                  {publishMessage ? <span className="ml-2">{publishMessage}</span> : null}
                  {publishJobId ? <span className="ml-2 text-[11px] opacity-80">任务：{publishJobId}</span> : null}
                  {publishLogs.length > 0 ? (
                    <div className="mt-2 space-y-1 text-[11px] text-current/80">
                      {publishLogs.slice(-3).map((line, index) => (
                        <div key={`${index}-${line}`} className="truncate">
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {publishDetail ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
                  {publishDetail}
                </pre>
              ) : null}
              {publishScreenshot ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-[11px] text-red-700">超时/失败诊断截图</p>
                  <a
                    href={publishScreenshot}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-700 hover:underline"
                  >
                    打开原图
                    <span className="material-icons-round text-sm">open_in_new</span>
                  </a>
                </div>
              ) : null}

              {/* 发布按钮 */}
              <Button
                onClick={onPublish}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border-none bg-[#fe2c55] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#fe2c55]/20 transition-all hover:bg-[#e5274d]"
                disabled={
                  isSubmitting ||
                  !hasDeliveryPayload ||
                  !readyToPublish ||
                  publishStatus === "pending" ||
                  publishStatus === "running"
                }
              >
                <span className="material-icons-round text-base">upload</span>
                {publishStatus === "failed"
                  ? "重试发布到抖音"
                  : scheduleMode === "scheduled"
                    ? "定时发布到抖音"
                    : "发布到抖音"}
              </Button>
              {!readyToPublish ? (
                <p className="text-[11px] text-amber-700">
                  {accounts.length === 0
                    ? "请先在扩展中添加抖音账号"
                    : "请选择一个已登录的抖音账号"}
                </p>
              ) : null}

              {/* 发布历史 */}
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <button type="button" onClick={onTogglePublishHistory} className="flex w-full items-center justify-between text-left">
                  <div>
                    <p className="text-xs font-bold text-gray-700">发布历史</p>
                    <p className="text-[11px] text-gray-500">最近任务和诊断结果</p>
                  </div>
                  <span className="material-icons-round text-sm text-gray-400">
                    {showPublishHistory ? "expand_less" : "history"}
                  </span>
                </button>
                {showPublishHistory ? (
                  <div className="mt-3 space-y-2">
                    {publishHistory.length > 0 ? (
                      publishHistory.slice(0, 5).map((job) => (
                        <div key={job.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gray-800">{job.status}</span>
                            <span className="text-gray-400">{formatTimestamp(job.createdAt)}</span>
                          </div>
                          <p className="mt-1 break-all text-gray-500">{job.id}</p>
                          {job.result?.message ? <p className="mt-1 text-gray-600">{job.result.message}</p> : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-gray-500">当前项目还没有抖音发布记录。</p>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
