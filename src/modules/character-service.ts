/**
 * 角色服务
 * V1 流程（generatePreviews / confirmPreview）已移除，统一使用五视图系统。
 */

import type { CharacterPreset, User } from "../contracts/types.js";
import type { ILibraryCharacterRepository } from "../contracts/repository-ports/index.js";
import type { ICharacterService } from "../contracts/services.js";

export class CharacterService implements ICharacterService {
  constructor(
    private readonly repos: {
      libraryCharacters: ILibraryCharacterRepository;
    },
  ) {}

  async listPresets(user: User): Promise<CharacterPreset[]> {
    const characters = await this.repos.libraryCharacters.findByUserId(user.id);
    return characters
      .filter((item) => item.status === "ready")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({
        id: item.id,
        name: item.name,
        tags: item.tags,
      }));
  }
}
