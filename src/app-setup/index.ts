/**
 * 应用构建器入口
 *
 * 将 buildApp 拆分为多个阶段函数，提高可维护性。
 */

import { setupCore } from "./setup-core.js";
import { setupVideoReverse } from "./setup-video-reverse.js";
import { setupOutfit } from "./setup-outfit.js";
import { setupHotTrend } from "./setup-hot-trend.js";
import type { ObjectStorageConfig } from "./app-services.js";
import { resolveObjectStorageLocalRoot } from "../storage/runtime.js";

/**
 * 构建 Fastify 应用
 *
 * 分阶段初始化：
 * 1. 核心初始化：Fastify + PG + Context
 * 2. Video Reverse 服务
 * 3. Outfit 服务
 * 4. Hot Trend 服务
 */
export async function buildApp(): Promise<import("fastify").FastifyInstance> {
  // 阶段 1: 核心初始化
  const core = await setupCore();

  // 阶段 2: Video Reverse 服务
  void setupVideoReverse(core.ctx);

  // 阶段 3: Outfit 服务
  void setupOutfit(core.ctx);

  // 阶段 4: Hot Trend 配置解析
  void setupHotTrend(core.ctx);

  // 对象存储配置
  const objectStorage: ObjectStorageConfig = {
    driver: core.runtimeConfig.objectStorage.driver,
    publicBase: core.runtimeConfig.objectStorage.publicBase,
    localRoot: resolveObjectStorageLocalRoot(core.runtimeConfig.objectStorage.localDir ?? undefined),
  };

  // 记录对象存储状态
  core.app.log.info(
    {
      requestedDriver: objectStorage.driver,
      activeDriver: core.ctx.storage?.driver ?? null,
      publicBase: objectStorage.publicBase,
      localRoot: objectStorage.driver === "local" ? objectStorage.localRoot : null,
    },
    "object storage runtime resolved",
  );

  // 返回 app 实例
  // 注意：路由注册仍然在 app.ts 的 buildApp 中完成，以避免循环依赖
  return core.app;
}

// 重新导出类型和函数
export { setupCore } from "./setup-core.js";
export { setupVideoReverse } from "./setup-video-reverse.js";
export { setupOutfit } from "./setup-outfit.js";
export { setupHotTrend } from "./setup-hot-trend.js";
export { createPgPool, closePgPool } from "./startup-pg-pool.js";
export { registerStartupHooks, createPersistenceFlushTrigger } from "./startup-hooks.js";
export {
  resolveLatestSourceCredentialSecret,
  resolveTikHubProviderSecret,
  resolveTikHubTokenForUser,
  resolveTikHubTokenForHotTrends,
  resolveDouhotEndpointForHotTrends,
  HOT_TREND_SYSTEM_CREDENTIAL_USER_ID,
  type CredentialResolverDeps,
} from "./credential-resolvers.js";
export type { AppServices, CoreSetupResult, ObjectStorageConfig } from "./app-services.js";