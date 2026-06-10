// src/routes/admin-model-preset-routes.ts
/**
 * 模型预设管理 API 路由
 * 提供预设的 CRUD 操作接口
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import type { CreateModelPresetInput, UpdateModelPresetInput } from "../contracts/model-preset-contract.js";

/**
 * 注册模型预设管理路由
 */
export function registerAdminModelPresetRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // GET /admin/model-presets - 获取预设列表
  app.get("/admin/model-presets", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const query = request.query as { type?: string };
    const presets = ctx.modelPresetService.listPresets(admin, query.type);
    return { presets };
  });

  // GET /admin/model-presets/:id - 获取单个预设
  app.get("/admin/model-presets/:id", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const preset = ctx.modelPresetService.getPreset(admin, params.id);
    if (!preset) {
      throw new AppError(404, "NOT_FOUND", "Preset not found");
    }
    return { preset };
  });

  // POST /admin/model-presets - 创建预设
  app.post("/admin/model-presets", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as CreateModelPresetInput;
    const preset = ctx.modelPresetService.createPreset(admin, body);
    return preset;
  });

  // PATCH /admin/model-presets/:id - 更新预设
  app.patch("/admin/model-presets/:id", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as UpdateModelPresetInput;
    const preset = ctx.modelPresetService.updatePreset(admin, params.id, body);
    return preset;
  });

  // DELETE /admin/model-presets/:id - 删除预设
  app.delete("/admin/model-presets/:id", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    ctx.modelPresetService.deletePreset(admin, params.id);
    return { ok: true };
  });
}