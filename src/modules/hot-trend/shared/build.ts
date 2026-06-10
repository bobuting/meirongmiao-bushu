/**
 * 热榜构建函数
 * 从 app.ts 迁移，包含数据构建和Markdown生成相关函数
 *
 * 迁移源: app.ts 行 6948-6950, 7924-8194
 */

import type {
  HotTrendType,
  HotTrendSmartStoryboardClass,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
} from "../types.js";
import {
  HOT_TREND_SMART_STORYBOARD_CLASS_PREFIX,
  HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS,
} from "../constants.js";
import { sanitizeHotTrendNarrativeText, buildHotTrendShotBreakdownsFromScriptText, limitHotTrendShotBreakdowns } from "./sanitize.js";
import { normalizeHotTrendSceneSettings, clampHotTrendStep3DurationSec } from "./normalize.js";

// ============================================================================
// 智能故事板类型标签构建
// ============================================================================

/**
 * 构建智能故事板类型标签
 */
export function buildHotTrendSmartStoryboardClassTag(value: HotTrendSmartStoryboardClass): string {
  return `${HOT_TREND_SMART_STORYBOARD_CLASS_PREFIX}${value}`;
}

// ============================================================================
// 场景推断函数
// ============================================================================

/**
 * 推断故事主场景
 */
export function inferStoryMainScene(topicLabel: string, scriptBody: string, labels: string[]): string {
  const text = `${topicLabel}\n${scriptBody}\n${labels.join(" ")}`.toLowerCase();
  if (/(便利店|超市|门店|货架|商场|试衣间|橱窗)/i.test(text)) {
    return "城市便利店/商场门店（可见服装陈列与人物动线）";
  }
  if (/(校园|教室|操场|图书馆|放学)/i.test(text)) {
    return "校园周边步行街与教学楼外廊";
  }
  if (/(地铁|公交|通勤|写字楼|办公室)/i.test(text)) {
    return "城市通勤线（地铁口-写字楼入口）";
  }
  if (/(夜市|街头|广场|citywalk|咖啡|餐厅|公园)/i.test(text)) {
    return "城市街角生活场景（街头/咖啡店/步行道）";
  }
  return "城市日常生活场景（人物活动线清晰）";
}

/**
 * 推断故事时间
 */
export function inferStoryTime(scriptBody: string, topicLabel: string): string {
  const text = `${topicLabel}\n${scriptBody}`.toLowerCase();
  if (/(清晨|早晨|早上)/i.test(text)) {
    return "早晨 7:00-9:00（通勤/上学出门时段）";
  }
  if (/(傍晚|黄昏|日落)/i.test(text)) {
    return "傍晚 17:00-19:00（金色柔光时段）";
  }
  if (/(夜晚|夜间|深夜)/i.test(text)) {
    return "夜晚 19:00-22:00（城市灯光氛围）";
  }
  return "下午 16:00-18:00（服装展示友好的自然光时段）";
}

/**
 * 推断故事天气
 */
export function inferStoryWeather(scriptBody: string, topicLabel: string): string {
  const text = `${topicLabel}\n${scriptBody}`.toLowerCase();
  if (/(下雨|雨天|雨后)/i.test(text)) {
    return "小雨/雨后地面反光（保留伞具与防水细节）";
  }
  if (/(阴天|多云)/i.test(text)) {
    return "多云柔光（对服装面料更友好）";
  }
  if (/(雪|冰)/i.test(text)) {
    return "低温晴冷（突出保暖层次）";
  }
  return "晴到多云，自然柔光";
}

// ============================================================================
// 场景设置构建
// ============================================================================

/**
 * 构建场景设置数组
 */
export function buildHotTrendSceneSettings(input: {
  trendType: HotTrendType;
  labels: string[];
  topicLabel: string;
  scriptBody: string;
  preferred?: unknown;
}): HotTrendSceneSetting[] {
  const preferred = normalizeHotTrendSceneSettings(input.preferred);
  const mainScene = preferred["主场景"] ?? inferStoryMainScene(input.topicLabel, input.scriptBody, input.labels);
  const supportScene =
    preferred["辅助场景"] ??
    (input.labels.length > 0
      ? `${input.labels.slice(0, 3).join("、")}相关补充场景（换景/转场/特写）`
      : "门店入口、步行道、近景道具区（用于节奏切换）");
  const time = preferred["时间"] ?? inferStoryTime(input.scriptBody, input.topicLabel);
  const weather = preferred["天气"] ?? inferStoryWeather(input.scriptBody, input.topicLabel);
  const atmosphere =
    preferred["氛围"] ??
    (input.labels.length > 0 ? `真实生活感、${input.labels.slice(0, 2).join("、")}、清新节奏` : "真实生活感、轻叙事、清新节奏");

  const safeMainScene = sanitizeHotTrendNarrativeText(mainScene) || "城市日常生活场景（人物活动线清晰）";
  const safeSupportScene = sanitizeHotTrendNarrativeText(supportScene) || "门店入口与街角步行道";
  const safeTime = sanitizeHotTrendNarrativeText(time) || "下午 16:00-18:00";
  const safeWeather = sanitizeHotTrendNarrativeText(weather) || "晴到多云，自然柔光";
  const safeAtmosphere = sanitizeHotTrendNarrativeText(atmosphere) || "真实生活感、轻叙事、清新节奏";

  return [
    { label: "主场景", value: safeMainScene },
    { label: "辅助场景", value: safeSupportScene },
    { label: "时间", value: safeTime },
    { label: "天气", value: safeWeather },
    { label: "氛围", value: safeAtmosphere },
  ];
}

// ============================================================================
// 分镜Markdown构建
// ============================================================================

/**
 * 构建分镜脚本 Markdown
 */
export function buildHotTrendStoryboardMarkdown(input: {
  topicLabel: string;
  videoIntro: string;
  sceneSettings: Array<{ label: string; value: string }>;
  durationSec: number;
  labels: string[];
  segments: HotTrendShotBreakdown[];
}): string {
  const sectionFour = input.segments
    .map(
      (segment, index) =>
        `镜头 ${index + 1}：${segment.title}\n` +
        `旁白：${segment.content}\n` +
        `画面：${segment.visualCue}`,
    )
    .join("\n\n");

  return [
    "1. 内容主题与人设定位",
    `视频主题：${input.topicLabel}`,
    `视频简介：${input.videoIntro}`,
    "场景设定：",
    ...input.sceneSettings.map((scene) => `- ${scene.label}：${scene.value}`),
    "",
    "2. 叙事结构与镜头节奏",
    `建议时长：${input.durationSec}s`,
    `建议镜头数：${input.segments.length}`,
    "",
    "3. 爆点拆解",
    `关键词：${input.labels.length > 0 ? input.labels.join("、") : "热榜话题"}`,
    "",
    "4. 可复刻脚本（含分镜建议）",
    sectionFour,
    "",
    "5. 可执行优化建议",
    "控制镜头切换在 2-4 秒，口播句子尽量一镜一句，优先保留事实信息与行动建议。",
  ].join("\n");
}

// ============================================================================
// 资产内容构建
// ============================================================================

/**
 * 构建热榜资产内容
 */
export function buildHotTrendAssetContent(input: {
  topicLabel: string;
  trendType: HotTrendType;
  sourceUrl: string;
  rank: number;
  labels: string[];
}): string {
  const normalizedLabels = input.labels.filter((item) => item.trim().length > 0);
  return [
    "# 原始热榜资产",
    `- 原始标题: ${input.topicLabel}`,
    `- 热榜类型: ${input.trendType === "video" ? "视频热榜" : "实时热榜"}`,
    `- 原始链接: ${input.sourceUrl || "无"}`,
    `- 最高排名: Top${input.rank}`,
    `- 原始标签: ${normalizedLabels.length > 0 ? normalizedLabels.join("、") : input.trendType === "video" ? "视频热榜" : "实时热榜"}`,
  ].join("\n");
}

/**
 * 清理热榜元数据
 */
export function stripHotTrendMetadata(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines
    .filter((line) =>
      !line.startsWith("# 热榜元数据") &&
      !line.startsWith("- 主题:") &&
      !line.startsWith("- 链接:") &&
      !line.startsWith("- 评估:") &&
      !line.startsWith("- 原因:") &&
      !line.startsWith("- 建议时长:")
    )
    .join("\n")
    .trim();
}

// ============================================================================
// 结构化资产构建
// ============================================================================

/**
 * 构建结构化资产数据
 */
export function buildHotTrendStructuredAsset(input: {
  topicLabel: string;
  trendType: HotTrendType;
  labels: string[];
  scriptContent: string;
  durationSec: number;
  sceneSettings?: unknown;
  storyboardSegments?: unknown;
}): {
  scriptBody: string;
  contentBody: string;
  sceneSettings: HotTrendSceneSetting[];
  storyboardSegments: HotTrendShotBreakdown[];
  storyboardMarkdown: string;
  durationSec: number;
} {
  const normalizedScriptBody = sanitizeHotTrendNarrativeText(
    stripHotTrendMetadata(input.scriptContent) || input.scriptContent.trim(),
  );
  const normalizedDurationSec = clampHotTrendStep3DurationSec(input.durationSec, 20);

  // 处理分镜片段
  const preferredStoryboard =
    Array.isArray(input.storyboardSegments) && input.storyboardSegments.length > 0
      ? input.storyboardSegments
      : null;

  const normalizedStoryboard = Array.isArray(preferredStoryboard)
    ? preferredStoryboard
        .map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }
          const record = item as Record<string, unknown>;
          const title = String(record.title ?? `镜头 ${index + 1}`).trim() || `镜头 ${index + 1}`;
          const content = sanitizeHotTrendNarrativeText(String(record.content ?? record.narration ?? "").trim());
          if (!content) {
            return null;
          }
          const visualCue = sanitizeHotTrendNarrativeText(
            String(record.visualCue ?? record.visualPrompt ?? "").trim() || `画面：${content.slice(0, 56)}`,
          );
          return {
            title,
            content,
            visualCue,
            visualPrompt: sanitizeHotTrendNarrativeText(String(record.visualPrompt ?? visualCue).trim() || visualCue),
          };
        })
        .filter((item): item is HotTrendShotBreakdown => item !== null)
    : [];

  const storyboardSegments = limitHotTrendShotBreakdowns(
    normalizedStoryboard.length > 0
      ? normalizedStoryboard.map((segment) => ({
          ...segment,
          content: sanitizeHotTrendNarrativeText(segment.content),
          visualCue: sanitizeHotTrendNarrativeText(segment.visualCue),
          visualPrompt: sanitizeHotTrendNarrativeText(segment.visualPrompt),
        }))
      : buildHotTrendShotBreakdownsFromScriptText(normalizedScriptBody),
  );

  const sceneSettings = buildHotTrendSceneSettings({
    trendType: input.trendType,
    labels: input.labels,
    topicLabel: input.topicLabel,
    scriptBody: normalizedScriptBody,
    preferred: input.sceneSettings,
  });

  const videoIntro = storyboardSegments[0]?.content ?? input.topicLabel;
  const storyboardMarkdown = buildHotTrendStoryboardMarkdown({
    topicLabel: input.topicLabel,
    videoIntro,
    sceneSettings,
    durationSec: normalizedDurationSec,
    labels: input.labels,
    segments: storyboardSegments,
  });

  const contentBody = [
    normalizedScriptBody,
    "",
    "# 脚本基本信息",
    "场景设定",
    ...sceneSettings.map((scene) => `- ${scene.label}：${scene.value}`),
    "",
    "# 分镜表",
    ...storyboardSegments.flatMap((segment, index) => [
      `镜头 ${index + 1}`,
      `旁白：${segment.content}`,
      `画面：${segment.visualCue}`,
      "",
    ]),
  ]
    .join("\n")
    .trim();

  return {
    scriptBody: normalizedScriptBody,
    contentBody,
    sceneSettings,
    storyboardSegments,
    storyboardMarkdown,
    durationSec: normalizedDurationSec,
  };
}

// ============================================================================
// 脚本构建函数
// ============================================================================

/**
 * 从分镜片段构建故事脚本
 */
export function buildHotTrendStoryScriptFromSegments(
  topicLabel: string,
  segments: HotTrendShotBreakdown[],
): string {
  const fallbackLines = segments
    .map((segment) => sanitizeHotTrendNarrativeText(segment.content))
    .filter((line) => line.length > 0)
    .slice(0, 4);
  if (fallbackLines.length < 1) {
    return sanitizeHotTrendNarrativeText(
      `开场：围绕"${topicLabel}"建立人物与场景。\n` +
        "发展：通过动作与环境细节推进情节。\n" +
        "转折：在冲突或选择中强化人物情绪。\n" +
        "收束：以明确行动结果完成故事闭环。",
    );
  }
  const orderedLabels = ["开场", "发展", "转折", "收束"];
  const lines = fallbackLines.map((line, index) => `${orderedLabels[index] ?? `镜头${index + 1}`}：${line}`);
  return sanitizeHotTrendNarrativeText(lines.join("\n"));
}

// ============================================================================
// 反推分镜提取函数
// ============================================================================

/**
 * 从反推上下文提取分镜片段
 */
export function extractStoryboardSegmentsFromReverseContext(
  script: {
    content: string;
    reverseContext?: {
      storyboardPanel?: {
        report?: {
          frames?: Array<{
            index: number;
            title?: string;
            narration?: string;
            visualCue?: string;
          }>;
        };
      };
    } | null;
  },
): HotTrendShotBreakdown[] {
  const frames = script.reverseContext?.storyboardPanel?.report?.frames ?? [];
  if (Array.isArray(frames) && frames.length > 0) {
    const normalized = [...frames]
      .sort((left, right) => left.index - right.index)
      .map((frame, index) => {
        const narration = sanitizeHotTrendNarrativeText(
          typeof frame.narration === "string" ? frame.narration.trim() : "",
        );
        if (!narration) {
          return null;
        }
        const visualCue = sanitizeHotTrendNarrativeText(
          typeof frame.visualCue === "string" && frame.visualCue.trim().length > 0
            ? frame.visualCue.trim()
            : `画面：${narration.slice(0, 56)}`,
        );
        return {
          title: frame.title?.trim() || `镜头 ${index + 1}`,
          content: narration,
          visualCue,
          visualPrompt: visualCue,
        };
      })
      .filter((item): item is HotTrendShotBreakdown => item !== null);
    if (normalized.length > 0) {
      return limitHotTrendShotBreakdowns(normalized);
    }
  }
  const body = stripHotTrendMetadata(script.content) || script.content;
  return buildHotTrendShotBreakdownsFromScriptText(body);
}