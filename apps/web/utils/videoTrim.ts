/**
 * ffmpeg.wasm 视频裁切工具
 *
 * 使用 ffmpeg.wasm 在前端裁切视频，保留音频
 * 输出 MP4 格式，无损裁切（stream copy）
 *
 * 加载方式：本地 public/ffmpeg/ 目录，不依赖 CDN
 * Worker 文件已内联依赖，避免 node_modules 路径解析问题
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

/**
 * 加载 ffmpeg.wasm 核心
 *
 * 使用 classWorkerURL 指定本地 Worker 文件，
 * 避免 Vite dev server 中 new URL("./worker.js", import.meta.url) 解析失败
 */
async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  ffmpegInstance = new FFmpeg();

  const baseURL = "/ffmpeg";

  // 直接传 URL 字符串，不转 blob URL
  // Worker 内部通过 import() 加载同源 URL，blob URL 在 Worker import 中不可靠
  await ffmpegInstance.load({
    classWorkerURL: `${baseURL}/ffmpeg-worker.js`,
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });

  ffmpegLoaded = true;
  return ffmpegInstance;
}

/**
 * 裁切视频前 N 秒（stream copy，保留音频）
 */
export async function trimVideoWithFfmpeg(
  file: File,
  maxDuration: number = 30,
  onProgress?: (percent: number) => void
): Promise<File> {
  const ffmpeg = await loadFfmpeg();

  const duration = await getVideoDuration(file);
  if (duration <= maxDuration) {
    return file;
  }

  onProgress?.(0);

  const inputFileName = "input" + getFileExtension(file.name);
  const outputFileName = "output.mp4";

  await ffmpeg.writeFile(inputFileName, await fetchFile(file));

  onProgress?.(10);

  // stream copy 音视频，无损且快速
  await ffmpeg.exec([
    "-i", inputFileName,
    "-t", String(maxDuration),
    "-c", "copy",
    "-movflags", "+faststart",
    outputFileName,
  ]);

  onProgress?.(80);

  const data = await ffmpeg.readFile(outputFileName);

  onProgress?.(90);

  await ffmpeg.deleteFile(inputFileName);
  await ffmpeg.deleteFile(outputFileName);

  onProgress?.(100);

  const trimmedBlob = new Blob([data as BlobPart], { type: "video/mp4" });
  return new File(
    [trimmedBlob],
    file.name.replace(/\.[^.]+$/, "_trimmed.mp4"),
    { type: "video/mp4" }
  );
}

/**
 * 获取视频时长（秒）
 */
async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("无法加载视频"));
    };
  });
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return "." + ext;
  }
  return ".mp4";
}

/**
 * 浏览器是否支持视频裁切
 */
export function isFfmpegWasmSupported(): boolean {
  return true;
}
