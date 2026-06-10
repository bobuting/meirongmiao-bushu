/**
 * realApi/library.ts - 内容库相关 API 实现
 */

import { request } from "../backendApi.request";
import type {
  LibraryCharacterDto,
  MyLibraryQueryDto,
  CharacterFiveViewDto,
  Step1ImageClassificationCategory,
  Step1ImageClassificationViewLabel,
} from "../backendApi.types";
import type { ReverseStoryboardLibraryRecordDto } from "../../../../src/contracts/reverse-storyboard-library-api";
import type {
  MyLibraryPagedResponse,
  UserScriptRecordDto,
  MyStoryboardLibraryRecordDto,
} from "../../../../src/contracts/my-library-api";
import type { SmartStoryboardLibraryRecordDto } from "../../../../src/contracts/smart-storyboard-library-api";

export interface RealLibraryApi {
  classifyLibraryAssetImage(
    token: string,
    payload: { imageUrl: string; fileName?: string; target?: string; hasMainImage?: boolean; existingOtherViewCount?: number; includeFeedback?: boolean },
  ): Promise<{
    mode: "provider" | "heuristic" | "fallback";
    isClothingImage: boolean;
    clothingImageReason: string | null;
    classification: { category: Step1ImageClassificationCategory; confidence: number; viewLabel: Step1ImageClassificationViewLabel; reason: string | null } | null;
    classificationFeedback: { category: Step1ImageClassificationCategory; confidence: number; viewLabel: Step1ImageClassificationViewLabel; reason: string; mode: string } | null;
    multiViewWarning: string | null;
    clothingTitle: string | null;
    clothingDescription: string | null;
    clothingStyle: string[] | null;
    clothingAttributes?: {
      mainColor?: string | null;
      material?: string | null;
      pattern?: string | null;
      fit?: string | null;
      length?: string | null;
      neckline?: string | null;
      sleeve?: string | null;
      style?: string | null;
      occasion?: string | null;
    } | null;
  }>;
  checkPortraitImage(
    token: string,
    payload: { imageUrl: string },
  ): Promise<{
    isPortrait: boolean;
    reason: string | null;
    mode: "heuristic" | "llm" | "error";
    analysis: {
      ethnicity?: string | null;
      age?: number | null;
      gender?: "male" | "female" | null;
      style?: string;
      bodyType?: string;
      faceShape?: string;
      facialFeatures?: string;
      eyebrows?: string;
      eyes?: string;
      eyeExpression?: string;
      nose?: string;
      lips?: string;
      chin?: string;
      skinTone?: string;
      hairStyle?: string;
      uniqueFeatures?: string;
    } | null;
  }>;
  getStsCredential(
    token: string,
    projectId: string,
    forLibrary?: boolean,
  ): Promise<{
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
    expiration: string;
    bucket: string;
    region: string;
  }>;
  /** 获取签名上传 URL（推荐，更安全） */
  signUploadUrl(
    token: string,
    payload: {
      filename: string;
      contentType: string;
      projectId?: string;
      forLibrary?: boolean;
    },
  ): Promise<{
    uploadUrl: string;
    objectKey: string;
    fileUrl: string;
    expiresInSeconds: number;
  }>;
  /** 删除文件（服务端代理删除） */
  deleteOssFile(
    token: string,
    payload: {
      objectKey: string;
      projectId?: string;
      forLibrary?: boolean;
    },
  ): Promise<{ ok: boolean }>;
  listLibraryCharacters(token: string, params?: import('../backendApi.types').ListLibraryCharactersParams): Promise<{
    items: import('../backendApi.types').LibraryCharacterDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;
  /** 获取符合性别/年龄的角色列表（用于弹窗选择） */
  getMatchCandidates(token: string, projectId: string, projectKind: "video" | "image" | "reverse"): Promise<{
    characters: LibraryCharacterDto[];
  }>;
  /** 获取单个角色详情 */
  getLibraryCharacter(token: string, characterId: string): Promise<LibraryCharacterDto>;
  createLibraryCharacter(
    token: string,
    payload: {
      name: string;
      kind: "basic" | "image" | "video";
      thumbnailUrl?: string;
      tags?: string[];
      fiveViewOssImageUrl?: string | null;
      videoPreview?: string | null;
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
  ): Promise<{ id: string }>;
  updateLibraryCharacter(
    token: string,
    characterId: string,
    payload: { name?: string; tags?: string[] },
  ): Promise<{ ok: boolean }>;
  generateDressedupFiveViewBoard(
    token: string,
    payload: {
      projectId: string;
      prompt?: string;
      coreFeatures?: string;
      phase1Outfit?: string;
      referenceImages?: string[];
      allInOneSlot?: number;
    },
  ): Promise<{
    jobId: string;
    character: {
      id: string;
      name: string;
      status: "processing" | "ready";
      thumbnailUrl: string | null;
      fiveViewOssImageUrl: string | null;
    };
    status: "pending" | "running";
    message: string;
  }>;
  /** 重试五视图生成（已有角色时原地替换五视图，不创建新角色） */
  retryDressedupFiveView(
    token: string,
    payload: {
      characterId: string;
      projectId: string;
      generationSlot?: number;
    },
  ): Promise<{
    jobId: string;
    character: {
      id: string;
      name: string;
      status: "processing" | "ready";
      thumbnailUrl: string | null;
      fiveViewOssImageUrl: string | null;
    };
    status: "pending" | "running";
    message: string;
  }>;
  /** 批量生成五视图（创建父任务 + 多个子任务） */
  batchGenerateDressedupFiveView(
    token: string,
    payload: {
      projectId: string;
      slots: number[];
    },
  ): Promise<{
    jobId: string;
    children: Array<{
      jobId: string;
      slot: number;
      character: {
        id: string;
        name: string;
        status: "processing" | "ready";
        thumbnailUrl: string | null;
        fiveViewOssImageUrl: string | null;
      };
    }>;
    status: "pending" | "running";
    message: string;
  }>;
  deleteLibraryCharacter(token: string, characterId: string): Promise<{ ok: boolean }>;
  /** 检查角色是否被项目使用 */
  checkCharacterInUse(token: string, characterId: string): Promise<{ inUse: boolean; projectCount: number }>;
  listMyLibraryScripts(
    token: string,
    query?: MyLibraryQueryDto,
  ): Promise<MyLibraryPagedResponse<UserScriptRecordDto>>;
  getMyLibraryScript(
    token: string,
    scriptId: string,
  ): Promise<UserScriptRecordDto>;
  listMyLibraryStoryboards(
    token: string,
    query?: MyLibraryQueryDto,
  ): Promise<MyLibraryPagedResponse<MyStoryboardLibraryRecordDto>>;
  adminSmartStoryboardLibrary(
    token: string,
    query?: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      tags?: string[];
    },
  ): Promise<{
    items: SmartStoryboardLibraryRecordDto[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  adminUpdateSmartStoryboard(
    token: string,
    itemId: string,
    payload: { tags?: string[]; notes?: string },
  ): Promise<{ ok: boolean }>;
  adminDeleteSmartStoryboards(token: string, itemIds: string[]): Promise<{ ok: boolean }>;
  listLibraryScripts(token: string): Promise<{
    scripts: Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      date: number;
    }>;
  }>;
  createLibraryScript(
    token: string,
    payload: {
      title: string;
      content: string;
      tags?: string[];
    },
  ): Promise<{ id: string }>;
  // 注意：新 API 不支持脚本修改功能，updateLibraryScript 已移除
  deleteLibraryScript(token: string, scriptId: string): Promise<{ ok: boolean }>;
  deleteLibraryScripts(token: string, scriptIds: string[]): Promise<{ ok: boolean }>;
  // 注意：新 API 不支持版本管理功能，listLibraryScriptVersions 和 rollbackLibraryScript 已移除
  listReverseStoryboardLibrary(token: string): Promise<{
    items: ReverseStoryboardLibraryRecordDto[];
  }>;
  updateReverseStoryboardLibrary(
    token: string,
    itemId: string,
    payload: { tags?: string[]; notes?: string },
  ): Promise<{ ok: boolean }>;
  deleteReverseStoryboardLibrary(token: string, itemId: string): Promise<{ ok: boolean }>;
  deleteReverseStoryboardLibraryBatch(
    token: string,
    itemIds: string[],
  ): Promise<{ ok: boolean }>;
  // 五视图相关 API
  listCharacterFiveViews(
    token: string,
    characterId: string,
  ): Promise<{ items: CharacterFiveViewDto[] }>;
  createCharacterFiveView(
    token: string,
    characterId: string,
  ): Promise<CharacterFiveViewDto>;
  activateCharacterFiveView(
    token: string,
    characterId: string,
    viewId: string,
  ): Promise<{ success: boolean }>;
  deleteCharacterFiveView(
    token: string,
    characterId: string,
    viewId: string,
  ): Promise<{ success: boolean }>;
  generateCharacterFiveView(
    token: string,
    characterId: string,
    options?: {
      characterPreset?: string;
      outfitInfo?: string;
      outfitMatching?: string;
      flatLayImageUrls?: string[];
      projectId?: string;
      force?: boolean;
    },
  ): Promise<CharacterFiveViewDto>;
  /** 生成真人五视图（角色管理页，不需要服饰平铺图） */
  generateRealPortraitFiveView(
    token: string,
    characterId: string,
    options?: {
      force?: boolean;
    },
  ): Promise<CharacterFiveViewDto>;
  /** 生成五视图预览（项目内服饰搭配） */
  generateFiveViewPreview(
    token: string,
    params: {
      projectId?: string;
      flatLayImageUrls?: string[];
      promptCode?: string;
      characterPreset?: string;
      outfitInfo?: string;
      outfitMatching?: string;
    },
  ): Promise<CharacterFiveViewDto>;
  /** 生成真人五视图预览（角色管理页，不需要服饰平铺图） */
  generateRealPortraitFiveViewPreview(
    token: string,
    params: {
      portraitImageUrl?: string;
    },
  ): Promise<CharacterFiveViewDto>;
  /** 生成服饰+真人结合五视图预览（项目内 + 角色头像同时传入） */
  generateOutfitPortraitFiveViewPreview(
    token: string,
    params: {
      projectId?: string;
      portraitImageUrl: string;
      outfitInfo?: string;
      outfitMatching?: string;
    },
  ): Promise<CharacterFiveViewDto>;
}

function appendMyLibraryQueryParams(
  params: URLSearchParams,
  query?: MyLibraryQueryDto,
): void {
  if (!query) return;
  if (Number.isFinite(query.page)) {
    params.set("page", String(Math.floor(Number(query.page))));
  }
  if (Number.isFinite(query.pageSize)) {
    params.set("pageSize", String(Math.floor(Number(query.pageSize))));
  }
  if (query.keyword?.trim()) {
    params.set("keyword", query.keyword.trim());
  }
  if (Array.isArray(query.tags)) {
    for (const tag of query.tags) {
      if (tag?.trim()) {
        params.append("tags", tag.trim());
      }
    }
  }
  if (query.sourceType?.trim()) {
    params.set("sourceType", query.sourceType.trim());
  }
  if (Number.isFinite(query.updatedAfter)) {
    params.set("updatedAfter", String(Math.floor(Number(query.updatedAfter))));
  }
  if (Number.isFinite(query.updatedBefore)) {
    params.set("updatedBefore", String(Math.floor(Number(query.updatedBefore))));
  }
}

export const realLibraryApi: RealLibraryApi = {
  classifyLibraryAssetImage(
    token: string,
    payload: { imageUrl: string; fileName?: string; target?: string; hasMainImage?: boolean; existingOtherViewCount?: number; includeFeedback?: boolean; sizeMb?: number; source?: string },
  ) {
    return request<{
      mode: "provider" | "heuristic" | "fallback";
      isClothingImage: boolean;
      clothingImageReason: string | null;
      classification: { category: Step1ImageClassificationCategory; confidence: number; viewLabel: Step1ImageClassificationViewLabel; reason: string | null } | null;
      classificationFeedback: { category: Step1ImageClassificationCategory; confidence: number; viewLabel: Step1ImageClassificationViewLabel; reason: string; mode: string } | null;
      multiViewWarning: string | null;
      clothingTitle: string | null;
      clothingDescription: string | null;
      clothingStyle: string[] | null;
      clothingAttributes?: {
        mainColor?: string | null;
        material?: string | null;
        pattern?: string | null;
        fit?: string | null;
        length?: string | null;
        neckline?: string | null;
        sleeve?: string | null;
        style?: string | null;
        occasion?: string | null;
      } | null;
      sellingPoints?: Array<{ point: string; category: string; priority: number }> | null;
      garments?: Array<{
        index: number;
        category: string;
        isMainSubject: boolean;
        visibility: string;
        confidence: number;
        boundingBox?: { x: number; y: number; width: number; height: number };
      }> | null;
      /** 自动创建的资产 ID（库上传场景） */
      assetId: string | null;
    }>("POST", "/step1/classify-image", {
      token,
      body: payload,
    });
  },

  checkPortraitImage(
    token: string,
    payload: { imageUrl: string },
  ) {
    return request<{
      isPortrait: boolean;
      reason: string | null;
      mode: "heuristic" | "llm" | "error";
      analysis: {
        ethnicity?: string | null;
        age?: number | null;
        gender?: "male" | "female" | null;
        style?: string;
        bodyType?: string;
        faceShape?: string;
        facialFeatures?: string;
        eyebrows?: string;
        eyes?: string;
        eyeExpression?: string;
        nose?: string;
        lips?: string;
        chin?: string;
        skinTone?: string;
        hairStyle?: string;
        uniqueFeatures?: string;
      } | null;
    }>("POST", "/library/characters/check-portrait", {
      token,
      body: payload,
    });
  },

  getStsCredential(token: string, projectId: string, forLibrary?: boolean) {
    return request<{
      accessKeyId: string;
      accessKeySecret: string;
      securityToken: string;
      expiration: string;
      bucket: string;
      region: string;
    }>("POST", "/library/assets/sts-credential", { token, body: { projectId, forLibrary } });
  },

  /** 获取签名上传 URL（推荐，更安全） */
  signUploadUrl(
    token: string,
    payload: {
      filename: string;
      contentType: string;
      projectId?: string;
      forLibrary?: boolean;
    },
  ) {
    return request<{
      uploadUrl: string;
      objectKey: string;
      fileUrl: string;
      expiresInSeconds: number;
    }>("POST", "/library/assets/sign-upload-url", { token, body: payload });
  },

  /** 删除文件（服务端代理删除） */
  deleteOssFile(
    token: string,
    payload: {
      objectKey: string;
      projectId?: string;
      forLibrary?: boolean;
    },
  ) {
    return request<{ ok: boolean }>("POST", "/library/assets/delete-file", { token, body: payload });
  },

  listLibraryCharacters(token: string, params?: import('../backendApi.types').ListLibraryCharactersParams) {
    const queryParts: string[] = [];
    if (params?.page) queryParts.push(`page=${params.page}`);
    if (params?.pageSize) queryParts.push(`pageSize=${params.pageSize}`);
    if (params?.gender) queryParts.push(`gender=${encodeURIComponent(params.gender)}`);
    if (params?.tags?.length) queryParts.push(`tags=${encodeURIComponent(params.tags.join(','))}`);
    if (params?.keyword) queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return request<{
      items: import('../backendApi.types').LibraryCharacterDto[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    }>("GET", `/library/characters${qs}`, { token });
  },

  /** 获取符合性别/年龄的角色列表（用于弹窗选择） */
  getMatchCandidates(token: string, projectId: string, projectKind: "video" | "image" | "reverse") {
    const prefix = projectKind === "image" ? "/image-projects" : projectKind === "reverse" ? "/reverse-projects" : "/projects";
    return request<{
      characters: LibraryCharacterDto[];
    }>("GET", `${prefix}/${projectId}/characters/match-candidates`, { token });
  },

  /** 获取单个角色详情 */
  getLibraryCharacter(token: string, characterId: string) {
    return request<LibraryCharacterDto>("GET", `/library/characters/${characterId}`, { token });
  },

  createLibraryCharacter(
    token: string,
    payload: {
      name: string;
      kind: "basic" | "image" | "video";
      thumbnailUrl?: string;
      tags?: string[];
      fiveViewOssImageUrl?: string | null;
      videoPreview?: string | null;
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
  ) {
    return request<{ id: string }>("POST", "/library/characters", {
      token,
      body: payload,
    });
  },

  updateLibraryCharacter(
    token: string,
    characterId: string,
    payload: { name?: string; tags?: string[] },
  ) {
    return request<{ ok: boolean }>("PATCH", `/library/characters/${characterId}`, {
      token,
      body: payload,
    });
  },

  generateDressedupFiveViewBoard(
    token: string,
    payload: {
      projectId: string;
      prompt?: string;
      referenceImages?: string[];
      allInOneSlot?: number;
    },
  ) {
    return request<{
      jobId: string;
      character: {
        id: string;
        name: string;
        status: "processing" | "ready";
        thumbnailUrl: string | null;
        fiveViewOssImageUrl: string | null;
      };
      status: "pending" | "running";
      message: string;
    }>(
      "POST",
      `/library/dressedup/generate-five-view`,
      {
        token,
        body: payload,
      },
    );
  },

  /** 批量生成五视图（创建父任务 + 多个子任务） */
  batchGenerateDressedupFiveView(
    token: string,
    payload: {
      projectId: string;
      slots: number[];
    },
  ) {
    return request<{
      jobId: string;
      children: Array<{
        jobId: string;
        slot: number;
        character: {
          id: string;
          name: string;
          status: "processing" | "ready";
          thumbnailUrl: string | null;
          fiveViewOssImageUrl: string | null;
        };
      }>;
      status: "pending" | "running";
      message: string;
    }>(
      "POST",
      `/library/dressedup/batch-generate-five-view`,
      {
        token,
        body: payload,
      },
    );
  },

  retryDressedupFiveView(
    token: string,
    payload: {
      characterId: string;
      projectId?: string;
      generationSlot?: number;
    },
  ) {
    return request<{
      jobId: string;
      character: {
        id: string;
        name: string;
        status: "processing" | "ready";
        thumbnailUrl: string | null;
        fiveViewOssImageUrl: string | null;
      };
      status: "pending" | "running";
      message: string;
    }>(
      "POST",
      `/library/dressedup/retry-five-view`,
      {
        token,
        body: payload,
      },
    );
  },

  deleteLibraryCharacter(token: string, characterId: string) {
    return request<{ ok: boolean }>("DELETE", `/library/characters/${characterId}`, { token });
  },

  /** 检查角色是否被项目使用 */
  checkCharacterInUse(token: string, characterId: string): Promise<{ inUse: boolean; projectCount: number }> {
    return request<{ inUse: boolean; projectCount: number }>("GET", `/library/characters/${characterId}/usage-check`, { token });
  },

  listMyLibraryScripts(token: string, query?: MyLibraryQueryDto) {
    const params = new URLSearchParams();
    appendMyLibraryQueryParams(params, query);
    const queryString = params.toString();
    return request<MyLibraryPagedResponse<UserScriptRecordDto>>(
      "GET",
      `/my-library/scripts${queryString ? `?${queryString}` : ""}`,
      { token },
    );
  },

  getMyLibraryScript(token: string, scriptId: string) {
    return request<UserScriptRecordDto>(
      "GET",
      `/my-library/scripts/${scriptId}`,
      { token },
    );
  },

  listMyLibraryStoryboards(token: string, query?: MyLibraryQueryDto) {
    const params = new URLSearchParams();
    appendMyLibraryQueryParams(params, query);
    const queryString = params.toString();
    return request<MyLibraryPagedResponse<MyStoryboardLibraryRecordDto>>(
      "GET",
      `/my-library/storyboards${queryString ? `?${queryString}` : ""}`,
      { token },
    );
  },

  adminSmartStoryboardLibrary(
    token: string,
    query?: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      tags?: string[];
    },
  ) {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    if (query?.keyword) params.set("keyword", query.keyword);
    if (query?.tags) {
      for (const tag of query.tags) {
        params.append("tags", tag);
      }
    }
    const queryString = params.toString();
    return request<{
      items: SmartStoryboardLibraryRecordDto[];
      total: number;
      page: number;
      pageSize: number;
    }>("GET", `/admin/smart-storyboards${queryString ? `?${queryString}` : ""}`, {
      token,
    });
  },

  adminUpdateSmartStoryboard(
    token: string,
    itemId: string,
    payload: { tags?: string[]; notes?: string },
  ) {
    return request<{ ok: boolean }>("PATCH", `/admin/smart-storyboards/${itemId}`, {
      token,
      body: payload,
    });
  },

  adminDeleteSmartStoryboards(token: string, itemIds: string[]) {
    return request<{ ok: boolean }>("POST", "/admin/smart-storyboards/batch-delete", {
      token,
      body: { itemIds },
    });
  },

  listLibraryScripts(token: string) {
    return request<{
      scripts: Array<{
        id: string;
        title: string;
        content: string;
        tags: string[];
        date: number;
      }>;
    }>("GET", "/scripts", { token });
  },

  createLibraryScript(
    token: string,
    payload: {
      title: string;
      content: string;
      tags?: string[];
    },
  ) {
    return request<{ id: string }>("POST", "/scripts", {
      token,
      body: payload,
    });
  },

  // 注意：新 API 不支持脚本修改功能，此方法已移除
  // updateLibraryScript(token: string, scriptId: string, payload: ...) { ... }

  deleteLibraryScript(token: string, scriptId: string) {
    return request<{ ok: boolean }>("DELETE", `/scripts/${scriptId}`, { token });
  },

  deleteLibraryScripts(token: string, scriptIds: string[]) {
    return request<{ ok: boolean }>("POST", "/scripts/batch-delete", {
      token,
      body: { scriptIds },
    });
  },

  // 注意：新 API 不支持版本管理功能，以下方法已移除
  // listLibraryScriptVersions(token: string, scriptId: string) { ... }
  // rollbackLibraryScript(token: string, scriptId: string, version: number) { ... }

  listReverseStoryboardLibrary(token: string) {
    return request<{
      items: ReverseStoryboardLibraryRecordDto[];
    }>("GET", "/admin/capability-lab/reverse-storyboard-library", { token });
  },

  updateReverseStoryboardLibrary(
    token: string,
    itemId: string,
    payload: { tags?: string[]; notes?: string },
  ) {
    return request<{ ok: boolean }>("PATCH", `/admin/capability-lab/reverse-storyboard-library/${itemId}`, {
      token,
      body: payload,
    });
  },

  deleteReverseStoryboardLibrary(token: string, itemId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/smart-storyboards/${itemId}`, {
      token,
    });
  },

  deleteReverseStoryboardLibraryBatch(token: string, itemIds: string[]) {
    return request<{ ok: boolean }>("POST", "/admin/smart-storyboards/batch-delete", {
      token,
      body: { itemIds },
    });
  },

  // 五视图相关 API
  listCharacterFiveViews(token: string, characterId: string) {
    return request<{ items: CharacterFiveViewDto[] }>(
      "GET",
      `/library/characters/${characterId}/five-views`,
      { token },
    );
  },

  createCharacterFiveView(token: string, characterId: string) {
    return request<CharacterFiveViewDto>(
      "POST",
      `/library/characters/${characterId}/five-views`,
      { token },
    );
  },

  activateCharacterFiveView(token: string, characterId: string, viewId: string) {
    return request<{ success: boolean }>(
      "PUT",
      `/library/characters/${characterId}/five-views/${viewId}/activate`,
      { token },
    );
  },

  deleteCharacterFiveView(token: string, characterId: string, viewId: string) {
    return request<{ success: boolean }>(
      "DELETE",
      `/library/characters/${characterId}/five-views/${viewId}`,
      { token },
    );
  },

  /** 生成五视图图板 */
  generateCharacterFiveView(token: string, characterId: string, options?: {
    characterPreset?: string;
    outfitInfo?: string;
    outfitMatching?: string;
    flatLayImageUrls?: string[];
    projectId?: string;
    force?: boolean;
  }) {
    return request<CharacterFiveViewDto>(
      "POST",
      `/library/characters/${characterId}/five-views/generate`,
      {
        token,
        body: options && Object.keys(options).length > 0 ? options : undefined,
      },
    );
  },

  /** 生成真人五视图（角色管理页） */
  generateRealPortraitFiveView(token: string, characterId: string, options?: {
    force?: boolean;
  }) {
    return request<CharacterFiveViewDto>(
      "POST",
      `/library/characters/${characterId}/five-views/generate-real-portrait`,
      {
        token,
        body: options && Object.keys(options).length > 0 ? options : undefined,
      },
    );
  },

  /** 生成五视图预览（项目内服饰搭配） */
  generateFiveViewPreview(token: string, params: {
    projectId?: string;
    flatLayImageUrls?: string[];
    promptCode?: string;
    characterPreset?: string;
    outfitInfo?: string;
    outfitMatching?: string;
  }) {
    return request<CharacterFiveViewDto>(
      "POST",
      "/library/five-views/preview",
      { token, body: params },
    );
  },

  /** 生成真人五视图预览（角色管理页，不需要服饰平铺图） */
  generateRealPortraitFiveViewPreview(token: string, params: {
    portraitImageUrl?: string;
  }) {
    return request<CharacterFiveViewDto>(
      "POST",
      "/library/five-views/preview-real-portrait",
      { token, body: params },
    );
  },

  /** 生成服饰+真人结合五视图预览（项目内 + 角色头像同时传入） */
  generateOutfitPortraitFiveViewPreview(token: string, params: {
    projectId?: string;
    portraitImageUrl: string;
    outfitInfo?: string;
    outfitMatching?: string;
  }) {
    return request<CharacterFiveViewDto>(
      "POST",
      "/library/five-views/preview-outfit-portrait",
      { token, body: params },
    );
  },
};