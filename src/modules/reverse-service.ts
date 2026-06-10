import type { ReverseTask, User } from "../contracts/types.js";
import type { IProjectRepository } from "../contracts/repository-ports/project-repository.js";
import type { IReverseTaskRepository } from "../contracts/repository-ports/reverse-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IReverseService } from "../contracts/services.js";
import type { PgScriptDataRepository } from "../repositories/pg/script-data-pg-repository.js";
import { resolveProjectLastStep } from "../contracts/project-last-step.js";
import { assertCondition } from "../core/errors.js";

export class ReverseService implements IReverseService {
  constructor(
    private readonly repos: { projects: IProjectRepository; reverseTasks: IReverseTaskRepository; scriptData: PgScriptDataRepository },
    private readonly clock: IRepositoryClock,
  ) {}

  async parseFromUrl(user: User, projectId: string, url: string): Promise<ReverseTask> {
    const trimmedUrl = url.trim();
    assertCondition(trimmedUrl.length > 0, 400, "URL_REQUIRED", "URL required");

    let host = "";
    try {
      host = new URL(trimmedUrl).hostname.toLowerCase();
    } catch {
      host = "";
    }
    const isDouyinHost = host.includes("douyin.com") || host.includes("iesdouyin.com");
    const blocked = !isDouyinHost || /(private|invalid|blocked)/i.test(trimmedUrl);
    if (blocked) {
      const fallback: ReverseTask = {
        id: this.clock.generateId(),
        userId: user.id,
        projectId,
        source: "douyin_url",
        input: trimmedUrl,
        status: "fallback_required",
        scriptVersionId: null,
        fallbackReason: "private_or_invalid_url",
        createdAt: this.clock.now(),
      };
      await this.repos.reverseTasks.upsert(fallback);
      await this.bindTaskToProject(user.id, projectId, fallback.id, null);
      return fallback;
    }

    const scriptId = this.clock.generateId();
    const now = this.clock.now();
    await this.repos.scriptData.insertReversePlaceholder({
      id: scriptId,
      projectId,
      userId: user.id,
      basicInfo: `reverse-from-url:${trimmedUrl}`,
      now,
    });
    const task: ReverseTask = {
      id: this.clock.generateId(),
      userId: user.id,
      projectId,
      source: "douyin_url",
      input: trimmedUrl,
      status: "success",
      scriptVersionId: scriptId,
      fallbackReason: null,
      createdAt: this.clock.now(),
    };
    await this.repos.reverseTasks.upsert(task);
    await this.bindTaskToProject(user.id, projectId, task.id, scriptId);
    return task;
  }

  async parseFromLocalFile(user: User, projectId: string, fileName: string): Promise<ReverseTask> {
    assertCondition(fileName.trim().length > 0, 400, "FILE_REQUIRED", "File required");
    assertCondition(
      /\.(mp4|mov|mkv|avi|webm|mp3|wav|m4a|aac|flac|ogg)$/i.test(fileName.trim()),
      400,
      "FILE_TYPE_NOT_SUPPORTED",
      "Local fallback only supports video/audio files",
    );
    const scriptId = this.clock.generateId();
    const now = this.clock.now();
    await this.repos.scriptData.insertReversePlaceholder({
      id: scriptId,
      projectId,
      userId: user.id,
      basicInfo: "reverse-from-local",
      now,
    });
    const task: ReverseTask = {
      id: this.clock.generateId(),
      userId: user.id,
      projectId,
      source: "local_file",
      input: fileName,
      status: "success",
      scriptVersionId: scriptId,
      fallbackReason: null,
      createdAt: this.clock.now(),
    };
    await this.repos.reverseTasks.upsert(task);
    await this.bindTaskToProject(user.id, projectId, task.id, scriptId);
    return task;
  }

  private async bindTaskToProject(userId: string, projectId: string, taskId: string, scriptVersionId: string | null): Promise<void> {
    const project = await this.repos.projects.findById(projectId);
    if (!project || project.userId !== userId) {
      return;
    }
    project.lastReverseTaskId = taskId;
    project.lastReverseScriptVersionId = scriptVersionId;
    project.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
      step: 3,
      trigger: "manual-jump",
    });
    project.updatedAt = this.clock.now();
    await this.repos.projects.upsert(project);
  }
}
