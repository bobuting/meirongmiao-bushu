/**
 * 视频合成引擎
 * 基于 WebGPU + FreeCut GPU管线，替代 @webav/av-cliper 的 Combinator
 */

import { getLogger } from '../logger';
import { MediabunnyVideoSource } from '../video-source';
import type { MediabunnyAudioSource } from '../audio-source';
import { CompositorPipeline } from '../gpu-compositor/compositor-pipeline';
import { TransitionPipeline } from '../gpu-transitions/transition-pipeline';
import { EffectsPipeline } from '../gpu-effects/effects-pipeline';
import { MediaRenderPipeline } from '../gpu-media/media-render-pipeline';
import type { BlendMode } from '../types/blend-modes';

const log = getLogger('VideoComposer');

// ============================================================
// 类型定义
// ============================================================

export interface CompositionLayerOptions {
  source: MediabunnyVideoSource | MediabunnyAudioSource | ImageBitmap;
  offset: number; // 微秒，相对于合成开始时间
  duration: number; // 微秒
  rect?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
  opacity?: number;
  blendMode?: BlendMode;
  effects?: EffectInstance[];
  transition?: {
    type: string;
    duration: number; // 微秒
    config?: Record<string, unknown>;
  };
}

export interface EffectInstance {
  id: string;
  params: Record<string, number | boolean | string>;
}

export interface VideoComposerOptions {
  width: number;
  height: number;
  bgColor?: string;
  fps?: number;
}

// ============================================================
// CompositionLayer（合成层）
// ============================================================

export class CompositionLayer {
  source: MediabunnyVideoSource | MediabunnyAudioSource | ImageBitmap;
  offset: number;
  duration: number;
  rect: { x: number; y: number; w: number; h: number };
  opacity: number;
  blendMode: BlendMode;
  effects: EffectInstance[];
  transition?: {
    type: string;
    duration: number;
    config?: Record<string, unknown>;
  };

  private destroyed = false;

  constructor(options: CompositionLayerOptions) {
    this.source = options.source;
    this.offset = options.offset;
    this.duration = options.duration;
    this.rect = {
      x: options.rect?.x ?? 0,
      y: options.rect?.y ?? 0,
      w: options.rect?.w ?? 0,
      h: options.rect?.h ?? 0,
    };
    this.opacity = options.opacity ?? 1;
    this.blendMode = options.blendMode ?? 'normal';
    this.effects = options.effects ?? [];
    this.transition = options.transition;
  }

  /**
   * 判断在指定时间是否可见
   */
  isVisibleAt(time: number): boolean {
    return time >= this.offset && time < this.offset + this.duration;
  }

  /**
   * 获取相对于层开始的时间
   */
  getRelativeTime(time: number): number {
    return time - this.offset;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // 如果 source 是 MediabunnyVideoSource，需要销毁
    if (this.source instanceof MediabunnyVideoSource) {
      this.source.destroy();
    }
  }
}

// ============================================================
// VideoComposer（合成引擎）
// ============================================================

export class VideoComposer {
  private device: GPUDevice | null = null;
  private compositor: CompositorPipeline | null = null;
  private transitionPipeline: TransitionPipeline | null = null;
  private effectsPipeline: EffectsPipeline | null = null;
  private mediaPipeline: MediaRenderPipeline | null = null;

  private layers: CompositionLayer[] = [];
  private outputCanvas: OffscreenCanvas | null = null;
  private width: number;
  private height: number;
  private fps: number;
  private bgColor: string;

  private initialized = false;
  private destroyed = false;

  constructor(options: VideoComposerOptions) {
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps ?? 30;
    this.bgColor = options.bgColor ?? 'black';
  }

  /**
   * 初始化 WebGPU 设备和管线
   */
  async init(): Promise<void> {
    if (this.initialized || this.destroyed) return;

    // 检测 WebGPU 支持
    if (!navigator.gpu) {
      throw new Error('WebGPU 不支持，请使用最新版本的 Chrome、Edge 或 Safari');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('无法获取 GPUAdapter');
    }

    this.device = await adapter.requestDevice();
    if (!this.device) {
      throw new Error('无法创建 GPUDevice');
    }

    // 创建 GPU 管线
    this.compositor = new CompositorPipeline(this.device);
    this.transitionPipeline = TransitionPipeline.create(this.device);
    this.effectsPipeline = await EffectsPipeline.create();
    this.mediaPipeline = new MediaRenderPipeline(this.device);

    // 创建输出画布
    this.outputCanvas = new OffscreenCanvas(this.width, this.height);

    this.initialized = true;
  }

  /**
   * 添加合成层
   */
  addLayer(layer: CompositionLayer): void {
    this.layers.push(layer);
    log.debug({ offset: layer.offset, duration: layer.duration }, '添加合成层');
  }

  /**
   * 移除合成层
   */
  removeLayer(layer: CompositionLayer): void {
    const index = this.layers.indexOf(layer);
    if (index >= 0) {
      this.layers.splice(index, 1);
      layer.destroy();
      log.debug('移除合成层');
    }
  }

  /**
   * 获取所有可见层
   */
  getVisibleLayersAt(time: number): CompositionLayer[] {
    return this.layers.filter(layer => layer.isVisibleAt(time));
  }

  /**
   * 获取总时长
   */
  getTotalDuration(): number {
    if (this.layers.length === 0) return 0;
    return Math.max(...this.layers.map(layer => layer.offset + layer.duration));
  }

  /**
   * 渲染指定时间点的帧
   */
  async renderFrame(time: number): Promise<VideoFrame | null> {
    if (!this.initialized || this.destroyed) {
      await this.init();
    }

    if (!this.device || !this.compositor || !this.outputCanvas) {
      return null;
    }

    const visibleLayers = this.getVisibleLayersAt(time);

    if (visibleLayers.length === 0) {
      // 返回空白帧
      const ctx = this.outputCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, this.width, this.height);
      }
      return new VideoFrame(this.outputCanvas, { timestamp: time });
    }

    log.debug({ time, layerCount: visibleLayers.length }, '渲染帧');

    // TODO: 完整的 GPU 渲染流程
    // 1. 获取每个层的帧
    // 2. 转换为 GPUTexture
    // 3. 应用特效
    // 4. 应用转场
    // 5. 合成叠加
    // 6. 输出到 Canvas

    // 简化版本：使用 Canvas 2D 合成（后续替换为 GPU）
    const ctx = this.outputCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取 Canvas 2D 上下文');
    }

    // 清空画布
    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, this.width, this.height);

    // 按顺序渲染每个层
    for (const layer of visibleLayers) {
      const relativeTime = layer.getRelativeTime(time);

      // 获取帧
      let frame: VideoFrame | ImageBitmap | null = null;

      if (layer.source instanceof MediabunnyVideoSource) {
        frame = await layer.source.tick(relativeTime);
      } else if (layer.source instanceof ImageBitmap) {
        frame = layer.source;
      }

      if (!frame) continue;

      // 计算显示区域（保持宽高比居中）
      const displayWidth = frame instanceof VideoFrame ? frame.displayWidth : frame.width;
      const displayHeight = frame instanceof VideoFrame ? frame.displayHeight : frame.height;

      const scale = Math.min(
        this.width / displayWidth,
        this.height / displayHeight
      );
      const scaledWidth = displayWidth * scale;
      const scaledHeight = displayHeight * scale;
      const x = (this.width - scaledWidth) / 2;
      const y = (this.height - scaledHeight) / 2;

      // 应用透明度
      ctx.globalAlpha = layer.opacity;

      // 绘制
      ctx.drawImage(frame as CanvasImageSource, x, y, scaledWidth, scaledHeight);

      // 清理临时帧
      if (frame instanceof VideoFrame) {
        frame.close();
      }
    }

    // 重置透明度
    ctx.globalAlpha = 1;

    // 创建输出帧
    const outputFrame = new VideoFrame(this.outputCanvas, {
      timestamp: time,
      duration: Math.floor(1000000 / this.fps),
    });

    return outputFrame;
  }

  /**
   * 检查 WebGPU 支持
   */
  static async isSupported(): Promise<boolean> {
    if (!navigator.gpu) return false;

    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;

    // 销毁所有层
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.layers = [];

    // 销毁 GPU 管线
    this.compositor = null;
    this.transitionPipeline = null;
    this.effectsPipeline = null;
    this.mediaPipeline = null;

    // 销毁 GPU 设备
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    this.outputCanvas = null;
    this.initialized = false;
  }
}