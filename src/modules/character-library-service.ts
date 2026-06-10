import type { ILibraryCharacterRepository, IRepositoryClock, IProjectCharacterRepository } from "../contracts/repository-ports/index.js";
import type { ICharacterFiveViewRepository } from "../contracts/repository-ports/library-repository.js";
import type { ICharacterLibraryService } from "../contracts/services.js";
import type { LibraryCharacter, User, CharacterFiveView } from "../contracts/types.js";
import { AppError, assertCondition } from "../core/errors.js";

export class CharacterLibraryService implements ICharacterLibraryService {
  constructor(
    private readonly repos: {
      libraryCharacters: ILibraryCharacterRepository;
      clock: IRepositoryClock;
      characterFiveViews?: ICharacterFiveViewRepository;
      projectCharacters?: IProjectCharacterRepository;
    },
  ) {}

  async list(user: User): Promise<LibraryCharacter[]> {
    return (await this.repos.libraryCharacters.findByUserId(user.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listPaged(
    user: User,
    options?: {
      page?: number;
      pageSize?: number;
      gender?: string;
      tags?: string[];
      keyword?: string;
      hasFiveView?: boolean;
    },
  ): Promise<{
    items: LibraryCharacter[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    return this.repos.libraryCharacters.findByUserIdPaged(user.id, {
      ...options,
      hasFiveView: true,
    });
  }

  async getById(characterId: string): Promise<LibraryCharacter | null> {
    return this.repos.libraryCharacters.findById(characterId);
  }

  async create(
    user: User,
    input: {
      name: string;
      kind: "basic" | "image" | "video";
      thumbnailUrl?: string;
      tags?: string[];
      /** @deprecated 不再使用，传了也会被忽略 */
      views?: string[];
      fiveViewOssImageUrl?: string | null;
      videoPreview?: string | null;
      /** 五视图场景一：有 projectId 时允许 thumbnailUrl 为空 */
      projectId?: string;
      /** 角色状态：processing（生成中）或 ready（就绪） */
      status?: "processing" | "ready";
      // 角色分析字段（统一归一化后的格式）
      ethnicity?: string | null;
      age?: number | null;
      gender?: "male" | "female" | null;
      style?: string | null;
      bodyType?: string | null;
      faceShape?: string | null;
      facialFeatures?: string | null;
      eyebrows?: string | null;
      eyes?: string | null;
      eyeExpression?: string | null;
      nose?: string | null;
      lips?: string | null;
      chin?: string | null;
      skinTone?: string | null;
      hairStyle?: string | null;
      uniqueFeatures?: string | null;
    },
  ): Promise<LibraryCharacter & { fiveViewId?: string }> {
    const name = input.name.trim();
    assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Character name required");
    const now = this.repos.clock.now();
    const fiveViewId = this.repos.clock.generateId();
    const item: LibraryCharacter = {
      id: this.repos.clock.generateId(),
      userId: user.id,
      name,
      kind: input.kind,
      status: input.status ?? "ready",
      thumbnailUrl: (input.thumbnailUrl ?? "").trim(),
      tags: [...new Set(input.tags ?? [])],
      views: [],  // deprecated，不再写入
      viewSession: null,
      videoPreview: input.videoPreview ?? null,
      fiveViewOssImageUrl: input.fiveViewOssImageUrl ?? null,
      activeFiveViewId: null,
      createdAt: now,
      updatedAt: now,
      // 角色分析字段
      ethnicity: input.ethnicity ?? null,
      age: input.age ?? null,
      gender: input.gender ?? null,
      style: input.style ?? null,
      bodyType: input.bodyType ?? null,
      faceShape: input.faceShape ?? null,
      facialFeatures: input.facialFeatures ?? null,
      eyebrows: input.eyebrows ?? null,
      eyes: input.eyes ?? null,
      eyeExpression: input.eyeExpression ?? null,
      nose: input.nose ?? null,
      lips: input.lips ?? null,
      chin: input.chin ?? null,
      skinTone: input.skinTone ?? null,
      hairStyle: input.hairStyle ?? null,
      uniqueFeatures: input.uniqueFeatures ?? null,
    };
    await this.repos.libraryCharacters.upsert(item);

    // 当 status 为 processing 时，自动创建空五视图记录（批量生成场景）
    if (input.status === "processing" && this.repos.characterFiveViews) {
      const processingView: CharacterFiveView = {
        id: fiveViewId,
        characterId: item.id,
        imageUrl: null,
        status: "processing",
        isActive: false,
        prompt: null,
        model: null,
        generationParams: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await this.repos.characterFiveViews.create(processingView);
      return { ...item, fiveViewId };
    }

    return item;
  }

  async update(
    user: User,
    characterId: string,
    patch: Partial<
      Pick<LibraryCharacter, "name" | "tags" | "thumbnailUrl" | "videoPreview" | "status" | "kind" | "views" | "fiveViewOssImageUrl" | "viewSession">
    >,
  ): Promise<LibraryCharacter> {
    const existing = await this.requireOwnerCharacter(user, characterId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      assertCondition(name.length > 0, 400, "NAME_REQUIRED", "Character name required");
      existing.name = name;
    }
    if (patch.tags !== undefined) {
      existing.tags = [...new Set(patch.tags)];
    }
    if (patch.thumbnailUrl !== undefined) {
      const thumbnailUrl = patch.thumbnailUrl.trim();
      assertCondition(thumbnailUrl.length > 0, 400, "THUMBNAIL_REQUIRED", "Character thumbnail required");
      existing.thumbnailUrl = thumbnailUrl;
    }
    if (patch.videoPreview !== undefined) {
      existing.videoPreview = patch.videoPreview;
    }
    if (patch.status !== undefined) {
      existing.status = patch.status;
    }
    if (patch.kind !== undefined) {
      existing.kind = patch.kind;
    }
    if (patch.views !== undefined) {
      // deprecated: views 不再写入，保留空数组
    }
    if (patch.fiveViewOssImageUrl !== undefined) {
      existing.fiveViewOssImageUrl = patch.fiveViewOssImageUrl;
    }
    if (patch.viewSession !== undefined) {
      existing.viewSession = patch.viewSession;
    }
    existing.updatedAt = this.repos.clock.now();
    await this.repos.libraryCharacters.upsert(existing);
    return existing;
  }

  async generateViews(user: User, characterId: string): Promise<LibraryCharacter> {
    const existing = await this.requireOwnerCharacter(user, characterId);
    existing.status = "processing";
    existing.updatedAt = this.repos.clock.now();
    existing.kind = "image";
    // views deprecated，不再写入占位图
    existing.status = "ready";
    existing.updatedAt = this.repos.clock.now();
    await this.repos.libraryCharacters.upsert(existing);
    return existing;
  }

  /** 伪删除角色（检查项目引用） */
  async remove(user: User, characterId: string): Promise<void> {
    const character = await this.requireOwnerCharacter(user, characterId);

    // 检查角色是否被项目使用
    if (this.repos.projectCharacters) {
      const projectUsages = await this.repos.projectCharacters.findByLibraryCharacterId(characterId);
      const activeUsages = projectUsages.filter(pc => pc.deletedAt === null);

      if (activeUsages.length > 0) {
        throw new AppError(
          400,
          "CHARACTER_IN_USE",
          `该角色正在被 ${activeUsages.length} 个项目使用，无法删除。请先在项目中移除该角色。`
        );
      }
    }

    await this.repos.libraryCharacters.softDelete(characterId, user.id);
  }

  private async requireOwnerCharacter(user: User, characterId: string): Promise<LibraryCharacter> {
    const character = await this.repos.libraryCharacters.findById(characterId);
    assertCondition(Boolean(character), 404, "NOT_FOUND", "Character not found");
    const existing = character as LibraryCharacter;
    assertCondition(existing.userId === user.id, 403, "FORBIDDEN", "Character owner only");
    return existing;
  }
}
