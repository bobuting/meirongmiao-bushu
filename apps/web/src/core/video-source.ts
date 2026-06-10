/**
 * Mediabunny视频解码抽象层
 * 替代 @webav/av-cliper 的 MP4Clip
 *
 * 性能关键：使用 samples() 顺序迭代器替代 getSample() 随机访问，
 * 避免每帧从关键帧重解码导致的 O(n²) 退化。
 */

import { Input, BlobSource, UrlSource, ALL_FORMATS, VideoSampleSink } from 'mediabunny';
import type { VideoSample } from 'mediabunny';
import { getLogger } from './logger';

const log = getLogger('VideoSource');

export interface VideoMeta {
  width: number;
  height: number;
  duration: number; // 微秒
  fps: number;
  hasAudio: boolean;
  codec?: string;
}

export interface VideoSourceOptions {
  file?: File;
  url?: string;
  proxyUrl?: string; // 代理URL（带认证）
  headers?: Record<string, string>;
}

/**
 * Mediabunny视频源
 * 支持本地File、远程URL、Stream等多种输入源
 */
export class MediabunnyVideoSource {
  private input: Input | null = null;
  private videoTrack: import('mediabunny').InputVideoTrack | null = null;
  private audioTrack: import('mediabunny').InputAudioTrack | null = null;
  private sink: VideoSampleSink | null = null;
  private _meta: VideoMeta | null = null;
  private _ready: Promise<VideoMeta>;
  private destroyed = false;

  // 顺序迭代器状态
  private sampleIterator: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private currentSample: VideoSample | null = null;
  private nextSample: VideoSample | null = null;
  private iteratorDone = false;
  private lastRequestedTimeSec: number | null = null;

  /** 回退阈值：超过此时间跳过则重启迭代器 */
  private static readonly BACKWARD_RESTART_SEC = 0.5;
  /** 前向跳过阈值：超过此时间则重启迭代器（避免顺序读过多中间帧） */
  private static readonly FORWARD_JUMP_RESTART_SEC = 3.0;
  /** 时间戳容差 */
  private static readonly TIMESTAMP_EPSILON = 1e-4;
  /** 迭代器回退预读量（秒） */
  private static readonly STREAM_BACKTRACK_SEC = 1.0;

  constructor(options: VideoSourceOptions) {
    this._ready = this.init(options);
  }

  private async init(options: VideoSourceOptions): Promise<VideoMeta> {
    if (this.destroyed) {
      throw new Error('VideoSource已被销毁');
    }

    try {
      let source;

      if (options.file) {
        source = new BlobSource(options.file);
      } else if (options.url) {

        const headers = options.headers || {};
        if (options.proxyUrl) {
          source = new UrlSource(options.proxyUrl, headers);
        } else {
          source = new UrlSource(options.url, headers);
        }
      } else {
        throw new Error('必须提供 file 或 url');
      }

      this.input = new Input({
        formats: ALL_FORMATS,
        source,
      });

      this.videoTrack = await this.input.getPrimaryVideoTrack();
      this.audioTrack = await this.input.getPrimaryAudioTrack();

      if (!this.videoTrack) {
        throw new Error('视频轨道不存在');
      }

      this.sink = new VideoSampleSink(this.videoTrack);

      const width = await this.videoTrack.getCodedWidth();
      const height = await this.videoTrack.getCodedHeight();

      const durationSec = await this.input.computeDuration();
      const duration = Math.round(durationSec * 1000000);

      const fps = 30;

      const codecInfo = await this.videoTrack.getCodecParameterString();

      this._meta = {
        width,
        height,
        duration,
        fps,
        hasAudio: this.audioTrack !== null,
        codec: codecInfo || undefined,
      };

      // 视频源初始化完成

      return this._meta;
    } catch (error) {
      log.error({ error }, '视频源初始化失败');
      throw error;
    }
  }

  get ready(): Promise<VideoMeta> {
    return this._ready;
  }

  get meta(): VideoMeta {
    if (!this._meta) {
      throw new Error('视频源尚未就绪');
    }
    return this._meta;
  }

  /**
   * 获取指定时间点的视频帧（VideoFrame，调用者负责关闭）
   * 内部使用顺序迭代器，避免 getSample() 随机访问的 O(n²) 退化
   * @param time 时间（微秒）
   */
  async tick(time: number): Promise<VideoFrame | null> {
    if (this.destroyed || !this.sink) {
      return null;
    }

    try {
      const timeSec = time / 1000000;
      const sample = await this.ensureSampleAtTime(timeSec);
      if (!sample) return null;
      return sample.toVideoFrame();
    } catch (error) {
      log.warn({ time, error }, '获取帧失败');
      return null;
    }
  }

  /**
   * 获取指定时间点的 VideoSample 克隆（调用者负责关闭）
   * 用于 VideoSampleSource 直传编码器，避免 VideoFrame → Canvas → VideoSample 往返
   * 返回的是 clone()，内部迭代器的 currentSample 不受影响
   * @param time 时间（微秒）
   */
  async tickSample(time: number): Promise<VideoSample | null> {
    if (this.destroyed || !this.sink) {
      return null;
    }

    try {
      const timeSec = time / 1000000;
      const sample = await this.ensureSampleAtTime(timeSec);
      if (!sample) return null;
      // 必须克隆：内部 currentSample 被迭代器持续引用，调用方 close() 不能影响它
      return sample.clone();
    } catch (error) {
      log.warn({ time, error }, '获取帧采样失败');
      return null;
    }
  }

  /**
   * 使用顺序迭代器定位到目标时间的帧
   * 相比 getSample() 随机访问，顺序迭代每包最多解码一次
   */
  private async ensureSampleAtTime(timeSec: number): Promise<VideoSample | null> {
    if (!this.sink) return null;

    const maxTime = (this._meta?.duration ?? 0) / 1000000 - 0.001;
    const clampedTime = Math.max(0, Math.min(timeSec, maxTime));

    // 当前帧已覆盖目标时间，直接复用
    if (this.currentSample && this.sampleCoversTime(this.currentSample, clampedTime)) {
      return this.currentSample;
    }

    // 判断是否需要重启迭代器
    const iteratorReset = !this.sampleIterator
      || (this.lastRequestedTimeSec !== null && (
        clampedTime - this.lastRequestedTimeSec < -MediabunnyVideoSource.BACKWARD_RESTART_SEC
        || clampedTime - this.lastRequestedTimeSec > MediabunnyVideoSource.FORWARD_JUMP_RESTART_SEC
      ));

    if (!this.sampleIterator) {
      this.resetIterator(clampedTime);
    } else if (iteratorReset && this.lastRequestedTimeSec !== null) {
      const delta = clampedTime - this.lastRequestedTimeSec;
      if (delta < -MediabunnyVideoSource.BACKWARD_RESTART_SEC) {
        this.resetIterator(clampedTime);
      } else if (delta > MediabunnyVideoSource.FORWARD_JUMP_RESTART_SEC) {
        this.resetIterator(clampedTime);
      }
    }

    this.lastRequestedTimeSec = clampedTime;

    // 顺序消费直到覆盖目标时间
    while (true) {
      const candidate = this.nextSample ?? await this.peekNext();
      if (!candidate) break;

      if (candidate.timestamp <= clampedTime + MediabunnyVideoSource.TIMESTAMP_EPSILON) {
        // 推进到新帧
        if (this.currentSample && this.currentSample !== candidate) {
          this.currentSample.close();
        }
        this.currentSample = candidate;
        this.nextSample = null;
        continue;
      }

      // 候选帧已超过目标时间，当前帧就是答案
      break;
    }

    // 当前帧覆盖目标时间
    if (this.currentSample && this.sampleCoversTime(this.currentSample, clampedTime)) {
      return this.currentSample;
    }

    return this.currentSample;
  }

  /** 判断 sample 是否覆盖目标时间 */
  private sampleCoversTime(sample: VideoSample, timeSec: number): boolean {
    if (sample.timestamp > timeSec + MediabunnyVideoSource.TIMESTAMP_EPSILON) return false;
    const duration = sample.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return true;
    return sample.timestamp + duration >= timeSec - MediabunnyVideoSource.TIMESTAMP_EPSILON;
  }

  /** 预读下一帧 */
  private async peekNext(): Promise<VideoSample | null> {
    if (this.nextSample) return this.nextSample;
    if (!this.sampleIterator || this.iteratorDone) return null;

    const result = await this.sampleIterator.next();
    if (result.done) {
      this.iteratorDone = true;
      return null;
    }

    this.nextSample = result.value as VideoSample;
    return this.nextSample;
  }

  /** 重启顺序迭代器 */
  private resetIterator(startSec: number): void {
    this.closeIteratorState();
    if (!this.sink) return;

    const streamStart = Math.max(0, startSec - MediabunnyVideoSource.STREAM_BACKTRACK_SEC);
    this.sampleIterator = this.sink.samples(streamStart);
  }

  /** 关闭迭代器状态 */
  private closeIteratorState(): void {
    if (this.sampleIterator) {
      void this.sampleIterator.return?.();
    }
    this.sampleIterator = null;
    this.iteratorDone = false;
    this.lastRequestedTimeSec = null;
    this.nextSample?.close();
    this.nextSample = null;
    // 注意：currentSample 不关闭，因为它可能还在被调用方使用
    // 调用方通过 tick()/tickSample() 获得的引用需要自行管理
  }

  /**
   * 获取视频轨道
   */
  getVideoTrack() {
    return this.videoTrack;
  }

  /**
   * 获取音频轨道
   */
  getAudioTrack() {
    return this.audioTrack;
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    if (this.destroyed) return;

    // 销毁视频源
    this.destroyed = true;

    this.closeIteratorState();
    this.currentSample?.close();
    this.currentSample = null;

    if (this.input) {
      this.input.dispose();
      this.input = null;
    }

    this.videoTrack = null;
    this.audioTrack = null;
    this.sink = null;
    this._meta = null;
  }
}

/**
 * 创建视频源的工厂函数
 */
export function createVideoSource(options: VideoSourceOptions): MediabunnyVideoSource {
  return new MediabunnyVideoSource(options);
}
