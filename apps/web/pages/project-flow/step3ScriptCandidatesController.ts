import { buildStep3StructuredScriptCardViewModel } from "./step3StructuredScriptCardViewModel";
import type { ScriptDto, ShotBreakdownDto } from "@contracts/script.dto";
import { getStrategyTypeLabel } from "../../utils/strategyTypeLabels";

// 重导出统一类型
export type { ScriptDto };
export type { ShotBreakdownDto };

export type Step3ScriptSourceKind = "hot-search" | "premium";
export type Step3ScriptStrategyType = ScriptDto["strategyType"];

/** 分镜镜头视图模型（继承 ShotBreakdownDto） */
export interface ShotBreakdownViewModel extends ShotBreakdownDto {
  // 前端目前无额外字段，继承即可
}

// ===== 【新增】独立字段类型定义（用于分镜编辑） =====
export interface Step3ScriptMetadata {
  /** 主场景（独立字段） */
  mainScene?: string;
  /** 时间（如 07:00-08:00） */
  timeOfDay?: string;
  /** 天气描述 */
  weather?: string;
  /** 氛围描述 */
  atmosphere?: string;
  /** 脚本风格 */
  scriptStyle?: string;
  /** 镜头数 */
  shotCount?: number;
  /** 脚本类型 */
  scriptType?: string;
  /** 受众画像 */
  audienceProfile?: string;
  /** 情绪基调 */
  emotionTone?: string;
  /** 主题 */
  theme?: string;
  /** 情绪弧线 */
  emotionArc?: string;
}

export interface Step3LibraryScriptRecordInput {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface Step3HotTrendScriptRecordInput {
  id: string;
  title: string;
  subtitle: string;
  preview: string;
  content: string;
  sourceUrl?: string | null;
  durationSec: number;
  strategyType: "realtime" | "video";
  suitability?: "high" | "medium" | "low" | null;
  labels?: string[];
  storyboardSegments?: ShotBreakdownViewModel[];
  storyPolishMode?: "llm_polished" | "fallback";
}

/** Step3 脚本候选（前端控制器特有类型，继承统一 ScriptDto） */
export interface ScriptCandidateViewModel extends ScriptDto {
  id: string; // 前端别名（等同于 candidateId）
  source: Step3ScriptSourceKind;
  promptVersion?: string | null;
  generationMode?: "real" | "degraded";
  updatedAt?: number | null;
  structuredCard: ReturnType<typeof buildStep3StructuredScriptCardViewModel>;
}

export interface ScriptCandidateViewModelSnapshotItemInput {
  candidateId: string;
  sourceScriptId: string;
  sourceUrl?: string | null;
  rank: number;
  strategyType: ScriptDto["strategyType"];
  title: string;
  preview: string;
  content: string;
  durationSec: number;
  suitability: "high" | "medium" | "low" | null;
  labels: string[];
  storyboardSegments?: ShotBreakdownViewModel[];
  storyPolishMode?: "llm_polished" | "fallback";
  matchScore?: number;
  matchReasons?: string[];

  // ===== 【新增】独立字段（用于分镜编辑） =====
  mainScene?: string;
  timeOfDay?: string;
  weather?: string;
  atmosphere?: string;
  scriptStyle?: string;
  shotCount?: number;
  scriptType?: string;
  audienceProfile?: string;
  emotionTone?: string;
  theme?: string;
  emotionArc?: string;
  videoStyle?: string;
  primaryEmotion?: string;
  // 【新增】脚本概要
  summary?: string;

  // ===== 【新增】大模型完整结构化输出（原样透传） =====
  video_info?: Record<string, unknown>;
  video_analysis?: Record<string, unknown>;
  shot_breakdown?: Record<string, unknown>[];
  editing_analysis?: Record<string, unknown>;
}

export interface ScriptCandidateViewModelSnapshotInput {
  snapshotId: string;
  promptVersion: string;
  lockState:
    | "idle"
    | "snapshot_ready"
    | "selected_unconfirmed"
    | "confirmed_locked"
    | "admin_unlocked";
  selectedCandidateId: string | null;
  confirmedCandidateId: string | null;
  lockVersion: number;
  generationMode: "real" | "degraded";
  createdAt: number;
  items: ScriptCandidateViewModelSnapshotItemInput[];
}

export interface ScriptCandidateViewModelSnapshotViewModel {
  snapshotId: string;
  lockState: ScriptCandidateViewModelSnapshotInput["lockState"];
  selectedCandidateId: string | null;
  confirmedCandidateId: string | null;
  lockVersion: number;
  generationMode: "real" | "degraded";
  promptVersion: string;
  createdAt: number;
}

const STEP3_RECOMMENDED_MAX_DURATION_SEC = 30;
const STEP3_RECOMMENDED_MAX_STORYBOARD_SEGMENTS = 10;

interface BuildScriptCandidateViewModelsInput {
  libraryItems: Step3LibraryScriptRecordInput[];
  hotTrendRealtimeItems: Step3HotTrendScriptRecordInput[];
  hotTrendVideoItems: Step3HotTrendScriptRecordInput[];
}

function estimateDurationSecFromContent(text: string): number {
  const lineCount = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
  return Math.max(12, Math.min(60, lineCount * 3 || 18));
}

function clampRecommendedDurationSec(value: number): number {
  return Math.max(12, Math.min(STEP3_RECOMMENDED_MAX_DURATION_SEC, Math.round(value || 20)));
}

function normalizeRecommendableSuitability(
  value: "high" | "medium" | "low" | null | undefined,
): "high" | "medium" | null {
  if (value === "high" || value === "medium") {
    return value;
  }
  if (value === "low") {
    return null;
  }
  return "medium";
}

function sanitizeStep3CandidateTitle(rawTitle: string): string {
  const original = String(rawTitle ?? "").trim();
  if (original.length < 1) {
    return "";
  }
  const suffixPattern =
    /\s*(?:[-|｜]\s*)?(?:视频脚本|智能分镜|热榜分镜|视频热榜文案|视频热榜镜头|实时热榜智能分镜|实时热榜文案)\s*$/u;
  let normalized = original;
  while (suffixPattern.test(normalized)) {
    const next = normalized.replace(suffixPattern, "").trim();
    if (next.length < 1 || next === normalized) {
      break;
    }
    normalized = next;
  }
  return normalized || original;
}

export function resolveStep3ScriptSourceLabel(
  source: Step3ScriptSourceKind,
  strategyType?: Step3ScriptStrategyType,
): string {
  if (source === "premium") {
    return getStrategyTypeLabel("library");
  }
  if (strategyType) {
    return getStrategyTypeLabel(strategyType);
  }
  return "热榜推荐";
}

export function buildStep3ScriptClueTitle(candidate: Pick<ScriptCandidateViewModel, "source" | "title">): string {
  return `【${resolveStep3ScriptSourceLabel(candidate.source)}】${sanitizeStep3CandidateTitle(candidate.title)}`.slice(0, 64);
}

function normalizeTags(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(
    new Set(
      input
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0 && !item.startsWith("#") && !item.startsWith("__")),
    ),
  ).slice(0, 4);
}

function resolveCandidateStoryboardCount(storyboardSegments: ShotBreakdownViewModel[] | undefined): number | null {
  if (!Array.isArray(storyboardSegments)) {
    return null;
  }
  const count = storyboardSegments.filter((segment) => {
    const content = typeof segment.content === "string" ? segment.content.trim() : "";
    return content.length > 0;
  }).length;
  return count > 0 ? count : null;
}

function resolveStep3CandidateDisplayPriority(candidate: Pick<ScriptCandidateViewModel, "strategyType">): number {
  if (candidate.strategyType === "video") {
    return 0;
  }
  if (candidate.strategyType === "realtime") {
    return 1;
  }
  if (candidate.strategyType === "fashion") {
    return 2;
  }
  return 3;
}

function sortStep3CandidatesForDisplay(candidates: ScriptCandidateViewModel[]): ScriptCandidateViewModel[] {
  return candidates.slice().sort((left, right) => {
    const priorityDelta = resolveStep3CandidateDisplayPriority(left) - resolveStep3CandidateDisplayPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const rankLeft = Number.isFinite(left.rank) && Number(left.rank) > 0 ? Number(left.rank) : Number.MAX_SAFE_INTEGER;
    const rankRight = Number.isFinite(right.rank) && Number(right.rank) > 0 ? Number(right.rank) : Number.MAX_SAFE_INTEGER;
    if (rankLeft !== rankRight) {
      return rankLeft - rankRight;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

export function buildStep3PremiumScriptCandidate(
  libraryItems: Step3LibraryScriptRecordInput[],
): ScriptCandidateViewModel | null {
  const latest =
    libraryItems.find((item) => !Array.isArray(item.tags) || !item.tags.includes("__hot_trend_asset__")) ?? libraryItems[0];
  if (!latest) {
    return null;
  }
  const cleanText = latest.content?.trim() || `请在脚本中心维护${getStrategyTypeLabel("library")}脚本。`;
  const title = latest.title || `${getStrategyTypeLabel("library")}脚本`;
  const subtitle = "来自脚本中心";
  const durationSec = estimateDurationSecFromContent(cleanText);
  const sourceTags = normalizeTags(latest.tags);
  return {
    id: `premium-${latest.id}`,
    candidateId: `premium-${latest.id}`,
    source: "premium",
    strategyType: "library",
    sourceUrl: null,
    title,
    subtitle,
    durationSec,
    preview: cleanText.slice(0, 34),
    content: cleanText,
    suitability: null,
    tags: sourceTags.length > 0 ? sourceTags : [getStrategyTypeLabel("library")],
    structuredCard: buildStep3StructuredScriptCardViewModel({
      source: "premium",
      title,
      durationSec,
      subtitle,
      preview: cleanText.slice(0, 34),
      content: cleanText,
    }),
  };
}

export function buildStep3HotSearchScriptCandidates(
  hotTrendItems: Step3HotTrendScriptRecordInput[],
): ScriptCandidateViewModel[] {
  return hotTrendItems
    .map((item) => ({
      item,
      suitability: normalizeRecommendableSuitability(item.suitability ?? null),
    }))
    .filter((entry) => entry.suitability !== null)
    .map(({ item, suitability }, index) => {
    const title = sanitizeStep3CandidateTitle(item.title || `热榜脚本 ${index + 1}`);
    const subtitle = item.subtitle || getStrategyTypeLabel(item.strategyType);
    const sourceTags = normalizeTags(item.labels);
    const polishTag = item.storyPolishMode === "llm_polished" ? ["故事润色"] : [];
    // 直接使用后端返回的真实时长，不做限制
    const durationSec = item.durationSec || 30;
    const storyboardSegments = Array.isArray(item.storyboardSegments)
      ? item.storyboardSegments.filter((s): s is ShotBreakdownDto => s != null).slice(0, STEP3_RECOMMENDED_MAX_STORYBOARD_SEGMENTS)
      : [];
    const storyboardCount = resolveCandidateStoryboardCount(storyboardSegments);
    return {
      id: `hot-search-db-${item.strategyType}-${item.id}-${index}`,
      candidateId: `hot-search-db-${item.strategyType}-${item.id}-${index}`,
      source: "hot-search",
      strategyType: item.strategyType,
      sourceUrl: item.sourceUrl ?? null,
      title,
      subtitle,
      durationSec,
      preview: item.preview,
      content: item.content,
      suitability,
      tags:
        sourceTags.length > 0
          ? [...sourceTags, ...polishTag]
          : [getStrategyTypeLabel(item.strategyType), ...polishTag],
      storyboardSegments,
      structuredCard: buildStep3StructuredScriptCardViewModel({
        source: "hot-search",
        title,
        subtitle,
        durationSec,
        storyboardCount: storyboardCount ?? undefined,
        preview: item.preview,
        content: item.content,
      }),
    };
    });
}

export function buildScriptCandidateViewModels({
  libraryItems,
  hotTrendRealtimeItems,
  hotTrendVideoItems,
}: BuildScriptCandidateViewModelsInput): ScriptCandidateViewModel[] {
  const candidates: ScriptCandidateViewModel[] = [
    ...buildStep3HotSearchScriptCandidates(hotTrendVideoItems).slice(0, 2),
    ...buildStep3HotSearchScriptCandidates(hotTrendRealtimeItems).slice(0, 2),
  ];
  const premiumCandidate = buildStep3PremiumScriptCandidate(libraryItems);
  if (premiumCandidate) {
    candidates.push(premiumCandidate);
  }
  return sortStep3CandidatesForDisplay(candidates);
}

export function buildScriptCandidateViewModelsFromSnapshot(
  items: ScriptDto[] | null | undefined,
): ScriptCandidateViewModel[] {
  if (!items || !Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => ({
      item,
      suitability: normalizeRecommendableSuitability(item.suitability ?? null),
    }))
    .filter((entry) => entry.suitability !== null)
    .map(({ item, suitability }, index) => {
    const sourceTags = normalizeTags(item.labels);
    const subtitle = item.strategyType === "library" ? "站内广场" : getStrategyTypeLabel(item.strategyType);
    const polishTag = item.storyPolishMode === "llm_polished" ? ["故事润色"] : [];
    const tags = sourceTags.length > 0 ? [...sourceTags, ...polishTag] : [...polishTag];
    const source: Step3ScriptSourceKind = item.strategyType === "library" ? "premium" : "hot-search";
    // 直接使用后端返回的真实时长，不做限制
    const durationSec = item.durationSec || 30;
    const storyboardSegments = Array.isArray(item.storyboardSegments)
      ? item.storyboardSegments.filter((s): s is ShotBreakdownDto => s != null).slice(0, STEP3_RECOMMENDED_MAX_STORYBOARD_SEGMENTS)
      : [];
    // 镜头数优先级：shot_breakdown 数组长度 > shotCount 字段 > storyboardSegments 镜头数
    const shotBreakdownCount = Array.isArray(item.shot_breakdown) ? item.shot_breakdown.length : null;
    const storyboardCount = shotBreakdownCount ?? item.shotCount ?? resolveCandidateStoryboardCount(storyboardSegments);
    // summary 字段优先使用独立字段，其次从 video_analysis.summary 提取
    const summaryValue = item.summary || (typeof item.video_analysis?.summary === "string" ? item.video_analysis.summary : null);
    return {
      id: item.candidateId,
      candidateId: item.candidateId,
      source,
      strategyType: item.strategyType,
      sourceUrl: item.sourceUrl ?? null,
      title: sanitizeStep3CandidateTitle(item.title || `候选脚本 ${index + 1}`),
      subtitle,
      durationSec,
      preview: item.preview,
      content: item.content,
      suitability,
      tags,
      rank: Number.isFinite(item.rank) ? item.rank : index + 1,
      promptVersion: undefined,
      generationMode: undefined,
      updatedAt: undefined,
      sourceScriptId: item.sourceScriptId,
      storyboardSegments,
      ...(typeof item.matchScore === "number" ? { matchScore: item.matchScore } : {}),
      ...(Array.isArray(item.matchReasons) ? { matchReasons: item.matchReasons } : {}),

      // ===== 【新增】独立字段（直接传递） =====
      ...(item.mainScene != null ? { mainScene: item.mainScene } : {}),
      ...(item.timeOfDay != null ? { timeOfDay: item.timeOfDay } : {}),
      ...(item.weather != null ? { weather: item.weather } : {}),
      ...(item.atmosphere != null ? { atmosphere: item.atmosphere } : {}),
      ...(item.scriptStyle != null ? { scriptStyle: item.scriptStyle } : {}),
      ...(typeof item.shotCount === "number" ? { shotCount: item.shotCount } : {}),
      ...(item.scriptType != null ? { scriptType: item.scriptType } : {}),
      ...(item.audienceProfile != null ? { audienceProfile: item.audienceProfile } : {}),
      ...(item.emotionTone != null ? { emotionTone: item.emotionTone } : {}),
      ...(item.theme != null ? { theme: item.theme } : {}),
      ...(item.emotionArc != null ? { emotionArc: item.emotionArc } : {}),
      ...(item.videoStyle != null ? { videoStyle: item.videoStyle } : {}),
      ...(item.primaryEmotion != null ? { primaryEmotion: item.primaryEmotion } : {}),
      ...(Array.isArray(item.keyElements) ? { keyElements: item.keyElements } : {}),
      ...(item.placementNotes != null ? { placementNotes: item.placementNotes } : {}),

      // ===== 【新增】大模型完整结构化输出（原样透传，兼容旧驼峰key） =====
      ...(item.video_info && typeof item.video_info === "object" ? { video_info: item.video_info } : {}),
      ...(item.video_analysis && typeof item.video_analysis === "object" ? { video_analysis: item.video_analysis } : {}),
      ...(Array.isArray(item.shot_breakdown) ? { shot_breakdown: item.shot_breakdown } : {}),
      ...(item.editing_analysis && typeof item.editing_analysis === "object" ? { editing_analysis: item.editing_analysis } : {}),
      // summary 字段（已在上方提取 summaryValue）
      ...(summaryValue ? { summary: summaryValue } : {}),

      structuredCard: buildStep3StructuredScriptCardViewModel({
        source: "hot-search",
        title: sanitizeStep3CandidateTitle(item.title || `候选脚本 ${index + 1}`),
        subtitle,
        durationSec,
        storyboardCount: storyboardCount ?? undefined,
        preview: item.preview ?? "",
        content: item.content,
      }),
    };
    })
    .sort((left, right) => {
      const priorityDelta = resolveStep3CandidateDisplayPriority(left) - resolveStep3CandidateDisplayPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const rankLeft = Number.isFinite(left.rank) && Number(left.rank) > 0 ? Number(left.rank) : Number.MAX_SAFE_INTEGER;
      const rankRight = Number.isFinite(right.rank) && Number(right.rank) > 0 ? Number(right.rank) : Number.MAX_SAFE_INTEGER;
      if (rankLeft !== rankRight) {
        return rankLeft - rankRight;
      }
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
    });
}

export function buildScriptCandidateViewModelSnapshotViewModel(
  snapshot: ScriptCandidateViewModelSnapshotInput | null | undefined,
): ScriptCandidateViewModelSnapshotViewModel | null {
  if (!snapshot || !snapshot.snapshotId) {
    return null;
  }
  return {
    snapshotId: snapshot.snapshotId,
    lockState: snapshot.lockState,
    selectedCandidateId: snapshot.selectedCandidateId,
    confirmedCandidateId: snapshot.confirmedCandidateId,
    lockVersion: snapshot.lockVersion,
    generationMode: snapshot.generationMode,
    promptVersion: snapshot.promptVersion,
    createdAt: snapshot.createdAt,
  };
}
