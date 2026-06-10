/**
 * video-compression.ts
 *
 * 视频压缩工具，用于将视频压缩到符合 LLM inline_data 限制（<1MB）。
 * 使用 ffmpeg 进行压缩处理。
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { AppError } from "../core/errors.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 压缩结果 */
export interface VideoCompressionResult {
  /** 压缩后的视频字节 */
  compressedBytes: Buffer;
  /** MIME 类型（压缩后统一为 video/mp4） */
  mimeType: string;
}

/** 压缩日志接口 */
export interface VideoCompressionLogger {
  info: (obj: unknown, msg: string) => void;
  warn: (obj: unknown, msg: string) => void;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 执行外部命令
 * @param command 命令名称
 * @param args 命令参数
 * @returns 执行结果（成功/失败 + stderr）
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

/**
 * 检测 MP4 文件是否包含视频轨道（vide handler）
 * 通过扫描 MP4 atom 结构查找 moov > trak > hdlr 中的 vide handler
 */
export function hasVideoTrack(bytes: Buffer): boolean {
  // MP4 文件以 ftyp atom 开头，检查文件头
  if (bytes.length < 8) return false;
  const ftyp = bytes.toString("ascii", 4, 8);
  if (ftyp !== "ftyp") return false;

  // 递归搜索 hdlr atom 中的 vide handler
  return searchForVideoHandler(bytes, 0, bytes.length);
}

/** 在 MP4 字节范围内搜索 vide handler 标记 */
function searchForVideoHandler(bytes: Buffer, start: number, end: number): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    const atomSize = bytes.readUInt32BE(offset);
    const atomType = bytes.toString("ascii", offset + 4, offset + 8);

    // hdlr atom: 偏移 16 字节后是 handler type（4 字节）
    if (atomType === "hdlr" && offset + 16 <= end) {
      const handlerType = bytes.toString("ascii", offset + 16, offset + 20);
      if (handlerType === "vide") return true;
    }

    // 容器 atom 需要递归搜索子 atom
    if (atomType === "moov" || atomType === "trak" || atomType === "mdia" || atomType === "minf" || atomType === "stbl") {
      const childStart = offset + 8;
      const childEnd = Math.min(offset + atomSize, end);
      if (searchForVideoHandler(bytes, childStart, childEnd)) return true;
    }

    // 移动到下一个 atom
    if (atomSize < 8) break;
    offset += atomSize;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 压缩视频用于 LLM 分析
 * 使用 ffmpeg 降低分辨率、帧率和比特率，目标大小 <1MB 以符合 Gemini inline_data 限制
 *
 * @param inputBytes 原始视频字节
 * @param originalMimeType 原始 MIME 类型
 * @param log 日志接口（可选，默认静默）
 * @returns 压缩后的视频和 MIME 类型
 * @throws AppError 如果压缩失败（符合项目原则："主流程失败时直接报错，禁止静默降级"）
 */
export async function compressVideoForLlm(
  inputBytes: Buffer,
  originalMimeType: string,
  log?: VideoCompressionLogger
): Promise<VideoCompressionResult> {
  const silentLog: VideoCompressionLogger = {
    info: () => {},
    warn: () => {},
  };
  const logger = log ?? silentLog;

  // 始终通过 ffmpeg 处理，确保输出包含视频轨道
  // 抖音 CDN 可能返回纯音频流（无画面），必须用 ffmpeg 重新编码验证
  const needsReencode = inputBytes.byteLength >= 1024 * 1024;
  // 即使文件 <1MB，如果输入不含视频轨道，也需要 ffmpeg 重新编码
  const inputHasVideo = hasVideoTrack(inputBytes);

  if (inputBytes.byteLength < 1024 * 1024 && inputHasVideo) {
    // 文件小且已包含视频轨道，直接返回
    logger.info(
      { originalSize: inputBytes.byteLength, mimeType: originalMimeType, hasVideo: true },
      "video compression: small video with valid video track, skipping re-encode"
    );
    return { compressedBytes: inputBytes, mimeType: originalMimeType };
  }

  if (!inputHasVideo) {
    logger.warn(
      { originalSize: inputBytes.byteLength, mimeType: originalMimeType },
      "video compression: input file has NO video track, will attempt ffmpeg re-encode"
    );
  }

  logger.info(
    { originalSize: inputBytes.byteLength, mimeType: originalMimeType, needsReencode, inputHasVideo },
    "video compression: compressing video for LLM inline_data limit (<1MB)"
  );

  // 创建临时目录
  const tempDir = await mkdtemp(join(tmpdir(), "video-compress-"));
  const inputFile = join(tempDir, "input.mp4");
  const outputFile = join(tempDir, "compressed.mp4");

  try {
    // 写入临时输入文件
    await writeFile(inputFile, inputBytes);

    // ffmpeg 压缩参数：
    // - 降低分辨率到 480p (854x480)
    // - 降低帧率到 15fps
    // - 使用 libx264 编码，preset veryfast
    // - 提高 crf 到 32（质量较低但压缩率高）
    // - 降低音频比特率到 64k
    // 优先使用项目内的 ffmpeg-static 二进制，其次环境变量，最后回退系统 ffmpeg
    const ffmpegBin = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
    const result = await executeCommand(ffmpegBin, [
      "-y",
      "-i", inputFile,
      "-vf", "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
      "-r", "15",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "32",
      "-c:a", "aac",
      "-b:a", "64k",
      "-movflags", "+faststart",
      outputFile,
    ]);

    if (!result.ok) {
      const errorMsg = result.stderr.slice(-300);
      logger.warn(
        { stderr: errorMsg },
        "video compression: ffmpeg compression failed"
      );
      // 压缩失败时抛出错误，不静默降级
      // 符合项目原则："主流程失败时直接报错，禁止静默降级"
      throw new AppError(
        502,
        "VIDEO_COMPRESSION_FAILED",
        `视频压缩失败: ffmpeg 执行错误。原始视频 ${Math.round(inputBytes.byteLength / 1024)}KB 超过 LLM inline_data 限制 (1MB)，需要 ffmpeg 进行压缩。请确保系统中已安装 ffmpeg 或通过 FFMPEG_BIN 环境变量配置 ffmpeg 路径。错误详情: ${errorMsg}`
      );
    }

    // 读取压缩后的视频
    const compressedBytes = await readFile(outputFile);
    const finalMimeType = "video/mp4"; // 压缩后统一为 mp4

    // 验证输出文件包含视频轨道
    if (!hasVideoTrack(compressedBytes)) {
      throw new AppError(
        502,
        "VIDEO_NO_VIDEO_TRACK",
        `ffmpeg 压缩后文件仍不包含视频轨道（可能是纯音频文件）。原始大小: ${Math.round(inputBytes.byteLength / 1024)}KB, 输入 MIME: ${originalMimeType}。原始文件可能不是有效的视频。`
      );
    }

    logger.info(
      {
        originalSize: inputBytes.byteLength,
        compressedSize: compressedBytes.byteLength,
        compressionRatio: `${Math.round((compressedBytes.byteLength / inputBytes.byteLength) * 100)}%`
      },
      "video compression: video compressed successfully"
    );

    return { compressedBytes, mimeType: finalMimeType };
  } finally {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true });
  }
}