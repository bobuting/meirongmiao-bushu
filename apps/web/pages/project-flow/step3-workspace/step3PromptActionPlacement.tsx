import React from "react";

export type Step3PreviewPromptAction = "optimize" | "translate";

export interface Step3PromptActionPlacementProps {
  currentFrameLabel: string;
  loadingAction?: Step3PreviewPromptAction;
  disabled: boolean;
  testIdPrefix?: string;
  optimizeTitle?: string;
  translateTitle?: string;
  onAction: (action: Step3PreviewPromptAction) => void;
}

export const Step3PromptActionPlacement: React.FC<Step3PromptActionPlacementProps> = ({
  loadingAction,
  disabled,
  testIdPrefix = "step3-preview",
  optimizeTitle = "LLM 润色优化",
  translateTitle = "翻译",
  onAction,
}) => {
  const actionsTestId =
    testIdPrefix === "step3-preview" ? "step3-preview-prompt-actions" : `${testIdPrefix}-prompt-actions`;
  const optimizeActionTestId =
    testIdPrefix === "step3-preview" ? "step3-preview-optimize-action" : `${testIdPrefix}-optimize-action`;
  const translateActionTestId =
    testIdPrefix === "step3-preview" ? "step3-preview-translate-action" : `${testIdPrefix}-translate-action`;

  return (
    <div
      data-testid={actionsTestId}
    className="flex items-center gap-2"
  >
    <button
      type="button"
      data-testid={optimizeActionTestId}
      title={optimizeTitle}
      aria-label={optimizeTitle}
      onClick={() => onAction("optimize")}
      disabled={disabled || Boolean(loadingAction)}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-primary/30 hover:bg-orange-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="material-icons-round text-base">
        {loadingAction === "optimize" ? "hourglass_top" : "auto_fix_high"}
      </span>
      <span className="sr-only">{optimizeTitle}</span>
    </button>
    <button
      type="button"
      data-testid={translateActionTestId}
      title={translateTitle}
      aria-label={translateTitle}
      onClick={() => onAction("translate")}
      disabled={disabled || Boolean(loadingAction)}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-primary/30 hover:bg-orange-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="material-icons-round text-base">
        {loadingAction === "translate" ? "hourglass_top" : "translate"}
      </span>
      <span className="sr-only">{translateTitle}</span>
    </button>
  </div>
  );
};
