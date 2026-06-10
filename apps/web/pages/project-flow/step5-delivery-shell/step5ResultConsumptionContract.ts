import {
  normalizeStep5DeliveryPayload,
  type Step5DeliveryPayload,
} from "../../../../../src/contracts/step5-delivery-shell-contract";

export interface Step5DeliveryPayloadPatch {
  step5DeliveryPayload: Step5DeliveryPayload;
  // 索引签名，兼容 Record<string, unknown>
  [key: string]: unknown;
}

const STEP5_DEFAULT_TITLE_CANDIDATES = [
  "一键出片的高转化短视频",
  "今天这套上身就有结果",
  "3 秒抓住注意力的成片封面",
] as const;

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Step5TitleSeedSegment {
  title?: string | null;
  content?: string | null;
  visualCue?: string | null;
  videoCue?: string | null;
}

function normalizeTitleSeed(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/[，。！？、；：]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function collectScriptTitleSeeds(scriptSegments: readonly Step5TitleSeedSegment[] | undefined): string[] {
  if (!Array.isArray(scriptSegments) || scriptSegments.length < 1) {
    return [];
  }
  const seeds: string[] = [];
  for (const segment of scriptSegments) {
    if (!segment || typeof segment !== "object") {
      continue;
    }
    const ordered = [segment.videoCue, segment.visualCue, segment.content, segment.title]
      .map((item) => normalizeTitleSeed(String(item ?? "")))
      .filter((item) => item.length > 0);
    if (ordered.length > 0) {
      seeds.push(ordered[0]!);
    }
    if (seeds.length >= 3) {
      break;
    }
  }
  return uniqueNonEmpty(seeds).slice(0, 3);
}

export function stripProjectNamePrefixFromStep5Title(
  title: string,
  projectName: string | null | undefined,
): string {
  const normalizedTitle = String(title ?? "").trim();
  const projectSeed = typeof projectName === "string" ? projectName.trim() : "";
  if (!normalizedTitle || !projectSeed) {
    return normalizedTitle;
  }
  const prefixedPattern = new RegExp(`^${escapeRegExp(projectSeed)}\\s*[：:·\\-|]\\s*`, "u");
  const stripped = normalizedTitle.replace(prefixedPattern, "").trim();
  return stripped.length > 0 ? stripped : normalizedTitle;
}

export function normalizeStep5TitleCandidates(
  titleCandidates: readonly string[] | undefined,
  projectName: string | null | undefined,
): string[] {
  const projectSeed = typeof projectName === "string" ? projectName.trim() : "";
  return uniqueNonEmpty(
    (titleCandidates ?? [])
      .map((item) => stripProjectNamePrefixFromStep5Title(item, projectName))
      .filter((item) => item !== projectSeed),
  );
}

export function buildStep5TitleCandidates(
  projectName: string | null | undefined,
  scriptSegments?: readonly Step5TitleSeedSegment[],
): string[] {
  const scriptSeeds = collectScriptTitleSeeds(scriptSegments);
  if (scriptSeeds.length > 0) {
    const [primary, secondary, tertiary] = scriptSeeds;
    const scriptDriven = [
      `${primary}，这一段拍完就能直接开投`,
      `${secondary ?? primary}，成片高能版一键出片`,
      `${tertiary ?? secondary ?? primary}，今天就上这条`,
    ];
    return uniqueNonEmpty([...scriptDriven, ...STEP5_DEFAULT_TITLE_CANDIDATES]).slice(0, 3);
  }
  return uniqueNonEmpty([...STEP5_DEFAULT_TITLE_CANDIDATES]).slice(0, 3);
}

export function buildStep5DeliveryProjectDataPatch(input: {
  projectId: string;
  scriptId: string | null;
  projectName?: string | null;
  finalVideoUrl?: string | null;
  clipVideoUrls?: string[];
  videoCoverImageUrl?: string | null;
  titleCandidates?: string[];
  scriptSegments?: readonly Step5TitleSeedSegment[];
  /** 视频总时长（秒），优先使用合并后的实际时长 */
  durationSec?: number | null;
}): Step5DeliveryPayloadPatch {
  const payload = normalizeStep5DeliveryPayload({
    projectId: input.projectId,
    scriptId: input.scriptId,
    finalVideoUrl: input.finalVideoUrl ?? null,
    clipVideoUrls: (input.clipVideoUrls ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
    videoCoverImageUrl: input.videoCoverImageUrl ?? null,
    titleCandidates: normalizeStep5TitleCandidates(
      input.titleCandidates ?? buildStep5TitleCandidates(input.projectName ?? null, input.scriptSegments),
      input.projectName ?? null,
    ),
    squarePublishCategory: null,
    sourceStep: "step4",
    durationSec: input.durationSec ?? null,
  });
  return {
    step5DeliveryPayload: payload,
  };
}

export function resolveStep5DeliveryPayload(projectData: Record<string, unknown>): Step5DeliveryPayload | null {
  const rawPayload = projectData.step5DeliveryPayload;
  if (!rawPayload) {
    return null;
  }
  try {
    return normalizeStep5DeliveryPayload(rawPayload);
  } catch {
    return null;
  }
}
