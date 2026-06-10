import type { Gender } from "./step1-role-preset-contract.js";
import type { Step1RolePresetAllowedRegion } from "./step1-role-preset-governance-contract.js";
import type { OutfitItemType, OutfitItemSource } from "./outfit-plan.dto.js";

export const STEP1_JOINT_REVERSE_CONTRACT_VERSION = "AT30-03.v1";

/** 服饰单品 */
export interface OutfitItem {
  type: OutfitItemType;      // 服饰类型
  name: string;              // 服饰名称
  style: string;             // 服饰风格
  description: string;       // 服饰描述
  source?: OutfitItemSource; // 单品来源：user=用户输入，generated=智能补齐
}

/**
 * 穿搭方案（合并分析内容）
 */
export interface Step1OutfitPlan {
  index: number;
  styleName: string;         // 风格/趋势词
  title: string;             // 方案标题
  reason: string;            // 推荐理由
  items: OutfitItem[];       // 服饰单品数组
  analysis: string;          // 搭配分析
  optimizedPrompt: string;   // 搜图提示词
  suitableScene?: string;    // 适用场景
  tags?: string[];           // 风格标签（3个）
}

/**
 * 穿搭推荐结果（简化版，只有 plans 和趋势总结）
 */
export interface Step1OutfitRecommendResult {
  trendSummary: string;      // 趋势总结
  plans: Step1OutfitPlan[];  // 搭配方案列表
}

export const STEP1_JOINT_REVERSE_RENDER_STATES = [
  "pending",
  "partial",
  "ready",
  "failed",
] as const;

export type Step1JointReverseRenderState = (typeof STEP1_JOINT_REVERSE_RENDER_STATES)[number];

export interface Step1RoleDirectionCard {
  directionId: string;
  styleSummary: string;
  portraitUrl: string | null;
  confidence: number;
  ethnicityOrRegion?: Step1RolePresetAllowedRegion | null;
  gender?: Gender | null;
  age?: number | null;
  styleWords?: string[] | null;
}

/** 角色方向调整建议（用户可点击快速调整） */
export interface Step1RoleAdjustmentSuggestion {
  suggestionId: string;
  title: string;
  description: string;
  /** 年龄倾向："更大一点" | "更小一点" | null */
  ageDirection: string | null;
  /** 性别倾向："偏男性" | "偏女性" | null */
  genderLean: string | null;
  /** 风格倾向：简短风格描述 */
  styleLean: string | null;
  gender: Gender;
  age: number;
}

export interface Step1JointReverseResponse {
  reverseTaskId: string;
  roleDirectionCards: Step1RoleDirectionCard[];
  renderState: Step1JointReverseRenderState;
  progressPercent: number;
}

function assertConfidenceRange(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${fieldName} must be a finite number between 0 and 1`);
  }
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function assertCardArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return value as Record<string, unknown>[];
}

function normalizeRoleDirectionCards(value: unknown): Step1RoleDirectionCard[] {
  return assertCardArray(value, "roleDirectionCards").map((item, index) => {
    const suffix = `roleDirectionCards[${index}]`;
    const directionId = assertString(item.directionId, `${suffix}.directionId`);
    const styleSummary = assertString(item.styleSummary, `${suffix}.styleSummary`);
    const portraitUrl = item.portraitUrl;
    if (portraitUrl !== null && typeof portraitUrl !== "string") {
      throw new Error(`${suffix}.portraitUrl must be string or null`);
    }
    const normalizedPortraitUrl = portraitUrl === null ? null : (portraitUrl as string);
    const confidence = Number(item.confidence);
    assertConfidenceRange(confidence, `${suffix}.confidence`);
    const normalizeOptionalString = (value: unknown): string | null =>
      typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    const age =
      typeof item.age === "number" && Number.isFinite(item.age) ? Math.floor(item.age) : null;
    const styleWords = Array.isArray(item.styleWords)
      ? item.styleWords
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry, idx, arr) => entry.length > 0 && arr.indexOf(entry) === idx)
      : null;
    const gender =
      item.gender === "male" || item.gender === "female" || item.gender === "unknown"
        ? (item.gender as Gender)
        : null;
    const ethnicityOrRegion = normalizeOptionalString(item.ethnicityOrRegion) as Step1RolePresetAllowedRegion | null;
    return {
      directionId,
      styleSummary,
      portraitUrl: normalizedPortraitUrl,
      confidence,
      ethnicityOrRegion,
      gender,
      age,
      styleWords,
    };
  });
}

export function normalizeStep1JointReverseResponse(input: unknown): Step1JointReverseResponse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("step1 joint reverse response must be an object");
  }
  const record = input as Record<string, unknown>;
  const reverseTaskId = assertString(record.reverseTaskId, "reverseTaskId");
  const roleDirectionCards = normalizeRoleDirectionCards(record.roleDirectionCards);

  const renderState = record.renderState;
  if (!STEP1_JOINT_REVERSE_RENDER_STATES.includes(renderState as Step1JointReverseRenderState)) {
    throw new Error("renderState must be one of pending|partial|ready|failed");
  }

  const progressPercent = Number(record.progressPercent);
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new Error("progressPercent must be a finite number between 0 and 100");
  }

  return {
    reverseTaskId,
    roleDirectionCards,
    renderState: renderState as Step1JointReverseRenderState,
    progressPercent,
  };
}

export function assertStep1JointReverseContract(): {
  version: string;
  renderStateCount: number;
  requiredCardGroups: number;
} {
  const renderStateSet = new Set(STEP1_JOINT_REVERSE_RENDER_STATES);
  if (renderStateSet.size !== STEP1_JOINT_REVERSE_RENDER_STATES.length) {
    throw new Error("step1 joint reverse render states must stay unique");
  }
  if (!renderStateSet.has("pending") || !renderStateSet.has("partial") || !renderStateSet.has("ready")) {
    throw new Error("render states must keep progressive rendering coverage");
  }

  return {
    version: STEP1_JOINT_REVERSE_CONTRACT_VERSION,
    renderStateCount: STEP1_JOINT_REVERSE_RENDER_STATES.length,
    requiredCardGroups: 2,
  };
}
