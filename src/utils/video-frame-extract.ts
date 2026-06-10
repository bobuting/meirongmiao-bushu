/**
 * video-frame-extract.ts
 *
 * 视频帧提取工具，用于从视频中提取特定时间点的帧。
 * 使用 ffmpeg 进行帧提取。
 */

import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { AppError } from "../core/errors.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 帧提取结果 */
export interface FrameExtractResult {
  /** 帧图片字节 */
  frameBytes: Buffer;
  /** MIME 类型 */
  mimeType: string;
}

/** 帧提取日志接口 */
export interface FrameExtractLogger {
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
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });
    child.on("error", (error) => {
      resolvePromise({ ok: false, stderr: String(error) });
    });
    child.on("close", (code) => {
      resolvePromise({ ok: code === 0, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 从视频中提取特定时间点的帧
 * 使用 ffmpeg -ss 定位时间点并提取单帧
 *
 * @param videoUrl 视频 URL（支持本地路径或网络 URL）
 * @param timestampSeconds 时间点（秒）
 * @param outputFormat 输出格式（png 或 jpg）
 * @param log 日志接口（可选）
 * @returns 帧图片字节和 MIME 类型
 * @throws AppError 如果提取失败
 */
export async function extractFrameAtTime(
  videoUrl: string,
  timestampSeconds: number,
  outputFormat: "png" | "jpg" = "jpg",
  log?: FrameExtractLogger
): Promise<FrameExtractResult> {
  const silentLog: FrameExtractLogger = {
    info: () => {},
    warn: () => {},
  };
  const logger = log ?? silentLog;

  logger.info({ videoUrl, timestampSeconds, outputFormat }, "frame extract: extracting frame from video");

  // 创建临时目录
  const tempDir = await mkdtemp(join(tmpdir(), "frame-extract-"));
  const outputFile = join(tempDir, `frame.${outputFormat}`);

  try {
    // ffmpeg 命令：-ss 定位时间点，-i 输入视频，-vframes 1 提取单帧
    // -ss 放在 -i 之前可以快速定位（seek mode）
    const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
    const result = await executeCommand(ffmpegBin, [
      "-y",
      "-ss", String(timestampSeconds),
      "-i", videoUrl,
      "-vframes", "1",
      "-q:v", "2", // 高质量（1-31，越小质量越高）
      outputFile,
    ]);

    if (!result.ok) {
      const errorMsg = result.stderr.slice(-300);
      logger.warn({ stderr: errorMsg }, "frame extract: ffmpeg extraction failed");
      throw new AppError(
        502,
        "FRAME_EXTRACT_FAILED",
        `帧提取失败: ffmpeg 执行错误。视频: ${videoUrl}, 时间: ${timestampSeconds}s。错误详情: ${errorMsg}`
      );
    }

    // 检查输出文件是否存在（ffmpeg 可能静默失败，如时间戳超出视频时长）
    try {
      await access(outputFile);
    } catch {
      throw new AppError(
        502,
        "FRAME_EXTRACT_NO_OUTPUT",
        `帧提取失败: ffmpeg 未生成输出文件。视频: ${videoUrl}, 时间: ${timestampSeconds}s（可能超出视频时长）`
      );
    }

    // 读取提取的帧
    const frameBytes = await readFile(outputFile);
    const mimeType = outputFormat === "png" ? "image/png" : "image/jpeg";

    logger.info(
      { videoUrl, timestampSeconds, frameSize: frameBytes.byteLength },
      "frame extract: frame extracted successfully"
    );

    return { frameBytes, mimeType };
  } finally {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * 从视频中提取多个时间点的帧（批量）
 *
 * @param videoUrl 视频 URL
 * @param timestamps 时间点数组（秒）
 * @param outputFormat 输出格式
 * @param log 日志接口
 * @returns 帧数组（按时间顺序）
 */
export async function extractFramesAtTimes(
  videoUrl: string,
  timestamps: number[],
  outputFormat: "png" | "jpg" = "jpg",
  log?: FrameExtractLogger
): Promise<FrameExtractResult[]> {
  const results: FrameExtractResult[] = [];
  for (const ts of timestamps) {
    const frame = await extractFrameAtTime(videoUrl, ts, outputFormat, log);
    results.push(frame);
  }
  return results;
}