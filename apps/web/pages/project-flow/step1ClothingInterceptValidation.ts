type Step1ClassificationLike = {
  category?: string | null;
  reason?: string | null;
};

type Step1ModuleLike = {
  moduleId?: string | null;
  subjectName?: string | null;
  mainImage?: {
    classification?: Step1ClassificationLike | null;
  } | null;
};

const STEP1_NON_CLOTHING_REASON_PATTERN =
  /(未检测到任何可见的衣物|未识别为服饰|无法生成有效的时尚穿搭建议|请提供一张包含清晰人物和服装的图片)/;

export function isBlockedStep1MainImageClassification(
  classification: Step1ClassificationLike | null | undefined,
): boolean {
  if (!classification) {
    return false;
  }
  const category = String(classification.category ?? "").trim().toLowerCase();
  const reason = String(classification.reason ?? "").trim();
  return category === "unknown" || STEP1_NON_CLOTHING_REASON_PATTERN.test(reason);
}

export function findBlockedStep1Module(
  modules: readonly Step1ModuleLike[],
): Step1ModuleLike | null {
  return (
    modules.find((module) =>
      isBlockedStep1MainImageClassification(module.mainImage?.classification ?? null),
    ) ?? null
  );
}

export function buildBlockedStep1ModuleMessage(
  module: Step1ModuleLike | null | undefined,
): string {
  const subjectName = String(module?.subjectName ?? "").trim();
  if (subjectName) {
    return `「${subjectName}」主图未识别为服饰，请删除后重新上传正确的服装图片。`;
  }
  return "当前主图未识别为服饰，请删除后重新上传正确的服装图片。";
}
