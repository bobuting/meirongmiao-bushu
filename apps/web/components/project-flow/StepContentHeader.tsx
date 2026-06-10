import React from "react";

interface StepContentHeaderProps {
  /** 步骤编号 */
  stepNumber: number;
  /** 步骤名称（不含 StepN 前缀） */
  title: string;
  /** Material Icon 名称 */
  icon: string;
  /** 副标题 */
  subtitle?: string;
  /** 操作指南链接（新标签页打开） */
  guideUrl?: string;
  /** 右侧统计徽章 */
  badges?: React.ReactNode;
  /** 右侧控件区 */
  controls?: React.ReactNode;
}

/**
 * 步骤主内容区头部
 * 与 Step4 的 Step4PreviewWorkspaceHeader 视觉风格一致
 */
export const StepContentHeader: React.FC<StepContentHeaderProps> = ({
  stepNumber,
  title,
  icon,
  subtitle,
  guideUrl,
  badges,
  controls,
}) => (
  <div className="px-4 py-4 md:px-8 md:py-6 bg-white border-b border-gray-200 flex flex-row justify-between items-center shrink-0 gap-2">
    <div className="flex items-center gap-3">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-white shadow-sm shadow-primary/20 shrink-0">
        <span className="material-icons-round text-base">{icon}</span>
      </div>
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 font-display">Step {stepNumber}. {title}</h2>
        {subtitle && <p className="text-xs md:text-sm text-gray-500 mt-0.5 flex items-center gap-2">{subtitle}{guideUrl && <a href={guideUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:no-underline"><span className="material-icons-round text-xs">menu_book</span>操作指南</a>}</p>}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {controls}
      {badges && (
        <div className="flex gap-2 text-[10px] md:text-sm text-gray-600 bg-gray-50 px-2 py-1.5 md:px-3 md:py-2 rounded-lg border border-gray-100 shrink-0">
          {badges}
        </div>
      )}
    </div>
  </div>
);
