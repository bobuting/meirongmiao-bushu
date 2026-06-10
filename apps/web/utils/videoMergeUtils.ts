/**
 * 视频合并工具函数
 * 提供视频元数据获取、缩略图生成、时长格式化等功能
 */

import { transitionManager } from '../src/modules/transitions';
import { getTransitionDefinitionIds, getTransitionDefinition } from '../src/core/export/transition-definitions';

export interface VideoMetadata {
  duration: number; // 微秒
  width: number;
  height: number;
}

/**
 * 获取视频元数据
 * @param file 视频文件
 * @returns 视频元数据（时长、宽、高）
 */
export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        duration: video.duration * 1000000, // 转换为微秒
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(video.src);
      resolve(metadata);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('无法加载视频元数据'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * 生成视频缩略图
 * @param file 视频文件
 * @param timeInSeconds 截取时间点（默认1秒）
 * @returns 缩略图的 base64 字符串
 */
export async function generateVideoThumbnail(
  file: File,
  timeInSeconds: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.onloadedmetadata = () => {
      // 确保时间点在视频时长范围内
      const seekTime = Math.min(timeInSeconds, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      if (!ctx) {
        reject(new Error('无法获取Canvas上下文'));
        return;
      }

      // 设置缩略图尺寸（保持宽高比，最大宽度120px）
      const maxWidth = 120;
      const ratio = video.videoHeight / video.videoWidth;
      canvas.width = maxWidth;
      canvas.height = Math.round(maxWidth * ratio);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

      URL.revokeObjectURL(video.src);
      resolve(thumbnail);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('无法生成视频缩略图'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * 格式化时长显示
 * @param microseconds 时长（微秒）
 * @returns 格式化的时长字符串（如 "1:30" 或 "0:45"）
 */
export function formatDuration(microseconds: number): string {
  const seconds = Math.floor(microseconds / 1000000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * 格式化文件大小
 * @param bytes 文件大小（字节）
 * @returns 格式化的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 生成唯一ID
 * @returns 唯一ID字符串
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取转场效果选项
 * 从转场定义注册表获取所有已注册的转场效果（GPU + Canvas 2D）
 */
export function getTransitionOptions(): Array<{ label: string; value: string }> {
  const ids = getTransitionDefinitionIds();
  return ids.map(id => {
    const def = getTransitionDefinition(id);
    // 使用转场 ID 作为 label（如果中文标题未定义）
    return {
      label: def?.series ? `${id} (${def.series})` : id,
      value: id,
    };
  });
}

/**
 * 转场效果选项（静态列表，用于初始化）
 */
export const transitionOptions = getTransitionOptions();

/**
 * 随机选择一个转场效果
 */
export function randomizeTransition(): string {
  const options = getTransitionOptions();
  if (options.length === 0) return 'fade';
  const randomIndex = Math.floor(Math.random() * options.length);
  return options[randomIndex].value;
}