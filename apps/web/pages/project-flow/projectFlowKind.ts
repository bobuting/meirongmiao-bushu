import type { LayoutWorkflowStep } from "../../components/layout/layoutNavigationController";

export type ProjectFlowKind = "image" | "video" | "reverse" | "outfit_change";

/** 图片项目最大步骤数（路由 step1-4，step5 为发布态归入 step4） */
export const IMAGE_PROJECT_MAX_STEP = 4;

/** 换装项目最大步骤数 */
export const OUTFIT_CHANGE_MAX_STEP = 4;

/** 视频项目状态 → Step 编号 */
export const VIDEO_STATUS_TO_STEP: Record<string, number> = {
  DRAFT: 1,
  GARMENT_UPLOADED: 1,
  ROLE_DIRECTION_CONFIRMED: 1,
  OUTFIT_SELECTED: 1,
  OUTFIT_CONFIRMED: 1,
  CHARACTER_VIEW_READY: 2,
  CHARACTER_SELECTED: 2,
  CHARACTER_CONFIRMED: 2,
  SCRIPT_GENERATED: 3,
  SCRIPT_SELECTED: 3,
  SCRIPT_CONFIRMED: 3,
  STORYBOARDING: 3,
  STORYBOARD_PREVIEW_COMPLETED: 3,
  FILMING: 4,
  CLIPS_READY: 4,
  FISSIONING: 6,
  READY_TO_PUBLISH: 5,
  PUBLISHED: 5,
};

/** 图片项目状态 → Step 编号（step1-4，发布态归入 step4） */
export const IMAGE_STATUS_TO_STEP: Record<string, number> = {
  IMAGE_DRAFT: 1,
  IMAGE_GARMENT_UPLOADED: 1,
  IMAGE_ROLE_DIRECTION_CONFIRMED: 1,
  IMAGE_OUTFIT_SELECTED: 1,
  IMAGE_OUTFIT_CONFIRMED: 2,
  IMAGE_CHARACTER_VIEW_READY: 2,
  IMAGE_CHARACTER_SELECTED: 2,
  IMAGE_CHARACTER_CONFIRMED: 2,
  IMAGE_MODEL_PHOTOS_READY: 3,
  IMAGE_DETAIL_PAGE_GENERATED: 4,
  IMAGE_READY_TO_PUBLISH: 4,
  IMAGE_PUBLISHED: 4,
};

/** 换装项目状态 → Step 编号（复用视频状态，但映射到 4 步流程） */
export const OUTFIT_CHANGE_STATUS_TO_STEP: Record<string, number> = {
  DRAFT: 1,
  GARMENT_UPLOADED: 1,
  ROLE_DIRECTION_CONFIRMED: 1,
  OUTFIT_SELECTED: 1,
  OUTFIT_CONFIRMED: 2,
  CHARACTER_VIEW_READY: 2,
  CHARACTER_SELECTED: 2,
  CHARACTER_CONFIRMED: 3,
  SCRIPT_GENERATED: 3,
  SCRIPT_SELECTED: 3,
  SCRIPT_CONFIRMED: 3,
  STORYBOARDING: 3,
  STORYBOARD_PREVIEW_COMPLETED: 3,
  FILMING: 4,
  CLIPS_READY: 4,
  READY_TO_PUBLISH: 4,
  PUBLISHED: 4,
};

/** 兼容旧代码：合并所有映射 */
export const PROJECT_STATUS_TO_STEP: Record<string, number> = {
  ...VIDEO_STATUS_TO_STEP,
  ...IMAGE_STATUS_TO_STEP,
};

/** 根据状态和项目类型获取 Step 编号 */
export const getStepFromStatus = (status: string | undefined | null, projectKind?: string | null): number => {
  if (!status || status.trim().length < 1) return 1;

  let mapping: Record<string, number>;
  if (projectKind === "image") {
    mapping = IMAGE_STATUS_TO_STEP;
  } else if (projectKind === "outfit_change") {
    mapping = OUTFIT_CHANGE_STATUS_TO_STEP;
  } else {
    mapping = VIDEO_STATUS_TO_STEP;
  }

  const step = mapping[status];
  if (step === undefined) {
    console.error(`[getStepFromStatus] Unknown status: ${status} for projectKind=${projectKind}, please update mapping`);
    return 1;
  }
  return step;
};

const VIDEO_FLOW_BACKEND_STATUS = new Set([
  "SCRIPT_CONFIRMED",
  "STORYBOARDING",
  "FILMING",
  "CLIPS_READY",
  "FISSIONING",
  "READY_TO_PUBLISH",
  "PUBLISHED",
]);

export function resolveResumeProjectFlowKind(
  persistedKind: unknown,
  status?: string | null,
  lastVisitedStep?: number | null,
): ProjectFlowKind {
  if (persistedKind === "image" || persistedKind === "video" || persistedKind === "reverse" || persistedKind === "outfit_change") {
    return persistedKind;
  }
  if (typeof status === "string" && VIDEO_FLOW_BACKEND_STATUS.has(status)) {
    return "video";
  }
  if (typeof lastVisitedStep === "number" && Number.isFinite(lastVisitedStep) && lastVisitedStep >= 5) {
    return "video";
  }
  return "video";
}

export function normalizeProjectResumeStep(_lastVisitedStep: number | null | undefined, status?: string, projectKind?: string | null): number {
  // 直接使用 status + projectKind 映射，忽略 lastVisitedStep
  return getStepFromStatus(status, projectKind);
}

export function resolveProjectFlowKind(value: unknown): ProjectFlowKind {
  if (value === "image") return "image";
  if (value === "reverse") return "reverse";
  if (value === "outfit_change") return "outfit_change";
  return "video";
}

export function isImageProjectFlow(value: unknown): boolean {
  return resolveProjectFlowKind(value) === "image";
}

export function isOutfitChangeProjectFlow(value: unknown): boolean {
  return resolveProjectFlowKind(value) === "outfit_change";
}

export function clampProjectFlowStepForKind(step: number, kind: unknown): number {
  const normalizedStep = Number.isFinite(step) ? Math.max(1, Math.floor(step)) : 1;
  if (isImageProjectFlow(kind)) {
    return Math.min(IMAGE_PROJECT_MAX_STEP, normalizedStep);
  }
  if (isOutfitChangeProjectFlow(kind)) {
    return Math.min(OUTFIT_CHANGE_MAX_STEP, normalizedStep);
  }
  return normalizedStep;
}

export function isProjectFlowStepAllowed(kind: unknown, step: number): boolean {
  return clampProjectFlowStepForKind(step, kind) === step;
}

export function filterWorkflowStepsByProjectKind(
  steps: readonly LayoutWorkflowStep[],
  kind: unknown,
): LayoutWorkflowStep[] {
  if (isImageProjectFlow(kind)) {
    return steps.filter((step) => step.id <= IMAGE_PROJECT_MAX_STEP);
  }
  if (isOutfitChangeProjectFlow(kind)) {
    return steps.filter((step) => step.id <= OUTFIT_CHANGE_MAX_STEP);
  }
  return [...steps];
}

export function resolveStep2PrimaryActionLabels(kind: unknown, submitting: boolean, locked?: boolean, hasSelectedCharacter?: boolean, hasGeneratedCharacters?: boolean): {
  desktop: string;
  mobile: string;
  iconName: string;
} {
  // 锁定状态时，统一显示"下一步"
  if (locked) {
    return {
      desktop: submitting ? "进入下一步中" : "下一步",
      mobile: submitting ? "进入中" : "下一步",
      iconName: "arrow_forward",
    };
  }
  if (isImageProjectFlow(kind)) {
    // 图片项目：角色已选择时显示"生成电商主图"
    if (hasSelectedCharacter) {
      return {
        desktop: submitting ? "生成中..." : "生成电商主图",
        mobile: submitting ? "生成中" : "生成主图",
        iconName: submitting ? "hourglass_top" : "auto_awesome",
      };
    }
    // 图片项目：角色已生成但未选择时显示"请选择角色"
    if (hasGeneratedCharacters) {
      return {
        desktop: "请选择角色",
        mobile: "请选择角色",
        iconName: "touch_app",
      };
    }
    return {
      desktop: submitting ? "进入下一步中" : "进入下一步",
      mobile: submitting ? "进入中" : "下一步",
      iconName: "arrow_forward",
    };
  }
  return {
    desktop: submitting ? "导入角色中" : "生成脚本",
    mobile: submitting ? "导入中" : "下一步",
    iconName: "arrow_forward",
  };
}
