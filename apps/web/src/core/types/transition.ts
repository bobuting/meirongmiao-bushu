/**
 * Transition Types
 *
 * 转场类型定义，复刻 FreeCut 的类型系统。
 */

export type TransitionType = 'crossfade'

/**
 * 转场分类（用于 UI 分组）
 */
export type TransitionCategory =
  | 'basic'      // 基础转场：fade 等
  | 'dissolve'   // 溶解类转场
  | 'wipe'       // 擦除类转场
  | 'slide'      // 滑动类转场
  | 'motion'     // 运动类转场：barnDoor, split
  | 'flip'       // 翻转类转场
  | 'mask'       // 遮罩类转场：clock-wipe, iris 等
  | 'iris'       // 光圈类转场
  | 'shape'      // 形状类转场
  | 'distort'    // 扭曲类转场
  | 'stylize'    // 风格化转场
  | 'chromatic'  // 色差类转场
  | 'custom'     // 自定义转场

/**
 * 擦除方向选项
 */
export type WipeDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom'

/**
 * 滑动方向选项
 */
export type SlideDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom'

/**
 * 翻转方向选项
 */
export type FlipDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom'

/**
 * 时间曲线函数
 */
export type TransitionTiming = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'

/**
 * 贝塞尔曲线控制点
 */
export interface BezierPoints {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * 内置转场展示 ID
 */
export type BuiltinTransitionPresentation =
  | 'fade'
  | 'barnDoor'
  | 'wipe'
  | 'slide'
  | 'split'
  | 'flip'
  | 'clockWipe'
  | 'iris'
  | 'dissolve'
  | 'additiveDissolve'
  | 'blurDissolve'
  | 'dipToColorDissolve'
  | 'nonAdditiveDissolve'
  | 'smoothCut'
  | 'sparkles'
  | 'glitch'
  | 'pixelate'
  | 'chromatic'
  | 'radialBlur'
  | 'liquidDistort'
  | 'lensWarpZoom'
  | 'lightLeakBurn'
  | 'filmGateSlip'
  | 'arrowIris'
  | 'crossIris'
  | 'diamondIris'
  | 'eyeIris'
  | 'hexagonIris'
  | 'ovalIris'
  | 'pentagonIris'
  | 'squareIris'
  | 'triangleIris'
  | 'boxShape'
  | 'heartShape'
  | 'starShape'
  | 'triangleLeftShape'
  | 'triangleRightShape'
  | 'bandWipe'
  | 'centerWipe'
  | 'edgeWipe'
  | 'radialWipe'
  | 'spiralWipe'
  | 'venetianBlindWipe'
  | 'xWipe'

/**
 * 转场展示样式 ID（ widened to string 以支持自定义注册）
 */
export type TransitionPresentation = BuiltinTransitionPresentation | (string & {})

/**
 * 转场定义元数据（用于 UI）
 */
export interface TransitionDefinition {
  id: string
  defaultDuration: number
  minDuration: number
  maxDuration: number
  hasDirection: boolean
  directions?: string[]
  series?: 'basic' | 'wipe' | 'slide' | 'flip' | 'motion' | 'iris' | 'shape'
}