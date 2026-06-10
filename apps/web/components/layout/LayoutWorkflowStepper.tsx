import React from "react";
import type { LayoutWorkflowStep } from "./layoutNavigationController";

interface LayoutWorkflowStepperProps {
  currentStep: number;
  steps: LayoutWorkflowStep[];
}

export const LayoutWorkflowStepper: React.FC<LayoutWorkflowStepperProps> = ({
  currentStep,
  steps,
}) => {
  const totalSteps = Math.max(1, steps.length);
  const currentStepLabel = steps.find((step) => step.id === currentStep)?.label ?? steps[0]?.label ?? "";
  const mobileProgressPercent =
    totalSteps <= 1 ? 100 : Math.max(0, Math.min(100, ((currentStep - 1) / (totalSteps - 1)) * 100));

  return (
    <div className="absolute left-1/2 -translate-x-1/2">
      {/* 桌面端 Stepper */}
      <div className="hidden md:flex items-center rounded-full border border-gray-200/80 bg-white/95 backdrop-blur-sm px-5 py-2 shadow-sm">
        <div className="flex items-center gap-1">
          {steps.map((step, index) => {
            const isCurrent = step.id === currentStep;
            const isPast = step.id < currentStep;
            const isOptional = step.optional === true;
            const isOptionalReached = isOptional && step.id <= currentStep;

            // 圆圈样式：可选步骤用虚线边框，到达后变实线
            const stepCircleClass = isOptional
              ? isOptionalReached
                ? "bg-gradient-to-br from-primary to-orange-500 text-white shadow-md shadow-primary/25 border-dashed"
                : "border-dashed border-gray-300 bg-gray-50/50 text-gray-400"
              : isCurrent
                ? "bg-gradient-to-br from-primary to-orange-500 text-white shadow-md shadow-primary/25"
                : isPast
                  ? "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-600"
                  : "border-gray-200 bg-gray-50 text-gray-400";

            return (
              <React.Fragment key={step.id}>
                {/* 连接线：可选步骤前的连接线用虚线 */}
                {index > 0 && (
                  isOptional && !isOptionalReached
                    ? <div className="w-6 shrink-0 border-t-2 border-dashed border-gray-300" aria-hidden="true" />
                    : <div className={`h-[3px] w-10 shrink-0 rounded-full transition-all duration-300 ${
                        step.id <= currentStep
                          ? "bg-gradient-to-r from-orange-300 to-primary/60"
                          : "bg-gray-200"
                      }`} aria-hidden="true" />
                )}
                {/* 步骤圆圈 */}
                <div
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-all duration-300 ${stepCircleClass}`}
                >
                  {isPast && !isOptional ? (
                    <span className="text-[13px] leading-none">✓</span>
                  ) : (
                    step.id
                  )}
                </div>
                {/* 当前步骤标签 */}
                {isCurrent && (
                  <span className={`ml-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                    isOptional
                      ? "bg-primary/10 text-primary"
                      : "bg-gradient-to-r from-primary/10 to-orange-50 text-primary"
                  }`}>
                    {step.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 移动端 Stepper */}
      <div className="md:hidden flex w-[220px] flex-col items-center justify-center">
        <div className="relative w-full px-1">
          <div className="absolute left-[10px] right-[10px] top-1/2 h-px -translate-y-1/2 bg-gray-200" />
          <div
            className="absolute left-[10px] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-orange-300 to-primary transition-all duration-300"
            style={{ width: `calc((100% - 20px) * ${mobileProgressPercent / 100})` }}
          />
          <div className="relative flex items-center justify-between">
            {steps.map((step) => {
              const isPastOrCurrent = step.id <= currentStep;
              const isCurrent = step.id === currentStep;
              const isOptional = step.optional === true;
              return (
                <div
                  key={`mobile-step-${step.id}`}
                  className={`h-2.5 w-2.5 rounded-full border transition-all ${
                    isOptional && !isPastOrCurrent
                      ? "border-dashed border-gray-300 bg-white"
                      : isCurrent
                        ? "border-primary bg-primary shadow-sm shadow-primary/30"
                        : isPastOrCurrent
                          ? "border-primary/60 bg-primary/40"
                          : "border-gray-300 bg-white"
                  }`}
                />
              );
            })}
          </div>
        </div>
        <span className="mt-1 max-w-[160px] truncate text-[10px] font-semibold text-gray-700 text-center leading-tight">
          {currentStepLabel}
        </span>
      </div>
    </div>
  );
};
