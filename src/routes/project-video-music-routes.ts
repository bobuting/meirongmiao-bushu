/**
 * 项目-视频音乐关联路由
 *
 * 提供 6 个端点：
 * - POST /projects/:projectId/video-musics/batch-save — 批量保存推荐列表
 * - GET /projects/:projectId/video-musics — 获取项目音乐列表
 * - PUT /projects/:projectId/video-musics/:id/select — 选择音乐
 * - PUT /projects/:projectId/video-musics/clear-selection — 清空选择
 * - PUT /projects/:projectId/video-musics/:id — 更新音乐参数
 * - DELETE /projects/:projectId/video-musics/:id — 删除音乐记录
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User, ProjectVideoMusic } from "../contracts/types.js";
import type {
  BatchSaveProjectVideoMusicInput,
  ProjectVideoMusicUpdatePatch,
} from "../contracts/repository-ports/project-video-music-repository.js";
import { AppError } from "../core/errors.js";

interface ProjectVideoMusicRouteDependencies {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

/** 项目音乐列表响应 */
interface ProjectVideoMusicListResponse {
  items: ProjectVideoMusic[];
  selectedMusic: ProjectVideoMusic | null;
}

/** 批量保存请求体 */
interface BatchSaveRequestBody {
  musics: BatchSaveProjectVideoMusicInput[];
  selectedMusicId?: string | null;
}

/** 批量保存响应 */
interface BatchSaveResponse {
  success: boolean;
  items: ProjectVideoMusic[];
}

/** 选择音乐响应 */
interface SelectResponse {
  success: boolean;
  item: ProjectVideoMusic;
}

/** 更新音乐请求体 */
interface UpdateRequestBody {
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** 更新音乐响应 */
interface UpdateResponse {
  success: boolean;
  item: ProjectVideoMusic;
}

/** 删除响应 */
interface DeleteResponse {
  success: boolean;
  removedId: string;
}

export function registerProjectVideoMusicRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectVideoMusicRouteDependencies,
): void {
  const repos = ctx.repos;

  // POST /projects/:projectId/video-musics/batch-save
  // 批量保存推荐列表（覆盖旧数据）
  app.post("/projects/:projectId/video-musics/batch-save", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as BatchSaveRequestBody) ?? { musics: [] };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证 musics 不为空
    if (!body.musics || body.musics.length === 0) {
      throw new AppError(400, "MUSICS_REQUIRED", "音乐列表不能为空");
    }

    // 批量保存
    const items = await repos.projectVideoMusics.batchSave(
      project.id,
      body.musics,
      body.selectedMusicId ?? null,
    );

    return {
      success: true,
      items,
    } as BatchSaveResponse;
  });

  // GET /projects/:projectId/video-musics
  // 获取项目音乐列表
  app.get("/projects/:projectId/video-musics", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 获取列表
    const items = await repos.projectVideoMusics.listByProject(project.id);
    const selectedMusic = await repos.projectVideoMusics.getSelected(project.id);

    return {
      items,
      selectedMusic,
    } as ProjectVideoMusicListResponse;
  });

  // PUT /projects/:projectId/video-musics/:id/select
  // 选择音乐（设置 is_selected=true）
  app.put("/projects/:projectId/video-musics/:id/select", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string; id: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 选择音乐
    const item = await repos.projectVideoMusics.select(project.id, params.id);

    return {
      success: true,
      item,
    } as SelectResponse;
  });

  // PUT /projects/:projectId/video-musics/clear-selection
  // 清空选择（所有 is_selected 设为 false）
  app.put("/projects/:projectId/video-musics/clear-selection", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 清空选择
    await repos.projectVideoMusics.clearSelection(project.id);

    return {
      success: true,
    };
  });

  // PUT /projects/:projectId/video-musics/:id
  // 更新音乐参数（volume、淡入淡出）
  app.put("/projects/:projectId/video-musics/:id", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string; id: string };
    const body = (request.body as UpdateRequestBody) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证记录属于该项目
    const record = await repos.projectVideoMusics.findById(params.id);
    if (!record || record.projectId !== project.id) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    // 更新参数
    const patch: ProjectVideoMusicUpdatePatch = {};
    if (body.volume !== undefined) patch.volume = body.volume;
    if (body.fadeInSec !== undefined) patch.fadeInSec = body.fadeInSec;
    if (body.fadeOutSec !== undefined) patch.fadeOutSec = body.fadeOutSec;

    const item = await repos.projectVideoMusics.update(params.id, patch);

    return {
      success: true,
      item,
    } as UpdateResponse;
  });

  // DELETE /projects/:projectId/video-musics/:id
  // 删除音乐记录
  app.delete("/projects/:projectId/video-musics/:id", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const params = request.params as { projectId: string; id: string };

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证记录属于该项目
    const record = await repos.projectVideoMusics.findById(params.id);
    if (!record || record.projectId !== project.id) {
      throw new AppError(404, "PROJECT_VIDEO_MUSIC_NOT_FOUND", "音乐记录不存在");
    }

    // 删除
    await repos.projectVideoMusics.delete(params.id);

    return {
      success: true,
      removedId: params.id,
    } as DeleteResponse;
  });
}
