/**
 * 视频镜像处理核心逻辑
 * 基于 mediabunny + VideoComposer 实现视频水平翻转（镜像）功能
 */

import { MediabunnyVideoSource } from '../src/core/video-source';
import { ExportPipeline } from '../src/core/export/export-pipeline';
import { VideoComposer, CompositionLayer } from '../src/core/composition/video-composer';
import { rewriteToProxyUrl } from '../utils/fetch-video-file';
import { useAppStore } from '../store/useAppStore';
import { getLogger } from '../src/core/logger';

const log = getLogger('VideoMirror');

// ==================== 类型定义 ====================

export interface MirrorTrimOptions {
  videoUrl: string;
  skipStartSec?: number;
  skipEndSec?: number;
  onProgress?: (percent: number, message: string) => void;
}

export interface MirrorTrimResult {
  blob: Blob;
  url: string;
  originalUrl: string;
  trimmedDurationSec: number;
}

export interface MirrorResult {
  blob: Blob;
  url: string;
  originalUrl: string;
}

export interface BatchMirrorOptions {
  videoUrls: string[];
  onProgress?: (percent: number, message: string, currentIndex?: number) => void;
  onVideoComplete?: (result: MirrorResult, index: number) => void;
}

export interface BatchMirrorResult {
  results: MirrorResult[];
  successCount: number;
  failedCount: number;
}

export interface FrameExtractOptions {
  videoUrl: string;
  frameCount?: number;
  onProgress?: (percent: number, message: string) => void;
}

export interface FrameExtractResult {
  frames: ImageBitmap[];
  timestamps: number[];
}

// ==================== 核心函数 ====================

/**
 * 获取视频元数据
 */
async function getVideoMeta(
  videoUrl: string
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration * 1000000,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error(`无法加载视频元数据: ${videoUrl}`));
    };

    video.src = videoUrl;
  });
}

/**
 * 使用 Canvas 水平翻转 VideoFrame
 */
function flipFrameHorizontally(frame: VideoFrame): VideoFrame {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文');
  }

  // 水平翻转
  ctx.translate(frame.displayWidth, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(frame, 0, 0);

  const flippedFrame = new VideoFrame(canvas, {
    timestamp: frame.timestamp,
    duration: frame.duration || undefined,
  });
  frame.close();

  return flippedFrame;
}

/**
 * 带抽帧的镜像视频处理
 * 将视频进行水平翻转（镜像效果），同时删除前N秒和后M秒
 */
export async function mirrorVideoWithTrim(
  options: MirrorTrimOptions
): Promise<MirrorTrimResult> {
  const {
    videoUrl,
    skipStartSec = 1,
    skipEndSec = 0.5,
    onProgress,
  } = options;

  onProgress?.(0, '初始化镜像+抽帧处理...');

  // 获取视频元数据
  onProgress?.(10, '获取视频信息...');
  const meta = await getVideoMeta(videoUrl);
  const { width: videoWidth, height: videoHeight, duration } = meta;

  const skipStartUs = skipStartSec * 1000000;
  const skipEndUs = skipEndSec * 1000000;
  const validDuration = Math.max(0, duration - skipStartUs - skipEndUs);

  if (validDuration <= 0) {
    throw new Error('视频时长不足，无法进行抽帧处理');
  }

  log.debug(` 视频信息: ${videoWidth}x${videoHeight}, 总时长: ${(duration / 1000000).toFixed(2)}s`);
  log.debug(` 抽帧: 前${skipStartSec}s, 后${skipEndSec}s, 有效时长: ${(validDuration / 1000000).toFixed(2)}s`);

  onProgress?.(20, '加载视频...');

  // 创建视频源
  const proxyUrl = rewriteToProxyUrl(videoUrl);
  const token = useAppStore.getState().token;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const source = new MediabunnyVideoSource({
    url: videoUrl,
    proxyUrl: proxyUrl !== videoUrl ? proxyUrl : undefined,
    headers,
  });

  await source.ready;

  try {
    onProgress?.(30, '开始渲染镜像视频...');

    // 逐帧读取、翻转、编码
    const encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        encodedChunks.push(data);
      },
      error: (e) => {
        log.error(' 编码错误:', e);
      },
    });

    const encodedChunks: Uint8Array[] = [];
    const codec = 'avc1.42001E';

    encoder.configure({
      codec,
      width: videoWidth,
      height: videoHeight,
      bitrate: 5000000,
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
    });

    const frameDuration = 33333; // ~30fps
    let time = skipStartUs;
    const endTime = duration - skipEndUs;

    while (time < endTime) {
      const frame = await source.tick(time);

      if (frame) {
        // 翻转帧
        const flippedFrame = flipFrameHorizontally(frame);
        encoder.encode(flippedFrame);
        flippedFrame.close();
      }

      time += frameDuration;

      const percent = Math.floor(30 + ((time - skipStartUs) / validDuration) * 60);
      onProgress?.(Math.min(95, percent), `正在渲染镜像... ${Math.floor(((time - skipStartUs) / validDuration) * 100)}%`);
    }

    await encoder.flush();
    encoder.close();

    onProgress?.(95, '生成镜像视频文件...');

    const blob = new Blob(encodedChunks as BlobPart[], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    onProgress?.(100, '镜像+抽帧处理完成！');

    log.debug(` 镜像视频生成完成，大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

    return {
      blob,
      url,
      originalUrl: videoUrl,
      trimmedDurationSec: validDuration / 1000000,
    };
  } finally {
    source.destroy();
  }
}

/**
 * 单个视频镜像处理
 */
export async function mirrorVideo(
  options: MirrorTrimOptions
): Promise<MirrorResult> {
  const result = await mirrorVideoWithTrim({
    ...options,
    skipStartSec: 0,
    skipEndSec: 0,
  });

  return {
    blob: result.blob,
    url: result.url,
    originalUrl: result.originalUrl,
  };
}

/**
 * 批量镜像处理多个视频
 */
export async function processMirrorClips(
  options: BatchMirrorOptions
): Promise<BatchMirrorResult> {
  const { videoUrls, onProgress, onVideoComplete } = options;

  const results: MirrorResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < videoUrls.length; i++) {
    const videoUrl = videoUrls[i];

    try {
      onProgress?.(
        Math.floor((i / videoUrls.length) * 100),
        `处理镜像视频 ${i + 1}/${videoUrls.length}...`,
        i
      );

      const result = await mirrorVideo({
        videoUrl,
        onProgress: (percent, message) => {
          const overallPercent = Math.floor((i / videoUrls.length) * 100 + (percent / videoUrls.length));
          onProgress?.(overallPercent, `[${i + 1}/${videoUrls.length}] ${message}`, i);
        },
      });

      results.push(result);
      successCount++;
      onVideoComplete?.(result, i);
    } catch (error) {
      log.error(` 处理视频 ${i + 1} 失败:`, error);
      failedCount++;

      results.push({
        blob: new Blob(),
        url: '',
        originalUrl: videoUrl,
      });
    }
  }

  return {
    results,
    successCount,
    failedCount,
  };
}

/**
 * 随机抽取视频帧
 */
export async function extractRandomFrames(
  options: FrameExtractOptions
): Promise<FrameExtractResult> {
  const { videoUrl, frameCount = 5, onProgress } = options;

  onProgress?.(0, '初始化抽帧...');

  const meta = await getVideoMeta(videoUrl);
  const { duration } = meta;

  // 创建视频源
  const proxyUrl = rewriteToProxyUrl(videoUrl);
  const token = useAppStore.getState().token;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const source = new MediabunnyVideoSource({
    url: videoUrl,
    proxyUrl: proxyUrl !== videoUrl ? proxyUrl : undefined,
    headers,
  });

  await source.ready;

  const frames: ImageBitmap[] = [];
  const timestamps: number[] = [];

  try {
    // 随机生成时间点
    const randomTimestamps: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      const randomTime = Math.floor(Math.random() * duration);
      randomTimestamps.push(randomTime);
    }

    randomTimestamps.sort((a, b) => a - b);

    onProgress?.(20, '抽取帧...');

    for (let i = 0; i < randomTimestamps.length; i++) {
      const timestamp = randomTimestamps[i];

      try {
        const frame = await source.tick(timestamp);

        if (frame) {
          const bitmap = await createImageBitmap(frame);
          frame.close();

          frames.push(bitmap);
          timestamps.push(timestamp);

          onProgress?.(
            Math.floor(20 + ((i + 1) / frameCount) * 80),
            `抽取帧 ${i + 1}/${frameCount}...`
          );
        }
      } catch (e) {
        log.warn(` 抽取帧 ${i + 1} 失败:`, e);
      }
    }

    onProgress?.(100, '抽帧完成');

    return { frames, timestamps };
  } finally {
    source.destroy();
  }
}

/**
 * 检查浏览器是否支持视频镜像功能
 */
export async function checkMirrorSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      reason: '您的浏览器不支持 WebCodecs API，请使用最新版本的 Chrome、Edge 或 Firefox 浏览器',
    };
  }

  return { supported: true };
}

/**
 * 清理 Blob URL
 */
export function revokeBlobUrls(urls: string[]): void {
  for (const url of urls) {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}