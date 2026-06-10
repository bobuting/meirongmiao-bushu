/**
 * 视频音乐同步定时任务初始化模块
 */

import type { AppContext } from "../core/app-context.js";
import type { AppConfig } from "../contracts/types.js";
import { VideoMusicSyncScheduler } from "../scheduler/video-music-sync-scheduler.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SetupVideoMusicSync");

export function setupVideoMusicSync(ctx: AppContext): VideoMusicSyncScheduler | null {
  if (!ctx.store.config.videoMusicEnabled) {
    log.info("视频音乐功能已禁用，跳过启动");
    return null;
  }

  if (!ctx.store.config.videoMusicVisitUrl?.trim()) {
    log.info("视频音乐同步地址未配置，跳过启动");
    return null;
  }

  const config: Pick<AppConfig, "videoMusicEnabled" | "videoMusicVisitUrl" | "videoMusicAllowedAtmospheres" | "videoMusicDefaultAtmospheres" | "videoMusicPathPrefix" | "videoMusicPublicBaseUrl" | "audioDownloadTimeoutMs"> = {
    videoMusicEnabled: ctx.store.config.videoMusicEnabled,
    videoMusicVisitUrl: ctx.store.config.videoMusicVisitUrl,
    videoMusicAllowedAtmospheres: ctx.store.config.videoMusicAllowedAtmospheres,
    videoMusicDefaultAtmospheres: ctx.store.config.videoMusicDefaultAtmospheres,
    videoMusicPathPrefix: ctx.store.config.videoMusicPathPrefix,
    videoMusicPublicBaseUrl: ctx.store.config.videoMusicPublicBaseUrl,
    audioDownloadTimeoutMs: ctx.configService.get().audioDownloadTimeoutMs,
  };

  const scheduler = VideoMusicSyncScheduler.getInstance(
    ctx.pool,
    ctx.repos.videoMusics,
    ctx.clock,
    config,
    ctx.storage,
    ctx.configService.get().ossPublicBaseUrl,
  );

  scheduler.start();
  log.info("视频音乐同步任务已启动（凌晨 1 点执行）");

  return scheduler;
}

export function resetVideoMusicSync(): void {
  VideoMusicSyncScheduler.resetInstance();
}
