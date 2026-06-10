/**
 * 视频合并核心逻辑
 * 基于 mediabunny + GPU TransitionPipeline 实现视频合并功能
 * 支持：本地 File 和远程 URL 输入、GPU 转场效果、随机转场类型/方向、节拍卡点
 */

import { MediabunnyVideoSource } from '../src/core/video-source';
import { getLogger } from '../src/core/logger';

const log = getLogger('VideoMerge');
import {
  ExportPipeline,
  type TransitionConfig,
  type TransitionTiming,
  framesToMicroseconds,
  calculateTransitionStartTime,
} from '../src/core/export/export-pipeline';
import { VideoComposer } from '../src/core/composition/video-composer';
import { getGpuTransitionIds, getGpuTransition } from '../src/core/gpu-transitions';
import { getTransitionDefinition, getSmoothTransitionIds } from '../src/core/export/transition-definitions';
import { hasCanvasTransition } from '../src/core/transitions';
import { downloadRemoteVideos } from '../utils/fetch-video-file';
import { planBeatSyncedTimeline, type BeatSyncedTimeline } from './beat-sync-timeline';
import type { BeatSyncIntensity } from './beat-detect';

// 性能日志辅助函数
const perfLog = {
  startTimes: {} as Record<string, number>,
  start(label: string) {
    this.startTimes[label] = performance.now();
  },
  end(label: string) {
    const elapsed = performance.now() - (this.startTimes[label] ?? 0);
    return elapsed;
    return elapsed;
  },
};

// 重新导出类型供外部使用
export type { TransitionTiming } from '../src/core/export/export-pipeline';

export interface VideoMergeItem {
  file: File;
  width: number;
  height: number;
  duration: number;
}

/**
 * 背景音乐选项
 */
export interface MusicOptions {
  source: File | string;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/**
 * 视频合并选项
 */
export interface MergeOptions {
  videos: (File | string)[];
  /** 转场类型：'random' 或具体的 GPU 转场 ID（如 'dissolve', 'sparkles'） */
  transitionType: string;
  /** 转场时长（帧数）- 新字段 */
  transitionDurationFrames?: number;
  /** 转场时长最小值（帧数）- 新字段 */
  transitionDurationFramesMin?: number;
  /** 转场时长最大值（帧数） */
  transitionDurationFramesMax?: number;
  /** 帧率（用于帧数转换，默认 30） */
  fps?: number;
  /** 缓动函数（默认 linear） */
  timing?: TransitionTiming;
  /** cubic-bezier 参数 */
  timingBezier?: [number, number, number, number];
  /** 转场对齐（0-1 范围，默认 0.5） */
  alignment?: number;
  /** 背景音乐选项 */
  backgroundAudio?: MusicOptions;
  /** 封面图片（File 或 URL） */
  coverImage?: File | string;
  /** 封面显示时长（秒） */
  coverDurationSec?: number;
  /** 进度回调 */
  onProgress?: (percent: number, message: string) => void;
  /** 节拍时间戳（用于卡点转场） */
  beatTimestamps?: number[];
  /** 节拍同步强度 */
  beatSyncIntensity?: BeatSyncIntensity;
  /** 节拍能量值 */
  beatEnergies?: number[];
}

export interface MergeResult {
  blob: Blob;
  url: string;
  duration: number;
  /** 本次合成使用的转场 ID 列表 */
  usedTransitionIds: string[];
}

/**
 * 获取视频元数据
 */
async function getVideoMeta(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration * 1000000,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = (e) => {
      log.error(`元数据加载失败: ${file.name}`, e);
      URL.revokeObjectURL(video.src);
      reject(new Error(`无法加载视频元数据: ${file.name}`));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * 从 File 创建 MediabunnyVideoSource
 */
async function createVideoSourceFromFile(file: File): Promise<MediabunnyVideoSource> {
  const source = new MediabunnyVideoSource({ file });
  await source.ready;
  return source;
}

/**
 * 合并多个视频文件
 * 使用 mediabunny VideoComposer + ExportPipeline
 */
export async function mergeVideosWithTransitions(
  options: MergeOptions
): Promise<MergeResult> {
  const {
    videos,
    transitionType,
    transitionDurationFrames,
    transitionDurationFramesMin,
    transitionDurationFramesMax,
    fps = 30,
    timing = 'ease-in-out',  // FreeCut 原版默认缓动函数
    timingBezier,
    alignment = 0.5,
    backgroundAudio,
    coverImage,
    coverDurationSec = 0.5,
    onProgress,
    beatTimestamps,
    beatSyncIntensity,
    beatEnergies,
  } = options;

  if (videos.length === 0) {
    throw new Error('没有视频文件需要合并');
  }

  // 获取所有转场 ID 列表（GPU + Canvas 2D）
  const gpuTransitionIds = getGpuTransitionIds();
  const allTransitionIds = getSmoothTransitionIds();

  // 随机选择转场类型（每个转场互不重复）
  const shuffledTransitionIds = [...allTransitionIds].sort(() => Math.random() - 0.5);
  let transitionPickIndex = 0;
  const getRandomTransitionId = (): string => {
    if (transitionPickIndex < shuffledTransitionIds.length) {
      return shuffledTransitionIds[transitionPickIndex++];
    }
    // 超出数量时回退到随机选择
    return allTransitionIds[Math.floor(Math.random() * allTransitionIds.length)];
  };

  // 随机选择转场方向
  const getRandomDirection = (): 'from-left' | 'from-right' | 'from-top' | 'from-bottom' => {
    const directions = ['from-left', 'from-right', 'from-top', 'from-bottom'];
    return directions[Math.floor(Math.random() * directions.length)] as 'from-left' | 'from-right' | 'from-top' | 'from-bottom';
  };

  // 随机转场时长（帧数）- 仅在无转场定义时使用
  const getRandomTransitionDurationFrames = (): number => {
    const min = transitionDurationFramesMin ?? transitionDurationFrames ?? 15;
    const max = transitionDurationFramesMax ?? transitionDurationFrames ?? 24;
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  onProgress?.(0, '初始化视频处理环境...');

  // 检查是否有远程 URL，如果有则下载
  const hasRemoteUrls = videos.some(v => typeof v === 'string');
  let localVideos: File[];

  if (hasRemoteUrls) {
    perfLog.start('视频下载');
    onProgress?.(2, '检测到远程视频，开始下载...');

    const urls = videos.filter((v): v is string => typeof v === 'string');
    const files = videos.filter((v): v is File => v instanceof File);

    if (urls.length > 0) {
      const downloadResult = await downloadRemoteVideos({
        urls,
        maxConcurrency: 3,
        maxRetries: 2,
        onProgress: (progress) => {
          const percent = 2 + Math.floor((progress.percent / 100) * 8);
          onProgress?.(percent, `下载视频 ${progress.completed}/${progress.total}...`);
        },
      });

      if (downloadResult.errors.length > 0) {
        const errorUrls = downloadResult.errors.map(e => e.url).join(', ');
        throw new Error(`部分视频下载失败: ${errorUrls}`);
      }

      const downloadedFiles = downloadResult.files;
      let downloadIndex = 0;
      localVideos = videos.map(v => {
        if (v instanceof File) return v;
        return downloadedFiles[downloadIndex++];
      });
    } else {
      localVideos = files;
    }
    perfLog.end('视频下载');
  } else {
    localVideos = videos as File[];
  }

  // 获取所有视频的元数据
  perfLog.start('加载视频元数据');
  onProgress?.(10, '加载视频元数据...');
  const videoMetas: Array<{ file: File; meta: Awaited<ReturnType<typeof getVideoMeta>> }> = [];

  for (let i = 0; i < localVideos.length; i++) {
    const file = localVideos[i];
    const meta = await getVideoMeta(file);
    videoMetas.push({ file, meta });
    onProgress?.(10 + Math.floor(((i + 1) / localVideos.length) * 5), `加载视频 ${i + 1}/${localVideos.length}...`);
  }
  perfLog.end('加载视频元数据');

  // 统一输出为标准分辨率 720x1280
  const outputWidth = 720;
  const outputHeight = 1280;

  perfLog.start('初始化 GPU');
  onProgress?.(15, '初始化 GPU 渲染环境...');

  // 创建 VideoComposer（用于检测 WebGPU 支持）
  const composer = new VideoComposer({
    width: outputWidth,
    height: outputHeight,
    bgColor: 'black',
  });

  await composer.init();
  perfLog.end('初始化 GPU');

  // 创建所有视频源
  perfLog.start('创建视频源');
  const sources: MediabunnyVideoSource[] = [];
  try {
    for (let i = 0; i < localVideos.length; i++) {
      onProgress?.(15 + Math.floor((i / localVideos.length) * 10), `加载视频 ${i + 1}/${localVideos.length}...`);
      const source = await createVideoSourceFromFile(localVideos[i]);
      sources.push(source);
    }
    perfLog.end('创建视频源');

    // 预生成转场配置
    const numTransitions = Math.max(0, videoMetas.length - 1);
    const transitionConfigs: TransitionConfig[] = [];

    // 计算每个视频在时间线上的偏移量（用于转场 startTime）
    let timelineOffset = 0;
    const sourceTimelineOffsets: number[] = [];

    for (const meta of videoMetas) {
      sourceTimelineOffsets.push(timelineOffset);
      timelineOffset += meta.meta.duration;
    }

    // 为每个相邻视频构建转场配置
    for (let j = 0; j < numTransitions; j++) {
      // 选择转场类型（用户指定或随机）
      const transitionId = transitionType === 'random'
        ? getRandomTransitionId()
        : (allTransitionIds.includes(transitionType) ? transitionType : allTransitionIds[0]);

      // 获取转场定义，使用 FreeCut 原版的 defaultDuration
      const transitionDef = getTransitionDefinition(transitionId);
      let durationInFrames: number;

      if (transitionDef) {
        // FreeCut 原版行为：使用 defaultDuration 作为默认值
        // 用户可以通过 transitionDurationFrames 参数覆盖
        if (transitionDurationFrames) {
          // 用户指定固定时长，需在转场定义范围内
          durationInFrames = Math.max(
            transitionDef.minDuration,
            Math.min(transitionDef.maxDuration, transitionDurationFrames)
          );
        } else if (transitionDurationFramesMin && transitionDurationFramesMax) {
          // 用户指定时长范围，需在转场定义范围内
          const effectiveMin = Math.max(transitionDef.minDuration, transitionDurationFramesMin);
          const effectiveMax = Math.min(transitionDef.maxDuration, transitionDurationFramesMax);
          durationInFrames = effectiveMin + Math.floor(Math.random() * (effectiveMax - effectiveMin + 1));
        } else {
          // FreeCut 原版：使用 defaultDuration
          durationInFrames = transitionDef.defaultDuration;
        }
      } else {
        // 转场定义不存在，使用用户配置或默认值
        durationInFrames = getRandomTransitionDurationFrames();
      }

      // 剪辑点时间（左视频结束时间）
      const cutPointTimeUs = sourceTimelineOffsets[j] + videoMetas[j].meta.duration;

      // 使用 alignment 计算转场开始时间
      const transitionStartTime = calculateTransitionStartTime(
        cutPointTimeUs,
        durationInFrames,
        alignment,
        fps
      );

      const durationUs = framesToMicroseconds(durationInFrames, fps);

      const config: TransitionConfig = {
        index: j,
        transitionId,
        durationInFrames,
        startTime: transitionStartTime,
        direction: getRandomDirection(),
        timing,
        timingBezier,
        alignment,
        fps,
      };

      transitionConfigs.push(config);
    }

    // 计算总时长
    const totalDuration = videoMetas.reduce((sum, v) => sum + v.meta.duration, 0);

    // 使用 ExportPipeline 编码输出（带转场）
    perfLog.start('视频渲染编码');
    onProgress?.(30, '开始渲染视频...');

    const blob = await ExportPipeline.export({
      sources,
      transitions: transitionConfigs,
      codec: 'h264',
      bitrate: 5000000,
      backgroundAudio: backgroundAudio ? {
        source: backgroundAudio.source,
        volume: backgroundAudio.volume ?? 0.6,
        fadeInSec: backgroundAudio.fadeInSec ?? 1.0,
        fadeOutSec: backgroundAudio.fadeOutSec ?? 1.0,
      } : undefined,
      onProgress: (percent, message) => {
        const mappedPercent = 30 + Math.floor(percent * 0.65);
        onProgress?.(mappedPercent, message);
      },
    });

    perfLog.end('视频渲染编码');

    onProgress?.(100, '合并完成！');

    const durationSec = totalDuration / 1000000;
    const url = URL.createObjectURL(blob);

    return { blob, url, duration: durationSec, usedTransitionIds: transitionConfigs.map(t => t.transitionId) };
  } catch (error) {
    // 添加错误日志，便于排查
    log.error('合成失败:', error);
    throw error;
  } finally {
    // 清理所有资源
    for (const source of sources) {
      source.destroy();
    }
    composer.destroy();
  }
}

/**
 * 检查浏览器是否支持 WebCodecs API
 */
export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
}

/**
 * 检查浏览器是否支持视频合并功能
 */
export async function checkVideoMergeSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  if (!isWebCodecsSupported()) {
    return {
      supported: false,
      reason: '您的浏览器不支持 WebCodecs API，请使用最新版本的 Chrome、Edge 或 Firefox 浏览器',
    };
  }

  // 检查 WebGPU 支持
  const gpuSupported = await VideoComposer.isSupported();
  if (!gpuSupported) {
    return {
      supported: false,
      reason: '您的浏览器不支持 WebGPU，请使用最新版本的 Chrome 或 Edge 浏览器',
    };
  }

  return { supported: true };
}