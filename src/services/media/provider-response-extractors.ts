/**
 * Provider 响应解析辅助函数
 *
 * 从 app.ts 的 buildApp() 闭包中提取出的纯函数集合，
 * 负责从各类 Provider 的 JSON 响应中提取图片/视频 URL、任务 ID、状态、错误信息等。
 */

// ---------------------------------------------------------------------------
// Model 路径规范化
// ---------------------------------------------------------------------------

/** 规范化 Nano Banana 模型路径（根据 text_to_image / image_to_image 模式调整后缀） */
export function normalizeNanoBananaModelPath(
  modelRaw: string,
  mode: "text_to_image" | "image_to_image",
): string {
  const normalized = modelRaw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  let modelPath = normalized || "fal-ai/nano-banana";
  if (mode === "image_to_image") {
    if (!/\/edit$/i.test(modelPath)) {
      modelPath = `${modelPath}/edit`;
    }
  } else {
    modelPath = modelPath.replace(/\/edit$/i, "");
  }
  return modelPath;
}

// ---------------------------------------------------------------------------
// 图片 URL 提取（BFS 遍历 Provider JSON）
// ---------------------------------------------------------------------------

/** 从 Provider 响应 JSON 中提取图片 URL（支持 HTTP 链接和 data:image base64） */
export function extractImageUrlsFromProviderResponse(data: unknown): string[] {
  const output: string[] = [];
  const pushUrl = (value: unknown): void => {
    const url = String(value ?? "").trim();
    if (url.length < 1) {
      return;
    }
    const isHttp = /^https?:\/\//i.test(url);
    const isDataImage = /^data:image\/[^;]+;base64,/i.test(url);
    if (!isHttp && !isDataImage) {
      return;
    }
    if (!output.includes(url)) {
      output.push(url);
    }
  };
  const pushBase64 = (value: unknown): void => {
    const raw = String(value ?? "").trim();
    if (raw.length < 16) {
      return;
    }
    const cleaned = raw.replace(/^data:image\/[^;]+;base64,/i, "").trim();
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(cleaned)) {
      return;
    }
    pushUrl(`data:image/png;base64,${cleaned}`);
  };

  const urlKeys = new Set(["url", "image", "href", "src", "uri", "image_url", "imageUrl", "file_url", "fileUrl"]);
  const b64Keys = new Set(["b64_json", "b64Json", "image_base64", "imageBase64", "base64"]);
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();
  let guard = 0;

  while (queue.length > 0 && guard < 20_000) {
    guard += 1;
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (typeof current === "string") {
      pushUrl(current);
      continue;
    }
    if (typeof current !== "object") {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (urlKeys.has(key)) {
        pushUrl(value);
      }
      if (b64Keys.has(key)) {
        pushBase64(value);
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
      if (Array.isArray(value)) {
        queue.push(...value);
      }
      if (typeof value === "string") {
        pushUrl(value);
      }
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// 视频 URL 提取（BFS 遍历 Provider JSON）
// ---------------------------------------------------------------------------

/** 从 Provider 响应 JSON 中提取视频 URL（过滤静态资源后缀） */
export function extractVideoUrlsFromProviderResponse(data: unknown): string[] {
  const output: string[] = [];
  const pushUrl = (value: unknown): void => {
    const url = String(value ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return;
    }
    if (/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(url)) {
      return;
    }
    if (!output.includes(url)) {
      output.push(url);
    }
  };
  if (typeof data === "string") {
    pushUrl(data);
    return output;
  }
  if (!data || typeof data !== "object") {
    return output;
  }
  const urlKeys = new Set([
    "url",
    "video_url",
    "videourl",
    "file_url",
    "fileurl",
    "result_url",
    "resulturl",
    "download_url",
    "downloadurl",
    "play_url",
    "playurl",
    "resource_url",
    "resourceurl",
    "src",
    "href",
  ]);
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();
  let guard = 0;
  while (queue.length > 0 && guard < 20_000) {
    guard += 1;
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }
    if (typeof current !== "object") {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (urlKeys.has(key.toLowerCase())) {
        if (Array.isArray(value)) {
          value.forEach((item) => pushUrl(item));
        } else {
          pushUrl(value);
        }
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
      if (Array.isArray(value)) {
        queue.push(...value);
      }
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// 视频任务 ID / 状态提取
// ---------------------------------------------------------------------------

/** 从 Provider 响应 JSON 中提取视频任务 ID（BFS 遍历，跳过占位值） */
export function extractVideoTaskIdFromProviderResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const taskIdKeys = new Set(["id", "task_id", "taskid", "job_id", "jobid", "request_id", "requestid"]);
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();
  let guard = 0;
  while (queue.length > 0 && guard < 20_000) {
    guard += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (taskIdKeys.has(key.toLowerCase())) {
        const taskId = String(value ?? "").trim();
        if (taskId.length > 1 && !["0", "ok", "success", "true"].includes(taskId.toLowerCase())) {
          return taskId;
        }
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
      if (Array.isArray(value)) {
        queue.push(...value);
      }
    }
  }
  return null;
}

/** 从 Provider 错误消息文本中提取 taskId（格式：taskId=xxx） */
export function extractVideoTaskIdFromProviderErrorMessage(message: string): string | null {
  const match = message.match(/(?:^|[;,\s])taskId=([A-Za-z0-9._:-]+)/i);
  if (!match) {
    return null;
  }
  const taskId = (match[1] ?? "").trim();
  return taskId.length > 0 ? taskId : null;
}

/** 从 Provider 响应 JSON 中提取视频任务状态（BFS 遍历） */
export function extractVideoTaskStatusFromProviderResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const statusKeys = new Set(["status", "state", "task_status", "taskstatus", "job_status", "jobstatus"]);
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();
  let guard = 0;
  while (queue.length > 0 && guard < 20_000) {
    guard += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (statusKeys.has(key.toLowerCase())) {
        const status = String(value ?? "").trim();
        if (status.length > 0) {
          return status;
        }
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
      if (Array.isArray(value)) {
        queue.push(...value);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 失败分类与重试延迟
// ---------------------------------------------------------------------------

/** 判断视频 Provider 失败消息是否应视为过载 */
export function shouldTreatVideoProviderFailureAsOverload(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("负载已饱和") ||
    normalized.includes("upstream overload") ||
    normalized.includes("overloaded") ||
    normalized.includes("try again later")
  );
}

/** 解析视频 Provider 排队重试延迟（毫秒），读取环境变量 JIMENG_VIDEO_PENDING_RETRY_DELAY_MS */
export function resolveVideoProviderPendingRetryDelayMs(): number {
  const configured = Number(
    process.env.JIMENG_VIDEO_PENDING_RETRY_DELAY_MS ?? process.env.JIMENG_VIDEO_QUERY_POLL_INTERVAL_MS ?? "3000",
  );
  if (!Number.isFinite(configured) || configured < 0) {
    return 3000;
  }
  return Math.min(30_000, Math.floor(configured));
}

/** 解析视频 Provider 过载重试延迟（毫秒），读取环境变量 JIMENG_VIDEO_OVERLOAD_RETRY_DELAY_MS */
export function resolveVideoProviderOverloadRetryDelayMs(): number {
  const configured = Number(process.env.JIMENG_VIDEO_OVERLOAD_RETRY_DELAY_MS ?? "30000");
  if (!Number.isFinite(configured) || configured < 0) {
    return 30_000;
  }
  return Math.max(3_000, Math.min(120_000, Math.floor(configured)));
}

// ---------------------------------------------------------------------------
// VEO 视频协议辅助
// ---------------------------------------------------------------------------

/** 构建 VEO 视频创建端点候选列表 */
export function buildVeoVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const candidates = new Set<string>();

  // VEO 创建端点
  const suffixes = ["/v1/video/create", "/api/v1/video/create"];
  for (const suffix of suffixes) {
    candidates.add(`${base}${suffix}`);
  }

  return [...candidates];
}

/** 构建 VEO 视频查询端点候选列表 */
export function buildVeoVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const candidates = new Set<string>();

  // VEO 查询端点：/v1/video/query?id={taskId}
  const suffixes = [
    `/v1/video/query?id=${safeTaskId}`,
    `/video/query?id=${safeTaskId}`,
  ];
  for (const suffix of suffixes) {
    candidates.add(`${base}${suffix}`);
  }

  return [...candidates];
}

// ---------------------------------------------------------------------------
// Doubao（火山引擎）视频协议辅助
// ---------------------------------------------------------------------------

/** 构建 Doubao 视频提示词（追加分辨率/比例/时长等参数标记） */
export function buildDoubaoVideoPromptWithFlags(input: {
  prompt: string;
  ratio: string;
  resolution: string;
  durationSeconds: number;
}): string {
  const basePrompt = input.prompt.trim();
  const nextLines: string[] = [];
  const hasFlag = (flag: string): boolean => new RegExp(`(?:^|\\s)${flag}\\s+`, "i").test(basePrompt);
  if (!hasFlag("--rs")) {
    nextLines.push(`--rs ${input.resolution}`);
  }
  if (!hasFlag("--rt")) {
    nextLines.push(`--rt ${input.ratio}`);
  }
  if (!hasFlag("--dur")) {
    nextLines.push(`--dur ${input.durationSeconds}`);
  }
  if (!hasFlag("--fps")) {
    nextLines.push("--fps 24");
  }
  if (!hasFlag("--wm")) {
    nextLines.push("--wm 1");
  }
  if (!hasFlag("--cf")) {
    nextLines.push("--cf 0.5");
  }
  return nextLines.length > 0 ? `${basePrompt}\n${nextLines.join(" ")}` : basePrompt;
}

// ---------------------------------------------------------------------------
// Nano Banana 辅助函数
// ---------------------------------------------------------------------------

/** 从 Provider 响应中提取错误消息（遍历 error / data / result 嵌套） */
export function extractProviderErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const root = data as Record<string, unknown>;
  const firstObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const scopes = [root, firstObject(root.error), firstObject(root.data), firstObject(root.result)].filter(
    (item): item is Record<string, unknown> => Boolean(item),
  );
  for (const scope of scopes) {
    const codeRaw = scope.code ?? scope.error_code ?? scope.errorCode ?? scope.status;
    const messageRaw =
      scope.message ??
      scope.msg ??
      scope.detail ??
      scope.error_message ??
      scope.errorMessage ??
      (typeof scope.error === "string" ? scope.error : null);
    const message = typeof messageRaw === "string" ? messageRaw.trim() : "";
    const codeText = typeof codeRaw === "string" || typeof codeRaw === "number" ? String(codeRaw).trim() : "";
    if (message.length < 1) {
      continue;
    }
    const normalizedMessage = message.toLowerCase();
    if (["ok", "success", "succeeded"].includes(normalizedMessage)) {
      continue;
    }
    if (codeText.length < 1) {
      return message;
    }
    const normalizedCode = codeText.toLowerCase();
    if (["0", "200", "ok", "success", "succeeded", "true"].includes(normalizedCode)) {
      continue;
    }
    return `${codeText}: ${message}`;
  }
  return null;
}

/** 判断 Provider 消息是否应视为失败（匹配错误关键词，排除成功关键词） */
export function shouldTreatProviderMessageAsFailure(message: string | null): boolean {
  if (!message) {
    return false;
  }
  const normalized = message.trim().toLowerCase();
  if (normalized.length < 1) {
    return false;
  }
  if (["ok", "success", "succeeded", "completed", "done"].includes(normalized)) {
    return false;
  }
  return /(error|fail|invalid|forbidden|unauthorized|timeout|expired|insufficient|missing|exception|denied|not\s+allowed|not\s+found|gift_credit|rate.?limit|quota|blocked|reject)/i.test(
    normalized,
  );
}

/** 从 Nano Banana 响应中提取 request_id */
export function extractNanoBananaRequestId(data: unknown): string | null {
  const root = (data ?? {}) as Record<string, unknown>;
  const direct = String(root.request_id ?? root.requestId ?? "").trim();
  if (direct.length > 0) {
    return direct;
  }
  const nested =
    (root.data as Record<string, unknown> | undefined) ??
    (root.result as Record<string, unknown> | undefined) ??
    null;
  if (!nested) {
    return null;
  }
  const id = String(nested.request_id ?? nested.requestId ?? "").trim();
  return id.length > 0 ? id : null;
}

/** 从 Nano Banana 响应中提取 status/state */
export function extractNanoBananaStatus(data: unknown): string | null {
  const root = (data ?? {}) as Record<string, unknown>;
  const direct = String(root.status ?? root.state ?? "").trim();
  if (direct.length > 0) {
    return direct;
  }
  const nested =
    (root.data as Record<string, unknown> | undefined) ??
    (root.result as Record<string, unknown> | undefined) ??
    null;
  if (!nested) {
    return null;
  }
  const status = String(nested.status ?? nested.state ?? "").trim();
  return status.length > 0 ? status : null;
}

/** 将图片 URL 列表填充/截断到指定数量（用最后一个 URL 补齐） */
export function padImageUrls(urls: string[], count: number): string[] {
  if (urls.length < 1) {
    return [];
  }
  const normalized = [...urls];
  while (normalized.length < count) {
    normalized.push(normalized[normalized.length - 1] ?? normalized[0] ?? "");
  }
  return normalized.slice(0, count);
}
