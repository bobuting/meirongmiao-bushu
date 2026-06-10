/**
 * svg.ts — SVG 渲染工具函数
 * 提取渐变和 filter 的预设模板，减少重复代码
 */

import React from "react";

// ================================================================
// 渐变方向预设
// ================================================================

export type GradientDirection =
  | "horizontal"       // 左→右 (x1=0%, x2=100%)
  | "vertical"         // 上→下 (y1=0%, y2=100%)
  | "diagonal"         // 左上→右下 (x1=0%,y1=0%, x2=100%,y2=100%)
  | "diagonal_reverse" // 右上→左下
  | "vertical_reverse" // 下→上 (y1=100%, y2=0%)
  | "horizontal_center" // 左→中 (x1=0%, x2=50%, y2=100%)
  | "center_vertical"; // 中→下 (x1=50%, x2=50%)

/** 渐变方向坐标映射 */
const GRADIENT_COORDS: Record<GradientDirection, { x1: string; y1: string; x2: string; y2: string }> = {
  horizontal: { x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
  vertical: { x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
  diagonal: { x1: "0%", y1: "0%", x2: "100%", y2: "100%" },
  diagonal_reverse: { x1: "100%", y1: "0%", x2: "0%", y2: "100%" },
  vertical_reverse: { x1: "0%", y1: "100%", x2: "0%", y2: "0%" },
  horizontal_center: { x1: "0%", y1: "0%", x2: "50%", y2: "100%" },
  center_vertical: { x1: "50%", y1: "0%", x2: "50%", y2: "100%" },
};

/**
 * 创建线性渐变 JSX 元素
 * @param id - 渐变唯一 ID（需加 uid 后缀）
 * @param direction - 渐变方向预设
 * @param stops - 颜色停靠点数组 [{ offset, color }]
 */
export function createLinearGradient(
  id: string,
  direction: GradientDirection,
  stops: Array<{ offset: string; color: string }>
): React.ReactNode {
  const coords = GRADIENT_COORDS[direction];
  return (
    <linearGradient id={id} x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2}>
      {stops.map((stop, i) => (
        <stop key={i} offset={stop.offset} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
}

/**
 * 创建径向渐变 JSX 元素
 * @param id - 渐变唯一 ID
 * @param stops - 颜色停靠点数组
 * @param cx/cy/r - 中心点和半径（默认居中）
 */
export function createRadialGradient(
  id: string,
  stops: Array<{ offset: string; color: string; opacity?: number }>,
  cx: string = "50%",
  cy: string = "50%",
  r: string = "50%"
): React.ReactNode {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r={r}>
      {stops.map((stop, i) => (
        <stop
          key={i}
          offset={stop.offset}
          stopColor={stop.color}
          stopOpacity={stop.opacity ?? 1}
        />
      ))}
    </radialGradient>
  );
}

// ================================================================
// SVG Filter 预设
// ================================================================

export type FilterPreset =
  | "glow"           // 发光效果（feGaussianBlur）
  | "glow-strong"    // 强发光（更大模糊）
  | "shadow"         // 阴影效果（feDropShadow）
  | "blur"           // 纯模糊
  | "neon";          // neon 效果（blur + merge sourceGraphic）

/**
 * 创建 SVG filter JSX 元素
 * @param id - filter 唯一 ID
 * @param preset - 预设类型
 * @param params - 动态参数（stdDeviation、颜色等）
 */
export function createFilter(
  id: string,
  preset: FilterPreset,
  params?: {
    stdDeviation?: number;
    shadowColor?: string;
    shadowOpacity?: number;
    dx?: number;
    dy?: number;
  }
): React.ReactNode {
  const stdDev = params?.stdDeviation ?? 2;
  const shadowColor = params?.shadowColor ?? "#000000";
  const shadowOpacity = params?.shadowOpacity ?? 0.25;

  switch (preset) {
    case "glow":
      return (
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={stdDev} />
        </filter>
      );

    case "glow-strong":
      return (
        <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={stdDev} result="blur" />
        </filter>
      );

    case "shadow":
      return (
        <filter id={id} x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow
            dx={params?.dx ?? 1.5}
            dy={params?.dy ?? 2}
            stdDeviation={stdDev}
            floodColor={shadowColor}
            floodOpacity={shadowOpacity}
          />
        </filter>
      );

    case "blur":
      return (
        <filter id={id}>
          <feGaussianBlur stdDeviation={stdDev} />
        </filter>
      );

    case "neon":
      return (
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={stdDev} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      );

    default:
      return null;
  }
}

// ================================================================
// 常用渐变预设（固定颜色，直接使用）
// ================================================================

/** 创建火焰渐变（红→橙→黄） */
export function createFireGradient(id: string): React.ReactNode {
  return createLinearGradient(id, "vertical_reverse", [
    { offset: "0%", color: "#FF4500" },
    { offset: "40%", color: "#FF8C00" },
    { offset: "100%", color: "#FFD700" },
  ]);
}

/** 创建冰晶渐变（蓝→白） */
export function createIceGradient(id: string): React.ReactNode {
  return createLinearGradient(id, "vertical_reverse", [
    { offset: "0%", color: "#87CEEB" },
    { offset: "100%", color: "#FFFFFF" },
  ]);
}

/** 创建水滴渐变（深蓝→浅蓝） */
export function createWaterGradient(id: string): React.ReactNode {
  return createLinearGradient(id, "diagonal", [
    { offset: "0%", color: "#4169E1" },
    { offset: "100%", color: "#87CEEB" },
  ]);
}

/** 创建金色渐变（金→白→金） */
export function createGoldGradient(id: string): React.ReactNode {
  return createLinearGradient(id, "diagonal", [
    { offset: "0%", color: "#FFD700" },
    { offset: "30%", color: "#FFF8DC" },
    { offset: "60%", color: "#FFD700" },
    { offset: "80%", color: "#FFA500" },
    { offset: "100%", color: "#B8860B" },
  ]);
}