/**
 * admin/capability-lab-routes.ts
 * 从 admin-routes.ts 提取的 /admin/capability-lab/* 和 /admin/smart-storyboards/* 路由
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import type { AdminRouteDeps } from "./types.js";

import { AppError } from "../../core/errors.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import {
  resolveRouteProvider,
  resolveRouteProviderWithFallback,
} from "../../services/llm/provider-resolver.js";
import { createLlmDebugRecord, finalizeLlmDebugRecordSuccess, finalizeLlmDebugRecordError } from "../../services/llm/llm-debug-recorder.js";
import { compactTextLine } from "../../utils/text.js";
import {
  requestLlmPlainTextWithMetadata,
  requestLlmScriptPayload,
} from "../../services/llm/llm-transport.js";
import { buildReverseScriptPrompt } from "../../services/reverse/script-parser.js";
import { _buildVideoGenerationAuditRequestSummary } from "../project-routes.js";
import { skillLoader } from "../../services/skills/index.js";

const PROMPT_CODE_CAPABILITY_TEXT_ANALYSIS = "capability_text_analysis";
const PROMPT_CODE_CAPABILITY_FASHION_ANALYSIS = "capability_fashion_analysis";
const PROMPT_CODE_CAPABILITY_TEXT_DEFAULT_INSTRUCTION = "capability_text_default_instruction";
import {
  mapRawReverseStoryboardReport,
} from "../../modules/reverse-storyboard-report-mapper.js";
import {
  resolveHotTrendSmartStoryboardClass,
} from "../../modules/hot-trend/index.js";

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

export function registerAdminCapabilityLabRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: AdminRouteDeps,
): void {
  const {
    requestLlmImageGenerationUrl,
    requestJimengVideoUrl,
    requestLlmImageGenerationUrls,
    buildReverseFetchOrchestrator,
  } = deps;

  app.post("/admin/capability-lab/text", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as {
      input?: string;
      instruction?: string;
      temperature?: number;
      transportMode?: "auto" | "gemini" | "openai";
    } | undefined) ?? {};
    const input = String(body.input ?? "").trim();
    if (!input) {
      throw new AppError(400, "INPUT_REQUIRED", "input is required");
    }
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.TEXT_GENERATION);
    if (!provider) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", "text_generation provider is not configured");
    }
    // 获取默认指令（如果用户未提供）
    const instructionInput = String(body.instruction ?? "").trim();
    const instruction = instructionInput || await skillLoader.render(PROMPT_CODE_CAPABILITY_TEXT_DEFAULT_INSTRUCTION, {}).then(c => c.system + "\n\n" + c.user);
    const temperature = Math.max(0, Math.min(1, Number(body.temperature ?? 0.3)));
    const transportMode: "auto" | "gemini" | "openai" =
      body.transportMode === "gemini" ? "gemini" : body.transportMode === "openai" ? "openai" : "auto";
    const userPrompt = `${instruction}\n\n用户输入：\n${input}`;
    const { system: systemPrompt } = await skillLoader.render(PROMPT_CODE_CAPABILITY_TEXT_ANALYSIS, {});
    const result = await requestLlmPlainTextWithMetadata(
      provider,
      systemPrompt,
      userPrompt,
      temperature,
      {
        ctx,
        routeKey: ProviderRouteKeys.TEXT_GENERATION,
        businessContext: "能力实验室文本处理",
        forceGeminiTransport: transportMode === "gemini",
        forceOpenAiTransport: transportMode === "openai",
        forceGeminiGrounding: transportMode === "gemini",
      },
    );
    const output = result.text.trim();
    if (!output) {
      throw new AppError(502, "LLM_RESPONSE_EMPTY", "text capability returned empty output");
    }
    return {
      ok: true,
      providerId: provider.id,
      routeKey: ProviderRouteKeys.TEXT_GENERATION,
      transportMode,
      output,
      groundingSources: result.groundingSources,
    };
  });

  app.post("/admin/capability-lab/image-insight", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as {
      imageUrl?: string;
      prompt?: string;
      temperature?: number;
      timeoutMs?: number;
      transportMode?: "gemini" | "openai_vision";
    } | undefined) ?? {};
    const imageUrl = String(body.imageUrl ?? "").trim();
    if (!imageUrl) {
      throw new AppError(400, "IMAGE_URL_REQUIRED", "imageUrl is required");
    }
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.TEXT_GENERATION);
    if (!provider) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", "text_generation provider is not configured");
    }
    const prompt =
      String(body.prompt ?? "").trim() ||
      `根据这张服装单品图，结合当前季节时令潮流进行搜索与分析，输出 1) 趋势判断 2) 下装/鞋履/配饰搭配建议 3) 可执行的整体穿搭方案。`;
    const transportMode: "gemini" | "openai_vision" =
      body.transportMode === "openai_vision" ? "openai_vision" : "gemini";
    const timeoutInput = Number(body.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutInput)
      ? Math.max(6_000, Math.min(240_000, Math.floor(timeoutInput)))
      : Math.max(120_000, provider.timeoutMs);
    const providerForCall: ResolvedRouteProvider = {
      ...provider,
      timeoutMs,
    };
    const temperature = Math.max(0, Math.min(1, Number(body.temperature ?? 0.25)));
    const { system: fashionSystemPrompt } = await skillLoader.render(PROMPT_CODE_CAPABILITY_FASHION_ANALYSIS, {});
    const result = await requestLlmPlainTextWithMetadata(
      providerForCall,
      fashionSystemPrompt,
      prompt,
      temperature,
      {
        ctx,
        routeKey: ProviderRouteKeys.IMAGE_GENERATION,
        businessContext: "能力实验室图像分析",
        imageInputs: [{ url: imageUrl, label: "user-fashion-item" }],
        hasMedia: "image",
        forceGeminiGrounding: transportMode === "gemini",
        forceGeminiTransport: transportMode === "gemini",
        forceOpenAiTransport: transportMode === "openai_vision",
      },
    );
    const output = result.text.trim();
    if (!output) {
      throw new AppError(502, "LLM_RESPONSE_EMPTY", "image insight returned empty output");
    }
    return {
      ok: true,
      providerId: provider.id,
      routeKey: ProviderRouteKeys.TEXT_GENERATION,
      output,
      groundingSources: result.groundingSources,
      debug: {
        mode: transportMode,
        timeoutMs,
        imageSource: imageUrl.startsWith("data:image/") ? "upload_data_url" : "remote_url",
        trace: result.debugTrace ?? null,
      },
    };
  });

  app.post("/admin/capability-lab/image-generate", async (request) => {
    await requireAdmin(ctx, request);
    const body = (request.body as {
      mode?: "text_to_image" | "image_to_image";
      prompt?: string;
      imageUrls?: string[];
      count?: number;
    } | undefined) ?? {};
    const mode = body.mode === "image_to_image" ? "image_to_image" : "text_to_image";
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      throw new AppError(400, "PROMPT_REQUIRED", "prompt is required");
    }
    const count = Math.max(1, Math.min(4, Math.floor(Number(body.count ?? 1) || 1)));
    const imageUrls = (body.imageUrls ?? [])
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0)
      .slice(0, 4);
    if (mode === "image_to_image" && imageUrls.length < 1) {
      throw new AppError(400, "IMAGE_URL_REQUIRED", "image_to_image mode requires at least one imageUrl");
    }
    const resolved = await resolveRouteProviderWithFallback(
      ctx,
      [ProviderRouteKeys.IMAGE_GENERATION],
    );
    if (!resolved) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", "image_generation provider is not configured");
    }
    const messages: Array<{ role: string; content: string }> = [
      { role: "user", content: `[图像生成请求] mode=${mode}; prompt=${prompt}; count=${count}` },
    ];
    if (imageUrls.length > 0) {
      messages.push({ role: "images", content: JSON.stringify(imageUrls) });
    }
    try {
      const result = await requestLlmImageGenerationUrls(resolved.provider, prompt, {
        mode,
        images: imageUrls,
        count,
        debugOptions: {
          ctx,
          routeKey: resolved.routeKey,
          businessContext: "能力实验室图像生成",
          messages,
        },
      });
      return {
        ok: true,
        routeKey: resolved.routeKey,
        providerId: resolved.provider.id,
        mode,
        urls: result.urls,
      };
    } catch (error) {
      throw error;
    }
  });

  app.post("/admin/capability-lab/video-generate", async (request) => {
    await requireAdmin(ctx, request);
    const body = (request.body as { prompt?: string } | undefined) ?? {};
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      throw new AppError(400, "PROMPT_REQUIRED", "prompt is required");
    }
    const resolved = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.VIDEO_GENERATION]);
    if (!resolved) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", "video_generation provider is not configured");
    }
    const debugRecord = createLlmDebugRecord(ctx, {
      routeKey: ProviderRouteKeys.VIDEO_GENERATION,
      businessContext: "能力实验室视频生成",
      messages: [{ role: "prompt", content: prompt }],
      provider: resolved.provider,
    });
    try {
      const videoResult = await requestJimengVideoUrl(resolved.provider, prompt);
      const url = typeof videoResult === "object" && "videoUrl" in videoResult ? videoResult.videoUrl : videoResult;
      finalizeLlmDebugRecordSuccess(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        actualModel: resolved.provider.model,
        responseText: `context=admin_capability; url=${compactTextLine(url, 300)}`,
      });
      return {
        ok: true,
        routeKey: resolved.routeKey,
        providerId: resolved.provider.id,
        url,
      };
    } catch (error) {
      const code = error instanceof AppError ? error.code : "UNKNOWN";
      const message = error instanceof Error ? error.message : String(error);
      finalizeLlmDebugRecordError(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        errorCode: code,
        errorMessage: message,
      });
      throw error;
    }
  });

  app.get("/admin/smart-storyboards", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const query = (request.query as {
      ownerUserId?: string;
      category?: string;
      trendType?: string;
      smartClass?: string;
      search?: string;
      limit?: string;
    } | undefined) ?? {};
    const ownerUserId = typeof query.ownerUserId === "string" ? query.ownerUserId.trim() : "";
    const category =
      query.category === "video_hot_trend_copy" || query.category === "realtime_hot_trend"
        ? query.category
        : undefined;
    const trendType = query.trendType === "video" || query.trendType === "realtime" ? query.trendType : undefined;
    const smartClass =
      query.smartClass === "realtime" || query.smartClass === "video_copy" || query.smartClass === "video_shot"
        ? query.smartClass
        : undefined;
    const normalizedSearch = String(query.search ?? "").trim().toLowerCase();
    const rawLimit = Number(query.limit ?? 500);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(2000, Math.floor(rawLimit))) : 500;
    const allItems = await ctx.smartStoryboardLibraryService
      .listForAdmin(admin, {
        ...(ownerUserId.length > 0 ? { ownerUserId } : {}),
        ...(category ? { category } : {}),
        ...(trendType ? { trendType } : {}),
      });
    const filtered = allItems
      .filter((item) => {
        if (smartClass) {
          const itemSmartClass = resolveHotTrendSmartStoryboardClass({
            tags: item.tags,
            trendType: item.sourceRef.trendType,
          });
          if (itemSmartClass !== smartClass) {
            return false;
          }
        }
        if (normalizedSearch.length < 1) {
          return true;
        }
        const haystack = [
          item.title,
          item.summary,
          item.tags.join(" "),
          item.sourceRef.sourceTitle ?? "",
          item.sourceRef.recommendationReason ?? "",
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .slice(0, limit);
    const items = await Promise.all(filtered.map(async (item) => ({
      ...item,
      currentVersion: await ctx.smartStoryboardLibraryService.getCurrentVersion(admin, item.id),
      permissions: { canRead: true, canWrite: true, canDelete: true },
    })));
    return {
      items,
      total: filtered.length,
      limit,
    };
  });

  app.patch("/admin/smart-storyboards/:itemId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { itemId: string };
    const body = (request.body as {
      title?: string;
      summary?: string;
      tags?: string[];
      content?: string;
      reverseSourceScriptText?: string | null;
    } | undefined) ?? {};
    const nextContent = typeof body.content === "string" ? body.content.trim() : undefined;
    const nextReport = nextContent !== undefined ? mapRawReverseStoryboardReport(nextContent) : undefined;
    const item = await ctx.smartStoryboardLibraryService.update(admin, params.itemId, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.summary !== undefined
        ? { summary: String(body.summary) }
        : nextReport?.intro
          ? { summary: nextReport.intro }
          : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(nextContent !== undefined ? { content: nextContent, report: nextReport } : {}),
      ...(body.reverseSourceScriptText !== undefined ? { reverseSourceScriptText: body.reverseSourceScriptText } : {}),
    });
    return {
      item: {
        ...item,
        currentVersion: await ctx.smartStoryboardLibraryService.getCurrentVersion(admin, item.id),
        permissions: { canRead: true, canWrite: true, canDelete: true },
      },
    };
  });

  app.delete("/admin/smart-storyboards/:itemId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { itemId: string };
    await ctx.smartStoryboardLibraryService.remove(admin, params.itemId);
    return { ok: true };
  });

  app.post("/admin/smart-storyboards/batch-delete", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as { itemIds?: string[] } | undefined) ?? {};
    const itemIds = [...new Set((body.itemIds ?? []).map((item) => String(item).trim()).filter((item) => item.length > 0))];
    let deleted = 0;
    for (const itemId of itemIds) {
      try {
        await ctx.smartStoryboardLibraryService.remove(admin, itemId);
        deleted += 1;
      } catch (error) {
        app.log.error({ err: error, itemId }, "批量删除智能分镜失败");
      }
    }
    return { ok: true, deleted };
  });

  app.get("/admin/capability-lab/reverse-storyboard-library", async (request) => {
    await requireAdmin(ctx, request);
    const query = (request.query as { ownerUserId?: string; search?: string; limit?: string } | undefined) ?? {};
    const ownerUserId = typeof query.ownerUserId === "string" ? query.ownerUserId.trim() : "";
    const normalizedSearch = String(query.search ?? "").trim().toLowerCase();
    const rawLimit = Number(query.limit ?? 500);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(2000, Math.floor(rawLimit))) : 500;
    const items = [...await ctx.repos.reverseStoryboardLibrary.list()]
      .filter((item) => (ownerUserId.length > 0 ? item.userId === ownerUserId : true))
      .filter((item) => {
        if (normalizedSearch.length < 1) {
          return true;
        }
        const haystack = [item.title, item.summary, item.content, item.tags.join(" ")].join("\n").toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
    return {
      ok: true,
      items,
    };
  });

  app.post("/admin/capability-lab/reverse-storyboard-library", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as {
      title?: string;
      summary?: string;
      tags?: string[];
      content?: string;
      sourceType?: "video_url" | "upload_file";
      videoUrl?: string;
      filename?: string;
      mimeType?: string;
      duration?: number;
    } | undefined) ?? {};
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    if (!title) {
      throw new AppError(400, "TITLE_REQUIRED", "title is required");
    }
    if (!content) {
      throw new AppError(400, "CONTENT_REQUIRED", "content is required");
    }
    const report = mapRawReverseStoryboardReport(content);
    const summary = String(body.summary ?? "").trim() || report.intro || title;
    const item = await ctx.reverseStoryboardLibraryService.create(admin, {
      title,
      summary,
      tags: body.tags ?? ["#反推分镜"],
      sourceType: body.sourceType === "upload_file" ? "upload_file" : "video_url",
      sourceMeta: {
        videoUrl: body.videoUrl ?? null,
        filename: body.filename ?? null,
        mimeType: body.mimeType ?? null,
        duration: Number.isFinite(Number(body.duration)) ? Number(body.duration) : null,
      },
      report,
      content,
    });
    return {
      ok: true,
      item,
    };
  });

  app.patch("/admin/capability-lab/reverse-storyboard-library/:itemId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { itemId: string };
    const body = (request.body as {
      title?: string;
      summary?: string;
      tags?: string[];
      content?: string;
      videoUrl?: string | null;
      filename?: string | null;
      mimeType?: string | null;
      duration?: number | null;
    } | undefined) ?? {};
    const nextContent = typeof body.content === "string" ? body.content.trim() : undefined;
    const nextReport = nextContent !== undefined ? mapRawReverseStoryboardReport(nextContent) : undefined;
    const nextSummary =
      typeof body.summary === "string"
        ? body.summary.trim()
        : nextReport?.intro ?? undefined;
    const item = await ctx.reverseStoryboardLibraryService.update(admin, params.itemId, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(nextSummary !== undefined ? { summary: nextSummary } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(nextContent !== undefined ? { content: nextContent, report: nextReport } : {}),
      ...(body.videoUrl !== undefined ||
      body.filename !== undefined ||
      body.mimeType !== undefined ||
      body.duration !== undefined
        ? {
            sourceMeta: {
              videoUrl: body.videoUrl ?? null,
              filename: body.filename ?? null,
              mimeType: body.mimeType ?? null,
              duration: Number.isFinite(Number(body.duration)) ? Number(body.duration) : null,
            },
          }
        : {}),
    });
    return {
      ok: true,
      item,
    };
  });

  app.post("/admin/capability-lab/reverse-fetch", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as { url?: string } | undefined) ?? {};
    const url = String(body.url ?? "").trim();
    if (!url) {
      throw new AppError(400, "INPUT_REQUIRED", "url is required");
    }
    const reverseProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.SQUARE_VIDEO_REVERSE);
    const reverseFetchOrchestrator = buildReverseFetchOrchestrator();
    const trace = await reverseFetchOrchestrator.execute({
      userId: admin.id,
      projectId: "capability-lab",
      url,
    });
    let llmScriptPreview = "";
    if (trace.success && trace.resolvedVideoUrl && reverseProvider) {
      try {
        const llmPayload = await requestLlmScriptPayload(
          reverseProvider,
          buildReverseScriptPrompt(trace.resolvedVideoUrl, trace.scriptHints),
          { ctx, businessContext: "能力实验室逆向解析" },
        );
        llmScriptPreview = compactTextLine(llmPayload.basicInfo ?? "", 600);
      } catch (error) {
        app.log.warn({ err: error }, "capability-lab reverse llm payload failed");
      }
    }
    return {
      ok: trace.success,
      traceId: trace.traceId,
      finalStage: trace.finalStage,
      resolvedVideoUrl: trace.resolvedVideoUrl,
      scriptHints: trace.scriptHints ?? null,
      attempts: trace.attempts,
      nextAction: trace.nextAction ?? null,
      llmScriptPreview,
    };
  });
}
