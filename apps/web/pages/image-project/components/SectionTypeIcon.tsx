/**
 * SectionTypeIcon.tsx - Section 类型彩色图标 + 标签
 * 为 11 种 Section 类型定义 Material Icon、颜色和背景
 */

import React from "react";

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  outfit_overview: { icon: "style", color: "#2563eb", bg: "#dbeafe", label: "搭配总览" },
  detail_showcase: { icon: "visibility", color: "#7c3aed", bg: "#ede9fe", label: "细节展示" },
  scene_application: { icon: "landscape", color: "#059669", bg: "#d1fae5", label: "场景应用" },
  material_texture: { icon: "texture", color: "#b45309", bg: "#fef3c7", label: "材质纹理" },
  size_comparison: { icon: "straighten", color: "#dc2626", bg: "#fee2e2", label: "尺码对比" },
  call_to_action: { icon: "shopping_cart", color: "#e11d48", bg: "#ffe4e6", label: "行动号召" },
  brand_story: { icon: "auto_stories", color: "#6366f1", bg: "#e0e7ff", label: "品牌故事" },
  styling_guide: { icon: "menu_book", color: "#8b5cf6", bg: "#ede9fe", label: "穿搭指南" },
  detail_closeup: { icon: "zoom_in", color: "#0891b2", bg: "#cffafe", label: "细节特写" },
  outfit_recommendation: { icon: "recommend", color: "#ea580c", bg: "#ffedd5", label: "搭配推荐" },
  user_review: { icon: "reviews", color: "#4f46e5", bg: "#e0e7ff", label: "用户评价" },
};

interface SectionTypeIconProps {
  type: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export const SectionTypeIcon: React.FC<SectionTypeIconProps> = ({ type, size = "sm", showLabel = false }) => {
  const config = TYPE_CONFIG[type];
  if (!config) {
    return <span className="text-gray-400 text-xs">?</span>;
  }

  const iconSize = size === "sm" ? "w-5 h-5 text-xs" : "w-6 h-6 text-sm";

  if (showLabel) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ color: config.color, backgroundColor: config.bg }}
      >
        <span
          className={`${iconSize} material-icons-round flex-shrink-0`}
        >
          {config.icon}
        </span>
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={`${iconSize} material-icons-round rounded-md flex items-center justify-center flex-shrink-0`}
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.icon}
    </span>
  );
};

export function getSectionTypeLabel(type: string): string {
  return TYPE_CONFIG[type]?.label ?? type;
}
