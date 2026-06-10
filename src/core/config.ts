import type { AppConfig } from "../contracts/types.js";

export const DEFAULT_CONFIG: AppConfig = {
  videoMusicEnabled: true,
  videoMusicAllowedAtmospheres: "欢快,阳光,动感,浪漫,轻松,空灵",
  videoMusicDefaultAtmospheres: "轻松,阳光",
  videoMusicPathPrefix: "data/video-music",
  videoMusicPublicBaseUrl: "/video-music",
  videoMusicVisitUrl: "",
  lockoutAttempts: 5,
  lockoutMinutes: 15,
  sessionTtlHours: 72, // 会话有效期 3 天（72 小时）
  sessionAutoRenewMinutesBeforeExpiry: 30, // 距过期 30 分钟内自动续期
  scriptMaxDurationSec: 90,
  mockCreditDefault: 100000,
  creditValidityDays: 60,
  providerErrorLogRetentionDays: 10,
  reverseFetchStageOrder: "",
  reverseExternalApiPriority: "",
  apifyReverseApiUrl: "https://api.apify.com/v2/acts/apple_yang~douyin-transcripts-scraper/run-sync-get-dataset-items",
  apifyReverseApiToken: "",
  tikhubVideoHotApiUrl: "https://api.tikhub.io/api/v1/douyin/billboard/fetch_hot_total_low_fan_list",
  tikhubRealtimeHotApiUrl: "https://api.tikhub.io/api/v1/douyin/billboard/fetch_hot_total_list",
  tikhubReverseApiUrl: "https://api.tikhub.io/api/v1/douyin/web/fetch_video_high_quality_play_url",
  tikhubApiToken: "",
  anytocopyReverseApiUrl: "",
  anytocopyReverseApiToken: "",
  anytocopyEnabled: false,
  douhotVideoHotApiUrl: "https://douhot.douyin.com/douhot/v1/hotspot/list",
  douyinHotHubRealtimeUrl: "https://raw.githubusercontent.com/lonnyzhang423/douyin-hot-hub/main/README.md",
  hotTrendRealtimeTopN: 20,
  hotTrendVideoTopN: 20,
  hotTrendRealtimeSyncIntervalHours: 2,
  hotTrendVideoSyncIntervalHours: 12,
  hotTrendVideoDateWindowHours: 24,
  hotTrendPromptVersion: "ht-v2026.03.14-r1",
  hotTrendDailyReportEnabled: true,
  hotTrendDailyReportHour: 2,  // 凌晨 2 点生成
  squareCreatorDiscoveryEnabled: false,
  squareCreatorDiscoveryHour: 2,
  squareTemplateAutoPublishEnabled: false,
  squareTemplateAutoPublishHour: 3,
  adminLlmDebugBubbleEnabled: true,
  // 图片下载超时时间（毫秒），AI 生成图片后从外部 URL 下载的超时时间
  imageDownloadTimeoutMs: 120_000, // 120 秒
  // 视频下载超时时间（毫秒），从外部 URL 下载视频文件的超时时间
  videoDownloadTimeoutMs: 300_000, // 300 秒
  // 音乐下载超时时间（毫秒），从外部 URL 下载音频文件的超时时间
  audioDownloadTimeoutMs: 120_000, // 120 秒

  // ========== OSS 上传配置 ==========
  ossEndpoint: "",
  ossRegion: "",
  ossAccessKeyId: "",
  ossSecretAccessKey: "",
  ossBucketName: "",
  ossForcePathStyle: true,
  ossPublicBaseUrl: "",
};
