import { describe, expect, it } from "vitest";
import {
  resolveStep5MusicRecommendationSource,
  resolveStep5MusicSelection,
} from "../apps/web/pages/project-flow/step5-delivery-shell/step5MusicRecommendationController";

describe("step5 music recommendation controller", () => {
  it("prefers project script text over handoff and title fallback", () => {
    const source = resolveStep5MusicRecommendationSource(
      {
        script: [
          {
            title: "镜头 1",
            content: "城市通勤穿搭",
            visualCue: "阳光街景",
          },
        ],
      },
      null,
      "标题 A",
    );
    expect(source.source).toBe("project_script");
    expect(source.scriptText).toContain("城市通勤穿搭");
  });

  it("falls back to title shell when no script or handoff exists", () => {
    const source = resolveStep5MusicRecommendationSource(
      {},
      {
        projectId: "p1",
        scriptId: null,
        finalVideoUrl: null,
        clipVideoUrls: [],
        coverImageUrl: null,
        titleCandidates: ["候选标题 B"],
        squarePublishCategory: null,
        sourceStep: "step4",
      },
      "标题 A",
    );
    expect(source.source).toBe("title_shell");
    expect(source.scriptText).toContain("标题 A");
    expect(source.scriptText).toContain("候选标题 B");
  });

  it("prefers explicit selected music id over recommendation fallback", () => {
    const selection = resolveStep5MusicSelection(
      "music-2",
      [
        {
          id: "music-1",
          title: "音乐 1",
          musicUrl: "/m1.wav",
          localPath: null,
          sourceUrl: null,
          atmospheres: ["轻松"],
          durationSec: 24,
          artist: null,
          album: null,
          coverUrl: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "music-2",
          title: "音乐 2",
          musicUrl: "/m2.wav",
          localPath: null,
          sourceUrl: null,
          atmospheres: ["阳光"],
          durationSec: 24,
          artist: null,
          album: null,
          coverUrl: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        success: true,
        music: {
          id: "music-1",
          title: "音乐 1",
          musicUrl: "/m1.wav",
          localPath: null,
          sourceUrl: null,
          atmospheres: ["轻松"],
          durationSec: 24,
          artist: null,
          album: null,
          coverUrl: null,
          createdAt: 1,
          updatedAt: 1,
        },
        matchedAtmosphere: "轻松",
        candidateAtmospheres: ["轻松"],
        usedDefault: false,
      },
    );
    expect(selection?.id).toBe("music-2");
  });
});
