/**
 * 导出管线
 * 使用 mediabunny 高级封装实现视频导出
 * 所有导出都带 GPU 转场，无快速导出场景
 *
 * 性能优化：
 * 1. VideoSampleSource + 双缓冲流水线（渲染与编码并行）
 * 2. samples() 顺序迭代替代 getSample() 随机访问
 * 3. 非转场帧零渲染直传（VideoSample 直接编码，跳过 Canvas）
 * 4. 转场帧 VideoFrame 直传 GPU 纹理（跳过中间 Canvas）
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  VideoEncodingConfig,
  VideoSampleSource,
  VideoSample,
  Input,
  BlobSource,
  UrlSource,
  ALL_FORMATS,
  AudioSampleSource,
  AudioSample,
  AudioEncodingConfig,
  AudioSampleSink,
  QUALITY_MEDIUM,
} from 'mediabunny';
import type { MediabunnyVideoSource } from '../video-source';
import { getLogger } from '../logger';
import { TransitionPipeline } from '../gpu-transitions/transition-pipeline';
import {
  hasCanvasTransition,
  getCanvasTransitionRenderer,
} from '../transitions';
import type { TransitionRenderer } from '../transitions/types';
import type { WipeDirection, SlideDirection, FlipDirection } from '../types/transition';

const log = getLogger('ExportPipeline');

/**
 * 帧数转微秒
 */
export function framesToMicroseconds(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000000);
}

/**
 * 计算转场开始时间（微秒）
 */
export function calculateTransitionStartTime(
  cutPointTimeUs: number,
  durationInFrames: number,
  alignment: number = 0.5,
  fps: number = 30
): number {
  const a = Math.max(0, Math.min(1, alignment));
  const durationUs = framesToMicroseconds(durationInFrames, fps);
  return cutPointTimeUs - durationUs * a;
}

/**
 * 应用缓动函数到进度值
 */
export function applyTimingFunction(
  progress: number,
  timing: TransitionTiming = 'linear',
  bezierParams?: [number, number, number, number]
): number {
  const p = Math.max(0, Math.min(1, progress));

  switch (timing) {
    case 'linear':
      return p;
    case 'ease-in':
      return p * p;
    case 'ease-out':
      return 1 - (1 - p) * (1 - p);
    case 'ease-in-out':
      if (p < 0.5) {
        return 2 * p * p;
      } else {
        return 1 - 2 * (1 - p) * (1 - p);
      }
    case 'cubic-bezier':
      if (bezierParams && bezierParams.length === 4) {
        return cubicBezier(p, bezierParams[0], bezierParams[1], bezierParams[2], bezierParams[3]);
      }
      return p;
    default:
      return p;
  }
}

function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const epsilon = 0.0001;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }

  let t2 = t;
  for (let i = 0; i < 8; i++) {
    const xEst = sampleX(t2) - t;
    if (Math.abs(xEst) < epsilon) {
      return sampleY(t2);
    }
    const dEst = (3 * ax * t2 + 2 * bx) * t2 + cx;
    if (Math.abs(dEst) < epsilon) {
      break;
    }
    t2 = t2 - xEst / dEst;
  }

  return sampleY(t2);
}

export type TransitionTiming = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';

/**
 * 转场定义元数据
 */
export interface TransitionDefinition {
  id: string;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  hasDirection: boolean;
  directions?: string[];
  series?: 'basic' | 'wipe' | 'slide' | 'flip' | 'motion' | 'iris' | 'shape';
}

/**
 * 转场配置
 */
export interface TransitionConfig {
  index: number;
  transitionId: string;
  durationInFrames: number;
  startTime: number;
  direction?: 'from-left' | 'from-right' | 'from-top' | 'from-bottom';
  properties?: Record<string, unknown>;
  timing?: TransitionTiming;
  timingBezier?: [number, number, number, number];
  alignment?: number;
  fps?: number;
}

/**
 * 音频预读取数据结构
 * 存储完整的音频 PCM 数据，支持按时间提取
 */
interface AudioBufferData {
  /** PCM 数据（f32-planar 格式，每声道独立存储） */
  data: Float32Array[];
  /** 原始采样率 */
  sampleRate: number;
  /** 原始声道数 */
  numberOfChannels: number;
  /** 总时长（秒） */
  durationSec: number;
  /** 总帧数 */
  totalFrames: number;
}

export interface ExportOptions {
  sources: MediabunnyVideoSource[];
  format?: 'mp4' | 'webm' | 'mov';
  codec?: 'h264' | 'h265' | 'vp9' | 'av1';
  bitrate?: number;
  onProgress?: (percent: number, message: string) => void;
  /** GPU 转场配置数组（由 video-merge.ts 自动随机生成） */
  transitions: TransitionConfig[];
  /** 原声音量（0-1，默认1） */
  sourceAudioVolume?: number;
  /** 背景音乐（可选） */
  backgroundAudio?: {
    /** 音乐文件 URL 或 File */
    source: string | File;
    /** 音量（0-1） */
    volume?: number;
    /** 淡入时长（秒） */
    fadeInSec?: number;
    /** 淡出时长（秒） */
    fadeOutSec?: number;
  };
}

/**
 * 导出管线
 * 所有导出都带 GPU 转场，转场由 video-merge.ts 随机选择
 */
export class ExportPipeline {
  /**
   * 导出视频（带 GPU 转场）
   * 使用 VideoSampleSource + 双缓冲流水线实现渲染编码并行
   */
  static async export(options: ExportOptions): Promise<Blob> {
    const {
      sources,
      codec = 'h264',
      bitrate = 5000000,
      transitions = [],
      backgroundAudio,
      sourceAudioVolume = 1,
      onProgress,
    } = options;

    // 初始化完成，不打印日志

    // 确保所有源都已初始化
    for (const source of sources) {
      await source.ready;
    }

    // 获取输出分辨率
    const width = Math.max(...sources.map(s => s.meta?.width ?? 0));
    const height = Math.max(...sources.map(s => s.meta?.height ?? 0));
    const fps = 30;

    // 编码配置
    const encodingConfig: VideoEncodingConfig = {
      codec: ExportPipeline.mapCodec(codec),
      bitrate,
      keyFrameInterval: 2,
      sizeChangeBehavior: 'contain',
      hardwareAcceleration: 'prefer-hardware',
      // quality 延迟模式：启用 B 帧和更好的码率控制，适合离线编码
      latencyMode: 'quality',
    };

    // 编码配置已设置

    // 创建输出
    const outputFormat = new Mp4OutputFormat({ fastStart: 'in-memory' });
    const target = new BufferTarget();
    const output = new Output({ format: outputFormat, target });

    // 使用 VideoSampleSource 替代 CanvasSource
    const videoSource = new VideoSampleSource(encodingConfig);
    output.addVideoTrack(videoSource, { frameRate: fps });

    // === 音频处理：原声 + 背景音乐 ===

    // 预读取所有音频源数据到内存 buffer（避免每次循环创建迭代器导致不连续）
    const sourceAudioBuffers: (AudioBufferData | null)[] = [];
    let hasAnyAudio = false;

    for (const source of sources) {
      const audioTrack = source.getAudioTrack();
      if (audioTrack) {
        const sink = new AudioSampleSink(audioTrack);
        const buffer = await ExportPipeline.preloadAudioToBuffer(sink);
        sourceAudioBuffers.push(buffer);
        if (buffer) {
          hasAnyAudio = true;
        }
      } else {
        sourceAudioBuffers.push(null);
      }
    }

    // 背景音乐初始化并预读取
    let bgAudioInput: Input | null = null;
    let bgAudioBuffer: AudioBufferData | null = null;
    let bgAudioDurationSec = 0;
    let bgAudioVolume = 1;
    let bgAudioFadeInSec = 0;
    let bgAudioFadeOutSec = 0;

    if (backgroundAudio) {
      try {
        bgAudioVolume = backgroundAudio.volume ?? 1;
        bgAudioFadeInSec = backgroundAudio.fadeInSec ?? 0;
        bgAudioFadeOutSec = backgroundAudio.fadeOutSec ?? 0;

        let audioSourceObj;
        if (backgroundAudio.source instanceof File) {
          audioSourceObj = new BlobSource(backgroundAudio.source);
        } else {
          audioSourceObj = new UrlSource(backgroundAudio.source);
        }

        bgAudioInput = new Input({
          formats: ALL_FORMATS,
          source: audioSourceObj,
        });

        const bgAudioTrack = await bgAudioInput.getPrimaryAudioTrack();
        if (!bgAudioTrack) {
          throw new Error('背景音乐文件没有音频轨道');
        }

        bgAudioDurationSec = await bgAudioInput.computeDuration();
        const bgAudioSink = new AudioSampleSink(bgAudioTrack);
        bgAudioBuffer = await ExportPipeline.preloadAudioToBuffer(bgAudioSink);
        if (bgAudioBuffer) {
          hasAnyAudio = true;
        }
      } catch (e) {
        log.warn({ error: e }, '背景音乐初始化失败，将跳过背景音乐');
        bgAudioInput?.dispose();
        bgAudioInput = null;
        bgAudioBuffer = null;
      }
    }

    // 创建音频输出轨道（如果有任何音频）
    let audioSource: AudioSampleSource | null = null;
    if (hasAnyAudio) {
      const audioEncodingConfig: AudioEncodingConfig = {
        codec: 'aac',
        bitrate: QUALITY_MEDIUM,
      };
      audioSource = new AudioSampleSource(audioEncodingConfig);
      output.addAudioTrack(audioSource);
    }

    // 初始化 GPU 转场管线
    let transitionPipeline: TransitionPipeline | null = null;
    let gpuDevice: GPUDevice | null = null;

    if (transitions.length > 0) {
      try {
        if (navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            gpuDevice = await adapter.requestDevice();
            transitionPipeline = TransitionPipeline.create(gpuDevice);
            if (!transitionPipeline) {
              log.warn('TransitionPipeline 创建失败');
            }
          }
        } else {
          log.warn('WebGPU 不支持，将跳过 GPU 转场');
        }
      } catch (e) {
        log.warn({ error: e }, 'WebGPU 初始化失败');
      }
    }

    // 计算时间线偏移
    const sourceOffsets: number[] = [];
    let totalDurationUs = 0;
    for (const source of sources) {
      sourceOffsets.push(totalDurationUs);
      totalDurationUs += source.meta?.duration ?? 0;
    }

    const frameDurationUs = Math.round(1000000 / fps);
    let processedDurationUs = 0;
    let frameCount = 0;

    // Canvas 用于分辨率不匹配时的 2D 缩放绘制
    const outputCanvas = new OffscreenCanvas(width, height);
    const outputCtx2d = outputCanvas.getContext('2d');
    if (!outputCtx2d) {
      throw new Error(`ExportPipeline: 无法创建 2D 上下文 (${width}x${height})`);
    }

    // 启动输出
    await output.start();

    // === 预处理音频（原声 + 背景音乐混合）===
    let pendingAudioSample: AudioSample | null = null;  // 声明在外部，便于 catch 时清理

    if (audioSource) {
      try {
        const totalDurationSec = totalDurationUs / 1000000;

        // 预计算转场时间范围
        const transitionRanges: { start: number; end: number; index: number }[] = [];
        for (const t of transitions) {
          const durationUs = framesToMicroseconds(t.durationInFrames, fps);
          transitionRanges.push({
            start: t.startTime / 1000000,
            end: (t.startTime + durationUs) / 1000000,
            index: t.index,
          });
        }

        // 按时间顺序处理音频（使用预读取的 buffer，避免迭代器不连续）
        let currentTimeSec = 0;

        while (currentTimeSec < totalDurationSec) {
          // 确定当前时间是否在转场期间
          const activeTransition = transitionRanges.find(
            r => currentTimeSec >= r.start && currentTimeSec < r.end
          );

          // 获取音频采样（从预读取 buffer 提取）
          pendingAudioSample = null;
          const chunkDurationSec = 0.1; // 每次提取 0.1 秒的数据

          if (activeTransition) {
            // === 转场期间：混合两源音频 ===
            const progress = (currentTimeSec - activeTransition.start) /
              (activeTransition.end - activeTransition.start);
            const leftIndex = activeTransition.index;
            const rightIndex = activeTransition.index + 1;

            const leftBuffer = sourceAudioBuffers[leftIndex];
            const rightBuffer = sourceAudioBuffers[rightIndex];

            // 计算各源的相对时间
            const leftTimeSec = currentTimeSec - sourceOffsets[leftIndex] / 1000000;
            const rightTimeSec = currentTimeSec - sourceOffsets[rightIndex] / 1000000;

            pendingAudioSample = ExportPipeline.mixBufferAudio(
              leftBuffer,
              rightBuffer,
              leftTimeSec,
              rightTimeSec,
              chunkDurationSec,
              sourceAudioVolume * (1 - progress), // 左源淡出
              sourceAudioVolume * progress        // 右源淡入
            );
          } else {
            // === 非转场期间：从当前源读取原声 ===
            const sourceIndex = ExportPipeline.findSourceIndex(sources, sourceOffsets, currentTimeSec * 1000000);
            const buffer = sourceAudioBuffers[sourceIndex];

            if (buffer) {
              const relativeTimeSec = currentTimeSec - sourceOffsets[sourceIndex] / 1000000;
              pendingAudioSample = ExportPipeline.mixBufferAudio(
                buffer,
                null,
                relativeTimeSec,
                0,
                chunkDurationSec,
                sourceAudioVolume,
                0
              );
            }
          }

          // 叠加背景音乐（从预读取 buffer 提取）
          if (bgAudioBuffer) {
            // 背景音乐循环播放：使用 modulo 计算实际时间
            const bgTimeSec = currentTimeSec % bgAudioDurationSec;

            const bgSample = ExportPipeline.extractFromAudioBuffer(bgAudioBuffer, bgTimeSec, chunkDurationSec);

            if (bgSample) {
              // 应用淡入淡出效果
              const adjustedBgSample = ExportPipeline.applyAudioEffects(
                bgSample,
                currentTimeSec,
                totalDurationSec,
                bgAudioVolume,
                bgAudioFadeInSec,
                bgAudioFadeOutSec
              );
              bgSample.close();

              if (pendingAudioSample) {
                // 有原声，混合背景音乐
                const finalSample = ExportPipeline.sumAudioSamples(pendingAudioSample, adjustedBgSample);
                adjustedBgSample.close();
                pendingAudioSample.close();
                pendingAudioSample = finalSample;
              } else {
                // 无原声，只有背景音乐
                pendingAudioSample = adjustedBgSample;
              }
            }
          }

          // 添加到输出（重采样到 48000 Hz 以兼容 AAC 编码器）
          if (pendingAudioSample) {
            // 重采样（如果采样率不是 48000 Hz）
            let outputSample = pendingAudioSample;
            if (pendingAudioSample.sampleRate !== 48000) {
              outputSample = ExportPipeline.resampleAudioSample(pendingAudioSample);
              pendingAudioSample.close();
            }

            outputSample.setTimestamp(currentTimeSec);
            await audioSource.add(outputSample);
            // 防止 duration <= 0 导致无限循环
            const duration = Math.max(0.001, outputSample.duration);

            currentTimeSec += duration;
            outputSample.close();
            pendingAudioSample = null;  // 已关闭，清空引用
          } else {
            // 无音频，按视频帧时长推进
            currentTimeSec += frameDurationUs / 1000000;
          }
        }

        audioSource.close();
      } catch (e) {
        // 确保错误时关闭所有 pending samples
        if (pendingAudioSample) {
          pendingAudioSample.close();
          pendingAudioSample = null;
        }
        log.warn({ error: e, errorStr: String(e), errorMsg: e instanceof Error ? e.message : 'unknown' }, '音频处理出错');
        audioSource?.close();
      }
    }

    // 转场渲染用独立的 Canvas（WebGPU context），避免与 2D context 冲突
    const transitionCanvas = (transitionPipeline && gpuDevice)
      ? new OffscreenCanvas(width, height)
      : null;

    // 双缓冲流水线：渲染与编码并行
    // 正确顺序：先渲染（可与上一帧编码重叠），等编码完成，快照/编码
    try {
      let pendingEncode: Promise<void> | null = null;

      while (processedDurationUs < totalDurationUs) {
        // 检查是否在转场期间
        const activeTransition = transitions.find(t => {
          const durationUs = framesToMicroseconds(t.durationInFrames, fps);
          return processedDurationUs >= t.startTime &&
                 processedDurationUs < t.startTime + durationUs;
        });

        const timestampSec = processedDurationUs / 1000000;
        const frameDurationSec = frameDurationUs / 1000000;

        // 步骤1：渲染帧（可与上一帧编码并行，因为 Canvas/VideoSample 像素独立）
        let sampleToEncode: VideoSample | null = null;

        if (activeTransition && transitionPipeline && gpuDevice && transitionCanvas) {
          // === 转场帧：优先 Canvas 2D，其次 GPU ===
          sampleToEncode = await ExportPipeline.renderTransitionFrame(
            transitionPipeline,
            gpuDevice,
            sources,
            sourceOffsets,
            processedDurationUs,
            activeTransition,
            transitionCanvas,
            width,
            height,
            fps,
            outputCtx2d
          );
        } else {
          // === 非转场帧：零渲染直传或 Canvas 绘制 ===
          const sourceIndex = ExportPipeline.findSourceIndex(sources, sourceOffsets, processedDurationUs);
          const source = sources[sourceIndex];
          const relativeTimeUs = processedDurationUs - sourceOffsets[sourceIndex];
          const sourceMatchesOutput = source.meta.width === width && source.meta.height === height;

          if (sourceMatchesOutput) {
            // 零渲染直传：VideoSample 直接编码，跳过 Canvas
            const sample = await source.tickSample(relativeTimeUs);
            if (sample) {
              sample.setTimestamp(timestampSec);
              sample.setDuration(frameDurationSec);
              sampleToEncode = sample;
            }
          } else {
            // 需要缩放：通过 Canvas 2D 绘制
            const frame = await source.tick(relativeTimeUs);
            if (frame) {
              const ctx = outputCtx2d;
              ctx.fillStyle = 'black';
              ctx.fillRect(0, 0, width, height);
              const scale = Math.min(width / frame.displayWidth, height / frame.displayHeight);
              const scaledWidth = frame.displayWidth * scale;
              const scaledHeight = frame.displayHeight * scale;
              const x = (width - scaledWidth) / 2;
              const y = (height - scaledHeight) / 2;
              ctx.drawImage(frame, x, y, scaledWidth, scaledHeight);
              frame.close();

              sampleToEncode = new VideoSample(outputCanvas, { timestamp: timestampSec, duration: frameDurationSec });
            }
          }
        }

        // 步骤2：等待上一帧编码完成（确保编码顺序）
        if (pendingEncode) await pendingEncode;

        // 帧获取失败视为不可恢复错误，禁止静默丢帧
        if (!sampleToEncode) {
          throw new Error(`帧 ${frameCount} 渲染失败 (time=${processedDurationUs}us, transition=${!!activeTransition})`);
        }

        // 步骤3：启动当前帧编码（后台异步，与下一帧渲染重叠）
        pendingEncode = ExportPipeline.encodeSample(videoSource, sampleToEncode);

        frameCount++;
        processedDurationUs += frameDurationUs;

        // 进度更新
        const percent = Math.floor((processedDurationUs / totalDurationUs) * 100);
        onProgress?.(Math.min(99, percent), `编码进度 ${percent}%...`);
      }

      // 排空最后的编码
      if (pendingEncode) await pendingEncode;

    } catch (renderError: unknown) {
      const errorMessage = renderError instanceof Error
        ? renderError.message
        : String(renderError);
      const errorStack = renderError instanceof Error
        ? renderError.stack
        : undefined;
      log.error({
        errorMessage,
        errorStack,
        frameCount,
        processedDurationUs
      }, '渲染循环出错');
      videoSource.close();
      transitionPipeline?.destroy();
      gpuDevice?.destroy();
      bgAudioInput?.dispose();
      throw renderError;
    }

    // 完成输出
    videoSource.close();
    try {
      await output.finalize();
    } finally {
      transitionPipeline?.destroy();
      gpuDevice?.destroy();
      bgAudioInput?.dispose();
    }

    onProgress?.(100, '导出完成');

    const buffer = target.buffer;
    if (!buffer) {
      throw new Error('导出失败：输出缓冲区为空');
    }
    const blob = new Blob([buffer], { type: 'video/mp4' });
    return blob;
  }

  /**
   * 异步编码 VideoSample，编码完成后自动关闭释放 GPU 内存
   */
  private static async encodeSample(
    videoSource: VideoSampleSource,
    sample: VideoSample
  ): Promise<void> {
    try {
      await videoSource.add(sample);
    } finally {
      sample.close();
    }
  }

  /**
   * 渲染转场帧
   * 优先使用 Canvas 2D 转场，其次使用 GPU 转场
   */
  private static async renderTransitionFrame(
    pipeline: TransitionPipeline,
    device: GPUDevice,
    sources: MediabunnyVideoSource[],
    sourceOffsets: number[],
    currentTimeUs: number,
    transition: TransitionConfig,
    outputCanvas: OffscreenCanvas,
    width: number,
    height: number,
    fps: number,
    outputCtx2d: OffscreenCanvasRenderingContext2D
  ): Promise<VideoSample | null> {
    const { index, transitionId, startTime, direction, properties, timing, timingBezier, durationInFrames } = transition;

    const durationUs = framesToMicroseconds(durationInFrames, fps);
    const rawProgress = Math.max(0, Math.min(1, (currentTimeUs - startTime) / durationUs));
    const easedProgress = applyTimingFunction(rawProgress, timing ?? 'linear', timingBezier);

    // 获取左右视频帧
    const leftSource = sources[index];
    const rightSource = sources[index + 1];
    const leftTimeUs = currentTimeUs - sourceOffsets[index];
    const rightTimeUs = currentTimeUs - sourceOffsets[index + 1];

    const leftFrame = await leftSource.tick(Math.max(0, leftTimeUs));
    const rightFrame = await rightSource.tick(Math.max(0, rightTimeUs));

    if (!leftFrame || !rightFrame) {
      leftFrame?.close();
      rightFrame?.close();
      return null;
    }

    const timestampSec = currentTimeUs / 1000000;
    const frameDurationSec = 1 / fps;

    // === 优先检查是否有 Canvas 2D 转场 ===
    if (hasCanvasTransition(transitionId)) {
      const renderer = getCanvasTransitionRenderer(transitionId);
      if (renderer?.renderCanvas) {
        const result = ExportPipeline.renderCanvas2DTransition(
          renderer,
          leftFrame,
          rightFrame,
          outputCtx2d.canvas as OffscreenCanvas,
          outputCtx2d,
          easedProgress,
          width,
          height,
          direction as WipeDirection | SlideDirection | FlipDirection | undefined,
          properties,
          timestampSec,
          frameDurationSec
        );
        leftFrame.close();
        rightFrame.close();
        return result;
      }
    }

    // === GPU 转场：VideoFrame 直传 GPU 纹理 ===
    const leftTexture = await ExportPipeline.uploadFrameToTexture(device, leftFrame, width, height);
    const rightTexture = await ExportPipeline.uploadFrameToTexture(device, rightFrame, width, height);

    if (!leftTexture || !rightTexture) {
      // GPU 纹理上传失败，用 Canvas 2D 交叉淡入淡出回退
      leftTexture?.destroy();
      rightTexture?.destroy();

      const ctx = outputCtx2d;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);

      // 绘制左帧（不透明度递减）
      ctx.globalAlpha = 1 - easedProgress;
      const leftScale = Math.min(width / leftFrame.displayWidth, height / leftFrame.displayHeight);
      const lw = leftFrame.displayWidth * leftScale;
      const lh = leftFrame.displayHeight * leftScale;
      ctx.drawImage(leftFrame, (width - lw) / 2, (height - lh) / 2, lw, lh);

      // 绘制右帧（不透明度递增）
      ctx.globalAlpha = easedProgress;
      const rightScale = Math.min(width / rightFrame.displayWidth, height / rightFrame.displayHeight);
      const rw = rightFrame.displayWidth * rightScale;
      const rh = rightFrame.displayHeight * rightScale;
      ctx.drawImage(rightFrame, (width - rw) / 2, (height - rh) / 2, rw, rh);

      ctx.globalAlpha = 1;

      leftFrame.close();
      rightFrame.close();

      // outputCanvas 可能有 WebGPU 上下文，不可用于 VideoFrame 构造
      // 用 outputCtx2d 的 canvas（Canvas 2D context）创建 VideoSample
      return new VideoSample(outputCtx2d.canvas as OffscreenCanvas, { timestamp: timestampSec, duration: frameDurationSec });
    }

    leftFrame.close();
    rightFrame.close();

    // 配置 outputCanvas 的 WebGPU 上下文
    const outputCtx = ExportPipeline.ensureWebGPUContext(device, outputCanvas, width, height);
    if (!outputCtx) {
      leftTexture.destroy();
      rightTexture.destroy();
      return null;
    }

    // GPU 转场渲染：纹理到纹理
    const ok = pipeline.renderTexturesToTexture(
      transitionId,
      leftTexture,
      rightTexture,
      outputCtx.getCurrentTexture(),
      easedProgress,
      width,
      height,
      direction,
      properties
    );

    leftTexture.destroy();
    rightTexture.destroy();

    if (!ok) {
      log.warn({ transitionId, rawProgress }, 'GPU 转场渲染失败');
      return null;
    }

    // 等待 GPU 命令完成，确保 Canvas 内容可读
    await device.queue.onSubmittedWorkDone();

    return new VideoSample(outputCanvas, { timestamp: timestampSec, duration: frameDurationSec });
  }

  /**
   * Canvas 2D 转场渲染
   * 使用 Path2D clipping，在 outputCanvas（Canvas 2D context）上渲染
   */
  private static renderCanvas2DTransition(
    renderer: TransitionRenderer,
    leftFrame: VideoFrame,
    rightFrame: VideoFrame,
    outputCanvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
    progress: number,
    width: number,
    height: number,
    direction: WipeDirection | SlideDirection | FlipDirection | undefined,
    properties: Record<string, unknown> | undefined,
    timestampSec: number,
    frameDurationSec: number
  ): VideoSample | null {
    // 创建左右帧的 OffscreenCanvas（用于 renderCanvas）
    const leftCanvas = new OffscreenCanvas(width, height);
    const leftCtx = leftCanvas.getContext('2d');
    if (!leftCtx) return null;
    leftCtx.fillStyle = 'black';
    leftCtx.fillRect(0, 0, width, height);
    const leftScale = Math.min(width / leftFrame.displayWidth, height / leftFrame.displayHeight);
    const leftScaledWidth = leftFrame.displayWidth * leftScale;
    const leftScaledHeight = leftFrame.displayHeight * leftScale;
    leftCtx.drawImage(leftFrame, (width - leftScaledWidth) / 2, (height - leftScaledHeight) / 2, leftScaledWidth, leftScaledHeight);

    const rightCanvas = new OffscreenCanvas(width, height);
    const rightCtx = rightCanvas.getContext('2d');
    if (!rightCtx) return null;
    rightCtx.fillStyle = 'black';
    rightCtx.fillRect(0, 0, width, height);
    const rightScale = Math.min(width / rightFrame.displayWidth, height / rightFrame.displayHeight);
    const rightScaledWidth = rightFrame.displayWidth * rightScale;
    const rightScaledHeight = rightFrame.displayHeight * rightScale;
    rightCtx.drawImage(rightFrame, (width - rightScaledWidth) / 2, (height - rightScaledHeight) / 2, rightScaledWidth, rightScaledHeight);

    // 清空输出 canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);

    // 调用 Canvas 2D 渲染器
    renderer.renderCanvas!(
      ctx,
      leftCanvas,
      rightCanvas,
      progress,
      direction,
      { width, height },
      properties
    );

    return new VideoSample(outputCanvas, { timestamp: timestampSec, duration: frameDurationSec });
  }

  /**
   * VideoFrame 上传到 GPU 纹理
   * 先尝试直接上传；NV12 等不兼容格式通过 createImageBitmap 转 RGBA 后重试
   */
  private static async uploadFrameToTexture(
    device: GPUDevice,
    frame: VideoFrame,
    width: number,
    height: number
  ): Promise<GPUTexture | null> {
    // 直接上传 VideoFrame
    const texture = device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    try {
      device.queue.copyExternalImageToTexture(
        { source: frame, flipY: false },
        { texture, premultipliedAlpha: true },
        { width, height }
      );
      return texture;
    } catch {
      texture.destroy();
    }

    // NV12 等硬件解码格式不兼容，通过 ImageBitmap 转 RGBA 后重建 texture
    try {
      const bitmap = await createImageBitmap(frame);
      const retryTexture = device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture(
        { source: bitmap, flipY: false },
        { texture: retryTexture, premultipliedAlpha: true },
        { width, height }
      );
      bitmap.close();
      return retryTexture;
    } catch (e) {
      log.warn({
        error: e,
        frameWidth: frame.displayWidth,
        frameHeight: frame.displayHeight,
        frameFormat: (frame as unknown as Record<string, unknown>).format,
      }, 'VideoFrame 上传 GPU 纹理失败（含 ImageBitmap 回退）');
      return null;
    }
  }

  /** 缓存 WebGPU Canvas 上下文 */
  private static webgpuContextCache = new WeakMap<OffscreenCanvas, GPUCanvasContext>();

  private static ensureWebGPUContext(
    device: GPUDevice,
    canvas: OffscreenCanvas,
    width: number,
    height: number
  ): GPUCanvasContext | undefined {
    let ctx = ExportPipeline.webgpuContextCache.get(canvas) ?? undefined;
    if (ctx) return ctx;

    const rawCtx = canvas.getContext('webgpu');
    if (!rawCtx) return undefined;
    ctx = rawCtx as GPUCanvasContext;

    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });
    ExportPipeline.webgpuContextCache.set(canvas, ctx);
    return ctx;
  }

  /**
   * 查找当前时间对应的视频源索引
   */
  private static findSourceIndex(
    sources: MediabunnyVideoSource[],
    sourceOffsets: number[],
    currentTimeUs: number
  ): number {
    for (let i = 0; i < sources.length; i++) {
      const sourceDuration = sources[i].meta?.duration ?? 0;
      if (currentTimeUs >= sourceOffsets[i] && currentTimeUs < sourceOffsets[i] + sourceDuration) {
        return i;
      }
    }
    return sources.length - 1;
  }

  /**
   * 映射编码名称到 mediabunny codec
   */
  private static mapCodec(codec: string): 'avc' | 'hevc' | 'vp9' | 'av1' | 'vp8' {
    const map: Record<string, 'avc' | 'hevc' | 'vp9' | 'av1' | 'vp8'> = {
      'h264': 'avc',
      'h265': 'hevc',
      'vp9': 'vp9',
      'av1': 'av1',
    };
    return map[codec] ?? 'avc';
  }

  /**
   * 立即复制 AudioSample 数据到独立 buffer
   * 返回一个完全独立的 AudioSample，可以安全地在任何时间访问
   * 注意：此方法仅用于 sumAudioSamples 等需要处理单个 AudioSample 的场景
   *       预读取音频请使用 preloadAudioToBuffer
   */
  private static safeCopyAudioSample(sample: AudioSample): AudioSample {
    const numberOfChannels = sample.numberOfChannels;
    const numberOfFrames = sample.numberOfFrames;
    const format = sample.format;
    const sampleRate = sample.sampleRate;
    const timestamp = sample.timestamp;

    const isPlanar = format.includes('planar');
    const bytesPerFrame = format.includes('32') ? 4 : format.includes('16') ? 2 : 1;
    const totalSize = isPlanar
      ? numberOfChannels * numberOfFrames * bytesPerFrame
      : numberOfFrames * numberOfChannels * bytesPerFrame;

    const buffer = new ArrayBuffer(totalSize);

    if (isPlanar) {
      // planar 格式：每个声道独立存储，需要逐声道复制
      for (let channel = 0; channel < numberOfChannels; channel++) {
        sample.copyTo(
          new Uint8Array(buffer, channel * numberOfFrames * bytesPerFrame, numberOfFrames * bytesPerFrame),
          { planeIndex: channel, format }
        );
      }
    } else {
      // interleaved 格式：所有声道交错存储在一个平面中，一次复制
      sample.copyTo(new Uint8Array(buffer), { planeIndex: 0, format });
    }

    return new AudioSample({
      data: buffer,
      format,
      numberOfChannels,
      sampleRate,
      timestamp,
    });
  }

  /**
   * 应用单一音量到音频采样
   */
  private static applyVolume(sample: AudioSample, volume: number): AudioSample {
    return ExportPipeline.applyAudioEffects(sample, 0, Infinity, volume, 0, 0);
  }

  /**
   * 将两个音频采样相加（叠加）
   * 要求两个采样的格式、采样率、声道数必须一致
   */
  private static sumAudioSamples(sample1: AudioSample, sample2: AudioSample): AudioSample {
    // 格式不一致时，只返回 sample1（避免错误）
    // 但采样率不一致时，先重采样 sample2 到 sample1 的采样率
    if (sample1.format !== sample2.format ||
        sample1.numberOfChannels !== sample2.numberOfChannels) {
      return sample1.clone();
    }

    // 如果采样率不一致，重采样 sample2 到 sample1 的采样率
    // 注意：重采样后的 sample 由本方法负责关闭，原始 sample 由调用者负责
    let workingSample2 = sample2;
    let needsCloseSample2 = false;
    if (sample1.sampleRate !== sample2.sampleRate) {
      workingSample2 = ExportPipeline.resampleAudioSampleToTarget(sample2, sample1.sampleRate);
      needsCloseSample2 = true; // 需要关闭重采样后的 sample
    }

    const format = sample1.format;
    const numberOfChannels = sample1.numberOfChannels;
    const numberOfFrames = Math.max(sample1.numberOfFrames, workingSample2.numberOfFrames);
    const sampleRate = sample1.sampleRate;

    const isPlanar = format.includes('planar');
    const bytesPerFrame = format.includes('32') ? 4 : format.includes('16') ? 2 : 1;
    const totalSize = isPlanar
      ? numberOfChannels * numberOfFrames * bytesPerFrame
      : numberOfFrames * numberOfChannels * bytesPerFrame;

    const buffer = new ArrayBuffer(totalSize);
    const dataView = new DataView(buffer);

    // 先初始化为 0（静音）
    new Uint8Array(buffer).fill(0);

    // 读取 sample1 的所有数据到一个 buffer
    const s1TotalSize = isPlanar
      ? numberOfChannels * sample1.numberOfFrames * bytesPerFrame
      : sample1.numberOfFrames * numberOfChannels * bytesPerFrame;
    const s1Buffer = new ArrayBuffer(s1TotalSize);
    const s1DataView = new DataView(s1Buffer);

    if (isPlanar) {
      // planar 格式：逐声道复制
      for (let channel = 0; channel < numberOfChannels; channel++) {
        sample1.copyTo(
          new Uint8Array(s1Buffer, channel * sample1.numberOfFrames * bytesPerFrame, sample1.numberOfFrames * bytesPerFrame),
          { planeIndex: channel, format }
        );
      }
    } else {
      // interleaved 格式：一次复制所有数据
      sample1.copyTo(new Uint8Array(s1Buffer), { planeIndex: 0, format });
    }

    // 读取 workingSample2 的所有数据到一个 buffer
    const s2TotalSize = isPlanar
      ? numberOfChannels * workingSample2.numberOfFrames * bytesPerFrame
      : workingSample2.numberOfFrames * numberOfChannels * bytesPerFrame;
    const s2Buffer = new ArrayBuffer(s2TotalSize);
    const s2DataView = new DataView(s2Buffer);

    if (isPlanar) {
      // planar 格式：逐声道复制
      for (let channel = 0; channel < numberOfChannels; channel++) {
        workingSample2.copyTo(
          new Uint8Array(s2Buffer, channel * workingSample2.numberOfFrames * bytesPerFrame, workingSample2.numberOfFrames * bytesPerFrame),
          { planeIndex: channel, format }
        );
      }
    } else {
      // interleaved 格式：一次复制所有数据
      workingSample2.copyTo(new Uint8Array(s2Buffer), { planeIndex: 0, format });
    }

    // 将两个 buffer 的数据相加写入输出
    for (let channel = 0; channel < numberOfChannels; channel++) {
      for (let frame = 0; frame < numberOfFrames; frame++) {
        const dataIndex = isPlanar
          ? channel * numberOfFrames + frame
          : frame * numberOfChannels + channel;

        // 从 sample1 读取值
        let v1 = 0;
        if (frame < sample1.numberOfFrames) {
          const s1Idx = isPlanar
            ? channel * sample1.numberOfFrames + frame
            : frame * numberOfChannels + channel;
          if (format.includes('f32')) {
            v1 = s1DataView.getFloat32(s1Idx * 4, true);
          } else if (format.includes('s16')) {
            v1 = s1DataView.getInt16(s1Idx * 2, true);
          } else if (format.includes('s32')) {
            v1 = s1DataView.getInt32(s1Idx * 4, true);
          }
        }

        // 从 workingSample2 读取值
        let v2 = 0;
        if (frame < workingSample2.numberOfFrames) {
          const s2Idx = isPlanar
            ? channel * workingSample2.numberOfFrames + frame
            : frame * numberOfChannels + channel;
          if (format.includes('f32')) {
            v2 = s2DataView.getFloat32(s2Idx * 4, true);
          } else if (format.includes('s16')) {
            v2 = s2DataView.getInt16(s2Idx * 2, true);
          } else if (format.includes('s32')) {
            v2 = s2DataView.getInt32(s2Idx * 4, true);
          }
        }

        // 相加并写入输出
        if (format.includes('f32')) {
          dataView.setFloat32(dataIndex * 4, v1 + v2, true);
        } else if (format.includes('s16')) {
          dataView.setInt16(dataIndex * 2, Math.round(v1 + v2), true);
        } else if (format.includes('s32')) {
          dataView.setInt32(dataIndex * 4, Math.round(v1 + v2), true);
        }
      }
    }

    // 关闭重采样后的 sample（如果有重采样）
    if (needsCloseSample2) {
      workingSample2.close();
    }

    return new AudioSample({
      data: buffer,
      format,
      numberOfChannels,
      sampleRate,
      timestamp: sample1.timestamp,
    });
  }

  /**
   * 应用音量和淡入淡出效果到音频采样
   */
  private static applyAudioEffects(
    sample: AudioSample,
    currentTimeSec: number,
    totalDurationSec: number,
    volume: number,
    fadeInSec: number,
    fadeOutSec: number
  ): AudioSample {
    // 先立即复制所有数据到独立 buffer（避免迭代器内部管理导致 sample 失效）
    const numberOfChannels = sample.numberOfChannels;
    const numberOfFrames = sample.numberOfFrames;
    const format = sample.format;
    const sampleRate = sample.sampleRate;
    const timestamp = sample.timestamp;

    const isPlanar = format.includes('planar');
    const bytesPerFrame = format.includes('32') ? 4 : format.includes('16') ? 2 : 1;
    const totalSize = isPlanar
      ? numberOfChannels * numberOfFrames * bytesPerFrame
      : numberOfFrames * numberOfChannels * bytesPerFrame;

    const buffer = new ArrayBuffer(totalSize);
    const dataView = new DataView(buffer);

    if (isPlanar) {
      // planar 格式：逐声道复制
      for (let channel = 0; channel < numberOfChannels; channel++) {
        sample.copyTo(
          new Uint8Array(buffer, channel * numberOfFrames * bytesPerFrame, numberOfFrames * bytesPerFrame),
          { planeIndex: channel, format }
        );
      }
    } else {
      // interleaved 格式：一次复制所有数据
      sample.copyTo(new Uint8Array(buffer), { planeIndex: 0, format });
    }

    // 应用音量和淡入淡出效果
    for (let channel = 0; channel < numberOfChannels; channel++) {
      for (let frame = 0; frame < numberOfFrames; frame++) {
        const frameTimeSec = currentTimeSec + (frame / sampleRate);
        const dataIndex = isPlanar
          ? channel * numberOfFrames + frame
          : frame * numberOfChannels + channel;

        let fadeMultiplier = 1;

        if (fadeInSec > 0 && frameTimeSec < fadeInSec) {
          fadeMultiplier *= frameTimeSec / fadeInSec;
        }

        if (fadeOutSec > 0 && frameTimeSec > totalDurationSec - fadeOutSec) {
          fadeMultiplier *= (totalDurationSec - frameTimeSec) / fadeOutSec;
        }

        const gain = volume * fadeMultiplier;

        if (format.includes('f32')) {
          const value = dataView.getFloat32(dataIndex * 4, true);
          dataView.setFloat32(dataIndex * 4, value * gain, true);
        } else if (format.includes('s16')) {
          const value = dataView.getInt16(dataIndex * 2, true);
          dataView.setInt16(dataIndex * 2, Math.round(value * gain), true);
        } else if (format.includes('s32')) {
          const value = dataView.getInt32(dataIndex * 4, true);
          dataView.setInt32(dataIndex * 4, Math.round(value * gain), true);
        }
      }
    }

    return new AudioSample({
      data: buffer,
      format,
      numberOfChannels,
      sampleRate,
      timestamp,
    });
  }

  /**
   * 重采样到 AAC 编码器兼容的采样率（48000 Hz）
   */
  private static resampleAudioSample(sample: AudioSample): AudioSample {
    return ExportPipeline.resampleAudioSampleToTarget(sample, 48000);
  }

  /**
   * 重采样到指定的目标采样率（线性插值）
   * 用于混合音频时统一采样率
   */
  private static resampleAudioSampleToTarget(sample: AudioSample, targetRate: number): AudioSample {
    const sourceRate = sample.sampleRate;

    if (sourceRate === targetRate) return sample;

    const ratio = targetRate / sourceRate;
    const sourceFrames = sample.numberOfFrames;
    const targetFrames = Math.round(sourceFrames * ratio);
    const numberOfChannels = sample.numberOfChannels;
    const format = sample.format;

    if (targetFrames <= 0 || sourceFrames <= 0) return sample;

    const bytesPerFrame = format.includes('32') ? 4 : format.includes('16') ? 2 : 1;
    const isPlanar = format.includes('planar');

    // 读取源数据
    const sourceSize = isPlanar
      ? numberOfChannels * sourceFrames * bytesPerFrame
      : sourceFrames * numberOfChannels * bytesPerFrame;
    const sourceBuffer = new ArrayBuffer(sourceSize);

    if (isPlanar) {
      // planar 格式：逐声道复制
      for (let ch = 0; ch < numberOfChannels; ch++) {
        sample.copyTo(
          new Uint8Array(sourceBuffer, ch * sourceFrames * bytesPerFrame, sourceFrames * bytesPerFrame),
          { planeIndex: ch, format }
        );
      }
    } else {
      // interleaved 格式：一次复制所有数据
      sample.copyTo(new Uint8Array(sourceBuffer), { planeIndex: 0, format });
    }
    const src = new DataView(sourceBuffer);

    // 创建输出缓冲区并重采样
    const targetSize = isPlanar
      ? numberOfChannels * targetFrames * bytesPerFrame
      : targetFrames * numberOfChannels * bytesPerFrame;
    const targetBuffer = new ArrayBuffer(targetSize);
    const dst = new DataView(targetBuffer);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      for (let i = 0; i < targetFrames; i++) {
        const sourcePos = i / ratio;
        const idx0 = Math.min(Math.floor(sourcePos), sourceFrames - 1);
        const idx1 = Math.min(idx0 + 1, sourceFrames - 1);
        const frac = sourcePos - idx0;

        const s0 = isPlanar ? ch * sourceFrames + idx0 : idx0 * numberOfChannels + ch;
        const s1 = isPlanar ? ch * sourceFrames + idx1 : idx1 * numberOfChannels + ch;
        const di = isPlanar ? ch * targetFrames + i : i * numberOfChannels + ch;

        if (format.includes('f32')) {
          const v0 = src.getFloat32(s0 * 4, true);
          const v1 = src.getFloat32(s1 * 4, true);
          dst.setFloat32(di * 4, v0 + (v1 - v0) * frac, true);
        } else if (format.includes('s16')) {
          const v0 = src.getInt16(s0 * 2, true);
          const v1 = src.getInt16(s1 * 2, true);
          dst.setInt16(di * 2, Math.round(v0 + (v1 - v0) * frac), true);
        } else if (format.includes('s32')) {
          const v0 = src.getInt32(s0 * 4, true);
          const v1 = src.getInt32(s1 * 4, true);
          dst.setInt32(di * 4, Math.round(v0 + (v1 - v0) * frac), true);
        }
      }
    }

    return new AudioSample({
      data: targetBuffer,
      format,
      numberOfChannels,
      sampleRate: targetRate,
      timestamp: sample.timestamp,
    });
  }

  /**
   * 预读取音频数据到内存 buffer
   * 通过单次顺序迭代一次性读取所有音频数据，避免后续每次循环创建迭代器导致不连续
   */
  private static async preloadAudioToBuffer(sink: AudioSampleSink): Promise<AudioBufferData | null> {
    // 单次迭代：同时获取格式信息和所有数据
    let formatInfo: { sampleRate: number; numberOfChannels: number } | null = null;
    const dataChunks: Float32Array[][] = []; // 每声道的数据块
    let totalFrames = 0;

    for await (const sample of sink.samples(0)) {
      if (sample) {
        // 第一次获取 sample 时记录格式信息
        if (!formatInfo) {
          formatInfo = {
            sampleRate: sample.sampleRate,
            numberOfChannels: sample.numberOfChannels,
          };
          // 初始化数据块数组
          for (let ch = 0; ch < formatInfo.numberOfChannels; ch++) {
            dataChunks.push([]);
          }
        }

        const frames = sample.numberOfFrames;
        const format = sample.format;
        const numberOfChannels = formatInfo.numberOfChannels;
        const isPlanar = format.includes('planar');
        const bytesPerFrame = format.includes('32') ? 4 : format.includes('16') ? 2 : 1;

        // 将 sample 数据复制到临时 buffer（统一转为 f32）
        if (isPlanar) {
          // planar 格式：每个声道独立存储，逐声道复制
          for (let ch = 0; ch < numberOfChannels; ch++) {
            const tempSize = frames * bytesPerFrame;
            const tempBuffer = new ArrayBuffer(tempSize);

            sample.copyTo(new Uint8Array(tempBuffer), { planeIndex: ch, format });

            const tempView = new DataView(tempBuffer);
            const channelData = new Float32Array(frames);

            for (let i = 0; i < frames; i++) {
              let value = 0;

              if (format.includes('f32')) {
                value = tempView.getFloat32(i * 4, true);
              } else if (format.includes('s16')) {
                value = tempView.getInt16(i * 2, true) / 32768;
              } else if (format.includes('s32')) {
                value = tempView.getInt32(i * 4, true) / 2147483648;
              }

              channelData[i] = value;
            }

            dataChunks[ch].push(channelData);
          }
        } else {
          // interleaved 格式：所有声道交错存储，一次复制所有数据然后解构
          const tempSize = frames * numberOfChannels * bytesPerFrame;
          const tempBuffer = new ArrayBuffer(tempSize);

          sample.copyTo(new Uint8Array(tempBuffer), { planeIndex: 0, format });

          const tempView = new DataView(tempBuffer);

          // 为每个声道创建数据块
          for (let ch = 0; ch < numberOfChannels; ch++) {
            const channelData = new Float32Array(frames);

            for (let i = 0; i < frames; i++) {
              // interleaved: 声道交错存储，索引 = i * numberOfChannels + ch
              const srcIdx = i * numberOfChannels + ch;
              let value = 0;

              if (format.includes('f32')) {
                value = tempView.getFloat32(srcIdx * 4, true);
              } else if (format.includes('s16')) {
                value = tempView.getInt16(srcIdx * 2, true) / 32768;
              } else if (format.includes('s32')) {
                value = tempView.getInt32(srcIdx * 4, true) / 2147483648;
              }

              channelData[i] = value;
            }

            dataChunks[ch].push(channelData);
          }
        }

        totalFrames += frames;
        sample.close();
      }
    }

    if (!formatInfo || totalFrames === 0) {
      return null;
    }

    // 合并所有数据块为连续的 Float32Array
    const data: Float32Array[] = [];
    for (let ch = 0; ch < formatInfo.numberOfChannels; ch++) {
      const combined = new Float32Array(totalFrames);
      let offset = 0;
      for (const chunk of dataChunks[ch]) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      data.push(combined);
    }

    const durationSec = totalFrames / formatInfo.sampleRate;

    return {
      data,
      sampleRate: formatInfo.sampleRate,
      numberOfChannels: formatInfo.numberOfChannels,
      durationSec,
      totalFrames,
    };
  }

  /**
   * 从预读取的音频 buffer 中提取指定时间段的音频数据
   * @param buffer 预读取的音频数据
   * @param startSec 开始时间（秒）
   * @param durationSec 需要的时长（秒），如果不指定则取到末尾
   * @returns AudioSample 或 null（如果时间段超出范围）
   */
  private static extractFromAudioBuffer(
    buffer: AudioBufferData,
    startSec: number,
    durationSec?: number
  ): AudioSample | null {
    const { data, sampleRate, numberOfChannels, totalFrames } = buffer;

    // 计算帧范围
    const startFrame = Math.floor(startSec * sampleRate);
    // 边界检查：startFrame 必须 >= 0
    if (startFrame < 0 || startFrame >= totalFrames) {
      return null;
    }

    // 确定结束帧
    const maxFrames = durationSec ? Math.floor(durationSec * sampleRate) : totalFrames - startFrame;
    const endFrame = Math.min(startFrame + maxFrames, totalFrames);
    const frames = endFrame - startFrame;

    if (frames <= 0) {
      return null;
    }

    // 创建输出 buffer（f32-planar 格式）
    const outputData: Float32Array[] = [];
    const outputSize = frames * 4; // f32 = 4 bytes
    const outputBuffer = new ArrayBuffer(numberOfChannels * outputSize);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = new Float32Array(outputBuffer, ch * outputSize, frames);
      // 复制数据
      for (let i = 0; i < frames; i++) {
        channelData[i] = data[ch][startFrame + i];
      }
      outputData.push(channelData);
    }

    return new AudioSample({
      data: outputBuffer,
      format: 'f32-planar',
      numberOfChannels,
      sampleRate,
      timestamp: startSec,
    });
  }

  /**
   * 混合两个 AudioBufferData（按时间提取并叠加）
   * 返回混合后的 AudioSample
   */
  private static mixBufferAudio(
    buffer1: AudioBufferData | null,
    buffer2: AudioBufferData | null,
    time1Sec: number,
    time2Sec: number,
    durationSec: number,
    volume1: number,
    volume2: number
  ): AudioSample | null {
    // 如果两个 buffer 都不存在，返回 null
    if (!buffer1 && !buffer2) {
      return null;
    }

    // 确定输出参数（使用第一个 buffer 的参数，或第二个的）
    const outputSampleRate = buffer1?.sampleRate ?? buffer2?.sampleRate ?? 48000;
    const outputNumberOfChannels = buffer1?.numberOfChannels ?? buffer2?.numberOfChannels ?? 2;
    const outputFrames = Math.ceil(durationSec * outputSampleRate);

    // 创建输出 buffer（f32-planar）
    const outputSize = outputFrames * 4;
    const outputBuffer = new ArrayBuffer(outputNumberOfChannels * outputSize);
    const outputData: Float32Array[] = [];

    for (let ch = 0; ch < outputNumberOfChannels; ch++) {
      outputData.push(new Float32Array(outputBuffer, ch * outputSize, outputFrames));
    }

    // 填充数据
    for (let ch = 0; ch < outputNumberOfChannels; ch++) {
      for (let i = 0; i < outputFrames; i++) {
        let v1 = 0;
        let v2 = 0;

        // 从 buffer1 提取
        if (buffer1) {
          const frame1 = Math.floor(time1Sec * buffer1.sampleRate) + Math.floor(i * buffer1.sampleRate / outputSampleRate);
          if (frame1 >= 0 && frame1 < buffer1.totalFrames && ch < buffer1.numberOfChannels) {
            v1 = buffer1.data[ch][frame1] * volume1;
          }
        }

        // 从 buffer2 提取
        if (buffer2) {
          const frame2 = Math.floor(time2Sec * buffer2.sampleRate) + Math.floor(i * buffer2.sampleRate / outputSampleRate);
          if (frame2 >= 0 && frame2 < buffer2.totalFrames && ch < buffer2.numberOfChannels) {
            v2 = buffer2.data[ch][frame2] * volume2;
          }
        }

        outputData[ch][i] = v1 + v2;
      }
    }

    return new AudioSample({
      data: outputBuffer,
      format: 'f32-planar',
      numberOfChannels: outputNumberOfChannels,
      sampleRate: outputSampleRate,
      timestamp: time1Sec,
    });
  }
}
