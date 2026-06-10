/**
 * 裂变视频相关 API 请求函数
 */

import { createApiRequest as createUnifiedApiRequest } from '../../services/backendApi.request.js';
import { uploadBlobToOss } from '../../services/ossUpload.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { FissionVideo, MirrorVideoRecord, ImageInputItem, ImageToVideoResult } from './types';

/** 裂变视频状态值联合类型 */
export type FissionVideoStatusValue =
  | 'creating'
  | 'organizing_mirror'
  | 'new_mirror'
  | 'new_story'
  | 'parallel_running'
  | 'ready_for_step4'
  | 'completed'
  | 'partial_complete'
  | 'combining'
  | 'ready_for_merge';

/**
 * 裂变视频状态类型（与后端对应）
 */
export interface FissionVideoStatus {
  id: string;
  projectId: string;
  fissionCount: number;
  completedCount: number;
  status: FissionVideoStatusValue;
  consumedCredits: number;
  creatorId: string;
  atmospheres?: string[];  // 背景音乐氛围列表，最多3个
  createdAt: number;
  updatedAt: number;
  // 并行裂变统计字段
  imageVideoTotal?: number;
  imageVideoCompleted?: number;
  imageVideoFailed?: number;
  newStoryTotal?: number;
  newStoryCompleted?: number;
  newStoryFailed?: number;
}

/**
 * 通用 API 请求函数
 * 使用统一的 request 函数，401 由 backendApi.request.ts 统一拦截
 */
export const createApiRequest = createUnifiedApiRequest;

/**
 * 加载裂变视频列表
 */
export const fetchFissionVideos = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  projectId: string
): Promise<FissionVideo[]> => {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '20',
    projectId: projectId || 'project_id_1',
  });
  const data = await apiRequest<{ success: boolean; videos?: FissionVideo[] }>(
    `/fission/videos?${params}`
  );
  return data.success ? (data.videos || []) : [];
};

/**
 * 删除裂变视频
 */
export const deleteFissionVideo = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  videoId: string
): Promise<{ success: boolean }> => {
  // 传递空对象作为 body，避免 Fastify 报 FST_ERR_CTP_EMPTY_JSON_BODY 错误
  return apiRequest(`/fission/videos/${videoId}`, { method: 'DELETE', body: {} });
};

/**
 * 从URL下载视频并转换为File对象
 */
export async function fetchVideoAsFile(videoUrl: string, filename: string): Promise<File> {
  let fetchUrl = videoUrl;
  if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
    fetchUrl = videoUrl.startsWith('/') ? videoUrl : `/${videoUrl}`;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`下载视频失败: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], filename, { type: 'video/mp4' });
}

/**
 * 查询镜像视频状态
 */
export const fetchMirrorVideoStatus = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  projectId: string
): Promise<{
  success: boolean;
  exists?: boolean;
  mirrorRecord?: MirrorVideoRecord;
  message?: string;
}> => {
  return apiRequest(`/fission/videos/mirror/${projectId}`);
};

/**
 * 图生视频
 * 将图片（角色多视图、分镜场景图）生成对应的镜像视频
 */
export const createImageToVideo = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  params: {
    projectId: string;
    images: ImageInputItem[];
    videoConfig?: {
      apiUrl?: string;
      apiKey?: string;
      duration?: number;
      fps?: number;
      model?: string;
    };
  }
): Promise<ImageToVideoResult> => {
  return apiRequest('/fission/image-to-video', {
    method: 'POST',
    body: params,
  });
};

// 已删除：getOrCreateFissionVideoStatus（startParallelFission 已自动创建状态记录）

// processStoryboard 已废弃，分镜数据改用 nrm_fission_task_items
// 原接口 /fission/storyboard/process 已删除

/**
 * 更新裂变视频状态
 */
export const updateFissionVideoStatus = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  statusId: string,
  params: {
    fissionCount?: number;
    completedCount?: number;
    status?: string;
    consumedCredits?: number;
  }
): Promise<{
  success: boolean;
  record?: FissionVideoStatus;
  message?: string;
}> => {
  return apiRequest(`/fission/status/${statusId}`, {
    method: 'PUT',
    body: params,
  });
};

/**
 * 从项目数据中提取图片列表
 * 用于图生视频功能
 * 提取所有奇数分镜（第1、3、5...个分镜，即索引0、2、4...）
 */
export function extractImagesFromProjectData(projectData: {
  script?: Array<{
    sceneImageUrl?: string;
    visualCue?: string;
    videoCue?: string;
    title?: string;
  }>;
}): ImageInputItem[] {
  const images: ImageInputItem[] = [];

  // 1. 提取所有奇数分镜场景图片（索引 0, 2, 4, ... 对应第1、3、5...个分镜）
  if (Array.isArray(projectData.script) && projectData.script.length > 0) {
    projectData.script.forEach((scene, index) => {
      // 只取奇数分镜（索引为偶数：0, 2, 4, ...）
      if (index % 2 === 0 && scene.sceneImageUrl) {
        images.push({
          url: scene.sceneImageUrl,
          description: scene.videoCue || scene.visualCue || scene.title || `分镜场景 ${index + 1}`,
          viewKey: `scene-${index + 1}`,
        });
      }
    });
  }

  // 服装参考图已改用 module-based 数据，此处不再从 uploads 提取
  return images;
}

/**
 * 获取项目背景音乐氛围
 * 自动分析脚本判断适合的氛围
 */
export const fetchAtmosphere = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  projectId: string
): Promise<{
  success: boolean;
  atmospheres?: string[];
  message?: string;
}> => {
  return apiRequest(`/fission/status/${projectId}/atmosphere`);
};

/**
 * 获取分镜组合列表
 * 根据裂变数量计算选取数量，从三种来源生成组合
 * 1. 原始分镜：从来源为"原始分镜"的分镜列表中选取
 * 2. 图生视频：优先"图生视频"，不足用"原始分镜"补充
 * 3. 新故事：优先"新故事分镜"，不足用"原始分镜"补充
 * 返回组合列表，组合id不能重复
 * @param autoGenerate 是否自动生成视频
 */
export const fetchStoryboardCombinations = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  projectId: string,
  fissionCount: number,
  autoGenerate: boolean = false
): Promise<{
  success: boolean;
  data?: import('./types').StoryboardCombination[];
  existingVideos?: Array<{
    index: number;
    id: string;
    videoUrl: string | null;
    storyboardIds: string;
    durationSec: number | null;
  }>;
  generatedVideos?: Array<{
    combinationId: string;
    videoUrl?: string;
    success: boolean;
    message?: string;
  }>;
  message?: string;
}> => {
  const params = new URLSearchParams({
    projectId,
    fissionCount: fissionCount.toString(),
    autoGenerate: autoGenerate.toString(),
  });
  return apiRequest(`/fission/storyboard/combinations?${params}`);
};

/**
 * 上传组合视频到服务器
 * 将前端合并后的视频上传到服务器并保存到数据库
 */
export const uploadComVideo = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  params: {
    projectId: string;
    videoBlob: Blob;
    combinationId: string;       // 组合ID
    combinationType: string;     // 组合类型
    storyboardUrls: string[];    // 原始分镜URL列表（JSON存储）
    transitionType: string;
    transitionDurationFrames: number;  // FreeCut 帧数模式
    audioUrl?: string;           // 背景音乐URL
    durationSec: number;
    speed: number;
  }
): Promise<{ success: boolean; videoUrl?: string; message?: string }> => {
  // 步骤1：上传视频 Blob 到 OSS
  const token = useAppStore.getState().token;
  if (!token) throw new Error('未登录');

  const ossResult = await uploadBlobToOss(token, params.projectId, params.videoBlob);
  const videoUrl = ossResult.fileUrl;

  // 步骤2：将 OSS URL 发送给后端持久化
  return apiRequest('/fission/videos/com-save', {
    method: 'POST',
    body: {
      projectId: params.projectId,
      videoUrl,
      combinationId: params.combinationId,
      combinationType: params.combinationType,
      storyboardUrls: params.storyboardUrls,
      transitionType: params.transitionType,
      transitionDurationFrames: params.transitionDurationFrames,  // FreeCut 帧数模式
      audioUrl: params.audioUrl,
      durationSec: params.durationSec,
      speed: params.speed,
    },
  });
};

/**
 * 根据故事脚本匹配音乐的结果
 */
export interface MatchMusicByScriptResult {
  success: boolean;
  musicUrl: string | null;
  music: {
    id: string;
    title?: string;
    artist?: string;
    musicUrl: string;
    atmospheres?: string[];
  } | null;
  matchedAtmosphere: string | null;
  usedDefault: boolean;
  error?: string;
}

/**
 * 根据故事脚本匹配音乐
 * 调用后端分析脚本氛围并返回匹配的音乐
 */
export const matchMusicByScript = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  scriptText: string
): Promise<MatchMusicByScriptResult> => {
  return apiRequest('/video-music/match-by-script', {
    method: 'POST',
    body: { scriptText },
  });
};

/**
 * 任务项记录（与后端 FissionTaskItemRecord 对应）
 */
export interface FissionTaskItemRecord {
  id: string;
  fissionVideoStatusId: string;
  taskType: 'image_video' | 'new_story';
  itemIndex: number;
  imageUrl: string | null;
  imagePath: string | null;
  imageStatus: 'pending' | 'processing' | 'completed' | 'failed';
  imageErrorMessage: string | null;
  videoUrl: string | null;
  videoPath: string | null;
  videoStatus: 'pending' | 'processing' | 'completed' | 'failed';
  videoErrorMessage: string | null;
  videoTaskId: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 获取裂变任务项列表
 * 用于前端显示任务卡片进度
 */
export const fetchFissionTaskItems = async (
  apiRequest: ReturnType<typeof createApiRequest>,
  statusId: string
): Promise<{
  success: boolean;
  items?: FissionTaskItemRecord[];
  message?: string;
}> => {
  return apiRequest(`/fission/status/${statusId}/task-items`);
};
