// OSS 公开访问 URL（加载动画资源）
const STEP2_LOADING_VIDEO_OSS_URL = "https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/storage/media/loading/loading.mp4";
const STEP2_LOADING_POSTER_OSS_URL = "https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/storage/media/loading/loading_contact_sheet.jpg";

export const STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION = "AT35-27.v1";

export const STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC = STEP2_LOADING_VIDEO_OSS_URL;
export const STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC = STEP2_LOADING_POSTER_OSS_URL;

export const STEP2_RUNTIME_PROGRESS_INVARIANTS = [
  "Step2 generated cards must keep data/loading.mp4 as the only loading video source.",
  "Generated cards must not surface synthetic percentages before a real backend progress payload exists.",
  "Blocked or idle candidates must stay visually distinct from an actively generating candidate.",
] as const;

export type Step2RuntimeProgressPhase = "blocked" | "idle" | "generating" | "ready" | "failed";
export type Step2RuntimeProgressMode = "none" | "backend" | "indeterminate";

export interface Step2RuntimeProgressContractState {
  version: string;
  phase: Step2RuntimeProgressPhase;
  statusText: string;
  progressMode: Step2RuntimeProgressMode;
  percent: number | null;
  showLoadingVideo: boolean;
  loadingVideoSrc: string | null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function normalizeBackendPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return clampPercent(value);
}

export function resolveStep2RuntimeProgressContractState(input: {
  dependencyReady: boolean;
  generationStatus: "pending" | "ready" | "failed";
  hasActiveTask: boolean;
  backendProgressPercent?: number | null;
}): Step2RuntimeProgressContractState {
  const backendPercent = normalizeBackendPercent(input.backendProgressPercent);

  // hasActiveTask 为 true 时显示生成中（bridge 已确保只在 generationStatus === "pending" 时为 true）
  if (input.hasActiveTask) {
    return {
      version: STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
      phase: "generating",
      statusText: backendPercent === null ? "生成中" : `生成中 ${Math.min(99, Math.max(1, backendPercent))}%`,
      progressMode: backendPercent === null ? "indeterminate" : "backend",
      percent: backendPercent === null ? null : Math.min(99, Math.max(1, backendPercent)),
      showLoadingVideo: true,
      loadingVideoSrc: STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
    };
  }

  if (input.generationStatus === "ready") {
    return {
      version: STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
      phase: "ready",
      statusText: "已就绪",
      progressMode: "backend",
      percent: 100,
      showLoadingVideo: false,
      loadingVideoSrc: null,
    };
  }

  if (input.generationStatus === "failed") {
    return {
      version: STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
      phase: "failed",
      statusText: "生成失败",
      progressMode: backendPercent === null ? "none" : "backend",
      percent: backendPercent === null ? null : Math.min(99, Math.max(1, backendPercent)),
      showLoadingVideo: false,
      loadingVideoSrc: null,
    };
  }

  // DB 状态为 processing（刷新后运行时元数据丢失但 DB 状态仍在）
  if (input.generationStatus === "pending") {
    return {
      version: STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
      phase: "generating",
      statusText: backendPercent === null ? "生成中" : `生成中 ${Math.min(99, Math.max(1, backendPercent))}%`,
      progressMode: backendPercent === null ? "indeterminate" : "backend",
      percent: backendPercent === null ? null : Math.min(99, Math.max(1, backendPercent)),
      showLoadingVideo: true,
      loadingVideoSrc: STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
    };
  }

  if (!input.dependencyReady) {
    return {
      version: STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
      phase: "blocked",
      statusText: "等待依赖就绪",
      progressMode: "none",
      percent: null,
      showLoadingVideo: false,
      loadingVideoSrc: null,
    };
  }

  return {
    version: STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
    phase: "idle",
    statusText: "待生成",
    progressMode: "none",
    percent: null,
    showLoadingVideo: false,
    loadingVideoSrc: null,
  };
}
