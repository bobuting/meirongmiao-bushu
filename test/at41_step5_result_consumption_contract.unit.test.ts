import { describe, expect, it } from "vitest";
import {
  buildStep5DeliveryProjectDataPatch,
  buildStep5TitleCandidates,
  resolveStep5DeliveryPayload,
} from "../apps/web/pages/project-flow/step5-delivery-shell/step5ResultConsumptionContract";

describe("AT41-21 step5 result consumption contract", () => {
  it("builds seeded title candidates from the project name", () => {
    expect(buildStep5TitleCandidates("夏季T恤")).toEqual([
      "一键出片的高转化短视频",
      "今天这套上身就有结果",
      "3 秒抓住注意力的成片封面",
    ]);
  });

  it("builds script-driven title candidates when step4 passes canonical segments", () => {
    expect(
      buildStep5TitleCandidates("短视频企划", [
        { videoCue: "女孩走进花店，挑选紫色玫瑰，镜头推近表情" },
        { visualCue: "她低头闻花，转身看向镜头，微笑挥手" },
      ]),
    ).toEqual([
      "女孩走进花店 挑选紫色玫瑰 镜头推近，这一段拍完就能直接开投",
      "她低头闻花 转身看向镜头 微笑挥手，成片高能版一键出片",
      "她低头闻花 转身看向镜头 微笑挥手，今天就上这条",
    ]);
  });

  it("writes a normalized step5 delivery payload patch", () => {
    expect(
      buildStep5DeliveryProjectDataPatch({
        projectId: "project-41",
        scriptId: "script-5",
        projectName: "短视频企划",
        finalVideoUrl: null,
        clipVideoUrls: ["https://video.example.com/scene-1.mp4", "https://video.example.com/scene-2.mp4"],
        coverImageUrl: "https://img.example.com/cover.png",
      }),
    ).toEqual({
      step5DeliveryPayload: {
        projectId: "project-41",
        scriptId: "script-5",
        finalVideoUrl: null,
        clipVideoUrls: ["https://video.example.com/scene-1.mp4", "https://video.example.com/scene-2.mp4"],
        coverImageUrl: "https://img.example.com/cover.png",
        titleCandidates: [
          "一键出片的高转化短视频",
          "今天这套上身就有结果",
          "3 秒抓住注意力的成片封面",
        ],
        squarePublishCategory: null,
        sourceStep: "step4",
      },
    });
  });

  it("reads the normalized payload from projectData and fails closed on bad input", () => {
    expect(
      resolveStep5DeliveryPayload({
        step5DeliveryPayload: {
          projectId: "project-41",
          scriptId: null,
          finalVideoUrl: null,
          clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
          coverImageUrl: null,
          titleCandidates: ["标题 A"],
          squarePublishCategory: null,
          sourceStep: "step4",
        },
      }),
    ).toEqual({
      projectId: "project-41",
      scriptId: null,
      finalVideoUrl: null,
      clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
      coverImageUrl: null,
      titleCandidates: ["标题 A"],
      squarePublishCategory: null,
      sourceStep: "step4",
    });
    expect(resolveStep5DeliveryPayload({ step5DeliveryPayload: { sourceStep: "step3" } })).toBeNull();
  });
});
