/**
 * project-flow-route-handlers.ts
 *
 * 从 app.ts 提取的项目 CRUD 路由处理器：
 * 创建、重命名、删除项目，保存/获取工作流状态等。
 */

import type { FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { findStep4VideoJobsByProjectId } from "../service/async-job-service.js";
import { parseStep4VideoJob } from "../service/step4-video-job-adapter.js";
import type {
  OutfitPlan,
  VideoProjectStatus,
} from "../contracts/types.js";
import { VIDEO_PROJECT_STATUS_ORDER, isVideoStatusBeyond } from "../contracts/types.js";
import { validateOutfitPlanDto, type OutfitPlanDto } from "../contracts/outfit-plan.dto.js";
import type { CharacterReference } from "../modules/dressedup-character-helpers.js";
import { requireUser } from "../services/auth/route-guards.js";
import { toPlainRecord } from "../services/utils/json-utils.js";
import { resolveProjectLastStep } from "../contracts/project-last-step.js";
import { createEmptyProjectStepSnapshot } from "../contracts/project-step-snapshot.js";
import {
  normalizeProjectPageContentSnapshot,
  PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
} from "../contracts/project-page-content-snapshot.js";
import {
  createEmptyProjectBackgroundGenerationTaskState,
  normalizeProjectBackgroundGenerationTaskState,
} from "../contracts/project-background-generation-task.js";
import {
  resolveLatestDressedupWarehouseCharacterForProject,
  collectConfirmedCharacterReferencesFromWarehouse,
  // listLocalObjectStorageImageUrlsByPrefix,
  // hydrateCharacterViewSessionCandidatesFromStorage,
} from "../modules/dressedup-character-helpers.js";
// import {
//   buildStep2DressedupAllInOneSlotStoragePrefix,
// } from "../modules/step2-dressedup-storage-prefix.js";
// import { pickLatestCandidate } from "../modules/character-view-session.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ProjectFlowRouteHandlersDeps {
  ctx: AppContext;
}

/**
 * 持久化状态查询结果
 */
interface PersistedStateResult {
  persistedPageContentSnapshot: ReturnType<typeof normalizeProjectPageContentSnapshot> | null;
  persistedBackgroundGenerationTask: ReturnType<typeof normalizeProjectBackgroundGenerationTaskState> | null;
}

/**
 * 上传数据构建结果
 */
interface UploadsData {
  uploads: Array<{
    id: string;
    category: string;
    fileName: string;
    sizeMb: number;
    libraryAssetId: string | null;
    url: string | null;
  }>;
}

/**
 * Outfit plans 构建结果
 */
interface OutfitPlansData {
  outfitPlans: Array<{
    id: string;
    index: number;
    title: string | null;
    reason: string | null;
    assetIds: string[];
    styleName: string | null;
    analysis: string | null;
    optimizedPrompt: string | null;
    suitableScene: string | null;
    tags: string[];
    /** 服饰单品数组（含 name/type/style/description/assetId） */
    items: Array<{ type: string; name: string; style?: string; description?: string; assetId?: string }>;
  }>;
}

/**
 * 角色五视图与 Step2 V2 候选数据构建结果
 */
interface CharacterDataResult {
  confirmedCharacterReferences: CharacterReference[];
  step2V2GeneratedCandidateUrls: [string, string, string];
}

/**
 * Step5 剪辑数据构建结果
 */
interface Step5ClipData {
  latestVideoJob: {
    id: string;
    status: string;
    attempts: number;
    durationMinutes: number | null;
    startedAt: number;
    totalClipCount: number | null;
    completedClipCount: number;
    videoUrls: string[];
    externalTaskIds: string[];
    providerId: string | null;
    model: string | null;
    error: { code: string; message: string } | null;
  } | null;
  clipCount: number;
  completedClipCount: number;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

const pickProjectStepState = (
  source: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> => {
  if (!source) {
    return {};
  }
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      picked[key] = source[key];
    }
  }
  return picked;
};

// buildProjectStepState removed - workflow state no longer persisted

// ---------------------------------------------------------------------------
// 辅助函数：拆分 getProjectResumeSnapshotRoute 逻辑
// ---------------------------------------------------------------------------



/**
 * 获取项目的持久化状态（页面快照、背景生成任务）
 * Note: workflow state persistence removed, now managed in-memory via Zustand
 */
async function fetchProjectPersistedState(
  ctx: AppContext,
  projectId: string,
): Promise<PersistedStateResult> {
  // Workflow state no longer persisted - return empty snapshots
  return {
    persistedPageContentSnapshot: null,
    persistedBackgroundGenerationTask: null,
  };
}

/**
 * 构建项目的上传数据
 */
async function buildProjectUploadsData(
  ctx: AppContext,
  projectId: string,
  userId: string,
): Promise<UploadsData> {
  // 获取项目服饰列表（从新的 nrm_project_garment_assoc 表）
  const projectGarments = await ctx.repos.assets.findByProjectId(projectId);

  const uploads = await Promise.all(
    projectGarments
      .filter((item) => item.userId === userId)
      .map(async (item) => {
        // 优先使用关联的服装库资产的平铺图，否则使用存储的图片URL
        const linked = item.garmentAssetId ? await ctx.repos.garmentAssets.findById(item.garmentAssetId) : null;
        return {
          id: item.id,
          category: item.category ?? "",
          fileName: item.fileName ?? "",
          sizeMb: item.sizeMb ?? 0,
          libraryAssetId: item.garmentAssetId,
          url: linked ? (linked.mainImageUrl?.trim() || (item.imageUrl ?? null)) : (item.imageUrl ?? null),
        };
      })
  );

  return { uploads };
}

/**
 * 构建项目的 outfit plans 数据
 */
async function buildProjectOutfitPlansData(
  ctx: AppContext,
  projectId: string,
  userId: string,
): Promise<OutfitPlansData> {
  const outfitPlans = [...await ctx.repos.outfitPlans.list()]
    .filter((item) => item.projectId === projectId && item.userId === userId)
    .sort((a, b) => a.index - b.index)
    .map((item) => ({
      id: item.id,
      index: item.index,
      title: item.title ?? null,
      reason: item.reason ?? null,
      assetIds: item.assetIds,
      styleName: item.styleName ?? null,
      analysis: item.analysis ?? null,
      optimizedPrompt: item.optimizedPrompt ?? null,
      suitableScene: item.suitableScene ?? null,
      tags: item.tags ?? [],
      items: item.items ?? [],
    }));

  return { outfitPlans };
}

/**
 * 构建项目的角色五视图与 V2 候选数据
 */
async function buildProjectCharacterData(
  ctx: AppContext,
  project: { id: string; name: string },
  userId: string,
): Promise<CharacterDataResult> {
  // 从定妆仓库角色收集已确认的角色参考（用于 Step3 角色参考池）
  const dressedupWarehouseCharacter = await resolveLatestDressedupWarehouseCharacterForProject(ctx, userId, project.id);
  const confirmedCharacterReferences = collectConfirmedCharacterReferencesFromWarehouse(dressedupWarehouseCharacter);

  // 通过项目关联的角色获取五视图图片（取最新 3 个 main 角色，按创建时间倒序）
  const projectCharacters = await ctx.projectCharacterService.listByProjectId(project.id);
  const libraryCharacterIds = projectCharacters
    .filter((pc) => pc.role === "main")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3)
    .map((pc) => pc.libraryCharacterId);

  const step2V2GeneratedCandidateUrls: [string, string, string] = ["", "", ""];
  let slotIndex = 0;
  for (const libraryCharId of libraryCharacterIds) {
    if (slotIndex >= 3) break;
    const libChar = await ctx.repos.libraryCharacters.findById(libraryCharId, { includeDeleted: true });
    if (libChar?.fiveViewOssImageUrl) {
      step2V2GeneratedCandidateUrls[slotIndex] = libChar.fiveViewOssImageUrl;
      slotIndex++;
    }
  }

  return { confirmedCharacterReferences, step2V2GeneratedCandidateUrls };
}

/**
 * 构建项目的 Step5 剪辑数据
 */
function buildProjectStep5ClipData(
  latestVideoJob: {
    id: string;
    status: string;
    attempts: number;
    durationMinutes: number | null;
    startedAt: number;
    totalClipCount?: number | null;
    completedClipCount?: number;
    videoUrls?: string[];
    externalTaskIds?: string[];
    providerId?: string | null;
    model?: string | null;
    error?: { code: string; message: string } | null;
  } | null,
  storyboardFrames: { id: string }[],
): Step5ClipData {
  const latestJobDeclaredClipCount = Number(latestVideoJob?.totalClipCount ?? 0);
  const latestJobVideoCount = Array.isArray(latestVideoJob?.videoUrls) ? latestVideoJob.videoUrls.length : 0;
  const clipCount = Math.max(storyboardFrames.length, latestJobDeclaredClipCount, latestJobVideoCount, 0);
  const completedClipCount = Math.max(
    0,
    Math.min(
      clipCount,
      Number(latestVideoJob?.completedClipCount ?? (latestVideoJob?.status === "succeeded" ? clipCount : 0)),
    ),
  );

  const formattedVideoJob = latestVideoJob
    ? {
      id: latestVideoJob.id,
      status: latestVideoJob.status,
      attempts: latestVideoJob.attempts,
      durationMinutes: latestVideoJob.durationMinutes,
      startedAt: latestVideoJob.startedAt,
      totalClipCount: latestVideoJob.totalClipCount ?? null,
      completedClipCount: latestVideoJob.completedClipCount ?? 0,
      videoUrls: latestVideoJob.videoUrls ?? [],
      externalTaskIds: latestVideoJob.externalTaskIds ?? [],
      providerId: latestVideoJob.providerId ?? null,
      model: latestVideoJob.model ?? null,
      error: latestVideoJob.error ?? null,
    }
    : null;

  return {
    latestVideoJob: formattedVideoJob,
    clipCount,
    completedClipCount,
  };
}

/**
 * 构建项目的快照数据
 */
async function buildProjectSnapshot(
  ctx: AppContext,
  project: { id: string; lastVisitedStep: number | null; selectedOutfitPlanId: string | null },
  userId: string,
  data: {
    latestScript: { id: string; version: number; sourceType: string; durationSec: number | null; payload: unknown } | null;
    scriptText: string;
    segmentCount: number;
    storyboardFrames: { id: string }[];
    step5ClipData: Step5ClipData;
  },
) {
  const snapshot = createEmptyProjectStepSnapshot(project.id);
  snapshot.updatedAt = ctx.clock.now();
  snapshot.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
    step: project.lastVisitedStep ?? 1,
    trigger: "resume-open",
  });

  // Step1
  snapshot.steps.step1.selectedOutfitPlanId = project.selectedOutfitPlanId;
  snapshot.steps.step1.selectedOutfitSource = project.selectedOutfitPlanId ? "visual" : null;
  snapshot.steps.step1.outfitSummary = null;

  // Step2
  snapshot.steps.step2.selectedCharacterId = null;
  snapshot.steps.step2.selectedPreviewId = null;
  snapshot.steps.step2.confirmedModel = false;
  snapshot.steps.step2.styledViewIds = [];

  // Step3
  snapshot.steps.step3.scriptVersionId = data.latestScript?.id ?? null;
  snapshot.steps.step3.scriptText = data.scriptText || null;
  snapshot.steps.step3.segmentCount = data.segmentCount;

  // Step4
  snapshot.steps.step4.frameIds = data.storyboardFrames.map((item) => item.id);
  snapshot.steps.step4.frameCount = data.storyboardFrames.length;

  // Step5
  snapshot.steps.step5.latestJobId = data.step5ClipData.latestVideoJob?.id ?? null;
  snapshot.steps.step5.clipCount = data.step5ClipData.clipCount;
  snapshot.steps.step5.completedClipCount = data.step5ClipData.completedClipCount;

  // Step6
  snapshot.steps.step6.variantCount = 0;
  snapshot.steps.step6.hasVariants = false;

  // Step7
  if (data.latestScript) {
    const scriptId = data.latestScript.id;
    const latestReview = [...await ctx.repos.reviewRequests.list()]
      .filter((item) => item.userId === userId && item.resourceId === scriptId)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    snapshot.steps.step7.reviewId = latestReview?.id ?? null;
  }
  snapshot.steps.step7.exportUrl = null;

  return snapshot;
}

// ---------------------------------------------------------------------------
// 路由处理器工厂
// ---------------------------------------------------------------------------

export function createProjectRouteHandlers(deps: ProjectFlowRouteHandlersDeps) {
  const { ctx } = deps;

  const createProjectRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as { name?: unknown; projectKind?: unknown; reverseScriptId?: unknown } | undefined) ?? {};
    const rawName = body.name;
    const projectName =
      typeof rawName === "string"
        ? rawName
        : rawName && typeof rawName === "object" && typeof (rawName as { name?: unknown }).name === "string"
          ? String((rawName as { name: string }).name)
          : "";
    const projectKind = typeof body.projectKind === "string" ? (body.projectKind as "image" | "video" | "reverse" | "outfit_change") : undefined;
    const reverseScriptId = typeof body.reverseScriptId === "string" ? body.reverseScriptId : undefined;
    const created = await ctx.projectService.createProject(user, projectName, projectKind, reverseScriptId);
    return created;
  };

  const getProjectRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt,
      exportUrl: project.exportUrl ?? null,
      lastVisitedStep: project.lastVisitedStep ?? null,
      projectKind: project.projectKind ?? "video",
      reverseScriptId: project.reverseScriptId ?? null,
    };
  };

  const renameProjectRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as { name?: unknown } | undefined) ?? {};
    const nextName = typeof body.name === "string" ? body.name : "";
    const project = await ctx.projectService.renameProject(user, params.projectId, nextName);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt,
    };
  };

  const saveProjectWorkflowStateRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as {
      step?: number;
      workflow?: unknown;
      historySnapshot?: unknown;
      projectData?: unknown;
    } | undefined) ?? {};

    // 验证项目权限
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const normalizedStep = resolveProjectLastStep(project.lastVisitedStep, {
      step: Number(body.step ?? project.lastVisitedStep ?? 1),
      trigger: "route-enter",
    });

    const now = ctx.clock.now();

    // Workflow state no longer persisted - return success without saving
    return {
      id: project.id,
      projectId: project.id,
      lastVisitedStep: normalizedStep,
      updatedAt: now,
    };
  };

  // 从 app.ts 第 1538-1841 行复制，已拆分为辅助函数
  const getProjectResumeSnapshotRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 1. 获取持久化状态（workflow state no longer persisted）
    const { persistedPageContentSnapshot, persistedBackgroundGenerationTask } =
      await fetchProjectPersistedState(ctx, project.id);

    // 2. 构建上传数据
    const { uploads } = await buildProjectUploadsData(ctx, project.id, user.id);

    // 4. 构建 outfit plans 数据
    const { outfitPlans } = await buildProjectOutfitPlansData(ctx, project.id, user.id);

    // 5. 构建角色数据
    const { confirmedCharacterReferences, step2V2GeneratedCandidateUrls } =
      await buildProjectCharacterData(ctx, project, user.id);

    // 6. 获取脚本数据
    // 直接查询已确认脚本，不依赖 nrm_project_script_assoc
    const latestScriptRow = await ctx.repos.scriptData.findConfirmedByProjectId(project.id);
    const latestScript = latestScriptRow
      ? { id: latestScriptRow.id as string, version: 1, sourceType: (latestScriptRow.source_type as string) ?? "original", durationSec: (latestScriptRow.duration_seconds as number | null) ?? 30, payload: { basicInfo: latestScriptRow.basic_info ?? "", roleTable: latestScriptRow.role_table ?? "", outfitTable: latestScriptRow.outfit_table ?? "", storyboard: latestScriptRow.storyboard ?? "" } }
      : null;
    const scriptText = (latestScriptRow?.basic_info as string | undefined)?.trim() ?? "";
    const segmentCount = scriptText
      ? scriptText.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean).length
      : 0;

    // 7. 获取分镜帧数据（nrm_storyboard_frames 已删除，从 nrm_step3_frame_images 查询）
    const storyboardFrameRows = await ctx.repos.step3FrameImages.findRawStoryboardRows(project.id);
    const storyboardFrames = storyboardFrameRows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      index: (row.frame_index ?? 0) as number,
      imageUrl: (row.selected_image_url ?? "") as string,
      variants: [row.selected_image_url ?? ""] as string[],
      selectedVariantIndex: 0 as number,
    }));

    // 8. 获取视频任务
    const videoJobRecords = await findStep4VideoJobsByProjectId(ctx.repos, project.id);
    const videoJobsFlat = videoJobRecords.map(parseStep4VideoJob);
    const latestVideoJob = videoJobsFlat
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;

    // 9. 构建 Step5 剪辑数据
    const step5ClipData = buildProjectStep5ClipData(latestVideoJob, storyboardFrames);

    // 10. 构建 Step1 相关数据（优先使用数据库，兜底使用快照）
    // 角色预设：从 projects.selected_role_direction 获取
    const selectedRoleDirection = project.selectedRoleDirection as Record<string, unknown> | null;
    const step1Snapshot = persistedPageContentSnapshot?.step1 as unknown as Record<string, unknown> | null;
    const step1SelectedRoleDirectionId = typeof selectedRoleDirection?.directionId === "string"
      ? selectedRoleDirection.directionId
      : (step1Snapshot?.step1SelectedRoleDirectionId as string | null) ?? null;
    // step1Step2Ready：优先判断 projects.selected_role_direction.directionId
    const step1Step2Ready = typeof selectedRoleDirection?.directionId === "string" && (selectedRoleDirection.directionId as string).trim().length > 0
      ? true
      : (step1Snapshot?.step1Step2Ready as boolean | undefined) ?? false;
    // 角色预设卡片：从 nrm_role_direction_cards 获取
    const roleDirectionCardsRecord = await ctx.repos.roleDirectionCards.findByProjectId(project.id);
    const step1RoleDirectionCards = roleDirectionCardsRecord?.cardsJson ?? [];
    // hiddenRoleSettingPrompt：优先从 projects.selected_role_direction 获取
    const step1HiddenRoleSettingPrompt = typeof selectedRoleDirection?.hiddenRoleSettingPrompt === "string"
      ? selectedRoleDirection.hiddenRoleSettingPrompt as string
      : (step1Snapshot?.step1HiddenRoleSettingPrompt as string | null) ?? null;
    // adminDebugPrompt：优先从 projects.selected_role_direction 获取
    const step1AdminDebugPrompt = typeof selectedRoleDirection?.adminDebugPrompt === "string"
      ? selectedRoleDirection.adminDebugPrompt as string
      : (step1Snapshot?.step1AdminDebugPrompt as string | null) ?? null;

    // 11. 构建快照
    const snapshot = await buildProjectSnapshot(ctx, project, user.id, {
      latestScript,
      scriptText,
      segmentCount,
      storyboardFrames,
      step5ClipData,
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        lastVisitedStep: snapshot.lastVisitedStep,
        lastReverseTaskId: project.lastReverseTaskId,
        lastReverseScriptVersionId: project.lastReverseScriptVersionId,
        selectedRoleDirection: project.selectedRoleDirection,
        projectKind: project.projectKind,
        reverseScriptId: project.reverseScriptId,
      },
      persistedWorkflowState: null, // Workflow state no longer persisted
      state: {
        uploads,
        outfitPlans,
        selectedOutfitPlanId: project.selectedOutfitPlanId,
        selectedRoleDirection: project.selectedRoleDirection,
        // Step1 相关数据（优先使用数据库）
        step1SelectedRoleDirectionId,
        step1Step2Ready,
        step1RoleDirectionCards,
        step1HiddenRoleSettingPrompt,
        step1AdminDebugPrompt,
        step2V2GeneratedCandidateUrls,
        confirmedCharacterReferences,
        latestScript,
        storyboardFrames,
        latestVideoJob: step5ClipData.latestVideoJob,
      },
      snapshot,
    };
  };

  const deleteProjectRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.deleteProject(user, params.projectId);
    return { ok: true };
  };

  const uploadProjectAssetsRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as {
      files: Array<{ garmentAssetId: string; fileName: string; sizeMb: number }>;
    };
    const assets = await ctx.uploadService.upload(user, params.projectId, body.files);

    // 第一次上传服饰时，更新项目封面、缩略图和服饰主图
    if (assets.length > 0) {
      const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
      const firstImageUrl = assets[0].imageUrl?.trim();
      if (firstImageUrl) {
        // 封面：第一次上传时设置（coverImageUrl 为空）
        const shouldUpdateCover = !project.coverImageUrl;
        // 缩略图：默认占位图时更新
        const isDefaultThumbnail = project.thumbnailUrl?.includes("placehold.co");
        // 服饰主图：第一次上传时设置
        const shouldUpdateGarmentImage = !project.garmentImageUrl;

        if (shouldUpdateCover || isDefaultThumbnail || shouldUpdateGarmentImage) {
          if (shouldUpdateCover) {
            project.coverImageUrl = firstImageUrl;
          }
          if (isDefaultThumbnail) {
            project.thumbnailUrl = firstImageUrl;
          }
          if (shouldUpdateGarmentImage) {
            project.garmentImageUrl = firstImageUrl;
          }
          await ctx.projectService.saveProject(project);
        }
      }
    }

    return { assets };
  };

  // ==========================================================================
  // Step1 独立数据接口（左侧面板 + 右侧面板按需加载）
  // ==========================================================================

  /**
   * GET /projects/:projectId/step1-garments
   * 获取 Step1 左侧服饰模块数据
   * 数据源：nrm_project_garment_assoc + nrm_garment_assets
   */
  const getStep1GarmentsRoute = async (request: FastifyRequest): Promise<{
    projectId: string;
    projectStatus: string;
    garments: Array<{
      id: string;
      categoryId: string;
      name: string;
      category: string;
      description: string | null;
      imageUrl: string | null;
      libraryAssetId: string | null;
      subImages: string[];
    }>;
  }> => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 获取项目关联的服饰资产
    const projectGarments = await ctx.repos.assets.findByProjectId(project.id);
    const userGarments = projectGarments.filter((g) => g.userId === user.id);

    // 批量获取服饰详情
    const garmentAssetIds = userGarments.map((g) => g.garmentAssetId).filter(Boolean) as string[];
    const garmentAssetsMap = new Map<string, {
      id: string; category: string; url: string; removedBgUrl: string | null;
      name: string; description: string | null;
      subImages: string[];
    }>();
    if (garmentAssetIds.length > 0) {
      const assets = await ctx.repos.garmentAssets.findByIds(garmentAssetIds);
      for (const a of assets) {
        const subImages = [a.subImageUrl1, a.subImageUrl2, a.subImageUrl3]
          .map((u) => u?.trim() ?? "")
          .filter(Boolean);
        garmentAssetsMap.set(a.id, {
          id: a.id,
          category: a.category,
          url: a.mainImageUrl?.trim() || a.flatLayImageUrl?.trim() || "",
          removedBgUrl: null,
          name: a.name || "",
          description: a.description || null,
          subImages,
        });
      }
    }

    // 直接返回服饰列表，不分组
    const garments = userGarments.map((g) => {
      const asset = g.garmentAssetId ? garmentAssetsMap.get(g.garmentAssetId) : undefined;
      return {
        id: g.id,
        categoryId: g.garmentAssetId ?? `garment-${g.id}`,
        name: asset?.name ?? g.fileName ?? "",
        category: g.category ?? asset?.category ?? "",
        description: asset?.description ?? null,
        imageUrl: asset?.url ?? g.imageUrl ?? null,
        libraryAssetId: g.garmentAssetId,
        subImages: asset?.subImages ?? [],
      };
    });

    return {
      projectId: project.id,
      projectStatus: project.status,
      garments,
    };
  };

  /**
   * GET /projects/:projectId/outfit-plans
   * 获取 Step1 AI 搭配方案
   * 数据源：nrm_outfit_plans + nrm_project_outfit_plans（关联表）
   */
  const getOutfitPlansRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 通过关联表获取搭配方案
    const plans = await ctx.repos.outfitPlans.findByProjectId(project.id);

    // 从 nrm_project_outfit_plans 获取选中的搭配方案（selected=true）
    const assocRecords = await ctx.repos.projectOutfitPlanAssocs.findByProjectId(project.id);
    const selectedAssoc = assocRecords.find((a) => a.selected);
    const selectedOutfitPlanId = selectedAssoc?.outfitPlanId ?? project.selectedOutfitPlanId;

    // 收集所有服饰资产 ID
    const allAssetIds = new Set<string>();
    for (const plan of plans) {
      for (const aid of plan.assetIds) allAssetIds.add(aid);
    }
    const assetMap = new Map<string, { id: string; category: string; url: string }>();
    if (allAssetIds.size > 0) {
      const assets = await ctx.repos.garmentAssets.findByIds(Array.from(allAssetIds));
      for (const a of assets) {
        const url = a.mainImageUrl?.trim() || a.flatLayImageUrl?.trim();
        if (url) {
          assetMap.set(a.id, { id: a.id, category: a.category, url });
        }
      }
    }

    // 构建返回数据：验证并转换为 OutfitPlanDto（必填字段为空直接报错）
    const outfitPlans: OutfitPlanDto[] = plans.map((plan, idx) =>
      validateOutfitPlanDto(plan, idx)
    );

    return {
      projectId: project.id,
      projectStatus: project.status,
      selectedOutfitPlanId,
      outfitPlans,
    };
  };

  /**
   * GET /projects/:projectId/step1-state
   * 获取 Step1 右侧面板状态数据（搭配分析、角色方向、选中状态）
   *
   * 数据源优先级：
   * 1. projects 表（selected_role_direction）— 最高优先级
   * 2. nrm_role_direction_cards 表
   * 3. nrm_project_outfit_plans 表
   * 4. pageContentSnapshot（仅作为兜底）
   */
  const getStep1StateRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const { persistedPageContentSnapshot, persistedBackgroundGenerationTask } =
      await fetchProjectPersistedState(ctx, project.id);

    const step1Snapshot = persistedPageContentSnapshot?.step1 ?? null;

    // 角色预设已选数据来自 projects 表的 selected_role_direction 字段（最高优先级）
    const roleDirection = project.selectedRoleDirection as Record<string, unknown> | null;

    // 从 nrm_project_outfit_plans 获取选中的搭配方案
    const assocRecords = await ctx.repos.projectOutfitPlanAssocs.findByProjectId(project.id);
    const selectedAssoc = assocRecords.find((a) => a.selected);

    // 角色预设列表从新表 nrm_role_direction_cards 读取，降级到快照
    const roleDirectionCardsRecord = await ctx.repos.roleDirectionCards.findByProjectId(project.id);
    let step1RoleDirectionCards = roleDirectionCardsRecord?.cardsJson ?? step1Snapshot?.step1RoleDirectionCards ?? [];

    // 历史数据兼容：如果列表为空但已选中有角色预设，用已选信息构建一个卡片
    if ((!Array.isArray(step1RoleDirectionCards) || step1RoleDirectionCards.length === 0) && typeof roleDirection?.directionId === "string") {
      step1RoleDirectionCards = [{
        directionId: roleDirection.directionId,
        styleSummary: (roleDirection.styleSummary as string) || "",
        portraitUrl: roleDirection.portraitUrl ?? null,
        confidence: typeof roleDirection.confidence === "number" ? roleDirection.confidence : 1,
        ethnicityOrRegion: (roleDirection.ethnicityOrRegion as string) || null,
        gender: (roleDirection.gender as string) || null,
        age: typeof roleDirection.age === "number" ? roleDirection.age : null,
        styleWords: Array.isArray(roleDirection.styleWords) ? roleDirection.styleWords as string[] : [],
      }];
    }

    // step1Step2Ready 优先使用数据库实际数据判断：
    // 1. projects.selected_role_direction 存在且有 directionId → true
    // 2. 否则降级到快照中的值
    const step1Step2Ready = typeof roleDirection?.directionId === "string" && roleDirection.directionId.trim().length > 0
      ? true
      : step1Snapshot?.step1Step2Ready ?? false;

    // step1SelectedRoleDirectionId 优先使用 projects 表数据
    const step1SelectedRoleDirectionId = typeof roleDirection?.directionId === "string"
      ? roleDirection.directionId
      : step1Snapshot?.step1SelectedRoleDirectionId ?? null;

    // step1HiddenRoleSettingPrompt 优先使用 projects 表数据
    const step1HiddenRoleSettingPrompt = typeof roleDirection?.hiddenRoleSettingPrompt === "string"
      ? roleDirection.hiddenRoleSettingPrompt
      : step1Snapshot?.step1HiddenRoleSettingPrompt ?? null;

    // step1AdminDebugPrompt 优先使用 projects 表数据
    const step1AdminDebugPrompt = typeof roleDirection?.adminDebugPrompt === "string"
      ? roleDirection.adminDebugPrompt
      : step1Snapshot?.step1AdminDebugPrompt ?? null;

    return {
      projectId: project.id,
      projectStatus: project.status,
      selectedOutfitPlanId: selectedAssoc?.outfitPlanId ?? project.selectedOutfitPlanId,
      selectedOutfitId: step1Snapshot?.selectedOutfitId ?? null,
      selectedOutfitSource: step1Snapshot?.selectedOutfitSource ?? null,
      step1Step2Ready,
      step1SelectedRoleDirectionId,
      step1RoleDirectionCards,
      outfitAnalysisCards: step1Snapshot?.outfitAnalysisCards ?? [],
      step1HiddenRoleSettingPrompt,
      step1AdminDebugPrompt,
    };
  };

  // ==========================================================================
  // 更新项目的选中角色方向（Step1 角色预设）
  // ==========================================================================
  const updateProjectRoleDirectionRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { roleDirection: Record<string, unknown> | null };
    const { projectId } = params;
    const { roleDirection } = body;

    // 验证项目所有权并获取当前状态
    const project = await ctx.projectService.requireOwnerProject(user, projectId);
    const currentStatus = project.status as string;

    // 更新 selected_role_direction 字段
    await ctx.repos.projects.updateSelectedRoleDirection(projectId, roleDirection);

    // 状态更新：确认角色方向时前进，取消时仅在早期状态才允许回退
    if (roleDirection) {
      // 确认角色方向：前进到 ROLE_DIRECTION_CONFIRMED
      await ctx.repos.projects.updateStatus(projectId, "ROLE_DIRECTION_CONFIRMED");
    } else {
      // 取消角色方向：只有在 DRAFT 或 ROLE_DIRECTION_CONFIRMED 状态才允许回退到 DRAFT
      // 防止项目已进入后续步骤（如 Step2+）时错误回退到草稿状态
      const currentStatusIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf(currentStatus as VideoProjectStatus);
      const roleDirectionConfirmedIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf("ROLE_DIRECTION_CONFIRMED");
      if (currentStatusIndex >= 0 && currentStatusIndex <= roleDirectionConfirmedIndex) {
        await ctx.repos.projects.updateStatus(projectId, "DRAFT");
      }
      // 如果项目已超过 ROLE_DIRECTION_CONFIRMED 状态，不更新状态（保留当前进度）
    }

    // 同步 portraitUrl 到角色预设卡片表
    if (roleDirection) {
      const portraitUrl = roleDirection.portraitUrl;
      const directionId = roleDirection.directionId;
      if (typeof portraitUrl === "string" && typeof directionId === "string") {
        await ctx.repos.roleDirectionCards.updateCardPortraitUrl(projectId, directionId, portraitUrl);
      }
    }

    return { success: true };
  };

  /**
   * GET /projects/:projectId/context
   * 获取项目上下文（角色、服饰、穿搭方案）
   * 用于 Step6 裂变页面
   */
  const getProjectContextRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 使用 ProjectContextService 获取完整上下文
    const projectContext = await ctx.projectContextService.getProjectContext(params.projectId, {
      includeGarmentImages: true,
      includeCharacterFiveView: true,
    });

    return {
      projectId: projectContext.projectId,
      projectName: projectContext.projectName,
      // 角色信息
      character: projectContext.character ? {
        libraryCharacterId: projectContext.character.libraryCharacterId,
        name: projectContext.character.name,
        gender: projectContext.character.gender,
        age: projectContext.character.age,
        style: projectContext.character.style,
        tags: projectContext.character.tags,
        thumbnailUrl: projectContext.character.thumbnailUrl,
        fiveViewOssImageUrl: projectContext.character.fiveViewOssImageUrl,
      } : null,
      // 聚合字段
      characterDescription: projectContext.characterDescription,
      matchingReference: projectContext.matchingReference,
      outfitDescription: projectContext.outfitDescription,
      clothingStyles: projectContext.clothingStyles,
      // 服饰列表
      garments: projectContext.garments.map(g => ({
        garmentAssetId: g.garmentAssetId,
        name: g.name,
        category: g.category,
        description: g.description,
        style: g.style,
        mainImageUrl: g.mainImageUrl,
        flatLayImageUrl: g.flatLayImageUrl,
      })),
      // 穿搭方案
      selectedOutfit: projectContext.selectedOutfit ? {
        outfitPlanId: projectContext.selectedOutfit.outfitPlanId,
        title: projectContext.selectedOutfit.title,
        styleName: projectContext.selectedOutfit.styleName,
        tags: projectContext.selectedOutfit.tags,
        analysis: projectContext.selectedOutfit.analysis,
        optimizedPrompt: projectContext.selectedOutfit.optimizedPrompt,
        suitableScene: projectContext.selectedOutfit.suitableScene,
      } : null,
    };
  };

  return {
    createProjectRoute,
    getProjectRoute,
    renameProjectRoute,
    saveProjectWorkflowStateRoute,
    getProjectResumeSnapshotRoute,
    getStep1GarmentsRoute,
    getOutfitPlansRoute,
    getStep1StateRoute,
    getProjectContextRoute,
    deleteProjectRoute,
    uploadProjectAssetsRoute,
    updateProjectRoleDirectionRoute,
  };
}