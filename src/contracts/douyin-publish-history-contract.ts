import type { PublishJob } from "./douyin-publish-contract.js";

export const DOUYIN_PUBLISH_HISTORY_STORE_VERSION = "AT36-01.v1";

export interface DouyinPublishHistorySnapshot {
  readonly version: string;
  readonly jobs: PublishJob[];
  readonly updatedAt: number;
}
