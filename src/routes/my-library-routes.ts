/**
 * my-library-routes.ts
 * 个人内容库路由 - 脚本和分镜库
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";
import { MY_LIBRARY_ROUTE_PREFIX } from "../contracts/my-library-api.js";
import { AppError } from "../core/errors.js";

/**
 * 注册个人内容库路由
 * GET /my-library/scripts - 获取用户脚本列表
 * GET /my-library/storyboards - 获取用户分镜列表
 */
export function registerMyLibraryRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------------------------------------------------------------------
  // GET /my-library/scripts — 获取用户脚本列表
  // ---------------------------------------------------------------------------
  app.get(`${MY_LIBRARY_ROUTE_PREFIX}/scripts`, async (request) => {
    const user = await requireUser(ctx, request);
    const query = request.query as {
      page?: string;
      pageSize?: string;
      keyword?: string;
      tags?: string;
      sourceType?: string;
      updatedAfter?: string;
      updatedBefore?: string;
    };

    return await ctx.myLibraryService.listMyScripts(user, {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      tags: query.tags ? query.tags.split(",").filter((t) => t.trim().length > 0) : undefined,
      sourceType: query.sourceType,
      updatedAfter: query.updatedAfter,
      updatedBefore: query.updatedBefore,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /my-library/scripts/:id — 获取单个脚本详情
  // ---------------------------------------------------------------------------
  app.get(`${MY_LIBRARY_ROUTE_PREFIX}/scripts/:id`, async (request) => {
    const user = await requireUser(ctx, request);
    const { id } = request.params as { id: string };
    const script = await ctx.myLibraryService.getMyScriptById(user, id);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "Script not found");
    }
    return script;
  });

  // ---------------------------------------------------------------------------
  // GET /my-library/storyboards — 获取用户分镜列表
  // ---------------------------------------------------------------------------
  app.get(`${MY_LIBRARY_ROUTE_PREFIX}/storyboards`, async (request) => {
    const user = await requireUser(ctx, request);
    const query = request.query as {
      page?: string;
      pageSize?: string;
      keyword?: string;
      tags?: string;
      sourceType?: string;
      updatedAfter?: string;
      updatedBefore?: string;
    };

    return await ctx.myLibraryService.listMyStoryboards(user, {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      tags: query.tags ? query.tags.split(",").filter((t) => t.trim().length > 0) : undefined,
      sourceType: query.sourceType,
      updatedAfter: query.updatedAfter,
      updatedBefore: query.updatedBefore,
    });
  });
}