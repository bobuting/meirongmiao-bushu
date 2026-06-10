/**
 * step3-candidate/index.ts
 * Step3 候选脚本路由
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ProjectRouteDeps } from "../project-route-shared.js";
import type { Step3ScriptCandidateSnapshot, ScriptCandidateEntity } from "../../contracts/step3-candidate-snapshot-contract.js";
import type { Project, User } from "../../contracts/types.js";
import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";

import { AppError } from "../../core/errors.js";
import { requireUser, requireAdmin } from "../../services/auth/route-guards.js";
import { toPlainRecord } from "../../services/utils/json-utils.js";
import { hasValidCharacterSelection } from "../video-step/step3.js";
import {
  startScriptsGenerationParent,
  type Step3ScriptJobType,
  ALL_SCRIPT_STRATEGIES,
  getAvailableStrategiesByAge,
  getAgeGroup,
  type AgeGroup,
} from "../../modules/step3-script-orchestrator.js";
import {
  getScriptsDataDbService,
  type InsertScriptDataItem,
  type VideoScriptPayload,
} from "../../service/scripts-data-db-service.js";
import { ScriptType, isVideoStatusBeyond, type VideoProjectStatus } from "../../contracts/types.js";
import { parseVideoScriptsContentsWithShots } from "../../modules/video-step/step3-video-script/content-parser.js";
import { rewriteScriptsWithLLM } from "../../modules/video-step/step3-video-script/script-rewriter.js";
import type { ScriptRewriterOutput } from "../../modules/video-step/step3-video-script/types.js";
import { rewriteProductShowcaseScriptsWithLLM } from "../../modules/video-step/step3-product-showcase/script-rewriter.js";
import {
  checkAndFinalizeParent,
  createAsyncJob,
  finalizeAsyncJob,
  findActiveJobByProjectAndType,
  findLatestJobByProjectAndType,
  getAsyncJob,
  getJobsByProjectId,
  updateAsyncJobStage,
  type AsyncJobRecord,
} from "../../service/async-job-service.js";
import type { ScoringJobInput, ScoringStrategy } from "../../modules/script-quality/scoring-types.js";
import { STRATEGY_PROMPT_CODE_MAP } from "../../modules/script-quality/scoring-types.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import { getLogger } from "../../core/logger/index.js";

const logger = getLogger("step3-candidate");
const log = logger;

// ---------------------------------------------------------------------------
// Step3Helpers：由 step3-candidate-helpers.ts 的 createStep3Helpers() 返回
// 使用 ReturnType 推导，避免维护额外接口
// ---------------------------------------------------------------------------
import { createStep3Helpers } from "../step3-candidate-helpers.js";
type Step3Helpers = ReturnType<typeof createStep3Helpers>;

// ---------------------------------------------------------------------------
// strategyType 到 ScriptType 的映射
// ---------------------------------------------------------------------------
const STRATEGY_TYPE_TO_SCRIPT_TYPE: Record<string, number> = {
  library: ScriptType.LIBRARY,
  video: ScriptType.VIDEO,
  realtime: ScriptType.REALTIME,
  effectiveness: ScriptType.EFFECTIVENESS,
  custom: ScriptType.CUSTOM,
  fashion: ScriptType.FASHION,
  emotion_archetype: ScriptType.EMOTION_ARCHETYPE,
  aesthetic: ScriptType.AESTHETIC,
  product_showcase: ScriptType.PRODUCT_SHOWCASE,
  story_theme: ScriptType.STORY_THEME,
  resonance: ScriptType.RESONANCE,
};

/**
 * strategyType 到 skillCode 的映射
 * 用于持久化时推断 source 字段
 */
const STRATEGY_TYPE_TO_SKILL_CODE: Record<string, string> = {
  video: "video_step3_script_generation",
  effectiveness: "script_effectiveness_generation",
  custom: "custom_scenario_script_generation",
  fashion: "fashion_script_generation",
  emotion_archetype: "emotion_archetype",
  aesthetic: "aesthetic_script_generation",
  product_showcase: "product_showcase_generation",
  story_theme: "story_theme_generation",
  resonance: "resonance_story_generation",
  // library 和 realtime 无 skillCode（来自数据库脚本库或用户实时输入）
};

/** 将 Step3 类型转为 nrm_async_jobs 的 job_type */
function toStep3JobType(type: Step3ScriptJobType): string {
  return `step3_${type}`;
}

/** 从 nrm_async_jobs 的 job_type 提取 Step3 类型 */
function fromStep3JobType(jobType: string): Step3ScriptJobType | null {
  if (!jobType.startsWith("step3_")) return null;
  return jobType.slice(6) as Step3ScriptJobType;
}

/**
 * 将 ScriptCandidateEntity 转换为 InsertScriptDataItem
 * 【统一改造】3 个类型共享同一套转换逻辑
 *
 * @param userId 用户 ID，候选脚本默认为空字符串（不显示在用户脚本中心）
 */
function convertSnapshotItemToScriptData(
  item: {
    candidateId: string;
    strategyType: string;
    title?: string | null;
    content?: string | null;
    sourceScriptId?: string | null;
    sourceUrl?: string | null;
    mainScene?: string | null;
    atmosphere?: string | null;
    videoStyle?: string | null;
    primaryEmotion?: string | null;
    emotionArc?: string | null;
    video_info?: unknown;
    video_analysis?: unknown;
    editing_analysis?: unknown;
    shot_breakdown?: unknown;
  },
  projectId: string,
  userId: string = "", // 候选脚本默认为空字符串，不显示在用户脚本中心
): InsertScriptDataItem {
  const type = STRATEGY_TYPE_TO_SCRIPT_TYPE[item.strategyType];
  if (type === undefined) {
    throw new Error(`[convertSnapshotItemToScriptData] Unknown strategyType: ${item.strategyType}, candidateId: ${item.candidateId}`);
  }

  // 合并独立字段到 video_analysis 对象，确保 extractColumns 能提取到 DDL 列
  const mergedVideoAnalysis = {
    ...(item.video_analysis && typeof item.video_analysis === "object" ? item.video_analysis as Record<string, unknown> : {}),
    ...(item.videoStyle ? { video_style: item.videoStyle } : {}),
    ...(item.primaryEmotion ? { primary: item.primaryEmotion } : {}),
    ...(item.emotionArc ? { emotion_arc: item.emotionArc } : {}),
  };

  const payload = {
    video_info: item.video_info ?? undefined,
    video_analysis: Object.keys(mergedVideoAnalysis).length > 0 ? mergedVideoAnalysis : undefined,
    editing_analysis: item.editing_analysis ?? undefined,
    shot_breakdown: item.shot_breakdown ?? undefined,
    main_scene: item.mainScene,
    atmosphere: item.atmosphere,
  } as VideoScriptPayload;

  return {
    id: item.candidateId,
    type,
    payloadJson: payload,
    skillCode: STRATEGY_TYPE_TO_SKILL_CODE[item.strategyType],
    sourceScriptId: item.sourceScriptId,
    projectId,
    userId,
    sourceOssUrl: item.sourceUrl,
  };
}

/**
 * 批量保存 Step3 脚本数据到数据库
 * 候选脚本的 userId 设置为空字符串，不显示在用户脚本中心
 * userId 参数仅用于后续的评分任务入队（审计记录）
 */
export async function saveStep3ScriptsToDatabase(
  ctx: AppContext,
  snapshot: Step3ScriptCandidateSnapshot,
  projectId: string,
  userId: string,
): Promise<void> {
  // 候选脚本 userId 为空字符串，不显示在用户脚本中心
  const items = snapshot.items
    .map((item) => convertSnapshotItemToScriptData(item, projectId, ""));

  if (items.length === 0) {
    return;
  }

  const service = getScriptsDataDbService(ctx.repos);
  const insertedCount = await service.batchInsertIfNotExists(items);

}

// ===========================================================================
// 反推脚本改写执行器工厂（供 executor 调用）
// ===========================================================================

type ReverseRewriteExecutorFn = (params: { pool: Pool; jobId: string; projectId: string; userId: string; dispatcher?: import("../../modules/queue-dispatcher.js").QueueDispatcher }) => Promise<void>;

let _reverseRewriteExecutor: ReverseRewriteExecutorFn | null = null;

/** 获取反推脚本改写执行器（供 executor registry 调用） */
export function getReverseRewriteExecutor(): ReverseRewriteExecutorFn | null {
  return _reverseRewriteExecutor;
}

/** 创建反推脚本改写执行器 */
export function createReverseRewriteExecutor(
  ctx: AppContext,
  helpers: Step3Helpers,
): (params: { pool: Pool; jobId: string; projectId: string; userId: string; dispatcher?: import("../../modules/queue-dispatcher.js").QueueDispatcher }) => Promise<void> {
  const {
    convertPayloadToSnapshotItem,
    persistStep3RewriteResultToProjectData,
    upsertStep3ProjectStoryboardMirror,
    normalizeStep3StoryboardSegmentForImport,
  } = helpers;

  return async (params: { pool: Pool; jobId: string; projectId: string; userId: string; dispatcher?: import("../../modules/queue-dispatcher.js").QueueDispatcher }): Promise<void> => {
    const { jobId, projectId, userId, dispatcher } = params;
    const repos = ctx.repos;
    const now = ctx.clock.now();

    try {
      await updateAsyncJobStage(repos, jobId, "解析脚本", now);

      const project = await ctx.projectService.requireOwnerProject({ id: userId } as User, projectId);
      if (!project.reverseScriptId) {
        throw new AppError(404, "NO_REVERSE_SCRIPT", "项目未关联反推脚本");
      }

      const scriptsService = getScriptsDataDbService(ctx.repos);
      const libraryScriptId = project.reverseScriptId;
      const dbScript = await scriptsService.getById(libraryScriptId);
      if (!dbScript) {
        throw new AppError(404, "SCRIPT_NOT_FOUND", "反推脚本在数据库中不存在");
      }

      await updateAsyncJobStage(repos, jobId, "LLM 改写", now);

      const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [dbScript]);
      const candidate = convertPayloadToSnapshotItem(dbScript, dbScript.id, undefined, parsedScripts[0]?.parsed?.shot_breakdown);
      if (!candidate) {
        throw new AppError(500, "CONVERT_FAILED", "脚本转换失败");
      }

      const projectContext = await ctx.projectContextService.getProjectContext(project.id);

      // 根据脚本策略类型选择改写器
      const strategyType = candidate.strategyType;
      let llmResults: ScriptRewriterOutput[];

      if (strategyType === "product_showcase") {
        // 产品展示脚本使用专用改写器（兼容有模特/无模特/局部出镜三种镜头）
        llmResults = await rewriteProductShowcaseScriptsWithLLM(ctx, parsedScripts, project, projectContext);
      } else {
        // 其他策略类型使用通用视频脚本改写器
        llmResults = await rewriteScriptsWithLLM(ctx, parsedScripts, project, projectContext);
      }

      const llmResult = llmResults[0];
      if (!llmResult?.success || !llmResult.rewrittenContent?.shot_breakdown) {
        throw new AppError(500, "LLM_REWRITE_FAILED", `LLM 改写失败: ${llmResult?.error || "无 shot_breakdown"}`);
      }

      const rewrittenShots = llmResult.rewrittenContent.shot_breakdown;
      const rewrittenSegments = rewrittenShots.map((shot: { audio?: { ambient_sound?: string }; shot_description?: string }, index: number) => {
        const ambientSound = shot.audio?.ambient_sound || "";
        const title = `镜头 ${index + 1}`;
        const content = ambientSound ? `环境音：${ambientSound}` : "";
        const visualCue = shot.shot_description || "";
        const visualPrompt = shot.shot_description || visualCue;
        return normalizeStep3StoryboardSegmentForImport({ title, content, visualCue, visualPrompt }, index);
      }).filter((s: { content: string }): s is { title: string; content: string; visualCue: string; visualPrompt: string } =>
        typeof s.content === "string" && s.content.trim().length > 0
      );

      await updateAsyncJobStage(repos, jobId, "保存脚本", now);

      const rewrittenScriptId = ctx.clock.generateId();
      const rewrittenContentText = rewrittenSegments.map((s: { content: string }) => s.content).filter(Boolean).join("\n").trim();
      // LLM 改写输出优先，原脚本数据补缺
      const llmContent = llmResult.rewrittenContent;
      const rewrittenPayload: VideoScriptPayload = {
        video_info: llmContent.video_info ?? candidate.video_info ?? undefined,
        video_analysis: (llmContent.video_analysis ?? candidate.video_analysis) as VideoScriptPayload["video_analysis"],
        editing_analysis: llmContent.editing_analysis ?? candidate.editing_analysis ?? undefined,
        shot_breakdown: rewrittenShots as VideoScriptPayload["shot_breakdown"],
        main_scene: llmContent.video_info?.main_scene ?? candidate.mainScene ?? undefined,
        atmosphere: llmContent.video_analysis?.atmosphere ?? candidate.atmosphere ?? undefined,
      };
      const rewrittenInsertItem: InsertScriptDataItem = {
        id: rewrittenScriptId,
        type: dbScript.type,
        payloadJson: rewrittenPayload,
        sourceScriptId: dbScript.sourceScriptId,
        projectId,
        userId: project.userId,
        sourceOssUrl: dbScript.sourceOssUrl,
        previousScriptId: libraryScriptId,
        isConfirmed: true,
      };
      await scriptsService.batchInsertIfNotExists([rewrittenInsertItem]);

      await scriptsService.clearProjectSelections(projectId);
      await scriptsService.setConfirmed(libraryScriptId);

      // 清空原脚本的 userId，避免在用户脚本中心重复显示
      // 原脚本作为反推来源，确认后不再属于任何用户，只保留重写后的脚本在用户脚本中心
      await ctx.repos.scriptData.clearUserId(libraryScriptId);

      await ctx.repos.userScriptAssocs.create({
        id: `ua-${rewrittenScriptId}-${project.userId}`,
        userId: project.userId,
        scriptDataId: rewrittenScriptId,
        title: candidate.title || dbScript.title || "重写脚本",
        tags: ["反推脚本"],
        source: "project_sync",
      });

      await scriptsService.setConfirmed(rewrittenScriptId);

      await persistStep3RewriteResultToProjectData({
        project, ownerUser: { id: userId } as User, snapshotId: `step3-${projectId}`,
        candidate,
        originalSegments: rewrittenSegments,
        rewrittenSegments,
        rewriteVersion: "llm-v1",
        profileHash: "",
        personalizationApplied: true,
      });

      upsertStep3ProjectStoryboardMirror({ project, ownerUser: { id: userId } as User, candidate, scriptSegments: rewrittenSegments });

      project.activeScriptId = rewrittenScriptId;
      project.status = "SCRIPT_CONFIRMED";
      await ctx.projectService.saveProject(project);

      await finalizeAsyncJob(repos, jobId, "completed", {
        scriptSegmentCount: rewrittenSegments.length,
        scriptDataId: rewrittenScriptId,
      }, null, ctx.clock.now(), dispatcher);

    } catch (err) {
      const error = err instanceof AppError ? err : new AppError(500, "UNKNOWN", String(err));
      logger.error({ jobId, error: error.message }, "反推脚本改写失败");
      await finalizeAsyncJob(repos, jobId, "failed", null, {
        code: error.code,
        message: error.message,
      }, ctx.clock.now(), dispatcher);

      // 【修复】失败时检查父任务是否需要自动完成
      const job = await getAsyncJob(repos, jobId, () => ctx.clock.now());
      if (job?.parentJobId && dispatcher) {
        await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
      }
    }
  };
}

// ===========================================================================
// 路由注册
// ===========================================================================

/**
 * 注册 Step3 候选脚本路由
 */
export function registerStep3CandidateRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
  helpers: Step3Helpers,
): void {
  const {
    convertPayloadToSnapshotItem,
    buildStep3AppliedCandidateSegments,
    persistStep3RewriteResultToProjectData,
    upsertStep3ProjectStoryboardMirror,
    normalizeStep3StoryboardSegmentForImport,
  } = helpers;

  // =========================================================================
  // 反推脚本异步改写执行器（独立导出函数，供 executor 调用）
  // =========================================================================
  const reverseRewriteExecutor = createReverseRewriteExecutor(ctx, helpers);
  _reverseRewriteExecutor = reverseRewriteExecutor; // 存储到全局变量，供 executor registry 访问

  // =========================================================================
  // Step3 脚本生成 Job 路由
  // =========================================================================

  /** 创建单个类型的脚本生成 job，后台异步执行（通过统一编排器） */
  const createScriptJobHandler = (type: Step3ScriptJobType) => async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { forceRefresh?: boolean } | undefined;
    const forceRefresh = body?.forceRefresh ?? false;
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 检查角色选择
    if (!await hasValidCharacterSelection(ctx, params.projectId)) {
      throw new AppError(400, "CHARACTER_NOT_SELECTED", "请先完成角色选择");
    }

    // 检查是否已确认脚本
    const scriptsService = getScriptsDataDbService(ctx.repos);
    const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);
    if (confirmedScript) {
      throw new AppError(409, "STEP3_CANDIDATE_LOCKED", "脚本已锁定，无法重新生成");
    }

    const step3JobType = toStep3JobType(type);

    // forceRefresh 模式：删除旧 job，允许创建新 job 重新生成
    if (forceRefresh) {
      // 删除旧 job 记录（脚本数据保留，新生成的脚本会追加）
      await ctx.repos.asyncJobs.deleteByProjectIdAndJobType(params.projectId, step3JobType);
    } else {
      // 正常模式：防重复检查
      const existingJob = await findActiveJobByProjectAndType(ctx.repos, params.projectId, step3JobType);
      if (existingJob) {
        return { jobId: existingJob.id, status: existingJob.status, type };
      }

      // 检查是否有 user-retry 状态的 job，如果有则重新执行
      const latestJob = await findLatestJobByProjectAndType(ctx.repos, params.projectId, step3JobType);
      if (latestJob && latestJob.status === "expired") {
        // 旧 job 已过期，创建新的
      } else if (latestJob) {
        // 非 expired 状态的旧 job 不自动重试，返回最新状态
        return { jobId: latestJob.id, status: latestJob.status, type };
      }
    }

    // 创建 nrm_async_jobs 记录，jobId 由并发控制服务统一生成
    const now = ctx.clock.now();
    const createResult = await createAsyncJob(ctx.repos, {
      userId: user.id,
      jobType: step3JobType,
      input: JSON.stringify({ type }),
      projectId: params.projectId,
      now,
      initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
    }, ctx.globalTaskConcurrencyService);

    if ("error" in createResult) {
      throw new AppError(429, createResult.errorCode, createResult.error);
    }

    const jobId = createResult.jobId;

    // 由 QueueDispatcher 统一调度执行，路由层不手动触发

    return { jobId, status: createResult.running ? "running" : "queued", queuePosition: createResult.queuePosition, type };
  };

  // POST /projects/:projectId/step3/candidates/library
  app.post("/projects/:projectId/step3/candidates/library", createScriptJobHandler("library"));

  // POST /projects/:projectId/step3/candidates/video
  app.post("/projects/:projectId/step3/candidates/video", createScriptJobHandler("video"));

  // POST /projects/:projectId/step3/candidates/realtime
  app.post("/projects/:projectId/step3/candidates/realtime", createScriptJobHandler("realtime"));

  // POST /projects/:projectId/step3/candidates/effectiveness
  app.post("/projects/:projectId/step3/candidates/effectiveness", createScriptJobHandler("effectiveness"));

  // POST /projects/:projectId/step3/candidates/custom
  app.post("/projects/:projectId/step3/candidates/custom", createScriptJobHandler("custom"));

  // POST /projects/:projectId/step3/candidates/fashion
  app.post("/projects/:projectId/step3/candidates/fashion", createScriptJobHandler("fashion"));

  // POST /projects/:projectId/step3/candidates/emotion_archetype
  app.post("/projects/:projectId/step3/candidates/emotion_archetype", createScriptJobHandler("emotion_archetype"));

  // POST /projects/:projectId/step3/candidates/aesthetic
  app.post("/projects/:projectId/step3/candidates/aesthetic", createScriptJobHandler("aesthetic"));

  // POST /projects/:projectId/step3/candidates/product_showcase
  app.post("/projects/:projectId/step3/candidates/product_showcase", createScriptJobHandler("product_showcase"));

  // POST /projects/:projectId/step3/candidates/story_theme
  app.post("/projects/:projectId/step3/candidates/story_theme", createScriptJobHandler("story_theme"));

  // POST /projects/:projectId/step3/candidates/resonance
  app.post("/projects/:projectId/step3/candidates/resonance", createScriptJobHandler("resonance"));

  // =========================================================================
  // POST /projects/:projectId/step3/candidates/generate-all
  // 批量创建所有策略脚本生成任务（父子任务模式）
  // =========================================================================
  app.post("/projects/:projectId/step3/candidates/generate-all", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { strategies?: Step3ScriptJobType[]; forceRefresh?: boolean } | undefined;
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 检查角色选择
    if (!await hasValidCharacterSelection(ctx, params.projectId)) {
      throw new AppError(400, "CHARACTER_NOT_SELECTED", "请先完成角色选择");
    }

    // 检查是否已确认脚本
    const scriptsService = getScriptsDataDbService(ctx.repos);
    const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);
    if (confirmedScript) {
      throw new AppError(409, "STEP3_CANDIDATE_LOCKED", "脚本已锁定，无法重新生成");
    }

    // ========== 查询角色年龄，选择可用策略 ==========
    const projectContext = await ctx.projectContextService.getProjectContext(params.projectId);
    const characterAge = projectContext.selectedRoleDirection?.age ?? null;
    const strategies = getAvailableStrategiesByAge(characterAge);
    // 防御性检查：确保至少有一个可用策略
    if (strategies.length === 0) {
      throw new AppError(400, "NO_AVAILABLE_STRATEGY", "当前角色年龄无可用脚本策略");
    }
    // ========== 年龄驱动策略选择结束 ==========

    const forceRefresh = body?.forceRefresh ?? false;

    // 持久化策略匹配结果（首次匹配后固定，不再随角色信息变化）
    await ctx.repos.videoProjectBusinessData.upsertStrategies(
      params.projectId,
      strategies,
      getAgeGroup(characterAge),
      characterAge,
    );

    // 创建父任务和子任务（由 QueueDispatcher 统一调度执行）
    const result = await startScriptsGenerationParent(
      {
        userId: user.id,
        projectId: params.projectId,
        strategies,
        forceRefresh,
      },
      ctx.globalTaskConcurrencyService,
      ctx.repos,
    );

    // 立即返回：可用策略 + 任务信息
    return {
      parentJobId: result.parentJobId,
      childJobIds: result.childJobIds,
      status: result.status,
      strategies,           // 实际会生成的策略列表
      age: characterAge,   // 角色年龄
      ageGroup: getAgeGroup(characterAge), // 年龄分组
    };
  });

  // =========================================================================
  // GET /projects/:projectId/step3/candidates/jobs/status
  // 查询四类 job 状态 + 选中/确认状态
  // =========================================================================
  app.get("/projects/:projectId/step3/candidates/jobs/status", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 查询项目所有 step3 类型 job
    const allJobs = await getJobsByProjectId(ctx.repos, params.projectId);
    const step3Jobs = allJobs.filter((j) => j.jobType.startsWith("step3_"));

    // 按 type 分组：取最新状态 + 合并所有已完成 job 的 resultScriptIds + 统计失败次数
    const latestByType: Record<string, AsyncJobRecord> = {};
    const mergedScriptIdsByType: Record<string, string[]> = {};
    const failedCountByType: Record<string, number> = {};
    for (const job of step3Jobs) {
      const type = fromStep3JobType(job.jobType);
      if (!type) continue;
      const existing = latestByType[type];
      if (!existing || job.createdAt > existing.createdAt) {
        latestByType[type] = job;
      }
      // 合并所有已完成 job 的 resultScriptIds
      if (job.status === "completed" && job.result?.resultScriptIds) {
        if (!mergedScriptIdsByType[type]) {
          mergedScriptIdsByType[type] = [];
        }
        const merged = mergedScriptIdsByType[type]!;
        for (const id of job.result.resultScriptIds as string[]) {
          if (!merged.includes(id)) {
            merged.push(id);
          }
        }
      }
      // 统计失败次数
      if (job.status === "failed") {
        failedCountByType[type] = (failedCountByType[type] ?? 0) + 1;
      }
    }

    // 从数据库查询选中/确认状态
    const scriptsService = getScriptsDataDbService(ctx.repos);
    const selectedScript = await scriptsService.getSelectedScript(params.projectId);
    const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);

    // 查询每种类型在 nrm_script_data 中是否已有脚本数据（防止 job 记录被清理后重复创建）
    const typeToNrmScriptType: Record<string, number> = {
      library: 2,
      video: 3,
      realtime: 4,
      effectiveness: 5,
      custom: 7,
      fashion: 8,
      emotion_archetype: 9,
      aesthetic: 10,
      product_showcase: 11,
      story_theme: 12,
      resonance: 13,
    };
    const hasDataByType: Record<string, boolean> = {};
    for (const type of ["library", "video", "realtime", "effectiveness", "custom", "fashion", "emotion_archetype", "aesthetic", "product_showcase", "story_theme", "resonance"]) {
      // eslint-disable-next-line no-await-in-loop
      const count = await scriptsService.countByTypeAndProjectId(typeToNrmScriptType[type] ?? -1, params.projectId);
      hasDataByType[type] = count > 0;
    }

    // 映射 nrm_async_jobs 状态到前端期望的 Step3 状态
    const mapStatus = (s: string): string => {
      switch (s) {
        case "completed": return "done";
        default: return s;
      }
    };

    const jobs: Record<string, { jobId: string; status: string; resultScriptIds?: string[]; errorMessage?: string | null; failedCount?: number } | null> = {};
    for (const type of ["library", "video", "realtime", "effectiveness", "custom", "fashion", "emotion_archetype", "aesthetic", "product_showcase", "story_theme", "resonance"]) {
      const job = latestByType[type];
      if (job) {
        const mappedStatus = mapStatus(job.status);
        jobs[type] = {
          jobId: job.id,
          status: mappedStatus,
          // 返回该 type 所有已完成 job 合并后的 resultScriptIds
          ...(mappedStatus === "done" && mergedScriptIdsByType[type]?.length ? { resultScriptIds: mergedScriptIdsByType[type] } : {}),
          ...(job.error?.message ? { errorMessage: job.error.message } : {}),
          // 返回失败次数（用于前端判断是否允许重试）
          ...(failedCountByType[type] ? { failedCount: failedCountByType[type] } : {}),
        };
      } else {
        jobs[type] = null;
      }
    }

    // 从持久化的业务数据读取策略列表
    const businessData = await ctx.repos.videoProjectBusinessData.findByProjectId(params.projectId);

    return {
      selectedScriptId: selectedScript?.id ?? null,
      confirmedScriptId: confirmedScript?.id ?? null,
      jobs,
      hasDataByType,
      strategies: businessData?.availableStrategies ?? [],
      ageGroup: businessData?.ageGroup ?? null,
    };
  });

  // =========================================================================
  // GET /projects/:projectId/step3/candidates/scripts
  // 直接通过 projectId 从 nrm_script_data 查询候选脚本数据
  // 如果已锁定（有 activeScriptId），只返回已确认的脚本
  // =========================================================================
  app.get("/projects/:projectId/step3/candidates/scripts", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const query = request.query as { types?: string } | undefined;
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 从 nrm_script_data 查询项目脚本
    const scriptsService = getScriptsDataDbService(ctx.repos);

    // 已锁定：只查询已确认的脚本
    if (project.activeScriptId) {
      const activeScript = await scriptsService.getById(project.activeScriptId);
      if (!activeScript || activeScript.projectId !== params.projectId) {
        return { items: [], activeScriptId: project.activeScriptId };
      }

      // 解析 shot_breakdown
      const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [activeScript]);
      const parsed = parsedScripts[0]?.parsed?.shot_breakdown;

      const item = convertPayloadToSnapshotItem(activeScript, activeScript.id, undefined, parsed);
      return {
        items: item ? [item] : [],
        activeScriptId: project.activeScriptId,
        activeScript: item ?? undefined
      };
    }

    // 未锁定：查询所有候选脚本
    let records = await scriptsService.queryByProjectId(params.projectId, 100);
    if (query?.types) {
      const typeList = query.types.split(",").map((s) => s.trim()).filter(Boolean);
      const typeIds = typeList.map((t) => STRATEGY_TYPE_TO_SCRIPT_TYPE[t]).filter((id) => id !== undefined);
      if (typeIds.length > 0) {
        records = records.filter((r) => typeIds.includes(r.type));
      }
    }

    if (records.length === 0) {
      return { items: [], activeScriptId: null };
    }

    // 批量查询 shot_breakdown（包含分镜数据）
    const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, records);
    const parsedMap = new Map(parsedScripts.map((s) => [s.id, s]));

    // 转换为 snapshot items
    const items: Step3ScriptCandidateSnapshot["items"] = [];
    for (const record of records) {
      const parsedScript = parsedMap.get(record.id);
      const item = convertPayloadToSnapshotItem(
        record,
        record.id,
        undefined,
        parsedScript?.parsed?.shot_breakdown,
      );
      if (item) {
        items.push(item);
      }
    }

    return { items, activeScriptId: null };
  });

  // =========================================================================
  // POST /projects/:projectId/step3/candidates/select
  // 选中某个候选脚本
  // =========================================================================
  app.post("/projects/:projectId/step3/candidates/select", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { candidateId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    const scriptsService = getScriptsDataDbService(ctx.repos);

    // 检查是否已有确认的脚本
    const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);
    if (confirmedScript) {
      throw new AppError(409, "SCRIPT_ALREADY_CONFIRMED", "已有确认的脚本，无法重新选择");
    }

    // 验证脚本存在
    const script = await scriptsService.getById(body.candidateId);
    if (!script || script.projectId !== params.projectId) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }

    // 幂等检查：已经是选中状态
    if (script.isSelected) {
      return { success: true };
    }

    // 清空所有选中状态，设置新的选中
    await scriptsService.clearProjectSelections(params.projectId);
    await scriptsService.setSelected(body.candidateId);

    // 更新项目状态为 SCRIPT_SELECTED（脚本已选择）
    await ctx.repos.projects.updateStatus(params.projectId, "SCRIPT_SELECTED");


    return { success: true };
  });

/** 判断 candidateId 是否为导入分镜候选（非数据库脚本） */
function isImportedStoryboardCandidateId(candidateId: string): boolean {
  return candidateId.startsWith("imported-storyboard-");
}

/** 从导入分镜候选 ID 提取脚本库 ID */
function extractLibraryScriptIdFromImportedCandidateId(candidateId: string): string | null {
  if (!candidateId.startsWith("imported-storyboard-")) {
    return null;
  }
  const suffix = candidateId.slice("imported-storyboard-".length);
  if (!suffix || suffix === "local" || suffix === "reverse-deck") {
    return null;
  }
  return suffix;
}

  // =========================================================================
  // POST /projects/:projectId/step3/candidates/confirm
  // 确认选中某个候选脚本
  // =========================================================================
  app.post("/projects/:projectId/step3/candidates/confirm", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { candidateId: string; segments?: Array<{ title?: string; content?: string; visualCue?: string; visualPrompt?: string }>; libraryScriptId?: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 状态已推进到 FILMING 及之后时，禁止修改脚本确认状态
    if (isVideoStatusBeyond(project.status as VideoProjectStatus, "STORYBOARD_PREVIEW_COMPLETED")) {
      // 幂等返回：已确认的脚本直接返回 segments
      const scriptsService = getScriptsDataDbService(ctx.repos);
      const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);
      if (confirmedScript) {
        const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [confirmedScript]);
        const shotBreakdown = parsedScripts[0]?.parsed?.shot_breakdown;
        const persistedSegments = shotBreakdown && shotBreakdown.length > 0
          ? shotBreakdown.map((shot, index) => {
            const ambientSound = shot.audio?.ambient_sound || "";
            return normalizeStep3StoryboardSegmentForImport({
              title: `镜头 ${index + 1}`,
              content: ambientSound ? `环境音：${ambientSound}` : "",
              visualCue: shot.shot_description || "",
              visualPrompt: shot.shot_description || "",
            }, index);
          }).filter((s): s is { title: string; content: string; visualCue: string; visualPrompt: string } =>
            typeof s.content === "string" && s.content.trim().length > 0
          )
          : [];
        return { success: true, scriptSegmentCount: persistedSegments.length, scriptSegments: persistedSegments };
      }
      throw new AppError(409, "PROJECT_STATUS_LOCKED", `项目已推进到 ${project.status}，不可修改脚本确认状态`);
    }

    // 锁定后取消进行中的脚本生成任务和预览任务
    const SCRIPT_GEN_JOB_TYPES = ["step3_library", "step3_video", "step3_realtime", "step3_effectiveness", "step3_custom", "step3_fashion", "step3_emotion_archetype", "step3_aesthetic", "step3_product_showcase", "step3_story_theme", "step3_resonance", "step3_batch_preview", "step3_frame_preview"];
    let cancelledCount = 0;
    for (const jobType of SCRIPT_GEN_JOB_TYPES) {
      const activeJob = await findActiveJobByProjectAndType(ctx.repos, project.id, jobType);
      if (activeJob) {
        await finalizeAsyncJob(ctx.repos, activeJob.id, "failed", null, { code: "CANCELLED_BY_LOCK", message: "脚本已锁定，任务自动取消" }, Date.now(), ctx.queueDispatcher);
        cancelledCount++;
      }
    }
    if (cancelledCount > 0) {
    }

    // Workflow state no longer persisted
    const scriptsService = getScriptsDataDbService(ctx.repos);

    // 处理导入分镜候选：优先使用请求体中的 libraryScriptId，兼容从 candidateId 提取
    if (isImportedStoryboardCandidateId(body.candidateId) || body.libraryScriptId) {
      const libraryScriptId = body.libraryScriptId || extractLibraryScriptIdFromImportedCandidateId(body.candidateId);
      if (libraryScriptId) {
        const dbScript = await scriptsService.getById(libraryScriptId);
        if (dbScript) {
          // 脚本在数据库中，走正常的数据库脚本确认流程（含重写）
          // 不限制 projectId：库脚本可跨项目使用（反推脚本来源项目可能与当前项目不同）
          // 幂等检查: script already confirmed, reconstruct segments from database
          if (dbScript.isConfirmed) {
            const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [dbScript]);
            const shotBreakdown = parsedScripts[0]?.parsed?.shot_breakdown;
            const persistedSegments = shotBreakdown && shotBreakdown.length > 0
              ? shotBreakdown.map((shot, index) => {
                const ambientSound = shot.audio?.ambient_sound || "";
                return normalizeStep3StoryboardSegmentForImport({
                  title: `镜头 ${index + 1}`,
                  content: ambientSound ? `环境音：${ambientSound}` : "",
                  visualCue: shot.shot_description || "",
                  visualPrompt: shot.shot_description || "",
                }, index);
              }).filter((s): s is { title: string; content: string; visualCue: string; visualPrompt: string } =>
                typeof s.content === "string" && s.content.trim().length > 0
              )
              : [];
            return { success: true, scriptSegmentCount: persistedSegments.length, scriptSegments: persistedSegments };
          }

          const confirmedOther = await scriptsService.getConfirmedScript(params.projectId);
          if (confirmedOther && confirmedOther.id !== libraryScriptId) {
            throw new AppError(409, "ANOTHER_SCRIPT_CONFIRMED", "已有其他确认的脚本");
          }

          const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [dbScript]);
          const candidate = convertPayloadToSnapshotItem(dbScript, dbScript.id, undefined, parsedScripts[0]?.parsed?.shot_breakdown);
          if (!candidate) {
            throw new AppError(500, "CONVERT_FAILED", "脚本转换失败");
          }

          const scriptSegments = await buildStep3AppliedCandidateSegments({
            candidate,
          });

          // 将脚本存入新的脚本记录
          const rewrittenScriptId = ctx.clock.generateId();
          const rewrittenContent = scriptSegments
            .map((s) => s.content)
            .filter(Boolean)
            .join("\n")
            .trim();
          const rewrittenPayload: VideoScriptPayload = {
            video_info: candidate.video_info ?? undefined,
            video_analysis: dbScript.payload?.video_analysis ?? undefined,
            editing_analysis: candidate.editing_analysis ?? undefined,
            shot_breakdown: candidate.shot_breakdown ? (candidate.shot_breakdown as VideoScriptPayload["shot_breakdown"]) : undefined,
            main_scene: dbScript.mainScene ?? undefined,
            atmosphere: dbScript.atmosphere ?? undefined,
          };
          const rewrittenInsertItem: InsertScriptDataItem = {
            id: rewrittenScriptId,
            type: dbScript.type,
            payloadJson: rewrittenPayload,
            sourceScriptId: dbScript.sourceScriptId,
            projectId: params.projectId,
            userId: project.userId,
            sourceOssUrl: dbScript.sourceOssUrl,
            previousScriptId: libraryScriptId,
            isConfirmed: true,
          };
          await scriptsService.batchInsertIfNotExists([rewrittenInsertItem]);

          // 先清空所有选中/确认状态
          await scriptsService.clearProjectSelections(params.projectId);

          // 标记原脚本为已确认
          await scriptsService.setConfirmed(libraryScriptId);

          // 清空原脚本的 userId，避免在用户脚本中心重复显示
          // 原脚本作为模板/候选，确认后不再属于任何用户，只保留重写后的脚本在用户脚本中心
          await ctx.repos.scriptData.clearUserId(libraryScriptId);

          // 添加用户-脚本关联记录
          await ctx.repos.userScriptAssocs.create({
            id: `ua-${rewrittenScriptId}-${project.userId}`,
            userId: project.userId,
            scriptDataId: rewrittenScriptId,
            title: candidate.title || dbScript.title || "确认脚本",
            tags: [],
            source: "project_sync",
          });

          // 标记脚本为已确认
          await scriptsService.setConfirmed(rewrittenScriptId);

          upsertStep3ProjectStoryboardMirror({ project, ownerUser: user, candidate, scriptSegments });

          project.activeScriptId = rewrittenScriptId;
          project.status = "SCRIPT_CONFIRMED";
          await ctx.projectService.saveProject(project);

          return { success: true, scriptSegmentCount: scriptSegments.length, scriptSegments };
        }
      }

      // libraryScriptId 为空或数据库查不到脚本，直接报错
      throw new AppError(404, "SCRIPT_NOT_FOUND", "导入分镜脚本在数据库中不存在");
    }

    // 数据库脚本路径
    const script = await scriptsService.getById(body.candidateId);
    if (!script || script.projectId !== params.projectId) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }

    // 幂等检查：已确认
    if (script.isConfirmed) {
      // 补建用户脚本关联（幂等）
      const existingAssoc = await ctx.repos.userScriptAssocs.findByUserIdAndScriptId(
        user.id,
        body.candidateId,
      );
      if (!existingAssoc) {
        await ctx.repos.userScriptAssocs.create({
          id: `step3-assoc-${ctx.clock.generateId()}`,
          userId: user.id,
          scriptDataId: body.candidateId,
          title: script.title ?? undefined,
          tags: ["#step3_confirmed_import", "#项目脚本"],
          source: "project_sync",
          notes: `项目 ${project.name || params.projectId} 的确认脚本（补建关联）`,
        });
      }

      // Reconstruct segments from database
      const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [script]);
      const shotBreakdown = parsedScripts[0]?.parsed?.shot_breakdown;
      const persistedSegments = shotBreakdown && shotBreakdown.length > 0
        ? shotBreakdown.map((shot, index) => {
          const ambientSound = shot.audio?.ambient_sound || "";
          return normalizeStep3StoryboardSegmentForImport({
            title: `镜头 ${index + 1}`,
            content: ambientSound ? `环境音：${ambientSound}` : "",
            visualCue: shot.shot_description || "",
            visualPrompt: shot.shot_description || "",
          }, index);
        }).filter((s): s is { title: string; content: string; visualCue: string; visualPrompt: string } =>
          typeof s.content === "string" && s.content.trim().length > 0
        )
        : [];

      return {
        success: true,
        scriptSegmentCount: persistedSegments.length,
        scriptSegments: persistedSegments,
      };
    }

    // 检查是否已确认其他脚本
    const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);
    if (confirmedScript && confirmedScript.id !== body.candidateId) {
      throw new AppError(409, "ANOTHER_SCRIPT_CONFIRMED", "已有其他确认的脚本");
    }

    // 从数据库查询脚本详情转换为 candidate 格式
    const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [script]);
    const parsedScript = parsedScripts[0];
    const candidate = convertPayloadToSnapshotItem(
      script,
      script.id,
      undefined,
      parsedScript?.parsed?.shot_breakdown,
    );
    if (!candidate) {
      throw new AppError(500, "CONVERT_FAILED", "脚本转换失败");
    }

    // 提取分镜段
    const scriptSegments = await buildStep3AppliedCandidateSegments({
      candidate,
    });

    // 将脚本存入新的脚本记录
    const rewrittenScriptId = ctx.clock.generateId();
    const rewrittenContent = scriptSegments
      .map((s) => s.content)
      .filter(Boolean)
      .join("\n")
      .trim();
    const rewrittenPayload: VideoScriptPayload = {
      video_info: candidate.video_info ?? undefined,
      video_analysis: script.payload?.video_analysis ?? undefined,
      editing_analysis: candidate.editing_analysis ?? undefined,
      shot_breakdown: candidate.shot_breakdown ? (candidate.shot_breakdown as VideoScriptPayload["shot_breakdown"]) : undefined,
      main_scene: script.mainScene ?? undefined,
      atmosphere: script.atmosphere ?? undefined,
    };
    const rewrittenInsertItem: InsertScriptDataItem = {
      id: rewrittenScriptId,
      type: script.type,
      payloadJson: rewrittenPayload,
      sourceScriptId: script.sourceScriptId,
      projectId: params.projectId,
      userId: project.userId,
      sourceOssUrl: script.sourceOssUrl,
      previousScriptId: body.candidateId,
      isConfirmed: true,
    };
    await scriptsService.batchInsertIfNotExists([rewrittenInsertItem]);

    // 添加用户-脚本关联记录
    await ctx.repos.userScriptAssocs.create({
      id: `ua-${rewrittenScriptId}-${project.userId}`,
      userId: project.userId,
      scriptDataId: rewrittenScriptId,
      title: candidate.title || script.title || "确认脚本",
      tags: [],
      source: "project_sync",
    });

    // 清空所有选中/确认状态
    await scriptsService.clearProjectSelections(params.projectId);

    // 设置脚本为确认状态
    await scriptsService.setConfirmed(rewrittenScriptId);

    // 清空原脚本的 userId，避免在用户脚本中心重复显示
    // 原脚本作为候选，确认后不再属于任何用户，只保留重写后的脚本在用户脚本中心
    await ctx.repos.scriptData.clearUserId(body.candidateId);

    // 同步到 storyboard mirror
    upsertStep3ProjectStoryboardMirror({
      project,
      ownerUser: user,
      candidate,
      scriptSegments,
    });

    // 更新项目状态
    project.activeScriptId = rewrittenScriptId;
    project.status = "SCRIPT_CONFIRMED";
    await ctx.projectService.saveProject(project);


    return {
      success: true,
      scriptSegmentCount: scriptSegments.length,
      scriptSegments,
    };
  });

  // =========================================================================
  // POST /projects/:projectId/step3/candidates/admin-unlock
  // 管理员解锁：清空选中/确认状态
  // =========================================================================
  app.post("/projects/:projectId/step3/candidates/admin-unlock", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { reason: string };

    const scriptsService = getScriptsDataDbService(ctx.repos);

    // 清空项目的所有选中/确认状态
    await scriptsService.clearProjectSelections(params.projectId);

    // 记录审计日志
    const auditId = ctx.clock.generateId();
    ctx.auditStore.insertAuditLog({
      id: auditId,
      actorUserId: admin.id,
      action: "step3_admin_unlock",
      targetId: params.projectId,
      meta: {
        reason: body.reason,
      },
      createdAt: ctx.clock.now(),
    });


    return { success: true };
  });

  // =========================================================================
  // POST /projects/:projectId/step3/reverse-rewrite
  // 反推项目专用：用 reverse_script_id 查脚本 → 改写 → 锁定 → 返回完整脚本
  // 改造为异步 job 模式
  // =========================================================================
  app.post("/projects/:projectId/step3/reverse-rewrite", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    if (project.projectKind !== "reverse") {
      throw new AppError(400, "INVALID_PROJECT_KIND", "仅反推项目支持此操作");
    }
    if (!project.reverseScriptId) {
      throw new AppError(404, "NO_REVERSE_SCRIPT", "项目未关联反推脚本");
    }

    const scriptsService = getScriptsDataDbService(ctx.repos);

    // 幂等：脚本表中已有 is_confirmed 的脚本，说明已改写过了，直接返回完整脚本
    const confirmedScript = await scriptsService.getConfirmedScript(params.projectId);
    if (confirmedScript) {
      const parsedConfirmed = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [confirmedScript]);
      const confirmedCandidate = convertPayloadToSnapshotItem(confirmedScript, confirmedScript.id, undefined, parsedConfirmed[0]?.parsed?.shot_breakdown);
      const confirmedShots = parsedConfirmed[0]?.parsed?.shot_breakdown;
      const confirmedSegments = (confirmedShots && confirmedShots.length > 0)
        ? confirmedShots.map((shot, index) => {
          const ambientSound = shot.audio?.ambient_sound || "";
          return normalizeStep3StoryboardSegmentForImport({
            title: `镜头 ${index + 1}`,
            content: ambientSound ? `环境音：${ambientSound}` : "",
            visualCue: shot.shot_description || "",
            visualPrompt: shot.shot_description || "",
          }, index);
        }).filter((s): s is { title: string; content: string; visualCue: string; visualPrompt: string } =>
          typeof s.content === "string" && s.content.trim().length > 0
        )
        : [];
      return {
        success: true,
        jobId: null,
        status: "completed",
        candidate: confirmedCandidate,
        scriptSegmentCount: confirmedSegments.length,
        scriptSegments: confirmedSegments,
      };
    }

    // 幂等：检查是否已有已确认的脚本（直接查询 nrm_script_data）
    const confirmedScriptId = await ctx.repos.scriptData.findConfirmedIdByProject(params.projectId);
    if (confirmedScriptId) {
      const confirmedScript = await scriptsService.getById(confirmedScriptId);
      if (confirmedScript) {
        const parsedConfirmed = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [confirmedScript]);
        const confirmedCandidate = convertPayloadToSnapshotItem(confirmedScript, confirmedScript.id, undefined, parsedConfirmed[0]?.parsed?.shot_breakdown);
        const confirmedShots = parsedConfirmed[0]?.parsed?.shot_breakdown;
        const confirmedSegments = (confirmedShots && confirmedShots.length > 0)
          ? confirmedShots.map((shot, index) => {
            const ambientSound = shot.audio?.ambient_sound || "";
            return normalizeStep3StoryboardSegmentForImport({
              title: `镜头 ${index + 1}`,
              content: ambientSound ? `环境音：${ambientSound}` : "",
              visualCue: shot.shot_description || "",
              visualPrompt: shot.shot_description || "",
            }, index);
          }).filter((s): s is { title: string; content: string; visualCue: string; visualPrompt: string } =>
            typeof s.content === "string" && s.content.trim().length > 0
          )
          : [];
        return {
          success: true,
          jobId: null,
          status: "completed",
          candidate: confirmedCandidate,
          scriptSegmentCount: confirmedSegments.length,
          scriptSegments: confirmedSegments,
        };
      }
    }

    // 检查是否已有进行中的 job
    const jobType = "step3_reverse_rewrite";
    const existingJob = await findActiveJobByProjectAndType(ctx.repos, params.projectId, jobType);
    if (existingJob) {
      return { success: true, jobId: existingJob.id, status: existingJob.status };
    }

    // 创建异步 job（pending 状态，由 QueueDispatcher 驱动执行）
    const now = ctx.clock.now();
    const jobId = `reverse-rewrite-${params.projectId}-${now}`;
    const rewriteResult = await createAsyncJob(ctx.repos, {
      id: jobId,
      userId: user.id,
      jobType,
      input: JSON.stringify({ projectId: params.projectId }),
      projectId: params.projectId,
      now,
      initialStatus: "pending", // 关键：pending 状态，由 QueueDispatcher 驱动
    }, ctx.globalTaskConcurrencyService);

    if ("error" in rewriteResult) {
      throw new AppError(429, rewriteResult.errorCode, rewriteResult.error);
    }

    return { success: true, jobId, status: "pending" };
  });
}

// =========================================================================
// 异步评分入队
// =========================================================================

/** 将脚本快照中的每个候选入队为 quality_scoring 系统任务（由 ScoringDaemon 消费） */
export async function enqueueScoringJobs(
  repos: PgRepositoryCollection,
  snapshot: Step3ScriptCandidateSnapshot,
  projectId: string,
  userId: string,
  now: number,
): Promise<void> {
  for (const item of snapshot.items) {
    const promptCode = STRATEGY_PROMPT_CODE_MAP[item.strategyType as ScoringStrategy] ?? null;
    const input: ScoringJobInput = {
      scriptDataId: item.candidateId,
      strategy: item.strategyType as ScoringStrategy,
      projectId,
      userId,
      promptCode,
      promptVersion: snapshot.promptVersion,
      scriptContent: item.content,
      scriptTitle: item.title,
      scriptSummary: item.summary ?? null,
      videoType: item.scriptType ?? (item.video_analysis?.video_type as string) ?? null,
      videoStyle: item.scriptStyle ?? (item.video_analysis?.video_style as string) ?? null,
    };
    const jobId = `scoring-${item.strategyType}-${now}-${Math.random().toString(36).substring(2, 8)}`;
    await repos.systemJobs.insertSystemJob({
      id: jobId,
      jobType: "quality_scoring",
      input: input as unknown as Record<string, unknown>,
      now,
    });
  }
}
