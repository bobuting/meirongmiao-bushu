import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorLogService } from "../../../src/services/error-log/error-log-service.js";
import type { ErrorLogQueue } from "../../../src/services/error-log/error-log-queue.js";
import { AppError } from "../../../src/core/errors.js";

// Mock queue
const mockQueue = {
  enqueue: vi.fn(),
  flush: vi.fn(),
};

describe("ErrorLogService", () => {
  let service: ErrorLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ErrorLogService(mockQueue as unknown as ErrorLogQueue);
  });

  it("should log error with context", () => {
    const error = new Error("Test error");
    service.log(error, {
      userId: "user-1",
      requestId: "req-1",
      apiPath: "GET /api/test",
      sourceModule: "test-module",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Test error",
        severity: "critical",
        userId: "user-1",
        requestId: "req-1",
        apiPath: "GET /api/test",
        sourceModule: "test-module",
      }),
    );
  });

  it("should log AppError with correct error code", () => {
    const appError = new AppError(404, "VIDEO_NOT_FOUND", "Video not found");
    service.log(appError, {
      userId: "user-1",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Video not found",
        severity: "error",
      }),
    );
  });

  it("should treat 5xx errors as critical", () => {
    const appError = new AppError(500, "DATABASE_ERROR", "Database connection failed");
    service.log(appError);

    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "DATABASE_ERROR",
        severity: "critical",
      }),
    );
  });

  it("should log LLM error with extended context", () => {
    const error = new Error("LLM timeout");
    service.logLlmError(error, {
      llmModel: "gemini-2.0-flash",
      llmInput: "test prompt",
      userId: "user-1",
      sourceModule: "llm-transport",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "LLM_ERROR",
        errorMessage: "LLM timeout",
        llmModel: "gemini-2.0-flash",
        llmInput: "test prompt",
        sourceModule: "llm-transport",
      }),
    );
  });

  it("should flush queue", async () => {
    await service.flush();

    expect(mockQueue.flush).toHaveBeenCalledTimes(1);
  });
});