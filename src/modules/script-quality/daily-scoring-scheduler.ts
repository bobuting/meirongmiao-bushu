/**
 * 每日脚本评分定时调度器
 *
 * 每天凌晨扫描当天产生的脚本，为未评分的脚本创建 quality_scoring 任务。
 * 避免重复评分，仅处理 created_at 在当天且无评分记录的脚本。
 *
 * 【持久化状态机制】
 * 将上次执行时间存储到 nrm_business_configs 表，解决服务重启导致定时器丢失的问题。
 * 启动时检查：如果上次执行时间超过阈值（默认 23 小时），立即补执行一次。
 */

import type { FastifyBaseLogger } from "fastify";
import { getLogger } from "../../core/logger/index.js";
import type { ScoringStrategy, ScoringJobInput } from "./scoring-types.js";
import { STRATEGY_PROMPT_CODE_MAP } from "./scoring-types.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";

const logger = getLogger("daily-scoring-scheduler");

/** 配置模块名（用于持久化执行状态） */
const SCHEDULER_CONFIG_MODULE = "daily_scoring_scheduler";

/** 默认调度间隔：1 天（凌晨 2 点执行） */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 默认执行时间：凌晨 2 点（小时） */
const DEFAULT_RUN_HOUR = 2;

/** 补偿执行阈值：如果上次执行超过此时间，启动时立即补执行（毫秒） */
const COMPENSATION_THRESHOLD_MS = 23 * 60 * 60 * 1000; // 23 小时

export class DailyScoringScheduler {
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;
  private readonly runHour: number;

  constructor(
    private readonly repos: PgRepositoryCollection,
    private readonly fastifyLogger: FastifyBaseLogger,
    options?: { intervalMs?: number; runHour?: number },
  ) {
    this.intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.runHour = options?.runHour ?? DEFAULT_RUN_HOUR;
  }

  /** 启动调度器（带补偿检查） */
  async start(): Promise<void> {
    this.fastifyLogger.info(`[DailyScoringScheduler] started (run at ${this.runHour}:00 daily)`);

    // 补偿检查：如果上次执行超过阈值，立即补执行一次
    const lastRunTime = await this.loadLastRunTime();
    const now = Date.now();
    const elapsed = lastRunTime ? now - lastRunTime : Infinity;

    if (elapsed >= COMPENSATION_THRESHOLD_MS) {
      this.fastifyLogger.info(
        `[DailyScoringScheduler] compensation triggered (last run: ${lastRunTime ? new Date(lastRunTime).toISOString() : 'never'}, elapsed: ${Math.round(elapsed / 1000 / 60)}min)`
      );
      await this.runOnceAndPersist();
    }

    this.scheduleNextRun();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.fastifyLogger.info("[DailyScoringScheduler] stopped");
  }

  /** 从数据库加载上次执行时间 */
  private async loadLastRunTime(): Promise<number | null> {
    try {
      const config = await this.repos.businessConfigs.get(SCHEDULER_CONFIG_MODULE);
      if (config && typeof config.lastRunTime === "number") {
        return config.lastRunTime;
      }
      return null;
    } catch (err) {
      logger.warn({ err }, "[DailyScoringScheduler] failed to load lastRunTime");
      return null;
    }
  }

  /** 保存执行时间到数据库 */
  private async saveLastRunTime(time: number): Promise<void> {
    try {
      await this.repos.businessConfigs.upsert(
        SCHEDULER_CONFIG_MODULE,
        { lastRunTime: time },
        "每日评分调度器执行状态",
      );
    } catch (err) {
      logger.warn({ err }, "[DailyScoringScheduler] failed to save lastRunTime");
    }
  }

  /** 执行评分并持久化状态 */
  private async runOnceAndPersist(): Promise<{ scanned: number; queued: number }> {
    const result = await this.runOnce();
    const now = Date.now();
    await this.saveLastRunTime(now);
    return result;
  }

  /** 手动触发一轮扫描（用于测试） */
  async runOnce(): Promise<{ scanned: number; queued: number }> {
    try {
      // 1. 计算当天时间范围（从 00:00 到 23:59）
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      const todayEnd = new Date(now).setHours(23, 59, 59, 999);

      // 2. 查询当天产生的脚本
      const scripts = await this.repos.scriptData.findCreatedBetween(todayStart, todayEnd);

      if (scripts.length === 0) {
        logger.debug("[DailyScoringScheduler] no scripts created today");
        return { scanned: 0, queued: 0 };
      }

      logger.info(`[DailyScoringScheduler] found ${scripts.length} scripts created today`);

      // 3. 查询已评分的脚本（避免重复）
      const scriptIds = scripts.map((s) => s.id);
      const scoredSet = await this.repos.scriptQualityScores.findScoredScriptIds(scriptIds);

      // 4. 为未评分的脚本创建任务
      let queued = 0;
      for (const script of scripts) {
        if (scoredSet.has(script.id)) {
          continue; // 已评分，跳过
        }

        // 推断策略类型（基于 type 字段）
        const strategy = this.inferStrategy(script.type, script.source);

        // 构建评分任务输入
        const input: ScoringJobInput = {
          scriptDataId: script.id,
          strategy,
          projectId: null,
          userId: null,
          promptCode: STRATEGY_PROMPT_CODE_MAP[strategy] ?? null,
          promptVersion: null,
          scriptContent: script.summary ?? script.theme ?? "",
          scriptTitle: script.title ?? null,
          scriptSummary: script.summary ?? null,
          videoType: script.videoType ?? null,
          videoStyle: script.videoStyle ?? null,
        };

        // 创建系统任务
        const jobId = `daily-scoring-${script.id}-${now}`;
        try {
          await this.repos.systemJobs.insertSystemJob({
            id: jobId,
            jobType: "quality_scoring",
            input: input as unknown as Record<string, unknown>,
            now,
          });
          queued++;
        } catch (err) {
          logger.warn({ err, scriptId: script.id }, "[DailyScoringScheduler] failed to create scoring job");
        }
      }

      logger.info(`[DailyScoringScheduler] queued ${queued} scoring jobs for ${scripts.length} scripts`);
      return { scanned: scripts.length, queued };
    } catch (err) {
      logger.error({ err }, "[DailyScoringScheduler] runOnce failed");
      return { scanned: 0, queued: 0 };
    }
  }

  /** 根据 type 和 source 推断策略类型 */
  private inferStrategy(type: number | null, source: string | null): ScoringStrategy {
    // type 字段映射：2=库存, 3=视频, 4=实时, 5=智能, 6=新故事
    if (type === 2) return "library";
    if (type === 3) return "video";
    if (type === 4) return "realtime";
    if (type === 5) return "effectiveness";
    if (type === 6) return "custom";

    // source 字段推断
    if (source?.includes("hot_trend") || source?.includes("realtime")) return "realtime";
    if (source?.includes("effectiveness")) return "effectiveness";
    if (source?.includes("fashion")) return "fashion";
    if (source?.includes("emotion")) return "emotion_archetype";
    if (source?.includes("aesthetic")) return "aesthetic";
    if (source?.includes("product_showcase")) return "product_showcase";

    // 默认策略
    return "custom";
  }

  /** 计算下次执行时间的延迟（毫秒） */
  private calculateDelay(): number {
    const now = new Date();
    const target = new Date(now);
    target.setHours(this.runHour, 0, 0, 0);

    // 如果当前时间已过今天的执行时间，则计算到明天
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  private scheduleNextRun(): void {
    const delay = this.calculateDelay();
    logger.info(`[DailyScoringScheduler] next run in ${Math.round(delay / 1000 / 60)} minutes`);

    // 单层 setTimeout + 递归调用，避免嵌套定时器导致重复执行
    this.timer = setTimeout(async () => {
      await this.runOnceAndPersist();
      this.scheduleNextRun(); // 重新计算下次执行时间，对齐到凌晨 2 点
    }, delay);
  }
}
