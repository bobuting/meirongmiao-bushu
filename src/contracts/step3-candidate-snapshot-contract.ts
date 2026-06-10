import type {
  Project
} from "../contracts/types.js";
import type { ScriptDto, ShotBreakdownDto, ScriptStrategyType } from "./script.dto.js";
import type { AtmosphereSceneCategory, EmotionToneCategory } from "../contant-config/style-atmosphere-dict.js";
import { safeParseAtmosphere, safeParseEmotionTone } from "../utils/dict-converters.js";

export const STEP3_CANDIDATE_SNAPSHOT_CONTRACT_VERSION = "AT49-07.v3";
export const STEP3_VIDEO_REVERSE_PIPELINE_SOURCES = [
  "reverse_parse_v2_video_url",
  "hot_trend_video_batch",
] as const;
export const STEP3_VIDEO_STORY_POLISH_MODES = [
  "llm_polished",
  "fallback",
  "llm_batch_polished",
] as const;

export const STEP3_CANDIDATE_LOCK_STATES = [
  "idle",
  "snapshot_ready",
  "selected_unconfirmed",
  "confirmed_locked",
  "admin_unlocked",
] as const;

export type Step3CandidateLockState = (typeof STEP3_CANDIDATE_LOCK_STATES)[number];
export type Step3VideoReversePipelineSource = (typeof STEP3_VIDEO_REVERSE_PIPELINE_SOURCES)[number];
export type Step3VideoStoryPolishMode = (typeof STEP3_VIDEO_STORY_POLISH_MODES)[number];

export type Step3CandidateGenerationMode = "real" | "degraded" | "emotion_archetype" | "story_theme" | "resonance";

/** 分镜镜头实体（继承 ShotBreakdownDto，无额外字段） */
export interface ShotBreakdownEntity extends ShotBreakdownDto {
  // 后端目前无额外字段，继承即可
}

// ===== 新增类型定义 =====

/** 情绪分析 */
export interface Step3EmotionAnalysis {
  surfaceEmotion?: string[];
  deepEmotion?: string[];
  emotionConflict?: string;
  emotionOutlet?: string;
}

/** 主题分析 */
export interface Step3ThemeAnalysis {
  phenomenon?: string;
  underlyingIssue?: string;
  corePainPoint?: string;
  valueProposition?: string;
  resonanceGroup?: string;
}

/** 推演结果 */
export interface Step3DeductionResult {
  scene?: string;
  style?: string;
  storyLine?: string;
  characterState?: string;
}

/** 多样化维度 */
export interface Step3Diversification {
  hookType?: string;
  narrativeStructure?: string;
  emotionTone?: string;
  visualStyle?: string;
  dialogueStyle?: string;
  pacing?: string;
  innovationElements?: string[];
  cameraLanguage?: string;
  retentionHook?: string;
  retentionHookPosition?: number;
  creativityLevel?: string;
}

/** BGM建议 */
export interface Step3BgmSuggestion {
  style?: string;
  emotionMatch?: string;
  bpm?: string;
  referenceTracks?: string[];
  soundEffects?: string[];
}

/** 标题建议项 */
export interface Step3TitleSuggestion {
  type: string;
  title: string;
  recommended?: boolean;
}

/** 发布建议 */
export interface Step3PublishSuggestion {
  bestTime?: string;
  targetUser?: string;
  coverSuggestion?: string;
  captionSuggestion?: string;
}

/** 铁律检查详情 */
export interface Step3IronLawsCheckDetails {
  noClothingCloseup?: boolean;
  consistency?: boolean;
  strongHook?: boolean;
  properDuration?: boolean;
  properShotCount?: boolean;
  aestheticCompliance?: boolean;
  genderConsistency?: boolean;
}

/** 铁律检查 */
export interface Step3IronLawsCheck {
  passed: boolean;
  details?: Step3IronLawsCheckDetails;
  violations?: string[];
}

/** 质量检查项 */
export interface Step3QualityCheckItem {
  score: number;
  passed: boolean;
  details?: string;
}

/** 质量检查报告 */
export interface Step3QualityCheckReport {
  hookStrength?: Step3QualityCheckItem;
  emotionArc?: Step3QualityCheckItem;
  memorability?: Step3QualityCheckItem;
  innovation?: Step3QualityCheckItem;
  fashionNaturalness?: Step3QualityCheckItem;
  pacing?: Step3QualityCheckItem;
  totalScore?: number;
  rating?: string;
  optimizationSuggestions?: string[];
}

export interface Step3ScriptCandidateStoryboardPanelDigest {
  sourceType: "video_url";
  frameCount: number;
  summary: string;
}

/** 脚本候选项（继承 ScriptDto，添加后端专用 LLM 分析字段） */
export interface ScriptCandidateEntity extends ScriptDto {
  // === 后端专用字段 ===

  /** 分镜面板摘要（后端渲染用） */
  storyboardPanelDigest?: Step3ScriptCandidateStoryboardPanelDigest;

  // === LLM 结构化分析字段（后端处理用，不暴露到前端 API） ===
  /** 情绪分析 */
  emotionAnalysis?: Step3EmotionAnalysis;
  /** 主题分析 */
  themeAnalysis?: Step3ThemeAnalysis;
  /** 推演结果 */
  deductionResult?: Step3DeductionResult;
  /** 多样化维度 */
  diversification?: Step3Diversification;
  /** BGM建议 */
  bgmSuggestion?: Step3BgmSuggestion;
  /** 标题建议 */
  titleSuggestions?: Step3TitleSuggestion[];
  /** 话题标签 */
  hashtags?: string[];
  /** 发布建议 */
  publishSuggestion?: Step3PublishSuggestion;
  /** 铁律检查 */
  ironLawsCheck?: Step3IronLawsCheck;
  /** 质量检查报告 */
  qualityCheckReport?: Step3QualityCheckReport;
}

export interface Step3ScriptCandidateSnapshot {
  snapshotId: string;
  projectId: string;
  promptVersion: string;
  topNAtCreation: number;
  lockState: Step3CandidateLockState;
  selectedCandidateId: string | null;
  confirmedCandidateId: string | null;
  lockVersion: number;
  generationMode: Step3CandidateGenerationMode;
  createdAt: number;
  items: ScriptCandidateEntity[];
}

/** Step3 候选快照引用元数据（用于快速预览，无需查询完整数据） */
export interface Step3ScriptCandidateMeta {
  candidateId: string;
  rank: number;
  /** 脚本生成策略类型 */
  strategyType: ScriptStrategyType;
  title: string;
  preview: string;
}

/** Step3 候选快照引用（精简版，只存引用，候选内容从 nrm_script_data 查询） */
export interface Step3ScriptCandidateSnapshotRef {
  /** 格式标识，用于读取时检测新旧格式 */
  schemaVersion: "ref_v1";
  snapshotId: string;
  projectId: string;
  promptVersion: string;
  topNAtCreation: number;
  lockState: Step3CandidateLockState;
  selectedCandidateId: string | null;
  confirmedCandidateId: string | null;
  lockVersion: number;
  generationMode: Step3CandidateGenerationMode;
  createdAt: number;
  /** 候选ID列表（引用 nrm_script_data.id） */
  candidateIds: string[];
  /** 可选：候选基础元数据（用于快速预览，无需查询完整数据） */
  candidateMetas?: Step3ScriptCandidateMeta[];
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function assertNonNegativeInteger(value: unknown, fieldName: string): number {
  // 支持数字类型和字符串类型的数字
  const numValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(numValue) || numValue < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return numValue;
}

function normalizeLockState(value: unknown): Step3CandidateLockState {
  if (typeof value !== "string" || !(STEP3_CANDIDATE_LOCK_STATES as readonly string[]).includes(value)) {
    throw new Error("lockState must be a valid Step3 lock state");
  }
  return value as Step3CandidateLockState;
}

// ===== 新增：嵌套对象规范化辅助函数 =====

/** 规范化大模型结构化输出单对象字段，返回 { key: value } 或 {} */
function normalizeStructField<T extends Record<string, unknown>>(value: unknown, key: string): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { [key]: value as T }
    : {};
}

/** 规范化大模型结构化输出数组字段，返回 { key: value } 或 {} */
function normalizeStructArrayField<T extends Record<string, unknown>>(value: unknown, key: string): Record<string, T[]> {
  return Array.isArray(value)
    ? { [key]: value as T[] }
    : {};
}

/** 规范化情绪分析 */
function normalizeEmotionAnalysis(value: unknown): Step3EmotionAnalysis | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    surfaceEmotion: Array.isArray(obj.surfaceEmotion)
      ? obj.surfaceEmotion.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 10)
      : undefined,
    deepEmotion: Array.isArray(obj.deepEmotion)
      ? obj.deepEmotion.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 10)
      : undefined,
    emotionConflict: typeof obj.emotionConflict === "string" ? obj.emotionConflict.trim() : undefined,
    emotionOutlet: typeof obj.emotionOutlet === "string" ? obj.emotionOutlet.trim() : undefined,
  };
}

/** 规范化主题分析 */
function normalizeThemeAnalysis(value: unknown): Step3ThemeAnalysis | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    phenomenon: typeof obj.phenomenon === "string" ? obj.phenomenon.trim() : undefined,
    underlyingIssue: typeof obj.underlyingIssue === "string" ? obj.underlyingIssue.trim() : undefined,
    corePainPoint: typeof obj.corePainPoint === "string" ? obj.corePainPoint.trim() : undefined,
    valueProposition: typeof obj.valueProposition === "string" ? obj.valueProposition.trim() : undefined,
    resonanceGroup: typeof obj.resonanceGroup === "string" ? obj.resonanceGroup.trim() : undefined,
  };
}

/** 规范化推演结果 */
function normalizeDeductionResult(value: unknown): Step3DeductionResult | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    scene: typeof obj.scene === "string" ? obj.scene.trim() : undefined,
    style: typeof obj.style === "string" ? obj.style.trim() : undefined,
    storyLine: typeof obj.storyLine === "string" ? obj.storyLine.trim() : undefined,
    characterState: typeof obj.characterState === "string" ? obj.characterState.trim() : undefined,
  };
}

/** 规范化多样化维度 */
function normalizeDiversification(value: unknown): Step3Diversification | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    hookType: typeof obj.hookType === "string" ? obj.hookType.trim() : undefined,
    narrativeStructure: typeof obj.narrativeStructure === "string" ? obj.narrativeStructure.trim() : undefined,
    emotionTone: typeof obj.emotionTone === "string" ? obj.emotionTone.trim() : undefined,
    visualStyle: typeof obj.visualStyle === "string" ? obj.visualStyle.trim() : undefined,
    dialogueStyle: typeof obj.dialogueStyle === "string" ? obj.dialogueStyle.trim() : undefined,
    pacing: typeof obj.pacing === "string" ? obj.pacing.trim() : undefined,
    innovationElements: Array.isArray(obj.innovationElements)
      ? obj.innovationElements.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 5)
      : undefined,
    cameraLanguage: typeof obj.cameraLanguage === "string" ? obj.cameraLanguage.trim() : undefined,
    retentionHook: typeof obj.retentionHook === "string" ? obj.retentionHook.trim() : undefined,
    retentionHookPosition: typeof obj.retentionHookPosition === "number" ? obj.retentionHookPosition : undefined,
    creativityLevel: typeof obj.creativityLevel === "string" ? obj.creativityLevel.trim() : undefined,
  };
}

/** 规范化BGM建议 */
function normalizeBgmSuggestion(value: unknown): Step3BgmSuggestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    style: typeof obj.style === "string" ? obj.style.trim() : undefined,
    emotionMatch: typeof obj.emotionMatch === "string" ? obj.emotionMatch.trim() : undefined,
    bpm: typeof obj.bpm === "string" ? obj.bpm.trim() : undefined,
    referenceTracks: Array.isArray(obj.referenceTracks)
      ? obj.referenceTracks.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 5)
      : undefined,
    soundEffects: Array.isArray(obj.soundEffects)
      ? obj.soundEffects.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 10)
      : undefined,
  };
}

/** 规范化标题建议 */
function normalizeTitleSuggestions(value: unknown): Step3TitleSuggestion[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value
    .map((item): Step3TitleSuggestion | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const type = typeof obj.type === "string" ? obj.type.trim() : "";
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      if (type.length === 0 || title.length === 0) {
        return null;
      }
      return {
        type,
        title,
        recommended: typeof obj.recommended === "boolean" ? obj.recommended : undefined,
      };
    })
    .filter((item): item is Step3TitleSuggestion => item !== null)
    .slice(0, 5);
  return result.length > 0 ? result : undefined;
}

/** 规范化发布建议 */
function normalizePublishSuggestion(value: unknown): Step3PublishSuggestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    bestTime: typeof obj.bestTime === "string" ? obj.bestTime.trim() : undefined,
    targetUser: typeof obj.targetUser === "string" ? obj.targetUser.trim() : undefined,
    coverSuggestion: typeof obj.coverSuggestion === "string" ? obj.coverSuggestion.trim() : undefined,
    captionSuggestion: typeof obj.captionSuggestion === "string" ? obj.captionSuggestion.trim() : undefined,
  };
}

/** 规范化铁律检查 */
function normalizeIronLawsCheck(value: unknown): Step3IronLawsCheck | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const passed = typeof obj.passed === "boolean" ? obj.passed : false;

  // 规范化 details
  let details: Step3IronLawsCheckDetails | undefined;
  if (obj.details && typeof obj.details === "object" && !Array.isArray(obj.details)) {
    const d = obj.details as Record<string, unknown>;
    details = {
      noClothingCloseup: typeof d.noClothingCloseup === "boolean" ? d.noClothingCloseup : undefined,
      consistency: typeof d.consistency === "boolean" ? d.consistency : undefined,
      strongHook: typeof d.strongHook === "boolean" ? d.strongHook : undefined,
      properDuration: typeof d.properDuration === "boolean" ? d.properDuration : undefined,
      properShotCount: typeof d.properShotCount === "boolean" ? d.properShotCount : undefined,
      aestheticCompliance: typeof d.aestheticCompliance === "boolean" ? d.aestheticCompliance : undefined,
      genderConsistency: typeof d.genderConsistency === "boolean" ? d.genderConsistency : undefined,
    };
  }

  // 规范化 violations
  const violations = Array.isArray(obj.violations)
    ? obj.violations.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 10)
    : undefined;

  return {
    passed,
    details,
    violations,
  };
}

/** 规范化质量检查项 */
function normalizeQualityCheckItem(value: unknown): Step3QualityCheckItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const score = typeof obj.score === "number" ? obj.score : undefined;
  const passed = typeof obj.passed === "boolean" ? obj.passed : undefined;
  const details = typeof obj.details === "string" ? obj.details.trim() : undefined;

  if (score === undefined && passed === undefined && !details) {
    return undefined;
  }

  return {
    score: score ?? 0,
    passed: passed ?? false,
    details,
  };
}

/** 规范化质量检查报告 */
function normalizeQualityCheckReport(value: unknown): Step3QualityCheckReport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;

  const hookStrength = normalizeQualityCheckItem(obj.hookStrength);
  const emotionArc = normalizeQualityCheckItem(obj.emotionArc);
  const memorability = normalizeQualityCheckItem(obj.memorability);
  const innovation = normalizeQualityCheckItem(obj.innovation);
  const fashionNaturalness = normalizeQualityCheckItem(obj.fashionNaturalness);
  const pacing = normalizeQualityCheckItem(obj.pacing);

  // 如果没有任何检查项，返回 undefined
  if (!hookStrength && !emotionArc && !memorability && !innovation && !fashionNaturalness && !pacing) {
    return undefined;
  }

  return {
    hookStrength,
    emotionArc,
    memorability,
    innovation,
    fashionNaturalness,
    pacing,
    totalScore: typeof obj.totalScore === "number" ? obj.totalScore : undefined,
    rating: typeof obj.rating === "string" ? obj.rating.trim() : undefined,
    optimizationSuggestions: Array.isArray(obj.optimizationSuggestions)
      ? obj.optimizationSuggestions.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 10)
      : undefined,
  };
}

export function isStep3CandidateLockTransitionAllowed(
  from: Step3CandidateLockState,
  to: Step3CandidateLockState,
): boolean {
  if (from === to) {
    return true;
  }
  if (from === "idle" && to === "snapshot_ready") {
    return true;
  }
  if (from === "snapshot_ready" && (to === "selected_unconfirmed" || to === "confirmed_locked")) {
    return true;
  }
  if (from === "selected_unconfirmed" && (to === "snapshot_ready" || to === "confirmed_locked")) {
    return true;
  }
  if (from === "confirmed_locked" && to === "admin_unlocked") {
    return true;
  }
  if (from === "admin_unlocked" && (to === "selected_unconfirmed" || to === "snapshot_ready" || to === "confirmed_locked")) {
    return true;
  }
  return false;
}

/**
 * 规范化并验证 Step3 脚本候选快照数据
 *
 * 功能说明：
 * 1. 将未知类型的数据转换为类型安全的 Step3ScriptCandidateSnapshot 结构
 * 2. 验证所有必需字段存在且类型正确
 * 3. 对枚举字段进行合法性检查（如 generationMode, strategyType, suitability）
 * 4. 处理可选字段的默认值和边界条件
 *
 * @param input - 待验证的原始快照数据（通常来自数据库或API响应）
 * @param project - 关联的项目对象，用于获取 projectId
 * @returns 规范化后的 Step3ScriptCandidateSnapshot 对象
 * @throws 当数据格式不合法时抛出错误
 */
export function normalizeStep3ScriptCandidateSnapshot(input: unknown, project: Project): Step3ScriptCandidateSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("step3 snapshot must be an object");
  }
  const source = input as Record<string, unknown>;
  const generationMode =
    source.generationMode === "degraded"
      ? "degraded"
      : source.generationMode === "real"
        ? "real"
        : null;
  if (!generationMode) {
    throw new Error("generationMode must be real or degraded");
  }
  if (!Array.isArray(source.items)) {
    throw new Error("items must be an array");
  }
  if (source.items.length < 1 || source.items.length > 50) {
    throw new Error("items must contain between 1 and 50 snapshot candidates");
  }
  // topNAtCreation 默认使用 items.length
  const topNAtCreation = assertNonNegativeInteger(
    source.topNAtCreation ?? source.items.length,
    "topNAtCreation"
  );
  return {
    snapshotId: assertNonEmptyString(source.snapshotId, "snapshotId"),
    projectId: assertNonEmptyString(project.id, "projectId"),
    promptVersion: assertNonEmptyString(source.promptVersion, "promptVersion"),
    topNAtCreation,
    lockState: normalizeLockState(source.lockState),
    selectedCandidateId:
      source.selectedCandidateId === null || source.selectedCandidateId === undefined
        ? null
        : assertNonEmptyString(source.selectedCandidateId, "selectedCandidateId"),
    confirmedCandidateId:
      source.confirmedCandidateId === null || source.confirmedCandidateId === undefined
        ? null
        : assertNonEmptyString(source.confirmedCandidateId, "confirmedCandidateId"),
    lockVersion: assertNonNegativeInteger(source.lockVersion ?? 0, "lockVersion"),
    generationMode,
    createdAt: assertNonNegativeInteger(source.createdAt ?? Date.now(), "createdAt"),
    items: source.items.map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`items[${index}] must be an object`);
      }
      const item = raw as Record<string, unknown>;
      const sharedPipelineSource =
        typeof item.sharedPipelineSource === "string" &&
        (STEP3_VIDEO_REVERSE_PIPELINE_SOURCES as readonly string[]).includes(item.sharedPipelineSource)
          ? (item.sharedPipelineSource as Step3VideoReversePipelineSource)
          : undefined;
      const storyPolishMode =
        typeof item.storyPolishMode === "string" &&
        (STEP3_VIDEO_STORY_POLISH_MODES as readonly string[]).includes(item.storyPolishMode)
          ? (item.storyPolishMode as Step3VideoStoryPolishMode)
          : undefined;
      const matchScoreRaw = Number(item.matchScore);
      const matchScore =
        Number.isFinite(matchScoreRaw) && matchScoreRaw >= 0 && matchScoreRaw <= 1
          ? Math.round(matchScoreRaw * 1000) / 1000
          : undefined;
      const matchReasons = Array.isArray(item.matchReasons)
        ? item.matchReasons
            .map((reason) => String(reason ?? "").trim())
            .filter((reason) => reason.length > 0)
            .slice(0, 4)
        : undefined;
      const storyboardPanelDigest =
        item.storyboardPanelDigest && typeof item.storyboardPanelDigest === "object" && !Array.isArray(item.storyboardPanelDigest)
          ? (() => {
              const digest = item.storyboardPanelDigest as Record<string, unknown>;
              const sourceType: Step3ScriptCandidateStoryboardPanelDigest["sourceType"] | null =
                digest.sourceType === "video_url" ? "video_url" : null;
              if (!sourceType) {
                return undefined;
              }
              const summary = typeof digest.summary === "string" ? digest.summary.trim() : "";
              if (summary.length < 1) {
                return undefined;
              }
              const frameCount = Number(digest.frameCount);
              if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 20) {
                return undefined;
              }
              return {
                sourceType,
                frameCount,
                summary,
              };
            })()
          : undefined;
      return {
        candidateId: assertNonEmptyString(item.candidateId ?? `fallback-candidate-${index}`, `items[${index}].candidateId`),
        sourceScriptId: assertNonEmptyString(item.sourceScriptId ?? `fallback-script-${index}`, `items[${index}].sourceScriptId`),
        sourceUrl:
          item.sourceUrl === undefined || item.sourceUrl === null
            ? undefined
            : assertNonEmptyString(item.sourceUrl, `items[${index}].sourceUrl`),
        rank: assertNonNegativeInteger(item.rank ?? index + 1, `items[${index}].rank`),
        strategyType: (() => {
          const raw = item.strategyType;
          if (raw === "video") return "video";
          if (raw === "library") return "library";
          if (raw === "effectiveness") return "effectiveness";
          if (raw === "custom") return "custom";
          if (raw === "fashion") return "fashion";
          if (raw === "emotion_archetype") return "emotion_archetype";
          if (raw === "aesthetic") return "aesthetic";
          if (raw === "product_showcase") return "product_showcase";
          // 默认 realtime
          return "realtime";
        })(),
        title: assertNonEmptyString(item.title ?? `脚本 ${index + 1}`, `items[${index}].title`),
        preview: assertNonEmptyString(item.preview ?? item.title ?? `脚本 ${index + 1} 预览`, `items[${index}].preview`),
        content: assertNonEmptyString(item.content ?? item.preview ?? item.title ?? `脚本 ${index + 1} 内容`, `items[${index}].content`),
        durationSec: assertNonNegativeInteger(item.durationSec ?? 20, `items[${index}].durationSec`),
        suitability:
          item.suitability === "high" || item.suitability === "medium" || item.suitability === "low"
            ? item.suitability
            : null,
        labels: Array.isArray(item.labels)
          ? item.labels
              .map((label) => String(label ?? "").trim())
              .filter((label) => label.length > 0)
              .slice(0, 8)
          : [],
        storyboardSegments: Array.isArray(item.storyboardSegments)
          ? item.storyboardSegments
              .map((rawSegment, segmentIndex) => {
                if (!rawSegment || typeof rawSegment !== "object" || Array.isArray(rawSegment)) {
                  return null;
                }
                const segment = rawSegment as Record<string, unknown>;
                // 【修复】不再使用默认值降级处理，如果 content 和 visualCue 都为空则跳过该分镜
                const title = assertNonEmptyString(
                  segment.title || `镜头 ${segmentIndex + 1}`,
                  `items[${index}].storyboardSegments[${segmentIndex}].title`
                );
                // content 和 visualCue 都为空时跳过该分镜
                const rawContent = typeof segment.content === "string" ? segment.content.trim() : "";
                const rawVisualCue = typeof segment.visualCue === "string" ? segment.visualCue.trim() : "";
                if (!rawContent && !rawVisualCue) {
                  return null;
                }
                const content = rawContent;
                const visualCue = rawVisualCue;
                // visualPrompt 可选：只有明确提供时才保留
                const visualPrompt =
                  typeof segment.visualPrompt === "string" && segment.visualPrompt.trim().length > 0
                    ? segment.visualPrompt.trim()
                    : undefined;
                // shotSize 可选：景别（远景/全景/中景/近景/特写）
                const shotSize =
                  typeof segment.shotSize === "string" && segment.shotSize.trim().length > 0
                    ? segment.shotSize.trim()
                    : undefined;
                // dialogue 可选：旁白/对话
                const dialogue =
                  typeof segment.dialogue === "string" && segment.dialogue.trim().length > 0
                    ? segment.dialogue.trim()
                    : undefined;
                // action 可选：动作描述
                const action =
                  typeof segment.action === "string" && segment.action.trim().length > 0
                    ? segment.action.trim()
                    : undefined;
                // ===== 新增字段 =====
                // durationSec 可选：镜头时长
                const segmentDurationSec =
                  typeof segment.durationSec === "number" && segment.durationSec > 0
                    ? segment.durationSec
                    : undefined;
                // summary 可选：分镜概要
                const summary =
                  typeof segment.summary === "string" && segment.summary.trim().length > 0
                    ? segment.summary.trim()
                    : undefined;
                // climaxFunction 可选：高潮功能
                const climaxFunction =
                  typeof segment.climaxFunction === "string" && segment.climaxFunction.trim().length > 0
                    ? segment.climaxFunction.trim()
                    : undefined;
                // climaxIntensity 可选：高潮强度（1-5）
                const climaxIntensity =
                  typeof segment.climaxIntensity === "number" && segment.climaxIntensity >= 1 && segment.climaxIntensity <= 5
                    ? segment.climaxIntensity
                    : undefined;
                // isHook 可选：是否为钩子镜头
                const isHook =
                  typeof segment.isHook === "boolean"
                    ? segment.isHook
                    : undefined;
                // isClimax 可选：是否为高潮镜头
                const isClimax =
                  typeof segment.isClimax === "boolean"
                    ? segment.isClimax
                    : undefined;
                // emotionNote 可选：情绪标注
                const emotionNote =
                  typeof segment.emotionNote === "string" && segment.emotionNote.trim().length > 0
                    ? segment.emotionNote.trim()
                    : undefined;
                // audio 可选：音频信息（用于 Step4 音乐匹配）
                const audio =
                  segment.audio && typeof segment.audio === "object" ? segment.audio : undefined;

                return {
                  title,
                  content,
                  visualCue,
                  ...(visualPrompt ? { visualPrompt } : {}),
                  ...(shotSize ? { shotSize } : {}),
                  ...(dialogue ? { dialogue } : {}),
                  ...(action ? { action } : {}),
                  ...(segmentDurationSec ? { durationSec: segmentDurationSec } : {}),
                  ...(summary ? { summary } : {}),
                  ...(climaxFunction ? { climaxFunction } : {}),
                  ...(climaxIntensity ? { climaxIntensity } : {}),
                  ...(isHook !== undefined ? { isHook } : {}),
                  ...(isClimax !== undefined ? { isClimax } : {}),
                  ...(emotionNote ? { emotionNote } : {}),
                  ...(audio ? { audio } : {}),
                };
              })
              .filter((segment) => segment !== null)
              .slice(0, 20) as ShotBreakdownEntity[]
          : undefined,
        storyboardPanelDigest,
        sharedPipelineSource,
        storyPolishMode,
        ...(matchScore !== undefined ? { matchScore } : {}),
        ...(matchReasons && matchReasons.length > 0 ? { matchReasons } : {}),

        // ===== 【新增】独立字段（带默认值保护，不报错） =====
        ...(typeof item.mainScene === "string" && item.mainScene.trim().length > 0 ? { mainScene: item.mainScene.trim() } : {}),
        ...(typeof item.timeOfDay === "string" && item.timeOfDay.trim().length > 0 ? { timeOfDay: item.timeOfDay.trim() } : {}),
        ...(typeof item.weather === "string" && item.weather.trim().length > 0 ? { weather: item.weather.trim() } : {}),
        ...(typeof item.atmosphere === "string" && item.atmosphere.trim().length > 0 ? { atmosphere: safeParseAtmosphere(item.atmosphere.trim()) ?? undefined } : {}),
        ...(typeof item.scriptStyle === "string" && item.scriptStyle.trim().length > 0 ? { scriptStyle: item.scriptStyle.trim() } : {}),
        ...(typeof item.shotCount === "number" && Number.isInteger(item.shotCount) && item.shotCount > 0 ? { shotCount: item.shotCount } : {}),
        ...(typeof item.scriptType === "string" && item.scriptType.trim().length > 0 ? { scriptType: item.scriptType.trim() } : {}),
        ...(typeof item.audienceProfile === "string" && item.audienceProfile.trim().length > 0 ? { audienceProfile: item.audienceProfile.trim() } : {}),
        ...(typeof item.emotionTone === "string" && item.emotionTone.trim().length > 0 ? { emotionTone: safeParseEmotionTone(item.emotionTone.trim()) ?? undefined } : {}),
        ...(typeof item.theme === "string" && item.theme.trim().length > 0 ? { theme: item.theme.trim() } : {}),
        ...(typeof item.scene === "string" && item.scene.trim().length > 0 ? { scene: item.scene.trim() } : {}),
        ...(typeof item.storyLine === "string" && item.storyLine.trim().length > 0 ? { storyLine: item.storyLine.trim() } : {}),
        ...(typeof item.emotionArc === "string" && item.emotionArc.trim().length > 0 ? { emotionArc: item.emotionArc.trim() } : {}),
        ...(typeof item.videoStyle === "string" && item.videoStyle.trim().length > 0 ? { videoStyle: item.videoStyle.trim() } : {}),
        ...(typeof item.primaryEmotion === "string" && item.primaryEmotion.trim().length > 0 ? { primaryEmotion: item.primaryEmotion.trim() } : {}),
        ...(typeof item.summary === "string" && item.summary.trim().length > 0 ? { summary: item.summary.trim() } : {}),
        ...(typeof item.subtitle === "string" && item.subtitle.trim().length > 0 ? { subtitle: item.subtitle.trim() } : {}),

        // ===== 【新增】嵌套对象字段（带规范化处理） =====
        ...(normalizeEmotionAnalysis(item.emotionAnalysis) ? { emotionAnalysis: normalizeEmotionAnalysis(item.emotionAnalysis) } : {}),
        ...(normalizeThemeAnalysis(item.themeAnalysis) ? { themeAnalysis: normalizeThemeAnalysis(item.themeAnalysis) } : {}),
        ...(normalizeDeductionResult(item.deductionResult) ? { deductionResult: normalizeDeductionResult(item.deductionResult) } : {}),
        ...(normalizeDiversification(item.diversification) ? { diversification: normalizeDiversification(item.diversification) } : {}),
        ...(normalizeBgmSuggestion(item.bgmSuggestion) ? { bgmSuggestion: normalizeBgmSuggestion(item.bgmSuggestion) } : {}),
        ...(normalizeTitleSuggestions(item.titleSuggestions) ? { titleSuggestions: normalizeTitleSuggestions(item.titleSuggestions) } : {}),
        ...(Array.isArray(item.hashtags) && item.hashtags.length > 0
          ? { hashtags: item.hashtags.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0).slice(0, 15) }
          : {}),
        ...(normalizePublishSuggestion(item.publishSuggestion) ? { publishSuggestion: normalizePublishSuggestion(item.publishSuggestion) } : {}),
        ...(normalizeIronLawsCheck(item.ironLawsCheck) ? { ironLawsCheck: normalizeIronLawsCheck(item.ironLawsCheck) } : {}),
        ...(normalizeQualityCheckReport(item.qualityCheckReport) ? { qualityCheckReport: normalizeQualityCheckReport(item.qualityCheckReport) } : {}),

        // ===== 【新增】大模型结构化输出（原样透传，兼容旧驼峰key） =====
        ...(normalizeStructField<Record<string, unknown>>(item.video_info ?? item.videoInfo, "video_info")),
        ...(normalizeStructField<Record<string, unknown>>(item.video_analysis ?? item.videoAnalysis, "video_analysis")),
        ...(normalizeStructArrayField<Record<string, unknown>>(item.shot_breakdown ?? item.shotBreakdown, "shot_breakdown")),
        ...(normalizeStructField<Record<string, unknown>>(item.editing_analysis ?? item.editingAnalysis, "editing_analysis")),
      };
    }),
  };
}

export function assertStep3CandidateSnapshotContract(): {
  version: string;
  lockStateCount: number;
  minSnapshotSize: number;
  maxSnapshotSize: number;
  supportsGenerationModes: Step3CandidateGenerationMode[];
  sharedVideoReverseSourceCount: number;
  storyPolishModeCount: number;
} {
  return {
    version: STEP3_CANDIDATE_SNAPSHOT_CONTRACT_VERSION,
    lockStateCount: STEP3_CANDIDATE_LOCK_STATES.length,
    minSnapshotSize: 1,
    maxSnapshotSize: 5,
    supportsGenerationModes: ["real", "degraded"],
    sharedVideoReverseSourceCount: STEP3_VIDEO_REVERSE_PIPELINE_SOURCES.length,
    storyPolishModeCount: STEP3_VIDEO_STORY_POLISH_MODES.length,
  };
}

