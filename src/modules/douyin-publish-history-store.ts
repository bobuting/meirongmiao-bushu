import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PublishJob } from "../contracts/douyin-publish-contract.js";
import {
  DOUYIN_PUBLISH_HISTORY_STORE_VERSION,
  type DouyinPublishHistorySnapshot,
} from "../contracts/douyin-publish-history-contract.js";

function normalizeStorePath(input: string | undefined): string {
  const trimmed = typeof input === "string" ? input.trim() : "";
  return trimmed.length > 0 ? resolve(trimmed) : resolve("data/douyin-publish-history", "publish-jobs.json");
}

function sortJobs(items: readonly PublishJob[]): PublishJob[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt);
}

export class DouyinPublishHistoryStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = normalizeStorePath(filePath);
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  get path(): string {
    return this.filePath;
  }

  get(jobId: string): PublishJob | null {
    return this.readSnapshot().jobs.find((item) => item.id === jobId) ?? null;
  }

  list(projectId: string, userId: string): PublishJob[] {
    return sortJobs(
      this.readSnapshot().jobs.filter((item) => item.projectId === projectId && item.userId === userId),
    );
  }

  upsert(job: PublishJob): void {
    const snapshot = this.readSnapshot();
    const nextJobs = snapshot.jobs.filter((item) => item.id !== job.id);
    nextJobs.push(job);
    this.writeSnapshot({
      version: DOUYIN_PUBLISH_HISTORY_STORE_VERSION,
      jobs: sortJobs(nextJobs),
      updatedAt: Date.now(),
    });
  }

  private readSnapshot(): DouyinPublishHistorySnapshot {
    if (!existsSync(this.filePath)) {
      return {
        version: DOUYIN_PUBLISH_HISTORY_STORE_VERSION,
        jobs: [],
        updatedAt: Date.now(),
      };
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<DouyinPublishHistorySnapshot>;
      return {
        version:
          typeof raw.version === "string" && raw.version.trim().length > 0
            ? raw.version
            : DOUYIN_PUBLISH_HISTORY_STORE_VERSION,
        jobs: Array.isArray(raw.jobs) ? (raw.jobs as PublishJob[]) : [],
        updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
      };
    } catch {
      return {
        version: DOUYIN_PUBLISH_HISTORY_STORE_VERSION,
        jobs: [],
        updatedAt: Date.now(),
      };
    }
  }

  private writeSnapshot(snapshot: DouyinPublishHistorySnapshot): void {
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2));
  }
}

