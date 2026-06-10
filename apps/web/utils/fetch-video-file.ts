/**
 * 远程视频下载工具
 * 用于将 OSS 远程视频 URL 下载为本地 File 对象，供 WebCodecs 处理
 */

import { useAppStore } from "../store/useAppStore";

/**
 * OSS 公开访问域名（需要走代理下载避免跨域）
 */
const OSS_PUBLIC_BASE = "https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/";

/**
 * 后端代理下载路由前缀
 */
const PROXY_ROUTE_PREFIX = "/neirongmiao/api/storage/proxy/";

/**
 * 将 OSS 公开 URL 重写为后端代理 URL
 * 非 OSS URL（data URL、blob URL、其他域名）保持不变
 */
export function rewriteToProxyUrl(url: string): string {
  if (!url || !url.startsWith(OSS_PUBLIC_BASE)) {
    return url;
  }
  // 提取 OSS 路径部分（去掉域名前缀）
  const ossPath = url.slice(OSS_PUBLIC_BASE.length);
  // 拼接代理 URL
  return `${PROXY_ROUTE_PREFIX}${ossPath}`;
}

/**
 * 获取带鉴权信息的请求头
 * 从 Zustand store 获取 token
 */
function getAuthHeaders(): Record<string, string> {
  const token = useAppStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export interface DownloadProgress {
  phase: 'downloading' | 'processing';
  total: number;
  completed: number;
  currentFile: string;
  percent: number;
}

export interface DownloadOptions {
  urls: string[];
  maxConcurrency?: number;  // 最大并发数，默认 3
  maxRetries?: number;      // 最大重试次数，默认 2
  onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadResult {
  files: File[];
  errors: Array<{ url: string; error: Error }>;
}

/**
 * 从 URL 提取文件名
 */
function extractFilename(url: string, index: number): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || `clip-${index}.mp4`;
    // 确保文件名有扩展名
    if (!filename.match(/\.\w+$/)) {
      return `${filename}.mp4`;
    }
    return filename;
  } catch {
    return `clip-${index}.mp4`;
  }
}

/**
 * 下载单个视频文件
 */
async function downloadSingleVideo(
  url: string,
  index: number,
  options: { maxRetries: number }
): Promise<File> {
  const filename = extractFilename(url, index);
  let lastError: Error | null = null;

  // OSS URL 重写为后端代理 URL
  const fetchUrl = rewriteToProxyUrl(url);
  const isProxyUrl = fetchUrl !== url;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const headers = isProxyUrl ? getAuthHeaders() : undefined;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        mode: isProxyUrl ? 'same-origin' : 'cors',
        cache: 'default',
        ...(headers ? { headers } : {}),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const mimeType = blob.type || 'video/mp4';
      return new File([blob], filename, { type: mimeType });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < options.maxRetries) {
        // 指数退避延迟
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error(`下载失败: ${url}`);
}

/**
 * 批量下载远程视频文件
 * 支持并发控制、进度反馈、失败重试
 */
export async function downloadRemoteVideos(options: DownloadOptions): Promise<DownloadResult> {
  const {
    urls,
    maxConcurrency = 3,
    maxRetries = 2,
    onProgress,
  } = options;

  const files: File[] = [];
  const errors: Array<{ url: string; error: Error }> = [];

  if (urls.length === 0) {
    return { files, errors };
  }

  // 创建下载任务队列
  const total = urls.length;
  let completed = 0;

  // 分批处理
  for (let i = 0; i < urls.length; i += maxConcurrency) {
    const batch = urls.slice(i, i + maxConcurrency);

    const batchResults = await Promise.allSettled(
      batch.map((url, batchIndex) => {
        const globalIndex = i + batchIndex;
        onProgress?.({
          phase: 'downloading',
          total,
          completed,
          currentFile: extractFilename(url, globalIndex),
          percent: Math.round((completed / total) * 100),
        });
        return downloadSingleVideo(url, globalIndex, { maxRetries });
      })
    );

    // 处理批次结果
    batchResults.forEach((result, batchIndex) => {
      const globalIndex = i + batchIndex;
      const url = batch[batchIndex];

      if (result.status === 'fulfilled') {
        files[globalIndex] = result.value;
      } else {
        errors.push({
          url,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        });
      }
      completed++;
    });

    // 更新进度
    onProgress?.({
      phase: 'downloading',
      total,
      completed,
      currentFile: '',
      percent: Math.round((completed / total) * 100),
    });
  }

  // 过滤掉空位（失败的下载）
  const validFiles = files.filter((f): f is File => f !== undefined);

  return { files: validFiles, errors };
}

/**
 * 下载单个音频文件
 */
export async function downloadAudioFile(url: string): Promise<File> {
  // OSS URL 重写为后端代理 URL
  const fetchUrl = rewriteToProxyUrl(url);
  const isProxyUrl = fetchUrl !== url;

  const headers = isProxyUrl ? getAuthHeaders() : undefined;
  const response = await fetch(fetchUrl, {
    method: 'GET',
    mode: isProxyUrl ? 'same-origin' : 'cors',
    ...(headers ? { headers } : {}),
  });

  if (!response.ok) {
    throw new Error(`音频下载失败: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'audio/mpeg';
  const filename = url.split('/').pop() || 'background-music.mp3';

  return new File([blob], filename, { type: mimeType });
}

/**
 * 估算文件下载时间（基于文件大小和网络速度）
 */
export function estimateDownloadTime(
  fileSizeBytes: number,
  networkSpeedMbps: number = 10
): number {
  const bits = fileSizeBytes * 8;
  const megabits = bits / (1024 * 1024);
  return Math.ceil((megabits / networkSpeedMbps) * 1000); // 返回毫秒
}
