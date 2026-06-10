import { describe, expect, it } from "vitest";
import {
  buildExportMusicMixArgs,
  normalizeExportMusicMixOptions,
} from "../src/modules/fission-export-music-mix";

describe("fission export music mix", () => {
  it("normalizes music mix defaults for step5 exports", () => {
    expect(
      normalizeExportMusicMixOptions({
        musicUrl: "/video-music/music-1.wav",
        musicVolume: null,
        musicFadeInSec: null,
        musicFadeOutSec: null,
      }),
    ).toEqual({
      musicUrl: "/video-music/music-1.wav",
      musicVolume: 0.22,
      musicFadeInSec: 0.6,
      musicFadeOutSec: 1.4,
    });
  });

  it("builds an ffmpeg mix command that keeps video and overlays the selected bgm", () => {
    const args = buildExportMusicMixArgs({
      videoFile: "merged.mp4",
      musicFile: "music.wav",
      outputFile: "final.mp4",
      videoDurationSec: 12.5,
      hasOriginalAudio: true,
      music: {
        musicUrl: "/video-music/music-1.wav",
        musicVolume: 0.3,
        musicFadeInSec: 0.5,
        musicFadeOutSec: 1.2,
      },
    });

    expect(args).toContain("merged.mp4");
    expect(args).toContain("music.wav");
    expect(args).toContain("final.mp4");
    const filterComplex = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(filterComplex).toContain("volume=0.3");
    expect(filterComplex).toContain("amix=inputs=2");
    expect(filterComplex).toContain("afade=t=out:st=11.3:d=1.2");
    expect(args).toContain("-shortest");
  });
});
