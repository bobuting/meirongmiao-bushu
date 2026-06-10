import { TransitionManager } from './transition-manager';
import {
  FadeTransition,
  // SlideTransition,
  // ZoomTransition,
  // BlindsTransition,
  // DissolveTransition,
  // CrossDissolveTransition, // 已移至 gl-transitions-library.ts
} from './effects-transitions';
import { createGLTransitions } from './gl-transitions-library';

// 创建全局转场管理器实例
export const transitionManager = new TransitionManager();

// 注册内置转场效果（不重复注册 fade 和 crossDissolve，因为 gl-transitions 已包含）
// transitionManager.registerTransition(new FadeTransition()); // 已在 gl-transitions 中注册
// transitionManager.registerTransition(new SlideTransition());
// transitionManager.registerTransition(new ZoomTransition());
// transitionManager.registerTransition(new BlindsTransition());
// transitionManager.registerTransition(new DissolveTransition());
// transitionManager.registerTransition(new CrossDissolveTransition()); // 已在 gl-transitions 中注册

// 注册 gl-transitions 转场库（fade + crossDissolve）
const glTransitions = createGLTransitions();
glTransitions.forEach((transition) => {
  transitionManager.registerTransition(transition);
});

export { WebCutBaseTransition, type WebCutTransitionConfig } from './base-transition';
export { TransitionClip, type TransitionClipOptions, type TransitionFrameSource } from './transition-clip';
export { GpuTransitionClip, type GpuTransitionClipOptions } from './gpu-transition-clip';
export { GLTransition, GL_TRANSITIONS_LIBRARY, createGLTransitions, getTransitionDefinition } from './gl-transitions-library';
