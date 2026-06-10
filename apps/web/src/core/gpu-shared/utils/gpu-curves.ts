/**
 * GPU Curves 参数工具
 * 用于 color.ts 中的 curves 效果定义
 */

/** 曲线通道 */
export const GPU_CURVES_CHANNELS = ['master', 'red', 'green', 'blue'] as const;
export type GpuCurvesChannel = typeof GPU_CURVES_CHANNELS[number];

/** 曲线控制点（带 x, y 坐标） */
export interface GpuCurvesControlPoint {
  x: number;
  y: number;
}

/** 通道控制值（shadow 和 highlight 控制点） */
export interface GpuCurvesChannelControl {
  shadow: GpuCurvesControlPoint;
  highlight: GpuCurvesControlPoint;
}

/** 获取默认通道控制值 */
export function getDefaultGpuCurvesChannelControl(): GpuCurvesChannelControl {
  return {
    shadow: { x: 0.15, y: 0.15 },
    highlight: { x: 0.85, y: 0.85 },
  };
}

/** 通道参数 keys 对象 */
export interface GpuCurvesChannelParamKeys {
  shadowX: string;
  shadowY: string;
  highlightX: string;
  highlightY: string;
}

/** 获取通道参数 key 对象 */
export function getGpuCurvesChannelParamKeys(channel: GpuCurvesChannel): GpuCurvesChannelParamKeys {
  return {
    shadowX: `${channel}ShadowX`,
    shadowY: `${channel}ShadowY`,
    highlightX: `${channel}HighlightX`,
    highlightY: `${channel}HighlightY`,
  };
}

/** 读取通道控制值 */
export function readGpuCurvesChannelControl(
  params: Record<string, number>,
  channel: GpuCurvesChannel,
): GpuCurvesChannelControl {
  const defaults = getDefaultGpuCurvesChannelControl();
  const keys = getGpuCurvesChannelParamKeys(channel);
  return {
    shadow: {
      x: params[keys.shadowX] ?? defaults.shadow.x,
      y: params[keys.shadowY] ?? defaults.shadow.y,
    },
    highlight: {
      x: params[keys.highlightX] ?? defaults.highlight.x,
      y: params[keys.highlightY] ?? defaults.highlight.y,
    },
  };
}