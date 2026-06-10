import type { Step4VideoScene } from "../../../services/realApi/projects";

export interface Step4VideoJobSegment {
  content: string;
  visualCue: string;
  videoCue?: string;
}

/**
 * 分镜专业提示词中的视频提示词结构
 * 仅用于音乐推荐等功能，视频生成由后端自行获取
 */
export interface Step4ShotVideoPrompt {
  shot_id: number;
  video_prompt?: {
    prompt?: string;
    negative_prompt?: string;
    camera_motion?: string;
    motion_intensity?: string;
    duration_seconds?: number;
  };
}

export interface Step4VideoClipStatus {
  id: number;
  progress: number;
  status: "pending" | "generating" | "completed" | "failed";
  url?: string;
  prompt?: string;
  /** 失败时的错误信息 */
  errorMessage?: string;
  /** 失败状态的时间戳（毫秒），用于判断提示是否超过30分钟过期 */
  failedAt?: number;
}

export interface Step4VideoJobDto {
  id: string;
  status: "running" | "succeeded" | "failed" | "timeout";
  attempts: number;
  durationMinutes: number;
  startedAt: number;
  totalClipCount?: number;
  completedClipCount?: number;
  videoUrls?: string[];
  /** 单片段重试任务的目标镜头索引（从 0 开始），undefined 表示批量任务 */
  targetSceneIndex?: number;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface Step4VideoJobApi<TJob extends Step4VideoJobDto> {
  createVideoJob: (
    token: string,
    projectId: string,
    payload: { source?: "auto" | "manual"; targetSceneIndex?: number },
  ) => Promise<TJob>;
  listVideoJobs: (token: string, projectId: string) => Promise<{ jobs: TJob[] }>;
  getVideoJob: (token: string, projectId: string, jobId: string) => Promise<TJob>;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isStep4VideoAsset(url: string): boolean {
  const plain = url.split("?")[0] ?? "";
  return /\.(mp4|webm|mov|m4v)$/i.test(plain);
}

/**
 * 解析单个片段的视频提示词
 * 优先使用 previousPrompt（来自上一轮），其次从 segment 中提取
 */
function resolveStep4SegmentPrompt(
  segment: Step4VideoJobSegment,
  previousPrompt?: string,
): string {
  if (previousPrompt?.trim()) {
    return previousPrompt.trim();
  }

  // 从 segment 中提取提示词
  return segment.videoCue?.trim() || segment.visualCue?.trim() || segment.content?.trim() || "";
}

function resolveStep4ClipCount(job: Step4VideoJobDto, fallbackCount: number): number {
  const declared = Number(job.totalClipCount ?? 0);
  const videos = Array.isArray(job.videoUrls) ? job.videoUrls.length : 0;
  return Math.max(1, fallbackCount, declared, videos);
}

export function buildStep4VideoClipStatusesFromJob(
  segments: Step4VideoJobSegment[],
  previousStatuses: Step4VideoClipStatus[],
  job: Step4VideoJobDto,
): Step4VideoClipStatus[] {
  const previousById = new Map<number, Step4VideoClipStatus>(previousStatuses.map((item) => [item.id, item]));
  const totalClipCount = resolveStep4ClipCount(job, segments.length);
  const completedClipCount = Math.max(0, Math.min(totalClipCount, Number(job.completedClipCount ?? 0)));
  const videoUrls = Array.isArray(job.videoUrls) ? job.videoUrls : [];

  // 单片段重试任务：使用 targetSceneIndex 精确映射
  // 批量任务：按索引一一映射
  const isSingleClipRetryJob = typeof job.targetSceneIndex === "number";

  return segments.map((segment, index) => {
    const previous = previousById.get(index);
    const prompt = resolveStep4SegmentPrompt(segment, previous?.prompt);

    // 单片段重试任务：只有 targetSceneIndex 对应的镜头才取 job 中的 URL
    // 批量任务：按索引取 URL
    let returnedUrl = "";
    if (isSingleClipRetryJob) {
      if (index === job.targetSceneIndex) {
        // 单片段任务的 videoUrls[0] 对应 targetSceneIndex 位置
        returnedUrl = typeof videoUrls[0] === "string" ? videoUrls[0].trim() : "";
      }
    } else {
      returnedUrl = typeof videoUrls[index] === "string" ? videoUrls[index].trim() : "";
    }

    const previousUrl = typeof previous?.url === "string" ? previous.url.trim() : "";
    const completedUrl = [returnedUrl, previousUrl].find((item) => isStep4VideoAsset(item)) ?? "";
    const previewUrl = returnedUrl || previousUrl;
    const hasCompletedVideo = completedUrl.length > 0;

    // 单片段重试任务：只有 targetSceneIndex 对应的镜头状态由 job 决定，其他保持之前状态
    if (isSingleClipRetryJob) {
      if (index === job.targetSceneIndex) {
        // 目标镜头：根据 job 状态决定
        if (hasCompletedVideo) {
          return { id: index, progress: 100, status: "completed", prompt, url: completedUrl };
        }
        if (job.status === "running") {
          const previousProgress = previous?.status === "generating" ? previous.progress : 0;
          const nextProgress = Math.max(8, Math.min(95, previousProgress + 18));
          return { id: index, progress: nextProgress, status: "generating", prompt, ...(previewUrl.length > 0 ? { url: previewUrl } : {}) };
        }
      }
      // 非目标镜头：保持之前状态
      if (previous) {
        return { ...previous, prompt };
      }
      return { id: index, progress: 0, status: "pending", prompt, ...(previewUrl.length > 0 ? { url: previewUrl } : {}) };
    }

    // 批量任务的逻辑
    if ((job.status === "succeeded" || index < completedClipCount) && hasCompletedVideo) {
      return {
        id: index,
        progress: 100,
        status: "completed",
        prompt,
        url: completedUrl,
      };
    }

    if (job.status === "running" && index === completedClipCount) {
      const previousProgress = previous?.status === "generating" ? previous.progress : 0;
      const nextProgress = Math.max(8, Math.min(95, previousProgress + 18));
      return {
        id: index,
        progress: nextProgress,
        status: "generating",
        prompt,
        ...(previewUrl.length > 0 ? { url: previewUrl } : {}),
      };
    }

    return {
      id: index,
      progress: 0,
      status: "pending",
      prompt,
      ...(previewUrl.length > 0 ? { url: previewUrl } : {}),
    };
  });
}

export function buildStep4VideoJobCreatePayload(input: {
  source?: "auto" | "manual";
}): { source?: "auto" | "manual" } {
  const fullPayload: { source?: "auto" | "manual" } = {};
  if (input.source) {
    fullPayload.source = input.source;
  }
  return fullPayload;
}

export function mergeStep4FrameImageUrls(input: {
  primaryUrls?: string[];
  fallbackUrls?: string[];
  segmentCount: number;
}): string[] {
  const primaryUrls = Array.isArray(input.primaryUrls) ? input.primaryUrls : [];
  const fallbackUrls = Array.isArray(input.fallbackUrls) ? input.fallbackUrls : [];
  return Array.from({ length: input.segmentCount }, (_, index) => {
    const primary = typeof primaryUrls[index] === "string" ? primaryUrls[index].trim() : "";
    if (primary) {
      return primary;
    }
    return typeof fallbackUrls[index] === "string" ? fallbackUrls[index].trim() : "";
  });
}

export function canCreateStep4Variant(input: {
  primaryStatus: Step4VideoClipStatus["status"];
  existingVariantCount: number;
}): boolean {
  if (input.primaryStatus === "completed") {
    return true;
  }
  return input.existingVariantCount < 2;
}

export function isSyntheticStep4VideoUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.includes("placehold.co") ||
    normalized.includes("forbiggerfun.mp4") ||
    normalized.includes("gtv-videos-bucket") ||
    normalized.includes("mock-video")
  );
}

/**
 * 判断是否应该忽略最新的视频任务
 *
 * 忽略条件：
 * 1. 任务不存在
 * 2. 单片段重试任务（有 targetSceneIndex）不应作为页面恢复的"最新任务"
 * 3. 任务已完成，但所有 URL 都是合成/占位 URL
 * 4. 片段数与期望不一致（兼容没有 targetSceneIndex 的旧任务）
 *
 * @param job 视频任务
 * @param expectedClipCount 期望的片段数量（segments.length），不传则跳过数量检查
 */
export function shouldIgnoreStep4LatestVideoJob(
  job: Step4VideoJobDto | undefined,
  expectedClipCount?: number,
): boolean {
  if (!job) {
    console.log(`[Step4] shouldIgnoreStep4LatestVideoJob: job 不存在，忽略`);
    return true;
  }
  if (job.status === "running") {
    console.log(`[Step4] shouldIgnoreStep4LatestVideoJob: running 任务不忽略, jobId=${job.id}, targetSceneIndex=${job.targetSceneIndex}`);
    return false;
  }

  // 单片段重试任务（有 targetSceneIndex）不应覆盖批量任务作为"最新任务"
  if (typeof job.targetSceneIndex === "number") {
    console.log(
      `[Step4] shouldIgnoreStep4LatestVideoJob: 单片段重试任务，忽略作为最新任务 jobId=${job.id}, targetSceneIndex=${job.targetSceneIndex}`,
    );
    return true;
  }

  // 兼容旧任务：没有 targetSceneIndex 但片段数不匹配
  if (job.status === "succeeded") {
    if (typeof expectedClipCount === "number" && expectedClipCount > 1) {
      const jobClipCount = Math.max(1, Number(job.totalClipCount ?? 1));
      if (jobClipCount !== expectedClipCount) {
        console.log(
          `[Step4] shouldIgnoreStep4LatestVideoJob: succeeded 单片段任务片段数不匹配，忽略任务 jobId=${job.id}, jobClipCount=${jobClipCount}, expectedClipCount=${expectedClipCount}`,
        );
        return true;
      }
    }
    return false;
  }

  // 兼容旧任务：failed/timeout 状态的单片段任务
  if (typeof expectedClipCount === "number" && expectedClipCount > 1) {
    const jobClipCount = Math.max(1, Number(job.totalClipCount ?? 1));
    if (jobClipCount !== expectedClipCount) {
      console.log(
        `[Step4] shouldIgnoreStep4LatestVideoJob: 片段数不匹配，忽略任务 jobId=${job.id}, jobClipCount=${jobClipCount}, expectedClipCount=${expectedClipCount}`,
      );
      return true;
    }
  }

  const urls = Array.isArray(job.videoUrls)
    ? job.videoUrls.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
  if (urls.length < 1) {
    return false;
  }
  if (!urls.some((item) => isStep4VideoAsset(item))) {
    return true;
  }
  return urls.every((item) => isSyntheticStep4VideoUrl(item));
}

/**
 * 恢复视频任务时选择合适的任务
 *
 * 会过滤掉片段数量不匹配的单片段重试任务
 * 优先选择 succeeded 状态的任务，确保页面正确显示已生成的视频
 *
 * @param expectedClipCount 期望的片段数量（segments.length），用于过滤单片段重试任务
 */
export function resolveStep4ResumeVideoJob<TJob extends Step4VideoJobDto>(input: {
  snapshotLatestJob?: TJob | null;
  listedJobs?: TJob[];
  expectedClipCount?: number;
}): TJob | null {
  const snapshotLatestJob = input.snapshotLatestJob ?? null;
  const listedJobs = Array.isArray(input.listedJobs) ? input.listedJobs : [];

  console.log(`[Step4] resolveStep4ResumeVideoJob: listedJobs=${listedJobs.length}, expectedClipCount=${input.expectedClipCount}`);
  listedJobs.forEach((job, idx) => {
    console.log(`[Step4]   job[${idx}]: id=${job.id}, status=${job.status}, targetSceneIndex=${job.targetSceneIndex}`);
  });

  // 【优先级1】如果有 running 任务，优先返回它（需要恢复轮询）
  console.log(`[Step4] 检查 running 任务...`);
  for (const job of listedJobs) {
    console.log(`[Step4]   检查 job ${job.id}: status=${job.status}`);
    if (job.status === "running") {
      const shouldIgnore = shouldIgnoreStep4LatestVideoJob(job, input.expectedClipCount);
      console.log(`[Step4]   shouldIgnore=${shouldIgnore}`);
      if (!shouldIgnore) {
        console.log(`[Step4] resolveStep4ResumeVideoJob: 返回 running 任务 id=${job.id}`);
        return job;
      }
    }
  }

  // 【优先级2】选择 succeeded 状态的任务（有真实视频）
  const succeededJob = listedJobs.find(
    (job) => job.status === "succeeded" && !shouldIgnoreStep4LatestVideoJob(job, input.expectedClipCount)
  );
  if (succeededJob) {
    console.log(`[Step4] resolveStep4ResumeVideoJob: 返回 succeeded 任务 id=${succeededJob.id}`);
    return succeededJob;
  }

  // 【优先级3】snapshot 中的最新任务（如果不应该被忽略）
  if (snapshotLatestJob && !shouldIgnoreStep4LatestVideoJob(snapshotLatestJob, input.expectedClipCount)) {
    console.log(`[Step4] resolveStep4ResumeVideoJob: 返回 snapshotLatestJob id=${snapshotLatestJob.id}`);
    return snapshotLatestJob;
  }

  // 【优先级4】其他任务（timeout、failed 等）
  const otherJob = listedJobs.find((job) => !shouldIgnoreStep4LatestVideoJob(job, input.expectedClipCount)) ?? null;
  if (otherJob) {
    console.log(`[Step4] resolveStep4ResumeVideoJob: 返回其他任务 id=${otherJob.id}`);
  } else {
    console.log(`[Step4] resolveStep4ResumeVideoJob: 没有找到合适的任务`);
  }
  return otherJob;
}

export async function startStep4VideoJob<TJob extends Step4VideoJobDto>(input: {
  api: Step4VideoJobApi<TJob>;
  token: string;
  projectId: string;
  source?: "auto" | "manual";
}): Promise<TJob> {
  const payload = buildStep4VideoJobCreatePayload({ source: input.source });
  return input.api.createVideoJob(input.token, input.projectId, payload);
}

export async function pollStep4VideoJob<TJob extends Step4VideoJobDto>(input: {
  api: Step4VideoJobApi<TJob>;
  token: string;
  projectId: string;
  jobId: string;
}): Promise<TJob> {
  return input.api.getVideoJob(input.token, input.projectId, input.jobId);
}

export async function runStep4SingleClipRetry<TJob extends Step4VideoJobDto>(input: {
  api: Step4VideoJobApi<TJob>;
  token: string;
  projectId: string;
  sceneIndex: number;  // 目标镜头索引（从 0 开始）
  maxRounds?: number;
  pollIntervalMs?: number;
  onProgress?: (progress: number) => void;
}): Promise<{ job: TJob; resolvedUrl: string | undefined }> {
  const job = await input.api.createVideoJob(input.token, input.projectId, {
    targetSceneIndex: input.sceneIndex,
    source: "manual",
  });

  const maxRounds = Math.max(1, input.maxRounds ?? 100);
  const pollIntervalMs = Math.max(0, input.pollIntervalMs ?? 5000);
  for (let round = 0; round < maxRounds; round += 1) {
    const current = await input.api.getVideoJob(input.token, input.projectId, job.id);
    if (current.status === "succeeded") {
      return {
        job: current,
        resolvedUrl: current.videoUrls?.[0],
      };
    }
    if (current.status === "failed" || current.status === "timeout") {
      throw new Error(current.error?.message || "视频任务失败");
    }
    input.onProgress?.(Math.min(95, 15 + round * 10));
    await sleepMs(pollIntervalMs);
  }
  return {
    job,
    resolvedUrl: undefined,
  };
}

// ============================================================================
// step4_video_scenes 相关类型和函数
// ============================================================================

/**
 * 从 step4_video_scenes 数据构建 clipStatuses（单一数据源）
 *
 * @param scenes step4_video_scenes 记录数组
 * @param segments 分镜段落数据（用于确定数量和提示词回退）
 * @returns clipStatuses 数组
 */
export function buildClipStatusesFromScenes(
  scenes: Step4VideoScene[],
  segments: Step4VideoJobSegment[],
): Step4VideoClipStatus[] {
  const sceneByIndex = new Map<number, Step4VideoScene>(
    scenes.map((s) => [s.sceneIndex, s])
  );

  return segments.map((segment, index) => {
    const scene = sceneByIndex.get(index);
    const frameIndex = index + 1;

    // 优先使用 scene 中的 clipPrompt，其次回退到 segment
    const prompt =
      scene?.clipPrompt?.trim() ||
      segment.videoCue?.trim() ||
      segment.visualCue?.trim() ||
      segment.content?.trim() ||
      `镜头 ${frameIndex}`;

    // 从 scene 获取状态
    if (scene) {
      // failed 状态保持为 failed，不再转为 pending
      const status: Step4VideoClipStatus["status"] =
        scene.clipStatus === "generating" ? "generating" :
        scene.clipStatus === "completed" ? "completed" :
        scene.clipStatus === "failed" ? "failed" : "pending";

      // 视频URL取 variantUrls 的第一个或 clipUrl
      const url = scene.variantUrls[0] || scene.clipUrl || undefined;

      return {
        id: index,
        progress: scene.clipProgress,
        status,
        prompt,
        ...(url ? { url } : {}),
        ...(scene.updatedAt ? { failedAt: status === "failed" ? scene.updatedAt : undefined } : {}),
      };
    }

    // 没有 scene 记录，返回默认 pending 状态
    return {
      id: index,
      progress: 0,
      status: "pending" as const,
      prompt,
    };
  });
}

