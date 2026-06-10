import {
  normalizeStep1JointReverseResponse,
  type Step1RoleDirectionCard,
  type Step1JointReverseRenderState,
} from "../../../../src/contracts/step1-joint-reverse-contract";
import { adaptStep1RolePresetCards } from "../../../../src/modules/step1-role-preset-adapter";
import { resolveStep1ProgressViewModel } from "../../../../src/contracts/step1-progressive-card-contract";
import type { Step1OutfitAnalysisCard } from "../../../../src/contracts/step1-outfit-analysis-card-contract";
import type { OutfitPlanDto } from "../../../../src/contracts/outfit-plan.dto";
import type { Step1LibraryCategory } from "../../../../src/contracts/step1-outfit-module-contract";

/** Step1 分析卡片数量上限（固定为 3） */
export const MAX_OUTFIT_ANALYSIS_CARDS = 3;

/** 使用统一模型 */
export type OutfitAnalysisCardData = Step1OutfitAnalysisCard;

export interface LibraryAssetItem {
  id: string;
  name: string;
  category: Step1LibraryCategory;
  mainImageUrl: string;
  url?: string;
  relatedImageUrls?: string[];
  subImageUrl1?: string | null;
  subImageUrl2?: string | null;
  subImageUrl3?: string | null;
  sizeMb: number;
  tags?: string[];
  classification?: {
    category: string;
    confidence: number;
    viewLabel: string;
    reason: string | null;
  } | null;
}

export interface RecommendOutfitsResponse {
  plans: Array<{
    id: string;
    index: number;
    assetIds: string[];
    title?: string;
    reason?: string;
    styleName?: string;
    analysis?: string;
    optimizedPrompt?: string;
    tags?: string[];
    items?: Array<{ type: string; name: string; style?: string; description?: string }>;
    suitableScene?: string;
    groundingSources?: Array<{ title: string; url: string }>;
  }>;
  analysisCards?: Array<{
    index: number;
    planId: string;
    title?: string;
    styleName?: string;
    analysis: string;
    optimizedPrompt: string;
    analysisPrompt?: string;
    suitableScene?: string;
    tags?: string[];
    groundingSources?: Array<{ title: string; url: string }>;
    status?: "pending" | "ready";
    items?: Array<{ type: string; name: string; style?: string; description?: string }>;
  }>;
  taskId?: string | null;
  taskStatus?: "idle" | "running" | "completed" | "failed";
  analysisStatus?: "running" | "ready" | "unavailable";
  analysisMessage?: string;
  roleDirectionCards?: Step1RoleDirectionCard[];
  maxOutfitAnalysisCards?: number;
  updatedAt?: number | null;
}

interface MapRecommendParams {
  recommended: RecommendOutfitsResponse;
  garmentModules?: Array<{
    mainImage?: { activeImageUrl?: string | null; libraryAssetId?: string | null } | null;
    subjectType?: string | null;
  }>;
  libraryById: Map<string, LibraryAssetItem>;
  fallbackAnalysisCardCount: number;
  roleDirectionCount: number;
}

interface BuildPendingParams {
  analysisCardCount: number;
  roleDirectionCount: number;
}

export interface Step1JointReverseMappedResult {
  nextOutfits: OutfitPlanDto[];
  nextAnalysisCards: OutfitAnalysisCardData[];
  roleDirectionCards: Step1RoleDirectionCard[];
  analysisStatusMessage: string | null;
  maxOutfitAnalysisCards: number; // 固定为 MAX_OUTFIT_ANALYSIS_CARDS
  progressPercent: number;
  renderState: Step1JointReverseRenderState;
  reverseTaskId: string;
}

const EMPTY_ROLE_DIRECTION_SUMMARY = "角色方向生成中，请稍候自动刷新。";

export function normalizeStep1OutfitCardLimit(value: unknown, fallback = 3): number {
  if (value === null || value === undefined || value === "") {
    return Math.max(1, Math.min(3, Math.floor(fallback)));
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(1, Math.min(3, Math.floor(fallback)));
  }
  return Math.max(1, Math.min(3, Math.floor(parsed)));
}

function normalizeStep1RoleDirectionCount(value: unknown, fallback = 5): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(1, Math.floor(fallback));
  }
  return Math.max(1, Math.floor(parsed));
}

export function isStep1PendingOutfitId(planId: string): boolean {
  return planId.startsWith("pending-step1-");
}

function buildPendingAnalysisCards(outfits: OutfitPlanDto[]): OutfitAnalysisCardData[] {
  return outfits.map((outfit, offset) => ({
    index: offset + 1,
    planId: outfit.id,
    title: outfit.title || `搭配方案 ${offset + 1}`,
    styleName: "时尚风格",
    analysis: "时尚穿搭分析生成中，请稍候自动刷新。",
    optimizedPrompt: "时尚穿搭分析生成中，请稍候自动刷新。",
    status: "pending" as const,
    items: [],
  }));
}

function resolveRoleDirectionCards(
  outfits: OutfitPlanDto[],
  roleDirectionCount: number,
  pending: boolean,
): Step1RoleDirectionCard[] {
  const normalizedCount = Math.max(1, Math.floor(roleDirectionCount));
  if (outfits.length < 1) {
    return [];
  }
  return adaptStep1RolePresetCards(Array.from({ length: normalizedCount }, (_, index) => {
    const outfit = outfits[index % outfits.length];
    const directionOrdinal = index + 1;
    return {
      directionId: `role-preset-${outfit.id}-${directionOrdinal}`,
      styleSummary: pending ? EMPTY_ROLE_DIRECTION_SUMMARY : "人物预设数据已同步，可进入 Step2。",
      portraitUrl: null as string | null,
      confidence: Math.max(0.4, 0.92 - index * 0.07),
    };
  }));
}

function resolveRecommendedRoleDirectionCards(
  recommendedRoleDirectionCards: unknown,
  roleDirectionCount: number,
): Step1RoleDirectionCard[] {
  const normalizedCount = Math.max(1, Math.floor(roleDirectionCount));
  const adapted = adaptStep1RolePresetCards(recommendedRoleDirectionCards).slice(0, normalizedCount);
  return adapted;
}

function resolveRenderState(params: {
  taskStatus?: "idle" | "running" | "completed" | "failed";
  analysisStatus?: "running" | "ready" | "unavailable";
  nextOutfitCount: number;
  hasPendingCards: boolean;
}): Step1JointReverseRenderState {
  if (params.taskStatus === "failed") {
    return "failed";
  }
  if (params.taskStatus === "running" || params.analysisStatus === "running") {
    return params.hasPendingCards ? "pending" : "partial";
  }
  if (params.hasPendingCards) {
    return "partial";
  }
  if (params.nextOutfitCount > 0) {
    return "ready";
  }
  return "failed";
}

function resolveProgressPercent(params: {
  renderState: Step1JointReverseRenderState;
  expectedAnalysisCards: number;
  readyAnalysisCards: number;
}): number {
  if (params.renderState === "ready") {
    return 100;
  }
  if (params.renderState === "failed") {
    return 100;
  }
  const expected = Math.max(1, params.expectedAnalysisCards);
  const ratio = Math.max(0, Math.min(1, params.readyAnalysisCards / expected));
  if (params.renderState === "partial") {
    return Math.max(35, Math.min(95, Math.round(35 + ratio * 55)));
  }
  return Math.max(8, Math.min(90, Math.round(8 + ratio * 45)));
}

export function mapStep1JointReverseRecommendResult(params: MapRecommendParams): Step1JointReverseMappedResult {
  const sourcePlans = params.recommended.plans.slice(0, MAX_OUTFIT_ANALYSIS_CARDS);

  // 从 garmentModules 构建 URL 映射
  const getModuleUrl = (category: Step1LibraryCategory): string | null => {
    const module = (params.garmentModules ?? []).find(
      (m) => m.subjectType === category || m.mainImage?.libraryAssetId
    );
    return module?.mainImage?.activeImageUrl ?? null;
  };

  // API 已返回 OutfitPlanDto 格式，直接使用
  const nextOutfits: OutfitPlanDto[] = sourcePlans.map((plan, idx) => ({
    id: plan.id,
    index: plan.index ?? idx + 1,
    assetIds: plan.assetIds ?? [],
    title: plan.title || `搭配方案 ${idx + 1}`,
    reason: plan.reason || "",
    styleName: plan.styleName || "时尚风格",
    analysis: plan.analysis || "",
    optimizedPrompt: plan.optimizedPrompt || "",
    tags: plan.tags ?? [],
    items: (plan.items ?? []) as OutfitPlanDto["items"],
    suitableScene: plan.suitableScene,
    groundingSources: plan.groundingSources ?? [],
  }));

  const fetchedAnalysisCards = (params.recommended.analysisCards ?? [])
    .filter((item) => typeof item?.planId === "string" && item.planId.trim().length > 0)
    .map((item, offset) => {
      const hasItems = Array.isArray(item.items) && item.items.length > 0;

      let items: Array<{ type: string; name: string; description?: string }>;
      if (hasItems) {
        items = (item.items as Array<{ type: string; name: string; description?: string }>).map((it) => ({
          type: it.type?.trim() || "单品",
          name: it.name?.trim() || "",
          description: (it.description ?? "").trim(),
        }));
      } else {
        items = [];
      }

      const cardIndex = typeof item?.index === "number" && Number.isFinite(item.index)
        ? Math.max(1, Math.floor(item.index))
        : offset + 1;

      return {
        index: cardIndex,
        planId: item.planId.trim(),
        title: item.title?.trim() || `搭配方案 ${cardIndex}`,
        styleName: item.styleName?.trim() || "时尚风格",
        analysis: item.analysis?.trim() || "",
        optimizedPrompt: item.optimizedPrompt?.trim() || "",
        status: (item.status === "pending" ? "pending" : "ready") as "pending" | "ready",
        suitableScene: item.suitableScene?.trim() || undefined,
        tags: Array.isArray(item.tags) ? item.tags.filter((t: unknown) => typeof t === "string" && t.trim().length > 0) : [],
        groundingSources: Array.isArray(item.groundingSources) ? item.groundingSources : [],
        items,
      };
    })
    .sort((a, b) => a.index - b.index);

  const recommendationRunning =
    params.recommended.analysisStatus === "running" || params.recommended.taskStatus === "running";

  const nextAnalysisCards =
    fetchedAnalysisCards.length > 0
      ? fetchedAnalysisCards
      : recommendationRunning && nextOutfits.length > 0
      ? buildPendingAnalysisCards(nextOutfits.slice(0, MAX_OUTFIT_ANALYSIS_CARDS))
      : [];

  const backendAnalysisMessage = params.recommended.analysisMessage?.trim() || "";
  const shouldKeepStatusMessage =
    backendAnalysisMessage.length > 0 &&
    (params.recommended.analysisStatus === "unavailable" || params.recommended.taskStatus === "failed");
  const analysisStatusMessage =
    shouldKeepStatusMessage || nextAnalysisCards.length < 1
      ? backendAnalysisMessage || "暂无时尚穿搭分析数据，等待接入或联系管理员开启 API。"
      : null;

  const renderState = resolveRenderState({
    taskStatus: params.recommended.taskStatus,
    analysisStatus: params.recommended.analysisStatus,
    nextOutfitCount: nextOutfits.length,
    hasPendingCards: nextAnalysisCards.some((item) => item.status === "pending"),
  });
  const readyAnalysisCards = nextAnalysisCards.filter((item) => item.status !== "pending").length;
  const progressPercent = resolveProgressPercent({
    renderState,
    expectedAnalysisCards: Math.min(MAX_OUTFIT_ANALYSIS_CARDS, Math.max(1, nextOutfits.length)),
    readyAnalysisCards,
  });
  const reverseTaskId =
    typeof params.recommended.taskId === "string" && params.recommended.taskId.trim().length > 0
      ? params.recommended.taskId.trim()
      : `step1-joint-${Date.now()}`;
  const resolvedRoleDirectionCount = normalizeStep1RoleDirectionCount(params.roleDirectionCount, 5);
  const backendRoleDirectionCards = resolveRecommendedRoleDirectionCards(
    params.recommended.roleDirectionCards,
    resolvedRoleDirectionCount,
  );

  const jointResponse = normalizeStep1JointReverseResponse({
    reverseTaskId,
    roleDirectionCards:
      backendRoleDirectionCards.length > 0
        ? backendRoleDirectionCards
        : resolveRoleDirectionCards(
            nextOutfits,
            resolvedRoleDirectionCount,
            renderState !== "ready",
          ),
    renderState,
    progressPercent,
  });

  resolveStep1ProgressViewModel({
    renderState: jointResponse.renderState,
    progressPercent: jointResponse.progressPercent,
    cardCount: nextOutfits.length + nextAnalysisCards.length,
  });

  return {
    nextOutfits,
    nextAnalysisCards,
    roleDirectionCards: jointResponse.roleDirectionCards,
    analysisStatusMessage,
    maxOutfitAnalysisCards: MAX_OUTFIT_ANALYSIS_CARDS,
    progressPercent: jointResponse.progressPercent,
    renderState: jointResponse.renderState,
    reverseTaskId: jointResponse.reverseTaskId,
  };
}

export function buildStep1JointReversePendingResult(params: BuildPendingParams): Step1JointReverseMappedResult {
  // 生成 OutfitPlanDto 格式的 pending 数据
  const nextOutfits: OutfitPlanDto[] = Array.from({ length: MAX_OUTFIT_ANALYSIS_CARDS }, (_, index) => ({
    id: `pending-step1-${index + 1}`,
    index: index + 1,
    assetIds: [],
    title: `搭配方案生成中 #${index + 1}`,
    reason: "正在进行联合反推，请稍候自动刷新。",
    styleName: "时尚风格",
    analysis: "时尚穿搭分析生成中，请稍候自动刷新。",
    optimizedPrompt: "时尚穿搭分析生成中，请稍候自动刷新。",
    tags: [],
    items: [],
  }));
  const nextAnalysisCards = buildPendingAnalysisCards(nextOutfits);
  const reverseTaskId = `step1-joint-pending-${Date.now()}`;
  const renderState: Step1JointReverseRenderState = "pending";
  const progressPercent = resolveProgressPercent({
    renderState,
    expectedAnalysisCards: MAX_OUTFIT_ANALYSIS_CARDS,
    readyAnalysisCards: 0,
  });
  const jointResponse = normalizeStep1JointReverseResponse({
    reverseTaskId,
    roleDirectionCards: resolveRoleDirectionCards(
      nextOutfits,
      normalizeStep1RoleDirectionCount(params.roleDirectionCount, 5),
      true,
    ),
    renderState,
    progressPercent,
  });
  resolveStep1ProgressViewModel({
    renderState: jointResponse.renderState,
    progressPercent: jointResponse.progressPercent,
    cardCount: nextOutfits.length + nextAnalysisCards.length,
  });
  return {
    nextOutfits,
    nextAnalysisCards,
    roleDirectionCards: jointResponse.roleDirectionCards,
    analysisStatusMessage: "时尚穿搭分析生成中，请稍候自动刷新。",
    maxOutfitAnalysisCards: MAX_OUTFIT_ANALYSIS_CARDS,
    progressPercent: jointResponse.progressPercent,
    renderState: jointResponse.renderState,
    reverseTaskId: jointResponse.reverseTaskId,
  };
}
