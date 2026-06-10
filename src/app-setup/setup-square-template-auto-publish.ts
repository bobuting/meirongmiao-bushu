/**
 * 模板自动发布调度器初始化模块
 */

import type { AppContext } from "../core/app-context.js";
import type { RuntimeConfigBundle } from "../core/runtime-config.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { SquareTemplateAutoPublishScheduler } from "../scheduler/square-template-auto-publish-scheduler.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SetupSquareTemplateAutoPublish");

export interface SquareTemplateAutoPublishSetupParams {
  ctx: AppContext;
  runtimeConfig: RuntimeConfigBundle;
  runOnStartup?: boolean;
}

export function setupSquareTemplateAutoPublish(
  params: SquareTemplateAutoPublishSetupParams
): SquareTemplateAutoPublishScheduler | null {
  const { ctx, runtimeConfig, runOnStartup = false } = params;

  const tikhubApiToken = runtimeConfig.reverse.tikhubApiToken?.trim();
  if (!tikhubApiToken) {
    log.warn("TikHub API Token 未配置，模板自动发布将不启动");
    return null;
  }

  const tikhubClient = new TikHubClient(tikhubApiToken);

  const scheduler = SquareTemplateAutoPublishScheduler.getInstance(
    ctx.pool,
    ctx.repos,
    ctx.store.config,
    tikhubClient,
    ctx.storage!,
    ctx,
  );

  if (ctx.store.config.squareTemplateAutoPublishEnabled) {
    scheduler.start();
    log.info(`模板自动发布调度器已启动（凌晨 ${ctx.store.config.squareTemplateAutoPublishHour} 点执行）`);
  } else {
    log.info("模板自动发布已禁用，仅初始化实例（支持手动触发）");
  }

  if (runOnStartup) {
    log.info("测试模式：立即执行模板自动发布");
    void scheduler.triggerManualPublish().then((result) => {
      log.info({ ...result }, "测试执行模板自动发布完成");
    });
  }

  return scheduler;
}

export function resetSquareTemplateAutoPublish(): void {
  SquareTemplateAutoPublishScheduler.resetInstance();
}