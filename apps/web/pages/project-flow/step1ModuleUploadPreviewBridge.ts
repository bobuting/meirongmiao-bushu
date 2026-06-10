import type {
  Step1OutfitModule,
  Step1OutfitModuleCategory,
  Step1OutfitModuleImage,
  Step1OutfitSubjectTypeValue,
  Step1OutfitViewLabel,
} from "../../../../src/contracts/step1-outfit-module-contract";

export interface Step1ModuleImageMutationTarget {
  moduleId: string;
  target: "main" | "other";
  viewIndex?: number;
}

export function buildOptimisticStep1ModuleImage(input: {
  dataUrl: string;
  fileName: string | null;
  category: Step1OutfitModuleCategory;
  viewLabel: Step1OutfitViewLabel;
  reason: string | null;
  confidence?: number;
}): Step1OutfitModuleImage {
  return {
    imageId: `step1-module-image-local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    imageUrl: input.dataUrl,
    libraryAssetId: null,
    fileName: input.fileName,
    classification: {
      category: input.category,
      confidence: input.confidence ?? 0.2,
      viewLabel: input.viewLabel,
      reason: input.reason,
      feedbackCategory: null,
      feedbackConfidence: null,
      feedbackViewLabel: null,
      feedbackReason: null,
      feedbackMode: "none",
    },
    removedBgImageUrl: null,
    activeImageUrl: input.dataUrl,
    removeBgStatus: "idle",
    removeBgError: null,
    // 乐观更新时暂无标题和描述，等待分类结果返回后填充
    clothingTitle: null,
    clothingDescription: null,
  };
}

export function patchStep1ModuleImageSlot(input: {
  modules: Step1OutfitModule[];
  target: Step1ModuleImageMutationTarget;
  nextImage: Step1OutfitModuleImage;
  maxOtherViews: number;
  resolveSubjectType?: (module: Step1OutfitModule) => Step1OutfitSubjectTypeValue;
  // 回填主体名称和描述的回调，仅在主图上传且字段为空时调用
  resolveSubjectFields?: (module: Step1OutfitModule, image: Step1OutfitModuleImage) => {
    subjectName?: string;
    subjectDescription?: string;
  };
}): Step1OutfitModule[] {
  // 先尝试按 moduleId 精确匹配
  const exactMatchIndex = input.modules.findIndex((m) => m.moduleId === input.target.moduleId);
  // 如果精确匹配失败，回退到第一个对应类型的模块（处理页面 reload 后 moduleId 变化的情况）
  const targetIndex = exactMatchIndex >= 0
    ? exactMatchIndex
    : input.modules.findIndex((m) => {
        if (input.target.target === "main") {
          return !m.mainImage;
        }
        return m.otherViews.length < input.maxOtherViews;
      });

  return input.modules.map((module, index) => {
    if (index !== targetIndex) {
      return module;
    }
    const nextSubjectType = input.resolveSubjectType?.(module) ?? module.subjectType;
    // 主图上传时，回填 subjectName 和 subjectDescription
    const subjectFields = input.target.target === "main" && input.resolveSubjectFields
      ? input.resolveSubjectFields(module, input.nextImage)
      : {};
    if (input.target.target === "main") {
      return {
        ...module,
        subjectType: nextSubjectType,
        subjectName: subjectFields.subjectName ?? module.subjectName,
        subjectDescription: subjectFields.subjectDescription ?? module.subjectDescription,
        mainImage: input.nextImage,
      };
    }
    const nextOtherViews = [...module.otherViews];
    const targetViewIndex = Math.max(0, Math.floor(input.target.viewIndex ?? nextOtherViews.length));
    if (targetViewIndex < nextOtherViews.length) {
      nextOtherViews[targetViewIndex] = input.nextImage;
    } else if (nextOtherViews.length < input.maxOtherViews) {
      nextOtherViews.push(input.nextImage);
    }
    return {
      ...module,
      subjectType: nextSubjectType,
      otherViews: nextOtherViews.slice(0, input.maxOtherViews),
    };
  });
}
