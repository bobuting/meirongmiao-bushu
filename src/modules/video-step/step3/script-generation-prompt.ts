/**
 * 阶段3：整合生成 - Prompt构建
 * 提示词从数据库获取，代码只准备变量数据
 */

import type { AppContext } from "../../../core/app-context.js";
import type {
  CharacterAnalysisReport,
  // HotspotAnalysisReport, // UNUSED REMOVED
  Stage3Input,
  Step3ScriptResult,
  Diversification,
  IronLawsCheck,
  StoryboardSegmentNew,
  HookType,
  NarrativeStructure,
  EmotionToneType,
  VisualStyleType,
  DialogueStyleType,
  PacingType,
} from "./types.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("script-generation-prompt");
import type { CharacterViewKey } from "../../../contracts/types.js";
import { repairAndParseJson } from "../../../services/utils/json-utils.js";
// import type { OutfitModuleSummary } from "../../../contant-config/shared_dict.js";  // UNUSED REMOVED
import { skillLoader } from "../../../services/skills/index.js";
import { getCurrentSeason } from "../../../utils/date-utils.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";

/** 脚本生成输入项 */
interface CharacterReferenceInput {
  id: string;
  projectId: string;
  userId: string;
  imageUrl: string;
  label?: string;
  viewKey?: CharacterViewKey;
  presetId?: string;
  sourceImageUrl?: string;
}

const PROMPT_CODE_VIDEO_STEP3_SCRIPT_GENERATION = "video_step3_script_generation";

/**
 * 从角色描述中解析性别
 * 扩展关键词匹配以覆盖更多场景
 */
export function parseGenderFromLabel(label: string | undefined): "male" | "female" | "uncertain" {
  if (!label) return "uncertain";
  const lowerLabel = label.toLowerCase();

  // 男性关键词（优先级：具体词 > 通用词）
  const maleKeywords = [
    "男生", "帅哥", "先生", "男子", "男性", "男孩子", "男孩",
    "gentleman", "man", "male", "boy", "guy", "mr.",
    "兄弟", "哥", "小伙", "男神", "型男", "潮男"
  ];

  // 女性关键词（优先级：具体词 > 通用词）
  const femaleKeywords = [
    "女生", "美女", "女士", "女子", "女性", "女孩子", "女孩",
    "lady", "woman", "female", "girl", "ms.", "miss", "mrs.",
    "姐妹", "姐", "姑娘", "女神", "美女", "小姐姐", "小仙女"
  ];

  // 检查男性关键词
  for (const keyword of maleKeywords) {
    if (lowerLabel.includes(keyword.toLowerCase())) {
      return "male";
    }
  }

  // 检查女性关键词
  for (const keyword of femaleKeywords) {
    if (lowerLabel.includes(keyword.toLowerCase())) {
      return "female";
    }
  }

  // 单字"男"/"女"检查（放在最后，避免误匹配）
  if (lowerLabel.includes("男") && !lowerLabel.includes("女")) {
    return "male";
  }
  if (lowerLabel.includes("女") && !lowerLabel.includes("男")) {
    return "female";
  }

  return "uncertain";
}

// UNUSED REMOVED: parseAgeRangeFromLabel (TS6133, no callers)
// (previously lines 80-94)

/**
 * 构建脚本生成的变量数据
 * 返回提示词模板所需的结构化变量对象
 *
 * 【关键设计】不直接塞热点分析的 rawText，而是从热点数据中提炼故事种子。
 * 热点是时代情绪，不是填空题答案。LLM 需要的是"今天这个时代情绪下，一个什么故事值得讲"。
 */
function buildScriptGenerationVariables(
  roleAndOutfitDescription: string,
  hotspotReport: string,
  scriptCount: number = 2,
  clothingStyles?: string[],
  context?: {
    outfitDescription?: string;
    matchingReference?: string;
    selectedRoleDirection?: CharacterDirectionInfo | null;
  },
  expectedGender?: "male" | "female" | "uncertain",
): Record<string, unknown> {
  // 返回结构化参数，由模板自动渲染
  return {
    characterGender: expectedGender,
    characterDescription: roleAndOutfitDescription,
    outfitDescription: context?.outfitDescription,
    matchingReference: context?.matchingReference,
    clothingStyles: clothingStyles,
    selectedRoleDirection: context?.selectedRoleDirection,
    hotspotReport: hotspotReport || "暂无热点数据",
    scriptCount: scriptCount,
  };
}

/**
 * 从 shot_breakdown 中提取主场景
 * 优先级：shot_breakdown[0].visual.scene.specific_location > deduction_result.scene > 默认值
 */
function extractMainScene(shotBreakdown: Record<string, unknown>[], summary?: string): string {
  // 1. 从 shot_breakdown 的 visual.scene 提取（遍历所有 shot）
  for (const shot of shotBreakdown) {
    const visual = shot.visual as Record<string, unknown> | undefined;
    if (visual) {
      const scene = visual.scene as Record<string, unknown> | undefined;
      if (scene) {
        const specificLocation = scene.specific_location as string | undefined;
        if (specificLocation) return specificLocation;
        const environment = scene.environment as string | undefined;
        if (environment) return environment;
      }
    }
  }
  // 2. 从 summary 文本提取场景关键词
  if (summary) {
    const extracted = extractSceneFromSummary(summary);
    if (extracted) return extracted;
  }
  // 未找到，返回空字符串让上层 || 链继续尝试
  return "";
}

/** 从 summary 文本中提取场景关键词 */
function extractSceneFromSummary(summary: string): string | undefined {
  const patterns: Array<{ pattern: RegExp; scene: string }> = [
    { pattern: /街道斑马线|斑马线/g, scene: "街道斑马线" },
    { pattern: /街道|马路|街边|街角/g, scene: "街道" },
    { pattern: /人行道|路边/g, scene: "人行道" },
    { pattern: /咖啡[厅馆]/g, scene: "咖啡馆" },
    { pattern: /商场|购物中心/g, scene: "商场" },
    { pattern: /办公室|办公区/g, scene: "办公室" },
    { pattern: /家中|室内|家里/g, scene: "室内" },
    { pattern: /公园|花园/g, scene: "公园" },
    { pattern: /海边|沙滩|海滩/g, scene: "海边" },
    { pattern: /山顶|山间/g, scene: "山顶" },
    { pattern: /森林|树林/g, scene: "森林" },
    { pattern: /田野|草地|草坪/g, scene: "田野" },
    { pattern: /天台|屋顶/g, scene: "天台" },
    { pattern: /阳台/g, scene: "阳台" },
    { pattern: /窗[户口边]/g, scene: "窗边" },
    { pattern: /地铁/g, scene: "地铁站" },
    { pattern: /公路/g, scene: "公路" },
  ];
  for (const { pattern, scene } of patterns) {
    if (pattern.test(summary)) return scene;
  }
  const locationMatch = summary.match(/在([^，。！？,.\s]{2,8})(?:上|中|里|内)/);
  if (locationMatch?.[1]) return locationMatch[1].trim();
  return undefined;
}

/**
 * 从 video_analysis 和 shot_breakdown 组合提取氛围
 * 组合：emotion.primary + lighting.mood + environment
 */
function extractAtmosphere(
  videoAnalysis: Record<string, unknown>,
  shotBreakdown: Record<string, unknown>[]
): string {
  const parts: string[] = [];

  // 1. 从 video_analysis.emotion.primary 提取主要情绪
  const emotion = videoAnalysis.emotion as Record<string, unknown> | undefined;
  if (emotion) {
    const primary = emotion.primary as string | undefined;
    if (primary) {
      parts.push(primary);
    }
  }

  // 2. 从 shot_breakdown[0].visual.lighting.mood 提取光线氛围
  const firstShot = shotBreakdown[0];
  if (firstShot) {
    const visual = firstShot.visual as Record<string, unknown> | undefined;
    if (visual) {
      const lighting = visual.lighting as Record<string, unknown> | undefined;
      if (lighting) {
        const mood = lighting.mood as string | undefined;
        if (mood) {
          parts.push(mood);
        }
      }
      // 3. 从 scene.environment 提取环境描述
      const scene = visual.scene as Record<string, unknown> | undefined;
      if (scene) {
        const environment = scene.environment as string | undefined;
        if (environment) {
          parts.push(environment);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join("、") : "温暖治愈";
}

/**
 * 解析LLM返回的脚本生成结果
 * 新格式包含: video_info, video_analysis, shot_breakdown, editing_analysis
 */
export function parseScriptGenerationResponse(responseText: string): Step3ScriptResult[] {
  // 使用容错解析：自动处理 markdown 代码块 + JSON 结构修复
  const parsed = repairAndParseJson(responseText);
  if (!parsed) {
    const preview = responseText.length > 200 ? responseText.slice(0, 200) + "..." : responseText;
    log.error(
      { routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION, textPreview: preview, textLength: responseText.length },
      "Failed to parse script generation response (repairAndParseJson returned null)"
    );
    throw new Error("Failed to parse script generation response as valid JSON");
  }

  try {
    // 格式检测：新格式 { scripts: [{ script_meta, shot_breakdown, technical_specs }] }
    // 旧格式：[{ video_info, video_analysis, shot_breakdown, editing_analysis }] 或单个脚本对象
    if (parsed.scripts && Array.isArray(parsed.scripts)) {
      const results: Step3ScriptResult[] = parsed.scripts.map(
        (scriptObj: Record<string, unknown>, scriptIndex: number) =>
          convertNewFormatScriptToStep3Result(scriptObj, scriptIndex),
      );
      return results;
    }

    // 旧格式处理：数组 [{video_info,...}, ...] 或单个脚本对象
    const scriptObjects: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];

    const results: Step3ScriptResult[] = scriptObjects.map((scriptObj, scriptIndex) => {
      // 从单个脚本对象中提取四个顶层字段
      const videoInfo = (scriptObj.video_info || {}) as Record<string, unknown>;
      const videoAnalysis = (scriptObj.video_analysis || {}) as Record<string, unknown>;
      const shotBreakdown = (scriptObj.shot_breakdown || []) as Record<string, unknown>[];
      const editingAnalysis = (scriptObj.editing_analysis || {}) as Record<string, unknown>;

      // 从新格式映射到 Step3ScriptResult
      const script: Step3ScriptResult = {
        id: generateUuid(),
        title: (videoInfo.title as string) || "未命名脚本",
        subtitle: (videoAnalysis.theme as string) || "",
        durationSec: (videoInfo.duration_seconds as number) || 20,
        preview: (videoAnalysis.summary as string) || "",
        content: buildContentFromNewFormat(videoInfo, videoAnalysis, shotBreakdown),

        // 从 shot_breakdown[0].visual.scene 提取主场景，fallback 到 summary 文本提取
        mainScene: extractMainScene(shotBreakdown, videoAnalysis.summary as string),
        timeOfDay: videoInfo.time_of_day as string,
        weather: videoInfo.weather as string,
        // 从 video_analysis.emotion 和 lighting.mood 组合提取氛围
        atmosphere: extractAtmosphere(videoAnalysis, shotBreakdown),
        scriptStyle: videoAnalysis.video_style as string,
        shotCount: (editingAnalysis.total_shots as number) || shotBreakdown.length,

        // 情绪分析
        emotionAnalysis: {
          surfaceEmotion: [(videoAnalysis.emotion as Record<string, unknown>)?.primary as string || "待分析"],
          deepEmotion: ((videoAnalysis.emotion as Record<string, unknown>)?.secondary as string[]) || ["分析服务暂时不可用"],
          emotionConflict: "",
          emotionOutlet: ((videoAnalysis.emotion as Record<string, unknown>)?.emotion_arc as string) || "",
        },

        // 主题分析
        themeAnalysis: {
          phenomenon: (videoAnalysis.theme as string) || "日常穿搭",
          underlyingIssue: (videoAnalysis.theme as string) || "服饰风格展示",
          corePainPoint: "",
          valueProposition: "",
          resonanceGroup: (videoAnalysis.target_audience as string) || "时尚爱好者",
        },

        // 推演结果（使用统一的场景提取函数）
        deductionResult: {
          scene: extractMainScene(shotBreakdown),
          style: (videoAnalysis.video_style as string) || "休闲风格",
          storyLine: "开场→展示→结束",
          characterState: "",
        },

        // 脚本类型与受众
        scriptType: mapVideoType(videoAnalysis.video_type as string),
        audienceProfile: (videoAnalysis.target_audience as string) || "一般受众",
        emotionTone: ((videoAnalysis.emotion as Record<string, unknown>)?.primary as string) || "治愈",
        theme: (videoAnalysis.theme as string) || "日常穿搭分享",
        scene: extractMainScene(shotBreakdown),
        storyLine: "开场展示→细节呈现→结束",
        emotionArc: ((videoAnalysis.emotion as Record<string, unknown>)?.emotion_arc as string) || "平静→沉浸→满足",

        // 多样化维度
        diversification: {
          hookType: "visual_impact",
          narrativeStructure: "linear",
          emotionTone: "healing",
          visualStyle: "homey",
          dialogueStyle: "inner_monologue",
          pacing: editingAnalysis.pacing === "快" ? "fast" : editingAnalysis.pacing === "慢" ? "slow" : "balanced",
          innovationElements: [],
        },

        // 分镜片段 - 从 shot_breakdown 转换
        storyboardSegments: convertShotBreakdownToSegments(shotBreakdown),

        // BGM建议
        bgmSuggestion: {
          style: "轻音乐",
          emotionMatch: ((videoAnalysis.emotion as Record<string, unknown>)?.primary as string) || "轻松愉悦",
          bpm: "中速",
          referenceTracks: [],
          soundEffects: [],
        },

        // 标题建议
        titleSuggestions: [
          { type: "narrative", title: (videoInfo.title as string) || "脚本标题" },
        ],

        // 话题标签
        hashtags: (videoAnalysis.key_elements as string[])?.map((el: string) => `#${el}`) || [],

        // 发布建议
        publishSuggestion: {
          bestTime: "晚上20:00",
          targetUser: (videoAnalysis.target_audience as string) || "时尚爱好者",
          coverSuggestion: "第1镜头",
        },

        // 铁律检查
        ironLawsCheck: {
          passed: true,
          details: {
            noClothingCloseup: true,
            consistency: true,
            strongHook: true,
            properDuration: ((videoInfo.duration_seconds as number) >= 15 && (videoInfo.duration_seconds as number) <= 30),
            properShotCount: (shotBreakdown.length >= 4 && shotBreakdown.length <= 8),
            aestheticCompliance: true,
          },
          violations: [],
        },

        // ===== 透传大模型原始结构化输出（demo_json 格式） =====
        rawVideoInfo: Object.keys(videoInfo).length > 0 ? videoInfo : undefined,
        rawVideoAnalysis: Object.keys(videoAnalysis).length > 0 ? videoAnalysis : undefined,
        rawShotBreakdown: shotBreakdown.length > 0 ? shotBreakdown : undefined,
        rawEditingAnalysis: Object.keys(editingAnalysis).length > 0 ? editingAnalysis : undefined,
      };

      return script;
    });

    return results;
  } catch (error) {
    log.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION },
      "Failed to parse response"
    );
    throw new Error(`Failed to parse script generation response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 从新格式构建 content 字段
 */
function buildContentFromNewFormat(
  videoInfo: Record<string, unknown>,
  videoAnalysis: Record<string, unknown>,
  shotBreakdown: Record<string, unknown>[]
): string {
  const title = videoInfo.title || "未命名脚本";
  const theme = videoAnalysis.theme || "日常穿搭";
  const summary = videoAnalysis.summary || "";
  const duration = videoInfo.duration_seconds || 20;

  let content = `【脚本标题】${title}\n\n`;
  content += `【主题】${theme}\n\n`;
  content += `【时长】${duration}秒\n\n`;
  content += `【概要】${summary}\n\n`;
  content += `【分镜列表】\n`;

  shotBreakdown.forEach((shot, index) => {
    const shotDesc = shot.shot_description || "";
    content += `\n镜头${index + 1}：${shotDesc}`;
  });

  return content;
}

/**
 * 从 shot_breakdown 转换为 storyboardSegments
 */
function convertShotBreakdownToSegments(shotBreakdown: Record<string, unknown>[]): StoryboardSegmentNew[] {
  return shotBreakdown.map((shot, index) => {
    // const timecode = shot.timecode as Record<string, unknown> || {};  // UNUSED
    // const visual = shot.visual as Record<string, unknown> || {};  // UNUSED (was used for scene which is also unused)
    // const scene = visual.scene as Record<string, unknown> || {};  // UNUSED
    // const subjects = shot.subjects as Record<string, unknown>[] || [];  // UNUSED
    const audio = shot.audio as Record<string, unknown> || {};
    const ambientSound = (audio.ambient_sound as string) || "";

    // 构建视觉提示
    const visualPrompt = shot.shot_description || "";

    return {
      title: `镜头 ${index + 1}`,
      content: ambientSound ? `环境音：${ambientSound}` : "",
      visualCue: visualPrompt,
      visualPrompt: visualPrompt,
      emotionNote: undefined,
    } as StoryboardSegmentNew;
  });
}

/**
 * 新格式镜头转换：{ visual_description, camera_movement, character_action, clothing_integration, emotion_note, audio_design, narrative_purpose } → StoryboardSegmentNew
 */
function convertNewFormatShotToSegments(shotBreakdown: Record<string, unknown>[]): StoryboardSegmentNew[] {
  return shotBreakdown.map((shot, index) => {
    const visualDescription = (shot.visual_description as string) || "";
    const cameraMovement = (shot.camera_movement as string) || "";
    const characterAction = (shot.character_action as string) || "";
    const clothingIntegration = (shot.clothing_integration as string) || "";
    const emotionNote = (shot.emotion_note as string) || "";
    const audioDesign = (shot.audio_design as string) || "";
    const narrativePurpose = (shot.narrative_purpose as string) || "";
    const narrativeStage = (shot.narrative_stage as string) || "";
    const timeRange = (shot.time_range as string) || "";

    // 从 audio_design 提取旁白（【声音开场】或【移动叙事】标记后的内容作为旁白）
    const audioContent = extractNarrationFromAudioDesign(audioDesign);

    // 构建视觉提示词：综合 visual_description + camera_movement + character_action
    const visualPrompt = visualDescription;

    // 构建 content：旁白 + 叙事功能
    let content = "";
    if (audioContent) {
      content = audioContent;
    }
    if (narrativePurpose) {
      content = content ? `${content}\n叙事目的：${narrativePurpose}` : `叙事目的：${narrativePurpose}`;
    }

    return {
      title: narrativeStage ? `镜头 ${index + 1} · ${narrativeStage}` : `镜头 ${index + 1}`,
      content,
      visualCue: visualDescription,
      visualPrompt: visualPrompt,
      emotionNote: emotionNote || undefined,
      // 新格式专属字段
      clothingIntegration: clothingIntegration || undefined,
      action: characterAction || undefined,
      cameraLanguage: cameraMovement || undefined,
      durationSec: parseDurationFromTimeRange(timeRange),
    } as StoryboardSegmentNew;
  });
}

/**
 * 从 audio_design 文本中提取旁白内容
 * 新格式 audio_design 是纯文本描述，如 "【声音开场】清脆的翻页声..."
 */
function extractNarrationFromAudioDesign(audioDesign: string): string {
  if (!audioDesign) return "";
  // 提取【xxx】标记后的内容作为旁白提示
  const bracketMatch = audioDesign.match(/【[^】]+】(.+)/);
  if (bracketMatch) {
    return `旁白：${bracketMatch[1].trim()}`;
  }
  // 无标记时直接作为音频描述
  return audioDesign.length > 0 ? `音频：${audioDesign}` : "";
}

/**
 * 从 time_range（如 "0-4s"）解析镜头时长
 */
function parseDurationFromTimeRange(timeRange: string): number | undefined {
  if (!timeRange) return undefined;
  const match = timeRange.match(/(\d+)-(\d+)s/);
  if (match) {
    return parseInt(match[2], 10) - parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * 新格式脚本转换：{ script_meta, shot_breakdown, technical_specs } → Step3ScriptResult
 * realtime 类型 stage4 输出的新格式
 */
function convertNewFormatScriptToStep3Result(
  scriptObj: Record<string, unknown>,
  scriptIndex: number,
): Step3ScriptResult {
  const scriptMeta = (scriptObj.script_meta || {}) as Record<string, unknown>;
  const shotBreakdown = (scriptObj.shot_breakdown || []) as Record<string, unknown>[];
  const technicalSpecs = (scriptObj.technical_specs || {}) as Record<string, unknown>;


  const title = (scriptMeta.title as string) || "未命名脚本";
  const durationSec = (scriptMeta.duration_seconds as number) || 20;
  const emotionArc = (scriptMeta.emotion_arc as string) || "平静→沉浸→满足";
  const visualStyle = (scriptMeta.visual_style as string) || "";
  const themeResonance = (scriptMeta.theme_resonance as string) || "";
  const oneSentenceStory = (scriptMeta.one_sentence_story as string) || "";
  const narrativeStructure = (scriptMeta.narrative_structure as string) || "顺叙式";
  const constraintsApplied = (scriptMeta.constraints_applied as string[]) || [];

  // 从 shot_breakdown 提取主场景（第一个镜头的 visual_description）
  const mainScene = extractMainSceneFromNewFormat(shotBreakdown);
  // 从 shot_breakdown 提取氛围（综合 emotion_note）
  const atmosphere = extractAtmosphereFromNewFormat(shotBreakdown);

  // 情绪弧线解析：如 "平静→迟疑→专注→笃定"
  const emotionParts = emotionArc.split("→");
  const primaryEmotion = emotionParts[0] || "待分析";
  const secondaryEmotions = emotionParts.slice(1) || ["分析服务暂时不可用"];

  const script: Step3ScriptResult = {
    id: generateUuid(),
    title,
    subtitle: oneSentenceStory,
    durationSec,
    preview: oneSentenceStory,
    content: buildContentFromNewFormatScript(scriptMeta, shotBreakdown),

    mainScene,
    atmosphere,
    scriptStyle: visualStyle,
    shotCount: shotBreakdown.length,
    emotionArc,

    // 情绪分析
    emotionAnalysis: {
      surfaceEmotion: [primaryEmotion],
      deepEmotion: secondaryEmotions,
      emotionConflict: "",
      emotionOutlet: emotionArc,
    },

    // 主题分析
    themeAnalysis: {
      phenomenon: themeResonance,
      underlyingIssue: themeResonance,
      corePainPoint: "",
      valueProposition: "",
      resonanceGroup: "时尚爱好者",
    },

    // 推演结果
    deductionResult: {
      scene: mainScene,
      style: visualStyle || "休闲风格",
      storyLine: narrativeStructure === "顺叙式" ? "开场→发展→转折→收束" : "开场展示→细节呈现→结束",
      characterState: "",
    },

    // 脚本类型与受众
    scriptType: "vlog",
    audienceProfile: "时尚爱好者",
    emotionTone: primaryEmotion,
    theme: themeResonance || "日常穿搭分享",
    scene: mainScene,
    storyLine: narrativeStructure === "顺叙式" ? "开场→发展→转折→收束" : "开场展示→细节呈现→结束",

    // 多样化维度
    diversification: {
      hookType: (technicalSpecs.hook_position_0_3s as string) ? "visual_impact" as HookType : "suspense" as HookType,
      narrativeStructure: (narrativeStructure === "顺叙式" ? "linear" : "interleaved") as NarrativeStructure,
      emotionTone: mapEmotionToToneType(primaryEmotion),
      visualStyle: mapVisualStyle(visualStyle),
      dialogueStyle: "inner_monologue" as DialogueStyleType,
      pacing: "balanced" as PacingType,
      innovationElements: constraintsApplied,
    },

    // 分镜片段 - 从新格式 shot_breakdown 转换
    storyboardSegments: convertNewFormatShotToSegments(shotBreakdown),

    // BGM建议
    bgmSuggestion: {
      style: "轻音乐",
      emotionMatch: primaryEmotion,
      bpm: "中速",
      referenceTracks: [],
      soundEffects: [],
    },

    // 标题建议
    titleSuggestions: [
      { type: "narrative", title },
    ],

    // 话题标签
    hashtags: constraintsApplied.map((c: string) => `#${c}`),

    // 发布建议
    publishSuggestion: {
      bestTime: "晚上20:00",
      targetUser: "时尚爱好者",
      coverSuggestion: "第1镜头",
    },

    // 铁律检查
    ironLawsCheck: {
      passed: true,
      details: {
        noClothingCloseup: true,
        consistency: true,
        strongHook: !!technicalSpecs.hook_position_0_3s,
        properDuration: durationSec >= 15 && durationSec <= 30,
        properShotCount: shotBreakdown.length >= 4 && shotBreakdown.length <= 8,
        aestheticCompliance: true,
      },
      violations: [],
    },

    // 透传原始结构化输出
    rawShotBreakdown: shotBreakdown.length > 0 ? shotBreakdown : undefined,
  };

  return script;
}

/**
 * 从新格式 shot_breakdown 提取主场景
 * 取第一个镜头的 visual_description
 */
function extractMainSceneFromNewFormat(shotBreakdown: Record<string, unknown>[]): string {
  if (shotBreakdown.length === 0) return "待分析";
  const firstShot = shotBreakdown[0];
  const visualDesc = (firstShot.visual_description as string) || "";
  // 从视觉描述中提取场景关键词（取句号分隔的第一句作为场景描述）
  const firstSentence = visualDesc.split(/[。！？]/)[0] || visualDesc;
  return firstSentence || "待分析";
}

/**
 * 从新格式 shot_breakdown 提取氛围
 * 综合所有镜头的 emotion_note
 */
function extractAtmosphereFromNewFormat(shotBreakdown: Record<string, unknown>[]): string {
  const emotionNotes = shotBreakdown
    .map((shot) => (shot.emotion_note as string) || "")
    .filter((note) => note.length > 0);
  return emotionNotes.join("、") || "待分析";
}

/**
 * 从新格式脚本构建 content 字段
 */
function buildContentFromNewFormatScript(
  scriptMeta: Record<string, unknown>,
  shotBreakdown: Record<string, unknown>[],
): string {
  const title = (scriptMeta.title as string) || "未命名脚本";
  const oneSentenceStory = (scriptMeta.one_sentence_story as string) || "";
  const emotionArc = (scriptMeta.emotion_arc as string) || "";
  const durationSeconds = (scriptMeta.duration_seconds as number) || 20;
  const visualStyle = (scriptMeta.visual_style as string) || "";
  const narrativeStructure = (scriptMeta.narrative_structure as string) || "";

  let content = `【脚本标题】${title}\n\n`;
  content += `【一句话故事】${oneSentenceStory}\n\n`;
  content += `【时长】${durationSeconds}秒\n\n`;
  content += `【情绪弧线】${emotionArc}\n\n`;
  content += `【视觉风格】${visualStyle}\n\n`;
  content += `【叙事结构】${narrativeStructure}\n\n`;
  content += `【分镜列表】\n`;

  shotBreakdown.forEach((shot, index) => {
    const visualDesc = (shot.visual_description as string) || "";
    const characterAction = (shot.character_action as string) || "";
    const emotionNote = (shot.emotion_note as string) || "";
    const narrativeStage = (shot.narrative_stage as string) || "";
    content += `\n镜头${index + 1}（${narrativeStage}）：${visualDesc}`;
    if (characterAction) content += `\n动作：${characterAction}`;
    if (emotionNote) content += `\n情绪：${emotionNote}`;
  });

  return content;
}

/**
 * 映射视频类型到脚本类型
 */
function mapVideoType(videoType: string): "drama" | "vlog" | "ootd" | "relationship" | "seasonal" | "travel" {
  const typeMap: Record<string, "drama" | "vlog" | "ootd" | "relationship" | "seasonal" | "travel"> = {
    "剧情/短剧": "drama",
    "日常Vlog": "vlog",
    "氛围感/OOTD": "ootd",
    "情侣/闺蜜/亲子": "relationship",
    "季节/节日/热点": "seasonal",
    "旅行/探店": "travel",
  };
  return typeMap[videoType] || "vlog";
}

/** 将情绪词映射到 EmotionToneType */
function mapEmotionToToneType(emotion: string): EmotionToneType {
  const map: Record<string, EmotionToneType> = {
    "治愈": "healing", "温暖": "healing", "轻松": "healing", "满足": "healing",
    "鼓舞": "inspiring", "振奋": "inspiring", "笃定": "inspiring", "明朗": "inspiring",
    "忧郁": "melancholic", "孤独": "melancholic", "失落": "melancholic",
    "幽默": "humorous", "搞笑": "humorous",
    "安静": "quiet", "平静": "quiet", "迟疑": "quiet",
    "反转": "reversal", "意外": "reversal",
  };
  return map[emotion] || "healing";
}

/** 将视觉风格词映射到 VisualStyleType */
function mapVisualStyle(style: string): VisualStyleType {
  const map: Record<string, VisualStyleType> = {
    "日系清新": "japanese", "日系": "japanese",
    "韩系": "korean", "韩风": "korean",
    "欧美": "western", "街头": "western",
    "中式": "chinese", "国风": "chinese",
    "居家": "homey", "生活纪实": "homey", "自然光影": "homey",
    "都市夜": "urban_night", "城市街景": "urban_night",
  };
  return map[style] || "homey";
}

/**
 * 生成UUID
 */
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


/**
 * 脚本生成阶段入口函数
 * 从数据库获取提示词模板，传入变量进行渲染
 */
export async function generateScripts(
  input: Stage3Input,
  ctx: AppContext,
  routeKey: string,
  userId: string,
  deps: {
    requestLlmPlainText: (systemPrompt: string, userPrompt: string, temperature: number) => Promise<string>;
  },
): Promise<Step3ScriptResult[]> {
  const { hotspotReport, characterReport, characterReference, scriptCount = 2 } = input;

  // 从 input 中提取可选上下文
  const contextData: Parameters<typeof buildScriptGenerationVariables>[4] = {
    outfitDescription: input.outfitDescription,
    matchingReference: input.matchingReference,
    selectedRoleDirection: input.selectedRoleDirection,
  };

  // 直接使用角色性别，禁止推断
  const expectedGender = characterReference?.gender;
  if (!expectedGender || expectedGender === "uncertain") {
    throw new Error(`角色性别未设置（characterReference.gender=${expectedGender ?? "undefined"}），无法生成脚本。请先在定妆步骤设置角色性别。`);
  }

  // 构建角色服饰描述（包含完整角色信息：性别、年龄段、风格、标签等）
  const roleAndOutfitDescription = `${characterReference?.label || ""}
${input.outfitDescription || ""}
${characterReport.clothingStyle.style || ""}
${characterReport.clothingStyle.suitableScenes?.join("、") || ""}`;

  // 构建变量数据（传递结构化参数）
  const variables = buildScriptGenerationVariables(
    roleAndOutfitDescription,
    hotspotReport.rawText || "暂无热点分析报告",
    scriptCount,
    input.clothingStyles as string[] | undefined,
    contextData,
    expectedGender,
  );

  // 从数据库获取提示词模板，传递结构化参数
  const { system, user } = await skillLoader.render(PROMPT_CODE_VIDEO_STEP3_SCRIPT_GENERATION, { variables });

  // UNUSED REMOVED: const MAX_RETRIES = 0; // 禁用重试
  let attempt = 0;

  // 不再重试，只执行一次
  attempt++;

  try {
    const responseText = await deps.requestLlmPlainText(
      system,
      user,
      0.7,
    );

    const scripts = parseScriptGenerationResponse(responseText);

    // 验证并修正性别
    const fixedScripts: Step3ScriptResult[] = [];

    for (const script of scripts) {
      // 验证铁律检查
      if (!script.ironLawsCheck.passed) {
        log.warn({ scriptId: script.id, violations: script.ironLawsCheck.violations }, "[ScriptGeneration] Script failed iron laws check");
      }

      // 验证性别一致性
      const genderValidation = validateGenderConsistency(script, expectedGender);

      if (!genderValidation.passed) {
        log.warn({ scriptId: script.id, violations: genderValidation.violations }, "[ScriptGeneration] Script failed gender check");

        // 尝试自动修正
        const fixedScript = fixGenderInconsistency(script, expectedGender);
        fixedScripts.push(fixedScript);
      } else {
        fixedScripts.push(script);
      }
    }

    return fixedScripts;
  } catch (error) {
    log.error(
      { err: error, routeKey: ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION },
      "Error during generation"
    );
    throw error;
  }
}

/**
 * 策略分档时长/镜头校验配置
 */
const STRATEGY_DURATION_CONFIG: Record<string, { minDuration: number; maxDuration: number; minShots: number; maxShots: number }> = {
  // 故事性策略：20-60s / 4-12 shots
  story_theme:      { minDuration: 20, maxDuration: 60, minShots: 4, maxShots: 12 },
  resonance:        { minDuration: 20, maxDuration: 60, minShots: 4, maxShots: 12 },
  emotion_archetype: { minDuration: 20, maxDuration: 60, minShots: 4, maxShots: 12 },
};

/** 默认校验范围（产品性策略）：15-30s / 4-8 shots */
const DEFAULT_DURATION_CONFIG = { minDuration: 15, maxDuration: 30, minShots: 4, maxShots: 8 };

/**
 * 验证脚本铁律
 */
export function validateIronLaws(script: Step3ScriptResult, strategy?: string): IronLawsCheck {
  const config = (strategy && STRATEGY_DURATION_CONFIG[strategy]) || DEFAULT_DURATION_CONFIG;
  const violations: string[] = [];

  // 检查服装特写（检查 content 和 visualCue 中是否包含"特写"）
  const hasClothingCloseup = script.storyboardSegments.some(
    (seg) => seg.content.includes("特写") || seg.visualCue.toLowerCase().includes("特写"),
  );
  if (hasClothingCloseup) {
    violations.push("存在服装特写镜头");
  }

  // 检查时长（按策略分档）
  if (script.durationSec < config.minDuration || script.durationSec > config.maxDuration) {
    violations.push(`时长${script.durationSec}秒不在${config.minDuration}-${config.maxDuration}秒范围内`);
  }

  // 检查镜头数量（按策略分档）
  const shotCount = script.storyboardSegments.length;
  if (shotCount < config.minShots || shotCount > config.maxShots) {
    violations.push(`镜头数量${shotCount}不在${config.minShots}-${config.maxShots}个范围内`);
  }

  // 检查开场镜头（用 visualCue 判断，因为开场可能是纯视觉无旁白）
  const firstSegment = script.storyboardSegments[0];
  if (!firstSegment || !firstSegment.visualCue) {
    violations.push("缺少开场镜头");
  }

  return {
    passed: violations.length === 0,
    details: {
      noClothingCloseup: !hasClothingCloseup,
      consistency: true, // 一致性需要在实际使用中检查
      strongHook: (firstSegment?.visualCue?.length || 0) > 0,
      properDuration: script.durationSec >= config.minDuration && script.durationSec <= config.maxDuration,
      properShotCount: shotCount >= config.minShots && shotCount <= config.maxShots,
      aestheticCompliance: true, // 审美合规需要在实际使用中检查
    },
    violations,
  };
}

// =====================================================
// 性别一致性验证与修正（SKILL-0328 规范）
// =====================================================

/**
 * 性别一致性验证结果
 */
export interface GenderValidationResult {
  passed: boolean;
  expectedGender: "male" | "female" | "uncertain";
  foundPronouns: {
    male: string[];
    female: string[];
  };
  foundGenderTerms: {
    male: string[];
    female: string[];
  };
  violations: string[];
}

/**
 * 代词和称呼模式常量
 */
const MALE_PATTERNS = {
  pronouns: ["他", "他的", "他是", "他是一名", "他是一个"],
  terms: ["男生", "帅哥", "先生", "男子", "男性", "男孩子", "男孩", "兄弟", "小伙", "男神", "型男", "潮男"],
};

const FEMALE_PATTERNS = {
  pronouns: ["她", "她的", "她是", "她是一名", "她是一个"],
  terms: ["女生", "美女", "女士", "女子", "女性", "女孩子", "女孩", "姐妹", "姑娘", "女神", "小姐姐", "小仙女"],
};

/**
 * 验证脚本中的性别一致性
 * 检查脚本中的代词和称呼词是否与期望性别一致
 */
export function validateGenderConsistency(
  script: Step3ScriptResult,
  expectedGender: "male" | "female" | "uncertain",
): GenderValidationResult {
  const violations: string[] = [];
  const foundMalePronouns: string[] = [];
  const foundFemalePronouns: string[] = [];
  const foundMaleTerms: string[] = [];
  const foundFemaleTerms: string[] = [];

  // 收集脚本所有文本内容
  const allTexts: string[] = [
    script.title,
    script.subtitle,
    script.preview,
    script.content,
    script.storyLine,
    script.audienceProfile,
    script.emotionTone,
    script.theme,
    script.scene,
  ].filter(Boolean);

  // 收集分镜片段中的文本
  for (const segment of script.storyboardSegments) {
    allTexts.push(segment.title, segment.content, segment.visualCue);
    if (segment.emotionNote) {
      allTexts.push(segment.emotionNote);
    }
  }

  // 收集标题建议中的文本
  for (const titleSuggestion of script.titleSuggestions) {
    allTexts.push(titleSuggestion.title);
  }

  // 合并所有文本进行搜索
  const combinedText = allTexts.join(" ");

  // 搜索男性代词
  for (const pronoun of MALE_PATTERNS.pronouns) {
    const regex = new RegExp(pronoun, "g");
    const matches = combinedText.match(regex);
    if (matches) {
      foundMalePronouns.push(pronoun);
    }
  }

  // 搜索女性代词
  for (const pronoun of FEMALE_PATTERNS.pronouns) {
    const regex = new RegExp(pronoun, "g");
    const matches = combinedText.match(regex);
    if (matches) {
      foundFemalePronouns.push(pronoun);
    }
  }

  // 搜索男性称呼词
  for (const term of MALE_PATTERNS.terms) {
    const regex = new RegExp(term, "g");
    const matches = combinedText.match(regex);
    if (matches) {
      foundMaleTerms.push(term);
    }
  }

  // 搜索女性称呼词
  for (const term of FEMALE_PATTERNS.terms) {
    const regex = new RegExp(term, "g");
    const matches = combinedText.match(regex);
    if (matches) {
      foundFemaleTerms.push(term);
    }
  }

  // 检查性别一致性
  if (expectedGender === "male") {
    // 期望是男性，不能出现女性代词或称呼
    if (foundFemalePronouns.length > 0) {
      violations.push(`使用了错误的女性代词: ${[...new Set(foundFemalePronouns)].join(", ")}`);
    }
    if (foundFemaleTerms.length > 0) {
      violations.push(`使用了错误的女性称呼: ${[...new Set(foundFemaleTerms)].join(", ")}`);
    }
  } else if (expectedGender === "female") {
    // 期望是女性，不能出现男性代词或称呼
    if (foundMalePronouns.length > 0) {
      violations.push(`使用了错误的男性代词: ${[...new Set(foundMalePronouns)].join(", ")}`);
    }
    if (foundMaleTerms.length > 0) {
      violations.push(`使用了错误的男性称呼: ${[...new Set(foundMaleTerms)].join(", ")}`);
    }
  }

  return {
    passed: violations.length === 0,
    expectedGender,
    foundPronouns: {
      male: [...new Set(foundMalePronouns)],
      female: [...new Set(foundFemalePronouns)],
    },
    foundGenderTerms: {
      male: [...new Set(foundMaleTerms)],
      female: [...new Set(foundFemaleTerms)],
    },
    violations,
  };
}

/**
 * 修正脚本中的性别错误
 * - 男性角色：将"她"、"女生"、"美女"等替换为"他"、"男生"、"帅哥"
 * - 女性角色：将"他"、"男生"、"帅哥"等替换为"她"、"女生"、"美女"
 */
export function fixGenderInconsistency(
  script: Step3ScriptResult,
  expectedGender: "male" | "female",
): Step3ScriptResult {
  // 深拷贝脚本对象
  const fixedScript = JSON.parse(JSON.stringify(script)) as Step3ScriptResult;

  // 性别替换映射
  const replacements: { from: string; to: string }[] = [];

  if (expectedGender === "male") {
    // 女性代词 → 男性代词
    replacements.push({ from: "她", to: "他" });
    replacements.push({ from: "她的", to: "他的" });
    replacements.push({ from: "她是", to: "他是" });
    // 女性称呼 → 男性称呼
    replacements.push({ from: "女生", to: "男生" });
    replacements.push({ from: "美女", to: "帅哥" });
    replacements.push({ from: "女士", to: "先生" });
    replacements.push({ from: "女子", to: "男子" });
    replacements.push({ from: "女性", to: "男性" });
    replacements.push({ from: "女孩子", to: "男孩子" });
    replacements.push({ from: "女孩", to: "男孩" });
    replacements.push({ from: "姑娘", to: "小伙" });
    replacements.push({ from: "女神", to: "男神" });
    replacements.push({ from: "小姐姐", to: "小哥哥" });
    replacements.push({ from: "小仙女", to: "型男" });
  } else {
    // 男性代词 → 女性代词
    replacements.push({ from: "他", to: "她" });
    replacements.push({ from: "他的", to: "她的" });
    replacements.push({ from: "他是", to: "她是" });
    // 男性称呼 → 女性称呼
    replacements.push({ from: "男生", to: "女生" });
    replacements.push({ from: "帅哥", to: "美女" });
    replacements.push({ from: "先生", to: "女士" });
    replacements.push({ from: "男子", to: "女子" });
    replacements.push({ from: "男性", to: "女性" });
    replacements.push({ from: "男孩子", to: "女孩子" });
    replacements.push({ from: "男孩", to: "女孩" });
    replacements.push({ from: "小伙", to: "姑娘" });
    replacements.push({ from: "男神", to: "女神" });
    replacements.push({ from: "小哥哥", to: "小姐姐" });
    replacements.push({ from: "型男", to: "小仙女" });
  }

  /**
   * 应用替换到字符串
   */
  function applyReplacements(text: string): string {
    let result = text;
    for (const { from, to } of replacements) {
      // 使用全局替换
      result = result.split(from).join(to);
    }
    return result;
  }

  // 应用替换到所有文本字段
  fixedScript.title = applyReplacements(fixedScript.title);
  fixedScript.subtitle = applyReplacements(fixedScript.subtitle);
  fixedScript.preview = applyReplacements(fixedScript.preview);
  fixedScript.content = applyReplacements(fixedScript.content);
  fixedScript.storyLine = applyReplacements(fixedScript.storyLine);
  fixedScript.audienceProfile = applyReplacements(fixedScript.audienceProfile);
  fixedScript.emotionTone = applyReplacements(fixedScript.emotionTone);
  fixedScript.theme = applyReplacements(fixedScript.theme);
  fixedScript.scene = applyReplacements(fixedScript.scene);

  // 应用替换到分镜片段
  for (const segment of fixedScript.storyboardSegments) {
    segment.title = applyReplacements(segment.title);
    segment.content = applyReplacements(segment.content);
    segment.visualCue = applyReplacements(segment.visualCue);
    if (segment.emotionNote) {
      segment.emotionNote = applyReplacements(segment.emotionNote);
    }
  }

  // 应用替换到标题建议
  for (const titleSuggestion of fixedScript.titleSuggestions) {
    titleSuggestion.title = applyReplacements(titleSuggestion.title);
  }

  // 应用替换到情绪分析
  if (fixedScript.emotionAnalysis) {
    fixedScript.emotionAnalysis.emotionConflict = applyReplacements(fixedScript.emotionAnalysis.emotionConflict);
    fixedScript.emotionAnalysis.emotionOutlet = applyReplacements(fixedScript.emotionAnalysis.emotionOutlet);
  }

  // 应用替换到主题分析
  if (fixedScript.themeAnalysis) {
    fixedScript.themeAnalysis.resonanceGroup = applyReplacements(fixedScript.themeAnalysis.resonanceGroup);
  }

  // 应用替换到推演结果
  if (fixedScript.deductionResult) {
    fixedScript.deductionResult.characterState = applyReplacements(fixedScript.deductionResult.characterState);
  }

  return fixedScript;
}