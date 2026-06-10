/**
 * LayoutTemplateSelector.tsx - 版式模板选择器
 * 用户可预览和选择不同的版式模板
 */

import React, { useState } from "react";
import { LAYOUT_TEMPLATES, TEMPLATE_CATEGORIES, DEFAULT_TEMPLATE } from "../templates/layoutTemplates";
import type { LayoutTemplate } from "../templates/types";

interface LayoutTemplateSelectorProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
  onClose?: () => void;
}

/**
 * 版式模板选择器
 */
export const LayoutTemplateSelector: React.FC<LayoutTemplateSelectorProps> = ({
  selectedTemplateId,
  onSelect,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState("minimal");

  // 获取当前分类的模板
  const categoryTemplates = TEMPLATE_CATEGORIES[activeCategory as keyof typeof TEMPLATE_CATEGORIES]?.templates ?? [];
  const templates = LAYOUT_TEMPLATES.filter((t) => categoryTemplates.includes(t.id));

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-md">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-medium text-gray-800">选择版式模板</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="material-icons-round">close</span>
          </button>
        )}
      </div>

      {/* 分类Tab */}
      <div className="flex border-b border-gray-100">
        {Object.entries(TEMPLATE_CATEGORIES).map(([key, value]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`px-4 py-2 text-sm ${
              activeCategory === key
                ? "text-primary border-b-2 border-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {value.name}
          </button>
        ))}
      </div>

      {/* 模板列表 */}
      <div className="p-4 grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplateId === template.id}
            onClick={() => onSelect(template.id)}
          />
        ))}
      </div>

      {/* 当前选中 */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <p className="text-sm text-gray-500">
          当前模板: <span className="font-medium text-gray-700">
            {LAYOUT_TEMPLATES.find((t) => t.id === selectedTemplateId)?.name ?? "默认"}
          </span>
        </p>
      </div>
    </div>
  );
};

/**
 * 模板卡片
 */
const TemplateCard: React.FC<{
  template: LayoutTemplate;
  isSelected: boolean;
  onClick: () => void;
}> = ({ template, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`relative p-3 rounded-lg border-2 transition-all ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
    >
      {/* 模板名称 */}
      <p className="text-sm font-medium text-gray-700">{template.name}</p>

      {/* 选中指示 */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <span className="material-icons-round text-primary text-lg">check_circle</span>
        </div>
      )}

      {/* 模板参数摘要 */}
      <div className="mt-2 text-xs text-gray-500">
        <p>位置: {template.position.vertical} / {template.position.horizontal}</p>
        <p>遮罩: {template.overlay.type === 'none' ? '无' : template.overlay.type}</p>
      </div>
    </button>
  );
};

/**
 * 简化版模板选择器（下拉菜单）
 */
export const LayoutTemplateDropdown: React.FC<{
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
}> = ({ selectedTemplateId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const selectedTemplate = LAYOUT_TEMPLATES.find((t) => t.id === selectedTemplateId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
      >
        <span className="material-icons-round text-gray-400">palette</span>
        <span className="text-sm text-gray-700">
          {selectedTemplate?.name ?? "默认版式"}
        </span>
        <span className="material-icons-round text-gray-400">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-48">
          {LAYOUT_TEMPLATES.slice(0, 6).map((template) => (
            <button
              key={template.id}
              onClick={() => {
                onSelect(template.id);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                selectedTemplateId === template.id ? "bg-primary/5 text-primary" : "text-gray-700"
              }`}
            >
              {template.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};