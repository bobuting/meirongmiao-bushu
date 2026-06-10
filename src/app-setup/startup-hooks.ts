/**
 * 应用生命周期 hooks 模块
 *
 * 负责 onReady 和 onClose 钩子的注册，包括：
 * - persistence 就绪检查
 * - media URL normalization
 * - PG pool 关闭
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { normalizeInlineMediaUrlsInStore } from "../modules/startup-media-normalizer.js";
import { closePgPool } from "./startup-pg-pool.js";

/**
 * 注册应用生命周期 hooks
 *
 * @param app Fastify 实例
 * @param ctx 应用上下
 * @param persistenceReadyRequired 是否要求 persistence 就绪
 */
export function registerStartupHooks(
  app: FastifyInstance,
  ctx: AppContext,
  persistenceReadyRequired: boolean,
  scoringDaemon?: { stop(): void },
  dailyScoringScheduler?: { stop(): void },
  metricsScheduler?: { stop(): void },
  evolutionDaemon?: { stop(): void },
  creditFreezeCleanupScheduler?: { stop(): void },
): void {
  // onReady hook: media normalization
  app.addHook("onReady", async () => {

    // Persistence 就绪检查
    if (persistenceReadyRequired && !ctx.pool) {
      throw new Error(
        `[startup] persistence guard failed: PG pool not available`,
      );
    }

    // 后台执行 media URL normalization（不阻塞启动）
    void (async () => {
      try {
        const normalized = await normalizeInlineMediaUrlsInStore(ctx, app.log);
        if (normalized > 0) {
          app.log.info({ normalized }, "media URLs normalized");
        }
      } catch (error) {
        app.log.warn({ err: error }, "media normalization failed after startup");
      }
    })();

  });

  // onClose hook: 停止 daemons 和关闭连接池
  app.addHook("onClose", async () => {
    scoringDaemon?.stop();
    dailyScoringScheduler?.stop();
    metricsScheduler?.stop();
    evolutionDaemon?.stop();
    creditFreezeCleanupScheduler?.stop();
    ctx.queueDispatcher.stop();
    await closePgPool();
  });
}

/**
 * 创建空 flush 函数（兼容旧接口）
 *
 * PG repos 直接持久化，无需手动 flush。
 */
export function createPersistenceFlushTrigger(): () => void {
  return () => {
    // M5 flush 已移除 — PG repos 直接持久化，无需手动 flush
  };
}
