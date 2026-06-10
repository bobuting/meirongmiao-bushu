/**
 * video-scene-detection.ts
 *
 * ffmpeg 场景检测 + 确定性数学分镜算法。
 * 替代 LLM 视频理解，完全确定性，零 AI 调用。
 */

import ffmpegStatic from "ffmpeg-static";
import { executeCommand, getVideoDuration, getVideoFps } from "./video-split.js";
import type { ActionSegment } from "../contracts/outfit-change-contract.js";
import { AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("video-scene-detection");

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 单段最大时长（秒），Kling Omni-Video 上限 */
const MAX_SEGMENT_DURATION = 10;

/** 单段最小时长（秒），过短无法生成有效视频 */
const MIN_SEGMENT_DURATION = 3;

/** ffmpeg 场景检测阈值（0~1，越大越不敏感） */
const DEFAULT_SCENE_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// 场景检测
// ---------------------------------------------------------------------------

/**
 * 使用 ffmpeg 检测视频场景切换点
 *
 * @returns 场景切换时间点数组，如 [4.2, 8.7, 15.0]
 */
export async function detectSceneChanges(
  videoUrl: string,
  threshold: number = DEFAULT_SCENE_THRESHOLD
): Promise<number[]> {
  const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";

  // ffmpeg select filter: 检测场景变化并输出 pts_time
  const result = await executeCommand(ffmpegBin, [
    "-i", videoUrl,
    "-filter:v", `select='gt(scene,${threshold})',showinfo`,
    "-f", "null",
    "-",
  ]);

  if (!result.ok) {
    // 场景检测失败不阻塞流程，退化为空数组（纯等分）
    log.warn(
      { stderr: result.stderr.slice(-300), threshold },
      "scene detection: ffmpeg failed, falling back to equal splitting"
    );
    return [];
  }

  // 从 stderr 解析 pts_time
  // showinfo 输出格式: n:1 pts:288000 pts_time:4.800000 pos:234567 ...
  const timeRegex = /pts_time:(\d*\.?\d+)/g;
  const boundaries: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = timeRegex.exec(result.stderr)) !== null) {
    const time = parseFloat(match[1]);
    if (!isNaN(time) && time > 0) {
      boundaries.push(time);
    }
  }

  // 去重并排序
  const unique = [...new Set(boundaries)].sort((a, b) => a - b);

  log.info(
    { videoUrl, threshold, boundaryCount: unique.length, boundaries: unique },
    "scene detection: detected scene boundaries"
  );

  return unique;
}

// ---------------------------------------------------------------------------
// 分镜算法
// ---------------------------------------------------------------------------

interface SegmentRaw {
  start: number;
  end: number;
}

/**
 * 基于场景边界计算分镜
 *
 * 算法：
 * 1. 用场景边界将视频分成初始段
 * 2. 每段 > MAX_SEGMENT_DURATION → 等分
 * 3. 每段 < MIN_SEGMENT_DURATION → 与相邻段合并
 * 4. 无场景切换 → 退化为纯等分
 */
export function computeSegments(
  sceneBoundaries: number[],
  videoDuration: number,
  maxDuration: number = MAX_SEGMENT_DURATION,
  minDuration: number = MIN_SEGMENT_DURATION
): ActionSegment[] {
  if (videoDuration <= 0) {
    return [{ startTime: 0, endTime: 0, actionType: "unknown" }];
  }

  // Step 1: 基于场景边界生成初始段
  const initialSegments = buildInitialSegments(sceneBoundaries, videoDuration);

  // Step 2: 合并过短的段
  const merged = mergeShortSegments(initialSegments, minDuration);

  // Step 3: 拆分过长的段
  const split = splitLongSegments(merged, maxDuration);

  log.info(
    {
      videoDuration,
      sceneBoundaryCount: sceneBoundaries.length,
      initialCount: initialSegments.length,
      mergedCount: merged.length,
      finalCount: split.length,
    },
    "segment computation: completed"
  );

  return split.map((seg, i) => ({
    startTime: Math.round(seg.start * 1000) / 1000,
    endTime: Math.round(seg.end * 1000) / 1000,
    actionType: `scene_${i + 1}`,
  }));
}

/** 基于场景边界生成初始段 */
function buildInitialSegments(
  boundaries: number[],
  videoDuration: number
): SegmentRaw[] {
  if (boundaries.length === 0) {
    return [{ start: 0, end: videoDuration }];
  }

  const segments: SegmentRaw[] = [];
  let prev = 0;

  for (const boundary of boundaries) {
    // 只取视频时长范围内的边界
    if (boundary >= videoDuration) break;
    if (boundary <= prev) continue;

    segments.push({ start: prev, end: boundary });
    prev = boundary;
  }

  // 最后一段
  if (prev < videoDuration) {
    segments.push({ start: prev, end: videoDuration });
  }

  return segments;
}

/** 合并过短的段（与相邻较短段合并） */
function mergeShortSegments(
  segments: SegmentRaw[],
  minDuration: number
): SegmentRaw[] {
  if (segments.length <= 1) return segments;

  const result: SegmentRaw[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    const currentDuration = current.end - current.start;

    if (currentDuration < minDuration) {
      // 当前段太短，与下一段合并
      current = { start: current.start, end: next.end };
    } else {
      result.push(current);
      current = next;
    }
  }

  // 处理最后一段
  const lastDuration = current.end - current.start;
  if (lastDuration < minDuration && result.length > 0) {
    // 最后一段太短，合并到前一段
    const prev = result[result.length - 1];
    result[result.length - 1] = { start: prev.start, end: current.end };
  } else {
    result.push(current);
  }

  return result;
}

/** 拆分过长的段（等分） */
function splitLongSegments(
  segments: SegmentRaw[],
  maxDuration: number
): SegmentRaw[] {
  const result: SegmentRaw[] = [];

  for (const seg of segments) {
    const duration = seg.end - seg.start;
    if (duration <= maxDuration) {
      result.push(seg);
      continue;
    }

    // 等分: N = ceil(duration / maxDuration)
    const n = Math.ceil(duration / maxDuration);
    const segDuration = duration / n;

    for (let i = 0; i < n; i++) {
      result.push({
        start: seg.start + i * segDuration,
        end: seg.start + (i + 1) * segDuration,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 一站式入口
// ---------------------------------------------------------------------------

export interface SceneDetectionResult {
  /** 视频时长（秒） */
  duration: number;
  /** 视频帧率（FPS） */
  fps: number;
  /** 场景切换时间点 */
  sceneBoundaries: number[];
  /** 最终分镜 */
  actionSegments: ActionSegment[];
}

/**
 * 一站式分镜计算：ffmpeg 时长 + 场景检测 + 数学分镜
 */
export async function computeVideoSegments(
  videoUrl: string
): Promise<SceneDetectionResult> {
  // Step 1: 获取视频时长和帧率
  const [duration, fps] = await Promise.all([
    getVideoDuration(videoUrl),
    getVideoFps(videoUrl),
  ]);
  if (duration <= 0) {
    throw new AppError(502, "INVALID_VIDEO_DURATION", `视频时长无效: ${duration}s`);
  }

  log.info({ videoUrl, duration, fps }, "compute segments: video metadata obtained");

  // Step 2: 场景检测（≤10s 视频跳过，强制单段）
  let sceneBoundaries: number[];
  if (duration <= MAX_SEGMENT_DURATION) {
    sceneBoundaries = [];
    log.info({ duration }, "video ≤10s, skip scene detection, force single segment");
  } else {
    sceneBoundaries = await detectSceneChanges(videoUrl);
  }

  // Step 3: 计算分镜
  const actionSegments = computeSegments(sceneBoundaries, duration);

  log.info(
    { duration, fps, sceneBoundaryCount: sceneBoundaries.length, segmentCount: actionSegments.length },
    "compute segments: completed"
  );

  return { duration, fps, sceneBoundaries, actionSegments };
}
