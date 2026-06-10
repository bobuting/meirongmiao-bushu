import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";
import type { VideoHotTrendResolvedProvider } from "../contracts/video-hot-trend-sync-contract.js";
import type { QueueDispatcher } from "../modules/queue-dispatcher.js";
import { requireUser } from "../services/auth/route-guards.js";
import { resolveRouteProviderWithFallback, recordRouteAudit } from "../services/llm/provider-resolver.js";
import { buildGeminiInlineVideoPart, buildGeminiRemoteVideoPart } from "../services/llm/gemini-utils.js";
import { requestGeminiPlainTextWithVideoPart } from "../services/llm/llm-transport.js";
import { normalizeDouyinReverseInputUrl, isLikelyDirectPlayableVideoUrl, pickPreferredResolvedVideoUrl } from "../services/media/video-reverse.js";
import { isSupportedVideoReverseMultipartMimeType } from "../contracts/video-reverse-multipart-entry.js";
import { AppError } from "../core/errors.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { getLogger } from "../core/logger/index.js";
import {
  runSingleVideoLlmReverse,
  type SingleVideoReverseDeps,
} from "../modules/video-hot-trend/single-reverse-service.js";
import { ScriptType } from "../contracts/types.js";
import type { ShotBreakdownRaw } from "../repositories/pg/shot-breakdown-pg-repository.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../services/llm/llm-debug-recorder.js";
import { compressVideoForLlm } from "../utils/video-compression.js";
import { freezeCredit, unfreezeCredit, deductFrozenCredit } from "../services/llm/llm-transport.js";
import ffmpegStatic from "ffmpeg-static";
import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  createAsyncJob,
  purgeExpiredAsyncJobs,
  getAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
  checkAndFinalizeParent,
} from "../service/async-job-service.js";

const execFileAsync = promisify(execFile);
const logger = getLogger("reverse-square-routes");

/** 使用 ffmpeg 从视频 Buffer 中截取第一帧，返回 JPEG Buffer */
async function extractVideoFrame(videoBuffer: Buffer, log: FastifyInstance["log"]): Promise<Buffer | null> {
  // 优先使用环境变量 FFMPEG_BIN，其次 ffmpeg-static，最后回退系统 ffmpeg
  const ffmpegPath = process.env.FFMPEG_BIN || ffmpegStatic || "ffmpeg";
  if (!ffmpegPath) {
    log.warn("ffmpeg not available, skip frame extraction");
    return null;
  }
  const tmpDir = mkdtempSync(join(tmpdir(), "reverse-frame-"));
  const videoPath = join(tmpDir, "video.mp4");
  const framePath = join(tmpDir, "frame.jpg");
  try {
    writeFileSync(videoPath, videoBuffer);
    await execFileAsync(ffmpegPath, [
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "2",
      "-y",
      framePath,
    ], { timeout: 30_000 });
    return readFileSync(framePath);
  } catch (e) {
    log.warn({ err: e }, "extractVideoFrame: failed (non-fatal)");
    return null;
  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  }
}

export interface ReverseSquareRouteHandlers {
  readonly reverseParseV2Start: RouteHandlerMethod;
  readonly reverseParseV2Job: RouteHandlerMethod;
  readonly reverseParseV2: RouteHandlerMethod;
  readonly reverseParse: RouteHandlerMethod;
  readonly squareResources: RouteHandlerMethod;
}

export function registerReverseSquareRoutes(
  app: FastifyInstance,
  handlers: ReverseSquareRouteHandlers,
): void {
  app.post("/reverse/parse-v2/jobs", handlers.reverseParseV2Start);
  app.get("/reverse/parse-v2/jobs/:jobId", handlers.reverseParseV2Job);
  app.post("/reverse/parse-v2", handlers.reverseParseV2);
  app.post("/reverse/parse", handlers.reverseParse);
  app.get("/square/resources", handlers.squareResources);
}

/**
 * 注册需要 AppContext 的反向相关路由
 *
 * 持久化：nrm_async_jobs 表（PostgreSQL）
 * 建表 SQL:
 *   CREATE TABLE IF NOT EXISTS nrm_async_jobs (
 *     id VARCHAR(64) PRIMARY KEY,
 *     user_id VARCHAR(64) NOT NULL,
 *     input TEXT NOT NULL,
 *     status VARCHAR(20) NOT NULL DEFAULT 'pending',
 *     stage VARCHAR(20),
 *     result JSONB,
 *     error JSONB,
 *     created_at BIGINT NOT NULL,
 *     updated_at BIGINT NOT NULL
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_async_jobs_user_status
 *     ON nrm_async_jobs(user_id, status);
 */

/** LLM 反推任务的阶段定义 */
type LlmReverseJobStage =
  | "解析中"      // 解析视频 URL（跟随 redirect、短链展开等）
  | "下载中"      // 下载视频到内存
  | "上传中"      // 上传视频到 OSS
  | "分析中"      // LLM 多模态反推分析
  | "持久化中";   // 持久化到用户脚本库和广场

/**
 * 执行 LLM 反推核心逻辑（抽取为独立函数，供同步和异步路径复用）
 */
/**
 * 执行 LLM 反推核心逻辑（带 stage 追踪，供 job 模式使用）
 */
async function executeLlmReverseCoreWithStages(
  app: FastifyInstance,
  ctx: AppContext,
  deps: NonNullable<Parameters<typeof registerReverseContextRoutes>[2]>,
  userId: string,
  normalizedUrl: string,
  setStage: (stage: LlmReverseJobStage) => void,
  jobResultRef?: { current: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  // 冻结积分（防止并发白嫖）
  const { freezeId } = await freezeCredit({ ctx, routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE, userId });

  try {
    // 累积各阶段关键信息到 result，供任务队列查询展示
    const jobResult: Record<string, unknown> = jobResultRef?.current ?? {};

  setStage("解析中");

  // ---- 阶段 A: 解析视频 URL ----
  let resolvedVideoUrl: string;
  let resolveSource = "input";
  if (isLikelyDirectPlayableVideoUrl(normalizedUrl)) {
    resolvedVideoUrl = normalizedUrl;
  } else {
    const orchestrator = deps?.buildSquareTrendVideoResolveOrchestrator?.();
    if (orchestrator) {
      const trace = await orchestrator.execute({ userId, projectId: `single-reverse:${userId}`, url: normalizedUrl });
      if (trace.success && trace.resolvedVideoUrl) {
        const preferred = pickPreferredResolvedVideoUrl(normalizedUrl, trace).trim();
        if (/^https?:\/\//i.test(preferred)) {
          resolvedVideoUrl = preferred;
          resolveSource = "tikhub";
        } else {
          // 解析结果不是有效 URL，抛出错误（禁止降级）
          throw new AppError(502, "VIDEO_URL_RESOLVE_FAILED", `短链接解析失败：解析结果无效 (${preferred})，请使用直接视频链接`);
        }
      } else {
        // 解析失败，提取详细错误信息（禁止降级）
        const tikhubAttempts = trace.attempts
          .filter((a) => a.provider.includes("tikhub"))
          .filter((a) => a.status === "failed");

        // 构建详细错误消息
        let errorDetail = "TikHub 未提取到下载 URL";
        if (tikhubAttempts.length > 0) {
          const details = tikhubAttempts.map((a) => {
            const endpointType = a.provider.includes(":fallback") ? "备用端点" : "主端点";
            return `${endpointType}:${a.reasonCode}${a.detail ? `(${a.detail})` : ""}`;
          });
          errorDetail = `TikHub 解析失败 (${details.join(" → ")})`;
        }

        app.log.warn(
          {
            module: "reverse-square-routes",
            url: normalizedUrl,
            trace,
            tikhubAttempts,
          },
          "短链接解析失败",
        );

        throw new AppError(
          502,
          "VIDEO_URL_RESOLVE_FAILED",
          `短链接解析失败：${errorDetail}，请检查 TikHub 配置或使用直接视频链接`,
        );
      }
    } else {
      // orchestrator 未配置，抛出错误（禁止降级）
      throw new AppError(502, "VIDEO_URL_RESOLVE_FAILED", `短链接解析服务未配置，请使用直接视频链接或检查 TikHub 配置`);
    }
  }
  jobResult.resolvedVideoUrl = resolvedVideoUrl;
  jobResult.resolveSource = resolveSource;

  setStage("下载中");

  // ---- 阶段 B: 下载视频（含重试） ----
  // 存储 Buffer 而非 base64 string，避免同一视频在内存中存在多份副本
  let downloadResult: { bytes: Buffer; mimeType: string } | null = null;
  const maxAttempts = 3;
  const maxVideoBytes = 200 * 1024 * 1024; // 200MB
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        setStage(`下载中(重试${attempt - 1}/${maxAttempts - 1})` as LlmReverseJobStage);
      }
      // 添加浏览器请求头，避免抖音 CDN 反爬断开连接
      const browserHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
      };
      if (resolvedVideoUrl.includes("zjcdn.com") || resolvedVideoUrl.includes("douyin.com")) {
        browserHeaders["Referer"] = "https://www.douyin.com/";
      }
      // 连接阶段：try/finally 确保清理 AbortController 定时器
      const connectController = new AbortController();
      const connectTimer = setTimeout(() => connectController.abort(), ctx.configService.get().videoDownloadTimeoutMs);
      let response: Response;
      try {
        response = await fetch(resolvedVideoUrl, {
          signal: connectController.signal,
          headers: browserHeaders,
        });
      } finally {
        clearTimeout(connectTimer);
      }

      // 非 OK 响应也触发重试（CDN 429/503 等）
      if (!response.ok) {
        throw new AppError(502, "VIDEO_DOWNLOAD_HTTP_ERROR", `视频下载失败，HTTP ${response.status}`);
      }

      // Content-Length 预检：超过 500MB 直接拒绝，避免无效下载
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 500 * 1024 * 1024) {
        throw new AppError(413, "VIDEO_TOO_LARGE", `视频文件过大(${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB)，请选择较小的视频`);
      }

      const rawMimeType = response.headers.get("content-type") || "";
      if (!isSupportedVideoReverseMultipartMimeType(rawMimeType)) {
        throw new AppError(415, "VIDEO_UNSUPPORTED_FORMAT", `不支持的视频格式: ${rawMimeType || "未知"}`);
      }
      const mimeType = rawMimeType;

      // 下载阶段：独立超时，防止大文件下载挂起
      const downloadController = new AbortController();
      const downloadTimer = setTimeout(() => downloadController.abort(), ctx.configService.get().videoDownloadTimeoutMs);
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await Promise.race([
          response.arrayBuffer(),
          new Promise<never>((_, reject) => {
            downloadController.signal.addEventListener("abort", () => reject(new AppError(504, "VIDEO_DOWNLOAD_TIMEOUT", "下载超时，视频文件较大请重试")), { once: true });
          }),
        ]);
      } finally {
        clearTimeout(downloadTimer);
      }

      const bytes = Buffer.from(arrayBuffer);
      if (bytes.length < 1024) {
        throw new AppError(502, "VIDEO_DOWNLOAD_INCOMPLETE", "下载的视频数据不完整");
      }
      // 超过阈值压缩，压缩失败则使用原始数据
      if (bytes.length > maxVideoBytes) {
        try {
          app.log.info({ originalSize: bytes.length }, "video exceeds 200MB, compressing");
          const compressed = await compressVideoForLlm(bytes, mimeType, {
            info: (obj, msg) => app.log.info(obj, msg),
            warn: (obj, msg) => app.log.warn(obj, msg),
          });
          downloadResult = { bytes: compressed.compressedBytes, mimeType };
        } catch (compErr) {
          app.log.warn({ err: compErr, originalSize: bytes.length }, "video compression failed, using original");
          downloadResult = { bytes, mimeType };
        }
      } else {
        downloadResult = { bytes, mimeType };
      }
      // 下载成功，跳出重试循环
      break;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        app.log.warn({ err, sourceUrl: resolvedVideoUrl, attempt, maxAttempts }, "downloadVideoForLlm: 下载失败，准备重试");
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      } else {
        app.log.warn({ err, sourceUrl: resolvedVideoUrl, attempt }, "downloadVideoForLlm: 重试耗尽");
      }
    }
  }

  if (!downloadResult) {
    // 统一包装为用户友好错误
    if (lastError instanceof AppError) throw lastError;
    throw new AppError(502, "VIDEO_DOWNLOAD_FAILED", "视频下载失败，请稍后重试");
  }
  jobResult.videoMimeType = downloadResult.mimeType;
  jobResult.videoSize = downloadResult.bytes.length;

  setStage("上传中");

  // ---- 阶段 C: 上传到 OSS（直接使用 Buffer，不再 base64 中转） ----
  let ossUrl: string | null = null;
  if (ctx.storage) {
    try {
      const ext = downloadResult.mimeType.includes("mp4") ? "mp4" : downloadResult.mimeType.includes("webm") ? "webm" : "mp4";
      const key = `single-reverse/${ctx.clock.generateId()}/video.${ext}`;
      await ctx.storage.putObject(key, new Uint8Array(downloadResult.bytes), downloadResult.mimeType);
      ossUrl = await ctx.storage.getSignedUrl(key);
    } catch (e) {
      app.log.warn({ err: e }, "uploadVideoToOss: failed (non-fatal)");
    }
  }
  jobResult.ossUrl = ossUrl ?? null;

  // ---- 截取视频第一帧作为封面图（直接使用 Buffer） ----
  let coverUrl: string | null = null;
  try {
    const frameBuffer = await extractVideoFrame(downloadResult.bytes, app.log);
    if (frameBuffer && ctx.storage) {
      const coverKey = `single-reverse/${ctx.clock.generateId()}/cover.jpg`;
      await ctx.storage.putObject(coverKey, new Uint8Array(frameBuffer), "image/jpeg");
      coverUrl = await ctx.storage.getSignedUrl(coverKey);
      app.log.info({ coverUrl }, "single-reverse: extracted cover frame");
    }
  } catch (e) {
    app.log.warn({ err: e }, "single-reverse: cover frame extraction failed (non-fatal)");
  }
  jobResult.coverUrl = coverUrl;

  setStage("分析中");

  // ---- 阶段 D: 构建 deps 调用核心管道 ----
  // 仅在此处将 Buffer 转为 base64，供 LLM 内联传输使用
  const videoBase64 = downloadResult.bytes.toString("base64");
  const singleDeps: SingleVideoReverseDeps = {
    downloadVideoForLlm: async () => ({ base64: videoBase64, mimeType: downloadResult.mimeType }),
    uploadVideoToOss: async () => ossUrl, // 已上传，直接返回
    resolveVideoUrl: async () => resolvedVideoUrl,
    resolveRouteProviderWithFallback: async (routeKeys) => await resolveRouteProviderWithFallback(ctx, routeKeys),
    requestGeminiPlainTextWithVideoPart,
    buildGeminiInlineVideoPart,
    buildGeminiRemoteVideoPart,
    generateId: () => ctx.clock.generateId(),
    now: () => ctx.clock.now(),
    log: app.log,
    recordRouteAudit: (routeKey, startedAt, status, cost, errorCode, errorMessage, requestSummary, responseSummary) =>
      recordRouteAudit(ctx, routeKey as ProviderRouteKey, startedAt, status, cost, errorCode, errorMessage, requestSummary, responseSummary),
    createLlmDebugRecord: (input) =>
      createLlmDebugRecord(ctx, { ...input, userId, provider: input.provider as unknown as VideoHotTrendResolvedProvider }),
    finalizeLlmDebugRecordSuccess: (input) => finalizeLlmDebugRecordSuccess(ctx, input),
    finalizeLlmDebugRecordError: (input) => finalizeLlmDebugRecordError(ctx, input),
  };

  const result = await runSingleVideoLlmReverse(singleDeps, normalizedUrl);

  // 视频逆向成功后扣减冻结积分
  if (freezeId) {
    await deductFrozenCredit({ ctx, routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE, userId }, freezeId, "llm_image");
  }

  setStage("持久化中");

  // ---- 持久化到用户脚本库 ----
  const scriptContent = (() => {
    const frames = result.storyboardPanel?.report?.frames ?? [];
    if (frames.length > 0) return frames.map((f) => f.narration || f.visualCue || f.title || "").filter(Boolean).join("\n");
    const sections = result.storyboardPanel?.report?.sections ?? [];
    if (sections.length > 0) return sections.map((s) => `${s.title}\n${s.content}`).filter(Boolean).join("\n\n");
    return result.libraryScript?.content ?? "";
  })();

  const analysis = (() => {
    const raw = result.rawLlmOutput;
    if (!raw) return undefined;
    const va = (raw.video_analysis ?? {}) as unknown as Record<string, unknown>;
    const fp = (va.fashion_placement ?? {}) as Record<string, unknown>;
    const emotion = (va.emotion ?? {}) as Record<string, unknown>;
    const onScreen = (va.on_screen_presence ?? {}) as Record<string, unknown>;
    const vi = (raw.video_info ?? {}) as unknown as Record<string, unknown>;
    return {
      theme: va.theme as string | undefined,
      summary: va.summary as string | undefined,
      primaryEmotion: emotion.primary as string | undefined,
      videoType: va.video_type as string | undefined,
      videoStyle: va.video_style as string | undefined,
      fashionSuitable: fp.suitable as boolean | undefined,
      fashionReason: fp.reason as string | undefined,
      emotionDetail: emotion,
      onScreenPresence: onScreen,
      fashionStyles: Array.isArray(fp.recommended_styles) ? fp.recommended_styles as Record<string, unknown>[] : undefined,
      editingAnalysis: raw.editing_analysis as unknown as Record<string, unknown> | undefined,
      durationSeconds: typeof vi.duration_seconds === "number" ? Math.round(vi.duration_seconds) : undefined,
      sourceOssUrl: result.ossUrl ?? undefined,
      source: "single_reverse",
    };
  })();

  const videoInfoTitle = (result.rawLlmOutput as unknown as Record<string, unknown> | null)?.video_info
    ? ((result.rawLlmOutput as unknown as Record<string, unknown>).video_info as Record<string, unknown>).title as string | undefined
    : undefined;
  const createdScript = await ctx.scriptLibraryService.create(userId, {
    title: videoInfoTitle ?? result.libraryScript?.title ?? result.storyboardPanel?.report?.intro?.slice(0, 80) ?? "视频反推脚本",
    content: scriptContent || "暂无文案内容",
    type: (analysis?.onScreenPresence?.has_real_person === true) ? ScriptType.REVERSE : ScriptType.PRODUCT_SHOWCASE,
    tags: result.libraryScript?.tags ?? ["#反推生成"],
    analysis,
  });

  app.log.info({ scriptId: createdScript.id, userId }, "single-reverse: created script");

  // 写入用户脚本关联（非关键，失败不阻断主流程）
  let assocId: string | null = null;
  try {
    assocId = crypto.randomUUID();
    await ctx.repos.userScriptAssocs.create({ id: assocId, userId, scriptDataId: createdScript.id, title: createdScript.title, tags: createdScript.tags, source: "reverse" });
  } catch (e) { app.log.warn({ err: e }, "single-reverse: user-script assoc failed"); }

  // 将视频加入广场（按 topic+trend_type 去重，冲突时更新）
  let assetId: string | null = null;
  try {
    assetId = crypto.randomUUID();
    const title = result.libraryScript?.title ?? result.storyboardPanel?.report?.intro?.slice(0, 80) ?? "视频反推";
    const now = Date.now();
    assetId = await ctx.repos.hotTrendAssets.upsertForReverse({
      id: assetId, topic: title, url: normalizedUrl, rank: 999, section: "用户反推",
      source: "用户反推", trendType: "video", sourceOssUrl: result.ossUrl ?? normalizedUrl,
      coverUrl, scriptId: createdScript.id, createdAt: now, updatedAt: now,
    });
    await ctx.repos.videoScriptAssocs.upsertAssoc({ videoSource: "hot_trend_asset", videoId: assetId, videoUrl: normalizedUrl, scriptId: createdScript.id, userId, entryPoint: "square_replica" });
  } catch (e) { app.log.warn({ err: e }, "single-reverse: add to square failed"); }

  // 写入分镜原始数据（非关键，失败不阻断主流程）
  try {
    const rawShots = result.rawLlmOutput?.shot_breakdown;
    if (Array.isArray(rawShots) && rawShots.length > 0) {
      await ctx.repos.shotBreakdowns.batchInsert({ scriptDataId: createdScript.id, shots: rawShots as unknown as ShotBreakdownRaw[], createdAt: Date.now(), updatedAt: Date.now() });
    }
  } catch (e) { app.log.warn({ err: e }, "single-reverse: shot breakdown failed"); }

  // 持久化完成后，追加最终信息到 result（保留已累积的阶段关键信息）
    jobResult.status = "success";
    jobResult.scriptId = createdScript.id;
    jobResult.scriptTitle = createdScript.title;
    jobResult.assocId = assocId;
    jobResult.assetId = assetId;
    if (jobResult.ossUrl === null) {
      jobResult.ossUrl = result.ossUrl ?? normalizedUrl;
    }
    return jobResult;
  } catch (error) {
    // 失败后解冻积分
    if (freezeId) {
      await unfreezeCredit({ ctx, routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE, userId }, freezeId);
    }
    throw error;
  }
}

// ========== LLM Reverse 执行器（供 ExecutorRegistry 调用） ==========

type LlmReverseExecutorFn = (params: {
  pool: import("pg").Pool;
  jobId: string;
  ctx: AppContext;
  dispatcher?: QueueDispatcher;
  repos: import("../repositories/pg/index.js").PgRepositoryCollection;
}) => Promise<void>;

let _llmReverseExecutor: LlmReverseExecutorFn | null = null;
let _llmReverseDeps: NonNullable<Parameters<typeof registerReverseContextRoutes>[2]> | null = null;

/** 设置 LLM Reverse 执行器的依赖（在路由注册时调用） */
export function setLlmReverseDeps(deps: NonNullable<Parameters<typeof registerReverseContextRoutes>[2]>): void {
  _llmReverseDeps = deps;
}

/** 获取 LLM Reverse 执行器（供 ExecutorRegistry 调用） */
export function getLlmReverseExecutor(): LlmReverseExecutorFn | null {
  return _llmReverseExecutor;
}

/** 创建 LLM Reverse 执行器 */
export function createLlmReverseExecutor(ctx: AppContext): LlmReverseExecutorFn {
  // 创建模拟 app 对象，使用 logger 替代 app.log
  // 使用 any 类型绕过 FastifyInstance['log'] 的严格类型检查
  const mockApp: FastifyInstance = {
    log: {
      info: (obj: any, msg?: string) => logger.info(obj as Record<string, unknown>, msg),
      warn: (obj: any, msg?: string) => logger.warn(obj as Record<string, unknown>, msg),
      error: (obj: any, msg?: string) => logger.error(obj as Record<string, unknown>, msg),
      debug: (obj: any, msg?: string) => logger.debug(obj as Record<string, unknown>, msg),
    } as any,
  } as FastifyInstance;

  return async (params: { pool: import("pg").Pool; jobId: string; ctx: AppContext; dispatcher?: QueueDispatcher; repos: import("../repositories/pg/index.js").PgRepositoryCollection }): Promise<void> => {
    const { pool, jobId, dispatcher, repos } = params;
    const now = ctx.clock.now();
    const jobResultRef: { current: Record<string, unknown> } = { current: {} };

    const setStage = (stage: LlmReverseJobStage) => {
      void updateAsyncJobStage(repos, jobId, stage, ctx.clock.now(), jobResultRef.current);
    };

    try {
      // 获取任务信息
      const job = await getAsyncJob(repos, jobId, () => ctx.clock.now());
      if (!job || job.status !== "running") return;

      const input = JSON.parse(job.input) as { url: string; templateId?: string };
      const normalizedUrl = input.url;
      const templateId = input.templateId;
      const userId = job.userId;
      const deps = _llmReverseDeps ?? {};

      // 更新状态为解析中
      await updateAsyncJobStage(repos, jobId, '解析中', now, jobResultRef.current);

      // 执行核心逻辑（使用 mockApp 替代真实 app）
      const result = await executeLlmReverseCoreWithStages(
        mockApp, ctx, deps, userId, normalizedUrl, setStage, jobResultRef
      );

      await finalizeAsyncJob(repos, jobId, "completed", result, null, ctx.clock.now(), dispatcher);

      // 反推完成后，关联脚本到模板（如果指定了 templateId）
      if (templateId && result.scriptId) {
        try {
          const scriptId = result.scriptId as string;
          await ctx.repos.squareTemplates.updateScriptDataId(templateId, scriptId, ctx.clock.now());
          logger.info({ templateId, scriptId, jobId }, "反推完成：已关联脚本到模板");
        } catch (e) {
          logger.warn({ err: e, templateId }, "反推完成：关联脚本到模板失败（非阻断）");
        }
      }

      // 【修复】成功时检查父任务是否需要自动完成
      if (job.parentJobId && dispatcher) {
        await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
      }
    } catch (error) {
      const pgMeta = typeof error === "object" && error !== null
        ? { table: (error as Record<string, unknown>).table, column: (error as Record<string, unknown>).column, detail: (error as Record<string, unknown>).detail, hint: (error as Record<string, unknown>).hint, schema: (error as Record<string, unknown>).schema }
        : {};
      logger.error({ err: error, pgMeta, jobId }, "LlmReverseJob failed — full pg error context");
      const errObj = {
        code: error instanceof Error && "code" in error ? (error as { code: string }).code : "LLM_REVERSE_FAILED",
        message: error instanceof Error ? error.message : "反推失败",
        pgTable: typeof pgMeta.table === "string" ? pgMeta.table : undefined,
        pgColumn: typeof pgMeta.column === "string" ? pgMeta.column : undefined,
        pgDetail: typeof pgMeta.detail === "string" ? pgMeta.detail : undefined,
      };
      await finalizeAsyncJob(repos, jobId, "failed", jobResultRef.current, errObj, ctx.clock.now(), dispatcher);

      // 【修复】失败时检查父任务是否需要自动完成
      const jobForParent = await getAsyncJob(repos, jobId, () => ctx.clock.now());
      if (jobForParent?.parentJobId && dispatcher) {
        await checkAndFinalizeParent(repos, jobForParent.parentJobId, dispatcher, ctx.clock.now());
      }
    }
  };
}

export function registerReverseContextRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps?: {
    buildSquareTrendVideoResolveOrchestrator?: () => {
      execute: (input: { userId: string; projectId: string; url: string }) => Promise<{
        success: boolean;
        resolvedVideoUrl: string | null;
        traceId: string;
        finalStage: string | null;
        attempts: Array<{
          stage: string;
          provider: string;
          status: "success" | "failed";
          reasonCode: string;
          detail: string | null;
        }>;
      }>;
    };
  },
): void {
  // 初始化 LLM Reverse 执行器并存储 deps
  _llmReverseExecutor = createLlmReverseExecutor(ctx);
  if (deps) setLlmReverseDeps(deps);

  // 确保任务表结构存在（DDL 委托给 Repository）
  void (async () => {
    try {
      const { PgAsyncJobRepository } = await import("../repositories/pg/async-job-pg-repository.js");
      await PgAsyncJobRepository.ensureSchema(ctx.pool);
    } catch (err) {
      app.log.warn({ err }, "ensure async_jobs schema failed (may already exist)");
    }
  })();

  // POST /reverse/hot-trend-asset/:scriptId/to-library — 将热榜资产反推到用户脚本库
  // 数据已迁移到 nrm_hot_trend_assets + nrm_script_data
  app.post("/reverse/hot-trend-asset/:scriptId/to-library", async (request) => {
    const user = await requireUser(ctx, request);
    const { scriptId } = request.params as { scriptId: string };

    // 从 nrm_hot_trend_assets 查询源资产
    const asset = await ctx.repos.hotTrendAssets.findByIdWithScriptId(scriptId);
    if (!asset) {
      return { ok: false, error: "Hot trend asset not found" };
    }

    // 获取关联的 script_data
    let sourceTitle = asset.script_id ? (await ctx.repos.scriptData.findTitleContentTagsById(asset.script_id))?.title ?? scriptId : scriptId;
    let sourceContent = "";
    let sourceTags: string[] = [];

    if (asset.script_id) {
      const scriptData = await ctx.repos.scriptData.findTitleContentTagsById(asset.script_id);
      if (scriptData) {
        sourceTitle = scriptData.title || scriptId;
        sourceContent = scriptData.content || "";
        sourceTags = scriptData.tags || [];
      }
    }

    // 创建用户副本（使用统一脚本服务）
    const newScript = await ctx.scriptLibraryService.create(user.id, {
      title: `反推-${sourceTitle}`.slice(0, 80),
      content: sourceContent,
      type: ScriptType.REVERSE,
      tags: sourceTags.filter((tag) => !tag.startsWith("__")),
      sourceScriptId: asset.script_id ?? undefined,
    });

    return { ok: true, scriptId: newScript.id };
  });

  // ============================================================================
  // POST /reverse/llm-reverse/jobs — 创建 LLM 反推任务（异步，立即返回 jobId）
  // ============================================================================
  app.post("/reverse/llm-reverse/jobs", async (request) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as { input?: string; filename?: string; templateId?: string } | undefined) ?? {};
    const rawInput = body.input;
    const rawFilename = body.filename;
    const rawTemplateId = body.templateId;
    if (typeof rawInput !== "string" || !rawInput.trim()) {
      return { ok: false, code: "URL_REQUIRED", message: "请提供视频链接。" };
    }
    const videoUrl = rawInput.trim();
    const normalizedUrl = isLikelyDirectPlayableVideoUrl(videoUrl)
      ? videoUrl
      : normalizeDouyinReverseInputUrl(videoUrl);

    // 清理过期任务
    void purgeExpiredAsyncJobs(ctx.repos, () => ctx.clock.now());

    // 创建任务记录（input 需要包装为 JSON 对象，供 concurrencyService 解析）
    // 支持可选 filename，用于任务队列友好显示（上传文件反推时优先显示文件名）
    // 支持可选 templateId，用于反推完成后关联脚本到模板
    const jobId = ctx.clock.generateId();
    const now = ctx.clock.now();
    const jobInputData: { url: string; filename?: string; templateId?: string } = { url: normalizedUrl };
    if (typeof rawFilename === "string" && rawFilename.trim()) {
      jobInputData.filename = rawFilename.trim();
    }
    if (typeof rawTemplateId === "string" && rawTemplateId.trim()) {
      jobInputData.templateId = rawTemplateId.trim();
    }
    const jobResult = await createAsyncJob(ctx.repos, {
      id: jobId,
      userId: user.id,
      jobType: "llm_reverse",
      input: JSON.stringify(jobInputData),
      now,
      initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
    }, ctx.globalTaskConcurrencyService);

    if ("error" in jobResult) {
      return { ok: false, code: jobResult.errorCode, message: jobResult.error };
    }

    // 【并发改造】统一模式：Dispatcher 会自动调度执行器
    // 不再手动调用 runLlmReverseJobInBackground，由 QueueDispatcher 提升 pending → running 后调用 executor
    // 设置 deps 供 executor 使用
    setLlmReverseDeps(deps ?? {});

    return { jobId, status: jobResult.running ? "running" : "pending" as const, queuePosition: jobResult.queuePosition };
  });

  // ============================================================================
  // GET /reverse/llm-reverse/jobs/:jobId — 查询 LLM 反推任务状态
  // ============================================================================
  app.get("/reverse/llm-reverse/jobs/:jobId", async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await getAsyncJob(ctx.repos, jobId, () => ctx.clock.now());
    if (!job) {
      return { ok: false, code: "JOB_NOT_FOUND", message: "任务不存在或已过期。" };
    }
    if (job.status === "completed" && job.result) {
      return { status: "completed", stage: null, result: job.result };
    }
    if (job.status === "failed" && job.error) {
      return { status: "failed", stage: job.stage, error: job.error };
    }
    return { status: job.status, stage: job.stage };
  });
}
