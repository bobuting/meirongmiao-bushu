/**
 * step3-script-orchestrator.ts
 * Step3 脚本生成统一编排器
 *
 * 核心职责：
 * 1. 统一管理 9 种脚本策略的执行（library/video/realtime/effectiveness/custom/fashion/emotion_archetype/aesthetic/product_showcase）
 * 2. 并发控制：同项目最多 CONCURRENCY 个策略同时执行 LLM
 * 3. 细粒度进度上报：每种策略有独立的阶段映射
 * 4. 标准化的结果保存和任务终结
 * 5. 父子任务模式：支持批量创建所有策略的子任务，父任务聚合进度
 *
 * 数据流设计：
 * - nrm_async_jobs.input 只存最小标识（空的 JSON）
 * - 执行时从 nrm_async_jobs 获取 project_id、user_id
 * - 从 projects 表查询项目信息
 * - 从 users 表查询用户信息
 * - 从 nrm_script_data 表查询已有脚本 ID 作为 excludeIds
 *
 * 父子任务模式：
 * - 父任务：step3_scripts_generation（聚合进度，显示在任务队列顶层）
 * - 子任务：step3_library/video/realtime/...（独立执行，折叠显示）
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { AppContext } from "../core/app-context.js";
import type { Project, User } from "../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../contracts/step3-candidate-snapshot-contract.js";
import type { GlobalTaskConcurrencyService } from "./global-task-concurrency-service.js";
import type { QueueDispatcher } from "./queue-dispatcher.js";
import type { BusinessConfigService } from "./business-config-service.js";
import {
  updateAsyncJobStage,
  finalizeAsyncJob,
  getAsyncJob,
  createAsyncJob,
  findChildrenByParentId,
  checkAndFinalizeParent,
} from "../service/async-job-service.js";
import {
  loadLibraryScriptsSnapshot,
  generateVideoScriptsSnapshot,
  generateRealtimeScriptsSnapshot,
} from "./video-step/step3/script-stream-loader.js";
import { generateEffectivenessScriptsSnapshot } from "./video-step/step3-effectiveness/index.js";
import { generateCustomScriptsSnapshot } from "./video-step/step3-custom-script/index.js";
import { generateFashionScriptsSnapshot } from "./video-step/step3-fashion-script/index.js";
import { generateEmotionArchetypeScriptsSnapshot } from "./video-step/step3-emotion-archetype/index.js";
import { generateAestheticScriptsSnapshot } from "./video-step/step3-aesthetic/index.js";
import { generateProductShowcaseScriptsSnapshot } from "./video-step/step3-product-showcase/index.js";
import { generateStoryThemeScriptsSnapshot } from "./video-step/step3-story-theme/index.js";
import { generateResonanceScriptsSnapshot } from "./video-step/step3-resonance/index.js";
import { getLogger } from "../core/logger/index.js";
import { DEFAULT_STEP3_SCRIPT_CONFIG, type Step3ScriptConfig } from "../contracts/business-config-contract.js";

const logger = getLogger("step3-script-orchestrator");

// ========== 类型定义 ==========

/** 脚本生成策略类型 */
export type Step3ScriptJobType = "library" | "video" | "realtime" | "effectiveness" | "custom" | "fashion" | "emotion_archetype" | "aesthetic" | "product_showcase" | "story_theme" | "resonance";

/** 所有策略类型列表 */
export const ALL_SCRIPT_STRATEGIES: Step3ScriptJobType[] = [
  "library", "video", "realtime", "effectiveness", "custom", "fashion", "emotion_archetype", "aesthetic", "product_showcase", "story_theme", "resonance",
];

// ========== 年龄驱动策略选择 ==========

/** 角色年龄分组 */
export type AgeGroup = 'infant' | 'toddler' | 'child' | 'teen' | 'adult';

/** 年龄分组范围定义 */
export const AGE_GROUP_RANGES: Record<AgeGroup, { min: number; max: number; label: string }> = {
  infant: { min: 0, max: 3, label: '婴幼儿' },
  toddler: { min: 4, max: 6, label: '幼儿' },
  child: { min: 7, max: 12, label: '儿童' },
  teen: { min: 13, max: 17, label: '青少年' },
  adult: { min: 18, max: 120, label: '成人' },
};

/**
 * 根据年龄数值获取年龄分组
 * @param age 年龄数值，null/undefined/无效值返回 'adult'
 */
export function getAgeGroup(age: number | null | undefined): AgeGroup {
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
    return 'adult';
  }
  if (age <= 3) return 'infant';
  if (age <= 6) return 'toddler';
  if (age <= 12) return 'child';
  if (age <= 17) return 'teen';
  return 'adult';
}

/**
 * 根据年龄选择可用的脚本生成策略
 *
 * 策略适用性分析：
 * - infant（0-3岁）：无法站立、无主动动作能力，只能静态展示或亲子场景配角
 * - toddler（4-6岁）：能站立行走，但 pose 能力有限，适合亲子引导
 * - child（7-12岁）：能配合拍摄，可做简单展示动作
 * - teen（13-17岁）：大部分策略可用，时尚风格偏向青春活力
 * - adult（18+）：所有策略可用
 *
 * @param age 年龄数值
 * @returns 可用的策略列表
 */
export function getAvailableStrategiesByAge(age: number | null | undefined): Step3ScriptJobType[] {
  const ageGroup = getAgeGroup(age);

  switch (ageGroup) {
    case 'infant':
      // 婴幼儿：只能静态展示、生活美学
      return ['library', 'aesthetic'];

    case 'toddler':
      // 幼儿：可做简单互动，适合亲子类场景
      return ['library', 'custom', 'aesthetic'];

    case 'child':
    case 'teen':
    case 'adult':
    default:
      // 儿童及以上：所有策略可用
      return ALL_SCRIPT_STRATEGIES;
  }
}

/** 父任务 job_type */
export const JOB_TYPE_SCRIPTS_GENERATION = "step3_scripts_generation";

/** 父任务结果 */
export interface ScriptsGenerationParentResult {
  totalStrategies: number;
  completedStrategies: number;
  failedStrategies: number;
  scriptIds: string[];
  strategyResults: Record<Step3ScriptJobType, { status: string; scriptIds?: string[]; error?: string }>;
}

/** 策略执行参数（简化版，执行时从数据库查询） */
export interface ScriptGenerationParams {
  repos: PgRepositoryCollection;
  jobId: string;
  ctx: AppContext;
  /** 结果保存回调（由路由层注入） */
  onSave: (snapshot: Step3ScriptCandidateSnapshot, projectId: string, userId: string) => Promise<void>;
  /** 调度器（用于任务完成后触发 pending 任务提升） */
  dispatcher?: QueueDispatcher;
}

// ========== 阶段映射 ==========

/** 每种策略的初始阶段 */
const STRATEGY_INITIAL_STAGES: Record<Step3ScriptJobType, string> = {
  library: "查询脚本库",
  video: "查询视频脚本",
  realtime: "解析输入",
  effectiveness: "准备素材",
  custom: "生成概念",
  fashion: "生成时尚概念",
  emotion_archetype: "选择情感原型",
  aesthetic: "准备素材",
  product_showcase: "生成展示概念",
  story_theme: "选择情感原型",
  resonance: "构思故事概念",
};

// ========== 并发控制 ==========

interface ProjectSlot {
  active: number;
  queue: Array<() => void>;
}

const projectSlots = new Map<string, ProjectSlot>();

/** 从业务配置获取并发数 */
function getConcurrency(configService: BusinessConfigService): number {
  const config = configService.get("step3_script", DEFAULT_STEP3_SCRIPT_CONFIG);
  return config.strategyConcurrency;
}

async function acquireSlot(projectId: string, concurrency: number): Promise<void> {
  let slot = projectSlots.get(projectId);
  if (!slot) {
    slot = { active: 0, queue: [] };
    projectSlots.set(projectId, slot);
  }
  if (slot.active < concurrency) {
    slot.active++;
    return;
  }
  return new Promise<void>((resolve) => {
    slot!.queue.push(resolve);
  });
}

function releaseSlot(projectId: string): void {
  const slot = projectSlots.get(projectId);
  if (!slot) return;
  slot.active--;
  if (slot.queue.length > 0) {
    slot.active++;
    const next = slot.queue.shift()!;
    next();
  } else if (slot.active === 0) {
    projectSlots.delete(projectId);
  }
}

// ========== 策略分派 ==========

async function callStrategy(
  ctx: AppContext,
  type: Step3ScriptJobType,
  project: Project,
  user: User,
  excludeIds: string[],
): Promise<Step3ScriptCandidateSnapshot> {
  switch (type) {
    case "library":
      return loadLibraryScriptsSnapshot(ctx, project, user, excludeIds);
    case "video":
      return generateVideoScriptsSnapshot(ctx, project, user, excludeIds);
    case "realtime":
      return generateRealtimeScriptsSnapshot(ctx, project, user);
    case "effectiveness":
      return generateEffectivenessScriptsSnapshot(ctx, project, user);
    case "custom":
      return generateCustomScriptsSnapshot(ctx, project, user);
    case "fashion":
      return generateFashionScriptsSnapshot(ctx, project, user);
    case "emotion_archetype":
      return generateEmotionArchetypeScriptsSnapshot(ctx, project, user);
    case "aesthetic":
      return generateAestheticScriptsSnapshot(ctx, project, user);
    case "product_showcase":
      return generateProductShowcaseScriptsSnapshot(ctx, project, user);
    case "story_theme":
      return generateStoryThemeScriptsSnapshot(ctx, project, user);
    case "resonance":
      return generateResonanceScriptsSnapshot(ctx, project, user);
  }
}

/**
 * 从 job_type 提取策略类型
 */
export function extractScriptTypeFromJobType(jobType: string): Step3ScriptJobType | null {
  if (!jobType.startsWith("step3_")) return null;
  return jobType.slice(6) as Step3ScriptJobType;
}

/**
 * 查询项目已有的脚本 ID（用于排除）
 */
async function getExistingScriptIds(
  repos: AppContext["repos"],
  projectId: string,
): Promise<string[]> {
  return repos.scriptData.findIdsByProjectId(projectId);
}

// ========== 主执行函数 ==========

/**
 * 执行脚本生成任务（含并发控制和阶段上报）
 * 从 async_job 记录获取 project_id，查询项目和用户信息
 */
export async function executeScriptGeneration(params: ScriptGenerationParams): Promise<void> {
  const { repos, jobId, ctx, onSave, dispatcher } = params;

  try {
    // 从 async_job 获取任务信息
    const job = await getAsyncJob(repos, jobId, ctx.clock.now);
    if (!job || !job.projectId) {
      logger.error({ jobId }, "Job 不存在或缺少 projectId");
      await finalizeAsyncJob(repos, jobId, "failed", null, {
        code: "JOB_NOT_FOUND",
        message: "任务不存在或缺少项目ID",
      }, ctx.clock.now(), dispatcher);
      return;
    }

    // 提取策略类型
    const type = extractScriptTypeFromJobType(job.jobType);
    if (!type) {
      logger.error({ jobId, jobType: job.jobType }, "无效的 job_type");
      await finalizeAsyncJob(repos, jobId, "failed", null, {
        code: "INVALID_JOB_TYPE",
        message: `无效的任务类型: ${job.jobType}`,
      }, ctx.clock.now(), dispatcher);
      return;
    }

    // 查询项目信息
    const project = await ctx.repos.projects.findById(job.projectId);
    if (!project) {
      logger.error({ jobId, projectId: job.projectId }, "项目不存在");
      await finalizeAsyncJob(repos, jobId, "failed", null, {
        code: "PROJECT_NOT_FOUND",
        message: "项目不存在",
      }, ctx.clock.now(), dispatcher);
      return;
    }

    // 查询用户信息
    const user = await ctx.repos.users.findById(job.userId);
    if (!user) {
      logger.error({ jobId, userId: job.userId }, "用户不存在");
      await finalizeAsyncJob(repos, jobId, "failed", null, {
        code: "USER_NOT_FOUND",
        message: "用户不存在",
      }, ctx.clock.now(), dispatcher);
      return;
    }

    // 查询已有脚本 ID（用于排除）
    const excludeIds = await getExistingScriptIds(ctx.repos, job.projectId);

    // 检查是否有空槽位
    const concurrency = getConcurrency(ctx.businessConfigService);
    const slot = projectSlots.get(project.id);
    const needsQueue = slot !== undefined && slot.active >= concurrency;

    if (needsQueue) {
      await updateAsyncJobStage(repos, jobId, "排队中", ctx.clock.now());
    }

    // 获取并发槽位（可能阻塞等待）
    await acquireSlot(project.id, concurrency);

    try {
      // 设置策略对应的初始阶段
      const stage = STRATEGY_INITIAL_STAGES[type];
      await updateAsyncJobStage(repos, jobId, stage, ctx.clock.now());

      // 执行策略
      const snapshot = await callStrategy(ctx, type, project, user, excludeIds);

      // 保存到数据库（由路由层注入的回调）
      await onSave(snapshot, project.id, project.userId);

      // 提取 candidateIds 作为结果
      const resultScriptIds = snapshot.items.map((item) => item.candidateId);
      await finalizeAsyncJob(repos, jobId, "completed", { resultScriptIds }, null, ctx.clock.now(), dispatcher);

      // 【修复】成功时检查父任务是否需要自动完成
      if (job.parentJobId && dispatcher) {
        await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
      }

      logger.info({ jobId, type, scriptCount: resultScriptIds.length }, "脚本生成完成");
    } finally {
      releaseSlot(project.id);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "生成失败";
    await finalizeAsyncJob(repos, jobId, "failed", null, {
      code: "STEP3_SCRIPT_ERROR",
      message: errorMessage,
    }, ctx.clock.now(), dispatcher);
    logger.error({ err: error, jobId }, "Job 执行失败");

    // 【修复】失败时检查父任务是否需要自动完成
    const job = await getAsyncJob(repos, jobId, ctx.clock.now);
    if (job?.parentJobId && dispatcher) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
    }
  }
}

// ========== 父子任务模式 ==========

/**
 * 创建父任务并批量创建子任务
 * 路由层调用此函数启动批量脚本生成
 */
export async function startScriptsGenerationParent(
  params: {
    userId: string;
    projectId: string;
    /** 要生成的策略列表（默认全部 10 个） */
    strategies?: Step3ScriptJobType[];
    forceRefresh?: boolean;
  },
  concurrencyService: GlobalTaskConcurrencyService,
  repos: AppContext["repos"],
): Promise<{ parentJobId: string; childJobIds: string[]; status: string }> {
  const { userId, projectId, strategies = ALL_SCRIPT_STRATEGIES, forceRefresh = false } = params;
  const now = Date.now();

  // forceRefresh 模式：删除旧的父任务和子任务
  if (forceRefresh) {
    // 先删除子任务（排除特定类型）
    await repos.asyncJobs.deleteByProjectIdAndJobTypePattern(
      projectId,
      "step3_%",
      ["step3_scripts_generation", "step3_batch_preview", "step3_frame_preview", "step3_reverse_rewrite"],
    );
    // 再删除父任务
    await repos.asyncJobs.deleteByProjectIdAndJobType(projectId, JOB_TYPE_SCRIPTS_GENERATION);
  } else {
    // 按 job_type + project_id 查找已有父任务
    const existing = await repos.asyncJobs.findLatestByProjectAndType(projectId, JOB_TYPE_SCRIPTS_GENERATION);
    if (existing && (existing.status === "pending" || existing.status === "running")) {
      const children = await findChildrenByParentId(repos, existing.id as string);
      return {
        parentJobId: existing.id as string,
        childJobIds: children.map((c) => c.id),
        status: existing.status as string,
      };
    }
  }

  // 创建父任务（concurrencyService 会生成实际 jobId）
  const parentResult = await createAsyncJob(repos, {
    userId,
    jobType: JOB_TYPE_SCRIPTS_GENERATION,
    input: JSON.stringify({ strategies, forceRefresh }),
    projectId,
    now,
    initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
  }, concurrencyService);

  if ("error" in parentResult) {
    throw new Error(`[${parentResult.errorCode}] ${parentResult.error}`);
  }

  // 使用并发服务返回的实际 jobId
  const parentJobId = parentResult.jobId;

  // 更新父任务阶段（状态仍为 pending，由 Dispatcher 提升）
  await updateAsyncJobStage(repos, parentJobId, "创建子任务", now, {
    totalStrategies: strategies.length,
    completedStrategies: 0,
    failedStrategies: 0,
  });

  // 批量创建子任务（concurrencyService 生成实际 jobId）
  const childJobIds: string[] = [];
  for (const strategy of strategies) {
    const childJobType = `step3_${strategy}`;
    const childResult = await createAsyncJob(repos, {
      userId,
      jobType: childJobType,
      input: JSON.stringify({ type: strategy, parentJobId }),
      projectId,
      parentJobId,
      now,
      initialStatus: "pending", // 【并发改造】子任务排队等待 QueueDispatcher 调度
    }, concurrencyService);

    if ("error" in childResult) {
      logger.warn({ strategy, error: childResult.error }, "子任务创建被拒绝，跳过");
      continue;
    }
    childJobIds.push(childResult.jobId);
  }

  logger.info({ parentJobId, childJobIds, strategies }, "父任务和子任务已创建");

  // 返回任务 ID，状态由 Dispatcher 决定（pending 或 running）
  return { parentJobId, childJobIds, status: parentResult.running ? "running" : "pending" };
}

