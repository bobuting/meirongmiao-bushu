/**
 * template-layout 模块 - 设计模板自动匹配 + 排版元素生成
 *
 * 核心原则：模板定骨架，LLM 填灵魂
 * - 模板 → 遮罩、标题区域、文案区域、结构装饰
 * - LLM → title/copy 内容、卖点图形、艺术字
 */

// 类型
export type {
  SectionType,
  TemplateCategory,
  LayoutCategory,
  LayoutTemplateDefinition,
  LayoutTemplate,
  DesignElements,
  ColorScheme,
  ImageConstraint,
  ElementPosition,
  GradientConfig,
  DividerElement,
  BrandAccentElement,
  TextEffectConfig,
  MicroDecoration,
} from './template-types.js';

// 模板数据
export {
  DESIGN_TEMPLATES,
  SECTION_TEMPLATE_MAP,
  DEFAULT_TEMPLATE_PRIORITY,
  getDefaultTemplate,
  getTemplateDefinition,
  isTemplateApplicable,
} from './design-templates.js';

// 模板 → 元素转换
export { templateToElements } from './template-to-elements.js';

// 模板匹配
export { matchTemplate, filterContextualElements } from './template-matcher.js';

import type { GraphicsLayerElement } from '../../contracts/types.js';
import { filterContextualElements } from './template-matcher.js';

/**
 * 合并模板骨架元素 + LLM 卖点图形
 *
 * 模板生成的骨架元素放在前面（遮罩 → 标题 → 文案 → 分割线 → 角标），
 * LLM 生成的卖点图形放在后面（art_text, air_flow, quality_stamp 等）
 */
export function mergeElements(
  skeletonElements: GraphicsLayerElement[],
  llmElements: GraphicsLayerElement[],
): GraphicsLayerElement[] {
  const contextualElements = filterContextualElements(llmElements) as GraphicsLayerElement[];
  return [...skeletonElements, ...contextualElements];
}
