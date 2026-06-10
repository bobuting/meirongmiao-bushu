/**
 * Project 路由依赖构建模块
 *
 * 提供项目路由所需的共享依赖对象构建函数。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ProviderRouteKey } from "../contracts/types.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import type { DressedupHelpersDeps } from "../modules/dressedup-character-helpers.js";
import type { ProjectRouteDeps } from "./project-route-shared.js";
// import type { OutfitItem } from "../contracts/step1-joint-reverse-contract.js";
import {
  requestLlmImageGenerationUrls,
  requestLlmImageGenerationUrl,
} from "../services/media/image-generation-providers.js";
import {
  requestJimengVideoUrl,
  // requestVideoUrl,
  resolveVideoProviderOverloadRetryDelayMs,
  resolveVideoProviderPendingRetryDelayMs,
  normalizeJimengImageRatio,
  normalizeJimengImageResolution,
  normalizeVideoReferenceImageUrl,
} from "../service/llm/llm-video.js";
import { requestLlmPlainText, requestLlmScriptPayload } from "../services/llm/llm-transport.js";
import { requestLlmOptimizeOutfitPrompt } from "../services/llm-outfit-optimize.js";
import { requestStep1ImageClassification, buildStep1ImageClassificationHeuristic } from "../modules/step1-image-classification.js";
import { removeStep1ImageBackgroundToWhiteDataUrl } from "../modules/single-image-outfit-analysis.js";
import { normalizeProviderTransportImageUrls, isSupportedLlmImageUrl } from "../services/media/image-utils.js";
import { requireStep2StylingInputs, buildStep2StylingPromptAndImages, buildOutfitContextSummary } from "../modules/step2-styling-helpers.js";
import {
  persistDressedupViewImageToStorage,
  resolvePreviewViewDefinition,
  withVariantSuffix,
  ensureFiveViews,
  FIVE_VIEW_DEFINITIONS,
  isFiveViewKey,
  normalizeStoryboardFrameRecordMediaUrls,
} from "../modules/character-view-session.js";
import { createPendingRouteAudit, finalizeRouteAudit } from "../services/llm/provider-resolver.js";
import { mapRawReverseStoryboardReport } from "../modules/reverse-storyboard-report-mapper.js";

/** Route Key 常量：Step1 图像搜索基础 */
export const ROUTE_KEY_STEP1_FASHION_SEARCH: ProviderRouteKey = ProviderRouteKeys.STEP1_FASHION_SEARCH;

/** Project 路由依赖构建所需的输入 */
export interface ProjectRouteDepsInput {
  app: FastifyInstance;
  ctx: AppContext;
  dressedupHelpersDeps: DressedupHelpersDeps;
  resolveMaxOutfitAnalysisCards: () => number;
}

/**
 * 构建 Project 路由依赖对象
 *
 * 将分散的依赖统一管理，便于路由模块使用。
 */
export function buildProjectRouteDeps(input: ProjectRouteDepsInput): ProjectRouteDeps {
  const { app: _app, ctx: _ctx, resolveMaxOutfitAnalysisCards } = input;

  return {
    resolveMaxOutfitAnalysisCards,
    requestLlmImageGenerationUrls,
    requestLlmImageGenerationUrl,
    requestJimengVideoUrl,
    requestLlmPlainText,
    requestLlmScriptPayload,
    requestLlmOptimizeOutfitPrompt,
    requestStep1ImageClassification,
    removeStep1ImageBackgroundToWhiteDataUrl,
    normalizeJimengImageRatio,
    normalizeJimengImageResolution,
    normalizeProviderTransportImageUrls,
    normalizeVideoReferenceImageUrl,
    requireStep2StylingInputs,
    buildStep2StylingPromptAndImages,
    persistDressedupViewImageToStorage,
    resolvePreviewViewDefinition,
    withVariantSuffix,
    ensureFiveViews,
    FIVE_VIEW_DEFINITIONS,
    isFiveViewKey,
    buildOutfitContextSummary,
    isSupportedLlmImageUrl,
    buildStep1ImageClassificationHeuristic,
    normalizeStoryboardFrameRecordMediaUrls,
    resolveVideoProviderPendingRetryDelayMs,
    resolveVideoProviderOverloadRetryDelayMs,
    createPendingRouteAudit,
    finalizeRouteAudit,
    ROUTE_KEY_STEP1_FASHION_SEARCH,
    mapRawReverseStoryboardReport,
  };
}