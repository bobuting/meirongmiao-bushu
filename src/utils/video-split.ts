/**
 * video-split.ts
 *
 * 视频切片工具，用于根据动作分镜时间边界将源视频切分成多个片段。
 * 使用 ffmpeg -ss -t 参数进行精准时间定位切片。
 */

import { getLogger } from "../core/logger/index.js";

const log = getLogger("video-split");

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import { AppError } from "../core/errors.js";
import { getOssService } from "../service/oss/oss-service.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 动作分镜片段 */
export interface ActionSegment {
  startTime: number;
  endTime: number;
  actionType?: string;
}

/** 切片结果 */
export interface VideoSplitResult {
  /** 切片视频 URL 数组 */
  segmentUrls: string[];
  /** 切片数量 */
  segmentCount: number;
  /** 总耗时（毫秒） */
  elapsedMs: number;
  /** 是否进行了分辨率缩放 */
  resolutionScaled?: boolean;
  /** 缩放后的分辨率（如果进行了缩放） */
  scaledResolution?: { width: number; height: number };
}

/** 切片日志接口 */
export interface VideoSplitLogger {
  info: (obj: unknown, msg: string) => void;
  warn: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

/** 分辨率约束配置 */
export interface DimensionConstraints {
  /** 最小宽度（px），低于此值会放大 */
  minWidth?: number;
  /** 最大边长（px），高于此值会缩小 */
  maxDimension?: number;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 执行外部命令
 */
export async function executeCommand(
  command: string,
  args: string[]
): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
    });
    child.on("error", (error) => {
      resolvePromise({ ok: false, stderr: String(error), stdout });
    });
    child.on("close", (code) => {
      resolvePromise({ ok: code === 0, stderr, stdout });
    });
  });
}

/** 视频分辨率信息 */
export interface VideoResolution {
  width: number;
  height: number;
}

/**
 * 获取视频分辨率
 */
export async function getVideoResolution(videoUrl: string): Promise<VideoResolution> {
  const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
  const result = await executeCommand(ffmpegBin, [
    "-i", videoUrl,
    "-hide_banner",
  ]);

  // 从 stderr 解析分辨率（ffmpeg -i 输出格式：Stream #0:0: Video: ... 1920x1084）
  // 只匹配 Video 流的分辨率，避免匹配封面图等其他分辨率
  // 典型格式：Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps
  const videoStreamMatch = result.stderr.match(/Stream\s+#\d+:\d+.*Video:.*?(\d{3,5})x(\d{3,5})/);
  if (videoStreamMatch) {
    return {
      width: parseInt(videoStreamMatch[1], 10),
      height: parseInt(videoStreamMatch[2], 10),
    };
  }

  // 降级匹配：如果找不到 Video 流，尝试匹配任意分辨率（兼容某些特殊格式）
  const fallbackMatch = result.stderr.match(/(\d{3,5})x(\d{3,5})/);
  if (fallbackMatch) {
    return {
      width: parseInt(fallbackMatch[1], 10),
      height: parseInt(fallbackMatch[2], 10),
    };
  }

  // 分辨率解析失败，记录原始 stderr 用于排查
  log.warn(`分辨率解析失败，videoUrl=${videoUrl.slice(0, 100)}, stderr=${result.stderr.slice(0, 500)}`);
  return { width: 0, height: 0 };
}

/**
 * 获取视频时长（秒）
 */
export async function getVideoDuration(videoUrl: string): Promise<number> {
  const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
  const result = await executeCommand(ffmpegBin, [
    "-i", videoUrl,
    "-hide_banner",
  ]);

  // 从 stderr 解析时长（ffmpeg -i 输出格式）
  const durationMatch = result.stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (durationMatch) {
    const hours = parseInt(durationMatch[1], 10);
    const minutes = parseInt(durationMatch[2], 10);
    const seconds = parseInt(durationMatch[3], 10);
    const centiseconds = parseInt(durationMatch[4], 10);
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  }

  return 0;
}

/**
 * 获取视频帧率（FPS）
 */
export async function getVideoFps(videoUrl: string): Promise<number> {
  const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
  const result = await executeCommand(ffmpegBin, [
    "-i", videoUrl,
    "-hide_banner",
  ]);

  // 从 stderr 解析帧率（ffmpeg -i 输出格式：Stream #0:0: Video ... 30 fps 或 30 tbr）
  const fpsMatch = result.stderr.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/);
  if (fpsMatch) {
    return parseFloat(fpsMatch[1]);
  }

  return 30;
}

/**
 * 验证并钳位切片点到视频时长范围内
 * AI 分析可能生成超出实际视频时长的 endTime，自动钳位到 videoDuration
 */
function clampSplitPoints(
  actionSegments: ActionSegment[],
  videoDuration: number
): ActionSegment[] {
  return actionSegments.map((segment) => {
    if (segment.startTime < 0) {
      throw new AppError(
        400,
        "INVALID_SPLIT_POINT",
        `切片起始时间不能为负数: startTime=${segment.startTime}`
      );
    }
    const endTime = Math.min(segment.endTime, videoDuration);
    if (segment.startTime >= endTime) {
      throw new AppError(
        400,
        "INVALID_SPLIT_POINT",
        `切片起始时间必须小于结束时间: startTime=${segment.startTime}, endTime=${endTime}`
      );
    }
    return { ...segment, endTime };
  });
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 根据动作分镜时间边界切分视频
 * 使用 ffmpeg -ss -t 参数进行精准时间定位切片
 *
 * 支持分辨率约束：
 * - minWidth: 最小宽度，低于此值会放大（Kling Omni-Video 要求 ≥700px）
 * - maxDimension: 最大边长，高于此值会缩小（Kling Omni-Video 要求 ≤2160px）
 *
 * @param storage 对象存储适配器
 * @param videoUrl 源视频 URL
 * @param actionSegments 动作分镜数组（来自 Stage 1 的 startTime/endTime）
 * @param projectId 项目 ID（用于存储路径）
 * @param log 日志接口（可选）
 * @param startSegmentIndex 起始切片序号（可选）
 * @param maxDimension 最大边长（可选，默认2160）
 * @param minWidth 最小宽度（可选，默认700）
 * @returns 切片结果（URL 数组、数量、耗时、缩放信息）
 * @throws AppError 如果切片失败
 */
export async function splitVideoBySegments(
  storage: IObjectStorageAdapter,
  videoUrl: string,
  actionSegments: ActionSegment[],
  projectId: string,
  log?: VideoSplitLogger,
  startSegmentIndex?: number,
  maxDimension?: number,
  minWidth?: number
): Promise<VideoSplitResult> {
  const startTime = Date.now();
  const silentLog: VideoSplitLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  const logger = log ?? silentLog;

  if (actionSegments.length === 0) {
    throw new AppError(400, "NO_SEGMENTS_TO_SPLIT", "动作分镜数组为空，无法切片");
  }

  logger.info(
    { videoUrl, segmentCount: actionSegments.length, projectId },
    "video split: starting split by action segments"
  );

  // 获取视频时长并钳位切片点到视频时长范围内
  const videoDuration = await getVideoDuration(videoUrl);
  const clampedSegments = clampSplitPoints(actionSegments, videoDuration);

  // 获取源视频分辨率
  const resolution = await getVideoResolution(videoUrl);

  // 分辨率检测失败的保护
  if (resolution.width === 0 || resolution.height === 0) {
    throw new AppError(
      502,
      "RESOLUTION_DETECTION_FAILED",
      `无法获取视频分辨率，请检查视频是否可访问：${videoUrl.slice(0, 100)}`
    );
  }

  const effectiveMinWidth = minWidth ?? 700;   // Kling Omni-Video 最小宽度 700px
  const effectiveMaxDim = maxDimension ?? 2160; // Kling Omni-Video 最大边长 2160px

  // 计算缩放需求
  let needsScaling = false;
  let targetWidth = resolution.width;
  let targetHeight = resolution.height;

  // 宽度太小，需要放大
  if (resolution.width < effectiveMinWidth) {
    needsScaling = true;
    // 按比例放大到最小宽度，保持宽高比
    const scaleRatio = effectiveMinWidth / resolution.width;
    targetWidth = effectiveMinWidth;
    targetHeight = Math.round(resolution.height * scaleRatio);
    logger.info(
      { originalWidth: resolution.width, originalHeight: resolution.height, targetWidth, targetHeight, reason: "width_below_minimum" },
      "video split: width below minimum, will scale up"
    );
  }

  // 边长太大，需要缩小
  if (targetWidth > effectiveMaxDim || targetHeight > effectiveMaxDim) {
    needsScaling = true;
    // 缩小到最大边长，保持宽高比
    const maxCurrent = Math.max(targetWidth, targetHeight);
    const scaleRatio = effectiveMaxDim / maxCurrent;
    targetWidth = Math.round(targetWidth * scaleRatio);
    targetHeight = Math.round(targetHeight * scaleRatio);
    logger.info(
      { originalWidth: resolution.width, originalHeight: resolution.height, targetWidth, targetHeight, reason: "dimension_exceeds_maximum" },
      "video split: dimension exceeds maximum, will scale down"
    );
  }

  // 创建临时目录
  const tempDir = await mkdtemp(join(tmpdir(), "video-split-"));
  const segmentUrls: string[] = [];

  try {
    const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
    const ossService = getOssService(storage);

    // 逐个切片
    const offset = startSegmentIndex ?? 0;
    for (let i = 0; i < clampedSegments.length; i++) {
      const segment = clampedSegments[i];
      const duration = segment.endTime - segment.startTime;
      const segIdx = offset + i;
      const outputFile = join(tempDir, `segment_${segIdx}.mp4`);

      logger.info(
        { segmentIndex: segIdx, startTime: segment.startTime, duration },
        "video split: splitting segment"
      );

      // ffmpeg 命令：统一使用重编码确保所有帧正确写入
      // stream copy 只复制关键帧，短视频关键帧稀疏会导致切片只有 1 帧
      // 缩放滤镜：scale=width:height，强制指定目标分辨率
      const vfFilter = needsScaling
        ? `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=disable`
        : undefined;

      const ffmpegArgs = [
        "-y",
        "-ss", String(segment.startTime),  // input seeking：在解码前定位
        "-i", videoUrl,
        "-t", String(duration),
        ...(vfFilter ? ["-vf", vfFilter] : []),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",        // 音频重编码（stream copy 在 seek 后可能丢帧）
        "-movflags", "+faststart",
        outputFile,
      ];

      const result = await executeCommand(ffmpegBin, ffmpegArgs);

      if (!result.ok) {
        const errorMsg = result.stderr.slice(-500);
        logger.warn({ segmentIndex: segIdx, stderr: errorMsg }, "video split: ffmpeg split failed");
        throw new AppError(
          502,
          "VIDEO_SPLIT_FAILED",
          `视频切片失败: segment ${segIdx}, startTime=${segment.startTime}, duration=${duration}. 错误: ${errorMsg}`
        );
      }

      // 上传到对象存储
      const segmentBytes = await readFile(outputFile);
      const storageKey = join("outfit-change", projectId, "segments", `segment_${segIdx}.mp4`);
      const uploadResult = await ossService.upload(storageKey, segmentBytes, "video/mp4");

      segmentUrls.push(uploadResult.url);
      logger.info(
        { segmentIndex: segIdx, url: uploadResult.url, size: segmentBytes.byteLength },
        "video split: segment uploaded"
      );
    }

    const elapsedMs = Date.now() - startTime;
    logger.info(
      { segmentCount: segmentUrls.length, elapsedMs, needsScaling, targetWidth, targetHeight },
      "video split: all segments completed"
    );

    return {
      segmentUrls,
      segmentCount: segmentUrls.length,
      elapsedMs,
      resolutionScaled: needsScaling || undefined,
      scaledResolution: needsScaling ? { width: targetWidth, height: targetHeight } : undefined,
    };
  } finally {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 视频关键帧截图提取
// ---------------------------------------------------------------------------

/** 关键帧截图结果 */
export interface KeyframeThumbnail {
  /** 截图 URL */
  url: string;
  /** 截图时间点（毫秒） */
  timeMs: number;
}

/** 提取视频关键帧截图 */
export interface ExtractKeyframesResult {
  /** 截图数组 */
  thumbnails: KeyframeThumbnail[];
  /** 耗时（ms） */
  elapsedMs: number;
}

/**
 * 提取视频关键帧截图（用于切片视频预览）
 *
 * @param storage 对象存储适配器
 * @param videoUrl 视频 URL
 * @param projectId 项目 ID（用于存储路径）
 * @param segmentIndex 切片序号
 * @param count 截图数量（默认 3 张：开头、中间、结尾）
 * @param log 可选日志接口
 * @returns 截图结果
 */
export async function extractVideoKeyframes(
  storage: IObjectStorageAdapter,
  videoUrl: string,
  projectId: string,
  segmentIndex: number,
  count: number = 3,
  log?: VideoSplitLogger
): Promise<ExtractKeyframesResult> {
  const startTime = Date.now();
  const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
  const silentLog: VideoSplitLogger = { info: () => {}, warn: () => {}, error: () => {} };
  const logger = log ?? silentLog;

  // 获取视频时长
  const duration = await getVideoDuration(videoUrl);
  logger.info({ videoUrl: videoUrl.slice(0, 100), duration }, "keyframe: 开始提取关键帧");

  // 计算截图时间点：首帧（0ms）和尾帧（duration*1000ms）一定要
  const timePoints: number[] = [];
  if (duration <= 0) {
    // 无效时长，只取首帧
    timePoints.push(0);
    logger.warn({ duration }, "keyframe: 无效时长，只取首帧");
  } else if (duration <= 1) {
    // 短视频（<=1s）：首帧 + 尾帧
    timePoints.push(0); // 首帧
    timePoints.push(Math.round(duration * 1000)); // 尾帧
    logger.info({ duration, timePoints }, "keyframe: 短视频，首帧+尾帧");
  } else {
    // 正常视频：首帧 + 中间帧 + 尾帧
    timePoints.push(0); // 首帧一定要

    // 中间帧：在首帧和尾帧之间均匀分布
    // count=3 时：首帧 + 1个中间帧 + 尾帧
    // count=4 时：首帧 + 2个中间帧 + 尾帧
    const middleCount = Math.max(0, count - 2);
    if (middleCount > 0) {
      const step = duration / (middleCount + 1);
      for (let i = 1; i <= middleCount; i++) {
        timePoints.push(Math.round(step * i * 1000)); // 转换为毫秒
      }
    }

    timePoints.push(Math.round(duration * 1000)); // 尾帧一定要
    logger.info({ duration, count, middleCount, timePoints }, "keyframe: 首帧+中间帧+尾帧");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "keyframe-"));
  const thumbnails: KeyframeThumbnail[] = [];

  try {
    const ossService = getOssService(storage);

    for (let i = 0; i < timePoints.length; i++) {
      const timeMs = timePoints[i];
      const outputFile = join(tempDir, `keyframe_${i}.jpg`);

      // ffmpeg 截取指定时间帧
      const result = await executeCommand(ffmpegBin, [
        "-y",
        "-ss", String(timeMs / 1000), // 秒
        "-i", videoUrl,
        "-frames:v", "1",
        "-q:v", "2", // 高质量 JPEG
        outputFile,
      ]);

      if (!result.ok) {
        // 截图失败，跳过
        logger.warn({ segmentIndex, timeMs, stderr: result.stderr.slice(-200) }, "keyframe: 截图失败，跳过");
        continue;
      }

      // 上传到 OSS
      const fileBuffer = await readFile(outputFile);
      const storageKey = join("outfit-change", projectId, "thumbnails", `segment_${segmentIndex}_keyframe_${i}.jpg`);
      const uploadResult = await ossService.upload(storageKey, fileBuffer, "image/jpeg");

      thumbnails.push({
        url: uploadResult.url,
        timeMs,
      });
      logger.info({ segmentIndex, timeMs, url: uploadResult.url.slice(0, 100) }, "keyframe: 截图上传完成");
    }

    const elapsedMs = Date.now() - startTime;
    logger.info({ segmentIndex, thumbnailCount: thumbnails.length, elapsedMs }, "keyframe: 关键帧提取完成");

    return {
      thumbnails,
      elapsedMs: Date.now() - startTime,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 视频裁切（截取前 N 秒）
// ---------------------------------------------------------------------------

/** 视频裁切结果 */
export interface VideoTrimResult {
  /** 裁切后的视频 URL */
  trimmedVideoUrl: string;
  /** 原始时长（秒） */
  originalDuration: number;
  /** 裁切后时长（秒） */
  trimmedDuration: number;
  /** 耗时（ms） */
  elapsedMs: number;
}

/**
 * 裁切视频到指定时长（从开头截取）
 *
 * 使用原生 ffmpeg，stream copy 模式，保留音频
 *
 * @param storage 对象存储适配器
 * @param videoUrl 源视频 URL
 * @param maxDuration 最大时长（秒）
 * @param projectId 项目 ID（用于存储路径）
 * @returns 裁切结果
 */
export async function trimVideoToDuration(
  storage: IObjectStorageAdapter,
  videoUrl: string,
  maxDuration: number,
  projectId: string
): Promise<VideoTrimResult> {
  const startTime = Date.now();
  const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";

  // 获取原始时长
  const originalDuration = await getVideoDuration(videoUrl);

  if (originalDuration <= maxDuration) {
    // 无需裁切
    return {
      trimmedVideoUrl: videoUrl,
      originalDuration,
      trimmedDuration: originalDuration,
      elapsedMs: Date.now() - startTime,
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "video-trim-"));

  try {
    const outputFile = join(tempDir, "trimmed.mp4");

    // ffmpeg 裁切：从开头截取 maxDuration 秒，stream copy 音视频
    const result = await executeCommand(ffmpegBin, [
      "-y",
      "-i", videoUrl,
      "-t", String(maxDuration),
      "-c", "copy",
      "-movflags", "+faststart",
      outputFile,
    ]);

    if (!result.ok) {
      throw new AppError(500, "VIDEO_TRIM_FAILED", `ffmpeg 裁切失败: ${result.stderr}`);
    }

    // 获取裁切后时长
    const trimmedDuration = await getVideoDuration(outputFile);

    // 上传到 OSS
    const ossService = getOssService(storage);
    const fileBuffer = await readFile(outputFile);
    const ossKey = `projects/${projectId}/trimmed_${Date.now()}.mp4`;
    const uploadResult = await ossService.upload(ossKey, fileBuffer, "video/mp4");

    return {
      trimmedVideoUrl: uploadResult.url,
      originalDuration,
      trimmedDuration,
      elapsedMs: Date.now() - startTime,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}