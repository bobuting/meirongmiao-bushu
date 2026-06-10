import { normalizeStep3StructuredScriptCard } from "../../../../src/contracts/step3-structured-script-card-contract";
import { getStrategyTypeLabel } from "../../utils/strategyTypeLabels";

export type Step3StructuredScriptCardSource = "hot-search" | "premium";

export interface Step3StructuredScriptCardViewModelInput {
  source: Step3StructuredScriptCardSource;
  title: string;
  subtitle: string;
  durationSec: number;
  storyboardCount?: number;
  preview: string;
  content: string;
  /** 主场景 */
  mainScene?: string;
  /** 氛围描述 */
  atmosphere?: string;
  /** 时间段 */
  timeOfDay?: string;
  /** 天气 */
  weather?: string;
  /** 主题 */
  theme?: string;
  /** 概要 */
  summary?: string;
  /** 主要情绪 */
  primaryEmotion?: string;
  /** 情绪弧线 */
  emotionArc?: string;
  /** 视频风格 */
  videoStyle?: string;
}

const STEP3_CARD_MAX_STORYBOARD_COUNT = 10;
const STEP3_CARD_EXPLICIT_MARKETING_PATTERN =
  /(可承载服装软广叙事|可承载软广叙事|可承载软广|可承载种草|可承载植入|服装软广|软广告|软广|种草|强植入|自然植入|植入位|广告感|硬广|转化导向|转化|下单|卖点|带货|广告)/gu;

function sanitizeText(input: string): string {
  return input
    .replace(/^旁白[:：]\s*/u, "")
    .replace(STEP3_CARD_EXPLICIT_MARKETING_PATTERN, "")
    .replace(/[，,。.!！？?；;]{2,}/gu, "。")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function splitBlocks(content: string): string[] {
  const rows = content
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (rows.length > 0) {
    return rows;
  }
  return content
    .split(/[。！？!?；;]/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function buildStep3StructuredScriptCardViewModel(input: Step3StructuredScriptCardViewModelInput) {
  const blocks = splitBlocks(input.content);
  // 镜头数：优先使用传入值，其次从 content 分段数推断，不再用时长估算
  const preferredStoryboardCount =
    Number.isFinite(Number(input.storyboardCount)) && Number(input.storyboardCount) > 0
      ? Math.floor(Number(input.storyboardCount))
      : null;
  const storyboardCount = Math.max(
    1,
    Math.min(
      STEP3_CARD_MAX_STORYBOARD_COUNT,
      preferredStoryboardCount ?? (blocks.length > 0 ? blocks.length : 1),
    ),
  );
  const rhythmTags = Array.from(
    new Set([
      input.source === "hot-search" ? "热榜导向" : getStrategyTypeLabel("library"),
      input.durationSec <= 30 ? "快节奏" : "节奏递进",
    ]),
  );

  return normalizeStep3StructuredScriptCard({
    title: input.title.trim() || "未命名脚本",
    scenario: input.subtitle.trim() || "通用场景",
    durationSec: Math.max(1, Math.round(input.durationSec || 1)),
    storyboardCount,
    coreSellingPoint: sanitizeText(input.preview || blocks[0] || input.content || "突出核心情节"),
    rhythmTags,
    mainScene: input.mainScene,
    atmosphere: input.atmosphere,
    timeOfDay: input.timeOfDay,
    weather: input.weather,
    theme: input.theme,
    summary: input.summary,
    primaryEmotion: input.primaryEmotion,
    emotionArc: input.emotionArc,
    videoStyle: input.videoStyle,
  });
}
