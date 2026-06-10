// OSS 公开访问 URL（加载动画视频）
const STEP2_LOADING_VIDEO_OSS_URL = "https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/storage/media/loading/loading.mp4";

export const STEP2_CANDIDATE_RUNTIME_STATE_VERSION = "AT32-17.v1";

export const STEP2_LOADING_VIDEO_BASELINE = {
  src: STEP2_LOADING_VIDEO_OSS_URL,
  durationSec: 8.966667,
  fps: 30,
  width: 780,
  height: 780,
} as const;

export interface Step2CandidateRuntimeInput {
  generationStatus: "pending" | "ready" | "failed";
  startedAtMs?: number | null;
  backendProgressPercent?: number | null;
  nowMs: number;
}

export interface Step2CandidateRuntimeState {
  version: string;
  percent: number;
  statusText: string;
  showLoadingVideo: boolean;
  loadingVideoSrc: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeBackendProgress(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return clamp(Math.floor(value), 0, 100);
}

function computeSyntheticPendingPercent(startedAtMs: number | null | undefined, nowMs: number): number {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return 8;
  }
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const ratio = 1 - Math.exp(-elapsedMs / (STEP2_LOADING_VIDEO_BASELINE.durationSec * 1000));
  return clamp(Math.floor(8 + ratio * 84), 8, 92);
}

export function resolveStep2CandidateRuntimeState(input: Step2CandidateRuntimeInput): Step2CandidateRuntimeState {
  const backendProgress = normalizeBackendProgress(input.backendProgressPercent);
  if (input.generationStatus === "ready") {
    return {
      version: STEP2_CANDIDATE_RUNTIME_STATE_VERSION,
      percent: 100,
      statusText: "已就绪",
      showLoadingVideo: false,
      loadingVideoSrc: null,
    };
  }

  if (input.generationStatus === "failed") {
    const percent = backendProgress !== null ? clamp(backendProgress, 1, 95) : computeSyntheticPendingPercent(input.startedAtMs, input.nowMs);
    return {
      version: STEP2_CANDIDATE_RUNTIME_STATE_VERSION,
      percent: clamp(percent, 1, 95),
      statusText: "失败",
      showLoadingVideo: false,
      loadingVideoSrc: null,
    };
  }

  const percent = backendProgress !== null ? clamp(backendProgress, 1, 99) : computeSyntheticPendingPercent(input.startedAtMs, input.nowMs);
  return {
    version: STEP2_CANDIDATE_RUNTIME_STATE_VERSION,
    percent,
    statusText: "生成中",
    showLoadingVideo: true,
    loadingVideoSrc: STEP2_LOADING_VIDEO_BASELINE.src,
  };
}

export function assertStep2CandidateRuntimeStateContract(): {
  version: string;
  loadingVideoSrc: string;
  failedNeverHits100: boolean;
} {
  return {
    version: STEP2_CANDIDATE_RUNTIME_STATE_VERSION,
    loadingVideoSrc: STEP2_LOADING_VIDEO_BASELINE.src,
    failedNeverHits100: true,
  };
}
