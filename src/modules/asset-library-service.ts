import type { IGarmentAssetRepository } from "../contracts/repository-ports/garment-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IAssetLibraryService } from "../contracts/services.js";
import type { GarmentAsset, User, AssetClassificationResult, TargetAgeRange, TargetGender } from "../contracts/types.js";
import { assertCondition } from "../core/errors.js";

export class AssetLibraryService implements IAssetLibraryService {
  constructor(
    private readonly repos: { garmentAssets: IGarmentAssetRepository },
    private readonly clock: IRepositoryClock,
  ) {}

  async list(user: User): Promise<GarmentAsset[]> {
    // 获取用户资产 + 公共资产
    const userAssets = await this.repos.garmentAssets.findByUserId(user.id);
    const publicAssets = await this.repos.garmentAssets.findPublicAssets();
    const allAssets = [...userAssets, ...publicAssets];
    return allAssets.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listPaged(
    user: User,
    options?: {
      page?: number;
      pageSize?: number;
      category?: string;
      keyword?: string;
    },
  ): Promise<{
    items: GarmentAsset[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    return this.repos.garmentAssets.findByUserIdPaged(user.id, options);
  }

  async create(
    user: User,
    input: {
      name: string;
      type: "image" | "video";
      category: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer" | "video";
      mainImageUrl: string;
      subImageUrl1?: string | null;
      subImageUrl2?: string | null;
      subImageUrl3?: string | null;
      flatLayImageUrl?: string | null;
      maskedImageUrl?: string | null;  // 遮罩预处理后的图片URL
      sizeMb: number;
      source?: string;
      // 服饰扩展属性
      description?: string | null;
      mainColor?: string | null;
      material?: string | null;
      pattern?: string | null;
      fit?: string | null;
      length?: string | null;
      neckline?: string | null;
      sleeve?: string | null;
      style?: string | null;
      occasion?: string | null;
      // 适穿属性
      targetAgeRange?: TargetAgeRange | null;
      targetGender?: TargetGender | null;
      classification?: AssetClassificationResult;
      // 电商卖点（从图片分析提取）
      sellingPoints?: Array<{ point: string; category: string; priority: number }>;
    },
  ): Promise<GarmentAsset> {
    const name = input.name.trim();
    assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Asset name required");
    assertCondition(input.mainImageUrl.trim().length > 0, 400, "URL_REQUIRED", "Main image url required");
    assertCondition(input.sizeMb > 0, 400, "SIZE_INVALID", "Asset size invalid");

    const now = this.clock.now();
    const item: GarmentAsset = {
      id: this.clock.generateId(),
      userId: user.id,
      name,
      type: input.type,
      category: input.category,
      mainImageUrl: input.mainImageUrl.trim(),
      subImageUrl1: input.subImageUrl1 ?? null,
      subImageUrl2: input.subImageUrl2 ?? null,
      subImageUrl3: input.subImageUrl3 ?? null,
      flatLayImageUrl: input.flatLayImageUrl ?? null,
      maskedImageUrl: input.maskedImageUrl ?? null,
      sizeMb: input.sizeMb,
      source: input.source ?? null,
      // 服饰扩展属性
      description: input.description ?? null,
      mainColor: input.mainColor ?? null,
      material: input.material ?? null,
      pattern: input.pattern ?? null,
      fit: input.fit ?? null,
      length: input.length ?? null,
      neckline: input.neckline ?? null,
      sleeve: input.sleeve ?? null,
      style: input.style ?? null,
      occasion: input.occasion ?? null,
      // 适穿属性
      targetAgeRange: input.targetAgeRange ?? null,
      targetGender: input.targetGender ?? null,
      variantGroupId: null,
      variantColor: null,
      isPrimaryVariant: false,
      createdAt: now,
      updatedAt: now,
      // AI 分类结果
      aiCategory: input.classification?.category ?? null,
      aiViewLabel: input.classification?.viewLabel ?? null,
      aiConfidence: input.classification?.confidence ?? null,
      aiReason: input.classification?.reason ?? null,
      // 服饰区域检测结果
      garmentRegions: input.classification?.garmentRegions ?? undefined,
      // 电商卖点
      sellingPoints: input.sellingPoints ?? undefined,
    };
    await this.repos.garmentAssets.upsert(item);
    return item;
  }

  async update(
    user: User,
    assetId: string,
    patch: Partial<
      Pick<
        GarmentAsset,
        | "name"
        | "category"
        | "mainImageUrl"
        | "subImageUrl1"
        | "subImageUrl2"
        | "subImageUrl3"
        | "flatLayImageUrl"
        | "maskedImageUrl"
        | "sizeMb"
        | "description"
        | "mainColor"
        | "material"
        | "pattern"
        | "fit"
        | "length"
        | "neckline"
        | "sleeve"
        | "style"
        | "occasion"
        | "sellingPoints"
      >
    >,
  ): Promise<GarmentAsset> {
    const existing = await this.requireOwnerAsset(user, assetId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Asset name required");
      existing.name = name;
    }
    if (patch.category !== undefined) {
      existing.category = patch.category;
    }
    if (patch.mainImageUrl !== undefined) {
      assertCondition(patch.mainImageUrl.trim().length > 0, 400, "URL_REQUIRED", "Main image url required");
      existing.mainImageUrl = patch.mainImageUrl.trim();
    }
    if (patch.subImageUrl1 !== undefined) existing.subImageUrl1 = patch.subImageUrl1;
    if (patch.subImageUrl2 !== undefined) existing.subImageUrl2 = patch.subImageUrl2;
    if (patch.subImageUrl3 !== undefined) existing.subImageUrl3 = patch.subImageUrl3;
    if (patch.flatLayImageUrl !== undefined) existing.flatLayImageUrl = patch.flatLayImageUrl;
    if (patch.maskedImageUrl !== undefined) existing.maskedImageUrl = patch.maskedImageUrl;
    if (patch.sizeMb !== undefined && patch.sizeMb !== null) {
      assertCondition(patch.sizeMb > 0, 400, "SIZE_INVALID", "Asset size invalid");
      existing.sizeMb = patch.sizeMb;
    }
    // 服饰扩展属性
    if (patch.description !== undefined) existing.description = patch.description;
    if (patch.mainColor !== undefined) existing.mainColor = patch.mainColor;
    if (patch.material !== undefined) existing.material = patch.material;
    if (patch.pattern !== undefined) existing.pattern = patch.pattern;
    if (patch.fit !== undefined) existing.fit = patch.fit;
    if (patch.length !== undefined) existing.length = patch.length;
    if (patch.neckline !== undefined) existing.neckline = patch.neckline;
    if (patch.sleeve !== undefined) existing.sleeve = patch.sleeve;
    if (patch.style !== undefined) existing.style = patch.style;
    if (patch.occasion !== undefined) existing.occasion = patch.occasion;
    if (patch.sellingPoints !== undefined) existing.sellingPoints = patch.sellingPoints;
    existing.updatedAt = this.clock.now();
    await this.repos.garmentAssets.upsert(existing);
    return existing;
  }

  async remove(user: User, assetId: string): Promise<void> {
    await this.requireOwnerAsset(user, assetId);
    await this.repos.garmentAssets.softDelete(assetId, user.id);
  }

  private async requireOwnerAsset(user: User, assetId: string): Promise<GarmentAsset> {
    const asset = await this.repos.garmentAssets.findById(assetId);
    assertCondition(Boolean(asset), 404, "NOT_FOUND", "Asset not found");
    const existing = asset as GarmentAsset;
    // 用户只能操作自己的资产（公共资产 user_id="system" 不可修改）
    assertCondition(existing.userId === user.id, 403, "FORBIDDEN", "Asset owner only");
    return existing;
  }
}
