import type { ReverseTask, VideoJobStatus } from "../contracts/types.js";

export type SideCapabilityKey = "video_studio" | "reverse_copy" | "video_reverse" | "hot_billboard";

export type UnifiedCapabilityStatus = "queued" | "running" | "succeeded" | "failed";

export interface SideCapabilityContractFieldSet {
  required: string[];
  optional: string[];
}

export interface SideCapabilityContract {
  key: SideCapabilityKey;
  capability: string;
  sideEndpoints: string[];
  mainEndpoints: string[];
  input: SideCapabilityContractFieldSet;
  output: SideCapabilityContractFieldSet;
  error: {
    codeField: string;
    messageField: string;
    diagnosticsAttemptsField: string;
  };
}

const VIDEO_JOB_STATUS_MAP: Record<VideoJobStatus, UnifiedCapabilityStatus> = {
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  timeout: "failed",
};

const REVERSE_TASK_STATUS_MAP: Record<ReverseTask["status"], UnifiedCapabilityStatus> = {
  success: "succeeded",
  fallback_required: "failed",
};

const SIDE_STATUS_MAP: Record<string, UnifiedCapabilityStatus> = {
  pending: "queued",
  queued: "queued",
  running: "running",
  success: "succeeded",
  succeeded: "succeeded",
  error: "failed",
  failed: "failed",
  timeout: "failed",
};

export const SIDE_CAPABILITY_CONTRACTS: SideCapabilityContract[] = [
  {
    key: "video_studio",
    capability: "视频能力",
    sideEndpoints: ["POST /api/videos/create", "POST /api/videos/query", "GET /api/videos/:taskId"],
    mainEndpoints: [
      "POST /projects/:projectId/video-jobs",
      "GET /projects/:projectId/video-jobs/:jobId",
      "POST /projects/:projectId/video-jobs/:jobId/complete",
    ],
    input: {
      required: ["prompt"],
      optional: ["imageUrls", "aspectRatio", "durationSeconds", "runtime", "provider", "videoMode"],
    },
    output: {
      required: ["taskId", "status", "model", "videoUrls", "diagnostics"],
      optional: ["raw"],
    },
    error: {
      codeField: "errorCode|code",
      messageField: "message",
      diagnosticsAttemptsField: "diagnostics.attempts[]",
    },
  },
  {
    key: "reverse_copy",
    capability: "URL 反推能力",
    sideEndpoints: ["POST /api/reverse-copy/overview"],
    mainEndpoints: ["POST /reverse/parse", "POST /admin/capability-lab/reverse-fetch"],
    input: {
      required: ["videoUrl"],
      optional: ["timeoutMs", "runtime"],
    },
    output: {
      required: ["videoUrl", "overviews", "diagnostics"],
      optional: ["items", "model"],
    },
    error: {
      codeField: "errorCode|code",
      messageField: "message",
      diagnosticsAttemptsField: "diagnostics.attempts[]",
    },
  },
  {
    key: "video_reverse",
    capability: "视频上传反推能力",
    sideEndpoints: ["POST /api/video-reverse/analyze"],
    mainEndpoints: ["POST /admin/capability-lab/reverse-fetch", "POST /reverse/parse(fileName)"],
    input: {
      required: ["video(file/multipart)", "userGoal"],
      optional: ["locale", "runtime"],
    },
    output: {
      required: ["result", "diagnostics", "videoMeta"],
      optional: ["raw", "model"],
    },
    error: {
      codeField: "errorCode|code",
      messageField: "message",
      diagnosticsAttemptsField: "diagnostics.attempts[]",
    },
  },
  {
    key: "hot_billboard",
    capability: "视频热榜能力",
    sideEndpoints: ["POST /api/hot-billboard/douyin/videos"],
    mainEndpoints: ["GET /square/trends?type=video", "POST /admin/scripts/hot-trends/sync"],
    input: {
      required: ["page", "pageSize", "dateWindow"],
      optional: ["tags", "timeoutMs", "runtime"],
    },
    output: {
      required: ["items", "diagnostics"],
      optional: ["raw", "model", "page", "pageSize", "dateWindow"],
    },
    error: {
      codeField: "errorCode|code",
      messageField: "message",
      diagnosticsAttemptsField: "diagnostics.attempts[]",
    },
  },
];

export function mapVideoJobStatusToUnified(status: VideoJobStatus): UnifiedCapabilityStatus {
  return VIDEO_JOB_STATUS_MAP[status];
}

export function mapReverseTaskStatusToUnified(status: ReverseTask["status"]): UnifiedCapabilityStatus {
  return REVERSE_TASK_STATUS_MAP[status];
}

export function mapSideStatusToUnified(status: string): UnifiedCapabilityStatus {
  return SIDE_STATUS_MAP[status.trim().toLowerCase()] ?? "failed";
}

export function buildSideCapabilityContractMarkdown(generatedAtIso: string): string {
  const lines: string[] = [];
  lines.push("# 四能力统一契约对齐（AT-14-02）");
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- 能力数量: ${SIDE_CAPABILITY_CONTRACTS.length}`);
  lines.push("");
  lines.push("## 契约矩阵");
  lines.push("");
  lines.push("| 能力 | side 端点 | 主项目端点 | 输入必填 | 输出必填 | 错误结构 | 状态映射 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const item of SIDE_CAPABILITY_CONTRACTS) {
    const statusMap =
      item.key === "video_studio"
        ? "running/succeeded/failed/timeout -> running/succeeded/failed"
        : "pending|success|error -> queued|succeeded|failed";
    lines.push(
      `| ${item.capability} | ${item.sideEndpoints.join("<br/>")} | ${item.mainEndpoints.join("<br/>")} | ${item.input.required.join(", ")} | ${item.output.required.join(", ")} | ${item.error.codeField} + ${item.error.messageField} + ${item.error.diagnosticsAttemptsField} | ${statusMap} |`,
    );
  }
  lines.push("");
  lines.push("## 统一状态规则");
  lines.push("");
  lines.push("1. 视频任务状态：`running/succeeded/failed/timeout` 统一为 `running/succeeded/failed`。");
  lines.push("2. 反推任务状态：`success/fallback_required` 统一为 `succeeded/failed`。");
  lines.push("3. side 通用状态：`pending/queued/running/success/succeeded/error/failed/timeout` 统一映射。未知值按 `failed` 处理。");
  lines.push("");
  lines.push("## 双层 fallback 兼容要求");
  lines.push("");
  lines.push("1. diagnostics 必须包含 `attempts[]`，用于承载同 API 模型链与跨 API 链尝试轨迹。");
  lines.push("2. 错误响应必须包含 `errorCode|code` + `message` + `requestId`（若可用）。");
  lines.push("3. 四能力接口都不得吞错或返回伪成功。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
