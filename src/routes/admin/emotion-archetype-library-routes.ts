/**
 * 情感原型库后台管理 API 路由
 * 提供管理端点：统计、列表、添加、编辑、删除、排行
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import { AppError } from "../../core/errors.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { EmotionArchetypeLibraryService } from "../../services/emotion-archetype-library-service.js";

type EmotionCategory =
  | "自我发现"
  | "时间流逝"
  | "人际连接"
  | "意外时刻"
  | "日常仪式"
  | "蜕变逆袭"
  | "身份切换"
  | "仪式庆典";

export function registerAdminEmotionArchetypeLibraryRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  const service = new EmotionArchetypeLibraryService(ctx.repos.emotionArchetypes);
  const repos = ctx.repos;

  // GET /admin/emotion-archetype-library/statistics
  app.get("/admin/emotion-archetype-library/statistics", async (request, reply) => {
    await requireAdmin(ctx, request);
    return reply.send(await repos.emotionArchetypes.getStatistics());
  });

  // GET /admin/emotion-archetype-library/archetypes
  app.get("/admin/emotion-archetype-library/archetypes", async (request, reply) => {
    await requireAdmin(ctx, request);

    const query = request.query as {
      category?: EmotionCategory;
      source?: string;
      isActive?: string;
      page?: string;
      limit?: string;
      sortBy?: string;
    };

    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);

    if (page < 1) throw new AppError(400, "INVALID_PARAM", "page must be >= 1");
    if (limit < 1 || limit > 100) throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 100");

    const sortBy = query.sortBy || "popularity_score";
    const validSortColumns = ["popularity_score", "use_count", "created_at", "category", "name"];
    if (!validSortColumns.includes(sortBy)) {
      throw new AppError(400, "INVALID_PARAM", `sortBy must be one of: ${validSortColumns.join(", ")}`);
    }

    const offset = (page - 1) * limit;
    const { items, total } = await repos.emotionArchetypes.findArchetypesPaginated({
      category: query.category,
      source: query.source,
      isActive: query.isActive !== undefined ? query.isActive === "true" : undefined,
      sortBy,
      limit,
      offset,
    });

    return reply.send({
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        emotionCore: row.emotion_core,
        moment: row.moment,
        conflict: row.conflict,
        clothingRole: row.clothing_role,
        popularityScore: Number(row.popularity_score),
        useCount: row.use_count,
        avgUserRating: row.avg_user_rating ? Number(row.avg_user_rating) : null,
        lastUsedAt: row.last_used_at,
        isActive: row.is_active,
        source: row.source,
        suitableStyles: row.suitable_styles || [],
        suitableAge: row.suitable_age || [],
        suitableGender: row.suitable_gender || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  });

  // POST /admin/emotion-archetype-library/archetypes
  app.post("/admin/emotion-archetype-library/archetypes", async (request, reply) => {
    await requireAdmin(ctx, request);

    const body = request.body as {
      id?: string;
      name: string;
      category: EmotionCategory;
      emotionCore: string;
      moment: string;
      conflict: string;
      clothingRole: string;
      visualCues?: string[];
      duration?: string;
      shotCount?: number;
      syncMode?: string;
      suitableStyles?: string[];
      suitableAge?: string[];
      suitableGender?: string[];
    };

    if (!body.name || !body.category || !body.emotionCore || !body.moment) {
      throw new AppError(400, "INVALID_PARAM", "name, category, emotionCore, moment are required");
    }

    const now = Date.now();
    const archetypeId = body.id || `EA-${now}`;

    await repos.emotionArchetypes.insertArchetype({
      id: archetypeId,
      name: body.name,
      category: body.category,
      emotionCore: body.emotionCore,
      moment: body.moment,
      conflict: body.conflict || "",
      clothingRole: body.clothingRole || "",
      visualCues: body.visualCues || [],
      duration: body.duration || "12-18秒",
      shotCount: body.shotCount || 3,
      syncMode: body.syncMode || "情绪同步",
      suitableStyles: body.suitableStyles || ["所有风格"],
      suitableAge: body.suitableAge || ["18-45"],
      suitableGender: body.suitableGender || ["male", "female"],
      createdAt: now,
    });

    return reply.send({ success: true, archetypeId, message: "原型添加成功" });
  });

  // PATCH /admin/emotion-archetype-library/archetypes/:id
  app.patch("/admin/emotion-archetype-library/archetypes/:id", async (request, reply) => {
    await requireAdmin(ctx, request);

    const params = request.params as { id: string };
    const body = request.body as {
      name?: string;
      category?: EmotionCategory;
      emotionCore?: string;
      moment?: string;
      conflict?: string;
      clothingRole?: string;
      popularityScore?: number;
      isActive?: boolean;
      suitableStyles?: string[];
      suitableAge?: string[];
      suitableGender?: string[];
    };

    if (body.popularityScore !== undefined && (body.popularityScore < 0 || body.popularityScore > 1)) {
      throw new AppError(400, "INVALID_PARAM", "popularityScore must be between 0 and 1");
    }

    const updates: { field: string; value: unknown; isJsonb?: boolean }[] = [];
    if (body.name) updates.push({ field: "name", value: body.name });
    if (body.category) updates.push({ field: "category", value: body.category });
    if (body.emotionCore) updates.push({ field: "emotion_core", value: body.emotionCore });
    if (body.moment) updates.push({ field: "moment", value: body.moment });
    if (body.conflict) updates.push({ field: "conflict", value: body.conflict });
    if (body.clothingRole) updates.push({ field: "clothing_role", value: body.clothingRole });
    if (body.popularityScore !== undefined) updates.push({ field: "popularity_score", value: body.popularityScore });
    if (body.isActive !== undefined) updates.push({ field: "is_active", value: body.isActive });
    if (body.suitableStyles) updates.push({ field: "suitable_styles", value: JSON.stringify(body.suitableStyles), isJsonb: true });
    if (body.suitableAge) updates.push({ field: "suitable_age", value: JSON.stringify(body.suitableAge), isJsonb: true });
    if (body.suitableGender) updates.push({ field: "suitable_gender", value: JSON.stringify(body.suitableGender), isJsonb: true });

    if (updates.length === 0) {
      throw new AppError(400, "INVALID_PARAM", "至少需要提供一个更新字段");
    }

    await repos.emotionArchetypes.updateArchetypeDynamic(params.id, updates, Date.now());
    return reply.send({ success: true, message: "原型更新成功" });
  });

  // DELETE /admin/emotion-archetype-library/archetypes/:id
  app.delete("/admin/emotion-archetype-library/archetypes/:id", async (request, reply) => {
    await requireAdmin(ctx, request);

    const params = request.params as { id: string };
    const query = request.query as { hard?: string };

    if (query.hard === "true") {
      await repos.emotionArchetypes.delete(params.id);
    } else {
      await repos.emotionArchetypes.deactivateById(params.id, Date.now());
    }

    return reply.send({ success: true, message: query.hard === "true" ? "原型已删除" : "原型已禁用" });
  });

  // GET /admin/emotion-archetype-library/ranking
  app.get("/admin/emotion-archetype-library/ranking", async (request, reply) => {
    await requireAdmin(ctx, request);

    const query = request.query as { category?: EmotionCategory; limit?: string };
    const limit = parseInt(query.limit || "10", 10);

    if (limit < 1 || limit > 50) {
      throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 50");
    }

    const items = await repos.emotionArchetypes.findRanking({ category: query.category, limit });

    return reply.send({
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        emotionCore: row.emotion_core,
        popularityScore: Number(row.popularity_score),
        useCount: row.use_count,
        avgUserRating: row.avg_user_rating ? Number(row.avg_user_rating) : null,
      })),
    });
  });

  // POST /admin/emotion-archetype-library/recalculate
  app.post("/admin/emotion-archetype-library/recalculate", async (request, reply) => {
    await requireAdmin(ctx, request);

    const startTime = Date.now();
    const logId = await repos.emotionArchetypeRunLogs.insertRunLog({
      runType: "scheduled_update",
      triggerType: "manual",
      startedAt: startTime,
    });

    try {
      const updatedCount = await service.recalculateAllPopularityScores();
      const deactivatedCount = await service.deactivateLowPopularityArchetypes();
      const durationMs = Date.now() - startTime;
      const taskResults = { popularityUpdate: { updatedCount }, deactivation: { deactivatedCount } };

      await repos.emotionArchetypeRunLogs.updateRunLogCompleted(logId, {
        taskResults,
        durationMs,
        completedAt: Date.now(),
      });

      return reply.send({
        success: true,
        updatedCount,
        message: `流行度重算完成，更新 ${updatedCount} 个原型，淘汰 ${deactivatedCount} 个`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await repos.emotionArchetypeRunLogs.updateRunLogFailed(logId, {
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        completedAt: Date.now(),
      });
      throw error;
    }
  });

  // GET /admin/emotion-archetype-library/run-logs
  app.get("/admin/emotion-archetype-library/run-logs", async (request, reply) => {
    await requireAdmin(ctx, request);

    const query = request.query as { runType?: string; status?: string; page?: string; limit?: string };
    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);

    if (page < 1) throw new AppError(400, "INVALID_PARAM", "page must be >= 1");
    if (limit < 1 || limit > 100) throw new AppError(400, "INVALID_PARAM", "limit must be between 1 and 100");

    const offset = (page - 1) * limit;
    const { items, total } = await repos.emotionArchetypeRunLogs.findRunLogsPaginated({
      runType: query.runType,
      status: query.status,
      limit,
      offset,
    });

    return reply.send({
      items: items.map((row) => ({
        id: row.id,
        runType: row.run_type,
        triggerType: row.trigger_type,
        status: row.status,
        taskResults: row.task_results,
        archetypeId: row.archetype_id,
        projectId: row.project_id,
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  });
}
