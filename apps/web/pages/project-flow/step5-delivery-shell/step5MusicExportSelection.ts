import type { VideoExportMusicOptions } from "../../../../../src/contracts/video-export-contract";

// 音乐 payload 类型（简化版，不再依赖 step4MusicController）
interface Step4MusicPayload {
  musics: Array<{ id: string; title?: string; musicUrl?: string }>;
  selectedMusicId: string | null;
}

const DEFAULT_STEP5_MUSIC_VOLUME = 0.22;
const DEFAULT_STEP5_MUSIC_FADE_IN_SEC = 0.6;
const DEFAULT_STEP5_MUSIC_FADE_OUT_SEC = 1.4;

export function buildStep5SelectedMusicExportOptions(
  payload: Step4MusicPayload | null,
): VideoExportMusicOptions | null {
  const musicUrl = payload?.musics?.find(m => m.id === payload.selectedMusicId)?.musicUrl?.trim() || "";
  if (!musicUrl) {
    return null;
  }
  return {
    musicUrl,
    musicVolume: DEFAULT_STEP5_MUSIC_VOLUME,
    musicFadeInSec: DEFAULT_STEP5_MUSIC_FADE_IN_SEC,
    musicFadeOutSec: DEFAULT_STEP5_MUSIC_FADE_OUT_SEC,
  };
}
