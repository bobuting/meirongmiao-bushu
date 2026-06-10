/**
 * 分镜视频状态推进
 * 当所有分镜都有视频 URL 时，将项目状态从 FILMING 推进到 CLIPS_READY
 */

import type { AppContext } from "../../core/app-context.js";
import { getLogger } from "../../core/logger/index.js";
import { PROJECT_STATUS } from "../../contant-config/shared_dict.js";

const log = getLogger("scene-status-advance");

/**
 * 检查所有分镜是否有视频 URL，全部有则推进项目状态到 CLIPS_READY
 */
export async function advanceProjectStatusIfAllScenesHaveVideo(
  ctx: AppContext,
  projectId: string,
): Promise<void> {
  // 提前检查项目状态，非 FILMING 时直接返回
  const project = await ctx.repos.projects.findById(projectId);
  if (!project || project.status !== PROJECT_STATUS.FILMING) return;

  const scenes = await ctx.repos.step4VideoScenes.findByProjectId(projectId);
  if (scenes.length === 0) return;

  // 所有场景都有视频 URL 时可推进
  const allHaveVideo = scenes.every(s => Boolean(s.clipUrl?.trim()));
  if (!allHaveVideo) return;

  await ctx.repos.projects.updateStatus(projectId, PROJECT_STATUS.CLIPS_READY);
  log.info({ projectId }, "所有分镜视频已就绪，项目状态推进到 CLIPS_READY");
}