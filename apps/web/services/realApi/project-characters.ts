/**
 * realApi/projects-characters.ts - 项目角色 API
 */

interface CharacterSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  tags: string[];
  views: string[];
  fiveViewOssImageUrl?: string | null;
  status: string;
  kind: string;
  viewSession?: Record<string, unknown> | null;
  /** 激活五视图的状态（来自 nrm_character_five_views 表） */
  activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
}

export interface RealProjectCharactersApi {
  listProjectCharacters(token: string, projectId: string): Promise<{
    items: Array<{
      id: string;
      projectId: string;
      libraryCharacterId: string;
      role: "main" | "secondary";
      sourceType: "generated" | "library"; // 角色来源：generated=生成角色，library=角色库推荐
      isSelected: boolean;
      generationSlot: number | null;
      character: CharacterSummary | null;
      createdAt: number;
      updatedAt: number;
    }>;
    selectedCharacterId: string | null;
  }>;
  /** 获取角色库推荐角色（懒匹配：无结果时自动触发匹配） */
  getLibraryRecommendations(token: string, projectId: string): Promise<{
    items: Array<{
      id: string;
      projectId: string;
      libraryCharacterId: string;
      role: "main" | "secondary";
      sourceType: "generated" | "library";
      isSelected: boolean;
      generationSlot: number | null;
      character: CharacterSummary | null;
      createdAt: number;
      updatedAt: number;
    }>;
  }>;
  addProjectCharacter(
    token: string,
    projectId: string,
    payload: { libraryCharacterId: string; role?: "main" | "secondary"; sourceType?: "generated" | "library"; generationSlot?: number },
  ): Promise<{
    item: {
      id: string;
      projectId: string;
      libraryCharacterId: string;
      role: "main" | "secondary";
      sourceType: "generated" | "library";
      isSelected: boolean;
      generationSlot: number | null;
      character: CharacterSummary | null;
      createdAt: number;
      updatedAt: number;
    };
  }>;
  selectProjectCharacter(token: string, projectId: string, characterId: string): Promise<{ success: boolean }>;
  /** 选中角色并同步更新项目表的 selected_character_id */
  selectProjectCharacterWithProject(token: string, projectId: string, characterId: string): Promise<{ success: boolean }>;
  removeProjectCharacter(token: string, projectId: string, characterId: string): Promise<{ success: boolean }>;
  /** @deprecated 使用 getLibraryRecommendations 替代 */
  matchCharactersByOutfit(
    token: string,
    projectId: string,
    payload: {
      outfitSummary?: string;
      roleDirectionPrompt?: string;
      selectedCharacterName?: string;
    },
  ): Promise<{
    characterIds: string[];
    alreadyMatched: boolean;
  }>;
  /** @deprecated 使用 getLibraryRecommendations 替代 */
  matchImageCharactersByOutfit(
    token: string,
    projectId: string,
    payload: {
      outfitSummary?: string;
      roleDirectionPrompt?: string;
      selectedCharacterName?: string;
    },
  ): Promise<{
    characterIds: string[];
    alreadyMatched: boolean;
  }>;
  /** Step2 确认/取消确认角色，更新项目状态和 step_state */
  step2Confirm(
    token: string,
    projectId: string,
    payload: { confirmed?: boolean; confirmedCandidateId?: string | null },
  ): Promise<{ success: boolean; projectStatus: string }>;
}

export const realProjectCharactersApi: RealProjectCharactersApi = {
  listProjectCharacters(token, projectId) {
    return request("GET", `/projects/${projectId}/characters`, { token });
  },
  getLibraryRecommendations(token, projectId) {
    return request("GET", `/projects/${projectId}/characters/library-recommendations`, { token });
  },
  addProjectCharacter(token, projectId, payload) {
    return request("POST", `/projects/${projectId}/characters`, { token, body: payload });
  },
  selectProjectCharacter(token, projectId, characterId) {
    return request("PUT", `/projects/${projectId}/characters/${characterId}/select`, { token });
  },
  selectProjectCharacterWithProject(token, projectId, characterId) {
    return request("PUT", `/projects/${projectId}/select-character/${characterId}`, { token });
  },
  removeProjectCharacter(token, projectId, characterId) {
    return request("DELETE", `/projects/${projectId}/characters/${characterId}`, { token });
  },
  matchCharactersByOutfit(token, projectId, payload) {
    return request("POST", `/projects/${projectId}/characters/match-by-outfit`, { token, body: payload });
  },
  matchImageCharactersByOutfit(token, projectId, payload) {
    return request("POST", `/image-projects/${projectId}/characters/match-by-outfit`, { token, body: payload });
  },
  step2Confirm(token, projectId, payload) {
    return request("PUT", `/projects/${projectId}/step2/confirm`, { token, body: payload });
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function request(method: string, path: string, opts: { token: string; body?: unknown }): Promise<any> {
  return import("../backendApi.request").then((m) => m.request(method, path, opts as any));
}
