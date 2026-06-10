/**
 * GPU 核心模块索引
 * 从 FreeCut 复制并适配
 */

// 类型导出
export type { BlendMode } from './types/blend-modes';
export { BLEND_MODE_INDEX } from './types/blend-modes';

// GPU管线导出
export { CompositorPipeline } from './gpu-compositor/compositor-pipeline';
export { TransitionPipeline, GPU_TRANSITION_REGISTRY, getGpuTransition, getGpuTransitionIds } from './gpu-transitions/index';
export type { GpuTransitionDefinition } from './gpu-transitions/index';
export { EffectsPipeline, GPU_EFFECT_REGISTRY, getGpuEffect, getGpuEffectsByCategory } from './gpu-effects/index';
export { MediaRenderPipeline, MediaBlendPipeline } from './gpu-media/index';

// 共享模块导出
export { BLEND_MODES_WGSL } from './gpu-shared/blend-modes';

// 视频源和合成导出
export { MediabunnyVideoSource, createVideoSource } from './video-source';
export type { VideoMeta, VideoSourceOptions } from './video-source';
export { MediabunnyAudioSource } from './audio-source';
export type { AudioMeta, AudioSourceOptions } from './audio-source';

// 合成引擎导出
export { CompositionLayer, VideoComposer } from './composition/video-composer';
export type { CompositionLayerOptions, EffectInstance, VideoComposerOptions } from './composition/video-composer';

// 导出管线导出
export { ExportPipeline } from './export/export-pipeline';
export type { ExportOptions, TransitionConfig, TransitionDefinition, TransitionTiming } from './export/export-pipeline';
export { framesToMicroseconds, calculateTransitionStartTime, applyTimingFunction } from './export/export-pipeline';