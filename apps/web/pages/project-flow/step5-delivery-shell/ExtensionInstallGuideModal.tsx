/**
 * 扩展安装教程弹窗组件
 */

import React, { useState } from "react";

interface ExtensionInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  downloadUrl: string;
}

export const ExtensionInstallGuideModal: React.FC<ExtensionInstallGuideModalProps> = ({
  isOpen,
  onClose,
  downloadUrl,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyChromeUrl = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  const steps = [
    {
      step: 1,
      title: "下载扩展 ZIP 包",
      description: "点击上方按钮下载扩展包，ZIP 文件包含所有必需文件。",
      icon: "download",
    },
    {
      step: 2,
      title: "解压 ZIP 文件",
      description: "将下载的 ZIP 文件解压到任意目录（如桌面），确保解压后的文件夹包含 manifest.json 文件。",
      icon: "folder_open",
    },
    {
      step: 3,
      title: "打开 Chrome 扩展管理",
      description: "在 Chrome 浏览器地址栏输入 chrome://extensions 并回车，进入扩展管理页面。",
      icon: "settings",
      action: "chrome://extensions",
    },
    {
      step: 4,
      title: "启用开发者模式",
      description: "在扩展管理页面右上角找到「开发者模式」开关，将其启用。",
      icon: "developer_mode",
    },
    {
      step: 5,
      title: "加载已解压的扩展",
      description: "点击页面左上角「加载已解压的扩展」按钮，在文件选择器中选择刚才解压的文件夹。",
      icon: "upload",
    },
    {
      step: 6,
      title: "确认安装成功",
      description: "扩展列表中应显示「内容喵 · 抖音发布助手」，状态为「已启用」。点击扩展图标进行账号绑定。",
      icon: "check_circle",
    },
  ];

  const tips = [
    '每次启动 Chrome 可能提示「禁用开发者模式扩展」，选择保留即可',
    '扩展更新后需要重新加载：在 chrome://extensions 点击刷新按钮',
    '建议固定扩展图标到工具栏，方便随时查看发布进度',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[680px] max-w-[95vw] bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部装饰条 */}
        <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-500" />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
        >
          <span className="material-icons-round text-gray-500 text-lg">close</span>
        </button>

        {/* 内容区 */}
        <div className="p-8">
          {/* 标题区 */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="material-icons-round text-white text-2xl">extension</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">安装 Chrome 扩展</h3>
              <p className="text-sm text-gray-500 mt-1">按照以下步骤完成安装，即可使用扩展发布功能</p>
            </div>
          </div>

          {/* 下载按钮 */}
          <div className="mb-6 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-800 mb-1">第一步：下载扩展包</p>
                <p className="text-xs text-gray-500">ZIP 文件大小约 500KB，下载后请解压到桌面</p>
              </div>
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
              >
                <span className="material-icons-round text-xl">download</span>
                下载扩展
              </a>
            </div>
          </div>

          {/* 步骤列表 */}
          <div className="space-y-4 mb-6">
            {steps.slice(1).map((step) => (
              <div key={step.step} className="flex items-start gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 hover:border-gray-200 transition-colors">
                {/* 步骤图标 */}
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-indigo-500 text-lg">{step.icon}</span>
                </div>

                {/* 步骤内容 */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                      步骤 {step.step}
                    </span>
                    <span className="text-sm font-bold text-gray-800">{step.title}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{step.description}</p>
                  {step.action && (
                    <button
                      onClick={handleCopyChromeUrl}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
                    >
                      <span className="material-icons-round text-sm">
                        {copied ? "check" : "content_copy"}
                      </span>
                      {copied ? "已复制，请粘贴到地址栏" : "复制链接到地址栏打开"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 提示区 */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-amber-500 text-lg">tips_and_updates</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800 mb-2">💡 安装提示</p>
                <ul className="space-y-1">
                  {tips.map((tip, index) => (
                    <li key={index} className="text-xs text-amber-700 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors"
            >
              关闭
            </button>
            <a
              href="https://neirongmiao.com/docs/ext-douyin-publisher"
              target="_blank"
              rel="noreferrer"
              className="flex-1 px-4 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-base">article</span>
              查看详细文档
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};