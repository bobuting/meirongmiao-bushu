/**
 * Step3 脚本加载进度条组件（紧凑单行版）
 * 展示三步加载进度：库存精选 → 视频热榜 → 实时热榜
 */

import React from "react";
import type { Step3LoadingStates, LoadingState } from "./useStep3ScriptJobs";
import {
  STRATEGY_TYPE_LABELS,
  STRATEGY_TYPE_SHORT_LABELS,
  STRATEGY_TYPE_ICONS,
} from "../../../utils/strategyTypeLabels";

/**
 * 步骤配置
 */
interface StepConfig {
  key: keyof Step3LoadingStates;
  label: string;
  shortLabel: string;
  icon: string;
}

/** 加载进度步骤配置（从统一标签映射表生成） */
const STEPS: StepConfig[] = [
  { key: "library", label: STRATEGY_TYPE_LABELS.library, shortLabel: STRATEGY_TYPE_SHORT_LABELS.library, icon: STRATEGY_TYPE_ICONS.library },
  { key: "video", label: STRATEGY_TYPE_LABELS.video, shortLabel: STRATEGY_TYPE_SHORT_LABELS.video, icon: STRATEGY_TYPE_ICONS.video },
  { key: "realtime", label: STRATEGY_TYPE_LABELS.realtime, shortLabel: STRATEGY_TYPE_SHORT_LABELS.realtime, icon: STRATEGY_TYPE_ICONS.realtime },
  { key: "effectiveness", label: STRATEGY_TYPE_LABELS.effectiveness, shortLabel: STRATEGY_TYPE_SHORT_LABELS.effectiveness, icon: STRATEGY_TYPE_ICONS.effectiveness },
  { key: "custom", label: STRATEGY_TYPE_LABELS.custom, shortLabel: STRATEGY_TYPE_SHORT_LABELS.custom, icon: STRATEGY_TYPE_ICONS.custom },
  { key: "fashion", label: STRATEGY_TYPE_LABELS.fashion, shortLabel: STRATEGY_TYPE_SHORT_LABELS.fashion, icon: STRATEGY_TYPE_ICONS.fashion },
  { key: "emotion_archetype", label: STRATEGY_TYPE_LABELS.emotion_archetype, shortLabel: STRATEGY_TYPE_SHORT_LABELS.emotion_archetype, icon: STRATEGY_TYPE_ICONS.emotion_archetype },
  { key: "aesthetic", label: STRATEGY_TYPE_LABELS.aesthetic, shortLabel: STRATEGY_TYPE_SHORT_LABELS.aesthetic, icon: STRATEGY_TYPE_ICONS.aesthetic },
  { key: "product_showcase", label: STRATEGY_TYPE_LABELS.product_showcase, shortLabel: STRATEGY_TYPE_SHORT_LABELS.product_showcase, icon: STRATEGY_TYPE_ICONS.product_showcase },
  { key: "story_theme", label: STRATEGY_TYPE_LABELS.story_theme, shortLabel: STRATEGY_TYPE_SHORT_LABELS.story_theme, icon: STRATEGY_TYPE_ICONS.story_theme },
  { key: "resonance", label: STRATEGY_TYPE_LABELS.resonance, shortLabel: STRATEGY_TYPE_SHORT_LABELS.resonance, icon: STRATEGY_TYPE_ICONS.resonance },
];

/**
 * Props 类型
 */
export interface Step3LoadingProgressProps {
  /** 加载状态 */
  loadingState: Step3LoadingStates;
  /** 已加载脚本数量 */
  availableCount?: number;
  /** 是否为刷新操作 */
  isRefreshing?: boolean;
  /** 错误信息 */
  errorMessage?: string | null;
  /** 是否显示 */
  visible?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 完成后是否自动隐藏 */
  autoHide?: boolean;
  /** 自动隐藏延迟（毫秒） */
  autoHideDelay?: number;
  /** 脚本是否已锁定（锁定后才允许隐藏进度条） */
  isScriptLocked?: boolean;
}

/**
 * 获取状态样式（紧凑圆点版）
 */
function getStatusDotStyle(status: LoadingState): string {
  switch (status) {
    case "done":
      return "bg-green-500";
    case "loading":
      return "bg-blue-500 animate-pulse";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
}

/**
 * 获取状态文字颜色
 */
function getStatusTextColor(status: LoadingState): string {
  switch (status) {
    case "done":
      return "text-green-600";
    case "loading":
      return "text-blue-600";
    case "error":
      return "text-red-600";
    default:
      return "text-gray-400";
  }
}

/**
 * Step3 加载进度条组件（紧凑单行版）
 */
export function Step3LoadingProgress({
  loadingState,
  availableCount = 0,
  isRefreshing = false,
  errorMessage,
  visible = true,
  className = "",
  autoHide = true,
  autoHideDelay = 500,
  isScriptLocked = false,
}: Step3LoadingProgressProps): React.ReactElement | null {
  const [hidden, setHidden] = React.useState(false);

  // 计算是否全部完成
  const allDone = Object.values(loadingState).every((s) => s === "done");
  const hasError = Object.values(loadingState).some((s) => s === "error");
  const _isLoading = Object.values(loadingState).some((s) => s === "loading");

  // 自动隐藏逻辑：只有脚本锁定后才允许隐藏
  React.useEffect(() => {
    // 脚本未锁定时，即使全部完成也不隐藏
    if (!isScriptLocked) {
      setHidden(false);
      return;
    }
    // 脚本已锁定，全部完成后延迟隐藏
    if (allDone && autoHide && !isRefreshing) {
      const timer = setTimeout(() => setHidden(true), autoHideDelay);
      return () => clearTimeout(timer);
    }
    setHidden(false);
  }, [allDone, autoHide, autoHideDelay, isRefreshing, isScriptLocked]);

  // 不显示条件：脚本锁定且全部完成且非刷新状态时才隐藏
  if (!visible || (isScriptLocked && hidden && allDone && !isRefreshing)) {
    return null;
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* 左侧：状态文字 */}
      <span className="text-sm text-gray-600 shrink-0">
        {isRefreshing ? "刷新中..." : "加载中..."}
      </span>

      {/* 中间：步骤指示器 */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, index) => (
          <React.Fragment key={step.key}>
            {/* 圆点 + 简短标签 */}
            <div className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${getStatusDotStyle(loadingState[step.key])}`}
                title={step.label}
              />
              <span className={`text-xs ${getStatusTextColor(loadingState[step.key])}`}>
                {step.shortLabel}
              </span>
            </div>

            {/* 连接线 */}
            {index < STEPS.length - 1 && (
              <span
                className={`w-3 h-0.5 rounded ${
                  loadingState[STEPS[index + 1].key] !== "idle" ? "bg-gray-300" : "bg-gray-200"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 右侧：已加载数量 */}
      {availableCount > 0 && (
        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
          {availableCount}
        </span>
      )}

      {/* 错误提示（简化） */}
      {(hasError || errorMessage) && (
        <span className="text-xs text-red-600 shrink-0">
          ⚠️
        </span>
      )}
    </div>
  );
}

/**
 * 刷新按钮组件
 */
export interface Step3RefreshButtonProps {
  onClick: () => void;
  isLoading: boolean;
  isLocked: boolean;
  disabled?: boolean;
  className?: string;
}

export function Step3RefreshButton({
  onClick,
  isLoading,
  isLocked,
  disabled = false,
  className = "",
}: Step3RefreshButtonProps): React.ReactElement {
  if (isLocked) {
    return (
      <button
        disabled
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 rounded cursor-not-allowed ${className}`}
        title="脚本已锁定，无法刷新"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        刷新推荐
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      <svg className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {isLoading ? "正在刷新..." : "刷新推荐"}
    </button>
  );
}