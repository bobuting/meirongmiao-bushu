import type { RouteApiCallInvoker } from "./backendApi.projectReverse";

export interface VideoMusicDto {
  id: string;
  title: string;
  musicUrl: string;
  localPath: string | null;
  sourceUrl: string | null;
  atmospheres?: string[];
  durationSec: number | null;
  artist: string | null;
  album: string | null;
  coverUrl: string | null;
  createdAt: number;
  updatedAt: number;
  creatorId?: string | null;
}

export interface VideoMusicMatchResultDto {
  success: boolean;
  music: VideoMusicDto | null;
  candidates?: VideoMusicDto[];
  matchedAtmosphere: string | null;
  candidateAtmospheres: string[];
  usedDefault: boolean;
  error?: string;
}

export interface VideoMusicSyncResultDto {
  success: boolean;
  added: number;
  skipped: number;
  failed: Array<{ title: string; reason: string }>;
  items: VideoMusicDto[];
}

export interface VideoMusicAtmosphereAnalysisResultDto {
  success: boolean;
  results: Array<{ id: string; atmospheres: string[] }>;
}

/** 项目-视频音乐关联记录 DTO */
export interface ProjectVideoMusicDto {
  id: string;
  projectId: string;
  musicId: string;
  musicUrl: string;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
  isSelected: boolean;
  title: string | null;
  atmospheres: string[];
  artist: string | null;
  durationSec: number | null;
  coverUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 项目音乐列表结果 */
export interface ProjectVideoMusicListResult {
  items: ProjectVideoMusicDto[];
  selectedMusic: ProjectVideoMusicDto | null;
}

/** 批量保存请求体 */
export interface BatchSaveProjectVideoMusicPayload {
  musics: Array<{
    musicId: string;
    musicUrl: string;
    volume?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    title?: string | null;
    atmospheres?: string[];
    artist?: string | null;
    durationSec?: number | null;
    coverUrl?: string | null;
  }>;
  selectedMusicId?: string | null;
}

/** 批量保存结果 */
export interface BatchSaveResult {
  success: boolean;
  items: ProjectVideoMusicDto[];
}

/** 选择音乐结果 */
export interface SelectResult {
  success: boolean;
  item: ProjectVideoMusicDto;
}

/** 更新音乐结果 */
export interface UpdateResult {
  success: boolean;
  item: ProjectVideoMusicDto;
}

/** 删除音乐结果 */
export interface DeleteResult {
  success: boolean;
  removedId: string;
}

export interface VideoMusicBackendApiShape {
  listVideoMusic: (
    token: string,
    query?: {
      search?: string | null;
      atmosphere?: string | null;
    },
  ) => Promise<{ enabled: boolean; items: VideoMusicDto[] }>;
  getVideoMusic: (token: string, musicId: string) => Promise<VideoMusicDto>;
  matchVideoMusicByScript: (
    token: string,
    payload: { projectId: string },
  ) => Promise<VideoMusicMatchResultDto>;
  syncVideoMusic: (token: string) => Promise<VideoMusicSyncResultDto>;
  uploadVideoMusic: (
    token: string,
    payload: { file: File; title?: string | null; artist?: string | null; album?: string | null },
  ) => Promise<VideoMusicDto>;
  createVideoMusic: (
    token: string,
    payload: {
      title: string;
      musicUrl: string;
      atmospheres?: string[];
      artist?: string | null;
      album?: string | null;
      coverUrl?: string | null;
      sourceUrl?: string | null;
    },
  ) => Promise<VideoMusicDto>;
  updateVideoMusic: (
    token: string,
    musicId: string,
    payload: {
      title?: string;
      musicUrl?: string;
      atmospheres?: string[];
      artist?: string | null;
      album?: string | null;
      coverUrl?: string | null;
      sourceUrl?: string | null;
      durationSec?: number | null;
    },
  ) => Promise<VideoMusicDto>;
  deleteVideoMusic: (token: string, musicId: string) => Promise<{ success: true; removedId: string }>;
  analyzeVideoMusicAtmosphere: (
    token: string,
    payload?: { musicIds?: string[] },
  ) => Promise<VideoMusicAtmosphereAnalysisResultDto>;

  // 项目音乐方法
  listProjectVideoMusics: (token: string, projectId: string) => Promise<ProjectVideoMusicListResult>;
  batchSaveProjectVideoMusics: (token: string, projectId: string, payload: BatchSaveProjectVideoMusicPayload) => Promise<BatchSaveResult>;
  selectProjectVideoMusic: (token: string, projectId: string, id: string) => Promise<SelectResult>;
  clearSelectionProjectVideoMusics: (token: string, projectId: string) => Promise<{ success: boolean }>;
  updateProjectVideoMusic: (token: string, projectId: string, id: string, payload: { volume?: number; fadeInSec?: number; fadeOutSec?: number }) => Promise<UpdateResult>;
  deleteProjectVideoMusic: (token: string, projectId: string, id: string) => Promise<DeleteResult>;
}

interface RequestInvoker {
  <T>(
    method: string,
    path: string,
    options?: {
      token?: string | null;
      body?: unknown;
    },
  ): Promise<T>;
}

interface MockInvokerDependencies {
  mockDelay: (delayMs?: number) => Promise<void>;
}

const MOCK_VIDEO_MUSICS: VideoMusicDto[] = [];

function cloneVideoMusic(item: VideoMusicDto): VideoMusicDto {
  return {
    ...item,
    atmospheres: [...(item.atmospheres ?? [])],
  };
}

function resolveMockVideoMusicMatch(_scriptText: string): VideoMusicMatchResultDto {
  return {
    success: false,
    music: null,
    matchedAtmosphere: null,
    candidateAtmospheres: [],
    usedDefault: true,
    error: "Mock 音乐库为空",
  };
}

export function createVideoMusicRealBackendApi(
  request: RequestInvoker,
): VideoMusicBackendApiShape {
  return {
    listVideoMusic: (token, query) =>
      request<{ enabled: boolean; items: VideoMusicDto[] }>(
        "GET",
        `/video-music${
          query?.search || query?.atmosphere
            ? `?${new URLSearchParams(
                Object.entries({
                  ...(query?.search ? { search: query.search } : {}),
                  ...(query?.atmosphere ? { atmosphere: query.atmosphere } : {}),
                }).map(([key, value]) => [key, String(value)]),
              ).toString()}`
            : ""
        }`,
        { token },
      ),
    getVideoMusic: (token, musicId) => request<VideoMusicDto>("GET", `/video-music/${musicId}`, { token }),
    matchVideoMusicByScript: (token, payload) =>
      request<VideoMusicMatchResultDto>("POST", "/video-music/match-by-script", {
        token,
        body: { projectId: payload.projectId },
      }),
    syncVideoMusic: (token) =>
      request<VideoMusicSyncResultDto>("POST", "/video-music/sync", {
        token,
      }),
    uploadVideoMusic: async (token, payload) => {
      const form = new FormData();
      form.set("file", payload.file);
      if (payload.title?.trim()) form.set("title", payload.title.trim());
      if (payload.artist?.trim()) form.set("artist", payload.artist.trim());
      if (payload.album?.trim()) form.set("album", payload.album.trim());
      return request<VideoMusicDto>("POST", "/video-music/upload", {
        token,
        body: form,
      });
    },
    createVideoMusic: (token, payload) =>
      request<VideoMusicDto>("POST", "/video-music", {
        token,
        body: payload,
      }),
    updateVideoMusic: (token, musicId, payload) =>
      request<VideoMusicDto>("PATCH", `/video-music/${musicId}`, {
        token,
        body: payload,
      }),
    deleteVideoMusic: (token, musicId) =>
      request<{ success: true; removedId: string }>("DELETE", `/video-music/${musicId}`, {
        token,
      }),
    analyzeVideoMusicAtmosphere: (token, payload) =>
      request<VideoMusicAtmosphereAnalysisResultDto>("POST", "/video-music/analyze-atmosphere", {
        token,
        body: payload ?? {},
      }),
    // 项目音乐方法
    listProjectVideoMusics: (token, projectId) =>
      request<ProjectVideoMusicListResult>("GET", `/projects/${projectId}/video-musics`, { token }),
    batchSaveProjectVideoMusics: (token, projectId, payload) =>
      request<BatchSaveResult>("POST", `/projects/${projectId}/video-musics/batch-save`, { token, body: payload }),
    selectProjectVideoMusic: (token, projectId, id) =>
      request<SelectResult>("PUT", `/projects/${projectId}/video-musics/${id}/select`, { token }),
    clearSelectionProjectVideoMusics: (token, projectId) =>
      request<{ success: boolean }>("PUT", `/projects/${projectId}/video-musics/clear-selection`, { token }),
    updateProjectVideoMusic: (token, projectId, id, payload) =>
      request<UpdateResult>("PUT", `/projects/${projectId}/video-musics/${id}`, { token, body: payload }),
    deleteProjectVideoMusic: (token, projectId, id) =>
      request<DeleteResult>("DELETE", `/projects/${projectId}/video-musics/${id}`, { token }),
  };
}

export function createVideoMusicMockBackendApi(
  dependencies: MockInvokerDependencies,
): VideoMusicBackendApiShape {
  const state = MOCK_VIDEO_MUSICS.map(cloneVideoMusic);
  return {
    async listVideoMusic(_token, query) {
      await dependencies.mockDelay();
      const search = String(query?.search ?? "").trim().toLowerCase();
      const atmosphere = String(query?.atmosphere ?? "").trim();
      const items = state.filter((item) => {
        if (search && !`${item.title} ${item.artist ?? ""}`.toLowerCase().includes(search)) {
          return false;
        }
        if (atmosphere && !(item.atmospheres ?? []).includes(atmosphere)) {
          return false;
        }
        return true;
      }).map(cloneVideoMusic);
      return { enabled: true, items };
    },
    async getVideoMusic(_token, musicId) {
      await dependencies.mockDelay();
      const found = state.find((item) => item.id === musicId) ?? state[0];
      return cloneVideoMusic(found!);
    },
    async matchVideoMusicByScript(_token, payload) {
      await dependencies.mockDelay();
      return resolveMockVideoMusicMatch(String(payload?.projectId ?? ""));
    },
    async syncVideoMusic(_token) {
      await dependencies.mockDelay();
      return {
        success: true,
        added: 0,
        skipped: state.length,
        failed: [],
        items: state.map(cloneVideoMusic),
      };
    },
    async uploadVideoMusic(_token, payload) {
      await dependencies.mockDelay();
      const now = Date.now();
      const created: VideoMusicDto = {
        id: `mock-upload-${now}`,
        title: payload.title?.trim() || payload.file.name.replace(/\.[^/.]+$/, ""),
        musicUrl: `/video-music/${encodeURIComponent(payload.file.name)}`,
        localPath: null,
        sourceUrl: null,
        atmospheres: ["轻松"],
        durationSec: null,
        artist: payload.artist?.trim() || null,
        album: payload.album?.trim() || null,
        coverUrl: null,
        creatorId: null,
        createdAt: now,
        updatedAt: now,
      };
      state.unshift(created);
      return cloneVideoMusic(created);
    },
    async createVideoMusic(_token, payload) {
      await dependencies.mockDelay();
      const now = Date.now();
      const created: VideoMusicDto = {
        id: `mock-create-${now}`,
        title: payload.title,
        musicUrl: payload.musicUrl,
        localPath: null,
        sourceUrl: payload.sourceUrl ?? null,
        atmospheres: [...(payload.atmospheres ?? [])],
        durationSec: null,
        artist: payload.artist ?? null,
        album: payload.album ?? null,
        coverUrl: payload.coverUrl ?? null,
        creatorId: null,
        createdAt: now,
        updatedAt: now,
      };
      state.unshift(created);
      return cloneVideoMusic(created);
    },
    async updateVideoMusic(_token, musicId, payload) {
      await dependencies.mockDelay();
      const target = state.find((item) => item.id === musicId) ?? state[0]!;
      Object.assign(target, {
        ...payload,
        atmospheres: payload.atmospheres ? [...payload.atmospheres] : target.atmospheres,
        updatedAt: Date.now(),
      });
      return cloneVideoMusic(target);
    },
    async deleteVideoMusic(_token, musicId) {
      await dependencies.mockDelay();
      const index = state.findIndex((item) => item.id === musicId);
      if (index >= 0) {
        state.splice(index, 1);
      }
      return { success: true, removedId: musicId };
    },
    async analyzeVideoMusicAtmosphere(_token, payload) {
      await dependencies.mockDelay();
      const targetIds = new Set(payload?.musicIds ?? state.map((item) => item.id));
      const results = state
        .filter((item) => targetIds.has(item.id))
        .map((item) => ({
          id: item.id,
          atmospheres: [...(item.atmospheres ?? [])],
        }));
      return {
        success: true,
        results,
      };
    },
    // 项目音乐 Mock 方法
    async listProjectVideoMusics(_token, _projectId) {
      await dependencies.mockDelay();
      return { items: [], selectedMusic: null };
    },
    async batchSaveProjectVideoMusics(_token, projectId, payload) {
      await dependencies.mockDelay();
      const now = Date.now();
      const items: ProjectVideoMusicDto[] = payload.musics.map((m, i) => ({
        id: `pvm-${projectId}-${i}`,
        projectId,
        musicId: m.musicId,
        musicUrl: m.musicUrl,
        volume: m.volume ?? 0.5,
        fadeInSec: m.fadeInSec ?? 0,
        fadeOutSec: m.fadeOutSec ?? 0,
        isSelected: payload.selectedMusicId === m.musicId,
        title: m.title ?? null,
        atmospheres: m.atmospheres ?? [],
        artist: m.artist ?? null,
        durationSec: m.durationSec ?? null,
        coverUrl: m.coverUrl ?? null,
        createdAt: now,
        updatedAt: now,
      }));
      return { success: true, items };
    },
    async selectProjectVideoMusic(_token, projectId, id) {
      await dependencies.mockDelay();
      return {
        success: true,
        item: {
          id,
          projectId,
          musicId: "mock-music",
          musicUrl: "https://example.com/music.mp3",
          volume: 0.5,
          fadeInSec: 0,
          fadeOutSec: 0,
          isSelected: true,
          title: "Mock Music",
          atmospheres: [],
          artist: null,
          durationSec: null,
          coverUrl: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
    },
    async clearSelectionProjectVideoMusics(_token, _projectId) {
      await dependencies.mockDelay();
      return { success: true };
    },
    async updateProjectVideoMusic(_token, projectId, id, payload) {
      await dependencies.mockDelay();
      return {
        success: true,
        item: {
          id,
          projectId,
          musicId: "mock-music",
          musicUrl: "https://example.com/music.mp3",
          volume: payload.volume ?? 0.5,
          fadeInSec: payload.fadeInSec ?? 0,
          fadeOutSec: payload.fadeOutSec ?? 0,
          isSelected: false,
          title: "Mock Music",
          atmospheres: [],
          artist: null,
          durationSec: null,
          coverUrl: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
    },
    async deleteProjectVideoMusic(_token, _projectId, id) {
      await dependencies.mockDelay();
      return { success: true, removedId: id };
    },
  };
}

export function createVideoMusicBackendApi(
  routeApiCall: RouteApiCallInvoker,
): VideoMusicBackendApiShape {
  return {
    listVideoMusic: (...args) => routeApiCall("listVideoMusic", args),
    getVideoMusic: (...args) => routeApiCall("getVideoMusic", args),
    matchVideoMusicByScript: (...args) => routeApiCall("matchVideoMusicByScript", args),
    syncVideoMusic: (...args) => routeApiCall("syncVideoMusic", args),
    uploadVideoMusic: (...args) => routeApiCall("uploadVideoMusic", args),
    createVideoMusic: (...args) => routeApiCall("createVideoMusic", args),
    updateVideoMusic: (...args) => routeApiCall("updateVideoMusic", args),
    deleteVideoMusic: (...args) => routeApiCall("deleteVideoMusic", args),
    analyzeVideoMusicAtmosphere: (...args) => routeApiCall("analyzeVideoMusicAtmosphere", args),
    // 项目音乐方法
    listProjectVideoMusics: (...args) => routeApiCall("listProjectVideoMusics", args),
    batchSaveProjectVideoMusics: (...args) => routeApiCall("batchSaveProjectVideoMusics", args),
    selectProjectVideoMusic: (...args) => routeApiCall("selectProjectVideoMusic", args),
    clearSelectionProjectVideoMusics: (...args) => routeApiCall("clearSelectionProjectVideoMusics", args),
    updateProjectVideoMusic: (...args) => routeApiCall("updateProjectVideoMusic", args),
    deleteProjectVideoMusic: (...args) => routeApiCall("deleteProjectVideoMusic", args),
  };
}
