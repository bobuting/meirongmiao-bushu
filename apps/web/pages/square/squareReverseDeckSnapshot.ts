import type { ReverseStoryboardPanelViewModel } from "../../../../src/contracts/reverse-storyboard-report";
import { resolveReverseStoryboardPrimaryTopicFromPanel } from "../../../../src/modules/reverse-storyboard-primary-topic";

export interface SquareReverseDeckSnapshot {
  updatedAt: number;
  title: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  /** 反推生成的脚本在脚本库中的 ID，用于"投入创作"流程 */
  libraryScriptId: string | null;
  keywords: string[];
  scriptText: string;
  sections: Array<{
    order: number;
    title: string;
    content: string;
  }>;
  frames: Array<{
    index: number;
    title: string;
    narration: string;
    visualCue: string;
  }>;
  segments: Array<{
    time: string;
    title: string;
    content: string;
    visualCue: string;
  }>;
  /** OSS 视频链接（来源：payload.video_analysis.sourceOssUrl） */
  videoUrl?: string | null;
  /** 封面图链接 */
  coverUrl?: string | null;
  /** 是否有真人（来源：payload.on_screen_presence.has_real_person） */
  hasRealPerson?: boolean | null;
  /** 露出程度（来源：payload.on_screen_presence.exposure_level） */
  exposureLevel?: string | null;
  /** 出镜时长占比（来源：payload.on_screen_presence.person_details[0].screen_time_ratio） */
  screenTimeRatio?: number | null;
  /** 策略类型（来源：nrm_script_data.type 映射） */
  strategyType: string | null;
  /** 主场景 */
  mainScene?: string | null;
  /** 天气 */
  weather?: string | null;
  /** 氛围 */
  atmosphere?: string | null;
  /** 时间段 */
  timeOfDay?: string | null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeLocalFilename(value: string): boolean {
  if (!value) {
    return false;
  }
  return /\.[a-z0-9]{2,5}$/i.test(value) && !/^https?:\/\//i.test(value);
}

function cleanDeckTitle(value: string): string {
  return value
    .replace(/^[-*•#>\s]+/u, "")
    .replace(/\*\*/g, "")
    .replace(/[`_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTopicHeadline(topic: string): string {
  const normalized = cleanDeckTitle(topic).replace(/[。；;，,：:]+$/u, "");
  if (!normalized) {
    return "";
  }
  const capped = normalized.length > 28 ? `${normalized.slice(0, 28).trim()}...` : normalized;
  return capped.includes("反推")
    ? capped
    : `${capped}反推脚本`;
}

export function resolveSquareReverseDeckTitle(input: {
  sourceTitle?: string | null;
  fallbackTitle?: string | null;
  source?: string | null;
  storyboardPanel?: ReverseStoryboardPanelViewModel | null;
}): string {
  const storyboardPrimaryTopic = normalizeText(resolveReverseStoryboardPrimaryTopicFromPanel(input.storyboardPanel));
  if (storyboardPrimaryTopic) {
    return buildTopicHeadline(storyboardPrimaryTopic);
  }
  const intro = normalizeText(input.storyboardPanel?.report?.intro);
  if (intro) {
    return buildTopicHeadline(intro);
  }
  const sourceTitle = normalizeText(input.sourceTitle);
  if (sourceTitle && !looksLikeLocalFilename(sourceTitle)) {
    return cleanDeckTitle(sourceTitle);
  }
  const fallbackTitle = normalizeText(input.fallbackTitle);
  if (fallbackTitle && !looksLikeLocalFilename(fallbackTitle)) {
    return cleanDeckTitle(fallbackTitle);
  }
  const source = normalizeText(input.source);
  if (source && !looksLikeLocalFilename(source) && !/^https?:\/\//i.test(source)) {
    return cleanDeckTitle(source);
  }
  return "视频画面反推脚本";
}
