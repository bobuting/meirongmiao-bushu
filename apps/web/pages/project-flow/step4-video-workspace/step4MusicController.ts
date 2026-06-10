/**
 * Step 4 音乐控制器
 * 职责：推荐匹配、数据库持久化、状态管理
 *
 * 数据流：
 * 1. 进入 Step4 时从数据库加载已保存的音乐
 * 2. 数据库无数据时，传 projectId 给后端，后端自动从 DB 读取脚本风格匹配音乐
 * 3. 用户选择时更新数据库
 */

import { backendApi } from "../../../services/backendApi";
import type {
  VideoMusicDto,
  VideoMusicMatchResultDto,
  ProjectVideoMusicDto,
  ProjectVideoMusicListResult,
  BatchSaveProjectVideoMusicPayload,
} from "../../../services/backendApi.videoMusic";

/**
 * Step 4 音乐状态（运行时）
 */
export interface Step4MusicState {
  enabled: boolean | null;
  recommendation: VideoMusicMatchResultDto | null;
  selectedMusicId: string | null;
  isLoading: boolean;
}

/**
 * 默认音乐状态
 */
export const DEFAULT_STEP4_MUSIC_STATE: Step4MusicState = {
  enabled: null,
  recommendation: null,
  selectedMusicId: null,
  isLoading: false,
};

// =====================================================
// 音乐推荐 API
// =====================================================

/**
 * 获取音乐推荐（含候选列表）
 * 后端根据 projectId 自动从 DB 读取 shot_prompts 提取风格信息匹配音乐
 */
export async function fetchStep4MusicRecommendation(
  token: string,
  projectId: string,
): Promise<{
  success: boolean;
  enabled: boolean;
  recommendation: VideoMusicMatchResultDto | null;
  error?: string;
}> {
  if (!projectId.trim()) {
    return { success: true, enabled: true, recommendation: null };
  }
  try {
    const result = await backendApi.matchVideoMusicByScript(token, { projectId });
    return { success: true, enabled: true, recommendation: result };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, enabled: false, recommendation: null, error: errorMessage };
  }
}

// =====================================================
// 数据转换工具
// =====================================================

/**
 * 从推荐结果提取音乐列表（首选 + 最多 2 个候选）
 */
export function extractMusicsFromRecommendation(
  recommendation: VideoMusicMatchResultDto | null,
): VideoMusicDto[] {
  if (!recommendation?.music) {
    return [];
  }
  const musics: VideoMusicDto[] = [recommendation.music];
  const candidates = recommendation.candidates ?? [];
  for (const c of candidates) {
    if (musics.length >= 3) break;
    musics.push(c);
  }
  return musics;
}

/**
 * 从 ProjectVideoMusicDto 数组构建 recommendation 对象（用于恢复运行时状态）
 */
export function buildRecommendationFromProjectVideoMusics(
  items: ProjectVideoMusicDto[],
): VideoMusicMatchResultDto | null {
  if (items.length === 0) {
    return null;
  }

  // 转换 ProjectVideoMusicDto 为 VideoMusicDto
  const musics: VideoMusicDto[] = items.map((item) => ({
    id: item.musicId,
    title: item.title ?? "未知音乐",
    musicUrl: item.musicUrl,
    localPath: null,
    sourceUrl: null,
    atmospheres: item.atmospheres,
    durationSec: item.durationSec,
    artist: item.artist,
    album: null,
    coverUrl: item.coverUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return {
    success: true,
    music: musics[0],
    candidates: musics.slice(1, 3),
    matchedAtmosphere: musics[0]?.atmospheres?.[0] ?? null,
    candidateAtmospheres: [],
    usedDefault: false,
  };
}

/**
 * 解析选中的音乐信息
 */
export function resolveStep4SelectedMusic(
  selectedMusicId: string | null,
  recommendation: VideoMusicMatchResultDto | null,
): VideoMusicDto | null {
  if (!selectedMusicId || !recommendation) {
    return null;
  }
  // 从首选音乐匹配
  if (recommendation.music?.id === selectedMusicId) {
    return recommendation.music;
  }
  // 从候选列表匹配
  const candidate = recommendation.candidates?.find((item) => item.id === selectedMusicId);
  if (candidate) {
    return candidate;
  }
  // 默认返回首选音乐
  return recommendation?.music ?? null;
}

// =====================================================
// 数据库操作
// =====================================================

/**
 * 从数据库加载项目音乐列表
 */
export async function loadStep4MusicFromDatabase(
  token: string,
  projectId: string,
): Promise<{ success: true; data: ProjectVideoMusicListResult } | { success: false; error: string }> {
  try {
    const data = await backendApi.listProjectVideoMusics(token, projectId);
    return { success: true, data };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: errorMessage };
  }
}

/**
 * 保存推荐列表到数据库
 * 将推荐结果（1 首选 + 2 候选）保存到数据库
 */
export async function saveStep4MusicToDatabase(
  token: string,
  projectId: string,
  recommendation: VideoMusicMatchResultDto | null,
  selectedMusicId?: string | null,
): Promise<ProjectVideoMusicDto[]> {
  if (!recommendation?.music) {
    return [];
  }

  const musics = extractMusicsFromRecommendation(recommendation);
  const payload: BatchSaveProjectVideoMusicPayload = {
    musics: musics.map((m) => ({
      musicId: m.id,
      musicUrl: m.musicUrl,
      title: m.title,
      atmospheres: m.atmospheres,
      artist: m.artist,
      durationSec: m.durationSec,
      coverUrl: m.coverUrl,
    })),
    selectedMusicId: selectedMusicId ?? recommendation.music.id,
  };

  const result = await backendApi.batchSaveProjectVideoMusics(token, projectId, payload);
  return result.items;
}

/**
 * 选择音乐（更新数据库 is_selected）
 */
export async function selectStep4MusicInDatabase(
  token: string,
  projectId: string,
  musicId: string,
): Promise<{ success: true; item: ProjectVideoMusicDto } | { success: false; error: string }> {
  try {
    // 先获取列表找到对应的记录 id
    const list = await backendApi.listProjectVideoMusics(token, projectId);
    const record = list.items.find((item) => item.musicId === musicId);
    if (!record) {
      return { success: false, error: `音乐记录不存在: ${musicId}` };
    }

    const result = await backendApi.selectProjectVideoMusic(token, projectId, record.id);
    return { success: true, item: result.item };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: errorMessage };
  }
}

/**
 * 清空选择（本次不选）
 */
export async function clearStep4MusicSelection(
  token: string,
  projectId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await backendApi.clearSelectionProjectVideoMusics(token, projectId);
    return { success: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: errorMessage };
  }
}

/**
 * 从音乐库选择新音乐
 * 新音乐放到第一个位置，保留后 2 首
 */
export async function addMusicFromLibrary(
  token: string,
  projectId: string,
  newMusic: VideoMusicDto,
  currentItems: ProjectVideoMusicDto[],
): Promise<ProjectVideoMusicDto[]> {
  // 新音乐放第一个，保留当前后 2 首
  const musics: BatchSaveProjectVideoMusicPayload["musics"] = [
    {
      musicId: newMusic.id,
      musicUrl: newMusic.musicUrl,
      title: newMusic.title,
      atmospheres: newMusic.atmospheres,
      artist: newMusic.artist,
      durationSec: newMusic.durationSec,
      coverUrl: newMusic.coverUrl,
    },
  ];

  // 保留当前后 2 首（排除新音乐）
  const existingMusicIds = new Set([newMusic.id]);
  for (const item of currentItems) {
    if (existingMusicIds.has(item.musicId)) continue;
    if (musics.length >= 3) break;
    musics.push({
      musicId: item.musicId,
      musicUrl: item.musicUrl,
      title: item.title,
      atmospheres: item.atmospheres,
      artist: item.artist,
      durationSec: item.durationSec,
      coverUrl: item.coverUrl,
    });
    existingMusicIds.add(item.musicId);
  }

  const payload: BatchSaveProjectVideoMusicPayload = {
    musics,
    selectedMusicId: newMusic.id, // 新音乐默认选中
  };

  const result = await backendApi.batchSaveProjectVideoMusics(token, projectId, payload);
  return result.items;
}
