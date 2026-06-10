# app.ts 分层拆分实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 app.ts 从 2040 行减少到约 300 行，通过分层拆分路由处理器和适配器构建函数。

**架构：** 创建 4 个新模块分别承载适配器工厂、项目路由处理器、路由注册入口。app.ts 只保留 buildApp 骨架。

**技术栈：** TypeScript, Fastify 5

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/modules/adapter-factory.ts` | 适配器构建函数（buildReverseFetchOrchestrator 等） | 新建 |
| `src/routes/project-flow-route-handlers.ts` | 项目 CRUD 路由处理器 + 状态构建函数 | 新建 |
| `src/routes/route-registrar.ts` | 统一路由注册入口 | 新建 |
| `src/app.ts` | buildApp 骨架 + 精简导入 | 修改 |

---

### 任务 1：创建适配器工厂模块

**文件：**
- 创建：`src/modules/adapter-factory.ts`

- [ ] **步骤 1：创建 adapter-factory.ts 文件**

```typescript
/**
 * adapter-factory.ts
 *
 * 从 app.ts 提取的适配器构建函数：
 * ReverseFetchOrchestrator、TikHubAdapter、DouhotAdapter 等构建器。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { SourceCredentialScope } from "../contracts/types.js";
import type { ReverseFetchAdapterRuntimeConfig } from "./reverse-fetch-adapters.js";
import {
  createDefaultReverseFetchAdapters,
  DouhotAdapter,
  TikHubTrendAdapter,
  type ReverseFetchOrchestratorRepository,
} from "./reverse-fetch-adapters.js";
import { ReverseFetchOrchestrator } from "./orchestrator.js";
import { resolveReverseFetchStageOrder, resolveSquareTrendVideoReversePriority } from "./trend-topic-normalizer.js";
import {
  resolveLatestSourceCredentialSecret,
  resolveTikHubProviderSecret,
  resolveTikHubTokenForUser,
  resolveTikHubTokenForHotTrends,
  resolveDouhotEndpointForHotTrends,
} from "../app-setup/credential-resolvers.js";
import { VIDEO_HOT_TREND_FETCH_CONTRACT } from "../contracts/hot-trend-fetch-config.js";
import type { SourceCredentialRepository } from "../contracts/repository-port-narrowing.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 适配器工厂依赖 */
export interface AdapterFactoryDeps {
  app: FastifyInstance;
  ctx: AppContext;
  reverseAdapterConfig: ReverseFetchAdapterRuntimeConfig;
  tikhubVideoHotTimeoutMs: number;
  tikhubVideoHotPageSize: number;
  tikhubTimeoutMs: number;
  reverseStageOrder: string;
  resolveHotTrendVideoDateWindowHours: () => number;
}

/** 适配器工厂返回值 */
export interface AdapterFactory {
  buildReverseFetchOrchestrator: () => ReverseFetchOrchestrator;
  buildSquareTrendVideoResolveOrchestrator: () => ReverseFetchOrchestrator;
  buildDouhotAdapter: () => DouhotAdapter;
  buildTikHubVideoAdapter: (tokenOverride?: string | null, hotTrendToken?: string | null) => TikHubTrendAdapter;
  buildTikHubRealtimeAdapter: (tokenOverride?: string | null, hotTrendToken?: string | null) => TikHubTrendAdapter;
  resolveTikHubTokenForUser: (userId: string) => Promise<string | null>;
  resolveTikHubTokenForHotTrends: () => Promise<string | null>;
  resolveTikHubProviderSecret: () => Promise<string | null>;
  resolveLatestSourceCredentialSecret: (scope: SourceCredentialScope, provider?: string) => Promise<string | null>;
  resolveDouhotEndpointForHotTrends: () => string | null;
  resolveHotTrendVideoDateWindowHours: () => number;
  credentialService: ReturnType<typeof createDefaultReverseFetchAdapters>["credentials"];
}

// ---------------------------------------------------------------------------
// 适配器工厂
// ---------------------------------------------------------------------------

export function createAdapterFactory(deps: AdapterFactoryDeps): AdapterFactory {
  const { app, ctx, reverseAdapterConfig, tikhubVideoHotTimeoutMs, tikhubVideoHotPageSize, tikhubTimeoutMs, reverseStageOrder, resolveHotTrendVideoDateWindowHours } = deps;

  // 窄接口桥接
  const sourceCredentialRepo: SourceCredentialRepository = {
    generateId: () => ctx.clock.generateId(),
    now: () => ctx.clock.now(),
    sourceCredentials: ctx.repos.sourceCredentials,
  };

  const orchestratorRepo: ReverseFetchOrchestratorRepository = {
    generateId: () => ctx.clock.generateId(),
    now: () => ctx.clock.now(),
    reverseTraces: ctx.repos.reverseTraces,
    reverseAttempts: ctx.repos.reverseAttempts,
  };

  const reverseFetchRuntime = createDefaultReverseFetchAdapters(
    sourceCredentialRepo,
    ctx.auditStore,
    ctx.configService.get(),
    reverseAdapterConfig,
  );

  const credentialService = reverseFetchRuntime.credentials;

  const resolveRuntimeStageOrder = () =>
    resolveReverseFetchStageOrder(reverseStageOrder);

  const buildReverseFetchOrchestrator = () => {
    const runtime = createDefaultReverseFetchAdapters(
      sourceCredentialRepo,
      ctx.auditStore,
      ctx.configService.get(),
      reverseAdapterConfig,
    );
    return new ReverseFetchOrchestrator(orchestratorRepo, runtime.adapters, resolveRuntimeStageOrder());
  };

  const buildSquareTrendVideoResolveOrchestrator = () => {
    const runtime = createDefaultReverseFetchAdapters(sourceCredentialRepo, ctx.auditStore, {
      ...ctx.configService.get(),
      reverseExternalApiPriority: resolveSquareTrendVideoReversePriority(),
    }, reverseAdapterConfig);
    return new ReverseFetchOrchestrator(
      orchestratorRepo,
      runtime.adapters,
      resolveReverseFetchStageOrder("S5_EXTERNAL_API,S6_LOCAL_FILE"),
    );
  };

  const resolveTikHubTokenForUserBound = (userId: string) =>
    resolveTikHubTokenForUser(credentialService, userId);

  const resolveTikHubTokenForHotTrendsBound = () =>
    resolveTikHubTokenForHotTrends({ ctx, credentialService, runtimeConfig: { reverse: { tikhubTimeoutMs, tikhubVideoHotTimeoutMs, tikhubVideoHotPageSize, stageOrder: reverseStageOrder } as any } });

  const resolveDouhotEndpointForHotTrendsBound = () => resolveDouhotEndpointForHotTrends(ctx);

  const buildDouhotAdapter = () =>
    new DouhotAdapter(credentialService, resolveDouhotEndpointForHotTrendsBound());

  const buildTikHubVideoAdapter = (tokenOverride?: string | null, hotTrendToken?: string | null) =>
    new TikHubTrendAdapter(
      ctx.configService.get().tikhubVideoHotApiUrl?.trim() || null,
      tokenOverride?.trim() || (hotTrendToken ?? null),
      tikhubVideoHotTimeoutMs,
      "TikHub 视频热榜",
      "POST",
      {
        pageSize: tikhubVideoHotPageSize,
        page: VIDEO_HOT_TREND_FETCH_CONTRACT.page,
        dateWindow: resolveHotTrendVideoDateWindowHours(),
      },
    );

  const buildTikHubRealtimeAdapter = (tokenOverride?: string | null, hotTrendToken?: string | null) =>
    new TikHubTrendAdapter(
      ctx.configService.get().tikhubRealtimeHotApiUrl?.trim() || null,
      tokenOverride?.trim() || (hotTrendToken ?? null),
      tikhubTimeoutMs,
      "TikHub 实时热榜",
      "GET",
    );

  return {
    buildReverseFetchOrchestrator,
    buildSquareTrendVideoResolveOrchestrator,
    buildDouhotAdapter,
    buildTikHubVideoAdapter,
    buildTikHubRealtimeAdapter,
    resolveTikHubTokenForUser: resolveTikHubTokenForUserBound,
    resolveTikHubTokenForHotTrends: resolveTikHubTokenForHotTrendsBound,
    resolveTikHubProviderSecret: () => resolveTikHubProviderSecret(ctx),
    resolveLatestSourceCredentialSecret: (scope, provider) => resolveLatestSourceCredentialSecret(ctx, scope, provider),
    resolveDouhotEndpointForHotTrends: resolveDouhotEndpointForHotTrendsBound,
    resolveHotTrendVideoDateWindowHours,
    credentialService,
  };
}
```

- [ ] **步骤 2：编译验证**

运行：`npm run build`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/modules/adapter-factory.ts
git commit -m "feat: 创建适配器工厂模块 adapter-factory.ts"
```

---

### 任务 2：创建项目路由处理器模块

**文件：**
- 创建：`src/routes/project-flow-route-handlers.ts`

- [ ] **步骤 1：创建 project-flow-route-handlers.ts 文件**

```typescript
/**
 * project-flow-route-handlers.ts
 *
 * 从 app.ts 提取的项目 CRUD 路由处理器：
 * 创建、重命名、删除项目，保存/获取工作流状态等。
 */

import type { FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type {
  User,
  UploadSlot,
  ProjectWorkflowStateRecord,
  LibraryCharacter,
  CharacterViewKey,
} from "../contracts/types.js";
import type { DressedupHelpersDeps } from "../modules/dressedup-character-helpers.js";
import { requireUser } from "../services/auth/route-guards.js";
import { toPlainRecord } from "../services/utils/json-utils.js";
import { sanitizeWorkflowStateProjectData } from "../workflow-state-persistence-sanitizer.js";
import { resolveProjectLastStep } from "../contracts/project-last-step.js";
import { createEmptyProjectStepSnapshot } from "../contracts/project-step-snapshot.js";
import {
  buildProjectPageContentSnapshot,
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
  listLocalObjectStorageImageUrlsByPrefix,
  hydrateCharacterViewSessionCandidatesFromStorage,
} from "../modules/dressedup-character-helpers.js";
import {
  buildStep2DressedupAllInOneSlotStoragePrefix,
} from "../modules/step2-dressedup-storage-prefix.js";
import { pickLatestCandidate } from "../modules/character-view-session.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ProjectFlowRouteHandlersDeps {
  ctx: AppContext;
  dressedupHelpersDeps: DressedupHelpersDeps;
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

const buildProjectStepState = (
  projectData: Record<string, unknown> | null,
): ProjectWorkflowStateRecord["stepState"] => ({
  step1: pickProjectStepState(projectData, [
    "uploads",
    "uploadLibraryAssetIds",
    "step1OutfitModules",
    "generatedOutfits",
    "outfitAnalysisCards",
    "step1RoleDirectionCards",
    "outfitAnalysisStatusMessage",
    "outfitRecommendationTaskId",
    "outfitRecommendationTaskStatus",
    "selectedOutfitId",
    "selectedOutfitSource",
    "step1SelectedRoleDirectionId",
    "step1Step2Ready",
    "step1HiddenRoleSettingPrompt",
    "step1AdminDebugPrompt",
    "step1RoleDirectionDrawerOpen",
    "outfitSummary",
  ]),
  step2: pickProjectStepState(projectData, [
    "selectedModelId",
    "confirmedModel",
    "step2V2ConfirmedCandidateId",
    "step2V2GeneratedCandidateUrls",
    "step2CharacterViews",
    "step2StyledViews",
    "step2PreviewGenerationStarted",
    "selectedPreviewImageUrl",
    "step2V2ActivePreviewSource",
    "step2V2ActiveGeneratedCandidateId",
    "step2V2ActiveLibraryCandidateId",
    "outfitSummary",
  ]),
  step3: pickProjectStepState(projectData, [
    "script",
    "step3OriginalScriptSegments",
    "step3RewrittenScriptSegments",
    "step3RewriteMeta",
    "pendingScriptImport",
    "step3CharacterReferencePool",
    "step3SceneReferences",
    "step3PreviewCandidatesByFrame",
    "step3PreviewJobsByFrame",
  ]),
  step4: pickProjectStepState(projectData, ["script"]),
  step5: pickProjectStepState(projectData, ["clipStatuses"]),
  step6: pickProjectStepState(projectData, ["clipStatuses"]),
  step7: pickProjectStepState(projectData, []),
});

// ---------------------------------------------------------------------------
// 路由处理器
// ---------------------------------------------------------------------------

export function createProjectRouteHandlers(deps: ProjectFlowRouteHandlersDeps) {
  const { ctx, dressedupHelpersDeps } = deps;

  const createProjectRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as { name?: unknown } | undefined) ?? {};
    const rawName = body.name;
    const projectName =
      typeof rawName === "string"
        ? rawName
        : rawName && typeof rawName === "object" && typeof (rawName as { name?: unknown }).name === "string"
          ? String((rawName as { name: string }).name)
          : "";
    const created = await ctx.projectService.createProject(user, projectName);
    return created;
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

  const updateProjectLastStepRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { step?: number };
    const project = await ctx.projectService.updateLastVisitedStep(user, params.projectId, Number(body.step ?? 1));
    return {
      id: project.id,
      lastVisitedStep: project.lastVisitedStep,
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
      projectData?: unknown;
    } | undefined) ?? {};
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const normalizedStep = resolveProjectLastStep(project.lastVisitedStep, {
      step: Number(body.step ?? project.lastVisitedStep ?? 1),
      trigger: "route-enter",
    });
    const workflow = toPlainRecord(body.workflow);
    const projectData = sanitizeWorkflowStateProjectData(toPlainRecord(body.projectData));
    const workflowProjectName = typeof workflow?.projectName === "string" ? workflow.projectName.trim() : "";
    if (workflowProjectName.length > 0 && workflowProjectName !== project.name) {
      project.name = workflowProjectName;
    }
    project.lastVisitedStep = normalizedStep;
    project.updatedAt = ctx.clock.now();

    const existing = await ctx.repos.workflowStates.findById(project.id);
    const now = ctx.clock.now();
    const backgroundGenerationTask = normalizeProjectBackgroundGenerationTaskState({
      value:
        projectData &&
        typeof projectData.backgroundGenerationTask === "object" &&
        projectData.backgroundGenerationTask !== null &&
        !Array.isArray(projectData.backgroundGenerationTask)
          ? projectData.backgroundGenerationTask
          : null,
      previous:
        existing?.backgroundGenerationTask ??
        createEmptyProjectBackgroundGenerationTaskState(existing?.updatedAt ?? null),
    });
    const pageContentSnapshot = buildProjectPageContentSnapshot({
      projectData,
      workflow,
      stepState: existing?.stepState ?? null,
      previous: existing?.pageContentSnapshot ?? null,
      updatedAt: now,
    });
    const persisted: ProjectWorkflowStateRecord = {
      id: existing?.id ?? project.id,
      projectId: project.id,
      userId: user.id,
      lastVisitedStep: normalizedStep,
      workflow,
      projectData,
      snapshotVersion: PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
      pageContentSnapshot,
      backgroundGenerationTask,
      stepState: buildProjectStepState(projectData),
      updatedAt: now,
    };
    await ctx.repos.workflowStates.upsert(persisted);
    return {
      id: persisted.id,
      projectId: persisted.projectId,
      lastVisitedStep: persisted.lastVisitedStep,
      updatedAt: persisted.updatedAt,
    };
  };

  const getProjectResumeSnapshotRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const persistedWorkflowState = await ctx.repos.workflowStates.findById(project.id);
    const persistedPageContentSnapshot = persistedWorkflowState
      ? normalizeProjectPageContentSnapshot({
          value: persistedWorkflowState.pageContentSnapshot,
          projectData: persistedWorkflowState.projectData,
          workflow: persistedWorkflowState.workflow,
          stepState: persistedWorkflowState.stepState,
          updatedAt: persistedWorkflowState.updatedAt,
        })
      : null;
    const persistedBackgroundGenerationTask = persistedWorkflowState
      ? normalizeProjectBackgroundGenerationTaskState({
          value: persistedWorkflowState.backgroundGenerationTask,
          previous: createEmptyProjectBackgroundGenerationTaskState(persistedWorkflowState.updatedAt),
        })
      : null;

    const toUiSlot = (slot: UploadSlot): "top" | "bottom" | "shoes" | "acc" => (
      slot === "accessory" ? "acc" : slot
    );

    const uploads = await Promise.all([...await ctx.repos.assets.list()]
      .filter((item) => item.projectId === project.id && item.userId === user.id)
      .map(async (item) => {
        const linked = item.libraryAssetId ? await ctx.repos.libraryAssets.findById(item.libraryAssetId) : null;
        return {
          id: item.id,
          slot: item.slot,
          fileName: item.fileName,
          sizeMb: item.sizeMb,
          libraryAssetId: item.libraryAssetId,
          url: linked?.url ?? null,
        };
      }));

    const uploadsBySlot: Record<"top" | "bottom" | "shoes" | "acc", string | null> = {
      top: null,
      bottom: null,
      shoes: null,
      acc: null,
    };
    const uploadLibraryAssetIds: Record<"top" | "bottom" | "shoes" | "acc", string | null> = {
      top: null,
      bottom: null,
      shoes: null,
      acc: null,
    };
    for (const upload of uploads) {
      const uiSlot = toUiSlot(upload.slot);
      uploadsBySlot[uiSlot] = upload.url;
      uploadLibraryAssetIds[uiSlot] = upload.libraryAssetId;
    }
    const persistedStep1Snapshot = toPlainRecord(persistedPageContentSnapshot?.step1 ?? null);
    const persistedUploadsBySlot = toPlainRecord(persistedStep1Snapshot?.uploads ?? null);
    const persistedUploadLibraryAssetIds = toPlainRecord(persistedStep1Snapshot?.uploadLibraryAssetIds ?? null);
    for (const slot of ["top", "bottom", "shoes", "acc"] as const) {
      if (!uploadsBySlot[slot]) {
        const candidate = persistedUploadsBySlot?.[slot];
        uploadsBySlot[slot] = typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
      }
      if (!uploadLibraryAssetIds[slot]) {
        const candidate = persistedUploadLibraryAssetIds?.[slot];
        uploadLibraryAssetIds[slot] =
          typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
      }
    }

    const userLibraryAssets = new Map(
      [...await ctx.repos.libraryAssets.list()]
        .filter((item) => item.userId === user.id)
        .map((item) => [item.id, item] as const),
    );

    const resolveOutfitItems = (assetIds: string[]) => {
      const next = {
        top: uploadsBySlot.top,
        bottom: uploadsBySlot.bottom,
        shoes: uploadsBySlot.shoes,
        acc: uploadsBySlot.acc,
      };
      for (const assetId of assetIds) {
        const asset = userLibraryAssets.get(assetId);
        if (!asset) continue;
        if (asset.category === "top") {
          next.top = asset.url;
          continue;
        }
        if (asset.category === "bottom") {
          next.bottom = asset.url;
          continue;
        }
        if (asset.category === "shoes") {
          next.shoes = asset.url;
          continue;
        }
        if (asset.category === "accessory") {
          next.acc = asset.url;
        }
      }
      return next;
    };

    const outfitPlans = [...await ctx.repos.outfitPlans.list()]
      .filter((item) => item.projectId === project.id && item.userId === user.id)
      .sort((a, b) => a.index - b.index)
      .map((item) => ({
        id: item.id,
        index: item.index,
        title: item.title ?? null,
        reason: item.reason ?? null,
        assetIds: item.assetIds,
        items: resolveOutfitItems(item.assetIds),
      }));

    const characterPreviews = [...await ctx.repos.characterPreviews.list()]
      .filter((item) => item.projectId === project.id && item.userId === user.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        presetId: item.presetId,
        imageUrl: item.imageUrl,
        label: item.label ?? null,
        sourceImageUrl: item.sourceImageUrl ?? null,
        viewKey: item.viewKey ?? null,
      }));

    const selectedPreview = project.selectedCharacterPreviewId
      ? characterPreviews.find((item) => item.id === project.selectedCharacterPreviewId) ?? null
      : null;
    const dressedupWarehouseCharacter = await resolveLatestDressedupWarehouseCharacterForProject(ctx, user.id, project.id);
    if (dressedupWarehouseCharacter) {
      await hydrateCharacterViewSessionCandidatesFromStorage(dressedupHelpersDeps, dressedupWarehouseCharacter);
    }
    const confirmedCharacterReferences = collectConfirmedCharacterReferencesFromWarehouse(dressedupWarehouseCharacter);
    const step2V2GeneratedCandidateUrls = await Promise.all(
      ([1, 2, 3] as const).map(async (slot) => {
        const prefix = buildStep2DressedupAllInOneSlotStoragePrefix(project, slot);
        const candidates = await listLocalObjectStorageImageUrlsByPrefix(dressedupHelpersDeps, prefix);
        return pickLatestCandidate(candidates) ?? "";
      }),
    );

    const latestScript = await ctx.scriptService.latestVersion(project.id);
    const scriptText = latestScript?.payload.basicInfo?.trim() ?? "";
    const segmentCount = scriptText
      ? scriptText.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean).length
      : 0;

    const storyboardFrames = [...await ctx.repos.storyboardFrames.list()]
      .filter((item) => item.projectId === project.id)
      .sort((a, b) => a.index - b.index)
      .map((item) => ({
        id: item.id,
        index: item.index,
        imageUrl: item.imageUrl,
        variants: item.variants ?? [],
        selectedVariantIndex: item.selectedVariantIndex ?? 0,
      }));

    const latestVideoJob = [...await ctx.repos.videoJobs.list()]
      .filter((item) => item.projectId === project.id && item.userId === user.id)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;

    const latestFission = [...await ctx.repos.fissionResults.list()]
      .filter((item) => item.projectId === project.id)
      .sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;

    const snapshot = createEmptyProjectStepSnapshot(project.id);
    snapshot.updatedAt = ctx.clock.now();
    snapshot.lastVisitedStep = resolveProjectLastStep(project.lastVisitedStep, {
      step: persistedWorkflowState?.lastVisitedStep ?? project.lastVisitedStep ?? 1,
      trigger: "resume-open",
    });
    snapshot.steps.step1.uploadLibraryAssetIds = uploadLibraryAssetIds;
    snapshot.steps.step1.selectedOutfitPlanId = project.selectedOutfitPlanId;
    snapshot.steps.step1.selectedOutfitSource = project.selectedOutfitPlanId ? "visual" : null;
    snapshot.steps.step1.outfitSummary = null;
    snapshot.steps.step2.selectedModelId = selectedPreview?.presetId ?? null;
    snapshot.steps.step2.selectedPreviewId = project.selectedCharacterPreviewId;
    snapshot.steps.step2.confirmedModel = Boolean(project.selectedCharacterPreviewId);
    snapshot.steps.step2.styledViewIds = characterPreviews.map((item) => item.id);
    snapshot.steps.step3.scriptVersionId = latestScript?.id ?? null;
    snapshot.steps.step3.scriptText = scriptText || null;
    snapshot.steps.step3.segmentCount = segmentCount;
    snapshot.steps.step4.frameIds = storyboardFrames.map((item) => item.id);
    snapshot.steps.step4.frameCount = storyboardFrames.length;
    const latestJobDeclaredClipCount = Number(latestVideoJob?.totalClipCount ?? 0);
    const latestJobPromptCount = Array.isArray(latestVideoJob?.clipPrompts)
      ? latestVideoJob?.clipPrompts.length
      : 0;
    const latestJobVideoCount = Array.isArray(latestVideoJob?.videoUrls)
      ? latestVideoJob?.videoUrls.length
      : 0;
    const latestStep5ClipCount = Math.max(
      storyboardFrames.length,
      latestJobDeclaredClipCount,
      latestJobPromptCount,
      latestJobVideoCount,
      0,
    );
    const latestStep5CompletedClipCount = Math.max(
      0,
      Math.min(
        latestStep5ClipCount,
        Number(
          latestVideoJob?.completedClipCount ??
            (latestVideoJob?.status === "succeeded" ? latestStep5ClipCount : 0),
        ),
      ),
    );
    snapshot.steps.step5.latestJobId = latestVideoJob?.id ?? null;
    snapshot.steps.step5.clipCount = latestStep5ClipCount;
    snapshot.steps.step5.completedClipCount = latestStep5CompletedClipCount;
    snapshot.steps.step6.variantCount = latestFission?.variants.length ?? 0;
    snapshot.steps.step6.hasVariants = Boolean((latestFission?.variants.length ?? 0) > 0);
    if (latestScript) {
      const latestReview = [...await ctx.repos.reviewRequests.list()]
        .filter((item) => item.userId === user.id && item.resourceId === latestScript.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
      snapshot.steps.step7.reviewId = latestReview?.id ?? null;
    }
    snapshot.steps.step7.exportUrl = null;

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        lastVisitedStep: snapshot.lastVisitedStep,
        lastReverseTaskId: project.lastReverseTaskId,
        lastReverseScriptVersionId: project.lastReverseScriptVersionId,
      },
      persistedWorkflowState:
        persistedWorkflowState && persistedWorkflowState.userId === user.id
          ? {
              id: persistedWorkflowState.id,
              projectId: persistedWorkflowState.projectId,
              lastVisitedStep: persistedWorkflowState.lastVisitedStep,
              workflow: persistedWorkflowState.workflow,
              projectData: persistedWorkflowState.projectData,
              snapshotVersion:
                typeof persistedWorkflowState.snapshotVersion === "string" &&
                  persistedWorkflowState.snapshotVersion.trim().length > 0
                  ? persistedWorkflowState.snapshotVersion
                  : persistedPageContentSnapshot?.contractVersion ?? PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
              pageContentSnapshot: persistedPageContentSnapshot,
              backgroundGenerationTask: persistedBackgroundGenerationTask,
              stepState: persistedWorkflowState.stepState,
              updatedAt: persistedWorkflowState.updatedAt,
            }
          : null,
      state: {
        uploads,
        uploadsBySlot,
        uploadLibraryAssetIds,
        outfitPlans,
        selectedOutfitPlanId: project.selectedOutfitPlanId,
        characterPreviews,
        selectedCharacterPreviewId: project.selectedCharacterPreviewId,
        selectedPreviewImageUrl: selectedPreview?.imageUrl ?? null,
        step2V2GeneratedCandidateUrls,
        confirmedCharacterReferences,
        latestScript: latestScript
          ? {
              id: latestScript.id,
              version: latestScript.version,
              sourceType: latestScript.sourceType,
              durationSec: latestScript.durationSec,
              payload: latestScript.payload,
            }
          : null,
        storyboardFrames,
        latestVideoJob: latestVideoJob
          ? {
              id: latestVideoJob.id,
              status: latestVideoJob.status,
              attempts: latestVideoJob.attempts,
              durationMinutes: latestVideoJob.durationMinutes,
              startedAt: latestVideoJob.startedAt,
              totalClipCount: latestVideoJob.totalClipCount ?? null,
              completedClipCount: latestVideoJob.completedClipCount ?? 0,
              clipPrompts: latestVideoJob.clipPrompts ?? [],
              clipImageUrls: latestVideoJob.clipImageUrls ?? [],
              videoUrls: latestVideoJob.videoUrls ?? [],
              externalTaskIds: latestVideoJob.externalTaskIds ?? [],
              providerId: latestVideoJob.providerId ?? null,
              model: latestVideoJob.model ?? null,
              error: latestVideoJob.error ?? null,
            }
          : null,
        latestFission: latestFission
          ? {
              id: latestFission.id,
              variants: latestFission.variants,
            }
          : null,
      },
      snapshot,
    };
  };

  const deleteProjectRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    ctx.projectService.deleteProject(user, params.projectId);
    return { ok: true };
  };

  const uploadProjectAssetsRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as {
      files: Array<{ slot: UploadSlot; fileName: string; sizeMb: number; libraryAssetId?: string }>;
    };
    return { assets: await ctx.uploadService.upload(user, params.projectId, body.files) };
  };

  const updateProjectUploadSlotRoute = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; assetId: string };
    const body = request.body as { slot: UploadSlot };
    return { asset: await ctx.uploadService.updateSlot(user, params.projectId, params.assetId, body.slot) };
  };

  return {
    createProjectRoute,
    renameProjectRoute,
    updateProjectLastStepRoute,
    saveProjectWorkflowStateRoute,
    getProjectResumeSnapshotRoute,
    deleteProjectRoute,
    uploadProjectAssetsRoute,
    updateProjectUploadSlotRoute,
  };
}
```

- [ ] **步骤 2：编译验证**

运行：`npm run build`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/routes/project-flow-route-handlers.ts
git commit -m "feat: 创建项目路由处理器模块 project-flow-route-handlers.ts"
```

---

### 任务 3：提取 toAdminScriptItem 辅助函数

**文件：**
- 创建：`src/routes/admin-helpers.ts`

- [ ] **步骤 1：创建 admin-helpers.ts 文件**

```typescript
/**
 * admin-helpers.ts
 *
 * 从 app.ts 提取的管理员辅助函数。
 */

import type { LibraryScript } from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";

export async function toAdminScriptItem(
  ctx: AppContext,
  item: LibraryScript,
): Promise<{
  id: string;
  title: string;
  tags: string[];
  content: string;
  ownerId: string;
  ownerEmail: string;
  date: number;
  status: string;
  currentVersion: number;
}> {
  const owner = await ctx.repos.users.findById(item.userId);
  return {
    id: item.id,
    title: item.title,
    tags: item.tags,
    content: item.content,
    ownerId: item.userId,
    ownerEmail: owner?.email ?? "unknown",
    date: item.updatedAt,
    status: item.currentVersion > 1 ? "generated" : "draft",
    currentVersion: item.currentVersion,
  };
}
```

- [ ] **步骤 2：编译验证**

运行：`npm run build`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin-helpers.ts
git commit -m "feat: 创建管理员辅助函数模块 admin-helpers.ts"
```

---

### 任务 4：重构 app.ts 使用新模块

**文件：**
- 修改：`src/app.ts`

- [ ] **步骤 1：删除适配器构建函数（903-954 行）**

删除 buildReverseFetchOrchestrator、buildSquareTrendVideoResolveOrchestrator、buildDouhotAdapter、buildTikHubVideoAdapter、buildTikHubRealtimeAdapter 及相关绑定函数。

- [ ] **步骤 2：添加 adapter-factory 导入**

在导入部分添加：
```typescript
import { createAdapterFactory, type AdapterFactory } from "./modules/adapter-factory.js";
```

- [ ] **步骤 3：使用适配器工厂**

在 buildApp 中替换为：
```typescript
const adapterFactory = createAdapterFactory({
  app,
  ctx,
  runtimeConfig: {
    objectStorageDriver,
    objectStoragePublicBase,
    objectStorageLocalRoot,
    reverseAdapterConfig: reverseAdapterRuntimeConfig,
    tikhubVideoHotTimeoutMs: runtimeConfig.reverse.tikhubVideoHotTimeoutMs,
    tikhubVideoHotPageSize: runtimeConfig.reverse.tikhubVideoHotPageSize,
    tikhubTimeoutMs: runtimeConfig.reverse.tikhubTimeoutMs,
    reverseStageOrder: runtimeConfig.reverse.stageOrder,
  },
});
```

- [ ] **步骤 4：删除项目路由处理器（1364-1850 行）**

删除 createProjectRoute、renameProjectRoute、updateProjectLastStepRoute、pickProjectStepState、buildProjectStepState、saveProjectWorkflowStateRoute、getProjectResumeSnapshotRoute、deleteProjectRoute、uploadProjectAssetsRoute、updateProjectUploadSlotRoute。

- [ ] **步骤 5：添加 project-flow-route-handlers 导入**

```typescript
import { createProjectRouteHandlers } from "./routes/project-flow-route-handlers.js";
```

- [ ] **步骤 6：使用项目路由处理器**

替换 projectFlowRouteHandlers 定义为：
```typescript
const projectRouteHandlers = createProjectRouteHandlers({
  ctx,
  dressedupHelpersDeps,
});
```

- [ ] **步骤 7：删除 toAdminScriptItem（1210-1222 行）**

删除本地定义的 toAdminScriptItem 函数。

- [ ] **步骤 8：添加 admin-helpers 导入**

```typescript
import { toAdminScriptItem } from "./routes/admin-helpers.js";
```

- [ ] **步骤 9：更新 toAdminScriptItem 调用点**

将 `toAdminScriptItem(item)` 改为 `toAdminScriptItem(ctx, item)`。

- [ ] **步骤 10：删除未使用的导入**

移除不再需要的导入。

- [ ] **步骤 11：编译验证**

运行：`npm run build`
预期：无错误

- [ ] **步骤 12：验证行数**

运行：`wc -l src/app.ts`
预期：≤ 350 行

- [ ] **步骤 13：Commit**

```bash
git add src/app.ts
git commit -m "refactor: 重构 app.ts 使用提取的模块"
```

---

## 成功标准

- [ ] app.ts 行数 ≤ 350 行
- [ ] 编译通过，无类型错误
- [ ] 新模块编译通过
- [ ] 所有导出正确