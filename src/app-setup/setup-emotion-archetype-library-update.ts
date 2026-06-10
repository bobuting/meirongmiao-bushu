/**
 * 情感原型库后置微调调度器启动模块
 *
 * 在 app 启动时初始化并启动定时任务（凌晨 5 点执行）
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { EmotionArchetypeLibraryUpdateScheduler } from "../scheduler/emotion-archetype-library-update-scheduler.js";
import { EmotionArchetypeLibraryService } from "../services/emotion-archetype-library-service.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("SetupEmotionArchetypeLibraryUpdate");

/**
 * 情感原型库后置微调调度器启动依赖
 */
export interface SetupEmotionArchetypeLibraryUpdateDeps {
  app: FastifyInstance;
  pool: Pool;
  repos: PgRepositoryCollection;
}

/**
 * 启动情感原型库后置微调调度器
 *
 * 注册 onReady 和 onClose 钩子：
 * - onReady: 启动定时任务（凌晨 5 点执行）
 * - onClose: 停止定时任务
 */
export function setupEmotionArchetypeLibraryUpdate(deps: SetupEmotionArchetypeLibraryUpdateDeps): void {
  const { app, pool, repos } = deps;

  // 创建服务实例
  const libraryService = new EmotionArchetypeLibraryService(repos.emotionArchetypes);

  // 创建调度器实例（单例）
  const scheduler = EmotionArchetypeLibraryUpdateScheduler.getInstance(libraryService, repos, pool);

  // 注册 onReady 钩子：启动定时任务
  app.ready(() => {
    scheduler.start();
    log.info("情感原型库后置微调调度器已启动");
  });

  // 注册 onClose 钩子：停止定时任务
  app.addHook("onClose", async () => {
    scheduler.stop();
    log.info("情感原型库后置微调调度器已停止");
  });

  // 重置单例（用于测试或重新初始化）
  EmotionArchetypeLibraryUpdateScheduler.resetInstance();
}
