import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../src/core/store.js";
import { ensureDefaultVideoMusicLibrary, matchVideoMusicByScript } from "../src/modules/video-music/video-music-service.js";

describe("video music service", () => {
  it("seeds default music entries and matches by script atmosphere", async () => {
    const store = new InMemoryStore();
    const seeded = await ensureDefaultVideoMusicLibrary(store);
    expect(seeded).toBeGreaterThan(0);
    expect(store.videoMusics.size).toBeGreaterThanOrEqual(4);

    const result = await matchVideoMusicByScript(
      store,
      "这是一条阳光通勤穿搭视频，画面节奏轻松，适合城市日常出街。",
    );

    expect(result.success).toBe(true);
    expect(result.music?.id).toBeTruthy();
    expect(result.candidateAtmospheres.length).toBeGreaterThan(0);
    expect(result.music?.musicUrl).toContain("/video-music/");
  });
});
