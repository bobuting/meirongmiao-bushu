import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PgErrorLogRepository } from "../../../src/repositories/pg/error-log-pg-repository.js";
import type { ErrorLog } from "../../../src/contracts/error-log-contract.js";

describe("PgErrorLogRepository", () => {
  let pool: Pool;
  let repo: PgErrorLogRepository;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });
    repo = new PgErrorLogRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should batch insert error logs", async () => {
    const logs: ErrorLog[] = [
      {
        id: "test-1",
        errorCode: "VIDEO_NOT_FOUND",
        errorMessage: "Video not found",
        severity: "error",
        createdAt: Date.now(),
        sourceModule: "test-module",
      },
      {
        id: "test-2",
        errorCode: "LLM_TIMEOUT",
        errorMessage: "LLM request timeout",
        severity: "error",
        createdAt: Date.now(),
        sourceModule: "llm-transport",
      },
    ];

    await repo.batchInsert(logs);

    const result = await repo.findByFilters({ errorCode: "VIDEO_NOT_FOUND" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].errorCode).toBe("VIDEO_NOT_FOUND");
  });

  it("should find logs by filters", async () => {
    const result = await repo.findByFilters({
      severity: "error",
      pageSize: 10,
    });

    expect(result.length).toBeLessThanOrEqual(10);
    if (result.length > 0) {
      expect(result[0].severity).toBe("error");
    }
  });

  it("should count by error code", async () => {
    const result = await repo.countByErrorCode(
      Date.now() - 24 * 60 * 60 * 1000,
      Date.now(),
    );

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].errorCode).toBeDefined();
      expect(result[0].count).toBeGreaterThan(0);
    }
  });

  it("should delete expired logs", async () => {
    const result = await repo.deleteExpiredLogs();

    expect(result.totalDeleted).toBeDefined();
    expect(typeof result.totalDeleted).toBe("number");
  });
});