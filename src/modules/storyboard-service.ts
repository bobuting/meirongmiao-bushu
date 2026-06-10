import type { StoryboardFrame, User } from "../contracts/types.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IProjectService, IStoryboardService } from "../contracts/services.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { assertCondition } from "../core/errors.js";
import { resolveResourceUrlByPolicy } from "../core/runtime-placeholder-policy.js";

export class StoryboardService implements IStoryboardService {
  constructor(
    private readonly repos: PgRepositoryCollection,
    private readonly clock: IRepositoryClock,
    private readonly projectService: IProjectService,
  ) {}

  private resolveStoryboardVariantUrl(projectId: string, frameIndex: number, variant: number): string {
    const suffix = `${frameIndex}-v${variant}.png`;
    const resolved = resolveResourceUrlByPolicy({
      moduleId: "src/modules/storyboard-service.ts",
      policyKey: "storyboard.variant_url",
      candidateUrl: null,
      fixtureFallbackUrl: `https://mock.cdn/storyboard/${projectId}/${suffix}`,
    });
    assertCondition(Boolean(resolved), 503, "RESOURCE_URL_NOT_READY", "Storyboard variant url not ready");
    return resolved as string;
  }

  async generate(user: User, projectId: string, frameCount = 6): Promise<StoryboardFrame[]> {
    const project = await this.projectService.requireOwnerProject(user, projectId);

    // 直接查询已确认脚本
    const scriptId = await this.repos.scriptData.findConfirmedIdByProject(project.id);
    assertCondition(Boolean(scriptId), 400, "SCRIPT_REQUIRED", "Generate script first");

    // Regenerate full board should replace previous board frames for the project
    await this.repos.step3FrameImages.deleteByProjectId(project.id);

    const frames: StoryboardFrame[] = [];
    for (let i = 1; i <= frameCount; i += 1) {
      const variants = Array.from({ length: 4 }, (_, variantIndex) => {
        const variant = variantIndex + 1;
        return this.resolveStoryboardVariantUrl(project.id, i, variant);
      });
      const frame: StoryboardFrame = {
        id: this.clock.generateId(),
        projectId: project.id,
        scriptVersionId: scriptId,
        index: i,
        imageUrl: variants[0],
        variants,
        selectedVariantIndex: 0,
      };
      await this.repos.step3FrameImages.insertFrame({
        id: frame.id,
        projectId: project.id,
        frameIndex: frame.index,
        selectedImageUrl: frame.imageUrl,
        createdAt: Date.now(),
      });
      frames.push(frame);
    }
    project.status = "STORYBOARDING";
    await this.projectService.setStatus(project, project.status);
    return frames;
  }

  async selectVariant(
    user: User,
    projectId: string,
    frameId: string,
    variantIndex: number,
  ): Promise<StoryboardFrame> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const frameRow = await this.repos.step3FrameImages.findById(frameId);
    assertCondition(Boolean(frameRow), 404, "NOT_FOUND", "Frame not found");

    const row = frameRow!;
    const existing: StoryboardFrame = {
      id: row.id,
      projectId: row.project_id,
      scriptVersionId: null,
      index: row.frame_index,
      imageUrl: row.selected_image_url ?? "",
      variants: [row.selected_image_url ?? ""],
      selectedVariantIndex: 0,
    };
    assertCondition(existing.projectId === project.id, 400, "FRAME_PROJECT_MISMATCH", "Frame mismatch");

    const variants = existing.variants ?? [existing.imageUrl];
    assertCondition(variantIndex >= 0 && variantIndex < variants.length, 400, "VARIANT_OUT_OF_RANGE", "Variant index out of range");

    existing.variants = variants;
    existing.selectedVariantIndex = variantIndex;
    existing.imageUrl = variants[variantIndex] ?? existing.imageUrl;

    await this.repos.step3FrameImages.updateSelectedImageUrl(existing.id, existing.imageUrl);
    return existing;
  }
}