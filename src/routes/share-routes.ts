/**
 * 公开分享路由
 * 无需认证，提供项目视频分享功能
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { FinalVideosDbService } from "../service/final-videos-db-service.js";

/**
 * 分享路由依赖
 */
export interface ShareRouteDeps {
  finalVideosDbService: FinalVideosDbService;
}

/**
 * 分享页响应数据
 */
export interface ShareProjectResponse {
  project: {
    id: string;
    name: string;
    publishTitle: string | null;
    thumbnailUrl: string | null;
    videoCoverImageUrl: string | null;
    durationSec: number;
    views: number;
    createdAt: number;
    projectKind: string;
    formatLabel: string;
  };
  mainVideo: {
    id: string | null;
    videoUrl: string | null;
    coverImageUrl: string | null;
    durationSec: number | null;
  } | null;
  step4Videos: Array<{
    id: string;
    videoUrl: string | null;
    coverImageUrl: string | null;
    durationSec: number | null;
    createdAt: number;
  }>;
  fissionVideos: Array<{
    id: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    durationSec: number | null;
    fissionType: string;
    createdAt: number;
  }>;
}

/**
 * 注册分享路由
 */
export function registerShareRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ShareRouteDeps
): void {
  const { finalVideosDbService } = deps;

  // 获取项目分享信息（公开 API，无需认证）
  app.get<{ Params: { projectId: string } }>(
    "/share/projects/:projectId",
    async (request) => {
      const { projectId } = request.params;

      // 查询项目
      const project = await ctx.repos.projects.findById(projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }

      // 检查项目是否有成片（只有有成片的项目才能分享）
      if (!project.exportUrl) {
        throw new AppError(404, "PROJECT_NO_VIDEO", "项目暂无成片视频，无法分享");
      }

      // 查询成片视频记录
      const finalVideos = await finalVideosDbService.findByProjectId(projectId);

      // 分离主视频、其他成片视频和裂变视频
      const step4Records = finalVideos.filter((v) => v.videoType === "step4");
      const mainVideoRecord = step4Records[0] ?? null;
      // 其他成片视频（排除第一条，最多 4 个，加上主视频共 5 个）
      const otherStep4Records = step4Records.slice(1, 5);
      const fissionVideoRecords = finalVideos.filter((v) => v.videoType === "fission");

      // 构建主视频数据
      const mainVideo = mainVideoRecord
        ? {
            id: mainVideoRecord.id,
            videoUrl: mainVideoRecord.videoUrl,
            coverImageUrl: mainVideoRecord.coverImageUrl,
            durationSec: mainVideoRecord.durationSec,
          }
        : {
            id: null,
            videoUrl: project.exportUrl,
            coverImageUrl: project.videoCoverImageUrl,
            durationSec: project.durationSec,
          };

      // 构建其他成片视频数据
      const step4Videos = otherStep4Records.map((v) => ({
        id: v.id,
        videoUrl: v.videoUrl,
        coverImageUrl: v.coverImageUrl,
        durationSec: v.durationSec,
        createdAt: v.createdAt,
      }));

      // 构建裂变视频数据
      const fissionVideos = fissionVideoRecords.map((v) => ({
        id: v.id,
        videoUrl: v.videoUrl,
        thumbnailUrl: v.coverImageUrl,
        durationSec: v.durationSec,
        fissionType: "fission",
        createdAt: v.createdAt,
      }));

      // 增加浏览次数
      await ctx.repos.projects.incrementViews(projectId);

      return {
        project: {
          id: project.id,
          name: project.name,
          publishTitle: project.publishTitle,
          thumbnailUrl: project.thumbnailUrl,
          videoCoverImageUrl: project.videoCoverImageUrl,
          durationSec: project.durationSec,
          views: project.views + 1, // 返回更新后的浏览次数
          createdAt: project.createdAt,
          projectKind: project.projectKind,
          formatLabel: project.formatLabel,
        },
        mainVideo,
        step4Videos,
        fissionVideos,
      } as ShareProjectResponse;
    }
  );
}