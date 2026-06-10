/**
 * 设计模板选择器
 * 用户可选择设计模板，实时预览效果
 */

import React from 'react';
import {
  DESIGN_TEMPLATES,
  SECTION_TEMPLATE_MAP,
} from '../templates/designTemplates';
import type { SectionType, TemplateCategory } from '../templates/types';

/** 分类中文名 */
const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  xiaohongshu: '小红书',
  luxury: '奢华',
  minimal: '极简',
  tech: '科技',
  natural: '自然',
  editorial: '杂志',
  creative: '创意',
  dark: '暗黑',
  card: '卡片',
  social: '社交',
  magazine: '杂志',
};

interface DesignTemplateSelectorProps {
  /** 当前 Section 类型 */
  sectionType: SectionType;
  /** 当前选中的模板 ID */
  currentTemplateId: string;
  /** 模板切换回调 */
  onTemplateChange: (templateId: string) => void;
}

export const DesignTemplateSelector: React.FC<DesignTemplateSelectorProps> = ({
  sectionType,
  currentTemplateId,
  onTemplateChange,
}) => {
  // 推荐模板（排前面），其余模板追加在后
  const recommendedIds = new Set(SECTION_TEMPLATE_MAP[sectionType] || []);
  const allTemplateIds = Object.keys(DESIGN_TEMPLATES);
  const sortedIds = [
    ...recommendedIds,
    ...allTemplateIds.filter((id) => !recommendedIds.has(id)),
  ];

  if (sortedIds.length === 0) {
    return (
      <div className="text-sm text-gray-500 p-3">
        暂无可用模板
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* 标题 */}
      <h3 className="text-sm font-medium text-gray-700 mb-3">设计模板</h3>

      {/* 模板网格 */}
      <div className="grid grid-cols-2 gap-2">
        {sortedIds.map((templateId, index) => {
          const template = DESIGN_TEMPLATES[templateId];
          if (!template) return null;

          const isSelected = currentTemplateId === templateId;
          const isRecommended = index < recommendedIds.size;

          return (
            <button
              key={templateId}
              onClick={() => onTemplateChange(templateId)}
              className={`
                template-card p-2 rounded-lg border transition-all
                ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {/* 模板预览色块 */}
              <div
                className="h-10 rounded mb-2 flex items-center justify-center relative"
                style={{
                  background: `linear-gradient(135deg, ${template.colorScheme.primary}50, ${template.colorScheme.secondary}50)`,
                }}
              >
                {/* 推荐标识 */}
                {isRecommended && (
                  <span className="absolute top-0.5 right-0.5 text-[9px] px-1 py-px rounded bg-primary/80 text-white">推荐</span>
                )}
                {/* 文字效果预览 */}
                <span
                  className="text-xs font-medium"
                  style={{
                    color: template.layout.typography.title.colorMode === 'white' ? '#FFFFFF' : template.layout.typography.title.customColor || '#333333',
                    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                >
                  示例
                </span>
              </div>

              {/* 模板名称 */}
              <p className="text-xs font-medium text-gray-800 truncate">
                {template.displayName}
              </p>

              {/* 模板分类标签 */}
              <p className="text-xs text-gray-500">{CATEGORY_LABELS[template.category] ?? template.category}</p>

              {/* 设计感元素标签 */}
              <div className="flex flex-wrap gap-1 mt-1">
                {template.designElements.divider && (
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    分割线
                  </span>
                )}
                {template.designElements.brandAccent && (
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    点缀
                  </span>
                )}
                {template.designElements.textEffect && (
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    效果
                  </span>
                )}
                {((template.designElements.microDecorations?.length ?? 0) > 0) && (
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    装饰
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 当前模板详情预览 */}
      {currentTemplateId && DESIGN_TEMPLATES[currentTemplateId] && (
        <TemplateDetailPreview templateId={currentTemplateId} />
      )}
    </div>
  );
};

/**
 * 模板详情预览组件
 */
const TemplateDetailPreview: React.FC<{ templateId: string }> = ({ templateId }) => {
  const template = DESIGN_TEMPLATES[templateId];
  if (!template) return null;

  return (
    <div className="mt-3 p-2 bg-gray-50 rounded-lg">
      {/* 模板信息 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-800">
          {template.displayName}
        </span>
        <span className="text-xs text-gray-500">
          {CATEGORY_LABELS[template.category] ?? template.category}
        </span>
      </div>

      {/* 版式信息 */}
      <div className="text-xs text-gray-600 mb-1">
        <span className="font-medium">版式：</span>
        {template.layout.name}
      </div>

      {/* 文字位置 */}
      <div className="text-xs text-gray-600 mb-1">
        <span className="font-medium">文字：</span>
        {template.layout.position.vertical === 'center' ? '居中' : template.layout.position.vertical === 'bottom' ? '底部' : '顶部'}
        {' / '}
        {template.layout.position.horizontal === 'center' ? '居中' : template.layout.position.horizontal}
      </div>

      {/* 品牌色系预览 */}
      <div className="flex items-center gap-1 mt-2">
        <span className="text-xs text-gray-500">色系：</span>
        <div
          className="w-5 h-5 rounded border border-gray-200"
          style={{ backgroundColor: template.colorScheme.primary }}
          title="主色"
        />
        <div
          className="w-5 h-5 rounded border border-gray-200"
          style={{ backgroundColor: template.colorScheme.secondary }}
          title="辅色"
        />
        <div
          className="w-5 h-5 rounded border border-gray-200"
          style={{ backgroundColor: template.colorScheme.shadowColor }}
          title="阴影色"
        />
        <div
          className="w-5 h-5 rounded border border-gray-200"
          style={{ backgroundColor: template.colorScheme.glowColor }}
          title="发光色"
        />
      </div>

      {/* 图片约束提示 */}
      <div className="text-xs text-gray-500 mt-2 p-1 bg-white rounded">
        图片约束：{template.imageConstraint.productPosition.coverage}
        {template.imageConstraint.emptyArea.position !== 'none' &&
          `，${template.imageConstraint.emptyArea.position}预留${template.imageConstraint.emptyArea.size}`}
      </div>
    </div>
  );
};