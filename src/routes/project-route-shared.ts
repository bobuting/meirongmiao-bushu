/**
 * 项目路由共享类型、接口与辅助函数
 * 从 project-routes.ts 提取，供 step1~5 子模块共用
 */

import type { AppContext } from "../core/app-context.js";
import type {
  Project,
  CharacterViewKey,
  OutfitPlan,
  StoryboardFrame,
  ProviderCallAudit,
  User,
} from "../contracts/types.js";
import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { ImageGenerationDebugOptions } from "../services/media/image-generation-providers.js";
import type { OutfitItem } from "../contracts/step1-joint-reverse-contract.js";
import type {
  Step1ImageClassificationPayload,
  Step1ImageClassificationResult,
  FiveViewDefinition,
} from "../app.js";
import type { Step1OptimizedPromptGuidance } from "../modules/step1-optimized-prompt-builder.js";
import type { LlmDebugOptions } from "../services/llm/llm-transport.js";

// ============================================================================
// 通用类型
// ============================================================================

export type JimengImageRatio = "1:1" | "3:4" | "9:16" | "16:9";
export type JimengImageResolution = "1k" | "2k" | "4k";

// ============================================================================
// 搭配推荐任务类型
// ============================================================================

export interface OutfitPlanAnalysisContext {
  index: number;
  planId: string;
  items: Array<{ category: string; name: string; imageUrl: string }>;
  focusItems: Array<{ category: string; name: string; imageUrl: string; source: "user_selected" | "generated_plan" }>;
}

// ============================================================================
// 项目路由依赖接口
// ============================================================================

export interface ProjectRouteDeps {

  resolveMaxOutfitAnalysisCards: () => number;

  requestLlmImageGenerationUrls: (provider: ResolvedRouteProvider, prompt: string, options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: JimengImageRatio;
    resolution?: JimengImageResolution;
    count?: number;
    temperature?: number;
    /** 负面提示词（禁止生成的内容） */
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  }) => Promise<{ urls: string[]; endpoint: string }>;
  requestLlmImageGenerationUrl: (provider: ResolvedRouteProvider, prompt: string, options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: JimengImageRatio;
    resolution?: JimengImageResolution;
    debugOptions?: ImageGenerationDebugOptions;
  }) => Promise<{ url: string; endpoint: string }>;
  requestJimengVideoUrl: (provider: ResolvedRouteProvider, prompt: string, options: {
    imageUrl: string | null;
    taskId: string | null;
    referenceImages?: string[];
    returnAuditInfo?: boolean;
  }) => Promise<string | { videoUrl: string; auditInfo: { actualEndpoint: string; requestBodySummary: Record<string, unknown>; requestHeadersJson: string; requestBodyJson: string } }>;
  requestLlmPlainText: (provider: ResolvedRouteProvider, systemPrompt: string, userPrompt: string, temperature: number, debugOptions?: LlmDebugOptions) => Promise<string>;
  requestLlmScriptPayload: (provider: ResolvedRouteProvider, prompt: string, debugOptions?: LlmDebugOptions) => Promise<{ basicInfo: string; roleTable: string; outfitTable: string; storyboard: string }>;
  requestLlmOptimizeOutfitPrompt: (provider: ResolvedRouteProvider, analysis: string, guidance: Partial<Step1OptimizedPromptGuidance> | null, debugOptions?: LlmDebugOptions) => Promise<{ prompt: string; groundingSources: unknown[] }>;
  requestStep1ImageClassification: (ctx: AppContext, provider: ResolvedRouteProvider, payload: Step1ImageClassificationPayload, routeKey: ProviderRouteKey, userId: string, projectId?: string) => Promise<Step1ImageClassificationResult>;
  removeStep1ImageBackgroundToWhiteDataUrl: (imageUrl: string) => Promise<string>;
  normalizeJimengImageRatio: (raw: string | undefined, fallback: JimengImageRatio) => JimengImageRatio;
  normalizeJimengImageResolution: (raw: string | undefined, fallback: JimengImageResolution) => JimengImageResolution;
  normalizeProviderTransportImageUrls: (imageUrls: string[] | undefined) => string[];
  normalizeVideoReferenceImageUrl: (value: unknown) => string | null;
  requireStep2StylingInputs: (ctx: AppContext, projectId: string) => Promise<{ outfitPrompt: string; outfitSummary: string; outfitImageUrls: string[]; outfitImageUrlsByCategory: Partial<Record<import("../contracts/step1-outfit-module-contract.js").Step1OutfitModuleCategory, string>>; warnings: string[] }>;
  buildStep2StylingPromptAndImages: (options: {
    mode: "preview" | "regenerate";
    viewDef: FiveViewDefinition;
    primaryImage: string;
    outfitInputs: { outfitPrompt: string; outfitSummary: string; outfitImageUrls: string[]; outfitImageUrlsByCategory: Partial<Record<import("../contracts/step1-outfit-module-contract.js").Step1OutfitModuleCategory, string>> };
    characterName?: string;
  }) => { prompt: string; images: string[] };
  persistDressedupViewImageToStorage: (ctx: AppContext, project: Pick<Project, "id" | "name">, viewKey: CharacterViewKey, sourceUrl: string) => Promise<string>;
  buildOutfitContextSummary: (ctx: AppContext, projectId: string) => Promise<string>;
  isSupportedLlmImageUrl: (url: string) => boolean;
  buildStep1ImageClassificationHeuristic: (payload: Step1ImageClassificationPayload, reasonHint: string) => Step1ImageClassificationResult;
  normalizeStoryboardFrameRecordMediaUrls: (ctx: AppContext, frame: StoryboardFrame) => Promise<StoryboardFrame>;
  resolveVideoProviderPendingRetryDelayMs: () => number;
  resolveVideoProviderOverloadRetryDelayMs: () => number;
  createPendingRouteAudit: (ctx: AppContext, input: { routeKey: ProviderRouteKey; startedAt: number; requestId: string; requestSummary: string; slowRequestThresholdMs?: number }) => Promise<ProviderCallAudit>;
  finalizeRouteAudit: (ctx: AppContext, input: {
    auditId: string; routeKey?: ProviderRouteKey; providerId?: string; startedAt: number;
    status: "success" | "error"; requestSummary?: string; responseSummary?: string;
    timeoutMs?: number; errorCode?: string; errorMessage?: string; slowRequestThresholdMs?: number;
  }) => void;
  ROUTE_KEY_STEP1_FASHION_SEARCH: ProviderRouteKey;
  resolvePreviewViewDefinition: (preview: { viewKey?: string; label?: string | null }, requestViewKey?: CharacterViewKey) => FiveViewDefinition;
  withVariantSuffix: (url: string, variantKey: string) => string;
  ensureFiveViews: (sourceViews: string[], fallback: string) => string[];
  FIVE_VIEW_DEFINITIONS: readonly FiveViewDefinition[];
  isFiveViewKey: (key: string) => boolean;
  mapRawReverseStoryboardReport: (content: string) => unknown;
}