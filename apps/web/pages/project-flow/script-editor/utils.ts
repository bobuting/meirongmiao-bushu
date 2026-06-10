// apps/web/pages/project-flow/script-editor/utils.ts
/**
 * ScriptEditor 工具函数
 */

import { ApiError } from "../../../services/backendApi";
import type { ScriptCandidateViewModel } from "../step3ScriptCandidatesController";
import { buildStep3StructuredScriptCardViewModel } from "../step3StructuredScriptCardViewModel";
import type {
  ScriptSegment,
  TemplateOption,
  Step3PreviewJobRecord,
} from "./types";

// ============================================================================
// 文本处理函数
// ============================================================================

/**
 * 将文本转换为分镜数组
 */
export function textToSegments(text: string): ScriptSegment[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  return lines.map((line, index) => ({
    time: `${index * 3}-${(index + 1) * 3}s`,
    title: `镜头 ${index + 1}`,
    content: line.replace(/^basic:/, ""),
    visualCue: `镜头 ${index + 1} 对应画面提示词`,
    visualPrompt: `镜头 ${index + 1} 对应画面提示词`,
    videoCue: "",
    videoCueTouched: false,
    videoCueInitialized: false,
    sceneImageUrl: null,
    selectedSceneReferenceId: null,
    selectedCharacterReferenceId: null,
    shotSize: "",
    dialogue: "",
    action: "",
    shot_description: "",
  }));
}

/**
 * 合并文本到现有分镜
 */
export function mergeTextToSegments(text: string, previous: ScriptSegment[]): ScriptSegment[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  return lines.map((line, index) => {
    // 解析脚本行：可能是 "旁白：xxx" 或 "画面：xxx" 或纯文本
    const { narration, visual } = splitStep3NarrationAndVisual(line);
    // content 优先使用旁白内容，如果没有旁白则使用原始行
    const resolvedContent = narration || line.replace(/^basic:/, "");
    // visualCue 优先使用已有的画面描述，其次使用解析出的画面内容
    const resolvedVisualCue = previous[index]?.visualCue
      && !previous[index]!.visualCue!.startsWith("镜头 ")
      && previous[index]!.visualCue !== `镜头 ${index + 1} 对应画面提示词`
      ? previous[index]!.visualCue
      : visual || "";

    return {
      time: previous[index]?.time ?? `${index * 3}-${(index + 1) * 3}s`,
      title: previous[index]?.title ?? `镜头 ${index + 1}`,
      content: resolvedContent,
      visualCue: resolvedVisualCue,
      visualPrompt: previous[index]?.visualPrompt ?? resolvedVisualCue,
      videoCue: previous[index]?.videoCue ?? "",
      videoCueTouched: previous[index]?.videoCueTouched === true,
      videoCueInitialized:
        previous[index]?.videoCueInitialized === true ||
        (previous[index]?.videoCue ?? "").trim().length > 0,
      sceneImageUrl: previous[index]?.sceneImageUrl ?? null,
      selectedSceneReferenceId: previous[index]?.selectedSceneReferenceId ?? null,
      selectedCharacterReferenceId: previous[index]?.selectedCharacterReferenceId ?? null,
      shotSize: previous[index]?.shotSize ?? "",
      dialogue: previous[index]?.dialogue ?? "",
      action: previous[index]?.action ?? "",
      shot_description: previous[index]?.shot_description ?? "",
    };
  });
}

/**
 * 移除旁白前缀
 */
export function stripStep3NarrationPrefix(value: string): string {
  return value.replace(/^旁白\s*[:：]\s*/u, "").trim();
}

/**
 * 移除画面前缀
 */
export function stripStep3VisualPrefix(value: string): string {
  return value.replace(/^画面\s*[:：]\s*/u, "").trim();
}

/**
 * 分离旁白和画面
 */
export function splitStep3NarrationAndVisual(text: string): { narration: string; visual: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const narrationLines = lines
    .filter((line) => !/^画面\s*[:：]/u.test(line))
    .map((line) => stripStep3NarrationPrefix(line))
    .filter((line) => line.length > 0);
  const visualLines = lines
    .filter((line) => /^画面\s*[:：]/u.test(line))
    .map((line) => stripStep3VisualPrefix(line))
    .filter((line) => line.length > 0);
  if (narrationLines.length < 1 && lines.length === 1 && !/^画面\s*[:：]/u.test(lines[0] ?? "")) {
    narrationLines.push(stripStep3NarrationPrefix(lines[0] ?? ""));
  }
  return {
    narration: narrationLines.join("\n").trim(),
    visual: visualLines[0] ?? "",
  };
}

/**
 * 组合旁白和画面
 */
export function composeStep3NarrationWithVisual(narration: string, visualCue: string): string {
  const normalizedNarration = narration.trim();
  const normalizedVisual = visualCue.trim();
  if (normalizedNarration.length < 1) {
    return normalizedVisual.length > 0 ? `画面：${normalizedVisual}` : "";
  }
  if (/旁白\s*[:：].*画面\s*[:：]/u.test(normalizedNarration) || /(?:\r?\n)\s*画面\s*[:：]/u.test(normalizedNarration)) {
    return normalizedNarration;
  }
  const narrationLine = /^旁白/u.test(normalizedNarration) ? normalizedNarration : `旁白：${normalizedNarration}`;
  if (normalizedVisual.length < 1) {
    return narrationLine;
  }
  const visualLine = /^画面\s*[:：]/u.test(normalizedVisual) ? normalizedVisual : `画面：${normalizedVisual}`;
  return `${narrationLine}\n${visualLine}`.trim();
}

/**
 * 解析主要提示词
 * 优先返回 visualCue（画面描述，来自 shot_description）
 * 如果 content 和 visualCue 相同，直接返回 visualCue
 */
export function resolveStep3MainPrompt(content: string, visualCue: string, visualPrompt?: string | null): string {
  const normalizedContent = content.trim();
  const normalizedVisualCue = visualCue.trim();
  const normalizedVisualPrompt = typeof visualPrompt === "string" ? visualPrompt.trim() : "";

  // visualPrompt 有独立值且与 visualCue 不同，使用它
  if (normalizedVisualPrompt.length > 0 && normalizedVisualPrompt !== normalizedVisualCue) {
    if (/^画面\s*[:：]/u.test(normalizedVisualPrompt) ||
        (normalizedVisualPrompt.includes("\n") && !/^旁白\s*[:：]/u.test(normalizedVisualPrompt))) {
      return normalizedVisualPrompt;
    }
  }

  // 优先返回 visualCue（画面描述）
  if (normalizedVisualCue.length > 0) {
    return normalizedVisualCue;
  }

  // 回退：使用 content
  return normalizedContent;
}

/**
 * 应用主要提示词到分镜
 */
export function applyStep3MainPromptToSegment(segment: ScriptSegment, rawValue: string): ScriptSegment {
  const value = rawValue.trim();
  if (value.length < 1) {
    return {
      ...segment,
      visualCue: rawValue,
      visualPrompt: rawValue,
    };
  }
  const hasStructuredPrompt = /^旁白\s*[:：]/u.test(value) || /(?:^|\r?\n)\s*画面\s*[:：]/u.test(value);
  if (!hasStructuredPrompt) {
    return {
      ...segment,
      visualCue: rawValue,
      visualPrompt: rawValue,
    };
  }
  const currentSplit = splitStep3NarrationAndVisual(segment.content);
  const nextSplit = splitStep3NarrationAndVisual(value);
  const nextNarration = nextSplit.narration || currentSplit.narration;
  const nextVisual = nextSplit.visual || stripStep3VisualPrefix(segment.visualCue);
  const nextContent = composeStep3NarrationWithVisual(nextNarration, nextVisual);
  const nextVisualCue = nextVisual.length > 0 ? `画面：${nextVisual}` : segment.visualCue;
  return {
    ...segment,
    content: nextContent || segment.content,
    visualCue: nextVisualCue,
    visualPrompt: nextContent || rawValue,
  };
}

/**
 * 分割候选旁白行
 */
export function splitCandidateNarrationLines(text: string): string[] {
  const normalizeLine = (line: string): string =>
    line
      .replace(/^镜头\s*\d+\s*[:：-]?\s*/u, "")
      .replace(/^(?:[-*•·]|\d+[.)、]|[（(]?\d+[）)])\s*/u, "")
      .replace(/^旁白\s*[:：]\s*/u, "")
      .trim();
  const shouldSkipLine = (line: string): boolean =>
    /^(?:#\s*热榜元数据|视频主题|视频简介|场景设定|主场景|辅助场景|时间|天气|氛围|抖音标题|封面文案|角色设定表|服装设定表|分镜表)\b/u.test(
      line,
    );
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0 && !shouldSkipLine(line));
  const baseLines = rawLines.length > 0 ? rawLines : [normalizeLine(text)].filter((line) => line.length > 0);
  const sentenceLines = baseLines.flatMap((line) => {
    const chunks = line
      .split(/(?<=[。！？!?；;])/u)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
    return chunks.length > 0 ? chunks : [line];
  });
  return sentenceLines.slice(0, 12);
}

/**
 * 标准化候选确认响应分镜
 */
export function normalizeCandidateConfirmResponseSegments(raw: unknown, previous: ScriptSegment[]): ScriptSegment[] | null {
  if (!Array.isArray(raw) || raw.length < 1) {
    return null;
  }
  const normalized = raw
    .map((item, index) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
      const content = typeof record?.content === "string" ? record.content.trim() : "";
      const rawVisualCue =
        typeof record?.visualCue === "string" && record.visualCue.trim().length > 0
          ? record.visualCue.trim()
          : "";
      // content 和 visualCue 都为空时才过滤掉
      if (!content && !rawVisualCue) {
        return null;
      }
      const title =
        typeof record?.title === "string" && record.title.trim().length > 0
          ? record.title.trim()
          : previous[index]?.title ?? `镜头 ${index + 1}`;
      const visualCue = rawVisualCue || previous[index]?.visualCue || (content ? `画面：${content.slice(0, 56)}` : "");
      const visualPrompt =
        typeof record?.visualPrompt === "string" && record.visualPrompt.trim().length > 0
          ? record.visualPrompt.trim()
          : "";
      const shotSize =
        typeof record?.shotSize === "string" && record.shotSize.trim().length > 0
          ? record.shotSize.trim()
          : previous[index]?.shotSize ?? "";
      const dialogue =
        typeof record?.dialogue === "string" && record.dialogue.trim().length > 0
          ? record.dialogue.trim()
          : previous[index]?.dialogue ?? "";
      const action =
        typeof record?.action === "string" && record.action.trim().length > 0
          ? record.action.trim()
          : previous[index]?.action ?? "";
      // shot_description 从 visualCue（数据库字段）提取
      const shot_description =
        typeof record?.shot_description === "string" && record.shot_description.trim().length > 0
          ? record.shot_description.trim()
          : rawVisualCue;  // 回退使用 visualCue（即 shot_description）
      // 当 content 和 visualCue 相同时（来自 shot_description），不组合，直接用 visualCue
      // 当 content 和 visualCue 不同时，才组合旁白和画面
      const isDuplicateContent = content.length > 0 && rawVisualCue.length > 0 && content === rawVisualCue;
      const mergedContent = isDuplicateContent
        ? ""  // content 和 visualCue 相同，不组合，后续会直接用 visualCue
        : content.length > 0
          ? composeStep3NarrationWithVisual(content, visualCue)
          : "";
      return {
        time: previous[index]?.time ?? `${index * 3}-${(index + 1) * 3}s`,
        title,
        content: mergedContent.length > 0 ? mergedContent : content,
        visualCue,
        visualPrompt: resolveStep3MainPrompt(mergedContent.length > 0 ? mergedContent : content, visualCue, visualPrompt),
        videoCue: previous[index]?.videoCue ?? "",
        videoCueTouched: previous[index]?.videoCueTouched === true,
        videoCueInitialized:
          previous[index]?.videoCueInitialized === true ||
          (previous[index]?.videoCue ?? "").trim().length > 0,
        sceneImageUrl: previous[index]?.sceneImageUrl ?? null,
        selectedSceneReferenceId: previous[index]?.selectedSceneReferenceId ?? null,
        selectedCharacterReferenceId: previous[index]?.selectedCharacterReferenceId ?? null,
        shotSize,
        dialogue,
        action,
        shot_description,  // 分镜概要（数据库字段名）
      } as ScriptSegment;
    })
    .filter((item): item is ScriptSegment => item !== null);
  return normalized.length > 0 ? normalized : null;
}

/**
 * 从候选解析分镜
 * 只使用 storyboardSegments，不再 fallback 到 content 解析
 */
export function resolveStep3SegmentsFromCandidate(
  candidate: ScriptCandidateViewModel,
  previous: ScriptSegment[],
  confirmedSegments?: unknown,
): ScriptSegment[] {
  const responseSegments = normalizeCandidateConfirmResponseSegments(confirmedSegments, previous);
  if (responseSegments) {
    return responseSegments;
  }
  const candidateSegments = normalizeCandidateConfirmResponseSegments(candidate.storyboardSegments, previous);
  if (candidateSegments) {
    return candidateSegments;
  }
  // 无 storyboardSegments 时返回空数组
  return [];
}

/**
 * 分割旁白块
 */
export function splitNarrationBlocks(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }
  const sentenceLike = text
    .split(/[。！？!?；;]/)
    .map((line) => line.trim())
    .filter(Boolean);
  return sentenceLike.length > 0 ? sentenceLike : lines;
}

/**
 * 从旁白构建分镜
 */
export function buildSegmentsFromNarration(text: string, previous: ScriptSegment[]): ScriptSegment[] {
  const blocks = splitNarrationBlocks(text);
  if (blocks.length === 0) {
    return [];
  }
  const isPlaceholderCue = (cue: string | undefined, index: number) => {
    const normalized = (cue ?? "").trim();
    if (!normalized) return true;
    return normalized === `镜头 ${index + 1} 画面提示词` || normalized === `镜头 ${index + 1} 对应画面提示词`;
  };
  return blocks.map((block, index) => ({
    time: previous[index]?.time ?? `${index * 3}-${(index + 1) * 3}s`,
    title: previous[index]?.title ?? `镜头 ${index + 1}`,
    content: block.replace(/^basic:/, ""),
    visualCue:
      !isPlaceholderCue(previous[index]?.visualCue, index)
        ? (previous[index]?.visualCue ?? "")
        : block.replace(/^basic:/, ""),
    visualPrompt:
      !isPlaceholderCue(previous[index]?.visualPrompt ?? previous[index]?.visualCue, index)
        ? (previous[index]?.visualPrompt ?? previous[index]?.visualCue ?? "")
        : block.replace(/^basic:/, ""),
    videoCue: previous[index]?.videoCue ?? "",
    videoCueTouched: previous[index]?.videoCueTouched === true,
    videoCueInitialized:
      previous[index]?.videoCueInitialized === true ||
      (previous[index]?.videoCue ?? "").trim().length > 0,
    sceneImageUrl: previous[index]?.sceneImageUrl ?? null,
    selectedSceneReferenceId: previous[index]?.selectedSceneReferenceId ?? null,
    selectedCharacterReferenceId: previous[index]?.selectedCharacterReferenceId ?? null,
    shotSize: previous[index]?.shotSize ?? "",
    dialogue: previous[index]?.dialogue ?? "",
    action: previous[index]?.action ?? "",
    shot_description: previous[index]?.shot_description ?? "",
  }));
}

/**
 * 构建导入分镜候选
 */
export function buildStep3ImportedStoryboardCandidate(input: {
  readonly sourceLibraryId: string;
  readonly title: string;
  readonly segments: ScriptSegment[];
}): ScriptCandidateViewModel {
  const title = input.title.trim() || "导入分镜";
  const storyboardSegments = input.segments.map((segment, index) => ({
    title: segment.title?.trim() || `镜头 ${index + 1}`,
    content: segment.content?.trim() || (segment.visualCue?.trim().length ? `画面：${segment.visualCue.trim()}` : ""),
    visualCue: segment.visualCue?.trim() || segment.content?.trim() || `镜头 ${index + 1} 画面`,
  }));
  const mergedText = storyboardSegments
    .map((segment) => segment.content.trim())
    .filter((item) => item.length > 0)
    .join("\n")
    .trim();
  const durationSec = Math.max(12, Math.min(30, Math.max(1, storyboardSegments.length) * 3));
  const preview = storyboardSegments
    .map((segment) => segment.content.trim())
    .find((line) => line.length > 0) ?? "已导入分镜";
  const candidateId = `imported-storyboard-${(input.sourceLibraryId || "local")
    .replace(/[^a-zA-Z0-9_-]/g, "") || "local"}`;
  const content = mergedText.length > 0 ? mergedText : preview;
  return {
    id: candidateId,
    candidateId,
    source: "premium",
    strategyType: "library",
    title,
    subtitle: "导入分镜",
    durationSec,
    preview,
    content,
    suitability: "high",
    tags: ["导入分镜"],
    rank: 1,
    sourceScriptId: input.sourceLibraryId || undefined,
    storyboardSegments,
    structuredCard: buildStep3StructuredScriptCardViewModel({
      source: "premium",
      title,
      subtitle: "导入分镜",
      durationSec,
      storyboardCount: storyboardSegments.length || 1,
      preview,
      content,
    }),
  };
}

/**
 * 合并候选数据流
 * 新数据前置：incoming 中的新候选排在前面，已有数据保持原顺序在后
 */
export function mergeStep3CandidateFeed(
  incoming: readonly ScriptCandidateViewModel[],
  previous: readonly ScriptCandidateViewModel[],
): ScriptCandidateViewModel[] {
  // 先收集已有数据的 key
  const existingKeys = new Set<string>();
  for (const candidate of previous) {
    const key = buildStep3CandidateFeedIdentity(candidate);
    if (key) {
      existingKeys.add(key);
    }
  }

  // 新数据前置，已有数据保持原顺序在后
  const newCandidates: ScriptCandidateViewModel[] = [];
  for (const candidate of incoming) {
    const key = buildStep3CandidateFeedIdentity(candidate);
    if (key && !existingKeys.has(key)) {
      newCandidates.push(candidate);
    }
  }
  return [...newCandidates, ...previous];
}

/**
 * 构建候选唯一标识
 */
export function buildStep3CandidateFeedIdentity(candidate: ScriptCandidateViewModel): string {
  const sourceScriptId = typeof candidate.sourceScriptId === "string" ? candidate.sourceScriptId.trim() : "";
  if (sourceScriptId) {
    return `${candidate.strategyType}::source-script::${sourceScriptId}`;
  }
  const sourceUrl = typeof candidate.sourceUrl === "string" ? candidate.sourceUrl.trim() : "";
  if (sourceUrl) {
    return `${candidate.strategyType}::source-url::${sourceUrl}`;
  }
  const normalizedTitle = candidate.title.trim().replace(/\s+/g, " ");
  const normalizedPreview = (candidate.preview ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const normalizedContent = candidate.content.trim().replace(/\s+/g, " ").slice(0, 160);
  return `${candidate.strategyType}::fallback::${normalizedTitle}::${normalizedPreview}::${normalizedContent}`;
}

// ============================================================================
// 预览候选函数
// ============================================================================

/**
 * 标准化预览候选 URL
 */
export function normalizeStep3PreviewCandidateUrls(candidates: readonly string[]): string[] {
  const output: string[] = [];
  for (const raw of candidates) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length < 1) {
      continue;
    }
    if (!output.includes(value)) {
      output.push(value);
    }
  }
  return output.slice(0, 8);
}

// ============================================================================
// 持久化函数
// ============================================================================

/**
 * 标准化持久化的预览候选
 */
export function normalizePersistedStep3PreviewCandidatesByFrame(input: unknown): Record<number, string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output: Record<number, string[]> = {};
  for (const [rawFrameIndex, rawCandidates] of Object.entries(input)) {
    const frameIndex = Number(rawFrameIndex);
    if (!Number.isInteger(frameIndex) || frameIndex < 1 || !Array.isArray(rawCandidates)) {
      continue;
    }
    const normalizedCandidates = normalizeStep3PreviewCandidateUrls(rawCandidates as string[]);
    if (normalizedCandidates.length > 0) {
      output[frameIndex] = normalizedCandidates;
    }
  }
  return output;
}

/**
 * 标准化持久化的预览任务
 */
export function normalizePersistedStep3PreviewJobsByFrame(input: unknown): Record<number, Step3PreviewJobRecord> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output: Record<number, Step3PreviewJobRecord> = {};
  for (const [rawFrameIndex, rawValue] of Object.entries(input)) {
    const frameIndex = Number(rawFrameIndex);
    if (!Number.isInteger(frameIndex) || frameIndex < 1 || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      continue;
    }
    const record = rawValue as Record<string, unknown>;
    const jobId = String(record.jobId ?? "").trim();
    if (!jobId) {
      continue;
    }
    const statusRaw = String(record.status ?? "").trim();
    const status: "running" | "succeeded" | "failed" =
      statusRaw === "succeeded" || statusRaw === "failed"
        ? statusRaw
        : "running";
    const updatedAtRaw = Number(record.updatedAt);
    const updatedAt = Number.isFinite(updatedAtRaw) ? Math.max(0, Math.floor(updatedAtRaw)) : 0;
    const errorMessageRaw = record.errorMessage;
    const errorMessage =
      typeof errorMessageRaw === "string" ? errorMessageRaw.trim() || null : null;
    output[frameIndex] = {
      jobId,
      status,
      startedAt: 0,
      updatedAt,
      imageUrl: null,
      error: null,
      ...(errorMessage !== null ? { errorMessage } : {}),
    };
  }
  return output;
}

/**
 * 序列化预览任务用于项目数据
 */
export function serializeStep3PreviewJobsByFrameForProjectData(
  input: Record<number, Step3PreviewJobRecord>,
): Record<string, Step3PreviewJobRecord> {
  const entries = Object.entries(input)
    .map(([rawFrameIndex, rawJob]) => {
      const frameIndex = Number(rawFrameIndex);
      if (!Number.isInteger(frameIndex) || frameIndex < 1) {
        return null;
      }
      if (!rawJob || typeof rawJob !== "object") {
        return null;
      }
      const jobId = String(rawJob.jobId ?? "").trim();
      if (!jobId) {
        return null;
      }
      const statusRaw = String(rawJob.status ?? "").trim();
      const status: "running" | "succeeded" | "failed" =
        statusRaw === "succeeded" || statusRaw === "failed"
          ? statusRaw
          : "running";
      const updatedAtRaw = Number(rawJob.updatedAt);
      const updatedAt = Number.isFinite(updatedAtRaw) ? Math.max(0, Math.floor(updatedAtRaw)) : 0;
      const errorMessageRaw = rawJob.errorMessage;
      const errorMessage =
        typeof errorMessageRaw === "string" ? errorMessageRaw.trim() || null : null;
      return [
        String(frameIndex),
        {
          jobId,
          status,
          startedAt: 0,
          updatedAt,
          imageUrl: null,
          error: null,
          ...(errorMessage !== null ? { errorMessage } : {}),
        } as Step3PreviewJobRecord,
      ] as [string, Step3PreviewJobRecord];
    })
    .filter((item: [string, Step3PreviewJobRecord] | null): item is [string, Step3PreviewJobRecord] => item !== null)
    .sort((left, right) => Number(left[0]) - Number(right[0]));
  return Object.fromEntries(entries);
}

/**
 * 序列化预览候选用于项目数据
 */
export function serializeStep3PreviewCandidatesByFrameForProjectData(input: Record<number, string[]>): Record<string, string[]> {
  const entries = Object.entries(input)
    .map(([rawFrameIndex, rawCandidates]) => {
      const frameIndex = Number(rawFrameIndex);
      if (!Number.isInteger(frameIndex) || frameIndex < 1) {
        return null;
      }
      const normalizedCandidates = normalizeStep3PreviewCandidateUrls(rawCandidates);
      if (normalizedCandidates.length < 1) {
        return null;
      }
      return [String(frameIndex), normalizedCandidates] as const;
    })
    .filter((item): item is readonly [string, string[]] => Boolean(item))
    .sort((left, right) => Number(left[0]) - Number(right[0]));
  return Object.fromEntries(entries);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析保存标题
 */
export function resolveStep3SaveTitle(text: string, projectName: string | null, clueTitle: string | null): string {
  const cleanClueTitle = (clueTitle ?? "").trim();
  if (cleanClueTitle.length > 0) {
    return cleanClueTitle.slice(0, 64);
  }
  const cleanProjectName = (projectName ?? "").trim();
  if (cleanProjectName.length > 0) {
    return `${cleanProjectName} · 完整口播`.slice(0, 64);
  }
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "完整口播脚本";
  return firstLine.slice(0, 64);
}

/**
 * 检查是否应该在首次主提示词填充时同步视频提示
 */
export function shouldSyncVideoCueOnFirstMainPromptFill(segment: ScriptSegment): boolean {
  if (segment.videoCueInitialized === true) {
    return false;
  }
  const currentVideoCue = typeof segment.videoCue === "string" ? segment.videoCue.trim() : "";
  return currentVideoCue.length < 1;
}

// ============================================================================
// 常量
// ============================================================================

export const HOT_TEMPLATES: TemplateOption[] = [
  { id: "brand-story", title: "品牌故事片", subtitle: "品牌价值 + 情感共鸣 + 软性植入" },
  { id: "daily-vlog", title: "生活Vlog风", subtitle: "沉浸式体验 + 软植入" },
  { id: "asmr-showcase", title: "纯展示 ASMR", subtitle: "视觉听觉双重刺激" },
];

export const WRITING_STYLE_OPTIONS = ["温柔知性", "犀利种草", "专业讲解", "情绪共鸣"];