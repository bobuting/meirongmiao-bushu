/**
 * 核心初始化模块
 *
 * 阶段 1: 创建 Fastify 实例、PG pool、AppContext，注册生命周期 hooks。
 */
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { resolveRuntimeConfig } from "../core/runtime-config.js";
import { createAppContext } from "../core/app-context.js";
import { PgAuditStore, UpgradableAuditStore } from "../persistence/audit-store.js";
import { createInMemoryProviderExecutionLimiter } from "../modules/provider-execution-governance.js";
import { createDouyinRouteHandlers } from "../modules/douyin-route-handlers.js";
import { registerStartupHooks } from "./startup-hooks.js";
import { createPgPool } from "./startup-pg-pool.js";
import { setupErrorLog } from "./setup-error-log.js";
import { ErrorLogCleanupScheduler } from "../scheduler/error-log-cleanup-scheduler.js";
import { CreditFreezeCleanupScheduler } from "../scheduler/credit-freeze-cleanup-scheduler.js";
import { StuckJobCleanupScheduler } from "../scheduler/stuck-job-cleanup-scheduler.js";
import { PendingJobTimeoutScheduler } from "../scheduler/pending-job-timeout-scheduler.js";
import { ScriptQualityScoringDaemon } from "../modules/script-quality/scoring-daemon.js";
import { DailyScoringScheduler } from "../modules/script-quality/daily-scoring-scheduler.js";
import { MetricsScheduler } from "../modules/script-quality/metrics-scheduler.js";
import { PromptEvolutionDaemon } from "../modules/prompt-evolution/evolution-daemon.js";
import { setupLoggerSystem, createTraceIdHook } from "../core/logger/setup-logger.js";
import { resolveLoggerConfig } from "../core/logger/config.js";
import { setupExecutors } from "./setup-executors.js";
import { DEFAULT_SCORING_LOOP_CONFIG } from "../contracts/business-config-contract.js";
import type { CoreSetupResult, DouyinRouteHandlers, ProviderExecutionRuntimeConfig } from "./app-services.js";

/** 最大视频反推 multipart 字节数 */
const MAX_VIDEO_REVERSE_MULTIPART_BYTES = 512 * 1024 * 1024;

/**
 * 阶段 1: 核心初始化
 *
 * 创建 Fastify 实例、PG pool、AppContext，注册生命周期 hooks。
 */
export async function setupCore(): Promise<CoreSetupResult> {
  const runtimeConfig = resolveRuntimeConfig(process.env);

  // 初始化日志系统（从环境变量读取配置）
  const loggerConfig = resolveLoggerConfig();
  const { fastifyLoggerConfig, appLogger } = setupLoggerSystem(loggerConfig);

  // 创建 Fastify 实例（使用新日志系统）
  const app = Fastify({
    bodyLimit: runtimeConfig.server.apiBodyLimitBytes,
    logger: runtimeConfig.server.nodeEnv === "test" ? false : fastifyLoggerConfig,
    pluginTimeout: 120_000,
    ajv: {
      customOptions: {
        strict: false, // 允许 example 等 JSON Schema 扩展关键字
      },
    },
  });

  // 注册 multipart 插件
  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: MAX_VIDEO_REVERSE_MULTIPART_BYTES,
    },
  });

  // 注册 TraceId 中间件
  app.addHook("onRequest", createTraceIdHook());

  // 创建 PG pool
  const pool = createPgPool(app);

  // 创建 AppContext
  const ctx = await createAppContext({
    initialConfig: runtimeConfig.appConfig,
    providerAuditLogDir: runtimeConfig.provider.providerAuditLogDir,
    objectStorageLocalDir: runtimeConfig.objectStorage.localDir,
    bootstrapAdminEmail: runtimeConfig.bootstrapAdmin.email,
    bootstrapAdminPassword: runtimeConfig.bootstrapAdmin.password,
    douyinPublishEnabled: runtimeConfig.douyinPublish.enabled,
    socialAutoUploadDir: runtimeConfig.douyinPublish.socialAutoUploadDir,
    douyinCookieDir: runtimeConfig.douyinPublish.cookieDir,
    douyinQrHeadless: runtimeConfig.douyinPublish.qrHeadless,
    douyinRemoteLoginEnabled: runtimeConfig.douyinPublish.remoteLoginEnabled,
    douyinRemoteLoginXpraBin: runtimeConfig.douyinPublish.remoteLoginXpraBin,
    douyinRemoteLoginChromeBin: runtimeConfig.douyinPublish.remoteLoginChromeBin,
    douyinRemoteLoginBindHost: runtimeConfig.douyinPublish.remoteLoginBindHost,
    douyinRemoteLoginPublicUrlTemplate: runtimeConfig.douyinPublish.remoteLoginPublicUrlTemplate,
    douyinRemoteLoginPortStart: runtimeConfig.douyinPublish.remoteLoginPortStart,
    douyinRemoteLoginPortEnd: runtimeConfig.douyinPublish.remoteLoginPortEnd,
    douyinRemoteLoginDisplayStart: runtimeConfig.douyinPublish.remoteLoginDisplayStart,
    douyinRemoteLoginDisplayEnd: runtimeConfig.douyinPublish.remoteLoginDisplayEnd,
    douyinRemoteLoginSessionTimeoutMs: runtimeConfig.douyinPublish.remoteLoginSessionTimeoutMs,
    douyinPublishHistoryStorePath: runtimeConfig.douyinPublish.historyStorePath,
    pool,
  });

  // auditStore 升级：从 Memory 切换到 PG
  if (ctx.auditStore instanceof UpgradableAuditStore) {
    ctx.auditStore.upgrade(new PgAuditStore(ctx.repos.auditLogs, ctx.repos.providerCallAudits));
  }

  // 创建抖音路由处理器
  const douyinRouteHandlers = createDouyinRouteHandlers(ctx) as DouyinRouteHandlers;

  // 创建 provider 执行限制器
  const providerExecutionLimiter = createInMemoryProviderExecutionLimiter(() => ctx.clock.now());

  const providerExecutionRuntimeConfig: ProviderExecutionRuntimeConfig = {
    maxConcurrency: runtimeConfig.provider.maxConcurrency,
    timeoutMs: runtimeConfig.provider.timeoutMs,
    slowRequestThresholdMs: runtimeConfig.provider.slowRequestThresholdMs,
  };

  // 创建 video job runtime（已迁移到统一异步任务队列，不再需要独立 runtime）
  const persistenceReadyRequired = runtimeConfig.persistence.requireReady;

  // 初始化错误日志服务
  const errorLogSetup = setupErrorLog(ctx.repos.errorLogs);
  const { errorLogService, errorLogQueue } = errorLogSetup;

  // 创建并启动错误日志清理调度器
  const errorLogCleanupScheduler = ErrorLogCleanupScheduler.getInstance(ctx.pool, ctx.repos.errorLogs, app.log);
  errorLogCleanupScheduler.start();

  // 创建并启动冻结积分过期清理调度器（每分钟检查）
  const creditFreezeCleanupScheduler = new CreditFreezeCleanupScheduler(ctx.creditService, app.log);
  creditFreezeCleanupScheduler.start();

  // 创建并启动卡住视频任务清理调度器（每5分钟扫描，15分钟超时）
  const stuckJobCleanupScheduler = new StuckJobCleanupScheduler(ctx.repos as import("../repositories/pg/index.js").PgRepositoryCollection, app.log);
  stuckJobCleanupScheduler.start();

  // 创建并启动 pending 任务超时清理调度器（超时时间由 global_task.queueTimeoutMinutes 配置控制）
  const pendingJobTimeoutScheduler = new PendingJobTimeoutScheduler(ctx.globalTaskConcurrencyService, app.log);
  pendingJobTimeoutScheduler.start();

  // 启动队列调度器：周期扫描 pending → running 提升
  ctx.queueDispatcher.start();

  // 注册所有 executor（新框架）
  await setupExecutors(ctx);

  // ========== 旧框架已移除 ==========
  // - RunningFissionTickScheduler 已删除
  // - onPromoted callbacks 已删除
  // - registerFissionItemImageExecutor 等已删除
  // 所有 executor 现在通过 ExecutorRegistry 统一管理

  // 读取 DB 系统配置（daemon 开关由管理后台控制，不使用 env var）
  let scoringEnabled = false;
  let evolutionEnabled = false;
  try {
    const { readSystemConfig } = await import("../routes/admin/skills-admin-routes.js");
    const dbConfig = await readSystemConfig(pool);
    if (dbConfig) {
      scoringEnabled = dbConfig.scoringDaemonEnabled;
      evolutionEnabled = dbConfig.evolutionEnabled;
    }
  } catch {
    // DB 无记录或读取失败，默认不启动
  }

  // 创建并启动脚本质量评分守护进程
  const scoringDaemon = new ScriptQualityScoringDaemon(
    ctx.repos,
    async () => {
      const { resolveRouteProvider } = await import("../services/llm/provider-resolver.js");
      const { requestLlmPlainText } = await import("../services/llm/llm-transport.js");
      const { ProviderRouteKeys } = await import("../contracts/provider-route-keys.js");
      const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.SCRIPT_QUALITY_SCORING);
      if (!provider) throw new Error("[ScoringDaemon] no LLM provider available");
      return {
        requestLlmPlainText: (sys: string, user: string) => requestLlmPlainText(provider, sys, user, 0.6, {
          ctx,
          routeKey: ProviderRouteKeys.SCRIPT_QUALITY_SCORING,
          businessContext: "脚本质量评分守护进程",
        }),
        generateId: () => crypto.randomUUID(),
      };
    },
    app.log,
    runtimeConfig.scoringDaemon,
    // 动态获取评分闭环配置（从 businessConfigService 读取，支持管理后台实时调整）
    () => ctx.businessConfigService.get("scoring_loop", DEFAULT_SCORING_LOOP_CONFIG),
    async () => {
      const { ProviderRouteKeys } = await import("../contracts/provider-route-keys.js");
      return { ctx, routeKey: ProviderRouteKeys.SCRIPT_QUALITY_SCORING };
    },
  );
  if (scoringEnabled) {
    scoringDaemon.start();
  }

  // 创建并启动每日脚本评分调度器（跟随 scoring daemon 开关）
  const dailyScoringScheduler = new DailyScoringScheduler(ctx.repos, app.log);
  if (scoringEnabled) {
    await dailyScoringScheduler.start();
  }

  // 创建并启动指标聚合调度器（跟随 scoring daemon 开关）
  const metricsScheduler = new MetricsScheduler(ctx.repos, app.log);
  if (scoringEnabled) {
    metricsScheduler.start();
  }

  // 创建并启动 Prompt 进化守护进程
  const evolutionDaemon = new PromptEvolutionDaemon(
    {
      repos: ctx.repos,
      ctx,
      resolveLlmPlainText: async () => {
        const { resolveRouteProvider } = await import("../services/llm/provider-resolver.js");
        const { requestLlmPlainText } = await import("../services/llm/llm-transport.js");
        const { ProviderRouteKeys } = await import("../contracts/provider-route-keys.js");
        const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.PROMPT_EVOLUTION_GENERATION);
        if (!provider) throw new Error("[EvolutionDaemon] no LLM provider available");
        return (sys: string, user: string) => requestLlmPlainText(provider, sys, user, 0.7, {
          ctx,
          routeKey: ProviderRouteKeys.PROMPT_EVOLUTION_GENERATION,
          businessContext: "Prompt 进化提案生成",
          userId: "system",
        });
      },
      getPromptContent: async (code: string) => {
        const { skillLoader } = await import("../services/skills/index.js");
        try {
          const { system, user } = await skillLoader.render(code, {});
          return system + '\n\n' + user;
        } catch {
          return null;
        }
      },
      getOwner: async () => ({ id: "system" }),
      generateId: () => crypto.randomUUID(),
      now: () => ctx.clock.now(),
    },
    runtimeConfig.evolution,
    app.log,
  );
  if (evolutionEnabled) {
    evolutionDaemon.start();
  }

  // 装饰 app 并注册 hooks
  app.decorate("ctx", ctx);
  app.decorate("errorLogService", errorLogService);
  app.decorate("errorLogQueue", errorLogQueue);
  registerStartupHooks(app, ctx, persistenceReadyRequired, scoringDaemon, dailyScoringScheduler, metricsScheduler, evolutionDaemon, creditFreezeCleanupScheduler);

  return {
    app,
    ctx,
    runtimeConfig,
    pool,
    douyinRouteHandlers,
    providerExecutionLimiter,
    providerExecutionRuntimeConfig,
    errorLogService,
    errorLogQueue,
    errorLogCleanupScheduler,
    stuckJobCleanupScheduler,
    scoringDaemon,
    dailyScoringScheduler,
    metricsScheduler,
    evolutionDaemon,
  };
}