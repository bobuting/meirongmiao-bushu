/**
 * 审美特征库定时更新任务初始化模块
 *
 * 负责构建 AestheticLibraryUpdateScheduler 及其依赖。
 */

import type { AppContext } from "../core/app-context.js";
import { AestheticLibraryUpdateService } from "../modules/aesthetic-library-update-service.js";
import { AestheticLibraryUpdateScheduler } from "../scheduler/aesthetic-library-update-scheduler.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SetupAestheticLibraryUpdate");

/**
 * 审美特征库更新任务配置参数
 */
export interface AestheticLibraryUpdateSetupParams {
  ctx: AppContext;
  /** 是否在启动时立即执行（用于测试） */
  runOnStartup?: boolean;
}

/**
 * 创建审美特征库更新调度器
 */
export function setupAestheticLibraryUpdate(
  params: AestheticLibraryUpdateSetupParams
): AestheticLibraryUpdateScheduler | null {
  const { ctx, runOnStartup = false } = params;

  // 检查必要配置
  const tikhubApiKey = process.env.TIKHUB_API_TOKEN;
  if (!tikhubApiKey) {
    log.warn("TikHub API Key 未配置，审美特征库定时更新将不启动");
    return null;
  }

  // 创建服务实例（LLM 调用通过 ProviderRouteKey 体系，无需单独配置 API Key）
  const updateService = new AestheticLibraryUpdateService(ctx.repos, ctx);

  // 创建调度器实例（单例）
  const scheduler = AestheticLibraryUpdateScheduler.getInstance(ctx.pool, updateService);

  // 启动定时任务
  scheduler.start();

  log.info("审美特征库定时更新任务已启动（每日凌晨 4 点执行）");

  // 如果需要立即执行（测试模式）
  if (runOnStartup) {
    log.info("测试模式：立即执行审美特征库更新");
    void updateService.runScheduledUpdate("manual").then((result) => {
      if (result.success) {
        log.info(`测试执行完成：特征 ${result.featuresUpdated} 个`);
      } else {
        log.warn(`测试执行失败：${result.error}`);
      }
    });
  }

  return scheduler;
}

/**
 * 重置审美特征库更新调度器（用于测试或重新初始化）
 */
export function resetAestheticLibraryUpdate(): void {
  AestheticLibraryUpdateScheduler.resetInstance();
}
