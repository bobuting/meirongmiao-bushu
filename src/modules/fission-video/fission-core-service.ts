/**
 * 视频裂变核心服务
 * 实现镜像提取、随机选择、视频合并等核心功能
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type { TransitionInfo } from "../../contracts/types.js";

// ==================== 常量定义 ====================

/**
 * 可用的转场效果列表（22种）
 * 对应前端 apps/web/src/modules/transitions/index.ts 中注册的转场
 */
const AVAILABLE_TRANSITIONS = [
  "fade",
  "slide",
  "zoom",
  "blinds",
  "dissolve",
  "crossDissolve",
  "cut",
  "wipe",
  "mask",
  "whipPan",
  "rotate",
  "flash",
  "glitch",
  "ink",
  "mosaic",
  "timeSlice",
  "follow",
  "actionMatch",
  "shapeMatch",
  "gazeMatch",
  "sound",
  "causal",
] as const;

type TransitionName = (typeof AVAILABLE_TRANSITIONS)[number];

/**
 * 最大视频片段数量
 */
const MAX_CLIP_COUNT = 16;

// ==================== Step 4: 镜像提取函数 ====================

/**
 * 从视频URL中提取镜像标志
 * 例如: /storage/objects/projects/xxx/step4/video-jobs/xxx/clip-1/xxx.mp4 -> clip-1
 * @param videoUrl 视频URL
 * @returns 镜像标志，如 "clip-1", "clip-2" 等
 */
export function extractClipId(videoUrl: string): string {
  // 尝试匹配 clip-{数字} 模式
  const match = videoUrl.match(/clip-(\d+)/i);
  if (match) {
    return `clip-${match[1]}`;
  }

  // 如果匹配失败，使用URL最后一部分作为fallback
  const parts = videoUrl.split("/");
  const lastPart = parts.pop()?.split(".")[0] || "unknown";
  return `clip-${lastPart.slice(-4)}`;
}

// ==================== Step 5: 随机镜像选择函数 ====================

/**
 * 从镜像数组中随机选择指定数量的镜像（不重复）
 * @param clipUrls 镜像URL数组
 * @param count 需要选择的数量
 * @returns 随机选择的镜像URL数组
 */
export function selectRandomClips(clipUrls: string[], count: number = 3): string[] {
  if (clipUrls.length === 0) {
    return [];
  }

  // 如果镜像数量不足，返回所有镜像
  if (clipUrls.length <= count) {
    return [...clipUrls];
  }

  // Fisher-Yates 洗牌算法
  const shuffled = [...clipUrls];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

/**
 * 从镜像数组中随机选择指定数量的镜像，并返回其ID
 * @param clipUrls 镜像URL数组
 * @param count 需要选择的数量
 * @returns 随机选择的镜像信息（URL和ID）
 */
export function selectRandomClipsWithIds(
  clipUrls: string[],
  count: number = 3
): Array<{ url: string; id: string }> {
  const selectedUrls = selectRandomClips(clipUrls, count);
  return selectedUrls.map((url) => ({
    url,
    id: extractClipId(url),
  }));
}

// ==================== Step 6: 转场效果随机选择 ====================

/**
 * 随机选择一个转场效果
 * @returns 转场名称
 */
export function selectRandomTransition(): TransitionName {
  const randomIndex = Math.floor(Math.random() * AVAILABLE_TRANSITIONS.length);
  return AVAILABLE_TRANSITIONS[randomIndex];
}

/**
 * 获取所有可用的转场效果名称
 * @returns 转场效果名称数组
 */
export function getAvailableTransitions(): readonly TransitionName[] {
  return AVAILABLE_TRANSITIONS;
}

/**
 * 创建转场信息
 * @param transitionType 指定的转场类型，不提供则随机选择
 * @param durationFrames 转场时长（帧数），FreeCut 模式默认 15帧 = 0.5秒 @ 30fps
 * @returns 转场信息对象
 */
export function createTransitionInfo(
  transitionType?: string,
  durationFrames: number = 15  // FreeCut 默认 15帧
): TransitionInfo {
  const type = transitionType && AVAILABLE_TRANSITIONS.includes(transitionType as TransitionName)
    ? transitionType
    : selectRandomTransition();
  return {
    type,
    durationFrames,  // FreeCut 帧数模式
    random: !transitionType, // 如果未指定类型，标记为随机选择
  };
}

// ==================== Step 7: 视频合并逻辑 ====================

/**
 * 判断URL是否为HTTP URL
 */
function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 规范化视频URL数组
 */
function normalizeClipVideoUrls(urls: string[] | undefined): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }
  const normalized = urls.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0);
  return [...new Set(normalized)].slice(0, MAX_CLIP_COUNT);
}

/**
 * 获取视频文件扩展名
 */
function resolveVideoExtension(url: string): string {
  const plain = url.split("?")[0] ?? "";
  const extension = extname(plain).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".m4v", ".ts"].includes(extension)) {
    return extension;
  }
  return ".mp4";
}

/**
 * 规范化concat列表中的文件路径
 */
function normalizeConcatListPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

/**
 * 执行命令行命令
 */
async function execute(
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
 * 视频合并选项
 */
export interface VideoMergeOptions {
  clipVideoUrls: string[];        // 视频片段URL列表
  transitionDurationFrames?: number;  // FreeCut 帧数模式
  outputWidth?: number;           // 输出宽度
  outputHeight?: number;          // 输出高度
  onProgress?: (percent: number, message: string) => void;
  videoDownloadTimeoutMs?: number; // 视频下载超时时间（毫秒）
}

/**
 * 视频合并结果
 */
export interface VideoMergeResult {
  buffer: Buffer;                 // 合并后的视频数据
  durationSec: number;            // 视频时长（秒）
}

/**
 * 合并多个视频片段
 * 使用 ffmpeg 进行视频合并
 * @param options 合并选项
 * @returns 合并后的视频数据
 */
export async function mergeVideos(
  options: VideoMergeOptions
): Promise<VideoMergeResult> {
  const { clipVideoUrls, onProgress, videoDownloadTimeoutMs } = options;

  if (clipVideoUrls.length === 0) {
    throw new Error("没有视频片段需要合并");
  }

  onProgress?.(0, "准备合并视频...");

  // 创建临时目录
  const tempDir = await mkdtemp(join(tmpdir(), "fission-merge-"));

  try {
    const inputFiles: string[] = [];

    // 下载所有视频片段
    for (let index = 0; index < clipVideoUrls.length; index++) {
      const url = clipVideoUrls[index];
      const extension = resolveVideoExtension(url);
      const localFile = join(tempDir, `clip-${String(index + 1).padStart(3, "0")}${extension}`);

      onProgress?.(
        Math.floor((index / clipVideoUrls.length) * 30),
        `下载视频片段 ${index + 1}/${clipVideoUrls.length}...`
      );

      await fetchAndSaveVideo(url, localFile, videoDownloadTimeoutMs);
      inputFiles.push(localFile);
    }

    if (inputFiles.length === 0) {
      throw new Error("没有可用的视频片段");
    }

    // 创建 concat 列表文件
    const concatFile = join(tempDir, "concat-list.txt");
    const concatBody = inputFiles.map((item) => `file '${normalizeConcatListPath(item)}'`).join("\n");
    await writeFile(concatFile, concatBody, "utf8");

    onProgress?.(40, "合并视频片段...");

    // 执行 ffmpeg 合并
    const outputFile = join(tempDir, `merged-${Date.now()}.mp4`);
    const ffmpegBin = (process.env.FFMPEG_BIN ?? "ffmpeg").trim() || "ffmpeg";

    // 首先尝试 copy 模式（快速合并）
    const copyMode = await execute(ffmpegBin, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-c", "copy",
      outputFile,
    ]);

    if (!copyMode.ok) {
      // copy 模式失败，尝试转码模式
      onProgress?.(50, "重新编码视频...");
      const transcodeMode = await execute(ffmpegBin, [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatFile,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",
        outputFile,
      ]);

      if (!transcodeMode.ok) {
        throw new Error(
          `ffmpeg 合并失败; copy=${copyMode.stderr.slice(-200)}; transcode=${transcodeMode.stderr.slice(-200)}`
        );
      }
    }

    onProgress?.(80, "读取合并结果...");

    // 读取合并后的视频
    const mergedBytes = await readFile(outputFile);
    if (mergedBytes.byteLength < 1) {
      throw new Error("合并后的视频为空");
    }

    // 获取视频时长（使用 ffprobe）
    const durationSec = await getVideoDuration(outputFile);

    onProgress?.(100, "合并完成");

    return {
      buffer: mergedBytes,
      durationSec,
    };
  } finally {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * 获取视频时长
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  const ffprobeBin = (process.env.FFPROBE_BIN ?? "ffprobe").trim() || "ffprobe";
  const result = await execute(ffprobeBin, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);

  if (result.ok) {
    const duration = parseFloat(result.stderr.trim());
    if (!isNaN(duration)) {
      return Math.round(duration);
    }
  }

  // 无法获取时长，返回估算值
  return 0;
}

/**
 * 下载视频并保存到本地
 */
async function fetchAndSaveVideo(url: string, outputPath: string, timeoutMs?: number): Promise<void> {
  // 如果是本地文件路径
  if (!isHttpUrl(url)) {
    const localPath = resolveLocalPath(url);
    if (localPath && existsSync(localPath)) {
      await copyFile(localPath, outputPath);
      return;
    }
  }

  // HTTP 下载
  const fetchUrl = resolveFetchUrl(url);
  if (!fetchUrl) {
    throw new Error(`无效的视频URL: ${url}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 300_000);

  try {
    const response = await fetch(fetchUrl, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`下载视频失败: HTTP ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength < 1) {
      throw new Error(`下载的视频为空: ${fetchUrl}`);
    }

    await writeFile(outputPath, bytes);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 解析本地文件路径
 */
function resolveLocalPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  // 检查是否是本地绝对路径
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }

  // 检查是否是相对路径
  if (trimmed.startsWith("/storage/objects/")) {
    const relativePath = trimmed.replace("/storage/objects/", "");
    const storageRoot = process.env.OBJECT_STORAGE_LOCAL_DIR || "./storage/objects";
    return resolve(join(storageRoot, relativePath));
  }

  return null;
}

/**
 * 解析获取URL
 */
function resolveFetchUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  // 转换本地路径为服务器URL
  if (trimmed.startsWith("/")) {
    const baseUrl = process.env.SERVER_BASE_URL || "http://localhost:3021";
    return `${baseUrl}${trimmed}`;
  }

  return null;
}

// ==================== Step 8: 视频上传存储 ====================

/**
 * 生成裂变视频存储路径
 * @param projectId 项目ID
 * @param clipIds 镜像ID数组
 * @returns 存储路径
 */
export function generateFissionVideoPath(projectId: string, clipIds: string[]): string {
  const filename = `${clipIds.join("_")}.mp4`;
  return `projects/${projectId}/fission/${filename}`;
}

/**
 * 上传裂变视频到存储
 * @param storage 存储适配器
 * @param projectId 项目ID
 * @param clipIds 镜像ID数组
 * @param videoBuffer 视频数据
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 存储路径和访问URL
 */
export async function uploadFissionVideo(
  storage: IObjectStorageAdapter | null,
  projectId: string,
  clipIds: string[],
  videoBuffer: Buffer,
  publicBaseUrl?: string
): Promise<{ path: string; url: string }> {
  const path = generateFissionVideoPath(projectId, clipIds);

  if (storage) {
    await storage.putObject(path, videoBuffer, "video/mp4");
    const signedUrl = await storage.getSignedUrl(path);
    // 如果有签名 URL 且没有配置公开访问 URL，使用签名 URL
    if (signedUrl && signedUrl.startsWith("http") && !publicBaseUrl) {
      return { path, url: signedUrl };
    }
    // 如果配置了公开访问 URL，使用公开访问 URL
    if (publicBaseUrl) {
      return { path, url: `${publicBaseUrl}/${path}` };
    }
    return { path, url: signedUrl || path };
  }
  // 如果没有存储适配器，返回本地路径
  return { path, url: `/storage/objects/${path}` };
}

// ==================== Step 9: 镜像视频上传存储 ====================

/**
 * 生成镜像视频存储路径
 * @param projectId 项目ID
 * @param clipId 镜像ID
 * @returns 存储路径
 */
export function generateMirrorVideoPath(projectId: string, clipId: string): string {
  const filename = `mirror_${clipId}_${Date.now()}.mp4`;
  return `projects/${projectId}/mirror/${filename}`;
}

/**
 * 上传单个镜像视频到存储
 * @param storage 存储适配器
 * @param projectId 项目ID
 * @param clipId 镜像ID
 * @param videoBuffer 视频数据
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 存储路径和访问URL
 */
export async function uploadMirrorVideo(
  storage: IObjectStorageAdapter | null,
  projectId: string,
  clipId: string,
  videoBuffer: Buffer,
  publicBaseUrl?: string
): Promise<{ path: string; url: string }> {
  const path = generateMirrorVideoPath(projectId, clipId);

  if (storage) {
    await storage.putObject(path, videoBuffer, "video/mp4");
    const signedUrl = await storage.getSignedUrl(path);
    // 如果有签名 URL 且没有配置公开访问 URL，使用签名 URL
    if (signedUrl && signedUrl.startsWith("http") && !publicBaseUrl) {
      return { path, url: signedUrl };
    }
    // 如果配置了公开访问 URL，使用公开访问 URL
    if (publicBaseUrl) {
      return { path, url: `${publicBaseUrl}/${path}` };
    }
    return { path, url: signedUrl || `/storage/objects/${path}` };
  }

  // 如果没有存储适配器，返回本地路径
  return { path, url: `/storage/objects/${path}` };
}

/**
 * 批量上传镜像视频到存储
 * @param storage 存储适配器
 * @param projectId 项目ID
 * @param videos 镜像视频数组（clipId + buffer）
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果数组（clipId + path + url）
 */
export async function uploadMirrorVideos(
  storage: IObjectStorageAdapter | null,
  projectId: string,
  videos: Array<{ clipId: string; buffer: Buffer }>,
  publicBaseUrl?: string
): Promise<Array<{ clipId: string; path: string; url: string }>> {
  const results: Array<{ clipId: string; path: string; url: string }> = [];

  for (const video of videos) {
    const result = await uploadMirrorVideo(storage, projectId, video.clipId, video.buffer, publicBaseUrl);
    results.push({
      clipId: video.clipId,
      path: result.path,
      url: result.url,
    });
  }

  return results;
}

// ==================== 导出所有函数 ====================

export const FissionCoreService = {
  // Step 4
  extractClipId,
  // Step 5
  selectRandomClips,
  selectRandomClipsWithIds,
  // Step 6
  selectRandomTransition,
  getAvailableTransitions,
  createTransitionInfo,
  // Step 7
  mergeVideos,
  // Step 8
  generateFissionVideoPath,
  uploadFissionVideo,
  // Step 9
  generateMirrorVideoPath,
  uploadMirrorVideo,
  uploadMirrorVideos,
};