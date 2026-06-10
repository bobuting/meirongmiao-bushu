/**
 * 成片管理后台路由
 * 仅管理员可访问，提供项目列表、成片列表、软删除功能
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import { requireAdmin } from "../../services/auth/route-guards.js";

/** 项目摘要（有成片记录的项目） */
interface ProjectSummary {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  finalVideoCount: number;
  updatedAt: number;
  coverImageUrl: string | null;
  projectKind: string;
}

/** 注册成片管理后台路由 */
export async function registerAdminFinalVideosRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  // 项目列表：有成片记录的项目（支持分页，默认前 15 个，带缩略图）
  app.get("/projects", async (request: FastifyRequest<{ Querystring: { userId?: string; search?: string; offset?: number; limit?: number } }>, reply: FastifyReply) => {
    await requireAdmin(ctx, request);
    const { userId, search, offset = 0, limit = 15 } = request.query;

    const rows = await ctx.repos.finalVideos.adminListProjects({ userId, search, limit, offset });
    reply.send({ projects: rows });
  });

  // 成片列表：按项目ID查询
  app.get("/", async (request: FastifyRequest<{ Querystring: { projectId: string } }>, reply: FastifyReply) => {
    await requireAdmin(ctx, request);
    const { projectId } = request.query;

    if (!projectId) {
      reply.code(400).send({ error: "projectId 参数必填" });
      return;
    }

    const rows = await ctx.repos.finalVideos.adminListByProject(projectId);
    reply.send({ videos: rows });
  });

  // 软删除成片
  app.delete("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params;

    const creatorId = await ctx.repos.finalVideos.findCreatorId(id);
    if (creatorId === null) {
      reply.code(404).send({ error: "成片不存在或已删除" });
      return;
    }

    await ctx.repos.finalVideos.adminSoftDelete(id, Date.now());

    request.log.info({ videoId: id, action: "soft_delete_final_video" }, "管理员软删除成片");

    reply.send({ ok: true });
  });
}
