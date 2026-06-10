/**
 * 每日热点分析报告定时任务初始化模块
 *
 * 负责构建 HotTrendDailyReportScheduler 及其依赖。
 */

import type { AppContext } from "../core/app-context.js";
import type { RuntimeConfigBundle } from "../core/runtime-config.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { HotTrendDailyReportScheduler } from "../scheduler/hot-trend-daily-report-scheduler.js";
import { getLogger } from "../core/logger/index.js";
import { requestLlmPlainText, resolveRouteProvider } from "../services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";

const log = getLogger("SetupHotTrendDailyReport");

/**
 * 每日热点报告任务配置参数
 */
export interface HotTrendDailyReportSetupParams {
  ctx: AppContext;
  runtimeConfig: RuntimeConfigBundle;
  /** 是否在启动时立即执行（用于测试） */
  runOnStartup?: boolean;
}

/**
 * 创建每日热点报告调度器
 */
export function setupHotTrendDailyReport(
  params: HotTrendDailyReportSetupParams
): HotTrendDailyReportScheduler | null {
  const { ctx, runtimeConfig, runOnStartup = false } = params;

  // 检查必要配置
  if (!ctx.store.config.hotTrendDailyReportEnabled) {
    log.info("每日热点报告已禁用，跳过启动");
    return null;
  }

  // 从运行时配置获取 TikHub token（已从环境变量解析）
  const tikhubApiToken = runtimeConfig.reverse.tikhubApiToken?.trim();
  if (!tikhubApiToken) {
    log.warn("TikHub API Token 未配置，每日热点报告将不启动");
    return null;
  }

  // 创建 TikHub 客户端
  const tikhubClient = new TikHubClient(tikhubApiToken);

  // 创建 LLM 调用函数（使用默认 provider）
  const llmRequestFn = async (system: string, user: string, temperature: number): Promise<string> => {
    // 使用热点分析专用的 provider route
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS);
    if (!provider) {
      throw new Error("No LLM provider available for hotspot analysis");
    }
    return requestLlmPlainText(provider, system, user, temperature, {
      ctx,
      routeKey: ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS,
      userId: "system",
      businessContext: "每日热点报告生成",
    });
  };

  // 创建调度器实例（单例）
  const scheduler = HotTrendDailyReportScheduler.getInstance(
    ctx.repos,
    ctx.pool,
    ctx.store.config,
    tikhubClient,
    llmRequestFn,
    ctx,
    ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS,
  );

  // 启动定时任务
  scheduler.start();

  log.info(`每日热点报告任务已启动（凌晨 ${ctx.store.config.hotTrendDailyReportHour} 点执行）`);

  // 如果需要立即执行（测试模式）
  if (runOnStartup) {
    log.info("测试模式：立即执行每日热点报告生成");
    void scheduler.triggerManualReport().then((result) => {
      if (result) {
        log.info(`测试执行完成：${result.hotspotCount} 个热点`);
      } else {
        log.warn("测试执行失败或无结果");
      }
    });
  }

  return scheduler;
}

/**
 * 重置每日热点报告调度器（用于测试或重新初始化）
 */
export function resetHotTrendDailyReport(): void {
  HotTrendDailyReportScheduler.resetInstance();
}