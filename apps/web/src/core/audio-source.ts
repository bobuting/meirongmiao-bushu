/**
 * Mediabunny音频解码抽象层
 * 支持音频提取、音量控制、淡入淡出等
 */

import { AudioSampleSink, Input } from 'mediabunny';
import { getLogger } from './logger';

const log = getLogger('AudioSource');

export interface AudioMeta {
  duration: number; // 微秒
  sampleRate: number;
  channels: number;
  codec?: string;
}

export interface AudioSourceOptions {
  input: Input;
  volume?: number; // 0-1
  fadeInSec?: number;
  fadeOutSec?: number;
}

/**
 * Mediabunny音频源
 */
export class MediabunnyAudioSource {
  private sink: AudioSampleSink | null = null;
  private audioTrack: import('mediabunny').InputAudioTrack | null = null;
  private _meta: AudioMeta | null = null;
  private _ready: Promise<AudioMeta>;
  private destroyed = false;
  private volume = 1;
  private fadeInUs = 0;
  private fadeOutUs = 0;

  constructor(options: AudioSourceOptions) {
    this.volume = options.volume ?? 1;
    this.fadeInUs = (options.fadeInSec ?? 0) * 1000000;
    this.fadeOutUs = (options.fadeOutSec ?? 0) * 1000000;
    this._ready = this.init(options);
  }

  private async init(options: AudioSourceOptions): Promise<AudioMeta> {
    if (this.destroyed) {
      throw new Error('AudioSource已被销毁');
    }

    try {
      // 新 API: 异步获取音频轨道
      this.audioTrack = await options.input.getPrimaryAudioTrack();

      if (!this.audioTrack) {
        throw new Error('音频轨道不存在');
      }

      this.sink = new AudioSampleSink(this.audioTrack);

      // 新 API: 使用异步方法获取属性
      // 时长（秒）转换为微秒
      const durationSec = await this.audioTrack.computeDuration();
      const duration = Math.round(durationSec * 1000000);

      // 使用 deprecated 属性（仍有值）或异步方法
      const sampleRate = await this.audioTrack.getSampleRate();
      const channels = await this.audioTrack.getNumberOfChannels();
      const codecInfo = await this.audioTrack.getCodecParameterString();

      this._meta = {
        duration,
        sampleRate,
        channels,
        codec: codecInfo || undefined,
      };

      log.info({
        duration: this._meta.duration / 1000000,
        sampleRate: this._meta.sampleRate,
        channels: this._meta.channels,
        volume: this.volume,
      }, '音频源初始化完成');

      return this._meta;
    } catch (error) {
      log.error({ error }, '音频源初始化失败');
      throw error;
    }
  }

  get ready(): Promise<AudioMeta> {
    return this._ready;
  }

  get meta(): AudioMeta {
    if (!this._meta) {
      throw new Error('音频源尚未就绪');
    }
    return this._meta;
  }

  /**
   * 获取指定时间范围的音频采样
   * @param startTime 开始时间（微秒）
   * @param endTime 结束时间（微秒）
   */
  async getSamples(startTime: number, endTime: number): Promise<Float32Array[] | null> {
    if (this.destroyed || !this.sink) {
      return null;
    }

    try {
      const sample = await this.sink.getSample(startTime);

      if (!sample) {
        return null;
      }

      // 从 AudioSample 提取 Float32Array 数据
      const numChannels = sample.numberOfChannels;
      const frames = sample.numberOfFrames;
      const channels: Float32Array[] = [];

      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = new Float32Array(frames);
        sample.copyTo(channelData, { planeIndex: ch });
        channels.push(channelData);
      }

      // 关闭 sample 释放内存
      sample.close();

      // 应用音量和淡入淡出
      return this.applyVolumeAndFade(channels, startTime, endTime);
    } catch (error) {
      log.warn({ startTime, endTime, error }, '获取音频采样失败');
      return null;
    }
  }

  /**
   * 应用音量和淡入淡出效果
   */
  private applyVolumeAndFade(
    samples: Float32Array[],
    startTime: number,
    endTime: number
  ): Float32Array[] {
    const duration = endTime - startTime;
    const totalDuration = this._meta?.duration ?? 0;

    return samples.map((channelData, channelIndex) => {
      const result = new Float32Array(channelData.length);

      for (let i = 0; i < channelData.length; i++) {
        let sample = channelData[i];

        // 基础音量
        sample *= this.volume;

        // 淡入效果
        if (this.fadeInUs > 0 && startTime < this.fadeInUs) {
          const fadeInProgress = Math.min(1, (startTime + (i / channelData.length) * duration) / this.fadeInUs);
          sample *= fadeInProgress;
        }

        // 淡出效果
        if (this.fadeOutUs > 0 && endTime > totalDuration - this.fadeOutUs) {
          const fadeOutProgress = Math.min(1, (totalDuration - startTime - (i / channelData.length) * duration) / this.fadeOutUs);
          sample *= fadeOutProgress;
        }

        result[i] = sample;
      }

      return result;
    });
  }

  /**
   * 获取音频采样接收器（用于导出）
   */
  get sampleSink() {
    return this.sink;
  }

  /**
   * 设置音量
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    log.debug({ volume: this.volume }, '设置音量');
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    if (this.destroyed) return;

    log.debug('销毁音频源');
    this.destroyed = true;
    this.sink = null;
    this._meta = null;
  }
}