/**
 * Motion Transition Renderers
 *
 * 包含形状分割展开转场：
 * - barnDoor: 双门展开（左右两板向中心收缩）
 * - split: 四分展开（四角向中心收缩）
 *
 * 复刻 FreeCut 的 motion.ts 实现。
 */

import type { TransitionRegistry, TransitionRenderer } from '../registry'
import type { TransitionStyleCalculation, CanvasTransitionDefinition } from '../types'

const ALL_TIMINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier'] as const

type MotionMask = 'barnDoor' | 'split'

/** 将值限制在 [0, 1] 范围内 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** 创建 outgoing clip 的 SVG mask */
function createOutgoingMaskSvg(
  kind: MotionMask,
  width: number,
  height: number,
  progress: number,
): string {
  const p = clamp01(progress)
  const centerX = width / 2
  const centerY = height / 2

  let paths: string
  if (kind === 'barnDoor') {
    // 双门：左右两板向中心收缩
    const leftWidth = Math.max(0, centerX * (1 - p))
    const rightX = width - leftWidth
    paths = [
      `M0 0H${leftWidth.toFixed(2)}V${height}H0Z`,
      `M${rightX.toFixed(2)} 0H${width}V${height}H${rightX.toFixed(2)}Z`,
    ].join('')
  } else {
    // 四分：四角向中心收缩
    const gapX = centerX * p
    const gapY = centerY * p
    const leftWidth = Math.max(0, centerX - gapX)
    const rightX = width - leftWidth
    const topHeight = Math.max(0, centerY - gapY)
    const bottomY = height - topHeight
    paths = [
      // 左上
      `M0 0H${leftWidth.toFixed(2)}V${topHeight.toFixed(2)}H0Z`,
      // 右上
      `M${rightX.toFixed(2)} 0H${width}V${topHeight.toFixed(2)}H${rightX.toFixed(2)}Z`,
      // 左下
      `M0 ${bottomY.toFixed(2)}H${leftWidth.toFixed(2)}V${height}H0Z`,
      // 右下
      `M${rightX.toFixed(2)} ${bottomY.toFixed(2)}H${width}V${height}H${rightX.toFixed(2)}Z`,
    ].join('')
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="white" d="${paths}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** 添加 outgoing mask 路径到 Path2D */
function addOutgoingMaskPath(
  path: Path2D,
  kind: MotionMask,
  width: number,
  height: number,
  progress: number,
): void {
  const p = clamp01(progress)
  const centerX = width / 2
  const centerY = height / 2

  if (kind === 'barnDoor') {
    // 双门展开
    const panelWidth = Math.max(0, centerX * (1 - p))
    path.rect(0, 0, panelWidth, height)
    path.rect(width - panelWidth, 0, panelWidth, height)
    return
  }

  // 四分展开
  const panelWidth = Math.max(0, centerX * (1 - p))
  const panelHeight = Math.max(0, centerY * (1 - p))
  // 左上
  path.rect(0, 0, panelWidth, panelHeight)
  // 右上
  path.rect(width - panelWidth, 0, panelWidth, panelHeight)
  // 左下
  path.rect(0, height - panelHeight, panelWidth, panelHeight)
  // 右下
  path.rect(width - panelWidth, height - panelHeight, panelWidth, panelHeight)
}

/** 创建 Motion Mask 渲染器 */
function createMotionMaskRenderer(kind: MotionMask): TransitionRenderer {
  return {
    calculateStyles(progress, isOutgoing, canvasWidth, canvasHeight): TransitionStyleCalculation {
      const p = clamp01(progress)

      if (isOutgoing) {
        if (p <= 0) {
          return { opacity: 1 }
        }
        if (p >= 1) {
          return { opacity: 0 }
        }

        const maskImage = createOutgoingMaskSvg(kind, canvasWidth, canvasHeight, p)
        return {
          maskImage,
          webkitMaskImage: maskImage,
          maskSize: '100% 100%',
          webkitMaskSize: '100% 100%',
          opacity: 1,
        }
      }

      return { opacity: 1 }
    },
    renderCanvas(ctx, leftCanvas, rightCanvas, progress, _direction, canvas) {
      const p = clamp01(progress)
      const w = canvas?.width ?? leftCanvas.width
      const h = canvas?.height ?? leftCanvas.height

      // 先绘制 incoming clip（背景）
      ctx.drawImage(rightCanvas, 0, 0, w, h)

      // 使用 Path2D clip 绘制 outgoing clip
      ctx.save()
      const clipPath = new Path2D()
      addOutgoingMaskPath(clipPath, kind, w, h, p)
      ctx.clip(clipPath)
      ctx.drawImage(leftCanvas, 0, 0, w, h)
      ctx.restore()
    },
  }
}

/** Barn Door 转场定义 */
const barnDoorDef: CanvasTransitionDefinition = {
  id: 'barnDoor',
  label: 'Barn Door',
  description: '双门中心展开',
  category: 'motion',
  icon: 'Columns2',
  hasDirection: false,
  supportedTimings: [...ALL_TIMINGS],
  defaultDuration: 30,
  minDuration: 5,
  maxDuration: 90,
}

/** Split 转场定义 */
const splitDef: CanvasTransitionDefinition = {
  id: 'split',
  label: 'Split',
  description: '四分展开',
  category: 'motion',
  icon: 'SplitSquareVertical',
  hasDirection: false,
  supportedTimings: [...ALL_TIMINGS],
  defaultDuration: 30,
  minDuration: 5,
  maxDuration: 90,
}

/** 注册所有 Motion 转场 */
export function registerMotionTransitions(registry: TransitionRegistry): void {
  registry.register('barnDoor', barnDoorDef, createMotionMaskRenderer('barnDoor'))
  registry.register('split', splitDef, createMotionMaskRenderer('split'))
}

/** 获取所有 Motion 定义（用于 UI） */
export function getMotionDefinitions(): CanvasTransitionDefinition[] {
  return [barnDoorDef, splitDef]
}