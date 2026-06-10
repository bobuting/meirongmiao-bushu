/**
 * 达人发现调度器
 * 每天凌晨指定时间执行，通过 TikHub 搜索抖音关键词发现优质「场景种草」型创作者
 */

import type { Pool } from "pg";
import type { AppConfig } from "../contracts/types.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { getLogger } from "../core/logger/index.js";
import { skillLoader } from "../services/skills/index.js";
import { SquareCreatorTargetService, type CreatorContentType } from "../service/square-creator-target-db-service.js";
import { SquareExecutionLogService } from "../service/square-execution-log-db-service.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";
import { PgSquareCreatorTargetRepository } from "../repositories/pg/square-creator-target-pg-repository.js";
import { PgSquareExecutionLogRepository } from "../repositories/pg/square-execution-log-pg-repository.js";

const log = getLogger("creator-discovery-scheduler");

// ========== 关键词组配置 ==========

interface KeywordGroup {
  contentType: CreatorContentType;
  keywords: string[];
}

const KEYWORD_GROUPS: KeywordGroup[] = [
  { contentType: "fashion_film", keywords: ["城市旅拍穿搭", "OOTD街拍", "高级感穿搭街拍", "穿搭大片旅拍", "lookbook街拍", "时尚穿搭短片"] },
  { contentType: "aesthetic", keywords: ["场景穿搭氛围感", "户外穿搭大片", "质感穿搭旅拍", "街拍穿搭无对白", "高级感穿搭氛围感", "城市穿搭大片"] },
  { contentType: "scene", keywords: ["旅拍换装", "场景换装大片", "城市街拍换装", "户外场景穿搭", "一镜到底街拍穿搭", "场景穿搭大片"] },
];

/** 每日最大评估创作者数 */
const MAX_DAILY_EVALUATIONS = 20;
/** 最低单视频点赞数阈值（过滤低质量内容，与提示词硬门槛一致） */
const MIN_LIKES_PER_VIDEO = 100;

// ========== LLM 评估结果 ==========

interface CreatorEvaluationResult {
  isQualified: boolean;
  contentType: CreatorContentType | "other";
  confidenceScore: number;
  summary: string;
}

// ========== 调度器类 ==========

export class CreatorDiscoveryScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private static instance: CreatorDiscoveryScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly appConfig: AppConfig,
    private readonly tikhubClient: TikHubClient,
    private readonly requestLlmPlainText: (system: string, user: string, temperature: number) => Promise<string>,
  ) {}

  start(): void {
    if (!this.appConfig.squareCreatorDiscoveryEnabled) {
      log.info("达人发现调度器已禁用，跳过启动");
      return;
    }
    if (this.intervalId) {
      log.warn("达人发现调度器已启动，跳过重复启动");
      return;
    }

    const scheduleHour = this.appConfig.squareCreatorDiscoveryHour;
    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now, scheduleHour);
    const delayMs = nextRunTime - now;

    log.info({
      scheduleHour,
      nextRunTime: new Date(nextRunTime).toISOString(),
      delayMinutes: Math.round(delayMs / 1000 / 60),
    }, "启动达人发现调度器");

    this.intervalId = setTimeout(() => {
      this.executeDailyDiscovery();
      this.setupDailyInterval();
    }, delayMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("达人发现调度器已停止");
    }
  }

  private setupDailyInterval(): void {
    this.intervalId = setInterval(() => {
      this.executeDailyDiscovery();
    }, 24 * 60 * 60 * 1000);
  }

  private calculateNextRunTime(now: number, hour: number): number {
    const date = new Date(now);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0).getTime();
    return now >= target ? target + 24 * 60 * 60 * 1000 : target;
  }

  static getInstance(
    pool: Pool,
    appConfig: AppConfig,
    tikhubClient: TikHubClient,
    requestLlmPlainText: (system: string, user: string, temperature: number) => Promise<string>,
  ): CreatorDiscoveryScheduler {
    if (!CreatorDiscoveryScheduler.instance) {
      CreatorDiscoveryScheduler.instance = new CreatorDiscoveryScheduler(pool, appConfig, tikhubClient, requestLlmPlainText);
    }
    return CreatorDiscoveryScheduler.instance;
  }

  static getExistingInstance(): CreatorDiscoveryScheduler | null {
    return CreatorDiscoveryScheduler.instance;
  }

  static resetInstance(): void {
    if (CreatorDiscoveryScheduler.instance) {
      CreatorDiscoveryScheduler.instance.stop();
      CreatorDiscoveryScheduler.instance = null;
    }
  }

  /** 手动触发发现（用于测试） */
  async triggerManualDiscovery(): Promise<{ evaluated: number; qualified: number }> {
    await this.executeDailyDiscovery();
    return { evaluated: this.lastEvaluated, qualified: this.lastQualified };
  }

  private lastEvaluated = 0;
  private lastQualified = 0;

  /** 每日达人发现主流程 */
  private async executeDailyDiscovery(): Promise<void> {
    // 多进程防护：分布式锁防止并发执行
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.CREATOR_DISCOVERY);
    if (!lockId) return;

    const logService = new SquareExecutionLogService(new PgSquareExecutionLogRepository(this.pool));

    // 二次防护：检查今天是否已成功执行（防止锁释放后重复）
    if (await logService.hasSucceededToday("discovery")) {
      log.info("今日达人发现已成功执行，跳过重复执行");
      await guard.release(lockId);
      return;
    }

    log.info("开始执行达人发现");
    const service = new SquareCreatorTargetService(new PgSquareCreatorTargetRepository(this.pool));
    const logId = await logService.start("discovery");

    let totalEvaluated = 0;
    let totalQualified = 0;

    try {
      // 按关键词组搜索
      for (const group of KEYWORD_GROUPS) {
        for (const keyword of group.keywords) {
          if (totalEvaluated >= MAX_DAILY_EVALUATIONS) break;

          try {
            // contentType=2 视频，sortType=0 综合排序
            const posts = await this.tikhubClient.searchDouyinPosts(keyword, 2, 0);
            if (posts.length === 0) continue;

            // 提取唯一创作者（附带视频描述）
            const creators = this.extractUniqueCreators(posts);

            for (const creator of creators) {
              if (totalEvaluated >= MAX_DAILY_EVALUATIONS) break;

              // 检查是否已存在
              const existing = await service.findBySecUid(creator.secUid);
              if (existing) continue;

              // 视频质量过滤（平均点赞数）
              if (creator.avgLikes < MIN_LIKES_PER_VIDEO) {
                log.info({ secUid: creator.secUid, nickname: creator.nickname, avgLikes: creator.avgLikes }, "视频质量不足，跳过");
                continue;
              }

              // LLM 评估（传入视频质量指标）
              const evaluation = await this.evaluateCreator(creator, keyword);
              totalEvaluated++;

              if (evaluation.isQualified && evaluation.contentType !== "other") {
                await service.upsert({
                  secUid: creator.secUid,
                  nickname: creator.nickname,
                  fansCount: creator.fansCount,
                  contentType: evaluation.contentType as CreatorContentType,
                  confidenceScore: evaluation.confidenceScore,
                  source: "discovery",
                  discoveryKeywords: keyword,
                  llmEvaluation: evaluation.summary,
                });
                totalQualified++;
                log.info({ secUid: creator.secUid, nickname: creator.nickname, contentType: evaluation.contentType }, "发现合格达人");
              }
            }
          } catch (error) {
            log.warn({ keyword, error: error instanceof Error ? error.message : String(error) }, "关键词搜索失败");
          }
        }
      }

      this.lastEvaluated = totalEvaluated;
      this.lastQualified = totalQualified;
      await logService.succeed(logId, `评估 ${totalEvaluated} 位达人，符合条件 ${totalQualified} 位`, { evaluated: totalEvaluated, qualified: totalQualified });
      log.info({ totalEvaluated, totalQualified }, "达人发现完成");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await logService.fail(logId, msg);
      log.error({ error: msg }, "达人发现执行失败");
    } finally {
      await guard.release(lockId);
    }
  }

  /** 从搜索结果中提取唯一创作者（附带该创作者的视频描述和视频质量指标） */
  private extractUniqueCreators(posts: { authorId: string; authorSecUid: string; authorName: string; authorFansCount: number; likesCount?: number; description?: string }[]): { secUid: string; nickname: string; fansCount: number; avgLikes: number; videoCount: number; videoDescriptions: string }[] {
    const map = new Map<string, { secUid: string; nickname: string; fansCount: number; descriptions: string[]; likesList: number[] }>();
    for (const post of posts) {
      const key = post.authorSecUid || post.authorId;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          secUid: post.authorSecUid || post.authorId,
          nickname: post.authorName,
          fansCount: post.authorFansCount,
          descriptions: [],
          likesList: []
        });
      }
      if (post.description) {
        map.get(key)!.descriptions.push(post.description);
      }
      if (post.likesCount && post.likesCount > 0) {
        map.get(key)!.likesList.push(post.likesCount);
      }
    }
    return [...map.values()].map(({ secUid, nickname, fansCount, descriptions, likesList }) => ({
      secUid,
      nickname,
      fansCount,
      avgLikes: likesList.length > 0 ? Math.round(likesList.reduce((a, b) => a + b, 0) / likesList.length) : 0,
      videoCount: likesList.length,
      videoDescriptions: descriptions.slice(0, 5).join("\n"),
    }));
  }

  /** LLM 评估创作者（通过 Skill 系统获取提示词，传入视频质量指标） */
  private async evaluateCreator(
    creator: { nickname: string; fansCount: number; avgLikes: number; videoCount: number; videoDescriptions: string },
    keyword: string,
  ): Promise<CreatorEvaluationResult> {
    try {
      const { system, user } = await skillLoader.render("square_creator_evaluation", {
        creatorProfile: `${creator.nickname}（粉丝 ${creator.fansCount}，搜索结果中 ${creator.videoCount} 条视频，平均点赞 ${creator.avgLikes}）`,
        recentVideoDescriptions: creator.videoDescriptions || `搜索关键词：${keyword}`,
      });

      const response = await this.requestLlmPlainText(system, user, 0.3);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log.warn({ nickname: creator.nickname, response: response.slice(0, 200) }, "LLM 响应无法解析为 JSON");
        return { isQualified: false, contentType: "other", confidenceScore: 0, summary: "无法解析 LLM 响应" };
      }
      const result = JSON.parse(jsonMatch[0]) as CreatorEvaluationResult;
      log.info({ nickname: creator.nickname, isQualified: result.isQualified, contentType: result.contentType, confidence: result.confidenceScore, summary: result.summary?.slice(0, 100) }, "达人评估结果");
      return result;
    } catch (error) {
      log.warn({ nickname: creator.nickname, error: error instanceof Error ? error.message : String(error) }, "LLM 评估失败");
      return { isQualified: false, contentType: "other", confidenceScore: 0, summary: "评估失败" };
    }
  }
}
