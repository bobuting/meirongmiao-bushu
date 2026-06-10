export type PublishPlatform = "douyin";
export type PublishJobStatus = "pending" | "running" | "success" | "failed";

export interface DouyinPublishRequest {
  projectId: string;
  userId: string;
  videoFilePath: string;
  title: string;
  tags: string[];
  coverImagePath: string | null;
  linkUrl: string | null;
  productLink: string | null;
  productTitle: string | null;
  aiGeneratedDeclaration: boolean;
  publishDate: number;
}

export interface DouyinPublishResult {
  ok: boolean;
  platform: "douyin";
  message: string;
  errorDetail: string | null;
  /** Path to a diagnostic screenshot taken on failure/timeout, served via object storage. */
  screenshotUrl: string | null;
}

export interface PublishJob {
  id: string;
  projectId: string;
  userId: string;
  platform: PublishPlatform;
  status: PublishJobStatus;
  progressStage: string | null;
  progressMessage: string | null;
  logTail: string[];
  request: DouyinPublishRequest;
  result: DouyinPublishResult | null;
  createdAt: number;
  updatedAt: number;
}
