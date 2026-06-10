/**
 * video-api-routes.ts
 * 从 app.ts 提取的视频相关 API 路由
 * - POST /api/videos/create
 * - POST /api/videos/query
 * - GET /api/videos/:taskId
 * - POST /api/reverse-copy/overview
 * - POST /api/video-reverse/analyze
 * - POST /api/hot-billboard/douyin/videos
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ResolvedRouteProvider, CapabilityDiagnostics } from "../services/llm/provider-resolver.js";
import type { TrendSourceAdapter } from "../contracts/douyin-integration.js";
import type { ReverseFetchTraceResult } from "../contracts/douyin-integration.js";
import type { VideoReverseAnalysisServicePort } from "../contracts/video-reverse-analysis-service.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { requireUser } from "../services/auth/route-guards.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import {
  buildSideErrorPayload,
  mapReverseAttemptsToFallbackAttempts,
  normalizeRuntimeOverrideList,
  resolveModelFallbackOrder,
  resolveOrderedProviderChain,
  resolveRouteProviderChain,
  createCapabilityDiagnostics,
} from "../services/llm/provider-resolver.js";
import { mapSideStatusToUnified } from "../modules/side-capability-contract.js";
import { normalizeDouyinReverseInputUrl } from "../services/media/video-reverse.js";
import { VideoReverseAnalysisServiceError } from "../modules/video-reverse-analysis-service.js";
import { parseVideoReverseMultipartRequest } from "../modules/video-reverse-multipart-entry.js";
import { validateVideoReverseAnalysisInput } from "../contracts/video-reverse-analysis.js";

/** sideVideoTasks Map 的值类型 */
export interface SideVideoTaskRecord {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  model: string;
  videoUrls: string[];
  raw: unknown;
  diagnostics: CapabilityDiagnostics;
  createdAt: number;
  updatedAt: number;
}

export interface VideoApiRouteDeps {
  readonly sideVideoTasks: Map<string, SideVideoTaskRecord>;
  readonly requestJimengVideoUrl: (provider: ResolvedRouteProvider, prompt: string, options?: { imageUrl?: string | null; taskId?: string | null; referenceImages?: string[]; returnAuditInfo?: boolean }) => Promise<string | { videoUrl: string; auditInfo: { actualEndpoint: string; requestBodySummary: Record<string, unknown> } }>;
  readonly buildReverseFetchOrchestrator: () => { execute: (input: { userId: string; projectId: string; url: string }) => Promise<ReverseFetchTraceResult> };
  readonly videoReverseAnalysisService: VideoReverseAnalysisServicePort;
  readonly resolveTikHubTokenForUser: (userId: string) => Promise<string | null>;
  readonly buildDouhotAdapter: () => TrendSourceAdapter;
  readonly buildTikHubVideoAdapter: (tokenOverride?: string | null) => TrendSourceAdapter | Promise<TrendSourceAdapter>;
}

export function registerVideoApiRoutes(app: FastifyInstance, ctx: AppContext, deps: VideoApiRouteDeps): void {
  const {
    sideVideoTasks,
    requestJimengVideoUrl,
    buildReverseFetchOrchestrator,
    videoReverseAnalysisService,
    resolveTikHubTokenForUser,
    buildDouhotAdapter,
    buildTikHubVideoAdapter,
  } = deps;

  app.post("/videos/create", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = (request.body as {
      prompt?: string;
      runtime?: {
        apiFallbackOrder?: string[];
        modelFallbackOrder?: string[];
      };
    }) ?? { prompt: "" };
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      return reply
        .status(400)
        .send(buildSideErrorPayload("INPUT_REQUIRED", "prompt is required", createCapabilityDiagnostics("video_studio", [])));
    }
    const apiFallbackOrder = normalizeRuntimeOverrideList(body.runtime?.apiFallbackOrder);
    const modelFallbackOrder = normalizeRuntimeOverrideList(body.runtime?.modelFallbackOrder);
    const providerChain = resolveOrderedProviderChain(await resolveRouteProviderChain(ctx, ProviderRouteKeys.VIDEO_GENERATION), apiFallbackOrder);
    if (providerChain.length < 1) {
      return reply
        .status(503)
        .send(
          buildSideErrorPayload(
            "PROVIDER_POLICY_MISSING",
            "VIDEO_GENERATION provider chain is not configured",
            createCapabilityDiagnostics("video_studio", []),
          ),
        );
    }

    // 直接调用第一个 provider/model，失败时直接报错
    const provider = providerChain[0];
    const models = resolveModelFallbackOrder(provider, modelFallbackOrder);
    if (models.length < 1) {
      return reply
        .status(503)
        .send(
          buildSideErrorPayload(
            "PROVIDER_MODEL_MISSING",
            "VIDEO_GENERATION provider has no configured models",
            createCapabilityDiagnostics("video_studio", []),
          ),
        );
    }
    const model = models[0];

    let url: string;
    try {
      const result = await requestJimengVideoUrl({ ...provider, model }, prompt);
      url = typeof result === "object" && "videoUrl" in result ? result.videoUrl : result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(502).send(
        buildSideErrorPayload(
          "VIDEO_STUDIO_FAILED",
          `视频生成失败: ${message}`,
          createCapabilityDiagnostics("video_studio", [{
            capability: "video_studio",
            apiId: provider.id,
            model,
            stage: "model_chain",
            status: "error",
            latencyMs: 0,
            errorCode: "UPSTREAM_ERROR",
            errorMessage: message,
            endpoint: null,
          }]),
        ),
      );
    }

    const now = ctx.clock.now();
    const taskId = ctx.clock.generateId();
    const record: SideVideoTaskRecord = {
      taskId,
      status: mapSideStatusToUnified("success"),
      model,
      videoUrls: [url],
      raw: { providerId: provider.id, routeKey: ProviderRouteKeys.VIDEO_GENERATION, model },
      diagnostics: createCapabilityDiagnostics("video_studio", [{
        capability: "video_studio",
        apiId: provider.id,
        model,
        stage: "model_chain",
        status: "success",
        latencyMs: 0,
        errorCode: null,
        errorMessage: null,
        endpoint: null,
      }]),
      createdAt: now,
      updatedAt: now,
    };
    sideVideoTasks.set(taskId, record);
    return record;
  });

  app.post("/videos/query", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = (request.body as { taskId?: string } | undefined) ?? {};
    const taskId = String(body.taskId ?? "").trim();
    if (!taskId) {
      return reply
        .status(400)
        .send(buildSideErrorPayload("INPUT_REQUIRED", "taskId is required", createCapabilityDiagnostics("video_studio", [])));
    }
    const record = sideVideoTasks.get(taskId);
    if (!record) {
      return reply
        .status(404)
        .send(buildSideErrorPayload("VIDEO_TASK_NOT_FOUND", `video task not found: ${taskId}`, createCapabilityDiagnostics("video_studio", [])));
    }
    return record;
  });

  app.get("/videos/:taskId", async (request, reply) => {
    await requireAdmin(ctx, request);
    const params = request.params as { taskId: string };
    const taskId = String(params.taskId ?? "").trim();
    if (!taskId) {
      return reply
        .status(400)
        .send(buildSideErrorPayload("INPUT_REQUIRED", "taskId is required", createCapabilityDiagnostics("video_studio", [])));
    }
    const record = sideVideoTasks.get(taskId);
    if (!record) {
      return reply
        .status(404)
        .send(buildSideErrorPayload("VIDEO_TASK_NOT_FOUND", `video task not found: ${taskId}`, createCapabilityDiagnostics("video_studio", [])));
    }
    return record;
  });

  app.post("/reverse-copy/overview", async (request, reply) => {
    const admin = await await requireAdmin(ctx, request);
    const body = (request.body as { videoUrl?: string } | undefined) ?? {};
    const rawVideoUrl = String(body.videoUrl ?? "").trim();
    if (!rawVideoUrl) {
      return reply
        .status(400)
        .send(buildSideErrorPayload("INPUT_REQUIRED", "videoUrl is required", createCapabilityDiagnostics("reverse_copy", [])));
    }

    const videoUrl = normalizeDouyinReverseInputUrl(rawVideoUrl);
    const trace = await buildReverseFetchOrchestrator().execute({
      userId: admin.id,
      projectId: "api-reverse-copy",
      url: videoUrl,
    });
    const attempts = mapReverseAttemptsToFallbackAttempts(trace.attempts);
    const diagnostics = createCapabilityDiagnostics("reverse_copy", attempts, trace.traceId);

    if (!trace.success || !trace.resolvedVideoUrl) {
      return reply
        .status(502)
        .send(
          buildSideErrorPayload(
            "REVERSE_COPY_FAILED",
            `reverse-copy fallback required: finalStage=${trace.finalStage}; nextAction=${trace.nextAction ?? "none"}`,
            diagnostics,
          ),
        );
    }

    const overviews = trace.scriptHints?.overviews ?? [];
    return {
      videoUrl: trace.resolvedVideoUrl,
      model: `reverse-${trace.finalStage.toLowerCase()}`,
      overviews,
      items: overviews.map((item, index) => ({ index: index + 1, overview: item })),
      diagnostics,
    };
  });

  app.post("/video-reverse/analyze", async (request, reply) => {
    await requireAdmin(ctx, request);
    let normalizedInput;
    if (request.isMultipart()) {
      const multipartParse = await parseVideoReverseMultipartRequest(request);
      if (!multipartParse.ok) {
        const message = multipartParse.issues[0]?.message ?? "video reverse multipart request is invalid";
        return reply
          .status(400)
          .send(buildSideErrorPayload("INPUT_INVALID", message, createCapabilityDiagnostics("video_reverse", [])));
      }
      normalizedInput = multipartParse.value.normalizedInput;
    } else {
      const body = (request.body as {
        sourceType?: "video_url" | "upload_file";
        userGoal?: string;
        locale?: string;
        videoUrl?: string;
        videoBase64?: string;
        mimeType?: string;
        filename?: string;
        runtime?: {
          apiFallbackOrder?: string[];
          modelFallbackOrder?: string[];
          timeoutMs?: number;
          withGrounding?: boolean;
          temperature?: number;
          topP?: number;
        };
      }) ?? { userGoal: "" };
      const inferredSourceType =
        typeof body.sourceType === "string" && body.sourceType.trim().length > 0
          ? body.sourceType
          : typeof body.videoUrl === "string" && body.videoUrl.trim().length > 0
            ? "video_url"
            : "upload_file";
      const validation = validateVideoReverseAnalysisInput({
        sourceType: inferredSourceType,
        userGoal: body.userGoal,
        locale: body.locale,
        videoUrl: body.videoUrl,
        videoBase64: body.videoBase64,
        mimeType: body.mimeType,
        filename: body.filename,
        runtime: body.runtime,
      });
      if (!validation.ok || !validation.normalizedInput) {
        const message = validation.issues[0]?.message ?? "video reverse request is invalid";
        return reply
          .status(400)
          .send(buildSideErrorPayload("INPUT_INVALID", message, createCapabilityDiagnostics("video_reverse", [])));
      }
      normalizedInput = validation.normalizedInput;
    }

    try {
      return await videoReverseAnalysisService.run(normalizedInput);
    } catch (error) {
      if (error instanceof VideoReverseAnalysisServiceError) {
        return reply.status(error.statusCode).send(buildSideErrorPayload(error.code, error.message, error.diagnostics));
      }
      throw error;
    }
  });

  app.post("/hot-billboard/douyin/videos", async (request, reply) => {
    const admin = await await requireAdmin(ctx, request);
    const body = (request.body as {
      page?: number;
      pageSize?: number;
      dateWindow?: number;
      tags?: unknown[];
    }) ?? {};
    const page = Math.max(1, Math.floor(Number(body.page ?? 1) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(body.pageSize ?? 55) || 55)));
    const dateWindow = Number(body.dateWindow) === 2 ? 2 : 1;
    const trendWindow: "24h" | "7d" = dateWindow === 2 ? "7d" : "24h";
    // 直接调用第一个 API (tikhub)，失败时直接报错
    const tokenOverride = await resolveTikHubTokenForUser(admin.id);
    let result: {
      source: string;
      section: string;
      updatedAt: string | null;
      topics: Array<{
        id: number;
        label: string;
        url: string;
        trend: "up" | "down" | "flat";
        itemId?: string | null;
      }>;
    };
    try {
      result = await (await buildTikHubVideoAdapter(tokenOverride)).fetchVideoHotTrends(pageSize, trendWindow);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(502).send(
        buildSideErrorPayload(
          "HOT_BILLBOARD_FAILED",
          `热榜数据获取失败: ${message}`,
          createCapabilityDiagnostics("hot_billboard", [{
            capability: "hot_billboard",
            apiId: "tikhub",
            model: "tikhub-video-hot",
            stage: "model_chain",
            status: "error",
            latencyMs: 0,
            errorCode: "UPSTREAM_ERROR",
            errorMessage: message,
            endpoint: null,
          }]),
        ),
      );
    }

    return {
      model: "tikhub-video-hot",
      page,
      pageSize,
      dateWindow,
      tags: Array.isArray(body.tags) ? body.tags : [],
      items: result.topics.map((item) => ({
        rank: item.id,
        title: item.label,
        url: item.url,
        trend: item.trend,
      })),
      raw: result,
      diagnostics: createCapabilityDiagnostics("hot_billboard", [{
        capability: "hot_billboard",
        apiId: "tikhub",
        model: "tikhub-video-hot",
        stage: "model_chain",
        status: "success",
        latencyMs: 0,
        errorCode: null,
        errorMessage: null,
        endpoint: null,
      }]),
    };
  });

  // ---------------------------------------------------------------------------
  // POST /admin/capability-lab/video-reverse-upload — 上传视频文件反向分析
  // ---------------------------------------------------------------------------

  app.post("/admin/capability-lab/video-reverse-upload", async (request, reply) => {
    await requireAdmin(ctx, request);
    if (!request.isMultipart()) {
      return reply.status(400).send({ error: "multipart/form-data required" });
    }
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "file field required" });
    }
    const buffer = await data.toBuffer();
    const videoBase64 = buffer.toString("base64");
    const mimeType = data.mimetype || "video/mp4";
    const filename = data.filename || "upload.mp4";

    try {
      const result = await deps.videoReverseAnalysisService.run({
        sourceType: "upload_file",
        userGoal: "分析视频内容，提取脚本和分镜",
        videoBase64,
        mimeType,
        filename,
      });
      return {
        script: result.result ?? null,
        storyboard: null,
        error: null,
      };
    } catch (error) {
      if (error instanceof VideoReverseAnalysisServiceError) {
        return {
          script: null,
          storyboard: null,
          error: error.message,
        };
      }
      return {
        script: null,
        storyboard: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
