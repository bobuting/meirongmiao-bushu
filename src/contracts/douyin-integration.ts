import type {
  ReverseFetchReasonCode,
  ReverseFetchStage,
  ReverseNextAction,
  SourceCredentialScope,
  TrendWindow,
} from "./types.js";

export const DEFAULT_REVERSE_FETCH_STAGE_ORDER: ReverseFetchStage[] = [
  "S5_EXTERNAL_API",
  "S1_CUSTOM_COOKIE",
  "S2_PUBLIC_POOL",
  "S3_PLAYWRIGHT_GUEST",
  "S4_USER_QR_COOKIE",
  "S6_LOCAL_FILE",
];

export interface ReverseFetchInput {
  userId: string;
  projectId: string;
  url: string;
}

export interface ReverseScriptHintPrimaryItem {
  url: string | null;
  title: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  createTime: number | null;
  playCount: number | null;
  commentCount: number | null;
  diggCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  recommendCount: number | null;
  nickname: string | null;
  duration: number | null;
  scriptText: string | null;
}

export interface ReverseFetcherSuccess {
  ok: true;
  stage: ReverseFetchStage;
  provider: string;
  resolvedVideoUrl: string;
  scriptHints?: {
    source: string;
    overviews: string[];
    itemCount: number;
    primaryItem?: ReverseScriptHintPrimaryItem | null;
  };
  reasonCode: "OK";
  retryable: false;
  nextAction: "none";
  detail?: string | null;
}

export interface ReverseFetcherFailure {
  ok: false;
  stage: ReverseFetchStage;
  provider: string;
  reasonCode: ReverseFetchReasonCode;
  retryable: boolean;
  nextAction: ReverseNextAction;
  detail?: string | null;
}

export type ReverseFetcherResult = ReverseFetcherSuccess | ReverseFetcherFailure;

export interface ReverseFetcherAdapter {
  readonly stage: ReverseFetchStage;
  readonly provider: string;
  fetch(input: ReverseFetchInput): Promise<ReverseFetcherResult>;
}

export interface ReverseFetchTraceResult {
  traceId: string;
  stageOrder: ReverseFetchStage[];
  attempts: Array<{
    stage: ReverseFetchStage;
    provider: string;
    status: "success" | "failed";
    reasonCode: ReverseFetchReasonCode;
    elapsedMs: number;
    retryable: boolean;
    nextAction: ReverseNextAction;
    detail: string | null;
  }>;
  success: boolean;
  finalStage: ReverseFetchStage;
  resolvedVideoUrl: string | null;
  scriptHints?: {
    source: string;
    overviews: string[];
    itemCount: number;
    primaryItem?: ReverseScriptHintPrimaryItem | null;
  } | null;
  nextAction: ReverseNextAction;
}

export interface DouhotEntry {
  rank: number;
  title: string;
  url: string;
  trend: "up" | "down" | "flat";
  hotValue: number | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface TrendTopic {
  id: number;
  label: string;
  url: string;
  trend: "up" | "down" | "flat";
  itemId?: string | null;
  /** 封面图 URL */
  coverUrl?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface TrendSourceFetchResult {
  source: string;
  section: string;
  updatedAt: string | null;
  topics: TrendTopic[];
}

export interface TrendSourceAdapter {
  fetchVideoHotTrends(limit: number, window: TrendWindow): Promise<TrendSourceFetchResult>;
  health(): Promise<{ ok: boolean; source: string; reason: string | null }>;
  authStatus(): Promise<{ ready: boolean; source: string; reason: string | null }>;
  refreshSession(): Promise<{ ok: boolean; source: string; reason: string | null }>;
}

export interface SourceCredentialContract {
  scope: SourceCredentialScope;
  encrypted: boolean;
  masked: boolean;
  auditAction: "source_credential_upserted" | "source_credential_revoked";
}
