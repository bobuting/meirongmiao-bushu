/**
 * template-matcher.ts - 根据 sectionType + 风格自动匹配设计模板
 *
 * 匹配策略：
 * 1. userSelectedTemplateId（用户手动选的）
 * 2. DEFAULT_TEMPLATE_PRIORITY[sectionType]（保证 section 间视觉多样性）
 *    styleName 作为微调：当默认不在偏好 category 时，尝试替换
 * 3. 候选列表兜底
 *
 * 关键原则：多样性 > 风格统一。宁可不同 section 用不同 category 的模板，
 * 也不要所有 section 用同一个模板。
 */

import type { SectionType, TemplateCategory } from './template-types.js';
import type { LayoutTemplateDefinition } from './template-types.js';
import {
  DESIGN_TEMPLATES,
  SECTION_TEMPLATE_MAP,
  DEFAULT_TEMPLATE_PRIORITY,
} from './design-templates.js';

/** styleName 关键词 → TemplateCategory 映射 */
const STYLE_KEYWORD_MAP: Record<TemplateCategory, string[]> = {
  xiaohongshu: ['休闲', '运动', '活力', '街头', '小红书', '时尚'],
  luxury: ['高端', '奢侈', '轻奢', '经典', '奢华', '尊贵'],
  minimal: ['简约', '极简', '现代', '简洁', '素雅'],
  tech: ['科技', '机能', '赛博', '未来', '先锋'],
  natural: ['自然', '清新', '户外', '森系', '田园', '环保'],
  editorial: ['杂志', '大片', '高级', '质感', '文艺'],
  creative: ['创意', '潮流', '个性', '独特', '艺术'],
  dark: ['暗黑', '酷炫', '夜场', '摇滚', '哥特'],
};

/** 根据风格名称推断 TemplateCategory */
function inferCategoryFromStyle(styleName: string): TemplateCategory | null {
  for (const [category, keywords] of Object.entries(STYLE_KEYWORD_MAP)) {
    if (keywords.some(kw => styleName.includes(kw))) {
      return category as TemplateCategory;
    }
  }
  return null;
}

/**
 * 自动匹配设计模板
 *
 * @param sectionType 当前 section 的类型
 * @param styleName 项目风格名称（来自 outfitPlan.styleName）
 * @param userSelectedTemplateId 用户手动选择的模板 ID（优先级最高）
 * @param usedTemplateIds 已使用的模板 ID 集合（避免重复，可选）
 * @returns 匹配到的模板定义，或 null
 */
export function matchTemplate(
  sectionType: string,
  styleName?: string,
  userSelectedTemplateId?: string,
  usedTemplateIds?: Set<string>,
): LayoutTemplateDefinition | null {
  // 优先级 1：用户手动选择
  if (userSelectedTemplateId) {
    const tpl = DESIGN_TEMPLATES[userSelectedTemplateId];
    if (tpl) return tpl;
  }

  const candidates = SECTION_TEMPLATE_MAP[sectionType as SectionType];
  const defaultId = DEFAULT_TEMPLATE_PRIORITY[sectionType as SectionType];

  if (!candidates || candidates.length === 0) {
    if (defaultId) return DESIGN_TEMPLATES[defaultId] ?? null;
    return null;
  }

  // 推断风格偏好 category
  const preferredCategory = styleName ? inferCategoryFromStyle(styleName) : null;

  // 优先级 2：默认优先级（保证 sectionType 间视觉多样性）
  if (defaultId) {
    const defaultTpl = DESIGN_TEMPLATES[defaultId];
    if (defaultTpl) {
      // 默认模板已在偏好 category 中，直接使用
      if (!preferredCategory || defaultTpl.category === preferredCategory) {
        // 避免与已用模板重复
        if (!usedTemplateIds || !usedTemplateIds.has(defaultId)) {
          return defaultTpl;
        }
      }
    }
  }

  // 默认不在偏好 category 或已重复 → 从候选中找
  if (preferredCategory) {
    // 过滤候选中同 category 且未使用的模板
    const categoryCandidates = candidates.filter(id => {
      const tpl = DESIGN_TEMPLATES[id];
      if (!tpl || tpl.category !== preferredCategory) return false;
      if (usedTemplateIds && usedTemplateIds.has(id)) return false;
      return true;
    });

    if (categoryCandidates.length > 0) {
      const pick = categoryCandidates[0];
      return DESIGN_TEMPLATES[pick] ?? null;
    }

    // 候选中同 category 全部用过了 → 放宽限制，允许重复
    const repeatCandidates = candidates.filter(id => {
      const tpl = DESIGN_TEMPLATES[id];
      return tpl && tpl.category === preferredCategory;
    });
    if (repeatCandidates.length > 0) {
      return DESIGN_TEMPLATES[repeatCandidates[0]] ?? null;
    }
  }

  // 优先级 3：默认模板（即使不在偏好 category，也用默认保证多样性）
  if (defaultId) {
    return DESIGN_TEMPLATES[defaultId] ?? null;
  }

  // 最终兜底：候选列表第一个（跳过已用的）
  if (usedTemplateIds) {
    const unused = candidates.find(id => !usedTemplateIds.has(id));
    if (unused) return DESIGN_TEMPLATES[unused] ?? null;
  }

  return DESIGN_TEMPLATES[candidates[0]] ?? null;
}

/** 结构元素类型（由模板负责生成，从 LLM 结果中过滤掉） */
const STRUCTURAL_ELEMENT_TYPES = new Set([
  'overlay_text',
  'divider_line',
  'corner_ornament',
  'border_frame',
  'quote_mark',
]);

/**
 * 从 LLM 生成的元素中过滤出卖点/内容元素
 * 去除结构类元素（这些由模板生成）
 */
export function filterContextualElements(
  elements: Array<{ type: string }>,
): Array<{ type: string }> {
  if (!elements || elements.length === 0) return [];
  return elements.filter(el => !STRUCTURAL_ELEMENT_TYPES.has(el.type));
}
