import { normalizeProjectFlowStep, type ProjectFlowStep } from "./project-last-step.js";

export interface Step1ResumeSnapshot {
  selectedOutfitPlanId: string | null;
  selectedOutfitSource: "visual" | "analysis" | null;
  outfitSummary: string | null;
}

export interface Step2ResumeSnapshot {
  selectedCharacterId: string | null;
  selectedPreviewId: string | null;
  confirmedModel: boolean;
  styledViewIds: string[];
}

export interface Step3ResumeSnapshot {
  scriptVersionId: string | null;
  scriptText: string | null;
  segmentCount: number;
}

export interface Step4ResumeSnapshot {
  frameIds: string[];
  frameCount: number;
}

export interface Step5ResumeSnapshot {
  latestJobId: string | null;
  clipCount: number;
  completedClipCount: number;
}

export interface Step6ResumeSnapshot {
  variantCount: number;
  hasVariants: boolean;
}

export interface Step7ResumeSnapshot {
  reviewId: string | null;
  exportUrl: string | null;
}

// ============================================================================
// 图片项目专用 Step Snapshot
// ============================================================================

/** 图片项目 Step 1: 服装搭配 */
export interface ImageStep1Snapshot {
  uploadedAssetIds: string[];
  outfitAnalysisResult: string | null;
  selectedOutfitPlanId: string | null;
  createdAt: number | null;
}

/** 图片项目 Step 2: 角色定妆 */
export interface ImageStep2Snapshot {
  styledViewIds: string[];
  selectedCharacterId: string | null;
  confirmedModel: boolean;
  createdAt: number | null;
}

/** 图片项目 Step 3: 模特图生成 */
export interface ImageStep3Snapshot {
  modelPhotoIds: string[];
  selectedPhotoIds: string[];
  generating: boolean;
  createdAt: number | null;
}

/** 图片项目 Step 4: 电商详情页 */
export interface ImageStep4Snapshot {
  sectionIds: string[];
  heroSectionCount: number;
  detailSectionCount: number;
  generatingAll: boolean;
  createdAt: number | null;
}

/** 图片项目 Step 快照信封（step1-step4） */
export interface ImageProjectStepSnapshotEnvelope {
  projectId: string;
  updatedAt: number;
  lastVisitedStep: 1 | 2 | 3 | 4;
  steps: {
    step1: ImageStep1Snapshot;
    step2: ImageStep2Snapshot;
    step3: ImageStep3Snapshot;
    step4: ImageStep4Snapshot;
  };
}

export interface ProjectStepSnapshotEnvelope {
  projectId: string;
  updatedAt: number;
  lastVisitedStep: ProjectFlowStep;
  steps: {
    step1: Step1ResumeSnapshot;
    step2: Step2ResumeSnapshot;
    step3: Step3ResumeSnapshot;
    step4: Step4ResumeSnapshot;
    step5: Step5ResumeSnapshot;
    step6: Step6ResumeSnapshot;
    step7: Step7ResumeSnapshot;
  };
  /** 图片项目专用（projectKind=image 时使用） */
  imageSteps?: ImageProjectStepSnapshotEnvelope["steps"];
}

export const PROJECT_STEP_SNAPSHOT_CONTRACT_VERSION = "N23-R9-02.v1";

export function createEmptyProjectStepSnapshot(projectId: string): ProjectStepSnapshotEnvelope {
  return {
    projectId,
    updatedAt: Date.now(),
    lastVisitedStep: 1,
    steps: {
      step1: {
        selectedOutfitPlanId: null,
        selectedOutfitSource: null,
        outfitSummary: null,
      },
      step2: {
        selectedCharacterId: null,
        selectedPreviewId: null,
        confirmedModel: false,
        styledViewIds: [],
      },
      step3: {
        scriptVersionId: null,
        scriptText: null,
        segmentCount: 0,
      },
      step4: {
        frameIds: [],
        frameCount: 0,
      },
      step5: {
        latestJobId: null,
        clipCount: 0,
        completedClipCount: 0,
      },
      step6: {
        variantCount: 0,
        hasVariants: false,
      },
      step7: {
        reviewId: null,
        exportUrl: null,
      },
    },
    imageSteps: {
      step1: {
        uploadedAssetIds: [],
        outfitAnalysisResult: null,
        selectedOutfitPlanId: null,
        createdAt: null,
      },
      step2: {
        selectedCharacterId: null,
        styledViewIds: [],
        confirmedModel: false,
        createdAt: null,
      },
      step3: {
        modelPhotoIds: [],
        selectedPhotoIds: [],
        generating: false,
        createdAt: null,
      },
      step4: {
        sectionIds: [],
        heroSectionCount: 0,
        detailSectionCount: 0,
        generatingAll: false,
        createdAt: null,
      },
    },
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isProjectStepSnapshotEnvelope(value: unknown): value is ProjectStepSnapshotEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const envelope = value as Partial<ProjectStepSnapshotEnvelope>;
  if (typeof envelope.projectId !== "string" || envelope.projectId.trim().length === 0) {
    return false;
  }
  if (!Number.isFinite(Number(envelope.updatedAt))) {
    return false;
  }
  const steps = envelope.steps;
  if (!steps || typeof steps !== "object") {
    return false;
  }

  const step1 = (steps as ProjectStepSnapshotEnvelope["steps"]).step1;
  const step2 = (steps as ProjectStepSnapshotEnvelope["steps"]).step2;
  const step3 = (steps as ProjectStepSnapshotEnvelope["steps"]).step3;
  const step4 = (steps as ProjectStepSnapshotEnvelope["steps"]).step4;
  const step5 = (steps as ProjectStepSnapshotEnvelope["steps"]).step5;
  const step6 = (steps as ProjectStepSnapshotEnvelope["steps"]).step6;
  const step7 = (steps as ProjectStepSnapshotEnvelope["steps"]).step7;

  if (
    !step1 ||
    !isNullableString(step1.selectedOutfitPlanId) ||
    !["visual", "analysis", null].includes(step1.selectedOutfitSource as "visual" | "analysis" | null) ||
    !isNullableString(step1.outfitSummary)
  ) {
    return false;
  }

  if (
    !step2 ||
    !isNullableString(step2.selectedCharacterId) ||
    !isNullableString(step2.selectedPreviewId) ||
    typeof step2.confirmedModel !== "boolean" ||
    !isStringArray(step2.styledViewIds)
  ) {
    return false;
  }

  if (
    !step3 ||
    !isNullableString(step3.scriptVersionId) ||
    !isNullableString(step3.scriptText) ||
    !Number.isFinite(Number(step3.segmentCount))
  ) {
    return false;
  }

  if (
    !step4 ||
    !isStringArray(step4.frameIds) ||
    !Number.isFinite(Number(step4.frameCount))
  ) {
    return false;
  }

  if (
    !step5 ||
    !isNullableString(step5.latestJobId) ||
    !Number.isFinite(Number(step5.clipCount)) ||
    !Number.isFinite(Number(step5.completedClipCount))
  ) {
    return false;
  }

  if (
    !step6 ||
    !Number.isFinite(Number(step6.variantCount)) ||
    typeof step6.hasVariants !== "boolean"
  ) {
    return false;
  }

  if (!step7 || !isNullableString(step7.reviewId) || !isNullableString(step7.exportUrl)) {
    return false;
  }

  // 图片项目 imageSteps 校验（可选字段，projectKind=image 时存在）
  const imageSteps = (envelope as Partial<ProjectStepSnapshotEnvelope>).imageSteps;
  if (imageSteps) {
    const imgStep1 = imageSteps.step1;
    const imgStep2 = imageSteps.step2;
    const imgStep3 = imageSteps.step3;
    const imgStep4 = imageSteps.step4;

    if (!imgStep1 || !Array.isArray(imgStep1.uploadedAssetIds) || !isNullableString(imgStep1.outfitAnalysisResult)
      || !isNullableString(imgStep1.selectedOutfitPlanId)) {
      return false;
    }
    if (!imgStep2 || !isNullableString(imgStep2.selectedCharacterId)
      || !Array.isArray(imgStep2.styledViewIds) || typeof imgStep2.confirmedModel !== "boolean") {
      return false;
    }
    if (!imgStep3 || !Array.isArray(imgStep3.modelPhotoIds) || !Array.isArray(imgStep3.selectedPhotoIds)
      || typeof imgStep3.generating !== "boolean") {
      return false;
    }
    if (!imgStep4 || !Array.isArray(imgStep4.sectionIds) || !Number.isFinite(Number(imgStep4.heroSectionCount))
      || !Number.isFinite(Number(imgStep4.detailSectionCount)) || typeof imgStep4.generatingAll !== "boolean") {
      return false;
    }
  }

  const normalizedLastStep = normalizeProjectFlowStep((envelope as { lastVisitedStep?: number }).lastVisitedStep, 1);
  return normalizedLastStep >= 1 && normalizedLastStep <= 5;
}
