/**
 * 视频首帧截取工具
 * 使用 mediabunny 从视频中截取首帧作为封面图片
 */

import { Input, BlobSource, ALL_FORMATS, VideoSampleSink } from 'mediabunny';

// ==================== 类型定义 ====================

/**
 * 首帧截取结果
 */
export interface FirstFrameResult {
  /** 首帧 Blob（用于预览和上传） */
  blob: Blob;
  /** Blob URL（用于前端预览） */
  url: string;
}

/**
 * 首帧截取选项
 */
export interface ExtractFirstFrameOptions {
  /** 视频文件 */
  videoFile: File;
  /** 输出图片格式，默认 'image/jpeg' */
  outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** 图片质量（0-1），仅对 jpeg/webp 有效，默认 0.9 */
  quality?: number;
}

// ==================== 核心函数 ====================

/**
 * 从视频中截取首帧
 * 使用 mediabunny 的 Input + VideoSampleSink.getSample 获取第一帧
 */
export async function extractFirstFrame(
  options: ExtractFirstFrameOptions
): Promise<FirstFrameResult> {
  const { videoFile, outputFormat = 'image/jpeg', quality = 0.9 } = options;

  // 新 API: Input 需要 InputOptions
  const source = new BlobSource(videoFile);
  const input = new Input({
    formats: ALL_FORMATS,
    source,
  });

  try {
    // 新 API: 获取视频轨道需要异步调用
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('视频轨道不存在');
    }

    // 创建 VideoSampleSink 用于获取帧
    const sink = new VideoSampleSink(videoTrack);

    // 获取第一帧（时间戳为 0 秒）
    const sample = await sink.getSample(0);

    if (!sample) {
      throw new Error('无法获取视频首帧');
    }

    // mediabunny VideoSample 需要通过 toVideoFrame() 转换为 VideoFrame
    const frame = sample.toVideoFrame();
    sample.close();

    // 将 VideoFrame 转换为 Blob
    const bitmap = await createImageBitmap(frame);
    frame.close();

    // 使用 Canvas 将 ImageBitmap 转换为 Blob
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      bitmap.close();
      throw new Error('无法创建 Canvas 上下文');
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // 转换为 Blob
    const blob = await canvas.convertToBlob({
      type: outputFormat,
      quality,
    });

    // 创建 Blob URL
    const url = URL.createObjectURL(blob);

    return { blob, url };
  } finally {
    input.dispose();
  }
}

/**
 * 检查浏览器是否支持首帧截取功能
 */
export async function checkFirstFrameExtractSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  // 检查 WebCodecs 支持
  if (typeof VideoDecoder === 'undefined') {
    return {
      supported: false,
      reason: '您的浏览器不支持 WebCodecs API，请使用最新版本的 Chrome、Edge 或 Firefox 浏览器',
    };
  }

  // 检查 OffscreenCanvas 支持
  if (typeof OffscreenCanvas === 'undefined') {
    return {
      supported: false,
      reason: '您的浏览器不支持 OffscreenCanvas，请使用最新版本的浏览器',
    };
  }

  return { supported: true };
}