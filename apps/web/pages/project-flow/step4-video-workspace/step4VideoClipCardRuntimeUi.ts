import type { Step4VideoClipStatus } from "./step4VideoJobOrchestrator";

export interface Step4VideoClipCardRuntimeUiModel {
  progressLabel: string;
  progressPercent: number;
  progressBadgeClassName: string;
  shellClassName: string;
  mediaClassName: string;
}

export function buildStep4VideoClipCardRuntimeUi(status: Step4VideoClipStatus): Step4VideoClipCardRuntimeUiModel {
  if (status.status === "completed") {
    return {
      progressLabel: "已生成",
      progressPercent: 100,
      progressBadgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      shellClassName: "border-gray-200/80",
      mediaClassName: "opacity-100",
    };
  }

  if (status.status === "generating") {
    const progressPercent = Math.round(Math.min(95, Math.max(0, status.progress)));
    return {
      progressLabel: `生成中 ${progressPercent}%`,
      progressPercent,
      progressBadgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
      shellClassName: "border-gray-200/80",
      mediaClassName: "opacity-90",
    };
  }

  return {
    progressLabel: "等待生成",
    progressPercent: 0,
    progressBadgeClassName: "border-slate-200 bg-slate-50 text-slate-600",
    shellClassName: "border-gray-200/80",
    mediaClassName: "opacity-85",
  };
}
