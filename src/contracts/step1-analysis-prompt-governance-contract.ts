export const STEP1_ANALYSIS_PROMPT_GOVERNANCE_CONTRACT_VERSION = "AT35-06.v1";

export const STEP1_ANALYSIS_PROMPT_SEGMENT_IDS = [
  "analysis-zh",
  "optimized-prompt-en",
  "slot-suggestions",
] as const;
export type Step1AnalysisPromptSegmentId = (typeof STEP1_ANALYSIS_PROMPT_SEGMENT_IDS)[number];

export interface Step1AnalysisPromptSegmentEntry {
  segmentId: Step1AnalysisPromptSegmentId;
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export const STEP1_ANALYSIS_PROMPT_DIRTY_TOKEN_DENYLIST = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  "img_",
  "dsc_",
  "screenshot",
  "微信图片",
  "只输出 json",
  "不要解释",
  "grounding 搜索结果",
  "analysis card",
  "latency-check",
] as const;

export const STEP1_ANALYSIS_PROMPT_RUNTIME_REMAINING_RESPONSIBILITIES = [
  "provider request execution",
  "cache lifecycle",
  "route orchestration",
  "response transport",
] as const;

export const STEP1_ANALYSIS_PROMPT_GOVERNANCE_INVARIANTS = [
  "analysis-zh must stay full Chinese analysis text and may append complementary suggestion summary, but must not leak meta instructions into optimized-prompt-en.",
  "optimized-prompt-en must stay production-ready for image generation, may be English-only, and must not carry dirty filename tokens, JSON meta instructions, or Chinese analysis sentences.",
  "slot-suggestions must stay three single complementary item labels and must not expand into full sentences or mixed-language prompt prose.",
  "AT35 Step1 prompt tasks that touch analysis cards must land on a named prompt segment boundary instead of re-expanding the src/app.ts prompt blob.",
] as const;

export const STEP1_ANALYSIS_PROMPT_SEGMENT_PLAN: readonly Step1AnalysisPromptSegmentEntry[] = [
  {
    segmentId: "analysis-zh",
    currentOwnerFiles: ["src/app.ts", "apps/web/pages/project-flow/step1JointReverseService.ts"],
    targetFile: null,
    ownedSymbols: [
      "analysis 必须是完整中文分析",
      "analysisPrompt",
      "analysisStatusMessage",
    ],
    ownedConcerns: [
      "full-chinese-analysis-body",
      "complementary-summary-tail",
      "analysis-card-display-shape",
    ],
    contractDependencies: [
      "src/contracts/step1-joint-reverse-contract.ts",
      "test/step1_analysis_prompt_grounding_contract.unit.test.ts",
    ],
  },
  {
    segmentId: "optimized-prompt-en",
    currentOwnerFiles: ["src/app.ts", "apps/web/pages/project-flow/step1JointReverseService.ts"],
    targetFile: "src/modules/step1-optimized-prompt-builder.ts",
    ownedSymbols: [
      "optimizedPrompt 可用英文",
      "requestLlmOptimizeOutfitPrompt",
      "optimizedPrompt",
    ],
    ownedConcerns: [
      "image-generation-production-prompt",
      "core-item-must-stay-unchanged",
      "english-only-rewrite-boundary",
      "one-to-three-complementary-pieces",
    ],
    contractDependencies: [
      "src/contracts/hidden-prompt-cleaning-contract.ts",
      "test/step1_prompt_core_sanitization_contract.unit.test.ts",
    ],
  },
  {
    segmentId: "slot-suggestions",
    currentOwnerFiles: ["src/app.ts", "apps/web/pages/project-flow/step1JointReverseService.ts"],
    targetFile: null,
    ownedSymbols: [
      "normalizeOutfitItemDisplayName",
    ],
    ownedConcerns: [
      "single-item-label-only",
      "bottom-shoes-accessory-split",
      "filename-dirty-value-normalization",
    ],
    contractDependencies: [
      "src/contracts/step1-clean-hidden-prompt-contract.ts",
      "test/step1_joint_reverse_service.unit.test.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertSegmentId(value: unknown, fieldName: string): Step1AnalysisPromptSegmentId {
  if (!STEP1_ANALYSIS_PROMPT_SEGMENT_IDS.includes(value as Step1AnalysisPromptSegmentId)) {
    throw new Error(`${fieldName} must be analysis-zh|optimized-prompt-en|slot-suggestions`);
  }
  return value as Step1AnalysisPromptSegmentId;
}

export function normalizeStep1AnalysisPromptSegmentPlan(input: unknown): Step1AnalysisPromptSegmentEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step1 analysis prompt segment plan must be an array");
  }

  const seen = new Set<Step1AnalysisPromptSegmentId>();
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`plan[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const segmentId = assertSegmentId(record.segmentId, `plan[${index}].segmentId`);
    if (seen.has(segmentId)) {
      throw new Error(`duplicate segmentId: ${segmentId}`);
    }
    seen.add(segmentId);

    const targetFile = record.targetFile;
    if (targetFile !== null && (typeof targetFile !== "string" || targetFile.trim().length === 0)) {
      throw new Error(`plan[${index}].targetFile must be a non-empty string or null`);
    }

    return {
      segmentId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile: typeof targetFile === "string" ? targetFile.trim() : null,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function getStep1AnalysisPromptSegmentEntry(
  segmentId: Step1AnalysisPromptSegmentId,
): Step1AnalysisPromptSegmentEntry {
  const entry = STEP1_ANALYSIS_PROMPT_SEGMENT_PLAN.find((item) => item.segmentId === segmentId);
  if (!entry) {
    throw new Error(`unknown segmentId: ${segmentId}`);
  }
  return entry;
}

export function findStep1AnalysisDirtyTokens(text: string): string[] {
  const normalized = text.trim().toLowerCase();
  return STEP1_ANALYSIS_PROMPT_DIRTY_TOKEN_DENYLIST.filter((token) => normalized.includes(token));
}

export function assertStep1AnalysisPromptGovernanceContract(): {
  version: string;
  segmentCount: number;
  dirtyTokenCount: number;
  hotspotFile: string;
  extractionTargetCount: number;
} {
  return {
    version: STEP1_ANALYSIS_PROMPT_GOVERNANCE_CONTRACT_VERSION,
    segmentCount: STEP1_ANALYSIS_PROMPT_SEGMENT_PLAN.length,
    dirtyTokenCount: STEP1_ANALYSIS_PROMPT_DIRTY_TOKEN_DENYLIST.length,
    hotspotFile: "src/app.ts",
    extractionTargetCount: STEP1_ANALYSIS_PROMPT_SEGMENT_PLAN.filter((entry) => entry.targetFile).length,
  };
}
