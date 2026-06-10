import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import { getOssService } from "../../service/oss/oss-service.js";

export interface WaveToneFileOptions {
  durationSec: number;
  frequencyHz: number;
  volume?: number;
  sampleRate?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 生成正弦波 WAV 音频 Buffer
 * 用于系统默认音乐库的 AI 合成音乐
 * @param options 音频参数
 * @returns WAV 文件 Buffer
 */
export function generateWaveToneBuffer(options: WaveToneFileOptions): Buffer {
  const sampleRate = Math.max(8_000, Math.floor(options.sampleRate ?? 44_100));
  const durationSec = clamp(options.durationSec, 1, 90);
  const frequencyHz = clamp(options.frequencyHz, 80, 2_000);
  const volume = clamp(options.volume ?? 0.22, 0.02, 0.95);
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSec));
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // WAV 文件头
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(1, 22); // num channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  // 正弦波音频数据（带渐入渐出包络）
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(1, t / 0.15, (durationSec - t) / 0.25);
    const sample = Math.sin(2 * Math.PI * frequencyHz * t) * volume * clamp(envelope, 0, 1);
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + index * bytesPerSample);
  }

  return buffer;
}

/**
 * 确保 WAV 音频文件存在（本地磁盘 fallback）
 * 如果文件已存在则跳过，否则生成并写入
 * @param filePath 本地文件路径
 * @param options 音频参数
 */
export async function ensureWaveToneFile(filePath: string, options: WaveToneFileOptions): Promise<void> {
  if (existsSync(filePath)) {
    return;
  }
  await mkdir(dirname(filePath), { recursive: true });
  const buffer = generateWaveToneBuffer(options);
  await writeFile(filePath, buffer);
}

/**
 * 上传 WAV 音频到对象存储（OSS）
 * @param storage 存储适配器
 * @param key OSS 存储路径（如 video-music/music-sunrise.wav）
 * @param options 音频参数
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果 { key, url }
 */
export async function uploadWaveToneToStorage(
  storage: IObjectStorageAdapter,
  key: string,
  options: WaveToneFileOptions,
  publicBaseUrl?: string,
): Promise<{ key: string; url: string }> {
  const buffer = generateWaveToneBuffer(options);
  const ossService = getOssService(storage, { publicBaseUrl });
  const result = await ossService.upload(key, buffer, "audio/wav");
  if (!result.success) {
    throw new Error(`上传音乐文件失败: ${result.message}`);
  }
  return { key: result.key, url: result.url };
}

/**
 * 上传音乐文件到对象存储（OSS）
 * @param storage 存储适配器
 * @param key OSS 存储路径
 * @param bytes 音频文件字节
 * @param contentType MIME 类型
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果 { key, url }
 */
export async function uploadVideoMusicToStorage(
  storage: IObjectStorageAdapter,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  publicBaseUrl?: string,
): Promise<{ key: string; url: string }> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const result = await ossService.upload(key, bytes, contentType);
  if (!result.success) {
    throw new Error(`上传音乐文件失败: ${result.message}`);
  }
  return { key: result.key, url: result.url };
}

/**
 * 从远程 URL 下载音乐文件并上传到 OSS
 * @param sourceUrl 远程音乐 URL
 * @param storage 存储适配器
 * @param key OSS 存储路径
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @param fetchImpl fetch 实现（可选）
 * @returns 上传结果 { key, url }
 */
export async function downloadAndUploadVideoMusic(
  sourceUrl: string,
  storage: IObjectStorageAdapter,
  key: string,
  publicBaseUrl?: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs?: number,
): Promise<{ key: string; url: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 120_000);
  try {
    const response = await fetchImpl(sourceUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`下载音乐失败: ${response.status} ${response.statusText}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1) {
      throw new Error("下载的音乐文件为空");
    }
    // 根据文件扩展名推断 MIME 类型
    const extension = key.split(".").pop()?.toLowerCase() ?? "mp3";
    const contentType = extension === "wav" ? "audio/wav" : "audio/mpeg";
    return uploadVideoMusicToStorage(storage, key, bytes, contentType, publicBaseUrl);
  } finally {
    clearTimeout(timer);
  }
}

// ========== 本地磁盘 fallback 函数（保留用于降级场景） ==========

export async function writeVideoMusicFile(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

export async function downloadVideoMusicFile(
  sourceUrl: string,
  filePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(`download video music failed: ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1) {
    throw new Error("downloaded video music is empty");
  }
  await writeVideoMusicFile(filePath, bytes);
}
