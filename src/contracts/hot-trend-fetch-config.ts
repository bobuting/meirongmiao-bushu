export type HotTrendType = "realtime" | "video";

export interface HotTrendSourceContract {
  readonly type: HotTrendType;
  readonly source: string;
  readonly intervalMs: number;
}

export interface VideoHotTrendFetchContract extends HotTrendSourceContract {
  readonly type: "video";
  readonly pageSize: 55;
  readonly expectedTopicCount: 50;
  readonly minimumPassTopicCount: 31;
  readonly page: 1;
  readonly dateWindow: 24;
  readonly timeoutMs: 120_000;
}

export const HOT_TREND_SOURCE_CONTRACT: readonly HotTrendSourceContract[] = [
  {
    type: "realtime",
    source: "github:douyin-hot-hub",
    intervalMs: 2 * 60 * 60 * 1000,
  },
  {
    type: "video",
    source: "tikhub:fetch_hot_total_low_fan_list",
    intervalMs: 12 * 60 * 60 * 1000,
  },
] as const;

export const VIDEO_HOT_TREND_FETCH_CONTRACT: VideoHotTrendFetchContract = {
  type: "video",
  source: "tikhub:fetch_hot_total_low_fan_list",
  intervalMs: 12 * 60 * 60 * 1000,
  pageSize: 55,
  expectedTopicCount: 50,
  minimumPassTopicCount: 31,
  page: 1,
  dateWindow: 24,
  timeoutMs: 120_000,
};

export interface HotTrendRuntimeConfigInput {
  readonly realtimeSource: string;
  readonly videoSource: string;
  readonly realtimeIntervalMs: number;
  readonly videoIntervalMs: number;
  readonly videoPageSize: number;
  readonly videoPage: number;
  readonly videoDateWindow: number;
  readonly videoTimeoutMs: number;
}

export function isHotTrendRuntimeConfigCompliant(input: HotTrendRuntimeConfigInput): boolean {
  return (
    input.realtimeSource === HOT_TREND_SOURCE_CONTRACT[0].source &&
    input.videoSource === VIDEO_HOT_TREND_FETCH_CONTRACT.source &&
    input.realtimeIntervalMs === HOT_TREND_SOURCE_CONTRACT[0].intervalMs &&
    input.videoIntervalMs === VIDEO_HOT_TREND_FETCH_CONTRACT.intervalMs &&
    input.videoPageSize === VIDEO_HOT_TREND_FETCH_CONTRACT.pageSize &&
    input.videoPage === VIDEO_HOT_TREND_FETCH_CONTRACT.page &&
    input.videoDateWindow === VIDEO_HOT_TREND_FETCH_CONTRACT.dateWindow &&
    input.videoTimeoutMs === VIDEO_HOT_TREND_FETCH_CONTRACT.timeoutMs
  );
}

export const HOT_TREND_FETCH_CONFIG_CONTRACT_VERSION = "N23-R5-04.v5";
