/**
 * 扩展发布面板
 * 独立于服务端自动化的 Step5DouyinPublishPanel，用于 Chrome 扩展发布
 */

import React from "react";
import { Button } from "../../../components/ui/Button";
import { useDouyinExtension, getExtensionInstallUrl } from "../../../hooks/useDouyinExtension";

interface ExtDouyinPublishPanelProps {
  videoUrl: string;
  title: string;
  tags: string[];
  coverImageUrl?: string | null;
  onPublishSuccess?: () => void;
  onPublishError?: (error: string) => void;
}

export const ExtDouyinPublishPanel: React.FC<ExtDouyinPublishPanelProps> = ({
  videoUrl,
  title,
  tags,
  coverImageUrl,
  onPublishSuccess,
  onPublishError,
}) => {
  const { status, isLoading, progress, requestPublish, refresh } = useDouyinExtension();
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);
  const [accounts, setAccounts] = React.useState<Array<{
    id: string;
    label: string;
    status: string;
  }>>([]);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [projectId, setProjectId] = React.useState<string>("");

  // 加载账号列表
  React.useEffect(() => {
    if (!status.installed) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("/neirongmiao/api/ext/douyin/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.code === "SUCCESS") {
          setAccounts(data.data);
          if (data.data.length > 0 && !selectedAccountId) {
            setSelectedAccountId(data.data[0].id);
          }
        }
      })
      .catch(console.error);
  }, [status.installed]);

  // 获取当前项目 ID
  React.useEffect(() => {
    const match = window.location.pathname.match(/\/project\/([^/]+)/);
    if (match) {
      setProjectId(match[1]);
    }
  }, []);

  const handlePublish = async () => {
    if (!selectedAccountId || !projectId) return;

    setIsPublishing(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("未登录");

      // 创建发布任务
      const res = await fetch("/neirongmiao/api/ext/douyin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          accountId: selectedAccountId,
          videoUrl,
          title,
          tags,
          coverImageUrl,
          publishDate: 0, // 立即发布
        }),
      });

      const data = await res.json();
      if (data.code !== "SUCCESS") {
        throw new Error(data.message || "创建任务失败");
      }

      const jobId = data.data.jobId;

      // 通知扩展执行
      await requestPublish({ projectId, jobId, accountId: selectedAccountId });

      onPublishSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "发布失败";
      onPublishError?.(message);
    } finally {
      setIsPublishing(false);
    }
  };

  // 加载中
  if (isLoading) {
    return (
      <div className="rounded-3xl border border-[#e0e7ff] bg-[#f0f4ff] p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="material-icons-round animate-spin text-base text-indigo-500">refresh</span>
          <span className="text-sm text-gray-600">检测扩展状态...</span>
        </div>
      </div>
    );
  }

  // 扩展未安装
  if (!status.installed) {
    return (
      <div className="rounded-3xl border border-[#e0e7ff] bg-[#f0f4ff] p-5 shadow-sm">
        <button className="flex w-full items-center gap-2 text-left" type="button">
          <span className="material-icons-round text-base text-indigo-500">extension</span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            扩展发布
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            未安装
          </span>
        </button>
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-white/80 p-4">
          <p className="text-sm text-gray-700">
            扩展发布模式使用您的浏览器直接发布到抖音，IP 和指纹都是真实的，风控风险更低。
          </p>
          <a
            href={getExtensionInstallUrl()}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
          >
            安装 Chrome 扩展
          </a>
        </div>
      </div>
    );
  }

  // 扩展已安装，显示发布面板
  return (
    <div className="rounded-3xl border border-[#e0e7ff] bg-[#f0f4ff] p-5 shadow-sm">
      <button className="flex w-full items-center gap-2 text-left" type="button">
        <span className="material-icons-round text-base text-indigo-500">extension</span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
          扩展发布
        </span>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          已连接
        </span>
      </button>

      <div className="mt-4 space-y-3">
        {/* 账号选择 */}
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
          <p className="text-sm font-bold text-gray-800">选择抖音账号</p>
          {accounts.length === 0 ? (
            <div className="mt-2 text-xs text-gray-500">
              暂无绑定账号，请在扩展选项页添加账号
              <button
                type="button"
                onClick={() => chrome.runtime.openOptionsPage?.()}
                className="ml-2 text-indigo-500 hover:underline"
              >
                打开设置
              </button>
            </div>
          ) : (
            <div className="mt-2 grid gap-2">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${
                    selectedAccountId === account.id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="accountId"
                    value={account.id}
                    checked={selectedAccountId === account.id}
                    onChange={() => setSelectedAccountId(account.id)}
                    className="sr-only"
                  />
                  <span
                    className={`h-4 w-4 rounded-full border-2 ${
                      selectedAccountId === account.id
                        ? "border-indigo-500 bg-indigo-500"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedAccountId === account.id ? (
                      <span className="block h-full w-full scale-50 rounded-full bg-white" />
                    ) : null}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{account.label}</span>
                  <span
                    className={`ml-auto text-[11px] font-medium ${
                      account.status === "active"
                        ? "text-emerald-600"
                        : account.status === "expired"
                        ? "text-red-500"
                        : "text-amber-600"
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
          )}
        </div>

        {/* 发布进度 */}
        {progress ? (
          <div className="rounded-2xl border border-indigo-200 bg-white/80 p-4">
            <div className="flex items-center gap-2">
              <span className="material-icons-round animate-spin text-sm text-indigo-500">
                autorenew
              </span>
              <span className="text-sm font-medium text-gray-800">{progress.message}</span>
            </div>
            {progress.progress !== undefined ? (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 发布按钮 */}
        <Button
          onClick={handlePublish}
          disabled={!selectedAccountId || isPublishing || !videoUrl}
          className="w-full"
        >
          {isPublishing ? "发布中..." : "发布到抖音"}
        </Button>

        <p className="text-center text-[11px] text-gray-500">
          扩展将自动打开抖音创作者后台完成发布
        </p>
      </div>
    </div>
  );
};
