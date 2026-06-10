import type { Resolution } from "./types.js";

export interface VideoExportMusicOptions {
  musicUrl: string | null;
  musicVolume: number | null;
  musicFadeInSec: number | null;
  musicFadeOutSec: number | null;
}

export interface VideoExportRequestPayload {
  resolution: Resolution;
  clipVideoUrls: string[];
  music: VideoExportMusicOptions | null;
  /** 卡点对齐的转场偏移量（秒），由前端节拍分析预计算 */
  transitionOffsetsSec?: number[];
  /** 卡点对齐的转场时长（秒） */
  transitionDurationsSec?: number[];
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeVideoExportMusicOptions(input: unknown): VideoExportMusicOptions | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const musicUrl = String(record.musicUrl ?? "").trim();
  if (!musicUrl) {
    return null;
  }
  return {
    musicUrl,
    musicVolume: clampNumber(record.musicVolume, 0, 1),
    musicFadeInSec: clampNumber(record.musicFadeInSec, 0, 10),
    musicFadeOutSec: clampNumber(record.musicFadeOutSec, 0, 10),
  };
}

export function normalizeVideoExportRequestPayload(input: unknown): VideoExportRequestPayload {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const resolution =
    typeof record.resolution === "string" && record.resolution.trim().length > 0
      ? (record.resolution.trim() as Resolution)
      : ("720p" as Resolution);
  const clipVideoUrls = Array.isArray(record.clipVideoUrls)
    ? record.clipVideoUrls.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0)
    : [];
  const transitionOffsetsSec = Array.isArray(record.transitionOffsetsSec)
    ? record.transitionOffsetsSec.map((v: unknown) => Number(v)).filter(Number.isFinite)
    : undefined;
  const transitionDurationsSec = Array.isArray(record.transitionDurationsSec)
    ? record.transitionDurationsSec.map((v: unknown) => Number(v)).filter(Number.isFinite)
    : undefined;

  return {
    resolution,
    clipVideoUrls,
    music: normalizeVideoExportMusicOptions(record.music ?? null),
    transitionOffsetsSec: transitionOffsetsSec?.length ? transitionOffsetsSec : undefined,
    transitionDurationsSec: transitionDurationsSec?.length ? transitionDurationsSec : undefined,
  };
}
