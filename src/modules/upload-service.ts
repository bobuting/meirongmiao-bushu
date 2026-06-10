/**
 * 项目服饰上传服务
 *
 * 管理项目中服饰资产的关联分配
 */

import type { GarmentAsset, ProjectGarment, User } from "../contracts/types.js";
import { resolveGarmentImageUrl } from "../contracts/types.js";
import type { IAssetRepository } from "../contracts/repository-ports/asset-repository.js";
import type { IGarmentAssetRepository } from "../contracts/repository-ports/garment-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IProjectService, IUploadService } from "../contracts/services.js";
import { assertCondition } from "../core/errors.js";

interface UploadInput {
  garmentAssetId: string;
  fileName: string;
  sizeMb: number;
}

export class UploadService implements IUploadService {
  constructor(
    private readonly repos: {
      assets: IAssetRepository;
      garmentAssets: IGarmentAssetRepository;
    },
    private readonly clock: IRepositoryClock,
    private readonly configService: import("../services/config/app-config-service.js").AppConfigService,
    private readonly projectService: IProjectService,
  ) {}

  async upload(user: User, projectId: string, files: UploadInput[]): Promise<ProjectGarment[]> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const existingAssets = await this.repos.assets.findByProjectId(project.id);

    assertCondition(files.length > 0, 400, "FILES_REQUIRED", "Files required");

    const created: ProjectGarment[] = [];
    for (const file of files) {
      const garmentAsset = await this.repos.garmentAssets.findById(file.garmentAssetId);
      assertCondition(Boolean(garmentAsset), 400, "LIBRARY_ASSET_NOT_FOUND", "Library asset not found");
      const asset = garmentAsset as GarmentAsset;
      assertCondition(asset.userId === user.id, 403, "FORBIDDEN", "Library asset owner only");
      assertCondition(asset.type === "image", 400, "LIBRARY_ASSET_TYPE_INVALID", "Library asset type invalid");

      const fileName = file.fileName.trim();
      assertCondition(fileName.length > 0, 400, "FILE_NAME_REQUIRED", "File name required");

      const now = this.clock.now();
      const garment: ProjectGarment = {
        id: this.clock.generateId(),
        projectId: project.id,
        userId: user.id,
        category: asset.category,
        garmentAssetId: file.garmentAssetId,
        fileName,
        sizeMb: file.sizeMb,
        imageUrl: resolveGarmentImageUrl(asset),
        createdAt: now,
        updatedAt: now,
      };

      await this.repos.assets.upsertByProjectAndGarmentAsset(garment);
      created.push(garment);
    }

    return created;
  }
}
