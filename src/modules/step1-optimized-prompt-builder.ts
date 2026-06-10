import { findStep1AnalysisDirtyTokens } from "../contracts/step1-analysis-prompt-governance-contract.js";
import { skillLoader } from "../services/skills/index.js";

const PROMPT_CODE_STEP1_OUTFIT_OPTIMIZATION = "step1_outfit_optimization";

export interface Step1OptimizedPromptGuidance {
  core: string;
  bottom: string;
  shoes: string;
  accessory: string;
}

export interface Step1OptimizedPromptFinalizeInput {
  analysis: string;
  candidate: string;
  guidance?: Partial<Step1OptimizedPromptGuidance> | null;
}

const CJK_PATTERN = /[\u3400-\u9fff]/u;
const META_INSTRUCTION_PATTERN =
  /\b(?:return only|json|grounding|analysis card|do not explain|only output|prompt:|optimized prompt:)\b/i;
const STEP1_PROMPT_RUNTIME_NOISE_PATTERNS = [
  /\blatency-check-\d+\b/giu,
] as const;

function compactTextLine(value: string, maxLength = 1000): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return compact.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

function stripGuidanceLabel(value: string): string {
  return value.replace(/^[^:：]{1,12}[：:]\s*/u, "").trim();
}

function pickDeterministicItemText(value: string): string {
  const compact = compactTextLine(value.replace(/\s+/g, " ").trim(), 80);
  if (!compact) {
    return "";
  }
  const noSlash = compact.split(/\s*\/\s*/u)[0] ?? compact;
  const noCnChoice = noSlash.split(/(?:或者|或)/u)[0] ?? noSlash;
  const noEnChoice = noCnChoice.split(/\s+or\s+/iu)[0] ?? noCnChoice;
  return compactTextLine(noEnChoice.trim(), 60);
}

function sanitizePromptCandidate(value: string): string {
  return compactTextLine(
    sanitizeStep1CarryoverPromptText(
      value
      .replace(/^```[\w-]*\s*/u, "")
      .replace(/\s*```$/u, "")
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .replace(/^(?:optimized prompt|prompt|提示词)[：:]\s*/iu, "")
      .replace(/\s+/g, " "),
    ),
    800,
  );
}

function isLikelyAssetFilename(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/^[^\\/\s]+\.(?:jpe?g|png|webp|bmp|gif|heic|avif)$/i.test(normalized)) {
    return true;
  }
  if (/^(img|image|photo|pic|file|asset|screenshot)[-_]?\d*$/i.test(normalized)) {
    return true;
  }
  return false;
}

function containsDirtyPromptContent(value: string): boolean {
  const compact = value.trim();
  if (!compact) {
    return true;
  }
  if (findStep1AnalysisDirtyTokens(compact).length > 0) {
    return true;
  }
  if (META_INSTRUCTION_PATTERN.test(compact)) {
    return true;
  }
  return /[{}[\]]/.test(compact);
}

function normalizePersonaSummary(analysis: string): string {
  const normalized = compactTextLine(analysis.replace(/\s+/g, " ").trim(), 320);
  if (!normalized || CJK_PATTERN.test(normalized) || containsDirtyPromptContent(normalized)) {
    return "Keep the same identity, body type, hairstyle, and overall vibe as the reference person";
  }
  const sentence =
    normalized
      .split(/[.!?。！？]/u)
      .map((item) => item.trim())
      .find((item) => item.length > 0) ?? "";
  const concise = compactTextLine(sentence || normalized, 140);
  if (!concise || CJK_PATTERN.test(concise) || containsDirtyPromptContent(concise)) {
    return "Keep the same identity, body type, hairstyle, and overall vibe as the reference person";
  }
  return concise;
}

function normalizeEnglishItem(rawValue: string, fallback: string): string {
  const fallbackItem = pickDeterministicItemText(stripGuidanceLabel(fallback)) || fallback;
  const stripped = pickDeterministicItemText(stripGuidanceLabel(rawValue))
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!stripped || isLikelyAssetFilename(stripped) || containsDirtyPromptContent(stripped)) {
    return fallbackItem;
  }
  return compactTextLine(stripped, 48);
}

function normalizeEnglishCore(rawValue: string): string {
  const cleaned = compactTextLine(pickDeterministicItemText(rawValue), 80);
  if (!cleaned || isLikelyAssetFilename(cleaned) || containsDirtyPromptContent(cleaned)) {
    return "selected hero garment";
  }
  return cleaned;
}

function extractAnalysisValue(source: string, pattern: RegExp): string {
  const match = source.match(pattern);
  return compactTextLine(match?.[1]?.trim() || "", 60);
}

function resolveFallbackGuidance(analysis: string): Step1OptimizedPromptGuidance {
  const compact = analysis.trim();
  const complementary = extractAnalysisValue(compact, /具体(?:互补)?搭配[：:]\s*([^。\n]{4,240})/u);
  const parts = complementary
    .split(/[；;,，]/u)
    .map((item) => compactTextLine(item.trim(), 48))
    .filter((item) => item.length > 0);
  return {
    core:
      extractAnalysisValue(compact, /核心单品[^「“"]*[「“"]([^」”"]{1,40})/u) ||
      extractAnalysisValue(compact, /围绕[「“"]?([^，。；;\n]{2,40})[」”"]?构建/u) ||
      "selected hero garment",
    bottom: parts[0] || "tailored trousers",
    shoes: parts[1] || "minimal loafers",
    accessory: parts[2] || "small shoulder bag",
  };
}

function resolveGuidance(
  analysis: string,
  guidance?: Partial<Step1OptimizedPromptGuidance> | null,
): Step1OptimizedPromptGuidance {
  const fallback = resolveFallbackGuidance(analysis);
  return {
    core: normalizeEnglishCore(guidance?.core || fallback.core),
    bottom: normalizeEnglishItem(guidance?.bottom || fallback.bottom, "tailored trousers"),
    shoes: normalizeEnglishItem(guidance?.shoes || fallback.shoes, "minimal loafers"),
    accessory: normalizeEnglishItem(guidance?.accessory || fallback.accessory, "small shoulder bag"),
  };
}

function buildComplementaryPiecesText(guidance: Step1OptimizedPromptGuidance): string {
  const pieces = [guidance.bottom, guidance.shoes, guidance.accessory].filter(
    (item, index, list) => item.length > 0 && list.indexOf(item) === index,
  );
  if (pieces.length === 1) {
    return pieces[0];
  }
  if (pieces.length === 2) {
    return `${pieces[0]} and ${pieces[1]}`;
  }
  return `${pieces[0]}, ${pieces[1]}, and ${pieces[2]}`;
}

function hasConcreteGuidanceMatch(candidate: string, guidance: Step1OptimizedPromptGuidance): boolean {
  const normalizedCandidate = candidate.toLowerCase();
  const anchors = [guidance.bottom, guidance.shoes, guidance.accessory]
    .map((item) => item.toLowerCase())
    .filter((item, index, list) => item.length >= 2 && list.indexOf(item) === index);
  if (anchors.length === 0) {
    return true;
  }
  return anchors.every((item) => normalizedCandidate.includes(item));
}

function isGenericAdditionalItemsPrompt(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return true;
  }
  return (
    /(pair it with|add|include).*(?:additional items?|extra pieces?)/i.test(text) ||
    /at least\s*1.*(?:additional items?|extra pieces?)/i.test(text) ||
    /no more than\s*3.*(?:additional items?|extra pieces?)/i.test(text) ||
    /\badditional items?\b/i.test(text) ||
    /1\s*(?:to|-)\s*3\s*additional/i.test(text)
  );
}

function hasAmbiguousChoicePattern(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  return /\s+or\s+/iu.test(text) || /(?:或者|或)\s*/u.test(text);
}

function ensureConstraintSentence(candidate: string): string {
  const normalized = compactTextLine(candidate, 800);
  const hasCoreConstraint = /core item.*unchanged|preserv(?:e|ing) the core item|hero piece.*unchanged/i.test(normalized);
  const hasComplementaryConstraint = /1\s*(?:to|-)\s*3|1-3|one to three/i.test(normalized);
  if (hasCoreConstraint && hasComplementaryConstraint) {
    return normalized;
  }
  return `${normalized} Keep the core item unchanged and limit complementary pieces to 1-3 items.`;
}

export function buildStep1OptimizedPromptFallback(
  analysis: string,
  guidance?: Partial<Step1OptimizedPromptGuidance> | null,
): string {
  const resolved = resolveGuidance(analysis, guidance);
  return compactTextLine(
    `Full-body fashion styling photo. ${normalizePersonaSummary(analysis)}. ` +
      `The core item must remain unchanged: "${resolved.core}". ` +
      "Build a coherent outfit with one upper garment and one lower garment. " +
      `Add only 1-3 complementary pieces: ${buildComplementaryPiecesText(resolved)}. ` +
      "Keep the silhouette, materials, and season cohesive. Photorealistic, production-ready, no text, no watermark.",
    800,
  );
}

export async function buildStep1OptimizedPromptRewriteRequest(analysis: string): Promise<{
  system: string;
  user: string;
}> {
  const { system, user } = await skillLoader.render(PROMPT_CODE_STEP1_OUTFIT_OPTIMIZATION, { variables: { analysis } });
  return { system, user };
}

export function sanitizeStep1CarryoverPromptText(value: string): string {
  let output = value;
  for (const pattern of STEP1_PROMPT_RUNTIME_NOISE_PATTERNS) {
    output = output.replace(pattern, " ");
  }
  return output
    .replace(/["'`]+\s*["'`]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ", ")
    .replace(/([,.;:!?])([,.;:!?]+)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function finalizeStep1OptimizedPrompt(input: Step1OptimizedPromptFinalizeInput): string {
  const fallback = buildStep1OptimizedPromptFallback(input.analysis, input.guidance);
  const candidate = sanitizePromptCandidate(input.candidate);
  const guidance = resolveGuidance(input.analysis, input.guidance);
  if (!candidate) {
    return fallback;
  }
  if (
    isGenericAdditionalItemsPrompt(candidate) ||
    hasAmbiguousChoicePattern(candidate) ||
    containsDirtyPromptContent(candidate) ||
    CJK_PATTERN.test(candidate) ||
    !hasConcreteGuidanceMatch(candidate, guidance)
  ) {
    return fallback;
  }
  return ensureConstraintSentence(candidate);
}
