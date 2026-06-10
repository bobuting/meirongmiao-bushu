import { describe, expect, it, vi } from "vitest";
import {
  createVideoExportMockBackendApi,
  createVideoExportRealBackendApi,
} from "../apps/web/services/backendApi.videoExport";

describe("video export backend api facade", () => {
  it("builds real export requests with optional music payload", async () => {
    const request = vi.fn(async () => ({ url: "https://video.example.com/final.mp4", cost: 10 }));
    const api = createVideoExportRealBackendApi(request);

    await api.exportVideo(
      "token-1",
      "project-41",
      "720p",
      ["https://video.example.com/scene-1.mp4"],
      {
        musicUrl: "/video-music/music-1.wav",
        musicVolume: 0.22,
        musicFadeInSec: 0.6,
        musicFadeOutSec: 1.4,
      },
    );

    expect(request).toHaveBeenCalledWith("POST", "/projects/project-41/export", {
      token: "token-1",
      body: {
        resolution: "720p",
        clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
        music: {
          musicUrl: "/video-music/music-1.wav",
          musicVolume: 0.22,
          musicFadeInSec: 0.6,
          musicFadeOutSec: 1.4,
        },
      },
    });
  });

  it("keeps mock export behavior stable", async () => {
    const api = createVideoExportMockBackendApi({
      mockDelay: async () => undefined,
    });
    const result = await api.exportVideo("token-1", "project-41", "1080p");
    expect(result).toEqual({
      url: "https://example.local/export/project-41?resolution=1080p",
      cost: 20,
    });
  });
});
