/**
 * 裂变视频相关类型定义
 */

/**
 * 分镜数据接口
 * 表示一个独立的视频分镜单元
 */
export interface StoryboardFrame {
  id: string;
  projectId: string;
  index: number;
  imageUrl: string;
  videoUrl?: string;
}

/**
 * 转场信息接口
 */
export interface TransitionInfo {
  type: string;
  duration: number;
  random?: boolean;
}

/**
 * 裂变视频数据接口
 */
export interface FissionVideo {
  id: string;
  projectId: string;
  fissionType: 'storyboard_recombine' | 'homogenize_optimize' | 'ai_new_story';
  thumbnailUrl: string | null;
  videoPath: string | null;
  storyboardIds: string;
  storyboardUrls?: string[];  // 原始分镜URL列表
  transitionInfo: TransitionInfo | null;
  audioUrl: string | null;
  durationSec: number | null;
  speed: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 视频卡片数据（展示用）
 */
export interface VideoCard {
  id: string;
  url: string;
  title: string;
  size: string;
  /** 视频时长（秒） */
  durationSec?: number;
  selected?: boolean;
  /** 是否为加载中的占位视频 */
  loading?: boolean;
  /** 是否为空占位（未生成的固定槽位） */
  placeholder?: boolean;
  /** 是否为合并中的占位卡片 */
  merging?: boolean;
}

/**
 * 镜像视频数据（从snap_json获取）
 */
export interface ClipVideo {
  id: string;           // 镜像标志，如 clip-1, clip-2
  url: string;          // 视频URL
  label: string;        // 显示标签，如 "镜像 1"
}

/**
 * 消息提示类型
 */
export interface Message {
  type: 'success' | 'error' | 'info';
  text: string;
}

/**
 * 裂变结果类型
 */
export interface FissionResult {
  type: 'success' | 'error' | null;
  message: string;
}

/**
 * 镜像处理进度
 */
export interface MirrorProgress {
  percent: number;
  message: string;
}

/**
 * 裂变进度状态
 */
export interface FissionProgress {
  percent: number;
  message: string;
  stage: 'preparing' | 'downloading' | 'merging' | 'complete' | 'error';
}

/**
 * 镜像视频记录
 */
export interface MirrorVideoRecord {
  id: string;
  projectId: string;
  mirrorCount: number;
  mirrorVideoUrls: string[];
  status: "pending" | "completed" | "failed";
  createdAt?: number;
}

/**
 * 新故事分镜记录（来自 fission_storyboard_sub 表）
 */
export interface NewStoryStoryboard {
  id: string;
  storyboardUrl: string;
  storyboardPath: string;
  storyboardFlag: string;
  storyboardSource: string;
  projectId: string;
  fissionId: string | null;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 分镜组合类型
 */
export type StoryboardCombinationType = '原始分镜' | '图生视频' | '新故事';

/**
 * 背景音乐信息
 */
export interface VideoMusicInfo {
  id: string;
  title: string;
  musicUrl: string;
  atmospheres: string[];
  duration: number | null;
}

/**
 * 分镜组合（用于合并视频）
 */
export interface StoryboardCombination {
  /** 分镜列表 */
  storyboardList: NewStoryStoryboard[];
  /** 组合id = storyboardFlag拼接 */
  combinationId: string;
  /** 组合类型：原始分镜/图生视频/新故事 */
  combinationType: StoryboardCombinationType;
  /** 背景音乐列表（匹配到的） */
  backgroundMusics?: VideoMusicInfo[];
}

/**
 * 镜像上传状态
 */
export interface MirrorUploadStatus {
  uploading: boolean;
  percent: number;
  message: string;
}

/**
 * 图片输入项（图生视频）
 */
export interface ImageInputItem {
  /** 图片URL */
  url: string;
  /** 图片描述/提示词 */
  description: string;
  /** 视图类型（可选）: closeup, front, left, right, back, scene-1, scene-2... */
  viewKey?: string;
  /** 分镜 keyframe_prompt（用于图生图重生成，可选） */
  keyframePrompt?: string;
}

/**
 * 图生视频进度状态
 */
export interface ImageToVideoProgress {
  percent: number;
  message: string;
  stage: 'preparing' | 'generating' | 'complete' | 'error';
}

/**
 * 图生视频结果
 */
export interface ImageToVideoResult {
  success: boolean;
  videoCount?: number;
  videos?: Array<{
    path: string;
    url: string;
    imageIndex: number;
    durationSec?: number;
  }>;
  message?: string;
}