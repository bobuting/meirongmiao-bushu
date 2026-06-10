import type { PublishJob, ProgressReport, BoundAccount, PublishJobResult } from "./types";

/** 扩展内部消息类型（background ↔ content ↔ popup） */
export type ExtMessage =
  | { type: "PING" }
  | { type: "PONG" }
  | { type: "EXECUTE_PUBLISH"; payload: { job: PublishJob } }
  | { type: "PUBLISH_PROGRESS"; payload: ProgressReport }
  | { type: "PUBLISH_COMPLETE"; payload: { jobId: string; result: PublishJobResult } }
  | { type: "PUBLISH_FAILED"; payload: { jobId: string; error: string } }
  | { type: "ACCOUNTS_UPDATED"; payload: { accounts: BoundAccount[] } }
  | { type: "AUTH_EXPIRED"; payload: { accountId: string } }
  | { type: "GET_STATUS" }
  | { type: "REGISTER_ACCOUNT"; payload: { label: string } }
  | { type: "ADD_ACCOUNT"; payload: { label: string } }
  | { type: "ADD_ACCOUNT_WITH_LOGOUT"; payload: { label: string } }
  | { type: "GET_USER_INFO" }
  | { type: "USER_INFO_RESPONSE"; payload: { nickname: string; uid: string } | null }
  | {
      type: "STATUS_RESPONSE";
      payload: {
        isRunning: boolean;
        currentJobId: string | null;
        accounts: BoundAccount[];
      };
    };

/** 外部消息类型（neirongmiao 网页 → 扩展） */
export type ExternalMessage = {
  type: "PUBLISH_REQUEST";
  payload: { projectId: string; jobId: string; accountId: string };
};

/** 类型守卫 */
export function isExtMessage(msg: unknown): msg is ExtMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    typeof (msg as ExtMessage).type === "string"
  );
}

export function isExternalMessage(msg: unknown): msg is ExternalMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as ExternalMessage).type === "PUBLISH_REQUEST"
  );
}
