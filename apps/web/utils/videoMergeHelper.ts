/**
 * 项目视频合并辅助方法
 * 统一 Step4 和裂变的视频合并逻辑
 */

import { mergeVideosWithTransitions, type MusicOptions, type TransitionTiming } from "../libs/video-merge";

/**
 * 项目视频合并选项
 */
export interface ProjectVideoMergeOptions {
  /** 视频列表（支持本地 File 或远程 URL） */
  videos: (File | string)[];
  /** 背景音乐（可选） */
  backgroundAudio?: MusicOptions;
  /** 封面图片（可选，支持本地 File 或远程 URL） */
  coverImage?: File | string;
  /** 封面显示时长（秒），默认 0.5 秒 */
  coverDurationSec?: number;
  /** 进度回调 */
  onProgress?: (percent: number, message: string) => void;
  /** 帧率（可选，默认 30） */
  fps?: number;
  /** 缓动函数（可选，默认 ease-in-out） */
  timing?: TransitionTiming;
  /** 转场对齐（可选，默认 0.5） */
  alignment?: number;
}

/**
 * 项目视频合并结果
 */
export interface ProjectVideoMergeResult {
  /** 合并后的视频 Blob */
  blob: Blob;
  /** 视频 URL（Blob URL） */
  url: string;
  /** 视频时长（秒） */
  duration: number;
}

/**
 * 项目视频合并方法（Step4 和裂变共用）
 *
 * 统一配置：
 * - 转场时长：使用 FreeCut 原版每个转场的 defaultDuration
 * - 转场类型：随机
 * - 缓动函数：ease-in-out（流畅过渡）
 * - 转场对齐：0.5（居中于剪辑点）
 * - 封面显示时长：0.5秒
 *
 * @param options 合并选项
 * @returns 合并结果
 */
export async function mergeProjectVideos(
  options: ProjectVideoMergeOptions
): Promise<ProjectVideoMergeResult> {
  const {
    videos,
    backgroundAudio,
    coverImage,
    coverDurationSec = 0.5,
    onProgress,
    fps = 30,
    timing = 'ease-in-out',
    alignment = 0.5
  } = options;

  return mergeVideosWithTransitions({
    videos,
    transitionType: "random",
    // 不指定时长，使用 FreeCut 原版每个转场的 defaultDuration
    fps,
    timing,
    alignment,
    backgroundAudio,
    coverImage,
    coverDurationSec,
    onProgress,
  });
}
