import type { ScriptSourceType, ScriptVersion, User } from "../contracts/types.js";
import type { IScriptVersionRepository } from "../contracts/repository-ports/script-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { AppConfigService } from "../services/config/app-config-service.js";
import type { IProjectService, IScriptService } from "../contracts/services.js";
import { assertCondition } from "../core/errors.js";

const SCRIPT_SOURCE_TYPES: readonly ScriptSourceType[] = ["template", "original", "reverse"];

export class ScriptService implements IScriptService {
  constructor(
    private readonly repos: { scripts: IScriptVersionRepository },
    private readonly clock: IRepositoryClock,
    private readonly configService: AppConfigService,
    private readonly projectService: IProjectService,
  ) {}

  async generate(
    user: User,
    projectId: string,
    sourceType: ScriptSourceType,
    durationSec: number,
    prompt: string,
  ): Promise<ScriptVersion> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    assertCondition(
      typeof sourceType === "string" && SCRIPT_SOURCE_TYPES.includes(sourceType),
      400,
      "SCRIPT_SOURCE_INVALID",
      "Source type invalid",
    );
    assertCondition(Number.isInteger(durationSec) && durationSec > 0, 400, "DURATION_INVALID", "Duration invalid");
    assertCondition(
      durationSec <= this.configService.get().scriptMaxDurationSec,
      400,
      "DURATION_TOO_LONG",
      "Duration exceeds max",
    );
    const trimmedPrompt = prompt.trim();
    assertCondition(trimmedPrompt.length > 0, 400, "PROMPT_REQUIRED", "Prompt is required");

    const latest = await this.latestVersion(project.id);
    const version = latest ? latest.version + 1 : 1;
    const script: ScriptVersion = {
      id: this.clock.generateId(),
      projectId: project.id,
      userId: user.id,
      sourceType,
      durationSec,
      version,
      payload: this.buildPayload(`basic:${trimmedPrompt}`),
      createdAt: this.clock.now(),
    };
    await this.repos.scripts.upsert(script);
    // 脚本生成后同步更新项目的时长（第三步完成后使用实际时长而非默认30秒）
    project.status = "SCRIPT_CONFIRMED";
    project.durationSec = durationSec;
    await this.projectService.saveProject(project);
    return script;
  }

  async edit(
    user: User,
    projectId: string,
    scriptId: string,
    patch: Partial<ScriptVersion["payload"]>,
  ): Promise<ScriptVersion> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const existing = await this.repos.scripts.findById(scriptId);
    assertCondition(Boolean(existing), 404, "NOT_FOUND", "Script not found");
    const base = existing as ScriptVersion;
    assertCondition(base.projectId === project.id, 400, "SCRIPT_PROJECT_MISMATCH", "Script mismatch");

    const latest = await this.latestVersion(project.id);
    const version = latest ? latest.version + 1 : base.version + 1;
    const newVersion: ScriptVersion = {
      ...base,
      id: this.clock.generateId(),
      version,
      payload: this.mergePayload(base.payload, patch),
      createdAt: this.clock.now(),
    };
    await this.repos.scripts.upsert(newVersion);
    return newVersion;
  }

  async latestVersion(projectId: string): Promise<ScriptVersion | null> {
    const list = (await this.repos.scripts.findByProjectId(projectId))
      .sort((a, b) => b.version - a.version);
    return list[0] ?? null;
  }

  private buildPayload(basicInfo: string): ScriptVersion["payload"] {
    return {
      basicInfo,
      roleTable: "role-table",
      outfitTable: "outfit-table",
      storyboard: "storyboard-table",
    };
  }

  private mergePayload(
    base: ScriptVersion["payload"],
    patch: Partial<ScriptVersion["payload"]>,
  ): ScriptVersion["payload"] {
    return {
      basicInfo: patch.basicInfo ?? base.basicInfo,
      roleTable: patch.roleTable ?? base.roleTable,
      outfitTable: patch.outfitTable ?? base.outfitTable,
      storyboard: patch.storyboard ?? base.storyboard,
    };
  }
}
