/**
 * 全局进度提示层组件
 * 用于在生成搭配、脚本、视频等场景中显示全局进度状态
 * z-index 设为 100，高于所有现有弹出框，确保始终可见
 *
 * 支持两种变体模式：
 * - 'global'（默认）：fixed 定位在页面顶部
 * - 'inline'：相对定位，嵌入在其他区域内部
 */

import React from "react";

export interface GlobalProgressIndicatorProps {
  /** 进度条定位模式：'global' 为全局 fixed，'inline' 为相对定位 */
  variant?: "global" | "inline";
  /** 是否显示进度指示器 */
  visible: boolean;
  /** 进度标题（如"AI 正在分析搭配方案..."） */
  title: string;
  /** 进度百分比（0-100），默认 60 */
  progress?: number;
  /** 阶段提示文字（如"正在分析服装风格..."） */
  hint?: string;
  /** 取消按钮回调（可选） */
  onCancel?: () => void;
}

/** 阶段图标映射 */
const STAGE_ICONS: Record<string, string> = {
  capturing: "videocam",
  understanding: "psychology",
  adapting: "checkroom",
  generating: "movie_creation",
};

export const GlobalProgressIndicator: React.FC<GlobalProgressIndicatorProps> = ({
  variant = "global",
  visible,
  title,
  progress = 60,
  hint,
  onCancel,
}) => {
  if (!visible) {
    return null;
  }

  // 根据提示文字推断当前阶段
  const inferStageFromHint = (hintText: string): string => {
    if (hintText.includes("采集")) return "capturing";
    if (hintText.includes("理解") || hintText.includes("分析")) return "understanding";
    if (hintText.includes("适配") || hintText.includes("换帧")) return "adapting";
    if (hintText.includes("生成") || hintText.includes("视频")) return "generating";
    return "auto_awesome";
  };

  const stageIcon = hint ? (STAGE_ICONS[inferStageFromHint(hint)] || "auto_awesome") : "auto_awesome";

  // 全局模式：fixed 定位在头部下方，居中显示，不占满横屏
  // 内嵌模式：相对定位，嵌入在其他区域
  const isGlobal = variant === "global";

  return (
    <div
      data-testid="global-progress-indicator"
      className={
        isGlobal
          ? "fixed top-16 left-1/2 -translate-x-1/2 z-[100] animate-slide-down"
          : "relative rounded-lg bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20"
      }
    >
      <div
        className={
          isGlobal
            ? "flex items-center gap-4 px-5 py-3 rounded-xl bg-gradient-to-r from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-md text-white shadow-lg border border-white/10"
            : "flex items-center gap-4 h-10 px-4 rounded-lg bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 text-gray-800"
        }
      >
        {/* 左侧：动态图标 + 标题 */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={
              isGlobal
                ? "flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 shadow-md"
                : "flex items-center justify-center w-8 h-8 rounded-full bg-primary/20"
            }
          >
            <span
              className={
                isGlobal
                  ? "material-icons-round text-white text-lg animate-pulse"
                  : "material-icons-round text-primary text-lg animate-pulse"
              }
            >
              {stageIcon}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className={`text-sm font-semibold truncate ${isGlobal ? "text-white" : "text-gray-800"}`}>
              {title}
            </span>
            {hint && (
              <span className={`text-xs truncate max-w-[180px] ${isGlobal ? "text-white/60" : "text-gray-500"}`}>
                {hint}
              </span>
            )}
          </div>
        </div>

        {/* 中间：进度条 */}
        <div className={`flex items-center gap-2 ${isGlobal ? "min-w-[120px]" : "flex-1 min-w-0"}`}>
          <div
            className={
              isGlobal
                ? "flex-1 h-2 rounded-full overflow-hidden bg-white/20"
                : "flex-1 h-1.5 rounded-full overflow-hidden bg-gray-200"
            }
          >
            <div
              className={
                isGlobal
                  ? "h-full rounded-full bg-gradient-to-r from-primary via-purple-500 to-pink-500 animate-shimmer transition-all duration-500"
                  : "h-full rounded-full bg-gradient-to-r from-primary to-purple-500 animate-shimmer transition-all duration-300"
              }
              style={{ width: `${progress}%` }}
            />
          </div>
          <span
            className={`text-xs font-medium tabular-nums shrink-0 ${isGlobal ? "text-white/80" : "text-gray-500"}`}
          >
            {progress}%
          </span>
        </div>

        {/* 右侧：取消按钮（可选） */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={
              isGlobal
                ? "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-white/60 hover:text-white hover:bg-white/10"
                : "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }
            title="取消"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        )}
      </div>
    </div>
  );
};