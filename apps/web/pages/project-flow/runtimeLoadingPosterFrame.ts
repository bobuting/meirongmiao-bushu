import { useEffect, useState } from "react";

let runtimeLoadingPosterFrameCache: Record<string, string> = {};
let runtimeLoadingPosterFramePromiseCache: Record<string, Promise<string>> = {};

function buildPosterCacheKey(videoSrc: string, fallbackPosterSrc: string): string {
  return `${videoSrc}::${fallbackPosterSrc}`;
}

export function resolveRuntimeLoadingPosterFrameSrc(input: {
  videoSrc: string;
  fallbackPosterSrc: string;
}): Promise<string> {
  const cacheKey = buildPosterCacheKey(input.videoSrc, input.fallbackPosterSrc);
  if (runtimeLoadingPosterFrameCache[cacheKey]) {
    return Promise.resolve(runtimeLoadingPosterFrameCache[cacheKey] as string);
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(input.fallbackPosterSrc);
  }
  if (cacheKey in runtimeLoadingPosterFramePromiseCache) {
    return runtimeLoadingPosterFramePromiseCache[cacheKey] as Promise<string>;
  }

  runtimeLoadingPosterFramePromiseCache[cacheKey] = new Promise<string>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let timeoutId = 0;

    const finalize = (src: string) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      runtimeLoadingPosterFrameCache[cacheKey] = src;
      video.pause();
      video.removeAttribute("src");
      video.load();
      resolve(src);
    };

    const capture = () => {
      try {
        const width = Math.max(1, video.videoWidth || 780);
        const height = Math.max(1, video.videoHeight || 780);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          finalize(input.fallbackPosterSrc);
          return;
        }
        context.drawImage(video, 0, 0, width, height);
        finalize(canvas.toDataURL("image/jpeg", 0.9));
      } catch {
        finalize(input.fallbackPosterSrc);
      }
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = input.videoSrc;
    video.addEventListener("loadeddata", capture, { once: true });
    video.addEventListener("error", () => finalize(input.fallbackPosterSrc), { once: true });
    timeoutId = window.setTimeout(() => finalize(input.fallbackPosterSrc), 2500);
    video.load();
  }).finally(() => {
    delete runtimeLoadingPosterFramePromiseCache[cacheKey];
  });

  return runtimeLoadingPosterFramePromiseCache[cacheKey] as Promise<string>;
}

export function useRuntimeLoadingPosterFrameSrc(input: {
  videoSrc: string;
  fallbackPosterSrc: string;
}): string {
  const cacheKey = buildPosterCacheKey(input.videoSrc, input.fallbackPosterSrc);
  const [src, setSrc] = useState<string>(runtimeLoadingPosterFrameCache[cacheKey] ?? input.fallbackPosterSrc);

  useEffect(() => {
    let cancelled = false;
    void resolveRuntimeLoadingPosterFrameSrc(input).then((resolved) => {
      if (!cancelled && resolved) {
        setSrc(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [input]);

  return src;
}
