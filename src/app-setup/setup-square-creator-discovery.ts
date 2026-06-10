/**
 * 达人发现调度器初始化模块
 */

import type { AppContext } from "../core/app-context.js";
import type { RuntimeConfigBundle } from "../core/runtime-config.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { CreatorDiscoveryScheduler } from "../scheduler/creator-discovery-scheduler.js";
import { getLogger } from "../core/logger/index.js";
import { requestLlmPlainText, resolveRouteProvider } from "../services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";

const log = getLogger("SetupSquareCreatorDiscovery");

export interface SquareCreatorDiscoverySetupParams {
  ctx: AppContext;
  runtimeConfig: RuntimeConfigBundle;
  runOnStartup?: boolean;
}

export function setupSquareCreatorDiscovery(
  params: SquareCreatorDiscoverySetupParams
): CreatorDiscoveryScheduler | null {
  const { ctx, runtimeConfig, runOnStartup = false } = params;

  const tikhubApiToken = runtimeConfig.reverse.tikhubApiToken?.trim();
  if (!tikhubApiToken) {
    log.warn("TikHub API Token 未配置，达人发现将不启动");
    return null;
  }

  const tikhubClient = new TikHubClient(tikhubApiToken);

  const llmRequestFn = async (system: string, user: string, temperature: number): Promise<string> => {
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.SQUARE_CREATOR_EVALUATION);
    if (!provider) {
      throw new Error("No LLM provider available for creator evaluation");
    }
    return requestLlmPlainText(provider, system, user, temperature, {
      ctx,
      routeKey: ProviderRouteKeys.SQUARE_CREATOR_EVALUATION,
      userId: "system",
      businessContext: "达人发现评估",
    });
  };

  const scheduler = CreatorDiscoveryScheduler.getInstance(
    ctx.pool,
    ctx.store.config,
    tikhubClient,
    llmRequestFn
  );

  if (ctx.store.config.squareCreatorDiscoveryEnabled) {
    scheduler.start();
    log.info(`达人发现调度器已启动（凌晨 ${ctx.store.config.squareCreatorDiscoveryHour} 点执行）`);
  } else {
    log.info("达人发现已禁用，仅初始化实例（支持手动触发）");
  }

  if (runOnStartup) {
    log.info("测试模式：立即执行达人发现");
    void scheduler.triggerManualDiscovery().then((result) => {
      log.info({ ...result }, "测试执行达人发现完成");
    });
  }

  return scheduler;
}

export function resetSquareCreatorDiscovery(): void {
  CreatorDiscoveryScheduler.resetInstance();
}
