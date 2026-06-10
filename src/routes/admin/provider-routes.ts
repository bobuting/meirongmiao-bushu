/**
 * admin/provider-routes.ts
 * Provider 管理：CRUD、连通性测试、策略、审计、运维治理
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ProviderRouteKey, ProviderType } from "../../contracts/provider-route-policy-contract.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import type { AdminRouteDeps, AppShellThinEntryHandlers } from "./types.js";

import { AppError } from "../../core/errors.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { PROVIDER_TYPE_MODELS } from "../../contracts/types.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import {
  createPendingRouteAudit,
  finalizeRouteAudit,
  resolveProviderTimeoutMs,
} from "../../services/llm/provider-resolver.js";
import { resolveProviderExecutionTimeoutDecision } from "../../modules/provider-execution-governance.js";
import { compactTextLine, compactUnknownText, formatLlmDebugTrace } from "../../utils/text.js";
import { unwrapQuotedText } from "../../services/utils/json-utils.js";
import { decryptSecret } from "../../core/security.js";
import { requestLlmPlainTextWithMetadata, requestGeminiPlainTextWithVideoPart } from "../../services/llm/llm-transport.js";
import { parseProviderRouteKey, normalizeProviderRoutePolicyConfigDto } from "../../contracts/provider-route-policy-contract.js";
import { summarizeProviderAuditGovernance, buildOpsApiGovernanceBaselineReport } from "../../modules/ops-api-governance.js";
import type { ProviderRoutePolicyConfigInputDto } from "../../contracts/provider-route-policy-contract.js";
import { skillLoader } from "../../services/skills/index.js";

const PROMPT_CODE_PROVIDER_CONNECTIVITY_PROBE = "provider_connectivity_probe";

/**
 * 注册 /admin/providers/*、/admin/provider-policies/*、/admin/provider-audits、/admin/ops/governance 路由
 * 返回 adminProviderRouteHandlers 供 app-shell 使用
 */
export function registerAdminProviderRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: AdminRouteDeps,
): { adminProviderRouteHandlers: AppShellThinEntryHandlers["adminProviders"] } {
  const {
    providerExecutionLimiter,
    providerExecutionRuntimeConfig,
    hotTrendCache,
    readOpsHealthResponse,
    requestLlmImageGenerationUrl,
    requestJimengVideoUrl,
    requestThirdPartyConnectivityProbe,
  } = deps;

  // ---- Provider CRUD (非 HTTP 路由，作为 handler 对象返回给 app-shell) ----

  const listAdminProvidersRoute = async (request: FastifyRequest) => {
    const admin = await requireAdmin(ctx, request);
    return { providers: await ctx.providerAdminService.listProviders(admin), typeModels: PROVIDER_TYPE_MODELS };
  };

  const createAdminProviderRoute = async (request: FastifyRequest) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as {
      name: string;
      type: "text" | "image" | "video";
      vendor: string;
      baseUrl: string;
      model: string;
      callMode?: import("../../contracts/types.js").ProviderCallMode;
      accessKey?: string | null;
      remark?: string | null;
      options?: {
        geminiGroundingEnabled?: boolean;
        geminiFallbackModels?: string[];
      };
      enabled?: boolean;
      secret?: string;
    };
    return await ctx.providerAdminService.createProvider(admin, {
      name: body.name,
      type: body.type,
      vendor: body.vendor || "",
      baseUrl: body.baseUrl,
      model: body.model,
      callMode: body.callMode ?? "openai",
      accessKey: body.accessKey,
      remark: body.remark,
      enabled: body.enabled,
      options: body.options,
      secret: body.secret,
    });
  };

  const updateAdminProviderRoute = async (request: FastifyRequest) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { providerId: string };
    const body = request.body as Partial<{
      name: string;
      vendor: string;
      baseUrl: string;
      model: string;
      callMode: import("../../contracts/types.js").ProviderCallMode;
      accessKey: string | null;
      remark: string | null;
      options: {
        geminiGroundingEnabled?: boolean;
        geminiFallbackModels?: string[];
      };
      enabled: boolean;
      secret: string;
    }>;
    return await ctx.providerAdminService.updateProvider(admin, params.providerId, body);
  };

  const deleteAdminProviderRoute = async (request: FastifyRequest) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { providerId: string };
    await ctx.providerAdminService.deleteProvider(admin, params.providerId);
    return { ok: true };
  };

  const upsertAdminProviderSecretRoute = async (request: FastifyRequest) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { providerId: string };
    const body = request.body as { secret: string };
    return await ctx.providerAdminService.upsertSecret(admin, params.providerId, body.secret);
  };

  const adminProviderRouteHandlers: AppShellThinEntryHandlers["adminProviders"] = {
    listProviders: listAdminProvidersRoute,
    createProvider: createAdminProviderRoute,
    updateProvider: updateAdminProviderRoute,
    deleteProvider: deleteAdminProviderRoute,
    upsertProviderSecret: upsertAdminProviderSecretRoute,
  };

  // ---- Provider 连通性测试 ----

  app.post("/admin/providers/:providerId/connectivity-test", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { providerId: string };
    const body = (request.body as {
      routeKey?: unknown;
      transportMode?: "auto" | "gemini" | "openai";
    } | undefined) ?? {};
    const provider = await ctx.repos.providers.findById(params.providerId);
    if (!provider) {
      throw new AppError(404, "NOT_FOUND", "Provider not found");
    }
    const secretRecord = await ctx.repos.providerSecrets.findByProviderId(provider.id);
    if (!secretRecord) {
      throw new AppError(400, "PROVIDER_SECRET_MISSING", "Provider secret missing");
    }

    const defaultRouteKey: ProviderRouteKey =
      provider.type === "text"
        ? ProviderRouteKeys.TEXT_GENERATION
        : provider.type === "image"
          ? ProviderRouteKeys.IMAGE_GENERATION
          : provider.type === "video"
            ? ProviderRouteKeys.VIDEO_GENERATION
            : ProviderRouteKeys.SQUARE_VIDEO_REVERSE;
    let routeKey: ProviderRouteKey = defaultRouteKey;
    if (body.routeKey !== undefined) {
      try {
        routeKey = parseProviderRouteKey(body.routeKey);
      } catch (error) {
        throw new AppError(
          400,
          "ROUTE_KEY_INVALID",
          error instanceof Error ? error.message : "routeKey is invalid",
        );
      }
    }
    const transportMode: "auto" | "gemini" | "openai" =
      body.transportMode === "gemini" ? "gemini" : body.transportMode === "openai" ? "openai" : "auto";
    const policy = [...await ctx.repos.providerPolicies.list()].find(
      (item) => item.routeKey === routeKey && item.enabled && item.primaryProviderId === provider.id,
    );
    const timeoutDecision = resolveProviderExecutionTimeoutDecision({
      routeKey,
      runtimeConfig: providerExecutionRuntimeConfig,
      policyTimeoutMs: resolveProviderTimeoutMs(routeKey, policy?.timeoutMs ?? providerExecutionRuntimeConfig.timeoutMs, provider),
    });
    const resolvedProvider: ResolvedRouteProvider = {
      id: provider.id,
      vendor: provider.vendor,
      baseUrl: provider.baseUrl,
      model: provider.model,
      callMode: provider.callMode ?? "openai",
      accessKey: provider.accessKey,
      options: provider.options,
      timeoutMs: timeoutDecision.timeoutMs,
      secret: decryptSecret(secretRecord.cipherText),
    };

    const requestId = `provider-connectivity-${ctx.clock.generateId()}`;
    const lease = await providerExecutionLimiter.acquire({
      routeKey,
      requestId,
      maxConcurrency: providerExecutionRuntimeConfig.maxConcurrency,
    });
    const startedAt = ctx.clock.now();
    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(PROMPT_CODE_PROVIDER_CONNECTIVITY_PROBE, {});
    const llmProbeSystemPrompt = systemPrompt;
    const llmProbeUserPrompt = userPrompt;
    const imageProbePrompt = "连接测试：生成一张白底黑字 TEST";
    const videoProbePrompt = "连接测试：简洁产品短视频，白底，慢推镜头";
    const pendingAudit = await createPendingRouteAudit(ctx, {
      providerId: provider.id,
      routeKey,
      startedAt,
      requestId,
      timeoutMs: timeoutDecision.timeoutMs,
      slowRequestThresholdMs: timeoutDecision.slowRequestThresholdMs,
    });
    try {
      let sample = "";
      let requestSummary: string | null = null;
      let responseSummary: string | null = null;
      if (provider.type === "text") {
        const llmProbe = await requestLlmPlainTextWithMetadata(
          resolvedProvider,
          llmProbeSystemPrompt,
          llmProbeUserPrompt,
          0,
          {
            ctx,
            routeKey,
            businessContext: "Provider 连通性测试",
            forceGeminiGrounding: transportMode === "gemini",
            forceGeminiTransport: transportMode === "gemini",
            forceOpenAiTransport: transportMode === "openai",
          },
        );
        const responseText = llmProbe.text;
        const normalized = unwrapQuotedText(responseText).trim();
        if (!normalized) {
          throw new AppError(502, "LLM_RESPONSE_EMPTY", "LLM connectivity probe returned empty content");
        }
        sample = normalized.slice(0, 160);
        requestSummary = `mode=${transportMode}; system=${compactTextLine(llmProbeSystemPrompt, 280)}; user=${compactTextLine(
          llmProbeUserPrompt,
          280,
        )}; trace=${formatLlmDebugTrace(llmProbe.debugTrace)}`;
        responseSummary = `sample=${compactTextLine(sample, 220)}; response=${compactUnknownText(llmProbe.text, 700)}`;
      } else if (provider.type === "image") {
        const imageResult = await requestLlmImageGenerationUrl(resolvedProvider, imageProbePrompt);
        sample = imageResult.url.slice(0, 160);
        requestSummary = `prompt=${compactTextLine(imageProbePrompt, 180)}; baseUrl=${resolvedProvider.baseUrl}; model=${resolvedProvider.model}`;
        responseSummary = `sample=${sample}`;
      } else if (provider.type === "video") {
        const videoResult = await requestJimengVideoUrl(resolvedProvider, videoProbePrompt);
        const videoUrl = typeof videoResult === "object" && "videoUrl" in videoResult ? videoResult.videoUrl : videoResult;
        sample = videoUrl.slice(0, 160);
        requestSummary = `prompt=${compactTextLine(videoProbePrompt, 180)}; baseUrl=${resolvedProvider.baseUrl}; model=${resolvedProvider.model}`;
        responseSummary = `sample=${sample}`;
      } else {
        sample = (await requestThirdPartyConnectivityProbe(resolvedProvider)).slice(0, 160);
        requestSummary = `probe=third_party_connectivity; baseUrl=${resolvedProvider.baseUrl}; model=${resolvedProvider.model}`;
        responseSummary = `sample=${sample}`;
      }
      finalizeRouteAudit(ctx, {
        auditId: pendingAudit.id,
        providerId: provider.id,
        routeKey,
        startedAt,
        status: "success",
        requestSummary,
        responseSummary,
        requestId,
        timeoutMs: timeoutDecision.timeoutMs,
        slowRequestThresholdMs: timeoutDecision.slowRequestThresholdMs,
      });
      ctx.auditStore.insertAuditLog({
        id: ctx.clock.generateId(),
        actorUserId: admin.id,
        action: "provider_connectivity_test",
        targetId: provider.id,
        meta: {
          ok: true,
          routeKey,
          sample,
        },
        createdAt: ctx.clock.now(),
      });
      return {
        ok: true,
        providerId: provider.id,
        routeKey,
        transportMode,
        sample,
      };
    } catch (error) {
      const code = error instanceof AppError ? error.code : "PROVIDER_CONNECTIVITY_FAILED";
      const message = error instanceof Error ? error.message : String(error);
      const status: "error" | "timeout" = /timeout|abort/i.test(message) ? "timeout" : "error";
      finalizeRouteAudit(ctx, {
        auditId: pendingAudit.id,
        providerId: provider.id,
        routeKey,
        startedAt,
        status,
        errorCode: code,
        errorMessage: message,
        requestSummary:
          provider.type === "text"
            ? `mode=${transportMode}; system=${compactTextLine(llmProbeSystemPrompt, 280)}; user=${compactTextLine(llmProbeUserPrompt, 280)}`
            : provider.type === "image"
              ? `prompt=${compactTextLine(imageProbePrompt, 180)}; baseUrl=${resolvedProvider.baseUrl}; model=${resolvedProvider.model}`
              : provider.type === "video"
                ? `prompt=${compactTextLine(videoProbePrompt, 180)}; baseUrl=${resolvedProvider.baseUrl}; model=${resolvedProvider.model}`
                : `probe=third_party_connectivity; baseUrl=${resolvedProvider.baseUrl}; model=${resolvedProvider.model}`,
        responseSummary: null,
        requestId,
        timeoutMs: timeoutDecision.timeoutMs,
        slowRequestThresholdMs: timeoutDecision.slowRequestThresholdMs,
      });
      ctx.auditStore.insertAuditLog({
        id: ctx.clock.generateId(),
        actorUserId: admin.id,
        action: "provider_connectivity_test",
        targetId: provider.id,
        meta: {
          ok: false,
          routeKey,
          errorCode: code,
          errorMessage: message,
        },
        createdAt: ctx.clock.now(),
      });
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(502, "PROVIDER_CONNECTIVITY_FAILED", message);
    } finally {
      providerExecutionLimiter.release(lease);
    }
  });

  // ---- Provider Policies CRUD ----

  app.get("/admin/provider-policies", async (request) => {
    const admin = await requireAdmin(ctx, request);
    return { policies: await ctx.providerAdminService.listPolicies(admin) };
  });

  app.post("/admin/provider-policies", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const rawBody = (request.body as ProviderRoutePolicyConfigInputDto | undefined) ?? {
      routeKey: undefined,
      type: undefined,  // 新增
      primaryProviderId: undefined,
    };
    let body: ReturnType<typeof normalizeProviderRoutePolicyConfigDto>;
    try {
      body = normalizeProviderRoutePolicyConfigDto(rawBody);
    } catch (error) {
      throw new AppError(
        400,
        "ROUTE_POLICY_INVALID",
        error instanceof Error ? error.message : "provider policy payload is invalid",
      );
    }
    return await ctx.providerAdminService.createPolicy(admin, body);
  });

  app.patch("/admin/provider-policies/:policyId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { policyId: string };
    const body = request.body as Partial<{
      type: ProviderType;
      primaryProviderId: string;
      fallbackProviderIds: string[];
      timeoutMs: number;
      retryCount: number;
      enabled: boolean;
      description: string;
      sortOrder: number;
    }>;
    return await ctx.providerAdminService.updatePolicy(admin, params.policyId, body);
  });

  app.delete("/admin/provider-policies/:policyId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { policyId: string };
    await ctx.providerAdminService.deletePolicy(admin, params.policyId);
    return { ok: true };
  });

  // ---- 策略测试端点 ----

  app.post("/admin/provider-policies/:policyId/test", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { policyId: string };
    const body = (request.body as {
      userInput?: string;
      videoUrl?: string;
    } | undefined) ?? {};

    const policy = await ctx.repos.providerPolicies.findById(params.policyId);
    if (!policy) {
      throw new AppError(404, "NOT_FOUND", "Policy not found");
    }
    const provider = await ctx.repos.providers.findById(policy.primaryProviderId);
    if (!provider) {
      throw new AppError(400, "PROVIDER_MISSING", "Primary provider not found");
    }
    const secretRecord = await ctx.repos.providerSecrets.findByProviderId(provider.id);
    if (!secretRecord) {
      throw new AppError(400, "PROVIDER_SECRET_MISSING", "Provider secret missing");
    }

    const resolvedProvider: ResolvedRouteProvider = {
      id: provider.id,
      vendor: provider.vendor,
      baseUrl: provider.baseUrl,
      model: provider.model,
      callMode: provider.callMode ?? "openai",
      accessKey: provider.accessKey,
      options: provider.options,
      timeoutMs: policy.timeoutMs,
      secret: decryptSecret(secretRecord.cipherText),
    };

    const funcKey = policy.type;
    const isVideoToText = funcKey === "video";
    const prompt = body.userInput || "Hello, this is a connectivity test. Please reply briefly.";
    const transportMode = provider.callMode === "gemini" ? "gemini" : provider.callMode === "openai" ? "openai" : "auto";
    const startedAt = ctx.clock.now();
    const routeKey = ProviderRouteKeys.TEXT_GENERATION; // 策略测试使用通用 routeKey

    try {
      let sample = "";

      if (isVideoToText && body.videoUrl) {
        // 视频生文：使用 Gemini 视频理解
        let videoPart: Record<string, unknown>;
        if (body.videoUrl.startsWith("data:")) {
          // base64 data URL → 使用 inlineData 格式
          const match = body.videoUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) {
            throw new AppError(400, "INVALID_VIDEO_URL", "Invalid data URL format");
          }
          videoPart = {
            inlineData: {
              data: match[2],
              mimeType: match[1],
            },
          };
        } else {
          // 实际 URL → 使用 fileData 格式
          videoPart = {
            fileData: {
              fileUri: body.videoUrl,
              mimeType: "video/mp4",
            },
          };
        }
        const result = await requestGeminiPlainTextWithVideoPart(
          resolvedProvider,
          "",
          prompt,
          0,
          videoPart,
          {
            ctx,
            routeKey,
            businessContext: "Provider 策略测试",
            forceGeminiTransport: true,
            timeoutMsOverride: policy.timeoutMs,
          },
        );
        sample = result.text.slice(0, 300);
      } else if (provider.type === "text") {
        const result = await requestLlmPlainTextWithMetadata(
          resolvedProvider,
          "",
          prompt,
          0,
          {
            ctx,
            routeKey,
            businessContext: "Provider 策略测试",
            forceGeminiTransport: transportMode === "gemini",
            forceOpenAiTransport: transportMode === "openai",
            timeoutMsOverride: policy.timeoutMs,
          },
        );
        sample = result.text.slice(0, 300);
      } else if (provider.type === "image") {
        const imageResult = await requestLlmImageGenerationUrl(resolvedProvider, "连接测试：生成一张白底图片");
        sample = `图片URL: ${imageResult.url.slice(0, 200)}`;
      } else if (provider.type === "video") {
        const videoResult = await requestJimengVideoUrl(resolvedProvider, "连接测试：简洁短视频");
        const videoUrl = typeof videoResult === "object" && "videoUrl" in videoResult ? videoResult.videoUrl : videoResult;
        sample = `视频URL: ${videoUrl.slice(0, 200)}`;
      } else {
        sample = (await requestThirdPartyConnectivityProbe(resolvedProvider)).slice(0, 200);
      }

      const latencyMs = ctx.clock.now() - startedAt;
      return {
        ok: true,
        policyId: policy.id,
        type: funcKey,
        sample,
        latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(502, "POLICY_TEST_FAILED", `Test failed: ${message}`);
    }
  });

  // ---- Provider Audits + Ops Governance ----

  app.get("/admin/provider-audits", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : 100;
    const audits = await ctx.providerAdminService.listCallAuditsSummary(admin, Number.isFinite(limit) ? limit : 100);
    return {
      audits,
      governance: summarizeProviderAuditGovernance(audits),
    };
  });

  app.get("/admin/provider-audits/:id", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const audit = await ctx.providerAdminService.getCallAuditById(admin, id);
    if (!audit) throw new AppError(404, "AUDIT_NOT_FOUND", "审计记录不存在");
    return { audit };
  });

  app.get("/admin/ops/governance", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const query = request.query as { auditLimit?: string };
    const auditLimit = query.auditLimit ? Number(query.auditLimit) : 100;
    const audits = await ctx.providerAdminService.listCallAudits(admin, Number.isFinite(auditLimit) ? auditLimit : 100);
    const trendCacheEntries = [...hotTrendCache.values()].map((entry) => ({
      type: entry.type,
      source: entry.source,
      analysisSource: entry.analysisSource,
      syncedAt: entry.syncedAt,
      nextSyncAt: entry.nextSyncAt,
      topicCount: entry.topics.length,
      videoFetchGuard:
        entry.type === "video"
          ? {
              expectedTopicCount: entry.videoFetchGuard?.expectedTopicCount ?? null,
              minimumPassTopicCount: entry.videoFetchGuard?.minimumPassTopicCount ?? null,
              finalTopicCount: entry.videoFetchGuard?.finalTopicCount ?? null,
              passed: entry.videoFetchGuard?.passed ?? null,
              errorCode: entry.videoFetchGuard?.errorCode ?? null,
            }
          : null,
    }));
    return buildOpsApiGovernanceBaselineReport({
      health: readOpsHealthResponse(),
      audits,
      trendCacheEntries,
      now: ctx.clock.now(),
    });
  });

  app.delete("/admin/provider-audits", async (request) => {
    const admin = await requireAdmin(ctx, request);
    return await ctx.providerAdminService.clearCallAudits(admin);
  });

  return { adminProviderRouteHandlers };
}
