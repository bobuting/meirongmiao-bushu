/**
 * 图片项目公开分享路由
 * 无需认证，提供图片项目分享功能
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";

/**
 * 图片项目分享页响应数据
 */
export interface ImageShareProjectResponse {
  project: {
    id: string;
    name: string;
    status: string;
    createdAt: number;
    projectKind: string;
  };
  photos: Array<{
    id: string;
    imageUrl: string | null;
    poseLabel: string;
    bgLabel: string;
    isSelected: boolean;
    order: number;
  }>;
  sections: Array<{
    id: string;
    sectionKey: string;
    sectionType: string;
    title: string | null;
    goal: string | null;
    copy: string | null;
    currentImageAssetId: string | null;
    sortOrder: number;
  }>;
  ext: {
    logoUrl: string | null;
    logoPosition: string | null;
    longImageUrl: string | null;
  } | null;
  /** 长图历史记录（只读展示，不含 sketchUrl） */
  longImageGenerations: Array<{
    id: string;
    templateName: string | null;
    imageUrl: string;
    isActive: boolean;
    createdAt: number;
  }>;
}

/**
 * 注册图片项目分享路由
 */
export function registerImageShareRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  // 获取图片项目分享信息（公开 API，无需认证）
  app.get<{ Params: { projectId: string } }>(
    "/share-image/projects/:projectId",
    async (request) => {
      const { projectId } = request.params;

      // 查询项目
      const project = await ctx.repos.projects.findById(projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }

      // 检查项目类型
      if (project.projectKind !== "image") {
        throw new AppError(400, "INVALID_PROJECT_TYPE", "此接口仅支持图片项目");
      }

      // 检查项目状态（只有生成完成的项目才能分享）
      const validStatuses = ["IMAGE_DETAIL_PAGE_GENERATED", "IMAGE_READY_TO_PUBLISH", "IMAGE_PUBLISHED"];
      if (!validStatuses.includes(project.status)) {
        throw new AppError(403, "PROJECT_NOT_READY", "项目详情页尚未生成完成，暂时无法分享");
      }

      // 查询模特图
      const photos = await ctx.repos.modelPhotos.findByProjectId(projectId);
      const selectedPhotos = photos.filter(p => p.isSelected && p.imageUrl);

      // 查询详情页模块
      const sections = await ctx.repos.pageSections.findByProjectId(projectId);
      const validSections = sections.filter(s => s.currentImageAssetId && !s.deletedAt);

      // 查询扩展信息（Logo 等）
      const ext = await ctx.repos.imageProjectExt.findByProjectId(projectId);

      // 查询长图历史记录（只读展示）
      const longImageGenerations = await ctx.repos.longImageGeneration.findByProjectId(projectId);

      // 增加浏览次数
      await ctx.repos.projects.incrementViews(projectId);

      return {
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          createdAt: project.createdAt,
          projectKind: project.projectKind,
        },
        photos: selectedPhotos.map(p => ({
          id: p.id,
          imageUrl: p.imageUrl,
          poseLabel: p.poseLabel,
          bgLabel: p.bgLabel,
          isSelected: p.isSelected,
          order: p.order,
        })),
        sections: validSections.map(s => ({
          id: s.id,
          sectionKey: s.sectionKey,
          sectionType: s.sectionType,
          title: s.title,
          goal: s.goal,
          copy: s.copy,
          currentImageAssetId: s.currentImageAssetId,
          sortOrder: s.sortOrder,
        })),
        ext: ext ? {
          logoUrl: ext.logoUrl,
          logoPosition: ext.logoPosition,
          longImageUrl: ext.longImageUrl,
        } : null,
        longImageGenerations: longImageGenerations
          .filter(g => g.imageUrl)
          .map(g => ({
            id: g.id,
            templateName: g.templateName,
            imageUrl: g.imageUrl,
            isActive: g.isActive,
            createdAt: g.createdAt,
          })),
      } as ImageShareProjectResponse;
    }
  );
}