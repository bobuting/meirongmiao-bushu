/**
 * library-routes.ts
 * 从 app.ts 提取的 library 相关路由（角色库、脚本库、反推分镜库等）
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type {
  LibraryCharacter,
  User,
} from "../contracts/types.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { randomUUID } from "node:crypto";
import { AppError } from "../core/errors.js";
import type { CharacterFiveView } from "../contracts/types.js";
import {
  createAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
} from "../service/async-job-service.js";
import { requireUser } from "../services/auth/route-guards.js";
import { REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX } from "../contracts/reverse-storyboard-library-api.js";
import { registerCharacterFiveViewRoutes } from "./character-five-view-routes.js";
import {
  persistImageSourceToStorage,
} from "../services/media/storage-persist.js";
import {
  recordRouteAudit,
  resolveRouteProvider,
} from "../services/llm/provider-resolver.js";
import {
  // collectLegacyVideoReverseRecords,
  // migrateLegacyVideoReverseRecords,
} from "../modules/reverse-storyboard-legacy-compat.js";
import { mapRawReverseStoryboardReport } from "../modules/reverse-storyboard-report-mapper.js";
import { normalizeAge, normalizeGender, normalizeEthnicity } from "../modules/character-analysis-normalize.js";
import {
  parseStep2AllInOneSlot,
  type Step2AllInOneSlot,
} from "../modules/step2-dressedup-storage-prefix.js";
import {
  requestPortraitCheck,
  type PortraitCheckPayload,
} from "../modules/portrait-check.js";
import { buildCharacterName } from "../utils/character-naming.js";
import { getOutfitDescription } from "../utils/outfit-description.js";

/**
 * buildApp 闭包内定义的局部辅助函数及变量
 */
interface LibraryRouteDeps {
  // buildApp 闭包内局部辅助函数
  toReverseStoryboardLibraryRecordDto: (user: User, itemId: string) => Record<string, unknown>;
  ensureLegacyReverseStoryboardLibraryCompatibility: (user: User) => Promise<{ readonly createdItemIds: readonly string[]; readonly skippedScriptIds: readonly string[] }>;

  // app.ts 模块级函数（未导出，通过 deps 传入）
  hydrateCharacterViewSessionCandidatesFromStorage: (character: LibraryCharacter) => Promise<void>;
}

/**
 * 注册 library 相关路由
 */
export function registerLibraryRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: LibraryRouteDeps,
): void {
  const {
    toReverseStoryboardLibraryRecordDto,
    ensureLegacyReverseStoryboardLibraryCompatibility,
    hydrateCharacterViewSessionCandidatesFromStorage,
  } = deps;

  // 注册五视图路由
  registerCharacterFiveViewRoutes(app, ctx);

  app.get("/library/characters", async (request) => {
    const user = await requireUser(ctx, request);
    const query = request.query as {
      page?: string;
      pageSize?: string;
      gender?: string;
      tags?: string;
      keyword?: string;
    };
    const result = await ctx.characterLibraryService.listPaged(user, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: Math.min(query.pageSize ? parseInt(query.pageSize, 10) : 20, 100),
      gender: query.gender,
      tags: query.tags ? query.tags.split(",") : undefined,
      keyword: query.keyword,
    });
    // 并行 hydrate 当前页角色
    await Promise.all(result.items.map((c) => hydrateCharacterViewSessionCandidatesFromStorage(c)));
    return result;
  });

  /** 获取单个角色详情 */
  app.get("/library/characters/:characterId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { characterId: string };
    const character = await ctx.characterLibraryService.getById(params.characterId);
    if (!character || character.userId !== user.id) {
      throw new AppError(404, "NOT_FOUND", "角色不存在");
    }
    await hydrateCharacterViewSessionCandidatesFromStorage(character);
    return character;
  });

  // 人像检测接口
  app.post("/library/characters/check-portrait", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as { imageUrl: string };
    const imageUrl = body.imageUrl?.trim();
    if (!imageUrl) {
      throw new AppError(400, "BAD_REQUEST", "imageUrl is required");
    }
    const startedAt = ctx.clock.now();
    try {
      const llmProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT);
      if (!llmProvider) {
        // Provider 未配置时返回错误模式，不阻止用户操作
        recordRouteAudit(ctx, ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT, startedAt, "error", 0, "PROVIDER_NOT_CONFIGURED", "LLM provider not configured for portrait check");
        return {
          isPortrait: false,
          reason: "LLM provider not configured for portrait check",
          mode: "error" as const,
          analysis: null,
        };
      }
      const payload: PortraitCheckPayload = { imageUrl };
      try {
        const result = await requestPortraitCheck(
          ctx,
          llmProvider,
          payload,
          user.id,
          {
            routeKey: ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT,
            businessContext: "资产库人像检测",
          }
        );
        recordRouteAudit(ctx, ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT, startedAt, "success");
        return result;
      } catch (error) {
        // LLM 调用失败时返回错误模式，不阻止用户创建角色
        const errorCode = error instanceof AppError ? error.code : "PORTRAIT_CHECK_FAILED";
        const errorMessage = error instanceof Error ? error.message : "Portrait check failed";
        recordRouteAudit(ctx, ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT, startedAt, "error", 0, errorCode, errorMessage);
        app.log.warn({ err: error, userId: user.id }, "portrait check failed");
        return {
          isPortrait: false,
          reason: errorMessage,
          mode: "error" as const,
          analysis: null,
        };
      }
    } catch (error) {
      // 外层异常处理（如 resolveRouteProvider 失败）
      app.log.warn({ err: error, userId: user.id }, "portrait check setup failed");
      const errorCode = error instanceof AppError ? error.code : "PORTRAIT_CHECK_FAILED";
      const errorMessage = error instanceof Error ? error.message : "Portrait check failed";
      recordRouteAudit(ctx, ProviderRouteKeys.LIBRARY_PORTRAIT_DETECT, startedAt, "error", 0, errorCode, errorMessage);
      return {
        isPortrait: false,
        reason: errorMessage,
        mode: "error" as const,
        analysis: null,
      };
    }
  });

  app.post("/library/characters", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      name: string;
      kind: "basic" | "image" | "video";
      thumbnailUrl: string;
      tags?: string[];
      fiveViewOssImageUrl?: string | null;
      videoPreview?: string | null;
      // 角色分析字段（写入前归一化）
      ethnicity?: unknown;
      age?: unknown;
      gender?: unknown;
      style?: string | null;
      bodyType?: string | null;
      faceShape?: string | null;
      facialFeatures?: string | null;
      eyebrows?: string | null;
      eyes?: string | null;
      eyeExpression?: string | null;
      nose?: string | null;
      lips?: string | null;
      chin?: string | null;
      skinTone?: string | null;
      hairStyle?: string | null;
      uniqueFeatures?: string | null;
    };
    let thumbnailUrl = body.thumbnailUrl;
    try {
      thumbnailUrl = await persistImageSourceToStorage(
        ctx,
        body.thumbnailUrl,
        `library/characters/${user.id}/thumbnails`,
        { persistRemote: true },
      );
    } catch (error) {
      app.log.warn(
        { err: error, characterName: body.name, userId: user.id },
        "character thumbnail persistence skipped, fallback to original url",
      );
    }

    const created = await ctx.characterLibraryService.create(user, {
      ...body,
      thumbnailUrl,
      fiveViewOssImageUrl: body.fiveViewOssImageUrl ?? null,
      // 归一化角色分析字段
      ethnicity: normalizeEthnicity(body.ethnicity),
      age: normalizeAge(body.age),
      gender: normalizeGender(body.gender),
    });

    // 如果传了五视图 URL，同步在 nrm_character_five_views 表创建一条激活记录
    if (body.fiveViewOssImageUrl?.trim()) {
      const now = ctx.clock.now();
      const fiveViewId = randomUUID();
      const fiveViewRecord: CharacterFiveView = {
        id: fiveViewId,
        characterId: created.id,
        imageUrl: body.fiveViewOssImageUrl.trim(),
        status: "ready",
        isActive: true,
        prompt: null,
        model: null,
        generationParams: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.repos.characterFiveViews.create(fiveViewRecord);

      // 更新角色表：关联 activeFiveViewId
      await ctx.repos.libraryCharacters.upsert({
        ...created,
        fiveViewOssImageUrl: body.fiveViewOssImageUrl.trim(),
        activeFiveViewId: fiveViewId,
        updatedAt: now,
      });
    }

    return created;
  });

  app.patch("/library/characters/:characterId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { characterId: string };
    const body = request.body as Partial<{
      name: string;
      tags: string[];
      thumbnailUrl: string;
      videoPreview: string | null;
      status: "processing" | "ready";
      kind: "basic" | "image" | "video";
      fiveViewOssImageUrl: string | null;
    }>;
    let normalizedThumbnail = body.thumbnailUrl;
    if (typeof body.thumbnailUrl === "string") {
      try {
        normalizedThumbnail = await persistImageSourceToStorage(
          ctx,
          body.thumbnailUrl,
          `library/characters/${user.id}/thumbnails`,
          { persistRemote: true },
        );
      } catch (error) {
        app.log.warn(
          { err: error, characterId: params.characterId, userId: user.id },
          "character thumbnail patch persistence skipped, fallback to original url",
        );
      }
    }

    const updated = await ctx.characterLibraryService.update(user, params.characterId, {
      ...body,
      ...(normalizedThumbnail !== undefined ? { thumbnailUrl: normalizedThumbnail } : {}),
      fiveViewOssImageUrl: body.fiveViewOssImageUrl,
    });
    return updated;
  });

  // ─── 批量五视图生成（创建父任务 + 多个子任务） ───
  // 前端批量生成时调用，创建一个父任务和多个子任务（每个槽位一个）
  app.post("/library/dressedup/batch-generate-five-view", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      projectId: string;
      slots: number[]; // 要生成的槽位列表，如 [1, 2, 3]
    };

    if (!body.projectId) {
      throw new AppError(400, "BAD_REQUEST", "projectId is required");
    }
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "slots must be a non-empty array");
    }

    const project = await ctx.projectService.requireOwnerProject(user, body.projectId);
    const now = ctx.clock.now();

    // 根据项目类型选择正确的任务类型
    const batchJobType = project.projectKind === "image" ? "image_step2_batch_five_view" : "step2_batch_five_view";
    const singleJobType = project.projectKind === "image" ? "image_step2_five_view" : "step2_five_view";

    // 创建父任务（使用 concurrencyService 生成的 ID）
    const parentJobResult = await createAsyncJob(ctx.repos, {
      userId: user.id,
      jobType: batchJobType,
      input: JSON.stringify({
        projectId: project.id,
        slots: body.slots,
      }),
      now,
      projectId: project.id,
      initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
    }, ctx.globalTaskConcurrencyService);

    // 获取实际生成的父任务 ID（concurrencyService 会生成时间戳格式的 ID）
    if (!("jobId" in parentJobResult)) {
      throw new AppError(500, "JOB_CREATE_FAILED", "父任务创建失败：" + parentJobResult.error);
    }
    const parentJobId = parentJobResult.jobId;

    // 提取命名所需数据（循环外查询一次，避免重复）
    const roleDirection = project.selectedRoleDirection as Record<string, unknown> | null;
    const gender = normalizeGender(roleDirection?.gender);
    const age = normalizeAge(roleDirection?.age);
    const outfitPlan = project.selectedOutfitPlanId
      ? await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId)
      : null;
    const outfitDescResult = await getOutfitDescription(ctx, project.id);

    // 为每个槽位创建子任务和空角色
    const childJobs: Array<{ jobId: string; slot: number; characterId: string; characterName: string }> = [];
    for (const slot of body.slots) {
      // 提取角色预设信息
      const characterName = buildCharacterName({
        outfitDescription: outfitDescResult.description,
        outfitPlanTitle: outfitPlan?.title,
        gender,
        age,
        slot,
      });

      // 从 selectedRoleDirection 提取预设字段并映射到角色表
      const ethnicity = normalizeEthnicity(roleDirection?.ethnicityOrRegion);
      const style = Array.isArray(roleDirection?.styleWords) && roleDirection.styleWords.length > 0
        ? (roleDirection.styleWords as string[]).filter(Boolean).join(", ")
        : null;

      // 创建 processing 状态的空角色（包含预设信息）+ 自动创建五视图记录
      const created = await ctx.characterLibraryService.create(user, {
        name: characterName,
        kind: "image",
        status: "processing",
        fiveViewOssImageUrl: null,
        tags: ["step2-result", "auto-generated"],
        // 写入角色预设信息
        ethnicity,
        gender,
        age,
        style,
      });

      // 防御性检查：确保角色创建成功且 id 有效
      if (!created || !created.id) {
        throw new AppError(500, "CHARACTER_CREATE_FAILED", "角色创建失败，无法获取有效 ID");
      }

      // 五视图记录已由 CharacterLibraryService.create 自动创建
      const fiveViewId = created.fiveViewId;
      if (!fiveViewId) {
        throw new AppError(500, "FIVE_VIEW_CREATE_FAILED", "五视图记录创建失败");
      }

      // 清除该 slot 上原有角色的关联（软删除旧记录）
      await ctx.repos.projectCharacters.softDeleteBySlot(project.id, slot, now);

      // 将角色关联到项目
      await ctx.repos.projectCharacters.create({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        projectId: project.id,
        libraryCharacterId: created.id,
        role: "main",
        isSelected: false,
        sourceType: "generated",
        generationSlot: slot,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
      });

      // 创建子任务（带并发控制）
      // 【并发改造】子任务创建为 pending，由 QueueDispatcher 自动调度提升
      // 不预设 ID，让 concurrencyService 生成实际 ID
      const childJobResult = await createAsyncJob(ctx.repos, {
        userId: user.id,
        jobType: singleJobType,
        input: JSON.stringify({
          projectId: project.id,
          slot,
          characterId: created.id,
          fiveViewId, // 传入已创建的五视图记录 ID
          parentJobId,
        }),
        now,
        projectId: project.id,
        parentJobId,
        initialStatus: "pending", // 子任务排队等待 QueueDispatcher 提升
      }, ctx.globalTaskConcurrencyService);

      // 记录子任务实际状态（running 或 pending）
      // 需要类型窄化：JobCreatedResult 有 jobId，JobRejectedResult 没有
      if ("jobId" in childJobResult) {
        childJobs.push({
          jobId: childJobResult.jobId,
          slot,
          characterId: created.id,
          characterName: created.name,
          fiveViewId: fiveViewId,
        } as { jobId: string; slot: number; characterId: string; characterName: string; fiveViewId: string });
      }
    }

    // 【并发改造】子任务全部创建为 pending，由 QueueDispatcher 自动调度提升为 running
    // 不再手动激活，移除后台顺序执行逻辑
    // 父任务也设为 pending，当所有子任务完成后自动标记为 completed
    const childJobIds = childJobs.map(c => c.jobId);
    await updateAsyncJobStage(ctx.repos, parentJobId, "批量生成中", ctx.clock.now());

    // 返回父任务ID和子任务信息（前端轮询查看进度）
    return {
      jobId: parentJobId,
      children: childJobs.map((c) => ({
        jobId: c.jobId,
        slot: c.slot,
        character: {
          id: c.characterId,
          name: c.characterName,
          status: "processing",
          thumbnailUrl: null,
          fiveViewOssImageUrl: null,
        },
      })),
      status: "running",
      message: "已创建批量生成任务，等待并发调度",
    };
  });

  // ─── 定妆直接生成路由（不需要已有角色） — 走场景一（服饰搭配五视图） ───
  // 视频项目：从数据库读取角色预设 + 服饰平铺图
  // 图片项目：显式传入 coreFeatures / phase1Outfit / referenceImages
  // 集成全局任务队列：创建任务记录，后台执行，前端轮询进度
  // 优化：先创建 processing 状态的空角色，生成完成后更新
  app.post("/library/dressedup/generate-five-view", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      projectId: string;
      allInOneSlot?: number;
      // 图片项目显式传入的值
      prompt?: string;
      coreFeatures?: string;
      phase1Outfit?: string;
      referenceImages?: string[];
    };

    if (!body.projectId) {
      throw new AppError(400, "BAD_REQUEST", "projectId is required");
    }

    const project = await ctx.projectService.requireOwnerProject(user, body.projectId);
    const allInOneSlot = parseStep2AllInOneSlot(body.allInOneSlot);
    if (body.allInOneSlot !== undefined && allInOneSlot === null) {
      throw new AppError(400, "BAD_REQUEST", "allInOneSlot must be 1, 2, or 3");
    }

    // 提取角色预设信息
    const roleDirection = project.selectedRoleDirection as Record<string, unknown> | null;
    const gender = normalizeGender(roleDirection?.gender);
    const age = normalizeAge(roleDirection?.age);
    const allInOneSlotValue = allInOneSlot ?? 1;

    // 查询搭配方案 title
    const outfitPlan = project.selectedOutfitPlanId
      ? await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId)
      : null;
    // 构建服饰描述
    const outfitDescResult = await getOutfitDescription(ctx, project.id);

    const characterName = buildCharacterName({
      outfitDescription: outfitDescResult.description,
      outfitPlanTitle: outfitPlan?.title,
      gender,
      age,
      slot: allInOneSlotValue,
    });

    // 从 selectedRoleDirection 提取预设字段并映射到角色表
    const ethnicity = normalizeEthnicity(roleDirection?.ethnicityOrRegion);
    const style = Array.isArray(roleDirection?.styleWords) && roleDirection.styleWords.length > 0
      ? (roleDirection.styleWords as string[]).filter(Boolean).join(", ")
      : null;

    // 先创建 processing 状态的空角色（包含预设信息）
    const created = await ctx.characterLibraryService.create(user, {
      name: characterName,
      kind: "image",
      status: "processing",
      fiveViewOssImageUrl: null,
      tags: ["step2-result", "auto-generated"],
      // 写入角色预设信息
      ethnicity,
      gender,
      age,
      style,
    });

    // 清除该 slot 上原有角色的关联（软删除旧记录）
    if (allInOneSlot !== null) {
      await ctx.repos.projectCharacters.softDeleteBySlot(project.id, allInOneSlot, ctx.clock.now());
    }

    // 将角色关联到项目
    await ctx.repos.projectCharacters.create({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      projectId: project.id,
      libraryCharacterId: created.id,
      role: "main",
      isSelected: false,
      sourceType: "generated",
      generationSlot: allInOneSlot,
      createdAt: ctx.clock.now(),
      updatedAt: ctx.clock.now(),
      deletedAt: null,
      deletedBy: null,
    });

    // 预创建 processing 状态的五视图记录（刷新后可显示 loading）
    const processingViewId = randomUUID();
    const processingView: import("../contracts/types.js").CharacterFiveView = {
      id: processingViewId,
      characterId: created.id,
      imageUrl: null,
      status: "processing",
      isActive: false,
      prompt: null,
      model: null,
      generationParams: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: ctx.clock.now(),
      updatedAt: ctx.clock.now(),
    };
    await ctx.repos.characterFiveViews.create(processingView);

    // 使用任务队列：创建 pending 任务，由 QueueDispatcher 驱动执行
    // 根据项目类型选择正确的任务启动函数
    const { startFiveViewJob, startImageFiveViewJob } = await import("../modules/step2-five-view-job-executor.js");
    const startJob = project.projectKind === "image" ? startImageFiveViewJob : startFiveViewJob;
    const { jobId } = await startJob(ctx.repos, {
      projectId: project.id,
      userId: user.id,
      slot: allInOneSlot ?? undefined,
      characterId: created.id,
      fiveViewId: processingViewId,
    }, ctx.globalTaskConcurrencyService);

    // 返回任务ID和角色信息，前端可以立即显示角色卡片
    return {
      jobId,
      character: {
        id: created.id,
        name: created.name,
        status: "processing",
        thumbnailUrl: null,
        fiveViewOssImageUrl: null,
      },
      status: "pending",
      message: "已创建生成任务",
    };
  });

  // ─── 五视图重试生成（已有角色，根据角色 ID 重新生成五视图） ───
  // 集成全局任务队列：创建任务记录，后台执行，前端轮询进度
  app.post("/library/dressedup/retry-five-view", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      characterId: string;
      projectId: string;
      generationSlot?: number;
    };

    if (!body.characterId) {
      throw new AppError(400, "BAD_REQUEST", "characterId is required");
    }
    if (!body.projectId) {
      throw new AppError(400, "BAD_REQUEST", "projectId is required");
    }

    // 解析 characterId 格式：generated-{实际ID} 或 library-{实际ID}
    const actualCharacterId = body.characterId.startsWith("generated-") || body.characterId.startsWith("library-")
      ? body.characterId.split("-").slice(1).join("-")
      : body.characterId;

    const character = await ctx.repos.libraryCharacters.findById(actualCharacterId);
    if (!character || character.userId !== user.id) {
      throw new AppError(404, "NOT_FOUND", "角色不存在");
    }

    const project = await ctx.projectService.requireOwnerProject(user, body.projectId);
    const generationSlot = parseStep2AllInOneSlot(body.generationSlot);

    // 更新角色状态为 processing
    await ctx.repos.libraryCharacters.updateStatus(character.id, "processing", ctx.clock.now());

    // 如果指定了 generationSlot，先清除该 slot 上原有角色的关联（软删除旧记录）
    if (generationSlot !== null) {
      await ctx.repos.projectCharacters.softDeleteBySlot(body.projectId, generationSlot, ctx.clock.now());
    }

    // 校验关联关系，如果不存在则补建
    const existing = await ctx.repos.projectCharacters.findActiveByProjectAndCharacter(body.projectId, actualCharacterId);
    if (!existing) {
      await ctx.repos.projectCharacters.create({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        projectId: body.projectId,
        libraryCharacterId: actualCharacterId,
        role: "main",
        isSelected: false,
        sourceType: "generated",
        generationSlot,
        createdAt: ctx.clock.now(),
        updatedAt: ctx.clock.now(),
        deletedAt: null,
        deletedBy: null,
      });
    } else if (generationSlot !== null) {
      await ctx.repos.projectCharacters.updateGenerationSlot(body.projectId, actualCharacterId, generationSlot, ctx.clock.now());
    }

    // 查找或创建角色的五视图记录（用于批量生成模式）
    // 重试逻辑：
    // - 原五视图失败：继续使用原记录，更新为 processing
    // - 原五视图成功：创建新记录，旧的设为 isActive=false
    let fiveViewId: string | undefined;
    const existingViews = await ctx.repos.characterFiveViews.findByCharacterId(actualCharacterId);
    const activeView = existingViews.find(v => v.isActive);

    if (activeView) {
      if (activeView.status === "failed") {
        // 失败状态：继续原五视图记录
        fiveViewId = activeView.id;
        await ctx.repos.characterFiveViews.update({
          ...activeView,
          status: "processing",
          errorMessage: null,
          updatedAt: ctx.clock.now(),
        });
      } else {
        // 成功/其他状态：创建新五视图记录，旧的设为非激活
        const { randomUUID } = await import("node:crypto");
        const newViewId = randomUUID();
        const now = ctx.clock.now();

        // 旧的设为非激活
        await ctx.repos.characterFiveViews.update({
          ...activeView,
          isActive: false,
          updatedAt: now,
        });

        // 创建新的激活五视图记录
        await ctx.repos.characterFiveViews.create({
          id: newViewId,
          characterId: actualCharacterId,
          imageUrl: null,
          status: "processing",
          isActive: true,
          prompt: null,
          model: null,
          generationParams: null,
          errorMessage: null,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        fiveViewId = newViewId;
      }
    } else {
      // 没有激活的五视图：创建新的
      const { randomUUID } = await import("node:crypto");
      const newViewId = randomUUID();
      const now = ctx.clock.now();
      await ctx.repos.characterFiveViews.create({
        id: newViewId,
        characterId: actualCharacterId,
        imageUrl: null,
        status: "processing",
        isActive: true,
        prompt: null,
        model: null,
        generationParams: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      fiveViewId = newViewId;
    }

    // 使用任务队列：检查是否已有进行中的任务
    // 根据项目类型选择正确的任务启动函数
    const { startFiveViewJob, startImageFiveViewJob } = await import("../modules/step2-five-view-job-executor.js");
    const startJob = project.projectKind === "image" ? startImageFiveViewJob : startFiveViewJob;
    const { jobId, running } = await startJob(ctx.repos, {
      projectId: project.id,
      userId: user.id,
      slot: generationSlot ?? undefined,
      characterId: character.id,
      fiveViewId,  // 【修复】传入 fiveViewId，启用批量生成模式（更新现有角色）
    }, ctx.globalTaskConcurrencyService);

    // 【并发改造】任务统一创建为 pending，由 QueueDispatcher 调度执行
    // 不再需要 fire-and-forget 立即执行，executor 会自动处理

    // 返回任务ID和角色信息
    return {
      jobId,
      character: {
        id: character.id,
        name: character.name,
        status: "processing" as const,
        thumbnailUrl: character.thumbnailUrl || null,
        fiveViewOssImageUrl: character.fiveViewOssImageUrl || null,
      },
      status: running ? "running" : "queued",
      message: running ? "已创建生成任务" : "任务已排队等待执行",
    };
  });

  app.delete("/library/characters/:characterId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { characterId: string };
    await ctx.characterLibraryService.remove(user, params.characterId);
    return { ok: true, message: "角色已删除，如需恢复请联系管理员" };
  });

  /** 检查角色是否被项目使用 */
  app.get("/library/characters/:characterId/usage-check", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { characterId: string };
    // 通过 nrm_projects.selected_character_id 查询使用了该角色的项目
    const projects = await ctx.repos.projects.findBySelectedCharacterId(params.characterId);
    const activeProjects = projects.filter(p => p.deletedAt === null);
    return {
      inUse: activeProjects.length > 0,
      projectCount: activeProjects.length,
    };
  });

  // --- 反推分镜库路由 ---

  app.get(REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const items = await ctx.reverseStoryboardLibraryService.list(user);
    return {
      items: await Promise.all(items.map(async (item) => ({
        ...item,
        currentVersion: await ctx.reverseStoryboardLibraryService.getCurrentVersion(user, item.id),
      }))),
    };
  });

  app.post(REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX, async (request) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as {
      title?: string;
      summary?: string;
      tags?: string[];
      content?: string;
      sourceType?: "video_url" | "upload_file";
      sourceMeta?: {
        videoUrl?: string | null;
        filename?: string | null;
        mimeType?: string | null;
        duration?: number | null;
      };
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
    const created = await ctx.reverseStoryboardLibraryService.create(user, {
      title,
      summary: String(body.summary ?? "").trim() || report.intro || title,
      tags: body.tags ?? ["#反推分镜"],
      sourceType: body.sourceType === "upload_file" ? "upload_file" : "video_url",
      sourceMeta: {
        videoUrl: body.sourceMeta?.videoUrl ?? null,
        filename: body.sourceMeta?.filename ?? null,
        mimeType: body.sourceMeta?.mimeType ?? null,
        duration: Number.isFinite(Number(body.sourceMeta?.duration)) ? Number(body.sourceMeta?.duration) : null,
      },
      report,
      content,
    });
    return toReverseStoryboardLibraryRecordDto(user, created.id);
  });

  app.get(`${REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX}/:itemId`, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const params = request.params as { itemId: string };
    return toReverseStoryboardLibraryRecordDto(user, params.itemId);
  });

  app.patch(`${REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX}/:itemId`, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const params = request.params as { itemId: string };
    const body = (request.body as {
      title?: string;
      summary?: string;
      tags?: string[];
      content?: string;
      sourceMeta?: {
        videoUrl?: string | null;
        filename?: string | null;
        mimeType?: string | null;
        duration?: number | null;
      };
    } | undefined) ?? {};
    const nextContent = typeof body.content === "string" ? body.content.trim() : undefined;
    const nextReport = nextContent !== undefined ? mapRawReverseStoryboardReport(nextContent) : undefined;
    await ctx.reverseStoryboardLibraryService.update(user, params.itemId, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.summary !== undefined
        ? { summary: String(body.summary) }
        : nextReport?.intro
          ? { summary: nextReport.intro }
          : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(nextContent !== undefined ? { content: nextContent, report: nextReport } : {}),
      ...(body.sourceMeta !== undefined
        ? {
            sourceMeta: {
              videoUrl: body.sourceMeta.videoUrl ?? null,
              filename: body.sourceMeta.filename ?? null,
              mimeType: body.sourceMeta.mimeType ?? null,
              duration: Number.isFinite(Number(body.sourceMeta.duration)) ? Number(body.sourceMeta.duration) : null,
            },
          }
        : {}),
    });
    return toReverseStoryboardLibraryRecordDto(user, params.itemId);
  });

  app.delete(`${REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX}/:itemId`, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const params = request.params as { itemId: string };
    await ctx.reverseStoryboardLibraryService.remove(user, params.itemId);
    return { ok: true };
  });

  app.post(`${REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX}/batch-delete`, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const body = (request.body as { itemIds?: string[] } | undefined) ?? {};
    const itemIds = [...new Set((body.itemIds ?? []).map((item) => String(item).trim()).filter((item) => item.length > 0))];
    let deleted = 0;
    for (const itemId of itemIds) {
      try {
        await ctx.reverseStoryboardLibraryService.remove(user, itemId);
        deleted += 1;
      } catch {
        // Ignore missing/forbidden entries so batch delete remains idempotent.
      }
    }
    return { ok: true, deleted };
  });

  app.get(`${REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX}/:itemId/versions`, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const params = request.params as { itemId: string };
    return { versions: await ctx.reverseStoryboardLibraryService.listVersions(user, params.itemId) };
  });

  app.post(`${REVERSE_STORYBOARD_LIBRARY_ROUTE_PREFIX}/:itemId/rollback`, async (request) => {
    const user = await requireUser(ctx, request);
    ensureLegacyReverseStoryboardLibraryCompatibility(user);
    const params = request.params as { itemId: string };
    const body = request.body as { version: number };
    await ctx.reverseStoryboardLibraryService.rollback(user, params.itemId, body.version);
    return toReverseStoryboardLibraryRecordDto(user, params.itemId);
  });

  // --- /characters/presets 路由 ---

  app.get("/characters/presets", async (request) => {
    const user = await requireUser(ctx, request);
    return { presets: await ctx.characterService.listPresets(user) };
  });
}
