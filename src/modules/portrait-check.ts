/**
 * 人像检测模块
 * 使用 LLM 分析图片是否为人像，并返回详细特征分析
 */

import { AppError } from "../core/errors.js";
import type { AppContext } from "../core/app-context.js";
import { getLogger } from "../core/logger/index.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { extractJsonValue } from "../utils/json.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import { requestLlmPlainTextWithMetadata, type LlmDebugOptions } from "../services/llm/llm-transport.js";
import { skillLoader } from "../services/skills/index.js";
import { normalizeAge, normalizeGender, normalizeEthnicity } from "./character-analysis-normalize.js";

const logger = getLogger("portrait-check");

// 提示词模板代码
const PORTRAIT_CHECK_PROMPT_CODE = "portrait_check";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface PortraitCheckPayload {
  imageUrl: string;
}

export interface PortraitCheckResult {
  isPortrait: boolean;
  reason: string | null;
  mode: "heuristic" | "llm" | "error";
  analysis: {
    ethnicity?: string | null;
    age?: number | null;
    gender?: "male" | "female" | null;
    style?: string;
    bodyType?: string;
    faceShape?: string;
    facialFeatures?: string;
    eyebrows?: string;
    eyes?: string;
    eyeExpression?: string;
    nose?: string;
    lips?: string;
    chin?: string;
    skinTone?: string;
    hairStyle?: string;
    uniqueFeatures?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// 启发式检测（规则兜底）
// ---------------------------------------------------------------------------

export function buildPortraitCheckHeuristic(
  _payload: PortraitCheckPayload,
  reasonHint: string,
): PortraitCheckResult {
  return {
    isPortrait: false,
    reason: reasonHint || "rule-based-fallback",
    mode: "heuristic",
    analysis: null,
  };
}

// ---------------------------------------------------------------------------
// LLM 结果归一化
// ---------------------------------------------------------------------------

export function normalizePortraitCheckFromLlm(
  raw: unknown,
  fallback: PortraitCheckResult,
): PortraitCheckResult {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const isPortrait = typeof source.isPortrait === "boolean"
    ? Boolean(source.isPortrait)
    : false;

  const reasonCandidate = String(source.reason ?? "").trim();

  const analysisSource = source.analysis && typeof source.analysis === "object" && !Array.isArray(source.analysis)
    ? (source.analysis as Record<string, unknown>)
    : null;

  const analysis = analysisSource
    ? {
        ethnicity: normalizeEthnicity(analysisSource.ethnicity),
        age: normalizeAge(analysisSource.age),
        gender: normalizeGender(analysisSource.gender),
        style: String(analysisSource.style ?? "").trim() || undefined,
        bodyType: String(analysisSource.bodyType ?? "").trim() || undefined,
        faceShape: String(analysisSource.faceShape ?? "").trim() || undefined,
        facialFeatures: String(analysisSource.facialFeatures ?? "").trim() || undefined,
        eyebrows: String(analysisSource.eyebrows ?? "").trim() || undefined,
        eyes: String(analysisSource.eyes ?? "").trim() || undefined,
        eyeExpression: String(analysisSource.eyeExpression ?? "").trim() || undefined,
        nose: String(analysisSource.nose ?? "").trim() || undefined,
        lips: String(analysisSource.lips ?? "").trim() || undefined,
        chin: String(analysisSource.chin ?? "").trim() || undefined,
        skinTone: String(analysisSource.skinTone ?? "").trim() || undefined,
        hairStyle: String(analysisSource.hairStyle ?? "").trim() || undefined,
        uniqueFeatures: String(analysisSource.uniqueFeatures ?? "").trim() || undefined,
      }
    : null;

  return {
    isPortrait,
    reason: reasonCandidate.length > 0 ? reasonCandidate : fallback.reason,
    mode: "llm",
    analysis: isPortrait ? analysis : null,
  };
}

// ---------------------------------------------------------------------------
// LLM 请求入口
// ---------------------------------------------------------------------------

export async function requestPortraitCheck(
  ctx: AppContext,
  provider: ResolvedRouteProvider,
  payload: PortraitCheckPayload,
  userId: string,
  debugOptions?: LlmDebugOptions,
): Promise<PortraitCheckResult> {
  const fallback = buildPortraitCheckHeuristic(payload, "rule-based-fallback");

  // 从提示词管理系统获取提示词（必须存在且已发布）
  const { system, user } = await skillLoader.render(PORTRAIT_CHECK_PROMPT_CODE, {});

  let result;
  try {
    result = await requestLlmPlainTextWithMetadata(
      provider,
      system,
      user,
      0.1,
      {
        ctx,
        userId,
        routeKey: ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT,
        imageInputs: [{ url: payload.imageUrl, label: "portrait-check" }],
        hasMedia: "image",
        timeoutMsOverride: 60_000,
        ...debugOptions,
      },
    );
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT },
      "LLM 调用失败"
    );
    throw error;
  }

  const parsed = extractJsonValue(result.text);
  if (!parsed) {
    throw new AppError(502, "LLM_RESPONSE_INVALID", "portrait check returned non-json payload");
  }

  return normalizePortraitCheckFromLlm(parsed, fallback);
}