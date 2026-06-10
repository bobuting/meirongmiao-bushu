/**
 * Canvas 2D Transition Types
 *
 * 复刻 FreeCut 的 TransitionRenderer 接口，
 * 用于 CSS/DOM 预览和 Canvas 导出渲染。
 */

import type {
  TransitionCategory,
  WipeDirection,
  SlideDirection,
  FlipDirection,
  TransitionTiming,
} from '../types/transition'

/**
 * CSS 样式计算结果
 * 用于 DOM 预览渲染
 */
export interface TransitionStyleCalculation {
  opacity?: number
  transform?: string
  clipPath?: string
  maskImage?: string
  webkitClipPath?: string
  webkitMaskImage?: string
  maskSize?: string
  webkitMaskSize?: string
  maskPosition?: string
  webkitMaskPosition?: string
}

/**
 * Canvas 2D 转场渲染器接口
 */
export interface TransitionRenderer {
  /**
   * 计算 CSS 样式（用于 DOM 预览）
   */
  calculateStyles(
    progress: number,
    isOutgoing: boolean,
    canvasWidth: number,
    canvasHeight: number,
    direction?: WipeDirection | SlideDirection | FlipDirection,
    properties?: Record<string, unknown>,
  ): TransitionStyleCalculation

  /**
   * Canvas 2D 渲染（用于导出）
   * @param ctx - 输出 canvas 上下文
   * @param leftCanvas - 已渲染的 outgoing clip
   * @param rightCanvas - 已渲染的 incoming clip
   * @param progress - 转场进度 (0-1)
   * @param direction - 可选方向
   * @param canvas - Canvas 尺寸 { width, height }
   * @param properties - 可选自定义属性
   */
  renderCanvas?(
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    leftCanvas: OffscreenCanvas | HTMLCanvasElement,
    rightCanvas: OffscreenCanvas | HTMLCanvasElement,
    progress: number,
    direction?: WipeDirection | SlideDirection | FlipDirection,
    canvas?: { width: number; height: number },
    properties?: Record<string, unknown>,
  ): void

  /** 可选的 GPU 转场 ID（用于 WebGPU 加速） */
  gpuTransitionId?: string
}

/**
 * 转场定义（元数据，用于 UI）
 */
export interface CanvasTransitionDefinition {
  /** 唯一标识符 */
  id: string
  /** 显示名称 */
  label: string
  /** 简短描述 */
  description: string
  /** UI 分类 */
  category: TransitionCategory
  /** lucide-react 图标名 */
  icon: string
  /** 是否支持方向 */
  hasDirection: boolean
  /** 可用方向列表 */
  directions?: Array<WipeDirection | SlideDirection | FlipDirection>
  /** 支持的时间曲线 */
  supportedTimings: TransitionTiming[]
  /** 默认时长（帧） */
  defaultDuration: number
  /** 最小时长（帧） */
  minDuration: number
  /** 最大时长（帧） */
  maxDuration: number
}

/**
 * 注册条目
 */
export interface TransitionRegistryEntry {
  definition: CanvasTransitionDefinition
  renderer: TransitionRenderer
}