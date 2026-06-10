/**
 * 热榜 LLM Prompt 上下文构建函数
 * 构建 LLM 调用所需的 prompt 和审计信息
 *
 * 这些函数依赖外部配置和服务，通过参数注入依赖
 */

import type {
  HotTrendType,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
} from "../types.js";
import type {
  ReverseStoryboardSourceType,
  ReverseStoryboardPanelViewModel,
} from "../../../contracts/reverse-storyboard-report.js";
import type { HotTrendPromptAuditMeta } from "../../../contracts/hot-trend-prompt-audit.js";
import {
  HOT_TREND_STEP3_MAX_DURATION_SEC,
  HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS,
} from "../constants.js";
import { normalizeHotTrendDouyinSourceUrl } from "./sanitize.js";
import { skillLoader } from "../../../services/skills/index.js";

const PROMPT_CODE_VIDEO_MULTIMODAL_SCREEN = "video_multimodal_screen";

// ============================================================================
// LLM Prompt 上下文构建函数
// ============================================================================

/**
 * 构建视频多模态筛选 Prompt 上下文
 */
export async function buildHotTrendVideoMultimodalScreenPromptContext(
  input: {
    topicLabel: string;
    sourceUrl: string;
    promptVersion: string;
    labelingCriteria: string;
    topN: number;
  },
  deps: {
    encodeAuditMeta: (meta: HotTrendPromptAuditMeta) => string;
    defaultLabelingCriteria: string;
  },
  providerRoute: string,
): Promise<{
  systemPrompt: string;
  userPrompt: string;
  requestSummary: string;
}> {
  const criteria = input.labelingCriteria.trim() || deps.defaultLabelingCriteria.trim();
  // 获取提示词模板
  const { system } = await skillLoader.render(PROMPT_CODE_VIDEO_MULTIMODAL_SCREEN, { variables: {
    topicLabel: input.topicLabel,
    sourceUrl: input.sourceUrl,
    criteria,
  }});
  const userPrompt = system;
  const requestSummary = [
    `type=video`,
    `promptVersion=${input.promptVersion}`,
    deps.encodeAuditMeta({
      providerRoute,
      promptVersion: input.promptVersion,
      generationMode: "real",
      trendType: "video",
      topN: input.topN,
      promptTemplateBefore: criteria,
      promptTemplateAfter: "video_hot_trend_multimodal_screen_json_v1",
      promptRuntime: userPrompt,
      auditStage: "video_hot_trend_multimodal_screen",
    }),
  ].join("; ");
  return {
    systemPrompt: userPrompt,
    userPrompt: "",
    requestSummary,
  };
}

/**
 * 构建资产反推上下文
 */
export function buildHotTrendAssetReverseContext(
  topic: { label: string; url: string; itemId?: string | null },
  trendType: HotTrendType,
  labels: string[],
  scriptText: string,
  storyboardMarkdown: string,
  durationSec: number,
  buildStoryboardPanel?: (input: {
    sourceType: ReverseStoryboardSourceType;
    videoUrl?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    duration?: number | null;
    rawMarkdown: string;
    diagnostics?: unknown;
    raw?: unknown;
  }) => ReverseStoryboardPanelViewModel,
): {
  keywords: string[];
  sourceMeta: {
    url: string | null;
    title: string;
    videoUrl: string | null;
    audioUrl: null;
    createTime: null;
    playCount: null;
    commentCount: null;
    diggCount: null;
    shareCount: null;
    collectCount: null;
    recommendCount: null;
    nickname: null;
    duration: number;
    scriptText: string | null;
  };
  storyboardPanel: ReverseStoryboardPanelViewModel | null;
} {
  const synthesizedDouyinUrl =
    topic.itemId && /^\d{10,24}$/.test(topic.itemId) ? `https://www.douyin.com/video/${topic.itemId}` : null;
  const normalizedTopicUrl =
    normalizeHotTrendDouyinSourceUrl(topic.url) ??
    normalizeHotTrendDouyinSourceUrl(synthesizedDouyinUrl) ??
    synthesizedDouyinUrl ??
    topic.url;
  const keywords = [
    "#热榜脚本",
    trendType === "video" ? "#视频热榜" : "#实时热榜",
    ...labels.slice(0, 3).map((label) => `#${label.replace(/\s+/g, "")}`),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
  const storyboardPanel = buildStoryboardPanel
    ? buildStoryboardPanel({
        sourceType: "video_url",
        videoUrl: normalizedTopicUrl,
        duration: durationSec,
        rawMarkdown: storyboardMarkdown,
        diagnostics: {
          source: "hot_trend_labeling",
          trendType,
        },
        raw: null,
      })
    : null;
  return {
    keywords: [...new Set(keywords)],
    sourceMeta: {
      url: normalizedTopicUrl,
      title: topic.label,
      videoUrl: trendType === "video" ? normalizedTopicUrl : null,
      audioUrl: null,
      createTime: null,
      playCount: null,
      commentCount: null,
      diggCount: null,
      shareCount: null,
      collectCount: null,
      recommendCount: null,
      nickname: null,
      duration: durationSec,
      scriptText: scriptText.trim() || null,
    },
    storyboardPanel,
  };
}