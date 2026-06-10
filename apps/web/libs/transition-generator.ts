/**
 * 转场帧生成器
 * 预渲染转场帧序列，用于视频合成
 *
 * 时间线模型：
 * [Video1 主内容] [TransitionClip] [Video2 主内容] [TransitionClip] [Video3 主内容]
 *
 * 转场帧从两个视频的交界处提取：
 * - fromFrame: Video1 最后一帧
 * - toFrame: Video2 第一帧
 */

import { transitionManager } from '../src/modules/transitions';
import { WebCutTransitionConfig } from '../src/modules/transitions/base-transition';
import { MediabunnyVideoSource } from '../src/core/video-source';
import { getLogger } from '../src/core/logger';

const log = getLogger('TransitionGenerator');

/**
 * 转场配置
 */
export interface TransitionConfig {
  /** 转场类型 */
  type: string;
  /** 转场时长（微秒） */
  duration: number;
  /** 转场参数 */
  config?: WebCutTransitionConfig;
}

/**
 * 从视频源获取指定时间的帧
 */
export async function getFrameFromSource(
  source: MediabunnyVideoSource,
  time: number,
  targetWidth?: number,
  targetHeight?: number
): Promise<VideoFrame | null> {
  try {
    const frame = await source.tick(Math.max(0, time));
    if (!frame) return null;

    // 如果需要调整分辨率
    if (targetWidth && targetHeight) {
      const adjustedFrame = ensureUniformFrame(frame, targetWidth, targetHeight);
      if (adjustedFrame !== frame) {
        frame.close();
      }
      return adjustedFrame;
    }

    return frame;
  } catch (e) {
    log.warn(` 获取帧失败 (time: ${time}):`, e);
    return null;
  }
}

// 兼容旧调用方：保留 getFrameFromClip 但内部使用 MediabunnyVideoSource
export { getFrameFromSource as getFrameFromClip };

/**
 * 确保帧分辨率一致
 */
function ensureUniformFrame(frame: VideoFrame, targetWidth: number, targetHeight: number): VideoFrame {
  if (frame.displayWidth === targetWidth && frame.displayHeight === targetHeight) {
    return frame;
  }

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建 OffscreenCanvas 2D 上下文');
  }

  // 保持宽高比居中绘制
  const scale = Math.min(targetWidth / frame.displayWidth, targetHeight / frame.displayHeight);
  const scaledWidth = frame.displayWidth * scale;
  const scaledHeight = frame.displayHeight * scale;
  const x = (targetWidth - scaledWidth) / 2;
  const y = (targetHeight - scaledHeight) / 2;

  ctx.drawImage(frame, x, y, scaledWidth, scaledHeight);

  return new VideoFrame(canvas, {
    timestamp: frame.timestamp,
    duration: frame.duration || undefined,
  });
}

/**
 * 生成转场帧序列
 */
export async function generateTransitionFrames(
  fromFrame: VideoFrame,
  toFrame: VideoFrame,
  transitionType: string,
  duration: number,
  fps: number = 30,
  config?: WebCutTransitionConfig
): Promise<VideoFrame[]> {
  const frameCount = Math.max(1, Math.floor((duration / 1000000) * fps));
  const frames: VideoFrame[] = [];

  log.debug(` 生成转场帧: type=${transitionType}, duration=${duration / 1000000}s, frames=${frameCount}`);
  log.debug(` 帧尺寸: from=${fromFrame.displayWidth}x${fromFrame.displayHeight}, to=${toFrame.displayWidth}x${toFrame.displayHeight}`);

  for (let i = 0; i < frameCount; i++) {
    const progress = frameCount > 1 ? i / frameCount : 0.95;

    const frame = await transitionManager.applyTransition(
      fromFrame,
      toFrame,
      progress,
      transitionType,
      config || {}
    );

    frames.push(frame);
  }

  return frames;
}

/**
 * 创建转场帧序列
 */
export async function createTransitionClip(
  fromFrame: VideoFrame,
  toFrame: VideoFrame,
  transitionType: string,
  duration: number,
  fps: number = 30,
  config?: WebCutTransitionConfig
): Promise<{
  frames: VideoFrame[];
  duration: number;
}> {
  const frames = await generateTransitionFrames(
    fromFrame,
    toFrame,
    transitionType,
    duration,
    fps,
    config
  );

  return {
    frames,
    duration,
  };
}

/**
 * 转场帧序列 Clip
 */
export class TransitionFramesClip {
  private frames: VideoFrame[];
  private duration: number;
  private width: number;
  private height: number;
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(frames: VideoFrame[], duration: number) {
    this.frames = frames;
    this.duration = duration;
    this.width = frames[0]?.displayWidth || 1920;
    this.height = frames[0]?.displayHeight || 1080;

    this.canvas = new OffscreenCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d');
  }

  get ready(): Promise<{ width: number; height: number; duration: number }> {
    return Promise.resolve({
      width: this.width,
      height: this.height,
      duration: this.duration,
    });
  }

  get meta(): { width: number; height: number; duration: number } {
    return {
      width: this.width,
      height: this.height,
      duration: this.duration,
    };
  }

  async tick(time: number): Promise<{
    video?: VideoFrame | null;
    state: 'done' | 'success';
  }> {
    if (time >= this.duration || this.frames.length === 0 || !this.ctx) {
      return { video: null, state: 'done' };
    }

    const progress = time / this.duration;
    const frameIndex = Math.min(
      Math.floor(progress * this.frames.length),
      this.frames.length - 1
    );

    const sourceFrame = this.frames[frameIndex];
    this.ctx.drawImage(sourceFrame, 0, 0);

    const frameDuration = Math.ceil(this.duration / this.frames.length);
    const newFrame = new VideoFrame(this.canvas!, {
      timestamp: time,
      duration: frameDuration,
    });

    return {
      video: newFrame,
      state: 'success',
    };
  }

  async clone(): Promise<TransitionFramesClip> {
    return new TransitionFramesClip([...this.frames], this.duration);
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }
}

/**
 * 批量生成所有转场帧
 * @param sources 视频源数组
 * @param transitionConfigs 转场配置数组（N-1 个转场）
 * @param outputWidth 输出宽度
 * @param outputHeight 输出高度
 */
export async function generateAllTransitionFrames(
  sources: MediabunnyVideoSource[],
  transitionConfigs: TransitionConfig[],
  outputWidth: number,
  outputHeight: number
): Promise<TransitionFramesClip[]> {
  const transitionClips: TransitionFramesClip[] = [];

  for (let i = 0; i < transitionConfigs.length; i++) {
    const config = transitionConfigs[i];
    const fromSource = sources[i];
    const toSource = sources[i + 1];

    // 获取转场帧：fromSource 最后一帧，toSource 第一帧
    await fromSource.ready;
    const fromMeta = fromSource.meta;

    const fromFrame = await getFrameFromSource(fromSource, fromMeta.duration - 100000, outputWidth, outputHeight);
    const toFrame = await getFrameFromSource(toSource, 0, outputWidth, outputHeight);

    if (!fromFrame || !toFrame) {
      log.warn(` 无法获取转场 ${i} 的帧，跳过`);
      continue;
    }

    const frames = await generateTransitionFrames(
      fromFrame,
      toFrame,
      config.type,
      config.duration,
      30,
      config.config
    );

    const transitionClip = new TransitionFramesClip(frames, config.duration);
    transitionClips.push(transitionClip);

    fromFrame.close();
    toFrame.close();
  }

  return transitionClips;
}