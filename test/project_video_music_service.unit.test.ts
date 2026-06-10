import { describe, expect, it } from "vitest";
import type { ProjectVideoMusic, BatchSaveProjectVideoMusicInput } from "../src/contracts/types.js";

// 类型编译测试
describe("project video music types (unit)", () => {
  it("BatchSaveProjectVideoMusicInput type compiles correctly", async () => {
    const input: BatchSaveProjectVideoMusicInput = {
      musicId: "music-001",
      musicUrl: "https://example.com/music.mp3",
      volume: 0.5,
      fadeInSec: 0,
      fadeOutSec: 0,
    };

    expect(input.musicId).toBe("music-001");
    expect(input.musicUrl).toBe("https://example.com/music.mp3");
  });

  it("ProjectVideoMusic type has required fields", () => {
    const record: ProjectVideoMusic = {
      id: "pvm-001",
      projectId: "project-001",
      musicId: "music-001",
      musicUrl: "https://example.com/music.mp3",
      volume: 0.5,
      fadeInSec: 0,
      fadeOutSec: 0,
      isSelected: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(record.id).toBe("pvm-001");
    expect(record.isSelected).toBe(true);
  });
});