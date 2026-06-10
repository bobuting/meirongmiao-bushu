/**
 * snapshot-field-extractor.ts
 * Step3 快照字段统一提取模块
 *
 * 从 video builder (snapshot-builder.ts) 的提取函数提取为共享模块，
 * 3 个脚本类型（video / library / realtime）统一使用同一套字段提取逻辑。
 */

import type { ScriptCandidateEntity, ShotBreakdownEntity } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { VideoScriptContent, ShotBreakdownItem } from "./types.js";
import type { AtmosphereSceneCategory, EmotionToneCategory } from "../../../contant-config/style-atmosphere-dict.js";
import { safeParseAtmosphere, safeParseEmotionTone } from "../../../utils/dict-converters.js";

// ===========================================================================
// 辅助提取函数
// ===========================================================================

/**
 * 提取预览文本
 * 优先使用 video_analysis.summary，其次使用第一个镜头描述
 */
export function extractPreview(
  shot_breakdown?: ShotBreakdownItem[],
  video_analysis?: VideoScriptContent["video_analysis"],
): string {
  if (video_analysis?.summary) {
    return video_analysis.summary.slice(0, 200);
  }
  if (shot_breakdown && shot_breakdown.length > 0) {
    const firstShot = shot_breakdown[0];
    if (firstShot.shot_description) {
      return firstShot.shot_description.slice(0, 200);
    }
  }
  return "脚本预览";
}

/**
 * 估算脚本时长
 * 从 timecode 累计，否则按镜头数估算
 */
export function estimateDuration(shot_breakdown?: ShotBreakdownItem[]): number {
  if (!shot_breakdown || shot_breakdown.length === 0) {
    return 20;
  }
  let totalDuration = 0;
  for (const shot of shot_breakdown) {
    if (shot.timecode?.duration_seconds) {
      totalDuration += shot.timecode.duration_seconds;
    }
  }
  if (totalDuration > 0) {
    return Math.round(totalDuration);
  }
  return Math.round(shot_breakdown.length * 4);
}

/**
 * 提取标签
 * 从 key_elements、emotion、fashion_placement 中收集
 */
export function extractLabels(video_analysis?: VideoScriptContent["video_analysis"]): string[] {
  const labels: string[] = [];
  if (video_analysis?.key_elements) {
    labels.push(...video_analysis.key_elements.slice(0, 4));
  }
  if (video_analysis?.emotion?.primary) {
    labels.push(video_analysis.emotion.primary);
  }
  if (video_analysis?.emotion?.secondary) {
    labels.push(...video_analysis.emotion.secondary.slice(0, 2));
  }
  const styles = Array.isArray(video_analysis?.fashion_placement?.recommended_styles)
    ? video_analysis.fashion_placement.recommended_styles
        .map((s) => s.style)
        .filter((s): s is string => !!s)
    : [];
  labels.push(...styles.slice(0, 2));
  return [...new Set(labels)].slice(0, 8);
}

/**
 * 转换分镜数据为 StoryboardSegment 格式
 * audio 结构已改为只包含 ambient_sound（环境音）
 */
export function convertToStoryboardSegments(
  shot_breakdown?: ShotBreakdownItem[],
): ShotBreakdownEntity[] | undefined {
  if (!shot_breakdown || shot_breakdown.length === 0) {
    return undefined;
  }
  return shot_breakdown.map((shot, index) => {
    const shotDesc = shot.shot_description || "";
    // 从 audio 提取环境音，从 shot_description 提取画面描述
    const ambientSound = shot.audio?.ambient_sound || "";
    return {
      title: `镜头 ${index + 1}`,
      content: ambientSound ? `环境音：${ambientSound}` : "",
      visualCue: shotDesc,                  // 画面描述（镜头画面）
      visualPrompt: shotDesc,               // 视觉提示词（用于图生图）
      shotSize: shot.shot_type,
      ambientSound: ambientSound,
      durationSec: shot.timecode?.duration_seconds,
      audio: shot.audio,
    };
  });
}

/**
 * 提取主场景
 * 优先从 video_info.main_scene 直接获取（LLM 脚本级输出）
 * 其次从 summary 提取，最后遍历分镜的 scene 字段
 */
export function extractMainScene(
  shot_breakdown?: ShotBreakdownItem[],
  summary?: string,
  video_info?: VideoScriptContent["video_info"],
): string | undefined {
  // 优先从 video_info.main_scene 直接获取
  if (video_info?.main_scene) {
    return video_info.main_scene;
  }
  if (summary) {
    const sceneFromSummary = extractSceneFromSummary(summary);
    if (sceneFromSummary) {
      return sceneFromSummary;
    }
  }
  if (shot_breakdown && shot_breakdown.length > 0) {
    for (const shot of shot_breakdown) {
      const scene = shot.visual?.scene as Record<string, unknown> | undefined;
      if (scene?.specific_location) {
        return String(scene.specific_location);
      }
      if (scene?.environment) {
        return String(scene.environment);
      }
    }
  }
  return undefined;
}

/**
 * 从 summary 文本中提取场景关键词
 */
export function extractSceneFromSummary(summary: string): string | undefined {
  const sceneKeywords = [
    { pattern: /街道斑马线|斑马线/g, scene: "街道斑马线" },
    { pattern: /街道|马路|街边|街角/g, scene: "街道" },
    { pattern: /人行道|路边/g, scene: "人行道" },
    { pattern: /十字路口|路口/g, scene: "十字路口" },
    { pattern: /咖啡[厅馆]|咖啡馆/g, scene: "咖啡馆" },
    { pattern: /商场|购物中心/g, scene: "商场" },
    { pattern: /办公室|办公区/g, scene: "办公室" },
    { pattern: /家中|室内|家里/g, scene: "室内" },
    { pattern: /卧室|房间/g, scene: "卧室" },
    { pattern: /厨房/g, scene: "厨房" },
    { pattern: /浴室|卫生间/g, scene: "浴室" },
    { pattern: /公园|花园/g, scene: "公园" },
    { pattern: /操场|运动场/g, scene: "操场" },
    { pattern: /海边|沙滩|海滩/g, scene: "海边" },
    { pattern: /山顶|山间/g, scene: "山顶" },
    { pattern: /森林|树林/g, scene: "森林" },
    { pattern: /田野|草地|草坪/g, scene: "田野" },
    { pattern: /天台|屋顶/g, scene: "天台" },
    { pattern: /楼梯|楼梯间/g, scene: "楼梯" },
    { pattern: /阳台/g, scene: "阳台" },
    { pattern: /窗户|窗边/g, scene: "窗边" },
  ];
  for (const { pattern, scene } of sceneKeywords) {
    if (pattern.test(summary)) {
      return scene;
    }
  }
  const locationMatch = summary.match(/在([^，。！？,.\s]{2,8})(?:上|中|里|内)/);
  if (locationMatch && locationMatch[1]) {
    return locationMatch[1].trim();
  }
  return undefined;
}

/**
 * 提取氛围
 * 优先从 video_analysis.atmosphere 直接获取（LLM 脚本级输出）
 * 其次从第一个镜头的 lighting.mood 获取
 * 返回统一字典类型
 */
export function extractAtmosphere(
  shot_breakdown?: ShotBreakdownItem[],
  video_analysis?: VideoScriptContent["video_analysis"],
): AtmosphereSceneCategory | null {
  // 优先从 video_analysis.atmosphere 直接获取
  if (video_analysis?.atmosphere) {
    const parsed = safeParseAtmosphere(video_analysis.atmosphere);
    return parsed;
  }
  if (!shot_breakdown || shot_breakdown.length === 0) {
    return null;
  }
  const lighting = shot_breakdown[0].visual?.lighting as Record<string, unknown> | undefined;
  if (lighting && typeof lighting.mood === "string" && lighting.mood.trim().length > 0) {
    const parsed = safeParseAtmosphere(lighting.mood.trim());
    return parsed;
  }
  return null;
}

/**
 * 构建可读的 content 文本
 */
export function buildReadableContent(data: VideoScriptContent): string {
  const { video_info, video_analysis, shot_breakdown } = data;
  const parts: string[] = [];
  const title = video_analysis?.title || video_info?.title || "未命名脚本";
  parts.push(`【脚本标题】${title}`);
  if (video_analysis?.theme) {
    parts.push(`【主题】${video_analysis.theme}`);
  }
  if (video_info?.duration_seconds) {
    parts.push(`【时长】${video_info.duration_seconds}秒`);
  }
  if (video_analysis?.summary) {
    parts.push(`【概要】${video_analysis.summary}`);
  }
  if (shot_breakdown && shot_breakdown.length > 0) {
    parts.push(`【分镜列表】`);
    shot_breakdown.forEach((shot, index) => {
      const desc = shot.shot_description || "";
      parts.push(`镜头${index + 1}：${desc}`);
    });
  }
  return parts.join("\n\n");
}

// ===========================================================================
// 统一快照构建入口
// ===========================================================================

/** 统一构建参数（3 个类型各自的适配层产出这个结构） */
export interface UnifiedSnapshotItemInput {
  /** 唯一标识（由调用方生成，如 "video-{id}-{ts}"） */
  candidateId: string;
  /** 来源脚本 ID */
  sourceScriptId: string;
  /** 来源 URL（视频直链） */
  sourceUrl: string | null;
  /** 排序权重 */
  rank: number;
  /** 脚本类型 */
  strategyType: "realtime" | "video" | "library";
  /** 标题 */
  title: string;
  /** 大模型原始输出（VideoScriptContent 格式） */
  content: VideoScriptContent;
  /** 来源 OSS URL（可选，video 类型有） */
  sourceOssUrl?: string | null;
  /** realtime 独有扩展字段（原样透传，不丢失） */
  extendedFields?: Partial<Pick<ScriptCandidateEntity,
    | "emotionAnalysis"
    | "themeAnalysis"
    | "deductionResult"
    | "diversification"
    | "bgmSuggestion"
    | "titleSuggestions"
    | "hashtags"
    | "publishSuggestion"
    | "ironLawsCheck"
    | "qualityCheckReport"
    | "matchScore"
    | "matchReasons"
  >>;
}

/**
 * 统一快照构建函数
 * 3 个脚本类型共享同一套字段提取逻辑，确保输出完全一致
 */
export function buildUnifiedSnapshotItem(input: UnifiedSnapshotItemInput): ScriptCandidateEntity {
  const { candidateId, sourceScriptId, sourceUrl, rank, strategyType, title, content, extendedFields } = input;
  const { video_info, video_analysis, shot_breakdown, editing_analysis } = content;

  // 统一提取所有字段
  const preview = extractPreview(shot_breakdown, video_analysis);
  const durationSec = estimateDuration(shot_breakdown);
  const labels = extractLabels(video_analysis);
  const storyboardSegments = convertToStoryboardSegments(shot_breakdown);
  const atmosphere = extractAtmosphere(shot_breakdown, video_analysis);
  const mainScene = extractMainScene(shot_breakdown, video_analysis?.summary, video_info);

  // 服饰风格
  const recommendedStyles = Array.isArray(video_analysis?.fashion_placement?.recommended_styles)
    ? video_analysis.fashion_placement.recommended_styles
    : [];
  const styles = recommendedStyles.map((s) => s.style).filter((s): s is string => !!s);

  return {
    candidateId,
    sourceScriptId,
    sourceUrl: sourceUrl ?? null,
    rank,
    strategyType,
    title,
    preview,
    content: buildReadableContent(content),
    durationSec,
    suitability: "high",
    labels,
    storyboardSegments,

    // 独立字段（统一提取）
    mainScene,
    timeOfDay: video_info?.time_of_day,
    weather: video_info?.weather,
    atmosphere,
    scriptStyle: styles[0],
    shotCount: shot_breakdown?.length || 0,
    scriptType: video_analysis?.video_type,
    audienceProfile: video_analysis?.target_audience,
    emotionTone: safeParseEmotionTone(video_analysis?.emotion?.primary),
    theme: video_analysis?.theme,
    scene: mainScene,
    storyLine: undefined,
    emotionArc: video_analysis?.emotion?.emotion_arc,
    summary: video_analysis?.summary,
    subtitle: video_analysis?.video_style,

    // 大模型完整结构化输出（原样透传）
    video_info: video_info as Record<string, unknown> | undefined,
    video_analysis: video_analysis as Record<string, unknown> | undefined,
    shot_breakdown: shot_breakdown as Record<string, unknown>[] | undefined,
    editing_analysis: editing_analysis as Record<string, unknown> | undefined,

    // 扩展字段（realtime 独有，其他类型为空）
    ...extendedFields,
  };
}
