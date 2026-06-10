/**
 * video-merge.ts
 *
 * 视频合并工具，用于将多个视频片段合并为一个完整视频。
 * 使用 ffmpeg concat demuxer 进行无损合并。
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { AppError } from "../core/errors.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 视频合并结果 */
export interface VideoMergeResult {
  /** 合并后的视频字节 */
  videoBytes: Buffer;
  /** MIME 类型 */
  mimeType: string;
  /** 总时长（秒） */
  totalDuration: number;
}

/** 视频合并日志接口 */
export interface VideoMergeLogger {
  info: (obj: unknown, msg: string) => void;
  warn: (obj: unknown, msg: string) => void;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 执行外部命令
 */
async function executeCommand(
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

/**
 * 获取视频时长（秒）
 */
async function getVideoDuration(videoUrl: string): Promise<number> {
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

  // 默认返回 0（无法解析）
  return 0;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 合并多个视频片段为一个完整视频
 * 使用 ffmpeg concat demuxer 进行无损合并
 *
 * @param videoUrls 视频片段 URL 数组（按顺序）
 * @param outputFormat 输出格式（mp4 或 mov）
 * @param log 日志接口（可选）
 * @returns 合并后的视频字节和元数据
 * @throws AppError 如果合并失败
 */
export async function mergeVideos(
  videoUrls: string[],
  outputFormat: "mp4" | "mov" = "mp4",
  log?: VideoMergeLogger
): Promise<VideoMergeResult> {
  const silentLog: VideoMergeLogger = {
    info: () => {},
    warn: () => {},
  };
  const logger = log ?? silentLog;

  if (videoUrls.length === 0) {
    throw new AppError(400, "NO_VIDEOS_TO_MERGE", "视频片段数组为空，无法合并");
  }

  // 单个视频时直接返回（无需合并）
  if (videoUrls.length === 1) {
    logger.info({ videoUrl: videoUrls[0] }, "video merge: single video, no merge needed");

    const response = await fetch(videoUrls[0]);
    if (!response.ok) {
      throw new AppError(502, "VIDEO_FETCH_FAILED", `无法获取视频: ${videoUrls[0]}`);
    }

    const videoBytes = Buffer.from(await response.arrayBuffer());
    const duration = await getVideoDuration(videoUrls[0]);

    return {
      videoBytes,
      mimeType: outputFormat === "mp4" ? "video/mp4" : "video/quicktime",
      totalDuration: duration,
    };
  }

  logger.info({ videoCount: videoUrls.length, outputFormat }, "video merge: starting merge");

  // 创建临时目录
  const tempDir = await mkdtemp(join(tmpdir(), "video-merge-"));
  const outputFile = join(tempDir, `merged.${outputFormat}`);
  const concatListFile = join(tempDir, "concat_list.txt");

  try {
    // 构建 concat list 文件
    // ffmpeg concat demuxer 格式：file 'URL'
    const concatListContent = videoUrls.map(url => `file '${url}'`).join("\n");
    await writeFile(concatListFile, concatListContent, "utf-8");

    logger.info({ concatListFile, videoCount: videoUrls.length }, "video merge: concat list created");

    // ffmpeg 命令：使用 concat demuxer 合并
    // 视频流复制（快速），音频重编码（确保各段音频参数兼容）
    const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
    const result = await executeCommand(ffmpegBin, [
      "-f", "concat",
      "-safe", "0",  // 允许使用绝对路径和 URL
      "-i", concatListFile,
      "-c:v", "copy",       // 视频流复制（不重编码）
      "-c:a", "aac",        // 音频重编码为 AAC（统一各段参数）
      "-ar", "48000",       // 统一采样率 48kHz
      "-ac", "2",           // 统一立体声
      "-b:a", "192k",       // 音频码率 192kbps
      "-movflags", "+faststart",  // 优化 MP4 播放
      "-y",  // 覆盖输出文件
      outputFile,
    ]);

    if (!result.ok) {
      const errorMsg = result.stderr.slice(-500);
      logger.warn({ stderr: errorMsg }, "video merge: ffmpeg merge failed");
      throw new AppError(
        502,
        "VIDEO_MERGE_FAILED",
        `视频合并失败: ffmpeg 执行错误。片段数: ${videoUrls.length}。错误详情: ${errorMsg}`
      );
    }

    // 读取合并后的视频
    const videoBytes = await readFile(outputFile);
    const mimeType = outputFormat === "mp4" ? "video/mp4" : "video/quicktime";

    // 计算总时长（从合并后的视频获取）
    const totalDuration = await getVideoDuration(outputFile);

    logger.info(
      { videoCount: videoUrls.length, mergedSize: videoBytes.byteLength, totalDuration },
      "video merge: merge completed successfully"
    );

    return { videoBytes, mimeType, totalDuration };
  } finally {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true });
  }
}