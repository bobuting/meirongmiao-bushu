/**
 * 转场 Clip
 * 在两个视频之间实时渲染转场效果
 *
 * 技术方案：
 * - 使用 WebCutBaseTransition 基础设施
 * - 在 tick() 中实时渲染转场帧
 * - 兼容旧版调用方，推荐新代码使用 GpuTransitionClip
 */

import { WebCutBaseTransition, WebCutTransitionConfig } from './base-transition';

/**
 * Clip 元数据接口（与 @webav/av-cliper 的 IClipMeta 一致）
 */
interface ClipMeta {
  width: number;
  height: number;
  duration: number;
}

/**
 * 转场帧来源
 * 提供获取两个视频帧的接口
 */
export interface TransitionFrameSource {
  /**
   * 获取前一个视频在指定时间的帧
   * @param time 时间（微秒）
   */
  getFromFrame(time: number): Promise<VideoFrame | null>;

  /**
   * 获取后一个视频在指定时间的帧
   * @param time 时间（微秒）
   */
  getToFrame(time: number): Promise<VideoFrame | null>;
}

/**
 * TransitionClip 配置
 */
export interface TransitionClipOptions {
  /** 转场时长（微秒） */
  duration: number;
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
  /** 转场效果实例 */
  transition: WebCutBaseTransition;
  /** 转场配置 */
  config?: WebCutTransitionConfig;
  /** 帧来源 */
  frameSource: TransitionFrameSource;
  /** 前一个视频在转场开始时刻的时间（微秒） */
  fromStartTime: number;
  /** 后一个视频在转场开始时刻的时间（微秒） */
  toStartTime: number;
}

/**
 * 转场 Clip
 * 实时渲染两个视频之间的转场效果
 */
export class TransitionClip {
  private options: TransitionClipOptions;
  private _ready: Promise<ClipMeta>;
  private _meta: ClipMeta;

  constructor(options: TransitionClipOptions) {
    this.options = options;
    this._meta = {
      width: options.width,
      height: options.height,
      duration: options.duration,
    };
    this._ready = Promise.resolve(this._meta);
  }

  get ready(): Promise<ClipMeta> {
    return this._ready;
  }

  get meta(): ClipMeta {
    return this._meta;
  }

  /**
   * 获取指定时间的转场帧
   * @param time 相对于转场开始的时间（微秒）
   */
  async tick(time: number): Promise<{
    video: VideoFrame | null;
    audio?: Float32Array[];
    state: 'done' | 'success';
  }> {
    const { duration, transition, config, frameSource, fromStartTime, toStartTime, width, height } = this.options;

    // 计算转场进度 (0 ~ 1)
    const progress = Math.max(0, Math.min(1, time / duration));

    // 获取两个视频在当前转场时刻的帧
    const fromFrame = await frameSource.getFromFrame(fromStartTime + time);
    const toFrame = await frameSource.getToFrame(toStartTime + time);

    if (!fromFrame || !toFrame) {
      return { video: null, state: 'done' };
    }

    // 确保两帧分辨率一致（使用输出分辨率）
    const uniformFromFrame = this.ensureUniformFrame(fromFrame, width, height);
    const uniformToFrame = this.ensureUniformFrame(toFrame, width, height);

    try {
      // 应用转场效果
      const resultFrame = await transition.apply(
        uniformFromFrame,
        uniformToFrame,
        progress,
        config || {}
      );

      return { video: resultFrame, state: 'success' };
    } finally {
      // 清理临时帧
      if (uniformFromFrame !== fromFrame) {
        uniformFromFrame.close();
      }
      if (uniformToFrame !== toFrame) {
        uniformToFrame.close();
      }
    }
  }

  /**
   * 确保帧分辨率一致
   */
  private ensureUniformFrame(frame: VideoFrame, targetWidth: number, targetHeight: number): VideoFrame {
    if (frame.displayWidth === targetWidth && frame.displayHeight === targetHeight) {
      return frame;
    }

    // 创建统一分辨率的帧
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

  async clone(): Promise<this> {
    return new TransitionClip({ ...this.options }) as this;
  }

  destroy(): void {
    // 转场效果由 TransitionManager 管理，这里不销毁
  }
}
