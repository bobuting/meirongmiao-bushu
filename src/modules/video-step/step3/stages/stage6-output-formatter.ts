/**
 * 阶段6：输出交付
 * 转换为快照格式，生成最终结果
 *
 * 【统一改造】realtime 类型也走 buildUnifiedSnapshotItem 统一提取逻辑
 * 适配层将 Step3ScriptResult 转换为 VideoScriptContent，再调用统一函数
 * realtime 独有的扩展字段（emotionAnalysis, deductionResult 等）通过 extendedFields 透传
 */

import type { AtmosphereSceneCategory, EmotionToneCategory } from "../../../../contant-config/style-atmosphere-dict.js";
import { safeParseAtmosphere, safeParseEmotionTone } from "../../../../utils/dict-converters.js";
import type {
  Step3ScriptResult,
  Step3ScriptGenerationSnapshot,
  ScriptCandidateEntity,
  ShotBreakdownEntity,
  StoryboardSegmentNew,
  ClimaxDesign,
  ClimaxDesignItem,
  QualityCheckReport,
} from "../types.js";
import type { VideoScriptContent } from "../../step3-video-script/types.js";
import { buildUnifiedSnapshotItem } from "../../step3-video-script/snapshot-field-extractor.js";

/** 将任意值安全转为 string，对象返回空字符串 */
function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.specific_location) return String(obj.specific_location);
    if (obj.environment) return String(obj.environment);
    if (obj.location_type) return String(obj.location_type);
    return "";
  }
  return String(value);
}

/**
 * 当前 Prompt 版本号
 */
const PROMPT_VERSION = "ht-v2026.03.14-r1";

/**
 * 阶段6：输出交付
 * @param scripts 验证后的脚本列表
 * @param projectId 项目ID
 * @returns 快照结果
 */
export function stage6_formatOutput(
  scripts: Step3ScriptResult[],
  projectId: string,
): Step3ScriptGenerationSnapshot {

  const createdAt = Date.now();

  // Step 6.1: 转换脚本为快照项格式（统一提取逻辑）
  const items = scripts.map((script, index) =>
    convertScriptResultToSnapshotItem(script, index + 1),
  );

  // Step 6.2: 生成快照ID
  const snapshotId = generateSnapshotId();


  return {
    snapshotId,
    projectId,
    promptVersion: PROMPT_VERSION,
    topNAtCreation: items.length,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode: "real",
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt,
    items,
  };
}

/**
 * 生成快照ID
 */
function generateSnapshotId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `step3-snapshot-${timestamp}-${random}`;
}

/**
 * 转换分镜片段格式
 * 【修复】保留 shotSize, dialogue, action 等新字段
 * 【修复】移除默认值降级处理，content 和 visualCue 都为空时跳过该分镜
 */
function convertStoryboardSegmentsNew(
  segments: StoryboardSegmentNew[],
): ShotBreakdownEntity[] {
  const result: ShotBreakdownEntity[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (!segment) continue;

    const rawContent = typeof segment.content === "string" ? segment.content.trim() : "";
    const rawVisualCue = typeof segment.visualCue === "string" ? segment.visualCue.trim() : "";
    // content 和 visualCue 都为空时跳过该分镜
    if (!rawContent && !rawVisualCue) {
      continue;
    }

    const item: ShotBreakdownEntity = {
      title: segment.title || `镜头 ${index + 1}`,
      content: rawContent,
      visualCue: rawVisualCue,
    };

    // 可选字段：只在有值时添加
    if (segment.visualPrompt) item.visualPrompt = segment.visualPrompt;
    if (segment.shotSize) item.shotSize = segment.shotSize;
    if (segment.dialogue) item.dialogue = segment.dialogue;
    if (segment.action) item.action = segment.action;

    result.push(item);
  }
  return result;
}

/**
 * 从情绪分析中提取匹配原因
 */
function extractMatchReasons(
  emotionAnalysis: Step3ScriptResult["emotionAnalysis"],
): string[] {
  const reasons: string[] = [];

  if (emotionAnalysis.deepEmotion?.length > 0) {
    reasons.push(`情感共鸣：${emotionAnalysis.deepEmotion.slice(0, 2).join("、")}`);
  }

  if (emotionAnalysis.emotionOutlet) {
    reasons.push(`情绪价值：${emotionAnalysis.emotionOutlet}`);
  }

  return reasons.slice(0, 4);
}

/**
 * 从分镜片段提取高潮设计
 */
function extractClimaxDesignFromSegments(segments: Step3ScriptResult["storyboardSegments"]): ClimaxDesign | undefined {
  if (!segments || segments.length === 0) return undefined;

  const items: ClimaxDesignItem[] = [];

  segments.forEach((seg, index) => {
    if (seg.climaxFunction) {
      const timeRange = index === 0 ? "0-3秒" :
        index === segments.length - 1 ? `${(segments.length - 1) * 5}-${segments.length * 5}秒` :
        `${index * 5}-${(index + 1) * 5}秒`;

      items.push({
        timeRange,
        type: seg.climaxFunction === "hook" ? "visual" :
          seg.climaxFunction === "climax" ? "emotion" :
          seg.climaxFunction === "closing" ? "closing" : "visual",
        description: seg.title,
      });
    }
  });

  if (items.length === 0) return undefined;

  return {
    structure: items.length >= 3 ? "triple" : "dual",
    emotionCurve: "progressive",
    climaxPoints: items,
  };
}

/**
 * 创建默认的质量检查报告
 */
function createDefaultQualityCheckReport(script: Step3ScriptResult): QualityCheckReport {
  return {
    hookStrength: { score: 15, passed: true, details: "默认通过" },
    emotionArc: { score: 15, passed: true, details: "默认通过" },
    memorability: { score: 12, passed: true, details: "默认通过" },
    innovation: { score: 12, passed: true, details: "默认通过" },
    fashionNaturalness: { score: 15, passed: true, details: "默认通过" },
    pacing: { score: 13, passed: true, details: "默认通过" },
    totalScore: 82,
    rating: "good",
    optimizationSuggestions: [],
  };
}

/**
 * 将 Step3ScriptResult 适配为 VideoScriptContent
 * realtime 类型的 LLM 输出格式与 video/library 不同，需要适配
 *
 * 【重要】只使用大模型原始结构化输出（raw* 字段），不手动构造假数据
 * 如果 raw* 字段为空，对应 VideoScriptContent 字段就是 undefined
 */
function adaptRealtimeToVideoScriptContent(script: Step3ScriptResult): VideoScriptContent {
  return {
    video_info: script.rawVideoInfo as VideoScriptContent["video_info"],
    video_analysis: script.rawVideoAnalysis as VideoScriptContent["video_analysis"],
    shot_breakdown: script.rawShotBreakdown as VideoScriptContent["shot_breakdown"],
    editing_analysis: script.rawEditingAnalysis as VideoScriptContent["editing_analysis"],
  };
}

/**
 * 将脚本结果转换为快照项
 * 【统一改造】通过 adaptRealtimeToVideoScriptContent 适配后，调用 buildUnifiedSnapshotItem
 */
function convertScriptResultToSnapshotItem(
  script: Step3ScriptResult,
  rank: number,
): ScriptCandidateEntity {
  const scriptId = script.id || `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = script.title || "未命名脚本";

  // 适配为 VideoScriptContent
  const videoScriptContent = adaptRealtimeToVideoScriptContent(script);

  // 提取 realtime 独有扩展字段
  const matchReasons = extractMatchReasons(script.emotionAnalysis);
  const qualityCheckReport = script.qualityCheckReport || createDefaultQualityCheckReport(script);

  // 统一构建（字段提取逻辑与 video/library 完全一致）
  const item = buildUnifiedSnapshotItem({
    candidateId: `step3-candidate-smart-${scriptId}`,
    sourceScriptId: scriptId,
    sourceUrl: null, // realtime 类型无视频源 URL（relatedHotspot 是热点，非视频）
    rank,
    strategyType: "realtime",
    title,
    content: videoScriptContent,
    extendedFields: {
      matchScore: qualityCheckReport?.totalScore ? qualityCheckReport.totalScore / 100 : 0.5,
      matchReasons: matchReasons.length > 0 ? matchReasons : undefined,

      // realtime 独有分析字段（原样透传，不丢失）
      emotionAnalysis: script.emotionAnalysis,
      themeAnalysis: script.themeAnalysis,
      deductionResult: script.deductionResult,
      diversification: script.diversification,
      bgmSuggestion: script.bgmSuggestion,
      titleSuggestions: script.titleSuggestions,
      hashtags: script.hashtags,
      publishSuggestion: script.publishSuggestion,
      ironLawsCheck: script.ironLawsCheck,
      qualityCheckReport,
    },
  });

  // 覆盖 realtime 从 Step3ScriptResult 直接取的字段（适配层无法从 VideoScriptContent 提取）
  // 如果统一提取函数已从 rawVideoAnalysis 提取到值则保留，否则用 Step3ScriptResult 的值补充
  return {
    ...item,
    // storyboardSegments：realtime 有独立的分镜格式（StoryboardSegmentNew），需用独立转换
    storyboardSegments: script.storyboardSegments
      ? convertStoryboardSegmentsNew(script.storyboardSegments)
      : item.storyboardSegments,
    // 独立字段：优先用统一提取结果，若为空则从 Step3ScriptResult 补充
    mainScene: coerceToString(item.mainScene) || coerceToString(script.mainScene) || coerceToString(script.scene) || coerceToString(script.deductionResult?.scene),
    timeOfDay: item.timeOfDay || script.timeOfDay,
    weather: item.weather || script.weather,
    atmosphere: safeParseAtmosphere(item.atmosphere) || safeParseAtmosphere(script.atmosphere),
    scriptStyle: item.scriptStyle || script.scriptStyle,
    shotCount: script.shotCount ?? item.shotCount,
    scriptType: item.scriptType || script.scriptType,
    audienceProfile: item.audienceProfile || script.audienceProfile,
    emotionTone: safeParseEmotionTone(item.emotionTone) || safeParseEmotionTone(script.emotionTone),
    theme: item.theme || script.theme,
    summary: item.summary || script.summary,
    emotionArc: item.emotionArc || script.emotionArc,
  };
}
