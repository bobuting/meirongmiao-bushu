const REVERSE_PARSE_UPLOAD_USER_GOAL = "分析这个视频的内容主题、镜头节奏和可复刻脚本。";

export interface ReverseParseV2UploadRequestPayload {
  projectId?: string;
  inputMode?: "douyin_url" | "video_url" | "upload_file";
  input?: string;
  file?: File | null;
}

interface RequestLikeOptions {
  token?: string | null;
  body?: unknown;
}

type RequestLike = <T>(
  method: string,
  path: string,
  options?: RequestLikeOptions,
) => Promise<T>;

function buildReverseParseV2JobStartPath(projectId?: string): string {
  const normalizedProjectId = projectId?.trim() || "";
  if (!normalizedProjectId) {
    return "/reverse/parse-v2/jobs";
  }
  return `/reverse/parse-v2/jobs?projectId=${encodeURIComponent(normalizedProjectId)}`;
}

export function startReverseParseV2JobRequest<T>(
  request: RequestLike,
  token: string,
  payload: ReverseParseV2UploadRequestPayload,
): Promise<T> {
  if (payload.inputMode === "upload_file" && payload.file) {
    const form = new FormData();
    form.append("video", payload.file);
    form.append("userGoal", REVERSE_PARSE_UPLOAD_USER_GOAL);
    return request<T>("POST", buildReverseParseV2JobStartPath(payload.projectId), {
      token,
      body: form,
    });
  }

  return request<T>("POST", "/reverse/parse-v2/jobs", {
    token,
    body: {
      ...(payload.projectId?.trim() ? { projectId: payload.projectId.trim() } : {}),
      ...(payload.inputMode ? { inputMode: payload.inputMode } : {}),
      input: String(payload.input ?? "").trim(),
    },
  });
}
