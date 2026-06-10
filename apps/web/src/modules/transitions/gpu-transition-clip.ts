/**
 * GPU 转场 Clip - 使用 WebGPU 管线
 * 在两个视频之间实时渲染 GPU 转场效果
 *
 * 技术方案：
 * - 使用 TransitionPipeline（WebGPU WGSL shaders）
 * - 替代旧的 WebCutBaseTransition（WebGL）
 * - 支持 18+ GPU 转场效果
 */

import { TransitionPipeline, getGpuTransition, type GpuTransitionDefinition } from '../../core';
import { getLogger } from '../../core/logger';

const log = getLogger('GpuTransitionClip');

/**
 * Clip 元数据接口
 */
interface ClipMeta {
  width: number;
  height: number;
  duration: number; // 微秒
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
 * GpuTransitionClip 配置
 */
export interface GpuTransitionClipOptions {
  /** 转场时长（微秒） */
  duration: number;
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
  /** GPU 转场 ID（如 'dissolve', 'sparkles', 'glitch' 等） */
  transitionId: string;
  /** 转场方向（可选，部分转场支持） */
  direction?: 'from-left' | 'from-right' | 'from-top' | 'from-bottom';
  /** 转场属性（可选，特定转场的自定义参数） */
  properties?: Record<string, unknown>;
  /** 帧来源 */
  frameSource: TransitionFrameSource;
  /** 前一个视频在转场开始时刻的时间（微秒） */
  fromStartTime: number;
  /** 后一个视频在转场开始时刻的时间（微秒） */
  toStartTime: number;
  /** GPUDevice（可选，如果不提供则自动初始化） */
  device?: GPUDevice;
}

/**
 * GPU 转场 Clip
 * 实时渲染两个视频之间的 GPU 转场效果
 */
export class GpuTransitionClip {
  private options: GpuTransitionClipOptions;
  private pipeline: TransitionPipeline | null = null;
  private device: GPUDevice | null = null;
  private _ready: Promise<ClipMeta>;
  private _meta: ClipMeta;
  private transitionDef: GpuTransitionDefinition | null = null;

  constructor(options: GpuTransitionClipOptions) {
    this.options = options;
    this._meta = {
      width: options.width,
      height: options.height,
      duration: options.duration,
    };
    this._ready = this.init();
  }

  private async init(): Promise<ClipMeta> {
    // 检查转场定义是否存在
    this.transitionDef = getGpuTransition(this.options.transitionId) ?? null;
    if (!this.transitionDef) {
      log.warn({ transitionId: this.options.transitionId }, 'GPU 转场不存在');
      return this._meta;
    }

    // 获取或初始化 GPUDevice
    if (this.options.device) {
      this.device = this.options.device;
    } else {
      // 自动初始化 WebGPU
      if (!navigator.gpu) {
        log.warn('WebGPU 不支持');
        return this._meta;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        log.warn('无法获取 GPUAdapter');
        return this._meta;
      }

      this.device = await adapter.requestDevice();
      if (!this.device) {
        log.warn('无法创建 GPUDevice');
        return this._meta;
      }
    }

    // 创建 TransitionPipeline
    this.pipeline = TransitionPipeline.create(this.device);
    if (!this.pipeline) {
      log.warn('无法创建 TransitionPipeline');
      return this._meta;
    }

    log.info(
      {
        transitionId: this.options.transitionId,
        width: this.options.width,
        height: this.options.height,
        duration: this.options.duration / 1000000,
      },
      'GPU 转场初始化完成'
    );

    return this._meta;
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
    const { duration, frameSource, fromStartTime, toStartTime, width, height, transitionId, direction, properties } = this.options;

    // 如果 pipeline 未初始化，返回 null
    if (!this.pipeline || !this.transitionDef) {
      return { video: null, state: 'done' };
    }

    // 计算转场进度 (0 ~ 1)
    const progress = Math.max(0, Math.min(1, time / duration));

    // 获取两个视频在当前转场时刻的帧
    const fromFrame = await frameSource.getFromFrame(fromStartTime + time);
    const toFrame = await frameSource.getToFrame(toStartTime + time);

    if (!fromFrame || !toFrame) {
      return { video: null, state: 'done' };
    }

    // 将 VideoFrame 转换为 OffscreenCanvas
    const fromCanvas = this.frameToCanvas(fromFrame, width, height);
    const toCanvas = this.frameToCanvas(toFrame, width, height);

    try {
      // 应用 GPU 转场效果
      const resultCanvas = this.pipeline.render(
        transitionId,
        fromCanvas,
        toCanvas,
        progress,
        width,
        height,
        direction,
        properties
      );

      if (!resultCanvas) {
        log.warn({ time, progress }, 'GPU 转场渲染失败');
        return { video: null, state: 'done' };
      }

      // 创建输出 VideoFrame
      const outputFrame = new VideoFrame(resultCanvas, {
        timestamp: time,
        duration: Math.floor(duration / Math.ceil(duration / 33333)), // 帧时长
      });

      return { video: outputFrame, state: 'success' };
    } finally {
      // 清理输入帧
      fromFrame.close();
      toFrame.close();
    }
  }

  /**
   * 将 VideoFrame 转换为 OffscreenCanvas
   */
  private frameToCanvas(frame: VideoFrame, targetWidth: number, targetHeight: number): OffscreenCanvas {
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

    return canvas;
  }

  async clone(): Promise<this> {
    return new GpuTransitionClip({ ...this.options, device: this.device ?? undefined }) as this;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.pipeline = null;

    // 注意：device 由外部管理，这里不销毁
    // 如果需要销毁 device，调用者应该在完成所有操作后自行销毁
  }
}