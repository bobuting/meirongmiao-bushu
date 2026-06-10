import React, { useState, useCallback, useRef } from "react";

interface CopyableTextProps {
  text: string;
  /** 复制到剪贴板的文本，默认与 text 相同；可单独指定以实现"显示标签、复制原始值" */
  copyText?: string;
  className?: string;
}

/**
 * 可复制文本组件 — 点击即复制，显示短暂成功提示
 * copyText 可独立指定：界面显示 text，剪贴板写入 copyText
 */
export const CopyableText: React.FC<CopyableTextProps> = ({ text, copyText, className = "" }) => {
  const clipboardValue = copyText ?? text;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(clipboardValue);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板 API 不可用时静默失败
    }
  }, [clipboardValue]);

  return (
    <span
      className={`cursor-pointer group relative inline-flex items-center ${className}`}
      onClick={handleCopy}
      title={`点击复制: ${clipboardValue}`}
    >
      {text}
      {copied ? (
        <span className="ml-1 text-emerald-500 text-xs font-normal">已复制</span>
      ) : (
        <svg
          className="ml-1 w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
};
