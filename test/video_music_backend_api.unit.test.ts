import { describe, expect, it, vi } from "vitest";
import {
  createVideoMusicMockBackendApi,
  createVideoMusicRealBackendApi,
} from "../apps/web/services/backendApi.videoMusic";

describe("video music backend api facade", () => {
  it("builds real api requests against the dedicated music routes", async () => {
    const request = vi.fn(async () => ({ enabled: true, items: [] }));
    const api = createVideoMusicRealBackendApi(request);

    await api.listVideoMusic("token-1", { search: "阳光" });
    await api.matchVideoMusicByScript("token-1", { scriptText: "一条阳光轻松的视频" });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "GET",
      "/api/video-music?search=%E9%98%B3%E5%85%89",
      { token: "token-1" },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/api/video-music/match-by-script",
      {
        token: "token-1",
        body: { scriptText: "一条阳光轻松的视频" },
      },
    );
  });

  it("returns deterministic mock matches for step5 fallback mode", async () => {
    const api = createVideoMusicMockBackendApi({
      mockDelay: async () => undefined,
    });
    const result = await api.matchVideoMusicByScript("token-1", {
      scriptText: "一条浪漫柔和的约会穿搭视频",
    });
    expect(result.success).toBe(true);
    expect(result.music?.title).toBe("微甜慢镜");
    expect(result.matchedAtmosphere).toBe("浪漫");
  });
});
