import { resolve } from "node:path";
import type { AppConfig } from "../../contracts/types.js";
import type { MusicAtmosphereCategory } from "../../contant-config/style-atmosphere-dict.js";
import { MUSIC_ATMOSPHERE_OPTIONS } from "../../contant-config/style-atmosphere-dict.js";

export interface VideoMusicRuntimeConfig {
  enabled: boolean;
  allowedAtmospheres: MusicAtmosphereCategory[];
  defaultAtmospheres: MusicAtmosphereCategory[];
  storageDir: string;
  publicBaseUrl: string;
  visitUrl: string;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

/** 验证并转换音乐氛围为统一字典类型 */
function parseVideoMusicAtmosphereList(value: string | null | undefined, fallback: MusicAtmosphereCategory[]): MusicAtmosphereCategory[] {
  const parsed = uniqueNonEmpty(String(value ?? "").split(/[,，]/u));
  // 过滤到统一字典中的有效值
  const valid = parsed.filter(v => MUSIC_ATMOSPHERE_OPTIONS.includes(v as MusicAtmosphereCategory)) as MusicAtmosphereCategory[];
  return valid.length > 0 ? valid : [...fallback];
}

function normalizePublicBaseUrl(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim().replace(/\/+$/u, "");
  if (!trimmed) {
    return "/video-music";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function resolveVideoMusicConfig(
  config: Pick<
    AppConfig,
    | "videoMusicEnabled"
    | "videoMusicAllowedAtmospheres"
    | "videoMusicDefaultAtmospheres"
    | "videoMusicPathPrefix"
    | "videoMusicPublicBaseUrl"
    | "videoMusicVisitUrl"
  >,
): VideoMusicRuntimeConfig {
  const allowedAtmospheres = parseVideoMusicAtmosphereList(
    config.videoMusicAllowedAtmospheres,
    ["欢快", "阳光", "动感", "浪漫", "轻松", "空灵", "抒情", "宁静", "古风", "悲壮"] as MusicAtmosphereCategory[],
  );
  const defaultAtmospheres = parseVideoMusicAtmosphereList(
    config.videoMusicDefaultAtmospheres,
    ["轻松", "阳光"] as MusicAtmosphereCategory[],
  ).filter((item) => allowedAtmospheres.includes(item));
  return {
    enabled: Boolean(config.videoMusicEnabled),
    allowedAtmospheres,
    defaultAtmospheres: defaultAtmospheres.length > 0 ? defaultAtmospheres : allowedAtmospheres.slice(0, 2),
    storageDir: resolve(process.cwd(), config.videoMusicPathPrefix.trim() || "data/video-music"),
    publicBaseUrl: normalizePublicBaseUrl(config.videoMusicPublicBaseUrl),
    visitUrl: String(config.videoMusicVisitUrl ?? "").trim(),
  };
}
