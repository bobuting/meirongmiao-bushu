/**
 * reverse-parse-routes.ts
 * 从 app.ts buildApp 提取的反向解析路由（V1 + V2 + 异步任务系统）
 */
import type { FastifyInstance, FastifyRequest, RouteHandlerMethod } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ScriptData, User } from "../contracts/types.js";
import { ScriptType } from "../contracts/types.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { compactTextLine } from "../utils/text.js";
import { isDouyinReverseHost } from "../utils/url.js";
import {
  normalizeDouyinReverseInputUrl,
  isLikelyDirectPlayableVideoUrl,
  summarizeReverseAttempts,
  pickReverseUrlCandidate,
} from "../services/media/video-reverse.js";
import {
  resolveRouteProviderWithFallback,
  resolveGeminiModelCandidates,
  recordRouteAudit,
} from "../services/llm/provider-resolver.js";
import { buildGeminiEndpointCandidates } from "../modules/gemini-provider-endpoints.js";
import { parseGeminiApiKey } from "../services/llm/gemini-utils.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../services/llm/llm-debug-recorder.js";
import {
  normalizeReverseOverviews,
  buildReverseScriptPrompt,
  buildReverseScriptSeed,
  buildReverseScriptFallbackPayload,
} from "../services/reverse/script-parser.js";
import {
  requestLlmScriptPayloadStrict,
} from "../services/llm/llm-transport.js";
import {
  getScriptsDataDbService,
  type VideoScriptPayload,
  type InsertScriptDataItem,
  SKILL_CODE_TO_SOURCE,
} from "../service/scripts-data-db-service.js";
import {
  VideoReverseAnalysisServiceError,
} from "../modules/video-reverse-analysis-service.js";
import type { VideoReverseAnalysisServicePort } from "../contracts/video-reverse-analysis-service.js";
import type { ReverseFetchTraceResult, ReverseScriptHintPrimaryItem } from "../contracts/douyin-integration.js";
import {
  resolveReverseEntryKeyword,
} from "../modules/video-reverse-url-entry.js";
import {
  buildReverseStoryboardPanelViewModel,
} from "../modules/reverse-storyboard-report-mapper.js";
import { buildReverseStoryboardLibraryCreateInput } from "../modules/reverse-storyboard-library-sync.js";
import {
  parseReverseParseV2UploadStartRequest,
  runReverseParseV2Upload,
  type ReverseParseV2UploadRunResult,
} from "../modules/reverse-parse-v2-upload-service.js";
import { resolveProjectLastStep } from "../contracts/project-last-step.js";
import { resolveVideoReverseFailurePolicy } from "../contracts/video-reverse-readiness.js";
import type { ReverseSquareRouteHandlers } from "./reverse-square-routes.js";

// ---------------------------------------------------------------------------
// Reverse Parse V2 Job 系统
// ---------------------------------------------------------------------------

type ReverseParseV2JobStatus = "pending" | "running" | "completed" | "failed" | "expired";

interface ReverseParseV2JobRecord {
  id: string;
  userId: string;
  projectId: string | null;
  inputMode: "douyin_url" | "video_url" | "upload_file";
  input: string;
  status: ReverseParseV2JobStatus;
  createdAt: number;
  updatedAt: number;
  result: Record<string, unknown> | null;
  error: {
    code: string;
    message: string;
  } | null;
}

const REVERSE_PARSE_V2_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const reverseParseV2Jobs = new Map<string, ReverseParseV2JobRecord>();

// ---------------------------------------------------------------------------
// 依赖注入接口：从 buildApp 闭包传入的函数和服务
// ---------------------------------------------------------------------------

export interface ReverseParseRouteDeps {
  /** 构建 douyin 反推 fetch orchestrator */
  buildReverseFetchOrchestrator: () => {
    execute: (input: { userId: string; projectId: string; url: string }) => Promise<ReverseFetchTraceResult>;
  };
  /** 视频反推分析服务实例 */
  videoReverseAnalysisService: VideoReverseAnalysisServicePort;
  /** 共享视频 URL 反推管线 */
  runSharedVideoUrlReversePipelineForUser: (
    normalizedVideoUrl: string,
    options: { userId: string; projectId?: string | null },
  ) => Promise<{
    resolvedVideoUrl: string;
    multimodalResult: {
      result: string;
      model: string;
      /** 原始调试信息，包含 trace（requestHeaders/requestBody）和 groundingSources */
      raw: unknown;
      diagnostics: { requestId: string | null; attempts: Array<{ apiId: string; model: string; status: string; errorCode: string | null; errorMessage: string | null; endpoint?: string | null }> };
    };
    llmPayload: VideoScriptPayload;
    storyboardPanel: ReturnType<typeof buildReverseStoryboardPanelViewModel>;
  }>;
}

// ---------------------------------------------------------------------------
// 内部辅助函数（从 app.ts 提取）
// ---------------------------------------------------------------------------

/** 构建反推脚本文档标题 */
const buildReverseMirrorScriptTitle = (projectName: string): string => {
  const normalized = String(projectName ?? "").trim();
  if (!normalized) {
    return "反推脚本";
  }
  return `${normalized} · 反推脚本`;
};

/** 构建反推脚本文档内容 */
const buildReverseMirrorScriptContent = (basicInfoRaw: string): string => {
  const normalized = String(basicInfoRaw ?? "").replace(/^basic:/i, "").trim();
  if (normalized.length > 0) {
    return normalized;
  }
  const fallback = String(basicInfoRaw ?? "").trim();
  return fallback.length > 0 ? fallback : "反推脚本内容为空";
};

/** 根据 scriptVersionId 查找反推镜像脚本（使用 nrm_script_data） */
export const findReverseMirrorByScriptVersion = async (userId: string, scriptVersionId: string, ctx: AppContext): Promise<ScriptData | null> => {
  const versionTag = `script_version:${scriptVersionId}`;
  const scripts = await ctx.repos.scriptData.findByUserId(userId);
  for (const script of scripts) {
    if (!script.tags.includes(versionTag)) {
      continue;
    }
    return script;
  }
  return null;
};

/** 确保反推脚本镜像存在（不存在则创建）- 使用 scriptLibraryService */
const ensureReverseScriptMirror = async (
  user: User,
  projectId: string,
  scriptVersionId: string | null,
  ctx: AppContext,
): Promise<string | null> => {
  if (!scriptVersionId) {
    return null;
  }
  // 直接查询 nrm_script_data 表
  const script = await ctx.repos.scriptData.findScriptVersionById(scriptVersionId);
  if (!script || script.user_id !== user.id || script.project_id !== projectId) {
    return null;
  }
  const project = await ctx.repos.projects.findById(projectId);
  if (!project || project.userId !== user.id) {
    return null;
  }
  const projectTag = `project:${projectId}`;
  const versionTag = `script_version:${script.id as string}`;
  const requiredTags = ["#反推脚本", "#项目同步", projectTag, versionTag];
  const existing = await findReverseMirrorByScriptVersion(user.id, script.id as string, ctx);
  if (!existing) {
    const created = await ctx.scriptLibraryService.create(user.id, {
      title: buildReverseMirrorScriptTitle(project.name),
      content: buildReverseMirrorScriptContent((script.basic_info as string) ?? ""),
      type: ScriptType.REVERSE,
      projectId,
      tags: requiredTags,
    });
    return created.id;
  }
  const mergedTags = [...new Set([...existing.tags, ...requiredTags])];
  const tagsChanged =
    mergedTags.length !== existing.tags.length || mergedTags.some((tag, index) => tag !== existing.tags[index]);
  if (tagsChanged) {
    await ctx.repos.scriptData.update(existing.id, { tags: mergedTags });
  }
  return existing.id;
};

/** 将 ScriptData 转为精简摘要 */
const toScriptDataSummary = async (
  userId: string,
  scriptId: string | null,
  ctx: AppContext,
): Promise<{ id: string; title: string; content: string; tags: string[]; date: number } | null> => {
  if (!scriptId) {
    return null;
  }
  const script = await ctx.repos.scriptData.findById(scriptId);
  if (!script || script.userId !== userId) {
    return null;
  }
  return {
    id: script.id,
    title: script.title,
    content: script.content,
    tags: [...script.tags],
    date: script.updatedAt,
  };
};

/** 构建脚本中心反推标题 */
const buildReverseCenterScriptTitle = (
  sourceInput: string,
  scriptHints:
    | {
      source: string;
      overviews: string[];
      itemCount: number;
      primaryItem?: ReverseScriptHintPrimaryItem | null;
    }
    | null
    | undefined,
): string => {
  const primaryTitle = scriptHints?.primaryItem?.title?.trim();
  if (primaryTitle && primaryTitle.length > 0) {
    return `反推脚本 · ${primaryTitle}`.slice(0, 80);
  }
  const compactSource = compactTextLine(sourceInput, 36).replace(/^https?:\/\//i, "").trim();
  if (compactSource.length > 0) {
    return `反推脚本 · ${compactSource}`.slice(0, 80);
  }
  return "反推脚本";
};

/** 创建脚本中心反推记录 - 使用 scriptLibraryService */
const createReverseCenterScript = async (
  user: User,
  input: {
    source: "douyin_url" | "video_url" | "local_file";
    sourceInput: string;
    resolvedVideoUrl: string | null;
    scriptHints:
    | {
      source: string;
      overviews: string[];
      itemCount: number;
      primaryItem?: ReverseScriptHintPrimaryItem | null;
    }
    | null
    | undefined;
    payload: VideoScriptPayload;
    storyboardPanel?: ReturnType<typeof buildReverseStoryboardPanelViewModel> | null;
  },
  ctx: AppContext,
): Promise<ScriptData> => {
  const finalContent = input.payload.video_analysis?.summary ?? "反推脚本内容为空";
  const tags = [
    "#反推脚本",
    "#脚本中心",
    resolveReverseEntryKeyword(input.source),
    `reverse_source:${input.source}`,
  ];
  // 使用 scriptLibraryService 创建脚本
  const created = await ctx.scriptLibraryService.create(user.id, {
    title: buildReverseCenterScriptTitle(input.sourceInput, input.scriptHints),
    content: finalContent,
    type: ScriptType.REVERSE,
    tags,
  });
  return created;
};

/** 创建反推分镜库条目 */
const createReverseStoryboardLibraryEntry = async (
  user: User,
  input: {
    title?: string | null;
    content?: string | null;
    tags?: readonly string[];
    panel: ReturnType<typeof buildReverseStoryboardPanelViewModel>;
  },
  ctx: AppContext,
) =>
  await ctx.reverseStoryboardLibraryService.create(
    user,
    buildReverseStoryboardLibraryCreateInput({
      title: input.title,
      content: input.content,
      tags: input.tags,
      panel: input.panel,
    }),
  );

/** 规范化反推解析 V2 输入模式 */
const normalizeReverseParseV2InputMode = (
  value: unknown,
): "douyin_url" | "video_url" | "upload_file" => {
  if (value === "video_url" || value === "upload_file" || value === "douyin_url") {
    return value;
  }
  return "douyin_url";
};

/** 规范化反推解析视频 URL */
export const normalizeReverseParseVideoUrl = (raw: string): string => {
  const input = raw.trim();
  if (!input) {
    throw new AppError(400, "URL_REQUIRED", "URL required");
  }
  if (/^https?:\/\//i.test(input)) {
    return input;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(input)) {
    return `https://${input}`;
  }
  throw new AppError(400, "REVERSE_URL_INVALID", "video_url mode requires a valid http/https url");
};

/** 转发到旧版反推解析路由（通过 app.inject） */
const forwardLegacyReverseParse = async (
  app: FastifyInstance,
  authorizationHeader: string | undefined,
  payload: { projectId?: string; url?: string; fileName?: string },
): Promise<Record<string, unknown>> => {
  const legacyResp = await app.inject({
    method: "POST",
    url: "/reverse/parse",
    headers: authorizationHeader ? { authorization: authorizationHeader } : {},
    payload,
  });
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = legacyResp.json() as Record<string, unknown>;
  } catch {
    parsedBody = {};
  }
  if (legacyResp.statusCode >= 400) {
    const code =
      typeof parsedBody.code === "string" && parsedBody.code.trim().length > 0
        ? parsedBody.code.trim()
        : "REVERSE_PARSE_FAILED";
    const message =
      typeof parsedBody.message === "string" && parsedBody.message.trim().length > 0
        ? parsedBody.message.trim()
        : `reverse parse failed (status=${legacyResp.statusCode})`;
    throw new AppError(legacyResp.statusCode, code, message);
  }
  return parsedBody;
};

/** 解析 V2 Job 的 TTL 过期响应 */
const resolveReverseParseV2JobResponse = (
  job: ReverseParseV2JobRecord,
  ctx: AppContext,
): ReverseParseV2JobRecord => {
  if (ctx.clock.now() - job.createdAt <= REVERSE_PARSE_V2_JOB_TTL_MS) {
    return job;
  }
  if (job.status !== "expired") {
    job.status = "expired";
    job.updatedAt = ctx.clock.now();
    reverseParseV2Jobs.set(job.id, job);
  }
  return job;
};

/** 在后台运行 V2 反推解析 Job（通过 app.inject 调用 /reverse/parse-v2） */
const runReverseParseV2JobInBackground = (
  app: FastifyInstance,
  jobId: string,
  authorizationHeader: string | undefined,
  payload: {
    projectId?: string;
    inputMode?: "douyin_url" | "video_url" | "upload_file";
    input?: string;
  },
  ctx: AppContext,
): void => {
  const job = reverseParseV2Jobs.get(jobId);
  if (!job) {
    return;
  }
  job.status = "running";
  job.updatedAt = ctx.clock.now();
  reverseParseV2Jobs.set(job.id, job);
  void app
    .inject({
      method: "POST",
      url: "/reverse/parse-v2",
      headers: authorizationHeader ? { authorization: authorizationHeader } : {},
      payload,
    })
    .then((response) => {
      const current = reverseParseV2Jobs.get(jobId);
      if (!current || current.status === "expired") {
        return;
      }
      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = response.json() as Record<string, unknown>;
      } catch {
        parsedBody = {};
      }
      current.updatedAt = ctx.clock.now();
      if (response.statusCode >= 400) {
        current.status = "failed";
        current.error = {
          code:
            typeof parsedBody.code === "string" && parsedBody.code.trim().length > 0
              ? parsedBody.code.trim()
              : "REVERSE_JOB_FAILED",
          message:
            typeof parsedBody.message === "string" && parsedBody.message.trim().length > 0
              ? parsedBody.message.trim()
              : `reverse parse failed with status ${response.statusCode}`,
        };
        current.result = null;
      } else {
        current.status = "completed";
        current.error = null;
        current.result = parsedBody;
      }
      reverseParseV2Jobs.set(current.id, current);
    })
    .catch((error) => {
      const current = reverseParseV2Jobs.get(jobId);
      if (!current || current.status === "expired") {
        return;
      }
      current.status = "failed";
      current.updatedAt = ctx.clock.now();
      current.error = {
        code: error instanceof AppError ? error.code : "REVERSE_JOB_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      current.result = null;
      reverseParseV2Jobs.set(current.id, current);
    });
};

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

export function registerReverseParseRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ReverseParseRouteDeps,
): ReverseSquareRouteHandlers {
  // --- reverseParseV2Route: POST /reverse/parse-v2 ---
  const reverseParseV2Route: RouteHandlerMethod = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as
      | {
        projectId?: string;
        inputMode?: "douyin_url" | "video_url" | "upload_file";
        input?: string;
        url?: string;
        fileName?: string;
      }
      | undefined) ?? { inputMode: "douyin_url" };
    const inputMode = normalizeReverseParseV2InputMode(body.inputMode);
    const projectId = body.projectId?.trim() || null;
    const project = projectId ? await ctx.projectService.requireOwnerProject(user, projectId) : null;
    const rawInput =
      String(
        body.input ??
          (inputMode === "upload_file" ? body.fileName : body.url) ??
          "",
      ).trim();
    const effectiveInputMode: "douyin_url" | "video_url" | "upload_file" =
      inputMode === "douyin_url" && isLikelyDirectPlayableVideoUrl(rawInput)
        ? "video_url"
        : inputMode;
    if (effectiveInputMode === "upload_file") {
      if (!rawInput) {
        throw new AppError(400, "FILE_REQUIRED", "File required");
      }
      const forwarded = await forwardLegacyReverseParse(app, request.headers.authorization, {
        ...(project?.id ? { projectId: project.id } : {}),
        fileName: rawInput,
      });
      return {
        ...forwarded,
        inputMode: effectiveInputMode,
      };
    }
    if (effectiveInputMode === "douyin_url") {
      if (!rawInput) {
        throw new AppError(400, "URL_REQUIRED", "URL required");
      }
      const forwarded = await forwardLegacyReverseParse(app, request.headers.authorization, {
        ...(project?.id ? { projectId: project.id } : {}),
        url: rawInput,
      });
      return {
        ...forwarded,
        inputMode: effectiveInputMode,
      };
    }
    if (!rawInput) {
      throw new AppError(400, "URL_REQUIRED", "URL required");
    }
    let normalizedVideoUrl = normalizeReverseParseVideoUrl(rawInput);
    let bridgedDouyinInputUrl: string | null = null;
    let bridgedScriptHints: Record<string, unknown> | null = null;
    const bridgeCandidate = pickReverseUrlCandidate(rawInput);
    const shouldBridgeDouyinToVideoPipeline =
      effectiveInputMode === "video_url" &&
      (() => {
        if (!bridgeCandidate) {
          return false;
        }
        try {
          return isDouyinReverseHost(new URL(bridgeCandidate).hostname);
        } catch {
          return false;
        }
      })();
    if (shouldBridgeDouyinToVideoPipeline) {
      const forwarded = await forwardLegacyReverseParse(app, request.headers.authorization, {
        ...(project?.id ? { projectId: project.id } : {}),
        url: bridgeCandidate!,
      });
      const bridgedResolvedVideoUrl = String(forwarded.resolvedVideoUrl ?? "").trim();
      if (!bridgedResolvedVideoUrl) {
        throw new AppError(
          422,
          "VIDEO_SOURCE_UNREADABLE",
          "画面分析未拿到可播放视频地址，请检查抖音链接是否有效。",
        );
      }
      normalizedVideoUrl = normalizeReverseParseVideoUrl(bridgedResolvedVideoUrl);
      bridgedDouyinInputUrl = bridgeCandidate!;
      if (forwarded.scriptHints && typeof forwarded.scriptHints === "object" && !Array.isArray(forwarded.scriptHints)) {
        bridgedScriptHints = forwarded.scriptHints as Record<string, unknown>;
      }
    }
    const prebuiltReverseProvider = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.SQUARE_VIDEO_REVERSE]);
    const prebuiltEndpointInfo = prebuiltReverseProvider
      ? (() => {
          const candidates = resolveGeminiModelCandidates(prebuiltReverseProvider.provider);
          const model = candidates[0] ?? prebuiltReverseProvider.provider.model;
          const apiKey = parseGeminiApiKey(prebuiltReverseProvider.provider.secret);
          return buildGeminiEndpointCandidates(prebuiltReverseProvider.provider, model, apiKey)[0];
        })()
      : undefined;

    // 创建视频分析 LLM 调试记录（视频 URL 场景），使用预解析的真实 provider 和 endpoint
    const videoAnalysisDebugRecord = createLlmDebugRecord(ctx, {
      routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
      businessContext: "视频反推分析",
      projectId: project?.id,
      userId: user.id,
      messages: [
        { role: "video_url", content: normalizedVideoUrl },
      ],
      provider: prebuiltReverseProvider?.provider ?? {
        id: "video-reverse-gateway",
        vendor: "multimodal",
        baseUrl: "internal://video-reverse",
        model: "multimodal-video",
        callMode: "openai" as import("../contracts/types.js").ProviderCallMode,
        timeoutMs: 120000,
        secret: "",
      },
      hasMedia: "video",
      actualEndpoint: prebuiltEndpointInfo?.url ?? undefined,
      requestHeadersJson: prebuiltEndpointInfo?.headers ? JSON.stringify(prebuiltEndpointInfo.headers) : undefined,
    });
    try {
      const { resolvedVideoUrl, multimodalResult, llmPayload, storyboardPanel } =
        await deps.runSharedVideoUrlReversePipelineForUser(normalizedVideoUrl, {
          userId: user.id,
          projectId: project?.id ?? null,
        });

      // llmPayload 已经是 VideoScriptPayload 格式，直接使用
      const reverseScriptPayload: VideoScriptPayload = {
        video_info: {
          source: "video_url",
          ...llmPayload.video_info,
        },
        video_analysis: llmPayload.video_analysis,
        shot_breakdown: llmPayload.shot_breakdown ?? [],
        editing_analysis: llmPayload.editing_analysis,
      };

      // 成功时完成调试记录，使用实际返回的 diagnostics 信息和 raw.trace 中的 header/body
      const lastSuccessfulAttempt = multimodalResult.diagnostics.attempts
        .filter((a) => a.status === "success")
        .pop();
      // 从 raw.trace 中提取调试信息（类型安全检查）
      const raw = multimodalResult.raw;

      // 健壮提取 trace 信息，支持多种可能的数据结构
      let traceEndpoint: string | null = null;
      let traceRequestHeaders: Record<string, string> | null = null;
      let traceRequestBody: string | null = null;

      if (raw && typeof raw === "object") {
        // 尝试从 raw.trace 提取（标准路径）
        if ("trace" in raw && raw.trace && typeof raw.trace === "object") {
          const trace = raw.trace as Record<string, unknown>;
          if ("endpoint" in trace && typeof trace.endpoint === "string") {
            traceEndpoint = trace.endpoint;
          }
          if ("requestHeaders" in trace && typeof trace.requestHeaders === "object" && trace.requestHeaders !== null) {
            traceRequestHeaders = trace.requestHeaders as Record<string, string>;
          }
          if ("requestBody" in trace && typeof trace.requestBody === "string") {
            traceRequestBody = trace.requestBody;
          }
        }
        // 直接从 raw 提取（备用路径，兼容可能的数据结构）
        if (!traceEndpoint && "endpoint" in raw && typeof raw.endpoint === "string") {
          traceEndpoint = raw.endpoint;
        }
        if (!traceRequestHeaders && "requestHeaders" in raw && typeof raw.requestHeaders === "object" && raw.requestHeaders !== null) {
          traceRequestHeaders = raw.requestHeaders as Record<string, string>;
        }
        if (!traceRequestBody && "requestBody" in raw && typeof raw.requestBody === "string") {
          traceRequestBody = raw.requestBody;
        }
      }


      const reverseEndpoint = lastSuccessfulAttempt?.endpoint ?? traceEndpoint;
      finalizeLlmDebugRecordSuccess(ctx, {
        auditId: videoAnalysisDebugRecord.auditId,
        startedAt: videoAnalysisDebugRecord.startedAt,
        actualModel: multimodalResult.model || lastSuccessfulAttempt?.model || "unknown",
        responseText: multimodalResult.result,
        ...(reverseEndpoint ? { actualEndpoint: reverseEndpoint } : {}),
        ...(traceRequestHeaders ? { requestHeadersJson: JSON.stringify(traceRequestHeaders) } : {}),
        ...(traceRequestBody ? { requestBodyJson: traceRequestBody } : {}),
      });

      if (!project) {
        const reverseStoryboardLibraryItem = await createReverseStoryboardLibraryEntry(user, {
          content: multimodalResult.result,
          tags: ["#反推分镜", resolveReverseEntryKeyword("video_url")],
          panel: storyboardPanel,
        }, ctx);
        return {
          id: ctx.clock.generateId(),
          userId: user.id,
          projectId: null,
          source: "video_url",
          input: bridgedDouyinInputUrl ?? normalizedVideoUrl,
          status: "success",
          scriptVersionId: null,
          fallbackReason: null,
          traceId: null,
          resolvedVideoUrl,
          resolvedByStage: null,
          createdAt: ctx.clock.now(),
          libraryScriptId: null,
          reverseStoryboardLibraryId: reverseStoryboardLibraryItem.id,
          libraryScript: null,
          scriptHints: bridgedScriptHints,
          inputMode: effectiveInputMode,
          storyboardPanel,
        };
      }

      const scriptId = ctx.clock.generateId();
      const now = ctx.clock.now();

      // 使用 ScriptsDataDbService 批量插入
      const scriptsDbService = getScriptsDataDbService(ctx.repos);
      const insertItems: InsertScriptDataItem[] = [{
        id: scriptId,
        type: 3, // 视频脚本类型
        payloadJson: reverseScriptPayload,
        skillCode: "video_storyboard_analysis",
        projectId: project.id,
        userId: user.id,
        sourceOssUrl: resolvedVideoUrl,
        isConfirmed: true,
      }];
      await scriptsDbService.batchInsertIfNotExists(insertItems);
      const task = {
        id: ctx.clock.generateId(),
        userId: user.id,
        projectId: project.id,
        source: "video_url" as const,
        input: bridgedDouyinInputUrl ?? normalizedVideoUrl,
        status: "success" as const,
        scriptVersionId: scriptId,
        fallbackReason: null,
        traceId: null,
        resolvedVideoUrl,
        resolvedByStage: null,
        createdAt: ctx.clock.now(),
      };
      await ctx.repos.reverseTasks.upsert(task);
      project.lastReverseTaskId = task.id;
      project.lastReverseScriptVersionId = scriptId;
      project.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
        step: 3,
        trigger: "manual-jump",
      });
      await ctx.projectService.saveProject(project);
      const reverseStoryboardLibraryItem = await createReverseStoryboardLibraryEntry(user, {
        content: multimodalResult.result,
        tags: ["#反推分镜", "#项目同步", resolveReverseEntryKeyword("video_url")],
        panel: storyboardPanel,
      }, ctx);
      return {
        ...task,
        libraryScriptId: scriptId,
        reverseStoryboardLibraryId: reverseStoryboardLibraryItem.id,
        libraryScript: null,
        scriptHints: bridgedScriptHints,
        inputMode: effectiveInputMode,
        storyboardPanel,
      };
    } catch (error) {
      if (error instanceof VideoReverseAnalysisServiceError) {
        const shouldFallbackToLegacyDouyinFlow =
          error.code === "VIDEO_SOURCE_UNREADABLE" &&
          (() => {
            try {
              return isDouyinReverseHost(new URL(normalizedVideoUrl).hostname);
            } catch {
              return false;
            }
          })();
        if (shouldFallbackToLegacyDouyinFlow) {
          try {
            const forwarded = await forwardLegacyReverseParse(app, request.headers.authorization, {
              ...(project?.id ? { projectId: project.id } : {}),
              url: normalizedVideoUrl,
            });
            // fallback 成功时完成调试记录（标记为 fallback 模式）
            // 不传递 actualEndpoint 等字段，保留创建时记录的初始值
            finalizeLlmDebugRecordSuccess(ctx, {
              auditId: videoAnalysisDebugRecord.auditId,
              startedAt: videoAnalysisDebugRecord.startedAt,
              actualModel: "fallback:douyin_legacy",
              responseText: `fallback=video_url_unreadable_to_douyin; url=${compactTextLine(normalizedVideoUrl, 280)}`,
            });
            return {
              ...forwarded,
              inputMode: "douyin_url" as const,
              fallbackFrom: "video_url_unreadable" as const,
            };
          } catch (legacyError) {
            if (legacyError instanceof AppError) {
              // fallback 失败时完成调试记录
              finalizeLlmDebugRecordError(ctx, {
                auditId: videoAnalysisDebugRecord.auditId,
                startedAt: videoAnalysisDebugRecord.startedAt,
                errorCode: legacyError.code,
                errorMessage: legacyError.message,
              });
              throw legacyError;
            }
          }
        }
        const failure = resolveVideoReverseFailurePolicy({ code: error.code, message: error.message });
        const code = failure.normalizedCode || "VIDEO_REVERSE_FAILED";
        // 视频分析失败时完成调试记录
        finalizeLlmDebugRecordError(ctx, {
          auditId: videoAnalysisDebugRecord.auditId,
          startedAt: videoAnalysisDebugRecord.startedAt,
          errorCode: code,
          errorMessage: failure.userMessage,
        });
        throw new AppError(failure.httpStatus, code, failure.userMessage);
      }
      const code = error instanceof AppError ? error.code : "UNKNOWN";
      // 其他错误时完成调试记录
      finalizeLlmDebugRecordError(ctx, {
        auditId: videoAnalysisDebugRecord.auditId,
        startedAt: videoAnalysisDebugRecord.startedAt,
        errorCode: code,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  // --- reverseParseV2StartRoute: POST /reverse/parse-v2/jobs ---
  const reverseParseV2StartRoute: RouteHandlerMethod = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    if (request.isMultipart()) {
      const parsedUploadStart = await parseReverseParseV2UploadStartRequest(request);
      if (!parsedUploadStart.ok) {
        // ok=false 时 TS 可以正确推断裂为 { ok: false; code: string; message: string }
        throw new AppError(400, (parsedUploadStart as { ok: false; code: string; message: string }).code, (parsedUploadStart as { ok: false; code: string; message: string }).message);
      }
      const projectId = parsedUploadStart.value.projectId;
      if (projectId) {
        await ctx.projectService.requireOwnerProject(user, projectId);
      }
      const jobId = ctx.clock.generateId();
      const now = ctx.clock.now();
      reverseParseV2Jobs.set(jobId, {
        id: jobId,
        userId: user.id,
        projectId,
        inputMode: "upload_file",
        input: parsedUploadStart.value.input,
        status: "running",
        createdAt: now,
        updatedAt: now,
        result: null,
        error: null,
      });
      // 预解析 provider，在请求前就记录真实的 API 地址
      const uploadPrebuiltProvider = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.SQUARE_VIDEO_REVERSE]);
      const uploadPrebuiltEndpoint = uploadPrebuiltProvider
        ? (() => {
            const candidates = resolveGeminiModelCandidates(uploadPrebuiltProvider.provider);
            const model = candidates[0] ?? uploadPrebuiltProvider.provider.model;
            const apiKey = parseGeminiApiKey(uploadPrebuiltProvider.provider.secret);
            return buildGeminiEndpointCandidates(uploadPrebuiltProvider.provider, model, apiKey)[0];
          })()
        : undefined;

      // 创建上传视频反推 LLM 调试记录
      const uploadDebugRecord = createLlmDebugRecord(ctx, {
          routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
          businessContext: "上传视频反推分析",
          projectId: projectId ?? undefined,
          userId: user.id,
          messages: [
            { role: "video_url", content: parsedUploadStart.value.input },
          ],
          provider: uploadPrebuiltProvider?.provider ?? {
            id: "video-reverse-gateway",
            vendor: "multimodal",
            baseUrl: "internal://video-reverse",
            model: "multimodal-video",
            callMode: "openai" as import("../contracts/types.js").ProviderCallMode,
            timeoutMs: 120000,
            secret: "",
          },
          hasMedia: "video",
          actualEndpoint: uploadPrebuiltEndpoint?.url ?? undefined,
          requestHeadersJson: uploadPrebuiltEndpoint?.headers ? JSON.stringify(uploadPrebuiltEndpoint.headers) : undefined,
        });

      try {
        // ---- 阶段 A: 从 multipart 提取视频数据 ----
        const videoBase64 = parsedUploadStart.value.normalizedInput.videoBase64;
        const videoMimeType = parsedUploadStart.value.normalizedInput.mimeType;
        const filename = parsedUploadStart.value.normalizedInput.filename ?? parsedUploadStart.value.input;
        const videoBytes = Buffer.from(videoBase64, "base64");

        // ---- 阶段 B: 上传到 OSS（必须成功）----
        if (!ctx.storage) {
          throw new AppError(500, "OSS_NOT_CONFIGURED", "OSS 存储未配置，无法上传视频");
        }
        const ext = videoMimeType.includes("mp4") ? "mp4" : videoMimeType.includes("webm") ? "webm" : "mp4";
        const ossKey = `reverse-parse-upload/${ctx.clock.generateId()}/video.${ext}`;
        try {
          await ctx.storage.putObject(ossKey, new Uint8Array(videoBytes), videoMimeType);
        } catch (ossError) {
          throw new AppError(
            502,
            "OSS_UPLOAD_FAILED",
            `视频上传失败: ${ossError instanceof Error ? ossError.message : String(ossError)}`,
          );
        }
        const ossUrl = await ctx.storage.getSignedUrl(ossKey);
        app.log.info({ ossKey, byteLength: videoBytes.length, ossUrl }, "reverse-parse-v2 upload: video uploaded to oss");

        // ---- 阶段 C: 调用 LLM 分析（用 OSS URL）----
        const { multimodalResult, llmPayload, storyboardPanel } = await deps.runSharedVideoUrlReversePipelineForUser(ossUrl, {
          userId: user.id,
          projectId: projectId ?? null,
        });

        const overviewText = multimodalResult.result.trim();
        const uploadRun: ReverseParseV2UploadRunResult = {
          response: {
            id: null,
            projectId,
            input: filename,
            status: "success",
            scriptVersionId: null,
            libraryScriptId: null,
            reverseStoryboardLibraryId: null,
            libraryScript: null,
            resolvedVideoUrl: ossUrl,
            fallback: false,
            code: undefined,
            message: "upload reverse parsed via oss url",
            inputMode: "upload_file",
            scriptHints: {
              source: "upload_file",
              overviews: overviewText.length > 0 ? [overviewText] : [],
              itemCount: overviewText.length > 0 ? 1 : 0,
              primaryItem: {
                url: null,
                title: filename,
                videoUrl: null,
                audioUrl: null,
                createTime: null,
                playCount: null,
                commentCount: null,
                diggCount: null,
                shareCount: null,
                collectCount: null,
                recommendCount: null,
                nickname: null,
                duration: null,
                scriptText: overviewText,
              },
            },
            storyboardPanel,
          },
          payload: llmPayload,
          storyboardPanel,
          scriptHints: {
            source: "upload_file",
            overviews: overviewText.length > 0 ? [overviewText] : [],
            itemCount: overviewText.length > 0 ? 1 : 0,
            primaryItem: {
              url: null,
              title: filename,
              videoUrl: null,
              audioUrl: null,
              createTime: null,
              playCount: null,
              commentCount: null,
              diggCount: null,
              shareCount: null,
              collectCount: null,
              recommendCount: null,
              nickname: null,
              duration: null,
              scriptText: overviewText,
            },
          },
        };

        // 更新调试记录
        const uploadPanel = storyboardPanel as { diagnostics?: { attempts?: Array<{ status: string; endpoint?: string | null }> }; raw?: unknown } | null;
        const uploadLastSuccess = uploadPanel?.diagnostics?.attempts?.filter((a) => a.status === "success").pop();
        let uploadTraceEndpoint: string | null = null;
        const uploadRaw = uploadPanel?.raw;
        if (uploadRaw && typeof uploadRaw === "object" && "trace" in uploadRaw && uploadRaw.trace && typeof uploadRaw.trace === "object") {
          const trace = uploadRaw.trace as Record<string, unknown>;
          if ("endpoint" in trace && typeof trace.endpoint === "string") {
            uploadTraceEndpoint = trace.endpoint;
          }
        }
        const uploadEndpoint = uploadLastSuccess?.endpoint ?? uploadTraceEndpoint;
        finalizeLlmDebugRecordSuccess(ctx, {
          auditId: uploadDebugRecord.auditId,
          startedAt: uploadDebugRecord.startedAt,
          actualModel: multimodalResult.model || "multimodal-video",
          responseText: overviewText,
          ...(uploadEndpoint ? { actualEndpoint: uploadEndpoint } : {}),
        });
        const sourceInput = parsedUploadStart.value.input;
        const reverseStoryboardLibraryItem = await createReverseStoryboardLibraryEntry(user, {
          content: uploadRun.payload.video_analysis?.summary ?? "反推脚本内容为空",
          tags: projectId
            ? ["#反推分镜", "#项目同步", resolveReverseEntryKeyword("local_file")]
            : ["#反推分镜", resolveReverseEntryKeyword("local_file")],
          panel: uploadRun.storyboardPanel,
        }, ctx);
        let result: Record<string, unknown>;
        if (projectId) {
          const task = await ctx.reverseService.parseFromLocalFile(user, projectId, sourceInput);
          if (task.scriptVersionId) {
            // 使用 ScriptsDataDbService 更新脚本数据
            const scriptsDbService = getScriptsDataDbService(ctx.repos);
            const insertItems: InsertScriptDataItem[] = [{
              id: task.scriptVersionId,
              type: 3, // 视频脚本类型
              payloadJson: uploadRun.payload,
              skillCode: "video_storyboard_analysis",
              projectId,
              userId: user.id,
              isConfirmed: true,
            }];
            await scriptsDbService.batchInsertIfNotExists(insertItems);
          }
          const libraryScriptId = await ensureReverseScriptMirror(user, projectId, task.scriptVersionId, ctx);
          result = {
            ...uploadRun.response,
            id: task.id,
            projectId,
            status: task.status,
            scriptVersionId: task.scriptVersionId,
            libraryScriptId,
            reverseStoryboardLibraryId: reverseStoryboardLibraryItem.id,
            libraryScript: await toScriptDataSummary(user.id, libraryScriptId, ctx),
          };
        } else {
          const libraryScript = await createReverseCenterScript(user, {
            source: "local_file",
            sourceInput,
            resolvedVideoUrl: null,
            scriptHints: uploadRun.scriptHints,
            payload: uploadRun.payload,
            storyboardPanel: uploadRun.storyboardPanel,
          }, ctx);
          result = {
            ...uploadRun.response,
            id: ctx.clock.generateId(),
            libraryScriptId: libraryScript.id,
            reverseStoryboardLibraryId: reverseStoryboardLibraryItem.id,
            libraryScript: await toScriptDataSummary(user.id, libraryScript.id, ctx),
          };
        }
                reverseParseV2Jobs.set(jobId, {
          id: jobId,
          userId: user.id,
          projectId,
          inputMode: "upload_file",
          input: parsedUploadStart.value.input,
          status: "completed",
          createdAt: now,
          updatedAt: ctx.clock.now(),
          result,
          error: null,
        });
      } catch (error) {
        // 完成调试记录（失败）
        finalizeLlmDebugRecordError(ctx, {
          auditId: uploadDebugRecord.auditId,
          startedAt: uploadDebugRecord.startedAt,
          errorCode: error instanceof AppError ? error.code : "UPLOAD_REVERSE_FAILED",
          errorMessage: error instanceof Error ? error.message : "上传视频反推失败",
        });
        reverseParseV2Jobs.set(jobId, {
          id: jobId,
          userId: user.id,
          projectId,
          inputMode: "upload_file",
          input: parsedUploadStart.value.input,
          status: "failed",
          createdAt: now,
          updatedAt: ctx.clock.now(),
          result: null,
          error: {
            code:
              error instanceof VideoReverseAnalysisServiceError
                ? error.code
                : error instanceof AppError
                  ? error.code
                  : "REVERSE_JOB_FAILED",
            message: error instanceof Error ? error.message : "反推任务失败",
          },
        });
      }
      return {
        jobId,
        status: "pending" as const,
      };
    }
    const body = (request.body as
      | {
        projectId?: string;
        inputMode?: "douyin_url" | "video_url" | "upload_file";
        input?: string;
      }
      | undefined) ?? { inputMode: "douyin_url" };
    const inputMode = normalizeReverseParseV2InputMode(body.inputMode);
    const input = String(body.input ?? "").trim();
    if (!input) {
      throw new AppError(400, "INPUT_REQUIRED", "input is required");
    }
    const projectId = body.projectId?.trim() || null;
    if (projectId) {
      await ctx.projectService.requireOwnerProject(user, projectId);
    }
    const jobId = ctx.clock.generateId();
    const now = ctx.clock.now();
    reverseParseV2Jobs.set(jobId, {
      id: jobId,
      userId: user.id,
      projectId,
      inputMode,
      input,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      result: null,
      error: null,
    });
    runReverseParseV2JobInBackground(app, jobId, request.headers.authorization, {
      ...(projectId ? { projectId } : {}),
      inputMode,
      input,
    }, ctx);
    return {
      jobId,
      status: "pending" as const,
    };
  };

  // --- reverseParseV2JobRoute: GET /reverse/parse-v2/jobs/:jobId ---
  const reverseParseV2JobRoute: RouteHandlerMethod = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { jobId?: string };
    const jobId = String(params.jobId ?? "").trim();
    const job = reverseParseV2Jobs.get(jobId);
    if (!job || job.userId !== user.id) {
      throw new AppError(404, "REVERSE_JOB_NOT_FOUND", "反推任务不存在。");
    }
    const resolved = resolveReverseParseV2JobResponse(job, ctx);
    return {
      jobId: resolved.id,
      status: resolved.status,
      createdAt: resolved.createdAt,
      updatedAt: resolved.updatedAt,
      inputMode: resolved.inputMode,
      projectId: resolved.projectId,
      input: resolved.input,
      result: resolved.result,
      error: resolved.error,
    };
  };

  // --- reverseParseRoute: POST /reverse/parse (legacy) ---
  const reverseParseRoute: RouteHandlerMethod = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = request.body as { projectId?: string; url?: string; fileName?: string };
    const startedAt = ctx.clock.now();
    const projectId = body.projectId?.trim() || null;
    const project = projectId ? await ctx.projectService.requireOwnerProject(user, projectId) : null;
    if (body.url) {
      const normalizedReverseUrl = normalizeDouyinReverseInputUrl(body.url);
      try {
        const reverseFetchOrchestrator = deps.buildReverseFetchOrchestrator();
        const trace = await reverseFetchOrchestrator.execute({
          userId: user.id,
          projectId: project?.id ?? `script-center:${user.id}`,
          url: normalizedReverseUrl,
        });
        if (!trace.success || !trace.resolvedVideoUrl) {
          const upstreamSummary = summarizeReverseAttempts(trace.attempts);
          const mode =
            trace.nextAction === "open_qr_login"
              ? "open_qr_login"
              : trace.nextAction === "upload_cookie"
                ? "upload_cookie"
                : trace.nextAction === "retry_stage"
                  ? "retry_stage"
                  : "local_file";
          if (!project) {
            recordRouteAudit(
              ctx,
              ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
              startedAt,
              "timeout",
              0,
              "FALLBACK_REQUIRED",
              upstreamSummary,
              `url=${compactTextLine(normalizedReverseUrl, 300)}`,
              `attempts=${upstreamSummary.slice(0, 1200)}`,
            );
            return {
              id: ctx.clock.generateId(),
              projectId: null,
              code: "FALLBACK_REQUIRED",
              message: "URL parse failed; use local file fallback",
              fallback: true,
              taskId: null,
              traceId: trace.traceId,
              scriptHints: trace.scriptHints ?? null,
              attempts: trace.attempts,
              upstreamSummary,
              nextAction: {
                mode,
                acceptedExtensions: [".mp4", ".mov", ".mkv", ".avi", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"],
              },
            };
          }
          const fallbackTask = {
            id: ctx.clock.generateId(),
            userId: user.id,
            projectId: project.id,
            source: "douyin_url" as const,
            input: normalizedReverseUrl,
            status: "fallback_required" as const,
            scriptVersionId: null,
            fallbackReason: "private_or_invalid_url" as const,
            traceId: trace.traceId,
            resolvedVideoUrl: null,
            resolvedByStage: trace.finalStage,
            createdAt: ctx.clock.now(),
          };
          await ctx.repos.reverseTasks.upsert(fallbackTask);
          project.lastReverseTaskId = fallbackTask.id;
          project.lastReverseScriptVersionId = null;
          project.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
            step: 3,
            trigger: "manual-jump",
          });
          await ctx.projectService.saveProject(project);
          for (const attempt of await ctx.repos.reverseAttempts.list()) {
            if (attempt.traceId === trace.traceId && attempt.taskId === null) {
              attempt.taskId = fallbackTask.id;
              await ctx.repos.reverseAttempts.upsert(attempt);
            }
          }
          recordRouteAudit(
            ctx,
            ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
            startedAt,
            "timeout",
            0,
            "FALLBACK_REQUIRED",
            upstreamSummary,
            `url=${compactTextLine(normalizedReverseUrl, 300)}`,
            `attempts=${upstreamSummary.slice(0, 1200)}`,
          );
          return {
            code: "FALLBACK_REQUIRED",
            message: "URL parse failed; use local file fallback",
            fallback: true,
            taskId: fallbackTask.id,
            traceId: trace.traceId,
            scriptHints: trace.scriptHints ?? null,
            attempts: trace.attempts,
            upstreamSummary,
            nextAction: {
              mode,
              acceptedExtensions: [".mp4", ".mov", ".mkv", ".avi", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"],
            },
          };
        }

        let reverseScriptPayload: VideoScriptPayload;
        const directOverviews = normalizeReverseOverviews(trace.scriptHints);
        if (trace.finalStage === "S5_EXTERNAL_API" && directOverviews.length > 0) {
          app.log.info(
            {
              traceId: trace.traceId,
              hintSource: trace.scriptHints?.source ?? "external_api",
              overviewCount: directOverviews.length,
            },
            "reverse_parse using external overviews directly, skip llm",
          );
          // 外部 API 模式，构建基础 VideoScriptPayload
          reverseScriptPayload = {
            video_info: {
              title: trace.scriptHints?.primaryItem?.title ?? undefined,
              source: "douyin_url",
            },
            video_analysis: {
              summary: trace.scriptHints?.overviews?.join("\n") ?? "反推脚本内容",
            },
          };
        } else {
          throw new AppError(
            502,
            "REVERSE_SCRIPT_PAYLOAD_REQUIRED",
            "无法生成反推脚本：缺少视频概览信息，请使用视频直链进行多模态分析",
          );
        }

        if (!project) {
          const libraryScript = await createReverseCenterScript(user, {
            source: "douyin_url",
            sourceInput: normalizedReverseUrl,
            resolvedVideoUrl: trace.resolvedVideoUrl,
            scriptHints: trace.scriptHints,
            payload: reverseScriptPayload,
          }, ctx);
          return {
            id: ctx.clock.generateId(),
            userId: user.id,
            projectId: null,
            source: "douyin_url",
            input: normalizedReverseUrl,
            status: "success",
            scriptVersionId: null,
            fallbackReason: null,
            traceId: trace.traceId,
            resolvedVideoUrl: trace.resolvedVideoUrl,
            resolvedByStage: trace.finalStage,
            createdAt: ctx.clock.now(),
            libraryScriptId: libraryScript.id,
            libraryScript: await toScriptDataSummary(user.id, libraryScript.id, ctx),
            scriptHints: trace.scriptHints ?? null,
          };
        }

        const scriptId = ctx.clock.generateId();
        const now = ctx.clock.now();

        // 使用 ScriptsDataDbService 批量插入
        const scriptsDbService = getScriptsDataDbService(ctx.repos);
        const insertItems: InsertScriptDataItem[] = [{
          id: scriptId,
          type: 3, // 视频脚本类型
          payloadJson: reverseScriptPayload,
          skillCode: "video_storyboard_analysis",
          projectId: project.id,
          userId: user.id,
          sourceOssUrl: trace.resolvedVideoUrl,
          isConfirmed: true,
        }];
        await scriptsDbService.batchInsertIfNotExists(insertItems);
        const task = {
          id: ctx.clock.generateId(),
          userId: user.id,
          projectId: project.id,
          source: "douyin_url" as const,
          input: normalizedReverseUrl,
          status: "success" as const,
          scriptVersionId: scriptId,
          fallbackReason: null,
          traceId: trace.traceId,
          resolvedVideoUrl: trace.resolvedVideoUrl,
          resolvedByStage: trace.finalStage,
          createdAt: ctx.clock.now(),
        };
        await ctx.repos.reverseTasks.upsert(task);
        project.lastReverseTaskId = task.id;
        project.lastReverseScriptVersionId = scriptId;
        project.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
          step: 3,
          trigger: "manual-jump",
        });
        await ctx.projectService.saveProject(project);
        const libraryScriptId = await ensureReverseScriptMirror(user, project.id, scriptId, ctx);
        for (const attempt of await ctx.repos.reverseAttempts.list()) {
          if (attempt.traceId === trace.traceId && attempt.taskId === null) {
            attempt.taskId = task.id;
            await ctx.repos.reverseAttempts.upsert(attempt);
          }
        }
        return {
          ...task,
          libraryScriptId,
          libraryScript: await toScriptDataSummary(user.id, libraryScriptId, ctx),
          scriptHints: trace.scriptHints ?? null,
        };
      } catch (error) {
        const code = error instanceof AppError ? error.code : "UNKNOWN";
        recordRouteAudit(
          ctx,
          ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
          startedAt,
          "error",
          0,
          code,
          error instanceof Error ? error.message : String(error),
        );
        app.log.error({ err: error, routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE }, "LLM 调用失败");
        throw error;
      }
    }
    if (body.fileName) {
      const normalizedFileName = body.fileName.trim();
      try {
        if (project) {
          const task = await ctx.reverseService.parseFromLocalFile(user, project.id, normalizedFileName);
          const libraryScriptId = await ensureReverseScriptMirror(user, project.id, task.scriptVersionId, ctx);
          recordRouteAudit(ctx, ProviderRouteKeys.SQUARE_VIDEO_REVERSE, startedAt, "success");
          return {
            ...task,
            libraryScriptId,
            libraryScript: await toScriptDataSummary(user.id, libraryScriptId, ctx),
            scriptHints: null,
          };
        }
        if (normalizedFileName.length < 1) {
          throw new AppError(400, "FILE_REQUIRED", "File required");
        }
        throw new AppError(
          400,
          "LOCAL_FILE_REQUIRES_PROJECT",
          "本地文件反推需要关联项目，请使用视频直链进行反推",
        );
      } catch (error) {
        const code = error instanceof AppError ? error.code : "UNKNOWN";
        recordRouteAudit(
          ctx,
          ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
          startedAt,
          "error",
          0,
          code,
          error instanceof Error ? error.message : String(error),
        );
        app.log.error({ err: error, routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE }, "LLM 调用失败");
        throw error;
      }
    }
    recordRouteAudit(ctx, ProviderRouteKeys.SQUARE_VIDEO_REVERSE, startedAt, "error", 0, "INPUT_REQUIRED");
    throw new AppError(400, "INPUT_REQUIRED", "Provide url or fileName");
  };

  // --- squareResourcesRoute: GET /square/resources ---
  const squareResourcesRoute: RouteHandlerMethod = async () => ({ resources: ctx.squareService.listPublic() });

  return {
    reverseParseV2Start: reverseParseV2StartRoute,
    reverseParseV2Job: reverseParseV2JobRoute,
    reverseParseV2: reverseParseV2Route,
    reverseParse: reverseParseRoute,
    squareResources: squareResourcesRoute,
  };
}
