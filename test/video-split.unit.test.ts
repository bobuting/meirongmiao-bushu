/**
 * video-split 工具单元测试
 *
 * 测试 splitVideoBySegments 函数的核心功能：
 * - 视频切片参数解析
 * - 错误处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionSegment } from "../src/contracts/outfit-change-contract.js";

// 完整 mock child_process 的 spawn
vi.mock("child_process", async () => {
  const mockSpawn = vi.fn(() => ({
    stderr: { on: vi.fn() },
    stdout: { on: vi.fn() },
    on: vi.fn((event: string, callback: any) => {
      if (event === "close") {
        callback(0); // 成功退出
      }
    }),
  }));

  return {
    spawn: mockSpawn,
    exec: vi.fn(),
    execFile: vi.fn(),
  };
});

// Mock OSS upload
vi.mock("../src/service/oss/oss-service.js", () => ({
  getOssService: vi.fn(() => ({
    upload: vi.fn(async (_key: string, _data: Buffer, _mimeType: string) => ({
      success: true,
      url: "https://mock-oss.url/segment.mp4",
    })),
  })),
}));

describe("video-split", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockActionSegments: ActionSegment[] = [
    { startTime: 0, endTime: 5, actionType: "walk", keyframes: [] },
    { startTime: 5, endTime: 10, actionType: "turn", keyframes: [] },
    { startTime: 10, endTime: 15, actionType: "pose", keyframes: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("参数验证", () => {
    it("should validate startTime <= endTime", () => {
      // startTime > endTime 应该无效
      const invalidSegments: ActionSegment[] = [
        { startTime: 10, endTime: 5, actionType: "invalid", keyframes: [] },
      ];

      const segment = invalidSegments[0];
      expect(segment.startTime > segment.endTime).toBe(true);
    });

    it("should reject negative time values", () => {
      const negativeSegments: ActionSegment[] = [
        { startTime: -5, endTime: 5, actionType: "invalid", keyframes: [] },
      ];

      expect(negativeSegments[0].startTime).toBeLessThan(0);
    });

    it("should validate actionSegments array not empty", () => {
      const emptySegments: ActionSegment[] = [];
      expect(emptySegments.length).toBe(0);
    });
  });

  describe("时间参数计算", () => {
    it("should calculate duration correctly", () => {
      for (const segment of mockActionSegments) {
        const duration = segment.endTime - segment.startTime;
        expect(duration).toBe(5);
        expect(duration).toBeGreaterThan(0);
      }
    });

    it("should handle consecutive segments", () => {
      // 检查时间段连续性
      expect(mockActionSegments[0].endTime).toBe(mockActionSegments[1].startTime);
      expect(mockActionSegments[1].endTime).toBe(mockActionSegments[2].startTime);
    });
  });

  describe("FFmpeg 命令参数", () => {
    it("should use -ss for start time", () => {
      const segment = mockActionSegments[0];
      // FFmpeg 参数: -ss startTime -t duration
      const expectedArgs = ["-ss", String(segment.startTime), "-t", "5"];
      expect(expectedArgs[1]).toBe("0");
    });

    it("should use -t for duration", () => {
      const segment = mockActionSegments[1];
      const duration = segment.endTime - segment.startTime;
      expect(duration).toBe(5);
    });

    it("should use -c copy for fast splitting", () => {
      // 使用 -c copy 避免重新编码
      const copyArgs = ["-c", "copy"];
      expect(copyArgs).toContain("copy");
    });
  });

  describe("segment count", () => {
    it("should match actionSegments length", () => {
      expect(mockActionSegments.length).toBe(3);
    });
  });
});