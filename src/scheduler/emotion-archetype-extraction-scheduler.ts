/**
 * 情感原型自动提取调度器
 *
 * 三个数据源的情感原型自动提取：
 * 1. 视频热点：从已分析的视频反推结果中提取 emotion_archetype
 * 2. 实时热点：从热点话题文本中提取情感原型（使用专用 Skill）
 * 3. 日报分析：从每日 emotion_atmosphere 中提取情感原型
 *
 * 在后置微调调度器之后执行，每日凌晨 6 点运行
 */

import type { Pool } from "pg";
import { getLogger } from "../core/logger/index.js";
import { skillLoader } from "../services/skills/index.js";
import { ProviderRouteKeys, type ProviderRouteKey } from "../contracts/provider-route-keys.js";
import { hashJsonString } from "../persistence/hash-util.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";

const log = getLogger("EmotionArchetypeExtractionScheduler");

// ========== 类型定义 ==========

/** 提取结果 */
interface ExtractionResult {
  source: "video_hot_trend" | "realtime_hot_trend" | "daily_report";
  inserted: number;
  skipped: number;
  errors: number;
}

/** LLM 提取的原型 */
interface ExtractedArchetype {
  category: string;
  emotionCore: string;
  moment: string;
  conflict: string;
  clothingRole: string;
  sourceTopic?: string;
  sourcePlatform?: string;
}

/** LLM 调用依赖 */
export interface EmotionArchetypeExtractionDeps {
  requestLlmPlainText: (system: string, user: string, temperature: number, routeKey?: ProviderRouteKey) => Promise<string>;
}

// ========== 调度器类 ==========

export class EmotionArchetypeExtractionScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly scheduleHour = 6; // 凌晨 6 点，在微调调度器之后
  private static instance: EmotionArchetypeExtractionScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly repos: PgRepositoryCollection,
    private readonly deps: EmotionArchetypeExtractionDeps,
  ) {}

  start(): void {
    if (this.intervalId) {
      log.warn("定时任务已启动，跳过重复启动");
      return;
    }

    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now);
    const delayMs = nextRunTime - now;

    log.info(
      `启动情感原型提取调度器，下次执行: ${new Date(nextRunTime).toISOString()}，延迟 ${Math.round(delayMs / 1000 / 60)} 分钟`
    );

    this.intervalId = setTimeout(() => {
      this.executeExtraction();
      this.setupDailyInterval();
    }, delayMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("情感原型提取调度器已停止");
    }
  }

  // ========== 主执行逻辑 ==========

  private async executeExtraction(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.EMOTION_ARCHETYPE_EXTRACTION);
    if (!lockId) return;

    log.info("开始执行情感原型提取任务");
    const startTime = Date.now();

    // 插入运行记录
    const logId = await this.repos.emotionArchetypeRunLogs.insertRunLog({
      runType: "archetype_extraction",
      triggerType: "scheduled",
      startedAt: startTime,
    });

    const results: Record<string, ExtractionResult> = {};
    const allErrors: string[] = [];

    try {
      // 数据源1：视频热点
      const videoResult = await this.extractFromVideoHotTrends();
      results.videoHotTrend = videoResult;
      if (videoResult.errors > 0) allErrors.push(`视频热点: ${videoResult.errors} 个错误`);

      // 数据源2：实时热点
      const realtimeResult = await this.extractFromRealtimeHotTrends();
      results.realtimeHotTrend = realtimeResult;
      if (realtimeResult.errors > 0) allErrors.push(`实时热点: ${realtimeResult.errors} 个错误`);

      // 数据源3：日报分析
      const dailyResult = await this.extractFromDailyReport();
      results.dailyReport = dailyResult;
      if (dailyResult.errors > 0) allErrors.push(`日报: ${dailyResult.errors} 个错误`);

      const durationMs = Date.now() - startTime;
      const totalInserted = Object.values(results).reduce((sum, r) => sum + r.inserted, 0);
      log.info(
        `情感原型提取完成：视频 ${videoResult.inserted}，实时 ${realtimeResult.inserted}，日报 ${dailyResult.inserted}，总计 ${totalInserted}，耗时 ${Math.round(durationMs / 1000)} 秒`
      );

      await this.completeRunLog(logId, "completed", results, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ error: errorMsg }, "情感原型提取任务执行失败");
      await this.completeRunLog(logId, "failed", results, durationMs, errorMsg);
    } finally {
      await guard.release(lockId);
    }
  }

  // ========== 数据源1：视频热点 ==========

  /**
   * 从已分析的视频热点脚本数据中提取 emotion_archetype
   * 处理历史数据：video_storyboard_analysis 提示词现在会输出 emotion_archetype
   * 但之前分析的数据没有这个字段，所以需要从 emotion_detail 推断
   */
  private async extractFromVideoHotTrends(): Promise<ExtractionResult> {
    const result: ExtractionResult = { source: "video_hot_trend", inserted: 0, skipped: 0, errors: 0 };

    try {
      // 查询已分析但未提取情感原型的视频热点
      const scripts = await this.repos.emotionArchetypes.findVideoHotTrendScriptsForExtraction();

      if (scripts.length === 0) {
        log.info("视频热点：无新数据需要提取");
        return result;
      }

      log.info(`视频热点：发现 ${scripts.length} 条待提取数据`);

      // 构建提取 prompt
      const topicList = scripts.map((row, i) =>
        `【${i + 1}】标题: ${row.title}\n    情感: ${row.primaryEmotion}\n    主题: ${row.theme || "无"}\n    概要: ${(row.summary || "").slice(0, 100)}\n    服饰适合: ${row.fashionReason || "无"}`
      ).join("\n");

      const { system, user } = await skillLoader.render("realtime_trend_emotion_archetype", {
        variables: {
          hotspotCount: scripts.length,
          hotspotList: topicList,
          extraInstruction: "以上是从视频热点分析结果中提取的信息。请基于情感和主题，提取适合电商服饰短视频的情感原型。每个视频最多提取1个原型，不适合的跳过。source_topic 必须填写对应视频的标题。",
        },
      });

      const responseText = await this.deps.requestLlmPlainText(
        system, user, 0.3,
        ProviderRouteKeys.EMOTION_ARCHETYPE_EXTRACTION,
      );

      const archetypes = this.parseArchetypeResponse(responseText);

      // 构建标题到脚本行的映射，用于按 source_topic 匹配（LLM 可能跳过部分视频）
      const titleToScript = new Map<string, typeof scripts[0]>();
      for (const row of scripts) {
        titleToScript.set(row.title, row);
      }

      for (const archetype of archetypes) {
        const scriptRow = archetype.sourceTopic
          ? titleToScript.get(archetype.sourceTopic)
          : undefined;

        try {
          await this.insertArchetype({
            ...archetype,
            source: "hot_trend_video",
            sourceMetadata: {
              scriptId: scriptRow?.id ?? null,
              videoTitle: scriptRow?.title ?? archetype.sourceTopic ?? null,
              topic: scriptRow?.topic ?? null,
              extractedAt: Date.now(),
            },
          });
          result.inserted++;
        } catch (err) {
          log.warn({ err, title: archetype.sourceTopic }, "视频热点情感原型入库失败");
          result.errors++;
        }
      }

      result.skipped = scripts.length - archetypes.length - result.errors;
      log.info(`视频热点提取完成：插入 ${result.inserted}，跳过 ${result.skipped}，错误 ${result.errors}`);
    } catch (error) {
      log.error({ err: error }, "视频热点情感原型提取失败");
      result.errors++;
    }

    return result;
  }

  // ========== 数据源2：实时热点 ==========

  /**
   * 从实时热点话题文本中提取情感原型
   * 使用 realtime_trend_emotion_archetype Skill
   */
  private async extractFromRealtimeHotTrends(): Promise<ExtractionResult> {
    const result: ExtractionResult = { source: "realtime_hot_trend", inserted: 0, skipped: 0, errors: 0 };

    try {
      // 查询最近的实时热点（7天内），排除已处理的
      const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const trends = await this.repos.emotionArchetypes.findRealtimeTrendsForExtraction(cutoffTime);

      if (trends.length === 0) {
        log.info("实时热点：无新数据需要提取");
        return result;
      }

      log.info(`实时热点：发现 ${trends.length} 条待提取数据`);

      const topicList = trends.map((row, i) =>
        `【${i + 1}】${row.topic}（${row.source}）`
      ).join("\n");

      const { system, user } = await skillLoader.render("realtime_trend_emotion_archetype", {
        variables: {
          hotspotCount: trends.length,
          hotspotList: topicList,
        },
      });

      const responseText = await this.deps.requestLlmPlainText(
        system, user, 0.3,
        ProviderRouteKeys.EMOTION_ARCHETYPE_EXTRACTION,
      );

      const archetypes = this.parseArchetypeResponse(responseText);

      for (const archetype of archetypes) {
        try {
          await this.insertArchetype({
            ...archetype,
            source: "hot_trend_realtime",
            sourceMetadata: {
              sourceTopic: archetype.sourceTopic,
              sourcePlatform: archetype.sourcePlatform,
              extractedAt: Date.now(),
            },
          });
          result.inserted++;
        } catch (err) {
          log.warn({ err, topic: archetype.sourceTopic }, "实时热点情感原型入库失败");
          result.errors++;
        }
      }

      result.skipped = trends.length - archetypes.length;
      log.info(`实时热点提取完成：插入 ${result.inserted}，跳过 ${result.skipped}，错误 ${result.errors}`);
    } catch (error) {
      log.error({ err: error }, "实时热点情感原型提取失败");
      result.errors++;
    }

    return result;
  }

  // ========== 数据源3：日报分析 ==========

  /**
   * 从每日热点报告的 emotion_atmosphere 和 creative_suggestions 中提取情感原型
   * 使用 realtime_trend_emotion_archetype Skill
   */
  private async extractFromDailyReport(): Promise<ExtractionResult> {
    const result: ExtractionResult = { source: "daily_report", inserted: 0, skipped: 0, errors: 0 };

    try {
      // 查询最近未处理的日报
      const reports = await this.repos.emotionArchetypes.findDailyReportsForExtraction();

      if (reports.length === 0) {
        log.info("日报：无新报告需要提取");
        return result;
      }

      for (const report of reports) {
        try {
          const emotions = (Array.isArray(report.emotionAtmosphere) ? report.emotionAtmosphere : []) as string[];
          const creatives = (Array.isArray(report.creativeSuggestions) ? report.creativeSuggestions : []) as string[];
          const outfits = (Array.isArray(report.outfitAngles) ? report.outfitAngles : []) as string[];

          if (emotions.length === 0 && creatives.length === 0) {
            result.skipped++;
            continue;
          }

          // 构建输入
          const topicList = [
            ...emotions.map((e: string) => `【情绪氛围】${e}`),
            ...creatives.map((c: string) => `【创意建议】${c}`),
            ...outfits.map((o: string) => `【穿搭角度】${o}`),
          ].join("\n");

          const { system, user } = await skillLoader.render("realtime_trend_emotion_archetype", {
            variables: {
              hotspotCount: topicList.split("\n").length,
              hotspotList: topicList,
              extraInstruction: `以上是 ${report.reportDate} 的热点分析报告中的情绪氛围和创意建议。请从中提取适合电商服饰短视频的情感原型。每个关键点最多提取1个原型。`,
            },
          });

          const responseText = await this.deps.requestLlmPlainText(
            system, user, 0.3,
            ProviderRouteKeys.EMOTION_ARCHETYPE_EXTRACTION,
          );

          const archetypes = this.parseArchetypeResponse(responseText);

          for (const archetype of archetypes) {
            try {
              await this.insertArchetype({
                ...archetype,
                source: "daily_report",
                sourceMetadata: {
                  reportDate: report.reportDate,
                  extractedAt: Date.now(),
                },
              });
              result.inserted++;
            } catch (err) {
              log.warn({ err, reportDate: report.reportDate }, "日报情感原型入库失败");
              result.errors++;
            }
          }
        } catch (err) {
          log.warn({ err, reportDate: report.reportDate }, "日报情感原型提取失败");
          result.errors++;
        }
      }

      log.info(`日报提取完成：插入 ${result.inserted}，跳过 ${result.skipped}，错误 ${result.errors}`);
    } catch (error) {
      log.error({ err: error }, "日报情感原型提取失败");
      result.errors++;
    }

    return result;
  }

  // ========== 入库逻辑 ==========

  /**
   * 插入情感原型到数据库
   * 按 emotion_core 去重：如果已存在相同 emotion_core，则跳过
   */
  private async insertArchetype(input: {
    category: string;
    emotionCore: string;
    moment: string;
    conflict: string;
    clothingRole: string;
    source: string;
    sourceMetadata: Record<string, unknown>;
  }): Promise<void> {
    if (!input.category || !input.emotionCore || !input.moment || !input.conflict || !input.clothingRole) {
      return;
    }

    const now = Date.now();
    const emotionCoreHash = hashJsonString(input.emotionCore);
    const archetypeId = `EA-${input.source.toUpperCase().slice(0, 2)}-${emotionCoreHash.slice(0, 8)}-${now}`;

    await this.repos.emotionArchetypes.upsertArchetypeByEmotionCore({
      archetypeId,
      name: input.moment.slice(0, 50),
      category: input.category,
      emotionCore: input.emotionCore,
      moment: input.moment,
      conflict: input.conflict,
      clothingRole: input.clothingRole,
      source: input.source,
      sourceMetadata: input.sourceMetadata,
      now,
    });

    log.info({ archetypeId, category: input.category, emotionCore: input.emotionCore, source: input.source }, "情感原型已入库");
  }

  // ========== 响应解析 ==========

  /**
   * 解析 LLM 返回的 JSON 响应，提取原型列表
   */
  private parseArchetypeResponse(responseText: string): ExtractedArchetype[] {
    try {
      // 清理可能的 markdown 代码块标记
      let cleaned = responseText.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      // 兼容两种格式：{ archetypes: [...] } 和 [...]
      const list = Array.isArray(parsed) ? parsed : (parsed.archetypes || []);

      return list.filter((item: Record<string, unknown>) =>
        item.category && item.emotion_core && item.moment && item.conflict && item.clothing_role
      ).map((item: Record<string, unknown>) => ({
        category: String(item.category),
        emotionCore: String(item.emotion_core),
        moment: String(item.moment),
        conflict: String(item.conflict),
        clothingRole: String(item.clothing_role),
        sourceTopic: item.source_topic ? String(item.source_topic) : undefined,
        sourcePlatform: item.source_platform ? String(item.source_platform) : undefined,
      }));
    } catch (err) {
      log.warn({ err, responsePreview: responseText.slice(0, 200) }, "解析 LLM 情感原型响应失败");
      return [];
    }
  }

  // ========== 辅助方法 ==========

  private async completeRunLog(
    logId: string | undefined,
    status: string,
    results: Record<string, ExtractionResult>,
    durationMs: number,
    errorMessage?: string,
  ): Promise<void> {
    if (!logId) return;
    try {
      if (status === "completed") {
        await this.repos.emotionArchetypeRunLogs.updateRunLogCompleted(logId, {
          taskResults: results,
          durationMs,
          completedAt: Date.now(),
        });
      } else {
        await this.repos.emotionArchetypeRunLogs.updateRunLogFailed(logId, {
          errorMessage: errorMessage || "Unknown error",
          durationMs,
          completedAt: Date.now(),
        });
      }
    } catch (dbError) {
      log.error({ error: dbError instanceof Error ? dbError.message : String(dbError) }, "更新运行记录失败");
    }
  }

  private setupDailyInterval(): void {
    this.intervalId = setInterval(() => {
      this.executeExtraction();
    }, 24 * 60 * 60 * 1000);
  }

  private calculateNextRunTime(now: number): number {
    const date = new Date(now);
    const todayTarget = new Date(
      date.getFullYear(), date.getMonth(), date.getDate(),
      this.scheduleHour, 0, 0, 0,
    ).getTime();
    return now >= todayTarget ? todayTarget + 24 * 60 * 60 * 1000 : todayTarget;
  }

  static getInstance(pool: Pool, repos: PgRepositoryCollection, deps: EmotionArchetypeExtractionDeps): EmotionArchetypeExtractionScheduler {
    if (!EmotionArchetypeExtractionScheduler.instance) {
      EmotionArchetypeExtractionScheduler.instance = new EmotionArchetypeExtractionScheduler(pool, repos, deps);
    }
    return EmotionArchetypeExtractionScheduler.instance;
  }

  static resetInstance(): void {
    if (EmotionArchetypeExtractionScheduler.instance) {
      EmotionArchetypeExtractionScheduler.instance.stop();
      EmotionArchetypeExtractionScheduler.instance = null;
    }
  }

  /** 手动触发（调试用） */
  async triggerManualExtraction(): Promise<void> {
    await this.executeExtraction();
  }
}
