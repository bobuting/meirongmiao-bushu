/** 绑定的抖音账号 */
export interface BoundAccount {
  readonly id: string;
  readonly label: string;
  readonly douyinUid: string | null;
  readonly status: AccountStatus;
  readonly lastVerifiedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt?: number;
}

export type AccountStatus = "active" | "expired" | "pending" | "revoked";

/** 发布任务 */
export interface PublishJob {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly accountId: string;
  readonly status: JobStatus;
  readonly stage: PublishStage | null;
  readonly input: PublishJobInput;
  readonly result: PublishJobResult | null;
  readonly error: JobError | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type JobStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "expired";

/** 发布阶段 */
export type PublishStage =
  | "queued"
  | "navigating"
  | "uploading"
  | "processing"
  | "filling_form"
  | "selecting_cover"
  | "publishing"
  | "confirming";

/** 发布任务输入参数 */
export interface PublishJobInput {
  readonly videoUrl: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly coverImageUrl: string | null;
  readonly linkUrl: string | null;
  readonly publishDate: number;
  readonly aiGeneratedDeclaration: boolean;
}

/** 发布结果 */
export interface PublishJobResult {
  readonly ok: boolean;
  readonly message: string;
  readonly douyinItemId: string | null;
}

/** 任务错误 */
export interface JobError {
  readonly code: string;
  readonly message: string;
}

/** 进度上报 */
export interface ProgressReport {
  readonly jobId: string;
  readonly stage: PublishStage;
  readonly message: string;
  readonly progress?: number;
}

/** 后端配置 */
export interface BackendConfig {
  readonly apiBaseUrl: string;
  readonly apiPathPrefix: string;
  readonly authToken: string;
}

/** Cookie 记录（chrome.cookies.Cookie 的精简版） */
export interface DouyinCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: "no_restriction" | "lax" | "strict" | "unspecified";
  readonly expirationDate?: number;
}
