/**
 * 分享弹窗组件
 * 用于生成分享链接和二维码
 */

import { useState, useEffect, useRef } from "react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  title?: string;
  description?: string;
  tipText?: string;
}

export function ShareModal({
  isOpen,
  onClose,
  shareUrl,
  title = "分享作品",
  description = "将成片视频分享给好友观看",
  tipText = "无需登录即可观看，包含成片视频和裂变作品",
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 重置复制状态
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAndOpen = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.open(shareUrl, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[420px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部装饰条 */}
        <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-500" />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 内容区 */}
        <div className="p-6">
          {/* 标题 */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0l6.632 3.316m0 0l-6.632 3.316m0 0l6.632 3.316M9 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">{description}</p>
            </div>
          </div>

          {/* 提示文案 */}
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-blue-800 font-medium mb-1">公开分享链接</p>
                <p className="text-xs text-blue-600/80">{tipText}</p>
              </div>
            </div>
          </div>

          {/* 链接区域 */}
          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 mb-2 block">分享链接</label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 font-mono focus:outline-none pr-20"
              />
              <button
                onClick={handleCopy}
                className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    已复制
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    复制
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 二维码区域 */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <span className="text-xs text-gray-400 font-medium">或扫码分享</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            </div>
            <div className="flex items-center justify-center gap-6 p-5 rounded-2xl bg-gradient-to-br from-blue-50/80 to-cyan-50/60 border border-blue-100/50 relative overflow-hidden">
              {/* 背景光效 */}
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-radial from-blue-200/30 to-transparent blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-gradient-radial from-cyan-200/20 to-transparent blur-xl" />

              {/* 二维码 */}
              <div className="relative">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-blue-400/40 to-cyan-400/30 blur-sm opacity-70" />
                <div className="relative w-[120px] h-[120px] bg-white rounded-xl shadow-lg shadow-blue-100/50 p-3 flex items-center justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=1e40af&margin=0`}
                    alt="分享二维码"
                    className="w-full h-full object-contain rounded-md"
                  />
                </div>
              </div>

              {/* 说明 */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11v2m-6-10a4 4 0 11-8 0 4 4 0 018 0zM8 20v2m8-2v2M4 8h2m12 0h2M4 16h2m12 0h2" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">手机扫码</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">打开微信或相机<br/>扫描二维码分享</p>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors"
            >
              关闭
            </button>
            <button
              onClick={handleCopyAndOpen}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              复制并打开
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
