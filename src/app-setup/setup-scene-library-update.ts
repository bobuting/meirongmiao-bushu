/**
 * 场景库定时更新任务初始化
 */

import type { AppContext } from "../core/app-context.js";
import { SceneLibraryUpdateService } from "../modules/scene-library-update-service.js";
import { SceneLibraryUpdateScheduler } from "../scheduler/scene-library-update-scheduler.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SetupSceneLibraryUpdate");

interface SceneLibraryUpdateSetupParams {
  ctx: AppContext;
  runOnStartup?: boolean;
}

/**
 * 初始化场景库定时更新任务
 * TikHub API Key 未配置时静默跳过
 */
export function setupSceneLibraryUpdate(params: SceneLibraryUpdateSetupParams): SceneLibraryUpdateScheduler | null {
  const { ctx, runOnStartup = false } = params;

  const tikhubApiKey = process.env.TIKHUB_API_TOKEN;
  if (!tikhubApiKey) {
    log.warn("TikHub API Key 未配置，场景库定时更新将不启动");
    return null;
  }

  const updateService = new SceneLibraryUpdateService(ctx.repos, ctx);
  const scheduler = SceneLibraryUpdateScheduler.getInstance(ctx.pool, updateService);
  scheduler.start();

  log.info("场景库定时更新任务已启动（每日凌晨 4:30 执行）");

  if (runOnStartup) {
    log.info("测试模式：立即执行场景库更新");
    void updateService.runScheduledUpdate("manual").then((result) => {
      if (result.success) {
        log.info(`测试执行完成：场景 ${result.scenesUpdated} 个`);
      } else {
        log.warn(`测试执行失败：${result.error}`);
      }
    });
  }

  return scheduler;
}

/**
 * 重置场景库定时更新任务（测试/调试用）
 */
export function resetSceneLibraryUpdate(): void {
  SceneLibraryUpdateScheduler.resetInstance();
}
