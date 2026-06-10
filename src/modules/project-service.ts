import type { IProjectRepository } from "../contracts/repository-ports/project-repository.js";
import type { IAssetRepository } from "../contracts/repository-ports/asset-repository.js";
import type { IScriptVersionRepository } from "../contracts/repository-ports/script-repository.js";
import type { IReverseTaskRepository } from "../contracts/repository-ports/reverse-repository.js";
import type { IReviewRequestRepository, IPublicResourceRepository } from "../contracts/repository-ports/review-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { Project, User } from "../contracts/types.js";
import type { IProjectService } from "../contracts/services.js";
import { resolveProjectLastStep } from "../contracts/project-last-step.js";
import { assertCondition, AppError } from "../core/errors.js";
import { PROJECT_STATUS } from "../contant-config/shared_dict.js";
import { generateOssVideoSnapshotUrl } from "../utils/oss-image-url.js";

export class ProjectService implements IProjectService {
  constructor(
    private readonly projectsRepo: IProjectRepository,
    private readonly assetsRepo: IAssetRepository,
    private readonly outfitPlansRepo: Pick<import("../contracts/repository-ports/asset-repository.js").IOutfitPlanRepository, "findByProjectId" | "delete">,
    private readonly scriptsRepo: IScriptVersionRepository,
    private readonly reverseTasksRepo: IReverseTaskRepository,
    private readonly reviewRequestsRepo: IReviewRequestRepository,
    private readonly publicResourcesRepo: IPublicResourceRepository,
    private readonly clock: IRepositoryClock,
  ) {}

  async createProject(user: User, name: string, projectKind?: "image" | "video" | "reverse" | "outfit_change", reverseScriptId?: string | null): Promise<Project> {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    assertCondition(normalizedName.length > 0, 400, "NAME_REQUIRED", "Project name required");
    const now = this.clock.now();
    const project: Project = {
      id: this.clock.generateId(),
      userId: user.id,
      name: normalizedName,
      status: "DRAFT",
      selectedOutfitPlanId: null,
      activeScriptId: null,
      createdAt: now,
      updatedAt: now,
      thumbnailUrl: "https://placehold.co/450x800/1a1a1a/FFF?text=Project+Preview",
      formatLabel: "30秒 • 9:16",
      durationSec: 30,
      views: 0,
      lastVisitedStep: 1,
      lastReverseTaskId: null,
      lastReverseScriptVersionId: null,
      projectKind: projectKind ?? "video",
      exportUrl: null,
      selectedCharacterId: null,
      selectedRoleDirection: null,
      coverImageUrl: null,
      videoCoverImageUrl: null,
      garmentImageUrl: null,
      publishTitle: null,
      reverseScriptId: projectKind === "reverse" ? (reverseScriptId ?? null) : null,
    };
    await this.projectsRepo.upsert(project);
    return project;
  }

  async requireOwnerProject(user: User, projectId: string): Promise<Project> {
    const project = await this.projectsRepo.findById(projectId);
    assertCondition(Boolean(project), 404, "NOT_FOUND", "Project not found");
    const existing = project as Project;
    assertCondition(existing.userId === user.id, 403, "FORBIDDEN", "Project owner only");
    return existing;
  }

  async renameProject(user: User, projectId: string, name: string): Promise<Project> {
    const project = await this.requireOwnerProject(user, projectId);
    const normalizedName = typeof name === "string" ? name.trim() : "";
    assertCondition(normalizedName.length > 0, 400, "NAME_REQUIRED", "Project name required");
    project.name = normalizedName;
    project.updatedAt = this.clock.now();
    await this.projectsRepo.upsert(project);
    return project;
  }

  /** 伪删除项目（不再物理删除关联数据，保留完整性以便恢复） */
  async deleteProject(user: User, projectId: string): Promise<void> {
    const project = await this.requireOwnerProject(user, projectId);

    // 保护检查：以下情况不允许删除
    // 1. 项目状态 >= ROLE_DIRECTION_CONFIRMED（角色方向已确认）
    // 2. 已生成视频
    // 3. 已有封面
    // 4. 已选角色方向
    // 视频项目受保护状态
    const videoProtectedStatuses = [
      "ROLE_DIRECTION_CONFIRMED",
      "CHARACTER_VIEW_READY",
      "CHARACTER_SELECTED",
      "CHARACTER_CONFIRMED",
      "SCRIPT_GENERATED",
      "SCRIPT_SELECTED",
      "SCRIPT_CONFIRMED",
      "STORYBOARDING",
      "FILMING",
      "CLIPS_READY",
      "FISSIONING",
      "READY_TO_PUBLISH",
      "PUBLISHED",
    ];
    // 图片项目受保护状态
    const imageProtectedStatuses = [
      "IMAGE_GARMENT_UPLOADED",
      "IMAGE_ROLE_DIRECTION_CONFIRMED",
      "IMAGE_OUTFIT_SELECTED",
      "IMAGE_OUTFIT_CONFIRMED",
      "IMAGE_CHARACTER_VIEW_READY",
      "IMAGE_CHARACTER_SELECTED",
    ];
    // 根据项目类型选择受保护状态列表
    let protectedStatuses: string[];
    if (project.projectKind === "image") {
      protectedStatuses = imageProtectedStatuses;
    } else if (project.projectKind === "outfit_change") {
      // 换装项目无受保护状态，用户确认即可删除
      protectedStatuses = [];
    } else {
      protectedStatuses = videoProtectedStatuses;
    }

    if (protectedStatuses.includes(project.status)) {
      throw new AppError(400, "PROJECT_PROTECTED", "项目已有实质内容，无法删除");
    }

    // 换装项目用户确认即可删除，跳过以下保护检查
    if (project.projectKind !== "outfit_change") {
      if (project.exportUrl) {
        throw new AppError(400, "PROJECT_PROTECTED", "项目已生成视频，无法删除");
      }

      if (project.coverImageUrl) {
        throw new AppError(400, "PROJECT_PROTECTED", "项目已有封面，无法删除");
      }

      if (project.selectedRoleDirection) {
        throw new AppError(400, "PROJECT_PROTECTED", "项目已选角色方向，无法删除");
      }
    }

    await this.projectsRepo.softDelete(project.id, user.id);
  }

  async updateLastVisitedStep(user: User, projectId: string, step: number): Promise<Project> {
    const project = await this.requireOwnerProject(user, projectId);
    project.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
      step,
      trigger: "route-enter",
    });
    project.updatedAt = this.clock.now();
    await this.projectsRepo.upsert(project);
    return project;
  }

  async setStatus(project: Project, status: Project["status"]): Promise<Project> {
    project.status = status;
    project.updatedAt = this.clock.now();
    await this.projectsRepo.upsert(project);
    return project;
  }

  async saveProject(project: Project): Promise<Project> {
    project.updatedAt = this.clock.now();
    await this.projectsRepo.upsert(project);
    return project;
  }

  async updateExportUrl(projectId: string, exportUrl: string | null, options?: { durationSec?: number | null }): Promise<void> {
    const project = await this.projectsRepo.findById(projectId);
    assertCondition(Boolean(project), 404, "NOT_FOUND", "Project not found");
    const existing = project as Project;
    existing.exportUrl = exportUrl;
    // 同步更新视频时长和格式标签
    if (options?.durationSec !== undefined && options.durationSec !== null && Number.isFinite(options.durationSec)) {
      existing.durationSec = Math.round(options.durationSec);
      existing.formatLabel = `${existing.durationSec}秒 • 9:16`;
    }
    existing.updatedAt = this.clock.now();
    await this.projectsRepo.upsert(existing);
  }

  /**
   * 完成 Step4 视频合成，原子更新项目状态
   * 更新字段：status、exportUrl、durationSec、formatLabel、lastVisitedStep、coverImageUrl、backgroundMusic*
   *
   * 状态更新逻辑：
   * - 首次合成：项目状态从 FILMING/CLIPS_READY 改为 READY_TO_PUBLISH
   * - 再合成：保持项目状态不变（已经是 READY_TO_PUBLISH 或更后面的状态）
   */
  async completeProjectVideo(projectId: string, payload: {
    exportUrl: string;
    durationSec?: number;
    lastVisitedStep?: number;
    videoCoverImageUrl?: string | null;
    backgroundMusicUrl?: string | null;
    backgroundMusicTitle?: string | null;
  }): Promise<void> {
    const project = await this.projectsRepo.findById(projectId);
    assertCondition(Boolean(project), 404, "NOT_FOUND", "Project not found");

    const existing = project as Project;

    // 更新导出视频 URL
    existing.exportUrl = payload.exportUrl;

    // 状态更新：FILMING 或 CLIPS_READY 时推进到 READY_TO_PUBLISH（首次合成）
    // 再合成时保持当前状态不变
    if (existing.status === "FILMING" || existing.status === "CLIPS_READY") {
      existing.status = PROJECT_STATUS.READY_TO_PUBLISH;
    }

    // 更新视频时长和格式标签
    if (payload.durationSec !== undefined && payload.durationSec !== null && Number.isFinite(payload.durationSec)) {
      existing.durationSec = Math.round(payload.durationSec);
      existing.formatLabel = `${existing.durationSec}秒 • 9:16`;
    }

    // 更新最后访问步骤
    if (payload.lastVisitedStep !== undefined) {
      existing.lastVisitedStep = payload.lastVisitedStep;
    }

    // 更新视频封面图片 URL
    if (payload.videoCoverImageUrl !== undefined) {
      existing.videoCoverImageUrl = payload.videoCoverImageUrl;
    }

    // 更新项目封面（cover_image_url）：优先使用用户选择的封面，否则用 OSS 视频截帧
    if (payload.videoCoverImageUrl) {
      existing.coverImageUrl = payload.videoCoverImageUrl;
    } else if (payload.exportUrl) {
      const snapshotUrl = generateOssVideoSnapshotUrl(payload.exportUrl);
      if (snapshotUrl) {
        existing.coverImageUrl = snapshotUrl;
      }
    }

    existing.updatedAt = this.clock.now();
    await this.projectsRepo.upsert(existing);
  }
}
