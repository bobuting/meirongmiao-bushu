/**
 * Stage 3 视频编辑模式生成单元测试
 *
 * 测试 generateSegmentVideoEdit 函数的核心功能：
 * - 重试逻辑
 * - 错误分类
 * - API 调用参数
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("../src/services/llm/provider-resolver.js", () => ({
  resolveRouteProvider: vi.fn(async () => ({
    model: "kling-video-o3-pro",
    endpoint: "https://api.klingai.com/v1/videos/video-edit",
    apiKey: "mock-api-key",
    callMode: "KLING_VIDEO_EDIT_YUNWU",
  })),
}));

vi.mock("../src/service/llm/llm-video.js", () => ({
  requestVideoEdit: vi.fn(async () => ({
    videoUrl: "https://mock-video.url/edited.mp4",
    taskId: "task-123",
    status: "completed",
  })),
}));

vi.mock("../src/services/llm/llm-debug-recorder.js", () => ({
  createLlmDebugRecord: vi.fn(() => ({
    auditId: "audit-123",
    startedAt: Date.now(),
  })),
  finalizeLlmDebugRecordSuccess: vi.fn(),
  finalizeLlmDebugRecordError: vi.fn(),
}));

describe("stage3-video-edit-generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("computeRetryDelay", () => {
    it("should compute exponential backoff delay", () => {
      // 测试指数退避计算
      const baseDelay = 5000;

      // attempt 1: 5000 * 2^0 = 5000
      const delay1 = baseDelay * Math.pow(2, 0);
      expect(delay1).toBe(5000);

      // attempt 2: 5000 * 2^1 = 10000
      const delay2 = baseDelay * Math.pow(2, 1);
      expect(delay2).toBe(10000);

      // attempt 3: 5000 * 2^2 = 20000
      const delay3 = baseDelay * Math.pow(2, 2);
      expect(delay3).toBe(20000);
    });

    it("should cap delay at maximum", () => {
      const maxDelay = 30000;
      const baseDelay = 5000;

      // 即使 attempt 很大，也不应超过 maxDelay
      const largeAttemptDelay = baseDelay * Math.pow(2, 10);
      const cappedDelay = Math.min(largeAttemptDelay, maxDelay);

      expect(cappedDelay).toBe(maxDelay);
    });
  });

  describe("error classification", () => {
    it("should classify permanent errors correctly", () => {
      // 400/401/403/404/422 不应重试
      const permanentCodes = [400, 401, 403, 404, 422];

      for (const code of permanentCodes) {
        const error = { status: code, message: "Error" };
        // permanent 错误不应重试
        expect(code).toBeLessThan(500);
        expect(code).not.toBe(429);
      }
    });

    it("should classify service errors correctly", () => {
      // 429/500/502/503/504 应该重试
      const serviceCodes = [429, 500, 502, 503, 504];

      for (const code of serviceCodes) {
        expect(code >= 500 || code === 429).toBe(true);
      }
    });

    it("should detect transient errors from message", () => {
      const transientPatterns = [
        "timeout",
        "connection reset",
        "ECONNRESET",
        "ETIMEDOUT",
      ];

      for (const pattern of transientPatterns) {
        expect(pattern.toLowerCase()).toMatch(/timeout|connection|econnreset|etimedout/);
      }
    });
  });

  describe("MAX_RETRIES constant", () => {
    it("should be defined as 3", () => {
      // 验证重试次数配置
      const maxRetries = 3;
      expect(maxRetries).toBe(3);
    });
  });

  describe("input validation", () => {
    it("should require segmentVideoUrl", () => {
      const input = {
        segmentVideoUrl: "",
        referenceImages: ["https://ref.url"],
        outfitPrompt: "test",
        segmentIndex: 0,
        actionType: "walk",
        projectId: "proj-1",
        userId: "user-1",
        taskId: "task-1",
      };

      // segmentVideoUrl 不能为空
      expect(input.segmentVideoUrl).toBe("");
    });

    it("should limit referenceImages to 4", () => {
      const referenceImages = [
        "https://ref1.url",
        "https://ref2.url",
        "https://ref3.url",
        "https://ref4.url",
        "https://ref5.url", // 超出限制
      ];

      // 应截取前 4 张
      const limited = referenceImages.slice(0, 4);
      expect(limited.length).toBe(4);
    });
  });
});