// 服装类别标签映射
const CATEGORY_LABELS: Record<string, string> = {
  top: "上装",
  bottom: "下装",
  shoes: "鞋履",
  accessory: "配饰",
};

export interface Step2OutfitReferenceItem {
  category: string;
  label: string;
  imageUrl: string | null;
}

/** 从 step1OutfitModules 构建服饰参考列表 */
export function buildStep2OutfitReferenceItems(modules?: Array<{
  subjectType?: string | null;
  subjectName?: string | null;
  mainImage?: { activeImageUrl?: string | null } | null;
}>): Step2OutfitReferenceItem[] {
  if (!modules || modules.length === 0) {
    return [];
  }

  // 从 step1OutfitModules 构建
  return modules
    .filter((m) => m.mainImage?.activeImageUrl)
    .map((m) => ({
      category: m.subjectType || "服饰",
      label: m.subjectName || CATEGORY_LABELS[m.subjectType || ""] || m.subjectType || "服饰",
      imageUrl: m.mainImage!.activeImageUrl!,
    }));
}
