/**
 * 模板自动发布调度器
 * 每天凌晨指定时间执行，拉取已发现达人的作品 → 反推脚本 → 自动创建模板
 */

import type { Pool } from "pg";
import type { AppConfig } from "../contracts/types.js";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { getLogger } from "../core/logger/index.js";
import { SquareCreatorTargetService } from "../service/square-creator-target-db-service.js";
import { SquareDiscoveredVideoService } from "../service/square-discovered-video-db-service.js";
import { SquareTemplateService } from "../service/square-template-db-service.js";
import { SquareExecutionLogService } from "../service/square-execution-log-db-service.js";
import { skillLoader } from "../services/skills/index.js";
import { requestLlmPlainTextWithMetadata, resolveRouteProvider } from "../services/llm/llm-transport.js";
import type { AppContext } from "../core/app-context.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";
import { PgSquareCreatorTargetRepository } from "../repositories/pg/square-creator-target-pg-repository.js";
import { PgSquareDiscoveredVideoRepository } from "../repositories/pg/square-discovered-video-pg-repository.js";
import { PgSquareTemplateRepository } from "../repositories/pg/square-template-pg-repository.js";
import { PgSquareExecutionLogRepository } from "../repositories/pg/square-execution-log-pg-repository.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";

const log = getLogger("square-template-auto-publish-scheduler");

/** 每日拉取每个达人的最大作品数 */
const MAX_POSTS_PER_CREATOR = 20;
/** 每日拉取达人的最大数量 */
const MAX_DAILY_CREATORS = 50;
/** 每日反推上限 */
const MAX_DAILY_REVERSE = 10;

/** 视频分镜分析提示词模板代码 */
const PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS = "video_storyboard_analysis";

// ========== 调度器类 ==========

export class SquareTemplateAutoPublishScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private static instance: SquareTemplateAutoPublishScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly repos: PgRepositoryCollection,
    private readonly appConfig: AppConfig,
    private readonly tikhubClient: TikHubClient,
    private readonly storage: IObjectStorageAdapter,
    private readonly ctx: AppContext,
  ) {}

  start(): void {
    if (!this.appConfig.squareTemplateAutoPublishEnabled) {
      log.info("模板自动发布调度器已禁用，跳过启动");
      return;
    }
    if (this.intervalId) {
      log.warn("模板自动发布调度器已启动，跳过重复启动");
      return;
    }

    const scheduleHour = this.appConfig.squareTemplateAutoPublishHour;
    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now, scheduleHour);
    const delayMs = nextRunTime - now;

    log.info({
      scheduleHour,
      nextRunTime: new Date(nextRunTime).toISOString(),
      delayMinutes: Math.round(delayMs / 1000 / 60),
    }, "启动模板自动发布调度器");

    this.intervalId = setTimeout(() => {
      this.executeDailyAutoPublish();
      this.setupDailyInterval();
    }, delayMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("模板自动发布调度器已停止");
    }
  }

  private setupDailyInterval(): void {
    this.intervalId = setInterval(() => {
      this.executeDailyAutoPublish();
    }, 24 * 60 * 60 * 1000);
  }

  private calculateNextRunTime(now: number, hour: number): number {
    const date = new Date(now);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0).getTime();
    return now >= target ? target + 24 * 60 * 60 * 1000 : target;
  }

  static getInstance(
    pool: Pool,
    repos: PgRepositoryCollection,
    appConfig: AppConfig,
    tikhubClient: TikHubClient,
    storage: IObjectStorageAdapter,
    ctx: AppContext,
  ): SquareTemplateAutoPublishScheduler {
    if (!SquareTemplateAutoPublishScheduler.instance) {
      SquareTemplateAutoPublishScheduler.instance = new SquareTemplateAutoPublishScheduler(pool, repos, appConfig, tikhubClient, storage, ctx);
    }
    return SquareTemplateAutoPublishScheduler.instance;
  }

  static getExistingInstance(): SquareTemplateAutoPublishScheduler | null {
    return SquareTemplateAutoPublishScheduler.instance;
  }

  static resetInstance(): void {
    if (SquareTemplateAutoPublishScheduler.instance) {
      SquareTemplateAutoPublishScheduler.instance.stop();
      SquareTemplateAutoPublishScheduler.instance = null;
    }
  }

  /** 手动触发（用于测试） */
  async triggerManualPublish(): Promise<{ pulled: number; reversed: number }> {
    await this.executeDailyAutoPublish();
    return { pulled: this.lastPulled, reversed: this.lastReversed };
  }

  private lastPulled = 0;
  private lastReversed = 0;

  /** 每日模板自动发布主流程 */
  private async executeDailyAutoPublish(): Promise<void> {
    // 多进程防护：分布式锁防止并发执行
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.TEMPLATE_AUTO_PUBLISH);
    if (!lockId) return;

    const logService = new SquareExecutionLogService(new PgSquareExecutionLogRepository(this.pool));

    // 二次防护：检查今天是否已成功执行
    if (await logService.hasSucceededToday("auto_publish")) {
      log.info("今日模板自动发布已成功执行，跳过重复执行");
      await guard.release(lockId);
      return;
    }

    log.info("开始执行模板自动发布");
    const creatorService = new SquareCreatorTargetService(this.repos.squareCreatorTargets);
    const videoService = new SquareDiscoveredVideoService(this.repos.squareDiscoveredVideos);
    const templateService = new SquareTemplateService(this.repos.squareTemplates);

    // 清理上次崩溃残留的 running 记录
    await this.cleanupStaleRunningLogs(logService);

    const logId = await logService.start("auto_publish");

    let totalPulled = 0;
    let totalReversed = 0;
    let succeeded = false;

    try {
      // 阶段 1：拉取达人作品（立即并发转存 OSS，避免 CDN URL 过期）
      const OSS_DOWNLOAD_CONCURRENCY = 5;
      const dueCreators = await creatorService.listDueForSync(MAX_DAILY_CREATORS);
      log.info({ creatorCount: dueCreators.length }, "开始拉取达人作品");

      for (const creator of dueCreators) {
        try {
          const posts = await this.tikhubClient.fetchDouyinUserPosts(creator.secUid, MAX_POSTS_PER_CREATOR);
          log.info({ secUid: creator.secUid, nickname: creator.nickname, postsCount: posts.length }, "拉取达人作品结果");

          // 批量过滤已入库的帖子（减少数据库查询次数）
          const allAwemeIds = posts.map(p => p.awemeId);
          const existingAwemeIds = await videoService.batchCheckAwemeIds(allAwemeIds);
          const newPosts = posts.filter(p => !existingAwemeIds.has(p.awemeId));

          if (newPosts.length > 0) {
            log.info({
              secUid: creator.secUid,
              totalPosts: posts.length,
              newPosts: newPosts.length,
              skipped: posts.length - newPosts.length
            }, "批量去重过滤结果");
          }

          // 分批并发：入库 + 立即转存 OSS
          for (let i = 0; i < newPosts.length; i += OSS_DOWNLOAD_CONCURRENCY) {
            const batch = newPosts.slice(i, i + OSS_DOWNLOAD_CONCURRENCY);
            const batchResults = await Promise.allSettled(
              batch.map(async (post) => {
                // 先入库获取 record.id
                const record = await videoService.insert({
                  awemeId: post.awemeId,
                  creatorTargetId: creator.id,
                  secUid: creator.secUid,
                  videoUrl: post.videoUrl ?? "",
                  coverUrl: post.imageUrls[0] ?? "",
                  description: post.description ?? "",
                  likesCount: post.likesCount ?? 0,
                  commentsCount: post.commentsCount ?? 0,
                  publishTime: post.publishTime ?? 0,
                });

                // 立即下载到 OSS（CDN URL 刚拿到，尚未过期）
                const ossCoverUrl = post.imageUrls[0]
                  ? await this.downloadToOss(post.imageUrls[0], `square/covers/${record.id}.jpg`)
                  : "";
                const ossVideoUrl = post.videoUrl
                  ? await this.downloadToOss(post.videoUrl, `square/videos/${record.id}.mp4`)
                  : "";

                if (!ossCoverUrl && !ossVideoUrl) {
                  throw new Error("封面和视频均转存失败");
                }

                await videoService.updateUrls(record.id, ossCoverUrl, ossVideoUrl);
                log.info({ videoId: record.id, ossVideo: ossVideoUrl ? "yes" : "no" }, "视频转存 OSS 成功");
                return record.id;
              }),
            );

            for (const result of batchResults) {
              if (result.status === "fulfilled") {
                totalPulled++;
              } else {
                const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
                log.error({ error: errorMsg }, "视频入库或 OSS 转存失败");
              }
            }
          }

          await creatorService.updateLastSynced(creator.id);
        } catch (error) {
          log.warn({ secUid: creator.secUid, error: error instanceof Error ? error.message : String(error) }, "拉取达人作品失败");
        }
      }

      // 清理无 OSS URL 的 pending 记录（入库后 OSS 转存失败）
      await this.cleanupPendingWithoutOss();

      // 阶段 2：反推并创建模板（分批并发）
      // 先恢复上次崩溃残留的 reversing 状态
      const stuckReversing = await videoService.listByStatus("reversing", 100);
      if (stuckReversing.length > 0) {
        for (const sv of stuckReversing) {
          await videoService.updateStatus(sv.id, "pending");
        }
        log.info({ count: stuckReversing.length }, "恢复 reversing 残留为 pending");
      }

      // 按达人分散选择 pending 视频（有有效 OSS URL 的），保证候选多样性
      const candidates = await videoService.listByStatusDistributed("pending", MAX_DAILY_REVERSE);
      const CONCURRENCY = 3;

      const processVideo = async (video: { id: string; awemeId: string; description: string; videoUrl: string; coverUrl: string }) => {
        try {
          await videoService.updateStatus(video.id, "reversing");

          if (!video.videoUrl) {
            await videoService.markFailed(video.id, "视频 URL 为空，跳过反推");
            log.warn({ videoId: video.id, awemeId: video.awemeId }, "视频 URL 为空，跳过反推");
            return { success: false, videoId: video.id };
          }

          const reverseScript = await this.reverseVideoToScript(video.description, video.videoUrl);
          // 存储到视频表（已清理 markdown 包裹）
          const cleanScriptText = await videoService.updateReverseResult(video.id, reverseScript, "reversed");

          // 解析 JSON 提取脚本数据字段
          let scriptDataId: string | null = null;
          let templateTitle = "发现视频";
          try {
            const scriptJson = JSON.parse(cleanScriptText);
            const videoInfo = scriptJson?.video_info;
            const videoAnalysis = scriptJson?.video_analysis;

            // 提取标题
            if (videoInfo?.title) {
              templateTitle = videoInfo.title;
            }

            // 存储到 nrm_script_data 表
            scriptDataId = await this.insertScriptData({
              title: templateTitle,
              durationSeconds: videoInfo?.duration_seconds ?? null,
              source: "square_discovery",
              sourceOssUrl: video.videoUrl,
              timeOfDay: videoInfo?.time_of_day ?? null,
              weather: videoInfo?.weather ?? null,
              mainScene: videoInfo?.main_scene ?? null,
              atmosphere: videoAnalysis?.atmosphere ?? null,
              theme: videoInfo?.summary ?? null,
              summary: videoInfo?.summary ?? null,
              primaryEmotion: videoAnalysis?.primary_emotion ?? null,
              videoType: videoInfo?.video_type ?? null,
              videoStyle: videoInfo?.video_style ?? null,
              fashionSuitable: scriptJson?.fashion_placement?.is_suitable ?? null,
              fashionReason: scriptJson?.fashion_placement?.reason ?? null,
              emotionDetail: videoAnalysis?.emotion_detail ?? null,
              onScreenPresence: scriptJson?.on_screen_presence ?? null,
              fashionStyles: scriptJson?.fashion_placement?.recommended_styles ?? null,
              editingAnalysis: videoAnalysis?.editing_analysis ?? null,
              payloadJson: scriptJson,
            });

            // 存储分镜数据到 nrm_shot_breakdown 表
            const shots = scriptJson?.shots ?? [];
            if (shots.length > 0 && scriptDataId) {
              const shotCount = await this.insertShotBreakdown(scriptDataId, shots);
              log.info({ videoId: video.id, scriptDataId, shotCount }, "分镜数据存储成功");
            }

            log.info({ videoId: video.id, scriptDataId, title: templateTitle, shotCount: shots.length }, "脚本数据存储成功");
          } catch (parseError) {
            templateTitle = video.description?.slice(0, 50) || "发现视频";
            log.warn({ videoId: video.id, parseError: parseError instanceof Error ? parseError.message : String(parseError) }, "反推 JSON 解析失败，使用抖音描述");
          }

          const template = await templateService.create({
            title: templateTitle,
            category: "女装",
            author: "系统自动发现",
            coverUrl: video.coverUrl,
            videoUrl: video.videoUrl,
            creatorId: "system",
            reviewStatus: "pending",
            scriptDataId: scriptDataId,
          });

          await videoService.markPublished(video.id, template.id);
          log.info({ videoId: video.id, templateId: template.id, scriptDataId }, "视频反推并创建模板成功");
          return { success: true, videoId: video.id, templateId: template.id };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await videoService.markFailed(video.id, errorMsg);
          log.warn({ videoId: video.id, error: errorMsg }, "视频反推失败");
          return { success: false, videoId: video.id, error: errorMsg };
        }
      };

      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const batch = candidates.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(processVideo));
        const succeededInBatch = batchResults.filter(r => r.success).length;
        totalReversed += succeededInBatch;
        log.info({ batchIndex: Math.floor(i / CONCURRENCY) + 1, batchSize: batch.length, succeeded: succeededInBatch }, "批次反推完成");
      }

      this.lastPulled = totalPulled;
      this.lastReversed = totalReversed;
      succeeded = true;
      log.info({ totalPulled, totalReversed }, "模板自动发布完成");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error({ error: msg }, "模板自动发布执行失败");
      try {
        await logService.fail(logId, msg);
      } catch (logErr) {
        log.warn({ error: logErr instanceof Error ? logErr.message : String(logErr) }, "写入失败日志也失败");
      }
    } finally {
      if (succeeded) {
        try {
          await logService.succeed(logId, `拉取 ${totalPulled} 个，反推 ${totalReversed} 个`, { pulled: totalPulled, reversed: totalReversed });
        } catch (logErr) {
          log.warn({ error: logErr instanceof Error ? logErr.message : String(logErr) }, "写入成功日志失败");
        }
      }
      await guard.release(lockId);
    }
  }

  /** 反推视频脚本（按 provider callMode 路由，自动选择 OpenAI/Gemini 调用格式） */
  private async reverseVideoToScript(
    description: string,
    ossVideoUrl: string,
  ): Promise<string> {
    const provider = await resolveRouteProvider(this.ctx, ProviderRouteKeys.SQUARE_VIDEO_REVERSE);
    if (!provider) {
      throw new Error("无可用的 LLM provider (square_video_reverse)");
    }

    const { system, user: baseUserPrompt } = await skillLoader.render(PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS, {
      variables: {
        topicId: `auto-${Date.now()}`,
        topicLabel: description.slice(0, 30) || "发现视频",
        videoUrl: ossVideoUrl,
      },
    });

    const finalUserPrompt = baseUserPrompt + `\n\n视频公开链接（OSS）: ${ossVideoUrl}`;

    const result = await requestLlmPlainTextWithMetadata(
      provider,
      system,
      finalUserPrompt,
      0.3,
      {
        ctx: this.ctx,
        routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
        userId: "system",
        businessContext: "模板自动发布-视频反推",
        videoInput: { base64: "", mimeType: "video/mp4", videoUrl: ossVideoUrl },
      },
    );
    return result.text;
  }

  /** 下载远程文件到 OSS，返回公开 URL */
  private async downloadToOss(remoteUrl: string, ossKey: string): Promise<string> {
    const resp = await fetch(remoteUrl, { signal: AbortSignal.timeout(this.appConfig.videoDownloadTimeoutMs) });
    if (!resp.ok) {
      throw new Error(`下载远程文件失败: status=${resp.status} url=${remoteUrl.slice(0, 100)}`);
    }
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const buffer = await resp.arrayBuffer();
    await this.storage.putObject(ossKey, new Uint8Array(buffer), contentType);
    return this.storage.getPublicUrl(ossKey);
  }

  /** 清理无 OSS URL 的 pending 记录（入库后 OSS 转存失败的残留） */
  private async cleanupPendingWithoutOss(): Promise<void> {
    const count = await this.repos.squareDiscoveredVideos.cleanupPendingWithoutOss(Date.now());
    if (count > 0) {
      log.info({ count }, "清理无 OSS URL 的 pending 记录");
    }
  }

  /** 清理上次崩溃残留的 running 状态执行日志 */
  private async cleanupStaleRunningLogs(_logService: SquareExecutionLogService): Promise<void> {
    try {
      const count = await this.repos.squareExecutionLogs.cleanupStaleRunningLogs();
      if (count > 0) {
        log.info({ count }, "清理残留 running 执行日志");
      }
    } catch (error) {
      log.warn({ error: error instanceof Error ? error.message : String(error) }, "清理残留执行日志失败");
    }
  }

  /** 存储脚本数据到 nrm_script_data 表 */
  private async insertScriptData(input: {
    title: string;
    durationSeconds?: number | null;
    source?: string;
    sourceOssUrl?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    mainScene?: string | null;
    atmosphere?: string | null;
    theme?: string | null;
    summary?: string | null;
    primaryEmotion?: string | null;
    videoType?: string | null;
    videoStyle?: string | null;
    fashionSuitable?: boolean | null;
    fashionReason?: string | null;
    emotionDetail?: Record<string, unknown> | null;
    onScreenPresence?: Record<string, unknown> | null;
    fashionStyles?: Record<string, unknown>[] | null;
    editingAnalysis?: Record<string, unknown> | null;
    payloadJson?: Record<string, unknown>;
  }): Promise<string> {
    return this.repos.scriptData.insertFromSquareDiscovery(input);
  }

  /** 存储分镜数据到 nrm_shot_breakdown 表 */
  private async insertShotBreakdown(scriptDataId: string, shots: Record<string, unknown>[]): Promise<number> {
    if (shots.length === 0) return 0;
    const now = Date.now();

    return this.repos.shotBreakdowns.batchInsert({
      scriptDataId,
      shots: shots as import("../contracts/shot-breakdown-contract.js").ShotBreakdownItem[],
      createdAt: now,
      updatedAt: now,
    });
  }
}
