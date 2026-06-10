/**
 * Wipe Transition Renderers
 *
 * 包含 DaVinci 风格的 Wipe 类别变体：
 * - bandWipe: 交替条纹擦除
 * - centerWipe: 中心展开擦除
 * - edgeWipe: 单边擦除
 * - radialWipe: 扇形擦除
 * - spiralWipe: 螺旋擦除
 * - venetianBlindWipe: 百叶窗擦除
 * - xWipe: X 形擦除
 *
 * 复刻 FreeCut 的 wipe.ts 实现。
 */

import type { TransitionRegistry, TransitionRenderer } from '../registry'
import type { TransitionStyleCalculation } from '../types'
import type { CanvasTransitionDefinition, TransitionRegistryEntry } from '../types'
import type { WipeDirection } from '../../types/transition'

const ALL_DIRECTIONS: WipeDirection[] = ['from-left', 'from-right', 'from-top', 'from-bottom']
const ALL_TIMINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier'] as const

type WipeMask = 'band' | 'center' | 'edge' | 'radial' | 'spiral' | 'venetianBlind' | 'x'

interface WipeVariant {
  id: string
  label: string
  description: string
  icon: string
  mask: WipeMask
}

/** 将值限制在 [0, 1] 范围内 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** 计算极坐标点 */
function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  }
}

/** 计算螺旋线宽度 */
function getSpiralStrokeWidth(width: number, height: number, progress: number): number {
  const p = clamp01(progress)
  if (p === 0) return 0
  const spacing = (Math.sqrt(width * width + height * height) * 0.58) / 3.8
  return Math.max(0, spacing * (0.04 + p * 1.25))
}

/** 计算 X 形线宽度 */
function getXStrokeWidth(width: number, height: number, progress: number): number {
  return Math.sqrt(width * width + height * height) * clamp01(progress) * 0.36
}

/** 生成螺旋线点位字符串 */
function createSpiralPolyline(width: number, height: number): string {
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.sqrt(width * width + height * height) * 0.58
  const turns = 3.8
  const steps = 220
  const points: string[] = []

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const angle = t * Math.PI * 2 * turns
    const radius = maxRadius * t
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }

  return points.join(' ')
}

/** 生成扇形擦除路径 */
function createRadialFanPath(width: number, height: number, progress: number): string {
  const p = clamp01(progress)
  if (p <= 0) return `M0 0H${width}V${height}H0Z`
  if (p >= 1) return ''

  const cx = width / 2
  const cy = height / 2
  const radius = Math.sqrt(width * width + height * height)
  const segmentCount = 4
  const segmentAngle = (Math.PI * 2) / segmentCount
  const paths: string[] = []

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentStart = -Math.PI / 2 + index * segmentAngle
    const startAngle = segmentStart + p * segmentAngle
    const endAngle = segmentStart + segmentAngle
    const start = polarPoint(cx, cy, radius, startAngle)
    const end = polarPoint(cx, cy, radius, endAngle)
    paths.push(
      [
        `M ${cx.toFixed(2)} ${cy.toFixed(2)}`,
        `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
        `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
        'Z',
      ].join(' '),
    )
  }

  return paths.join(' ')
}

/** 创建 outgoing clip 的 SVG mask */
function createOutgoingMaskSvg(
  kind: WipeMask,
  width: number,
  height: number,
  progress: number,
  direction: WipeDirection = 'from-top',
): string {
  const p = clamp01(progress)
  const paths: string[] = []

  if (kind === 'band') {
    const stripeCount = 10
    const stripeHeight = height / stripeCount
    for (let index = 0; index < stripeCount; index += 1) {
      const stagger = (index % 2) * 0.18
      const local = clamp01((p - stagger) / Math.max(0.2, 1 - stagger))
      const revealWidth = width * local
      const y = index * stripeHeight
      const nextY = (index + 1) * stripeHeight
      if (index % 2 === 0) {
        paths.push(
          `M ${revealWidth.toFixed(2)} ${y.toFixed(2)}H${width}V${nextY.toFixed(2)}H${revealWidth.toFixed(2)}Z`,
        )
      } else {
        paths.push(`M 0 ${y.toFixed(2)}H${(width - revealWidth).toFixed(2)}V${nextY.toFixed(2)}H0Z`)
      }
    }
  } else if (kind === 'venetianBlind') {
    const stripeCount = 10
    const stripeHeight = height / stripeCount
    for (let index = 0; index < stripeCount; index += 1) {
      const y = index * stripeHeight
      const remainingHeight = stripeHeight * (1 - p)
      paths.push(`M 0 ${y.toFixed(2)}H${width}V${(y + remainingHeight).toFixed(2)}H0Z`)
    }
  } else if (kind === 'center') {
    const sideWidth = (width / 2) * (1 - p)
    paths.push(`M0 0H${sideWidth.toFixed(2)}V${height}H0Z`)
    paths.push(
      `M${(width - sideWidth).toFixed(2)} 0H${width}V${height}H${(width - sideWidth).toFixed(2)}Z`,
    )
  } else if (kind === 'edge') {
    switch (direction) {
      case 'from-left':
        paths.push(`M${(width * p).toFixed(2)} 0H${width}V${height}H${(width * p).toFixed(2)}Z`)
        break
      case 'from-right':
        paths.push(`M0 0H${(width * (1 - p)).toFixed(2)}V${height}H0Z`)
        break
      case 'from-bottom':
        paths.push(`M0 0H${width}V${(height * (1 - p)).toFixed(2)}H0Z`)
        break
      case 'from-top':
      default:
        paths.push(`M0 ${(height * p).toFixed(2)}H${width}V${height}H0Z`)
        break
    }
  } else if (kind === 'radial') {
    paths.push(createRadialFanPath(width, height, p))
  } else if (kind === 'spiral') {
    const strokeWidth = getSpiralStrokeWidth(width, height, p)
    const polyline = createSpiralPolyline(width, height)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><mask id="m" maskUnits="userSpaceOnUse"><rect width="${width}" height="${height}" fill="white"/><polyline points="${polyline}" fill="none" stroke="black" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="${width}" height="${height}" fill="white" mask="url(#m)"/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  } else {
    // x wipe
    const strokeWidth = getXStrokeWidth(width, height, p)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><mask id="m" maskUnits="userSpaceOnUse"><rect width="${width}" height="${height}" fill="white"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" fill="none" stroke="black" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="butt"/></mask></defs><rect width="${width}" height="${height}" fill="white" mask="url(#m)"/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }

  const fillRule = kind === 'radial' ? ' fill-rule="evenodd"' : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="white"${fillRule} d="${paths.join(' ')}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** 添加扇形擦除路径到 Path2D */
function addRadialFanPath(path: Path2D, width: number, height: number, progress: number): void {
  const p = clamp01(progress)
  if (p <= 0) {
    path.rect(0, 0, width, height)
    return
  }
  if (p >= 1) return

  const cx = width / 2
  const cy = height / 2
  const radius = Math.sqrt(width * width + height * height)
  const segmentCount = 4
  const segmentAngle = (Math.PI * 2) / segmentCount

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentStart = -Math.PI / 2 + index * segmentAngle
    const startAngle = segmentStart + p * segmentAngle
    const endAngle = segmentStart + segmentAngle
    const start = polarPoint(cx, cy, radius, startAngle)
    path.moveTo(cx, cy)
    path.lineTo(start.x, start.y)
    path.arc(cx, cy, radius, startAngle, endAngle)
    path.closePath()
  }
}

/** 绘制螺旋擦除 */
function drawSpiralCutout(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
): void {
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.sqrt(width * width + height * height) * 0.58
  const turns = 3.8
  const steps = 220

  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = getSpiralStrokeWidth(width, height, progress)
  ctx.beginPath()
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const angle = t * Math.PI * 2 * turns
    const radius = maxRadius * t
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
  ctx.restore()
}

/** 绘制 X 形擦除 */
function drawXCutout(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineCap = 'butt'
  ctx.lineWidth = getXStrokeWidth(width, height, progress)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(width, height)
  ctx.moveTo(width, 0)
  ctx.lineTo(0, height)
  ctx.stroke()
  ctx.restore()
}

/** 添加 outgoing mask 路径到 Path2D */
function addOutgoingMaskPath(
  path: Path2D,
  kind: WipeMask,
  width: number,
  height: number,
  progress: number,
  direction: WipeDirection = 'from-top',
): CanvasFillRule | undefined {
  const p = clamp01(progress)

  if (kind === 'band') {
    const stripeCount = 10
    const stripeHeight = height / stripeCount
    for (let index = 0; index < stripeCount; index += 1) {
      const stagger = (index % 2) * 0.18
      const local = clamp01((p - stagger) / Math.max(0.2, 1 - stagger))
      const revealWidth = width * local
      if (index % 2 === 0) {
        path.rect(revealWidth, index * stripeHeight, width - revealWidth, stripeHeight)
      } else {
        path.rect(0, index * stripeHeight, width - revealWidth, stripeHeight)
      }
    }
    return undefined
  }

  if (kind === 'venetianBlind') {
    const stripeCount = 10
    const stripeHeight = height / stripeCount
    for (let index = 0; index < stripeCount; index += 1) {
      const y = index * stripeHeight
      path.rect(0, y, width, stripeHeight * (1 - p))
    }
    return undefined
  }

  if (kind === 'center') {
    const sideWidth = (width / 2) * (1 - p)
    path.rect(0, 0, sideWidth, height)
    path.rect(width - sideWidth, 0, sideWidth, height)
    return undefined
  }

  if (kind === 'edge') {
    switch (direction) {
      case 'from-left':
        path.rect(width * p, 0, width * (1 - p), height)
        break
      case 'from-right':
        path.rect(0, 0, width * (1 - p), height)
        break
      case 'from-bottom':
        path.rect(0, 0, width, height * (1 - p))
        break
      case 'from-top':
      default:
        path.rect(0, height * p, width, height * (1 - p))
        break
    }
    return undefined
  }

  if (kind === 'radial') {
    addRadialFanPath(path, width, height, p)
    return undefined
  }

  if (kind === 'spiral') return undefined

  // x wipe - 四个角的三角形
  const insetX = (width / 2) * p
  const insetY = (height / 2) * p
  path.moveTo(0, 0)
  path.lineTo(insetX, 0)
  path.lineTo(0, insetY)
  path.closePath()
  path.moveTo(width, 0)
  path.lineTo(width - insetX, 0)
  path.lineTo(width, insetY)
  path.closePath()
  path.moveTo(0, height)
  path.lineTo(insetX, height)
  path.lineTo(0, height - insetY)
  path.closePath()
  path.moveTo(width, height)
  path.lineTo(width - insetX, height)
  path.lineTo(width, height - insetY)
  path.closePath()
  return undefined
}

/** 创建 Wipe Mask 渲染器 */
function createWipeMaskRenderer(kind: WipeMask): TransitionRenderer {
  let scratchCanvas: OffscreenCanvas | null = null
  let scratchCtx: OffscreenCanvasRenderingContext2D | null = null

  function getScratchContext(
    width: number,
    height: number,
  ): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null {
    if (!scratchCanvas || scratchCanvas.width !== width || scratchCanvas.height !== height) {
      scratchCanvas = new OffscreenCanvas(width, height)
      scratchCtx = scratchCanvas.getContext('2d')
    }
    if (!scratchCtx) return null
    scratchCtx.clearRect(0, 0, width, height)
    return { canvas: scratchCanvas, ctx: scratchCtx }
  }

  return {
    calculateStyles(
      progress,
      isOutgoing,
      canvasWidth,
      canvasHeight,
      direction,
    ): TransitionStyleCalculation {
      const p = clamp01(progress)
      const dir = (direction as WipeDirection) || 'from-top'

      if (isOutgoing) {
        if (p <= 0) {
          return { opacity: 1 }
        }
        if (p >= 1) {
          return { opacity: 0 }
        }

        const maskImage = createOutgoingMaskSvg(kind, canvasWidth, canvasHeight, p, dir)
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
    renderCanvas(ctx, leftCanvas, rightCanvas, progress, direction, canvas) {
      const p = clamp01(progress)
      const dir = (direction as WipeDirection) || 'from-top'
      const w = canvas?.width ?? leftCanvas.width
      const h = canvas?.height ?? leftCanvas.height

      // 先绘制 incoming clip（背景）
      ctx.drawImage(rightCanvas, 0, 0, w, h)

      // 螺旋擦除需要特殊处理（使用 destination-out）
      if (kind === 'spiral') {
        const scratch = getScratchContext(w, h)
        if (!scratch) {
          return
        }

        scratch.ctx.drawImage(leftCanvas, 0, 0, w, h)
        drawSpiralCutout(scratch.ctx, w, h, p)
        ctx.drawImage(scratch.canvas, 0, 0)
        return
      }

      // X 形擦除也需要特殊处理
      if (kind === 'x') {
        const scratch = getScratchContext(w, h)
        if (!scratch) {
          return
        }

        scratch.ctx.drawImage(leftCanvas, 0, 0, w, h)
        drawXCutout(scratch.ctx, w, h, p)
        ctx.drawImage(scratch.canvas, 0, 0)
        return
      }

      // 其他类型使用 Path2D clip
      ctx.save()
      const clipPath = new Path2D()
      const fillRule = addOutgoingMaskPath(clipPath, kind, w, h, p, dir)
      if (fillRule) {
        ctx.clip(clipPath, fillRule)
      } else {
        ctx.clip(clipPath)
      }
      ctx.drawImage(leftCanvas, 0, 0, w, h)
      ctx.restore()
    },
  }
}

/** Wipe 变体定义 */
const WIPE_VARIANTS: WipeVariant[] = [
  {
    id: 'bandWipe',
    label: 'Band Wipe',
    description: '交替条纹擦除',
    icon: 'Rows3',
    mask: 'band',
  },
  {
    id: 'centerWipe',
    label: 'Center Wipe',
    description: '中心展开擦除',
    icon: 'Columns2',
    mask: 'center',
  },
  {
    id: 'edgeWipe',
    label: 'Edge Wipe',
    description: '单边擦除',
    icon: 'PanelTopOpen',
    mask: 'edge',
  },
  {
    id: 'radialWipe',
    label: 'Radial Wipe',
    description: '扇形擦除',
    icon: 'Asterisk',
    mask: 'radial',
  },
  {
    id: 'spiralWipe',
    label: 'Spiral Wipe',
    description: '螺旋擦除',
    icon: 'RotateCw',
    mask: 'spiral',
  },
  {
    id: 'venetianBlindWipe',
    label: 'Venetian Blind Wipe',
    description: '百叶窗擦除',
    icon: 'Rows4',
    mask: 'venetianBlind',
  },
  {
    id: 'xWipe',
    label: 'X Wipe',
    description: 'X 形擦除',
    icon: 'X',
    mask: 'x',
  },
]

/** 创建 Wipe 定义 */
function createWipeDefinition(variant: WipeVariant): CanvasTransitionDefinition {
  const hasDirection = variant.id === 'edgeWipe'
  return {
    id: variant.id,
    label: variant.label,
    description: variant.description,
    category: 'wipe',
    icon: variant.icon,
    hasDirection,
    directions: hasDirection ? ALL_DIRECTIONS : undefined,
    supportedTimings: [...ALL_TIMINGS],
    defaultDuration: 30,
    minDuration: 5,
    maxDuration: 90,
  }
}

/** 注册所有 Wipe 转场 */
export function registerWipeTransitions(registry: TransitionRegistry): void {
  for (const variant of WIPE_VARIANTS) {
    registry.register(
      variant.id,
      createWipeDefinition(variant),
      createWipeMaskRenderer(variant.mask),
    )
  }
}

/** 获取所有 Wipe 变体定义（用于 UI） */
export function getWipeDefinitions(): CanvasTransitionDefinition[] {
  return WIPE_VARIANTS.map(createWipeDefinition)
}