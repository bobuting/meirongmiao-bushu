import { describe, expect, it, vi } from "vitest";
import { runStep5DeliveryAction } from "../apps/web/pages/project-flow/step5-delivery-shell/step5DeliveryActionController";

describe("AT41-21 step5 delivery action controller", () => {
  it("exports and publishes through the dedicated action controller", async () => {
    const updateWorkflow = vi.fn();
    const pushTaskNotification = vi.fn();
    const exportVideo = vi.fn().mockResolvedValue({ url: "https://video.example.com/final.mp4" });

    const result = await runStep5DeliveryAction({
      action: "publish",
      api: {
        exportVideo,
        submitReview: vi.fn().mockResolvedValue({ id: "review-1" }),
      },
      token: "token-1",
      projectId: "project-41",
      projectName: "短视频企划",
      scriptId: "script-5",
      payload: {
        projectId: "project-41",
        scriptId: "script-5",
        finalVideoUrl: null,
        clipVideoUrls: ["https://video.example.com/scene-1.mp4", "https://video.example.com/scene-2.mp4"],
        coverImageUrl: null,
        titleCandidates: ["标题 A"],
        squarePublishCategory: null,
        sourceStep: "step4",
      },
      step4MusicPayload: {
        musicRecommendation: null,
        selectedMusicId: "music-1",
        selectedMusicUrl: "/video-music/music-1.wav",
        selectedMusicTitle: "晨光起片",
        selectedMusicAtmosphere: "阳光",
        musicSelectionSource: "auto_match",
      },
      updateWorkflow,
      pushTaskNotification,
      publishTitle: "标题 A",
      squarePublishCategory: "女装",
    });

    expect(result).toEqual({
      message: "导出完成，并已提交审核。",
      exportUrl: "https://video.example.com/final.mp4",
      reviewId: "review-1",
    });
    expect(updateWorkflow).toHaveBeenCalledWith({
      exportUrl: "https://video.example.com/final.mp4",
      projectStatus: "READY_TO_PUBLISH",
    });
    expect(updateWorkflow).toHaveBeenCalledWith({
      reviewId: "review-1",
    });
    expect(exportVideo).toHaveBeenCalledWith(
      "token-1",
      "project-41",
      "720p",
      ["https://video.example.com/scene-1.mp4", "https://video.example.com/scene-2.mp4"],
      {
        musicUrl: "/video-music/music-1.wav",
        musicVolume: 0.22,
        musicFadeInSec: 0.6,
        musicFadeOutSec: 1.4,
      },
    );
    expect(pushTaskNotification).toHaveBeenCalled();
  });

  it("requires a product short title when yellow-cart publishing is enabled", async () => {
    await expect(
      runStep5DeliveryAction({
        action: "publish-douyin",
        api: {
          exportVideo: vi.fn().mockResolvedValue({ url: "https://video.example.com/final.mp4" }),
          submitReview: vi.fn(),
          publishToDouyin: vi.fn(),
          getPublishJob: vi.fn(),
        },
        token: "token-1",
        projectId: "project-41",
        projectName: "短视频企划",
        scriptId: "script-5",
        payload: {
          projectId: "project-41",
          scriptId: "script-5",
          finalVideoUrl: null,
          clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
          coverImageUrl: null,
          titleCandidates: ["标题 A"],
          squarePublishCategory: "女装",
          sourceStep: "step4",
        },
        step4MusicPayload: null,
        updateWorkflow: vi.fn(),
        pushTaskNotification: vi.fn(),
        douyinPublishTitle: "短视频企划：抖音发布标题",
        douyinProductLink: "https://shop.example.com/item-1",
        douyinProductTitle: "   ",
        squarePublishCategory: "女装",
      }),
    ).rejects.toThrow("挂小黄车时，请先填写商品短标题。");
  });

  it("trims yellow-cart short title and strips project prefix before publishing", async () => {
    const publishToDouyin = vi.fn().mockResolvedValue({ jobId: "job-1", status: "pending" });

    const result = await runStep5DeliveryAction({
      action: "publish-douyin",
      api: {
        exportVideo: vi.fn().mockResolvedValue({ url: "https://video.example.com/final.mp4" }),
        submitReview: vi.fn(),
        publishToDouyin,
        getPublishJob: vi.fn(),
      },
      token: "token-1",
      projectId: "project-41",
      projectName: "短视频企划",
      scriptId: "script-5",
      payload: {
        projectId: "project-41",
        scriptId: "script-5",
        finalVideoUrl: null,
        clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
        coverImageUrl: null,
        titleCandidates: ["标题 A"],
        squarePublishCategory: "男装",
        sourceStep: "step4",
      },
      step4MusicPayload: null,
      updateWorkflow: vi.fn(),
      pushTaskNotification: vi.fn(),
      douyinPublishTitle: "短视频企划：这是一个超过三十个字符的抖音发布标题用于测试裁剪结果",
      douyinPublishTags: ["通勤", "都市"],
      douyinPublishLinkUrl: "https://content.example.com/detail",
      douyinProductLink: "https://shop.example.com/item-1",
      douyinProductTitle: "123456789012345",
      douyinPublishDate: 1742832000000,
      squarePublishCategory: "男装",
    });

    expect(result).toEqual({
      message: "导出完成，抖音发布任务已创建。",
      exportUrl: "https://video.example.com/final.mp4",
      reviewId: null,
      publishJobId: "job-1",
    });
    expect(publishToDouyin).toHaveBeenCalledTimes(1);
    const publishPayload = publishToDouyin.mock.calls[0]?.[2];
    expect(publishPayload).toMatchObject({
      tags: ["通勤", "都市"],
      videoFilePath: "https://video.example.com/final.mp4",
      linkUrl: null,
      productLink: "https://shop.example.com/item-1",
      productTitle: "1234567890",
      publishDate: 1742832000000,
    });
    expect(publishPayload?.title).toBe("这是一个超过三十个字符的抖音发布标题用于测试裁剪结果");
    expect(publishPayload?.title).not.toContain("短视频企划");
    expect((publishPayload?.title?.length ?? 0) <= 30).toBe(true);
  });
});
