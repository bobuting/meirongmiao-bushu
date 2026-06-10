// src/routes/admin-scene-library-routes.ts
/**
 * 场景库后台管理 API 路由
 * 提供 8 个管理端点：统计、列表、添加、编辑、删除、排行、运行记录、手动触发
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { AdminSceneLibraryService, type SceneCategory } from "../modules/admin-scene-library-service.js";
import { SceneLibraryUpdateService, type SceneUpdateTriggerType, type SceneUpdateLogStatus } from "../modules/scene-library-update-service.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("AdminSceneLibraryRoutes");

/**
 * 注册场景库后台管理路由
 */
export function registerAdminSceneLibraryRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const service = new AdminSceneLibraryService(ctx.repos);

  // GET /admin/scene-library/statistics
  app.get("/admin/scene-library/statistics", async (request, reply) => {
    await requireAdmin(ctx, request);
    const stats = await service.getStatistics();
    return reply.send(stats);
  });

  // GET /admin/scene-library/scenes
  app.get("/admin/scene-library/scenes", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      sceneCategory?: SceneCategory;
      page?: string;
      limit?: string;
    };

    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);

    if (page < 1) throw new AppError(400, "INVALID_PARAM", "page must be >= 1");
    if (limit < 1 || limit > 100) throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 100");

    const result = await service.listScenes({
      sceneCategory: query.sceneCategory,
      page,
      limit,
    });
    return reply.send(result);
  });

  // POST /admin/scene-library/scenes
  app.post("/admin/scene-library/scenes", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = request.body as {
      sceneCategory: SceneCategory;
      sceneCategoryCn?: string;
      sceneName: string;
      sceneNameCn?: string;
      sceneDescription: string;
      sceneDescriptionCn?: string;
      sceneTags?: string[];
      lightingType?: string;
      suitability?: string[];
    };

    if (!body.sceneCategory || !body.sceneName || !body.sceneDescription) {
      throw new AppError(400, "INVALID_PARAM", "sceneCategory, sceneName, sceneDescription are required");
    }

    const validCategories: SceneCategory[] = ["indoor", "outdoor", "e_commerce", "studio", "lifestyle", "commercial"];
    if (!validCategories.includes(body.sceneCategory)) {
      throw new AppError(400, "INVALID_PARAM", `sceneCategory must be one of: ${validCategories.join(", ")}`);
    }

    const result = await service.addScene(body);
    return reply.send(result);
  });

  // PATCH /admin/scene-library/scenes/:id
  app.patch("/admin/scene-library/scenes/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as {
      sceneName?: string;
      sceneDescription?: string;
      sceneTags?: string[];
      lightingType?: string;
      suitability?: string[];
      popularityScore?: number;
    };

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(params.id)) throw new AppError(400, "INVALID_PARAM", "id must be a valid UUID");

    if (body.popularityScore !== undefined && (body.popularityScore < 0 || body.popularityScore > 1)) {
      throw new AppError(400, "INVALID_PARAM", "popularityScore must be between 0 and 1");
    }

    const result = await service.editScene(params.id, body);
    return reply.send(result);
  });

  // DELETE /admin/scene-library/scenes/:id
  app.delete("/admin/scene-library/scenes/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(params.id)) throw new AppError(400, "INVALID_PARAM", "id must be a valid UUID");

    const result = await service.deleteScene(params.id);
    return reply.send(result);
  });

  // GET /admin/scene-library/ranking
  app.get("/admin/scene-library/ranking", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      sceneCategory?: SceneCategory;
      limit?: string;
    };

    const limit = parseInt(query.limit || "10", 10);
    if (limit < 1 || limit > 50) throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 50");

    const result = await service.getPopularityRanking({
      sceneCategory: query.sceneCategory,
      limit,
    });
    return reply.send(result);
  });

  // GET /admin/scene-library/update-logs
  app.get("/admin/scene-library/update-logs", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      page?: string;
      limit?: string;
      triggerType?: SceneUpdateTriggerType;
      status?: SceneUpdateLogStatus;
    };

    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);
    if (page < 1) throw new AppError(400, "INVALID_PARAM", "page must be >= 1");
    if (limit < 1 || limit > 100) throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 100");

    const updateService = new SceneLibraryUpdateService(ctx.repos, ctx);
    const result = await updateService.listUpdateLogs({
      page, limit,
      triggerType: query.triggerType,
      status: query.status,
    });
    return reply.send(result);
  });

  // POST /admin/scene-library/trigger-update
  app.post("/admin/scene-library/trigger-update", async (request, reply) => {
    await requireAdmin(ctx, request);

    // 清理超时僵尸任务
    await ctx.repos.sceneLibraryUpdateLogs.cleanupZombieTasks();

    // 检查是否有正在运行的任务
    if (await ctx.repos.sceneLibraryUpdateLogs.hasRunningTask()) {
      throw new AppError(409, "UPDATE_IN_PROGRESS", "已有更新任务正在运行，请稍后再试");
    }

    const body = request.body as { sceneCategory?: SceneCategory } | null;
    const categories = body?.sceneCategory
      ? [body.sceneCategory]
      : SceneLibraryUpdateService.getSceneCategories();

    // 后台执行
    const runCategories = async () => {
      for (const category of categories) {
        try {
          const updateService = new SceneLibraryUpdateService(ctx.repos, ctx, { sceneCategory: category });
          const result = await updateService.updateLibrary({ sceneCategory: category, triggerType: "manual" });
          log.info(`手动触发完成（${category}）：场景 ${result.updated} 个`);
        } catch (error) {
          log.error({ error: error instanceof Error ? error.message : String(error) }, `手动触发失败（${category}）`);
        }
      }
    };

    void runCategories();
    return reply.send({ success: true, message: "场景库更新任务已触发，请在运行记录中查看进度" });
  });
}
