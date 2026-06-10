export type LlmDebugAuditStatus = "success" | "error" | "timeout";

export interface LlmDebugBubbleAttempt {
  stage: string;
  provider: string;
  status: string;
  reasonCode: string;
  detail?: string | null;
}

export interface LlmDebugBubbleAuditItem {
  id: string;
  providerId: string;
  routeKey: string;
  status: LlmDebugAuditStatus;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary: string | null;
  responseSummary: string | null;
  createdAt: number;
  attempts: LlmDebugBubbleAttempt[];
}

export interface LlmDebugBubbleSnapshot {
  updatedAt: number;
  audits: LlmDebugBubbleAuditItem[];
}

export const LLM_DEBUG_BUBBLE_INVARIANTS = [
  "Each audit item must include prompt/request summary and result summary slots.",
  "Status must be one of success/error/timeout for deterministic color mapping.",
  "attempts[] must be present to expose fallback trace in bubble details.",
  "Bubble payload should be append-only by createdAt descending order.",
] as const;

export function isLlmDebugBubbleSnapshot(value: unknown): value is LlmDebugBubbleSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const snapshot = value as Partial<LlmDebugBubbleSnapshot>;
  if (!Number.isFinite(Number(snapshot.updatedAt)) || !Array.isArray(snapshot.audits)) {
    return false;
  }
  return snapshot.audits.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const audit = item as Partial<LlmDebugBubbleAuditItem>;
    const statusOk = audit.status === "success" || audit.status === "error" || audit.status === "timeout";
    const coreFieldsOk =
      typeof audit.id === "string" &&
      typeof audit.providerId === "string" &&
      typeof audit.routeKey === "string" &&
      statusOk &&
      Number.isFinite(Number(audit.latencyMs)) &&
      Number.isFinite(Number(audit.createdAt));
    if (!coreFieldsOk) {
      return false;
    }
    if (!Array.isArray(audit.attempts)) {
      return false;
    }
    return audit.attempts.every((attempt) => {
      if (!attempt || typeof attempt !== "object") {
        return false;
      }
      const row = attempt as Partial<LlmDebugBubbleAttempt>;
      return (
        typeof row.stage === "string" &&
        typeof row.provider === "string" &&
        typeof row.status === "string" &&
        typeof row.reasonCode === "string"
      );
    });
  });
}

export const LLM_DEBUG_BUBBLE_CONTRACT_VERSION = "N23-R6-01.v1";
