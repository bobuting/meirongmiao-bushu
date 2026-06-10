/**
 * 情感原型自动提取调度器启动模块
 *
 * 在 app 启动时初始化并启动定时任务（凌晨 6 点执行）
 * 在后置微调调度器（凌晨 5 点）之后运行
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { EmotionArchetypeExtractionScheduler } from "../scheduler/emotion-archetype-extraction-scheduler.js";
import { requestLlmPlainText, resolveRouteProvider } from "../services/llm/llm-transport.js";
import { ProviderRouteKeys, type ProviderRouteKey } from "../contracts/provider-route-keys.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SetupEmotionArchetypeExtraction");

export interface SetupEmotionArchetypeExtractionParams {
  app: FastifyInstance;
  ctx: AppContext;
}

/**
 * 启动情感原型自动提取调度器
 */
export function setupEmotionArchetypeExtraction(params: SetupEmotionArchetypeExtractionParams): void {
  const { app, ctx } = params;

  if (!ctx.pool) {
    log.info("数据库未配置，跳过情感原型提取调度器");
    return;
  }

  // 构建 LLM 调用函数
  const requestLlm = async (system: string, user: string, temperature: number, routeKey?: ProviderRouteKey): Promise<string> => {
    const resolvedKey: ProviderRouteKey = routeKey || ProviderRouteKeys.EMOTION_ARCHETYPE_EXTRACTION;
    const provider = await resolveRouteProvider(ctx, resolvedKey);
    if (!provider) {
      throw new Error(`No LLM provider available for ${resolvedKey}`);
    }
    return requestLlmPlainText(provider, system, user, temperature, {
      ctx,
      routeKey: resolvedKey,
      userId: "system",
      businessContext: "情感原型提取",
    });
  };

  const scheduler = EmotionArchetypeExtractionScheduler.getInstance(ctx.pool, ctx.repos, {
    requestLlmPlainText: requestLlm,
  });

  // 注册 onReady 钩子
  app.ready(() => {
    scheduler.start();
    log.info("情感原型自动提取调度器已启动（凌晨 6 点执行）");
  });

  // 注册 onClose 钩子
  app.addHook("onClose", async () => {
    scheduler.stop();
    log.info("情感原型自动提取调度器已停止");
  });

  EmotionArchetypeExtractionScheduler.resetInstance();
}
