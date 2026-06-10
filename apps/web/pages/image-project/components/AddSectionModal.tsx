/**
 * AddSectionModal.tsx - 添加模块模态框
 * 展示 11 种 Section 类型供用户选择
 */

import React from "react";
import { SectionTypeIcon } from "./SectionTypeIcon";

const SECTION_TYPES = [
  "brand_story",
  "outfit_overview",
  "detail_showcase",
  "scene_application",
  "material_texture",
  "size_comparison",
  "call_to_action",
  "styling_guide",
  "detail_closeup",
  "outfit_recommendation",
  "user_review",
] as const;

interface AddSectionModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sectionType: string) => void;
}

export const AddSectionModal: React.FC<AddSectionModalProps> = ({ open, onClose, onSelect }) => {
  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-primary">add_circle</span>
            <h3 className="text-lg font-semibold text-gray-800">添加模块</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="material-icons-round text-gray-400">close</span>
          </button>
        </div>

        {/* 类型网格 */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-500 mb-4">选择要添加的模块类型：</p>
          <div className="grid grid-cols-3 gap-3">
            {SECTION_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-primary/30 hover:bg-primary-light transition-all duration-150 active:scale-95"
              >
                <SectionTypeIcon type={type} size="md" showLabel />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
