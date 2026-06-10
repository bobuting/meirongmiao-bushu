/**
 * GraphicsSelector.tsx - 分类图形类型选择面板
 * 7 个分类标签页（面料/标注/标签/装饰/功能/测量/艺术字），共 30 种图形 + 艺术字
 */

import React, { useState } from "react";
import { createPortal } from "react-dom";
import type {
  GraphicsElement,
  ArtTextElement,
  ArtTextStyle,
  ArtTextCurve,
  GraphicsLayerElement,
  OverlayTextElement,
} from "../../../../../src/contracts/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphicsSelectorProps {
  /** 选择回调，返回新创建的图形元素 */
  onSelect: (element: GraphicsLayerElement) => void;
  /** 关闭面板回调 */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// 分类定义
// ---------------------------------------------------------------------------

type CategoryKey =
  | "fabric"
  | "annotation"
  | "badge"
  | "decoration"
  | "feature"
  | "measurement"
  | "art_text"
  | "overlay_text"
  | "custom"
  | "atmosphere";

interface GraphicsTypeDef {
  type: GraphicsElement["type"];
  name: string;
  description: string;
  icon: React.ReactNode;
  defaultColor: string;
  /** 默认纵横比（宽度/高度），用于保持图形自然比例 */
  aspectRatio?: number;
}

interface CategoryDef {
  key: CategoryKey;
  label: string;
  items: GraphicsTypeDef[];
}

// ---------------------------------------------------------------------------
// SVG 图标（24x24 viewBox）
// ---------------------------------------------------------------------------

/** 面料类图标 */
const fabricIcons = {
  air_flow: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M12 12 Q8 6, 12 2 T12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" opacity={0.6} />
      <circle cx="16" cy="6" r="1.5" fill="currentColor" opacity={0.6} />
      <circle cx="14" cy="14" r="1.5" fill="currentColor" opacity={0.6} />
    </svg>
  ),
  elastic_arrow: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth={2} />
      <polyline points="6,8 4,12 6,16" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M8 12 Q12 4, 16 12" fill="none" stroke="currentColor" strokeWidth={2} />
      <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth={2} />
      <polyline points="18,8 20,12 18,16" fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  ),
  quality_stamp: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">优</text>
    </svg>
  ),
  silhouette_line: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M8 4 Q4 8, 6 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M16 4 Q20 8, 18 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polygon points="2,10 4,8 4,12" fill="currentColor" opacity={0.6} />
    </svg>
  ),
  soft_curve: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M2 10 Q8 4, 22 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
      <path d="M2 12 Q8 6, 22 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M2 14 Q8 8, 22 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
    </svg>
  ),
  stitch_mark: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" />
      <line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" />
      <circle cx="4" cy="12" r="2" fill="currentColor" />
      <circle cx="10" cy="12" r="2" fill="currentColor" />
      <circle cx="16" cy="12" r="2" fill="currentColor" />
      <circle cx="22" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  scene_icon: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="6" y="10" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M4 10 L12 4 L20 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="12" width="3" height="3" fill="currentColor" rx="0.5" />
      <rect x="13" y="12" width="3" height="3" fill="currentColor" rx="0.5" />
    </svg>
  ),
  size_frame: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1="4" y1="2" x2="20" y2="2" stroke="currentColor" strokeWidth={1} />
      <line x1="4" y1="0" x2="4" y2="4" stroke="currentColor" strokeWidth={1} />
      <line x1="20" y1="0" x2="20" y2="4" stroke="currentColor" strokeWidth={1} />
    </svg>
  ),
} as const;

/** 标注类图标 */
const annotationIcons = {
  arrow_callout: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <line x1="4" y1="20" x2="14" y2="8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polygon points="14,4 18,8 14,12" fill="currentColor" />
      <rect x="14" y="4" width="8" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  ),
  highlight_spot: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity={0.4} />
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.4} />
    </svg>
  ),
  crosshair_mark: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth={1.5} />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  circle_callout: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 2" />
      <line x1="18" y1="6" x2="22" y2="2" stroke="currentColor" strokeWidth={1.5} />
      <rect x="18" y="0" width="6" height="5" rx="1" fill="currentColor" opacity={0.5} />
    </svg>
  ),
  magnifier: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth={2} />
      <line x1="14.5" y1="14.5" x2="20" y2="20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <rect x="7" y="8" width="6" height="4" rx="1" fill="currentColor" opacity={0.3} />
    </svg>
  ),
} as const;

/** 标签类图标 */
const badgeIcons = {
  sale_ribbon: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M2 2 L12 2 L12 10 L7 8 L2 10 Z" fill="currentColor" opacity={0.7} />
      <line x1="4" y1="4" x2="10" y2="4" stroke="white" strokeWidth={1.5} />
      <line x1="4" y1="7" x2="8" y2="7" stroke="white" strokeWidth={1.5} />
    </svg>
  ),
  tag_label: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M4 4 L18 4 L22 8 L18 12 L4 12 Z" fill="currentColor" opacity={0.7} />
      <circle cx="8" cy="8" r="2" fill="white" />
      <line x1="12" y1="6" x2="18" y2="6" stroke="white" strokeWidth={1.5} />
      <line x1="12" y1="9" x2="16" y2="9" stroke="white" strokeWidth={1.5} />
    </svg>
  ),
  number_badge: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity={0.7} />
      <text x="12" y="15.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">1</text>
    </svg>
  ),
  hot_mark: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M12 2 Q14 6, 12 10 Q16 8, 15 14 Q14 18, 12 20 Q10 18, 9 14 Q8 8, 12 10 Q10 6, 12 2 Z" fill="currentColor" opacity={0.8} />
      <path d="M12 12 Q13 14, 12 16 Q11 14, 12 12 Z" fill="currentColor" />
    </svg>
  ),
  star_rating: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <polygon points="12,2 14.5,9 22,9 16,13.5 18,21 12,17 6,21 8,13.5 2,9 9.5,9" fill="currentColor" opacity={0.7} />
    </svg>
  ),
} as const;

/** 装饰类图标 */
const decorationIcons = {
  dot_pattern: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="6" cy="6" r="2" fill="currentColor" opacity={0.6} />
      <circle cx="12" cy="4" r="1.5" fill="currentColor" opacity={0.4} />
      <circle cx="18" cy="8" r="2" fill="currentColor" opacity={0.5} />
      <circle cx="4" cy="14" r="1.5" fill="currentColor" opacity={0.4} />
      <circle cx="10" cy="12" r="2" fill="currentColor" opacity={0.6} />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" opacity={0.5} />
      <circle cx="8" cy="20" r="2" fill="currentColor" opacity={0.4} />
      <circle cx="20" cy="20" r="1.5" fill="currentColor" opacity={0.3} />
    </svg>
  ),
  wave_line: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M2 8 Q6 4, 8 8 T14 8 T20 8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M2 14 Q6 10, 8 14 T14 14 T20 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
      <path d="M2 20 Q6 16, 8 20 T14 20 T20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.3} />
    </svg>
  ),
  geometric_shape: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <polygon points="12,2 20,8 20,16 12,22 4,16 4,8" fill="none" stroke="currentColor" strokeWidth={2} />
      <polygon points="12,6 16,10 16,14 12,18 8,14 8,10" fill="currentColor" opacity={0.2} />
    </svg>
  ),
  light_glow: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity={0.6} />
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.3} />
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.15} />
      <line x1="12" y1="0" x2="12" y2="3" stroke="currentColor" strokeWidth={1} opacity={0.4} />
      <line x1="12" y1="21" x2="12" y2="24" stroke="currentColor" strokeWidth={1} opacity={0.4} />
      <line x1="0" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth={1} opacity={0.4} />
      <line x1="21" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth={1} opacity={0.4} />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="currentColor" opacity={0.8} />
      <path d="M18 14 L18.8 17.2 L22 18 L18.8 18.8 L18 22 L17.2 18.8 L14 18 L17.2 17.2 Z" fill="currentColor" opacity={0.5} />
    </svg>
  ),
  // 新增 5 个版式装饰
  divider_line: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx="6" cy="12" r="2" fill="currentColor" opacity={0.6} />
      <circle cx="18" cy="12" r="2" fill="currentColor" opacity={0.6} />
    </svg>
  ),
  corner_ornament: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M2 2 L2 8 Q2 2, 8 2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx="4" cy="4" r="1" fill="currentColor" opacity={0.5} />
      <path d="M22 2 L22 8 Q22 2, 16 2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
    </svg>
  ),
  quote_mark: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M4 8 Q4 4, 8 4 L10 4 L10 10 L8 10 Q4 10, 4 8 Z" fill="currentColor" opacity={0.7} />
      <path d="M14 8 Q14 4, 18 4 L20 4 L20 10 L18 10 Q14 10, 14 8 Z" fill="currentColor" opacity={0.7} />
    </svg>
  ),
  border_frame: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth={2} />
      <rect x="6" y="6" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.5} />
    </svg>
  ),
  decorative_icon: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity={0.6} />
      <path d="M12 2 L12 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
      <path d="M12 18 L12 22" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
      <path d="M2 12 L6 12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
      <path d="M18 12 L22 12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
    </svg>
  ),
} as const;

/** 氛围装饰类图标（精致氛围感） */
const atmosphereIcons = {
  feather: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M12 4 Q16 8, 12 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 8 Q8 6, 6 10" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.6} />
      <path d="M12 10 Q8 9, 6 12" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.6} />
      <path d="M12 12 Q8 12, 6 14" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.6} />
      <path d="M12 14 Q16 13, 18 16" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.6} />
    </svg>
  ),
  pen_tip: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <polygon points="12,18 8,10 16,10" fill="currentColor" opacity={0.7} />
      <rect x="10" y="4" width="4" height="6" fill="currentColor" opacity={0.5} />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth={1} opacity={0.4} />
    </svg>
  ),
  butterfly: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <ellipse cx="6" cy="8" rx="3" ry="4" fill="currentColor" opacity={0.6} transform="rotate(-15 6 8)" />
      <ellipse cx="18" cy="8" rx="3" ry="4" fill="currentColor" opacity={0.6} transform="rotate(15 18 8)" />
      <ellipse cx="7" cy="16" rx="2" ry="3" fill="currentColor" opacity={0.5} transform="rotate(-10 7 16)" />
      <ellipse cx="17" cy="16" rx="2" ry="3" fill="currentColor" opacity={0.5} transform="rotate(10 17 16)" />
      <ellipse cx="12" cy="12" rx="1" ry="4" fill="currentColor" opacity={0.8} />
    </svg>
  ),
  heart_icon: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M12 20 C12 20, 4 14, 4 10 C4 7, 6 6, 12 10 C18 6, 20 7, 20 10 C20 14, 12 20, 12 20" fill="currentColor" opacity={0.7} />
      <ellipse cx="9" cy="9" rx="1" ry="1.5" fill="currentColor" opacity={0.3} />
    </svg>
  ),
  leaf_decor: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M4 20 Q4 8, 20 4 Q16 20, 4 20 Z" fill="currentColor" opacity={0.6} />
      <path d="M4 20 Q10 14, 18 6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M8 18 Q10 14, 14 12" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.5} />
      <path d="M10 16 Q12 13, 16 10" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.4} />
    </svg>
  ),
  sparkle_star: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <polygon points="12,2 14,10 22,12 14,14 12,22 10,14 2,12 10,10" fill="currentColor" opacity={0.7} />
      <polygon points="12,6 13,10 17,12 13,14 12,18 11,14 7,12 11,10" fill="currentColor" opacity={0.4} />
    </svg>
  ),
  ribbon_decor: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M6 6 Q12 4, 18 6 L17 16 Q12 18, 7 16 Z" fill="currentColor" opacity={0.7} />
      <path d="M6 14 Q4 18, 3 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
      <path d="M18 14 Q20 18, 21 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
    </svg>
  ),
  flower_decor: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity={0.8} />
      {[0, 60, 120, 180, 240, 300].map((angle) => {
        const x = 12 + 5 * Math.cos(angle * Math.PI / 180);
        const y = 12 + 5 * Math.sin(angle * Math.PI / 180);
        return <ellipse key={angle} cx={x} cy={y} rx="2" ry="3" fill="currentColor" opacity={0.6} transform={`rotate(${angle} ${x} ${y})`} />;
      })}
    </svg>
  ),
  music_note: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <ellipse cx="8" cy="18" rx="3" ry="2" fill="currentColor" opacity={0.7} transform="rotate(-20 8 18)" />
      <line x1="11" y1="18" x2="11" y2="6" stroke="currentColor" strokeWidth={2} />
      <path d="M11 6 Q14 8, 16 6 Q18 4, 20 6" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  ),
  crown_decor: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M4 16 L6 10 L12 8 L18 10 L20 16 L4 16" fill="currentColor" opacity={0.7} />
      <circle cx="12" cy="10" r="1" fill="currentColor" opacity={0.9} />
      <circle cx="6" cy="12" r="0.8" fill="currentColor" opacity={0.7} />
      <circle cx="18" cy="12" r="0.8" fill="currentColor" opacity={0.7} />
    </svg>
  ),
} as const;

/** 功能图标 */
const featureIcons = {
  waterproof_shield: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M12 2 L20 6 L20 12 Q20 18, 12 22 Q4 18, 4 12 L4 6 Z" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M9 12 Q10 10, 11 12 Q12 14, 13 12 Q14 10, 15 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  uv_protection: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity={0.6} />
      <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1="5" y1="5" x2="7" y2="7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="17" y1="17" x2="19" y2="19" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  ),
  eco_leaf: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path d="M4 20 Q4 8, 20 4 Q16 20, 4 20 Z" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M4 20 Q10 14, 18 6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M8 18 Q10 14, 14 12" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.5} />
    </svg>
  ),
  thermo_icon: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="9" y="2" width="6" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="18" r="4" fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="18" r="2.5" fill="currentColor" opacity={0.7} />
      <rect x="10.5" y="8" width="3" height="8" fill="currentColor" opacity={0.4} />
    </svg>
  ),
} as const;

/** 测量类图标 */
const measurementIcons = {
  measure_line: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth={2} />
      <polyline points="6,8 2,12 6,16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="18,8 22,12 18,16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth={1} />
      <line x1="12" y1="9" x2="12" y2="15" stroke="currentColor" strokeWidth={1} />
      <line x1="16" y1="10" x2="16" y2="14" stroke="currentColor" strokeWidth={1} />
    </svg>
  ),
  compare_frame: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="2" y="4" width="9" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <rect x="13" y="4" width="9" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth={2} strokeDasharray="3 2" />
    </svg>
  ),
  check_mark: (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2} />
      <polyline points="7,12 10,16 17,8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const;

// ---------------------------------------------------------------------------
// 分类数据
// ---------------------------------------------------------------------------

const categories: CategoryDef[] = [
  {
    key: "fabric",
    label: "面料",
    items: [
      { type: "air_flow", name: "气流线条", description: "螺旋线条 + 扩散粒子，展示透气轻盈", icon: fabricIcons.air_flow, defaultColor: "#87CEEB", aspectRatio: 1 },
      { type: "elastic_arrow", name: "弹性箭头", description: "双向箭头 + 弹性曲线，展示回弹特性", icon: fabricIcons.elastic_arrow, defaultColor: "#FF8C42", aspectRatio: 2.5 },
      { type: "quality_stamp", name: "品质印章", description: "金属质感圆形印章，展示品质认证", icon: fabricIcons.quality_stamp, defaultColor: "#D4A843", aspectRatio: 1 },
      { type: "silhouette_line", name: "轮廓线条", description: "修身轮廓线条，展示版型效果", icon: fabricIcons.silhouette_line, defaultColor: "#E8A0BF", aspectRatio: 0.6 },
      { type: "soft_curve", name: "柔软曲线", description: "三条柔和曲线，展示舒适质感", icon: fabricIcons.soft_curve, defaultColor: "#D4C5A9", aspectRatio: 2 },
      { type: "stitch_mark", name: "针脚标注", description: "虚线 + 针脚点，展示工艺细节", icon: fabricIcons.stitch_mark, defaultColor: "rgba(255,255,255,0.8)", aspectRatio: 2 },
      { type: "scene_icon", name: "场景图标", description: "简约场景图标，展示使用场景", icon: fabricIcons.scene_icon, defaultColor: "#E8B86D", aspectRatio: 1.2 },
      { type: "size_frame", name: "尺码框线", description: "极简虚线框，标注尺码位置", icon: fabricIcons.size_frame, defaultColor: "rgba(255,255,255,0.8)", aspectRatio: 1 },
    ],
  },
  {
    key: "annotation",
    label: "标注",
    items: [
      { type: "arrow_callout", name: "箭头标注", description: "带标签的箭头指向标注", icon: annotationIcons.arrow_callout, defaultColor: "#FF6B6B", aspectRatio: 1.5 },
      { type: "highlight_spot", name: "聚焦高亮", description: "脉冲圆圈聚焦效果", icon: annotationIcons.highlight_spot, defaultColor: "#FFD93D", aspectRatio: 1 },
      { type: "crosshair_mark", name: "十字准星", description: "精确定位标注", icon: annotationIcons.crosshair_mark, defaultColor: "#6BCB77", aspectRatio: 1 },
      { type: "circle_callout", name: "圆形标注", description: "虚线圈 + 标签", icon: annotationIcons.circle_callout, defaultColor: "#4D96FF", aspectRatio: 1.2 },
      { type: "magnifier", name: "放大镜", description: "局部放大效果框", icon: annotationIcons.magnifier, defaultColor: "#FF922B", aspectRatio: 1 },
    ],
  },
  {
    key: "badge",
    label: "标签",
    items: [
      { type: "sale_ribbon", name: "促销角标", description: "折角 ribbon 标签", icon: badgeIcons.sale_ribbon, defaultColor: "#FF4757", aspectRatio: 1.2 },
      { type: "tag_label", name: "标签贴", description: "胶带/贴纸效果标签", icon: badgeIcons.tag_label, defaultColor: "#FF6348", aspectRatio: 1.8 },
      { type: "number_badge", name: "数字徽章", description: "圆形数字标记", icon: badgeIcons.number_badge, defaultColor: "#2ED573", aspectRatio: 1 },
      { type: "hot_mark", name: "热卖标记", description: "火焰/热门标记", icon: badgeIcons.hot_mark, defaultColor: "#FF4500", aspectRatio: 1 },
      { type: "star_rating", name: "星级评分", description: "星星评分展示", icon: badgeIcons.star_rating, defaultColor: "#FFA502", aspectRatio: 1 },
    ],
  },
  {
    key: "decoration",
    label: "装饰",
    items: [
      { type: "dot_pattern", name: "圆点装饰", description: "散落圆点背景装饰", icon: decorationIcons.dot_pattern, defaultColor: "rgba(255,255,255,0.7)", aspectRatio: 1 },
      { type: "wave_line", name: "波浪线", description: "流动波浪装饰线", icon: decorationIcons.wave_line, defaultColor: "#74B9FF", aspectRatio: 2 },
      { type: "geometric_shape", name: "几何图形", description: "三角/菱形/六边形装饰", icon: decorationIcons.geometric_shape, defaultColor: "#A29BFE", aspectRatio: 1.2 },
      { type: "light_glow", name: "光晕效果", description: "柔和光晕聚光", icon: decorationIcons.light_glow, defaultColor: "#FFEAA7", aspectRatio: 1 },
      { type: "sparkle", name: "闪光装饰", description: "星光/闪光点缀", icon: decorationIcons.sparkle, defaultColor: "#FFFFFF", aspectRatio: 1 },
      // 版式装饰
      { type: "divider_line", name: "分割线", description: "水平分割线 + 圆点装饰", icon: decorationIcons.divider_line, defaultColor: "rgba(255,255,255,0.8)", aspectRatio: 4 },
      { type: "corner_ornament", name: "角落装饰", description: "角落曲线装饰", icon: decorationIcons.corner_ornament, defaultColor: "rgba(255,255,255,0.6)", aspectRatio: 1 },
      { type: "quote_mark", name: "引号装饰", description: "大号引号装饰", icon: decorationIcons.quote_mark, defaultColor: "rgba(255,255,255,0.5)", aspectRatio: 1 },
      { type: "border_frame", name: "边框", description: "双层边框装饰", icon: decorationIcons.border_frame, defaultColor: "rgba(255,255,255,0.6)", aspectRatio: 1 },
      { type: "decorative_icon", name: "装饰图标", description: "中心圆点 + 四向射线", icon: decorationIcons.decorative_icon, defaultColor: "rgba(255,255,255,0.5)", aspectRatio: 1 },
    ],
  },
  {
    key: "atmosphere",
    label: "氛围",
    items: [
      // 精致氛围装饰（10种）
      { type: "feather", name: "小羽毛", description: "轻盈自然氛围", icon: atmosphereIcons.feather, defaultColor: "#E8D5B7", aspectRatio: 1.2 },
      { type: "pen_tip", name: "小笔尖", description: "书写创作氛围", icon: atmosphereIcons.pen_tip, defaultColor: "#2C3E50", aspectRatio: 0.5 },
      { type: "butterfly", name: "小蝴蝶", description: "灵动优雅氛围", icon: atmosphereIcons.butterfly, defaultColor: "#E8A0BF", aspectRatio: 1 },
      { type: "heart_icon", name: "小爱心", description: "情感温暖氛围", icon: atmosphereIcons.heart_icon, defaultColor: "#E8655A", aspectRatio: 1 },
      { type: "leaf_decor", name: "小树叶", description: "自然清新氛围", icon: atmosphereIcons.leaf_decor, defaultColor: "#27AE60", aspectRatio: 0.8 },
      { type: "sparkle_star", name: "星光点缀", description: "梦幻闪耀氛围", icon: atmosphereIcons.sparkle_star, defaultColor: "#FDCB6E", aspectRatio: 1 },
      { type: "ribbon_decor", name: "丝带装饰", description: "优雅礼物氛围", icon: atmosphereIcons.ribbon_decor, defaultColor: "#E8A0BF", aspectRatio: 1.5 },
      { type: "flower_decor", name: "小花朵", description: "浪漫美好氛围", icon: atmosphereIcons.flower_decor, defaultColor: "#E8655A", aspectRatio: 1 },
      { type: "music_note", name: "音符装饰", description: "艺术活力氛围", icon: atmosphereIcons.music_note, defaultColor: "#2C3E50", aspectRatio: 0.8 },
      { type: "crown_decor", name: "小皇冠", description: "尊贵高级氛围", icon: atmosphereIcons.crown_decor, defaultColor: "#D4A843", aspectRatio: 1.2 },
    ],
  },
  {
    key: "feature",
    label: "功能",
    items: [
      { type: "waterproof_shield", name: "防水盾牌", description: "盾牌 + 水滴图标", icon: featureIcons.waterproof_shield, defaultColor: "#0984E3", aspectRatio: 0.85 },
      { type: "uv_protection", name: "防晒标识", description: "太阳 + 防护标识", icon: featureIcons.uv_protection, defaultColor: "#FDCB6E", aspectRatio: 1 },
      { type: "eco_leaf", name: "环保标识", description: "叶子/天然标识", icon: featureIcons.eco_leaf, defaultColor: "#00B894", aspectRatio: 0.8 },
      { type: "thermo_icon", name: "保暖标识", description: "温度计/保暖图标", icon: featureIcons.thermo_icon, defaultColor: "#E17055", aspectRatio: 0.6 },
    ],
  },
  {
    key: "measurement",
    label: "测量",
    items: [
      { type: "measure_line", name: "测量线", description: "双向箭头测量标注", icon: measurementIcons.measure_line, defaultColor: "#DFE6E9", aspectRatio: 2.5 },
      { type: "compare_frame", name: "对比框", description: "左右/上下对比框", icon: measurementIcons.compare_frame, defaultColor: "#B2BEC3", aspectRatio: 1 },
      { type: "check_mark", name: "勾选标记", description: "对勾/认证标记", icon: measurementIcons.check_mark, defaultColor: "#00B894", aspectRatio: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 自选图片类型
// ---------------------------------------------------------------------------

const customImageIcon = (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
    <circle cx="8.5" cy="8.5" r="2" fill="currentColor" opacity={0.6} />
    <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth={1.5} fill="none" />
  </svg>
);

// ---------------------------------------------------------------------------
// 艺术字风格数据
// ---------------------------------------------------------------------------

interface ArtTextStyleDef {
  style: ArtTextStyle;
  name: string;
  description: string;
  icon: React.ReactNode;
}

/** 字体预设 */
const selectorFontPresets = [
  { name: "默认无衬线", family: "sans-serif" },
  { name: "黑体", family: "SimHei, Heiti SC, sans-serif" },
  { name: "宋体", family: "SimSun, Songti SC, serif" },
  { name: "楷体", family: "KaiTi, STKaiti, serif" },
  { name: "仿宋", family: "FangSong, STFangsong, serif" },
  { name: "隶书", family: "LiSu, STLiti, serif" },
  { name: "微软雅黑", family: "Microsoft YaHei, PingFang SC, sans-serif" },
  { name: "华文琥珀", family: "STHupo, sans-serif" },
  { name: "华文行楷", family: "STXingkai, serif" },
  { name: "Impact", family: "Impact, Charcoal, sans-serif" },
];

const artTextStyles: ArtTextStyleDef[] = [
  // --- 基础 6 种 ---
  {
    style: "outline",
    name: "描边空心",
    description: "仅描边轮廓，无填充",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="none" stroke="currentColor" strokeWidth={1.5}>A</text>
      </svg>
    ),
  },
  {
    style: "shadow",
    name: "立体阴影",
    description: "偏移投影立体效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="14" y="17" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" opacity={0.3}>A</text>
        <text x="12" y="15" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">A</text>
      </svg>
    ),
  },
  {
    style: "gradient",
    name: "渐变填充",
    description: "双色渐变填充文字",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={1} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="url(#g)">A</text>
      </svg>
    ),
  },
  {
    style: "neon",
    name: "霓虹发光",
    description: "霓虹灯管发光效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" opacity={0.3}>A</text>
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">A</text>
      </svg>
    ),
  },
  {
    style: "stamp",
    name: "印章风格",
    description: "印章/戳记风格文字",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
        <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">印</text>
      </svg>
    ),
  },
  {
    style: "handwrite",
    name: "手写风格",
    description: "手写/书法风格文字",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path d="M4 18 Q8 6, 12 12 Q16 18, 20 8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
  // --- 新增 12 种 ---
  {
    style: "neon_pulse",
    name: "霓虹脉冲",
    description: "霓虹灯脉冲闪烁效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" opacity={0.2}>A</text>
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">A</text>
      </svg>
    ),
  },
  {
    style: "retro_stamp",
    name: "复古印章",
    description: "粗框 + 粗体复古风格",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth={3} />
        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">品</text>
      </svg>
    ),
  },
  {
    style: "graffiti_tag",
    name: "街头涂鸦",
    description: "街头涂鸦/喷漆风格",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="11" y="17" textAnchor="middle" fontSize="13" fontWeight="bold" fill="currentColor" transform="rotate(-8, 11, 17)">A</text>
        <circle cx="6" cy="6" r="2" fill="currentColor" opacity={0.6} />
      </svg>
    ),
  },
  {
    style: "metallic_3d",
    name: "金属浮雕",
    description: "金属质感立体浮雕",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="11" y="18" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" opacity={0.4}>A</text>
        <text x="12" y="15" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">A</text>
      </svg>
    ),
  },
  {
    style: "glitter_spark",
    name: "闪光闪烁",
    description: "星光闪烁装饰效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">A</text>
        <circle cx="5" cy="5" r="1.5" fill="currentColor" opacity={0.7} />
        <circle cx="19" cy="7" r="1.2" fill="currentColor" opacity={0.5} />
        <circle cx="8" cy="19" r="1" fill="currentColor" opacity={0.6} />
      </svg>
    ),
  },
  {
    style: "fire_burn",
    name: "火焰燃烧",
    description: "火焰边缘燃烧效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path d="M6 20 Q9 8, 12 12 Q15 18, 18 6" fill="currentColor" opacity={0.4} />
        <text x="12" y="18" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">火</text>
      </svg>
    ),
  },
  {
    style: "ice_crystal",
    name: "冰晶冻结",
    description: "冰晶冻结冷酷效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <polygon points="12,2 14,10 22,12 14,14 12,22 10,14 2,12 10,10" fill="currentColor" opacity={0.3} />
        <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">冰</text>
      </svg>
    ),
  },
  {
    style: "water_drop",
    name: "水滴溶解",
    description: "水滴溶解流动效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path d="M12 2 Q16 8, 12 14 Q8 20, 12 22" fill="currentColor" opacity={0.5} />
        <text x="12" y="15" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">水</text>
      </svg>
    ),
  },
  {
    style: "electric_arc",
    name: "电弧闪电",
    description: "电弧闪电科技效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <polyline points="4,6 8,12 12,6 16,12 20,6" fill="none" stroke="currentColor" strokeWidth={1.5} />
        <text x="12" y="18" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">电</text>
      </svg>
    ),
  },
  {
    style: "paper_cut",
    name: "剪纸镂空",
    description: "剪纸镂空艺术效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <rect x="2" y="4" width="20" height="16" fill="currentColor" opacity={0.1} />
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">剪</text>
        <path d="M4 4 Q8 8, 12 4 Q16 8, 20 4" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.4} />
      </svg>
    ),
  },
  {
    style: "bubble_pop",
    name: "气泡膨胀",
    description: "气泡膨胀轻盈效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <circle cx="12" cy="12" r="8" fill="currentColor" opacity={0.15} stroke="currentColor" strokeWidth={1} />
        <text x="12" y="14" textAnchor="middle" fontSize="9" fontWeight="bold" fill="currentColor">气</text>
      </svg>
    ),
  },
  {
    style: "gold_emboss",
    name: "金币浮雕",
    description: "金币浮雕质感效果",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity={0.2} stroke="currentColor" strokeWidth={2} />
        <text x="12" y="15" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">金</text>
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export const GraphicsSelector: React.FC<GraphicsSelectorProps> = ({ onSelect, onClose }) => {
  const [activeTab, setActiveTab] = useState<CategoryKey>("fabric");
  const [artTextInput, setArtTextInput] = useState<string>("品质");
  const [curveEnabled, setCurveEnabled] = useState<boolean>(false);
  const [curveType, setCurveType] = useState<"arc" | "wave" | "bow">("arc");
  const [curveIntensity, setCurveIntensity] = useState<number>(0.5);
  const [curveDirection, setCurveDirection] = useState<"up" | "down">("up");
  const [fontFamily, setFontFamily] = useState<string>("sans-serif");
  const [customImageUrl, setCustomImageUrl] = useState<string>("");
  const [customImageAspect, setCustomImageAspect] = useState<number>(1); // 自选图片纵横比
  // overlay_text 状态
  const [overlayTextInput, setOverlayTextInput] = useState<string>("品质优选");
  const [overlayTextDirection, setOverlayTextDirection] = useState<"horizontal" | "vertical">("horizontal");
  const [overlayTextFont, setOverlayTextFont] = useState<"simhei" | "yahei" | "helvetica">("simhei");
  const [overlayTextWeight, setOverlayTextWeight] = useState<"normal" | "bold">("bold");

  /** 处理图片上传（最大 2MB，获取纵横比） */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（最大 2MB）
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`图片过大，请选择小于 2MB 的图片（当前 ${Math.round(file.size / 1024 / 1024)}MB）`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCustomImageUrl(dataUrl);

      // 获取图片实际尺寸，计算纵横比
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        setCustomImageAspect(aspectRatio);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  /** 创建自选图片元素 */
  const handleCustomImageSelect = () => {
    if (!customImageUrl) {
      alert("请先上传图片");
      return;
    }
    // 根据图片纵横比计算尺寸，保持自然比例
    const height = 0.20; // 固定高度 20%
    const width = height * customImageAspect; // 宽度 = 高度 × 纵横比

    const element: GraphicsElement = {
      type: "custom_image",
      x: (1 - width) / 2, // 水平居中
      y: (1 - height) / 2, // 垂直居中
      width,
      height,
      opacity: 1,
      rotation: 0,
      imageUrl: customImageUrl,
    };
    onSelect(element);
    onClose();
  };

  /** 创建普通图形元素 */
  const handleGraphicsSelect = (type: GraphicsElement["type"], defaultColor: string, aspectRatio?: number) => {
    // 固定高度 0.15，宽度根据纵横比计算（默认 1.67 即 0.25/0.15）
    const height = 0.15;
    const width = aspectRatio ? height * aspectRatio : 0.25;
    const element: GraphicsElement = {
      type,
      x: 0.3,
      y: 0.3,
      width,
      height,
      opacity: 0.6,
      color: defaultColor,
      rotation: 0,
      label: "",
    };
    onSelect(element);
    onClose();
  };

  /** 创建艺术字元素 */
  const handleArtTextSelect = (style: ArtTextStyle) => {
    const textContent = artTextInput || "品质";
    // 按换行符分割，计算行数
    const lines = textContent.split("\n");
    const lineCount = lines.length;
    const maxLineLength = Math.max(...lines.map(l => l.length));

    // 初始高度根据行数计算
    const baseHeight = 0.08;
    // 弧度模式下增加高度补偿（intensity * 50%）
    const curvePadding = curveEnabled ? curveIntensity * 0.04 : 0;
    const lineHeight = baseHeight * lineCount + curvePadding;
    // fontSize 相对于行高度（80%）
    const fontSizeRatio = 0.8;
    // 宽度估算公式：
    // - 汉字字符宽度 ≈ fontSize
    // - 描边/阴影/发光效果增加约 fontSize × 0.25（两侧）
    // - padding 约 fontSize × 0.15
    // 总计：fontSize × (字数 + 0.4) ≈ fontSize × 字数 × 1.2（对短文本）
    // 使用 1.8 作为安全系数，兼顾短文本和长文本
    const initialWidth = fontSizeRatio * lineHeight * maxLineLength * 1.8;

    const element: ArtTextElement = {
      type: "art_text",
      style,
      content: textContent,
      x: (1 - initialWidth) / 2, // 水平居中
      y: (1 - lineHeight) / 2, // 垂直居中
      width: initialWidth,
      height: lineHeight,
      opacity: 0.9,
      color: "#FFFFFF",
      secondaryColor: "#000000",
      fontSize: fontSizeRatio, // 相对于元素高度
      fontFamily,
      curve: curveEnabled ? { type: curveType, intensity: curveIntensity, direction: curveDirection } : undefined,
    };
    onSelect(element);
    onClose();
  };

  /** 创建普通文字元素 */
  const handleOverlayTextSelect = () => {
    const content = overlayTextInput || "品质优选";
    const charCount = content.length;

    // fontSize 被 clamp 到 36px（固定像素上限），选框宽度是相对值
    // 使用中间值 450px（介于手机预览 300px 和大图 800px）作为参考
    const maxFontSize = 36;
    const letterSpacing = 2;
    const charWidthPx = maxFontSize + letterSpacing; // 每字宽度 ≈ 38px
    const paddingPx = 24; // 两侧 padding（像素）

    // 使用中间画布宽度 450px
    const refCanvasWidth = 450;
    const charWidthRelative = charWidthPx / refCanvasWidth; // ≈ 0.084
    const paddingRelative = paddingPx / refCanvasWidth; // ≈ 0.053

    // 高度：基于 fontSize 下限 16px
    const heightBase = 0.10;

    // 横排：宽度 = 字数×字宽 + padding，高度 = 基础高度
    // 竖排：宽度 = 字宽 + padding，高度 = 字数×字宽 + padding
    const width = overlayTextDirection === "horizontal"
      ? charCount * charWidthRelative + paddingRelative * 2
      : charWidthRelative + paddingRelative * 2;
    const height = overlayTextDirection === "horizontal"
      ? heightBase
      : charCount * charWidthRelative + paddingRelative;

    const element: OverlayTextElement = {
      type: "overlay_text",
      content,
      x: (1 - width) / 2, // 水平居中
      y: (1 - height) / 2, // 垂直居中
      width,
      height,
      direction: overlayTextDirection,
      fontSize: 0.6, // 配合渲染代码默认值
      fontFamily: overlayTextFont,
      fontWeight: overlayTextWeight,
      color: "#FFFFFF",
      opacity: 0.95,
      rotation: 0,
    };
    onSelect(element);
    onClose();
  };

  /** 渲染图形卡片 */
  const renderGraphicsCard = (item: GraphicsTypeDef) => (
    <button
      key={item.type}
      onClick={() => handleGraphicsSelect(item.type, item.defaultColor, item.aspectRatio)}
      className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all group cursor-pointer"
    >
      <div
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 group-hover:bg-blue-100/60 transition-colors"
        style={{ color: item.defaultColor }}
      >
        {item.icon}
      </div>
      <span className="text-sm font-medium text-gray-700 mt-2">{item.name}</span>
      <span className="text-xs text-gray-400 mt-1 text-center leading-tight">{item.description}</span>
    </button>
  );

  /** 渲染艺术字风格卡片 */
  const renderArtStyleCard = (item: ArtTextStyleDef) => (
    <button
      key={item.style}
      onClick={() => handleArtTextSelect(item.style)}
      className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all group cursor-pointer"
    >
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 group-hover:bg-blue-100/60 transition-colors text-gray-600">
        {item.icon}
      </div>
      <span className="text-sm font-medium text-gray-700 mt-2">{item.name}</span>
      <span className="text-xs text-gray-400 mt-1 text-center leading-tight">{item.description}</span>
    </button>
  );

  /** 渲染当前标签页内容 */
  const renderTabContent = () => {
    // 艺术字 tab
    if (activeTab === "art_text") {
      return (
        <>
          {/* 艺术字文本输入 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">文字内容（支持换行）</label>
            <textarea
              value={artTextInput}
              onChange={(e) => setArtTextInput(e.target.value)}
              maxLength={32}
              rows={2}
              placeholder="请输入文字，换行生成多行艺术字"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">最多 32 字（含换行）</p>
          </div>

          {/* 字体选择 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">字体</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
            >
              {selectorFontPresets.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* 弧度控制 */}
          <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">弧度效果</label>
              <button
                onClick={() => setCurveEnabled(!curveEnabled)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  curveEnabled
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                }`}
              >
                {curveEnabled ? "开启" : "关闭"}
              </button>
            </div>
            {curveEnabled && (
              <div className="space-y-2">
                {/* 弧度类型 */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">弧度类型</label>
                  <div className="flex gap-2">
                    {[
                      { type: "arc", name: "弧形" },
                      { type: "wave", name: "波浪" },
                      { type: "bow", name: "弓形" },
                    ].map((t) => (
                      <button
                        key={t.type}
                        onClick={() => setCurveType(t.type as "arc" | "wave" | "bow")}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          curveType === t.type
                            ? "bg-blue-100 text-blue-600 border border-blue-300"
                            : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 弧度强度 */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    强度：{(curveIntensity * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.1"
                    value={curveIntensity}
                    onChange={(e) => setCurveIntensity(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                {/* 弧度方向 */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">方向</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurveDirection("up")}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        curveDirection === "up"
                          ? "bg-blue-100 text-blue-600 border border-blue-300"
                          : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      向上弯曲
                    </button>
                    <button
                      onClick={() => setCurveDirection("down")}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        curveDirection === "down"
                          ? "bg-blue-100 text-blue-600 border border-blue-300"
                          : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      向下弯曲
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 风格选择网格 */}
          <div className="grid grid-cols-2 gap-3">
            {artTextStyles.map(renderArtStyleCard)}
          </div>
        </>
      );
    }

    // 普通文字 tab
    if (activeTab === "overlay_text") {
      return (
        <>
          {/* 文字输入 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">文字内容</label>
            <input
              type="text"
              value={overlayTextInput}
              onChange={(e) => setOverlayTextInput(e.target.value)}
              maxLength={15}
              placeholder="输入简单文字（5-15字）"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1">适合标题短语，最多 15 字</p>
          </div>

          {/* 排版方向 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">排版方向</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOverlayTextDirection("horizontal")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  overlayTextDirection === "horizontal"
                    ? "bg-blue-100 text-blue-600 border border-blue-300"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                横排
              </button>
              <button
                onClick={() => setOverlayTextDirection("vertical")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  overlayTextDirection === "vertical"
                    ? "bg-blue-100 text-blue-600 border border-blue-300"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                竖排
              </button>
            </div>
          </div>

          {/* 字体选择 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">字体</label>
            <select
              value={overlayTextFont}
              onChange={(e) => setOverlayTextFont(e.target.value as "simhei" | "yahei" | "helvetica")}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
            >
              <option value="simhei">黑体</option>
              <option value="yahei">微软雅黑</option>
              <option value="helvetica">Helvetica</option>
            </select>
          </div>

          {/* 字重选择 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">字重</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOverlayTextWeight("normal")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  overlayTextWeight === "normal"
                    ? "bg-blue-100 text-blue-600 border border-blue-300"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                普通
              </button>
              <button
                onClick={() => setOverlayTextWeight("bold")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  overlayTextWeight === "bold"
                    ? "bg-blue-100 text-blue-600 border border-blue-300"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                加粗
              </button>
            </div>
          </div>

          {/* 添加按钮 */}
          <button
            onClick={handleOverlayTextSelect}
            className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            添加到画布
          </button>
        </>
      );
    }

    // 自选图片 tab
    if (activeTab === "custom") {
      return renderCustomImageTab();
    }

    // 其他图形分类 tab
    const category = categories.find((c) => c.key === activeTab);
    if (!category) return null;

    return (
      <div className="grid grid-cols-2 gap-3">
        {category.items.map(renderGraphicsCard)}
      </div>
    );
  };

  /** 渲染自选图片 tab */
  const renderCustomImageTab = () => (
    <div className="space-y-4">
      {/* 上传区域 */}
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          id="custom-image-upload"
        />
        <label htmlFor="custom-image-upload" className="cursor-pointer">
          <span className="material-icons-round text-4xl text-gray-300 mb-2">add_photo_alternate</span>
          <p className="text-sm text-gray-500">点击上传图片</p>
          <p className="text-xs text-gray-400 mt-1">支持 PNG、JPG、SVG（最大 2MB）</p>
        </label>
      </div>

      {/* 预览区域 */}
      {customImageUrl && (
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">预览</p>
          <img loading="lazy" src={customImageUrl} alt="预览" className="max-h-24 mx-auto rounded" />
          <button
            onClick={handleCustomImageSelect}
            className="mt-3 w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            添加到画布
          </button>
        </div>
      )}
    </div>
  );

  const allTabs: Array<{ key: CategoryKey; label: string }> = [
    ...categories.map((c) => ({ key: c.key, label: c.label })),
    { key: "overlay_text", label: "文字" },
    { key: "art_text", label: "艺术字" },
    { key: "custom", label: "自选图片" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-4 w-[560px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">添加图形</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="material-icons-round text-gray-500">close</span>
          </button>
        </div>

        {/* 分类标签栏 */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1 border-b border-gray-100 shrink-0">
          {allTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-500 text-white font-medium"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 标签页内容 */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {renderTabContent()}
        </div>

        {/* 底部提示 */}
        <p className="text-xs text-gray-400 mt-3 text-center shrink-0">
          选择后可在参数面板调整颜色、大小、位置等
        </p>
      </div>
    </div>,
    document.body,
  );
};
