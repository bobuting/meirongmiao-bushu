import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorLogQueue } from "../../../src/services/error-log/error-log-queue.js";
import type { ErrorLog } from "../../../src/contracts/error-log-contract.js";

// Mock repository
const mockRepo = {
  batchInsert: vi.fn(),
};

describe("ErrorLogQueue", () => {
  let queue: ErrorLogQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRepo.batchInsert.mockClear();
    mockRepo.batchInsert.mockResolvedValue(undefined);
    queue = new ErrorLogQueue(mockRepo as any, {
      maxBatchSize: 100,
      flushIntervalMs: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    queue.stop();
  });

  it("should enqueue error log", () => {
    const log: ErrorLog = {
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    };

    queue.enqueue(log);

    expect(queue.size()).toBe(1);
  });

  it("should flush when reaching max batch size", async () => {
    // 添加 100 条日志触发立即 flush
    for (let i = 0; i < 100; i++) {
      queue.enqueue({
        id: `test-${i}`,
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Test error",
        severity: "error",
        createdAt: Date.now(),
      });
    }

    // flush 是异步的，等待 Promise 执行
    await vi.waitFor(() => {
      expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
    });

    expect(mockRepo.batchInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ errorCode: "VIDEO_NOT_FOUND" }),
      ]),
    );
  });

  it("should flush on timer", async () => {
    queue.enqueue({
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    });

    // 模拟定时器触发 - 推进时间到定时器触发点
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
  });

  it("should flush manually", async () => {
    queue.enqueue({
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    });

    await queue.flush();

    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
    expect(queue.size()).toBe(0);
  });

  it("should prevent concurrent flush", async () => {
    queue.enqueue({
      id: "test-1",
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Test error",
      severity: "error",
      createdAt: Date.now(),
    });

    // 并发调用 flush
    const promise1 = queue.flush();
    const promise2 = queue.flush();

    await Promise.all([promise1, promise2]);

    // 只应该调用一次
    expect(mockRepo.batchInsert).toHaveBeenCalledTimes(1);
  });
});