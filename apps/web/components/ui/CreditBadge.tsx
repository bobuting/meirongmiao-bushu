/**
 * CreditBadge - 积分标识组件
 * 优雅美观的积分角标系统，含硬币图标、渐变、微光效
 */
import React from "react";

export interface CreditBadgeProps {
  /** 积分数值 */
  amount: number;
  /** 是否显示"积分"文字，默认 true */
  showLabel?: boolean;
  /** 尺寸变体 */
  variant?: "pill" | "badge" | "inline" | "display";
  /** 是否添加微光动画（用于吸引注意） */
  shimmer?: boolean;
  /** 深色背景模式（badge 角标用于深色表面时） */
  dark?: boolean;
  /** 额外 className */
  className?: string;
}

/**
 * 纯 CSS 硬币图标（不依赖 material-icons）
 */
function CoinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="url(#coinGrad)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.9)" fontFamily="system-ui">¥</text>
      <defs>
        <linearGradient id="coinGrad" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * 纯 CSS 钻石图标（用于 display 变体）
 */
function DiamondIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 2L2 10l10 12L22 10L12 2z" fill="url(#diamGrad)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      <path d="M2 10h20" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      <path d="M12 2l-3.5 8h7L12 2z" fill="rgba(255,255,255,0.15)" />
      <defs>
        <linearGradient id="diamGrad" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * 微光动画样式（只注入一次）
 */
function injectShimmerStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("credit-badge-shimmer")) return;
  const style = document.createElement("style");
  style.id = "credit-badge-shimmer";
  style.textContent = `
    @keyframes credit-shimmer {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(1.04); }
    }
    @keyframes credit-glow {
      0%, 100% { box-shadow: 0 0 6px rgba(249, 115, 22, 0.3); }
      50% { box-shadow: 0 0 12px rgba(249, 115, 22, 0.55); }
    }
    @keyframes credit-coin-spin {
      0% { transform: rotateY(0deg); }
      100% { transform: rotateY(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 积分标识组件
 */
export const CreditBadge: React.FC<CreditBadgeProps> = React.memo(
  ({ amount, showLabel = true, variant = "pill", shimmer = false, dark = false, className = "" }) => {
    React.useEffect(() => {
      if (shimmer) injectShimmerStyle();
    }, [shimmer]);

    const animStyle = shimmer
      ? { animation: "credit-shimmer 2.5s ease-in-out infinite, credit-glow 2.5s ease-in-out infinite" }
      : undefined;

    // ---- Variant: pill ----
    // 用于主按钮内联（Step2 定妆生成等）
    if (variant === "pill") {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-100 ${className}`}
          style={animStyle}
        >
          <CoinIcon size={12} />
          <span>{amount}{showLabel ? "积分" : ""}</span>
        </span>
      );
    }

    // ---- Variant: badge ----
    // 圆角方块角标：硬币图标 + 数字，直观表达积分消耗
    // dark=true 用于深色表面（视频卡片等）
    if (variant === "badge") {
      const badgeBase = "absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 rounded-md text-[10px] font-bold px-1 py-0.5 whitespace-nowrap pointer-events-none tabular-nums";
      const badgeTheme = dark
        ? "bg-gray-800/90 border border-amber-500/30 text-amber-300"
        : "bg-amber-50 border border-amber-200 text-amber-800";
      return (
        <span className={`${badgeBase} ${badgeTheme} ${className}`}>
          <CoinIcon size={12} />
          <span className="leading-none">{amount}</span>
        </span>
      );
    }

    // ---- Variant: inline ----
    // 用于行内文本（"45积分，约28秒" 等 tooltip 内容）
    if (variant === "inline") {
      return (
        <span className={`inline-flex items-center gap-1 font-semibold text-orange-500 ${className}`}>
          <CoinIcon size={13} />
          <span>{amount}{showLabel ? "积分" : ""}</span>
        </span>
      );
    }

    // ---- Variant: display ----
    // 用于大数字展示（Profile 页面、用户下拉面板等）
    return (
      <span
        className={`inline-flex items-center gap-2 ${className}`}
        style={animStyle}
      >
        <DiamondIcon size={24} />
        <span className="text-2xl font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 bg-clip-text text-transparent">
          {amount}
        </span>
        {showLabel && (
          <span className="text-sm font-medium text-gray-500">积分</span>
        )}
      </span>
    );
  },
);

CreditBadge.displayName = "CreditBadge";
