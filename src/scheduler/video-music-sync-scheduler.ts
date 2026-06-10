/**
 * 视频音乐库定时同步调度器
 * 每日凌晨 1 点从上游地址同步音乐库
 */

import type { Pool } from "pg";
import type { IVideoMusicRepository } from "../contracts/repository-ports/system-repository.js";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { AppConfig } from "../contracts/types.js";
import { syncVideoMusicLibrary } from "../modules/video-music/video-music-service.js";
import { getLogger } from "../core/logger/index.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

const log = getLogger("VideoMusicSyncScheduler");

export class VideoMusicSyncScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly scheduleHour = 1; // 凌晨 1 点
  private static instance: VideoMusicSyncScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly videoMusics: IVideoMusicRepository,
    private readonly clock: IRepositoryClock,
    private readonly config: Pick<AppConfig, "videoMusicEnabled" | "videoMusicVisitUrl" | "videoMusicAllowedAtmospheres" | "videoMusicDefaultAtmospheres" | "videoMusicPathPrefix" | "videoMusicPublicBaseUrl" | "audioDownloadTimeoutMs">,
    private readonly storage: IObjectStorageAdapter | null,
    private readonly ossPublicBaseUrl: string | undefined,
  ) {}

  start(): void {
    if (this.intervalId) {
      log.warn("定时任务已启动，跳过重复启动");
      return;
    }

    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now);
    const delayMs = nextRunTime - now;

    log.info(`启动视频音乐同步任务，下次执行: ${new Date(nextRunTime).toISOString()}`);

    this.intervalId = setTimeout(() => {
      this.executeSync();
      this.setupDailyInterval();
    }, delayMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("视频音乐同步任务已停止");
    }
  }

  private async executeSync(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.VIDEO_MUSIC_SYNC);
    if (!lockId) return;

    log.info("开始执行视频音乐库同步");
    try {
      const result = await syncVideoMusicLibrary(
        { videoMusics: this.videoMusics, clock: this.clock, config: this.config },
        this.storage,
        this.ossPublicBaseUrl,
      );
      log.info(`视频音乐同步完成：新增 ${result.added.length}，跳过 ${result.skipped}，失败 ${result.failed.length}`);
    } catch (error) {
      log.error({ error: error instanceof Error ? error.message : String(error) }, "视频音乐同步失败");
    } finally {
      await guard.release(lockId);
    }
  }

  private setupDailyInterval(): void {
    this.intervalId = setInterval(() => {
      this.executeSync();
    }, 24 * 60 * 60 * 1000);
  }

  private calculateNextRunTime(now: number): number {
    const date = new Date(now);
    const today1AM = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      this.scheduleHour,
      0, 0, 0
    ).getTime();

    return now >= today1AM ? today1AM + 24 * 60 * 60 * 1000 : today1AM;
  }

  static getInstance(
    pool: Pool,
    videoMusics: IVideoMusicRepository,
    clock: IRepositoryClock,
    config: Pick<AppConfig, "videoMusicEnabled" | "videoMusicVisitUrl" | "videoMusicAllowedAtmospheres" | "videoMusicDefaultAtmospheres" | "videoMusicPathPrefix" | "videoMusicPublicBaseUrl" | "audioDownloadTimeoutMs">,
    storage: IObjectStorageAdapter | null,
    ossPublicBaseUrl: string | undefined,
  ): VideoMusicSyncScheduler {
    if (!VideoMusicSyncScheduler.instance) {
      VideoMusicSyncScheduler.instance = new VideoMusicSyncScheduler(pool, videoMusics, clock, config, storage, ossPublicBaseUrl);
    }
    return VideoMusicSyncScheduler.instance;
  }

  static resetInstance(): void {
    if (VideoMusicSyncScheduler.instance) {
      VideoMusicSyncScheduler.instance.stop();
      VideoMusicSyncScheduler.instance = null;
    }
  }
}
