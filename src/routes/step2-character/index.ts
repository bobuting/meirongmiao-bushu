/**
 * Step2 Character 路由注册
 * 角色确认接口（提示词参数变体生成已废弃）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";

import { requireUser } from "../../services/auth/route-guards.js";
import { VIDEO_PROJECT_STATUS_ORDER, IMAGE_PROJECT_STATUS_ORDER, type VideoProjectStatus, type ImageProjectStatus } from "../../contracts/types.js";

/**
 * 注册 Step2 Character 相关路由
 *
 * 路由列表:
 * - PUT /projects/:projectId/step2/confirm — 确认/取消确认角色
 */
export function registerStep2CharacterRoutes(app: FastifyInstance, ctx: AppContext): void {
  // =========================================================================
  // PUT /projects/:projectId/step2/confirm
  // 确认/取消确认角色，同时更新项目状态和 step_state
  // =========================================================================
  app.put("/projects/:projectId/step2/confirm", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const currentStatus = project.status as string;
    const body = (request.body as {
      confirmed?: boolean;
      confirmedCandidateId?: string | null;
    }) ?? {};

    const confirmed = typeof body.confirmed === "boolean" ? body.confirmed : true;
    const confirmedCandidateId = typeof body.confirmedCandidateId === "string"
      ? body.confirmedCandidateId.trim()
      : null;

    // 状态更新：确认角色时前进，取消时仅在早期状态才允许回退
    // 区分视频项目 (CHARACTER_CONFIRMED) 和图片项目 (IMAGE_CHARACTER_CONFIRMED)
    let nextStatus: string;
    if (confirmed) {
      nextStatus = project.projectKind === "image" ? "IMAGE_CHARACTER_CONFIRMED" : "CHARACTER_CONFIRMED";
    } else {
      // 取消确认：只有在 CHARACTER_CONFIRMED 或更早状态才允许回退到 DRAFT
      // 防止项目已进入 Step3+ 时错误回退到草稿状态
      const videoStatusIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf(currentStatus as VideoProjectStatus);
      const characterConfirmedIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf("CHARACTER_CONFIRMED");
      // 图片项目状态索引（用于检查图片项目是否在早期状态）
      const imageStatusIndex = IMAGE_PROJECT_STATUS_ORDER.indexOf(currentStatus as ImageProjectStatus);
      const imageCharacterConfirmedIndex = IMAGE_PROJECT_STATUS_ORDER.indexOf("IMAGE_CHARACTER_CONFIRMED");

      if (project.projectKind === "image") {
        // 图片项目：只有在 IMAGE_CHARACTER_CONFIRMED 或更早状态才允许回退
        if (imageStatusIndex >= 0 && imageStatusIndex <= imageCharacterConfirmedIndex) {
          nextStatus = "IMAGE_DRAFT";
        } else {
          nextStatus = currentStatus;
        }
      } else {
        // 视频项目：只有在 CHARACTER_CONFIRMED 或更早状态才允许回退到 DRAFT
        if (videoStatusIndex >= 0 && videoStatusIndex <= characterConfirmedIndex) {
          nextStatus = "DRAFT";
        } else {
          // 已超过 CHARACTER_CONFIRMED 状态，不回退，保留当前状态
          nextStatus = currentStatus as VideoProjectStatus;
        }
      }
    }

    await ctx.repos.projects.updateStatus(params.projectId, nextStatus);

    // Workflow state no longer persisted - confirmation state managed in-memory

    return { success: true, projectStatus: nextStatus };
  });
}
