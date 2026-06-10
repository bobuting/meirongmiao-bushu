/**
 * 项目角色服务：管理项目与角色库的关联关系
 */

import type { ILibraryCharacterRepository, IProjectCharacterRepository, IRepositoryClock } from "../contracts/repository-ports/index.js";
import type { IProjectCharacterService } from "../contracts/services.js";
import type { LibraryCharacter, ProjectCharacter } from "../contracts/types.js";
import { assertCondition } from "../core/errors.js";
import { matchLibraryCharactersByOutfit } from "./library-character-outfit-match.js";

export class ProjectCharacterService implements IProjectCharacterService {
  constructor(
    private readonly deps: {
      projectCharacters: IProjectCharacterRepository;
      libraryCharacters: ILibraryCharacterRepository;
      clock: IRepositoryClock;
    },
  ) {}

  async listByProjectId(projectId: string): Promise<ProjectCharacter[]> {
    return this.deps.projectCharacters.findByProjectId(projectId);
  }

  async getSelected(projectId: string): Promise<ProjectCharacter | null> {
    const items = await this.deps.projectCharacters.findByProjectId(projectId);
    return items.find((item) => item.isSelected) ?? null;
  }

  async add(params: {
    projectId: string;
    libraryCharacterId: string;
    role?: "main" | "secondary";
    sourceType?: "generated" | "library";
    generationSlot?: number;
  }): Promise<ProjectCharacter> {
    const existing = await this.deps.projectCharacters.findByProjectAndLibraryCharacterId(
      params.projectId,
      params.libraryCharacterId,
    );
    if (existing) {
      return existing;
    }

    // 添加新角色前，清除同项目其他角色的选中状态（互斥）
    await this.deps.projectCharacters.clearSelected(params.projectId);

    const now = this.deps.clock.now();
    const record: ProjectCharacter = {
      id: this.deps.clock.generateId(),
      projectId: params.projectId,
      libraryCharacterId: params.libraryCharacterId,
      role: params.role ?? "main",
      sourceType: params.sourceType ?? "library",
      isSelected: true,
      generationSlot: params.generationSlot ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.deps.projectCharacters.create(record);
    return record;
  }

  async select(projectId: string, libraryCharacterId: string): Promise<void> {
    const existing = await this.deps.projectCharacters.findByProjectAndLibraryCharacterId(
      projectId,
      libraryCharacterId,
    );
    assertCondition(Boolean(existing), 404, "NOT_FOUND", "项目未关联该角色");
    await this.deps.projectCharacters.setSelected(projectId, libraryCharacterId);
  }

  async remove(projectId: string, libraryCharacterId: string): Promise<void> {
    const existing = await this.deps.projectCharacters.findByProjectAndLibraryCharacterId(
      projectId,
      libraryCharacterId,
    );
    assertCondition(Boolean(existing), 404, "NOT_FOUND", "项目角色关联不存在");
    await this.deps.projectCharacters.softDelete(existing!.id, "system");
  }

  /**
   * 根据性别和年龄匹配角色库角色，并保存到项目角色关系表
   * 匹配只执行一次，结果持久化到 nrm_project_characters
   */
  async matchByOutfit(params: {
    projectId: string;
    userId: string;
    outfitSummary?: string;
    roleDirectionPrompt?: string;
    selectedCharacterName?: string;
    /** 角色预设性别，用于过滤角色库 */
    gender?: string;
    /** 角色预设年龄，用于精确匹配 */
    age?: number;
    topN?: number;
  }): Promise<LibraryCharacter[]> {
    // 1. 获取项目中已存在的生成角色ID（用于排除）
    const existingProjectChars = await this.deps.projectCharacters.findByProjectId(params.projectId);
    const generatedIds = existingProjectChars
      .filter((c) => c.sourceType === "generated")
      .map((c) => c.libraryCharacterId);

    // 2. 获取用户的全部角色库
    const libraryCharacters = await this.deps.libraryCharacters.findByUserId(params.userId);

    // 3. 按性别和年龄匹配角色库
    const matchResult = matchLibraryCharactersByOutfit({
      libraryCharacters,
      excludeIds: generatedIds,
      gender: params.gender,
      age: params.age,
    });

    // 4. 从随机结果中取 topN 保存到项目角色关系表
    const topN = params.topN ?? 4;
    const matchedCharacters: LibraryCharacter[] = [];
    for (const charId of matchResult.characterIds.slice(0, topN)) {
      const now = this.deps.clock.now();
      // eslint-disable-next-line no-await-in-loop
      await this.deps.projectCharacters.create({
        id: this.deps.clock.generateId(),
        projectId: params.projectId,
        libraryCharacterId: charId,
        role: "secondary",
        sourceType: "library",
        isSelected: false,
        generationSlot: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      // eslint-disable-next-line no-await-in-loop
      const char = await this.deps.libraryCharacters.findById(charId);
      if (char) matchedCharacters.push(char);
    }

    return matchedCharacters;
  }

  /**
   * 获取角色库推荐角色（懒匹配）
   *
   * 每个项目只匹配一次，已有 sourceType=library 的记录直接返回，不重复匹配。
   */
  async getOrMatchLibraryRecommendations(params: {
    projectId: string;
    userId: string;
    /** 角色预设性别 */
    gender?: string;
    /** 角色预设年龄，用于精确匹配 */
    age?: number;
    topN?: number;
  }): Promise<{ records: ProjectCharacter[]; characters: LibraryCharacter[]; matched: boolean }> {
    // 1. 查已有记录
    const existing = await this.deps.projectCharacters.findByProjectId(params.projectId);
    const allLibraryRecords = existing.filter((c) => c.sourceType === "library");

    // 2. 已有记录直接返回，不重复匹配
    if (allLibraryRecords.length > 0) {
      const sortedRecords = allLibraryRecords.sort((a, b) => {
        const slotA = a.generationSlot ?? 0;
        const slotB = b.generationSlot ?? 0;
        if (slotA === 5) return -1;
        if (slotB === 5) return 1;
        return a.createdAt - b.createdAt;
      });
      const characters = await this.loadCharactersByIds(sortedRecords.map((r) => r.libraryCharacterId));
      return { records: sortedRecords, characters, matched: false };
    }

    // 3. 首次匹配（gender/age 缺失时跳过，等下次调用）
    if (!params.gender && params.age === undefined) {
      return { records: [], characters: [], matched: false };
    }

    const generatedIds = existing
      .filter((c) => c.sourceType === "generated")
      .map((c) => c.libraryCharacterId);

    const libraryCharacters = await this.deps.libraryCharacters.findByUserId(params.userId);
    const matchResult = matchLibraryCharactersByOutfit({
      libraryCharacters,
      excludeIds: generatedIds,
      gender: params.gender,
      age: params.age,
    });

    // 4. 持久化匹配结果
    const topN = params.topN ?? 4;
    const newRecords: ProjectCharacter[] = [];
    for (const charId of matchResult.characterIds.slice(0, topN)) {
      const now = this.deps.clock.now();
      const record: ProjectCharacter = {
        id: this.deps.clock.generateId(),
        projectId: params.projectId,
        libraryCharacterId: charId,
        role: "secondary",
        sourceType: "library",
        isSelected: false,
        generationSlot: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      // eslint-disable-next-line no-await-in-loop
      await this.deps.projectCharacters.create(record);
      newRecords.push(record);
    }

    // 合并手动选入的记录（generationSlot=5）
    const manualRecords = existing.filter((c) => c.sourceType === "library" && c.generationSlot === 5);
    const allRecords = [...manualRecords, ...newRecords].sort((a, b) => {
      const slotA = a.generationSlot ?? 0;
      const slotB = b.generationSlot ?? 0;
      if (slotA === 5) return -1;
      if (slotB === 5) return 1;
      return a.createdAt - b.createdAt;
    });

    const characters = await this.loadCharactersByIds(allRecords.map((r) => r.libraryCharacterId));
    return { records: allRecords, characters, matched: true };
  }

  /** 根据 ID 批量加载角色库角色 */
  private async loadCharactersByIds(ids: string[]): Promise<LibraryCharacter[]> {
    const results: LibraryCharacter[] = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const char = await this.deps.libraryCharacters.findById(id);
      if (char) results.push(char);
    }
    return results;
  }
}
