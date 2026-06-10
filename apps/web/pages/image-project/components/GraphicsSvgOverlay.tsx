/**
 * GraphicsSvgOverlay.tsx - SVG 图形层叠加组件（可交互编辑版）
 * 支持拖拽、调整大小、删除、参数编辑
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type {
  GraphicsLayout,
  GraphicsElement,
  GraphicsLayerElement,
  ArtTextElement,
  ArtTextCurve,
  OverlayTextElement,
} from "../../../../../src/contracts/types";
import { GraphicsSelector } from "./GraphicsSelector";
import {
  getGraphicColors,
  getDefaultGraphicOpacity,
  STROKE_RATIO,
  FONT_RATIO,
  SHADOW_RATIO,
  ART_TEXT_RATIO,
} from "./graphics-theme";
import { colorWithAlpha, hexWithAlpha } from "./utils/color";
import { safeRotation, safeScale, safeCoord, safeDimension, safeAspectRatio, safeParseInt, clamp } from "./utils/numeric";
import { isValidImageUrl } from "./utils/url";
import {
  createLinearGradient,
  createRadialGradient,
  createFilter,
  createFireGradient,
  createIceGradient,
  createWaterGradient,
  createGoldGradient,
} from "./utils/svg";

/**
 * 统一渲染参数计算（SVG 和 Canvas 视觉一致）
 * 所有参数基于元素尺寸比例，而非容器尺寸
 */

/** 计算 strokeWidth（基于元素宽度 w）
 *  thickness: "thin" | "normal" | "thick" | "bold" | "extraBold"
 */
function getStrokeWidth(w: number, thickness: keyof typeof STROKE_RATIO = "normal"): number {
  return Math.max(0.5, w * STROKE_RATIO[thickness]);
}

/** 计算 fontSize（基于元素高度 h） */
function getFontSizeByHeight(h: number, size: keyof typeof FONT_RATIO = "normal"): number {
  return clamp(h * FONT_RATIO[size], 12, 120);
}

/** 计算阴影 blur（基于元素尺寸） */
function getShadowBlurBySize(w: number, h: number): number {
  return Math.max(1, Math.min(w, h) * SHADOW_RATIO.blur);
}

/** 计算艺术字 strokeWidth（基于 fontSize） */
function getArtTextStrokeWidth(fontSize: number, type: keyof typeof ART_TEXT_RATIO["strokeWidth"]): number {
  return Math.max(0.5, fontSize * ART_TEXT_RATIO.strokeWidth[type]);
}

// 图形类型中文名称映射
const GRAPHIC_TYPE_NAMES: Record<string, string> = {
  // 面料
  air_flow: "气流线条",
  elastic_arrow: "弹性箭头",
  quality_stamp: "品质印章",
  silhouette_line: "轮廓线条",
  soft_curve: "柔软曲线",
  stitch_mark: "针脚标注",
  scene_icon: "场景图标",
  size_frame: "尺码框线",
  // 标注
  arrow_callout: "箭头标注",
  highlight_spot: "聚焦高亮",
  crosshair_mark: "十字准星",
  circle_callout: "圆形标注",
  magnifier: "放大镜",
  // 标签
  sale_ribbon: "促销角标",
  price_tag: "价格标签",
  tag_label: "标签贴",
  number_badge: "数字徽章",
  hot_mark: "热卖标记",
  star_rating: "星级评分",
  // 装饰
  dot_pattern: "圆点装饰",
  wave_line: "波浪线",
  geometric_shape: "几何图形",
  light_glow: "光晕效果",
  sparkle: "闪光装饰",
  // 版式装饰
  divider_line: "分割线",
  corner_ornament: "角落装饰",
  quote_mark: "引号装饰",
  border_frame: "边框",
  decorative_icon: "装饰图标",
  // 氛围装饰（精致）
  feather: "小羽毛",
  pen_tip: "小笔尖",
  butterfly: "小蝴蝶",
  heart_icon: "小爱心",
  leaf_decor: "小树叶",
  sparkle_star: "星光点缀",
  ribbon_decor: "丝带装饰",
  flower_decor: "小花朵",
  music_note: "音符装饰",
  crown_decor: "小皇冠",
  // 功能
  waterproof_shield: "防水盾牌",
  uv_protection: "防晒标识",
  eco_leaf: "环保标识",
  thermo_icon: "保暖标识",
  // 测量
  measure_line: "测量线",
  compare_frame: "对比框",
  check_mark: "勾选标记",
};

interface GraphicsSvgOverlayProps {
  graphicsLayout: GraphicsLayout;
  /** 容器宽度（px） */
  width: number;
  /** 容器高度（px） */
  height: number;
  /** 编辑模式（可交互） */
  editMode?: boolean;
  /** 元素变更回调 */
  onChange?: (elements: GraphicsLayerElement[]) => void;
  /** 元素选中回调（点击图形时触发，传递索引） */
  onSelect?: (index: number | null) => void;
  /** 当前选中的元素索引（用于高亮显示） */
  selectedIndex?: number | null;
  /** 非编辑模式下点击图形时，请求进入编辑模式（传递索引以便一次性选中） */
  onRequestEditMode?: (index: number) => void;
  /** 点击空白区域（非图形元素）时的回调 */
  onBackgroundClick?: () => void;
}

/** 判断是否为艺术字元素 */
function isArtTextElement(el: GraphicsLayerElement): el is ArtTextElement {
  return el.type === "art_text";
}

/** 判断是否为普通文字叠加元素 */
function isOverlayTextElement(el: GraphicsLayerElement): el is OverlayTextElement {
  return el.type === "overlay_text";
}

/** 单个图形元素（可拖拽） */
const GraphicsElementEditable = React.memo(function GraphicsElementEditable({
  el,
  uid,
  index,
  containerW,
  containerH,
  editMode,
  isSelected,
  onDragStart,
  onDelete,
  onResize,
  onSelect,
  onRequestEditMode,
}: {
  el: GraphicsLayerElement;
  uid: string;
  index: number;
  containerW: number;
  containerH: number;
  editMode: boolean;
  isSelected: boolean;
  onDragStart: (e: React.PointerEvent, uid: string) => void;
  onDelete: (uid: string) => void;
  onResize: (uid: string, corner: string, e: React.PointerEvent) => void;
  onSelect: (index: number) => void;
  onRequestEditMode?: (index: number) => void;
}) {
  // 数值安全检查：使用 utils/numeric.ts 工具函数
  const rawW = safeDimension(el.width);
  const rawH = safeDimension(el.height);

  // 特定元素类型的尺寸修正保护（强制修正 LLM 生成的不合理参数）
  let correctedW = rawW;
  let correctedH = rawH;
  if (el.type === "corner_ornament") {
    // corner_ornament 必须≥0.90 才能覆盖四角（这是覆盖范围参数）
    correctedW = Math.max(0.90, rawW);
    correctedH = Math.max(0.90, rawH);
  } else if (el.type === "quote_mark") {
    // quote_mark 必须≥0.12 才能清晰可见引号
    correctedW = Math.max(0.12, rawW);
    correctedH = Math.max(0.12, rawH);
  }

  // 元素类型判定（提前到 autoSize 之前）
  const isArtText = isArtTextElement(el);
  const isOverlayText = isOverlayTextElement(el);

  // autoSize：overlay_text 由前端根据实际文字渲染计算 width/height
  const autoSizeResult = useMemo(() => {
    if (!isOverlayText || !(el as OverlayTextElement).autoSize) return null;
    const textEl = el as OverlayTextElement;
    const text = textEl.content ?? "";
    if (!text) return null;

    const fontSizePx = clamp((textEl.fontSize ?? 0.6) * containerH, 16, 36);
    const fontFamily = textEl.fontFamily === "yahei" ? '"Microsoft YaHei", sans-serif'
      : textEl.fontFamily === "helvetica" ? '"Helvetica Neue", sans-serif'
      : '"SimHei", sans-serif';
    const fontWeight = textEl.fontWeight ?? "bold";
    const letterSpacing = textEl.letterSpacing ?? 2;

    // 用 Canvas measureText 测量实际文字像素宽度
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
    const measured = ctx.measureText(text);
    const textWidthPx = measured.width + letterSpacing * text.length;

    const paddingPx = 12;
    const wPx = textWidthPx + paddingPx * 2;
    const hPx = fontSizePx * 1.4 + paddingPx * 2;

    return { w: wPx, h: hPx };
  }, [el, isOverlayText, containerH]);

  // 锚点位置 + autoSize 选框偏移
  let anchorX = safeCoord(el.x) * containerW;
  let anchorY = safeCoord(el.y) * containerH;

  let w: number;
  let h: number;
  if (autoSizeResult) {
    w = autoSizeResult.w;
    h = autoSizeResult.h;
    // autoSize 时 x 是文字对齐锚点，需根据 align 调整选框 x
    const align = (el as OverlayTextElement).align ?? "center";
    if (align === "center") {
      anchorX = anchorX - w / 2;
    } else if (align === "right") {
      anchorX = anchorX - w;
    }
    // left: anchorX 不变
  } else {
    w = correctedW * containerW;
    h = correctedH * containerH;
  }

  const x = anchorX;
  const y = anchorY;

  // 计算 scale：基于基准尺寸 540px，使 strokeWidth 随容器尺寸缩放
  // 防止容器尺寸过小时线条不可见，设置最小 scale
  const BASE_CONTAINER_WIDTH = 540;
  const scale = safeScale(containerW / BASE_CONTAINER_WIDTH);

  // 颜色解析：统一使用 graphics-theme.ts 的颜色定义
  const isTextElement = isArtText || isOverlayText;
  const themeColors = isTextElement ? null : getGraphicColors(el.type as GraphicsElement["type"]);
  // 艺术字默认白色 + 金色高光，overlay_text 默认深灰，图形元素使用主题色
  const artTextDefaults = { primary: "#FFFFFF", secondary: "#FFD93D" };
  const overlayTextDefaults = { primary: "#1E293B", secondary: "#64748B" };
  const textDefaults = isArtText ? artTextDefaults : overlayTextDefaults;
  const primaryColor = themeColors?.primary ?? textDefaults.primary;
  const secondaryThemeColor = themeColors?.secondary ?? textDefaults.secondary;
  const color = (!el.color || el.color.trim() === "") ? primaryColor : el.color;
  // secondaryColor 只在 art_text 和 GraphicsElement 中存在
  const secondaryColor = isArtText ? (el as ArtTextElement).secondaryColor ?? secondaryThemeColor
    : isOverlayText ? secondaryThemeColor
    : (el as GraphicsElement).secondaryColor ?? secondaryThemeColor;
  // 阴影色和发光色：使用 colorWithAlpha 安全处理非 hex 颜色
  const shadowColor = themeColors?.shadow ?? colorWithAlpha(color, 0.38);
  const glowColor = themeColors?.glow ?? colorWithAlpha(color, 0.25);
  // 使用 graphics-theme 的透明度逻辑
  const baseOpacity = el.opacity ?? getDefaultGraphicOpacity(isTextElement ? "art_text" : el.type as GraphicsElement["type"]);
  // 特定元素类型的透明度最小值保护：quote_mark 和 corner_ornament 必须≥0.7 才能清晰可见
  const opacity = ["quote_mark", "corner_ornament"].includes(el.type as string)
    ? Math.max(0.7, baseOpacity)
    : baseOpacity;
  // rotation 极值保护：使用 safeRotation 工具函数
  const rotation = safeRotation(el.rotation);
  const transform = rotation !== 0
    ? `rotate(${rotation} ${x + w / 2} ${y + h / 2})`
    : undefined;

  const label = !isTextElement ? (el as GraphicsElement).label ?? "" : "";
  // fontSize 用于图形标签，与 Canvas radius-based 计算对齐
  const fontSize = clamp(Math.min(w, h) * 0.25, 10, 60);

  const ariaLabel = isOverlayText
    ? `叠加文字: ${(el as OverlayTextElement).content ?? ""}`
    : isArtText
      ? `艺术字: ${el.content ?? ""}`
      : `${el.type}${label ? `: ${label}` : ""}`;

  return (
    <g
      opacity={opacity}
      transform={transform}
      role="button"
      aria-label={ariaLabel}
      tabIndex={editMode ? 0 : -1}
      style={{ cursor: editMode ? "move" : "pointer", outline: "none" }}
      onKeyDown={(e) => {
        if (!editMode) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(index);
        } else if (e.key === "Delete" || e.key === "Backspace") {
          if (isSelected) {
            e.preventDefault();
            onDelete(uid);
          }
        }
      }}
      onPointerDown={(e) => {
        if (editMode) {
          onSelect(index);
          onDragStart(e, uid);
        } else {
          onRequestEditMode?.(index);
        }
      }}
    >
      {/* 透明点击热区 */}
      <rect x={x} y={y} width={w} height={h} fill="transparent" />

      {/* 图形主体：overlay_text/艺术字走独立渲染，图形走 switch 渲染 */}
      {isOverlayTextElement(el)
        ? renderOverlayTextSvg(el as OverlayTextElement, x, y, w, h, color, uid)
        : isArtText
          ? renderArtTextSvg(el as ArtTextElement, x, y, w, h, color, secondaryColor, shadowColor, uid)
          : renderSvgGraphic(el.type as GraphicsElement["type"], x, y, w, h, color, secondaryColor, shadowColor, glowColor, label, fontSize, uid, editMode, (el as GraphicsElement).imageUrl)
      }

      {/* 编辑模式下：未选中时显示虚线提示边框 */}
      {editMode && !isSelected && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="none"
          stroke="#0066ff"
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.5}
        />
      )}

      {/* 选中状态：删除按钮 + 调整手柄 + 高亮边框 */}
      {editMode && isSelected && (
        <>
          {/* 删除按钮（右上角）- 触摸目标 44px，可见区域 28px，中心与角落对齐 */}
          <g
            role="button"
            aria-label="删除图形"
            tabIndex={0}
            style={{ cursor: "pointer", outline: "none" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onDelete(uid);
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onDelete(uid);
            }}
          >
            {/* 透明扩展触摸区域 */}
            <circle cx={x + w} cy={y} r={22} fill="transparent" />
            {/* 可见按钮（更深红色提高对比度） */}
            <circle cx={x + w} cy={y} r={14} fill="#cc0000" opacity={0.95} />
            <line x1={x + w - 8} y1={y - 10} x2={x + w + 8} y2={y + 10} stroke="white" strokeWidth={3} />
            <line x1={x + w + 8} y1={y - 10} x2={x + w - 8} y2={y + 10} stroke="white" strokeWidth={3} />
          </g>

          {/* 三角调整手柄 - 触摸目标 44px，可见区域 16px（右上角 ne 位置留给删除按钮） */}
          {[
            { corner: "nw", cx: x, cy: y },
            { corner: "sw", cx: x, cy: y + h },
            { corner: "se", cx: x + w, cy: y + h },
          ].map(({ corner, cx, cy }) => (
            <circle
              key={corner}
              cx={cx}
              cy={cy}
              r={22}
              fill="transparent"
              role="slider"
              aria-label={`调整 ${corner} 角大小`}
              tabIndex={0}
              style={{ cursor: (corner === "nw" || corner === "se") ? "nwse-resize" : "sw-resize", outline: "none" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onResize(uid, corner, e as unknown as React.PointerEvent);
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize(uid, corner, e);
              }}
            />
          ))}
          {/* 可见的调整手柄（右上角 ne 位置留给删除按钮） */}
          {[
            { corner: "nw", cx: x, cy: y },
            { corner: "sw", cx: x, cy: y + h },
            { corner: "se", cx: x + w, cy: y + h },
          ].map(({ corner, cx, cy }) => (
            <circle
              key={`visible-${corner}`}
              cx={cx}
              cy={cy}
              r={8}
              fill="white"
              stroke="#333"
              strokeWidth={1}
              style={{ cursor: (corner === "nw" || corner === "se") ? "nwse-resize" : "sw-resize" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize(uid, corner, e);
              }}
            />
          ))}

          {/* 选中高亮边框 */}
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke="#0066ff"
            strokeWidth={3}
          />
        </>
      )}
    </g>
  );
});

/**
 * 渲染艺术字 SVG
 * 支持 18 种风格 + 弧度控制 + 多行文字
 */
function renderArtTextSvg(
  el: ArtTextElement,
  x: number, y: number, w: number, h: number,
  color: string, secondaryColor: string, shadowColor: string,
  uid: string,
): React.ReactNode {
  const text = el.content ?? "";
  // fontSize 相对于元素高度计算（拖动时文字会跟着缩放）
  const fontSize = el.fontSize ? clamp(el.fontSize * h, 24, 120) : clamp(h * 0.6, 24, 120);
  const fontFamily = el.fontFamily ?? "sans-serif";
  const cx = x + w / 2;
  const cy = y + h / 2;
  const curve = el.curve;

  // 按换行符分割
  const lines = text.split("\n");
  const lineCount = lines.length;
  // 除零保护：确保 h > 0 且除数 >= 1
  const lineSpacing = h > 0 ? h / Math.max(1, lineCount + 1) : 0;

  // 生成弧度路径 ID
  const curvePathId = `curve-${uid}`;

  // 生成弧度路径（如果启用）
  // 弧度偏移量 = 元素高度的 40%（明显的弧度效果）
  // 通过居中修正确保文字不超出选框
  const curveIntensity = curve ? clamp(curve.intensity ?? 0, -5, 5) * h * 0.4 : 0;

  // 渲染单行文字（带弧度）
  const renderTextLine = (lineText: string, lineIndex: number) => {
    const lineY = y + lineSpacing * (lineIndex + 1);
    const lineCy = lineY;

    // 如果有弧度，为每行生成独立路径
    const linePathId = `${curvePathId}-${lineIndex}`;

    const textElement = curve ? (
      <text>
        <textPath href={`#${linePathId}`} startOffset="50%" textAnchor="middle">
          {lineText}
        </textPath>
      </text>
    ) : (
      <text
        x={cx}
        y={lineCy}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {lineText}
      </text>
    );

    // 为每行生成弧度路径
    const lineCurvePath = curve ? (
      <path
        id={linePathId}
        d={generateCurvePath(x, lineCy, w, curve, lineIndex)}
        fill="none"
      />
    ) : null;

    return { textElement, lineCurvePath, lineY };
  };

  // 生成曲线路径字符串
  // 关键：曲线的平均Y位置必须等于 startY，这样文字不会整体偏移
  const generateCurvePath = (startX: number, startY: number, width: number, curveConfig: ArtTextCurve, lineIndex: number) => {
    const intensity = curveConfig.intensity * h * 0.4;
    const direction = curveConfig.direction === "up" ? -1 : 1;
    const offset = lineIndex * intensity * 0.1 * direction;

    if (curveConfig.type === "arc") {
      // 弧形：二次贝塞尔中点偏移 = arcHeight/2，需下移整个路径 arcHeight/2 来居中
      const arcHeight = (intensity + offset) * direction;
      const correction = arcHeight / 2;
      const adjustedStart = startY - correction;
      return `M${startX},${adjustedStart} Q${startX + width / 2},${adjustedStart + arcHeight} ${startX + width},${adjustedStart}`;
    } else if (curveConfig.type === "wave") {
      // 波浪：双峰对称，起始/终止点在均值，无需修正
      const waveHeight = (intensity * 0.5 + offset) * direction;
      return `M${startX},${startY} Q${startX + width * 0.25},${startY + waveHeight} ${startX + width * 0.5},${startY} Q${startX + width * 0.75},${startY - waveHeight} ${startX + width},${startY}`;
    } else {
      // 弓形：三次贝塞尔中点偏移 = bowHeight * 0.75，需下移 bowHeight * 0.375 来居中
      const bowHeight = (intensity * 1.2 + offset) * direction;
      const correction = bowHeight * 0.375;
      const adjustedStart = startY - correction;
      return `M${startX},${adjustedStart} C${startX + width / 2},${adjustedStart + bowHeight} ${startX + width / 2},${adjustedStart + bowHeight} ${startX + width},${adjustedStart}`;
    }
  };

  // 统一渲染多行文字（支持弧度）
  const renderTextWithStyle = (
    styleProps: {
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      filter?: string;
      fontWeight?: string;
      letterSpacing?: number;
      strokeDasharray?: string;
      offsetX?: number;
      offsetY?: number;
    }
  ) => {
    const { offsetX = 0, offsetY = 0 } = styleProps;
    // 过滤掉非 SVG 属性的 offsetX/offsetY
    const svgStyleProps = { ...styleProps };
    delete svgStyleProps.offsetX;
    delete svgStyleProps.offsetY;
    const elements: React.ReactNode[] = [];
    const paths: React.ReactNode[] = [];

    // 添加defs（渐变等）
    elements.push(
      <defs key="defs">
        {createLinearGradient(`atg-${uid}`, "diagonal", [
          { offset: "0%", color: color },
          { offset: "100%", color: secondaryColor },
        ])}
        {createFilter(`neon-${uid}`, "neon", { stdDeviation: Math.max(3, fontSize * 0.08) })}
        {createFilter(`glitter-${uid}`, "blur", { stdDeviation: 1 })}
      </defs>
    );

    lines.forEach((line, idx) => {
      const linePathId = `${curvePathId}-${idx}-${offsetX}-${offsetY}`;
      const lineY = y + lineSpacing * (idx + 1) + offsetY;

      // 生成弧度路径（带偏移）
      if (curve) {
        paths.push(
          <path
            key={`path-${idx}-${offsetX}-${offsetY}`}
            id={linePathId}
            d={generateCurvePath(x + offsetX, lineY, w, curve, idx)}
            fill="none"
          />
        );
      }

      // 渲染文字
      if (curve) {
        elements.push(
          <text key={`text-${idx}-${offsetX}-${offsetY}`} {...svgStyleProps} fontSize={fontSize} fontFamily={fontFamily} dominantBaseline="central">
            <textPath href={`#${linePathId}`} startOffset="50%" textAnchor="middle">
              {line}
            </textPath>
          </text>
        );
      } else {
        elements.push(
          <text
            key={`text-${idx}`}
            x={cx + offsetX}
            y={lineY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontFamily={fontFamily}
            {...svgStyleProps}
          >
            {line}
          </text>
        );
      }
    });

    return [...paths, ...elements];
  };

  switch (el.style) {
    case "outline":
      return (
        <>
          {/* 外层光晕 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: color,
            strokeWidth: Math.max(4, fontSize * 0.1),
            opacity: 0.2,
            fontWeight: "700",
          })}
          {/* 阴影描边 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: shadowColor,
            strokeWidth: Math.max(2.5, fontSize * 0.07),
            fontWeight: "700",
            offsetX: 1,
            offsetY: 1,
          })}
          {/* 主描边 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: color,
            strokeWidth: Math.max(2, fontSize * 0.06),
            fontWeight: "700",
          })}
          {/* 内部高光描边 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: secondaryColor,
            strokeWidth: Math.max(0.5, fontSize * 0.015),
            opacity: 0.4,
            fontWeight: "700",
            offsetX: -0.3,
            offsetY: -0.3,
          })}
        </>
      );

    case "shadow":
      return (
        <>
          {/* 多层阴影（3D 立体效果） */}
          {[4, 3, 2, 1].map((offset) =>
            renderTextWithStyle({
              fill: shadowColor,
              fontWeight: "700",
              offsetX: offset,
              offsetY: offset,
            })
          )}
          {/* 主文字 */}
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
          })}
          {/* 顶部高光 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: secondaryColor,
            strokeWidth: Math.max(0.3, fontSize * 0.008),
            opacity: 0.25,
            fontWeight: "700",
            offsetX: -0.2,
            offsetY: -0.2,
          })}
        </>
      );

    case "gradient":
      return (
        <>
          {/* 阴影 */}
          {renderTextWithStyle({
            fill: shadowColor,
            fontWeight: "700",
            offsetX: 1.5,
            offsetY: 1.5,
          })}
          {/* 渐变主体 */}
          {renderTextWithStyle({
            fill: `url(#atg-${uid})`,
            fontWeight: "700",
          })}
          {/* 高光层 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: secondaryColor,
            strokeWidth: Math.max(0.3, fontSize * 0.01),
            opacity: 0.2,
            fontWeight: "700",
            offsetX: -0.3,
            offsetY: -0.3,
          })}
        </>
      );

    case "neon":
      return (
        <>
          {/* 外层发光 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: color,
            strokeWidth: Math.max(4, fontSize * 0.08),
            filter: `url(#neon-${uid})`,
            opacity: 0.4,
            fontWeight: "700",
          })}
          {/* 中层发光 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: color,
            strokeWidth: Math.max(2, fontSize * 0.04),
            filter: `url(#neon-${uid})`,
            opacity: 0.7,
            fontWeight: "700",
          })}
          {/* 半透明填充 */}
          {renderTextWithStyle({
            fill: color,
            opacity: 0.8,
            fontWeight: "700",
          })}
          {/* 中心高光 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: secondaryColor,
            strokeWidth: Math.max(0.3, fontSize * 0.01),
            opacity: 0.3,
            fontWeight: "700",
            offsetX: -0.2,
            offsetY: -0.2,
          })}
        </>
      );

    case "neon_pulse":
      return (
        <>
          {/* 外发光脉冲 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: color,
            strokeWidth: Math.max(3, fontSize * 0.06),
            opacity: 0.4,
            fontWeight: "700",
          })}
          {/* 主文字 */}
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
            opacity: 0.95,
          })}
        </>
      );

    case "stamp":
      return (
        <>
          {/* 印章阴影 */}
          <rect x={x + w * 0.05 + 1.5} y={y + h * 0.1 + 2} width={w * 0.9} height={h * 0.8} rx={4}
            fill="none" stroke={shadowColor} strokeWidth={Math.max(2, fontSize * 0.05)} />
          {/* 印章框 */}
          <rect x={x + w * 0.05} y={y + h * 0.1} width={w * 0.9} height={h * 0.8} rx={4}
            fill="none" stroke={color} strokeWidth={Math.max(2.5, fontSize * 0.06)} />
          {/* 内框高光 */}
          <rect x={x + w * 0.08} y={y + h * 0.13} width={w * 0.84} height={h * 0.74} rx={2}
            fill="none" stroke={secondaryColor} strokeWidth={0.8} opacity={0.3} />
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
            letterSpacing: Math.max(1, fontSize * 0.05),
          })}
        </>
      );

    case "retro_stamp":
      return (
        <>
          {/* 粗框 */}
          <rect
            x={x + w * 0.02}
            y={y + h * 0.05}
            width={w * 0.96}
            height={h * 0.9}
            rx={6}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(4, fontSize * 0.08)}
          />
          {renderTextWithStyle({
            fill: color,
            fontWeight: "900",
          })}
        </>
      );

    case "handwrite":
      return (
        <>
          {renderTextWithStyle({
            fill: "none",
            stroke: color,
            strokeWidth: Math.max(1, fontSize * 0.03),
            strokeDasharray: `${fontSize * 0.15} ${fontSize * 0.05}`,
            fontWeight: "400",
          })}
          {renderTextWithStyle({
            fill: color,
            opacity: 0.85,
            fontWeight: "400",
          })}
        </>
      );

    case "graffiti_tag":
      return (
        <>
          {/* 喷漆点 */}
          <circle cx={x + w * 0.15} cy={y + h * 0.1} r={fontSize * 0.08} fill={color} opacity={0.6} />
          <circle cx={x + w * 0.85} cy={y + h * 0.12} r={fontSize * 0.06} fill={color} opacity={0.4} />
          {renderTextWithStyle({
            fill: color,
            fontWeight: "800",
            opacity: 0.9,
          })}
        </>
      );

    case "metallic_3d":
      return (
        <>
          {/* 金属阴影 */}
          {lines.map((line, idx) => {
            const lineY = y + lineSpacing * (idx + 1);
            return [4, 3, 2].map((offset) => (
              <text
                key={`metal-${idx}-${offset}`}
                x={cx + offset * 0.5}
                y={lineY + offset}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fontSize}
                fontFamily={fontFamily}
                fontWeight="700"
                fill={shadowColor}
              >
                {line}
              </text>
            ));
          })}
          {/* 金属渐变主文字 */}
          {renderTextWithStyle({
            fill: `url(#atg-${uid})`,
            fontWeight: "700",
          })}
        </>
      );

    case "glitter_spark":
      return (
        <>
          {/* 星光装饰点 */}
          {[0.15, 0.35, 0.65, 0.85].map((fx, i) => (
            <circle
              key={`spark-${i}`}
              cx={x + w * fx}
              cy={y + h * (0.1 + i * 0.08)}
              r={fontSize * (0.06 + i * 0.02)}
              fill={color}
              opacity={0.5 + i * 0.1}
            />
          ))}
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
            filter: `url(#glitter-${uid})`,
          })}
        </>
      );

    case "fire_burn":
      return (
        <>
          {/* 火焰渐变 + 发光 */}
          <defs>
            {createFireGradient(`fire-${uid}`)}
            {createFilter(`fire-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 外层火焰光晕 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: "#FF4500",
            strokeWidth: Math.max(4, fontSize * 0.08),
            opacity: 0.25,
            fontWeight: "700",
            filter: `url(#fire-glow-${uid})`,
          })}
          {/* 火焰阴影 */}
          {renderTextWithStyle({
            fill: shadowColor,
            fontWeight: "700",
            offsetX: 1,
            offsetY: 1.5,
          })}
          {/* 主文字 */}
          {renderTextWithStyle({
            fill: `url(#fire-${uid})`,
            fontWeight: "700",
          })}
          {/* 火焰边缘光晕 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: "#FF4500",
            strokeWidth: Math.max(1, fontSize * 0.02),
            opacity: 0.5,
            fontWeight: "700",
          })}
          {/* 顶部高光 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: "#FFD700",
            strokeWidth: Math.max(0.3, fontSize * 0.008),
            opacity: 0.35,
            fontWeight: "700",
            offsetX: -0.2,
            offsetY: -0.3,
          })}
        </>
      );

    case "ice_crystal":
      return (
        <>
          <defs>
            {createIceGradient(`ice-${uid}`)}
          </defs>
          {/* 冰晶光晕 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: "#87CEEB",
            strokeWidth: Math.max(2, fontSize * 0.05),
            opacity: 0.6,
            fontWeight: "700",
          })}
          {renderTextWithStyle({
            fill: `url(#ice-${uid})`,
            fontWeight: "700",
          })}
        </>
      );

    case "water_drop":
      return (
        <>
          <defs>
            {createWaterGradient(`water-${uid}`)}
          </defs>
          {renderTextWithStyle({
            fill: `url(#water-${uid})`,
            fontWeight: "700",
            opacity: 0.85,
          })}
        </>
      );

    case "electric_arc":
      return (
        <>
          {/* 电弧线条装饰 */}
          <polyline
            points={`${x + w * 0.1},${y + h * 0.1} ${x + w * 0.3},${y + h * 0.3} ${x + w * 0.5},${y + h * 0.15}`}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={0.4}
          />
          <polyline
            points={`${x + w * 0.5},${y + h * 0.85} ${x + w * 0.7},${y + h * 0.7} ${x + w * 0.9},${y + h * 0.9}`}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={0.4}
          />
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
          })}
        </>
      );

    case "paper_cut":
      return (
        <>
          {/* 镂空背景 */}
          <rect x={x} y={y} width={w} height={h} fill={color} opacity={0.1} />
          {/* 装饰镂空线 */}
          <path
            d={`M${x},${y} Q${x + w * 0.25},${y + h * 0.2} ${x + w * 0.5},${y} Q${x + w * 0.75},${y + h * 0.2} ${x + w},${y}`}
            fill="none"
            stroke={color}
            strokeWidth={1}
            opacity={0.3}
          />
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
          })}
        </>
      );

    case "bubble_pop":
      return (
        <>
          {/* 气泡背景 */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={w * 0.5}
            ry={h * 0.45}
            fill={color}
            opacity={0.15}
            stroke={color}
            strokeWidth={1}
          />
          {renderTextWithStyle({
            fill: color,
            fontWeight: "700",
            opacity: 0.9,
          })}
        </>
      );

    case "gold_emboss":
      return (
        <>
          <defs>
            {createGoldGradient(`gold-${uid}`)}
            {createFilter(`gold-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 金色光晕 */}
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.48}
            fill="none" stroke="#FFD700" strokeWidth={3} opacity={0.15}
            filter={`url(#gold-glow-${uid})`} />
          {/* 金币圆形边框 */}
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.45}
            fill="none" stroke={color} strokeWidth={2} opacity={0.3} />
          {/* 金色浮雕阴影 */}
          {lines.map((line, idx) => {
            const lineY = y + lineSpacing * (idx + 1);
            return (
              <text
                key={`gold-shadow-${idx}`}
                x={cx + 1}
                y={lineY + 1.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fontSize}
                fontFamily={fontFamily}
                fontWeight="700"
                fill={shadowColor}
              >
                {line}
              </text>
            );
          })}
          {/* 渐变主体 */}
          {renderTextWithStyle({
            fill: `url(#gold-${uid})`,
            fontWeight: "700",
          })}
          {/* 高光描边 */}
          {renderTextWithStyle({
            fill: "none",
            stroke: "#FFF8DC",
            strokeWidth: Math.max(0.3, fontSize * 0.008),
            opacity: 0.35,
            fontWeight: "700",
            offsetX: -0.3,
            offsetY: -0.3,
          })}
        </>
      );

    default:
      return renderTextWithStyle({
        fill: color,
        fontWeight: "700",
      });
  }
}

/** 渲染普通文字叠加（支持横排/竖排+阴影） */
function renderOverlayTextSvg(
  el: OverlayTextElement,
  x: number, y: number, w: number, h: number,
  color: string,
  uid: string,
): React.ReactNode {
  const text = el.content ?? "";
  const direction = el.direction ?? "horizontal";
  const fontSize = clamp((el.fontSize ?? 0.6) * h, 16, 36);
  const fontFamily = el.fontFamily === "yahei" ? "\"Microsoft YaHei\", sans-serif"
    : el.fontFamily === "helvetica" ? "\"Helvetica Neue\", sans-serif"
    : "\"SimHei\", sans-serif";
  const fontWeight = el.fontWeight ?? "bold";
  const letterSpacing = el.letterSpacing ?? 2;
  const align = el.align ?? "center";
  const backgroundColor = el.backgroundColor;
  const backgroundOpacity = el.backgroundOpacity ?? 0;
  const hasShadow = el.shadow === true;
  const shadowColor = el.shadowColor ?? "#000000";

  const filterId = `ot-shadow-${uid}`;
  const textX = align === "left" ? x + 8 : align === "right" ? x + w - 8 : x + w / 2;
  const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";

  // 阴影滤镜 + 文字通用属性
  const shadowFilter = hasShadow ? (
    <defs>
      <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx={1} dy={1} stdDeviation={Math.max(1, fontSize * 0.08)} floodColor={shadowColor} floodOpacity={0.6} />
      </filter>
    </defs>
  ) : null;

  // 横排
  if (direction === "horizontal") {
    return (
      <>
        {shadowFilter}
        {backgroundColor && backgroundOpacity > 0 && (
          <rect x={x} y={y} width={w} height={h} fill={backgroundColor} opacity={backgroundOpacity} rx={4} />
        )}
        <text
          x={textX} y={y + h / 2}
          textAnchor={textAnchor} dominantBaseline="central"
          fontSize={fontSize} fontFamily={fontFamily}
          fontWeight={fontWeight} letterSpacing={letterSpacing}
          fill={color}
          filter={hasShadow ? `url(#${filterId})` : undefined}
        >
          {text}
        </text>
      </>
    );
  }

  // 竖排
  const chars = text.split("");
  const charSpacing = fontSize + letterSpacing;
  const totalHeight = chars.length * charSpacing;
  const startX = x + w / 2;
  const startY = y + (h - totalHeight) / 2 + fontSize / 2;

  return (
    <>
      {shadowFilter}
      {backgroundColor && backgroundOpacity > 0 && (
        <rect x={x} y={y} width={w} height={h} fill={backgroundColor} opacity={backgroundOpacity} rx={4} />
      )}
      {chars.map((char, i) => (
        <text
          key={`${uid}-v-${i}`}
          x={startX} y={startY + i * charSpacing}
          textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fontFamily={fontFamily}
          fontWeight={fontWeight} letterSpacing={letterSpacing}
          fill={color}
          filter={hasShadow ? `url(#${filterId})` : undefined}
        >
          {char}
        </text>
      ))}
    </>
  );
}

function renderSvgGraphic(
  type: GraphicsElement["type"],
  x: number, y: number, w: number, h: number,
  color: string, secondaryColor: string, shadowColor: string, glowColor: string,
  label: string, fontSize: number,
  uid: string,
  editMode: boolean,
  imageUrl?: string,
): React.ReactNode {
  /**
   * strokeWidth 基于元素宽度 w 计算（比例基于元素尺寸而非容器）
   * lineWidth = w × base × 比例系数
   *
   * 调整为 0.5%（1/200），使线条更细更精致
   */
  const strokeWidth = (base: number) => Math.max(0.3, w * base * 0.005);

  switch (type) {
    case "air_flow": {
      // 气流线：多层流动曲线 + 风粒子 + 光晕
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2.2;
      const mainPath = spiralPath(cx, cy, r);
      return (
        <>
          <defs>
            {createLinearGradient(`af-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: shadowColor },
            ])}
            {createFilter(`af-glow-${uid}`, "glow", { stdDeviation: 3 })}
          </defs>
          {/* 外层光晕 - 与 Canvas shadowBlur 对齐 */}
          <path d={mainPath} fill="none" stroke={glowColor}
            strokeWidth={strokeWidth(2)} strokeLinecap="round" filter={`url(#af-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 */}
          <path d={mainPath} fill="none" stroke={shadowColor}
            strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.2}
            transform={`translate(${r * 0.04},${r * 0.06})`} />
          {/* 主体渐变 - 与 Canvas lineWidth 对齐 */}
          <path d={mainPath} fill="none" stroke={`url(#af-${uid})`}
            strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          {/* 高光层 */}
          <path d={mainPath} fill="none" stroke={secondaryColor}
            strokeWidth={strokeWidth(0.5)} strokeLinecap="round" opacity={0.4}
            transform={`translate(${-r * 0.03},${-r * 0.04})`} />
          {/* 风粒子 */}
          {[0.12, 0.28, 0.45, 0.62, 0.78, 0.92].map((fx, i) => (
            <circle key={i}
              cx={x + w * fx}
              cy={y + h * 0.2 + Math.sin(i * 1.3) * h * 0.2}
              r={Math.max(1.5, w * (0.012 + i * 0.003))}
              fill={color} opacity={0.5 + i * 0.08} />
          ))}
          {label && (
            <text x={cx} y={y + h * 0.82} textAnchor="middle"
              fill={color} fontSize={Math.max(10, Math.min(w, h) * 0.12)} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "elastic_arrow": {
      // 弹性箭头：3D 立体箭身 + 渐变弹性曲线 + 光晕
      const midY = y + h / 2;
      return (
        <>
          <defs>
            {createLinearGradient(`ea-${uid}`, "horizontal", [
              { offset: "0%", color: color },
              { offset: "50%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`ea-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 - 与 Canvas shadowBlur 对齐 */}
          <line x1={x + w * 0.08} y1={midY} x2={x + w * 0.92} y2={midY}
            stroke={glowColor} strokeWidth={strokeWidth(3)} filter={`url(#ea-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 - 与 Canvas shadowOffset 对齐 */}
          <g opacity={0.2} transform={`translate(${w*0.005},${h*0.01})`}>
            <line x1={x + w * 0.08} y1={midY} x2={x + w * 0.32} y2={midY}
              stroke={shadowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
            <path d={`M${x + w * 0.32},${midY} C${x + w * 0.4},${y + h * 0.18} ${x + w * 0.6},${y + h * 0.82} ${x + w * 0.68},${midY}`}
              fill="none" stroke={shadowColor} strokeWidth={strokeWidth(1.5)} />
            <line x1={x + w * 0.68} y1={midY} x2={x + w * 0.92} y2={midY}
              stroke={shadowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          </g>
          {/* 左箭身 */}
          <line x1={x + w * 0.08} y1={midY} x2={x + w * 0.32} y2={midY}
            stroke={`url(#ea-${uid})`} strokeWidth={strokeWidth(3)} strokeLinecap="round" />
          {/* 左箭头 */}
          <polyline points={`${x + w * 0.14},${y + h * 0.32} ${x + w * 0.08},${midY} ${x + w * 0.14},${y + h * 0.68}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(2)} strokeLinecap="round" strokeLinejoin="round" />
          {/* 弹性曲线 */}
          <path d={`M${x + w * 0.32},${midY} C${x + w * 0.4},${y + h * 0.18} ${x + w * 0.6},${y + h * 0.82} ${x + w * 0.68},${midY}`}
            fill="none" stroke={`url(#ea-${uid})`} strokeWidth={strokeWidth(2)} />
          {/* 右箭身 */}
          <line x1={x + w * 0.68} y1={midY} x2={x + w * 0.92} y2={midY}
            stroke={`url(#ea-${uid})`} strokeWidth={strokeWidth(3)} strokeLinecap="round" />
          {/* 右箭头 */}
          <polyline points={`${x + w * 0.86},${y + h * 0.32} ${x + w * 0.92},${midY} ${x + w * 0.86},${y + h * 0.68}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(2)} strokeLinecap="round" strokeLinejoin="round" />
          {/* 高光 */}
          <line x1={x + w * 0.08} y1={midY - 0.5} x2={x + w * 0.32} y2={midY - 0.5}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} strokeLinecap="round" opacity={0.4} />
          <line x1={x + w * 0.68} y1={midY - 0.5} x2={x + w * 0.92} y2={midY - 0.5}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} strokeLinecap="round" opacity={0.4} />
          {label && (
            <text x={x + w / 2} y={y + h * 0.88} textAnchor="middle"
              fill={color} fontSize={fontSize * 0.9} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "quality_stamp": {
      // 锯齿印章：外圈锯齿 + 内圆 + 装饰弧线 + 文字
      const cx = x + w / 2;
      const cy = y + h / 2;
      const outerR = Math.min(w, h) * 0.44;
      const innerR = outerR * 0.78;
      const teeth = 16;
      const toothDepth = outerR * 0.08;
      // 生成锯齿路径
      const sawToothPath = (() => {
        const pts: string[] = [];
        for (let i = 0; i < teeth; i++) {
          const a1 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((i + 0.5) / teeth) * Math.PI * 2 - Math.PI / 2;
          const ox = cx + outerR * Math.cos(a1);
          const oy = cy + outerR * Math.sin(a1);
          const ix = cx + (outerR - toothDepth) * Math.cos(a2);
          const iy = cy + (outerR - toothDepth) * Math.sin(a2);
          pts.push(`${i === 0 ? "M" : "L"}${ox.toFixed(1)},${oy.toFixed(1)} L${ix.toFixed(1)},${iy.toFixed(1)}`);
        }
        return pts.join(" ") + " Z";
      })();
      // 装饰弧线（上下各一条）
      const arcR = innerR * 0.85;
      const topArc = `M${cx - arcR},${cy - innerR * 0.25} A${arcR},${arcR * 0.3} 0 0,1 ${cx + arcR},${cy - innerR * 0.25}`;
      const botArc = `M${cx - arcR},${cy + innerR * 0.25} A${arcR},${arcR * 0.3} 0 0,0 ${cx + arcR},${cy + innerR * 0.25}`;
      return (
        <>
          <defs>
            {createLinearGradient(`qs-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`qs-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕层 — 锯齿轮廓发光 */}
          <path d={sawToothPath} fill="none" stroke={glowColor} strokeWidth={strokeWidth(4)}
            filter={`url(#qs-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 — 偏移锯齿阴影 */}
          <path d={sawToothPath} fill="none" stroke={shadowColor} strokeWidth={strokeWidth(3)}
            opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 内圆阴影 */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={innerR} fill="none"
            stroke={shadowColor} strokeWidth={strokeWidth(1.5)} opacity={0.2} />
          {/* 主体层 — 外圈锯齿渐变 */}
          <path d={sawToothPath} fill="none" stroke={`url(#qs-${uid})`} strokeWidth={strokeWidth(3)} />
          {/* 主体层 — 内圆 */}
          <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={color} strokeWidth={strokeWidth(1.5)} />
          {/* 装饰弧线 — 渐变 */}
          <path d={topArc} fill="none" stroke={`url(#qs-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <path d={botArc} fill="none" stroke={`url(#qs-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          {/* 锯齿节点小点 — 每个齿尖装饰 */}
          {Array.from({ length: teeth }).map((_, i) => {
            const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
            const dotX = cx + outerR * Math.cos(a);
            const dotY = cy + outerR * Math.sin(a);
            return (
              <circle key={i} cx={dotX} cy={dotY} r={Math.max(1, toothDepth * 0.35)}
                fill={secondaryColor} opacity={0.5} />
            );
          })}
          {/* 高光层 — 顶部弧线 + 左上光斑 */}
          <path d={`M${cx - innerR * 0.5},${cy - innerR * 0.7} A${innerR * 0.9},${innerR * 0.9} 0 0,1 ${cx + innerR * 0.5},${cy - innerR * 0.7}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          <ellipse cx={cx - innerR * 0.3} cy={cy - innerR * 0.4} rx={innerR * 0.15} ry={innerR * 0.08}
            fill={secondaryColor} opacity={0.25} transform={`rotate(-20,${cx - innerR * 0.3},${cy - innerR * 0.4})`} />
          {/* 文字 */}
          {label && (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={color}
              fontSize={Math.max(10, outerR * 0.5)} fontWeight="700" letterSpacing="2">
              {label.slice(0, 2)}
            </text>
          )}
        </>
      );
    }

    case "silhouette_line": {
      // 轮廓线：3D 渐变曲线 + 端点箭头指示 + 阴影
      return (
        <>
          <defs>
            {createLinearGradient(`sl-${uid}`, "vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`sl-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 - 与 Canvas shadowBlur 对齐 */}
          <path d={`M${x + w * 0.28},${y + h * 0.08} C${x + w * 0.12},${y + h * 0.28} ${x + w * 0.18},${y + h * 0.52} ${x + w * 0.22},${y + h * 0.92}`}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" filter={`url(#sl-glow-${uid})`} opacity={0.3} />
          <path d={`M${x + w * 0.72},${y + h * 0.08} C${x + w * 0.88},${y + h * 0.28} ${x + w * 0.82},${y + h * 0.52} ${x + w * 0.78},${y + h * 0.92}`}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" filter={`url(#sl-glow-${uid})`} opacity={0.3} />
          {/* 阴影 */}
          <path d={`M${x + w * 0.28},${y + h * 0.08} C${x + w * 0.12},${y + h * 0.28} ${x + w * 0.18},${y + h * 0.52} ${x + w * 0.22},${y + h * 0.92}`}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.2}
            transform="translate(1,1.5)" />
          <path d={`M${x + w * 0.72},${y + h * 0.08} C${x + w * 0.88},${y + h * 0.28} ${x + w * 0.82},${y + h * 0.52} ${x + w * 0.78},${y + h * 0.92}`}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.2}
            transform="translate(1,1.5)" />
          {/* 主体 - 与 Canvas lineWidth(2) 对齐 */}
          <path d={`M${x + w * 0.28},${y + h * 0.08} C${x + w * 0.12},${y + h * 0.28} ${x + w * 0.18},${y + h * 0.52} ${x + w * 0.22},${y + h * 0.92}`}
            fill="none" stroke={`url(#sl-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          <path d={`M${x + w * 0.72},${y + h * 0.08} C${x + w * 0.88},${y + h * 0.28} ${x + w * 0.82},${y + h * 0.52} ${x + w * 0.78},${y + h * 0.92}`}
            fill="none" stroke={`url(#sl-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          {/* 箭头指示 */}
          <polygon points={`${x + w * 0.06},${y + h * 0.38} ${x + w * 0.13},${y + h * 0.33} ${x + w * 0.13},${y + h * 0.43}`}
            fill={color} opacity={0.9} />
          <polygon points={`${x + w * 0.94},${y + h * 0.38} ${x + w * 0.87},${y + h * 0.33} ${x + w * 0.87},${y + h * 0.43}`}
            fill={color} opacity={0.9} />
          {/* 高光 */}
          <path d={`M${x + w * 0.28},${y + h * 0.08} C${x + w * 0.12},${y + h * 0.28} ${x + w * 0.18},${y + h * 0.52} ${x + w * 0.22},${y + h * 0.92}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} strokeLinecap="round" opacity={0.35}
            transform="translate(-0.5,-0.5)" />
          {label && (
            <text x={x + w / 2} y={y + h * 0.95} textAnchor="middle"
              fill={color} fontSize={fontSize * 0.85} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "soft_curve": {
      // 柔和曲线：3 层渐变曲线 + 光晕 + 透明度层次
      return (
        <>
          <defs>
            {createLinearGradient(`sc-${uid}`, "horizontal", [
              { offset: "0%", color: shadowColor },
              { offset: "30%", color: color },
              { offset: "70%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`sc-glow-${uid}`, "glow", { stdDeviation: 2.5 })}
          </defs>
          {[-1, -0.3, 0.3, 1].map((offset, i) => {
            const oY = offset * h * 0.1;
            const d = `M${x + w * 0.03},${y + h / 2 + oY} C${x + w * 0.3},${y + h * 0.15 + oY} ${x + w * 0.7},${y + h * 0.85 + oY} ${x + w * 0.97},${y + h / 2 + oY}`;
            return (
              <g key={i}>
                {/* 光晕 */}
                <path d={d} fill="none" stroke={glowColor} strokeWidth={strokeWidth(4)}
                  strokeLinecap="round" filter={`url(#sc-glow-${uid})`} opacity={0.4 - i * 0.05} />
                {/* 主体 */}
                <path d={d} fill="none" stroke={`url(#sc-${uid})`}
                  strokeWidth={editMode ? 2 : 2.5 - i * 0.3}
                  strokeLinecap="round" opacity={0.9 - i * 0.1} />
              </g>
            );
          })}
          {/* 高光层（最前曲线上的亮线） */}
          <path d={`M${x + w * 0.03},${y + h / 2 - h * 0.1} C${x + w * 0.3},${y + h * 0.15 - h * 0.1} ${x + w * 0.7},${y + h * 0.85 - h * 0.1} ${x + w * 0.97},${y + h / 2 - h * 0.1}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} strokeLinecap="round" opacity={0.3} />
          {label && (
            <text x={x + w / 2} y={y + h * 0.88} textAnchor="middle"
              fill={color} fontSize={fontSize} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "stitch_mark": {
      // 缝线标记：双层虚线 + 渐变圆点 + 微光效果
      return (
        <>
          {/* 上缝线阴影 */}
          <line x1={x + 1} y1={y + h * 0.28 + 1} x2={x + w + 1} y2={y + h * 0.28 + 1}
            stroke={shadowColor} strokeWidth={strokeWidth(1.5)} strokeDasharray="5 4" opacity={0.25} />
          {/* 下缝线阴影 */}
          <line x1={x + 1} y1={y + h * 0.72 + 1} x2={x + w + 1} y2={y + h * 0.72 + 1}
            stroke={shadowColor} strokeWidth={strokeWidth(1.5)} strokeDasharray="5 4" opacity={0.25} />
          {/* 上缝线 */}
          <line x1={x} y1={y + h * 0.28} x2={x + w} y2={y + h * 0.28}
            stroke={color} strokeWidth={strokeWidth(1.3)} strokeDasharray="5 4" opacity={0.9} />
          {/* 下缝线 */}
          <line x1={x} y1={y + h * 0.72} x2={x + w} y2={y + h * 0.72}
            stroke={color} strokeWidth={strokeWidth(1.3)} strokeDasharray="5 4" opacity={0.9} />
          {/* 缝线针脚圆点 — 大小渐变 + 发光 */}
          {[0.08, 0.22, 0.38, 0.5, 0.62, 0.78, 0.92].map((fx, i) => {
            const r = Math.max(1.5, 2 + Math.sin(i * 0.8) * 0.8);
            return (
              <g key={i}>
                <circle cx={x + w * fx} cy={y + h * 0.5}
                  r={r + 1.5} fill={glowColor} opacity={0.3} />
                <circle cx={x + w * fx} cy={y + h * 0.5}
                  r={r} fill={color} opacity={0.9} />
                <circle cx={x + w * fx - 0.5} cy={y + h * 0.5 - 0.5}
                  r={r * 0.4} fill={secondaryColor} opacity={0.5} />
              </g>
            );
          })}
          {label && (
            <text x={x + w / 2} y={y + h * 0.88} textAnchor="middle"
              fill={color} fontSize={fontSize * 0.8} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "scene_icon": {
      // 场景图标：3D 房屋 + 光晕 + gradient 窗户 + 屋顶装饰 + 阴影偏移
      return (
        <>
          <defs>
            {createLinearGradient(`si-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`si-win-${uid}`, "vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`si-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <rect x={x + w * 0.28} y={y + h * 0.22} width={w * 0.44} height={h * 0.58} rx={3}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(2)} filter={`url(#si-glow-${uid})`} opacity={0.3} />
          {/* 阴影偏移层 */}
          <g opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`}>
            <rect x={x + w * 0.28} y={y + h * 0.22} width={w * 0.44} height={h * 0.58} rx={3}
              fill="none" stroke={shadowColor} strokeWidth={strokeWidth(1.5)} />
            <path d={`M${x + w * 0.18},${y + h * 0.22} L${x + w * 0.5},${y + h * 0.06} L${x + w * 0.82},${y + h * 0.22}`}
              fill="none" stroke={shadowColor} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {/* 主体 - 与 Canvas lineWidth(2) 对齐 */}
          <rect x={x + w * 0.28} y={y + h * 0.22} width={w * 0.44} height={h * 0.58} rx={3}
            fill="none" stroke={`url(#si-${uid})`} strokeWidth={strokeWidth(2)} />
          <path d={`M${x + w * 0.18},${y + h * 0.22} L${x + w * 0.5},${y + h * 0.06} L${x + w * 0.82},${y + h * 0.22}`}
            fill="none" stroke={`url(#si-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" strokeLinejoin="round" />
          {/* 窗户 — gradient 填充 */}
          <rect x={x + w * 0.36} y={y + h * 0.36} width={w * 0.1} height={h * 0.14}
            fill={`url(#si-win-${uid})`} rx={1} opacity={0.75} />
          <rect x={x + w * 0.54} y={y + h * 0.36} width={w * 0.1} height={h * 0.14}
            fill={`url(#si-win-${uid})`} rx={1} opacity={0.75} />
          {/* 屋顶装饰小点 */}
          <circle cx={x + w * 0.5} cy={y + h * 0.06} r={strokeWidth(1.8)} fill={secondaryColor} opacity={0.7} />
          <circle cx={x + w * 0.34} cy={y + h * 0.14} r={strokeWidth(1)} fill={secondaryColor} opacity={0.4} />
          <circle cx={x + w * 0.66} cy={y + h * 0.14} r={strokeWidth(1)} fill={secondaryColor} opacity={0.4} />
          {/* 门 */}
          <rect x={x + w * 0.44} y={y + h * 0.58} width={w * 0.12} height={h * 0.22} rx={w * 0.02}
            fill="none" stroke={`url(#si-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.6} />
          {/* 高光 */}
          <path d={`M${x + w * 0.22},${y + h * 0.22} L${x + w * 0.5},${y + h * 0.1}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.4} strokeLinecap="round" />
          {label && (
            <text x={x + w / 2} y={y + h * 0.92} textAnchor="middle"
              fill={color} fontSize={Math.max(9, w * 0.12)} fontWeight="600">{label.slice(0, 4)}</text>
          )}
        </>
      );
    }

    case "size_frame": {
      // 尺寸框：4 角标记 + 虚线框 + gradient 角标记 + 阴影偏移 + 装饰点
      const m = Math.min(w, h) * 0.06;
      const fx1 = x + m, fy1 = y + m, fx2 = x + w - m, fy2 = y + h - m;
      const cornerLen = Math.min(w, h) * 0.12;
      return (
        <>
          <defs>
            {createLinearGradient(`sf-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`sf-glow-${uid}`, "glow", { stdDeviation: 1.5 })}
          </defs>
          {/* 光晕虚线框 */}
          <rect x={fx1} y={fy1} width={fx2 - fx1} height={fy2 - fy1} fill="none"
            stroke={glowColor} strokeWidth={strokeWidth(4)} strokeDasharray="7 4" rx={2}
            filter={`url(#sf-glow-${uid})`} opacity={0.5} />
          {/* 阴影偏移层 */}
          <rect x={fx1} y={fy1} width={fx2 - fx1} height={fy2 - fy1} fill="none"
            stroke={shadowColor} strokeWidth={strokeWidth(1.5)} strokeDasharray="7 4" rx={2} opacity={0.2}
            transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 虚线框 */}
          <rect x={fx1} y={fy1} width={fx2 - fx1} height={fy2 - fy1} fill="none"
            stroke={color} strokeWidth={strokeWidth(1.5)} strokeDasharray="7 4" rx={2} opacity={0.8} />
          {/* 四角 L 型标记 — gradient 描边 */}
          <path d={`M${fx1},${fy1 + cornerLen} L${fx1},${fy1} L${fx1 + cornerLen},${fy1}`}
            fill="none" stroke={`url(#sf-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.9} />
          <path d={`M${fx2 - cornerLen},${fy1} L${fx2},${fy1} L${fx2},${fy1 + cornerLen}`}
            fill="none" stroke={`url(#sf-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.9} />
          <path d={`M${fx1},${fy2 - cornerLen} L${fx1},${fy2} L${fx1 + cornerLen},${fy2}`}
            fill="none" stroke={`url(#sf-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.9} />
          <path d={`M${fx2 - cornerLen},${fy2} L${fx2},${fy2} L${fx2},${fy2 - cornerLen}`}
            fill="none" stroke={`url(#sf-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.9} />
          {/* 角落高光点 */}
          <circle cx={fx1} cy={fy1} r={strokeWidth(1.8)} fill={secondaryColor} opacity={0.6} />
          <circle cx={fx2} cy={fy1} r={strokeWidth(1.8)} fill={secondaryColor} opacity={0.6} />
          <circle cx={fx1} cy={fy2} r={strokeWidth(1.8)} fill={secondaryColor} opacity={0.6} />
          <circle cx={fx2} cy={fy2} r={strokeWidth(1.8)} fill={secondaryColor} opacity={0.6} />
          {/* 边线中点装饰菱形 */}
          <rect x={(fx1 + fx2) / 2 - strokeWidth(1.5)} y={fy1 - strokeWidth(1.5)}
            width={strokeWidth(3)} height={strokeWidth(3)} fill={secondaryColor} opacity={0.5}
            transform={`rotate(45 ${(fx1 + fx2) / 2} ${fy1})`} />
          <rect x={(fx1 + fx2) / 2 - strokeWidth(1.5)} y={fy2 - strokeWidth(1.5)}
            width={strokeWidth(3)} height={strokeWidth(3)} fill={secondaryColor} opacity={0.5}
            transform={`rotate(45 ${(fx1 + fx2) / 2} ${fy2})`} />
        </>
      );
    }

    // ================================================================
    // 标注类（Annotation）
    // ================================================================

    case "arrow_callout": {
      // 圆角气泡标注：曲线指引线 + 圆角气泡 + 4 层渲染 + 装饰细节
      const bubbleX = x + w * 0.4;
      const bubbleY = y + h * 0.08;
      const bubbleW = w * 0.55;
      const bubbleH = h * 0.38;
      const bubbleR = Math.min(bubbleW, bubbleH) * 0.25;
      const originX = x + w * 0.15;
      const originY = y + h * 0.85;
      const tipX = bubbleX + bubbleW * 0.3;
      const tipY = bubbleY + bubbleH;
      // 圆角矩形路径
      const roundRect = `M${bubbleX + bubbleR},${bubbleY} L${bubbleX + bubbleW - bubbleR},${bubbleY} Q${bubbleX + bubbleW},${bubbleY} ${bubbleX + bubbleW},${bubbleY + bubbleR} L${bubbleX + bubbleW},${bubbleY + bubbleH - bubbleR} Q${bubbleX + bubbleW},${bubbleY + bubbleH} ${bubbleX + bubbleW - bubbleR},${bubbleY + bubbleH} L${bubbleX + bubbleR},${bubbleY + bubbleH} Q${bubbleX},${bubbleY + bubbleH} ${bubbleX},${bubbleY + bubbleH - bubbleR} L${bubbleX},${bubbleY + bubbleR} Q${bubbleX},${bubbleY} ${bubbleX + bubbleR},${bubbleY} Z`;
      // 曲线指引线路径
      const guidePath = `M${originX},${originY} C${originX},${originY - h * 0.3} ${tipX - w * 0.1},${tipY + h * 0.1} ${tipX},${tipY}`;
      return (
        <>
          <defs>
            {createLinearGradient(`ac-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "50%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`ac-glow-${uid}`, "glow", { stdDeviation: 2 })}
            {createFilter(`ac-shadow-${uid}`, "shadow", { stdDeviation: 4, shadowColor, shadowOpacity: 0.25, dx: 1.5, dy: 2 })}
          </defs>
          {/* 光晕层：整体 glow */}
          <g filter={`url(#ac-glow-${uid})`} opacity={0.3}>
            <path d={guidePath} fill="none" stroke={glowColor} strokeWidth={strokeWidth(3)} strokeLinecap="round" />
            <path d={roundRect} fill={glowColor} />
          </g>
          {/* 阴影层：偏移副本 */}
          <g transform={`translate(${w * 0.005},${h * 0.01})`} opacity={0.2}>
            <path d={guidePath} fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2.5)} strokeLinecap="round" />
            <path d={roundRect} fill={shadowColor} />
          </g>
          {/* 主体层：渐变填充 */}
          <g filter={`url(#ac-shadow-${uid})`}>
            {/* 曲线指引线 */}
            <path d={guidePath} fill="none" stroke={`url(#ac-${uid})`} strokeWidth={strokeWidth(2.5)} strokeLinecap="round" />
            {/* 箭头三角（指向气泡） */}
            <polygon
              points={`${tipX - 4},${tipY + 1} ${tipX + 5},${tipY - 8} ${tipX + 5},${tipY + 6}`}
              fill={color}
            />
            {/* 气泡圆角矩形 */}
            <path d={roundRect} fill={`url(#ac-${uid})`} opacity={0.92} />
          </g>
          {/* 细节装饰：指引线起点圆点 */}
          <circle cx={originX} cy={originY} r={strokeWidth(4)} fill={color} opacity={0.9} />
          <circle cx={originX} cy={originY} r={strokeWidth(2)} fill={secondaryColor} opacity={0.5} />
          {/* 细节装饰：气泡内侧高光线 */}
          <path d={`M${bubbleX + bubbleR + 3},${bubbleY + 4} L${bubbleX + bubbleW - bubbleR - 3},${bubbleY + 4}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.4} strokeLinecap="round" />
          <path d={`M${bubbleX + 3},${bubbleY + bubbleR + 3} L${bubbleX + 3},${bubbleY + bubbleH - bubbleR - 3}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.25} strokeLinecap="round" />
          {/* 高光层：气泡顶部 secondaryColor 线 */}
          <path d={`M${bubbleX + bubbleR + 5},${bubbleY + 2} L${bubbleX + bubbleW - bubbleR - 5},${bubbleY + 2}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.5)} opacity={0.35} strokeLinecap="round" />
          {/* 标签文字 */}
          {label && (
            <text
              x={bubbleX + bubbleW / 2}
              y={bubbleY + bubbleH / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={fontSize * 0.85}
              fontWeight="600"
            >
              {label}
            </text>
          )}
        </>
      );
    }

    case "highlight_spot": {
      // 多层脉冲高亮：4 层渲染 + radialGradient + 发光 + 十字瞄准 + 菱形装饰
      const cx = x + w / 2;
      const cy = y + h / 2;
      const outerR = Math.min(w, h) * 0.44;
      const midR = outerR * 0.7;
      const innerR = outerR * 0.45;
      const crossLen = outerR * 0.25;
      // 菱形装饰大小
      const diamondSize = outerR * 0.06;
      return (
        <>
          <defs>
            {createRadialGradient(`hs-radial-${uid}`, [
              { offset: "0%", color: color, opacity: 0.4 },
              { offset: "60%", color: color, opacity: 0.15 },
              { offset: "100%", color: color, opacity: 0.02 },
            ])}
            {createFilter(`hs-glow-${uid}`, "glow-strong", { stdDeviation: 3 })}
            {createFilter(`hs-glow-soft-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕层：最外圈 glowColor + glow filter */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={glowColor}
            strokeWidth={strokeWidth(3)} filter={`url(#hs-glow-${uid})`} opacity={0.3} />
          {/* 阴影层：偏移的中圈 */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={midR} fill="none"
            stroke={shadowColor} strokeWidth={strokeWidth(2)} opacity={0.2} />
          {/* 主体层：外圈扩散虚线 */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={color}
            strokeWidth={strokeWidth(1.2)} strokeDasharray="6 4" opacity={0.5} />
          {/* 主体层：中圈 */}
          <circle cx={cx} cy={cy} r={midR} fill="none" stroke={color}
            strokeWidth={strokeWidth(2)} opacity={0.7} filter={`url(#hs-glow-soft-${uid})`} />
          {/* 主体层：内圈 radialGradient 填充 */}
          <circle cx={cx} cy={cy} r={innerR} fill={`url(#hs-radial-${uid})`} />
          <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={color}
            strokeWidth={strokeWidth(1.5)} opacity={0.8} />
          {/* 细节装饰：十字瞄准线端点小圆点 */}
          <line x1={cx - crossLen} y1={cy} x2={cx + crossLen} y2={cy}
            stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <line x1={cx} y1={cy - crossLen} x2={cx} y2={cy + crossLen}
            stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <circle cx={cx - crossLen} cy={cy} r={strokeWidth(2)} fill={color} opacity={0.6} />
          <circle cx={cx + crossLen} cy={cy} r={strokeWidth(2)} fill={color} opacity={0.6} />
          <circle cx={cx} cy={cy - crossLen} r={strokeWidth(2)} fill={color} opacity={0.6} />
          <circle cx={cx} cy={cy + crossLen} r={strokeWidth(2)} fill={color} opacity={0.6} />
          {/* 细节装饰：外圈四个方向小菱形 */}
          <polygon points={`${cx},${cy - outerR - diamondSize} ${cx + diamondSize},${cy - outerR} ${cx},${cy - outerR + diamondSize} ${cx - diamondSize},${cy - outerR}`}
            fill={color} opacity={0.7} />
          <polygon points={`${cx},${cy + outerR + diamondSize} ${cx + diamondSize},${cy + outerR} ${cx},${cy + outerR - diamondSize} ${cx - diamondSize},${cy + outerR}`}
            fill={color} opacity={0.7} />
          <polygon points={`${cx - outerR - diamondSize},${cy} ${cx - outerR},${cy + diamondSize} ${cx - outerR + diamondSize},${cy} ${cx - outerR},${cy - diamondSize}`}
            fill={color} opacity={0.7} />
          <polygon points={`${cx + outerR + diamondSize},${cy} ${cx + outerR},${cy + diamondSize} ${cx + outerR - diamondSize},${cy} ${cx + outerR},${cy - diamondSize}`}
            fill={color} opacity={0.7} />
          {/* 中心实心点 */}
          <circle cx={cx} cy={cy} r={Math.max(4, outerR * 0.12)} fill={color} opacity={0.95} />
          {/* 高光层：内圈高光弧线加强 */}
          <path d={`M${cx - innerR * 0.7},${cy - innerR * 0.4} A${innerR * 0.9},${innerR * 0.9} 0 0,1 ${cx + innerR * 0.1},${cy - innerR * 0.85}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(2)} opacity={0.4} strokeLinecap="round" />
          <path d={`M${cx + innerR * 0.3},${cy - innerR * 0.75} A${innerR * 0.6},${innerR * 0.6} 0 0,1 ${cx + innerR * 0.7},${cy - innerR * 0.2}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.2)} opacity={0.3} strokeLinecap="round" />
          {label && (
            <text x={cx} y={cy + outerR + fontSize * 1.1} textAnchor="middle"
              fill={color} fontSize={fontSize * 0.75} fontWeight="600">
              {label}
            </text>
          )}
        </>
      );
    }

    case "crosshair_mark": {
      // 十字准星：3D 立体十字 + 同心圆环 + 中心发光点 + 刻度线
      const cx = x + w / 2;
      const cy = y + h / 2;
      const armLen = Math.min(w, h) * 0.42;
      const outerR = armLen * 0.8;
      const tickLen = armLen * 0.12;
      return (
        <>
          <defs>
            {createFilter(`ch-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕背景 */}
          <circle cx={cx} cy={cy} r={outerR} fill={glowColor} opacity={0.15}
            filter={`url(#ch-glow-${uid})`} />
          {/* 外圈虚线 */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={color}
            strokeWidth={strokeWidth(1)} strokeDasharray="4 6" opacity={0.4} />
          {/* 中圈 */}
          <circle cx={cx} cy={cy} r={outerR * 0.55} fill="none" stroke={color}
            strokeWidth={strokeWidth(1.5)} opacity={0.6} />
          {/* 阴影十字 */}
          <line x1={cx - armLen + 1} y1={cy + 1.5} x2={cx + armLen + 1} y2={cy + 1.5}
            stroke={shadowColor} strokeWidth={strokeWidth(2)} opacity={0.25} />
          <line x1={cx + 1.5} y1={cy - armLen + 1} x2={cx + 1.5} y2={cy + armLen + 1}
            stroke={shadowColor} strokeWidth={strokeWidth(2)} opacity={0.25} />
          {/* 主体十字线 - 与 Canvas getLineWidth(w, 1.5) 对齐 */}
          <line x1={cx - armLen} y1={cy} x2={cx - outerR * 0.3} y2={cy}
            stroke={color} strokeWidth={strokeWidth(1.5)} />
          <line x1={cx + outerR * 0.3} y1={cy} x2={cx + armLen} y2={cy}
            stroke={color} strokeWidth={strokeWidth(1.5)} />
          <line x1={cx} y1={cy - armLen} x2={cx} y2={cy - outerR * 0.3}
            stroke={color} strokeWidth={strokeWidth(1.5)} />
          <line x1={cx} y1={cy + outerR * 0.3} x2={cx} y2={cy + armLen}
            stroke={color} strokeWidth={strokeWidth(1.5)} />
          {/* 刻度线（4 方向各 2 条） */}
          {[0.65, 0.85].map((f) => (
            <g key={f}>
              <line x1={cx - armLen * f} y1={cy - tickLen} x2={cx - armLen * f} y2={cy + tickLen}
                stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />
              <line x1={cx + armLen * f} y1={cy - tickLen} x2={cx + armLen * f} y2={cy + tickLen}
                stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />
              <line x1={cx - tickLen} y1={cy - armLen * f} x2={cx + tickLen} y2={cy - armLen * f}
                stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />
              <line x1={cx - tickLen} y1={cy + armLen * f} x2={cx + tickLen} y2={cy + armLen * f}
                stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />
            </g>
          ))}
          {/* 中心小圆 */}
          <circle cx={cx} cy={cy} r={Math.max(3, armLen * 0.12)} fill="none"
            stroke={color} strokeWidth={strokeWidth(2)} />
          {/* 中心发光点 */}
          <circle cx={cx} cy={cy} r={Math.max(4, armLen * 0.08)} fill={color} />
          <circle cx={cx} cy={cy} r={Math.max(6, armLen * 0.12)} fill={glowColor}
            filter={`url(#ch-glow-${uid})`} opacity={0.6} />
          {label && (
            <text x={cx + armLen * 0.3} y={cy - armLen * 0.3} textAnchor="start"
              fill={secondaryColor} fontSize={fontSize * 0.65} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "circle_callout": {
      // 圆形标注：4 层渲染 + 渐变 + 发光 + 射线装饰 + 虚线节点 + 高光弧
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.4;
      // 射线长度和端点装饰
      const rayLen = r * 0.18;
      const rayStart = r * 1.05;
      // 虚线节点装饰大小
      const nodeSize = r * 0.04;
      return (
        <>
          <defs>
            {createLinearGradient(`cc-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "50%", color: secondaryColor },
              { offset: "100%", color: shadowColor },
            ])}
            {createFilter(`cc-glow-${uid}`, "glow", { stdDeviation: 2.5 })}
            {createFilter(`cc-shadow-${uid}`, "shadow", { stdDeviation: 3, shadowColor, shadowOpacity: 0.25, dx: 1.5, dy: 2 })}
          </defs>
          {/* 光晕层 */}
          <circle cx={cx} cy={cy} r={r * 1.15} fill={glowColor}
            filter={`url(#cc-glow-${uid})`} opacity={0.3} />
          {/* 阴影层：偏移副本 */}
          <g transform={`translate(${w * 0.005},${h * 0.01})`} opacity={0.2}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2.5)} />
            <circle cx={cx} cy={cy} r={r * 0.82} fill={shadowColor} opacity={0.15} />
          </g>
          {/* 主体层：外圈渐变虚线 */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#cc-${uid})`}
            strokeWidth={strokeWidth(2.5)} strokeDasharray="6 3" />
          {/* 主体层：内圈渐变填充 */}
          <circle cx={cx} cy={cy} r={r * 0.82} fill={secondaryColor} opacity={0.18} />
          {/* 细节装饰：4 条短射线（上下左右） */}
          <line x1={cx} y1={cy - rayStart} x2={cx} y2={cy - rayStart - rayLen}
            stroke={color} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.6} />
          <line x1={cx} y1={cy + rayStart} x2={cx} y2={cy + rayStart + rayLen}
            stroke={color} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.6} />
          <line x1={cx - rayStart} y1={cy} x2={cx - rayStart - rayLen} y2={cy}
            stroke={color} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.6} />
          <line x1={cx + rayStart} y1={cy} x2={cx + rayStart + rayLen} y2={cy}
            stroke={color} strokeWidth={strokeWidth(1.5)} strokeLinecap="round" opacity={0.6} />
          {/* 细节装饰：射线端点小圆 */}
          <circle cx={cx} cy={cy - rayStart - rayLen} r={strokeWidth(2)} fill={color} opacity={0.5} />
          <circle cx={cx} cy={cy + rayStart + rayLen} r={strokeWidth(2)} fill={color} opacity={0.5} />
          <circle cx={cx - rayStart - rayLen} cy={cy} r={strokeWidth(2)} fill={color} opacity={0.5} />
          <circle cx={cx + rayStart + rayLen} cy={cy} r={strokeWidth(2)} fill={color} opacity={0.5} />
          {/* 细节装饰：虚线圈上的装饰节点（45 度方向） */}
          {[Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].map((angle, i) => {
            const nx = cx + r * Math.cos(angle);
            const ny = cy + r * Math.sin(angle);
            return <circle key={i} cx={nx} cy={ny} r={Math.max(nodeSize, 1.5)} fill={color} opacity={0.7} />;
          })}
          {/* 高光层：左上弧线 */}
          <path d={`M${cx - r * 0.6},${cy - r * 0.5} A${r * 0.85},${r * 0.85} 0 0,1 ${cx + r * 0.2},${cy - r * 0.75}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(2)} opacity={0.35} strokeLinecap="round" />
          {/* 高光层：右下补充弧线 */}
          <path d={`M${cx + r * 0.3},${cy + r * 0.45} A${r * 0.5},${r * 0.5} 0 0,1 ${cx + r * 0.6},${cy + r * 0.15}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.2)} opacity={0.25} strokeLinecap="round" />
          {label && (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              fill={color} fontSize={fontSize * 0.9} fontWeight="700">{label}</text>
          )}
        </>
      );
    }

    case "magnifier": {
      // 放大镜：3D 镜框 + 渐变镜片 + 立体手柄 + 镜面反光
      const lensR = Math.min(w, h) * 0.32;
      const lensCx = x + w * 0.42;
      const lensCy = y + h * 0.42;
      const handleEnd = { x: x + w * 0.88, y: y + h * 0.88 };
      return (
        <>
          <defs>
            {createLinearGradient(`mg-lens-${uid}`, "diagonal", [
              { offset: "0%", color: colorWithAlpha(secondaryColor, 0.3) },
              { offset: "100%", color: colorWithAlpha(color, 0.08) },
            ])}
            {createFilter(`mg-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 镜片光晕 */}
          <circle cx={lensCx} cy={lensCy} r={lensR * 1.2}
            fill={glowColor} filter={`url(#mg-glow-${uid})`} opacity={0.3} />
          {/* 阴影 */}
          <circle cx={lensCx + 2} cy={lensCy + 2} r={lensR}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(3)} opacity={0.2} />
          {/* 镜片填充 */}
          <circle cx={lensCx} cy={lensCy} r={lensR}
            fill={`url(#mg-lens-${uid})`} />
          {/* 镜框 - 与 Canvas getLineWidth(w, 2.5) 对齐 */}
          <circle cx={lensCx} cy={lensCy} r={lensR}
            fill="none" stroke={color} strokeWidth={strokeWidth(2.5)} />
          {/* 镜面反光弧 - 与 Canvas getLineWidth(w, 1) 对齐 */}
          <path d={`M${lensCx - lensR * 0.5},${lensCy - lensR * 0.6} A${lensR * 0.7},${lensR * 0.7} 0 0,1 ${lensCx + lensR * 0.15},${lensCy - lensR * 0.75}`}
            fill="none" stroke="white" strokeWidth={strokeWidth(1)} opacity={0.35} strokeLinecap="round" />
          {/* 手柄阴影 - 与 Canvas getLineWidth(w, 3) 对齐 */}
          <line x1={lensCx + lensR * 0.72} y1={lensCy + lensR * 0.72}
            x2={handleEnd.x + 1} y2={handleEnd.y + 1}
            stroke={shadowColor} strokeWidth={strokeWidth(3)} strokeLinecap="round" opacity={0.2} />
          {/* 手柄 - 与 Canvas getLineWidth(w, 3) 对齐 */}
          <line x1={lensCx + lensR * 0.7} y1={lensCy + lensR * 0.7}
            x2={handleEnd.x} y2={handleEnd.y}
            stroke={color} strokeWidth={strokeWidth(3)} strokeLinecap="round" />
          {/* 手柄高光 */}
          <line x1={lensCx + lensR * 0.72} y1={lensCy + lensR * 0.68}
            x2={handleEnd.x - 2} y2={handleEnd.y - 2}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} strokeLinecap="round" opacity={0.4} />
          {/* 中心 + 号 */}
          <line x1={lensCx - lensR * 0.25} y1={lensCy} x2={lensCx + lensR * 0.25} y2={lensCy}
            stroke={color} strokeWidth={strokeWidth(1.5)} opacity={0.6} />
          <line x1={lensCx} y1={lensCy - lensR * 0.25} x2={lensCx} y2={lensCy + lensR * 0.25}
            stroke={color} strokeWidth={strokeWidth(1.5)} opacity={0.6} />
        </>
      );
    }

    // ================================================================
    // 标签类（Badge/Tag）
    // ================================================================

    case "sale_ribbon": {
      // 3D 促销角标：右上角折角 ribbon + 3D 阴影 + 渐变 + 光晕
      const foldSize = Math.min(w, h) * 0.2;
      const ribbonLeft = x + w * 0.3;
      const ribbonBottom = y + h * 0.5;
      return (
        <>
          <defs>
            {createLinearGradient(`sr-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createLinearGradient(`sr-fold-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: shadowColor },
            ])}
            {createFilter(`sr-glow-${uid}`, "glow", { stdDeviation: 2 })}
            {createFilter(`sr-shadow-${uid}`, "shadow", { stdDeviation: 6, shadowColor, shadowOpacity: 0.3, dx: 2, dy: 3 })}
            {createFilter(`sr-text-shadow-${uid}`, "shadow", { stdDeviation: 1, shadowColor, shadowOpacity: 0.6, dx: 0, dy: 1 })}
          </defs>
          {/* 光晕层 — Ribbon 整体发光 */}
          <path d={`M${ribbonLeft},${y + 2} L${x + w},${y} L${x + w},${ribbonBottom} L${ribbonLeft},${ribbonBottom - 3} Z`}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(3)}
            filter={`url(#sr-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 */}
          <g filter={`url(#sr-shadow-${uid})`}>
            <path d={`M${ribbonLeft},${y + 2} L${x + w},${y} L${x + w},${ribbonBottom} L${ribbonLeft},${ribbonBottom - 3} Z`}
              fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} opacity={0.2}
              transform={`translate(${w * 0.005},${h * 0.01})`} />
          </g>
          {/* 主体层 — Ribbon 梯形 */}
          <path d={`M${ribbonLeft},${y + 2} L${x + w},${y} L${x + w},${ribbonBottom} L${ribbonLeft},${ribbonBottom - 3} Z`}
            fill={`url(#sr-${uid})`} />
          {/* 折角 — 渐变 */}
          <path d={`M${ribbonLeft},${y + 2} L${ribbonLeft + foldSize},${y + 2} L${ribbonLeft},${y + foldSize + 2} Z`}
            fill={`url(#sr-fold-${uid})`} opacity={0.7} />
          {/* 底部三角（折回效果） — 渐变 */}
          <polygon points={`${ribbonLeft},${ribbonBottom - 3} ${ribbonLeft - foldSize * 0.4},${ribbonBottom + foldSize * 0.3} ${ribbonLeft + foldSize * 0.4},${ribbonBottom - 3}`}
            fill={`url(#sr-fold-${uid})`} opacity={0.7} />
          {/* 细节装饰 — 右侧边线 */}
          <line x1={x + w - strokeWidth(0.5)} y1={y + h * 0.02} x2={x + w - strokeWidth(0.5)} y2={ribbonBottom - h * 0.02}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.3} />
          {/* 高光层 — 水平光条 + 顶部光边 */}
          <line x1={ribbonLeft + 4} y1={y + foldSize * 0.7} x2={x + w - 4} y2={y + foldSize * 0.7}
            stroke={secondaryColor} strokeWidth={strokeWidth(1.5)} opacity={0.3} />
          <line x1={ribbonLeft + 2} y1={y + 3} x2={x + w - 2} y2={y + 1}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.25} />
          {/* 文字 — SVG filter 替代 style.textShadow */}
          <text
            x={(ribbonLeft + x + w) / 2}
            y={(y + ribbonBottom) / 2 + 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={fontSize * 0.9}
            fontWeight="700"
            filter={`url(#sr-text-shadow-${uid})`}
          >
            {label || "SALE"}
          </text>
        </>
      );
    }

    case "tag_label": {
      // 标签贴：渐变填充主体 + 阴影偏移层 + 高光描边 + 圆孔装饰环 + 光晕
      const foldSize = Math.min(w, h) * 0.15;
      const holeCx = x + w * 0.18;
      const holeCy = y + h * 0.5;
      const holeR = Math.max(2, Math.min(w, h) * 0.05);
      const bodyPath = `M${x + w * 0.1},${y + h * 0.15} L${x + w - foldSize},${y + h * 0.15} L${x + w},${y + h * 0.15 + foldSize} L${x + w},${y + h * 0.85} L${x + w * 0.1},${y + h * 0.85} Z`;
      return (
        <>
          <defs>
            {createLinearGradient(`tl-${uid}`, "horizontal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`tl-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕层 */}
          <path d={bodyPath} fill="none" stroke={glowColor} strokeWidth={strokeWidth(3)}
            filter={`url(#tl-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 */}
          <path d={bodyPath} fill={shadowColor} opacity={0.2}
            transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 主体层 — 渐变填充 */}
          <path d={bodyPath} fill={`url(#tl-${uid})`} opacity={0.9} />
          {/* 主体层 — 高光描边 */}
          <path d={bodyPath} fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.3} />
          {/* 折角 */}
          <polygon points={`${x + w - foldSize},${y + h * 0.15} ${x + w},${y + h * 0.15 + foldSize} ${x + w - foldSize},${y + h * 0.15 + foldSize}`}
            fill={secondaryColor} opacity={0.4} />
          {/* 左侧圆孔装饰环 */}
          <circle cx={holeCx} cy={holeCy} r={holeR + Math.max(1.5, holeR * 0.6)} fill="none"
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.4} />
          <circle cx={holeCx} cy={holeCy} r={holeR + Math.max(3, holeR * 1.2)} fill="none"
            stroke={secondaryColor} strokeWidth={strokeWidth(0.4)} opacity={0.2} strokeDasharray="2 2" />
          {/* 左侧圆孔 */}
          <circle cx={holeCx} cy={holeCy} r={holeR} fill="white" opacity={0.6} />
          {/* 高光层 — 顶部水平光条 */}
          <line x1={x + w * 0.15} y1={y + h * 0.22} x2={x + w * 0.85} y2={y + h * 0.22}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.6)} opacity={0.35} strokeLinecap="round" />
          {/* 细节装饰 — 底部小菱形 */}
          <polygon points={`${x + w * 0.92},${y + h * 0.75} ${x + w * 0.94},${y + h * 0.78} ${x + w * 0.92},${y + h * 0.81} ${x + w * 0.9},${y + h * 0.78}`}
            fill={secondaryColor} opacity={0.35} />
          {/* 文字 */}
          <text
            x={x + w * 0.55}
            y={y + h * 0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={fontSize * 0.75}
            fontWeight="600"
          >
            {label}
          </text>
        </>
      );
    }

    case "price_tag": {
      // 价格标签：药丸形标签 + 渐变背景 + 光晕 + 边缘装饰 + 多层高光
      const pillRx = h * 0.45;
      return (
        <>
          <defs>
            {createLinearGradient(`pt-${uid}`, "horizontal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`pt-glow-${uid}`, "glow", { stdDeviation: 2 })}
            {createFilter(`pt-shadow-${uid}`, "shadow", { stdDeviation: 3 })}
          </defs>
          {/* 光晕层 */}
          <rect x={x} y={y} width={w} height={h}
            rx={pillRx} ry={pillRx}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(3)}
            filter={`url(#pt-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 */}
          <rect x={x + 1} y={y + 1.5} width={w} height={h}
            rx={pillRx} ry={pillRx}
            fill={shadowColor} opacity={0.25} filter={`url(#pt-shadow-${uid})`} />
          {/* 主体药丸 */}
          <rect x={x} y={y} width={w} height={h}
            rx={pillRx} ry={pillRx}
            fill={`url(#pt-${uid})`} />
          {/* 主体描边 — 高光边线 */}
          <rect x={x} y={y} width={w} height={h}
            rx={pillRx} ry={pillRx}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.3} />
          {/* 边缘装饰线 — 左右小弧线 */}
          <path d={`M${x + w * 0.08},${y + h * 0.15} L${x + w * 0.08},${y + h * 0.85}`}
            fill="none" stroke="white" strokeWidth={strokeWidth(0.4)} opacity={0.25} strokeLinecap="round" />
          <path d={`M${x + w * 0.92},${y + h * 0.15} L${x + w * 0.92},${y + h * 0.85}`}
            fill="none" stroke="white" strokeWidth={strokeWidth(0.4)} opacity={0.25} strokeLinecap="round" />
          {/* 高光层 — 顶部大面积高光 */}
          <rect x={x + w * 0.05} y={y + h * 0.1} width={w * 0.9} height={h * 0.35}
            rx={pillRx * 0.8} ry={pillRx * 0.8}
            fill="white" opacity={0.2} />
          {/* 高光层 — 底部微弱反光 */}
          <rect x={x + w * 0.15} y={y + h * 0.7} width={w * 0.7} height={h * 0.15}
            rx={pillRx * 0.6} ry={pillRx * 0.6}
            fill={secondaryColor} opacity={0.15} />
          {/* 细节装饰 — 小圆点 */}
          <circle cx={x + w * 0.12} cy={y + h * 0.5} r={Math.max(1, h * 0.06)}
            fill="white" opacity={0.3} />
          <circle cx={x + w * 0.88} cy={y + h * 0.5} r={Math.max(1, h * 0.06)}
            fill="white" opacity={0.3} />
          {/* 文字 */}
          {label && (
            <text
              x={x + w / 2} y={y + h / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={Math.max(10, h * 0.5)}
              fontWeight="600" fill="white"
              letterSpacing={1}
            >
              {label}
            </text>
          )}
        </>
      );
    }

    case "number_badge": {
      // 数字徽章：多层圆环 + gradient + 阴影 + 射线装饰 + 高光 + 光晕
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.4;
      return (
        <>
          <defs>
            {createLinearGradient(`nb-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`nb-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕层 */}
          <circle cx={cx} cy={cy} r={r * 1.1} fill={glowColor}
            filter={`url(#nb-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={r}
            fill={shadowColor} opacity={0.2} />
          {/* 外圈虚线装饰环 */}
          <circle cx={cx} cy={cy} r={r * 1.05} fill="none"
            stroke={secondaryColor} strokeWidth={strokeWidth(0.6)} strokeDasharray="3 3" opacity={0.35} />
          {/* 主体层 — 渐变填充圆 */}
          <circle cx={cx} cy={cy} r={r} fill={`url(#nb-${uid})`} />
          {/* 内圈 */}
          <circle cx={cx} cy={cy} r={r * 0.8} fill="none" stroke="white" strokeWidth={strokeWidth(1)} opacity={0.3} />
          {/* 射线装饰 — 8 个方向短射线 */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const x1 = cx + r * 1.15 * Math.cos(angle);
            const y1 = cy + r * 1.15 * Math.sin(angle);
            const x2 = cx + r * 1.35 * Math.cos(angle);
            const y2 = cy + r * 1.35 * Math.sin(angle);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} strokeLinecap="round" opacity={0.35} />
            );
          })}
          {/* 高光层 — 左上弧线 */}
          <path d={`M${cx - r * 0.6},${cy - r * 0.4} A${r * 0.8},${r * 0.8} 0 0,1 ${cx + r * 0.1},${cy - r * 0.7}`}
            fill="none" stroke="white" strokeWidth={strokeWidth(1.2)} opacity={0.35} strokeLinecap="round" />
          {/* 高光层 — 右下微弧 */}
          <path d={`M${cx + r * 0.3},${cy + r * 0.5} A${r * 0.5},${r * 0.5} 0 0,0 ${cx - r * 0.2},${cy + r * 0.65}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.6)} opacity={0.25} strokeLinecap="round" />
          {/* 文字 */}
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={r * 0.9}
            fontWeight="700"
          >
            {label || "1"}
          </text>
        </>
      );
    }

    case "hot_mark": {
      // 火焰标记：多层光环 + 外部火花装饰 + gradient 内焰 + 阴影 + 光晕
      const cx = x + w / 2;
      const cy = y + h / 2;
      const s = Math.min(w, h) * 0.42;
      // 多层火焰轮廓
      const flameD = [
        `M${cx},${cy - s}`,
        `C${cx + s * 0.3},${cy - s * 0.5} ${cx + s * 0.8},${cy - s * 0.3} ${cx + s * 0.6},${cy + s * 0.2}`,
        `C${cx + s * 0.9},${cy + s * 0.1} ${cx + s * 0.7},${cy + s * 0.7} ${cx + s * 0.3},${cy + s * 0.85}`,
        `C${cx + s * 0.15},${cy + s * 0.95} ${cx - s * 0.15},${cy + s * 0.95} ${cx - s * 0.3},${cy + s * 0.85}`,
        `C${cx - s * 0.7},${cy + s * 0.7} ${cx - s * 0.9},${cy + s * 0.1} ${cx - s * 0.6},${cy + s * 0.2}`,
        `C${cx - s * 0.8},${cy - s * 0.3} ${cx - s * 0.3},${cy - s * 0.5} ${cx},${cy - s}`,
      ].join(" ");
      return (
        <>
          <defs>
            {createLinearGradient(`hm-${uid}`, "vertical_reverse", [
              { offset: "0%", color: color },
              { offset: "40%", color: "#FF8C00" },
              { offset: "100%", color: secondaryColor },
            ])}
            {createLinearGradient(`hm-inner-${uid}`, "vertical_reverse", [
              { offset: "0%", color: "#FFD700" },
              { offset: "60%", color: secondaryColor },
              { offset: "100%", color: "#FF8C00" },
            ])}
            {createFilter(`hm-glow-${uid}`, "glow-strong", { stdDeviation: 3 })}
          </defs>
          {/* 光晕层 — 外部光环 */}
          <ellipse cx={cx} cy={cy + s * 0.3} rx={s * 1.05} ry={s * 0.85}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(2)}
            filter={`url(#hm-glow-${uid})`} opacity={0.25} />
          {/* 热浪光环 — 第一层 */}
          <ellipse cx={cx} cy={cy + s * 0.3} rx={s * 0.85} ry={s * 0.65}
            fill="none" stroke={color} strokeWidth={strokeWidth(1)} strokeDasharray="4 3" opacity={0.3} />
          {/* 热浪光环 — 第二层 */}
          <ellipse cx={cx} cy={cy + s * 0.25} rx={s * 0.7} ry={s * 0.5}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.5)} strokeDasharray="2 4" opacity={0.2} />
          {/* 阴影层 */}
          <path d={flameD} fill={shadowColor} opacity={0.2}
            transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 火焰主体 */}
          <path d={flameD} fill={`url(#hm-${uid})`} filter={`url(#hm-glow-${uid})`} />
          {/* 内焰高光 — 渐变填充 */}
          <path d={`M${cx},${cy - s * 0.45} C${cx + s * 0.15},${cy - s * 0.15} ${cx + s * 0.3},${cy + s * 0.15} ${cx + s * 0.12},${cy + s * 0.45} C${cx + s * 0.05},${cy + s * 0.5} ${cx - s * 0.05},${cy + s * 0.5} ${cx - s * 0.12},${cy + s * 0.45} C${cx - s * 0.3},${cy + s * 0.15} ${cx - s * 0.15},${cy - s * 0.15} ${cx},${cy - s * 0.45}`}
            fill={`url(#hm-inner-${uid})`} opacity={0.5} />
          {/* 外部火花/小点装饰 */}
          {[
            { fx: -0.85, fy: -0.6, r: 0.04 },
            { fx: 0.9, fy: -0.5, r: 0.035 },
            { fx: -0.7, fy: -0.85, r: 0.03 },
            { fx: 0.75, fy: -0.8, r: 0.025 },
            { fx: -0.95, fy: 0.1, r: 0.03 },
            { fx: 0.95, fy: 0.15, r: 0.03 },
          ].map((dot, i) => (
            <circle key={i} cx={cx + s * dot.fx} cy={cy + s * dot.fy}
              r={Math.max(1.5, s * dot.r)} fill={color} opacity={0.5 + i * 0.05} />
          ))}
          {/* 文字 */}
          <text x={cx} y={cy + s * 0.2} textAnchor="middle" dominantBaseline="central"
            fill="white" fontSize={fontSize * 0.7} fontWeight="700">
            {label || "HOT"}
          </text>
        </>
      );
    }

    case "star_rating": {
      // 星级评分：gradient 星星 + 光晕 + 阴影层 + 高光 + 细节装饰
      const starCount = clamp(parseInt(label) || 5, 1, 5);
      const starSize = Math.min(w / (starCount + 0.5), h * 0.6);
      const gap = starSize * 0.15;
      const totalW = starCount * starSize + (starCount - 1) * gap;
      const startX = x + (w - totalW) / 2 + starSize / 2;
      const cy = y + h * 0.42;
      const outerR = starSize * 0.48;
      const innerR = outerR * 0.4;
      return (
        <>
          <defs>
            {createLinearGradient(`str-${uid}`, "horizontal_center", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`str-glow-${uid}`, "glow-strong", { stdDeviation: outerR * 0.15 })}
          </defs>
          {/* 背景光晕 — 椭圆发光区 */}
          <ellipse cx={x + w / 2} cy={cy} rx={totalW * 0.55} ry={starSize * 0.5}
            fill={glowColor} filter={`url(#str-glow-${uid})`} opacity={0.15} />
          {/* 背景阴影 */}
          <ellipse cx={x + w / 2} cy={cy} rx={totalW * 0.55} ry={starSize * 0.5}
            fill={shadowColor} opacity={0.12} />
          {Array.from({ length: starCount }).map((_, i) => {
            const sx = startX + i * (starSize + gap);
            const sp = starPath(sx, cy, outerR, innerR, 5);
            return (
              <g key={i}>
                {/* 光晕层 — 发光底层 */}
                <path d={sp} fill={glowColor} filter={`url(#str-glow-${uid})`} opacity={0.6} />
                {/* 阴影层 */}
                <path d={sp} fill={shadowColor} opacity={0.25}
                  transform={`translate(${w * 0.005},${h * 0.01})`} />
                {/* 主体层 — 渐变填充 */}
                <path d={sp} fill={`url(#str-${uid})`} />
                {/* 主体层 — 描边增强 */}
                <path d={sp} fill="none" stroke={color} strokeWidth={strokeWidth(0.3)} opacity={0.4} />
                {/* 高光层 — 左上高光 */}
                <path d={starPath(sx - outerR * 0.08, cy - outerR * 0.08, outerR * 0.55, innerR * 0.5, 5)}
                  fill={secondaryColor} opacity={0.45} />
                {/* 细节装饰 — 星尖小点 */}
                {Array.from({ length: 5 }).map((_, j) => {
                  const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
                  const dotX = sx + outerR * 1.15 * Math.cos(a);
                  const dotY = cy + outerR * 1.15 * Math.sin(a);
                  return (
                    <circle key={j} cx={dotX} cy={dotY} r={Math.max(0.8, outerR * 0.06)}
                      fill={secondaryColor} opacity={0.35} />
                  );
                })}
              </g>
            );
          })}
          {/* 高光层 — 底部装饰线 */}
          <line x1={x + w * 0.2} y1={cy + outerR * 1.2} x2={x + w * 0.8} y2={cy + outerR * 1.2}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.25} strokeLinecap="round" />
          {/* 底部评分文字 */}
          <text x={x + w / 2} y={cy + outerR + fontSize * 1.1} textAnchor="middle"
            fill={color} fontSize={fontSize * 0.75} fontWeight="700">
            {label || "5.0"}
          </text>
        </>
      );
    }

    // ================================================================
    // 装饰类（Decoration）
    // ================================================================

    case "dot_pattern": {
      // 圆点装饰：渐变圆点 + 连接线 + 背景光晕 + 大小变化 + 多透明度层次
      const dots = [
        { fx: 0.12, fy: 0.2, r: 0.035 },
        { fx: 0.35, fy: 0.12, r: 0.05 },
        { fx: 0.62, fy: 0.18, r: 0.028 },
        { fx: 0.88, fy: 0.3, r: 0.042 },
        { fx: 0.2, fy: 0.5, r: 0.048 },
        { fx: 0.5, fy: 0.45, r: 0.03 },
        { fx: 0.78, fy: 0.55, r: 0.038 },
        { fx: 0.15, fy: 0.78, r: 0.04 },
        { fx: 0.42, fy: 0.82, r: 0.032 },
        { fx: 0.7, fy: 0.75, r: 0.045 },
        { fx: 0.9, fy: 0.85, r: 0.025 },
      ];
      // 连接线：相邻点之间的淡线
      const connections = [
        [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [6, 3],
        [4, 7], [5, 8], [6, 9], [7, 8], [8, 9], [9, 10],
      ];
      const dotPositions = dots.map(d => ({
        cx: x + w * d.fx, cy: y + h * d.fy,
        cr: Math.max(2, Math.min(w, h) * d.r),
      }));
      return (
        <>
          <defs>
            {createLinearGradient(`dp-${uid}`, "diagonal", [
              { offset: "0%", color: colorWithAlpha(color, 0.6) },
              { offset: "50%", color: secondaryColor },
              { offset: "100%", color: colorWithAlpha(color, 0.6) },
            ])}
            {createFilter(`dp-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 背景大光晕 */}
          <circle cx={x + w * 0.5} cy={y + h * 0.45} r={Math.min(w, h) * 0.35}
            fill={glowColor} filter={`url(#dp-glow-${uid})`} opacity={0.12} />
          {/* 连接线 */}
          {connections.map(([a, b], i) => (
            <line key={`conn-${i}`}
              x1={dotPositions[a].cx} y1={dotPositions[a].cy}
              x2={dotPositions[b].cx} y2={dotPositions[b].cy}
              stroke={color} strokeWidth={strokeWidth(0.6)} opacity={0.12 + (i % 3) * 0.04}
              strokeLinecap="round" />
          ))}
          {dotPositions.map((d, i) => (
            <g key={i}>
              {/* 光晕层 */}
              <circle cx={d.cx} cy={d.cy} r={d.cr * 3}
                fill={glowColor} opacity={0.08 + (i % 4) * 0.03} />
              {/* 阴影层 */}
              <circle cx={d.cx + w * 0.005} cy={d.cy + h * 0.01}
                r={d.cr} fill={shadowColor} opacity={0.18} />
              {/* 主体渐变圆 */}
              <circle cx={d.cx} cy={d.cy} r={d.cr}
                fill={`url(#dp-${uid})`}
                opacity={0.65 + (i % 3) * 0.1} />
              {/* 外环装饰（大圆） */}
              {d.cr > Math.min(w, h) * 0.035 && (
                <circle cx={d.cx} cy={d.cy} r={d.cr * 1.6}
                  fill="none" stroke={secondaryColor}
                  strokeWidth={strokeWidth(0.4)} opacity={0.25} />
              )}
              {/* 高光层 */}
              <circle cx={d.cx - d.cr * 0.28} cy={d.cy - d.cr * 0.28}
                r={d.cr * 0.3} fill="white" opacity={0.38} />
            </g>
          ))}
        </>
      );
    }

    case "wave_line": {
      // 波浪线：5 条渐变波浪 + 透明度梯度 + 波峰/波谷装饰圆点 + 光晕层
      const amplitude = h * 0.1;
      // 波峰/波谷位置（每条波浪的 1/4 和 3/4 处）
      const wavePeaks = [
        { fx: 0.25, fy: 0.2 }, { fx: 0.75, fy: 0.2 },
        { fx: 0.25, fy: 0.4 }, { fx: 0.75, fy: 0.4 },
        { fx: 0.5, fy: 0.5 },
      ];
      return (
        <>
          <defs>
            {createLinearGradient(`wl-${uid}`, "horizontal", [
              { offset: "0%", color: colorWithAlpha(color, 0.3) },
              { offset: "50%", color: color },
              { offset: "100%", color: colorWithAlpha(secondaryColor, 0.3) },
            ])}
            {createLinearGradient(`wl2-${uid}`, "horizontal", [
              { offset: "0%", color: colorWithAlpha(secondaryColor, 0.2) },
              { offset: "50%", color: secondaryColor },
              { offset: "100%", color: colorWithAlpha(secondaryColor, 0.2) },
            ])}
            {createFilter(`wl-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {[0, 1, 2, 3, 4].map((i) => {
            const fy = 0.2 + i * 0.15;
            const amp = amplitude * (1 - Math.abs(i - 2) * 0.15);
            const d = `M${x},${y + h * fy} C${x + w * 0.25},${y + h * fy - amp} ${x + w * 0.35},${y + h * fy + amp} ${x + w * 0.5},${y + h * fy} C${x + w * 0.65},${y + h * fy - amp} ${x + w * 0.75},${y + h * fy + amp} ${x + w},${y + h * fy}`;
            // 中间线最粗最亮，边缘线细淡
            const isCenter = i === 2;
            const lineOpacity = isCenter ? 1 : 0.4 + (2 - Math.abs(i - 2)) * 0.2;
            const lineColor = isCenter ? color : secondaryColor;
            const grad = isCenter ? `url(#wl-${uid})` : `url(#wl2-${uid})`;
            return (
              <g key={i}>
                {/* 光晕层 */}
                <path d={d} fill="none" stroke={glowColor}
                  strokeWidth={strokeWidth(isCenter ? 3 : 1.5)} strokeLinecap="round"
                  filter={`url(#wl-glow-${uid})`} opacity={0.25} />
                {/* 阴影层 */}
                <path d={d} fill="none" stroke={shadowColor}
                  strokeWidth={strokeWidth(isCenter ? 2.5 : 1)}
                  strokeLinecap="round" opacity={0.15}
                  transform={`translate(${w * 0.005},${h * 0.01})`} />
                {/* 主体渐变波浪 */}
                <path d={d} fill="none" stroke={grad}
                  strokeWidth={strokeWidth(isCenter ? 2.5 : 1.2)}
                  strokeLinecap="round" opacity={lineOpacity} />
                {/* 高光层 */}
                <path d={d} fill="none" stroke={secondaryColor}
                  strokeWidth={strokeWidth(0.5)} strokeLinecap="round" opacity={0.3} />
              </g>
            );
          })}
          {/* 波峰/波谷装饰圆点 */}
          {wavePeaks.map((p, i) => (
            <g key={`peak-${i}`}>
              <circle cx={x + w * p.fx} cy={y + h * p.fy}
                r={strokeWidth(3)} fill={glowColor} opacity={0.2} />
              <circle cx={x + w * p.fx} cy={y + h * p.fy}
                r={Math.max(1.5, strokeWidth(1.2))} fill={secondaryColor} opacity={0.6} />
              <circle cx={x + w * p.fx - 0.5} cy={y + h * p.fy - 0.5}
                r={Math.max(0.8, strokeWidth(0.5))} fill="white" opacity={0.45} />
            </g>
          ))}
        </>
      );
    }

    case "geometric_shape": {
      // 几何图形：3D 菱形 + 多层内部图案 + gradient 装饰线 + 周围小点装饰 + 扩展光晕
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w * 0.38;
      const ry = h * 0.38;
      const pts = `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;
      // 周围装饰小点
      const decorDots = [
        { dx: -0.52, dy: -0.52 }, { dx: 0.52, dy: -0.52 },
        { dx: -0.52, dy: 0.52 }, { dx: 0.52, dy: 0.52 },
        { dx: -0.6, dy: 0 }, { dx: 0.6, dy: 0 },
        { dx: 0, dy: -0.6 }, { dx: 0, dy: 0.6 },
      ];
      return (
        <>
          <defs>
            {createLinearGradient(`gs-${uid}`, "diagonal", [
              { offset: "0%", color: colorWithAlpha(secondaryColor, 0.35) },
              { offset: "50%", color: colorWithAlpha(color, 0.2) },
              { offset: "100%", color: colorWithAlpha(secondaryColor, 0.35) },
            ])}
            {createLinearGradient(`gs-line-${uid}`, "horizontal", [
              { offset: "0%", color: colorWithAlpha(color, 0.3) },
              { offset: "50%", color: color },
              { offset: "100%", color: colorWithAlpha(color, 0.3) },
            ])}
            {createFilter(`gs-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 扩展光晕 */}
          <polygon points={pts} fill="none" stroke={glowColor}
            strokeWidth={strokeWidth(3.5)} filter={`url(#gs-glow-${uid})`} opacity={0.3} />
          {/* 阴影层 */}
          <polygon points={pts} fill="none" stroke={shadowColor}
            strokeWidth={strokeWidth(1.5)} opacity={0.2}
            transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 渐变填充 */}
          <polygon points={pts} fill={`url(#gs-${uid})`} />
          {/* 菱形轮廓 */}
          <polygon points={pts} fill="none" stroke={`url(#gs-line-${uid})`}
            strokeWidth={strokeWidth(2)} />
          {/* 内部对角线（X 形） */}
          <line x1={cx - rx * 0.7} y1={cy - ry * 0.7} x2={cx + rx * 0.7} y2={cy + ry * 0.7}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.6)} opacity={0.25} />
          <line x1={cx + rx * 0.7} y1={cy - ry * 0.7} x2={cx - rx * 0.7} y2={cy + ry * 0.7}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.6)} opacity={0.25} />
          {/* 内部装饰线 - 渐变 */}
          <line x1={cx - rx * 0.4} y1={cy - ry * 0.4} x2={cx + rx * 0.4} y2={cy - ry * 0.4}
            stroke={`url(#gs-line-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <line x1={cx - rx * 0.7} y1={cy} x2={cx + rx * 0.7} y2={cy}
            stroke={`url(#gs-line-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <line x1={cx - rx * 0.4} y1={cy + ry * 0.4} x2={cx + rx * 0.4} y2={cy + ry * 0.4}
            stroke={`url(#gs-line-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          {/* 内部小菱形 */}
          <polygon
            points={`${cx},${cy - ry * 0.25} ${cx + rx * 0.25},${cy} ${cx},${cy + ry * 0.25} ${cx - rx * 0.25},${cy}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          {/* 高光（上边线） */}
          <line x1={cx - rx * 0.3} y1={cy - ry * 0.65} x2={cx + rx * 0.3} y2={cy - ry * 0.65}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          {/* 周围装饰小点 */}
          {decorDots.map((dd, i) => {
            const dotR = Math.max(1.5, Math.min(w, h) * 0.012);
            return (
              <g key={`deco-${i}`}>
                <circle cx={cx + rx * dd.dx} cy={cy + ry * dd.dy}
                  r={dotR * 2.5} fill={glowColor} opacity={0.15} />
                <circle cx={cx + rx * dd.dx} cy={cy + ry * dd.dy}
                  r={dotR} fill={secondaryColor} opacity={0.5} />
              </g>
            );
          })}
          {label && (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              fill={color} fontSize={fontSize * 0.65} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "light_glow": {
      // 光晕效果：扩展射线 + gradient 射线 + 外部小点装饰 + 阴影层
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.45;
      // 12 条射线（30度间隔）+ 长短交替
      const rayAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
      // 外部装饰小点
      const outerDots = [15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345];
      return (
        <>
          <defs>
            {createRadialGradient(`lg-${uid}`, [
              { offset: "0%", color: color, opacity: 0.95 },
              { offset: "35%", color: secondaryColor, opacity: 0.5 },
              { offset: "70%", color: color, opacity: 0.15 },
              { offset: "100%", color: secondaryColor, opacity: 0 },
            ])}
            {createLinearGradient(`lg-ray-${uid}`, "vertical", [
              { offset: "0%", color: colorWithAlpha(color, 0.5) },
              { offset: "100%", color: colorWithAlpha(color, 0) },
            ])}
            {createFilter(`lg-glow-${uid}`, "glow", { stdDeviation: 3 })}
          </defs>
          {/* 阴影层 */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={r * 1.3}
            fill={shadowColor} opacity={0.1} />
          {/* 外层扩展光晕 */}
          <circle cx={cx} cy={cy} r={r * 1.5}
            fill={glowColor} filter={`url(#lg-glow-${uid})`} opacity={0.15} />
          {/* 中层光晕 */}
          <circle cx={cx} cy={cy} r={r * 1.2} fill={glowColor} opacity={0.1} />
          {/* 主光晕 */}
          <circle cx={cx} cy={cy} r={r} fill={`url(#lg-${uid})`} />
          {/* 12 条射线（长短交替） */}
          {rayAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const isLong = deg % 60 === 0;
            const innerR = r * 0.15;
            const outerR = isLong ? r * 0.95 : r * 0.65;
            return (
              <line key={deg}
                x1={cx + innerR * Math.cos(rad)}
                y1={cy + innerR * Math.sin(rad)}
                x2={cx + outerR * Math.cos(rad)}
                y2={cy + outerR * Math.sin(rad)}
                stroke={color}
                strokeWidth={strokeWidth(isLong ? 1.5 : 0.8)}
                opacity={isLong ? 0.3 : 0.15}
                strokeLinecap="round" />
            );
          })}
          {/* 外部装饰小点 */}
          {outerDots.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const dotR = Math.max(1.5, r * 0.04);
            return (
              <g key={`od-${deg}`}>
                <circle cx={cx + r * 1.15 * Math.cos(rad)} cy={cy + r * 1.15 * Math.sin(rad)}
                  r={dotR * 2} fill={glowColor} opacity={0.2} />
                <circle cx={cx + r * 1.15 * Math.cos(rad)} cy={cy + r * 1.15 * Math.sin(rad)}
                  r={dotR} fill={secondaryColor} opacity={0.5} />
              </g>
            );
          })}
          {/* 中心亮点 */}
          <circle cx={cx} cy={cy} r={r * 0.15} fill={color} opacity={0.9} />
          <circle cx={cx} cy={cy} r={r * 0.08} fill="white" opacity={0.7} />
          {/* 高光十字 */}
          <line x1={cx - r * 0.06} y1={cy} x2={cx + r * 0.06} y2={cy}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.4} />
          <line x1={cx} y1={cy - r * 0.06} x2={cx} y2={cy + r * 0.06}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.4} />
        </>
      );
    }

    case "sparkle": {
      // 闪光装饰：4 角星 + 扩展小星数量 + gradient 填充 + 射线装饰 + 光晕扩展
      const cx = x + w / 2;
      const cy = y + h / 2;
      const mainR = Math.min(w, h) * 0.32;
      // 8 条射线（45度间隔）
      const rayAngles = [0, 45, 90, 135, 180, 225, 270, 315];
      return (
        <>
          <defs>
            {createLinearGradient(`sp-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createLinearGradient(`sp-ray-${uid}`, "vertical", [
              { offset: "0%", color: colorWithAlpha(color, 0.5) },
              { offset: "100%", color: colorWithAlpha(color, 0) },
            ])}
            {createFilter(`sp-glow-${uid}`, "glow", { stdDeviation: 3 })}
          </defs>
          {/* 扩展光晕层 */}
          <circle cx={cx} cy={cy} r={mainR * 1.2}
            fill={glowColor} filter={`url(#sp-glow-${uid})`} opacity={0.25} />
          {/* 阴影层 */}
          <polygon
            points={`${cx + w * 0.005},${cy - mainR + h * 0.01} ${cx + mainR * 0.2 + w * 0.005},${cy + h * 0.01} ${cx + w * 0.005},${cy + mainR + h * 0.01}`}
            fill={shadowColor} opacity={0.18} />
          <polygon
            points={`${cx - mainR + w * 0.005},${cy + h * 0.01} ${cx + w * 0.005},${cy - mainR * 0.2 + h * 0.01} ${cx + mainR + w * 0.005},${cy + h * 0.01}`}
            fill={shadowColor} opacity={0.18} />
          {/* 中心光晕 */}
          <circle cx={cx} cy={cy} r={mainR * 0.8}
            fill={glowColor} opacity={0.3} />
          {/* 射线装饰 */}
          {rayAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const isMain = deg % 90 === 0;
            return (
              <line key={`ray-${deg}`}
                x1={cx + mainR * 0.25 * Math.cos(rad)}
                y1={cy + mainR * 0.25 * Math.sin(rad)}
                x2={cx + mainR * (isMain ? 1.1 : 0.8) * Math.cos(rad)}
                y2={cy + mainR * (isMain ? 1.1 : 0.8) * Math.sin(rad)}
                stroke={color}
                strokeWidth={strokeWidth(isMain ? 1 : 0.5)}
                opacity={isMain ? 0.35 : 0.18}
                strokeLinecap="round" />
            );
          })}
          {/* 主 4 角星 */}
          <polygon
            points={`${cx},${cy - mainR} ${cx + mainR * 0.2},${cy} ${cx},${cy + mainR}`}
            fill={`url(#sp-${uid})`} opacity={0.9} />
          <polygon
            points={`${cx - mainR},${cy} ${cx},${cy - mainR * 0.2} ${cx + mainR},${cy}`}
            fill={`url(#sp-${uid})`} opacity={0.9} />
          {/* 中心白点 */}
          <circle cx={cx} cy={cy} r={mainR * 0.08} fill="white" opacity={0.9} />
          {/* 扩展小星（6 个） */}
          {[
            { fx: 0.12, fy: 0.18, s: 0.5 },
            { fx: 0.85, fy: 0.15, s: 0.4 },
            { fx: 0.78, fy: 0.8, s: 0.45 },
            { fx: 0.2, fy: 0.82, s: 0.35 },
            { fx: 0.92, fy: 0.55, s: 0.3 },
            { fx: 0.08, fy: 0.5, s: 0.32 },
          ].map((star, i) => {
            const sx = x + w * star.fx;
            const sy = y + h * star.fy;
            const sr = mainR * star.s;
            return (
              <g key={i}>
                {/* 小星光晕 */}
                <circle cx={sx} cy={sy} r={sr * 0.5}
                  fill={glowColor} opacity={0.2} />
                {/* 小星主体 */}
                <circle cx={sx} cy={sy} r={Math.max(2, sr * 0.22)}
                  fill={`url(#sp-${uid})`} opacity={0.65} />
                {/* 小星高光 */}
                <circle cx={sx - 0.5} cy={sy - 0.5} r={Math.max(1, sr * 0.09)}
                  fill="white" opacity={0.5} />
              </g>
            );
          })}
        </>
      );
    }

    // ================================================================
    // 版式装饰类（Layout Decoration - 杂志/海报风格）
    // ================================================================

    case "divider_line": {
      // 精致分割线：光晕 + 阴影 + 渐变主体 + gradient 菱形 + 多层装饰点
      const isHorizontal = w > h;
      const lineThickness = strokeWidth(1.5);
      const diamondSize = Math.max(3, lineThickness * 2.5);
      const midX = x + w / 2;
      const midY = y + h / 2;
      return (
        <>
          <defs>
            {createLinearGradient(`dl-${uid}`, isHorizontal ? "horizontal" : "vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createLinearGradient(`dl-diamond-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`dl-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 第1层：光晕线 */}
          {isHorizontal ? (
            <line x1={x} y1={midY} x2={x + w} y2={midY}
              stroke={glowColor} filter={`url(#dl-glow-${uid})`} strokeWidth={lineThickness * 2} opacity={0.3} strokeLinecap="round" />
          ) : (
            <line x1={midX} y1={y} x2={midX} y2={y + h}
              stroke={glowColor} filter={`url(#dl-glow-${uid})`} strokeWidth={lineThickness * 2} opacity={0.3} strokeLinecap="round" />
          )}
          {/* 第2层：阴影线（微偏移） */}
          {isHorizontal ? (
            <line x1={x + w * 0.005} y1={midY + h * 0.01} x2={x + w * 0.995} y2={midY + h * 0.01}
              stroke={shadowColor} strokeWidth={lineThickness} opacity={0.2} />
          ) : (
            <line x1={midX + w * 0.005} y1={y + h * 0.005} x2={midX + w * 0.005} y2={y + h * 0.995}
              stroke={shadowColor} strokeWidth={lineThickness} opacity={0.2} />
          )}
          {/* 第3层：主体渐变线 */}
          {isHorizontal ? (
            <line x1={x} y1={midY} x2={x + w} y2={midY}
              stroke={`url(#dl-${uid})`} strokeWidth={lineThickness} strokeLinecap="round" />
          ) : (
            <line x1={midX} y1={y} x2={midX} y2={y + h}
              stroke={`url(#dl-${uid})`} strokeWidth={lineThickness} strokeLinecap="round" />
          )}
          {/* 第4层：中心 gradient 菱形 + 外框 */}
          <polygon
            points={`${midX},${midY - diamondSize} ${midX + diamondSize},${midY} ${midX},${midY + diamondSize} ${midX - diamondSize},${midY}`}
            fill={`url(#dl-diamond-${uid})`} opacity={0.9} />
          <polygon
            points={`${midX},${midY - diamondSize * 1.4} ${midX + diamondSize * 1.4},${midY} ${midX},${midY + diamondSize * 1.4} ${midX - diamondSize * 1.4},${midY}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.4)} opacity={0.35} />
          {/* 第5层：中间段装饰小点 */}
          {isHorizontal ? (
            <>
              <circle cx={x + w * 0.25} cy={midY} r={strokeWidth(0.8)} fill={color} opacity={0.4} />
              <circle cx={x + w * 0.35} cy={midY} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
              <circle cx={x + w * 0.65} cy={midY} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
              <circle cx={x + w * 0.75} cy={midY} r={strokeWidth(0.8)} fill={color} opacity={0.4} />
            </>
          ) : (
            <>
              <circle cx={midX} cy={y + h * 0.25} r={strokeWidth(0.8)} fill={color} opacity={0.4} />
              <circle cx={midX} cy={y + h * 0.35} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
              <circle cx={midX} cy={y + h * 0.65} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
              <circle cx={midX} cy={y + h * 0.75} r={strokeWidth(0.8)} fill={color} opacity={0.4} />
            </>
          )}
          {/* 第6层：高光线 */}
          {isHorizontal ? (
            <line x1={x + w * 0.1} y1={midY - 0.5} x2={x + w * 0.9} y2={midY - 0.5}
              stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.35} />
          ) : (
            <line x1={midX - 0.5} y1={y + h * 0.1} x2={midX - 0.5} y2={y + h * 0.9}
              stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.35} />
          )}
          {/* 两端圆点（外圈光晕 + 内圈实心） */}
          {isHorizontal ? (
            <>
              <circle cx={x + w * 0.02} cy={midY} r={strokeWidth(3)} fill={glowColor} opacity={0.2} />
              <circle cx={x + w * 0.02} cy={midY} r={strokeWidth(1.8)} fill={color} opacity={0.6} />
              <circle cx={x + w * 0.98} cy={midY} r={strokeWidth(3)} fill={glowColor} opacity={0.2} />
              <circle cx={x + w * 0.98} cy={midY} r={strokeWidth(1.8)} fill={color} opacity={0.6} />
            </>
          ) : (
            <>
              <circle cx={midX} cy={y + h * 0.02} r={strokeWidth(3)} fill={glowColor} opacity={0.2} />
              <circle cx={midX} cy={y + h * 0.02} r={strokeWidth(1.8)} fill={color} opacity={0.6} />
              <circle cx={midX} cy={y + h * 0.98} r={strokeWidth(3)} fill={glowColor} opacity={0.2} />
              <circle cx={midX} cy={y + h * 0.98} r={strokeWidth(1.8)} fill={color} opacity={0.6} />
            </>
          )}
        </>
      );
    }

    case "corner_ornament": {
      // 花饰角框：光晕滤镜 + 四角曲线 + gradient 菱形 + 虚线连接 + 阴影
      const cornerLen = Math.min(w, h) * 0.15;
      const innerGap = strokeWidth(4);
      const diamondR = Math.max(2, strokeWidth(2.5));
      const midX = x + w / 2;
      const midY = y + h / 2;
      return (
        <>
          <defs>
            {createLinearGradient(`co-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`co-diamond-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`co-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 整体阴影层（四角曲线偏移） */}
          <path d={`M ${x + w * 0.005},${y + h * 0.01 + cornerLen} Q ${x + w * 0.005},${y + h * 0.01} ${x + w * 0.005 + cornerLen},${y + h * 0.01}`}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.2} />
          <path d={`M ${x + w * 0.995 - cornerLen},${y + h * 0.01} Q ${x + w * 0.995},${y + h * 0.01} ${x + w * 0.995},${y + h * 0.01 + cornerLen}`}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.2} />
          <path d={`M ${x + w * 0.005},${y + h * 0.99 - cornerLen} Q ${x + w * 0.005},${y + h * 0.99} ${x + w * 0.005 + cornerLen},${y + h * 0.99}`}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.2} />
          <path d={`M ${x + w * 0.995 - cornerLen},${y + h * 0.99} Q ${x + w * 0.995},${y + h * 0.99} ${x + w * 0.995},${y + h * 0.99 - cornerLen}`}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} strokeLinecap="round" opacity={0.2} />
          {/* 光晕层（四角曲线光晕） */}
          <path d={`M ${x},${y + cornerLen} Q ${x},${y} ${x + cornerLen},${y}`}
            fill="none" stroke={glowColor} filter={`url(#co-glow-${uid})`} strokeWidth={strokeWidth(3)} opacity={0.3} strokeLinecap="round" />
          <path d={`M ${x + w - cornerLen},${y} Q ${x + w},${y} ${x + w},${y + cornerLen}`}
            fill="none" stroke={glowColor} filter={`url(#co-glow-${uid})`} strokeWidth={strokeWidth(3)} opacity={0.3} strokeLinecap="round" />
          <path d={`M ${x},${y + h - cornerLen} Q ${x},${y + h} ${x + cornerLen},${y + h}`}
            fill="none" stroke={glowColor} filter={`url(#co-glow-${uid})`} strokeWidth={strokeWidth(3)} opacity={0.3} strokeLinecap="round" />
          <path d={`M ${x + w - cornerLen},${y + h} Q ${x + w},${y + h} ${x + w},${y + h - cornerLen}`}
            fill="none" stroke={glowColor} filter={`url(#co-glow-${uid})`} strokeWidth={strokeWidth(3)} opacity={0.3} strokeLinecap="round" />
          {/* 左上角 - 外线 */}
          <path d={`M ${x},${y + cornerLen} Q ${x},${y} ${x + cornerLen},${y}`}
            fill="none" stroke={`url(#co-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          {/* 左上角 - 内线 */}
          <path d={`M ${x + innerGap},${y + cornerLen - innerGap} Q ${x + innerGap},${y + innerGap} ${x + cornerLen - innerGap},${y + innerGap}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(1)} strokeLinecap="round" opacity={0.5} />
          {/* 左上角 - gradient 菱形 */}
          <polygon points={`${x},${y + diamondR * 2} ${x + diamondR},${y} ${x + diamondR * 2},${y + diamondR} ${x + diamondR},${y + diamondR * 2}`}
            fill={`url(#co-diamond-${uid})`} opacity={0.8} />
          {/* 右上角 - 外线 */}
          <path d={`M ${x + w - cornerLen},${y} Q ${x + w},${y} ${x + w},${y + cornerLen}`}
            fill="none" stroke={`url(#co-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          {/* 右上角 - 内线 */}
          <path d={`M ${x + w - cornerLen + innerGap},${y + innerGap} Q ${x + w - innerGap},${y + innerGap} ${x + w - innerGap},${y + cornerLen - innerGap}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(1)} strokeLinecap="round" opacity={0.5} />
          {/* 右上角 - gradient 菱形 */}
          <polygon points={`${x + w - diamondR * 2},${y + diamondR} ${x + w - diamondR},${y} ${x + w},${y + diamondR} ${x + w - diamondR},${y + diamondR * 2}`}
            fill={`url(#co-diamond-${uid})`} opacity={0.8} />
          {/* 左下角 - 外线 */}
          <path d={`M ${x},${y + h - cornerLen} Q ${x},${y + h} ${x + cornerLen},${y + h}`}
            fill="none" stroke={`url(#co-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          {/* 左下角 - 内线 */}
          <path d={`M ${x + innerGap},${y + h - cornerLen + innerGap} Q ${x + innerGap},${y + h - innerGap} ${x + cornerLen - innerGap},${y + h - innerGap}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(1)} strokeLinecap="round" opacity={0.5} />
          {/* 左下角 - gradient 菱形 */}
          <polygon points={`${x},${y + h - diamondR * 2} ${x + diamondR},${y + h - diamondR} ${x + diamondR * 2},${y + h - diamondR} ${x + diamondR},${y + h - diamondR * 2}`}
            fill={`url(#co-diamond-${uid})`} opacity={0.8} />
          {/* 右下角 - 外线 */}
          <path d={`M ${x + w - cornerLen},${y + h} Q ${x + w},${y + h} ${x + w},${y + h - cornerLen}`}
            fill="none" stroke={`url(#co-${uid})`} strokeWidth={strokeWidth(2)} strokeLinecap="round" />
          {/* 右下角 - 内线 */}
          <path d={`M ${x + w - cornerLen + innerGap},${y + h - innerGap} Q ${x + w - innerGap},${y + h - innerGap} ${x + w - innerGap},${y + h - cornerLen + innerGap}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(1)} strokeLinecap="round" opacity={0.5} />
          {/* 右下角 - gradient 菱形 */}
          <polygon points={`${x + w - diamondR * 2},${y + h - diamondR} ${x + w - diamondR},${y + h - diamondR * 2} ${x + w},${y + h - diamondR} ${x + w - diamondR},${y + h}`}
            fill={`url(#co-diamond-${uid})`} opacity={0.8} />
          {/* 四角间虚线连接（上、右、下、左） */}
          <line x1={x + cornerLen + diamondR} y1={y} x2={x + w - cornerLen - diamondR} y2={y}
            stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.25} strokeDasharray={`${strokeWidth(2)},${strokeWidth(3)}`} />
          <line x1={x + w} y1={y + cornerLen + diamondR} x2={x + w} y2={y + h - cornerLen - diamondR}
            stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.25} strokeDasharray={`${strokeWidth(2)},${strokeWidth(3)}`} />
          <line x1={x + cornerLen + diamondR} y1={y + h} x2={x + w - cornerLen - diamondR} y2={y + h}
            stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.25} strokeDasharray={`${strokeWidth(2)},${strokeWidth(3)}`} />
          <line x1={x} y1={y + cornerLen + diamondR} x2={x} y2={y + h - cornerLen - diamondR}
            stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.25} strokeDasharray={`${strokeWidth(2)},${strokeWidth(3)}`} />
          {/* 四边中点装饰小菱形 */}
          <polygon points={`${midX},${y + diamondR * 0.6} ${midX + diamondR * 0.6},${y} ${midX},${y - diamondR * 0.6} ${midX - diamondR * 0.6},${y}`}
            fill={secondaryColor} opacity={0.35} />
          <polygon points={`${midX},${y + h + diamondR * 0.6} ${midX + diamondR * 0.6},${y + h} ${midX},${y + h - diamondR * 0.6} ${midX - diamondR * 0.6},${y + h}`}
            fill={secondaryColor} opacity={0.35} />
        </>
      );
    }

    case "quote_mark": {
      // 引号装饰：背景光晕 + gradient 描边引号 + 底部装饰线 + 阴影
      const quoteSize = Math.min(w, h) * 0.6;
      const quoteX = x + w * 0.1;
      const quoteY = y + h * 0.85;
      return (
        <>
          <defs>
            {createLinearGradient(`qm-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`qm-line-${uid}`, "horizontal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`qm-glow-${uid}`, "glow", { stdDeviation: 3 })}
          </defs>
          {/* 背景光晕 */}
          <text x={quoteX} y={quoteY}
            fill={glowColor} filter={`url(#qm-glow-${uid})`}
            fontSize={quoteSize} fontFamily="Georgia, serif" fontWeight="bold" opacity={0.4}>
            "
          </text>
          {/* 阴影引号（微偏移） */}
          <text x={quoteX + w * 0.005} y={quoteY + h * 0.01}
            fill={shadowColor} opacity={0.2}
            fontSize={quoteSize} fontFamily="Georgia, serif" fontWeight="bold">
            "
          </text>
          {/* 主体 gradient 引号 */}
          <text x={quoteX} y={quoteY}
            fill={`url(#qm-${uid})`}
            fontSize={quoteSize} fontFamily="Georgia, serif" fontWeight="bold">
            "
          </text>
          {/* 高光引号 */}
          <text x={quoteX - 0.5} y={quoteY - 0.5}
            fill={secondaryColor} opacity={0.3}
            fontSize={quoteSize} fontFamily="Georgia, serif" fontWeight="bold">
            "
          </text>
          {/* 底部装饰渐变线 */}
          <line x1={x + w * 0.05} y1={y + h * 0.92} x2={x + w * 0.7} y2={y + h * 0.92}
            stroke={`url(#qm-line-${uid})`} strokeWidth={strokeWidth(1)} strokeLinecap="round" opacity={0.4} />
          {/* 底部装饰小点 */}
          <circle cx={x + w * 0.72} cy={y + h * 0.92} r={strokeWidth(1)} fill={color} opacity={0.35} />
          <circle cx={x + w * 0.76} cy={y + h * 0.92} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.25} />
          <circle cx={x + w * 0.79} cy={y + h * 0.92} r={strokeWidth(0.4)} fill={secondaryColor} opacity={0.2} />
        </>
      );
    }

    case "border_frame": {
      // 边框线条：光晕 + 内层装饰框 + gradient 圆点 + 角落连接线
      const borderWidth = strokeWidth(2);
      const innerPadding = Math.min(w, h) * 0.05;
      const innerPadding2 = innerPadding + strokeWidth(4);
      const midX = x + w / 2;
      const midY = y + h / 2;
      return (
        <>
          <defs>
            {createLinearGradient(`bf-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`bf-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕边框 */}
          <rect x={x + innerPadding} y={y + innerPadding}
            width={w - innerPadding * 2} height={h - innerPadding * 2}
            fill="none" stroke={glowColor} filter={`url(#bf-glow-${uid})`} strokeWidth={borderWidth * 1.5} opacity={0.3}
            rx={strokeWidth(2)} ry={strokeWidth(2)} />
          {/* 阴影边框（微偏移） */}
          <rect x={x + innerPadding + w * 0.005} y={y + innerPadding + h * 0.01}
            width={w - innerPadding * 2} height={h - innerPadding * 2}
            fill="none" stroke={shadowColor} strokeWidth={borderWidth} opacity={0.2} />
          {/* 主体边框 */}
          <rect x={x + innerPadding} y={y + innerPadding}
            width={w - innerPadding * 2} height={h - innerPadding * 2}
            fill="none" stroke={`url(#bf-${uid})`} strokeWidth={borderWidth} rx={strokeWidth(2)} ry={strokeWidth(2)} />
          {/* 内层装饰框 */}
          <rect x={x + innerPadding2} y={y + innerPadding2}
            width={w - innerPadding2 * 2} height={h - innerPadding2 * 2}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.2}
            rx={strokeWidth(1)} ry={strokeWidth(1)} />
          {/* 高光边框 */}
          <rect x={x + innerPadding - 0.5} y={y + innerPadding - 0.5}
            width={w - innerPadding * 2 + 1} height={h - innerPadding * 2 + 1}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.25}
            rx={strokeWidth(2)} ry={strokeWidth(2)} />
          {/* 四角 gradient 圆点（外圈光晕 + 内圈实心） */}
          <circle cx={x + innerPadding} cy={y + innerPadding} r={strokeWidth(4)} fill={glowColor} opacity={0.2} />
          <circle cx={x + innerPadding} cy={y + innerPadding} r={strokeWidth(2.5)} fill={color} opacity={0.5} />
          <circle cx={x + w - innerPadding} cy={y + innerPadding} r={strokeWidth(4)} fill={glowColor} opacity={0.2} />
          <circle cx={x + w - innerPadding} cy={y + innerPadding} r={strokeWidth(2.5)} fill={color} opacity={0.5} />
          <circle cx={x + innerPadding} cy={y + h - innerPadding} r={strokeWidth(4)} fill={glowColor} opacity={0.2} />
          <circle cx={x + innerPadding} cy={y + h - innerPadding} r={strokeWidth(2.5)} fill={color} opacity={0.5} />
          <circle cx={x + w - innerPadding} cy={y + h - innerPadding} r={strokeWidth(4)} fill={glowColor} opacity={0.2} />
          <circle cx={x + w - innerPadding} cy={y + h - innerPadding} r={strokeWidth(2.5)} fill={color} opacity={0.5} />
          {/* 角落间连接线（上、右、下、左边中点） */}
          <line x1={midX - w * 0.08} y1={y + innerPadding} x2={midX + w * 0.08} y2={y + innerPadding}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.35} />
          <line x1={midX - w * 0.08} y1={y + h - innerPadding} x2={midX + w * 0.08} y2={y + h - innerPadding}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.35} />
          <line x1={x + innerPadding} y1={midY - h * 0.08} x2={x + innerPadding} y2={midY + h * 0.08}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.35} />
          <line x1={x + w - innerPadding} y1={midY - h * 0.08} x2={x + w - innerPadding} y2={midY + h * 0.08}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.35} />
        </>
      );
    }

    case "decorative_icon": {
      // 装饰图标：gradient 小点 + 连接弧线 + 内层装饰环 + 光晕扩展
      const cx = x + w / 2;
      const cy = y + h / 2;
      const iconR = Math.min(w, h) * 0.35;
      return (
        <>
          <defs>
            {createLinearGradient(`di-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`di-dot-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`di-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 外层扩展光晕 */}
          <circle cx={cx} cy={cy} r={iconR * 1.3}
            fill={glowColor} filter={`url(#di-glow-${uid})`} opacity={0.25} />
          {/* 阴影（微偏移） */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={iconR}
            fill={shadowColor} opacity={0.2} />
          {/* 主体渐变圆 */}
          <circle cx={cx} cy={cy} r={iconR}
            fill={`url(#di-${uid})`} />
          {/* 内层装饰环 */}
          <circle cx={cx} cy={cy} r={iconR * 0.7}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.3} />
          <circle cx={cx} cy={cy} r={iconR * 0.45}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.3)} opacity={0.2} />
          {/* 高光 */}
          <circle cx={cx - iconR * 0.2} cy={cy - iconR * 0.2} r={iconR * 0.4}
            fill={secondaryColor} opacity={0.3} />
          {/* 中心装饰 */}
          <circle cx={cx} cy={cy} r={iconR * 0.15} fill="white" opacity={0.7} />
          {/* 周围 gradient 小点 + 连接弧线 */}
          {[
            { angle: 0, dist: 1.3 },
            { angle: 72, dist: 1.25 },
            { angle: 144, dist: 1.35 },
            { angle: 216, dist: 1.2 },
            { angle: 288, dist: 1.4 },
          ].map((dot, i) => {
            const rad = dot.angle * Math.PI / 180;
            const dx = cx + iconR * dot.dist * Math.cos(rad);
            const dy = cy + iconR * dot.dist * Math.sin(rad);
            return (
              <g key={i}>
                {/* 小点光晕 */}
                <circle cx={dx} cy={dy} r={strokeWidth(2.5)}
                  fill={glowColor} opacity={0.2} />
                {/* gradient 小点 */}
                <circle cx={dx} cy={dy} r={strokeWidth(1.5)}
                  fill={`url(#di-dot-${uid})`} opacity={0.6} />
              </g>
            );
          })}
          {/* 连接弧线（相邻小点之间的弧线） */}
          <path d={`M ${cx + iconR * 1.3},${cy} A ${iconR * 1.275},${iconR * 1.275} 0 0 1 ${cx + iconR * 1.25 * Math.cos(72 * Math.PI / 180)},${cy + iconR * 1.25 * Math.sin(72 * Math.PI / 180)}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.4)} opacity={0.2} />
          <path d={`M ${cx + iconR * 1.35 * Math.cos(144 * Math.PI / 180)},${cy + iconR * 1.35 * Math.sin(144 * Math.PI / 180)} A ${iconR * 1.275},${iconR * 1.275} 0 0 1 ${cx + iconR * 1.2 * Math.cos(216 * Math.PI / 180)},${cy + iconR * 1.2 * Math.sin(216 * Math.PI / 180)}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.4)} opacity={0.2} />
          <path d={`M ${cx + iconR * 1.4 * Math.cos(288 * Math.PI / 180)},${cy + iconR * 1.4 * Math.sin(288 * Math.PI / 180)} A ${iconR * 1.35},${iconR * 1.35} 0 0 1 ${cx + iconR * 1.3},${cy}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.4)} opacity={0.2} />
        </>
      );
    }

    // ================================================================
    // 氛围装饰类（Atmosphere Decoration - 精致氛围感）
    // ================================================================

    case "feather": {
      // 小羽毛：光晕 + 分支连接处装饰小圆点 + 阴影偏移
      const cx = x + w / 2;
      const cy = y + h / 2;
      const featherLength = Math.min(w, h) * 0.7;
      return (
        <>
          <defs>
            {createLinearGradient(`ft-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`ft-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <path d={`M${cx},${cy - featherLength} Q${cx + featherLength * 0.25},${cy - featherLength * 0.35} ${cx},${cy}`}
            stroke={glowColor} strokeWidth={strokeWidth(3)} fill="none" filter={`url(#ft-glow-${uid})`} opacity={0.3} strokeLinecap="round" />
          {/* 阴影偏移 */}
          <g opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`}>
            <path d={`M${cx},${cy - featherLength} Q${cx + featherLength * 0.25},${cy - featherLength * 0.35} ${cx},${cy}`}
              stroke={shadowColor} strokeWidth={strokeWidth(2)} fill="none" />
          </g>
          {/* 羽毛主干 */}
          <path d={`M${cx},${cy - featherLength} Q${cx + featherLength * 0.25},${cy - featherLength * 0.35} ${cx},${cy}`}
            stroke={`url(#ft-${uid})`} strokeWidth={strokeWidth(2.5)} fill="none" strokeLinecap="round" />
          {/* 羽毛分支（左侧） */}
          {[0.2, 0.35, 0.5, 0.65, 0.8].map((t, i) => {
            const branchY = cy - featherLength + featherLength * t;
            return (
              <g key={`l-${i}`}>
                <path
                  d={`M${cx},${branchY} Q${cx - featherLength * 0.15},${branchY - featherLength * 0.08} ${cx - featherLength * 0.12},${branchY + featherLength * 0.05}`}
                  stroke={color} strokeWidth={strokeWidth(1)} fill="none" opacity={0.7 - i * 0.1} />
                {/* 分支连接处装饰小圆点 */}
                <circle cx={cx} cy={branchY} r={strokeWidth(0.8)} fill={secondaryColor} opacity={0.5} />
              </g>
            );
          })}
          {/* 羽毛分支（右侧） */}
          {[0.2, 0.35, 0.5, 0.65, 0.8].map((t, i) => {
            const branchY = cy - featherLength + featherLength * t;
            return (
              <path key={`r-${i}`}
                d={`M${cx},${branchY} Q${cx + featherLength * 0.15},${branchY - featherLength * 0.08} ${cx + featherLength * 0.12},${branchY + featherLength * 0.05}`}
                stroke={color} strokeWidth={strokeWidth(1)} fill="none" opacity={0.7 - i * 0.1} />
            );
          })}
          {/* 羽毛尖端 */}
          <ellipse cx={cx - featherLength * 0.02} cy={cy - featherLength + featherLength * 0.08}
            rx={featherLength * 0.03} ry={featherLength * 0.06} fill={secondaryColor} opacity={0.3} />
          {/* 底部装饰小菱形 */}
          <rect x={cx - featherLength * 0.02} y={cy + featherLength * 0.02}
            width={featherLength * 0.04} height={featherLength * 0.04} fill={secondaryColor} opacity={0.35}
            transform={`rotate(45 ${cx} ${cy + featherLength * 0.04})`} />
          {/* 高光 */}
          <path d={`M${cx + featherLength * 0.02},${cy - featherLength * 0.6} Q${cx + featherLength * 0.08},${cy - featherLength * 0.45} ${cx + featherLength * 0.04},${cy - featherLength * 0.3}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
        </>
      );
    }

    case "pen_tip": {
      // 小笔尖：光晕 + gradient 金属环 + 笔杆纹理
      const cx = x + w / 2;
      const cy = y + h * 0.35;
      const penLength = Math.min(w, h) * 0.8;
      return (
        <>
          <defs>
            {createLinearGradient(`pt-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`pt-ring-${uid}`, "horizontal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`pt-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <polygon points={`${cx},${cy + penLength * 0.15} ${cx - w * 0.25},${cy - penLength * 0.5} ${cx + w * 0.25},${cy - penLength * 0.5}`}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(2)} filter={`url(#pt-glow-${uid})`} opacity={0.3} />
          {/* 阴影偏移 */}
          <polygon points={`${cx},${cy + penLength * 0.15} ${cx - w * 0.25},${cy - penLength * 0.5} ${cx + w * 0.25},${cy - penLength * 0.5}`}
            fill={shadowColor} opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 笔尖主体 */}
          <polygon points={`${cx},${cy + penLength * 0.15} ${cx - w * 0.25},${cy - penLength * 0.5} ${cx + w * 0.25},${cy - penLength * 0.5}`}
            fill={`url(#pt-${uid})`} />
          {/* 笔尖金属环 — gradient */}
          <rect x={cx - w * 0.18} y={cy - penLength * 0.55} width={w * 0.36} height={h * 0.06}
            fill={`url(#pt-ring-${uid})`} opacity={0.85} />
          {/* 金属环装饰线 */}
          <line x1={cx - w * 0.18} y1={cy - penLength * 0.52} x2={cx + w * 0.18} y2={cy - penLength * 0.52}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.4} />
          {/* 笔杆 */}
          <rect x={cx - w * 0.12} y={y} width={w * 0.24} height={h * 0.25}
            fill={secondaryColor} opacity={0.4} />
          {/* 笔杆纹理细节 */}
          {[0.08, 0.16].map((t, i) => (
            <line key={`tex-${i}`} x1={cx - w * 0.1} y1={y + h * t} x2={cx + w * 0.1} y2={y + h * t}
              stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.3} />
          ))}
          {/* 笔尖分裂线 */}
          <line x1={cx} y1={cy - penLength * 0.45} x2={cx} y2={cy + penLength * 0.1}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.3} />
          {/* 高光 */}
          <line x1={cx - w * 0.08} y1={cy - penLength * 0.4} x2={cx - w * 0.05} y2={cy}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.35} />
        </>
      );
    }

    case "butterfly": {
      // 小蝴蝶：阴影偏移 + 扩展翅膀纹理 + 触角细节
      const cx = x + w / 2;
      const cy = y + h / 2;
      const wingSize = Math.min(w, h) * 0.35;
      return (
        <>
          <defs>
            {createLinearGradient(`bf-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`bf-glow-${uid}`, "glow", { stdDeviation: 1 })}
          </defs>
          {/* 光晕 */}
          <ellipse cx={cx} cy={cy} rx={wingSize * 1.5} ry={wingSize * 1}
            fill={glowColor} filter={`url(#bf-glow-${uid})`} opacity={0.25} />
          {/* 阴影偏移层 */}
          <g opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`}>
            <path d={`M${cx},${cy} Q${cx - wingSize},${cy - wingSize * 0.8} ${cx - wingSize * 1.1},${cy - wingSize * 0.3} Q${cx - wingSize * 0.6},${cy - wingSize * 0.1} ${cx},${cy}`}
              fill={shadowColor} />
            <path d={`M${cx},${cy} Q${cx + wingSize},${cy - wingSize * 0.8} ${cx + wingSize * 1.1},${cy - wingSize * 0.3} Q${cx + wingSize * 0.6},${cy - wingSize * 0.1} ${cx},${cy}`}
              fill={shadowColor} />
          </g>
          {/* 左上翅膀 */}
          <path d={`M${cx},${cy} Q${cx - wingSize},${cy - wingSize * 0.8} ${cx - wingSize * 1.1},${cy - wingSize * 0.3} Q${cx - wingSize * 0.6},${cy - wingSize * 0.1} ${cx},${cy}`}
            fill={`url(#bf-${uid})`} opacity={0.85} />
          {/* 右上翅膀 */}
          <path d={`M${cx},${cy} Q${cx + wingSize},${cy - wingSize * 0.8} ${cx + wingSize * 1.1},${cy - wingSize * 0.3} Q${cx + wingSize * 0.6},${cy - wingSize * 0.1} ${cx},${cy}`}
            fill={`url(#bf-${uid})`} opacity={0.85} />
          {/* 左下翅膀 */}
          <path d={`M${cx},${cy} Q${cx - wingSize * 0.7},${cy + wingSize * 0.5} ${cx - wingSize * 0.9},${cy + wingSize * 0.7} Q${cx - wingSize * 0.4},${cy + wingSize * 0.4} ${cx},${cy}`}
            fill={color} opacity={0.7} />
          {/* 右下翅膀 */}
          <path d={`M${cx},${cy} Q${cx + wingSize * 0.7},${cy + wingSize * 0.5} ${cx + wingSize * 0.9},${cy + wingSize * 0.7} Q${cx + wingSize * 0.4},${cy + wingSize * 0.4} ${cx},${cy}`}
            fill={color} opacity={0.7} />
          {/* 翅膀纹理 — 扩展圆点和线条 */}
          <circle cx={cx - wingSize * 0.7} cy={cy - wingSize * 0.35} r={wingSize * 0.1} fill={secondaryColor} opacity={0.4} />
          <circle cx={cx + wingSize * 0.7} cy={cy - wingSize * 0.35} r={wingSize * 0.1} fill={secondaryColor} opacity={0.4} />
          <circle cx={cx - wingSize * 0.5} cy={cy - wingSize * 0.2} r={wingSize * 0.05} fill={secondaryColor} opacity={0.3} />
          <circle cx={cx + wingSize * 0.5} cy={cy - wingSize * 0.2} r={wingSize * 0.05} fill={secondaryColor} opacity={0.3} />
          <circle cx={cx - wingSize * 0.55} cy={cy + wingSize * 0.45} r={wingSize * 0.05} fill={secondaryColor} opacity={0.3} />
          <circle cx={cx + wingSize * 0.55} cy={cy + wingSize * 0.45} r={wingSize * 0.05} fill={secondaryColor} opacity={0.3} />
          {/* 翅膀纹理弧线 */}
          <path d={`M${cx - wingSize * 0.4},${cy - wingSize * 0.4} Q${cx - wingSize * 0.6},${cy - wingSize * 0.25} ${cx - wingSize * 0.5},${cy - wingSize * 0.1}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
          <path d={`M${cx + wingSize * 0.4},${cy - wingSize * 0.4} Q${cx + wingSize * 0.6},${cy - wingSize * 0.25} ${cx + wingSize * 0.5},${cy - wingSize * 0.1}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
          {/* 身体 */}
          <ellipse cx={cx} cy={cy} rx={wingSize * 0.08} ry={wingSize * 0.35} fill={color} opacity={0.9} />
          {/* 触角 */}
          <path d={`M${cx - wingSize * 0.03},${cy - wingSize * 0.3} Q${cx - wingSize * 0.2},${cy - wingSize * 0.6} ${cx - wingSize * 0.25},${cy - wingSize * 0.7}`}
            stroke={color} strokeWidth={strokeWidth(0.8)} fill="none" strokeLinecap="round" />
          <path d={`M${cx + wingSize * 0.03},${cy - wingSize * 0.3} Q${cx + wingSize * 0.2},${cy - wingSize * 0.6} ${cx + wingSize * 0.25},${cy - wingSize * 0.7}`}
            stroke={color} strokeWidth={strokeWidth(0.8)} fill="none" strokeLinecap="round" />
          {/* 触角尖端小球 */}
          <circle cx={cx - wingSize * 0.25} cy={cy - wingSize * 0.7} r={wingSize * 0.04} fill={secondaryColor} opacity={0.6} />
          <circle cx={cx + wingSize * 0.25} cy={cy - wingSize * 0.7} r={wingSize * 0.04} fill={secondaryColor} opacity={0.6} />
          {/* 高光 */}
          <ellipse cx={cx - wingSize * 0.3} cy={cy - wingSize * 0.4} rx={wingSize * 0.12} ry={wingSize * 0.08}
            fill={secondaryColor} opacity={0.3} />
        </>
      );
    }

    case "heart_icon": {
      // 小爱心：内层装饰圆环 + sparkle 小星点缀 + 扩展高光
      const cx = x + w / 2;
      const cy = y + h * 0.45;
      const heartSize = Math.min(w, h) * 0.35;
      return (
        <>
          <defs>
            {createLinearGradient(`hi-${uid}`, "center_vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`hi-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <path d={`M${cx},${cy + heartSize * 0.5} C${cx},${cy + heartSize * 0.3} ${cx - heartSize},${cy - heartSize * 0.2} ${cx - heartSize},${cy - heartSize * 0.5} C${cx - heartSize},${cy - heartSize * 0.8} ${cx},${cy - heartSize * 0.8} ${cx},${cy - heartSize * 0.5} C${cx},${cy - heartSize * 0.8} ${cx + heartSize},${cy - heartSize * 0.8} ${cx + heartSize},${cy - heartSize * 0.5} C${cx + heartSize},${cy - heartSize * 0.2} ${cx},${cy + heartSize * 0.3} ${cx},${cy + heartSize * 0.5}`}
            fill={glowColor} filter={`url(#hi-glow-${uid})`} opacity={0.3} />
          {/* 阴影偏移 */}
          <path d={`M${cx},${cy + heartSize * 0.5} C${cx},${cy + heartSize * 0.3} ${cx - heartSize},${cy - heartSize * 0.2} ${cx - heartSize},${cy - heartSize * 0.5} C${cx - heartSize},${cy - heartSize * 0.8} ${cx},${cy - heartSize * 0.8} ${cx},${cy - heartSize * 0.5} C${cx},${cy - heartSize * 0.8} ${cx + heartSize},${cy - heartSize * 0.8} ${cx + heartSize},${cy - heartSize * 0.5} C${cx + heartSize},${cy - heartSize * 0.2} ${cx},${cy + heartSize * 0.3} ${cx},${cy + heartSize * 0.5}`}
            fill={shadowColor} opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 爱心主体 */}
          <path d={`M${cx},${cy + heartSize * 0.5} C${cx},${cy + heartSize * 0.3} ${cx - heartSize},${cy - heartSize * 0.2} ${cx - heartSize},${cy - heartSize * 0.5} C${cx - heartSize},${cy - heartSize * 0.8} ${cx},${cy - heartSize * 0.8} ${cx},${cy - heartSize * 0.5} C${cx},${cy - heartSize * 0.8} ${cx + heartSize},${cy - heartSize * 0.8} ${cx + heartSize},${cy - heartSize * 0.5} C${cx + heartSize},${cy - heartSize * 0.2} ${cx},${cy + heartSize * 0.3} ${cx},${cy + heartSize * 0.5}`}
            fill={`url(#hi-${uid})`} />
          {/* 内层装饰圆环 */}
          <circle cx={cx} cy={cy - heartSize * 0.1} r={heartSize * 0.25}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.25} />
          {/* sparkle 小星点缀 */}
          <circle cx={cx + heartSize * 0.9} cy={cy - heartSize * 0.6} r={strokeWidth(1)} fill={secondaryColor} opacity={0.5} />
          <circle cx={cx - heartSize * 0.85} cy={cy - heartSize * 0.65} r={strokeWidth(0.8)} fill={secondaryColor} opacity={0.4} />
          <circle cx={cx + heartSize * 0.3} cy={cy - heartSize * 0.95} r={strokeWidth(0.7)} fill={secondaryColor} opacity={0.35} />
          <circle cx={cx - heartSize * 0.2} cy={cy + heartSize * 0.7} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
          {/* 高光 */}
          <ellipse cx={cx - heartSize * 0.35} cy={cy - heartSize * 0.35} rx={heartSize * 0.15} ry={heartSize * 0.2}
            fill={secondaryColor} opacity={0.4} />
          {/* 额外高光弧线 */}
          <path d={`M${cx - heartSize * 0.15},${cy - heartSize * 0.6} Q${cx - heartSize * 0.4},${cy - heartSize * 0.55} ${cx - heartSize * 0.45},${cy - heartSize * 0.35}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
        </>
      );
    }

    case "leaf_decor": {
      // 小树叶：扩展侧叶脉 + gradient 叶脉描边 + 叶子内部装饰点
      const cx = x + w / 2;
      const cy = y + h * 0.4;
      const leafSize = Math.min(w, h) * 0.7;
      return (
        <>
          <defs>
            {createLinearGradient(`ld-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createLinearGradient(`ld-vein-${uid}`, "vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`ld-glow-${uid}`, "glow", { stdDeviation: 1.5 })}
          </defs>
          {/* 光晕 */}
          <path d={`M${cx},${cy + leafSize * 0.4} Q${cx + leafSize * 0.3},${cy - leafSize * 0.3} ${cx + leafSize * 0.15},${cy - leafSize * 0.5} Q${cx},${cy - leafSize * 0.55} ${cx - leafSize * 0.15},${cy - leafSize * 0.5} Q${cx},${cy - leafSize * 0.3} ${cx},${cy + leafSize * 0.4}`}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(2)} filter={`url(#ld-glow-${uid})`} opacity={0.3} />
          {/* 阴影偏移 */}
          <path d={`M${cx},${cy + leafSize * 0.4} Q${cx + leafSize * 0.3},${cy - leafSize * 0.3} ${cx + leafSize * 0.15},${cy - leafSize * 0.5} Q${cx},${cy - leafSize * 0.55} ${cx - leafSize * 0.15},${cy - leafSize * 0.5} Q${cx},${cy - leafSize * 0.3} ${cx},${cy + leafSize * 0.4}`}
            fill={shadowColor} opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 叶子主体 */}
          <path d={`M${cx},${cy + leafSize * 0.4} Q${cx + leafSize * 0.3},${cy - leafSize * 0.3} ${cx + leafSize * 0.15},${cy - leafSize * 0.5} Q${cx},${cy - leafSize * 0.55} ${cx - leafSize * 0.15},${cy - leafSize * 0.5} Q${cx},${cy - leafSize * 0.3} ${cx},${cy + leafSize * 0.4}`}
            fill={`url(#ld-${uid})`} />
          {/* 主叶脉 — gradient 描边 */}
          <path d={`M${cx},${cy + leafSize * 0.35} L${cx},${cy - leafSize * 0.45}`}
            stroke={`url(#ld-vein-${uid})`} strokeWidth={strokeWidth(1)} fill="none" opacity={0.5} />
          {/* 侧脉 — 扩展到 6 对 */}
          {[0.15, 0.25, 0.35, 0.45, 0.55, 0.65].map((t, i) => {
            const veinY = cy - leafSize * 0.45 + leafSize * 0.8 * t;
            return (
              <g key={`vein-${i}`}>
                <path d={`M${cx},${veinY} Q${cx - leafSize * 0.1},${veinY - leafSize * 0.05} ${cx - leafSize * 0.15},${veinY}`}
                  stroke={color} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
                <path d={`M${cx},${veinY} Q${cx + leafSize * 0.1},${veinY - leafSize * 0.05} ${cx + leafSize * 0.15},${veinY}`}
                  stroke={color} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
              </g>
            );
          })}
          {/* 叶子内部装饰点 */}
          <circle cx={cx + leafSize * 0.08} cy={cy - leafSize * 0.15} r={strokeWidth(0.8)} fill={secondaryColor} opacity={0.35} />
          <circle cx={cx - leafSize * 0.06} cy={cy + leafSize * 0.1} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
          <circle cx={cx + leafSize * 0.04} cy={cy - leafSize * 0.35} r={strokeWidth(0.5)} fill={secondaryColor} opacity={0.25} />
          {/* 高光 */}
          <ellipse cx={cx + leafSize * 0.05} cy={cy - leafSize * 0.3} rx={leafSize * 0.08} ry={leafSize * 0.12}
            fill={secondaryColor} opacity={0.25} />
        </>
      );
    }

    case "sparkle_star": {
      // 星光点缀：扩展射线 + gradient 射线 + 外部小点装饰
      const cx = x + w / 2;
      const cy = y + h / 2;
      const starR = Math.min(w, h) * 0.25;
      return (
        <>
          <defs>
            {createLinearGradient(`ss-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`ss-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <polygon points={starPath(cx, cy, starR * 1.5, starR * 0.6, 4)}
            fill={glowColor} filter={`url(#ss-glow-${uid})`} opacity={0.35} />
          {/* 阴影偏移 */}
          <polygon points={starPath(cx + w * 0.005, cy + h * 0.01, starR, starR * 0.4, 4)}
            fill={shadowColor} opacity={0.2} />
          {/* 主体四角星 — gradient */}
          <polygon points={starPath(cx, cy, starR, starR * 0.4, 4)}
            fill={`url(#ss-${uid})`} />
          {/* 高光 */}
          <polygon points={starPath(cx, cy, starR * 0.6, starR * 0.25, 4)}
            fill={secondaryColor} opacity={0.4} />
          {/* 扩展射线 — 8 角辅助星 */}
          <polygon points={starPath(cx, cy, starR * 1.15, starR * 0.15, 8)}
            fill="none" stroke={`url(#ss-${uid})`} strokeWidth={strokeWidth(0.5)} opacity={0.3} />
          {/* 周围小星点 — 扩展到 6 个 */}
          {[{x: -0.5, y: -0.6}, {x: 0.6, y: -0.5}, {x: -0.6, y: 0.5}, {x: 0.5, y: 0.6}, {x: -0.7, y: -0.2}, {x: 0.7, y: 0.15}].map((pos, i) => (
            <polygon key={i}
              points={starPath(cx + starR * pos.x, cy + starR * pos.y, starR * 0.2, starR * 0.08, 4)}
              fill={secondaryColor} opacity={0.6} />
          ))}
          {/* 外部小圆点装饰 */}
          {[0, 60, 120, 180, 240, 300].map((angle, i) => {
            const dotX = cx + starR * 1.6 * Math.cos(angle * Math.PI / 180);
            const dotY = cy + starR * 1.6 * Math.sin(angle * Math.PI / 180);
            return <circle key={`dot-${i}`} cx={dotX} cy={dotY} r={strokeWidth(0.8)} fill={secondaryColor} opacity={0.35} />;
          })}
        </>
      );
    }

    case "ribbon_decor": {
      // 丝带装饰：gradient 增强 + 阴影层 + 蝴蝶结细节 + 高光线条
      const cx = x + w / 2;
      const cy = y + h / 2;
      const ribbonW = Math.min(w, h) * 0.8;
      return (
        <>
          <defs>
            {createLinearGradient(`rd-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`rd-glow-${uid}`, "glow", { stdDeviation: 1.5 })}
          </defs>
          {/* 光晕 */}
          <path d={`M${cx - ribbonW * 0.4},${cy - h * 0.15} Q${cx},${cy - h * 0.25} ${cx + ribbonW * 0.4},${cy - h * 0.15} L${cx + ribbonW * 0.35},${cy + h * 0.2} Q${cx},${cy + h * 0.25} ${cx - ribbonW * 0.35},${cy + h * 0.2} Z`}
            fill={glowColor} filter={`url(#rd-glow-${uid})`} opacity={0.25} />
          {/* 阴影偏移 */}
          <path d={`M${cx - ribbonW * 0.4},${cy - h * 0.15} Q${cx},${cy - h * 0.25} ${cx + ribbonW * 0.4},${cy - h * 0.15} L${cx + ribbonW * 0.35},${cy + h * 0.2} Q${cx},${cy + h * 0.25} ${cx - ribbonW * 0.35},${cy + h * 0.2} Z`}
            fill={shadowColor} opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 丝带主体 */}
          <path d={`M${cx - ribbonW * 0.4},${cy - h * 0.15} Q${cx},${cy - h * 0.25} ${cx + ribbonW * 0.4},${cy - h * 0.15} L${cx + ribbonW * 0.35},${cy + h * 0.2} Q${cx},${cy + h * 0.25} ${cx - ribbonW * 0.35},${cy + h * 0.2} Z`}
            fill={`url(#rd-${uid})`} />
          {/* 蝴蝶结中心结 */}
          <ellipse cx={cx} cy={cy} rx={ribbonW * 0.08} ry={h * 0.06}
            fill={color} opacity={0.9} />
          <ellipse cx={cx} cy={cy} rx={ribbonW * 0.04} ry={h * 0.03}
            fill={secondaryColor} opacity={0.4} />
          {/* 左侧飘带 */}
          <path d={`M${cx - ribbonW * 0.35},${cy + h * 0.1} Q${cx - ribbonW * 0.5},${cy + h * 0.35} ${cx - ribbonW * 0.6},${cy + h * 0.45}`}
            stroke={color} strokeWidth={strokeWidth(3)} fill="none" strokeLinecap="round" opacity={0.8} />
          {/* 右侧飘带 */}
          <path d={`M${cx + ribbonW * 0.35},${cy + h * 0.1} Q${cx + ribbonW * 0.5},${cy + h * 0.35} ${cx + ribbonW * 0.6},${cy + h * 0.45}`}
            stroke={color} strokeWidth={strokeWidth(3)} fill="none" strokeLinecap="round" opacity={0.8} />
          {/* 高光线条 */}
          <path d={`M${cx - ribbonW * 0.2},${cy - h * 0.12} Q${cx},${cy - h * 0.18} ${cx + ribbonW * 0.2},${cy - h * 0.12}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} fill="none" opacity={0.35} />
          {/* 底部高光 */}
          <path d={`M${cx - ribbonW * 0.15},${cy + h * 0.15} Q${cx},${cy + h * 0.2} ${cx + ribbonW * 0.15},${cy + h * 0.15}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
        </>
      );
    }

    case "flower_decor": {
      // 小花朵：gradient 花瓣 + 花蕊装饰点 + 阴影层 + 光晕
      const cx = x + w / 2;
      const cy = y + h / 2;
      const petalR = Math.min(w, h) * 0.2;
      return (
        <>
          <defs>
            {createLinearGradient(`fd-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`fd-glow-${uid}`, "glow", { stdDeviation: 1.5 })}
          </defs>
          {/* 光晕 */}
          <circle cx={cx} cy={cy} r={petalR * 2.2} fill={glowColor} filter={`url(#fd-glow-${uid})`} opacity={0.25} />
          {/* 阴影偏移层 */}
          {[0, 72, 144, 216, 288].map((angle, i) => {
            const px = cx + petalR * Math.cos(angle * Math.PI / 180) + w * 0.005;
            const py = cy + petalR * Math.sin(angle * Math.PI / 180) + h * 0.01;
            return (
              <ellipse key={`sh-${i}`} cx={px} cy={py} rx={petalR * 0.6} ry={petalR * 0.35}
                fill={shadowColor} opacity={0.15}
                transform={`rotate(${angle} ${px} ${py})`} />
            );
          })}
          {/* 5瓣花朵 — gradient */}
          {[0, 72, 144, 216, 288].map((angle, i) => {
            const px = cx + petalR * Math.cos(angle * Math.PI / 180);
            const py = cy + petalR * Math.sin(angle * Math.PI / 180);
            return (
              <ellipse key={i} cx={px} cy={py} rx={petalR * 0.6} ry={petalR * 0.35}
                fill={`url(#fd-${uid})`} opacity={0.85}
                transform={`rotate(${angle} ${px} ${py})`} />
            );
          })}
          {/* 花心 */}
          <circle cx={cx} cy={cy} r={petalR * 0.35} fill={secondaryColor} opacity={0.9} />
          {/* 花蕊装饰点 */}
          <circle cx={cx - petalR * 0.08} cy={cy - petalR * 0.08} r={petalR * 0.12} fill={color} opacity={0.5} />
          <circle cx={cx + petalR * 0.1} cy={cy + petalR * 0.05} r={petalR * 0.06} fill={secondaryColor} opacity={0.4} />
          <circle cx={cx - petalR * 0.05} cy={cy + petalR * 0.1} r={petalR * 0.05} fill={secondaryColor} opacity={0.3} />
          {/* 小花瓣点缀 */}
          <circle cx={cx + petalR * 1.5} cy={cy - petalR * 0.5} r={petalR * 0.15} fill={secondaryColor} opacity={0.4} />
          <circle cx={cx - petalR * 1.3} cy={cy + petalR * 0.6} r={petalR * 0.12} fill={color} opacity={0.3} />
          {/* 高光弧线 */}
          <path d={`M${cx - petalR * 0.5},${cy - petalR * 0.8} Q${cx},${cy - petalR * 1.1} ${cx + petalR * 0.5},${cy - petalR * 0.8}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.3} />
        </>
      );
    }

    case "music_note": {
      // 音符装饰：gradient 音符 + 声波弧线装饰 + 光晕 + 阴影
      const cx = x + w * 0.45;
      const cy = y + h * 0.5;
      const noteSize = Math.min(w, h) * 0.5;
      return (
        <>
          <defs>
            {createLinearGradient(`mn-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`mn-glow-${uid}`, "glow", { stdDeviation: 1 })}
          </defs>
          {/* 光晕 */}
          <ellipse cx={cx} cy={cy} rx={noteSize * 1.2} ry={noteSize * 0.8}
            fill={glowColor} filter={`url(#mn-glow-${uid})`} opacity={0.3} />
          {/* 阴影偏移 */}
          <g opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`}>
            <ellipse cx={cx} cy={cy + noteSize * 0.1} rx={noteSize * 0.3} ry={noteSize * 0.18}
              fill={shadowColor} transform={`rotate(-20 ${cx} ${cy + noteSize * 0.1})`} />
          </g>
          {/* 音符头 — gradient */}
          <ellipse cx={cx} cy={cy + noteSize * 0.1} rx={noteSize * 0.3} ry={noteSize * 0.18}
            fill={`url(#mn-${uid})`} transform={`rotate(-20 ${cx} ${cy + noteSize * 0.1})`} />
          {/* 音符杆 */}
          <line x1={cx + noteSize * 0.25} y1={cy + noteSize * 0.08} x2={cx + noteSize * 0.25} y2={cy - noteSize * 0.5}
            stroke={color} strokeWidth={strokeWidth(2)} />
          {/* 音符旗 */}
          <path d={`M${cx + noteSize * 0.25},${cy - noteSize * 0.5} Q${cx + noteSize * 0.45},${cy - noteSize * 0.35} ${cx + noteSize * 0.35},${cy - noteSize * 0.2}`}
            stroke={color} strokeWidth={strokeWidth(2)} fill="none" />
          {/* 声波弧线装饰 */}
          <path d={`M${cx + noteSize * 0.5},${cy - noteSize * 0.4} Q${cx + noteSize * 0.65},${cy - noteSize * 0.25} ${cx + noteSize * 0.5},${cy - noteSize * 0.1}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} fill="none" opacity={0.4} />
          <path d={`M${cx + noteSize * 0.6},${cy - noteSize * 0.5} Q${cx + noteSize * 0.8},${cy - noteSize * 0.25} ${cx + noteSize * 0.6},${cy}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} fill="none" opacity={0.25} />
          {/* 高光 */}
          <ellipse cx={cx - noteSize * 0.08} cy={cy + noteSize * 0.05} rx={noteSize * 0.08} ry={noteSize * 0.05}
            fill={secondaryColor} opacity={0.35} />
          {/* 装饰小点 */}
          <circle cx={cx + noteSize * 0.55} cy={cy - noteSize * 0.55} r={strokeWidth(0.8)} fill={secondaryColor} opacity={0.4} />
          <circle cx={cx - noteSize * 0.4} cy={cy + noteSize * 0.2} r={strokeWidth(0.6)} fill={secondaryColor} opacity={0.3} />
        </>
      );
    }

    case "crown_decor": {
      // 小皇冠：gradient 皇冠 + 宝石装饰点 + 阴影 + 底部装饰线
      const cx = x + w / 2;
      const cy = y + h * 0.55;
      const crownW = w * 0.7;
      const crownH = h * 0.35;
      return (
        <>
          <defs>
            {createLinearGradient(`cd-${uid}`, "center_vertical", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`cd-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <path d={`M${cx - crownW * 0.5},${cy} L${cx - crownW * 0.3},${cy - crownH * 0.8} L${cx},${cy - crownH} L${cx + crownW * 0.3},${cy - crownH * 0.8} L${cx + crownW * 0.5},${cy}`}
            fill={glowColor} filter={`url(#cd-glow-${uid})`} opacity={0.35} />
          {/* 阴影偏移 */}
          <path d={`M${cx - crownW * 0.5},${cy} L${cx - crownW * 0.3},${cy - crownH * 0.8} L${cx},${cy - crownH} L${cx + crownW * 0.3},${cy - crownH * 0.8} L${cx + crownW * 0.5},${cy}`}
            fill={shadowColor} opacity={0.2} transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 皇冠主体 */}
          <path d={`M${cx - crownW * 0.5},${cy} L${cx - crownW * 0.3},${cy - crownH * 0.8} L${cx},${cy - crownH} L${cx + crownW * 0.3},${cy - crownH * 0.8} L${cx + crownW * 0.5},${cy}`}
            fill={`url(#cd-${uid})`} />
          {/* 底座 */}
          <rect x={cx - crownW * 0.5} y={cy - crownH * 0.1} width={crownW} height={h * 0.12}
            fill={color} opacity={0.8} />
          {/* 底部装饰线 */}
          <line x1={cx - crownW * 0.45} y1={cy + h * 0.02} x2={cx + crownW * 0.45} y2={cy + h * 0.02}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.5)} opacity={0.3} />
          {/* 宝石装饰 */}
          <circle cx={cx} cy={cy - crownH * 0.6} r={crownW * 0.06} fill={secondaryColor} opacity={0.9} />
          <circle cx={cx - crownW * 0.25} cy={cy - crownH * 0.45} r={crownW * 0.04} fill={secondaryColor} opacity={0.8} />
          <circle cx={cx + crownW * 0.25} cy={cy - crownH * 0.45} r={crownW * 0.04} fill={secondaryColor} opacity={0.8} />
          {/* 宝石高光点 */}
          <circle cx={cx - crownW * 0.01} cy={cy - crownH * 0.62} r={crownW * 0.02} fill="white" opacity={0.5} />
          {/* 尖端装饰小球 */}
          <circle cx={cx - crownW * 0.3} cy={cy - crownH * 0.82} r={crownW * 0.03} fill={secondaryColor} opacity={0.7} />
          <circle cx={cx + crownW * 0.3} cy={cy - crownH * 0.82} r={crownW * 0.03} fill={secondaryColor} opacity={0.7} />
          <circle cx={cx} cy={cy - crownH * 1.02} r={crownW * 0.035} fill={secondaryColor} opacity={0.8} />
          {/* 高光 */}
          <path d={`M${cx - crownW * 0.35},${cy - crownH * 0.6} L${cx},${cy - crownH * 0.95}`}
            stroke={secondaryColor} strokeWidth={strokeWidth(1)} fill="none" opacity={0.4} />
        </>
      );
    }

    // ================================================================
    // 功能图标类（Feature Icon）
    // ================================================================

    case "waterproof_shield": {
      // 防水盾牌：gradient 水滴填充 + 更多水滴装饰 + 盾牌内部图案 + 高光线条
      const cx = x + w / 2;
      const cy = y + h / 2;
      const sw = w * 0.35;
      const sh = h * 0.42;
      const shieldD = `M${cx},${cy - sh} L${cx + sw},${cy - sh * 0.6} L${cx + sw},${cy + sh * 0.2} Q${cx + sw * 0.5},${cy + sh * 0.8} ${cx},${cy + sh} Q${cx - sw * 0.5},${cy + sh * 0.8} ${cx - sw},${cy + sh * 0.2} L${cx - sw},${cy - sh * 0.6} Z`;
      return (
        <>
          <defs>
            {createLinearGradient(`ws-${uid}`, "center_vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`ws-drop-${uid}`, "vertical", [
              { offset: "0%", color: "white" },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`ws-glow-${uid}`, "glow", { stdDeviation: 3 })}
          </defs>
          {/* 光晕 */}
          <path d={shieldD} fill={glowColor} filter={`url(#ws-glow-${uid})`} opacity={0.3} />
          {/* 阴影 */}
          <path d={shieldD} fill={shadowColor} opacity={0.2}
            transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 盾牌主体 */}
          <path d={shieldD} fill={`url(#ws-${uid})`} opacity={0.9} />
          {/* 盾牌边框 */}
          <path d={shieldD} fill="none" stroke={color} strokeWidth={strokeWidth(1.5)} opacity={0.4} />
          {/* 盾牌内部水平线条装饰 */}
          <line x1={cx - sw * 0.6} y1={cy - sh * 0.15} x2={cx + sw * 0.6} y2={cy - sh * 0.15}
            stroke={color} strokeWidth={strokeWidth(0.6)} opacity={0.15} />
          <line x1={cx - sw * 0.7} y1={cy + sh * 0.15} x2={cx + sw * 0.7} y2={cy + sh * 0.15}
            stroke={color} strokeWidth={strokeWidth(0.6)} opacity={0.12} />
          {/* 盾牌内部 V 形装饰 */}
          <path d={`M${cx - sw * 0.3},${cy - sh * 0.35} L${cx},${cy - sh * 0.55} L${cx + sw * 0.3},${cy - sh * 0.35}`}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.8)} opacity={0.2} strokeLinejoin="round" />
          {/* 主水滴 - gradient 填充 */}
          <path
            d={`M${cx},${cy - sh * 0.3} Q${cx + sh * 0.14},${cy + sh * 0.02} ${cx},${cy + sh * 0.22} Q${cx - sh * 0.14},${cy + sh * 0.02} ${cx},${cy - sh * 0.3} Z`}
            fill={`url(#ws-drop-${uid})`} opacity={0.9} />
          {/* 主水滴高光 */}
          <ellipse cx={cx - sh * 0.04} cy={cy - sh * 0.1} rx={sh * 0.03} ry={sh * 0.06}
            fill="white" opacity={0.5} />
          {/* 装饰小水滴 - 左上 */}
          <path d={`M${cx - sw * 0.45},${cy - sh * 0.6} Q${cx - sw * 0.42},${cy - sh * 0.48} ${cx - sw * 0.45},${cy - sh * 0.42} Q${cx - sw * 0.48},${cy - sh * 0.48} ${cx - sw * 0.45},${cy - sh * 0.6} Z`}
            fill={secondaryColor} opacity={0.6} />
          {/* 装饰小水滴 - 右上 */}
          <path d={`M${cx + sw * 0.4},${cy - sh * 0.45} Q${cx + sw * 0.43},${cy - sh * 0.35} ${cx + sw * 0.4},${cy - sh * 0.3} Q${cx + sw * 0.37},${cy - sh * 0.35} ${cx + sw * 0.4},${cy - sh * 0.45} Z`}
            fill={secondaryColor} opacity={0.5} />
          {/* 装饰小水滴 - 左下 */}
          <path d={`M${cx - sw * 0.35},${cy + sh * 0.35} Q${cx - sw * 0.32},${cy + sh * 0.42} ${cx - sw * 0.35},${cy + sh * 0.46} Q${cx - sw * 0.38},${cy + sh * 0.42} ${cx - sw * 0.35},${cy + sh * 0.35} Z`}
            fill={secondaryColor} opacity={0.45} />
          {/* 装饰小水滴 - 右下 */}
          <path d={`M${cx + sw * 0.3},${cy + sh * 0.2} Q${cx + sw * 0.33},${cy + sh * 0.28} ${cx + sw * 0.3},${cy + sh * 0.32} Q${cx + sw * 0.27},${cy + sh * 0.28} ${cx + sw * 0.3},${cy + sh * 0.2} Z`}
            fill={secondaryColor} opacity={0.4} />
          {/* 高光弧线（左上） */}
          <path d={`M${cx - sw * 0.55},${cy - sh * 0.6} Q${cx - sw * 0.2},${cy - sh * 0.9} ${cx + sw * 0.15},${cy - sh * 0.85}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.5)} opacity={0.3} strokeLinecap="round" />
        </>
      );
    }

    case "uv_protection": {
      // 防晒标识：gradient 射线描边 + 12 条射线 + 外部小点装饰 + 太阳内部图案
      const cx = x + w * 0.45;
      const cy = y + h * 0.42;
      const sunR = Math.min(w, h) * 0.18;
      return (
        <>
          <defs>
            {createRadialGradient(`uv-${uid}`, [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`uv-ray-${uid}`, "diagonal", [
              { offset: "0%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`uv-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 太阳光晕 */}
          <circle cx={cx} cy={cy} r={sunR * 2.2}
            fill={glowColor} filter={`url(#uv-glow-${uid})`} opacity={0.2} />
          {/* 阴影 */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={sunR}
            fill={shadowColor} opacity={0.2} />
          {/* 太阳中心 */}
          <circle cx={cx} cy={cy} r={sunR} fill={`url(#uv-${uid})`} />
          {/* 太阳内部同心圆装饰 */}
          <circle cx={cx} cy={cy} r={sunR * 0.55}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.5)} opacity={0.2} />
          {/* 太阳高光 */}
          <circle cx={cx - sunR * 0.25} cy={cy - sunR * 0.25} r={sunR * 0.35}
            fill={secondaryColor} opacity={0.3} />
          {/* 12 条射线 - gradient 描边 */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const inner = sunR + 3;
            const outer = sunR + sunR * 0.75;
            return (
              <line key={deg}
                x1={cx + inner * Math.cos(rad)}
                y1={cy + inner * Math.sin(rad)}
                x2={cx + outer * Math.cos(rad)}
                y2={cy + outer * Math.sin(rad)}
                stroke={`url(#uv-ray-${uid})`} strokeWidth={strokeWidth(2.2)} strokeLinecap="round" opacity={0.75} />
            );
          })}
          {/* 外部小点装饰 - 射线端点 */}
          {[15, 75, 135, 195, 255, 315].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const dotR = sunR + sunR * 0.95;
            return (
              <circle key={`dot-${deg}`}
                cx={cx + dotR * Math.cos(rad)}
                cy={cy + dotR * Math.sin(rad)}
                r={strokeWidth(2)}
                fill={secondaryColor} opacity={0.45} />
            );
          })}
          {/* 外部菱形装饰 - 对角 */}
          {[45, 135, 225, 315].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const dR = sunR + sunR * 1.15;
            const dSize = strokeWidth(2.5);
            const px = cx + dR * Math.cos(rad);
            const py = cy + dR * Math.sin(rad);
            return (
              <polygon key={`dia-${deg}`}
                points={`${px},${py - dSize} ${px + dSize},${py} ${px},${py + dSize} ${px - dSize},${py}`}
                fill={color} opacity={0.35} />
            );
          })}
          {/* UV 文字 */}
          <text x={cx} y={cy + sunR + Math.min(w, h) * 0.28} textAnchor="middle"
            fill={color} fontSize={fontSize * 0.85} fontWeight="700">
            {label || "UV"}
          </text>
        </>
      );
    }

    case "eco_leaf": {
      // 环保标识：扩展侧叶脉 + gradient 叶脉描边 + 叶子内部装饰圆点 + 光晕范围
      const cx = x + w / 2;
      const cy = y + h / 2;
      const lw = w * 0.3;
      const lh = h * 0.4;
      const leafD = `M${cx},${cy - lh} C${cx + lw * 1.2},${cy - lh * 0.4} ${cx + lw * 1.1},${cy + lh * 0.6} ${cx},${cy + lh} C${cx - lw * 1.1},${cy + lh * 0.6} ${cx - lw * 1.2},${cy - lh * 0.4} ${cx},${cy - lh} Z`;
      return (
        <>
          <defs>
            {createLinearGradient(`el-${uid}`, "center_vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`el-vein-${uid}`, "diagonal", [
              { offset: "0%", color: "white" },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`el-glow-${uid}`, "glow", { stdDeviation: 3 })}
          </defs>
          {/* 光晕 */}
          <path d={leafD} fill={glowColor} filter={`url(#el-glow-${uid})`} opacity={0.3} />
          {/* 阴影 */}
          <path d={leafD} fill={shadowColor} opacity={0.2}
            transform={`translate(${w * 0.005},${h * 0.01})`} />
          {/* 叶子主体 */}
          <path d={leafD} fill={`url(#el-${uid})`} opacity={0.9} />
          {/* 叶子边框 */}
          <path d={leafD} fill="none" stroke={color} strokeWidth={strokeWidth(0.8)} opacity={0.25} />
          {/* 高光弧（左上） */}
          <path d={`M${cx - lw * 0.3},${cy - lh * 0.7} C${cx},${cy - lh * 0.9} ${cx + lw * 0.4},${cy - lh * 0.5} ${cx + lw * 0.5},${cy - lh * 0.2}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.5)} opacity={0.3} strokeLinecap="round" />
          {/* 中心叶脉 - gradient 描边 */}
          <line x1={cx} y1={cy - lh * 0.75} x2={cx} y2={cy + lh * 0.85}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(1.8)} opacity={0.7} />
          {/* 右侧叶脉组 */}
          <line x1={cx} y1={cy - lh * 0.5} x2={cx + lw * 0.35} y2={cy - lh * 0.75}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.45} />
          <line x1={cx} y1={cy - lh * 0.2} x2={cx + lw * 0.55} y2={cy - lh * 0.45}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <line x1={cx} y1={cy + lh * 0.1} x2={cx + lw * 0.5} y2={cy - lh * 0.05}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(0.9)} opacity={0.4} />
          <line x1={cx} y1={cy + lh * 0.35} x2={cx + lw * 0.35} y2={cy + lh * 0.15}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          {/* 左侧叶脉组 */}
          <line x1={cx} y1={cy - lh * 0.35} x2={cx - lw * 0.3} y2={cy - lh * 0.55}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.45} />
          <line x1={cx} y1={cy + lh * 0.2} x2={cx - lw * 0.55} y2={cy - lh * 0.05}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(1)} opacity={0.5} />
          <line x1={cx} y1={cy + lh * 0.4} x2={cx - lw * 0.4} y2={cy + lh * 0.2}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(0.9)} opacity={0.4} />
          <line x1={cx} y1={cy + lh * 0.6} x2={cx - lw * 0.2} y2={cy + lh * 0.45}
            stroke={`url(#el-vein-${uid})`} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          {/* 叶子内部装饰圆点 - 叶脉交叉处 */}
          <circle cx={cx} cy={cy - lh * 0.5} r={strokeWidth(2)} fill="white" opacity={0.4} />
          <circle cx={cx + lw * 0.15} cy={cy - lh * 0.15} r={strokeWidth(1.5)} fill={secondaryColor} opacity={0.35} />
          <circle cx={cx - lw * 0.1} cy={cy + lh * 0.25} r={strokeWidth(1.5)} fill={secondaryColor} opacity={0.3} />
          <circle cx={cx + lw * 0.25} cy={cy + lh * 0.35} r={strokeWidth(1.2)} fill={secondaryColor} opacity={0.25} />
        </>
      );
    }

    case "thermo_icon": {
      // 保暖标识：扩展刻度线 + gradient 外壳描边 + 底部球高光 + 周围小点
      const cx = x + w / 2;
      const tubeW = Math.min(w, h) * 0.08;
      const bulbR = Math.min(w, h) * 0.16;
      const tubeTop = y + h * 0.12;
      const tubeBottom = y + h * 0.62;
      const bulbCy = y + h * 0.75;
      return (
        <>
          <defs>
            {createLinearGradient(`ti-${uid}`, "center_vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`ti-shell-${uid}`, "vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createFilter(`ti-glow-${uid}`, "glow", { stdDeviation: 2 })}
          </defs>
          {/* 光晕 */}
          <circle cx={cx} cy={bulbCy} r={bulbR * 2}
            fill={glowColor} filter={`url(#ti-glow-${uid})`} opacity={0.2} />
          {/* 底部球阴影 */}
          <circle cx={cx + w * 0.005} cy={bulbCy + h * 0.01} r={bulbR}
            fill={shadowColor} opacity={0.2} />
          {/* 温度计外壳 - gradient 描边 */}
          <rect x={cx - tubeW} y={tubeTop} width={tubeW * 2} height={tubeBottom - tubeTop}
            rx={tubeW} fill="none" stroke={`url(#ti-shell-${uid})`} strokeWidth={strokeWidth(2)} />
          {/* 底部球外壳 */}
          <circle cx={cx} cy={bulbCy} r={bulbR} fill="none" stroke={`url(#ti-shell-${uid})`} strokeWidth={strokeWidth(2)} />
          {/* 底部球填充 */}
          <circle cx={cx} cy={bulbCy} r={bulbR * 0.6} fill={`url(#ti-${uid})`} opacity={0.8} />
          {/* 底部球内层高光 */}
          <circle cx={cx - bulbR * 0.15} cy={bulbCy - bulbR * 0.15}
            r={bulbR * 0.25} fill={secondaryColor} opacity={0.35} />
          {/* 底部球外层高光弧 */}
          <path d={`M${cx - bulbR * 0.6},${bulbCy - bulbR * 0.4} A${bulbR * 0.8},${bulbR * 0.8} 0 0,1 ${cx + bulbR * 0.3},${bulbCy - bulbR * 0.65}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1)} opacity={0.3} strokeLinecap="round" />
          {/* 液柱 */}
          <rect x={cx - tubeW * 0.5}
            y={tubeTop + (tubeBottom - tubeTop) * 0.35}
            width={tubeW}
            height={(tubeBottom - tubeTop) * 0.65 + (bulbCy - tubeBottom)}
            rx={tubeW * 0.5}
            fill={`url(#ti-${uid})`} opacity={0.8} />
          {/* 主刻度线 - 长线 */}
          {[0.25, 0.5, 0.75].map((fy) => (
            <line key={`major-${fy}`}
              x1={cx + tubeW + 2} y1={tubeTop + (tubeBottom - tubeTop) * fy}
              x2={cx + tubeW + 8} y2={tubeTop + (tubeBottom - tubeTop) * fy}
              stroke={color} strokeWidth={strokeWidth(1.2)} opacity={0.6} />
          ))}
          {/* 次刻度线 - 短线 */}
          {[0.15, 0.35, 0.45, 0.55, 0.65, 0.85].map((fy) => (
            <line key={`minor-${fy}`}
              x1={cx + tubeW + 2} y1={tubeTop + (tubeBottom - tubeTop) * fy}
              x2={cx + tubeW + 5} y2={tubeTop + (tubeBottom - tubeTop) * fy}
              stroke={color} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          ))}
          {/* 外壳高光 */}
          <line x1={cx - tubeW + 1} y1={tubeTop + 4} x2={cx - tubeW + 1} y2={tubeBottom - 4}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.3} />
          {/* 周围装饰小点 - 左侧 */}
          <circle cx={cx - bulbR * 0.8} cy={bulbCy - bulbR * 0.6} r={strokeWidth(1.5)} fill={secondaryColor} opacity={0.3} />
          <circle cx={cx - bulbR * 1.1} cy={bulbCy + bulbR * 0.1} r={strokeWidth(1.2)} fill={secondaryColor} opacity={0.25} />
          <circle cx={cx - bulbR * 0.5} cy={bulbCy - bulbR * 1} r={strokeWidth(1)} fill={secondaryColor} opacity={0.2} />
          {/* 周围装饰小点 - 右侧 */}
          <circle cx={cx + bulbR * 0.9} cy={bulbCy - bulbR * 0.4} r={strokeWidth(1.2)} fill={secondaryColor} opacity={0.25} />
          <circle cx={cx + bulbR * 0.6} cy={bulbCy + bulbR * 0.7} r={strokeWidth(1)} fill={secondaryColor} opacity={0.2} />
        </>
      );
    }

    // ================================================================
    // 测量引导类（Measurement）
    // ================================================================

    case "measure_line": {
      // 测量线：gradient 箭头 + 光晕 + 阴影偏移 + 中间装饰点
      const lineY = y + h / 2;
      const leftX = x + w * 0.08;
      const rightX = x + w * 0.92;
      const capH = h * 0.15;
      const arrowSize = Math.max(5, w * 0.045);
      return (
        <>
          <defs>
            {createLinearGradient(`ml-arrow-${uid}`, "horizontal", [
              { offset: "0%", color: color },
              { offset: "50%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`ml-glow-${uid}`, "glow", { stdDeviation: 1.5 })}
          </defs>
          {/* 光晕主线 */}
          <line x1={leftX} y1={lineY} x2={rightX} y2={lineY}
            stroke={glowColor} strokeWidth={strokeWidth(2)} filter={`url(#ml-glow-${uid})`} opacity={0.3} />
          {/* 阴影 */}
          <line x1={leftX + w * 0.005} y1={lineY + h * 0.01} x2={rightX + w * 0.005} y2={lineY + h * 0.01}
            stroke={shadowColor} strokeWidth={strokeWidth(1.5)} opacity={0.2} />
          {/* 主线 */}
          <line x1={leftX} y1={lineY} x2={rightX} y2={lineY}
            stroke={color} strokeWidth={strokeWidth(2)} />
          {/* 左端竖线 */}
          <line x1={leftX} y1={lineY - capH} x2={leftX} y2={lineY + capH}
            stroke={color} strokeWidth={strokeWidth(2)} />
          {/* 右端竖线 */}
          <line x1={rightX} y1={lineY - capH} x2={rightX} y2={lineY + capH}
            stroke={color} strokeWidth={strokeWidth(2)} />
          {/* 刻度线 */}
          {[0.25, 0.5, 0.75].map((f) => {
            const tx = leftX + (rightX - leftX) * f;
            return <line key={f} x1={tx} y1={lineY - capH * 0.4} x2={tx} y2={lineY + capH * 0.4}
              stroke={color} strokeWidth={strokeWidth(1)} opacity={0.5} />;
          })}
          {/* 中间装饰点 */}
          {[0.125, 0.375, 0.625, 0.875].map((f) => {
            const dx = leftX + (rightX - leftX) * f;
            return <circle key={`dot-${f}`} cx={dx} cy={lineY} r={strokeWidth(1.5)}
              fill={secondaryColor} opacity={0.4} />;
          })}
          {/* 左箭头 - gradient */}
          <polygon
            points={`${leftX + arrowSize},${lineY - arrowSize * 0.6} ${leftX},${lineY} ${leftX + arrowSize},${lineY + arrowSize * 0.6}`}
            fill={`url(#ml-arrow-${uid})`} />
          {/* 右箭头 - gradient */}
          <polygon
            points={`${rightX - arrowSize},${lineY - arrowSize * 0.6} ${rightX},${lineY} ${rightX - arrowSize},${lineY + arrowSize * 0.6}`}
            fill={`url(#ml-arrow-${uid})`} />
          {/* 高光 */}
          <line x1={leftX + arrowSize} y1={lineY - 0.8} x2={rightX - arrowSize} y2={lineY - 0.8}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.35} />
          {label && (
            <text x={x + w / 2} y={lineY - capH - 4} textAnchor="middle"
              fill={secondaryColor} fontSize={fontSize * 0.65} fontWeight="600">{label}</text>
          )}
        </>
      );
    }

    case "compare_frame": {
      // 对比框：高光线条 + gradient 框描边 + 角落装饰标记 + VS 徽章 gradient
      const midX = x + w / 2;
      const gap = w * 0.03;
      const frameY = y + h * 0.1;
      const frameH = h * 0.8;
      const leftW = midX - gap - x - w * 0.05;
      const rightX = midX + gap;
      const rightW = x + w * 0.95 - midX - gap;
      const badgeR = Math.min(w * 0.06, h * 0.08, 12);
      const cornerLen = Math.min(leftW * 0.15, frameH * 0.1, 10);
      return (
        <>
          <defs>
            {createLinearGradient(`cf-frame-${uid}`, "vertical", [
              { offset: "0%", color: secondaryColor },
              { offset: "50%", color: color },
              { offset: "100%", color: secondaryColor },
            ])}
            {createLinearGradient(`cf-badge-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`cf-glow-${uid}`, "glow", { stdDeviation: 1.5 })}
          </defs>
          {/* 左框光晕 */}
          <rect x={x + w * 0.05} y={frameY} width={leftW} height={frameH} rx={3}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(3)}
            filter={`url(#cf-glow-${uid})`} opacity={0.3} />
          {/* 右框光晕 */}
          <rect x={rightX} y={frameY} width={rightW} height={frameH} rx={3}
            fill="none" stroke={glowColor} strokeWidth={strokeWidth(3)}
            filter={`url(#cf-glow-${uid})`} opacity={0.3} />
          {/* 左框阴影 */}
          <rect x={x + w * 0.05 + w * 0.005} y={frameY + h * 0.01} width={leftW} height={frameH} rx={3}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} opacity={0.2} />
          {/* 右框阴影 */}
          <rect x={rightX + w * 0.005} y={frameY + h * 0.01} width={rightW} height={frameH} rx={3}
            fill="none" stroke={shadowColor} strokeWidth={strokeWidth(2)} opacity={0.2} />
          {/* 左框 - gradient 描边 */}
          <rect x={x + w * 0.05} y={frameY} width={leftW} height={frameH} rx={3}
            fill="none" stroke={`url(#cf-frame-${uid})`} strokeWidth={strokeWidth(1.8)} />
          {/* 右框 - gradient 描边 */}
          <rect x={rightX} y={frameY} width={rightW} height={frameH} rx={3}
            fill="none" stroke={`url(#cf-frame-${uid})`} strokeWidth={strokeWidth(1.8)} />
          {/* 左框角落装饰标记 */}
          <polyline points={`${x + w * 0.05 + cornerLen},${frameY} ${x + w * 0.05},${frameY} ${x + w * 0.05},${frameY + cornerLen}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.2)} strokeLinecap="round" opacity={0.5} />
          <polyline points={`${x + w * 0.05 + leftW - cornerLen},${frameY + frameH} ${x + w * 0.05 + leftW},${frameY + frameH} ${x + w * 0.05 + leftW},${frameY + frameH - cornerLen}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.2)} strokeLinecap="round" opacity={0.5} />
          {/* 右框角落装饰标记 */}
          <polyline points={`${rightX + cornerLen},${frameY} ${rightX},${frameY} ${rightX},${frameY + cornerLen}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.2)} strokeLinecap="round" opacity={0.5} />
          <polyline points={`${rightX + rightW - cornerLen},${frameY + frameH} ${rightX + rightW},${frameY + frameH} ${rightX + rightW},${frameY + frameH - cornerLen}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.2)} strokeLinecap="round" opacity={0.5} />
          {/* 中间虚线 */}
          <line x1={midX} y1={frameY} x2={midX} y2={frameY + frameH}
            stroke={secondaryColor} strokeWidth={strokeWidth(1.5)} strokeDasharray="4 3" opacity={0.6} />
          {/* VS 徽章外圈光晕 */}
          <circle cx={midX} cy={frameY + frameH / 2} r={badgeR + 4}
            fill={glowColor} filter={`url(#cf-glow-${uid})`} opacity={0.2} />
          {/* VS 徽章背景 */}
          <circle cx={midX} cy={frameY + frameH / 2} r={badgeR + 2}
            fill={shadowColor} opacity={0.3} />
          {/* VS 徽章 - gradient */}
          <circle cx={midX} cy={frameY + frameH / 2} r={badgeR}
            fill={`url(#cf-badge-${uid})`} opacity={0.9} />
          {/* VS 文字 */}
          <text x={midX} y={frameY + frameH / 2} textAnchor="middle" dominantBaseline="central"
            fill="white" fontSize={badgeR * 0.9} fontWeight="700">
            {label || "VS"}
          </text>
          {/* 框高光线条 */}
          <line x1={x + w * 0.05 + 3} y1={frameY + 2} x2={x + w * 0.05 + leftW * 0.3} y2={frameY + 2}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.35} strokeLinecap="round" />
          <line x1={rightX + 3} y1={frameY + 2} x2={rightX + rightW * 0.3} y2={frameY + 2}
            stroke={secondaryColor} strokeWidth={strokeWidth(0.8)} opacity={0.35} strokeLinecap="round" />
        </>
      );
    }

    case "check_mark": {
      // 勾选标记：内层装饰圆环 + gradient 勾选描边 + 周围小点装饰 + 光晕扩展
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.38;
      return (
        <>
          <defs>
            {createLinearGradient(`cm-${uid}`, "diagonal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createLinearGradient(`cm-check-${uid}`, "horizontal", [
              { offset: "0%", color: secondaryColor },
              { offset: "100%", color: color },
            ])}
            {createFilter(`cm-glow-${uid}`, "glow", { stdDeviation: 2.5 })}
          </defs>
          {/* 光晕 */}
          <circle cx={cx} cy={cy} r={r * 1.35}
            fill={glowColor} filter={`url(#cm-glow-${uid})`} opacity={0.3} />
          {/* 阴影圆 */}
          <circle cx={cx + w * 0.005} cy={cy + h * 0.01} r={r}
            fill={shadowColor} opacity={0.2} />
          {/* 背景渐变圆 */}
          <circle cx={cx} cy={cy} r={r} fill={`url(#cm-${uid})`} opacity={0.25} />
          {/* 外圈描边 */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth(2.2)} />
          {/* 内层装饰圆环 */}
          <circle cx={cx} cy={cy} r={r * 0.72}
            fill="none" stroke={color} strokeWidth={strokeWidth(0.6)} opacity={0.2} strokeDasharray="3 5" />
          {/* 勾选阴影 */}
          <polyline
            points={`${cx - r * 0.4 + w * 0.005},${cy + h * 0.01} ${cx - r * 0.1 + w * 0.005},${cy + r * 0.35 + h * 0.01} ${cx + r * 0.4 + w * 0.005},${cy - r * 0.3 + h * 0.01}`}
            fill="none" stroke={shadowColor}
            strokeWidth={Math.max(3, r * 0.16)} strokeLinecap="round" strokeLinejoin="round"
            opacity={0.25} />
          {/* 勾选路径 - gradient 描边 */}
          <polyline
            points={`${cx - r * 0.4},${cy} ${cx - r * 0.1},${cy + r * 0.35} ${cx + r * 0.4},${cy - r * 0.3}`}
            fill="none" stroke={`url(#cm-check-${uid})`}
            strokeWidth={Math.max(3, r * 0.16)} strokeLinecap="round" strokeLinejoin="round" />
          {/* 勾选转折点装饰 */}
          <circle cx={cx - r * 0.1} cy={cy + r * 0.35} r={strokeWidth(2)}
            fill={secondaryColor} opacity={0.35} />
          {/* 周围装饰小点 */}
          <circle cx={cx + r * 0.85} cy={cy - r * 0.5} r={strokeWidth(1.5)}
            fill={secondaryColor} opacity={0.35} />
          <circle cx={cx + r * 0.6} cy={cy + r * 0.8} r={strokeWidth(1.2)}
            fill={secondaryColor} opacity={0.3} />
          <circle cx={cx - r * 0.7} cy={cy + r * 0.7} r={strokeWidth(1)}
            fill={secondaryColor} opacity={0.25} />
          <circle cx={cx - r * 0.9} cy={cy - r * 0.3} r={strokeWidth(1.2)}
            fill={secondaryColor} opacity={0.3} />
          <circle cx={cx + r * 0.2} cy={cy - r * 0.95} r={strokeWidth(1)}
            fill={secondaryColor} opacity={0.2} />
          {/* 高光弧（左上） */}
          <path d={`M${cx - r * 0.5},${cy - r * 0.4} A${r * 0.8},${r * 0.8} 0 0,1 ${cx + r * 0.1},${cy - r * 0.7}`}
            fill="none" stroke={secondaryColor} strokeWidth={strokeWidth(1.5)} opacity={0.3} strokeLinecap="round" />
        </>
      );
    }

    case "custom_image": {
      // 自选图片：拉伸填满元素边界（用户通过调整选框控制显示比例）
      if (!imageUrl) return null;
      // SSRF 安全验证：禁止私有 IP/本地地址
      if (!isValidImageUrl(imageUrl)) {
        console.warn(`[Graphics] Blocked invalid image URL: ${imageUrl}`);
        return null;
      }
      return (
        <image
          href={imageUrl}
          crossOrigin="anonymous"
          x={x}
          y={y}
          width={w}
          height={h}
          preserveAspectRatio="none"
        />
      );
    }

    default:
      return null;
  }
}

/** 螺旋线路径 */
function spiralPath(cx: number, cy: number, maxRadius: number): string {
  const points: string[] = [];
  for (let angle = 0; angle < Math.PI * 3.5; angle += 0.12) {
    const r = (angle / (Math.PI * 3.5)) * maxRadius;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    points.push(`${angle === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return points.join(" ");
}

/** 五角星路径 */
function starPath(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  const pathParts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    pathParts.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
  }
  pathParts.push("Z");
  return pathParts.join(" ");
}

export const GraphicsSvgOverlay: React.FC<GraphicsSvgOverlayProps> = React.memo(
  ({ graphicsLayout, width, height, editMode = false, onChange, onSelect, selectedIndex, onRequestEditMode, onBackgroundClick }) => {
    const [dragging, setDragging] = useState<{ uid: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);
    const [resizing, setResizing] = useState<{ uid: string; corner: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);
    const [showSelector, setShowSelector] = useState(false);
    // 重叠元素选择菜单状态
    const [overlapMenu, setOverlapMenu] = useState<{ x: number; y: number; elements: { index: number; el: GraphicsLayerElement }[] } | null>(null);
    const containerRef = useRef<SVGSVGElement>(null);
    // 标记：是否刚打开菜单（用于跳过同一交互序列的 click 关闭检测）
    const justOpenedMenuRef = useRef(false);

    const elements = graphicsLayout.elements;

    // 点击外部关闭重叠菜单
    useEffect(() => {
      if (!overlapMenu) return;
      const handleClickOutside = (e: MouseEvent) => {
        // 如果是刚才打开菜单的同一次点击，跳过关闭检测
        if (justOpenedMenuRef.current) {
          justOpenedMenuRef.current = false;
          return;
        }
        // 如果点击的不是菜单本身，关闭菜单
        const target = e.target as HTMLElement;
        if (!target.closest(".overlap-menu")) {
          setOverlapMenu(null);
        }
      };
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, [overlapMenu]);

    // 检测点击位置下的所有元素（从上层到下层）
    const getElementsAtPoint = useCallback((clientX: number, clientY: number): { index: number; el: GraphicsLayerElement }[] => {
      if (!containerRef.current) return [];
      const svg = containerRef.current;
      const rect = svg.getBoundingClientRect();
      // 转换为 SVG 坐标（0-1 范围）
      const svgX = (clientX - rect.left) / rect.width;
      const svgY = (clientY - rect.top) / rect.height;

      // 从数组末尾（最上层）开始检测
      const result: { index: number; el: GraphicsLayerElement }[] = [];
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        const elX = safeCoord(el.x);
        const elY = safeCoord(el.y);
        const elW = safeDimension(el.width);
        const elH = safeDimension(el.height);
        // 检测点是否在元素边界内
        if (svgX >= elX && svgX <= elX + elW && svgY >= elY && svgY <= elY + elH) {
          result.push({ index: i, el });
        }
      }
      return result;
    }, [elements]);

    // 从重叠菜单选择元素（提升到顶层）
    const handleSelectFromOverlapMenu = useCallback((index: number) => {
      if (index < elements.length - 1) {
        // 移到数组末尾（顶层）
        const newElements = [...elements];
        const [selectedEl] = newElements.splice(index, 1);
        newElements.push(selectedEl);
        onChange?.(newElements);
        onSelect?.(newElements.length - 1);
      } else {
        // 已经是顶层，直接选中
        onSelect?.(index);
      }
      setOverlapMenu(null);
    }, [elements, onChange, onSelect]);

    // 拖拽开始（同时选中元素）
    const handleDragStart = useCallback((e: React.PointerEvent, uid: string) => {
      e.preventDefault();
      const target = e.target as SVGElement | null;
      if (target && typeof target.setPointerCapture === "function") {
        try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      const idx = parseInt(uid.replace(/^el/, ""), 10);
      if (!Number.isInteger(idx) || idx < 0 || idx >= elements.length) return;

      // 检测点击位置下的所有元素
      const overlapping = getElementsAtPoint(e.clientX, e.clientY);

      // 【关键】如果重叠元素中包含当前已选中的元素，直接开始拖拽（跳过菜单）
      // 这样用户从菜单选择后再次点击就能拖拽了
      if (selectedIndex != null && overlapping.some(o => o.index === selectedIndex)) {
        const el = elements[selectedIndex];
        if (!el) return;
        setDragging({
          uid: `el${selectedIndex}`,
          startX: e.clientX,
          startY: e.clientY,
          origX: el.x,
          origY: el.y,
          origW: el.width,
          origH: el.height,
        });
        return;
      }

      // 有多个重叠元素且没有已选中的，弹出选择菜单
      if (overlapping.length >= 2) {
        justOpenedMenuRef.current = true;
        setOverlapMenu({ x: e.clientX, y: e.clientY, elements: overlapping });
        return;
      }

      // 无重叠或单个元素：选中并开始拖拽
      const targetIdx = overlapping.length >= 1 ? overlapping[0].index : idx;
      onSelect?.(targetIdx);
      const el = elements[targetIdx];
      if (!el) return;
      setDragging({
        uid: `el${targetIdx}`,
        startX: e.clientX,
        startY: e.clientY,
        origX: el.x,
        origY: el.y,
        origW: el.width,
        origH: el.height,
      });
    }, [elements, selectedIndex, onSelect, getElementsAtPoint]);

    // 尺寸调整开始
    const handleResizeStart = useCallback((uid: string, corner: string, e: React.PointerEvent) => {
      e.preventDefault();
      // DOM null check：确保 target 支持 setPointerCapture
      const target = e.target as SVGElement | null;
      if (target && typeof target.setPointerCapture === "function") {
        try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      const idx = parseInt(uid.replace(/^el/, ""), 10);
      // 索引安全检查：防止 NaN 或越界
      if (!Number.isInteger(idx) || idx < 0 || idx >= elements.length) return;
      const el = elements[idx];
      if (!el) return;
      setResizing({
        uid,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        origX: el.x,
        origY: el.y,
        origW: el.width,
        origH: el.height,
      });
    }, [elements]);

    // 删除元素（同时取消选中）
    const handleDelete = useCallback((uid: string) => {
      const idx = parseInt(uid.replace(/^el/, ""), 10);
      // 索引安全检查：防止 NaN 或越界
      if (!Number.isInteger(idx) || idx < 0 || idx >= elements.length) return;
      const newElements = elements.filter((_, i) => i !== idx);
      onChange?.(newElements);
      onSelect?.(null);
    }, [elements, onChange, onSelect]);

    // Pointer 移动（拖拽或调整）
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      if (!containerRef.current) return;

      if (dragging) {
        const dx = Math.round((e.clientX - dragging.startX) * 100 / width) / 100;
        const dy = Math.round((e.clientY - dragging.startY) * 100 / height) / 100;
        const dragIdx = parseInt(dragging.uid.replace(/^el/, ""), 10);
        if (Number.isInteger(dragIdx) && dragIdx >= 0 && dragIdx < elements.length) {
          const el = elements[dragIdx];
          const newElements = [...elements];
          newElements[dragIdx] = {
            ...el,
            x: Math.max(0, Math.min(1 - dragging.origW, dragging.origX + dx)),
            y: Math.max(0, Math.min(1 - dragging.origH, dragging.origY + dy)),
          };
          onChange?.(newElements);
        }
      } else if (resizing) {
        const dx = (e.clientX - resizing.startX) / width;
        const dy = (e.clientY - resizing.startY) / height;
        const newElements = elements.map((el, i) => {
          if (`el${i}` === resizing.uid) {
            let newX = resizing.origX;
            let newY = resizing.origY;
            let newW = resizing.origW;
            let newH = resizing.origH;

            // 所有图形元素保持比例（角落调整时双方向同时生效，需避免覆盖）
            const aspectRatio = resizing.origH > 0.001 ? resizing.origW / resizing.origH : 1;

            // 先计算基础尺寸变化（不考虑比例）
            if (resizing.corner.includes("e")) newW = Math.max(0.08, Math.min(1 - newX, resizing.origW + dx));
            if (resizing.corner.includes("w")) {
              newX = Math.max(0, Math.min(resizing.origX + resizing.origW - 0.08, resizing.origX + dx));
              newW = Math.max(0.08, resizing.origW - dx);
            }
            if (resizing.corner.includes("s")) newH = Math.max(0.08, Math.min(1 - newY, resizing.origH + dy));
            if (resizing.corner.includes("n")) {
              newY = Math.max(0, Math.min(resizing.origY + resizing.origH - 0.08, resizing.origY + dy));
              newH = Math.max(0.08, resizing.origH - dy);
            }

            // 保持比例：根据变化方向调整另一维度，并补偿位置偏移
            const hasWidthChange = resizing.corner.includes("e") || resizing.corner.includes("w");
            const hasHeightChange = resizing.corner.includes("s") || resizing.corner.includes("n");

            if (hasWidthChange && hasHeightChange) {
              // 角落拖拽：以宽度变化为基准
              newH = newW / aspectRatio;
              // 如果从上方拖拽，需要调整 y 位置
              if (resizing.corner.includes("n")) {
                newY = resizing.origY + resizing.origH - newH;
              }
            } else if (hasWidthChange) {
              // 只调整宽度：高度按比例调整
              const newH_byRatio = newW / aspectRatio;
              // 如果从上方拖拽，y 需要补偿高度变化
              if (resizing.corner.includes("n")) {
                newY = resizing.origY + resizing.origH - newH_byRatio;
              }
              newH = newH_byRatio;
            } else if (hasHeightChange) {
              // 只调整高度：宽度按比例调整
              const newW_byRatio = newH * aspectRatio;
              // 如果从左侧拖拽，x 需要补偿宽度变化
              if (resizing.corner.includes("w")) {
                newX = resizing.origX + resizing.origW - newW_byRatio;
              }
              newW = newW_byRatio;
            }

            return { ...el, x: newX, y: newY, width: newW, height: newH };
          }
          return el;
        });
        onChange?.(newElements);
      }
    }, [dragging, resizing, elements, width, height, onChange]);

    // Pointer 结束
    const handlePointerUp = useCallback((e?: React.PointerEvent) => {
      if (e) {
        try { (e.target as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      setDragging(null);
      setResizing(null);
    }, []);

    // 添加新元素（自动选中新元素）
    const handleAddElement = useCallback((newElement: GraphicsLayerElement) => {
      const newElements = [...elements, newElement];
      onChange?.(newElements);
      onSelect?.(newElements.length - 1);
    }, [elements, onChange, onSelect]);

    if (!elements.length && !editMode) return null;

    return (
      <>
        <svg
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: "auto" }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onSelect?.(null);
              onBackgroundClick?.();
              // 只在点击背景时关闭重叠菜单
              setOverlapMenu(null);
            }
          }}
        >
          {elements.map((el, i) => (
            <GraphicsElementEditable
              key={i}
              el={el}
              uid={`el${i}`}
              index={i}
              containerW={width}
              containerH={height}
              editMode={editMode}
              isSelected={selectedIndex === i}
              onDragStart={handleDragStart}
              onDelete={handleDelete}
              onResize={handleResizeStart}
              onSelect={(idx) => {
                onSelect?.(idx);
              }}
              onRequestEditMode={(idx) => onRequestEditMode?.(idx)}
            />
          ))}

          {/* 编辑模式下始终显示"添加图形"按钮（右上角） */}
          {editMode && (
            <g
              style={{ cursor: "pointer" }}
              onClick={() => setShowSelector(true)}
            >
              <rect x={width - 72} y={8} width={64} height={28} rx={6} fill="#0066ff" opacity={0.85} />
              <text x={width - 40} y={27} textAnchor="middle" fill="white" fontSize={12} fontWeight="500">
                + 图形
              </text>
            </g>
          )}
        </svg>

        {/* 图形选择面板 */}
        {showSelector && editMode && (
          <GraphicsSelector
            onSelect={handleAddElement}
            onClose={() => setShowSelector(false)}
          />
        )}

        {/* 重叠元素选择菜单 */}
        {overlapMenu && (
          <div
            className="overlap-menu fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] max-w-[240px]"
            style={{
              // 确保菜单不超出屏幕边界（左、右、下）
              left: Math.max(8, Math.min(overlapMenu.x + 8, window.innerWidth - 250)),
              top: Math.max(8, Math.min(overlapMenu.y + 8, window.innerHeight - 150)),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-100">
              选择元素
            </div>
            {overlapMenu.elements.map(({ index, el }) => {
              const isText = isArtTextElement(el) || isOverlayTextElement(el);
              // 文字元素显示内容，图形元素显示中文名称
              let label: string;
              if (isText) {
                label = (el as ArtTextElement | OverlayTextElement).content ?? "文字";
              } else {
                // 图形元素：优先显示 label，否则显示中文名称映射
                const graphicEl = el as GraphicsElement;
                label = graphicEl.label ?? GRAPHIC_TYPE_NAMES[graphicEl.type] ?? graphicEl.type;
              }
              return (
                <button
                  key={index}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors flex items-center gap-2"
                  onClick={() => handleSelectFromOverlapMenu(index)}
                >
                  <span className="material-icons-round text-gray-400 text-base flex-shrink-0">
                    {isText ? "text_fields" : "category"}
                  </span>
                  <span className="truncate text-gray-700">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  },
);

GraphicsSvgOverlay.displayName = "GraphicsSvgOverlay";
