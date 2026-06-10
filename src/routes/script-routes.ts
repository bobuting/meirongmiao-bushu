/**
 * 统一脚本路由
 *
 * 提供脚本管理的 REST API，包括：
 * - 查询脚本列表
 * - 创建脚本
 * - 获取脚本详情
 * - 删除脚本
 * - 批量删除脚本
 * - 查询项目脚本
 * - 设置项目选中脚本
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ScriptTypeValue } from "../contracts/types.js";
import { requireUser } from "../services/auth/route-guards.js";
import { AppError } from "../core/errors.js";

export function registerScriptRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // GET /scripts - 查询脚本列表
  app.get("/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const query = (request.query as Record<string, unknown>) ?? {};

    const projectId = query.projectId as string | undefined;
    const userId = query.userId as string | undefined;

    if (projectId) {
      return { scripts: await ctx.scriptLibraryService.listByProjectId(projectId) };
    }

    const targetUserId = userId ?? user.id;
    return { scripts: await ctx.scriptLibraryService.listByUserId(targetUserId) };
  });

  // POST /scripts - 创建脚本
  app.post("/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      projectId?: string;
      title: string;
      content: string;
      type: ScriptTypeValue;
      tags?: string[];
      sourceScriptId?: string;
      previousScriptId?: string;
    };

    const script = await ctx.scriptLibraryService.create(user.id, {
      projectId: body.projectId,
      title: body.title,
      content: body.content,
      type: body.type,
      tags: body.tags,
      sourceScriptId: body.sourceScriptId,
      previousScriptId: body.previousScriptId,
    });

    return script;
  });

  // GET /scripts/:scriptId - 获取脚本详情
  app.get("/scripts/:scriptId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { scriptId: string };

    const script = await ctx.scriptLibraryService.findById(params.scriptId);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }

    return script;
  });

  // DELETE /scripts/:scriptId - 删除脚本（仅删除用户脚本关联记录）
  app.delete("/scripts/:scriptId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { scriptId: string };

    // 只删除当前用户与该脚本的关联记录（不删除脚本数据本身）
    const assoc = await ctx.repos.userScriptAssocs.findByUserIdAndScriptId(user.id, params.scriptId);
    if (assoc) {
      await ctx.repos.userScriptAssocs.delete(assoc.id);
    }

    return { ok: true, message: "脚本关联已删除" };
  });

  // POST /scripts/batch-delete - 批量删除脚本（仅删除用户脚本关联记录）
  app.post("/scripts/batch-delete", async (request) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as { scriptIds?: string[] }) ?? {};

    const scriptIds = [...new Set((body.scriptIds ?? []).filter(Boolean))];
    let deleted = 0;
    for (const scriptId of scriptIds) {
      const assoc = await ctx.repos.userScriptAssocs.findByUserIdAndScriptId(user.id, scriptId);
      if (assoc) {
        await ctx.repos.userScriptAssocs.delete(assoc.id);
        deleted += 1;
      }
    }

    return { ok: true, deleted };
  });

  // GET /projects/:projectId/scripts - 查询项目所有脚本
  app.get("/projects/:projectId/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 验证项目所有权
    const project = await ctx.repos.projects.findById(params.projectId);
    if (!project || project.userId !== user.id) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }

    const scripts = await ctx.scriptLibraryService.listByProjectId(params.projectId);
    return { scripts, activeScriptId: project.activeScriptId };
  });

  // GET /projects/:projectId/scripts/latest - 获取项目最新脚本
  app.get("/projects/:projectId/scripts/latest", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 验证项目所有权
    const project = await ctx.repos.projects.findById(params.projectId);
    if (!project || project.userId !== user.id) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }

    // 直接查询已确认脚本，不依赖 nrm_project_script_assoc
    const script = await ctx.repos.scriptData.findConfirmedByProjectId(params.projectId);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "项目暂无脚本");
    }

    return {
      id: script.id,
      version: 1,
      sourceType: script.source_type ?? "original",
      durationSec: script.duration_seconds ?? 30,
      payload: {
        basicInfo: script.basic_info ?? "",
        roleTable: script.role_table ?? "",
        outfitTable: script.outfit_table ?? "",
        storyboard: script.storyboard ?? "",
      },
    };
  });

  // PUT /projects/:projectId/active-script - 设置项目选中脚本
  app.put("/projects/:projectId/active-script", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { scriptId: string | null };

    // 验证项目所有权
    const project = await ctx.repos.projects.findById(params.projectId);
    if (!project || project.userId !== user.id) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }

    // 如果设置新脚本，验证脚本存在且属于该项目
    if (body.scriptId) {
      const script = await ctx.scriptLibraryService.findById(body.scriptId);
      if (!script || script.projectId !== params.projectId) {
        throw new AppError(400, "INVALID_SCRIPT", "脚本不属于该项目");
      }
    }

    await ctx.repos.projects.updateActiveScriptId(params.projectId, body.scriptId);

    return { ok: true, activeScriptId: body.scriptId };
  });
}