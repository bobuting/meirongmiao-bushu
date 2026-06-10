/**
 * Canvas 2D Transitions
 *
 * 导出转场注册表、类型定义和渲染器。
 * 使用方式与 FreeCut 保持一致。
 */

// 导出类型
export type {
  TransitionStyleCalculation,
  TransitionRenderer,
  CanvasTransitionDefinition,
  TransitionRegistryEntry,
} from './types'

// 导出注册表
export { TransitionRegistry, canvasTransitionRegistry } from './registry'

// 导出渲染器注册函数
export { registerWipeTransitions, getWipeDefinitions } from './renderers/wipe'
export { registerMotionTransitions, getMotionDefinitions } from './renderers/motion'

// 导出获取函数
import { canvasTransitionRegistry } from './registry'
import { registerWipeTransitions } from './renderers/wipe'
import { registerMotionTransitions } from './renderers/motion'

let registered = false

/** 注册所有内置 Canvas 2D 转场 */
export function registerBuiltinCanvasTransitions(): void {
  if (registered) return
  registered = true

  registerWipeTransitions(canvasTransitionRegistry)
  registerMotionTransitions(canvasTransitionRegistry)
}

/** 获取 Canvas 转场渲染器 */
export function getCanvasTransitionRenderer(id: string) {
  return canvasTransitionRegistry.getRenderer(id)
}

/** 获取 Canvas 转场定义 */
export function getCanvasTransitionDefinition(id: string) {
  return canvasTransitionRegistry.getDefinition(id)
}

/** 获取所有 Canvas 转场 ID */
export function getCanvasTransitionIds(): string[] {
  return canvasTransitionRegistry.getIds()
}

/** 检查是否有 Canvas 转场 */
export function hasCanvasTransition(id: string): boolean {
  return canvasTransitionRegistry.has(id)
}

// 自动注册
registerBuiltinCanvasTransitions()