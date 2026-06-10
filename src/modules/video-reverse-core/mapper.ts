/**
 * 输出映射层 - 将核心管道输出 CoreReverseOutput 转换为各入口点特定格式
 *
 * 设计原则 (per D-03):
 * - 所有映射器为纯函数，无副作用
 * - 无 async/await/外部调用
 * - 输入 → 转换 → 输出
 *
 * 映射关系 (per D-08, D-09):
 * - BatchSyncMapper: CoreReverseOutput → LlmReverseResult（批量入库格式）
 * - CloneMapper: CoreReverseOutput → SingleVideoReverseResult（脚本库格式）
 * - SquareRouteMapper: 占位，返回 NOT_IMPLEMENTED (per D-06, D-07)
 */

import type { CoreReverseOutput } from "./types.js";
import type { LlmReverseOutput } from "./normalize-output.js";

// ============================================================================
// 输入接口定义 (per D-04 最小参数设计)
// ============================================================================

/**
 * BatchSyncMapper 输入接口
 * 包含核心管道输出 + 入口特定元数据
 */
export interface BatchSyncMapperInput {
  /** 核心管道输出 */
  coreOutput: CoreReverseOutput;
  /** 入口特定：去重键（如 "video:穿搭教程"） */
  videoKey: string;
  /** 入口特定：视频标题 */
  videoTitle: string;
  /** 入口特定：排名 */
  rank: number;
  /** 入口特定：原始 URL */
  sourceUrl: string;
  /** 入口特定：OSS 上传结果 */
  ossUrl: string | null;
}

/**
 * CloneMapper 输入接口
 * 包含核心管道输出 + 入口特定工具函数
 */
export interface CloneMapperInput {
  /** 核心管道输出 */
  coreOutput: CoreReverseOutput;
  /** 入口特定：解析后的视频 URL */
  videoUrl: string;
  /** 入口特定：OSS 公开链接 */
  ossUrl: string | null;
  /** 入口特定：ID 生成函数 */
  generateId: () => string;
  /** 入口特定：时间戳函数 */
  now: () => number;
}

// ============================================================================
// 输出类型定义（与现有类型保持一致）
// ============================================================================

/**
 * LLM 反推结果 - 批量入库格式
 * 与 sync-service.ts LlmReverseResult 保持一致
 */
interface LlmReverseResult {
  /** 去重键，如 "video:穿搭教程" */
  videoKey: string;
  /** 视频标题 */
  videoTitle: string;
  /** 排名 */
  rank: number;
  /** 视频URL */
  sourceUrl: string;
  /** OSS 公开 URL（异步上传结果） */
  ossUrl: string | null;
  /** 状态 */
  status: "success" | "failed";
  /** 标准化后的 LLM 输出 */
  output: LlmReverseOutput | null;
  /** 错误码 */
  errorCode: string | null;
  /** 错误信息 */
  errorMessage: string | null;
}

/**
 * 单视频反推结果 section 类型
 * 与 single-reverse-service.ts SingleVideoReverseResultSection 保持一致
 */
interface SingleVideoReverseResultSection {
  id: string;
  order: number;
  title: string;
  content: string;
}

/**
 * 单视频反推结果 frame 类型
 * 与 single-reverse-service.ts SingleVideoReverseResultFrame 保持一致
 */
interface SingleVideoReverseResultFrame {
  index: number;
  time: string | null;
  title: string;
  narration: string;
  visualCue: string;
}

/**
 * 单视频反推结果 - 脚本库格式
 * 与 single-reverse-service.ts SingleVideoReverseResult 保持一致
 */
interface SingleVideoReverseResult {
  id: string;
  projectId: string | null;
  input: string;
  status: string;
  scriptVersionId: string | null;
  libraryScriptId: string | null;
  reverseStoryboardLibraryId: string | null;
  /** 原始 LLM 反推输出 */
  rawLlmOutput: LlmReverseOutput | null;
  storyboardPanel: {
    source: {
      sourceType: "video_url";
      videoUrl: string;
      filename: string | null;
      mimeType: string | null;
      duration: number | null;
    };
    report: {
      intro: string | null;
      sections: SingleVideoReverseResultSection[];
      frames: SingleVideoReverseResultFrame[];
      rawMarkdown: string;
      hasStructuredSections: boolean;
    };
    diagnostics: unknown;
    raw: unknown;
  } | null;
  libraryScript: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    date: number;
  } | null;
  resolvedVideoUrl: string;
  /** OSS 公开链接 */
  ossUrl: string | null;
  fallback: boolean;
  code: string | undefined;
  message: string | undefined;
  inputMode: "video_url";
  scriptHints: {
    source: string;
    overviews: string[];
    itemCount: number;
    primaryItem: {
      url: string;
      title: string;
      videoUrl: string;
      audioUrl: string | null;
      createTime: number | null;
      playCount: number | null;
      commentCount: number | null;
      diggCount: number | null;
      shareCount: number | null;
      collectCount: number | null;
      recommendCount: number | null;
      nickname: string | null;
      duration: number | null;
      scriptText: string;
    };
  } | null;
}

// ============================================================================
// 映射函数实现 (per D-03, D-05, D-08)
// ============================================================================

/**
 * 将核心管道输出映射为批量入库格式
 * 纯函数，无副作用 (per D-03)
 * 错误码直接映射，不做额外转换 (per D-05, D-08)
 */
export function mapToBatchResult(input: BatchSyncMapperInput): LlmReverseResult {
  if (!input.coreOutput.success) {
    // 错误情况：直接映射 errorCode 和 errorMessage
    return {
      videoKey: input.videoKey,
      videoTitle: input.videoTitle,
      rank: input.rank,
      sourceUrl: input.sourceUrl,
      ossUrl: input.ossUrl,
      status: "failed",
      output: null,
      errorCode: input.coreOutput.errorCode,
      errorMessage: input.coreOutput.errorMessage,
    };
  }

  // 成功情况：标准化输出类型转换
  const output = input.coreOutput.rawLlmOutput as LlmReverseOutput;
  return {
    videoKey: input.videoKey,
    videoTitle: input.videoTitle,
    rank: input.rank,
    sourceUrl: input.sourceUrl,
    ossUrl: input.ossUrl,
    status: "success",
    output: output,
    errorCode: null,
    errorMessage: null,
  };
}

/**
 * 将核心管道输出映射为复刻按钮结果格式
 * 复用 mapLlmReverseToResult 的转换逻辑，但使用最小参数设计
 * 纯函数，无副作用 (per D-03)
 */
export function mapToCloneResult(input: CloneMapperInput): SingleVideoReverseResult {
  // 错误情况：构建错误结果结构
  if (!input.coreOutput.success) {
    return {
      id: input.generateId(),
      projectId: null,
      input: input.videoUrl,
      status: "failed",
      scriptVersionId: null,
      libraryScriptId: null,
      reverseStoryboardLibraryId: null,
      rawLlmOutput: null,
      storyboardPanel: null,
      libraryScript: null,
      resolvedVideoUrl: input.coreOutput.resolvedVideoUrl,
      ossUrl: input.ossUrl,
      fallback: false,
      code: input.coreOutput.errorCode ?? "UNKNOWN",
      message: input.coreOutput.errorMessage ?? "未知错误",
      inputMode: "video_url",
      scriptHints: null,
    };
  }

  // 成功情况：复用 existing transformation logic
  const output = input.coreOutput.rawLlmOutput as LlmReverseOutput;

  // 提取嵌套结构 (from single-reverse-service.ts pattern)
  const videoInfo = (output.video_info ?? {}) as unknown as Record<string, unknown>;
  const editingAnalysis = (output.editing_analysis ?? {}) as unknown as Record<string, unknown>;
  const shotBreakdown = Array.isArray(output.shot_breakdown) ? output.shot_breakdown : [];

  // ---- frames: shot_breakdown → 分镜帧 ----
  const frames: SingleVideoReverseResultFrame[] = shotBreakdown.map(
    (shot: unknown, idx: number) => {
      const s = (shot ?? {}) as unknown as Record<string, unknown>;
      const basicInfo = (s.basic_info ?? {}) as unknown as Record<string, unknown>;
      const visualAnalysis = (s.visual_analysis ?? {}) as unknown as Record<string, unknown>;
      const subjectAnalysis = (s.subject_analysis ?? {}) as unknown as Record<string, unknown>;

      return {
        index: idx + 1,
        time: typeof basicInfo.timestamp === "string" ? String(basicInfo.timestamp) : null,
        title: String(s.description ?? "").trim() || `镜头 ${idx + 1}`,
        narration: String(s.description ?? "").trim(),
        visualCue: [
          typeof visualAnalysis.scene === "string" ? visualAnalysis.scene : null,
          String(basicInfo.shot_size ?? ""),
          typeof subjectAnalysis.clothing === "string" ? subjectAnalysis.clothing : null,
        ].filter((v): v is string => typeof v === "string" && v.length > 0).join("；"),
      };
    },
  );

  // ---- sections: video_info + editing_analysis → 5 个标准 section ----
  const sections: SingleVideoReverseResultSection[] = [
    {
      id: "positioning",
      order: 1,
      title: "内容主题与人设定位",
      content: [
        videoInfo.theme,
        videoInfo.video_type,
        videoInfo.video_style,
        videoInfo.target_audience,
      ].filter((v): v is string => typeof v === "string" && v.length > 0).join("；"),
    },
    {
      id: "rhythm",
      order: 2,
      title: "叙事结构与镜头节奏",
      content: [
        editingAnalysis.rhythm_description,
        editingAnalysis.pace ? `节奏：${editingAnalysis.pace}` : null,
        editingAnalysis.editing_style ? `剪辑风格：${editingAnalysis.editing_style}` : null,
        editingAnalysis.total_shots ? `总镜头数：${editingAnalysis.total_shots}` : null,
        editingAnalysis.average_shot_duration ? `平均镜头时长：${editingAnalysis.average_shot_duration}s` : null,
      ].filter((v): v is string => typeof v === "string" && v.length > 0).join("；"),
    },
    {
      id: "hook",
      order: 3,
      title: "爆点拆解",
      content: Array.isArray(videoInfo.key_elements)
        ? videoInfo.key_elements.filter((v): v is string => typeof v === "string").join("；")
        : "",
    },
    {
      id: "replica",
      order: 4,
      title: "可复刻脚本（含分镜建议）",
      content: shotBreakdown.map((shot: unknown, idx: number) => {
        const s = (shot ?? {}) as unknown as Record<string, unknown>;
        return `[镜头${idx + 1}] ${String(s.description ?? "")}`;
      }).join("\n"),
    },
    {
      id: "optimization",
      order: 5,
      title: "可执行优化建议",
      content: (() => {
        const emotions = (videoInfo.emotions ?? {}) as unknown as Record<string, unknown>;
        return String(emotions.curve ?? "").trim();
      })(),
    },
  ];

  // ---- intro ----
  const intro = typeof videoInfo.summary === "string" ? videoInfo.summary : null;

  // ---- libraryScript ----
  const scriptContent = shotBreakdown.map((shot: unknown, idx: number) => {
    const s = (shot ?? {}) as unknown as Record<string, unknown>;
    return `[镜头${idx + 1}] ${String(s.description ?? "")}`;
  }).join("\n");

  const scriptTitle = String(videoInfo.theme || videoInfo.summary || "视频反推").trim();

  // 从 hot_trend_labels 提取 tags
  const tags = (output.hot_trend_labels?.labels ?? [])
    .map((label: string) => `#${String(label).trim().replace(/^#/, "")}`)
    .concat(["#热榜反推"]);

  return {
    id: input.generateId(),
    projectId: null,
    input: input.videoUrl,
    status: "success",
    scriptVersionId: null,
    libraryScriptId: null,
    reverseStoryboardLibraryId: null,
    rawLlmOutput: output,
    storyboardPanel: {
      source: {
        sourceType: "video_url",
        videoUrl: input.videoUrl,
        filename: null,
        mimeType: null,
        duration: typeof videoInfo.duration_seconds === "number" ? videoInfo.duration_seconds : null,
      },
      report: {
        intro,
        sections,
        frames,
        rawMarkdown: JSON.stringify(output),
        hasStructuredSections: true,
      },
      diagnostics: null,
      raw: output,
    },
    libraryScript: {
      id: input.generateId(),
      title: scriptTitle,
      content: scriptContent,
      tags,
      date: input.now(),
    },
    resolvedVideoUrl: input.coreOutput.resolvedVideoUrl,
    ossUrl: input.ossUrl,
    fallback: false,
    code: undefined,
    message: undefined,
    inputMode: "video_url",
    scriptHints: {
      source: "llm_reverse",
      overviews: typeof videoInfo.summary === "string" ? [videoInfo.summary] : [],
      itemCount: shotBreakdown.length,
      primaryItem: {
        url: input.videoUrl,
        title: scriptTitle,
        videoUrl: input.videoUrl,
        audioUrl: null,
        createTime: null,
        playCount: null,
        commentCount: null,
        diggCount: null,
        shareCount: null,
        collectCount: null,
        recommendCount: null,
        nickname: null,
        duration: typeof videoInfo.duration_seconds === "number" ? videoInfo.duration_seconds : null,
        scriptText: scriptContent,
      },
    },
  };
}

// ============================================================================
// SquareRouteMapper 占位实现 (per D-06, D-07)
// ============================================================================

/**
 * 广场路由输出映射器 — 占位实现
 * STATUS: NOT_IMPLEMENTED
 * 原因：与 Phase 2 SquareRouteAdapter NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH 状态保持对称 (per D-06, D-07)
 * Phase 4 整合时处理
 */
export function mapToSquareResult(_coreOutput: CoreReverseOutput): Record<string, unknown> {
  return {
    status: "error",
    code: "NOT_IMPLEMENTED",
    message: "SquareRouteMapper not implemented - Phase 4 integration required",
    resolvedVideoUrl: _coreOutput.resolvedVideoUrl,
    fallback: false,
  };
}

/**
 * 标记常量（用于类型检查和文档追踪）
 * 与 SQUARE_ROUTE_ADAPTER_STATUS 保持对称 (per D-07)
 */
export const SQUARE_ROUTE_MAPPER_STATUS = "NOT_IMPLEMENTED";

/**
 * 占位原因说明
 */
export const SQUARE_ROUTE_MAPPER_REASON =
  "SquareRouteAdapter is NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH (Phase 2); " +
  "mapper deferred to Phase 4 integration";