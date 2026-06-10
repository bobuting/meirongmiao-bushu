// src/routes/admin-aesthetic-library-routes.ts
/**
 * 审美特征库后台管理 API 路由
 * 提供 8 个管理端点：统计、列表、添加、编辑、删除、排行、运行记录、手动触发
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { AdminAestheticLibraryService } from "../modules/admin-aesthetic-library-service.js";
import { AestheticLibraryUpdateService, type UpdateTriggerType, type UpdateLogStatus } from "../modules/aesthetic-library-update-service.js";
import { getLogger } from "../core/logger/index.js";
import type { AgeGroupRange } from "../constants/age-groups.js";
import { AGE_GROUP_RANGES } from "../constants/age-groups.js";

const log = getLogger("AdminAestheticLibraryRoutes");

/**
 * 注册审美特征库后台管理路由
 */
export function registerAdminAestheticLibraryRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  // 使用 ctx.repos 创建服务实例
  const service = new AdminAestheticLibraryService(ctx.repos);

  // ========================================
  // GET /admin/aesthetic-library/statistics
  // 获取统计数据
  // ========================================
  app.get("/admin/aesthetic-library/statistics", async (request, reply) => {
    await requireAdmin(ctx, request);
    const stats = await service.getStatistics();
    return reply.send(stats);
  });

  // ========================================
  // GET /admin/aesthetic-library/features
  // 获取特征列表（分页）
  // ========================================
  app.get("/admin/aesthetic-library/features", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      ageRange?: AgeGroupRange;
      featureCategory?: string;
      page?: string;
      limit?: string;
    };

    // 解析分页参数
    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);

    // 验证参数
    if (page < 1) {
      throw new AppError(400, "INVALID_PARAM", "page must be >= 1");
    }
    if (limit < 1 || limit > 100) {
      throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 100");
    }

    const result = await service.listFeatures({
      ageRange: query.ageRange,
      featureCategory: query.featureCategory,
      page,
      limit,
    });
    return reply.send(result);
  });

  // ========================================
  // POST /admin/aesthetic-library/features
  // 添加新特征
  // ========================================
  app.post("/admin/aesthetic-library/features", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = request.body as {
      featureCategory: string;
      featureName: string;
      featureDescription: string;
      ethnicityApplicable: string[];
      ageRange: AgeGroupRange;
    };

    // 验证必填字段
    if (!body.featureCategory || !body.featureName || !body.featureDescription) {
      throw new AppError(400, "INVALID_PARAM", "featureCategory, featureName, featureDescription are required");
    }

    // 验证 ageRange
    if (!AGE_GROUP_RANGES.includes(body.ageRange)) {
      throw new AppError(400, "INVALID_PARAM", `ageRange must be one of: ${AGE_GROUP_RANGES.join(", ")}`);
    }

    const result = await service.addFeature(body);
    return reply.send(result);
  });

  // ========================================
  // PATCH /admin/aesthetic-library/features/:id
  // 编辑特征
  // ========================================
  app.patch("/admin/aesthetic-library/features/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as {
      featureName?: string;
      featureDescription?: string;
      ethnicityApplicable?: string[];
      popularityScore?: number;
    };

    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(params.id)) {
      throw new AppError(400, "INVALID_PARAM", "id must be a valid UUID");
    }

    // 验证 popularityScore 范围（数据库 DECIMAL(3,2) 最大支持 0.99）
    if (body.popularityScore !== undefined && (body.popularityScore < 0 || body.popularityScore > 1)) {
      throw new AppError(400, "INVALID_PARAM", "popularityScore must be between 0 and 1");
    }

    const result = await service.editFeature(params.id, body);
    return reply.send(result);
  });

  // ========================================
  // DELETE /admin/aesthetic-library/features/:id
  // 删除特征（软删除）
  // ========================================
  app.delete("/admin/aesthetic-library/features/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };

    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(params.id)) {
      throw new AppError(400, "INVALID_PARAM", "id must be a valid UUID");
    }

    const result = await service.deleteFeature(params.id);
    return reply.send(result);
  });

  // ========================================
  // GET /admin/aesthetic-library/ranking
  // 获取热度排行
  // ========================================
  app.get("/admin/aesthetic-library/ranking", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      ageRange?: AgeGroupRange;
      limit?: string;
    };

    // 解析 limit 参数
    const limit = parseInt(query.limit || "10", 10);

    // 验证 limit 范围
    if (limit < 1 || limit > 50) {
      throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 50");
    }

    const result = await service.getPopularityRanking({
      ageRange: query.ageRange,
      limit,
    });
    return reply.send(result);
  });

  // ========================================
  // GET /admin/aesthetic-library/update-logs
  // 查询运行记录（分页）
  // ========================================
  app.get("/admin/aesthetic-library/update-logs", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as {
      page?: string;
      limit?: string;
      triggerType?: UpdateTriggerType;
      status?: UpdateLogStatus;
    };

    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);

    if (page < 1) {
      throw new AppError(400, "INVALID_PARAM", "page must be >= 1");
    }
    if (limit < 1 || limit > 100) {
      throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 100");
    }

    const updateService = new AestheticLibraryUpdateService(ctx.repos, ctx);
    const result = await updateService.listUpdateLogs({
      page,
      limit,
      triggerType: query.triggerType,
      status: query.status,
    });
    return reply.send(result);
  });

  // ========================================
  // POST /admin/aesthetic-library/trigger-update
  // 手动触发更新（后台异步执行）
  // ========================================
  app.post("/admin/aesthetic-library/trigger-update", async (request, reply) => {
    await requireAdmin(ctx, request);

    // 清理超时的僵尸任务（进程崩溃/中断留下的 running 状态，超过 30 分钟视为超时）
    await ctx.repos.aestheticUpdateLogs.cleanupZombieTasks();

    // 检查是否有正在运行的任务
    if (await ctx.repos.aestheticUpdateLogs.hasRunningTask()) {
      throw new AppError(409, "UPDATE_IN_PROGRESS", "已有更新任务正在运行，请稍后再试");
    }

    const body = request.body as {
      ageRange?: AgeGroupRange;
    } | null;

    // 不指定 ageRange 时，依次运行所有年龄段（与定时任务一致）
    // 指定 ageRange 时，只运行指定年龄段
    const ageRanges: AgeGroupRange[] = body?.ageRange
      ? [body.ageRange]
      : [...AGE_GROUP_RANGES];

    // 后台执行，不等待完成
    const runAgeRanges = async () => {
      for (const ageRange of ageRanges) {
        try {
          const updateService = new AestheticLibraryUpdateService(ctx.repos, ctx, { ageRange });
          const result = await updateService.updateLibrary({ ageRange, triggerType: "manual" });
          log.info(`手动触发完成（${ageRange}）：特征 ${result.updated} 个`);
        } catch (error) {
          log.error({ error: error instanceof Error ? error.message : String(error) }, `手动触发失败（${ageRange}）`);
        }
      }
    };

    void runAgeRanges();

    return reply.send({ success: true, message: "更新任务已触发，请在运行记录中查看进度" });
  });
}